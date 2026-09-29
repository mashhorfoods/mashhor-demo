#!/usr/bin/env python3
"""Case studies: a hub at /work and one page per study at /work/<slug>.

The studies (from the portfolio the owner supplied, rewritten in Pixora's
voice — the team, never one person — and in both languages) sit in CASES
below; Al Mada, told at length on /story, leads the hub. Every page is built
on the pricing page's shell (head, header, verification band, footer,
script), like the service pages, so it is one of the site's own pages.

  Hub   a filter by discipline (radio buttons and :has(), no script), the
        featured study, then a card per study; each cover carries a
        view-transition name, so a card grows into its page.
  Page  a hero with the cover, a sticky "on this page" index on wide
        screens, and the sections: overview, challenge, what we did, how
        it ran, key decisions, outcome, impact — then the next and previous
        studies and a call to action.

Covers are drawn from the identity (tools/share-cards/case-cover.html,
rendered by render.mjs, encoded by `python3 tools/images.py cases`). Runs
after about_page.py and before refinements.py; the CSS (tools/css/cases.css)
goes on every page.
"""
import pathlib
import re

from build_services import bi
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
    "img": "al-mada-identity-tile.webp", "w": 900, "h": 600,
    "kinds": "branding digital",
    "category": ("Case study · Al Mada Travel &amp; Tourism", "دراسة حالة · المدى للسفر والسياحة"),
    "title": ("One brand, four surfaces.", "هوية واحدة، أربع واجهات."),
    "summary": ("Identity, website, campaign and company profile — one partner, one standard, from the first sketch to the last poster.",
                "هوية وموقع وحملة وملف تعريفي — شريك واحد ومعيار واحد، من أول رسمة حتى آخر ملصق."),
}

