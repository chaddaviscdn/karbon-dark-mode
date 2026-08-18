// Karbon Dark Mode - content script
// Runs at document_start, in the top Karbon page AND inside Karbon's email
// iframes (newer Karbon builds render email bodies in cross-origin iframes
// served from app.karbonhq.com/emailmanager/...).
//
// Top page:  toggles `karbon-ext-dark` on <html>; dark.css inverts the whole
//            page once. The email iframe's rendered output is part of the
//            page, so it gets darkened by that same inversion.
// In frames: toggles `karbon-ext-dark-frame` on the frame's <html>; media
//            inside the frame is re-inverted so photos and logos keep their
//            true colors.
//
// Media restoration lives HERE, not in dark.css: the exact inverse of the
// page filter is an SVG feColorMatrix, and Chrome silently ignores SVG
// filter references from extension-injected stylesheets (that bug shipped
// as v1.3.2's inverted profile photos). So this script injects the <svg>
// filter definition and a <style> with the media rules directly into the
// page DOM, where fragment references (url(#id)) resolve reliably.

const IN_FRAME = window.self !== window.top;

// Never restyle app.karbonhq.com (the classic app) at top level - the
// extension's scope is app2; the app.karbonhq.com match in the manifest
// exists only so this script reaches the email iframes embedded in app2.
const ACTIVE = IN_FRAME || location.hostname === 'app2.karbonhq.com';

const CLS_DARK = IN_FRAME ? 'karbon-ext-dark-frame' : 'karbon-ext-dark';

const MEDIA_FILTER_ID = 'karbon-ext-media-restore';
// Exact mathematical inverse of [invert(0.93) then hue-rotate(180deg)] -
// see the repo README/history for the derivation. Midtones restore
// pixel-exactly; only the extreme ends of the range clip slightly, which is
// inherent to displaying media inside an inverted page.
const MEDIA_MATRIX =
  '0.667442 -1.662791 -0.167442 0 1.081395 ' +
  '-0.495349 -0.5 -0.167442 0 1.081395 ' +
  '-0.495349 -1.662791 0.995349 0 1.081395 ' +
  '0 0 0 1 0';

const MEDIA_SELECTOR =
  ':is(img, video, [style*="background-image"]):not(' +
  ':is(img, video, [style*="background-image"]) *' +
  ')';

function ensureMediaDefs() {
  if (document.getElementById('karbon-ext-media-defs')) return;
  const holder = document.createElement('div');
  holder.id = 'karbon-ext-media-defs';
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText =
    'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  holder.innerHTML =
    '<svg width="0" height="0">' +
    '<filter id="' + MEDIA_FILTER_ID + '" color-interpolation-filters="sRGB">' +
    '<feColorMatrix type="matrix" values="' + MEDIA_MATRIX + '"/>' +
    '</filter></svg>';
  const style = document.createElement('style');
  style.id = 'karbon-ext-media-style';
  style.textContent =
    'html.karbon-ext-dark body ' + MEDIA_SELECTOR + ',\n' +
    'html.karbon-ext-dark-frame ' + MEDIA_SELECTOR + ' {\n' +
    '  filter: url(#' + MEDIA_FILTER_ID + ');\n' +
    '}\n';
  holder.appendChild(style);
  (document.body || document.documentElement).appendChild(holder);
}

let darkEnabled = false;
let observer = null;

function apply() {
  const el = document.documentElement;
  el.classList.toggle(CLS_DARK, darkEnabled);
  if (darkEnabled) ensureMediaDefs();
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

  // Re-inject the defs if the app ever replaces the body wholesale.
  document.addEventListener('DOMContentLoaded', () => {
    if (darkEnabled) ensureMediaDefs();
  });
}
