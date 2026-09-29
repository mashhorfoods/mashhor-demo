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
@media (prefers-reduced-motion:no-preference){.c-wa-fab{transition:var(--transition-interactive),inset-block-end var(--duration-base) var(--ease-out)}}
.c-wa-fab:active{transform:scale(0.96)}
.c-wa-fab svg{inline-size:26px;block-size:26px}
@media (min-width:64em){.c-wa-fab{display:none}}
/* Where WhatsApp is already on screen (contact, footer) it steps aside
   (motion.js adds .is-aside). */
.c-wa-fab.is-aside{opacity:0;scale:0.8;visibility:hidden}
@media (prefers-reduced-motion:no-preference){.c-wa-fab{transition:var(--transition-interactive),inset-block-end var(--duration-base) var(--ease-out),opacity var(--duration-base) var(--ease-out),scale var(--duration-base) var(--ease-out),visibility var(--duration-base)}}
@media print{.c-wa-fab{display:none}}
}

/* No sequence numbers anywhere: sections, service cards, the menu, add-ons,
   service steps, story chapters, portfolio tiles and galleries are not
   numbered. (Prices, counts and the brand challenge's steps — which say
   where you are — keep theirs.) */
.c-detail__number,.c-svc-card__index,.c-drawer__index,.c-addon__index,.c-pipeline__index,
.c-chapter__num,.c-bento__index,.c-gallery__count{display:none}
.c-addon{grid-template-columns:1fr}
/* Steps kept a narrow first column for their number on small phones. */
.c-pipeline__step{grid-template-columns:minmax(0,1fr)}
.c-pipeline__step>:nth-child(n + 3){grid-column:auto}
.c-eco__marker::before{content:"";inline-size:8px;block-size:8px;border-radius:50%;background-color:currentColor}
/* The featured package card sits on a lighter surface: its muted text is
   lifted to keep 4.5:1 ("From", "Delivery", …). */
.c-tier--featured{--color-text-muted:rgba(255,255,255,0.62)}
.c-footer__mark::before{content:attr(data-mark)}
/* The story's chapter text waits for the site script to reveal it; without
   the script (blocked, failed, or off) it must simply be there. */
:root:not(.js) .c-chapter__text>*{opacity:1;translate:none}
/* Plus/minus marks centred with physical left: inset-inline-start:50% plus
   translate:-50% pushed them a whole mark sideways, onto the text, in Arabic. */
.c-faq__mark::before,.c-faq__mark::after,.c-addons__mark::before,.c-addons__mark::after,
.c-challenge__why-mark::before,.c-challenge__why-mark::after{inset-inline-start:auto;left:50%}
/* ---- UI pass: one system everywhere ------------------------------------ */
/* Section labels: gold, with the short rule after them, wherever a section
   begins (some had it, some did not; the page template's was grey). */
.c-proof__eyebrow,.c-showcase__eyebrow,.c-story__eyebrow,.c-page__eyebrow{display:flex;align-items:center;gap:var(--space-12);color:var(--color-accent)}
.c-proof__eyebrow::after,.c-showcase__eyebrow::after,.c-story__eyebrow::after,.c-page__eyebrow::after{content:"";inline-size:var(--rule-width);block-size:var(--border-width-strong);background-color:currentcolor;flex-shrink:0}
/* Headings: the display face, bold, like every other heading on the site
   (the page template — pricing, privacy, terms, accessibility — the brand
   challenge and the package builder were set in the regular weight). */
