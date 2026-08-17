const darkToggle = document.getElementById('toggle');
const hcToggle = document.getElementById('toggleHc');

// Show the installed version; clicking it opens the releases page so people
// can compare against the latest.
document.getElementById('version').textContent =
  'v' + (chrome.runtime.getManifest().version_name ||
         chrome.runtime.getManifest().version);

chrome.storage.sync.get(
  { karbonDarkMode: false, karbonHighContrast: false },
  (prefs) => {
    darkToggle.checked = prefs.karbonDarkMode;
    hcToggle.checked = prefs.karbonHighContrast;
  }
);

// The two modes are mutually exclusive: enabling one disables the other.
// The content script's storage.onChanged listener picks this up and applies
// the theme to any open Karbon tabs immediately - no reload needed.
darkToggle.addEventListener('change', () => {
  if (darkToggle.checked) hcToggle.checked = false;
  chrome.storage.sync.set({
    karbonDarkMode: darkToggle.checked,
    karbonHighContrast: hcToggle.checked,
  });
});

hcToggle.addEventListener('change', () => {
  if (hcToggle.checked) darkToggle.checked = false;
  chrome.storage.sync.set({
    karbonDarkMode: darkToggle.checked,
    karbonHighContrast: hcToggle.checked,
  });
});
