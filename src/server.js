import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, getSetting, setSetting, userCount, now } from './db.js';
import {
  hashPassword, verifyPassword, randomToken, sessionMiddleware, csrfMiddleware,
  requireAuth, requireOwner, createSession, destroySession, destroyOtherSessions,
  loginBlocked, registerFailure, clearFailures,
} from './auth.js';
import { notifyDiscord, isValidWebhook } from './discord.js';
import * as V from './views.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,32}$/;

const app = express();
app.disable('x-powered-by');
// Vertrouw reverse proxies op het lokale/docker netwerk (voor X-Forwarded-Proto/For)
app.set('trust proxy', 'loopback, linklocal, uniquelocal');

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.get('/healthz', (req, res) => res.type('text').send('ok'));
app.use('/public', express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(sessionMiddleware);

// ---------- flash berichten via kortlevende cookie ----------
app.use((req, res, next) => {
  const raw = req.cookies.flash;
  if (raw) {
    try { res.locals.flash = JSON.parse(Buffer.from(raw, 'base64url').toString()); } catch { /* negeer */ }
    res.clearCookie('flash', { path: '/' });
  }
  res.flash = (text, type = 'success', code) => {
    res.cookie('flash', Buffer.from(JSON.stringify({ text, type, code })).toString('base64url'), {
      httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/', maxAge: 60_000,
    });
  };
  next();
});

// ---------- render helper ----------
const unreadStmtOwner = db.prepare("SELECT COUNT(*) AS n FROM questions WHERE owner_unread = 1");
const unreadStmtUser = db.prepare('SELECT COUNT(*) AS n FROM questions WHERE user_id = ? AND user_unread = 1');

function render(req, res, title, body, opts = {}) {
  let unread = 0;
  if (req.user) {
    unread = req.user.role === 'owner' ? unreadStmtOwner.get().n : unreadStmtUser.get(req.user.id).n;
  }
  res.status(opts.status || 200).type('html').send(
    V.layout({ title, user: req.user, csrf: req.csrf, flash: res.locals.flash, body, narrow: opts.narrow, wide: opts.wide, unread, path: req.path })
  );
}

// ---------- eerste keer: setup van eigenaar ----------
app.use((req, res, next) => {
  if (userCount() === 0 && req.path !== '/setup') return res.redirect('/setup');
  next();
});

app.use(csrfMiddleware);

app.get('/setup', (req, res) => {
  if (userCount() > 0) return res.redirect('/');
  render(req, res, 'Setup', V.setupPage({}), { narrow: true });
});

app.post('/setup', (req, res) => {
  if (userCount() > 0) return res.redirect('/');
  const { display_name = '', username = '', password = '', password2 = '', site_name = '' } = req.body;
  const err = validateNewAccount({ display_name, username, password, password2 });
  if (err) return render(req, res, 'Setup', V.setupPage({ error: err, values: req.body }), { narrow: true, status: 400 });

  const info = db.prepare('INSERT INTO users (username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(username.trim(), display_name.trim(), hashPassword(password), 'owner', now());
  setSetting('site_name', site_name.trim() || 'Hulpapp');
  setSetting('public_url', `${req.protocol}://${req.get('host')}`);
  setSetting('notify_replies', '1');
  createSession(req, res, Number(info.lastInsertRowid));
  res.flash('Je eigenaar-account is klaar! Stel nu je Discord webhook in.');
  res.redirect('/admin/settings');
});

function validateNewAccount({ display_name, username, password, password2 }) {
  if (!display_name.trim()) return 'Vul een naam in.';
  if (display_name.trim().length > 50) return 'Naam is te lang.';
  if (!USERNAME_RE.test(username.trim())) return 'Gebruikersnaam moet 3–32 tekens zijn (letters, cijfers, . _ -).';
  if (password.length < 8) return 'Wachtwoord moet minstens 8 tekens zijn.';
  if (password.length > 200) return 'Wachtwoord is te lang.';
  if (password !== password2) return 'Wachtwoorden komen niet overeen.';
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username.trim())) return 'Die gebruikersnaam is al bezet.';
  return null;
}

// ---------- inloggen ----------
app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  render(req, res, 'Inloggen', V.loginPage({}), { narrow: true });
});

