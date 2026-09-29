#!/usr/bin/env python3
"""The About page, rewritten around Pixora: the team and how it works.

It speaks as Pixora (never about one person) and is built from the site's
own parts, so it reads like the rest: a hero like the service pages', a
statement beside a photograph, four principles, the way a project runs, the
five service cards (copied from the homepage, so they stay in step), the
promises, and a closing call to action. Its sections reveal as they scroll
in (the site script's data-reveal), the process draws its line as it arrives, and
nothing moves under reduced motion.

Runs after build_services.py (the homepage cards) and replaces the supplied
page's <main>; its CSS goes on every page (finalize.py wants one stylesheet).
"""
import pathlib
import re
from urllib.parse import quote

from common import WA, inject_css


def t(en, ar):
    return f'<span data-lang-copy="en">{en}</span><span data-lang-copy="ar" lang="ar">{ar}</span>'


ARROW = ('<svg class="c-btn__icon u-flip-rtl" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
         '<path d="M5 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" /></svg>')
WA_EN = WA + "?text=" + quote("Hi Pixora — I'd like to talk about a project.")
WA_AR = WA + "?text=" + quote("مرحبًا بيكسورا — أودّ التحدث عن مشروع.")
WA_ATTRS = f'href="{WA_EN}" data-wa data-about="general" data-wa-en="{WA_EN}" data-wa-ar="{WA_AR}" target="_blank" rel="noopener noreferrer"'
NEW_TAB = f'<span class="u-visually-hidden"> {t("(opens in a new tab)", "(يفتح في نافذة جديدة)")}</span>'

PRINCIPLES = [
    ("One team, one thread", "فريق واحد وخيط واحد",
     "Brand, site, content and ads are made together, so every surface looks and sounds like the same business — because it is.",
     "الهوية والموقع والمحتوى والإعلانات تُصنع معًا، فتبدو كل واجهة وتتحدث كأنها العمل نفسه — لأنها كذلك.",
     '<path d="M4 12h16M12 4v16" /><circle cx="12" cy="12" r="8" />'),
    ("Remote by design", "عن بُعد، عن قصد",
     "No office to visit and no overhead to pass on. It is why Pixora serves Riyadh, Dubai and Cairo at the same price.",
     "لا مكتب تزوره ولا تكاليف إضافية نحمّلها عليك. ولهذا تخدم بيكسورا الرياض ودبي والقاهرة بالسعر نفسه.",
     '<circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2.5 2.4 3.6 5 3.6 8s-1.1 5.6-3.6 8c-2.5-2.4-3.6-5-3.6-8S9.5 6.4 12 4Z" />'),
    ("Two languages, both first", "لغتان، كلتاهما أولًا",
     "Arabic and English are each written and laid out on their own terms — never one translated in at the end.",
     "العربية والإنجليزية تُكتب كلٌّ منهما وتُصمَّم على أصولها — لا تُضاف إحداهما ترجمةً في النهاية.",
     '<path d="M4 6h9M8.5 4v2M6 6c.6 3 2.6 5.4 5 6.5M11 6c-.7 3.3-3 6-6 7" /><path d="m13 20 3.5-9 3.5 9M14.2 17h4.6" />'),
    ("Prices in the open", "أسعار معلنة",
     "Every package and its price is published, so you can decide whether we are worth a conversation before having one.",
     "كل باقة وسعرها منشوران، لتقرّر إن كنّا نستحق المحادثة قبل أن تبدأها.",
     '<path d="M4 12.5V5a1 1 0 0 1 1-1h7.5L20 11.5 12.5 19Z" /><circle cx="8.5" cy="8.5" r="1.3" />'),
]

