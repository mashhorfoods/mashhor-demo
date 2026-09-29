#!/usr/bin/env python3
"""Less to read, nothing said twice, sections in the order a visitor needs them.

Runs after build_services.py and before apply-site-refinements.py.

Homepage order:  hero → services → recent work (Al Mada) → selected work →
                 brand challenge → questions → contact
Removed:         "Process" (and its menu/footer links), the "Campaigns"
                 section and the showreel — both are placeholder artwork until
                 the real files exist (they stay in source/ and come back by
                 deleting their line in PLACEHOLDERS below).
Said once:       "you deal with the person doing the work" lives in the
                 "Who you are talking to" band on every page; the FAQ entry
                 and the note under the contact form that repeated it go.
Shorter:         the section introductions on the homepage; the service pages
                 drop the paragraph that restated their own lead.
"""
import pathlib
import re

from build_services import element, find, inner, bi

ORDER = ["home", "services", "proof", "work", "challenge", "faq", "contact"]
PLACEHOLDERS = ["campaigns"]          # sections whose artwork is still placeholder

LEADS = {
    "c-services__lead": ("Five services, one partner. Pick one for what it covers and what it costs.",
                         "خمس خدمات وشريك واحد. اختر أيًا منها لترى ما تشمله وكم تكلّف."),
    "c-proof__lead": ("Identity, website, campaigns and company profile for Al Mada Travel — one brand, four touchpoints.",
                      "هوية وموقع وحملات وملف تعريفي لوكالة المدى للسفر — علامة واحدة في أربع واجهات."),
    "c-showcase__lead": ("Recent identity work — marks, print, signage and the spaces they live in.",
                         "أعمال هوية حديثة — شعارات ومطبوعات ولافتات والمساحات التي تعيش فيها."),
}
CONTACT_LEAD = ("WhatsApp, a call or an email — whichever is easiest.",
                "واتساب أو اتصال أو بريد — الأسهل لك.")


def section_span(html, key):
    """(start, end) of a top-level homepage section by id or by class."""
    patterns = {
        "home": r'<section id="home"',
        "proof": r'<section class="l-section l-section--tight l-section--flush-top c-proof"',
        "challenge": r'<section class="l-section c-challenge"',
    }
    return find(html, patterns.get(key, rf'<section id="{key}"'), "section")


def streamline_home(home):
    # 1. Out: process and the placeholder sections.
    for key in ["process", *PLACEHOLDERS]:
        try:
            a, b = section_span(home, key)
            home = home[:a] + home[b:]
        except ValueError:
            pass
    # The showreel is placeholder footage too.
    try:
        a, b = find(home, r'<figure class="c-reel"', "figure")
        home = home[:a] + home[b:]
    except ValueError:
        pass

    # 2. Reorder: lift every section out (last first, so earlier offsets
    #    hold), then put them back in ORDER where the first one stood.
    spans = sorted(section_span(home, k) + (k,) for k in ORDER)
    blocks = {k: home[a:b] for a, b, k in spans}
    for a, b, _ in reversed(spans):
        home = home[:a] + home[b:]
    at = spans[0][0]
    home = home[:at] + "\n      ".join(blocks[k] for k in ORDER) + home[at:]

    # 3. Say it once.
    home = re.sub(r'<p class="c-contact__next">.*?</p>', "", home, count=1, flags=re.S)
    faq = re.search(r'<li class="c-faq__item">(?:(?!</li>).)*?مع من سأتعامل فعليًا.*?</li>', home, re.S)
    if faq:
        home = home.replace(faq.group(0), "", 1)

    # 4. Shorter introductions.
    for cls, (en, ar) in LEADS.items():
        home = re.sub(rf'(<p class="t-body-lg {cls}">).*?(</p>)', lambda m: m.group(1) + bi(en, ar) + m.group(2), home, count=1, flags=re.S)
    a, b = section_span(home, "contact")
    contact = re.sub(r'(<p class="t-body-lg c-detail__lead">).*?(</p>)', lambda m: m.group(1) + bi(*CONTACT_LEAD) + m.group(2), home[a:b], count=1, flags=re.S)
    home = home[:a] + contact + home[b:]

    # 5. Section numbers follow the new order.
    n = iter(range(1, 100))
    return re.sub(r'(<span class="c-detail__number">)\d+(</span>)', lambda m: f"{m.group(1)}{next(n):02d}{m.group(2)}", home)


def drop_process_links(page):
    page = re.sub(r'\s*<li><a class="c-(?:nav__link|link)" href="(?:\./|/)?#process" data-nav-link>Process</a></li>', "", page)
    return page.replace("  { id: 'process', label: 'Process', labelAr: 'آلية العمل', inNav: false, inMenu: true },\n", "")


def build(site: pathlib.Path):
    home_path = site / "index.html"
    home_path.write_text(streamline_home(home_path.read_text(encoding="utf-8")), encoding="utf-8")

    for path in list(site.glob("*.html")) + list((site / "services").glob("*.html")):
        if path.name == "go.html":
            continue
        text = path.read_text(encoding="utf-8")
        new = drop_process_links(text)
        if path.parent.name == "services":
            # The "what it covers" list keeps its chips; its paragraph repeated the lead.
            new = re.sub(r'(<div class="c-svc__covers">\s*<h2[^>]*>.*?</h2>)\s*<p class="t-body-lg">.*?</p>', r"\1", new, count=1, flags=re.S)
        if new != text:
            path.write_text(new, encoding="utf-8")


if __name__ == "__main__":
    build(pathlib.Path(__file__).resolve().parent.parent / "site")
