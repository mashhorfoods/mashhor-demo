#!/usr/bin/env python3
"""Apply the agreed design refinements to every page of the Pixora site.

The pages are build output of a generator that is not part of this
repository, so the changes are made to the output. Step 3 of tools/build.py,
which always runs it on a fresh copy of source/. A replacement whose text is
no longer in the supplied site stops the build rather than being skipped.

On index, pricing, about, story, privacy, terms, accessibility and 404:
  1. Spacing   — larger section / heading / CTA rhythm.
  2. Buttons   — one shape (pill) and one height for every button, plus the
                 language switch, menu trigger, copy button and link chips.
  3. Ease      — press feedback, softer fields, a WhatsApp button that stays
                 in reach on phones (wired through the site's own [data-wa]
                 handling: EN/AR message swap and channel_tap analytics).
  4. Hero      — shorter lead with a teaser line; headline sized like /go.
  5. Profile   — Muhalab Basheir, Visual Communications Designer.
  6. Privacy   — describes the campaign form (it has a server; the main
                 contact form still does not).
  7. Links     — root-based everywhere ("/pricing", "/#contact",
                 "/assets/…"), including the font files and the site
                 script's menu. Root-based matters on 404.html, which is
                 served at whatever wrong address was typed, and in /admin/.
Then: robots.txt keeps /admin, /lead.php and /_leads out of search, and
.htaccess gains 301s from old *.html addresses. (The Content-Security-Policy
script hashes are written last, by finalize.py.)
"""
import pathlib
import re
import sys

from common import WA, inject_css

SITE = pathlib.Path(__file__).resolve().parent.parent / "site"
# Every page of the site (the service pages included) except the campaign
# page, which carries its own styles and copy.
PAGES = sorted(str(p.relative_to(SITE)) for p in list(SITE.glob("*.html")) + list(SITE.glob("services/*.html"))
               if p.name != "go.html")

CSS_START, CSS_END = "/* REFINEMENTS:START */", "/* REFINEMENTS:END */"
CSS = CSS_START + """
@layer tokens{:root{
--section-space:clamp(5rem,3rem + 8.5vw,11rem);
--section-space-tight:clamp(3.75rem,2.5rem + 5.5vw,7.5rem);
--section-space-loose:clamp(6.5rem,3.5rem + 13vw,13rem);
--stack-heading-body:clamp(1.25rem,0.9rem + 1.6vw,2.25rem);
--stack-body-cta:clamp(2rem,1.4rem + 2.6vw,3.5rem);
--space-label-group:var(--space-32);
--control-height-button:52px}}
@layer components{
.c-btn,.c-btn--sm,.c-btn--lg,.c-header__cta,.is-compact .c-header__cta{min-block-size:var(--control-height-button);padding-inline:var(--space-32);border-radius:var(--radius-pill);font-size:var(--text-body-sm)}
.c-btn--icon{padding:0;inline-size:var(--control-height-button);aspect-ratio:1}
.c-btn:active{transform:scale(0.98)}
.c-lang,.c-lang__option,.c-menu-trigger,.c-channel__copy,.c-elsewhere__link,.c-skip-link{border-radius:var(--radius-pill)}
.c-field__control{border-radius:var(--radius-md)}
.c-detail__head{margin-block-end:var(--space-64)}
@media (min-width:64em){.c-detail__head{margin-block-end:var(--space-96)}}
.c-tiers,.c-brandboard,.c-modules,.c-devices,.c-bento{gap:var(--space-32)}
.c-contact{gap:var(--space-64)}
.c-channel{padding-block:var(--space-32)}
.c-verify{padding-block:var(--space-80)}
.c-footer__top{row-gap:var(--space-64)}
.c-hero__actions{margin-block-start:var(--space-16)}
.c-hero__actions .c-btn{justify-content:center}
.c-hero__tease{color:var(--color-text-primary)}
@media (min-width:64em){.c-hero__headline{font-size:max(2.75rem,min(var(--text-hero),12.5cqw))}}
.c-wa-fab{position:fixed;inset-block-end:calc(var(--space-16) + env(safe-area-inset-bottom));inset-inline-end:var(--space-16);z-index:var(--z-sticky);display:grid;place-items:center;inline-size:56px;block-size:56px;border-radius:var(--radius-pill);background-color:var(--color-accent);color:var(--color-text-on-accent);box-shadow:var(--shadow-overlay);transition:var(--transition-interactive)}
.c-wa-fab:hover{background-color:var(--color-accent-hover)}
/* When the phone's "Start your project" bar is showing, the button sits above it. */
.c-phone-cta.is-on~.c-wa-fab{inset-block-end:calc(var(--control-height) + var(--space-12) * 3 + env(safe-area-inset-bottom))}
@media (prefers-reduced-motion:no-preference){.c-wa-fab{transition:var(--transition-interactive),inset-block-end var(--duration-base) var(--ease-out)}}
.c-wa-fab:active{transform:scale(0.96)}
.c-wa-fab svg{inline-size:26px;block-size:26px}
@media (min-width:64em){.c-wa-fab{display:none}}
@media print{.c-wa-fab{display:none}}
}
""" + CSS_END

