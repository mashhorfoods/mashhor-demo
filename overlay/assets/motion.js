/* =============================================================================
   Quiet luxury — the motion layer ("هدوء صامت").

   One rhythm for the whole site (the tokens live in the MOTION block of the
   shared stylesheet); this file only adds what CSS cannot do alone:

     1. the hero headline rises line by line;
     2. primary buttons lean toward the pointer (fine pointers only);
     3. a faint gold light follows the pointer across cards;
     4. galleries glide on their own, slowly, and stop the moment a person
        touches, hovers, focuses or scrolls them;
     5. running totals in the package builder count to their new value;
     0b. on touch screens, reveals start just before content arrives;
     6. the phones' floating WhatsApp button steps aside where WhatsApp (or
        the hero's own button) is already on screen (runs under reduced
        motion too).

   Page-to-page transitions are pure CSS (@view-transition). Everything here
   is skipped under prefers-reduced-motion, and nothing is hidden waiting for
   it: without this file every page is complete and still.
   ============================================================================= */
(() => {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(pointer: fine)');
  /* Real interaction, shared by the slideshows and the galleries --------- */
  // What pauses a moving strip is a person reaching for it: a sideways wheel
  // or trackpad swipe, a mouse that actually moves over it, keyboard focus.
  // Scrolling the page past it is none of these — a vertical wheel over it,
  // or the page carrying it under a still cursor, must not stop it.
  // (A finger or trackpad dragging the strip itself is caught by each
  // strip from its own scroll position.)
  // Where the cursor last was on screen: the page scrolling under a still
  // cursor fires pointer events at the same screen point; a hand does not.
  let cursorX = null;
  let cursorY = null;
  document.addEventListener('pointermove', (e) => { cursorX = e.clientX; cursorY = e.clientY; }, { passive: true });
  // The image viewer (viewer.js) is open: nothing behind it moves.
  const viewing = () => document.documentElement.classList.contains('is-viewing');
  const reachFor = (el, pause, resume) => {
    el.addEventListener('wheel', (e) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) pause(4000); }, { passive: true });
    let hovering = false;
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || hovering || (e.clientX === cursorX && e.clientY === cursorY)) return;
      hovering = true;
      pause();
    }, { passive: true });
    el.addEventListener('pointerleave', () => { if (hovering) { hovering = false; resume(); } });
    el.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) pause(); });
    el.addEventListener('focusout', (e) => { if (!el.contains(e.relatedTarget)) resume(); });
  };

  /* 0. Slideshows of work (service pages) -------------------------------- */
  // They work under reduced motion too — arrows, swipe and keys — they just
  // do not advance on their own. Without this script the strip still scrolls.
  document.querySelectorAll('[data-slides]').forEach((box) => {
    const FIRST = 1200; // the first step comes soon after it scrolls into view
    const INTERVAL = 4000;
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
    let movedAt = 0; // when this script last moved the strip
    const go = (i) => {
      const t = track.getBoundingClientRect();
      const r = slides[i].getBoundingClientRect();
      movedAt = performance.now();
      track.scrollBy({ left: rtl() ? r.right - t.right : r.left - t.left, behavior: reduce.matches ? 'auto' : 'smooth' });
    };
    const step = (dir) => {
      const i = index();
      if (dir > 0) go(atEnd() ? 0 : Math.min(i + 1, slides.length - 1));
      else go(i === 0 ? slides.length - 1 : i - 1);
    };

    let timer = 0;
    let visible = false;
    let paused = false;
    let resumeAt = 0;
    // When every slide already fits, there is nothing to move: no controls.
    let fits = null;
    // Schedule the next step in `delay` ms (the progress line fills over it),
    // or stop when it should not move.
    const run = (delay = INTERVAL) => {
      clearTimeout(timer);
      box.classList.remove('is-playing');
      if (fits || reduce.matches || !visible || paused || document.hidden || viewing()) return;
      box.style.setProperty('--slides-interval', `${delay}ms`);
      void bar.offsetWidth; // restart the progress line
      box.classList.add('is-playing');
      timer = setTimeout(() => { step(1); run(); }, delay);
    };
    const resume = () => { clearTimeout(resumeAt); paused = false; run(FIRST); };
    const pause = (ms) => {
      paused = true;
      run();
      clearTimeout(resumeAt);
      if (ms) resumeAt = setTimeout(resume, ms);
    };

    new ResizeObserver(() => {
      const was = fits;
      fits = track.scrollWidth - track.clientWidth < 4;
      bar.hidden = fits;
      if (fits !== was) run(FIRST);
    }).observe(track);
    box.querySelector('[data-slides-prev]').addEventListener('click', () => { step(-1); run(); });
    box.querySelector('[data-slides-next]').addEventListener('click', () => { step(1); run(); });
    track.addEventListener('keydown', (e) => {
      const fwd = rtl() ? 'ArrowLeft' : 'ArrowRight';
      const back = rtl() ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === fwd || e.key === back) { e.preventDefault(); step(e.key === fwd ? 1 : -1); run(); }
    });
    reachFor(box, pause, resume);
    // A sideways scroll this script did not start is a person swiping it.
    track.addEventListener('scroll', () => { if (performance.now() - movedAt > 900) pause(5000); }, { passive: true });
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting === visible) return;
      visible = entry.isIntersecting;
      run(FIRST);
    }, { threshold: 0.25 }).observe(track);
    document.addEventListener('visibilitychange', () => run(FIRST));
    document.addEventListener('viewerclose', () => run(FIRST));
  });

  /* The floating WhatsApp button steps aside ------------------------------ */
  // Where WhatsApp is already on screen — the contact section, the footer,
  // the About hero, a service's price box — the phones' floating button would
  // only cover the text beneath it; over the homepage hero it would sit on
  // the main button. It arrives once the visitor moves past these.
  const fab = document.querySelector('.c-wa-fab');
  const covered = [...document.querySelectorAll('#contact, .c-footer, #home.c-hero, .c-about-hero, .c-svc__deal')];
  if (fab && covered.length && 'IntersectionObserver' in window) {
    // Its first place is set at once, without the fade: it must not appear
    // over the hero on arrival only to fade away.
    const inView = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight * 0.85; };
    fab.classList.add('is-instant');
    fab.classList.toggle('is-aside', covered.some(inView));
    requestAnimationFrame(() => requestAnimationFrame(() => fab.classList.remove('is-instant')));
    const onScreen = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? onScreen.add(e.target) : onScreen.delete(e.target)));
      fab.classList.toggle('is-aside', onScreen.size > 0);
    }, { rootMargin: '0px 0px -15% 0px' });
    covered.forEach((el) => io.observe(el));
  }

  if (reduce.matches) return;

  /* 0b. Reveals start before the fold on touch screens -------------------- */
  // The site reveals a block once it is 8% inside the screen, which on a
  // phone flick leaves the arriving content blank. On touch screens it
  // starts just before the block arrives (the transition itself is shorter
  // there, in the MOTION block of the stylesheet); the site's own observer
  // still runs and finds it done.
  if (window.matchMedia('(pointer: coarse)').matches && 'IntersectionObserver' in window) {
    const early = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-revealed');
      early.unobserve(e.target);
    }), { rootMargin: '0px 0px 12% 0px' });
    document.querySelectorAll('[data-reveal]:not(.is-revealed), [data-reveal-group]:not(.is-revealed)').forEach((el) => early.observe(el));
  }

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
        if (viewing()) { release(); return; } // resumes on 'viewerclose'
        const dt = last ? Math.min(now - last, 50) : 0;
        last = now;
        if (now > heldUntil && max > 4) {
          const lo = rtl ? -max : 0;
          const hi = rtl ? 0 : max;
          // Moved by someone else (a finger, a trackpad): let them, then carry on.
          if (pos !== null && Math.abs(pos - gallery.scrollLeft) > 2) { pos = null; hold(4000); raf = requestAnimationFrame(step); return; }
          if (pos === null) pos = gallery.scrollLeft;
          pos += dir * SPEED * dt;
          // Turn back at an end — only on arriving there, so a gallery that
          // starts at one end sets off at once instead of pausing first.
          if (dir > 0 && pos >= hi) { pos = hi; dir = -1; hold(1800); }
          if (dir < 0 && pos <= lo) { pos = lo; dir = 1; hold(1800); }
          if (!gliding) { gallery.style.scrollSnapType = 'none'; gliding = true; }
          gallery.scrollLeft = pos;
        } else {
          release();
        }
        raf = requestAnimationFrame(step);
      };
      const start = () => { if (!raf && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(step); } };

      reachFor(gallery, (ms) => hold(ms || 1e9), () => hold(600));
      gallery.addEventListener('keydown', () => hold(4000));
      new ResizeObserver(measure).observe(gallery);
      new MutationObserver(measure).observe(document.documentElement, { attributes: true, attributeFilter: ['dir'] });
      new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; start(); }, { threshold: 0.2 }).observe(gallery);
      document.addEventListener('visibilitychange', start);
      document.addEventListener('viewerclose', start);
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

    /* 6. Rails: the services, sideways --------------------------------------- */
    // Buttons step a card at a time, the gold line fills with what has been
    // seen, and a mouse can drag the rail (a finger or trackpad already can).
    // Without this script the rail still scrolls; the bar stays hidden.
    document.querySelectorAll('[data-rail]').forEach((rail) => {
      const track = rail.querySelector('[data-rail-track]');
      const bar = rail.querySelector('[data-rail-bar]');
      const prev = rail.querySelector('[data-rail-prev]');
      const next = rail.querySelector('[data-rail-next]');
      const fill = bar.querySelector('.c-rail__progress i');
      const rtl = () => getComputedStyle(track).direction === 'rtl';
      const step = () => {
        const card = track.firstElementChild;
        return card ? card.getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 0) : track.clientWidth * 0.8;
      };
      const update = () => {
        const max = track.scrollWidth - track.clientWidth;
        const at = Math.abs(track.scrollLeft);
        bar.hidden = max < 2;
        fill.style.setProperty('--seen', max < 2 ? 1 : ((at + track.clientWidth) / track.scrollWidth).toFixed(3));
        prev.disabled = at < 2;
        next.disabled = at > max - 2;
      };
      const go = (dir) => track.scrollBy({ left: dir * step() * (rtl() ? -1 : 1), behavior: reduce.matches ? 'auto' : 'smooth' });
      prev.addEventListener('click', () => go(-1));
      next.addEventListener('click', () => go(1));
      track.addEventListener('scroll', update, { passive: true });
      addEventListener('resize', update);
      new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ['dir', 'lang'] });
      // A rail can open on a chosen card (a service page's recommended
      // package): centred at once, before anyone has reached the rail.
      const opening = track.querySelector('[data-rail-start]');
      if (opening && track.scrollWidth - track.clientWidth > 2 && track.getBoundingClientRect().top > innerHeight) {
        const t = track.getBoundingClientRect();
        const r = opening.getBoundingClientRect();
        track.scrollLeft += (r.left + r.width / 2) - (t.left + t.width / 2);
      }
      update();
      if (!fine.matches) return;
      let x0 = null;
      let s0 = 0;
      let dragged = false;
      track.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        x0 = e.clientX;
        s0 = track.scrollLeft;
        dragged = false;
      });
      addEventListener('pointermove', (e) => {
        if (x0 === null) return;
        const dx = e.clientX - x0;
        if (!dragged && Math.abs(dx) > 6) { dragged = true; track.classList.add('is-dragging'); }
        if (dragged) track.scrollLeft = s0 - dx;
      });
      addEventListener('pointerup', () => {
        if (x0 === null) return;
        x0 = null;
        // Snapping comes back on, and the rail settles on the nearest card.
        if (dragged) requestAnimationFrame(() => track.classList.remove('is-dragging'));
      });
      // A drag is not a click on the card it ended over.
      track.addEventListener('click', (e) => { if (dragged) { e.preventDefault(); dragged = false; } }, true);
      track.addEventListener('dragstart', (e) => e.preventDefault());
    });

    document.documentElement.dataset.motion = 'ready';
  });
})();
