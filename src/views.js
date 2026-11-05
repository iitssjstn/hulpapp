import { html, raw, fmtDate, timeAgo } from './html.js';
import { getSetting } from './db.js';

const csrfField = (csrf) => html`<input type="hidden" name="_csrf" value="${csrf}">`;

function flashBox(flash) {
  if (!flash) return '';
  return html`<div class="flash flash-${flash.type || 'info'}" role="status">${flash.text}${
    flash.code ? html`<code class="copyable">${flash.code}</code>` : ''
  }</div>`;
}

export function layout({ title, user, csrf, flash, body, narrow = false, unread = 0 }) {
  const siteName = getSetting('site_name', 'Hulpapp');
  const nav = user
    ? html`
      <nav class="nav">
        <a href="/">${user.role === 'owner' ? 'Vragen' : 'Mijn vragen'}${unread ? html` <span class="badge">${unread}</span>` : ''}</a>
        ${user.role === 'owner' ? html`<a href="/admin/users">Gebruikers</a><a href="/admin/settings">Instellingen</a>` : ''}
        <a href="/account">${user.displayName}</a>
        <form method="post" action="/logout" class="inline">${csrfField(csrf)}<button class="linklike">Uitloggen</button></form>
      </nav>`
    : '';
  return '<!doctype html>' + html`
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title ? `${title} · ${siteName}` : siteName}</title>
  <link rel="stylesheet" href="/public/style.css">
  <link rel="icon" href="/public/icon.svg" type="image/svg+xml">
  <script src="/public/app.js" defer></script>
</head>
<body>
  <header class="topbar">
    <div class="wrap topbar-inner">
      <a href="/" class="brand"><img src="/public/icon.svg" alt="" width="24" height="24"> ${siteName}</a>
      ${nav}
    </div>
  </header>
  <main class="wrap ${narrow ? 'narrow' : ''}">
    ${flashBox(flash)}
    ${body}
  </main>
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

// ---------- vragen ----------
function statusPill(status) {
  return status === 'open'
    ? html`<span class="pill pill-open">Open</span>`
    : html`<span class="pill pill-closed">Afgerond</span>`;
}

function questionList(questions, { isOwner }) {
  if (!questions.length) return html`<p class="empty">Nog geen vragen hier.</p>`;
  return html`<ul class="qlist">${questions.map((q) => {
    const unread = isOwner ? q.owner_unread : q.user_unread;
    return html`<li class="${unread ? 'unread' : ''}">
      <a href="/questions/${q.id}">
        <div class="qtitle">${unread ? html`<span class="dot" title="Nieuw"></span>` : ''}${q.title}</div>
        <div class="qmeta">
          ${statusPill(q.status)}
          ${isOwner ? html`<span>${q.asker_name || 'verwijderde gebruiker'}</span>` : ''}
          <span>${q.message_count} ${q.message_count === 1 ? 'bericht' : 'berichten'}</span>
          <span title="${fmtDate(q.updated_at)}">${timeAgo(q.updated_at)}</span>
        </div>
      </a>
    </li>`;
  })}</ul>`;
}

export function newQuestionForm(csrf, values = {}) {
  return html`
    <form method="post" action="/questions" class="card stack">
      ${csrfField(csrf)}
      <h2>Stel een vraag</h2>
      <label>Onderwerp<input name="title" required maxlength="150" value="${values.title || ''}" placeholder="Waar gaat het over?"></label>
      <label>Je vraag<textarea name="body" required maxlength="10000" rows="5" placeholder="Leg zo goed mogelijk uit wat je wilt weten…">${values.body || ''}</textarea></label>
      <div><button class="btn primary">Versturen</button></div>
    </form>`;
}

export function dashboardPage({ user, csrf, questions, filter, counts }) {
  const isOwner = user.role === 'owner';
  if (isOwner) {
    const tab = (key, label) =>
      html`<a href="/?status=${key}" class="tab ${filter === key ? 'active' : ''}">${label} <span class="count">${counts[key]}</span></a>`;
    return html`
      <div class="pagehead"><h1>Vragen</h1></div>
      <div class="tabs">${tab('open', 'Open')}${tab('closed', 'Afgerond')}${tab('all', 'Alles')}</div>
      ${questionList(questions, { isOwner })}
      <details class="card subtle"><summary>Zelf een vraag/notitie toevoegen</summary>${newQuestionForm(csrf)}</details>`;
  }
  return html`
    ${newQuestionForm(csrf)}
    <h2>Mijn vragen</h2>
    ${questionList(questions, { isOwner })}`;
}

export function questionPage({ user, csrf, question, messages }) {
  const isOwner = user.role === 'owner';
  const canClose = isOwner || question.user_id === user.id;
  return html`
    <p><a href="/" class="back">← Terug</a></p>
    <div class="pagehead">
      <h1>${question.title}</h1>
      ${statusPill(question.status)}
    </div>
    <p class="muted small">Gevraagd door ${question.asker_name || 'verwijderde gebruiker'} · ${fmtDate(question.created_at)}</p>

    <div class="thread">
      ${messages.map((m) => html`
        <article class="msg ${m.author_role === 'owner' ? 'msg-owner' : ''} ${m.user_id === user.id ? 'msg-me' : ''}">
          <header><strong>${m.author_name || 'verwijderde gebruiker'}</strong>${m.author_role === 'owner' ? html` <span class="pill pill-owner">beheerder</span>` : ''}
            <time title="${fmtDate(m.created_at)}">${timeAgo(m.created_at)}</time></header>
          <div class="body">${m.body}</div>
        </article>`)}
    </div>

    <form method="post" action="/questions/${question.id}/reply" class="card stack">
      ${csrfField(csrf)}
      <label>${isOwner ? 'Antwoord' : 'Reageren'}<textarea name="body" required maxlength="10000" rows="4"></textarea></label>
      <div class="row">
        <button class="btn primary">Versturen</button>
        ${isOwner && question.status === 'open' ? html`<button class="btn" name="close" value="1">Versturen &amp; afronden</button>` : ''}
      </div>
    </form>

    <div class="row actions">
      ${canClose ? html`
        <form method="post" action="/questions/${question.id}/status" class="inline">
          ${csrfField(csrf)}
          <input type="hidden" name="status" value="${question.status === 'open' ? 'closed' : 'open'}">
          <button class="btn small">${question.status === 'open' ? 'Markeer als afgerond' : 'Heropenen'}</button>
        </form>` : ''}
      ${isOwner ? html`
        <form method="post" action="/questions/${question.id}/delete" class="inline" data-confirm="Deze vraag en alle berichten definitief verwijderen?">
          ${csrfField(csrf)}
          <button class="btn small danger">Verwijderen</button>
        </form>` : ''}
    </div>`;
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
