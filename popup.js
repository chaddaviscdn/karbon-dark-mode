const toggle = document.getElementById('toggle');

// Show the installed version; clicking it opens the releases page so people
// can compare against the latest.
document.getElementById('version').textContent =
  'v' + chrome.runtime.getManifest().version;

chrome.storage.sync.get({ karbonDarkMode: false }, (prefs) => {
  toggle.checked = prefs.karbonDarkMode;
});

toggle.addEventListener('change', () => {
  // The content script's storage.onChanged listener picks this up and applies
  // the theme to any open Karbon tabs immediately - no reload needed.
  chrome.storage.sync.set({ karbonDarkMode: toggle.checked });
});
