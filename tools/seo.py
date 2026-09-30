#!/usr/bin/env python3
"""How the pages read to search engines and link previews.

Runs after every page is built (before finalize.py). Everything it writes is
read from the pages themselves — names, descriptions, prices, images — so it
stays true when they change; when a page no longer has what it expects, the
build stops and says which.

  - titles that say what a page offers and where (the English title; the
    site script still switches to title-ar in Arabic);
  - link previews that describe the page they share, not the homepage;
  - structured data: the organisation and the site on the homepage, each
    service with its packages and prices, each case study as a creative
    work by Pixora;
  - a last-modified date on every sitemap entry.

No hreflang: both languages live at the same address (the page switches
between them), and hreflang is only for languages at different addresses.
"""
import json
import pathlib
import re
import subprocess
import sys

from cases import CASES, FEATURED
from case_stories import STORIES

ORIGIN = "https://zaokalyamamah.online"
ORG = f"{ORIGIN}/#organization"
AREA = ["Saudi Arabia", "United Arab Emirates", "Egypt", "Oman", "Sudan"]

TITLES = {
    "about.html": "About Pixora — One Team for Your Whole Brand",
    "pricing.html": "Pricing — Branding, Website &amp; Ad Packages | Pixora",
    "work.html": "Case Studies — Identity, Editorial &amp; Digital Work | Pixora",
    "story.html": "Al Mada Travel — One Brand, Four Surfaces | Pixora",
}

# The Arabic titles (title-ar; the site script shows them in Arabic).
TITLES_AR = {
    "about.html": "من نحن — فريق واحد لعلامتك كاملة | بيكسورا",
    "pricing.html": "الأسعار — باقات الهوية والمواقع والإعلانات | بيكسورا",
    "work.html": "دراسات الحالة — أعمال الهوية والتحرير والرقمي | بيكسورا",
}


# Arabic link-preview text: the English descriptions, translated (no new
# claims). Case studies take the Arabic summary from cases.CASES.
DESC_AR = {
    "index.html": "الهوية والتصميم، والمواقع، وإدارة وسائل التواصل، والإعلانات الرقمية — تُنجَز معًا، مع شريك واحد.",
    "about.html": "بيكسورا استوديو رقمي للخليج ومصر: هوية ومواقع ومحتوى ووسائل تواصل وإعلانات، يصنعها فريق واحد بالعربية والإنجليزية.",
    "accessibility.html": "ما اختُبر عليه هذا الموقع، وما لم يُختبر، وكيف تخبرنا حين لا يعمل شيء.",
    "pricing.html": "ما الذي يحرّك السعر، وكل الإضافات، وأداة لتكوين باقتك بنفسك، وكيف تتم الفوترة.",
    "privacy.html": "ما يجمعه هذا الموقع، وما لا يجمعه، وكيف تتواصل معنا بشأنه.",
    "terms.html": "مع من تتعامل، وماذا يعني السعر المنشور، وكيف يتم الدفع والتعديلات، ولمن تعود الملكية.",
    "work.html": "دراسات حالة من بيكسورا: أعمال في الهوية والتحرير والمعلومات والرقمي، تُروى كلٌّ منها من المشكلة حتى ما تغيّر.",
    "story.html": "هوية وموقع وحملات وملف تعريفي لوكالة المدى للسفر والسياحة — أربع واجهات تشتريها معظم الشركات من أربعة موردين.",
    "services/branding.html": "شعار وهوية وأنظمة بصرية تمنح عملك مظهرًا واحدًا متسقًا في كل قناة.",
    "services/websites.html": "تصميم وبناء وإطلاق — نسلّمك موقعًا يعمل، مع ترتيب النطاق والاستضافة.",
    "services/social.html": "استراتيجية ومحتوى ونشر عبر قنواتك، مع متابعة التفاعل وتحليل الأداء.",
    "services/marketing.html": "حملات مدفوعة على المنصات الرئيسية، مع استهداف الجمهور وإدارة الحملات وتحسينها وتتبّعها.",
    "services/integrated.html": "العرض المتكامل كله، يُدار كنظام واحد من الهوية حتى النمو، لا كمشاريع منفصلة.",
}

def set_title_ar(text, title, page):
    return set_meta(text, "name", "title-ar", title, page)


def fail(page, what):
    sys.exit(f"seo: {page}: {what} not found")


