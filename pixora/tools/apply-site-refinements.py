#!/usr/bin/env python3
"""Apply the September 2026 design refinements to every page of the site.

The pages are build output of tools/build-deploy.js, which was not supplied,
so these changes are made to the output. Re-run this after any rebuild; it is
idempotent (running it twice changes nothing the second time):

    python3 pixora/tools/apply-site-refinements.py
    python3 pixora/tools/sync-shared-styles.py     # then carry them into /go

What it does, on index, pricing, about, story, privacy and 404:
  1. Spacing   — larger section / heading / CTA rhythm tokens.
  2. Buttons   — one shape (pill) and one height for every button, plus the
                 language switch, menu trigger, copy button and profile links.
  3. Ease      — press feedback, softer fields, and a WhatsApp button that
                 stays in reach on phones (uses the site's existing [data-wa]
                 wiring, so language switching and analytics already work).
  4. Profile   — Muhalab Basheir, Visual Communications Designer.

CSS only, plus markup: the inline scripts are untouched, so the script hashes
in .htaccess's Content-Security-Policy stay valid.
"""
import pathlib
import re
import sys

SITE = pathlib.Path(__file__).resolve().parent.parent / "site"
PAGES = ["index.html", "pricing.html", "about.html", "story.html", "privacy.html", "404.html"]

CSS_START, CSS_END = "/* REFINEMENTS:START */", "/* REFINEMENTS:END */"
CSS = CSS_START + """
@layer tokens{:root{
--section-space:clamp(5rem,3rem + 8.5vw,11rem);
--section-space-tight:clamp(3.75rem,2.5rem + 5.5vw,7.5rem);
--section-space-loose:clamp(6.5rem,3.5rem + 13vw,13rem);
--stack-heading-body:clamp(1.25rem,0.9rem + 1.6vw,2.25rem);
--stack-body-cta:clamp(2rem,1.4rem + 2.6vw,3.5rem);
--space-label-group:var(--space-32);
--control-height-button:52px;
--header-height-compact:72px}}
@layer components{
.c-btn,.c-btn--sm,.c-btn--lg,.c-header__cta,.is-compact .c-header__cta{min-block-size:var(--control-height-button);padding-inline:var(--space-32);border-radius:var(--radius-pill);font-size:var(--text-body-sm)}
.c-btn--icon{padding:0;inline-size:var(--control-height-button);aspect-ratio:1}
.c-btn:active{transform:scale(0.98)}
.c-lang,.c-lang__option,.c-menu-trigger,.c-channel__copy,.c-elsewhere__link,.c-skip-link{border-radius:var(--radius-pill)}
.c-field__control{border-radius:var(--radius-md)}
.c-detail__head{margin-block-end:var(--space-64)}
@media (min-width:64em){.c-detail__head{margin-block-end:var(--space-96)}}
.c-tiers,.c-brandboard,.c-modules,.c-devices{gap:var(--space-32)}
.c-contact{gap:var(--space-64)}
.c-channel{padding-block:var(--space-32)}
.c-verify{padding-block:var(--space-80)}
.c-footer__top{row-gap:var(--space-64)}
.c-wa-fab{position:fixed;inset-block-end:calc(var(--space-16) + env(safe-area-inset-bottom));inset-inline-end:var(--space-16);z-index:var(--z-sticky);display:grid;place-items:center;inline-size:56px;block-size:56px;border-radius:var(--radius-pill);background-color:var(--color-accent);color:var(--color-text-on-accent);box-shadow:var(--shadow-overlay);transition:var(--transition-interactive)}
.c-wa-fab:hover{background-color:var(--color-accent-hover)}
.c-wa-fab:active{transform:scale(0.96)}
.c-wa-fab svg{inline-size:26px;block-size:26px}
@media (min-width:64em){.c-wa-fab{display:none}}
@media print{.c-wa-fab{display:none}}
@media (min-width:64em){.c-hero__headline{font-size:max(2.75rem,min(var(--text-hero),12.5cqw))}}
.c-hero__actions{margin-block-start:var(--space-16)}
.c-hero__action{justify-content:center}
.c-hero__tease{color:var(--color-text-primary)}
}
""" + CSS_END

