// Shared by the service films (film-*.html): easing, timing and type helpers,
// and the closing invitation every film ends on. A film defines
// window.DURATION, window.CUES (its soundtrack's timeline, music.py) and
// render(t), which draws any instant from scratch, so reel.mjs can step
// through frames and sub-frames and the film is the same every time.
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const p = (t, a, d) => clamp((t - a) / d);
const lerp = (a, b, x) => a + (b - a) * x;
const expoOut = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const expoIn = (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10));
const expoInOut = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2);
const backOut = (x, c = 1.9) => 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
// A spring that settles: overshoots and rings a little, like a stamp landing.
const spring = (x, k = 7) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-k * x) * Math.cos(k * 1.6 * x));
const $ = (id) => document.getElementById(id);
const show = (id, on) => { $(id).style.display = on ? 'block' : 'none'; };
const asset = (f) => `../../overlay/assets/${f}.webp`, src = (f) => `../../source/assets/${f}.webp`;
// A seeded random (mulberry32): the same "random" every render.
const seeded = (s) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let r = Math.imul(s ^ (s >>> 15), 1 | s); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
// The largest size up to `size` at which the element fits `max` px wide
// (measured while shown: a hidden element has no width).
const fit = (el, size, max = 940) => {
  el.style.fontSize = `${size}px`;
  const w = el.scrollWidth;
  if (w > max) el.style.fontSize = `${Math.floor(size * max / w)}px`;
  return el.style.fontSize;
};
// Camera shake after each hit: a few decaying, deterministic wobbles.
const shake = (t, hits, amp = 1) => {
  let x = 0, y = 0, r = 0;
  for (const i of hits) {
    const d = t - i;
    if (d < 0 || d > 0.45) continue;
    const a = Math.exp(-d * 11) * amp;
    x += a * 18 * Math.sin(d * 97); y += a * 15 * Math.sin(d * 131 + 1); r += a * 0.9 * Math.sin(d * 83 + 2);
  }
  return `translate(${x}px,${y}px) rotate(${r}deg)`;
};
const flashAt = (t, hits, peak = 0.3) => Math.max(0, ...hits.map((i) => (t >= i && t < i + 0.08 ? peak * (1 - (t - i) / 0.08) : 0)));
// Image sizes, for cards that take their picture's proportions.
const ratio = (img) => (img.naturalWidth ? img.naturalWidth / img.naturalHeight : 4 / 3);