def meta(text, attr, name):
    m = re.search(rf'<meta\s+{attr}="{re.escape(name)}"\s+content="([^"]*)"', text)
    return m.group(1) if m else None


def set_meta(text, attr, name, value, page):
    new, n = re.subn(rf'(<meta\s+{attr}="{re.escape(name)}"\s+content=")[^"]*(")', lambda m: m.group(1) + value + m.group(2), text, count=1)
    if n != 1:
        fail(page, f'<meta {attr}="{name}">')
    return new


def set_title(text, title, page):
    text, n = re.subn(r"<title>.*?</title>", f"<title>{title}</title>", text, count=1, flags=re.S)
    if n != 1:
        fail(page, "<title>")
    if meta(text, "property", "og:title") is not None:
        text = set_meta(text, "property", "og:title", title, page)
    return text


def ld(data):
    """A JSON-LD block; '<' escaped so no text can close the script early."""
    return ('<script type="application/ld+json">'
            + json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
            + "</script>")


def add_ld(text, data, page):
    if "</head>" not in text:
        fail(page, "</head>")
    return text.replace("</head>", "  " + ld(data) + "\n  </head>", 1)


def plain(html):
    return re.sub(r"<[^>]+>", "", html).replace("&amp;", "&").strip()


def service(text, page):
    """The service's name, packages and prices, as its page shows them."""
    name = re.search(r'<meta\s+property="og:title"\s+content="([^"]*?) — Pixora"', text)
    if not name:
        fail(page, "service name in og:title")
    name = name.group(1).replace("&amp;", "&")
    offers = []
    for tier in re.finditer(r'<article class="c-tier[^"]*".*?</article>', text, re.S):
        t = tier.group(0)
        tier_name = re.search(r'<h3 class="c-tier__name"[^>]*>(.*?)</h3>', t, re.S)
        amount = re.search(r'<span class="c-tier__amount">([\d,]+)</span>', t)
        purpose = re.search(r'<p class="c-tier__purpose"><span data-lang-copy="en">(.*?)</span>', t, re.S)
        if not (tier_name and amount):
            fail(page, "a package's name or price")
        price = amount.group(1).replace(",", "")
        offer = {"@type": "Offer", "name": plain(tier_name.group(1)), "price": price, "priceCurrency": "USD",
                 "url": f"{ORIGIN}/{page[:-5]}#packages"}
        if purpose:
            offer["description"] = plain(purpose.group(1))
        if 'data-i18n="billingMonthly"' in t or ">Monthly<" in t:
            offer["priceSpecification"] = {"@type": "UnitPriceSpecification", "price": price, "priceCurrency": "USD", "unitText": "MONTH"}
        offers.append(offer)
    return name, offers


