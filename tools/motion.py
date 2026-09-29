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

from common import inject_css, pages, stylesheet

CSS = stylesheet("motion")


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
VIEWER_CSS = stylesheet("viewer")
SPARK_CSS = stylesheet("sparks")


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
