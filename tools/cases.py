#!/usr/bin/env python3
"""Case studies: a hub at /work and one page per study at /work/<slug>.

The studies (from the portfolio the owner supplied, rewritten in Pixora's
voice — the team, never one person — and in both languages): CASES below
has what the hub shows, tools/case_stories.py the pages; Al Mada, told at length on /story, leads the hub. Every page is built
on the pricing page's shell (head, header, verification band, footer,
script), like the service pages, so it is one of the site's own pages.

  Hub   a filter by discipline (radio buttons and :has(), no script), the
        featured study, then a card per study; each cover carries a
        view-transition name, so a card grows into its page.
  Page  told like the Al Mada story, in the story's own markup and styles:
        the headline beside four pieces of the work laid out as prints, five
        chapters (annotation, headline, lead, aside, a self-drawing sketch,
        the work) joined by its thread, a closing line — then the next and
        previous studies and a call to action. A piece of work is its image
        once case-<slug>-<piece>.webp is in the assets, a placeholder in its
        proportions until then.

Covers are drawn from the identity (tools/share-cards/case-cover.html,
rendered by render.mjs, encoded by `python3 tools/images.py cases`). Runs
after about_page.py and before refinements.py; the CSS (tools/css/cases.css)
goes on every page.
"""
import pathlib
import re

from build_services import RAIL_BAR, bi
from case_stories import ICONS, STORIES, sketch
from common import inject_all, pages, stylesheet

URL = "https://zaokalyamamah.online"
ARROW = ('<svg class="c-btn__icon u-flip-rtl" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
         '<path d="M5 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" /></svg>')

KINDS = [  # filter id, EN, AR
    ("branding", "Branding", "الهوية"),
    ("editorial", "Editorial", "التحريري"),
    ("information", "Information", "المعلومات"),
    ("digital", "Digital", "الرقمي"),
]

SECTIONS = [  # id, EN, AR
    ("overview", "Overview", "نظرة عامة"),
    ("challenge", "The challenge", "التحدي"),
    ("did", "What we did", "ما قمنا به"),
    ("process", "How it ran", "كيف سار العمل"),
    ("decisions", "Key decisions", "قرارات مفصلية"),
    ("outcome", "The outcome", "النتيجة"),
    ("impact", "The impact", "الأثر"),
]

# Al Mada: told on /story; on the hub it leads.
FEATURED = {
    "href": "/story",
    "img": "al-mada-identity-tile.webp", "w": 900, "h": 600, "full": "al-mada-identity.webp", "full_w": 1400,
    "kinds": "branding digital",
    "category": ("Case study · Al Mada Travel &amp; Tourism", "دراسة حالة · المدى للسفر والسياحة"),
    "title": ("One brand, four surfaces.", "هوية واحدة، أربع واجهات."),
    "summary": ("Identity, website, campaign and company profile — one partner, one standard, from the first sketch to the last poster.",
                "هوية وموقع وحملة وملف تعريفي — شريك واحد ومعيار واحد، من أول رسمة حتى آخر ملصق."),
    "pieces": [("Identity", "الهوية"), ("Website", "الموقع"), ("Campaign", "الحملة"), ("Company profile", "الملف التعريفي")],
}

# The studies, in the order /work shows them. Each card's words (category,
# title, summary) are in content/studies/<slug>.json, with the study's own.
CASES = [{"slug": slug, "kinds": kinds, **STORIES[slug]["card"]} for slug, kinds in [
    ("brand-identity-systems", "branding"),
    ("editorial-publication-design", "editorial"),
    ("information-design", "information"),
    ("digital-campaigns", "digital"),
]]


def plain(html):
    return re.sub(r"<[^>]+>", "", html).replace("&amp;", "&")


ASSETS = pathlib.Path(__file__).resolve().parent.parent / "overlay" / "assets"


def cover_name(slug):
    """A study's cover: its first piece of work once that is real, else its drawn cover."""
    first = f"case-{slug}-{STORIES[slug]['hero'][0]}"
    return first if (ASSETS / f"{first}.webp").exists() else f"case-{slug}"