FAB_START, FAB_END = "<!-- WA-FAB:START -->", "<!-- WA-FAB:END -->"
WA = "https://wa.me/249962672192"
WA_EN = WA + "?text=Hi%20Pixora%20%E2%80%94%20I'd%20like%20to%20talk%20about%20a%20project."
WA_AR = WA + "?text=%D9%85%D8%B1%D8%AD%D8%A8%D9%8B%D8%A7%20%D8%A8%D9%8A%D9%83%D8%B3%D9%88%D8%B1%D8%A7%20%E2%80%94%20%D8%A3%D9%88%D8%AF%D9%91%20%D8%A7%D9%84%D8%AA%D8%AD%D8%AF%D8%AB%20%D8%B9%D9%86%20%D9%85%D8%B4%D8%B1%D9%88%D8%B9."
FAB = f"""{FAB_START}
    <!-- Phones only: WhatsApp stays one tap away on every page. [data-wa]
         hooks into the site's own script, which swaps the EN/AR message on a
         language change and records the tap as channel_tap. -->
    <a class="c-wa-fab" href="{WA_EN}" data-wa data-about="general"
      data-wa-en="{WA_EN}" data-wa-ar="{WA_AR}" target="_blank" rel="noopener noreferrer">
      <span class="u-visually-hidden"><span data-lang-copy="en">Message us on WhatsApp (opens in a new tab)</span><span data-lang-copy="ar" lang="ar">راسلنا على واتساب (يفتح في نافذة جديدة)</span></span>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.47-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.44-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.42.25-.69.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35m-5.42 7.4h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.82 11.82 0 0 0-3.48-8.41Z"/></svg>
    </a>
    {FAB_END}"""

TEXT = [
    ('<p class="c-verify__name">Muhalab Salah</p>', '<p class="c-verify__name">Muhalab Basheir</p>'),
    ('<span data-lang-copy="en">Founder — brand and web design</span><span data-lang-copy="ar" lang="ar">المؤسس — تصميم الهوية والمواقع</span>',
     '<span data-lang-copy="en">Visual Communications Designer</span><span data-lang-copy="ar" lang="ar">مصمم اتصال بصري</span>'),
    ('<strong>Muhalab Salah</strong>', '<strong>Muhalab Basheir</strong>'),
    ('<strong>مهلب صلاح</strong>', '<strong>مهلب بشير</strong>'),
    # Hero lead: shorter, and it leaves something to discover.
    ('''<p class="t-body-lg c-hero__lead"><span data-lang-copy="en">We build brands, websites and digital experiences —
              then connect them with content, social media and performance
              marketing to help your business grow.</span><span data-lang-copy="ar" lang="ar">نبني العلامات والمواقع والتجارب الرقمية، ثم نربطها بالمحتوى ووسائل التواصل والتسويق الأدائي لينمو عملك.</span></p>''',
     '''<p class="t-body-lg c-hero__lead"><span data-lang-copy="en">Brand, website, content and ads — from one team.<br /><span class="c-hero__tease">The difference? You'll see it at first glance.</span></span><span data-lang-copy="ar" lang="ar">هوية، موقع، محتوى وإعلانات — من فريق واحد.<br /><span class="c-hero__tease">والفرق؟ ستلاحظه من أول نظرة.</span></span></p>'''),
]

# A second hero action that answers the teaser: straight to the work.
HERO_WORK = '''<!-- HERO-WORK -->
              <a class="c-btn c-btn--secondary c-hero__action" href="#branding">
                <span data-lang-copy="en">See the work</span><span data-lang-copy="ar" lang="ar">شوف أعمالنا</span>
              </a>'''


def between(text, start, end, block):
    """Replace start…end with block, or return None if the markers are absent."""
    a, b = text.find(start), text.find(end)
    if a < 0 or b < 0:
        return None
    return text[:a] + block + text[b + len(end):]


for name in PAGES:
    path = SITE / name
    text = path.read_text(encoding="utf-8")
    before = text

    # 1–3. CSS, appended at the end of the page's one <style> block.
    replaced = between(text, CSS_START, CSS_END, CSS)
    if replaced is None:
        close = text.find("</style>")
        if close < 0:
            sys.exit(f"{name}: no <style> block")
        text = text[:close] + CSS + text[close:]
    else:
        text = replaced

    # 3. WhatsApp button, just before </body>.
    replaced = between(text, FAB_START, FAB_END, FAB)
    if replaced is None:
        close = text.rfind("</body>")
        text = text[:close] + "  " + FAB + "\n  " + text[close:]
    else:
        text = replaced

    # 3b. Hero: add "See the work" after the primary action (index only).
    actions = text.find('<div class="c-hero__actions">')
    if actions >= 0 and "<!-- HERO-WORK -->" not in text:
        end = text.find("</a>", actions) + len("</a>")
        text = text[:end] + "\n              " + HERO_WORK + text[end:]

    # 4. Profile.
    for old, new in TEXT:
        text = text.replace(old, new)

    if text != before:
        path.write_text(text, encoding="utf-8")
    print(f"{name}: {'updated' if text != before else 'already current'}")
