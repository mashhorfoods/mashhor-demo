#!/usr/bin/env python3
"""Quiet luxury ("هدوء صامت") — the motion layer's stylesheet half.

Appended to every page's stylesheet (so it ends up in the shared site.css,
which go.html and /admin/ link too). The script half is overlay/assets/
motion.js; finalize.py hashes it and adds it to every page.

  - one rhythm: slower, calmer reveal timings (480 / 900 ms, expo ease-out),
    and a light blur on the site's own reveal — no second reveal system;
  - pages cross-fade into each other (@view-transition), the header stays
    put, and a service card grows into its service page's opening;
  - long-form text and the campaign page surface as they scroll into view,
    bound to the scroll itself (CSS scroll-driven animations, no script);
  - the hero headline rises line by line; primary buttons lean toward the
    pointer; a faint gold light follows the pointer across cards.

All of it is off under prefers-reduced-motion, and browsers without
scroll-driven animations show the text in place.
"""
import pathlib

from common import inject_css, pages

START, END = "/* MOTION:START */", "/* MOTION:END */"
CSS = START + """
@layer tokens{@media (prefers-reduced-motion:no-preference){:root{--duration-base:480ms;--duration-slow:900ms;--reveal-distance:28px}}}
@view-transition{navigation:auto}
@media (prefers-reduced-motion:reduce){@view-transition{navigation:none}}
::view-transition-group(*){animation-duration:560ms;animation-timing-function:cubic-bezier(0.16,1,0.3,1)}
::view-transition-old(root),::view-transition-new(root){animation-duration:420ms}
.c-header{view-transition-name:site-header}
@layer components{
@media (prefers-reduced-motion:no-preference){
.js [data-reveal],.js [data-reveal-group]>*{filter:blur(6px);transition:opacity var(--duration-slow) var(--ease-out),transform var(--duration-slow) var(--ease-out),filter var(--duration-slow) var(--ease-out)}
.js [data-reveal].is-revealed,.js [data-reveal-group].is-revealed>*{filter:none}
.m-line{display:block;overflow:hidden;padding-block-end:0.1em;margin-block-end:-0.1em}
.m-line>span{display:inline-block;animation:m-rise var(--duration-slow) var(--ease-out) both;animation-delay:calc(var(--l,0) * 130ms + 150ms)}
.c-btn--primary,.c-wa-fab{transition:var(--transition-interactive),translate 600ms var(--ease-out)}
}
@keyframes m-rise{from{transform:translateY(135%)}}
.m-lit{background-image:radial-gradient(280px circle at var(--mx,50%) var(--my,50%),rgba(244,209,63,0.09),transparent 70%)}
@supports (animation-timeline:view()){@media (prefers-reduced-motion:no-preference){
.c-prose>*,.c-svc__deal,.c-svc__covers,.c-note,.g-head,.g-project,.g-quote,.g-next,.g-option,.g-trust>*{animation:m-surface linear both;animation-timeline:view();animation-range:entry 0% cover 28%}
}}
@keyframes m-surface{from{opacity:0;transform:translateY(32px);filter:blur(6px)}}
}
""" + END


