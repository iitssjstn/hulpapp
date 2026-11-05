import { html, raw, fmtDate, timeAgo } from './html.js';
import { getSetting } from './db.js';

// Verandert bij elke herstart, zodat browsers na een update nieuwe CSS/JS ophalen
const ASSET_V = Date.now().toString(36);

const csrfField =(csrf) => html`<input type="hidden" name="_csrf" value="${csrf}">`;

function flashBox(flash) {
  if (!flash) return '';
  return html`<div class="flash flash-${flash.type || 'info'}" role="status">${flash.text}${
    flash.code ? html`<code class="copyable">${flash.code}</code>` : ''
  }</div>`;
}

function activeSection(p = '') {
  if (p === '/' || p === '/new' || p.startsWith('/questions')) return 'questions';
  if (p.startsWith('/admin/users')) return 'users';
  if (p.startsWith('/admin/settings')) return 'settings';
  if (p.startsWith('/account')) return 'account';
  return '';
}

const ICON_BUBBLE = raw('<svg class="icon-bubble" viewBox="0 0 48 48" width="44" height="44" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><path d="M24 7C13.5 7 6 13.6 6 21.5c0 4.4 2.3 8.3 6 11l-1.8 7.8 8.4-4.6c1.7.4 3.5.6 5.4.6 10.5 0 18-6.6 18-14.8S34.5 7 24 7z"/></svg>');
const ICON_PLUS = raw('<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M10 4v12M4 10h12"/></svg>');

export function layout({ title, user, csrf, flash, body, narrow = false, wide = false, unread = 0, path = '' }) {
  const siteName = getSetting('site_name', 'Hulpapp');
  const tagline = getSetting('site_tagline', 'Hulp en Ondersteuning');
  const active = activeSection(path);
  const link = (href, key, label) => html`<a href="${href}" class="${active === key ? 'active' : ''}">${label}</a>`;
  const nav = user
    ? html`
      <nav class="nav">
        ${link('/', 'questions', html`${user.role === 'owner' ? 'Vragen' : 'Mijn vragen'}${unread ? html` <span class="badge">${unread}</span>` : ''}`)}
        ${user.role === 'owner' ? html`${link('/admin/users', 'users', 'Gebruikers')}${link('/admin/settings', 'settings', 'Instellingen')}` : ''}
        ${link('/account', 'account', user.displayName)}
        <form method="post" action="/logout" class="inline">${csrfField(csrf)}<button class="linklike">Uitloggen</button></form>
      </nav>`
    : '';
  return '<!doctype html>' + html`
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title ? `${title} · ${siteName}` : siteName}</title>
  <link rel="stylesheet" href="/public/style.css?v=${ASSET_V}">
  <link rel="icon" href="/public/icon.svg" type="image/svg+xml">
  <script src="/public/app.js?v=${ASSET_V}" defer></script>
</head>
<body>
  <header class="topbar">
    <div class="wrap topbar-inner">
      <a href="/" class="brand"><img src="/public/icon.svg" alt="" width="24" height="24"> ${siteName}</a>
      ${nav}
    </div>
  </header>
  <main class="wrap ${narrow ? 'narrow' : ''} ${wide ? 'wide' : ''}">
    ${flashBox(flash)}
    ${body}
  </main>
  <footer class="wrap footer ${wide ? 'wide' : ''}">
    <p>© ${new Date().getFullYear()} ${siteName}${tagline ? ` - ${tagline}` : ''}</p>
    <a href="/privacy">Privacy</a>
  </footer>
</body>
</html>`.s;
}

// ---------- auth pagina's ----------
export function setupPage({ error, values = {} }) {
  return html`
    <section class="card">
      <h1>Welkom 👋</h1>
      <p class="muted">Er is nog geen account. Maak hier het <strong>eigenaar-account</strong> aan.
      Daarmee beantwoord je vragen, nodig je mensen uit en stel je Discord in.</p>
      ${error ? html`<p class="error">${error}</p>` : ''}
      <form method="post" action="/setup" class="stack">
        <label>Naam die anderen zien<input name="display_name" required maxlength="50" value="${values.display_name || ''}" autofocus></label>
        <label>Gebruikersnaam<input name="username" required maxlength="32" pattern="[A-Za-z0-9_.\\-]{3,32}" autocomplete="username" value="${values.username || ''}"></label>
        <label>Wachtwoord<input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
        <label>Wachtwoord herhalen<input type="password" name="password2" required minlength="8" autocomplete="new-password"></label>
        <label>Naam van de site<input name="site_name" maxlength="50" value="${values.site_name || 'Hulpapp'}"></label>
        <button class="btn primary">Account aanmaken</button>
      </form>
    </section>`;
}

