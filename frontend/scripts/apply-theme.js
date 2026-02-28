/**
 * Apply Theme Configuration
 * 
 * This script reads APP_CONFIG from the current window or parent window (if in iframe)
 * and applies accent colors to the :root CSS variables.
 * It also applies the saved dark mode preference from localStorage.
 * 
 * Should be included in BOTH main pages and iframe-loaded pages.
 */

(function applyTheme() {
  // Get APP_CONFIG from current window or parent window (for iframes)
  const config = window.APP_CONFIG || (window.parent && window.parent.APP_CONFIG) || {};

  // Apply accent colors from config with fallback values
  const accentColor = config.ACCENT_COLOR || '#ff5500';
  const accentColorLight = config.ACCENT_COLOR_LIGHT || '#ff8800';

  document.documentElement.style.setProperty('--accent-color', accentColor);
  document.documentElement.style.setProperty('--accent-color-light', accentColorLight);

  // Also apply plyr color if in main window
  if (config.ACCENT_COLOR) {
    document.documentElement.style.setProperty('--plyr-color-main', config.ACCENT_COLOR);
  }

  // Apply saved dark mode theme
  const savedTheme = localStorage.getItem('theme');
  if (document.body) {
    if (savedTheme === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }
})();