FAB_START, FAB_END = "<!-- WA-FAB:START -->", "<!-- WA-FAB:END -->"
WA_EN = WA + "?text=Hi%20Pixora%20%E2%80%94%20I%27d%20like%20to%20start%20a%20project."
WA_AR = WA + "?text=%D9%85%D8%B1%D8%AD%D8%A8%D9%8B%D8%A7%20%D8%A8%D9%8A%D9%83%D8%B3%D9%88%D8%B1%D8%A7%20%E2%80%94%20%D8%A3%D9%88%D8%AF%D9%91%20%D8%A7%D9%84%D8%AA%D8%AD%D8%AF%D8%AB%20%D8%B9%D9%86%20%D9%85%D8%B4%D8%B1%D9%88%D8%B9."
FAB = f"""{FAB_START}
    <!-- Phones only: WhatsApp one tap away on every page. [data-wa] hooks
         into the site's own script (EN/AR message swap, channel_tap). -->
    <a class="c-wa-fab" href="{WA_EN}" data-wa data-about="general"
      data-wa-en="{WA_EN}" data-wa-ar="{WA_AR}" target="_blank" rel="noopener noreferrer">
      <span class="u-visually-hidden"><span data-lang-copy="en">Message us on WhatsApp (opens in a new tab)</span><span data-lang-copy="ar" lang="ar">راسلنا على واتساب (يفتح في نافذة جديدة)</span></span>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.47-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.44-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.42.25-.69.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35m-5.42 7.4h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.82 11.82 0 0 0-3.48-8.41Z"/></svg>
    </a>
    {FAB_END}"""

# (old, new) — applied wherever the old text occurs; a pair that should hit a
# page but finds neither side is reported, so a changed source is noticed.
TEXT = [
    # Profile.
    ('<span data-lang-copy="en">Founder — brand and web design</span><span data-lang-copy="ar" lang="ar">المؤسس — تصميم الهوية والمواقع</span>',
     '<span data-lang-copy="en">Visual Communications Designer</span><span data-lang-copy="ar" lang="ar">مصمم اتصال بصري</span>'),
    ("Muhalab Salah", "Muhalab Basheir"),
    ("مهلب صلاح", "مهلب بشير"),
    # Link preview: the homepage card (tools/share-cards/home.html).
    ("https://zaokalyamamah.online/assets/share-card.jpg", "https://zaokalyamamah.online/assets/share-home.jpg"),
    ('<meta property="og:image:alt" content="Pixora — your brand, your digital presence, one partner" />',
     '<meta property="og:image:alt" content="Pixora — علامتك. حضورك الرقمي. شريك واحد. Your brand, your digital presence, one partner." />'),
    # Hero: shorter, and it leaves something to discover.
    ('''<p class="t-body-lg c-hero__lead"><span data-lang-copy="en">A remote studio for the Gulf and Egypt.
              We build brands, websites and digital experiences —
              then connect them with content, social media and performance
              marketing to help your business grow.</span><span data-lang-copy="ar" lang="ar">استوديو يعمل عن بُعد في الخليج ومصر. نبني العلامات والمواقع والتجارب الرقمية، ثم نربطها بالمحتوى ووسائل التواصل والتسويق الأدائي لينمو عملك.</span></p>''',
     '''<p class="t-body-lg c-hero__lead"><span data-lang-copy="en">Brand, website, content and ads — from one team.<br /><span class="c-hero__tease">The difference? You'll see it at first glance.</span></span><span data-lang-copy="ar" lang="ar">هوية، موقع، محتوى وإعلانات — من فريق واحد.<br /><span class="c-hero__tease">والفرق؟ ستلاحظه من أول نظرة.</span></span></p>'''),
]