def build(site: pathlib.Path):
    try:
        date = subprocess.run(["git", "log", "-1", "--format=%cs"], capture_output=True, text=True,
                              cwd=pathlib.Path(__file__).resolve().parent, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        date = ""

    for path in sorted(site.glob("*.html")) + sorted(site.glob("*/*.html")):
        page = str(path.relative_to(site))
        if page.startswith("admin/") or page in ("404.html", "go.html"):
            continue
        text = path.read_text(encoding="utf-8")
        desc = meta(text, "name", "description")
        if not desc:
            fail(page, "the description")
        # A shared link describes the page shared (story.html keeps its own
        # line in English); the preview carries it in Arabic first, then in
        # English — both languages share this address, and most shares are
        # Arabic.
        og_en = meta(text, "property", "og:description") if page == "story.html" else desc
        if page.startswith("work/"):
            ar = plain(next(c for c in CASES if c["slug"] == page[5:-5])["summary"][1])
        else:
            ar = DESC_AR.get(page)
        if not ar:
            fail(page, "its Arabic preview text (seo.DESC_AR)")
        if meta(text, "property", "og:description") is not None:
            text = set_meta(text, "property", "og:description", f"{ar} | {og_en}", page)
        url = f"{ORIGIN}/" + ("" if page == "index.html" else page[:-5])
        image = meta(text, "property", "og:image")

        if page in TITLES:
            text = set_title(text, TITLES[page], page)
        if page in TITLES_AR:
            text = set_title_ar(text, TITLES_AR[page], page)

        if page == "index.html":
            m = re.search(r'<script type="application/ld\+json">(.*?)</script>', text, re.S)
            if not m:
                fail(page, "the organisation's structured data")
            org = json.loads(m.group(1))
            org.update({"@id": ORG, "logo": f"{ORIGIN}/assets/apple-touch-icon.png", "areaServed": AREA})
            site_ld = {"@context": "https://schema.org", "@type": "WebSite", "@id": f"{ORIGIN}/#website", "url": f"{ORIGIN}/",
                       "name": "Pixora", "alternateName": ["بيكسورا", "Pixora Digital Agency"], "inLanguage": ["en", "ar"], "publisher": {"@id": ORG}}
            text = text.replace(m.group(0), ld(org) + "\n    " + ld(site_ld), 1)

        elif page.startswith("services/"):
            name, offers = service(text, page)
            text = set_title(text, f"{name} — Packages from {min(int(o['price']) for o in offers)} USD | Pixora" if offers
                             else f"{name} — One Team | Pixora", page)
            name_ar = (meta(text, "name", "title-ar") or "").split(" — ")[0]
            if not name_ar:
                fail(page, "its Arabic title")
            text = set_title_ar(text, f"{name_ar} — باقات تبدأ من {min(int(o['price']) for o in offers)} دولار | بيكسورا" if offers
                                else f"{name_ar} — فريق واحد | بيكسورا", page)
            data = {"@context": "https://schema.org", "@type": "Service", "name": name, "serviceType": name,
                    "description": desc, "url": url, "provider": {"@id": ORG}, "areaServed": AREA,
                    "availableLanguage": ["en", "ar"]}
            if image:
                data["image"] = image
            if offers:
                data["offers"] = offers
            text = add_ld(text, data, page)

        elif page.startswith("work/"):
            slug = page[5:-5]
            case = next((c for c in CASES if c["slug"] == slug), None)
            if not case:
                fail(page, "its study in cases.CASES")
            title_en = plain(case["title"][0])
            text = set_title(text, f"{title_en} — Case Study | Pixora", page)
            text = set_title_ar(text, f"{plain(case['title'][1])} — دراسة حالة | بيكسورا", page)
            data = {"@context": "https://schema.org", "@type": "CreativeWork", "name": title_en,
                    "headline": plain(STORIES[slug]["headline"][0]), "description": desc, "url": url,
                    "genre": plain(case["category"][0]), "inLanguage": ["en", "ar"],
                    "author": {"@type": "Organization", "@id": ORG, "name": "Pixora"}, "publisher": {"@id": ORG}}
            if image:
                data["image"] = image
            text = add_ld(text, data, page)

        elif page == "story.html":
            data = {"@context": "https://schema.org", "@type": "CreativeWork", "name": plain(FEATURED["title"][0]),
                    "headline": "Al Mada Travel & Tourism — one brand, four surfaces", "description": desc, "url": url,
                    "genre": "Case study", "inLanguage": ["en", "ar"],
                    "about": {"@type": "Organization", "name": "Al Mada Travel & Tourism Agency", "alternateName": "المدى للسفر والسياحة"},
                    "author": {"@type": "Organization", "@id": ORG, "name": "Pixora"}, "publisher": {"@id": ORG}}
            if image:
                data["image"] = image
            text = add_ld(text, data, page)

        # The preview's title: the page's Arabic name first, then the English
        # title (the tab keeps one language at a time; a preview cannot).
        name_ar = (meta(text, "name", "title-ar") or "").split(" — ")[0].split(" | ")[0]
        title_en = re.search(r"<title>(.*?)</title>", text, re.S).group(1)
        if name_ar and meta(text, "property", "og:title") is not None:
            text = set_meta(text, "property", "og:title", f"{name_ar} | {title_en}", page)
        path.write_text(text, encoding="utf-8")

    # Every sitemap entry says when it last changed (the commit the site was
    # built from; the entries that had none are the newer pages).
    sitemap = site / "sitemap.xml"
    xml = sitemap.read_text(encoding="utf-8")
    if date:
        xml = re.sub(r"<lastmod>[^<]*</lastmod>", f"<lastmod>{date}</lastmod>", xml)
        xml = re.sub(r"(<loc>[^<]*</loc>)(?!\s*<lastmod>)", rf"\1\n    <lastmod>{date}</lastmod>", xml)
    sitemap.write_text(xml, encoding="utf-8")


if __name__ == "__main__":
    build(pathlib.Path(__file__).resolve().parent.parent / "site")
