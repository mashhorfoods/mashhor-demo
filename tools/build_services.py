#!/usr/bin/env python3
"""One place per service: /services/<id>, with its details, packages and prices.

The supplied site describes every service three times: an accordion on the
homepage, a detail section per service further down the homepage, and the
packages again on /pricing. This step turns that into one structure:

  /                    — one "Services" section: a card per service, each
                         linking to its page (the accordion, the five detail
                         sections and the add-ons leave the homepage).
  /services/<id>       — everything about one service, in the order a buyer
                         needs it: what it is, what it looks like, what it
                         covers, the packages and prices, the add-ons that go
                         with it, and a way to ask or build a custom scope.
  /pricing             — only what is about pricing as such: what moves a
                         price, an index of services linking to their pages,
                         every add-on, the build-your-own estimator and how
                         billing works. The per-service packages leave it.

Nothing is rewritten: every block is moved from the supplied markup, so the
copy, the prices, the WhatsApp links and the site script's behaviour (tiers,
analytics, language switch) come along unchanged. New wording is limited to
labels (breadcrumb, section titles, card links), in English and Arabic.

Runs on the site/ copy of the supplied pages, before refinements.py.
"""
import pathlib
import re

import common
from common import drop, inject_css, pages, stylesheet

SERVICES = ["branding", "websites", "social", "marketing", "integrated"]
# Which add-on categories (by their English name) belong on which page.
ADDONS_FOR = {
    "branding": ["Branding", "Design"],
    "websites": ["Digital"],
    "social": ["Content", "Design", "Media"],
    "marketing": ["Design", "Media"],
    "integrated": [],
}
# The detail sections that already carry a "what it covers" list of their own.
HAS_OWN_LIST = {"websites", "marketing", "integrated"}
# Cover subjects that are off-centre (default: centre).
FOCUS = {"social": "40% 50%"}
# Every service page opens its content with the same slideshow of work:
# service → (the sample block it replaces, or None to add it on top; that
# block's tag; the images, real client work first). Alt text comes from
# where each image already appears on the homepage; captions from the work
# gallery or CAPTIONS below.
SHOWCASE = {
    "branding": (r'<div class="c-brandboard"', "div",
                 ["al-mada-identity.webp", "work-1.webp", "work-2.webp", "work-3.webp",
                  "work-4.webp", "work-5.webp", "work-6.webp", "work-7.webp"]),
    "websites": (r'<div class="c-devices"', "div",
                 ["al-mada-website.webp", "d01.webp", "t01.webp", "mo1.webp"]),
    "social": (r'<ul class="c-modules"', "ul",
               ["al-mada-campaign.webp", "c01.webp", "c02.webp", "c03.webp", "c04.webp", "c05.webp"]),
    "marketing": (None, None, ["al-mada-campaign.webp", "c02.webp", "c04.webp", "c05.webp"]),
    "integrated": (None, None, ["al-mada-identity.webp", "al-mada-website.webp",
                                "al-mada-campaign.webp", "al-mada-profile.webp"]),
}
CAPTIONS = {
    "al-mada-identity.webp": ("Al Mada — the full identity", "المدى — الهوية كاملة"),
    "al-mada-website.webp": ("Al Mada — the website", "المدى — الموقع الإلكتروني"),
    "al-mada-campaign.webp": ("Al Mada — the Umrah campaign", "المدى — حملة العمرة"),
    "al-mada-profile.webp": ("Al Mada — the company profile", "المدى — الملف التعريفي"),
    "d01.webp": ("Website design — desktop", "تصميم موقع — شاشة مكتبية"),
    "t01.webp": ("Website design — tablet", "تصميم موقع — جهاز لوحي"),
    "mo1.webp": ("Website design — phone", "تصميم موقع — جوال"),
    "c01.webp": ("Content calendar", "روزنامة المحتوى"),
    "c02.webp": ("Post design", "تصميم منشور"),
    "c03.webp": ("Reel design", "تصميم ريلز"),
    "c04.webp": ("Story design", "تصميم قصة"),
    "c05.webp": ("Monthly performance report", "تقرير الأداء الشهري"),
}
# Screens and posters are tall: their frame shows the top (the headline).
TOP = {"d01.webp", "t01.webp", "mo1.webp", "c01.webp", "c02.webp", "c03.webp", "c04.webp", "c05.webp", "al-mada-campaign.webp"}
REPLACED = set()  # images of the blocks a slideshow replaced
# Images that have a smaller copy the slideshow can offer phones.
SMALLER = {"al-mada-identity.webp": ("al-mada-identity-tile.webp", 900, 1400),
           "al-mada-website.webp": ("al-mada-website-tile.webp", 900, 1200),
           "al-mada-campaign.webp": ("al-mada-campaign-tile.webp", 560, 900),
           "al-mada-profile.webp": ("al-mada-profile-tile.webp", 560, 1200)}