app.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const key = `${req.ip}|${username.toLowerCase()}`;
  if (loginBlocked(key) || loginBlocked(req.ip)) {
    return render(req, res, 'Inloggen', V.loginPage({ error: 'Te veel pogingen. Probeer het over 15 minuten opnieuw.', username }), { narrow: true, status: 429 });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    registerFailure(key);
    registerFailure(req.ip);
    return render(req, res, 'Inloggen', V.loginPage({ error: 'Onjuiste gebruikersnaam of wachtwoord.', username }), { narrow: true, status: 401 });
  }
  clearFailures(key);
  createSession(req, res, user.id);
  res.redirect('/');
});

app.post('/logout', (req, res) => {
  destroySession(req, res);
  res.redirect('/login');
});

// ---------- registreren via uitnodiging ----------
const findInvite = db.prepare('SELECT * FROM invites WHERE code = ? AND used_by IS NULL AND (expires_at IS NULL OR expires_at > ?)');

app.get('/register/:code', (req, res) => {
  if (req.user) return res.redirect('/');
  const invite = findInvite.get(req.params.code, now());
  render(req, res, 'Account aanmaken', V.registerPage({ code: req.params.code, invalid: !invite }), { narrow: true, status: invite ? 200 : 404 });
});

app.post('/register/:code', (req, res) => {
  const invite = findInvite.get(req.params.code, now());
  if (!invite) return render(req, res, 'Account aanmaken', V.registerPage({ invalid: true }), { narrow: true, status: 404 });
  const { display_name = '', username = '', password = '', password2 = '' } = req.body;
  const err = validateNewAccount({ display_name, username, password, password2 });
  if (err) return render(req, res, 'Account aanmaken', V.registerPage({ code: req.params.code, error: err, values: req.body }), { narrow: true, status: 400 });

  let userId;
  db.exec('BEGIN');
  try {
    const info = db.prepare('INSERT INTO users (username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(username.trim(), display_name.trim(), hashPassword(password), 'user', now());
    userId = Number(info.lastInsertRowid);
    const upd = db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE code = ? AND used_by IS NULL').run(userId, now(), invite.code);
    if (upd.changes !== 1) throw new Error('invite race');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return render(req, res, 'Account aanmaken', V.registerPage({ invalid: true }), { narrow: true, status: 409 });
  }
  createSession(req, res, userId);
  notifyDiscord({
    title: 'Nieuw account aangemaakt',
    description: `**${display_name.trim()}** (\`${username.trim()}\`) heeft een account aangemaakt${invite.note ? ` via uitnodiging "${invite.note}"` : ''}.`,
    color: 0x57f287,
    path: '/admin/users',
  });
  res.flash(`Welkom ${display_name.trim()}! Je kunt nu een vraag stellen.`);
  res.redirect('/');
});

// ---------- chat-overzicht ----------
const QUESTION_SELECT = `
  SELECT q.*, u.display_name AS asker_name,
    (SELECT COUNT(*) FROM messages m WHERE m.question_id = q.id) AS message_count,
    (SELECT m.body FROM messages m WHERE m.question_id = q.id ORDER BY m.id DESC LIMIT 1) AS last_body,
    (SELECT m.user_id FROM messages m WHERE m.question_id = q.id ORDER BY m.id DESC LIMIT 1) AS last_user_id
  FROM questions q LEFT JOIN users u ON u.id = q.user_id`;

function loadSidebar(req) {
  const isOwner = req.user.role === 'owner';
  let questions, filter = 'open', counts = {};
  if (isOwner) {
    filter = ['open', 'closed', 'all'].includes(req.query.status) ? req.query.status : 'open';
    const where = filter === 'all' ? '' : 'WHERE q.status = ?';
    const args = filter === 'all' ? [] : [filter];
    questions = db.prepare(`${QUESTION_SELECT} ${where} ORDER BY q.updated_at DESC LIMIT 300`).all(...args);
    const c = db.prepare("SELECT SUM(status='open') AS open, SUM(status='closed') AS closed, COUNT(*) AS total FROM questions").get();
    counts = { open: c.open || 0, closed: c.closed || 0, all: c.total || 0 };
  } else {
    questions = db.prepare(`${QUESTION_SELECT} WHERE q.user_id = ? ORDER BY q.updated_at DESC LIMIT 300`).all(req.user.id);
  }
  return { questions, filter, counts };
}

app.get('/', requireAuth, (req, res) => {
  const side = loadSidebar(req);
  // Gebruiker zonder gesprekken: meteen het vraagformulier tonen
  const mode = req.user.role !== 'owner' && side.questions.length === 0 ? 'new' : 'empty';
  render(req, res, null, V.chatPage({ user: req.user, csrf: req.csrf, ...side, mode }), { wide: true });
});

app.get('/new', requireAuth, (req, res) => {
  render(req, res, 'Nieuwe vraag', V.chatPage({ user: req.user, csrf: req.csrf, ...loadSidebar(req), mode: 'new' }), { wide: true });
});

app.get('/privacy', (req, res) => {
  render(req, res, 'Privacy', V.privacyPage({ siteName: getSetting('site_name', 'Hulpapp') }), { narrow: true });
});

// ---------- vragen ----------
app.post('/questions', requireAuth, (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 150);
  const body = String(req.body.body || '').trim().slice(0, 10000);
  if (!title || !body) {
    res.flash('Vul een onderwerp en je vraag in.', 'error');
    return res.redirect('/');
  }
  const t = now();
  const isOwner = req.user.role === 'owner';
  let qid;
  db.exec('BEGIN');
  try {
    const info = db.prepare('INSERT INTO questions (user_id, title, status, created_at, updated_at, owner_unread, user_unread) VALUES (?, ?, ?, ?, ?, ?, 0)')
      .run(req.user.id, title, 'open', t, t, isOwner ? 0 : 1);
    qid = Number(info.lastInsertRowid);
    db.prepare('INSERT INTO messages (question_id, user_id, body, created_at) VALUES (?, ?, ?, ?)').run(qid, req.user.id, body, t);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  if (!isOwner) {
    notifyDiscord({
      title: `❓ ${title}`,
      description: body,
      fields: [{ name: 'Van', value: req.user.displayName, inline: true }],
      path: `/questions/${qid}`,
    });
  }
  res.flash('Je vraag is verstuurd!');
  res.redirect(`/questions/${qid}`);
});

function loadQuestion(req, res) {
  const id = Number(req.params.id);
  const q = Number.isInteger(id) ? db.prepare(`${QUESTION_SELECT} WHERE q.id = ?`).get(id) : null;
  if (!q || (req.user.role !== 'owner' && q.user_id !== req.user.id)) {
    render(req, res, 'Niet gevonden', V.errorPage(404, 'Deze vraag bestaat niet of je hebt er geen toegang toe.'), { status: 404 });
    return null;
  }
  return q;
}

app.get('/questions/:id', requireAuth, (req, res) => {
  const q = loadQuestion(req, res);
  if (!q) return;
  const messages = db.prepare(`
    SELECT m.*, u.display_name AS author_name, u.role AS author_role
    FROM messages m LEFT JOIN users u ON u.id = m.user_id
    WHERE m.question_id = ? ORDER BY m.created_at, m.id`).all(q.id);
  if (req.user.role === 'owner' && q.owner_unread) db.prepare('UPDATE questions SET owner_unread = 0 WHERE id = ?').run(q.id);
  if (q.user_id === req.user.id && q.user_unread) db.prepare('UPDATE questions SET user_unread = 0 WHERE id = ?').run(q.id);
  const side = loadSidebar(req);
  render(req, res, q.title, V.chatPage({ user: req.user, csrf: req.csrf, ...side, mode: 'chat', question: q, messages }), { wide: true });
});

app.post('/questions/:id/reply', requireAuth, (req, res) => {
  const q = loadQuestion(req, res);
  if (!q) return;
  const body = String(req.body.body || '').trim().slice(0, 10000);
  if (!body) {
    res.flash('Je bericht is leeg.', 'error');
    return res.redirect(`/questions/${q.id}`);
  }
  const isOwner = req.user.role === 'owner';
  const isAsker = q.user_id === req.user.id;
  const t = now();
  db.prepare('INSERT INTO messages (question_id, user_id, body, created_at) VALUES (?, ?, ?, ?)').run(q.id, req.user.id, body, t);

  let status = q.status;
  if (isOwner && req.body.close === '1') status = 'closed';
  else if (!isOwner) status = 'open'; // reactie van vraagsteller heropent de vraag

  db.prepare('UPDATE questions SET updated_at = ?, status = ?, owner_unread = ?, user_unread = ? WHERE id = ?').run(
    t, status,
    isOwner ? 0 : 1,
    isAsker ? 0 : 1,
    q.id,
  );

  if (!isOwner && getSetting('notify_replies', '1') === '1') {
    notifyDiscord({
      title: `💬 Nieuwe reactie: ${q.title}`,
      description: body,
      fields: [{ name: 'Van', value: req.user.displayName, inline: true }],
      color: 0xfee75c,
      path: `/questions/${q.id}`,
    });
  }
  res.flash(isOwner ? (status === 'closed' ? 'Antwoord verstuurd en vraag afgerond.' : 'Antwoord verstuurd.') : 'Reactie verstuurd.');
  res.redirect(`/questions/${q.id}`);
});

app.post('/questions/:id/status', requireAuth, (req, res) => {
  const q = loadQuestion(req, res);
  if (!q) return;
  const status = req.body.status === 'closed' ? 'closed' : 'open';
  db.prepare('UPDATE questions SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), q.id);
  res.flash(status === 'closed' ? 'Vraag gemarkeerd als afgerond.' : 'Vraag heropend.');
  res.redirect(`/questions/${q.id}`);
});

app.post('/questions/:id/delete', requireOwner, (req, res) => {
  const q = loadQuestion(req, res);
  if (!q) return;
  db.prepare('DELETE FROM questions WHERE id = ?').run(q.id);
  res.flash('Vraag verwijderd.');
  res.redirect('/');
});

// ---------- account ----------
app.get('/account', requireAuth, (req, res) => {
  render(req, res, 'Mijn account', V.accountPage({ user: req.user, csrf: req.csrf }), { narrow: true });
});

app.post('/account/name', requireAuth, (req, res) => {
  const name = String(req.body.display_name || '').trim().slice(0, 50);
  if (!name) { res.flash('Vul een naam in.', 'error'); return res.redirect('/account'); }
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, req.user.id);
  res.flash('Naam opgeslagen.');
  res.redirect('/account');
});

app.post('/account/password', requireAuth, (req, res) => {
  const { current = '', password = '', password2 = '' } = req.body;
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(current, row.password_hash)) { res.flash('Huidig wachtwoord klopt niet.', 'error'); return res.redirect('/account'); }
  if (password.length < 8 || password.length > 200) { res.flash('Nieuw wachtwoord moet 8–200 tekens zijn.', 'error'); return res.redirect('/account'); }
  if (password !== password2) { res.flash('Wachtwoorden komen niet overeen.', 'error'); return res.redirect('/account'); }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), req.user.id);
  destroyOtherSessions(req.user.id, req.sessionToken);
  res.flash('Wachtwoord gewijzigd.');
  res.redirect('/account');
});