# Privacy: the campaign form (go.html → lead.php) does reach a server.
PRIVACY = [
    ('Last updated: 4 September 2026', 'Last updated: 29 September 2026'),
    ('آخر تحديث: 4 سبتمبر 2026', 'آخر تحديث: 29 سبتمبر 2026'),
    ('''and you send it yourself.</span><span data-lang-copy="ar" lang="ar">نموذج التواصل لا يقف خلفه خادم. الضغط على «إرسال» يفتح تطبيق البريد لديك والرسالة جاهزة — اسمك وبريدك وما كتبته تنتقل عبر مزوّد بريدك إلى صندوقنا، تمامًا كأي رسالة ترسلها. وأزرار الباقات تعمل بالطريقة نفسها عبر واتساب: تُكتب الرسالة من أجلك، وترسلها أنت بنفسك.</span></p>''',
     '''and you send it yourself.</span><span data-lang-copy="ar" lang="ar">نموذج التواصل لا يقف خلفه خادم. الضغط على «إرسال» يفتح تطبيق البريد لديك والرسالة جاهزة — اسمك وبريدك وما كتبته تنتقل عبر مزوّد بريدك إلى صندوقنا، تمامًا كأي رسالة ترسلها. وأزرار الباقات تعمل بالطريقة نفسها عبر واتساب: تُكتب الرسالة من أجلك، وترسلها أنت بنفسك.</span></p>
            <p><span data-lang-copy="en">One exception: the short request form on our campaign page (the page our ads link to) does send to
              our server, so that we can confirm it arrived. It holds your name, your WhatsApp number, your country or
              city, the service you chose and your note, together with the ad or link that brought you (for example
              "Snapchat, autumn campaign") and a short reference code. It is emailed to us and kept in a file on our
              host that is not reachable from the web. We use it for one thing: to contact you about your
              request.</span><span data-lang-copy="ar" lang="ar">استثناء واحد: نموذج الطلب القصير في صفحة الحملة (الصفحة التي تقود إليها إعلاناتنا) يُرسَل إلى خادمنا، لنتمكن من تأكيد وصوله. يحمل اسمك ورقم واتساب ودولتك أو مدينتك والخدمة التي اخترتها وملاحظتك، مع الإعلان أو الرابط الذي أوصلك إلينا (مثل «سناب شات، حملة الخريف») ورقمًا مرجعيًا قصيرًا. يصلنا بالبريد ويُحفظ في ملف لدى مستضيفنا لا يمكن الوصول إليه من الإنترنت. ونستخدمه لغرض واحد: التواصل معك بخصوص طلبك.</span></p>'''),
    ('''not a word of a message.</span><span''', '''not a word of a message. On the campaign page it also counts which ad or link a visit came from, the kind of
              device (phone, tablet or computer) and whether the visitor chose our work or the contact options — again
              only as totals.</span><span'''),
    ('''ولا يُقاس أبدًا ما يُكتب في النموذج — لا اسم ولا بريد ولا كلمة من الرسالة.</span>''',
     '''ولا يُقاس أبدًا ما يُكتب في النموذج — لا اسم ولا بريد ولا كلمة من الرسالة. وفي صفحة الحملة يُحتسب كذلك الإعلان أو الرابط الذي جاءت منه الزيارة، ونوع الجهاز (جوال أو جهاز لوحي أو حاسوب)، وهل اختار الزائر أعمالنا أم خيارات التواصل — أرقامًا مجمّعة فقط.</span>'''),
    ('Two small things, and neither is sent anywhere:', 'A few small things, and none of them is sent anywhere unless you send us a message or request:'),
    ('شيئان صغيران لا يُرسل أيٌّ منهما إلى أي مكان:', 'أشياء صغيرة لا يُرسل أيٌّ منها إلى أي مكان ما لم ترسل إلينا رسالة أو طلبًا:'),
    ('Our host serves the pages. That is the whole', 'Our host serves the pages and holds the campaign requests described above. That is the whole'),
    ('ومستضيفنا يقدّم الصفحات. هذه', 'ومستضيفنا يقدّم الصفحات ويحفظ طلبات صفحة الحملة الموصوفة أعلاه. هذه'),
]