export function loginPage({ error, username = '' }) {
  return html`
    <section class="card">
      <h1>Inloggen</h1>
      ${error ? html`<p class="error">${error}</p>` : ''}
      <form method="post" action="/login" class="stack">
        <label>Gebruikersnaam<input name="username" required autocomplete="username" value="${username}" autofocus></label>
        <label>Wachtwoord<input type="password" name="password" required autocomplete="current-password"></label>
        <button class="btn primary">Inloggen</button>
      </form>
      <p class="muted small">Nog geen account? Vraag de beheerder om een uitnodigingslink.</p>
    </section>`;
}

export function registerPage({ code, error, values = {}, invalid }) {
  if (invalid) {
    return html`<section class="card"><h1>Uitnodiging ongeldig</h1>
      <p>Deze uitnodigingslink is al gebruikt, verlopen of bestaat niet. Vraag een nieuwe link aan.</p>
      <p><a href="/login" class="btn">Naar inloggen</a></p></section>`;
  }
  return html`
    <section class="card">
      <h1>Account aanmaken</h1>
      <p class="muted">Je bent uitgenodigd. Kies een gebruikersnaam en wachtwoord.</p>
      ${error ? html`<p class="error">${error}</p>` : ''}
      <form method="post" action="/register/${code}" class="stack">
        <label>Je naam<input name="display_name" required maxlength="50" value="${values.display_name || ''}" autofocus></label>
        <label>Gebruikersnaam<input name="username" required maxlength="32" pattern="[A-Za-z0-9_.\\-]{3,32}" autocomplete="username" value="${values.username || ''}">
          <span class="hint">3–32 tekens: letters, cijfers, punt, streepje of underscore.</span></label>
        <label>Wachtwoord<input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
        <label>Wachtwoord herhalen<input type="password" name="password2" required minlength="8" autocomplete="new-password"></label>
        <button class="btn primary">Account aanmaken</button>
      </form>
    </section>`;
}

// ---------- vragen (chat-weergave) ----------
function statusPill(status) {
  return status === 'open'
    ? html`<span class="pill pill-open">Open</span>`
    : html`<span class="pill pill-closed">Afgerond</span>`;
}

function initials(name = '?') {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  const s = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || '?').slice(0, 2);
  return s.toUpperCase();
}

const avatar = (name, id) => html`<span class="avatar av-${Math.abs(Number(id) || 0) % 6}" aria-hidden="true">${initials(name)}</span>`;

const ICON_SEND = raw('<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.3 10.2 15 12 3.3 13.8z"/></svg>');

const TZ = process.env.TZ || 'Europe/Amsterdam';
const timeFmt = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const dayFmt = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
const fmtTime = (ms) => timeFmt.format(new Date(ms));
const fmtDay = (ms) => dayFmt.format(new Date(ms));

function chatList({ user, questions, activeId, filter }) {
  const isOwner = user.role === 'owner';
  const qs = isOwner && filter && filter !== 'open' ? `?status=${filter}` : '';
  if (!questions.length) {
    return html`<div class="chatlist-empty"><p>Nog geen vragen hier.</p>${ICON_BUBBLE}</div>`;
  }
  return html`<ul class="chatlist">${questions.map((q) => {
    const unread = isOwner ? q.owner_unread : q.user_unread;
    const name = isOwner ? (q.asker_name || 'verwijderde gebruiker') : q.title;
    const preview = (q.last_user_id === user.id ? 'Jij: ' : '') + (q.last_body || '');
    return html`<li>
      <a href="/questions/${q.id}${qs}" class="chatitem ${q.id === activeId ? 'active' : ''} ${unread ? 'unread' : ''}">
        ${avatar(isOwner ? q.asker_name : q.title, isOwner ? q.user_id : q.id)}
        <span class="chatitem-main">
          <span class="chatitem-top">
            <span class="chatitem-name">${name}</span>
            <time title="${fmtDate(q.updated_at)}">${timeAgo(q.updated_at)}</time>
          </span>
          ${isOwner ? html`<span class="chatitem-title">${q.title}</span>` : ''}
          <span class="chatitem-preview">${preview}</span>
        </span>
        ${unread ? html`<span class="dot" title="Nieuw"></span>` : q.status === 'closed' ? html`<span class="check" title="Afgerond">✓</span>` : ''}
      </a>
    </li>`;
  })}</ul>`;
}