WA = common.WA + "?text="


def bi(en, ar):
    return f'<span data-lang-copy="en">{en}</span><span data-lang-copy="ar" lang="ar">{ar}</span>'


ARROW = ('<svg class="c-btn__icon u-flip-rtl" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
         '<path d="M5 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" /></svg>')


# ---------------------------------------------------------------------------
# Markup helpers: find an element and its matching close tag.
# ---------------------------------------------------------------------------
def element(html, start, tag):
    """(start, end) of the element that opens at `start`, end exclusive."""
    depth = 0
    pattern = re.compile(rf"<(/?){tag}\b[^>]*>", re.S)
    for m in pattern.finditer(html, start):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return start, m.end()
    raise ValueError(f"unclosed <{tag}> at {start}")


def find(html, pattern, tag, start=0):
    m = re.compile(pattern, re.S).search(html, start)
    if not m:
        raise ValueError(f"not found: {pattern}")
    return element(html, m.start(), tag)


def inner(fragment):
    return fragment[fragment.index(">") + 1: fragment.rindex("</")]


def cut(html, pattern, tag):
    """Remove the first element matching pattern (if any)."""
    try:
        a, b = find(html, pattern, tag)
    except ValueError:
        return html
    return html[:a] + html[b:]


# ---------------------------------------------------------------------------
# Read what the supplied pages say about each service.
# ---------------------------------------------------------------------------
def read_services(home, pricing):
    data = {}
    for sid in SERVICES:
        a, b = find(home, rf'<div class="c-service" id="service-{sid}"', "div")
        acc = home[a:b]
        s = {"id": sid}
        s["index"] = re.search(r'c-service__index[^>]*>(\d+)<', acc).group(1)
        s["name"] = re.search(r'<span class="c-service__name"><span>(.*?</span>)</span></span>', acc, re.S).group(1)
        s["summary"] = inner(acc[slice(*find(acc, r'<p class="c-service__summary"', "p"))])
        s["desc"] = inner(acc[slice(*find(acc, r'<p class="t-body-lg c-service__desc"', "p"))])
        # Four services list capabilities; the integrated one lists a flow.
        try:
            s["caps"] = acc[slice(*find(acc, r'<ul class="c-service__caps"', "ul"))]
        except ValueError:
            s["caps"] = acc[slice(*find(acc, r'<ol class="c-service__flow"', "ol"))]
        s["name_en"] = re.search(r'data-lang-copy="en">(.*?)</span>', s["name"]).group(1)

        a, b = find(home, rf'<section id="{sid}"', "section")
        s["detail"] = home[a:b]

        s["pricing"] = None
        m = re.search(rf'<h2 class="c-page__h2" id="{sid}">', pricing)
        if m:
            wrap_start = pricing.rfind('<div class="c-page__section">', 0, m.start())
            _, wrap_end = element(pricing, wrap_start, "div")
            s["pricing"] = pricing[m.start():wrap_end - len("</div>")]
            idx = re.search(rf'<a class="c-index__link" href="#{sid}">.*?</a>', pricing, re.S)
            s["amount"] = re.search(r'c-index__amount">(\d+)<', idx.group(0)).group(1)
            s["billing"] = re.search(r'(<span class="c-index__billing"[^>]*>.*?</span>)', idx.group(0)).group(1)
        data[sid] = s
    return data


