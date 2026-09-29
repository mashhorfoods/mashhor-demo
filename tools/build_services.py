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

Runs on the site/ copy of the supplied pages, before apply-site-refinements.
"""
import pathlib
import re

import common
from common import inject_css

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
    depth, i = 0, start
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
        s["visual"] = inner(acc[slice(*find(acc, r'<div class="c-service__visual"', "div"))])
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


def cards(data, skip=None):
    items = []
    for sid in SERVICES:
        if sid == skip:
            continue
        s = data[sid]
        chips = re.findall(r'<li\b[^>]*>(.*?)</li>', s["caps"], re.S)[:4]
        wide = " c-svc-card--wide" if sid == "integrated" and not skip else ""
        items.append(f'''            <li class="c-svc-card{wide}">
              <a class="c-svc-card__link" href="/services/{sid}" style="view-transition-name: svc-{sid}">
                <span class="c-svc-card__visual" aria-hidden="true">{s["visual"]}</span>
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
    return f'<ul class="c-svc-cards{four}" role="list" data-reveal-group>\n' + "\n".join(items) + "\n          </ul>"


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


def service_main(s, data, addon_groups):
    sid = s["id"]
    detail = s["detail"]
    container = inner(detail[slice(*find(detail, r'<div class="l-container">', "div"))])
    head_tag = "header" if re.search(r'<header class="c-detail__head"', container) else "div"
    ha, hb = find(container, r'<(?:div|header) class="c-detail__head"', head_tag)
    head = container[ha:hb]
    body = container[:ha] + container[hb:]
    # The page's own packages, actions and "see the packages" link replace these.
    body = cut(body, r'<p class="c-detail__packages"', "p")
    body = cut(body, r'<a class="c-btn c-btn--primary c-detail__action"', "a")
    if sid != "integrated":
        body = cut(body, r'<p class="c-detail__more"', "p")
    # The detail heading becomes the page heading.
    head = re.sub(r'<h2 class="c-detail__headline" id="[^"]*">', '<h1 class="c-detail__headline" id="svc-title">', head, 1)
    head = head.replace("</h2>", "</h1>", 1)

    crumbs = f'''<nav class="c-crumbs" aria-label="Breadcrumb">
            <ol class="c-crumbs__list" role="list">
              <li><a href="/">{bi("Home", "الرئيسية")}</a></li>
              <li><a href="/#services">{bi("Services", "خدماتنا")}</a></li>
              <li aria-current="page">{s["name"]}</li>
            </ol>
          </nav>'''

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
      <section class="l-section c-svc" aria-labelledby="svc-title">
        <div class="l-container">
          {crumbs}
          <div class="c-svc__hero" style="view-transition-name: svc-{sid}">
{head}
          {deal}
          </div>
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
    h = h.replace('content="https://zaokalyamamah.online/pricing"', f'content="{url}"')
    return h


CSS_START, CSS_END = "/* SERVICES:START */", "/* SERVICES:END */"
CSS = CSS_START + """
@layer components{
.c-svc-cards{display:grid;gap:var(--space-24);margin:var(--space-48) 0 0;padding:0;list-style:none}
@media (min-width:48em){.c-svc-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-32)}}
.c-svc-card--wide{grid-column:1 / -1}
.c-svc-card__link{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:var(--space-16);block-size:100%;padding:var(--space-32);border:var(--border-hairline);border-radius:var(--radius-lg);background-color:var(--color-bg-sunken);color:inherit;text-decoration:none;overflow:hidden;transition:border-color var(--duration-base) var(--ease-standard),transform var(--duration-base) var(--ease-out),background-color var(--duration-base) var(--ease-standard)}
.c-svc-card__link:hover,.c-svc-card__link:focus-visible{border-color:var(--color-border-accent);background-color:var(--color-surface)}
@media (prefers-reduced-motion:no-preference){.c-svc-card__link:hover{transform:translateY(-4px)}}
.c-svc-card__visual{display:block;inline-size:min(100%,13rem);color:var(--color-text-muted);margin-block-end:var(--space-8)}
.c-svc-card__visual svg{inline-size:100%;block-size:auto}
@media (min-width:64em){.c-svc-card--wide .c-svc-card__link{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:var(--space-64);align-items:center}.c-svc-card--wide .c-svc-card__visual{grid-column:2;grid-row:1 / span 6;inline-size:14rem}.c-svc-card--wide .c-svc-card__link>:not(.c-svc-card__visual){grid-column:1}.c-svc-card--wide .c-svc-card__foot{margin-block-start:var(--space-8)}}
.c-svc-card__index{font-family:var(--font-display);font-size:var(--text-label);letter-spacing:var(--tracking-label);color:var(--color-accent)}
.c-svc-card__name{font-family:var(--font-display);font-size:var(--text-h3);font-weight:var(--weight-bold);line-height:var(--leading-heading);color:var(--color-text-primary)}
.c-svc-card__summary{color:var(--color-text-secondary)}
.c-svc-card__chips{display:flex;flex-wrap:wrap;gap:var(--space-8)}
.c-svc-card__chip{display:inline-flex;align-items:center;min-block-size:30px;padding-inline:var(--space-12);border:var(--border-hairline);border-radius:var(--radius-pill);font-size:var(--text-small);color:var(--color-text-secondary)}
.c-svc-card__foot{align-self:stretch;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--space-12);margin-block-start:auto;padding-block-start:var(--space-16);border-block-start:var(--border-hairline)}
.c-svc-card__price{font-size:var(--text-body-sm);color:var(--color-text-muted)}
.c-svc-card__amount{font-family:var(--font-display);font-size:var(--text-h4);font-weight:var(--weight-bold);color:var(--color-text-primary)}
.c-svc-card__go{display:inline-flex;align-items:center;gap:var(--space-8);font-weight:var(--weight-semibold);color:var(--color-accent)}
.c-svc-card__go .c-btn__icon{inline-size:var(--icon-sm);block-size:var(--icon-sm)}
.c-crumbs{margin-block-end:var(--space-40)}
.c-crumbs__list{display:flex;flex-wrap:wrap;gap:var(--space-8);margin:0;padding:0;list-style:none;font-size:var(--text-small);color:var(--color-text-muted)}
.c-crumbs__list li+li::before{content:"/";margin-inline-end:var(--space-8);opacity:0.5}
.c-crumbs__list a{color:var(--color-text-secondary);text-decoration:none}
.c-crumbs__list a:hover{color:var(--color-accent)}
.c-crumbs__list [aria-current]{color:var(--color-text-primary)}
.c-svc{padding-block:calc(var(--header-height) + var(--space-48)) var(--space-48)}
.c-svc__body{padding-block-start:var(--space-24)}