# The two gold points travelling round the hero's orbit. The supplied site
# rotates them as SVG circles, which costs a style + layout pass on every
# frame for as long as the page is open (~380 ms of main-thread work every
# 5 s on desktop, even scrolled away). As HTML elements turning with `rotate`
# they animate on the compositor instead: same path, same speeds, no main-
# thread work. Positions are in the drawing's 0–100 viewBox, i.e. percent.
SPARKS = [  # (circle as supplied, x, y, diameter, slow)
    ('<circle class="c-orbit__spark" cx="90" cy="48" r="0.9" />', 90, 48, 1.8, False),
    ('<circle class="c-orbit__spark c-orbit__spark--slow" cx="52" cy="22" r="0.7" />', 52, 22, 1.4, True),
]
VIEWER_CSS = """
/* Image viewer (overlay/assets/viewer.js). */
.is-zoomable{cursor:zoom-in}
.is-zoomable:focus-visible{outline:2px solid var(--color-accent);outline-offset:3px}
html.is-viewing{overflow:hidden}
.c-viewer{--v-top:clamp(64px,9vh,96px);--v-side:clamp(12px,7vw,112px);--v-bottom:clamp(132px,18vh,160px);position:fixed;inset:0;inline-size:100%;block-size:100%;max-inline-size:none;max-block-size:none;margin:0;padding:0;border:0;overflow:hidden;background-color:rgba(12,12,12,0.94);color:var(--color-text-primary)}
.c-viewer::backdrop{background-color:rgba(12,12,12,0.5);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.c-viewer__stage{position:absolute;inset:0;display:grid;place-items:center;padding:var(--v-top) var(--v-side) var(--v-bottom);touch-action:none;user-select:none}
.c-viewer.is-zoomed .c-viewer__stage{cursor:grab}
.c-viewer.is-zoomed .c-viewer__stage:active{cursor:grabbing}
.c-viewer__img{display:block;max-inline-size:calc(100vw - var(--v-side) * 2);max-block-size:calc(100dvh - var(--v-top) - var(--v-bottom));object-fit:contain;border-radius:var(--radius-md);box-shadow:0 40px 90px -40px rgba(0,0,0,0.9);transform-origin:center;will-change:transform;-webkit-user-drag:none}
.c-viewer__caption{position:absolute;inset-inline:0;inset-block-end:calc(84px + env(safe-area-inset-bottom));margin:0;padding-inline:var(--space-24);text-align:center;font-size:var(--text-body-sm);color:var(--color-text-secondary);pointer-events:none}
.c-viewer__btn{display:inline-grid;place-items:center;inline-size:48px;block-size:48px;border:var(--border-width) solid rgba(255,255,255,0.18);border-radius:var(--radius-pill);background-color:rgba(24,24,24,0.72);color:var(--color-text-primary);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);cursor:pointer;transition:border-color var(--duration-fast) var(--ease-standard),color var(--duration-fast) var(--ease-standard),opacity var(--duration-fast) var(--ease-standard)}
.c-viewer__btn:hover,.c-viewer__btn:focus-visible{border-color:var(--color-border-accent);color:var(--color-accent)}
.c-viewer__btn:disabled{opacity:0.35;cursor:default}
.c-viewer__btn[hidden]{display:none}
.c-viewer__btn svg{inline-size:20px;block-size:20px}
.c-viewer__close{position:absolute;inset-block-start:calc(16px + env(safe-area-inset-top));inset-inline-end:16px}
.c-viewer__nav{position:absolute;inset-block-start:50%;translate:0 -50%}
.c-viewer__prev{inset-inline-start:16px}
.c-viewer__next{inset-inline-end:16px}
.c-viewer__zoom{position:absolute;inset-block-end:calc(20px + env(safe-area-inset-bottom));inset-inline-start:50%;translate:-50% 0;display:flex;gap:var(--space-12)}
[dir="rtl"] .c-viewer__zoom{translate:50% 0}
@media (max-width:47.99em){.c-viewer__nav{inset-block-start:auto;inset-block-end:calc(20px + env(safe-area-inset-bottom));translate:none}}
"""
SPARK_CSS = """
/* Orbit points (see motion.py SPARKS): turn round the drawing's centre, 52 48. */
.m-spin{display:none}
@media (min-width:48em){
.m-spin{display:block;position:absolute;inset:0;pointer-events:none;transform-origin:52% 48%;animation:orbit-travel 26s linear infinite}
.m-spin--slow{animation-duration:38s;animation-direction:reverse;opacity:0.7}
.m-spin i{position:absolute;left:calc(var(--x) - var(--d) / 2);top:calc(var(--y) - var(--d) / 2);inline-size:var(--d);aspect-ratio:1;border-radius:50%;background-color:var(--color-accent)}
/* The rings are mirrored in Arabic (scaleX(-1) about the centre): so are these. */
[dir="rtl"] .m-spin{transform-origin:48% 48%;animation-direction:reverse}
[dir="rtl"] .m-spin--slow{animation-direction:normal}
[dir="rtl"] .m-spin i{left:calc(100% - var(--x) - var(--d) / 2)}
}
@media (prefers-reduced-motion:reduce){.m-spin{animation:none}}
"""


def sparks(home):
    """The orbit's SVG sparks → compositor-animated HTML (see SPARKS)."""
    spans = []
    for circle, x, y, d, slow in SPARKS:
        if home.count(circle) != 1:
            raise SystemExit(f"motion: orbit spark not found as expected: {circle}")
        home = home.replace(circle, "", 1)
        cls = "m-spin m-spin--slow" if slow else "m-spin"
        spans.append(f'<span class="{cls}" aria-hidden="true"><i style="--x:{x}%;--y:{y}%;--d:{d}%"></i></span>')
    end = home.index("</svg>", home.index('class="c-orbit__rings"')) + len("</svg>")
    return home[:end] + "\n              " + "\n              ".join(spans) + home[end:]


def build(site: pathlib.Path):
    for path in pages(site):
        text = path.read_text(encoding="utf-8")
        # One shared stylesheet for every page, so the spark rules go everywhere.
        new = inject_css(text, CSS + SPARK_CSS + VIEWER_CSS)
        if path.name == "index.html":
            new = sparks(new)
        if new != text:
            path.write_text(new, encoding="utf-8")


if __name__ == "__main__":
    build(pathlib.Path(__file__).resolve().parent.parent / "site")
