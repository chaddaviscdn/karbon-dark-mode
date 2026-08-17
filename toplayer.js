// Karbon Dark Mode - top-layer patch (runs in the page's MAIN world)
//
// Native popovers (`showPopover()`) and modal dialogs (`showModal()`) render
// in the browser's top layer, which escapes ancestor CSS filters - so the
// page-level inversion in dark.css never reaches them and they'd stay light
// (e.g. the triage filter menu, built as a khq web component popover inside
// a shadow root, where page CSS can't select either).
//
// This script patches showPopover/showModal to apply the same inversion
// directly to the top-layer element at show time. It reads the current mode
// from the `karbon-ext-dark` class that content.js maintains on <html>, so
// it needs no storage access of its own.

(() => {
  const FILTER = 'invert(0.93) hue-rotate(180deg)';
  // Exact inverse of the popover filter (see dark.css for the derivation) so
  // avatars inside menus are restored pixel-exactly.
  const MEDIA_FILTER = 'url("data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%3E%3Cfilter%20id%3D%27kdm%27%20color-interpolation-filters%3D%27sRGB%27%3E%3CfeColorMatrix%20type%3D%27matrix%27%20values%3D%270.667442%20-1.662791%20-0.167442%200%201.081395%20-0.495349%20-0.5%20-0.167442%200%201.081395%20-0.495349%20-1.662791%200.995349%200%201.081395%200%200%200%201%200%27/%3E%3C/filter%3E%3C/svg%3E#kdm")';
  const MEDIA_CSS =
    '[data-karbon-ext-toplayer] ' +
    ':is(img, video, [style*="background-image"]):not(' +
    ':is(img, video, [style*="background-image"]) *' +
    ') { filter: ' + MEDIA_FILTER + '; }';

  const styledRoots = new WeakSet();

  const darkOn = () =>
    document.documentElement.classList.contains('karbon-ext-dark');

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
    if (darkOn()) {
      el.setAttribute('data-karbon-ext-toplayer', '');
      el.style.setProperty('filter', FILTER);
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