def cover(slug, lazy=True, sizes="(min-width: 64em) 40rem, 100vw"):
    load = 'loading="lazy"' if lazy else 'fetchpriority="high"'
    name = cover_name(slug)
    return (f'<img src="/assets/{name}.webp" srcset="/assets/{name}-800.webp 800w, /assets/{name}.webp 1600w" '
            f'sizes="{sizes}" alt="" width="1600" height="1000" {load} decoding="async" />')


def inside(pieces, chapters=None, shown=3):
    """What a card's study holds: its first pieces by name, then how much more."""
    chips = "".join(f'<span class="c-case-card__piece">{bi(en, ar)}</span>' for en, ar in pieces[:shown])
    if len(pieces) > shown:
        chips += f'<span class="c-case-card__piece c-case-card__piece--more">+{len(pieces) - shown}<span class="u-visually-hidden">{bi(" more", " أخرى")}</span></span>'
    n = len(pieces)
    meta = bi(f"{n} pieces of work", f"{n} {'قطع' if n <= 10 else 'قطعة'} من العمل")
    if chapters:
        meta += " · " + bi(f"{chapters} chapters", f"{chapters} فصول")
    return (f'<span class="c-case-card__meta">{meta}</span>'
            f'<span class="c-case-card__pieces">{chips}</span>')


def card(c, wide=False):
    extra = " c-case-card--wide" if wide else ""
    story = STORIES[c["slug"]]
    pieces = [label for label, _, _ in story["pieces"].values()]
    return f'''            <li class="c-case-card{extra}" data-kinds="{c["kinds"]}">
              <a class="c-case-card__link" href="/work/{c["slug"]}">
                <span class="c-case-card__media" style="view-transition-name: case-{c["slug"]}">{cover(c["slug"])}</span>
                <span class="c-case-card__kind">{bi(*c["category"])}</span>
                <span class="c-case-card__title">{bi(*c["title"])}</span>
                <span class="c-case-card__summary">{bi(*c["summary"])}</span>
                {inside(pieces, len(story["chapters"]))}
                <span class="c-case-card__go">{bi("Read the case study", "اقرأ دراسة الحالة")}{ARROW}</span>
              </a>
            </li>'''


def story_card():
    """Al Mada's story as an ordinary card, for the rail at the end of each study."""
    f = FEATURED
    return f'''            <li class="c-case-card" data-kinds="{f["kinds"]}">
              <a class="c-case-card__link" href="{f["href"]}">
                <span class="c-case-card__media"><img src="/assets/{f["img"]}" srcset="/assets/{f["img"]} {f["w"]}w, /assets/{f["full"]} {f["full_w"]}w" sizes="(min-width: 64em) 30rem, 85vw" alt="" width="{f["w"]}" height="{f["h"]}" loading="lazy" decoding="async" /></span>
                <span class="c-case-card__kind">{bi(*f["category"])}</span>
                <span class="c-case-card__title">{bi(*f["title"])}</span>
                <span class="c-case-card__summary">{bi(*f["summary"])}</span>
                {inside(f["pieces"], shown=4)}
                <span class="c-case-card__go">{bi("Read the full story", "اقرأ القصة كاملة")}{ARROW}</span>
              </a>
            </li>'''


def featured():
    f = FEATURED
    return f'''            <li class="c-case-card c-case-card--wide c-case-card--featured" data-kinds="{f["kinds"]}">
              <a class="c-case-card__link" href="{f["href"]}">
                <span class="c-case-card__media"><img src="/assets/{f["img"]}" srcset="/assets/{f["img"]} {f["w"]}w, /assets/{f["full"]} {f["full_w"]}w" sizes="(min-width: 64em) 45vw, 100vw" alt="" width="{f["w"]}" height="{f["h"]}" fetchpriority="high" decoding="async" /></span>
                <span class="c-case-card__kind">{bi(*f["category"])}</span>
                <span class="c-case-card__title">{bi(*f["title"])}</span>
                <span class="c-case-card__summary">{bi(*f["summary"])}</span>
                {inside(f["pieces"], shown=4)}
                <span class="c-case-card__go">{bi("Read the full story", "اقرأ القصة كاملة")}{ARROW}</span>
              </a>
            </li>'''


