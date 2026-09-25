/* SIGNATURE TRANSITION — the "1 + route" motion mark from 10-motion.css's existing static graphic language
   (.u-mark/.u-route), staged as a brief arrival cue on a major section's own entry into the
   viewport. One shared IntersectionObserver, not a scroll listener: each .c-signature gets .is-visible added the
   first time it crosses the threshold, then is unobserved — an arrival, once, never a repeating scroll gimmick.
   Decorative only (the markup itself carries aria-hidden), so a slow network or JS failure never hides the real
   section title it sits beside — see index.html's .c-signature blocks for the markup this expects. */
import { qsa } from '../core/dom.js';

export function initSignatureMarks(root = document) {
  const marks = qsa('.c-signature', root);
  if (!marks.length) return;
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    marks.forEach((m) => m.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.4 });
  marks.forEach((m) => observer.observe(m));
}