CASES = [
    {
        "slug": "brand-identity-systems", "kinds": "branding",
        "category": ("Branding &amp; Visual Identity", "الهوية والتصميم"),
        "title": ("Brand identity systems", "أنظمة الهوية البصرية"),
        "summary": ("Identity systems, packaging and collateral for commercial organisations across Sudan and Oman.",
                    "أنظمة هوية وتغليف ومطبوعات لمؤسسات تجارية في السودان وعُمان."),
        "overview": [
            ("Over nine years, the team behind Pixora has built identities for startups, SMEs, FMCG companies, agencies and humanitarian initiatives — never just a logo, always a complete visual system that holds from the packaging to the social feed.",
             "على مدى تسع سنوات، بنى فريق بيكسورا هويات لشركات ناشئة ومنشآت صغيرة ومتوسطة وشركات سلع استهلاكية ووكالات ومبادرات إنسانية — لم يكن العمل شعارًا فقط، بل نظامًا بصريًا كاملًا يصمد من العبوة حتى منشورات التواصل."),
            ("Every identity tells one clear story, and stays practical for the people who use it every day.",
             "كل هوية تحكي قصة واحدة واضحة، وتبقى عملية لمن يستخدمها كل يوم."),
        ],
        "challenge": [
            ("Most organisations come to us with a logo but no system: the brand looks different on every product, report, website and ad.",
             "تأتينا معظم المؤسسات بشعار بلا نظام: تبدو العلامة مختلفة على كل منتج وتقرير وموقع وإعلان."),
            ("The task was an identity that is creative and usable at once — consistent everywhere, and flexible enough for every channel.",
             "المهمة: هوية مبدعة وعملية في آن — متسقة في كل مكان، ومرنة بما يكفي لكل قناة."),
        ],
        "roles": [("Brand strategy", "استراتيجية العلامة"), ("Visual identity", "الهوية البصرية"), ("Graphic design", "التصميم الجرافيكي"), ("Brand systems", "أنظمة العلامة")],
        "did": ("We run the whole identity process — from the first concept to the guidelines the client's own team works from.",
                "نتولى رحلة الهوية كاملة — من الفكرة الأولى حتى الدليل الذي يعمل به فريق العميل."),
        "process": [("Research the organisation and its audience", "دراسة المؤسسة وجمهورها"), ("Understand the business goals", "فهم أهداف العمل وتحديات التواصل"),
                    ("Explore visual directions", "استكشاف اتجاهات بصرية"), ("Design a logo system that scales", "تصميم نظام شعار قابل للتوسع"),
                    ("Set type, colour and layout standards", "وضع معايير الخط واللون والتخطيط"), ("Build the supporting brand assets", "بناء عناصر العلامة المساندة"),
                    ("Test on print and on screen", "الاختبار على المطبوع والشاشة"), ("Deliver production-ready files", "تسليم ملفات جاهزة للإنتاج")],
        "decisions_intro": ("Systems, not isolated logos:", "أنظمة، لا شعارات منفردة:"),
        "decisions": [("Clear visual hierarchy", "تسلسل بصري واضح"), ("Flexible colour systems", "أنظمة ألوان مرنة"), ("Highly legible type", "خطوط سهلة القراءة"),
                      ("Modular layouts", "تخطيطات مرنة الوحدات"), ("One design for print and screen", "تصميم واحد للمطبوع والشاشة"), ("Efficient to produce as the brand grows", "إنتاج فعّال مع نمو العلامة")],
        "outcome": ("Cohesive identity systems, carried across packaging, corporate communication, campaigns, presentations, websites and social platforms — recognisable, scalable, and ready to grow with the business.",
                    "أنظمة هوية متماسكة تمتد عبر العبوات والتواصل المؤسسي والحملات والعروض والمواقع ومنصات التواصل — مميّزة وقابلة للتوسع وجاهزة للنمو مع العمل."),
        "impact": [("Lasting brand consistency", "اتساق دائم للعلامة"), ("Stronger recognition across channels", "حضور أوضح عبر القنوات"),
                   ("Faster design production later on", "إنتاج أسرع للتصاميم لاحقًا"), ("Reusable assets that save production time", "عناصر قابلة لإعادة الاستخدام توفّر وقت الإنتاج"),
                   ("A more professional, trustworthy image", "صورة أكثر احترافية وموثوقية")],
    },
    {
        "slug": "editorial-publication-design", "kinds": "editorial",
        "category": ("Editorial Design", "التصميم التحريري"),
        "title": ("Editorial &amp; publication design", "التصميم التحريري والمطبوعات"),
        "summary": ("Annual reports, publications and presentations that make complex information easy to follow.",
                    "تقارير سنوية ومطبوعات وعروض تجعل المعلومات المعقدة سهلة المتابعة."),
        "overview": [
            ("Editorial design is one of our deepest specialities — above all in humanitarian communication and institutional reporting.",
             "التصميم التحريري من أعمق تخصصاتنا — خاصة في التواصل الإنساني والتقارير المؤسسية."),
            ("Reports, publications, brochures and presentations: work where the order of information matters as much as how it looks.",
             "تقارير ومطبوعات وكتيبات وعروض: عمل يهم فيه ترتيب المعلومة بقدر شكلها."),
        ],
        "challenge": [
            ("Long reports lose their readers in dense text, inconsistent pages and scattered information.",
             "تُضيّع التقارير الطويلة قرّاءها بين نصوص كثيفة وصفحات غير متسقة ومعلومات مبعثرة."),
            ("The task: publications that guide the reader through complex content while staying clear and consistent.",
             "المهمة: مطبوعات تقود القارئ عبر المحتوى المعقد وتبقى واضحة ومتسقة."),
        ],
        "roles": [("Editorial design", "التصميم التحريري"), ("Information architecture", "هندسة المعلومات"), ("Publication design", "تصميم المطبوعات"), ("Layout", "التنسيق والإخراج")],
        "did": ("We design the whole publication system — page structures, typography, grids, hierarchy, icons and supporting graphics.",
                "نصمم نظام المطبوعة كاملًا — بنية الصفحات والخطوط والشبكات والتسلسل والأيقونات والرسوم المساندة."),
        "process": [("Research", "البحث"), ("Content analysis", "تحليل المحتوى"), ("Information hierarchy", "تسلسل المعلومات"), ("The editorial grid", "الشبكة التحريرية"),
                    ("Typography", "الخطوط"), ("Visual integration", "دمج العناصر البصرية"), ("Quality review", "مراجعة الجودة"), ("Production", "الإنتاج")],
        "decisions_intro": ("Every choice aimed to lower the reader's effort:", "كل قرار هدفه تخفيف جهد القارئ:"),
        "decisions": [("Strong editorial grids", "شبكات تحريرية متينة"), ("Consistent typography", "خطوط متسقة"), ("Modular pages", "صفحات مرنة الوحدات"),
                      ("Clear navigation", "تنقل واضح"), ("Deliberate white space", "مساحات بيضاء مقصودة"), ("Storytelling backed by data", "سرد تدعمه البيانات")],
        "outcome": ("Publications that are easier to navigate and keep a professional institutional look — fit for humanitarian organisations, NGOs and corporate readers alike.",
                    "مطبوعات أسهل في التنقل تحافظ على مظهر مؤسسي احترافي — تناسب المنظمات الإنسانية وغير الحكومية وقرّاء الشركات على حد سواء."),
        "impact": [("Information that is easier to reach", "معلومات أسهل وصولًا"), ("More engaged readers", "قرّاء أكثر تفاعلًا"), ("Consistent publications", "مطبوعات متسقة"),
                   ("Less visual clutter", "ازدحام بصري أقل"), ("Editorial systems ready for the next report", "أنظمة تحريرية جاهزة للتقرير القادم")],
    },
    {
        "slug": "information-design", "kinds": "information",
        "category": ("Information Design", "تصميم المعلومات"),
        "title": ("Information design &amp; visual storytelling", "تصميم المعلومات والسرد البصري"),
        "summary": ("Infographics, presentations and data stories that turn research into something people understand.",
                    "إنفوجرافيك وعروض وقصص بيانات تحوّل الأبحاث إلى ما يفهمه الناس."),
        "overview": [
            ("Information design joins research, data and visual communication to turn technical material into clear stories.",
             "يجمع تصميم المعلومات بين البحث والبيانات والتواصل البصري ليحوّل المادة التقنية إلى قصص واضحة."),
            ("The aim: help people grasp complex issues quickly, without losing accuracy.",
             "الهدف: أن يفهم الناس القضايا المعقدة بسرعة، دون أن تضيع الدقة."),
        ],
        "challenge": [
            ("Datasets, technical reports and humanitarian assessments hold valuable insight that non-specialists cannot reach.",
             "تحمل مجموعات البيانات والتقارير التقنية والتقييمات الإنسانية رؤى قيّمة لا يصل إليها غير المتخصصين."),
            ("The task: keep the data exact while making it far easier to understand.",
             "المهمة: الحفاظ على دقة البيانات مع جعلها أسهل فهمًا بكثير."),
        ],
        "roles": [("Information design", "تصميم المعلومات"), ("Visual storytelling", "السرد البصري"), ("Data visualisation", "تصوير البيانات"), ("Communication design", "تصميم التواصل")],
        "did": ("We turn research findings into structured visual narratives, built on editorial design principles.",
                "نحوّل نتائج الأبحاث إلى سرديات بصرية منظمة، مبنية على أسس التصميم التحريري."),
        "process": [("Research", "البحث"), ("Data verification", "التحقق من البيانات"), ("Finding the insight", "استخراج الفكرة"), ("Building the narrative", "بناء السردية"),
                    ("Visual hierarchy", "التسلسل البصري"), ("Data visualisation", "تصوير البيانات"), ("Editorial integration", "الدمج التحريري"), ("Review", "المراجعة")],
        "decisions_intro": ("Every chart answers a question, rather than just showing a number:", "كل رسم يجيب عن سؤال، لا يعرض رقمًا فقط:"),
        "decisions": [("Clarity over decoration", "الوضوح قبل الزخرفة"), ("Accuracy over complexity", "الدقة قبل التعقيد"),
                      ("A story over isolated graphics", "القصة قبل الرسوم المنفردة"), ("Open to every audience", "في متناول كل جمهور")],
        "outcome": ("Decision-makers, partners and the public could understand complex information faster, through structured visual communication.",
                    "صار بإمكان صنّاع القرار والشركاء والجمهور فهم المعلومات المعقدة أسرع، عبر تواصل بصري منظم."),
        "impact": [("Better understanding of the data", "فهم أعمق للبيانات"), ("Less effort to interpret", "جهد أقل في التفسير"), ("More effective communication", "تواصل أكثر فاعلية"),
                   ("Stronger evidence-based storytelling", "سرد أقوى قائم على الأدلة"), ("Better-informed decisions", "قرارات مبنية على معرفة")],
    },
    {
        "slug": "talk-about-sudan", "kinds": "editorial information",
        "category": ("Visual Storytelling", "السرد البصري"),
        "title": ("Talk About Sudan", "Talk About Sudan — تحدّث عن السودان"),
        "summary": ("A self-initiated editorial series that turns humanitarian reporting on Sudan into clear visual narratives.",
                    "سلسلة تحريرية بمبادرة ذاتية تحوّل التقارير الإنسانية عن السودان إلى سرديات بصرية واضحة."),
        "overview": [
            ("Talk About Sudan is a self-initiated project that turns humanitarian reports into accessible visual narratives.",
             "Talk About Sudan مشروع بمبادرة ذاتية يحوّل التقارير الإنسانية إلى سرديات بصرية في متناول الجميع."),
            ("Rather than repeating statistics, it gathers verified information from trusted humanitarian sources into editorial pieces that show the scale, the context and the human impact of the crisis — with clarity, accuracy and dignity.",
             "بدل تكرار الإحصاءات، يجمع معلومات موثّقة من مصادر إنسانية موثوقة في قطع تحريرية تُظهر حجم الأزمة وسياقها وأثرها الإنساني — بوضوح ودقة وكرامة."),
        ],
        "challenge": [
            ("Humanitarian reports hold critical evidence, but they are hard for non-specialists to navigate.",
             "تحمل التقارير الإنسانية أدلة حاسمة، لكن يصعب على غير المتخصصين التنقل فيها."),
            ("The task: bridge technical documentation and public understanding, without compromising accuracy or ethics.",
             "المهمة: وصل التوثيق التقني بفهم الجمهور، دون المساس بالدقة أو الأخلاقيات."),
        ],
        "roles": [("Research", "البحث"), ("Source verification", "التحقق من المصادر"), ("Editorial planning", "التخطيط التحريري"), ("Information architecture", "هندسة المعلومات"),
                  ("Data visualisation", "تصوير البيانات"), ("Publication design", "تصميم النشر")],
        "did": ("Every stage in-house — from research and verification to design, motion concepts and quality review.",
                "كل المراحل داخل الفريق — من البحث والتحقق حتى التصميم ومفاهيم الحركة ومراجعة الجودة."),
        "process": [("Primary-source research", "البحث في المصادر الأولية"), ("Evidence verification", "التحقق من الأدلة"), ("Insight extraction", "استخراج الرؤى"),
                    ("Narrative structure", "بنية السرد"), ("Editorial design", "التصميم التحريري"), ("Information visualisation", "تصوير المعلومات"),
                    ("Quality review", "مراجعة الجودة"), ("Publication", "النشر")],
        "decisions_intro": ("The principles behind every piece:", "مبادئ وراء كل قطعة:"),
        "decisions": [("Primary sources only", "المصادر الأولية فقط"), ("No assumptions", "لا افتراضات"), ("Evidence before aesthetics", "الدليل قبل الجماليات"),
                      ("Human-centred communication", "تواصل محوره الإنسان"), ("Ethical representation of affected communities", "تمثيل أخلاقي للمجتمعات المتأثرة"),
                      ("Every visual carries evidence", "كل عنصر بصري يحمل دليلًا")],
        "outcome": ("A growing editorial series on food security, education, health, displacement, inflation and humanitarian access in Sudan — each piece a structured visual story for digital audiences, credible and carefully edited.",
                    "سلسلة تحريرية متنامية عن الأمن الغذائي والتعليم والصحة والنزوح والتضخم والوصول الإنساني في السودان — كل قطعة قصة بصرية منظمة لجمهور رقمي، موثوقة ومحررة بعناية."),
        "impact": [("A repeatable method for evidence-based visual communication", "منهجية قابلة للتكرار للتواصل البصري القائم على الأدلة"),
                   ("Clearer public understanding of Sudan's humanitarian situation", "فهم أوضح لدى الجمهور للوضع الإنساني في السودان"),
                   ("Depth in information design and editorial storytelling", "عمق في تصميم المعلومات والسرد التحريري"),
                   ("Communication that keeps dignity at the centre", "تواصل يضع الكرامة في المركز")],
    },
    {
        "slug": "digital-campaigns", "kinds": "digital",
        "category": ("Digital Communication", "التواصل الرقمي"),
        "title": ("Digital communication campaigns", "حملات التواصل الرقمي"),
        "summary": ("Campaign systems that unite branding, storytelling and motion across every platform.",
                    "أنظمة حملات توحّد الهوية والسرد والحركة عبر كل المنصات."),
        "overview": [
            ("An effective campaign is more than attractive posts: it needs one visual language, a plan, and consistent execution on every platform.",
             "الحملة الفعالة أكثر من منشورات جذابة: تحتاج لغة بصرية واحدة وخطة وتنفيذًا متسقًا على كل منصة."),
            ("These campaign systems combine branding, visual storytelling and motion design — engaging on every platform, consistent at every touchpoint.",
             "تجمع أنظمة الحملات هذه بين الهوية والسرد البصري والموشن — جاذبة على كل منصة، ومتسقة في كل نقطة تواصل."),
        ],
        "challenge": [
            ("Brands often treat digital communication as one-off posts, and the inconsistency dilutes recognition.",
             "كثيرًا ما تتعامل العلامات مع التواصل الرقمي كمنشورات منفصلة، فيضعف تمييزها بسبب عدم الاتساق."),
            ("The task: move from isolated artwork to a campaign system in which visuals, message and motion reinforce one presence.",
             "المهمة: الانتقال من تصاميم منفردة إلى نظام حملة تعزّز فيه الصورة والرسالة والحركة حضورًا واحدًا."),
        ],
        "roles": [("Campaign visual design", "التصميم البصري للحملات"), ("Motion graphics", "الموشن جرافيك"), ("Multi-platform adaptation", "التكييف لكل منصة"),
                  ("Asset production", "إنتاج المواد"), ("Brand consistency", "اتساق العلامة")],
        "did": ("We own the campaign's visual execution end to end — from the visual system to every format it ships in.",
                "نتولى التنفيذ البصري للحملة من أولها لآخرها — من النظام البصري حتى كل مقاس تُنشر به."),
        "process": [("Understand the campaign's goals", "فهم أهداف الحملة"), ("Set the visual direction", "تحديد الاتجاه البصري"), ("Build a flexible design system", "بناء نظام تصميم مرن"),
                    ("Produce assets for every format", "إنتاج المواد لكل مقاس"), ("Add motion where it earns attention", "إضافة الحركة حيث تجذب الانتباه"),
                    ("Deliver one cohesive campaign", "تسليم حملة واحدة متماسكة")],
        "decisions_intro": ("The focus areas:", "محاور التركيز:"),
        "decisions": [("Campaign strategy", "استراتيجية الحملة"), ("Visual consistency", "الاتساق البصري"), ("Multi-platform adaptation", "التكيف مع المنصات"),
                      ("Audience engagement", "تفاعل الجمهور"), ("Motion integration", "دمج الحركة")],
        "outcome": ("A campaign system that scales: one brand presence everywhere, with content that adapts quickly to each platform.",
                    "نظام حملات قابل للتوسع: حضور واحد للعلامة في كل مكان، ومحتوى يتكيف بسرعة مع كل منصة."),
        "impact": [("One brand presence on every platform", "حضور واحد للعلامة على كل منصة"), ("New formats without a redesign", "مقاسات جديدة دون إعادة تصميم"),
                   ("Stronger engagement", "تفاعل أقوى"), ("A reusable system that speeds production", "نظام قابل لإعادة الاستخدام يسرّع الإنتاج")],
    },
]