def clean_links(text):
    """Every "./x" link, asset, font and script path becomes root-based "/x"."""
    text = re.sub(r"""(["'(])\./""", r"\1/", text)
    text = text.replace("url(assets/", "url(/assets/")
    return text


def replace_all(text, pairs, name, required):
    """Replace each old text with its new one. A required replacement whose
    old text is missing means the supplied site changed: stop, don't skip."""
    for old, new in pairs:
        if old in text:
            text = text.replace(old, new)
        elif required:
            sys.exit(f"{name}: text not found — {old[:60]!r}")
    return text


for name in PAGES:
    path = SITE / name
    text = path.read_text(encoding="utf-8")

    text = inject_css(text, CSS)
    close = text.rfind("</body>")
    text = text[:close] + "  " + FAB + "\n  " + text[close:]

    text = replace_all(text, TEXT[1:3], name, required=False)
    text = replace_all(text, TEXT[:1], name, required=True)
    if name == "index.html":
        text = replace_all(text, TEXT[3:], name, required=True)
    if name == "privacy.html":
        text = replace_all(text, PRIVACY, name, required=True)
    text = clean_links(text)

    path.write_text(text, encoding="utf-8")
print(f"refinements: {len(PAGES)} pages")

# robots.txt: private endpoints stay out of search.
robots = SITE / "robots.txt"
text = robots.read_text(encoding="utf-8")
if "Allow: /\n" not in text:
    sys.exit("robots.txt: 'Allow: /' line not found")
robots.write_text(text.replace("Allow: /\n", "Allow: /\nDisallow: /admin/\nDisallow: /lead.php\nDisallow: /_leads/\n", 1), encoding="utf-8")

# .htaccess: 301 old .html addresses, just above the clean-URL rewrite.
htaccess = SITE / ".htaccess"
text = htaccess.read_text(encoding="utf-8")
REDIRECTS = r"""  # Clean addresses: /pricing.html → /pricing, /index.html → /. THE_REQUEST
  # is what the browser asked for, so the internal rewrite below (and the
  # 404 page) never loop back through these.
  RewriteCond %{THE_REQUEST} \s/+(.*/)?index\.html[\s?] [NC]
  RewriteRule ^ /%1 [R=301,L]
  RewriteCond %{THE_REQUEST} \s/+([^\s?]+?)\.html[\s?] [NC]
  RewriteCond %1 !^404$
  RewriteRule ^ /%1 [R=301,L]

"""
anchor = "  RewriteCond %{REQUEST_FILENAME}.html -f"
if anchor not in text:
    sys.exit(".htaccess: rewrite anchor not found")
lines = text.split("\n")
at = next(i for i, line in enumerate(lines) if line.startswith(anchor))
while at > 0 and lines[at - 1].lstrip().startswith("#"):
    at -= 1  # keep the rule's own comment attached to it
htaccess.write_text("\n".join(lines[:at]) + "\n" + REDIRECTS + "\n".join(lines[at:]), encoding="utf-8")
print("robots.txt, .htaccess: updated")
