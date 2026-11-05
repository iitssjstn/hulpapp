import crypto from 'node:crypto';
import { db, now } from './db.js';

const SESSION_COOKIE = 'hulp_session';
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

// ---------- wachtwoorden (scrypt, ingebouwd in Node) ----------
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [algo, saltB64, hashB64] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
      N: 16384, r: 8, p: 1,
    });
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

// ---------- cookies ----------
export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* negeer */ }
  }
  return out;
}

function cookieOpts(req, maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/',
    maxAge: maxAgeMs,
  };
}

// ---------- sessies ----------
export function createSession(req, res, userId) {
  const token = randomToken();
  const csrf = randomToken(24);
  db.prepare('INSERT INTO sessions (token, user_id, csrf, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, csrf, now() + SESSION_MS);
  res.cookie(SESSION_COOKIE, token, cookieOpts(req, SESSION_MS));
}

export function destroySession(req, res) {
  const token = req.cookies[SESSION_COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function destroyOtherSessions(userId, keepToken) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(userId, keepToken || '');
}

const findSession = db.prepare(`
  SELECT s.token, s.csrf, s.expires_at, u.id, u.username, u.display_name, u.role
  FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.token = ?
`);
const touchSession = db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?');

export function sessionMiddleware(req, res, next) {
  req.cookies = parseCookies(req.headers.cookie);
  const token = req.cookies[SESSION_COOKIE];
  req.user = null;
  if (token) {
    const row = findSession.get(token);
    if (row && row.expires_at > now()) {
      req.user = { id: row.id, username: row.username, displayName: row.display_name, role: row.role };
      req.csrf = row.csrf;
      req.sessionToken = row.token;
      // sliding expiry, maximaal één keer per uur bijwerken
      if (row.expires_at - now() < SESSION_MS - 60 * 60 * 1000) {
        touchSession.run(now() + SESSION_MS, token);
        res.cookie(SESSION_COOKIE, token, cookieOpts(req, SESSION_MS));
      }
    } else if (row) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }
  }
  res.locals.user = req.user;
  res.locals.csrf = req.csrf || '';
  next();
}

export function csrfMiddleware(req, res, next) {
  if (req.method !== 'POST' || !req.user) return next();
  const sent = req.body?._csrf || '';
  const a = Buffer.from(String(sent));
  const b = Buffer.from(String(req.csrf));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).send('Ongeldige of verlopen formulier-token. Ga terug en probeer opnieuw.');
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/login');
  next();
}

export function requireOwner(req, res, next) {
  if (!req.user) return res.redirect('/login');
  if (req.user.role !== 'owner') return res.status(403).send('Alleen voor de eigenaar.');
  next();
}

// ---------- simpele rate limit voor inloggen ----------
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function loginBlocked(key) {
  const a = attempts.get(key);
  if (!a) return false;
  if (now() - a.first > WINDOW_MS) { attempts.delete(key); return false; }
  return a.count >= MAX_ATTEMPTS;
}

export function registerFailure(key) {
  const a = attempts.get(key);
  if (!a || now() - a.first > WINDOW_MS) attempts.set(key, { first: now(), count: 1 });
  else a.count++;
}

export function clearFailures(key) {
  attempts.delete(key);
}

setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
  for (const [k, a] of attempts) if (now() - a.first > WINDOW_MS) attempts.delete(k);
}, 60 * 60 * 1000).unref();
