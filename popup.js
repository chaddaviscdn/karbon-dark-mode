const darkToggle = document.getElementById('toggle');
const retroToggle = document.getElementById('toggleRetro');

// Show the installed version; clicking it opens the releases page so people
// can compare against the latest.
document.getElementById('version').textContent =
  'v' + (chrome.runtime.getManifest().version_name ||
         chrome.runtime.getManifest().version);

chrome.storage.sync.get(
  { karbonDarkMode: false, karbonRetro: false },
  (prefs) => {
    darkToggle.checked = prefs.karbonDarkMode;
    retroToggle.checked = prefs.karbonRetro;
  }
);

// The modes are mutually exclusive: enabling one disables the other. The
// content script's storage.onChanged listener applies the theme to any open
// Karbon tabs immediately - no reload needed.
darkToggle.addEventListener('change', () => {
  if (darkToggle.checked) retroToggle.checked = false;
  chrome.storage.sync.set({
    karbonDarkMode: darkToggle.checked,
    karbonRetro: retroToggle.checked,
  });
});

retroToggle.addEventListener('change', () => {
  if (retroToggle.checked) darkToggle.checked = false;
  chrome.storage.sync.set({
    karbonDarkMode: darkToggle.checked,
    karbonRetro: retroToggle.checked,
  });
});