STAGES = [
    ("Discover", "الاستكشاف", "The business and its audience, before anything is designed.", "فهم العمل وجمهوره قبل تصميم أي شيء."),
    ("Plan", "التخطيط", "The scope, the package and any add-ons — agreed in writing.", "النطاق والباقة وأي إضافات — متّفق عليها كتابةً."),
    ("Create", "الإنشاء", "The identity and the design, shown to you as they take shape.", "الهوية والتصميم، تراهما وهما يتشكّلان."),
    ("Build", "التنفيذ", "The site, the templates, the campaign — made real.", "الموقع والقوالب والحملة — على أرض الواقع."),
    ("Launch", "الإطلاق", "Live, tested, and handed over with everything you need.", "إطلاق واختبار، وتسليم كل ما تحتاجه."),
    ("Grow", "النمو", "Content, social and ads, if you want Pixora to keep going.", "المحتوى والتواصل والإعلانات، إن أردت أن تستمر بيكسورا معك."),
]

PROMISES = [
    ("We do not publish numbers we cannot prove. There is no invented statistic, client or testimonial anywhere on this site — and there will not be one on yours.",
     "لا ننشر أرقامًا لا نستطيع إثباتها. لا توجد إحصائية أو عميل أو شهادة مُختلقة في أي مكان بهذا الموقع — ولن توجد في موقعك."),
    ("We do not start designing before we understand the business. That is the first stage of the work, not a formality.",
     "لا نبدأ التصميم قبل أن نفهم العمل. تلك هي المرحلة الأولى من العمل، وليست إجراءً شكليًا."),
    ("We do not take on work we are not right for. If something falls outside what we do well, we will say so rather than learn it on your budget.",
     "لا نقبل عملًا لسنا الأنسب له. وإن كان شيء خارج ما نتقنه، نقولها بدل أن نتعلّمه على حساب ميزانيتك."),
    ("We do not publish a client's work without their permission.",
     "لا ننشر عمل أي عميل دون إذنه."),
]


def img(name, alt_en, alt_ar, cls, sizes, eager=False):
    """A photograph from tools/about-images (1672 wide, with 640 and 1280 copies)."""
    srcset = f"/assets/{name}-640.webp 640w, /assets/{name}-1280.webp 1280w, /assets/{name}.webp 1672w"
    load = 'fetchpriority="high"' if eager else 'loading="lazy"'
    return (f'<img class="{cls}" src="/assets/{name}.webp" srcset="{srcset}" sizes="{sizes}" alt="{alt_en}" '
            f'data-alt-en="{alt_en}" data-alt-ar="{alt_ar}" width="1672" height="940" {load} decoding="async" />')


