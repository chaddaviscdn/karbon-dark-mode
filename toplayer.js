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
  // Exact inverse of FILTER as an SVG color matrix (see content.js), so
  // avatars inside menus and dialogs are restored pixel-exactly. Referenced
  // as a same-document fragment; a copy of the definition is injected into
  // each shadow root because fragment lookups are tree-scoped.
  const MEDIA_FILTER_ID = 'karbon-ext-media-restore';
  const MEDIA_MATRIX =
    '0.667442 -1.662791 -0.167442 0 1.081395 ' +
    '-0.495349 -0.5 -0.167442 0 1.081395 ' +
    '-0.495349 -1.662791 0.995349 0 1.081395 ' +
    '0 0 0 1 0';
  const MEDIA_DEF_SVG =
    '<svg width="0" height="0" aria-hidden="true">' +
    '<filter id="' + MEDIA_FILTER_ID + '" color-interpolation-filters="sRGB">' +
    '<feColorMatrix type="matrix" values="' + MEDIA_MATRIX + '"/>' +
    '</filter></svg>';
  const MEDIA_CSS =
    '[data-karbon-ext-toplayer] ' +
    ':is(img, video, [style*="background-image"]):not(' +
    ':is(img, video, [style*="background-image"]) *' +
    ') { filter: url(#' + MEDIA_FILTER_ID + '); }';

  // Media inside SHADOW ROOTS is unreachable by any page-level stylesheet,
  // so avatars rendered by web components (khq-avatar etc.) were being
  // inverted by the page filter with no restore. Every shadow root gets its
  // own copy of the restore rule + filter definition, injected at
  // attachShadow time and toggled with the mode.
  const SHADOW_MEDIA_CSS =
    ':is(img, video, [style*="background-image"]):not(' +
    ':is(img, video, [style*="background-image"]) *' +
    ') { filter: url(#' + MEDIA_FILTER_ID + '); }\n' + MEDIA_CSS;

  const shadowStyles = [];
  const registeredRoots = new WeakSet();

  function darkClassOn() {
    const cl = document.documentElement.classList;
    return cl.contains('karbon-ext-dark') || cl.contains('karbon-ext-retro');
  }

  function makeDefHolder() {
    const holder = document.createElement('div');
    holder.setAttribute('aria-hidden', 'true');
    holder.style.cssText =
      'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    holder.innerHTML = MEDIA_DEF_SVG;
    return holder;
  }

  function registerRoot(root) {
    if (registeredRoots.has(root)) return;
    registeredRoots.add(root);
    const style = document.createElement('style');
    style.textContent = SHADOW_MEDIA_CSS;
    style.media = darkClassOn() ? 'all' : 'not all';
    root.appendChild(style);
    root.appendChild(makeDefHolder());
    shadowStyles.push(style);
  }

  const attachShadow = Element.prototype.attachShadow;
  if (attachShadow) {
    const wrappedAttach = function attachShadowWrapped(init) {
      const root = attachShadow.call(this, init);
      try { registerRoot(root); } catch (e) { /* never break the app */ }
      return root;
    };
    wrappedAttach.toString = () => attachShadow.toString();
    Element.prototype.attachShadow = wrappedAttach;
  }

  // Toggle all shadow-root styles when the mode class changes, and sweep any
  // open roots that might predate the patch.
  function sweepRoots(node, depth) {
    if (depth > 10) return;
    for (const el of node.querySelectorAll('*')) {
      if (el.shadowRoot) {
        registerRoot(el.shadowRoot);
        sweepRoots(el.shadowRoot, depth + 1);
      }
    }
  }
  new MutationObserver(() => {
    const m = darkClassOn() ? 'all' : 'not all';
    for (const s of shadowStyles) {
      if (s.media !== m) s.media = m;
    }
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  document.addEventListener('DOMContentLoaded', () => {
    try { sweepRoots(document, 0); } catch (e) { /* ignore */ }
  });

  const styledRoots = new WeakSet();

  const darkOn = () => darkClassOn();

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
  // shadow root) because outside CSS can't select into shadow DOM - and each
  // shadow root also needs its own copy of the SVG filter definition, since
  // url(#id) lookups are scoped to the tree the style lives in.
  function ensureRootStyle(node) {
    const root = node.getRootNode();
    if (styledRoots.has(root)) return;
    const s = document.createElement('style');
    s.textContent = MEDIA_CSS;
    (root.head || root).appendChild(s);
    if (root instanceof ShadowRoot) {
      const holder = document.createElement('div');
      holder.setAttribute('aria-hidden', 'true');
      holder.style.cssText =
        'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
      holder.innerHTML = MEDIA_DEF_SVG;
      root.appendChild(holder);
    }
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
