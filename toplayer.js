// Karbon Dark Mode - top-layer patch (runs in the page's MAIN world)
//
// Native popovers (`showPopover()`) and modal dialogs (`showModal()`) render
// in the browser's top layer, which escapes ancestor CSS filters - so the
// page-level inversion in dark.css never reaches them and they'd stay light
// (e.g. the triage filter menu, built as a khq web component popover inside
// a shadow root, where page CSS can't select either).
//
// This script patches showPopover/showModal to apply the active mode's
// inversion directly to the top-layer element at show time. It reads the
// current mode from the classes content.js maintains on <html>, so it needs
// no storage access of its own.

(() => {
  const FILTERS = {
    'karbon-ext-dark': 'invert(0.93) hue-rotate(180deg)',
    'karbon-ext-hc': 'invert(1) hue-rotate(180deg)',
  };
  const MEDIA_CSS =
    '[data-karbon-ext-toplayer] ' +
    ':is(img, video, [style*="background-image"]):not(' +
    ':is(img, video, [style*="background-image"]) *' +
    ') { filter: invert(1) hue-rotate(180deg); }';

  const styledRoots = new WeakSet();

  function activeFilter() {
    const cl = document.documentElement.classList;
    for (const cls of Object.keys(FILTERS)) {
      if (cl.contains(cls)) return FILTERS[cls];
    }
    return null;
  }

  // Media re-invert rules must live inside the element's root (document or
  // shadow root) because outside CSS can't select into shadow DOM.
  function ensureRootStyle(node) {
    const root = node.getRootNode();
    if (styledRoots.has(root)) return;
    const s = document.createElement('style');
    s.textContent = MEDIA_CSS;
    (root.head || root).appendChild(s);
    styledRoots.add(root);
  }

  function decorate(el) {
    const filter = activeFilter();
    if (filter) {
      el.setAttribute('data-karbon-ext-toplayer', '');
      el.style.setProperty('filter', filter);
      // A solid base so the inversion produces a dark panel even if the
      // popover itself is transparent.
      if (!el.style.backgroundColor) {
        el.style.setProperty('background-color', '#fff');
      }
      ensureRootStyle(el);
    } else {
      el.removeAttribute('data-karbon-ext-toplayer');
      el.style.removeProperty('filter');
      el.style.removeProperty('background-color');
    }
  }

  const showPopover = HTMLElement.prototype.showPopover;
  if (showPopover) {
    HTMLElement.prototype.showPopover = function (...args) {
      const result = showPopover.apply(this, args);
      try { decorate(this); } catch (e) { /* never break the app */ }
      return result;
    };
  }

  const showModal = HTMLDialogElement.prototype.showModal;
  if (showModal) {
    HTMLDialogElement.prototype.showModal = function (...args) {
      const result = showModal.apply(this, args);
      try { decorate(this); } catch (e) { /* never break the app */ }
      return result;
    };
  }
})();
