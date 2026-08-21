/*
 * Applies the stored theme before the app boots, so a dark-mode visitor never
 * sees a white flash while the bundle downloads.
 *
 * This lives in its own file rather than inline in index.html so the Content
 * Security Policy can forbid inline scripts outright — the single strongest
 * defence against injected script. It is a few hundred bytes and same-origin,
 * so the extra request costs effectively nothing.
 */
(function () {
  try {
    var stored = localStorage.getItem('shopzone.theme');
    var dark = stored ? stored === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    if (dark && document.body) document.body.classList.add('dark-theme');
  } catch (e) {
    /* private browsing — fall back to the light theme */
  }
})();