def plain(html):
    return re.sub(r"<[^>]+>", "", html).replace("&amp;", "&")


def cover(slug, lazy=True, sizes="(min-width: 64em) 40rem, 100vw"):
    load = 'loading="lazy"' if lazy else 'fetchpriority="high"'
    return (f'<img src="/assets/case-{slug}.webp" srcset="/assets/case-{slug}-800.webp 800w, /assets/case-{slug}.webp 1600w" '
            f'sizes="{sizes}" alt="" width="1600" height="1000" {load} decoding="async" />')


def card(c, wide=False):
    extra = " c-case-card--wide" if wide else ""
    return f'''            <li class="c-case-card{extra}" data-kinds="{c["kinds"]}">
              <a class="c-case-card__link" href="/work/{c["slug"]}">
                <span class="c-case-card__media" style="view-transition-name: case-{c["slug"]}">{cover(c["slug"])}</span>
                <span class="c-case-card__kind">{bi(*c["category"])}</span>
                <span class="c-case-card__title">{bi(*c["title"])}</span>
                <span class="c-case-card__summary">{bi(*c["summary"])}</span>
                <span class="c-case-card__go">{bi("Read the case study", "اقرأ دراسة الحالة")}{ARROW}</span>
              </a>
            </li>'''


def featured():
    f = FEATURED
    return f'''            <li class="c-case-card c-case-card--wide c-case-card--featured" data-kinds="{f["kinds"]}">
              <a class="c-case-card__link" href="{f["href"]}">
                <span class="c-case-card__media"><img src="/assets/{f["img"]}" alt="" width="{f["w"]}" height="{f["h"]}" loading="lazy" decoding="async" /></span>
                <span class="c-case-card__kind">{bi(*f["category"])}</span>
                <span class="c-case-card__title">{bi(*f["title"])}</span>
                <span class="c-case-card__summary">{bi(*f["summary"])}</span>
                <span class="c-case-card__go">{bi("Read the full story", "اقرأ القصة كاملة")}{ARROW}</span>
              </a>
            </li>'''