def read_work(home):
    """Every portfolio image on the homepage → its alt text and caption (EN, AR)."""
    work = {}
    for m in re.finditer(r'<li class="c-gallery__item">.*?</li>', home, re.S):
        item = m.group(0)
        name = re.search(r'src="(?:\./|/)?assets/([^"]+)"', item).group(1)
        cap = re.search(r'<figcaption.*?</figcaption>', item, re.S).group(0)
        work[name] = {
            "alt": (re.search(r'data-alt-en="([^"]*)"', item).group(1), re.search(r'data-alt-ar="([^"]*)"', item).group(1)),
            "caption": (re.search(r'data-lang-copy="en">(.*?)</span>', cap, re.S).group(1),
                        re.search(r'data-lang-copy="ar" lang="ar">(.*?)</span>', cap, re.S).group(1)),
        }
    # The other images: alt text from wherever the homepage shows them (the
    # service sections, the Al Mada tiles), captions from CAPTIONS.
    for m in re.finditer(r'<img\b[^>]*?src="(?:\./|/)?assets/([^"]+)"[^>]*>', home, re.S):
        name = m.group(1).replace("-tile.webp", ".webp")
        en, ar = re.search(r'data-alt-en="([^"]*)"', m.group(0)), re.search(r'data-alt-ar="([^"]*)"', m.group(0))
        if name in CAPTIONS and name not in work and en and ar:
            work[name] = {"alt": (en.group(1), ar.group(1)), "caption": CAPTIONS[name]}
    return work


def slideshow(images, work):
    """A slideshow of real work: uniform 4:3 frames, three / two / one-and-a-bit
    per view, advancing on its own (overlay/assets/motion.js, section 0)."""
    n = len(images)
    slides = []
    for i, name in enumerate(images, 1):
        w = work[name]
        small = SMALLER.get(name)
        srcset = f' srcset="/assets/{small[0]} {small[1]}w, /assets/{name} {small[2]}w"' if small else ""
        slides.append(f'''            <div class="c-slides__slide" role="group" aria-roledescription="slide" aria-label="{i} / {n}"><figure class="c-slides__figure">
              <span class="c-slides__frame{' c-slides__frame--top' if name in TOP else ''}"><img src="/assets/{name}"{srcset} sizes="(min-width: 64em) 26rem, (min-width: 48em) 46vw, 84vw"
                alt="{w["alt"][0]}" data-alt-en="{w["alt"][0]}" data-alt-ar="{w["alt"][1]}" loading="lazy" decoding="async" /></span>
              <figcaption class="c-slides__caption">{bi(*w["caption"])}</figcaption>
            </figure></div>''')
    prev = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2" fill="none" /></svg>'
    nxt = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" fill="none" /></svg>'
    return f'''<section class="c-slides" aria-roledescription="carousel" aria-label="Selected work — أعمال مختارة" data-slides>
          <h2 class="t-label c-detail__subhead">{bi("Selected work", "أعمال مختارة")}</h2>
          <div class="c-slides__track" tabindex="0">
{chr(10).join(slides)}
          </div>
          <div class="c-slides__bar" data-slides-bar hidden>
            <span class="c-slides__progress" aria-hidden="true"><i></i></span>
            <button class="c-slides__btn u-flip-rtl" type="button" data-slides-prev aria-label="Previous — السابق">{prev}</button>
            <button class="c-slides__btn u-flip-rtl" type="button" data-slides-next aria-label="Next — التالي">{nxt}</button>
          </div>
        </section>'''


def read_addons(home):
    a, b = find(home, r'<section id="add-ons"', "section")
    section = home[a:b]
    groups = {}
    for m in re.finditer(r'<details class="c-addons__group"', section):
        ga, gb = element(section, m.start(), "details")
        group = section[ga:gb]
        name = re.search(r'c-addons__category">\s*<span><span data-lang-copy="en">(.*?)</span>', group, re.S).group(1)
        groups[name] = group
    return section, groups