def hub_main():
    every = [FEATURED] + CASES
    count = {k: sum(k == "all" or k in c["kinds"].split() for c in every) for k, _, _ in [("all", "", "")] + KINDS}
    chips = "\n".join(
        f'''            <input class="c-cases__radio" type="radio" name="case-kind" id="kind-{k}" value="{k}"{" checked" if k == "all" else ""} />
            <label class="c-cases__chip" for="kind-{k}">{bi(en, ar)}<span class="c-cases__count" aria-hidden="true">{count[k]}</span></label>''' for k, en, ar in [("all", "All work", "كل الأعمال")] + KINDS)
    cards = "\n".join([featured()] + [card(c) for c in CASES])
    return f'''<main id="main" class="c-cases-page">
      <section class="l-section c-cases" aria-labelledby="cases-title">
        <div class="l-container">
          <header class="c-cases__head" data-reveal-group>
            <p class="t-label c-detail__eyebrow">{bi("Case studies", "دراسات الحالة")}</p>
            <h1 class="c-detail__headline" id="cases-title">{bi('Work that had to hold up.<br /><span class="c-detail__accent">Here is how it was made.</span>', 'أعمال صُمّمت لتصمد.<br /><span class="c-detail__accent">وهكذا صُنعت.</span>')}</h1>
            <p class="t-body-lg c-detail__lead">{bi("Identity, editorial, information and digital work — each told from the problem to what changed. Pick a discipline, or read them all.",
                                                     "هوية وتحرير ومعلومات وعمل رقمي — كلٌّ منها يُروى من المشكلة حتى ما تغيّر. اختر تخصصًا، أو اقرأها كلها.")}</p>
          </header>
          <div class="c-cases__filter" role="group" aria-label="{plain(bi("Filter by discipline", "تصفية حسب التخصص"))}">
{chips}
          </div>
          <ul class="c-case-cards" role="list" data-reveal-group>
{cards}
          </ul>
        </div>
      </section>
      {closing()}
    </main>'''


def wa_about(study_en, study_ar):
    """A WhatsApp button whose message names the study the visitor just read."""
    import urllib.parse
    from build_services import WA
    en = f"Hi Pixora — I read your case study “{study_en}” and would like to talk about a similar project."
    ar = f"مرحبًا بيكسورا — قرأت دراسة الحالة «{study_ar}» وأودّ التحدث عن مشروع مشابه."
    q = lambda t: urllib.parse.quote(t, safe="")
    return (f'<a class="c-btn c-btn--primary" href="{WA}{q(en)}" data-wa data-about="case-study" '
            f'data-wa-en="{WA}{q(en)}" data-wa-ar="{WA}{q(ar)}" target="_blank" rel="noopener noreferrer">'
            f'<span>{bi("Talk about a project like this", "تحدّث معنا عن مشروع مشابه")}</span>'
            f'<span class="u-visually-hidden">{bi(" — WhatsApp, opens in a new tab", " — واتساب، يفتح في نافذة جديدة")}</span></a>')


def closing(study=None):
    """The closing box. After a study it leads straight to a conversation about
    it on WhatsApp, with the contact form beside; on the hub, to the form and
    the prices."""
    if study:
        actions = (wa_about(*study) + "\n              "
                   + '<a class="c-btn c-btn--secondary" href="/#contact" data-cta-link><span data-cta-label>Start Your Project</span></a>')
    else:
        actions = ('<a class="c-btn c-btn--primary" href="/#contact" data-cta-link><span data-cta-label>Start Your Project</span></a>\n              '
                   + f'<a class="c-btn c-btn--secondary" href="/pricing"><span>{bi("See the prices", "شاهد الأسعار")}</span>{ARROW}</a>')
    return f"""<section class="l-section l-section--tight c-svc__next" aria-labelledby="cases-next">
        <div class="l-container">
          <div class="c-quote" data-reveal>
            <div>
              <h2 class="c-quote__title" id="cases-next">{bi("Your project could be the next one here.", "مشروعك قد يكون التالي هنا.")}</h2>
              <p class="c-quote__body">{bi("Tell the Pixora team what you are building; we’ll get back to you as soon as possible.", "أخبر فريق بيكسورا بما تبنيه، وسنتواصل معك في أقرب فرصة ممكنة.")}</p>
            </div>
            <div class="c-svc__actions">
              {actions}
            </div>
          </div>
        </div>
      </section>"""