.c-page__title,.c-prose h2,.c-challenge__title,.c-build-title{font-family:var(--font-display);font-weight:var(--weight-bold);letter-spacing:var(--tracking-heading);color:var(--color-text-primary)}
.c-page__title{letter-spacing:var(--tracking-display);line-height:var(--leading-heading)}
.c-prose h2{margin-block-end:var(--space-12)}
/* Pricing: "How we bill" no longer touches the package builder above it. */
div:has(> form.c-build) + .c-prose{margin-block-start:var(--space-80)}
/* The brand challenge: the same rhythm as the sections around it. */
.c-challenge{padding-block:var(--section-space-tight)}
/* The testimonial: a pull quote across the section, not half of it. */
.c-proof .c-testimonial{max-inline-size:none}
@media (min-width:64em){.c-proof .c-testimonial{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:var(--space-64);align-items:end;padding:var(--space-48)}
.c-proof .c-testimonial__quote p{font-size:var(--text-h4,1.35rem);line-height:var(--leading-relaxed)}
.c-proof .c-testimonial__by{margin:0;padding:0 0 0 var(--space-32);border:0;border-inline-start:var(--border-hairline)}
:root[dir="rtl"] .c-proof .c-testimonial__by{padding:0 var(--space-32) 0 0}}
/* "What it covers": the dot sits inside its chip, before the word. */
.c-svc__caps .c-service__cap{gap:var(--space-12)}
.c-svc__caps .c-service__cap::before{position:static;flex:none}
/* Pills everywhere (an unlayered rule had kept "Copy" square). */
.c-channel__copy,.c-elsewhere__link{border-radius:var(--radius-pill)}
/* "Check us": links as chips, like "Elsewhere", not a bulleted list. */
.c-verify__list{flex-direction:row;flex-wrap:wrap;gap:var(--space-8);list-style:none;margin:0;padding:0}
.c-verify__list a{gap:var(--space-8);padding-inline:var(--space-16);border:var(--border-hairline);border-radius:var(--radius-pill);text-decoration:none;font-size:var(--text-body-sm);transition:border-color var(--duration-fast) var(--ease-standard),background-color var(--duration-fast) var(--ease-standard)}
.c-verify__list a:hover{border-color:var(--color-accent);background-color:rgba(244,209,63,0.06)}
/* ---- Phones ------------------------------------------------------------ */
/* A tap answers in the site's own way (press scale, gold focus), not with
   the browser's blue flash. */
html{-webkit-tap-highlight-color:transparent}
@media (hover:none){.c-svc-card__link:active,.c-faq__q:active,.c-index__link:active,.c-story-hero__card:active{scale:0.985;transition:scale 120ms var(--ease-out)}}
/* Short phones (portrait under 700px tall): the service and About heroes
   leave room for what follows instead of filling the screen with the cover. */
@media (max-width:47.99em) and (max-height:700px){.c-svc-hero{min-block-size:min(30rem,74svh)}}
/* Phones held sideways: a screen about 400px tall. The heroes had been
   sized for portrait (a 480px minimum, headlines set by width), so the
   headline filled the screen and every button sat below it. */
@media (orientation:landscape) and (max-height:520px){
.c-hero{min-block-size:0;padding-block:calc(var(--header-height) + var(--space-16)) var(--space-32)}
.c-hero__content{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);grid-template-areas:"eyebrow eyebrow" "head lead" "head actions";column-gap:var(--space-40);row-gap:var(--space-12);align-items:end;inline-size:100%}
.c-hero__eyebrow{grid-area:eyebrow}
.c-hero__headline{grid-area:head;font-size:clamp(1.75rem,10.5vh,2.6rem);align-self:center}
.c-hero__lead{grid-area:lead;margin:0}
.c-hero__actions{grid-area:actions;flex-direction:row;flex-wrap:wrap;margin:0}
.c-hero__visual{display:none}
.c-svc-hero{min-block-size:0;padding-block:calc(var(--header-height) + var(--space-16)) var(--space-32)}
.c-detail__headline{font-size:clamp(1.6rem,9vh,2.3rem)}
.c-story__title,.c-page__title{font-size:clamp(1.7rem,9.5vh,2.4rem)}
.c-story__head.c-story-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:var(--space-32);align-items:center}
.c-story-hero>:not(.c-story-hero__stage){grid-column:1}
.c-story-hero__stage{grid-column:2;grid-row:1 / span 3;margin-block-start:0;max-inline-size:26rem}}
/* An email address reads left to right, in Arabic too. */
:root[dir="rtl"] input[type="email"]{direction:ltr;text-align:right}
/* Breadcrumb links: a finger-sized target without moving the text. */
.c-crumbs__list a{display:inline-block;padding-block:12px;margin-block:-12px;padding-inline:4px;margin-inline:-4px}
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
     '<span data-lang-copy="en">Visual Communications Designer</span><span data-lang-copy="ar" lang="ar">مصمم المحتوى البصري</span>'),
    ("Muhalab Salah", "Muhalab Basheir"),
    ("مهلب صلاح", "مهلب بشير"),
    # Hero: shorter, and it leaves something to discover.
    ('''<p class="t-body-lg c-hero__lead"><span data-lang-copy="en">A remote studio for the Gulf and Egypt.
              We build brands, websites and digital experiences —
              then connect them with content, social media and performance
              marketing to help your business grow.</span><span data-lang-copy="ar" lang="ar">استوديو يعمل عن بُعد في الخليج ومصر. نبني العلامات والمواقع والتجارب الرقمية، ثم نربطها بالمحتوى ووسائل التواصل والتسويق الأدائي لينمو عملك.</span></p>''',
     '''<p class="t-body-lg c-hero__lead"><span data-lang-copy="en">Brand, website, content and ads — from one team.<br /><span class="c-hero__tease">The difference? You'll see it at first glance.</span></span><span data-lang-copy="ar" lang="ar">هوية، موقع، محتوى وإعلانات — من فريق واحد.<br /><span class="c-hero__tease">والفرق؟ ستلاحظه من أول نظرة.</span></span></p>'''),
]