# ---------------------------------------------------------------------------
# New pieces.
# ---------------------------------------------------------------------------
def price_line(s):
    if not s.get("amount"):
        return f'<span class="c-svc-card__price">{bi("Built from the four services", "تُركَّب من الخدمات الأربع")}</span>'
    return (f'<span class="c-svc-card__price"><span class="c-svc-card__from" data-i18n="priceFrom">From</span> '
            f'<span class="c-svc-card__amount">{s["amount"]}</span> '
            f'<span class="c-svc-card__currency" data-i18n="currency">USD</span> {s["billing"]}</span>')


# A rail's controls (overlay/assets/motion.js, section 6 does their work): the
# gold line of how much has been seen, and a card back or on. Hidden until the
# script runs, and whenever everything already fits.
RAIL_BAR = '''<div class="c-rail__bar" data-rail-bar hidden>
            <span class="c-rail__progress" aria-hidden="true"><i></i></span>
            <button class="c-slides__btn u-flip-rtl" type="button" data-rail-prev aria-label="Previous — السابق"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2" fill="none" /></svg></button>
            <button class="c-slides__btn u-flip-rtl" type="button" data-rail-next aria-label="Next — التالي"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" fill="none" /></svg></button>
          </div>'''


def cards(data, skip=None, rail=False):
    items = []
    for sid in SERVICES:
        if sid == skip:
            continue
        s = data[sid]
        chips = re.findall(r'<li\b[^>]*>(.*?)</li>', s["caps"], re.S)[:4]
        wide = " c-svc-card--wide" if sid == "integrated" and not skip and not rail else ""
        items.append(f'''            <li class="c-svc-card{wide}">
              <a class="c-svc-card__link" href="/services/{sid}">
                <span class="c-svc-card__media" style="view-transition-name: svc-{sid}">{cover(sid, lazy=True)}</span>
                <span class="c-svc-card__index" aria-hidden="true">{s["index"]}</span>
                <span class="c-svc-card__name">{s["name"]}</span>
                <span class="c-svc-card__summary">{s["summary"]}</span>
                <span class="c-svc-card__chips">{"".join(f'<span class="c-svc-card__chip">{c}</span>' for c in chips)}</span>
                <span class="c-svc-card__foot">
                  {price_line(s)}
                  <span class="c-svc-card__go">{bi("Details &amp; packages", "التفاصيل والباقات")}{ARROW}</span>
                </span>
              </a>
            </li>''')
    four = " c-svc-cards--four" if skip else ""
    if rail:
        # The homepage's five, in one horizontal rail.
        return ('''<div class="c-rail" data-rail>
          <ul class="c-svc-cards c-svc-cards--rail" role="list" tabindex="0" aria-label="Our services — خدماتنا" data-rail-track>
''' + "\n".join(items) + f'''
          </ul>
          {RAIL_BAR}
        </div>''')
    return f'<ul class="c-svc-cards{four}" role="list" data-reveal-group>\n' + "\n".join(items) + "\n          </ul>"


def cover(sid, lazy):
    """The service's cover image: the card's thumbnail and its page's hero.
    Three sizes (tools/images.py makes them); each screen takes the one it needs."""
    load = 'loading="lazy" decoding="async"' if lazy else 'fetchpriority="high" decoding="async"'
    sizes = "(min-width: 64em) 40rem, 100vw" if lazy else "100vw"
    # Where the subject sits, for the narrow crop phones show of the hero.
    focus = f' style="object-position: {FOCUS[sid]}"' if sid in FOCUS else ""
    return (f'<img src="/assets/svc-{sid}.webp" srcset="/assets/svc-{sid}-800.webp 800w, /assets/svc-{sid}-1200.webp 1200w, /assets/svc-{sid}.webp 1600w" '
            f'sizes="{sizes}" alt="" width="1600" height="1000"{focus} {load} />')


def wa_link(s):
    import urllib.parse
    en = f"Hi Pixora — I'd like to talk about {re.sub('<[^>]+>', '', s['name_en']).replace('&amp;', '&')}."
    ar_name = re.search(r'lang="ar">(.*?)</span>', s["name"]).group(1)
    ar = f"مرحبًا بيكسورا — أود التحدث بخصوص {ar_name}."
    q = lambda t: urllib.parse.quote(t, safe="")
    return (f'<a class="c-btn c-btn--secondary" href="{WA}{q(en)}" data-wa data-about="{s["id"]}" '
            f'data-wa-en="{WA}{q(en)}" data-wa-ar="{WA}{q(ar)}" target="_blank" rel="noopener noreferrer">'
            f'<span>{bi("Ask on WhatsApp", "اسأل على واتساب")}</span>'
            f'<span class="u-visually-hidden">{bi(" (opens in a new tab)", " (يفتح في نافذة جديدة)")}</span></a>')


