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

from common import WA, drop, inject_css, pages, stylesheet


CSS = stylesheet("refinements")

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


# .htaccess: 301s from old .html addresses (placed by build(), below).
REDIRECTS = r"""  # Clean addresses: /pricing.html → /pricing, /index.html → /. THE_REQUEST
  # is what the browser asked for, so the internal rewrite below (and the
  # 404 page) never loop back through these.
  RewriteCond %{THE_REQUEST} \s/+(.*/)?index\.html[\s?] [NC]
  RewriteRule ^ /%1 [R=301,L]
  RewriteCond %{THE_REQUEST} \s/+([^\s?]+?)\.html[\s?] [NC]
  RewriteCond %1 !^404$
  RewriteRule ^ /%1 [R=301,L]
  # /work is a page and also the folder of its case studies: /work/ is the page.
  RewriteRule ^work/$ /work [R=301,L]
  # FORWARD:START — addresses people type, or that used to exist, lead to the
  # page they meant (tests/router.php reads this block, so tests use it too).
  RewriteRule ^work/talk-about-sudan/?$ /work [R=301,L]
  RewriteRule ^(portfolio|projects|case-studies|casestudies)/?$ /work [R=301,L,NC]
  RewriteRule ^(contact|contact-us)/?$ /#contact [R=301,L,NE,NC]
  RewriteRule ^services/?$ /#services [R=301,L,NE,NC]
  RewriteRule ^(prices|price|packages)/?$ /pricing [R=301,L,NC]
  RewriteRule ^(about-us|team)/?$ /about [R=301,L,NC]
  RewriteRule ^(faq|questions)/?$ /#faq [R=301,L,NE,NC]
  # FORWARD:END

"""


# The 404 page: every place a lost visitor is likely to have been heading,
# and a person to ask. Replaces the supplied links (which still pointed to
# the old Story entry and to no service).
NOTFOUND_OLD_START = '<nav class="c-notfound__links"'
NOTFOUND_LINKS = """<nav class="c-notfound__links" aria-label="Main destinations — الوجهات الرئيسية">
        <a class="c-btn c-btn--primary" href="/">
          <span data-lang-copy="en">Go to the homepage</span><span data-lang-copy="ar" lang="ar">إلى الصفحة الرئيسية</span>
        </a>
        <a class="c-btn c-btn--secondary" href="https://wa.me/{wa}?text=Hi%20Pixora%20%E2%80%94%20a%20link%20on%20your%20site%20did%20not%20work%3B%20I%20was%20looking%20for%3A%20" data-wa data-about="not-found"
          data-wa-en="https://wa.me/{wa}?text=Hi%20Pixora%20%E2%80%94%20a%20link%20on%20your%20site%20did%20not%20work%3B%20I%20was%20looking%20for%3A%20"
          data-wa-ar="https://wa.me/{wa}?text=%D9%85%D8%B1%D8%AD%D8%A8%D9%8B%D8%A7%20%D8%A8%D9%8A%D9%83%D8%B3%D9%88%D8%B1%D8%A7%20%E2%80%94%20%D8%B1%D8%A7%D8%A8%D8%B7%20%D9%81%D9%8A%20%D9%85%D9%88%D9%82%D8%B9%D9%83%D9%85%20%D9%84%D9%85%20%D9%8A%D8%B9%D9%85%D9%84%D8%8C%20%D9%88%D9%83%D9%86%D8%AA%20%D8%A3%D8%A8%D8%AD%D8%AB%20%D8%B9%D9%86%3A%20"
          target="_blank" rel="noopener noreferrer">
          <span data-lang-copy="en">Ask us on WhatsApp</span><span data-lang-copy="ar" lang="ar">اسألنا على واتساب</span><span class="u-visually-hidden"><span data-lang-copy="en"> (opens in a new tab)</span><span data-lang-copy="ar" lang="ar"> (يفتح في نافذة جديدة)</span></span>
        </a>
      </nav>
      <div class="c-notfound__more">
        <p class="t-label c-detail__eyebrow"><span data-lang-copy="en">Or go straight to</span><span data-lang-copy="ar" lang="ar">أو اذهب مباشرة إلى</span></p>
        <ul class="c-notfound__list" role="list">
          <li><a class="c-link" href="/services/branding"><span data-lang-copy="en">Branding &amp; Design</span><span data-lang-copy="ar" lang="ar">الهوية والتصميم</span></a></li>
          <li><a class="c-link" href="/services/websites"><span data-lang-copy="en">Websites</span><span data-lang-copy="ar" lang="ar">المواقع الإلكترونية</span></a></li>
          <li><a class="c-link" href="/services/social"><span data-lang-copy="en">Social Media Management</span><span data-lang-copy="ar" lang="ar">إدارة وسائل التواصل</span></a></li>
          <li><a class="c-link" href="/services/marketing"><span data-lang-copy="en">Digital Marketing &amp; Advertising</span><span data-lang-copy="ar" lang="ar">التسويق الرقمي والإعلانات</span></a></li>
          <li><a class="c-link" href="/services/integrated"><span data-lang-copy="en">Integrated Digital Solutions</span><span data-lang-copy="ar" lang="ar">الحلول الرقمية المتكاملة</span></a></li>
          <li><a class="c-link" href="/work"><span data-lang-copy="en">Case studies</span><span data-lang-copy="ar" lang="ar">دراسات الحالة</span></a></li>
          <li><a class="c-link" href="/pricing"><span data-lang-copy="en">Pricing</span><span data-lang-copy="ar" lang="ar">الأسعار</span></a></li>
          <li><a class="c-link" href="/about"><span data-lang-copy="en">About</span><span data-lang-copy="ar" lang="ar">من نحن</span></a></li>
          <li><a class="c-link" href="/#contact"><span data-lang-copy="en">Contact</span><span data-lang-copy="ar" lang="ar">تواصل معنا</span></a></li>
        </ul>
      </div>"""