# Link previews (tools/share-cards): each page its own card; the pages
# without one (privacy, terms, accessibility, 404) show the homepage's.
SHARE_OLD = "https://zaokalyamamah.online/assets/share-card.jpg"
ALT_OLD = '<meta property="og:image:alt" content="Pixora — your brand, your digital presence, one partner" />'
SHARE = {
    "story.html": ("share-story.jpg", "Al Mada — one brand, four surfaces / هوية واحدة، أربع واجهات"),
    "about.html": ("share-about.jpg", "Pixora — one team, your whole brand / فريق واحد لعلامتك كاملة"),
    "pricing.html": ("share-pricing.jpg", "Pixora pricing — every package and its price / كم يكلّف المشروع، وما الذي يغيّر السعر"),
}
HOME_CARD = ("share-home.jpg", "Pixora — علامتك. حضورك الرقمي. شريك واحد. Your brand, your digital presence, one partner.")

# The site speaks as Pixora, the team: no "founder" anywhere. The contact
# card keeps the name of the person you reach, in both languages.
TEAM = [
    ('<p class="c-verify__name">Muhalab Basheir</p>',
     '<p class="c-verify__name"><span data-lang-copy="en">Muhalab Basheir</span><span data-lang-copy="ar" lang="ar">مهلب بشير</span></p>'),
    # The founder's portfolio link: footer, contact section, and the list the site script renders.
    ("""  { label: "Founder's portfolio", labelAr: 'أعمال المؤسس', href: 'https://muhalabsalah.github.io/muhalabsalah/' },\n""", ""),
    ('\n              <li><a href="https://muhalabsalah.github.io/muhalabsalah/" target="_blank" rel="noopener noreferrer"><span data-lang-copy="en">Founder\'s portfolio</span><span data-lang-copy="ar" lang="ar">أعمال المؤسس</span><span class="u-visually-hidden"><span data-lang-copy="en"> (opens in a new tab)</span><span data-lang-copy="ar" lang="ar"> (يفتح في نافذة جديدة)</span></span></a></li>', ""),
]
TEAM_HOME = [
    (',"founder":{"@type":"Person","name":"Muhalab Basheir"}', ""),
]
TEAM_TERMS = [
    ("Pixora is a studio run by <strong>Muhalab Basheir</strong>, working remotely", "Pixora is a studio working remotely"),
    ("بيكسورا استوديو يديره <strong>مهلب بشير</strong>، ويعمل عن بُعد", "بيكسورا استوديو يعمل عن بُعد"),
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
    # Bare "assets/…" too: on /services/* it would resolve to /services/assets/.
    text = re.sub(r'((?:href|src)=")assets/', r"\1/assets/", text)
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
    # Inside the footer landmark (it is fixed in place, so nothing moves), so
    # that assistive tech finds it in a region like everything else.
    close = text.rfind("</footer>")
    if close < 0:
        sys.exit(f"{name}: no footer for the WhatsApp button")
    text = text[:close] + "  " + FAB + "\n    " + text[close:]

    text = replace_all(text, TEXT[1:3], name, required=False)
    text = replace_all(text, TEXT[:1], name, required=True)
    if name == "index.html":
        text = replace_all(text, TEXT[3:], name, required=True)
    if not name.startswith("services/") and SHARE_OLD in text:
        card, alt = SHARE.get(name, HOME_CARD)
        text = text.replace(SHARE_OLD, f"https://zaokalyamamah.online/assets/{card}")
        text = replace_all(text, [(ALT_OLD, f'<meta property="og:image:alt" content="{alt}" />')], name, required=True)
    if name == "privacy.html":
        text = replace_all(text, PRIVACY, name, required=True)
    # Reveal-on-scroll: a tall block (a price box, a card) at the fold waited
    # for a tenth of itself to clear a band 12% above the bottom, so it sat
    # blurred and invisible on phones until the visitor scrolled. Any part of
    # it in view now starts the reveal.
    text = replace_all(text, [("{ rootMargin: '0px 0px -12% 0px', threshold: 0.1 }",
                               "{ rootMargin: '0px 0px -8% 0px', threshold: 0 }")], name, required=True)
    text = replace_all(text, TEAM[:1], name, required=True)
    text = replace_all(text, TEAM[1:], name, required=False)
    if name == "index.html":
        text = replace_all(text, TEAM_HOME, name, required=True)
        # Phones: the keyboard's action key moves on to the next field.
        for field, extra in (("contact-name", 'enterkeyhint="next"'), ("contact-email", 'enterkeyhint="next" spellcheck="false"')):
            text, n = re.subn(f'id="{field}"', f'id="{field}" {extra}', text, count=1)
            if n != 1:
                sys.exit(f"index.html: {field} not found")
        # The contact section's link to the founder's portfolio.
        text, n = re.subn(r'\s*<li>\s*<a class="c-elsewhere__link" href="https://muhalabsalah\.github\.io/muhalabsalah/".*?</li>', "", text, count=1, flags=re.S)
        if n != 1:
            sys.exit("index.html: founder's portfolio link not found")
    if name == "terms.html":
        text = replace_all(text, TEAM_TERMS, name, required=True)
    text = clean_links(text)
    # Phones: the WhatsApp button is the one floating action. The supplied
    # "Start your project" bar, which came and went with the scroll, goes
    # (the site script skips it when it is absent).
    text, n = re.subn(r'\s*<div class="c-phone-cta" data-phone-cta>.*?</div>', "", text, count=1, flags=re.S)
    if n != 1:
        sys.exit(f"{name}: phone call-to-action bar not found")
    # "Back to top" scrolls this page to its top. It pointed at the homepage's
    # #home, which the site script sends to "/" on every other page.
    text, n = re.subn(r'(<a class="c-link c-footer__top-link" href=")[^"]*(")', r"\1#top\2", text, count=1)
    if n != 1:
        sys.exit(f"{name}: back-to-top link not found")
    text = text.replace("<body>", '<body id="top">', 1)
    # Away from the homepage, the logo and "Home" go to "/", not "/#home".
    if name != "index.html":
        text = re.sub(r'href="(?:\./|/)?#home"', 'href="/"', text)
    text = replace_all(text, [("return entry.href ?? `${HOME}#${entry.id}`;",
                               "return entry.href ?? (entry.id === 'home' && HOME ? HOME : `${HOME}#${entry.id}`);")], name, required=True)
    # 404.html's <base href="/"> made every fragment link (Back to top) lead
    # home; its links are all root-based now, so it has nothing left to do.
    text = text.replace('<base href="/" />', "")
    # A phone number never breaks across lines.
    text = text.replace('<span class="c-channel__value">+249 119005441</span>', '<span class="c-channel__value">+249&nbsp;119005441</span>')
    # The footer's giant wordmark is decoration: drawn by CSS, it is no longer
    # text for readers or contrast checks to trip on (it looks the same).
    text = text.replace('<p class="c-footer__mark" aria-hidden="true">PIXORA</p>',
                        '<p class="c-footer__mark" aria-hidden="true" data-mark="PIXORA"></p>')
    # The service diagram's markers carry numbers; they become plain dots.
    text = re.sub(r'(<span class="c-eco__marker"[^>]*>)\d+(</span>)', r"\1\2", text)

    path.write_text(text, encoding="utf-8")
print(f"refinements: {len(PAGES)} pages")
for n in PAGES:
    if re.search(r"Founder's portfolio|Founder&#39;s|أعمال المؤسس|موقع المؤسس|muhalabsalah\.github\.io|\"founder\"|run by <strong>", (SITE / n).read_text(encoding="utf-8")):
        sys.exit(f"refinements: {n} still refers to a founder")
# The supplied generic preview card: every page now names its own.
if any(SHARE_OLD in (SITE / n).read_text(encoding="utf-8") for n in PAGES):
    sys.exit("refinements: a page still uses share-card.jpg")
(SITE / "assets" / "share-card.jpg").unlink()

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