def main(cards):
    principles = "\n".join(
        f'''            <li class="c-about-value">
              <svg class="c-about-value__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">{icon}</svg>
              <h3 class="c-about-value__title">{t(en, ar)}</h3>
              <p class="c-about-value__body">{t(ben, bar)}</p>
            </li>''' for en, ar, ben, bar, icon in PRINCIPLES)
    stages = "\n".join(
        f'''            <li class="c-about-stage" style="--i:{i}">
              <h3 class="c-about-stage__name">{t(en, ar)}</h3>
              <p class="c-about-stage__body">{t(ben, bar)}</p>
            </li>''' for i, (en, ar, ben, bar) in enumerate(STAGES))
    promises = "\n".join(
        f'            <li class="c-about-promise">{t(en, ar)}</li>' for en, ar in PROMISES)
    return f'''<main id="main" class="c-about">
      <section class="c-svc-hero c-about-hero" aria-labelledby="about-title">
        <div class="c-svc-hero__media">{img("about-hero",
            "One brand laid out together on a dark stone table under a single warm light: a laptop with a dark website, a phone with a social post, black business cards with gold edges, a letterhead and a printed campaign poster. Fine gold lines in the stone trace a map.",
            "علامة واحدة مجتمعة على طاولة حجرية داكنة تحت ضوء دافئ واحد: حاسوب عليه موقع داكن، وهاتف عليه منشور، وبطاقات عمل سوداء بحواف ذهبية، وورق مراسلات، وملصق حملة مطبوع. وخطوط ذهبية دقيقة في الحجر ترسم خريطة.",
            "c-about-hero__image", "100vw", eager=True)}</div>
        <div class="l-container c-svc-hero__inner">
          <nav class="c-crumbs" aria-label="Breadcrumb">
            <ol class="c-crumbs__list" role="list">
              <li><a href="/">{t("Home", "الرئيسية")}</a></li>
              <li aria-current="page">{t("About", "من نحن")}</li>
            </ol>
          </nav>
          <div class="c-detail__head" data-reveal-group>
            <div class="c-detail__intro">
              <p class="t-label c-detail__eyebrow">{t("About Pixora", "عن بيكسورا")}</p>
              <h1 class="c-detail__headline" id="about-title">{t('One team.<br /><span class="c-detail__accent">Your whole brand.</span>', 'فريق واحد.<br /><span class="c-detail__accent">لعلامتك كاملة.</span>')}</h1>
              <div class="c-svc__actions">
                <a class="c-btn c-btn--primary" href="/story"><span>{t("See a whole project", "شاهد مشروعًا كاملًا")}</span>{ARROW}</a>
                <a class="c-btn c-btn--secondary" {WA_ATTRS}><span>{t("Talk to the team", "تحدّث مع الفريق")}</span>{NEW_TAB}</a>
              </div>
            </div>
            <p class="t-body-lg c-detail__lead">{t("Pixora is a digital studio for the Gulf and Egypt. Identity, websites, content, social media and advertising — made by one team, to one standard, in Arabic and English.",
                "بيكسورا استوديو رقمي يخدم الخليج ومصر. الهوية والمواقع والمحتوى ووسائل التواصل والإعلانات — يصنعها فريق واحد، بمعيار واحد، بالعربية والإنجليزية.")}</p>
          </div>
        </div>
      </section>

      <section class="l-section c-about-intro" aria-labelledby="about-who">
        <div class="l-container c-about-intro__grid">
          <div class="c-about-intro__text">
            <p class="t-label c-detail__eyebrow" data-reveal>{t("Who we are", "من نحن")}</p>
            <h2 class="c-svc__h2" id="about-who" data-reveal>{t("A studio built around the whole picture.", "استوديو بُني حول الصورة كاملة.")}</h2>
            <p class="t-body-lg c-about-intro__lead" data-reveal>{t("Most businesses buy their brand, their website, their content and their ads from four different places — then spend the difference making them agree. Pixora exists so that never has to happen: one team carries a project from the first sketch of the mark to the last ad of the campaign.",
              "معظم الأعمال تشتري هويتها وموقعها ومحتواها وإعلاناتها من أربع جهات مختلفة — ثم تدفع الفرق في محاولة جعلها تتّفق. وُجدت بيكسورا كي لا يحدث ذلك: فريق واحد يحمل المشروع من أول رسمة للشعار حتى آخر إعلان في الحملة.")}</p>
            <p class="c-about-intro__body" data-reveal>{t("You talk to the Pixora team directly — the people doing the work — on WhatsApp or by email, in whichever language suits you.",
              "تتحدّث مع فريق بيكسورا مباشرة — مع من ينفّذون العمل — عبر واتساب أو البريد، وباللغة التي تناسبك.")}</p>
          </div>
          <figure class="c-split__figure c-about-intro__figure" data-reveal>{img("about-team",
              "Seen from above, four people's hands work on the same brand around one dark table: one sketches a logo, one holds a tablet with the website, one scrolls a phone of social posts, one lays out printed ads. Gold threads run from each to one glowing point at the centre.",
              "من الأعلى، أيادي أربعة أشخاص تعمل على العلامة نفسها حول طاولة داكنة واحدة: يدٌ ترسم شعارًا، وأخرى تمسك جهازًا لوحيًا عليه الموقع، وثالثة تتصفح منشورات على هاتف، ورابعة ترتّب إعلانات مطبوعة. وخيوط ذهبية تمتد من كلٍّ منها إلى نقطة مضيئة في المنتصف.",
              "c-about-intro__image", "(min-width: 64em) 45vw, 92vw")}</figure>
        </div>
      </section>

      <section class="l-section l-section--tight c-about-values" aria-labelledby="about-how">
        <div class="l-container">
          <header class="c-svc__head" data-reveal>
            <p class="t-label c-detail__eyebrow">{t("How we work", "كيف نعمل")}</p>
            <h2 class="c-svc__h2" id="about-how">{t("Four things Pixora holds to.", "أربعة أشياء تلتزم بها بيكسورا.")}</h2>
          </header>
          <ul class="c-about-values__grid" role="list" data-reveal-group>
{principles}
          </ul>
          <p class="c-detail__more"><a class="c-link" href="/pricing"><span>{t("Every package and its price", "كل باقة وسعرها")}</span>{ARROW}</a></p>
        </div>
      </section>

      <section class="l-section l-section--tight c-about-process" aria-labelledby="about-process">
        <div class="l-container">
          <div class="c-about-process__head">
            <header class="c-svc__head" data-reveal>
              <p class="t-label c-detail__eyebrow">{t("How a project runs", "مسار المشروع")}</p>
              <h2 class="c-svc__h2" id="about-process">{t("From the first conversation to growth.", "من أول محادثة حتى النمو.")}</h2>
              <p class="c-about-intro__body">{t("Six stages, the same on every project. You always know which one you are in, and what comes next.",
                "ست مراحل، هي نفسها في كل مشروع. تعرف دائمًا في أيّها أنت، وما الذي يليها.")}</p>
            </header>
            <figure class="c-split__figure c-about-intro__figure" data-reveal>{img("about-process",
                "One glowing gold line runs across a dark table through six objects in order: a coffee cup, an open notebook, a plan with a pen, a sketchbook with a mark drawn in pencil, a laptop, a phone with a notification — and, in the warmest light at the end, a growing plant.",
                "خيط ذهبي مضيء يعبر طاولة داكنة مارًّا بستة أشياء بالترتيب: فنجان قهوة، ودفتر مفتوح، ومخطط وقلم، وكرّاسة عليها رسمة شعار بالرصاص، وحاسوب، وهاتف عليه إشعار — وفي آخرها، تحت أدفأ ضوء، نبتة تنمو.",
                "c-about-intro__image", "(min-width: 64em) 45vw, 92vw")}</figure>
          </div>
          <ol class="c-about-stages" role="list" data-reveal-group>
{stages}
          </ol>
        </div>
      </section>

      <section class="l-section l-section--tight c-about-services" aria-labelledby="about-what">
        <div class="l-container">
          <header class="c-svc__head" data-reveal>
            <p class="t-label c-detail__eyebrow">{t("What we do", "ما نقدّمه")}</p>
            <h2 class="c-svc__h2" id="about-what">{t("Five services, built to work together.", "خمس خدمات، مبنية لتعمل معًا.")}</h2>
          </header>
          {cards}
        </div>
      </section>

      <section class="l-section l-section--tight c-about-promises" aria-labelledby="about-not">
        <div class="l-container c-about-promises__grid">
          <header class="c-svc__head" data-reveal>
            <p class="t-label c-detail__eyebrow">{t("Our word", "التزامنا")}</p>
            <h2 class="c-svc__h2" id="about-not">{t("What Pixora will not do.", "ما لا تفعله بيكسورا.")}</h2>
          </header>
          <ul class="c-about-promises__list" role="list" data-reveal-group>
{promises}
          </ul>
        </div>
      </section>

      <section class="l-section l-section--tight c-svc__next" aria-labelledby="about-next">
        <div class="l-container">
          <div class="c-quote" data-reveal>
            <div>
              <h2 class="c-quote__title" id="about-next">{t("Tell the Pixora team what you are building.", "أخبر فريق بيكسورا بما تبنيه.")}</h2>
              <p class="c-quote__body">{t("We reply within two working hours, Sunday to Thursday.", "نردّ خلال ساعتين في أوقات العمل، من الأحد إلى الخميس.")}</p>
            </div>
            <div class="c-svc__actions">
              <a class="c-btn c-btn--primary" href="/#contact" data-cta-link><span data-cta-label>Start Your Project</span></a>
              <a class="c-btn c-btn--secondary" {WA_ATTRS}><span>{t("WhatsApp", "واتساب")}</span>{NEW_TAB}</a>
            </div>
          </div>
        </div>
      </section>
    </main>'''


