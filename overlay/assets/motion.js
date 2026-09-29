/* =============================================================================
   Quiet luxury — the motion layer ("هدوء صامت").

   One rhythm for the whole site (the tokens live in the MOTION block of the
   shared stylesheet); this file only adds what CSS cannot do alone:

     1. the hero headline rises line by line;
     2. primary buttons lean toward the pointer (fine pointers only);
     3. a faint gold light follows the pointer across cards;
     4. galleries glide on their own, slowly, and stop the moment a person
        touches, hovers, focuses or scrolls them;
     5. running totals in the package builder count to their new value.

   Page-to-page transitions are pure CSS (@view-transition). Everything here
   is skipped under prefers-reduced-motion, and nothing is hidden waiting for
   it: without this file every page is complete and still.
   ============================================================================= */
(() => {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(pointer: fine)');
  if (reduce.matches) return;
  const root = document.documentElement;

  /* 1. Hero headline, line by line --------------------------------------- */
  function splitLines(el) {
    if (el.dataset.mLines) return;
    el.dataset.mLines = '';
    const targets = el.querySelectorAll('[data-lang-copy]').length ? el.querySelectorAll('[data-lang-copy]') : [el];
    targets.forEach((part) => {
      // Only plain <br>: a <br class="…"> is a responsive break inside a line.
      const lines = part.innerHTML.split(/<br\s*\/?>/i).map((l) => l.trim()).filter(Boolean);
      part.innerHTML = lines.map((l, i) => `<span class="m-line" style="--l:${i}"><span>${l}</span></span>`).join('');
    });
  }
  document.querySelectorAll('.c-hero__headline').forEach(splitLines);

  /* 2. Magnetic primary buttons ------------------------------------------ */
  if (fine.matches) {
    document.querySelectorAll('.c-btn--primary, .c-wa-fab').forEach((btn) => {
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.18;
        const y = (e.clientY - r.top - r.height / 2) * 0.3;
        btn.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.translate = ''; });
    });
  }

  /* 3. Light that follows the pointer ------------------------------------ */
  if (fine.matches) {
    const GLOW = '.c-svc-card__link, .c-tier, .c-bento__link, .c-addon, .c-index__link, .g-option, .g-project__frame, .a-lead';
    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest?.(GLOW);
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
      card.classList.add('m-lit');
    }, { passive: true });
    document.addEventListener('pointerout', (e) => {
      const card = e.target.closest?.(GLOW);
      if (card && !card.contains(e.relatedTarget)) card.classList.remove('m-lit');
    }, { passive: true });
  }

  /* 4. Galleries that glide on their own --------------------------------- */
  document.querySelectorAll('.c-gallery').forEach((gallery) => {
    let dir = getComputedStyle(gallery).direction === 'rtl' ? -1 : 1;
    let visible = false;
    let heldUntil = 0;
    let last = 0;
    const SPEED = 0.028; // px per ms — about 28 px a second
    const hold = (ms) => { heldUntil = performance.now() + ms; };
    ['pointerenter', 'pointerdown', 'focusin', 'wheel', 'touchstart', 'keydown'].forEach((type) => {
      gallery.addEventListener(type, () => hold(type === 'pointerenter' || type === 'focusin' ? 1e9 : 4000), { passive: true });
    });
    ['pointerleave', 'focusout'].forEach((type) => gallery.addEventListener(type, () => hold(1500), { passive: true }));
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0.35 }).observe(gallery);

    // Position kept as a float: browsers round scrollLeft, and a slow glide
    // made of sub-pixel steps would otherwise never move. RTL scrolls from 0
    // towards -max, LTR from 0 towards +max; the glide runs in reading order
    // and turns back at each end after a pause.
    let pos = null;
    const step = (now) => {
      const dt = last ? Math.min(now - last, 50) : 0;
      last = now;
      const max = gallery.scrollWidth - gallery.clientWidth;
      if (visible && now > heldUntil && !document.hidden && max > 4) {
        const rtl = getComputedStyle(gallery).direction === 'rtl';
        const lo = rtl ? -max : 0;
        const hi = rtl ? 0 : max;
        if (pos === null || Math.abs(pos - gallery.scrollLeft) > 2) pos = gallery.scrollLeft;
        pos += dir * SPEED * dt;
        if (pos >= hi) { pos = hi; dir = -1; hold(1800); }
        if (pos <= lo) { pos = lo; dir = 1; hold(1800); }
        // The gallery snaps to each piece when a person scrolls it; snapping
        // would pull every small glide step back, so it is off while gliding.
        gallery.style.scrollSnapType = 'none';
        gallery.scrollLeft = pos;
      } else {
        pos = null;
        if (gallery.style.scrollSnapType) gallery.style.scrollSnapType = '';
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  /* 5. Totals that count to their new value ------------------------------ */
  document.querySelectorAll('[data-build-once-amount], [data-build-monthly-amount]').forEach((el) => {
    let shown = Number(el.textContent.replace(/[^\d.]/g, '')) || 0;
    let writing = false;
    new MutationObserver(() => {
      if (writing) return;
      const target = Number(el.textContent.replace(/[^\d.]/g, '')) || 0;
      if (target === shown) return;
      const from = shown;
      const start = performance.now();
      const fmt = (n) => Math.round(n).toLocaleString('en-US');
      const tick = (now) => {
        const t = Math.min((now - start) / 480, 1);
        const v = from + (target - from) * (1 - (1 - t) ** 4);
        writing = true;
        el.textContent = fmt(v);
        writing = false;
        if (t < 1) requestAnimationFrame(tick);
      };
      shown = target;
      requestAnimationFrame(tick);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
})();
