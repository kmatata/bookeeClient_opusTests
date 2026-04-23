// Applies light/dark CSS class to document root.
// Phase F will extend this to read Telegram.WebApp.themeParams.
export function applyTheme() {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.classList.toggle('light', !dark);
}