CSS = """
/* ABOUT */
.c-about-hero .c-svc__actions{margin-block-start:var(--space-32)}
.c-about-hero__image{object-position:56% 50%}
.c-about-hero .c-svc-hero__media::before{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(to right,rgba(20,20,20,0.6),rgba(20,20,20,0.15) 55%,transparent);-webkit-mask-image:linear-gradient(to top,transparent,#000 35%);mask-image:linear-gradient(to top,transparent,#000 35%)}
:root[dir="rtl"] .c-about-hero .c-svc-hero__media::before{background:linear-gradient(to left,rgba(20,20,20,0.6),rgba(20,20,20,0.15) 55%,transparent)}
.c-about-intro__grid{display:grid;gap:var(--space-48);align-items:center}
@media (min-width:64em){.c-about-intro__grid{grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:var(--space-80)}}
.c-about-intro__text{display:grid;gap:var(--space-24);max-inline-size:40rem}
.c-about-intro__text .c-svc__h2{text-wrap:balance}
.c-about-intro__lead{color:var(--color-text-primary)}
.c-about-intro__body{color:var(--color-text-secondary)}
.c-about-intro__figure{margin:0;border-radius:var(--radius-lg);overflow:hidden;border:var(--border-hairline);background-color:var(--color-bg-sunken)}
.c-about-intro__image{display:block;inline-size:100%;block-size:auto;aspect-ratio:1672 / 940;object-fit:cover}
.c-about-values__grid{display:grid;gap:var(--space-16)}
@media (min-width:40em){.c-about-values__grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:64em){.c-about-values__grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--space-24)}}
.c-about-value{display:flex;flex-direction:column;gap:var(--space-12);padding:var(--space-32);border:var(--border-hairline);border-radius:var(--radius-lg);background-color:var(--color-bg-sunken);transition:border-color var(--duration-base) var(--ease-out),translate var(--duration-base) var(--ease-out)}
.c-about-value:hover{border-color:rgba(244,209,63,0.35);translate:0 -3px}
.c-about-value__icon{fill:none;inline-size:28px;block-size:28px;color:var(--color-accent);margin-block-end:var(--space-8)}
.c-about-value__title{font-family:var(--font-display);font-size:var(--text-h4,1.25rem);font-weight:var(--weight-bold);line-height:var(--leading-tight);color:var(--color-text-primary)}
.c-about-value__body{color:var(--color-text-secondary);line-height:var(--leading-body)}
.c-about-values .c-detail__more{margin-block-start:var(--space-32)}
.c-about-process__head{display:grid;gap:var(--space-32);align-items:center;margin-block-end:var(--space-64)}
.c-about-process__head .c-svc__head{margin-block-end:0}
@media (min-width:64em){.c-about-process__head{grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:var(--space-80)}}
.c-about-stages{position:relative;display:grid;gap:var(--space-32);padding:0;list-style:none}
.c-about-stage{position:relative;display:grid;gap:var(--space-8);padding-inline-start:var(--space-32)}
.c-about-stage::before{content:"";position:absolute;inset-inline-start:0;inset-block-start:0.55em;inline-size:11px;block-size:11px;border-radius:50%;background-color:var(--color-accent);box-shadow:0 0 0 6px rgba(244,209,63,0.12)}
.c-about-stages::before{content:"";position:absolute;inset-inline-start:5px;inset-block:0.9em 0.9em;inline-size:1px;background:linear-gradient(to bottom,var(--color-accent),rgba(244,209,63,0.1));transform-origin:top}
.c-about-stage__name{font-family:var(--font-display);font-size:var(--text-h4,1.25rem);font-weight:var(--weight-bold);color:var(--color-text-primary)}
.c-about-stage__body{color:var(--color-text-secondary);max-inline-size:32ch}
@media (min-width:64em){
.c-about-stages{grid-template-columns:repeat(6,minmax(0,1fr));gap:var(--space-24);padding-block-start:var(--space-32)}
.c-about-stage{padding-inline-start:0;padding-block-start:var(--space-32)}
.c-about-stage::before{inset-block-start:-5px}
.c-about-stages::before{inset-inline:5px 0;inset-block:var(--space-32) auto;inline-size:auto;block-size:1px;background:linear-gradient(to right,var(--color-accent),rgba(244,209,63,0.1));transform-origin:left}
:root[dir="rtl"] .c-about-stages::before{background:linear-gradient(to left,var(--color-accent),rgba(244,209,63,0.1));transform-origin:right}}
@media (prefers-reduced-motion:no-preference){
.js .c-about-stages::before{transform:scaleY(0);transition:transform 1.4s var(--ease-out) 0.2s}
.js .c-about-stages.is-revealed::before{transform:none}
@media (min-width:64em){.js .c-about-stages::before{transform:scaleX(0)}}}
.c-about-services .c-svc-cards{margin-block-start:0}
.c-about-promises__grid{display:grid;gap:var(--space-32)}
@media (min-width:64em){.c-about-promises__grid{grid-template-columns:minmax(0,0.8fr) minmax(0,1.2fr);gap:var(--space-80);align-items:start}}
.c-about-promises__list{display:grid;gap:var(--space-12);padding:0;list-style:none}
.c-about-promise{position:relative;padding:var(--space-24) var(--space-24) var(--space-24) var(--space-64);border:var(--border-hairline);border-radius:var(--radius-lg);color:var(--color-text-secondary);line-height:var(--leading-body)}
:root[dir="rtl"] .c-about-promise{padding:var(--space-24) var(--space-64) var(--space-24) var(--space-24)}
.c-about-promise::before{content:"";position:absolute;inset-inline-start:var(--space-24);inset-block-start:calc(var(--space-24) + 0.35em);inline-size:18px;block-size:18px;border-radius:50%;border:1.5px solid var(--color-accent);background:linear-gradient(135deg,transparent 45%,var(--color-accent) 45%,var(--color-accent) 55%,transparent 55%)}
/* ABOUT:END */
"""


