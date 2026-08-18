// Karbon Dark Mode - content script (Retro beta branch)
// Runs at document_start, in the top Karbon page AND inside Karbon's email
// iframes. Three states, driven by chrome.storage.sync (the popup keeps them
// mutually exclusive):
//
//   karbonDarkMode -> class `karbon-ext-dark`   - the standard dark theme
//   karbonRetro    -> class `karbon-ext-retro`  - same dark base, then every
//                     major UI section gets a randomly assigned '90s color
//                     flavor (hue-shifted tint + neon edge) plus a CRT
//                     scanline overlay. Reshuffles every page load.
//
// Media restoration (photos/avatars) is injected into the page DOM because
// Chrome ignores SVG filter references in extension-injected stylesheets;
// shadow-root copies are handled by toplayer.js. In retro mode the restore
// intentionally cancels only the base inversion - the per-section tint stays
// on top of photos, which is exactly the Hypercolor look we want.

const IN_FRAME = window.self !== window.top;
const ACTIVE = IN_FRAME || location.hostname === 'app2.karbonhq.com';

// Frames only ever need the media-restore hook, same for both modes.
const CLS_DARK = 'karbon-ext-dark';
const CLS_RETRO = 'karbon-ext-retro';
const CLS_FRAME = 'karbon-ext-dark-frame';

const MEDIA_FILTER_ID = 'karbon-ext-media-restore';
// Exact mathematical inverse of [invert(0.93) then hue-rotate(180deg)].
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
    'html.karbon-ext-retro body ' + MEDIA_SELECTOR + ',\n' +
    'html.karbon-ext-dark-frame ' + MEDIA_SELECTOR + ' {\n' +
    '  filter: url(#' + MEDIA_FILTER_ID + ');\n' +
    '}\n';
  holder.appendChild(style);
  (document.body || document.documentElement).appendChild(holder);
}

/* ------------------------- Retro section flavors ------------------------- */
// Two kinds of treatment:
//
// 1. Duo-tone filter flavors for regions that contain no colored cards
//    (sidebar, header, email panels): sepia colorize + hue rotation turns
//    the whole region into one loud terminal color.
//
// 2. Pre-compensated background flavors for the main content region and for
//    cards. The page-level inversion distorts hues (CSS hue-rotate is only
//    an approximation), so target colors are pushed through the exact
//    inverse matrix ahead of time - what you see after inversion is the
//    intended color. Filters are NOT used here so nested cards keep their
//    own distinct colors.
const RETRO_TONE_FLAVORS = [
  { filter: 'sepia(1) hue-rotate(55deg) saturate(3.2)',
    edge: 'inset 0 0 0 3px #00ff66' },
  { filter: 'sepia(1) hue-rotate(330deg) saturate(3.4)',
    edge: 'inset 0 0 0 3px #ffaa00' },
  { filter: 'sepia(1) hue-rotate(230deg) saturate(2.8)',
    edge: 'inset 0 0 0 3px #ff00cc' },
  { filter: 'sepia(1) hue-rotate(140deg) saturate(3)',
    edge: 'inset 0 0 0 3px #00e5ff' },
];
// Pre-compensated pastels: render as rich dark green / amber / magenta /
// cyan / violet after the page inversion.
const RETRO_CARD_FLAVORS = [
  { bg: '#a1d7b0', edge: '#006700' },
  { bg: '#e3c187', edge: '#7e2f00' },
  { bg: '#ffd1fe', edge: '#ff51ef' },
  { bg: '#9bdceb', edge: '#006189' },
  { bg: '#e6d3ff', edge: '#8962ff' },
];

const RETRO_TONE_REGIONS = [
  'nav',
  'aside',
  'main > header',
  '.email-conversation',
  '.email-tray-grid__right-panel',
].join(', ');
const RETRO_BG_REGIONS = [
  'main > div',
].join(', ');
const RETRO_CARDS = [
  '.kanban-card',
  '.work-item-hero-panel',
  '[class*="_my-week-card-"]',
  '[class*="_plate-standard"]',
].join(', ');

let retroObserver = null;
let retroSweepTimer = null;