def piece_media(slug, key, piece, site, hero=False):
    """The piece's image once it is on the site; until then a placeholder in its proportions."""
    (en, ar), (w, h), icon = piece
    name = f"case-{slug}-{key}"
    if (site / "assets" / f"{name}.webp").exists():
        small = (site / "assets" / f"{name}-800.webp").exists()
        srcset = f' srcset="/assets/{name}-800.webp 800w, /assets/{name}.webp 1600w" sizes="{"(min-width: 64em) 30vw, 70vw" if hero else "(min-width: 64em) 60vw, 100vw"}"' if small else ""
        cls, lazy = ("", "") if hero else (' class="c-work__image"', 'loading="lazy" ')
        alt = 'alt=""' if hero else f'alt="{plain(en)}" data-alt-en="{plain(en)}" data-alt-ar="{ar}"'
        return (f'<img{cls} src="/assets/{name}.webp"{srcset} {alt} '
                f'width="1600" height="{round(1600 * h / w)}" {lazy}decoding="async" />')
    label = "" if hero else f'<span class="c-ph__text"><span class="c-ph__label">{bi(en, ar)}</span><span class="c-ph__note">{bi("The work, coming soon", "العمل قريبًا")}</span></span>'
    aria = "" if hero else f' role="img" aria-label="{plain(en)}" data-label-ar="{ar}"'
    return (f'<span class="c-ph" style="--ratio:{w} / {h}"{aria} data-ph="{name}"><svg class="c-ph__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
            f'<path d="{ICONS[icon]}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" /></svg>{label}</span>')


def hero_prints(c, story, site):
    chapter_of = {k: ch["key"] for ch in story["chapters"] for k in ch["work"]}
    out = []
    for i, (key, slot) in enumerate(zip(story["hero"], "abcd")):
        piece = story["pieces"][key]
        out.append(f'<a class="c-story-hero__card c-case-print c-case-print--{slot}" href="#ch-{chapter_of[key]}" style="--i:{i}">'
                   f'{piece_media(c["slug"], key, piece, site, hero=True)}<span class="c-story-hero__label">{bi(*piece[0])}</span></a>')
    return (f'<div class="c-story-hero__stage" style="view-transition-name: case-{c["slug"]}">\n          '
            + "\n          ".join(out) + "\n        </div>")


THREAD = ('<div class="c-chapter__joint" aria-hidden="true"><svg class="c-chapter__thread{}" viewBox="0 0 60 136" fill="none" aria-hidden="true" focusable="false" '
          'preserveAspectRatio="xMidYMid meet"><path d="M30 0 C30 30 12 40 12 62 C12 88 44.4 96 30 126" pathLength="1" class="c-sketch__ink" stroke-width="1.6" style="--d:0" />'
          '<path d="M30 126 l-6 -9 M30 126 l7 -8" pathLength="1" class="c-sketch__ink" stroke-width="1.6" style="--d:1" /></svg></div>')


def chapter(c, story, n, ch, site):
    k = ch["key"]
    svg, (alt_en, alt_ar) = sketch(ch["sketch"], f"ch-{k}-alt", f'{c["slug"]}-{k}')
    work = ""
    if ch["work"]:
        figs = "\n".join(
            f'''              <figure class="c-case-work" style="--r:{story["pieces"][key][1][0] / story["pieces"][key][1][1]:.4f}">
                {piece_media(c["slug"], key, story["pieces"][key], site)}
                <figcaption class="c-case-work__caption">{bi(*story["pieces"][key][0])}</figcaption>
              </figure>''' for key in ch["work"])
        work = f'''
          <div class="c-chapter__work">
            <div class="c-case-works">
{figs}
            </div>
          </div>'''
    return f'''        <article class="c-chapter" id="ch-{k}" aria-labelledby="ch-{k}-title" data-chapter="{n:02d}">
          <div class="c-chapter__text">
            <p class="c-chapter__meta">
              <span class="c-chapter__num" aria-hidden="true">{n:02d}</span>
              <span class="c-chapter__annotation">{bi(*ch["note"])}</span>
            </p>
            <h2 class="c-chapter__title" id="ch-{k}-title">{bi(*ch["title"])}</h2>
            <p class="c-chapter__lead">{bi(*ch["lead"])}</p>
            <p class="c-chapter__aside">{bi(*ch["aside"])}</p>
          </div>
          <figure class="c-chapter__figure">
            {svg}
            <figcaption class="u-visually-hidden">{bi(alt_en, alt_ar)}</figcaption>
          </figure>{work}
        </article>'''


