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

from common import inject_css

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
    for path in list(site.glob("*.html")) + list(site.glob("services/*.html")):
        if path.name == "go.html":
            continue
        text = path.read_text(encoding="utf-8")
        # One shared stylesheet for every page, so the spark rules go everywhere.
        new = inject_css(text, CSS + SPARK_CSS)
        if path.name == "index.html":
            new = sparks(new)
        if new != text:
            path.write_text(new, encoding="utf-8")


if __name__ == "__main__":
    build(pathlib.Path(__file__).resolve().parent.parent / "site")
