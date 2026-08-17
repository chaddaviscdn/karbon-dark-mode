// Karbon Dark Mode - content script
// Runs at document_start, in the top Karbon page AND inside Karbon's email
// iframes (newer Karbon builds render email bodies in cross-origin iframes
// served from app.karbonhq.com/emailmanager/...).
//
// Two mutually exclusive modes, driven by chrome.storage.sync:
//   karbonDarkMode     -> class `karbon-ext-dark`  (softened inversion)
//   karbonHighContrast -> class `karbon-ext-hc`    (full-strength inversion,
//                          WCAG-oriented high contrast with header anchors)
// The popup enforces exclusivity; if both are ever true, high contrast wins.
//
// In frames the same classes get a `-frame` suffix and dark.css re-inverts
// media inside the frame so photos and logos keep their true colors.

const IN_FRAME = window.self !== window.top;

// Never restyle app.karbonhq.com (the classic app) at top level - the
// extension's scope is app2; the app.karbonhq.com match in the manifest
// exists only so this script reaches the email iframes embedded in app2.
const ACTIVE = IN_FRAME || location.hostname === 'app2.karbonhq.com';

const CLS_DARK = IN_FRAME ? 'karbon-ext-dark-frame' : 'karbon-ext-dark';
const CLS_HC = IN_FRAME ? 'karbon-ext-hc-frame' : 'karbon-ext-hc';

let mode = 'off'; // 'off' | 'dark' | 'hc'
let observer = null;

function apply() {
  const el = document.documentElement;
  el.classList.toggle(CLS_DARK, mode === 'dark');
  el.classList.toggle(CLS_HC, mode === 'hc');
}

function setMode(next) {
  mode = next;
  apply();
  if (mode !== 'off') {
    if (!observer) {
      // The app can rewrite <html>'s class attribute wholesale on rerender,
      // which would drop our class; re-assert it whenever that happens.
      observer = new MutationObserver(apply);
    }
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  } else if (observer) {
    observer.disconnect();
  }
}

function modeFromPrefs(prefs) {
  if (prefs.karbonHighContrast) return 'hc';
  if (prefs.karbonDarkMode) return 'dark';
  return 'off';
}

if (ACTIVE) {
  // Apply saved preference as early as possible to avoid a flash of light mode.
  chrome.storage.sync.get(
    { karbonDarkMode: false, karbonHighContrast: false },
    (prefs) => setMode(modeFromPrefs(prefs))
  );

  // React immediately when the popup toggles change the preference.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (!('karbonDarkMode' in changes) && !('karbonHighContrast' in changes)) return;
    chrome.storage.sync.get(
      { karbonDarkMode: false, karbonHighContrast: false },
      (prefs) => setMode(modeFromPrefs(prefs))
    );
  });
}
