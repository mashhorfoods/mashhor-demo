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

from common import inject_css

# name, EN, AR, chapter, tile width, full width, width/height
CARDS = [
    ("identity", "Identity", "الهوية", "story-insight", 900, 1400, (900, 600)),
    ("website", "Website", "الموقع", "story-transformation", 900, 1200, (900, 506)),
    ("campaign", "Campaign", "الحملة", "story-impact", 560, 900, (560, 794)),
    ("profile", "Profile", "الملف التعريفي", "story-impact", 560, 1200, (560, 313)),
]

HEAD = '<header class="c-story__head">'
HEAD_END = "</header>"

CSS = """
/* STORY-HERO */
@media (min-width:64em){
.c-story__head.c-story-hero{max-inline-size:none;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.08fr);grid-template-rows:1fr auto auto auto 1fr;column-gap:var(--space-64);min-block-size:min(calc(100svh - var(--header-height) - var(--section-space) - var(--space-32)),50rem)}
.c-story-hero>:not(.c-story-hero__stage){grid-column:1}
.c-story-hero>:nth-child(1){grid-row:2}
.c-story-hero>:nth-child(2){grid-row:3}
.c-story-hero>:nth-child(3){grid-row:4}
.c-story-hero__stage{grid-column:2;grid-row:1 / -1;align-self:center}}
.c-story-hero__stage{position:relative;aspect-ratio:10 / 9;inline-size:100%;margin-block-start:var(--space-48);isolation:isolate}
@media (min-width:64em){.c-story-hero__stage{margin-block-start:0}}
.c-story-hero__stage::before{content:"";position:absolute;inset:8% 4%;z-index:-1;border-radius:50%;background:radial-gradient(closest-side,rgba(10,79,183,0.34),rgba(10,79,183,0.1) 55%,transparent);filter:blur(24px)}
.c-story-hero__card{position:absolute;display:block;inline-size:var(--w);inset-block-start:var(--y);inset-inline-start:var(--x);z-index:var(--z);rotate:var(--r);border-radius:var(--radius-lg);outline-offset:4px;transition:rotate var(--duration-slow) var(--ease-out),scale var(--duration-slow) var(--ease-out)}
.c-story-hero__card img{display:block;inline-size:100%;block-size:auto;border-radius:inherit;box-shadow:0 1px 0 rgba(255,255,255,0.06) inset,0 28px 60px -22px rgba(0,0,0,0.8),0 0 0 1px rgba(255,255,255,0.07)}
.c-story-hero__label{position:absolute;inset-block-start:var(--space-12);inset-inline-start:var(--space-12);padding:0.3em 0.85em;border-radius:var(--radius-pill);background:rgba(20,20,20,0.72);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:var(--color-text-primary);font-size:var(--text-caption,0.75rem);font-weight:var(--weight-medium,500);letter-spacing:0.02em;opacity:0;translate:0 4px;transition:opacity var(--duration-base) var(--ease-out),translate var(--duration-base) var(--ease-out)}
.c-story-hero__card:is(:hover,:focus-visible){rotate:0deg;scale:1.035;z-index:9}
.c-story-hero__card:is(:hover,:focus-visible) .c-story-hero__label{opacity:1;translate:none}
@media (hover:none){.c-story-hero__label{opacity:1;translate:none}}
.c-story-hero__card--identity{--w:60%;--x:36%;--y:0%;--z:1;--r:3deg}
.c-story-hero__card--website{--w:66%;--x:0%;--y:24%;--z:3;--r:-2.5deg}
.c-story-hero__card--campaign{--w:30%;--x:68%;--y:38%;--z:2;--r:4deg}
.c-story-hero__card--profile{--w:54%;--x:24%;--y:68%;--z:4;--r:-1deg}
@media (prefers-reduced-motion:no-preference){
.c-story-hero__card{animation:story-hero-in 1100ms var(--ease-out) backwards,story-hero-drift 9s ease-in-out infinite alternate;animation-delay:calc(var(--i) * 110ms + 150ms),calc(var(--i) * -2.3s)}
@keyframes story-hero-in{from{opacity:0;scale:0.94;translate:0 36px}}
@keyframes story-hero-drift{from{translate:0 -5px}to{translate:0 5px}}}
/* STORY-HERO:END */
"""


def cards():
    out = []
    for i, (name, en, ar, chapter, tile, full, (w, h)) in enumerate(CARDS):
        srcset = f"/assets/al-mada-{name}-tile.webp {tile}w, /assets/al-mada-{name}.webp {full}w"
        out.append(
            f'<a class="c-story-hero__card c-story-hero__card--{name}" href="#{chapter}" style="--i:{i}">'
            f'<img src="/assets/al-mada-{name}-tile.webp" srcset="{srcset}" '
            f'sizes="(min-width: 64em) 36vw, 70vw" width="{w}" height="{h}" alt="" decoding="async" />'
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
    for page in list(site.glob("*.html")) + list(site.glob("services/*.html")):
        if page.name != "go.html":
            page.write_text(inject_css(page.read_text(encoding="utf-8"), CSS), encoding="utf-8")


if __name__ == "__main__":
    build(pathlib.Path(__file__).resolve().parent.parent / "site")