// Deal flavors from shuffled decks so neighboring sections always land on
// different colors; reshuffle when a deck runs out.
const decks = new Map();
function pickFrom(list) {
  let deck = decks.get(list);
  if (!deck || deck.length === 0) {
    deck = list.slice();
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    decks.set(list, deck);
  }
  return deck.pop();
}

function retroEligible(el, tier) {
  if (el.dataset.karbonRetro) return false;
  let n = el.parentElement;
  while (n) {
    if (n.dataset && n.dataset.karbonRetro === tier) return false;
    n = n.parentElement;
  }
  const r = el.getBoundingClientRect();
  if (r.width < 120 || r.height < 40) return false;
  if ((r.width * r.height) / (innerWidth * innerHeight) > 0.92) return false;
  return true;
}

function retroDecorateTone(el, tier) {
  if (!retroEligible(el, tier)) return;
  const f = pickFrom(RETRO_TONE_FLAVORS);
  el.dataset.karbonRetro = tier;
  el.style.setProperty('filter', f.filter);
  el.style.setProperty('box-shadow', f.edge);
}

function retroDecorateBg(el, tier) {
  if (!retroEligible(el, tier)) return;
  const f = pickFrom(RETRO_CARD_FLAVORS);
  el.dataset.karbonRetro = tier;
  el.style.setProperty('background-color', f.bg, 'important');
  el.style.setProperty('box-shadow', 'inset 0 0 0 3px ' + f.edge);
}

function retroSweep() {
  for (const el of document.querySelectorAll(RETRO_TONE_REGIONS)) {
    try { retroDecorateTone(el, 'region'); } catch (e) { /* keep going */ }
  }
  for (const el of document.querySelectorAll(RETRO_BG_REGIONS)) {
    try { retroDecorateBg(el, 'main'); } catch (e) { /* keep going */ }
  }
  for (const el of document.querySelectorAll(RETRO_CARDS)) {
    try { retroDecorateBg(el, 'card'); } catch (e) { /* keep going */ }
  }
}

function retroStart() {
  retroSweep();
  if (!retroObserver) {
    retroObserver = new MutationObserver(() => {
      clearTimeout(retroSweepTimer);
      retroSweepTimer = setTimeout(retroSweep, 400);
    });
  }
  if (document.body) {
    retroObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (mode === 'retro') {
        retroObserver.observe(document.body, { childList: true, subtree: true });
        retroSweep();
      }
    });
  }
}

function retroStop() {
  if (retroObserver) retroObserver.disconnect();
  clearTimeout(retroSweepTimer);
  for (const el of document.querySelectorAll('[data-karbon-retro]')) {
    delete el.dataset.karbonRetro;
    el.style.removeProperty('filter');
    el.style.removeProperty('box-shadow');
    el.style.removeProperty('background-color');
  }
}

/* ------------------------------ Mode wiring ------------------------------ */

let mode = 'off'; // 'off' | 'dark' | 'retro'
let observer = null;

function apply() {
  const el = document.documentElement;
  if (IN_FRAME) {
    el.classList.toggle(CLS_FRAME, mode !== 'off');
  } else {
    el.classList.toggle(CLS_DARK, mode === 'dark');
    el.classList.toggle(CLS_RETRO, mode === 'retro');
  }
  if (mode !== 'off') ensureMediaDefs();
}

function setMode(next) {
  const prev = mode;
  mode = next;
  apply();
  if (!IN_FRAME) {
    if (mode === 'retro' && prev !== 'retro') retroStart();
    if (mode !== 'retro' && prev === 'retro') retroStop();
  }
  if (mode !== 'off') {
    if (!observer) {
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
  if (prefs.karbonRetro) return 'retro';
  if (prefs.karbonDarkMode) return 'dark';
  return 'off';
}

if (ACTIVE) {
  chrome.storage.sync.get(
    { karbonDarkMode: false, karbonRetro: false },
    (prefs) => setMode(modeFromPrefs(prefs))
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (!('karbonDarkMode' in changes) && !('karbonRetro' in changes)) return;
    chrome.storage.sync.get(
      { karbonDarkMode: false, karbonRetro: false },
      (prefs) => setMode(modeFromPrefs(prefs))
    );
  });

  document.addEventListener('DOMContentLoaded', () => {
    if (mode !== 'off') ensureMediaDefs();
  });
}
