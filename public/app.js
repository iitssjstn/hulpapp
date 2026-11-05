// Bevestiging voor gevaarlijke acties
document.addEventListener('submit', (e) => {
  const msg = e.target.dataset && e.target.dataset.confirm;
  if (msg && !window.confirm(msg)) e.preventDefault();
});

// Klik op een link/code om te kopiëren
document.addEventListener('click', async (e) => {
  const el = e.target.closest('.copyable');
  if (!el) return;
  try {
    await navigator.clipboard.writeText(el.textContent.trim());
    el.classList.add('copied');
    setTimeout(() => el.classList.remove('copied'), 1500);
  } catch {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
});

// Menu (⋯) sluiten bij klik ernaast
document.addEventListener('click', (e) => {
  document.querySelectorAll('details.menu[open]').forEach((d) => {
    if (!d.contains(e.target)) d.removeAttribute('open');
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.tagName !== 'TEXTAREA') return;
  const inComposer = !!e.target.closest('.composer');
  // In de chat: Enter = versturen, Shift+Enter = nieuwe regel. Elders: Ctrl/Cmd+Enter.
  if ((inComposer && !e.shiftKey && !e.isComposing) || e.ctrlKey || e.metaKey) {
    e.preventDefault();
    if (e.target.value.trim()) e.target.form.requestSubmit();
  }
});

// Chat: naar onderen scrollen en tekstvak laten meegroeien
const messages = document.getElementById('messages');
if (messages) messages.scrollTop = messages.scrollHeight;

const composer = document.querySelector('.composer textarea');
if (composer) {
  const grow = () => {
    composer.style.height = 'auto';
    composer.style.height = Math.min(composer.scrollHeight, 180) + 'px';
  };
  composer.addEventListener('input', grow);
  if (!document.querySelector('.flash-error')) composer.focus({ preventScroll: true });
}