.c-svc__hero{display:grid;gap:var(--space-40)}
.c-svc__hero .c-detail__head{margin-block-end:0}
.c-svc__deal{display:grid;gap:var(--space-24);padding:var(--space-32);border:var(--border-hairline);border-radius:var(--radius-lg);background-color:var(--color-bg-sunken)}
@media (min-width:64em){.c-svc__deal{grid-template-columns:minmax(0,1fr) auto;align-items:center;padding:var(--space-40) var(--space-48)}}
.c-svc__deal .c-detail__packages{margin:0}
.c-svc__deal-note{color:var(--color-text-secondary);max-inline-size:40ch}
.c-svc__actions{display:flex;flex-wrap:wrap;gap:var(--space-12)}
@media (max-width:47.99em){.c-svc__actions .c-btn{flex:1 1 100%}}
.c-svc__head{display:grid;gap:var(--space-12);margin-block-end:var(--space-48)}
.c-svc__h2{font-family:var(--font-display);font-size:var(--text-h2);font-weight:var(--weight-bold);line-height:var(--leading-heading)}
.c-svc__covers{display:grid;gap:var(--space-24);margin-block-start:var(--space-64)}
.c-svc__caps{display:flex;flex-wrap:wrap;gap:var(--space-12);margin:0;padding:0;list-style:none}
.c-svc__caps .c-service__cap{display:inline-flex;align-items:center;min-block-size:44px;padding-inline:var(--space-24);border:var(--border-hairline);border-radius:var(--radius-pill);background-color:var(--color-bg-sunken)}
.c-svc__packages .c-page__note{max-inline-size:62ch;margin-block-end:var(--space-40);color:var(--color-text-secondary)}
.c-svc__next{padding-block-start:var(--space-24)}
.c-svc__next .c-quote{margin-block-end:var(--space-96)}
.c-svc__next .c-quote .c-svc__actions{align-self:center}
.c-svc__more-title{margin-block-end:0}
.c-svc__next .c-svc-cards{margin-block-start:var(--space-24)}
}
""" + CSS_END


# ---------------------------------------------------------------------------
# The three changes.
# ---------------------------------------------------------------------------
def build(site: pathlib.Path):
    home = (site / "index.html").read_text(encoding="utf-8")
    pricing = (site / "pricing.html").read_text(encoding="utf-8")
    data = read_services(home, pricing)
    addons_section, addon_groups = read_addons(home)

    # 1. Service pages, built on the pricing page's shell (head, header,
    #    verification band, footer, script) so they are the site's own pages.
    main_a = pricing.index('<main id="main">') + len('<main id="main">')
    main_b = pricing.index("</main>")
    (site / "services").mkdir(exist_ok=True)
    for sid in SERVICES:
        s = data[sid]
        page = page_head(pricing[:main_a], s) + service_main(s, data, addon_groups) + "    " + pricing[main_b:]
        page = page.replace('id="pricing-title"', 'id="svc-page-title"')
        (site / "services" / f"{sid}.html").write_text(page, encoding="utf-8")

    # 2. Homepage: one services section of cards; the accordion, the detail
    #    sections and the add-ons leave.
    a, b = find(home, r'<div class="c-service-list"', "div")
    home = home[:a] + cards(data) + home[b:]
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
    pages = list(site.glob("*.html")) + list((site / "services").glob("*.html"))
    for path in pages:
        if path.name == "go.html":
            continue
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