function sidebar({ user, questions, activeId, filter, counts }) {
  const isOwner = user.role === 'owner';
  const tab = (key, label) =>
    html`<a href="/?status=${key}" class="tabpill ${filter === key ? 'active' : ''}">${label} <span class="count">${counts[key] || 0}</span></a>`;
  return html`
    <aside class="chat-sidebar panel">
      <div class="panel-head"><h1>${isOwner ? 'Vragen' : 'Mijn vragen'}</h1></div>
      ${isOwner ? html`<div class="tabpills">${tab('open', 'Open')}${tab('closed', 'Afgerond')}${tab('all', 'Alles')}</div>` : ''}
      ${chatList({ user, questions, activeId, filter })}
      <div class="sidebar-foot">
        <a href="/new" class="btn primary pillbtn">${ICON_PLUS} ${isOwner ? 'Zelf een vraag/notitie toevoegen' : 'Nieuwe vraag stellen'}</a>
      </div>
    </aside>`;
}

function newQuestionPane(csrf, isOwner) {
  return html`
    <section class="chat-pane panel">
      <div class="chat-head">
        <a href="/" class="chat-back" aria-label="Terug">←</a>
        <div class="chat-head-main"><h2>${isOwner ? 'Zelf een vraag/notitie toevoegen' : 'Stel een vraag'}</h2>
          <p>${isOwner ? 'Alleen voor jezelf, er gaat geen melding uit.' : 'Je krijgt hier antwoord zodra er gereageerd is.'}</p></div>
      </div>
      <form method="post" action="/questions" class="stack newq">
        ${csrfField(csrf)}
        <label>Onderwerp<input name="title" required maxlength="150" placeholder="Waar gaat het over?" autofocus></label>
        <label>Je vraag<textarea name="body" required maxlength="10000" rows="7" placeholder="Leg zo goed mogelijk uit wat je wilt weten…"></textarea></label>
        <div><button class="btn primary pillbtn">Versturen</button></div>
      </form>
    </section>`;
}

function emptyPane(isOwner) {
  return html`
    <section class="chat-pane panel chat-pane-empty">
      <div class="empty-state">
        <p class="empty-text">${isOwner ? 'Kies een gesprek' : 'Kies een gesprek of stel een vraag'} ${ICON_BUBBLE}</p>
        <a href="/new" class="btn primary pillbtn">${ICON_PLUS} ${isOwner ? 'Zelf een vraag/notitie toevoegen' : 'Nieuwe vraag stellen'}</a>
      </div>
    </section>`;
}

function conversationPane({ user, csrf, question, messages }) {
  const isOwner = user.role === 'owner';
  const canClose = isOwner || question.user_id === user.id;
  let lastDay = '';
  return html`
    <section class="chat-pane panel">
      <div class="chat-head">
        <a href="/" class="chat-back" aria-label="Terug">←</a>
        ${avatar(isOwner ? question.asker_name : question.title, isOwner ? question.user_id : question.id)}
        <div class="chat-head-main">
          <h2>${question.title}</h2>
          <p>${question.asker_name || 'verwijderde gebruiker'} · ${fmtDate(question.created_at)}</p>
        </div>
        ${statusPill(question.status)}
        <details class="menu">
          <summary aria-label="Meer acties" title="Meer acties">⋯</summary>
          <div class="menu-items">
            ${canClose ? html`
              <form method="post" action="/questions/${question.id}/status">
                ${csrfField(csrf)}
                <input type="hidden" name="status" value="${question.status === 'open' ? 'closed' : 'open'}">
                <button>${question.status === 'open' ? 'Markeer als afgerond' : 'Heropenen'}</button>
              </form>` : ''}
            ${isOwner ? html`
              <form method="post" action="/questions/${question.id}/delete" data-confirm="Dit gesprek en alle berichten definitief verwijderen?">
                ${csrfField(csrf)}
                <button class="danger">Gesprek verwijderen</button>
              </form>` : ''}
          </div>
        </details>
      </div>

      <div class="messages" id="messages">
        ${messages.map((m) => {
          const mine = m.user_id === user.id;
          const day = fmtDay(m.created_at);
          const sep = day !== lastDay ? html`<div class="daysep"><span>${day}</span></div>` : '';
          lastDay = day;
          return html`${sep}
          <div class="bubble-row ${mine ? 'mine' : 'theirs'}">
            ${mine ? '' : avatar(m.author_name, m.user_id)}
            <div class="bubble">
              ${mine ? '' : html`<div class="bubble-name">${m.author_name || 'verwijderde gebruiker'}${m.author_role === 'owner' ? html` <span class="pill pill-owner">beheerder</span>` : ''}</div>`}
              <div class="bubble-body">${m.body}</div>
              <time title="${fmtDate(m.created_at)}">${fmtTime(m.created_at)}</time>
            </div>
          </div>`;
        })}
        ${question.status === 'closed' ? html`<div class="daysep"><span>Gesprek afgerond — een nieuw bericht heropent het</span></div>` : ''}
      </div>

      <form method="post" action="/questions/${question.id}/reply" class="composer">
        ${csrfField(csrf)}
        <textarea name="body" required maxlength="10000" rows="1" placeholder="${isOwner ? 'Typ je antwoord…' : 'Typ een bericht…'}" aria-label="Bericht"></textarea>
        ${isOwner && question.status === 'open' ? html`<button class="btn pillbtn" name="close" value="1" title="Versturen en gesprek afronden">Afronden</button>` : ''}
        <button class="btn primary sendbtn" aria-label="Versturen" title="Versturen (Enter)">${ICON_SEND}</button>
      </form>
    </section>`;
}

