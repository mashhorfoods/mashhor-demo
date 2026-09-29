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
  /* 0. Slideshows of work (service pages) -------------------------------- */
  // They work under reduced motion too — arrows, swipe and keys — they just
  // do not advance on their own. Without this script the strip still scrolls.
  document.querySelectorAll('[data-slides]').forEach((box) => {
    const INTERVAL = 4500;
    const track = box.querySelector('.c-slides__track');
    const slides = [...track.children];
    const bar = box.querySelector('[data-slides-bar]');
    const rtl = () => document.documentElement.dir === 'rtl';
    // The slide whose start edge sits nearest the strip's start edge.
    const index = () => {
      const t = track.getBoundingClientRect();
      let best = 0;
      let gap = Infinity;
      slides.forEach((s, i) => {
        const r = s.getBoundingClientRect();
        const d = Math.abs(rtl() ? t.right - r.right : r.left - t.left);
        if (d < gap) { gap = d; best = i; }
      });
      return best;
    };
    const atEnd = () => track.scrollWidth - track.clientWidth - Math.abs(track.scrollLeft) < 4;
    const go = (i) => {
      const t = track.getBoundingClientRect();
      const r = slides[i].getBoundingClientRect();
      track.scrollBy({ left: rtl() ? r.right - t.right : r.left - t.left, behavior: reduce.matches ? 'auto' : 'smooth' });
    };
    const step = (dir) => {
      const i = index();
      if (dir > 0) go(atEnd() ? 0 : Math.min(i + 1, slides.length - 1));
      else go(i === 0 ? slides.length - 1 : i - 1);
    };

    let timer = 0;
    let visible = false;
    let held = false;
    let resume = 0;
    // When every slide already fits, there is nothing to move: no controls.
    let fits = false;
    const measure = () => {
      fits = track.scrollWidth - track.clientWidth < 4;
      bar.hidden = fits;
    };
    const play = () => {
      clearTimeout(timer);
      box.classList.remove('is-playing');
      if (fits || reduce.matches || !visible || held || document.hidden) return;
      void bar.offsetWidth; // restart the progress line
      box.classList.add('is-playing');
      timer = setTimeout(() => { step(1); play(); }, INTERVAL);
    };
    const hold = (ms) => {
      held = true;
      play();
      clearTimeout(resume);
      if (ms) resume = setTimeout(() => { held = false; play(); }, ms);
    };

    box.style.setProperty('--slides-interval', `${INTERVAL}ms`);
    new ResizeObserver(() => { measure(); play(); }).observe(track);
    box.querySelector('[data-slides-prev]').addEventListener('click', () => { step(-1); play(); });
    box.querySelector('[data-slides-next]').addEventListener('click', () => { step(1); play(); });
    track.addEventListener('keydown', (e) => {
      const fwd = rtl() ? 'ArrowLeft' : 'ArrowRight';
      const back = rtl() ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === fwd || e.key === back) { e.preventDefault(); step(e.key === fwd ? 1 : -1); }
    });
    track.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hold(0); });
    track.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { held = false; play(); } });
    track.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') hold(6000); }, { passive: true });
    track.addEventListener('wheel', () => hold(5000), { passive: true });
    box.addEventListener('focusin', () => hold(0));
    box.addEventListener('focusout', (e) => { if (!box.contains(e.relatedTarget)) { held = false; play(); } });
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; play(); }, { threshold: 0.5 }).observe(track);
    document.addEventListener('visibilitychange', play);
  });

  if (reduce.matches) return;

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

  // Everything below waits until the page has painted: none of it is needed
  // for the first view, and its setup should not delay it.
  const later = window.requestIdleCallback ? (fn) => requestIdleCallback(fn, { timeout: 1200 }) : (fn) => setTimeout(fn, 200);
  later(() => {

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
    // The loop runs only while the gallery is on screen and the tab is shown.
    // Size and direction are measured when they change (resize, language
    // switch), never inside the loop, so a frame only writes scrollLeft.
    document.querySelectorAll('.c-gallery').forEach((gallery) => {
      const SPEED = 0.028; // px per ms — about 28 px a second
      let dir = 1;
      let rtl = false;
      let max = 0;
      let visible = false;
      let heldUntil = 0;
      let last = 0;
      let raf = 0;
      // Position kept as a float: browsers round scrollLeft, and a slow glide
      // made of sub-pixel steps would otherwise never move. RTL scrolls from 0
      // towards -max, LTR from 0 towards +max; the glide runs in reading order
      // and turns back at each end after a pause.
      let pos = null;

      const measure = () => {
        rtl = document.documentElement.dir === 'rtl';
        max = gallery.scrollWidth - gallery.clientWidth;
        pos = null;
      };
      const hold = (ms) => { heldUntil = performance.now() + ms; };
      // The gallery snaps to each piece when a person scrolls it; snapping
      // would pull every small glide step back, so it is off while gliding.
      // Switched once per glide, not per frame (a style write per frame costs
      // a style pass per frame).
      let gliding = false;
      const release = () => {
        pos = null;
        if (gliding) { gallery.style.scrollSnapType = ''; gliding = false; }
      };
      const step = (now) => {
        raf = 0;
        if (!visible || document.hidden) { release(); return; }
        const dt = last ? Math.min(now - last, 50) : 0;
        last = now;
        if (now > heldUntil && max > 4) {
          const lo = rtl ? -max : 0;
          const hi = rtl ? 0 : max;
          if (pos === null || Math.abs(pos - gallery.scrollLeft) > 2) pos = gallery.scrollLeft;
          pos += dir * SPEED * dt;
          if (pos >= hi) { pos = hi; dir = -1; hold(1800); }
          if (pos <= lo) { pos = lo; dir = 1; hold(1800); }
          if (!gliding) { gallery.style.scrollSnapType = 'none'; gliding = true; }
          gallery.scrollLeft = pos;
        } else {
          release();
        }
        raf = requestAnimationFrame(step);
      };
      const start = () => { if (!raf && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(step); } };

      ['pointerenter', 'pointerdown', 'focusin', 'wheel', 'touchstart', 'keydown'].forEach((type) => {
        gallery.addEventListener(type, () => hold(type === 'pointerenter' || type === 'focusin' ? 1e9 : 4000), { passive: true });
      });
      ['pointerleave', 'focusout'].forEach((type) => gallery.addEventListener(type, () => hold(1500), { passive: true }));
      new ResizeObserver(measure).observe(gallery);
      new MutationObserver(measure).observe(document.documentElement, { attributes: true, attributeFilter: ['dir'] });
      new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; start(); }, { threshold: 0.35 }).observe(gallery);
      document.addEventListener('visibilitychange', start);
      measure();
      dir = rtl ? -1 : 1;
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

    document.documentElement.dataset.motion = 'ready';
  });
})();