LANG_FIRST = ("<script>(function(){var d=document.documentElement,l;"
              "try{l=localStorage.getItem('site-lang')}catch(e){}"
              "if(l!=='ar'&&l!=='en'){var p=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||''];"
              "l='en';for(var i=0;i<p.length;i++){var c=String(p[i]).toLowerCase().slice(0,2);if(c==='ar'||c==='en'){l=c;break}}}"
              "if(l==='ar'){d.lang='ar';d.dir='rtl'}})();</script>")


FORM_NOTE = [
    ("formNote: 'Opens your email app with the message ready to send.',",
     "formNote: 'Sent straight to the Pixora team. We’ll get back to you as soon as possible.',"),
    ("formNote: 'يفتح تطبيق البريد لديك والرسالة جاهزة للإرسال.',",
     "formNote: 'تصل مباشرة إلى فريق بيكسورا، وسنتواصل معك في أقرب فرصة ممكنة.',"),
]
CONTACT_EMAIL_END = """<input class="c-field__control" id="contact-email" name="email" type="email"
                  autocomplete="email" required />
              </p>"""
CONTACT_EXTRA = """
              <p class="c-field">
                <label class="c-field__label" for="contact-whatsapp"><span data-lang-copy="en">WhatsApp number <span class="c-field__optional">(optional — we usually reply there)</span></span><span data-lang-copy="ar" lang="ar">رقم واتساب <span class="c-field__optional">(اختياري — غالبًا نردّ عليه)</span></span></label>
                <input class="c-field__control" id="contact-whatsapp" enterkeyhint="next" name="whatsapp" type="tel" inputmode="tel"
                  autocomplete="tel" dir="ltr" placeholder="+971 50 123 4567" />
              </p>
              <p class="u-visually-hidden" aria-hidden="true"><label>Company <input name="company" type="text" tabindex="-1" autocomplete="off" /></label></p>"""