/** mode: 'empty' | 'new' | 'chat' */
export function chatPage({ user, csrf, questions, filter, counts, mode, question, messages }) {
  const isOwner = user.role === 'owner';
  let pane;
  if (mode === 'chat') pane = conversationPane({ user, csrf, question, messages });
  else if (mode === 'new') pane = newQuestionPane(csrf, isOwner);
  else pane = emptyPane(isOwner);
  return html`
    <div class="chat-layout ${mode === 'empty' ? 'show-list' : 'show-pane'}">
      ${sidebar({ user, questions, activeId: question?.id, filter, counts })}
      ${pane}
    </div>`;
}

export function privacyPage({ siteName }) {
  return html`
    <section class="card">
      <h1>Privacy</h1>
      <p>${siteName} is een besloten site voor mensen die de beheerder persoonlijk kent.</p>
      <h2>Wat wordt opgeslagen</h2>
      <ul>
        <li>Je naam, gebruikersnaam en een versleutelde versie van je wachtwoord.</li>
        <li>De vragen en berichten die je verstuurt.</li>
        <li>Een inlog-cookie zodat je ingelogd blijft. Er worden geen tracking- of advertentiecookies gebruikt.</li>
      </ul>
      <h2>Wie het kan zien</h2>
      <p>Alleen jij en de beheerder kunnen jouw gesprekken lezen. Bij een nieuwe vraag of reactie krijgt de beheerder een melding via Discord met je naam en (een deel van) je bericht.</p>
      <h2>Verwijderen</h2>
      <p>Wil je dat je account en berichten verwijderd worden? Vraag het de beheerder, dan wordt alles definitief gewist.</p>
    </section>`;
}

// ---------- account ----------
export function accountPage({ user, csrf }) {
  return html`
    <h1>Mijn account</h1>
    <form method="post" action="/account/name" class="card stack">
      ${csrfField(csrf)}
      <h2>Naam</h2>
      <label>Naam die anderen zien<input name="display_name" required maxlength="50" value="${user.displayName}"></label>
      <p class="muted small">Gebruikersnaam: <code>${user.username}</code></p>
      <div><button class="btn primary">Opslaan</button></div>
    </form>
    <form method="post" action="/account/password" class="card stack">
      ${csrfField(csrf)}
      <h2>Wachtwoord wijzigen</h2>
      <label>Huidig wachtwoord<input type="password" name="current" required autocomplete="current-password"></label>
      <label>Nieuw wachtwoord<input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
      <label>Nieuw wachtwoord herhalen<input type="password" name="password2" required minlength="8" autocomplete="new-password"></label>
      <p class="muted small">Andere apparaten worden hierna uitgelogd.</p>
      <div><button class="btn primary">Wachtwoord wijzigen</button></div>
    </form>`;
}

