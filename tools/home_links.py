#!/usr/bin/env python3
"""The homepage's two doors: the case studies and About.

A section after the portfolio: two large link cards, each with a preview of
what is behind it. The case studies' is the studies' own covers laid out as
prints (the Al Mada story first), which fan out under the pointer or on
focus; About's is the team photograph, which comes closer. Each card also
holds a line of what the page covers, shown on arrival under the pointer (and
always on touch screens, which have no hover). The whole card is the link.

Runs after cases.py (the covers are the studies' current ones); the CSS
(tools/css/home-links.css) goes on every page, like every step's.
"""
import pathlib

from build_services import ARROW, bi
from cases import CASES, cover_name
from common import inject_all, stylesheet

ANCHOR = '<section class="l-section c-challenge"'

CSS = stylesheet("home-links")


def prints():
    images = [("al-mada-identity-tile.webp", 900, 600)] + [(f"{cover_name(c['slug'])}-800.webp", 800, 500) for c in CASES[:3]]
    return "".join(
        f'<span class="c-door__print c-door__print--{i}"><img src="/assets/{src}" alt="" width="{w}" height="{h}" loading="lazy" decoding="async" /></span>'
        for i, (src, w, h) in enumerate(images, 1))


def chips(items):
    return "".join(f'<span class="c-door__chip">{bi(en, ar)}</span>' for en, ar in items)


def section():
    studies = [(c["category"][0], c["category"][1]) for c in CASES]
    about = [("One team, one standard", "فريق واحد ومعيار واحد"), ("Arabic &amp; English", "عربي وإنجليزي"),
             ("A reply within two working hours", "ردّ خلال ساعتين في أوقات العمل")]
    return f'''<section class="l-section c-doors" aria-labelledby="doors-title">
        <div class="l-container">
          <header class="c-doors__head" data-reveal-group>
            <p class="t-label c-services__eyebrow">{bi("Before you decide", "قبل أن تقرّر")}</p>
            <h2 class="c-services__headline" id="doors-title">{bi('See the work.<br /><span class="c-services__accent">Meet the team.</span>', 'شاهد العمل.<br /><span class="c-services__accent">وتعرّف على الفريق.</span>')}</h2>
          </header>
          <ul class="c-doors__list" role="list" data-reveal-group>
            <li>
              <a class="c-door c-door--work" href="/work">
                <span class="c-door__stage" aria-hidden="true">{prints()}</span>
                <span class="c-door__body">
                  <span class="c-door__eyebrow">{bi("Case studies", "دراسات الحالة")}</span>
                  <span class="c-door__title">{bi("Work that had to hold up, and how it was made.", "أعمال صُمّمت لتصمد، وهكذا صُنعت.")}</span>
                  <span class="c-door__peek">{chips(studies)}</span>
                  <span class="c-door__go">{bi("Read the case studies", "اقرأ دراسات الحالة")}{ARROW}</span>
                </span>
              </a>
            </li>
            <li>
              <a class="c-door c-door--about" href="/about">
                <span class="c-door__stage" aria-hidden="true"><img src="/assets/about-team-640.webp" srcset="/assets/about-team-640.webp 640w, /assets/about-team-1280.webp 1280w" sizes="(min-width: 48em) 46vw, 92vw" alt="" width="1280" height="720" loading="lazy" decoding="async" /></span>
                <span class="c-door__body">
                  <span class="c-door__eyebrow">{bi("About Pixora", "عن بيكسورا")}</span>
                  <span class="c-door__title">{bi("One team for your whole brand.", "فريق واحد لعلامتك كاملة.")}</span>
                  <span class="c-door__peek">{chips(about)}</span>
                  <span class="c-door__go">{bi("Meet the team", "تعرّف على الفريق")}{ARROW}</span>
                </span>
              </a>
            </li>
          </ul>
        </div>
      </section>
      '''


def build(site: pathlib.Path):
    home = site / "index.html"
    text = home.read_text(encoding="utf-8")
    if ANCHOR not in text:
        raise SystemExit("home_links: the homepage's challenge section was not found")
    home.write_text(text.replace(ANCHOR, section() + ANCHOR, 1), encoding="utf-8")
    inject_all(site, CSS)


if __name__ == "__main__":
    build(pathlib.Path(__file__).resolve().parent.parent / "site")
