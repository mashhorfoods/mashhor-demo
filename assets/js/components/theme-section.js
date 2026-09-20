/* ============================================================================
   THEME SECTION — section-based dark mode scroll transition.

   mountThemeSections() scans the page once for every
   .c-theme-section[data-theme="dark"] and drives its --dark custom
   property (25-theme-section.css) continuously off the section's own
   position in the viewport, so the section reads as one continuous dark
   "chapter" rather than a hard theme switch. A future section only needs
   the class + attribute in its markup — never new JavaScript (brief §20).
   Nothing here ever touches document.body or any other section (§17).

   Called once from page.js's mountPage() (like boot()'s initAccordions()
   etc.) — the target section is static markup that survives a locale
   change, so there is nothing to re-mount there. The header is looked up
   fresh on every scroll update rather than captured once, since
   mountHeader() replaces the .c-gh element on every locale change.
   ========================================================================= */

import { qs, qsa } from '../core/dom.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/* 0 while the section is off-screen either side, 1 once it is centred
   enough to read as fully dark — recomputed every call from the section's
   OWN current rect, so it stays correct across any height/content/viewport
   change (§6) with no stored "starting" measurement to go stale. */
function darkProgress(rect, viewportH) {
  const transition = Math.max(1, Math.min(viewportH * 0.5, rect.height / 3));
  const enter = clamp((viewportH - rect.top) / transition, 0, 1);
  const exit = clamp(rect.bottom / transition, 0, 1);
  return Math.min(enter, exit);
}

/** Only ever moves the header between 'solid' and 'dark' — an active
    'transparent' hero state (header.js trackHero()) is never touched. */
function applyHeader(section, value) {
  const header = qs('.c-gh', document);
  if (!header) return;
  const rect = section.getBoundingClientRect();
  const overHeader = value >= 0.5 && rect.top < header.offsetHeight && rect.bottom > 0;
  if (overHeader) { if (header.dataset.surface !== 'transparent') header.dataset.surface = 'dark'; }
  else if (header.dataset.surface === 'dark') header.dataset.surface = 'solid';
}

function watchSection(section) {
  const setDark = (v) => section.style.setProperty('--dark', v);

  // prefers-reduced-motion (§9): a boolean IntersectionObserver state
  // instead of a continuous scroll-driven one — no rAF loop at all, and
  // the section's own short CSS transition (25-theme-section.css) is the
  // only motion left, never a long scroll-linked fade.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    new IntersectionObserver(([entry]) => {
      const v = entry.isIntersecting ? 1 : 0;
      setDark(v);
      applyHeader(section, v);
    }, { threshold: 0.15 }).observe(section);
    return;
  }

  let ticking = false;
  const update = () => {
    ticking = false;
    const v = darkProgress(section.getBoundingClientRect(), window.innerHeight);
    setDark(v.toFixed(3));
    applyHeader(section, v);
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };
  // Gate (§8): the scroll listener only exists while the section is
  // anywhere near the viewport, not for the page's whole lifetime.
  let watching = false;
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !watching) {
      watching = true;
      window.addEventListener('scroll', onScroll, { passive: true });
      update();
    } else if (!entry.isIntersecting && watching) {
      watching = false;
      window.removeEventListener('scroll', onScroll);
    }
  }, { rootMargin: '50% 0px 50% 0px', threshold: 0 }).observe(section);
}

/** A page with no dark-theme section costs nothing — the selector simply
    matches zero elements. */
export function mountThemeSections({ root = document } = {}) {
  qsa('.c-theme-section[data-theme="dark"]', root).forEach(watchSection);
}