// ---------- beheer ----------
export function settingsPage({ csrf, settings }) {
  return html`
    <h1>Instellingen</h1>
    <form method="post" action="/admin/settings" class="card stack">
      ${csrfField(csrf)}
      <h2>Algemeen</h2>
      <label>Naam van de site<input name="site_name" maxlength="50" value="${settings.site_name}"></label>
      <label>Ondertitel in de footer<input name="site_tagline" maxlength="80" value="${settings.site_tagline}" placeholder="Hulp en Ondersteuning"></label>
      <label>Publieke URL
        <input name="public_url" type="url" placeholder="https://hulp.example.nl" value="${settings.public_url}">
        <span class="hint">Wordt gebruikt voor links in Discord-meldingen en uitnodigingen.</span></label>

      <h2>Discord meldingen</h2>
      <label>Webhook URL
        <input name="discord_webhook" type="password" autocomplete="off" placeholder="${settings.has_webhook ? '•••••••• (ingesteld — leeg laten om te behouden)' : 'https://discord.com/api/webhooks/…'}">
        <span class="hint">Discord → kanaal-instellingen → Integraties → Webhooks → Nieuwe webhook → URL kopiëren.
        Wordt alleen in de database opgeslagen, niet in de env.</span></label>
      ${settings.has_webhook ? html`<label class="check"><input type="checkbox" name="clear_webhook" value="1"> Webhook verwijderen</label>` : ''}
      <label>Jouw Discord gebruikers-ID (optioneel)
        <input name="discord_ping_id" inputmode="numeric" pattern="\\d{5,25}" value="${settings.discord_ping_id}" placeholder="bijv. 123456789012345678">
        <span class="hint">Als je dit invult word je in elke melding getagd (@jij), zodat je ook een push krijgt. Zet Ontwikkelaarsmodus aan in Discord → rechtsklik op jezelf → Gebruikers-ID kopiëren.</span></label>
      <label class="check"><input type="checkbox" name="notify_replies" value="1" ${settings.notify_replies === '1' ? raw('checked') : ''}> Ook melden bij nieuwe reacties op bestaande vragen</label>
      <div class="row"><button class="btn primary">Opslaan</button></div>
    </form>
    <form method="post" action="/admin/settings/test-discord" class="card row">
      ${csrfField(csrf)}
      <div class="grow"><strong>Test melding</strong><p class="muted small">Stuurt een testbericht naar de ingestelde webhook.</p></div>
      <button class="btn" ${settings.has_webhook ? '' : raw('disabled')}>Test versturen</button>
    </form>`;
}

export function usersPage({ csrf, user, users, invites, publicUrl }) {
  const base = publicUrl.replace(/\/+$/, '');
  return html`
    <h1>Gebruikers</h1>

    <section class="card stack">
      <h2>Iemand uitnodigen</h2>
      <p class="muted small">Maak een uitnodigingslink en stuur die naar iemand die je kent. Elke link werkt één keer.</p>
      <form method="post" action="/admin/invites" class="row wrap-row">
        ${csrfField(csrf)}
        <input name="note" maxlength="60" placeholder="Voor wie? (optioneel)" class="grow">
        <select name="days">
          <option value="1">1 dag geldig</option>
          <option value="7" selected>7 dagen geldig</option>
          <option value="30">30 dagen geldig</option>
          <option value="0">Onbeperkt</option>
        </select>
        <button class="btn primary">Link maken</button>
      </form>
      ${invites.length ? html`
        <table class="table">
          <thead><tr><th>Voor</th><th>Link</th><th>Verloopt</th><th></th></tr></thead>
          <tbody>${invites.map((i) => html`<tr>
            <td>${i.note || '—'}</td>
            <td><code class="copyable">${base ? `${base}/register/${i.code}` : `/register/${i.code}`}</code></td>
            <td>${i.expires_at ? fmtDate(i.expires_at) : 'nooit'}</td>
            <td><form method="post" action="/admin/invites/${i.code}/delete" class="inline">${csrfField(csrf)}<button class="btn small">Intrekken</button></form></td>
          </tr>`)}</tbody>
        </table>
        ${base ? '' : html`<p class="hint">Tip: stel bij Instellingen de publieke URL in, dan worden dit volledige links.</p>`}` : ''}
    </section>

    <section class="card">
      <h2>Accounts</h2>
      <table class="table">
        <thead><tr><th>Naam</th><th>Gebruikersnaam</th><th>Rol</th><th>Vragen</th><th>Sinds</th><th></th></tr></thead>
        <tbody>${users.map((u) => html`<tr>
          <td>${u.display_name}</td>
          <td><code>${u.username}</code></td>
          <td>${u.role === 'owner' ? 'eigenaar' : 'gebruiker'}</td>
          <td>${u.question_count}</td>
          <td>${fmtDate(u.created_at)}</td>
          <td class="nowrap">${u.id === user.id ? '' : html`
            <form method="post" action="/admin/users/${u.id}/reset" class="inline" data-confirm="Nieuw tijdelijk wachtwoord maken voor ${u.display_name}?">${csrfField(csrf)}<button class="btn small">Wachtwoord resetten</button></form>
            <form method="post" action="/admin/users/${u.id}/delete" class="inline" data-confirm="${u.display_name} en al hun vragen definitief verwijderen?">${csrfField(csrf)}<button class="btn small danger">Verwijderen</button></form>`}
          </td>
        </tr>`)}</tbody>
      </table>
    </section>`;
}

export function errorPage(status, message) {
  return html`<section class="card"><h1>${status}</h1><p>${message}</p><p><a href="/" class="btn">Naar start</a></p></section>`;
}