def build(site: pathlib.Path):
    home = (site / "index.html").read_text(encoding="utf-8")
    m = re.search(r'<ul class="c-svc-cards" role="list" data-reveal-group>.*?</ul>\s*(?=</div>|$)', home, re.S)
    if not m:
        raise SystemExit("about_page: the homepage's service cards were not found")
    cards = m.group(0).strip()
    about = site / "about.html"
    text = about.read_text(encoding="utf-8")
    text, n = re.subn(r"<main id=\"main\">.*?</main>", lambda _: main(cards), text, count=1, flags=re.S)
    if n != 1:
        raise SystemExit("about_page: <main> not found in about.html")
    text = re.sub(r'(<meta\s+name="description"\s+content=")[^"]*(")',
                  r"\g<1>Pixora is a digital studio for the Gulf and Egypt: identity, websites, content, social media and advertising, made by one team in Arabic and English.\2",
                  text, count=1)
    about.write_text(text, encoding="utf-8")
    # The supplied site's About photos give way to tools/about-images.
    for old in ("about1", "about2", "about4"):
        (site / "assets" / f"{old}.webp").unlink()
    for page in list(site.glob("*.html")) + list(site.glob("services/*.html")):
        if page.name != "go.html":
            page.write_text(inject_css(page.read_text(encoding="utf-8"), CSS), encoding="utf-8")


if __name__ == "__main__":
    build(pathlib.Path(__file__).resolve().parent.parent / "site")