def service_main(s, data, addon_groups, work):
    sid = s["id"]
    detail = s["detail"]
    container = inner(detail[slice(*find(detail, r'<div class="l-container">', "div"))])
    head_tag = "header" if re.search(r'<header class="c-detail__head"', container) else "div"
    ha, hb = find(container, r'<(?:div|header) class="c-detail__head"', head_tag)
    head = container[ha:hb]
    body = container[:ha] + container[hb:]
    # The page's own packages, actions and "see the packages" link replace these.
    body = cut(body, r'<p class="c-detail__packages"', "p")
    if sid in SHOWCASE:
        pattern, tag, images = SHOWCASE[sid]
        missing = [n for n in images if n not in work]
        if missing:
            raise SystemExit(f"build_services: {sid}: no alt text / caption for {missing}")
        if pattern:
            a, b = find(body, pattern, tag)
            REPLACED.update(re.findall(r'src="(?:\./|/)?assets/([^"]+)"', body[a:b]))
            body = body[:a] + slideshow(images, work) + body[b:]
        else:
            body = "\n          " + slideshow(images, work) + body
    body = cut(body, r'<a class="c-btn c-btn--primary c-detail__action"', "a")
    if sid != "integrated":
        body = cut(body, r'<p class="c-detail__more"', "p")
    # The detail heading becomes the page heading.
    head = re.sub(r'<h2 class="c-detail__headline" id="[^"]*">', '<h1 class="c-detail__headline" id="svc-title">', head, 1)
    head = head.replace("</h2>", "</h1>", 1)

    if s["pricing"]:
        p = s["pricing"]
        packages_p = p[slice(*find(p, r'<p class="c-detail__packages"', "p"))]
        deal = f'''<div class="c-svc__deal" data-reveal>
            {packages_p.replace(' data-reveal', '')}
            <div class="c-svc__actions">
              <a class="c-btn c-btn--primary" href="#packages"><span>{bi("See the packages", "شوف الباقات")}</span>{ARROW}</a>
              {wa_link(s)}
            </div>
          </div>'''
        p = cut(p, r'<p class="c-detail__packages"', "p")
        p = cut(p, r'<a class="c-btn c-btn--primary c-detail__action"', "a")
        title_m = re.search(r'<h2 class="c-page__h2" id="[^"]*">(.*?)</h2>', p, re.S)
        p = p.replace(title_m.group(0), "", 1)
        packages = f'''
      <section class="l-section c-svc__packages" id="packages" aria-labelledby="packages-title">
        <div class="l-container">
          <header class="c-svc__head">
            <p class="t-label c-detail__eyebrow">{bi("Packages &amp; prices", "الباقات والأسعار")}</p>
            <h2 class="c-svc__h2" id="packages-title">{bi("Choose how far to take it.", "اختر إلى أي مدى تريد أن تمضي.")}</h2>
          </header>
{p}
        </div>
      </section>'''
    else:
        deal = f'''<div class="c-svc__deal" data-reveal>
            <p class="c-svc__deal-note">{bi("Priced from the services it combines — build the scope and the estimate follows.", "يُسعَّر من الخدمات التي يجمعها — كوّن النطاق ويظهر التقدير معه.")}</p>
            <div class="c-svc__actions">
              <a class="c-btn c-btn--primary" href="/pricing#build"><span>{bi("Build your package", "كوّن باقتك")}</span>{ARROW}</a>
              {wa_link(s)}
            </div>
          </div>'''
        packages = ""

    covers = ""
    if sid not in HAS_OWN_LIST:
        covers = f'''
          <div class="c-svc__covers">
            <h2 class="t-label c-detail__subhead">{bi("What it covers", "ما تشمله الخدمة")}</h2>
            <p class="t-body-lg">{s["desc"]}</p>
            {s["caps"].replace('class="c-service__caps"', 'class="c-service__caps c-svc__caps"')}
          </div>'''

    addons = ""
    # All open: on a service page there are only a few, and they are the point.
    groups = [re.sub(r'<details class="c-addons__group"([^>]*?)(?: open)?>', r'<details class="c-addons__group"\1 open>', addon_groups[g], 1)
              for g in ADDONS_FOR[sid] if g in addon_groups]
    missing = [g for g in ADDONS_FOR[sid] if g not in addon_groups]
    if missing:
        raise ValueError(f"{sid}: add-on categories not found: {missing}")
    if groups:
        addons = f'''
      <section class="l-section l-section--tight c-svc__addons" aria-labelledby="addons-title">
        <div class="l-container">
          <header class="c-svc__head">
            <p class="t-label c-detail__eyebrow">{bi("Add-ons", "إضافات")}</p>
            <h2 class="c-svc__h2" id="addons-title">{bi("Add what you need, when you need it.", "أضف ما تحتاجه، حين تحتاجه.")}</h2>
          </header>
          <div class="c-addons">
            {"".join(groups)}
          </div>
          <p class="c-detail__more"><a class="c-link" href="/pricing#add-ons"><span>{bi("Every add-on and its price", "كل الإضافات وأسعارها")}</span>{ARROW}</a></p>
        </div>
      </section>'''

    return f'''
      <section class="c-svc-hero" aria-labelledby="svc-title">
        <div class="c-svc-hero__media" style="view-transition-name: svc-{sid}">{cover(sid, lazy=False)}</div>
        <div class="l-container c-svc-hero__inner">
{head}
        </div>
      </section>
      <section class="c-svc__lead-in">
        <div class="l-container">
          {deal}
        </div>
      </section>
      <section class="l-section l-section--tight c-svc__body">
        <div class="l-container">
{body}{covers}
        </div>
      </section>{packages}{addons}
      <section class="l-section l-section--tight c-svc__next" aria-labelledby="next-title">
        <div class="l-container">
          <div class="c-quote" data-reveal>
            <div>
              <h2 class="c-quote__title" id="next-title">{bi("Something more specific?", "تحتاج شيئًا أكثر تحديدًا؟")}</h2>
              <p class="c-quote__body">{bi("Build your own scope feature by feature and see the estimate as you go — or tell us what you are trying to do.", "كوّن نطاقك ميزةً ميزة وشاهد التقدير أثناء ذلك — أو أخبرنا بما تريد إنجازه.")}</p>
            </div>
            <div class="c-svc__actions">
              <a class="c-btn c-btn--primary" href="/pricing#build"><span>{bi("Build your package", "كوّن باقتك")}</span>{ARROW}</a>
              <a class="c-btn c-btn--secondary" href="/#contact" data-cta-link><span data-cta-label>Start Your Project</span></a>
            </div>
          </div>
          <h2 class="t-label c-svc__more-title">{bi("Other services", "خدمات أخرى")}</h2>
          {cards(data, skip=sid)}
        </div>
      </section>
'''


