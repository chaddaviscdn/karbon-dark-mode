// Karbon Dark Mode - top-layer patch (runs in the page's MAIN world)
//
// Native popovers (`showPopover()`) and modal dialogs (`showModal()`) render
// in the browser's top layer, which escapes ancestor CSS filters - so the
// page-level inversion in dark.css never reaches them and they'd stay light
// (e.g. the triage filter menu or the editor's Add Link dialog, built as
// khq/Spectrum web-component overlays inside shadow roots, where page CSS
// can't select either).
//
// IMPORTANT: the filter must NEVER be applied to a zero-size overlay shell.
// Karbon's overlays are often a 0x0 [popover] wrapper whose visible panel is
// slotted light-DOM content positioned against the viewport. A filter on the
// wrapper turns it into the containing block for that panel, collapsing the
// panel into the 0x0 shell - the "Add Link dialog never shows up" bug in
// v1.3.1. So we walk through shells, slots, and shadow roots until we reach
// elements that actually render a box, and filter those. Full-viewport
// semi-transparent backdrops are recursed into rather than filtered so the
// page behind a modal keeps its normal darkness.

(() => {
  const FILTER = 'invert(0.93) hue-rotate(180deg)';
  // Exact inverse of FILTER (see dark.css for the derivation) so avatars
  // inside menus and dialogs are restored pixel-exactly.
  const MEDIA_FILTER = 'url("data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%3E%3Cfilter%20id%3D%27kdm%27%20color-interpolation-filters%3D%27sRGB%27%3E%3CfeColorMatrix%20type%3D%27matrix%27%20values%3D%270.667442%20-1.662791%20-0.167442%200%201.081395%20-0.495349%20-0.5%20-0.167442%200%201.081395%20-0.495349%20-1.662791%200.995349%200%201.081395%200%200%200%201%200%27/%3E%3C/filter%3E%3C/svg%3E#kdm")';
  const MEDIA_CSS =
    '[data-karbon-ext-toplayer] ' +
    ':is(img, video, [style*="background-image"]):not(' +
    ':is(img, video, [style*="background-image"]) *' +
    ') { filter: ' + MEDIA_FILTER + '; }';

  const styledRoots = new WeakSet();

  const darkOn = () =>
    document.documentElement.classList.contains('karbon-ext-dark');

  function hasBox(el) {
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  }

  function isBackdrop(el) {
    const r = el.getBoundingClientRect();
    return r.width > innerWidth * 0.9 && r.height > innerHeight * 0.9;
  }

  // Find the elements that actually paint the overlay: descend through
  // zero-size shells, <slot> assignments, shadow roots, and full-viewport
  // backdrops until real boxes are found.
  function findPanels(el, depth, out) {
    if (depth > 8) return out;
    const kids = [];
    if (el.shadowRoot) kids.push(...el.shadowRoot.children);
    kids.push(...el.children);
    for (const k of kids) {
      if (k.tagName === 'SLOT') {
        for (const a of k.assignedElements()) {
          if (hasBox(a) && !isBackdrop(a)) out.push(a);
          else findPanels(a, depth + 1, out);
        }
        continue;
      }
      if (k.tagName === 'STYLE' || k.tagName === 'SCRIPT') continue;
      if (hasBox(k) && !isBackdrop(k)) out.push(k);
      else findPanels(k, depth + 1, out);
    }
    return out;
  }

  // Media re-invert rules must live inside each target's root (document or
  // shadow root) because outside CSS can't select into shadow DOM.
  function ensureRootStyle(node) {
    const root = node.getRootNode();
    if (styledRoots.has(root)) return;
    const s = document.createElement('style');
    s.textContent = MEDIA_CSS;
    (root.head || root).appendChild(s);
    styledRoots.add(root);
  }

  function undecorate(el) {
    for (const t of el.__kdTargets || []) {
      t.removeAttribute('data-karbon-ext-toplayer');
      t.style.removeProperty('filter');
      if (t.__kdBgForced) {
        t.style.removeProperty('background-color');
        delete t.__kdBgForced;
      }
    }
    el.__kdTargets = null;
  }

  // Composed-tree containment (crosses shadow boundaries) so we never filter
  // an element twice - a nested double inversion lands back near the
  // original colors, which reads as dark-on-dark text.
  function containedBy(t, o) {
    let n = t;
    while (n) {
      if (n === o) return true;
      // assignedSlot first: slotted content's composed parent runs through
      // the slot inside the host's shadow tree, not its light-DOM parent.
      n = n.assignedSlot || n.parentNode || n.host || null;
    }
    return false;
  }

  function decorateNow(el) {
    undecorate(el);
    if (!darkOn()) return;
    let targets = (hasBox(el) && !isBackdrop(el))
      ? [el]
      : findPanels(el, 0, []);
    // Drop targets nested inside another target - composed-tree check plus a
    // geometric check (slot assignment can lag behind layout, so geometry is
    // the reliable signal at decoration time). Mutual containment keeps the
    // earlier (shallower) target.
    const rectContains = (a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return rb.left >= ra.left - 1 && rb.right <= ra.right + 1 &&
             rb.top >= ra.top - 1 && rb.bottom <= ra.bottom + 1;
    };
    targets = targets.filter((t, i) =>
      !targets.some((o, j) =>
        o !== t && (
          containedBy(t, o) ||
          (rectContains(o, t) && (!rectContains(t, o) || j < i))
        )
      )
    );
    el.__kdTargets = targets;
    for (const t of targets) {
      t.setAttribute('data-karbon-ext-toplayer', '');
      t.style.setProperty('filter', FILTER);
      // Solid base only when the panel is fully transparent, so the
      // inversion produces a readable dark surface.
      const bg = getComputedStyle(t).backgroundColor;
      if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
        t.style.setProperty('background-color', '#fff');
        t.__kdBgForced = true;
      }
      ensureRootStyle(t);
    }
  }

  function decorate(el) {
    // Defer past the overlay's own open/measure/animation work, then find
    // the rendered panels. Web components can slot their content in
    // asynchronously, so re-evaluate after the DOM settles - decorateNow is
    // idempotent (it undecorates first).
    const run = () => {
      try { decorateNow(el); } catch (e) { /* never break the app */ }
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
    setTimeout(run, 150);
    setTimeout(run, 400);
    // Clean up when the overlay closes so a re-open re-evaluates fresh.
    el.addEventListener('toggle', function onToggle(e) {
      if (e.newState === 'closed') {
        el.removeEventListener('toggle', onToggle);
        try { undecorate(el); } catch (e2) { /* ignore */ }
      }
    });
    el.addEventListener('close', function onClose() {
      el.removeEventListener('close', onClose);
      try { undecorate(el); } catch (e2) { /* ignore */ }
    });
  }

  const showPopover = HTMLElement.prototype.showPopover;
  if (showPopover) {
    const wrapped = function showPopoverWrapped(...args) {
      const result = showPopover.apply(this, args);
      try { decorate(this); } catch (e) { /* never break the app */ }
      return result;
    };
    // Stay invisible to native-code feature detection.
    wrapped.toString = () => showPopover.toString();
    HTMLElement.prototype.showPopover = wrapped;
  }

  const showModal = HTMLDialogElement.prototype.showModal;
  if (showModal) {
    const wrapped = function showModalWrapped(...args) {
      const result = showModal.apply(this, args);
      try { decorate(this); } catch (e) { /* never break the app */ }
      return result;
    };
    wrapped.toString = () => showModal.toString();
    HTMLDialogElement.prototype.showModal = wrapped;
  }
})();
