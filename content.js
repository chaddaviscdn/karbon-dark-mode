// Karbon Dark Mode - content script
// Runs at document_start, in the top Karbon page AND inside Karbon's email
// iframes (newer Karbon builds render email bodies in cross-origin iframes
// served from app.karbonhq.com/emailmanager/...).
//
// Top page:  toggles `karbon-ext-dark` on <html>; dark.css inverts the whole
//            page once. The email iframe's rendered output is part of the
//            page, so it gets darkened by that same inversion.
// In frames: toggles `karbon-ext-dark-frame` on the frame's <html>; dark.css
//            then re-inverts images/videos inside the frame so photos and
//            logos keep their true colors (the outer inversion can't be
//            selective about content it can't see into).
//
// We deliberately do NOT use Karbon's own `dark` theme class: the app only
// partially supports it, which produces mixed light/dark states.

const IN_FRAME = window.self !== window.top;
const CLASS = IN_FRAME ? 'karbon-ext-dark-frame' : 'karbon-ext-dark';

// Never restyle app.karbonhq.com (the classic app) at top level - the
// extension's scope is app2; the app.karbonhq.com match in the manifest
// exists only so this script reaches the email iframes embedded in app2.
const ACTIVE = IN_FRAME || location.hostname === 'app2.karbonhq.com';

let darkEnabled = false;
let observer = null;

function apply() {
  const el = document.documentElement;
  if (darkEnabled) {
    if (!el.classList.contains(CLASS)) el.classList.add(CLASS);
  } else {
    el.classList.remove(CLASS);
  }
}

function setMode(enabled) {
  darkEnabled = enabled;
  apply();
  if (enabled) {
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

if (ACTIVE) {
  // Apply saved preference as early as possible to avoid a flash of light mode.
  chrome.storage.sync.get({ karbonDarkMode: false }, (prefs) => {
    setMode(prefs.karbonDarkMode);
  });

  // React immediately when the popup toggle changes the preference.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.karbonDarkMode) {
      setMode(changes.karbonDarkMode.newValue);
    }
  });
}