def page_head(shell, s):
    name_en = re.sub("<[^>]+>", "", s["name_en"]).replace("&amp;", "&")
    name_ar = re.search(r'lang="ar">(.*?)</span>', s["name"]).group(1)
    desc_en = re.sub("<[^>]+>", "", re.search(r'data-lang-copy="en">(.*?)</span>', s["desc"], re.S).group(1))
    url = f"https://zaokalyamamah.online/services/{s['id']}"
    h = shell
    h = re.sub(r"<title>.*?</title>", f"<title>{name_en} — Pixora</title>", h, 1)
    h = re.sub(r'<meta name="title-ar" content="[^"]*" />', f'<meta name="title-ar" content="{name_ar} — بيكسورا" />', h, 1)
    h = re.sub(r'(<meta\s+name="description"\s+content=")[^"]*(")', rf'\g<1>{desc_en}\2', h, 1)
    h = re.sub(r'(<meta property="og:title" content=")[^"]*(")', rf'\g<1>{name_en} — Pixora\2', h, 1)
    h = re.sub(r'(<meta\s+property="og:description"\s+content=")[^"]*(")', rf'\g<1>{desc_en}\2', h, 1)
    h = h.replace('href="https://zaokalyamamah.online/pricing"', f'href="{url}"')
    # Its own link-preview card (tools/share-cards: the cover, name and headline).
    card = f"https://zaokalyamamah.online/assets/share-{s['id']}.jpg"
    for old in ('property="og:image" content="https://zaokalyamamah.online/assets/share-card.jpg"',
                'name="twitter:image" content="https://zaokalyamamah.online/assets/share-card.jpg"'):
        if old not in h:
            raise SystemExit(f"build_services: share image tag not found: {old}")
        h = h.replace(old, old.replace("https://zaokalyamamah.online/assets/share-card.jpg", card))
    h = re.sub(r'(<meta property="og:image:alt" content=")[^"]*(")', rf"\g<1>{name_en} — Pixora / {name_ar} — بيكسورا\2", h, 1)
    h = h.replace('content="https://zaokalyamamah.online/pricing"', f'content="{url}"')
    return h


