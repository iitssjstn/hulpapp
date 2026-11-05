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

// Ctrl/Cmd + Enter verstuurt een formulier vanuit een tekstvak
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.tagName === 'TEXTAREA') {
    e.preventDefault();
    e.target.form.requestSubmit();
  }
});