// ---------- beheer: instellingen ----------
function currentSettings() {
  return {
    site_name: getSetting('site_name', 'Hulpapp'),
    site_tagline: getSetting('site_tagline', 'Hulp en Ondersteuning'),
    public_url: getSetting('public_url'),
    has_webhook: !!getSetting('discord_webhook'),
    discord_ping_id: getSetting('discord_ping_id'),
    notify_replies: getSetting('notify_replies', '1'),
  };
}

app.get('/admin/settings', requireOwner, (req, res) => {
  render(req, res, 'Instellingen', V.settingsPage({ csrf: req.csrf, settings: currentSettings() }), { narrow: true });
});

app.post('/admin/settings', requireOwner, (req, res) => {
  const b = req.body;
  const siteName = String(b.site_name || '').trim().slice(0, 50) || 'Hulpapp';
  let publicUrl = String(b.public_url || '').trim().replace(/\/+$/, '');
  if (publicUrl && !/^https?:\/\/[^\s/]+/i.test(publicUrl)) {
    res.flash('Publieke URL moet beginnen met http:// of https://', 'error');
    return res.redirect('/admin/settings');
  }
  const webhook = String(b.discord_webhook || '').trim();
  if (webhook && !isValidWebhook(webhook)) {
    res.flash('Dat lijkt geen geldige Discord webhook URL (https://discord.com/api/webhooks/…).', 'error');
    return res.redirect('/admin/settings');
  }
  const pingId = String(b.discord_ping_id || '').trim();
  if (pingId && !/^\d{5,25}$/.test(pingId)) {
    res.flash('Discord gebruikers-ID bestaat alleen uit cijfers.', 'error');
    return res.redirect('/admin/settings');
  }

  setSetting('site_name', siteName);
  setSetting('site_tagline', String(b.site_tagline || '').trim().slice(0, 80));
  setSetting('public_url', publicUrl);
  if (b.clear_webhook === '1') setSetting('discord_webhook', '');
  else if (webhook) setSetting('discord_webhook', webhook);
  setSetting('discord_ping_id', pingId);
  setSetting('notify_replies', b.notify_replies === '1' ? '1' : '0');
  res.flash('Instellingen opgeslagen.');
  res.redirect('/admin/settings');
});