def behance(story):
    """More of this work on Behance, beside the closing link, when the study has one."""
    if "behance" not in story:
        return ""
    return (f'\n        <a class="c-link c-story__link" href="{story["behance"]}" target="_blank" rel="noopener noreferrer">'
            f'{bi("More of this work on Behance", "المزيد من هذه الأعمال على Behance")}'
            f'<span class="u-visually-hidden">{bi(" (opens in a new tab)", " (يفتح في نافذة جديدة)")}</span>{ARROW}</a>')


def more_section(more):
    """The end of a study: every other one in a rail, and the way to them all."""
    return f'''<section class="l-section l-section--tight c-case__more" aria-labelledby="case-more">
      <div class="l-container">
        <header class="c-svc__head">
          <p class="t-label c-detail__eyebrow">{bi("More case studies", "دراسات حالة أخرى")}</p>
          <h2 class="c-svc__h2" id="case-more">{bi("Keep reading.", "تابع القراءة.")}</h2>
        </header>
        <div class="c-rail c-rail--cases" data-rail>
          <ul class="c-case-cards c-case-cards--rail" role="list" tabindex="0" aria-label="{plain(bi("More case studies", "دراسات حالة أخرى"))}" data-rail-track>
{more}
          </ul>
          {RAIL_BAR}
        </div>
        <p class="c-detail__more"><a class="c-link" href="/work"><span>{bi("All case studies", "كل دراسات الحالة")}</span>{ARROW}</a></p>
      </div>
    </section>'''


def case_main(c, prev, nxt, site):
    story = STORIES[c["slug"]]
    chapters = story["chapters"]
    body = []
    for n, ch in enumerate(chapters, 1):
        body.append(chapter(c, story, n, ch, site))
        if n < len(chapters):
            body.append("        " + THREAD.format(" c-chapter__thread--resolved" if n == len(chapters) - 1 else ""))
    (close_en, close_ar), href, link = story["close"]
    # Every other study, starting with the next one, then the Al Mada story:
    # one rail, so a reader can keep going without going back to the hub.
    i = CASES.index(c)
    others = CASES[i + 1:] + CASES[:i]
    more = "\n".join([card(x) for x in others] + [story_card()])
    return f'''<main id="main" class="c-case">
      <div class="c-story">
      <header class="c-story__head c-story-hero">
        <p class="t-label c-story__eyebrow">{bi(*c["category"])}</p>
        <h1 class="c-story__title">{bi(*story["headline"])}</h1>
        <p class="c-story__standfirst t-body-lg">{bi(*story["standfirst"])}</p>
        {hero_prints(c, story, site)}
      </header>
      <div class="c-story__chapters">
{chr(10).join(body)}
      </div>
      <footer class="c-story__close">
        <p class="c-story__statement">{bi(close_en, close_ar)}</p>
        <a class="c-link c-story__link" href="{href}">{bi(*link)}{ARROW}</a>{behance(story)}
      </footer>
      </div>
    {more_section(more)}
    {closing((plain(c["title"][0]), plain(c["title"][1]).split(" — ")[0]))}
    </main>'''


