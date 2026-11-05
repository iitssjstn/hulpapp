import { getSetting } from './db.js';

const WEBHOOK_RE = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export function isValidWebhook(url) {
  return WEBHOOK_RE.test(String(url || '').trim());
}

function truncate(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/**
 * Stuurt een melding naar de ingestelde Discord webhook.
 * Gooit nooit een fout naar de aanroeper (behalve bij `throwOnError`).
 */
export async function notifyDiscord({ title, description, path, color = 0x5865f2, fields = [] }, { throwOnError = false } = {}) {
  const webhook = getSetting('discord_webhook');
  if (!webhook) {
    if (throwOnError) throw new Error('Er is nog geen Discord webhook ingesteld.');
    return;
  }

  const siteName = getSetting('site_name', 'Hulpapp');
  const publicUrl = getSetting('public_url').replace(/\/+$/, '');
  const pingId = getSetting('discord_ping_id').trim();

  const embed = {
    title: truncate(title, 256),
    description: truncate(description, 3500),
    color,
    fields: fields.map((f) => ({ name: truncate(f.name, 256), value: truncate(f.value, 1024), inline: !!f.inline })),
    timestamp: new Date().toISOString(),
    footer: { text: siteName },
  };
  if (publicUrl && path) embed.url = publicUrl + path;

  const payload = {
    username: truncate(siteName, 80),
    embeds: [embed],
    allowed_mentions: { parse: [], users: [] },
  };
  if (/^\d{5,25}$/.test(pingId)) {
    payload.content = `<@${pingId}>`;
    payload.allowed_mentions.users = [pingId];
  }

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Discord gaf status ${res.status}: ${truncate(text, 200)}`);
    }
  } catch (err) {
    console.error('[discord]', err.message);
    if (throwOnError) throw err;
  }
}
