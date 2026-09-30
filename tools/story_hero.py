#!/usr/bin/env python3
"""The case study's hero: "One brand, four surfaces", shown.

Beside the story's title, the four things Al Mada received — identity,
website, campaign, profile — laid out together like prints on a table,
each a link down to the chapter that tells it. They rise in one after the
other when the page opens and then drift slowly (not under reduced motion);
a card straightens and lifts under the pointer.

The images are the homepage gallery's tiles (smaller), with the full files
in srcset for sharp screens; the chapters below use the same full files, so
nothing new is downloaded twice. Runs after streamline.py, on story.html;
its CSS goes on every page (finalize.py wants one shared stylesheet).
"""
import pathlib

from common import inject_all, stylesheet

# name, EN, AR, chapter, tile width, full width, width/height
CARDS = [
    ("identity", "Identity", "الهوية", "story-insight", 900, 1400, (900, 600)),
    ("website", "Website", "الموقع", "story-transformation", 900, 1200, (900, 506)),
    ("campaign", "Campaign", "الحملة", "story-impact", 560, 900, (560, 794)),
    ("profile", "Profile", "الملف التعريفي", "story-impact", 560, 1200, (560, 313)),
]

HEAD = '<header class="c-story__head">'
HEAD_END = "</header>"

CSS = stylesheet("story-hero")


def cards():
    out = []
    for i, (name, en, ar, chapter, tile, full, (w, h)) in enumerate(CARDS):
        srcset = f"/assets/al-mada-{name}-tile.webp {tile}w, /assets/al-mada-{name}.webp {full}w"
        out.append(
            f'<a class="c-story-hero__card c-story-hero__card--{name}" href="#{chapter}" style="--i:{i}">'
            f'<img src="/assets/al-mada-{name}-tile.webp" srcset="{srcset}" '
            f'sizes="(min-width: 64em) 36vw, 40vw" width="{w}" height="{h}" alt="" decoding="async" />'
            f'<span class="c-story-hero__label"><span data-lang-copy="en">{en}</span>'
            f'<span data-lang-copy="ar" lang="ar">{ar}</span></span></a>')
    return ("\n        <div class=\"c-story-hero__stage\">\n          "
            + "\n          ".join(out) + "\n        </div>\n      ")


def build(site: pathlib.Path):
    story = site / "story.html"
    text = story.read_text(encoding="utf-8")
    a = text.find(HEAD)
    b = text.find(HEAD_END, a)
    if a < 0 or b < 0:
        raise SystemExit("story_hero: the story's header was not found in story.html")
    text = (text[:a] + '<header class="c-story__head c-story-hero">'
            + text[a + len(HEAD):b].rstrip() + cards() + text[b:])
    story.write_text(text, encoding="utf-8")
    inject_all(site, CSS)


if __name__ == "__main__":
    build(pathlib.Path(__file__).resolve().parent.parent / "site")