def build(site: pathlib.Path):
    for path in pages(site):
        name = str(path.relative_to(site))
        text = path.read_text(encoding="utf-8")

        text = inject_css(text, CSS)
        # Arabic first for Arabic speakers: before anything is painted, the
        # page takes the visitor's saved choice or, on a first visit, the first
        # of Arabic or English in the device's languages. The site script then
        # carries on from the document's language (currentLang), as before.
        if LANG_FIRST not in text:
            head = text.find('<meta charset="utf-8" />')
            if head < 0:
                sys.exit(f"{name}: <meta charset> not found for the language script")
            head += len('<meta charset="utf-8" />')
            text = text[:head] + "\n    " + LANG_FIRST + text[head:]
        # Inside the footer landmark (it is fixed in place, so nothing moves), so
        # that assistive tech finds it in a region like everything else.
        close = text.rfind("</footer>")
        if close < 0:
            sys.exit(f"{name}: no footer for the WhatsApp button")
        text = text[:close] + "  " + FAB + "\n    " + text[close:]
        # On a service page or a study, the floating button says what the
        # visitor is looking at: it takes the message of the page's own
        # WhatsApp button for its service or study.
        topic = re.search(r'<a class="c-btn c-btn--(?:primary|secondary)" href="[^"]*wa\.me[^"]*" data-wa data-about="([a-z-]+)" '
                          r'data-wa-en="([^"]*)" data-wa-ar="([^"]*)"', text)
        if topic and topic.group(1) in ("branding", "websites", "social", "marketing", "integrated", "case-study"):
            about, en, ar = topic.groups()
            a, b = text.index(FAB_START), text.index(FAB_END)
            fab = text[a:b].replace(f'href="{WA_EN}" data-wa data-about="general"', f'href="{en}" data-wa data-about="{about}"', 1)
            fab = fab.replace(f'data-wa-en="{WA_EN}" data-wa-ar="{WA_AR}"', f'data-wa-en="{en}" data-wa-ar="{ar}"', 1)
            if fab == text[a:b]:
                sys.exit(f"{name}: floating WhatsApp button not as expected")
            text = text[:a] + fab + text[b:]

        text = replace_all(text, TEXT[1:3], name, required=False)
        text = replace_all(text, TEXT[:1], name, required=True)
        if name == "index.html":
            text = replace_all(text, TEXT[3:], name, required=True)
        if not name.startswith("services/") and SHARE_OLD in text:
            card, alt = SHARE.get(name, HOME_CARD)
            text = text.replace(SHARE_OLD, f"https://zaokalyamamah.online/assets/{card}")
            text = replace_all(text, [(ALT_OLD, f'<meta property="og:image:alt" content="{alt}" />')], name, required=True)
        if name == "404.html":
            a = text.find(NOTFOUND_OLD_START)
            if a < 0:
                sys.exit("404.html: its links block not found")
            b = text.index("</nav>", a) + len("</nav>")
            text = text[:a] + NOTFOUND_LINKS.replace("{wa}", WA.rsplit("/", 1)[-1]) + text[b:]
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
        # The contact form now sends to lead.php (forms.js); its note says so.
        text = replace_all(text, FORM_NOTE, name, required=True)
        if name == "index.html":
            text = replace_all(text, TEAM_HOME, name, required=True)
            # The contact form: an optional WhatsApp number (most replies go
            # there), and the hidden field only bots fill (lead.php drops them).
            text = replace_all(text, [(CONTACT_EMAIL_END, CONTACT_EMAIL_END + CONTACT_EXTRA)], name, required=True)
            # Phones: the keyboard's action key moves on to the next field.
            for field, extra in (("contact-name", 'enterkeyhint="next"'), ("contact-email", 'enterkeyhint="next" spellcheck="false"')):
                text, n = re.subn(f'id="{field}"', f'id="{field}" {extra}', text, count=1)
                if n != 1:
                    sys.exit(f"index.html: {field} not found")
            # Al Mada's tiles in Recent work: the full-size copies already ship
            # (the Story shows them), so large and high-density screens get
            # them instead of the tile stretched.
            for tile, full, w in (("identity", "identity", 1400), ("website", "website", 1200), ("campaign", "campaign", 900), ("profile", "profile", 1200)):
                small = {"identity": 900, "website": 900, "campaign": 560, "profile": 560}[tile]
                text, n = re.subn(rf'(<img class="c-bento__image" src="\./assets/al-mada-{tile}-tile\.webp")',
                                  rf'\1 srcset="./assets/al-mada-{tile}-tile.webp {small}w, ./assets/al-mada-{full}.webp {w}w" sizes="(min-width: 64em) 50vw, 100vw"',
                                  text, count=1)
                if n != 1:
                    sys.exit(f"index.html: Al Mada {tile} tile not found")
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
    print(f"refinements: {len(pages(site))} pages")
    for path in pages(site):
        if re.search(r"Founder's portfolio|Founder&#39;s|أعمال المؤسس|موقع المؤسس|muhalabsalah\.github\.io|\"founder\"|run by <strong>", path.read_text(encoding="utf-8")):
            sys.exit(f"refinements: {path.name} still refers to a founder")
    # The supplied generic preview card: every page now names its own.
    drop(site, ["share-card.jpg"], "refinements")

    # robots.txt: private endpoints stay out of search.
    robots = site / "robots.txt"
    text = robots.read_text(encoding="utf-8")
    if "Allow: /\n" not in text:
        sys.exit("robots.txt: 'Allow: /' line not found")
    robots.write_text(text.replace("Allow: /\n", "Allow: /\nDisallow: /admin/\nDisallow: /cms/\nDisallow: /lead.php\nDisallow: /_leads/\n", 1), encoding="utf-8")

    # .htaccess: 301 old .html addresses, just above the clean-URL rewrite.
    htaccess = site / ".htaccess"
    text = htaccess.read_text(encoding="utf-8")
    anchor = "  RewriteCond %{REQUEST_FILENAME}.html -f"
    if anchor not in text:
        sys.exit(".htaccess: rewrite anchor not found")
    lines = text.split("\n")
    at = next(i for i, line in enumerate(lines) if line.startswith(anchor))
    while at > 0 and lines[at - 1].lstrip().startswith("#"):
        at -= 1  # keep the rule's own comment attached to it
    text = "\n".join(lines[:at]) + "\n" + REDIRECTS + "\n".join(lines[at:])
    # Security headers the supplied file lacked: isolation from windows the
    # site opens (WhatsApp), framing protection for browsers that ignore CSP's
    # frame-ancestors, current permissions (interest-cohort is retired; its
    # successor is browsing-topics), and http links upgraded to https. HSTS
    # stays without includeSubDomains: a subdomain without a certificate
    # would stop working.
    # /work is a page (work.html) and the folder of its case studies (work/).
    # Apache adds a slash to a folder's address and the rule above takes it
    # off again: /work and /work/ sent the browser to each other forever. For
    # this address only no slash is added, and work.html is served.
    anchor = "# HTTPS redirect."
    if text.count(anchor) != 1:
        sys.exit(".htaccess: HTTPS block not found")
    text = text.replace(anchor, "# /work is both a page (work.html) and a folder (work/): no slash added here,\n"
                                "# or it and the /work/ -> /work rule below would redirect each other forever.\n"
                                "<If \"%{REQUEST_URI} == '/work'\">\n  DirectorySlash Off\n</If>\n\n" + anchor, 1)
    for old_h, new_h in (
        ('  Header set Permissions-Policy "camera=(), microphone=(), geolocation=(), interest-cohort=()"',
         '  Header set Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()"\n'
         '  Header set Cross-Origin-Opener-Policy "same-origin-allow-popups"\n'
         '  Header set X-Frame-Options "SAMEORIGIN"'),
        ("Content-Security-Policy \"default-src 'self';", "Content-Security-Policy \"upgrade-insecure-requests; default-src 'self';"),
    ):
        if text.count(old_h) != 1:
            sys.exit(f".htaccess: security header not found — {old_h[:60]!r}")
        text = text.replace(old_h, new_h, 1)
    htaccess.write_text(text, encoding="utf-8")
    print("robots.txt, .htaccess: updated")


if __name__ == "__main__":
    build(pathlib.Path(__file__).resolve().parent.parent / "site")