CSS = stylesheet("services")


# ---------------------------------------------------------------------------
# The three changes.
# ---------------------------------------------------------------------------
def build(site: pathlib.Path):
    home = (site / "index.html").read_text(encoding="utf-8")
    pricing = (site / "pricing.html").read_text(encoding="utf-8")
    data = read_services(home, pricing)
    addons_section, addon_groups = read_addons(home)
    work = read_work(home)

    # 1. Service pages, built on the pricing page's shell (head, header,
    #    verification band, footer, script) so they are the site's own pages.
    main_a = pricing.index('<main id="main">') + len('<main id="main">')
    main_b = pricing.index("</main>")
    (site / "services").mkdir(exist_ok=True)
    for sid in SERVICES:
        s = data[sid]
        page = page_head(pricing[:main_a], s) + service_main(s, data, addon_groups, work) + "    " + pricing[main_b:]
        page = page.replace('id="pricing-title"', 'id="svc-page-title"')
        (site / "services" / f"{sid}.html").write_text(page, encoding="utf-8")

    # 2. Homepage: one services section of cards; the accordion, the detail
    #    sections and the add-ons leave.
    a, b = find(home, r'<div class="c-service-list"', "div")
    home = home[:a] + cards(data, rail=True) + home[b:]
    home = home.replace(
        bi("The difference is not what gets made — it is how much of the coordinating you have to do yourself. Five services; open any one to see what it covers.",
           "الفارق ليس فيما يُنجَز — بل في مقدار التنسيق الذي يقع عليك. خمس خدمات؛ افتح أيًا منها لترى ما تشمله."),
        bi("The difference is not what gets made — it is how much of the coordinating you have to do yourself. Five services; pick one for what it covers, its packages and its prices.",
           "الفارق ليس فيما يُنجَز — بل في مقدار التنسيق الذي يقع عليك. خمس خدمات؛ اختر أيًا منها لترى ما تشمله وباقاتها وأسعارها."))
    for sid in SERVICES + ["add-ons"]:
        a, b = find(home, rf'<section id="{sid}"', "section")
        home = home[:a] + home[b:]

    # 3. Pricing: the per-service packages leave (they live on the service
    #    pages); every add-on arrives from the homepage.
    for sid in SERVICES:
        m = re.search(rf'<h2 class="c-page__h2" id="{sid}">', pricing)
        if not m:
            continue
        wrap_start = pricing.rfind('<div class="c-page__section">', 0, m.start())
        _, wrap_end = element(pricing, wrap_start, "div")
        if pricing.find('<nav class="c-index"', wrap_start, m.start()) >= 0:
            pricing = pricing[:m.start()] + pricing[wrap_end - len("</div>"):]
        else:
            pricing = pricing[:wrap_start] + pricing[wrap_end:]
    ac = inner(addons_section[slice(*find(addons_section, r'<div class="l-container">', "div"))])
    ac = ac.replace('<h2 class="c-detail__headline" id="addons-title">', '<h2 class="c-detail__headline" id="addons-title">', 1)
    ac = cut(ac, r'<p class="c-detail__more"', "p")  # "build your own" — the builder follows directly
    ac = re.sub(r'<span class="c-detail__number">\d+</span>\s*', "", ac, count=1)
    ac = ac.replace('href="#contact"', 'href="/#contact"')
    build_at = pricing.index('<div class="c-build-wrap" id="build">')
    pricing = pricing[:build_at] + f'<div class="c-page__section" id="add-ons">\n{ac}\n          </div>\n          ' + pricing[build_at:]
    pricing = re.sub(r'<p class="t-body-lg c-page__lead">.*?</p>', lambda m: '<p class="t-body-lg c-page__lead">' + bi(
        "Every package and price is published on its service page. Here is the part most studios leave out: what actually moves a quote up or down — and a way to build your own.",
        "كل باقة وسعرها منشوران في صفحة خدمتها. وهنا الجزء الذي تُغفله معظم الاستوديوهات: ما الذي يرفع السعر أو يخفضه — وطريقة لتكوين باقتك بنفسك.") + "</p>", pricing, count=1, flags=re.S)
    # The service index now opens pages rather than scrolling down this one.
    pricing = pricing.replace('<path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="square" fill="none" />',
                              '<path d="M5 12h13M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="square" fill="none" />')
    pricing = pricing.replace(
        bi("Add-ons are quoted from the figures on the homepage; work priced by quantity or by project is quoted once we know the scope.",
           "الإضافات تُسعَّر ابتداءً من الأرقام المنشورة في الصفحة الرئيسية؛ والعمل المسعَّر بالكمية أو بالمشروع يُسعَّر بعد معرفة النطاق."),
        bi("Add-ons are quoted from the figures on this page; work priced by quantity or by project is quoted once we know the scope.",
           "الإضافات تُسعَّر ابتداءً من الأرقام المنشورة في هذه الصفحة؛ والعمل المسعَّر بالكمية أو بالمشروع يُسعَّر بعد معرفة النطاق."))
    pricing = re.sub(r'(content=")Every package and price we publish, plus the five things that move a quote up or down\.(")',
                     r"\1What moves a price, every add-on, a build-your-own estimator and how billing works.\2", pricing)

    # The sections that stay keep their order; their numbers close the gap.
    n = iter(range(1, 100))
    home = re.sub(r'(<span class="c-detail__number">)\d+(</span>)', lambda m: f"{m.group(1)}{next(n):02d}{m.group(2)}", home)
    (site / "index.html").write_text(home, encoding="utf-8")
    (site / "pricing.html").write_text(pricing, encoding="utf-8")

    # 4. Every page: links to the old in-page service anchors go to the pages,
    #    and the site script's service list carries those addresses.
    for path in pages(site):
        text = path.read_text(encoding="utf-8")
        before = text
        for sid in SERVICES:
            for old in (f'"./pricing#{sid}"', f'"/pricing#{sid}"', f'"./#{sid}"', f'"/#{sid}"', f'"#{sid}"'):
                text = text.replace(f"href={old}", f'href="/services/{sid}"')
            text = text.replace(f"{{ id: '{sid}', label:", f"{{ id: '{sid}', href: '/services/{sid}', label:")
        for old in ('"./#add-ons"', '"/#add-ons"', '"#add-ons"'):
            text = text.replace(f"href={old}", 'href="/pricing#add-ons"')
        text = inject_css(text, CSS)  # the service cards and pages styles, once per page
        if text != before:
            path.write_text(text, encoding="utf-8")

    # The replaced blocks' images leave site/ — unless a page still uses one.
    drop(site, sorted(REPLACED), "build_services", keep_used=True)

    # 5. Sitemap: the five pages.
    sitemap = site / "sitemap.xml"
    xml = sitemap.read_text(encoding="utf-8")
    for sid in SERVICES:
        loc = f"https://zaokalyamamah.online/services/{sid}"
        if loc not in xml:
            xml = xml.replace("</urlset>", f"  <url>\n    <loc>{loc}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n</urlset>")
    sitemap.write_text(xml, encoding="utf-8")


if __name__ == "__main__":
    build(pathlib.Path(__file__).resolve().parent.parent / "site")