app.post('/admin/settings/test-discord', requireOwner, async (req, res) => {
  try {
    await notifyDiscord({
      title: '✅ Testmelding',
      description: `Als je dit ziet werken de Discord meldingen. Verstuurd door ${req.user.displayName}.`,
      color: 0x57f287,
      path: '/',
    }, { throwOnError: true });
    res.flash('Testmelding verstuurd — check Discord.');
  } catch (e) {
    res.flash(`Versturen mislukt: ${e.message}`, 'error');
  }
  res.redirect('/admin/settings');
});

// ---------- beheer: gebruikers & uitnodigingen ----------
app.get('/admin/users', requireOwner, (req, res) => {
  const users = db.prepare(`
    SELECT u.*, (SELECT COUNT(*) FROM questions q WHERE q.user_id = u.id) AS question_count
    FROM users u ORDER BY u.role = 'owner' DESC, u.created_at`).all();
  const invites = db.prepare('SELECT * FROM invites WHERE used_by IS NULL AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC').all(now());
  render(req, res, 'Gebruikers', V.usersPage({ csrf: req.csrf, user: req.user, users, invites, publicUrl: getSetting('public_url') }));
});

app.post('/admin/invites', requireOwner, (req, res) => {
  const days = Math.max(0, Math.min(365, parseInt(req.body.days, 10) || 0));
  const code = randomToken(18);
  const note = String(req.body.note || '').trim().slice(0, 60) || null;
  db.prepare('INSERT INTO invites (code, note, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(code, note, now(), days ? now() + days * 86400_000 : null);
  const base = getSetting('public_url').replace(/\/+$/, '');
  res.flash('Uitnodigingslink gemaakt. Kopieer en stuur hem door:', 'success', `${base}/register/${code}`);
  res.redirect('/admin/users');
});

app.post('/admin/invites/:code/delete', requireOwner, (req, res) => {
  db.prepare('DELETE FROM invites WHERE code = ? AND used_by IS NULL').run(req.params.code);
  res.flash('Uitnodiging ingetrokken.');
  res.redirect('/admin/users');
});

function loadOtherUser(req, res) {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!target || target.role === 'owner') {
    res.flash('Die gebruiker kan niet aangepast worden.', 'error');
    res.redirect('/admin/users');
    return null;
  }
  return target;
}

app.post('/admin/users/:id/delete', requireOwner, (req, res) => {
  const target = loadOtherUser(req, res);
  if (!target) return;
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  res.flash(`${target.display_name} is verwijderd.`);
  res.redirect('/admin/users');
});

app.post('/admin/users/:id/reset', requireOwner, (req, res) => {
  const target = loadOtherUser(req, res);
  if (!target) return;
  const temp = randomToken(9);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(temp), target.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
  res.flash(`Tijdelijk wachtwoord voor ${target.display_name} (${target.username}) — geef dit door, het wordt maar één keer getoond:`, 'success', temp);
  res.redirect('/admin/users');
});

// ---------- 404 & fouten ----------
app.use((req, res) => {
  render(req, res, 'Niet gevonden', V.errorPage(404, 'Deze pagina bestaat niet.'), { status: 404 });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === 'entity.too.large') return res.status(413).send('Bericht is te groot.');
  res.status(500).type('text').send('Er ging iets mis. Probeer het opnieuw.');
});

app.listen(PORT, () => {
  console.log(`Hulpapp draait op poort ${PORT}${userCount() === 0 ? ' — open de site om het eigenaar-account aan te maken' : ''}`);
});