def hub_main():
    chips = "\n".join(
        f'''            <input class="c-cases__radio" type="radio" name="case-kind" id="kind-{k}" value="{k}"{" checked" if k == "all" else ""} />
            <label class="c-cases__chip" for="kind-{k}">{bi(en, ar)}</label>''' for k, en, ar in [("all", "All work", "كل الأعمال")] + KINDS)
    cards = "\n".join([featured()] + [card(c) for c in CASES])
    return f'''<main id="main" class="c-cases-page">
      <section class="l-section c-cases" aria-labelledby="cases-title">
        <div class="l-container">
          <nav class="c-crumbs" aria-label="Breadcrumb">
            <ol class="c-crumbs__list" role="list">
              <li><a href="/">{bi("Home", "الرئيسية")}</a></li>
              <li aria-current="page">{bi("Case studies", "دراسات الحالة")}</li>
            </ol>
          </nav>
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


def closing():
    return f'''<section class="l-section l-section--tight c-svc__next" aria-labelledby="cases-next">
        <div class="l-container">
          <div class="c-quote" data-reveal>
            <div>
              <h2 class="c-quote__title" id="cases-next">{bi("Your project could be the next one here.", "مشروعك قد يكون التالي هنا.")}</h2>
              <p class="c-quote__body">{bi("Tell the Pixora team what you are building; we reply within two working hours.", "أخبر فريق بيكسورا بما تبنيه؛ نردّ خلال ساعتين في أوقات العمل.")}</p>
            </div>
            <div class="c-svc__actions">
              <a class="c-btn c-btn--primary" href="/#contact" data-cta-link><span data-cta-label>Start Your Project</span></a>
              <a class="c-btn c-btn--secondary" href="/pricing"><span>{bi("See the prices", "شاهد الأسعار")}</span>{ARROW}</a>
            </div>
          </div>
        </div>
      </section>'''


def paras(items):
    return "\n".join(f'<p>{bi(en, ar)}</p>' for en, ar in items)


def case_main(c, prev, nxt):
    sections = {
        "overview": paras(c["overview"]),
        "challenge": paras(c["challenge"]),
        "did": f'''<ul class="c-case__roles" role="list">{"".join(f'<li>{bi(en, ar)}</li>' for en, ar in c["roles"])}</ul>
              <p>{bi(*c["did"])}</p>''',
        "process": f'''<ol class="c-case__steps" role="list" data-reveal-group>{"".join(
            f'<li>{bi(en, ar)}</li>' for en, ar in c["process"])}</ol>''',
        "decisions": f'''<p>{bi(*c["decisions_intro"])}</p>
              <ul class="c-case__decisions" role="list" data-reveal-group>{"".join(f'<li>{bi(en, ar)}</li>' for en, ar in c["decisions"])}</ul>''',
        "outcome": f'<blockquote class="c-case__outcome"><p>{bi(*c["outcome"])}</p></blockquote>',
        "impact": f'''<ul class="c-case__impact" role="list" data-reveal-group>{"".join(f'<li>{bi(en, ar)}</li>' for en, ar in c["impact"])}</ul>''',
    }
    toc = "\n".join(f'<li><a href="#case-{sid}">{bi(en, ar)}</a></li>' for sid, en, ar in SECTIONS)
    body = "\n".join(f'''            <section class="c-case__section" id="case-{sid}" aria-labelledby="case-{sid}-title">
              <h2 class="c-case__h2" id="case-{sid}-title" data-reveal>{bi(en, ar)}</h2>
              <div class="c-case__body" data-reveal>
              {sections[sid]}
              </div>
            </section>''' for sid, en, ar in SECTIONS)
    more = "\n".join(card(x) for x in (prev, nxt))
    return f'''<main id="main" class="c-case">
      <section class="c-case-hero" aria-labelledby="case-title">
        <div class="l-container">
          <nav class="c-crumbs" aria-label="Breadcrumb">
            <ol class="c-crumbs__list" role="list">
              <li><a href="/">{bi("Home", "الرئيسية")}</a></li>
              <li><a href="/work">{bi("Case studies", "دراسات الحالة")}</a></li>
              <li aria-current="page">{bi(*c["title"])}</li>
            </ol>
          </nav>
          <div class="c-case-hero__grid">
            <div class="c-case-hero__text" data-reveal-group>
              <p class="t-label c-detail__eyebrow">{bi(*c["category"])}</p>
              <h1 class="c-detail__headline" id="case-title">{bi(*c["title"])}</h1>
              <p class="t-body-lg c-detail__lead">{bi(*c["summary"])}</p>
            </div>
            <div class="c-case-hero__cover" style="view-transition-name: case-{c["slug"]}">{cover(c["slug"], lazy=False, sizes="(min-width: 64em) 58vw, 100vw")}</div>
          </div>
        </div>
      </section>

      <section class="l-section c-case__main">
        <div class="l-container c-case__grid">
          <nav class="c-case__toc" aria-label="{plain(bi("On this page", "في هذه الصفحة"))}">
            <p class="t-label">{bi("On this page", "في هذه الصفحة")}</p>
            <ol role="list">
{toc}
            </ol>
          </nav>
          <div class="c-case__content">
{body}
          </div>
        </div>
      </section>

      <section class="l-section l-section--tight c-case__more" aria-labelledby="case-more">
        <div class="l-container">
          <header class="c-svc__head">
            <p class="t-label c-detail__eyebrow">{bi("More case studies", "دراسات حالة أخرى")}</p>
            <h2 class="c-svc__h2" id="case-more">{bi("Keep reading.", "تابع القراءة.")}</h2>
          </header>
          <ul class="c-case-cards c-case-cards--two" role="list" data-reveal-group>
{more}
          </ul>
          <p class="c-detail__more"><a class="c-link" href="/work"><span>{bi("All case studies", "كل دراسات الحالة")}</span>{ARROW}</a></p>
        </div>
      </section>
      {closing()}
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
        (site / "work" / f"{c['slug']}.html").write_text(page + case_main(c, prev, nxt) + shell_tail, encoding="utf-8")

    # The site's menu and footer: "Story" becomes the case studies.
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