def head(shell, path, title_en, title_ar, desc_en, card):
    h = shell
    h = re.sub(r"<title>.*?</title>", f"<title>{title_en} — Pixora</title>", h, 1)
    h = re.sub(r'<meta name="title-ar" content="[^"]*" />', f'<meta name="title-ar" content="{title_ar} — بيكسورا" />', h, 1)
    h = re.sub(r'(<meta\s+name="description"\s+content=")[^"]*(")', lambda m: m.group(1) + desc_en + m.group(2), h, 1)
    h = re.sub(r'(<meta property="og:title" content=")[^"]*(")', lambda m: m.group(1) + f"{title_en} — Pixora" + m.group(2), h, 1)
    h = re.sub(r'(<meta\s+property="og:description"\s+content=")[^"]*(")', lambda m: m.group(1) + desc_en + m.group(2), h, 1)
    h = h.replace(f'"{URL}/pricing"', f'"{URL}{path}"')
    h = h.replace(f"{URL}/assets/share-card.jpg", f"{URL}/assets/{card}")
    h = re.sub(r'(<meta property="og:image:alt" content=")[^"]*(")', lambda m: m.group(1) + f"{title_en} — Pixora / {title_ar} — بيكسورا" + m.group(2), h, 1)
    return h


CSS = stylesheet("cases")


def build(site: pathlib.Path):
    pricing = (site / "pricing.html").read_text(encoding="utf-8")
    a = pricing.index('<main id="main">')
    b = pricing.index("</main>") + len("</main>")
    shell_head, shell_tail = pricing[:a], pricing[b:]

    hub = head(shell_head, "/work", "Case studies", "دراسات الحالة",
               "Pixora case studies: identity, editorial, information and digital work, each told from the problem to what changed.", "share-work.jpg")
    (site / "work.html").write_text(hub + hub_main() + shell_tail, encoding="utf-8")
    (site / "work").mkdir(exist_ok=True)
    for i, c in enumerate(CASES):
        prev, nxt = CASES[i - 1], CASES[(i + 1) % len(CASES)]
        page = head(shell_head, f"/work/{c['slug']}", plain(c["title"][0]), plain(c["title"][1]), plain(c["summary"][0]), f"share-case-{c['slug']}.jpg")
        (site / "work" / f"{c['slug']}.html").write_text(page + case_main(c, prev, nxt, site) + shell_tail, encoding="utf-8")

    # The site's menu and footer: "Story" becomes the case studies.
    # The Al Mada story is a study too: it ends in the same rail, every study.
    story = site / "story.html"
    text = story.read_text(encoding="utf-8")
    if text.count("</main>") != 1 or "c-case__more" in text:
        raise SystemExit("cases: story.html: the end of its main was not found")
    text = text.replace("</main>", "  " + closing(("Al Mada Travel & Tourism", "المدى للسفر والسياحة")) + "\n    "
                        + more_section("\n".join(card(c) for c in CASES)) + "\n    </main>", 1)
    story.write_text(text, encoding="utf-8")
    for page in pages(site):
        text = page.read_text(encoding="utf-8")
        new, n = re.subn(r"\{ id: 'story', label: 'Story', labelAr: 'القصة', href: '(?:\./|/)story' \}",
                         "{ id: 'story', label: 'Case studies', labelAr: 'دراسات الحالة', href: '/work' }", text)
        if n != 1:
            raise SystemExit(f"cases: {page.name}: the menu's Story entry was not found")
        page.write_text(new, encoding="utf-8")

    # The homepage's proof section and the story page point to them all.
    home = site / "index.html"
    text = home.read_text(encoding="utf-8")
    m = re.search(r'(<p class="c-proof__more">.*?</p>)', text, re.S) or re.search(r'(<a class="c-link[^"]*" href="(?:/|\./)?story"[^>]*>.*?</a>)', text, re.S)
    if not m:
        raise SystemExit("cases: the homepage's link to the case study was not found")
    text = text.replace(m.group(1), m.group(1) + f'\n            <p class="c-proof__all"><a class="c-link" href="/work"><span>{bi("All case studies", "كل دراسات الحالة")}</span>{ARROW}</a></p>', 1)
    home.write_text(text, encoding="utf-8")

    sitemap = site / "sitemap.xml"
    xml = sitemap.read_text(encoding="utf-8")
    for path in ["/work"] + [f"/work/{c['slug']}" for c in CASES]:
        loc = f"{URL}{path}"
        if loc not in xml:
            xml = xml.replace("</urlset>", f"  <url>\n    <loc>{loc}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n</urlset>")
    sitemap.write_text(xml, encoding="utf-8")
    inject_all(site, CSS)


if __name__ == "__main__":
    build(pathlib.Path(__file__).resolve().parent.parent / "site")
