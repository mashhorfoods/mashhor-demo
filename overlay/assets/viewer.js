/* =============================================================================
   Image viewer — a closer look at the work.

   Tap (or Enter on) a work image and it opens full screen, growing out of
   the thumbnail. There: zoom in and out (buttons, wheel or trackpad pinch,
   two-finger pinch, double tap / double click where you look), drag to pan
   once zoomed, previous / next (arrows, swipe, arrow keys — mirrored in
   Arabic), Escape or ✕ to close back into the thumbnail.

   Groups: every image of one slideshow / gallery / set browses together.
   Images inside links (service cards, the Al Mada tiles) keep their links.
   A <dialog> does the modal work (focus stays inside, Escape, the page
   behind is inert); the opener gets focus back on close. Under reduced
   motion it opens, changes and closes without travelling or scaling.
   Without this script the images are simply images.
   ============================================================================= */
(() => {
  'use strict';

  const GROUPS = [
    ['.c-slides', '.c-slides__frame img'],
    // The story: Al Mada's four parts, in the order the page tells them.
    ['main', '.c-work img, .c-chapter__work img'],
    ['.c-gallery', 'img'],
    ['.g-work', '.g-project__frame img'],
  // The campaign page's hero: Pixora's own identity board, up close.
  ['.g-hero__visual', 'img'],
    ['main', '.c-split__figure img'],
  ];
  const MAX = 4;
  const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ar = () => root.lang === 'ar' || root.dir === 'rtl';
  const rtl = () => root.dir === 'rtl';
  const say = (en, arabic) => (ar() ? arabic : en);

  /* The images, in groups --------------------------------------------- */
  const groups = [];
  const seen = new Set();
  GROUPS.forEach(([box, sel]) => document.querySelectorAll(box).forEach((el) => {
    const imgs = [...el.querySelectorAll(sel)].filter((i) => !seen.has(i) && !i.closest('a, button'));
    imgs.forEach((i) => seen.add(i));
    if (imgs.length) groups.push(imgs);
  }));
  if (!groups.length) return;

  // The sharpest file the page offers for an image (its largest srcset entry).
  const full = (img) => {
    let best = img.currentSrc || img.src;
    let most = 0;
    (img.getAttribute('srcset') || '').split(',').forEach((c) => {
      const [url, w] = c.trim().split(/\s+/);
      const n = parseInt(w, 10) || 0;
      if (url && n > most) { most = n; best = new URL(url, location.href).href; }
    });
    return best;
  };
  // The caption people see under the image — not the alt text or a hidden
  // description written for screen readers (those can run to a paragraph).
  const caption = (img) => {
    const cap = img.closest('figure')?.querySelector('figcaption');
    if (!cap || cap.matches('.u-visually-hidden') || !cap.getClientRects().length) return '';
    const own = cap.querySelector(`[data-lang-copy="${ar() ? 'ar' : 'en'}"]`);
    return (own || cap).textContent.replace(/\s+/g, ' ').trim();
  };

  /* The viewer --------------------------------------------------------- */
  const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" /></svg>`;
  let dlg; let stage; let pic; let cap; let bPrev; let bNext; let bIn; let bOut; let bClose;
  const build = () => {
    dlg = document.createElement('dialog');
    dlg.className = 'c-viewer';
    dlg.innerHTML = `
      <div class="c-viewer__stage"><img class="c-viewer__img" alt="" draggable="false" /></div>
      <p class="c-viewer__caption" aria-live="polite"></p>
      <button class="c-viewer__btn c-viewer__close" type="button" data-v="close">${icon('M6 6l12 12M18 6L6 18')}</button>
      <button class="c-viewer__btn c-viewer__nav c-viewer__prev u-flip-rtl" type="button" data-v="prev">${icon('M15 5l-7 7 7 7')}</button>
      <button class="c-viewer__btn c-viewer__nav c-viewer__next u-flip-rtl" type="button" data-v="next">${icon('M9 5l7 7-7 7')}</button>
      <div class="c-viewer__zoom">
        <button class="c-viewer__btn" type="button" data-v="out">${icon('M6 12h12')}</button>
        <button class="c-viewer__btn" type="button" data-v="in">${icon('M6 12h12M12 6v12')}</button>
      </div>`;
    document.body.append(dlg);
    stage = dlg.querySelector('.c-viewer__stage');
    pic = dlg.querySelector('.c-viewer__img');
    cap = dlg.querySelector('.c-viewer__caption');
    [bClose, bPrev, bNext, bOut, bIn] = ['close', 'prev', 'next', 'out', 'in'].map((v) => dlg.querySelector(`[data-v="${v}"]`));
    bClose.addEventListener('click', () => close());
    bPrev.addEventListener('click', () => show(at - 1, -1));
    bNext.addEventListener('click', () => show(at + 1, 1));
    bIn.addEventListener('click', () => zoomTo(scale * 1.6));
    bOut.addEventListener('click', () => zoomTo(scale / 1.6));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dlg.addEventListener('keydown', onKey);
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    window.addEventListener('resize', () => { if (dlg.open) { measure(); place(false); } });
  };
  const label = () => {
    dlg.setAttribute('aria-label', say('Image viewer', 'عارض الصور'));
    bClose.setAttribute('aria-label', say('Close', 'إغلاق'));
    bPrev.setAttribute('aria-label', say('Previous image', 'الصورة السابقة'));
    bNext.setAttribute('aria-label', say('Next image', 'الصورة التالية'));
    bIn.setAttribute('aria-label', say('Zoom in', 'تكبير'));
    bOut.setAttribute('aria-label', say('Zoom out', 'تصغير'));
  };

  /* State: which image, and how it sits (translate from centre, scale) --- */
  let list = [];
  let at = 0;
  let opener = null;
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let baseW = 0; // the image's size at scale 1, fitted to the screen
  let baseH = 0;
  let stageW = 0;
  let stageH = 0;
  const measure = () => {
    const r = stage.getBoundingClientRect();
    stageW = r.width; stageH = r.height;
    pic.style.transform = 'none';
    const p = pic.getBoundingClientRect();
    baseW = p.width; baseH = p.height;
  };
  // Keep the zoomed image covering the screen where it can: no empty edges.
  const clamp = () => {
    const mx = Math.max(0, (baseW * scale - stageW) / 2);
    const my = Math.max(0, (baseH * scale - stageH) / 2);
    tx = Math.min(mx, Math.max(-mx, tx));
    ty = Math.min(my, Math.max(-my, ty));
  };
  const place = (smooth) => {
    clamp();
    pic.style.transition = smooth && !reduce.matches ? `transform 320ms ${EASE}` : 'none';
    pic.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    dlg.classList.toggle('is-zoomed', scale > 1.01);
    bOut.disabled = scale <= 1.01;
    bIn.disabled = scale >= MAX - 0.01;
  };
  // Zoom to s keeping the screen point (px, py) — relative to the centre — still.
  const zoomTo = (s, px = 0, py = 0, smooth = true) => {
    const next = Math.min(MAX, Math.max(1, s));
    tx = px - (px - tx) * (next / scale);
    ty = py - (py - ty) * (next / scale);
    scale = next;
    if (scale === 1) { tx = 0; ty = 0; }
    place(smooth);
  };
  const fromCentre = (e) => {
    const r = stage.getBoundingClientRect();
    return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2];
  };

  /* Showing an image ---------------------------------------------------- */
  const load = (img) => {
    pic.src = img.currentSrc || img.src; // already loaded: shows at once
    pic.alt = img.alt;
    const sharp = full(img);
    if (sharp !== pic.src) {
      const hi = new Image();
      hi.onload = () => { if (list[at] === img) pic.src = sharp; };
      hi.src = sharp;
    }
    cap.textContent = caption(img);
    const many = list.length > 1;
    bPrev.hidden = !many;
    bNext.hidden = !many;
  };
  const settle = () => new Promise((r) => (pic.complete ? r() : pic.addEventListener('load', r, { once: true })));

  const show = async (i, dir) => {
    if (list.length < 2) return;
    at = (i + list.length) % list.length;
    const away = (rtl() ? -dir : dir) * -48;
    if (!reduce.matches) await pic.animate([{ opacity: 1 }, { opacity: 0, translate: `${away}px 0` }], { duration: 160, easing: 'ease-in' }).finished;
    scale = 1; tx = 0; ty = 0;
    load(list[at]);
    await settle();
    measure();
    place(false);
    pic.animate(reduce.matches ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, translate: `${-away}px 0` }, { opacity: 1, translate: '0 0' }],
      { duration: reduce.matches ? 120 : 280, easing: EASE });
  };

  // The thumbnail's box → the viewer's box, and back (a FLIP).
  const flight = (thumb) => {
    const a = thumb.getBoundingClientRect();
    const b = pic.getBoundingClientRect();
    if (!a.width || !b.width || a.bottom < 0 || a.top > innerHeight) return null;
    const s = Math.max(a.width / b.width, a.height / b.height);
    return { transform: `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px, ${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${s})` };
  };

  const open = async (img, group) => {
    if (!dlg) build();
    label();
    list = group;
    at = group.indexOf(img);
    opener = img;
    scale = 1; tx = 0; ty = 0;
    load(img);
    root.classList.add('is-viewing');
    dlg.showModal();
    bClose.focus({ preventScroll: true });
    await settle();
    measure();
    place(false);
    const from = !reduce.matches && flight(img);
    dlg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduce.matches ? 120 : 280, easing: 'ease-out' });
    if (from) pic.animate([{ ...from, opacity: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 440, easing: EASE });
  };

  let closing = false;
  const close = async () => {
    if (!dlg?.open || closing) return;
    closing = true;
    const thumb = list[at];
    scale = 1; tx = 0; ty = 0;
    place(false);
    const to = !reduce.matches && flight(thumb);
    const fade = dlg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduce.matches ? 100 : 300, easing: 'ease-in', fill: 'forwards' });
    if (to) pic.animate([{ transform: 'none' }, to], { duration: 320, easing: EASE, fill: 'forwards' });
    await fade.finished;
    dlg.close();
    fade.cancel();
    pic.getAnimations().forEach((a) => a.cancel());
    root.classList.remove('is-viewing');
    document.dispatchEvent(new CustomEvent('viewerclose'));
    (thumb || opener)?.focus({ preventScroll: true });
    closing = false;
  };

  /* Keys, wheel, pointers --------------------------------------------- */
  function onKey(e) {
    const fwd = rtl() ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl() ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === fwd && scale === 1) { e.preventDefault(); show(at + 1, 1); }
    else if (e.key === back && scale === 1) { e.preventDefault(); show(at - 1, -1); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomTo(scale * 1.6); }
    else if (e.key === '-') { e.preventDefault(); zoomTo(scale / 1.6); }
    else if (e.key === '0') { e.preventDefault(); zoomTo(1); }
  }
  function onWheel(e) {
    e.preventDefault();
    const [px, py] = fromCentre(e);
    zoomTo(scale * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), px, py, false);
  }

  const pts = new Map();
  let gesture = null; // { kind: 'pan' | 'swipe' | 'pinch', ... }
  let lastTap = { t: 0, x: 0, y: 0 };
  function onDown(e) {
    if (e.button > 0) return;
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) {
      const [[x1, y1], [x2, y2]] = [...pts.values()];
      const r = stage.getBoundingClientRect();
      gesture = { kind: 'pinch', d0: Math.hypot(x2 - x1, y2 - y1), s0: scale, cx: (x1 + x2) / 2 - r.left - r.width / 2, cy: (y1 + y2) / 2 - r.top - r.height / 2 };
    } else if (pts.size === 1) {
      gesture = { kind: scale > 1.01 ? 'pan' : 'swipe', x0: e.clientX, y0: e.clientY, tx0: tx, ty0: ty, moved: false, onPic: e.target === pic };
    }
  }
  function onMove(e) {
    if (!pts.has(e.pointerId) || !gesture) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (gesture.kind === 'pinch' && pts.size === 2) {
      const [[x1, y1], [x2, y2]] = [...pts.values()];
      zoomTo(gesture.s0 * (Math.hypot(x2 - x1, y2 - y1) / gesture.d0), gesture.cx, gesture.cy, false);
      return;
    }
    const dx = e.clientX - gesture.x0;
    const dy = e.clientY - gesture.y0;
    if (Math.hypot(dx, dy) > 6) gesture.moved = true;
    if (gesture.kind === 'pan') { tx = gesture.tx0 + dx; ty = gesture.ty0 + dy; place(false); }
    else if (gesture.kind === 'swipe' && list.length > 1) { pic.style.transition = 'none'; pic.style.transform = `translate(${dx * 0.9}px, 0)`; }
  }
  function onUp(e) {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    const g = gesture;
    if (!g || pts.size) { if (g?.kind === 'pinch' && pts.size === 1) gesture = null; return; }
    gesture = null;
    if (g.kind === 'swipe') {
      const dx = e.clientX - g.x0;
      if (list.length > 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - g.y0)) {
        const dir = (dx < 0 ? 1 : -1) * (rtl() ? -1 : 1);
        show(at + dir, dir);
        return;
      }
      place(true); // back to the middle
    }
    if (g.moved) return;
    // A tap: twice on the image zooms there (or back out); once beside it closes.
    const now = performance.now();
    const [px, py] = fromCentre(e);
    if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
      lastTap.t = 0;
      zoomTo(scale > 1.01 ? 1 : 2.5, px, py);
      return;
    }
    lastTap = { t: now, x: e.clientX, y: e.clientY };
    if (!g.onPic && scale <= 1.01) setTimeout(() => { if (lastTap.t === now) close(); }, 330);
  }

  /* The images open it -------------------------------------------------- */
  const all = groups.flat();
  // Their accessible name follows the language switch (the site script
  // swaps each alt text; the name is read from it afterwards).
  const name = () => all.forEach((img) => img.setAttribute('aria-label', `${say('View larger', 'عرض بحجم أكبر')}: ${img.alt}`));
  groups.forEach((group) => group.forEach((img) => {
    img.classList.add('is-zoomable');
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-haspopup', 'dialog');
    img.addEventListener('click', () => open(img, group));
    img.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(img, group); } });
  }));
  name();
  new MutationObserver(() => requestAnimationFrame(name)).observe(root, { attributes: true, attributeFilter: ['lang'] });
})();
