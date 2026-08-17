// Karbon Dark Mode - content script
// Runs at document_start. Toggles our own `karbon-ext-dark` class on <html>;
// dark.css keys every rule off that class. We deliberately do NOT use
// Karbon's own `dark` theme class: Karbon's app only partially supports it
// (new components flip dark while legacy pages stay light), which produces
// mixed light/dark states. Keeping the app in its normal light mode and
// inverting the whole page in CSS gives a uniform dark result everywhere.

const CLASS = 'karbon-ext-dark';
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
