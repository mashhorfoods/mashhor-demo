"""The case studies, told the way the Al Mada story is told (tools/cases.py
builds the pages from this).

Each study has:

  pieces    the work it is shown through, by key: label, the frame's
            proportions and an icon. A piece is an image when
            overlay/assets/case-<slug>-<key>.webp exists (encode it with
            `python3 tools/images.py work <folder>`), and a placeholder in the
            same proportions until then, so the layout does not move when the
            real work arrives.
  hero      four of the pieces, laid out like prints on a table beside the
            title (the slots follow the story's: wide, screen, tall, strip),
            each a link down to the chapter that shows it.
  chapters  five: an annotation, a headline, the lead, an aside, a drawing
            (the story's hand-drawn line, see SKETCHES) and the pieces that
            chapter shows, if any.
  close     the closing statement and where it leads.
  behance   where more of this work is on Behance (optional): a second link
            beside the closing one.

Every sentence is in the team's voice, in both languages, and states no
number or result the work cannot show.
"""
import math
import random

# ---------------------------------------------------------------------------
# Icons for the placeholders (24×24, stroked).
ICONS = {
    "sheet": "M3 5h18v14H3z M7.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0 M15 9h3 M15 12h3 M15 15h3",
    "book": "M3 6c3-1 6-1 9 1c3-2 6-2 9-1v12c-3-1-6-1-9 1c-3-2-6-2-9-1z M12 7v12",
    "box": "M4 8l8-4 8 4v8l-8 4-8-4z M4 8l8 4 8-4 M12 12v8",
    "card": "M3 7h18v10H3z M6 11h6 M6 14h4",
    "phone": "M8 3h8v18H8z M11 18h2",
    "screen": "M3 5h18v11H3z M12 16v4 M8 20h8",
    "chart": "M4 20V4 M4 20h16 M8 16v-5 M12 16V8 M16 16v-3",
    "pin": "M12 21s-6-6.5-6-11a6 6 0 0 1 12 0c0 4.5-6 11-6 11z M10 10a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
    "play": "M3 5h18v14H3z M10 9l5 3-5 3z",
    "doc": "M6 3h9l3 3v15H6z M9 9h6 M9 12h6 M9 15h4",
    "grid": "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
}


# ---------------------------------------------------------------------------
# The drawings: the story's line — pen strokes that draw themselves in order
# (each path's --d) when the chapter arrives. 400×300.
class Sketch:
    def __init__(self, seed):
        self.parts = []
        self.d = 0
        self.rng = random.Random(seed)

    def _j(self, n=1.8):
        return round(self.rng.uniform(-n, n), 2)

    def ink(self, d, accent=False, draft=False, width=1.6):
        cls = "c-sketch__ink" + (" c-sketch__ink--accent" if accent else "") + (" c-sketch__ink--draft" if draft else "")
        self.parts.append(f'<path d="{d}" pathLength="1" style="--d:{self.d}" class="{cls}" stroke-width="{width}" />')
        self.d += 1

    def box(self, x, y, w, h, rot=0, accent=False, draft=False):
        j = self._j
        paths = [f"M{x} {y + j()} L{x + w + 1.5} {y + j()}", f"M{x + w + j()} {y} L{x + w + j()} {y + h + 1.5}",
                 f"M{x + w + 1} {y + h + j()} L{x} {y + h + j()}", f"M{x + j()} {y + h + 1} L{x + j()} {y - 1.5}"]
        self.parts.append(f'<g transform="rotate({rot} {x + w / 2} {y + h / 2})">')
        for p in paths:
            self.ink(p, accent=accent, draft=draft)
        self.parts.append("</g>")

    def line(self, x1, y1, x2, y2, **k):
        self.ink(f"M{x1} {y1 + self._j(0.8)} L{x2} {y2 + self._j(0.8)}", **k)

    def circle(self, cx, cy, r, **k):
        self.ink(f"M{cx - r} {cy} a{r} {r} 0 1 0 {2 * r} 0 a{r} {r} 0 1 0 {-2 * r} 0", **k)

    def dot(self, cx, cy, r=5, accent=True):
        cls = "c-sketch__mark" + (" c-sketch__mark--accent" if accent else "")
        self.parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" style="--d:{self.d}" class="{cls}" />')
        self.d += 1

    def arrow(self, x, y, dx, dy, **k):
        """An arrowhead at (x, y), pointing along (dx, dy)."""
        a = math.atan2(dy, dx)
        pts = [(x - 11 * math.cos(a - 0.5), y - 11 * math.sin(a - 0.5)), (x - 11 * math.cos(a + 0.5), y - 11 * math.sin(a + 0.5))]
        self.ink(f"M{x} {y} L{pts[0][0]:.1f} {pts[0][1]:.1f} M{x} {y} L{pts[1][0]:.1f} {pts[1][1]:.1f}", **k)


def _scatter(s):
    for x, y, w, h, r, (mx, my, mr) in [(30, 40, 110, 80, -6, (60, 70, 16)), (200, 24, 90, 66, 5, (262, 48, 9)),
                                        (60, 170, 96, 72, 7, (128, 214, 12)), (240, 150, 118, 86, -4, (270, 196, 22))]:
        s.box(x, y, w, h, r)
        s.circle(mx, my, mr)
    s.line(160, 122, 176, 116)
    s.line(196, 110, 204, 118)


def _search(s):
    s.box(40, 40, 200, 220, -2)
    for i, w in enumerate((150, 120, 160, 100, 140, 90, 130)):
        s.line(62, 78 + i * 24, 62 + w, 78 + i * 24, width=1.2)
    s.circle(250, 150, 58, accent=True, width=2)
    s.line(292, 192, 348, 250, accent=True, width=2.4)


def _grid(s):
    for row in range(2):
        for col in range(3):
            x, y = 40 + col * 112, 50 + row * 110
            s.box(x, y, 96, 94, 0)
            s.dot(x + 16, y + 16, 4, accent=(row, col) == (0, 0))
    s.line(40, 30, 372, 30, draft=True)


def _devices(s):
    s.box(40, 50, 140, 200, -3)
    s.circle(110, 120, 26, accent=True, width=2)
    s.line(72, 190, 150, 190)
    s.line(80, 212, 140, 212)
    s.box(260, 70, 90, 170, 3)
    s.line(290, 226, 320, 226)
    s.circle(305, 130, 18, accent=True, width=2)
    s.ink("M184 150 C210 136 232 136 256 146", draft=True)


def _hub(s):
    for x1, y1, x2, y2 in [(200, 112, 200, 78), (238, 150, 262, 150), (200, 188, 200, 222), (162, 150, 138, 150)]:
        s.line(x1, y1, x2, y2, width=1.4)
    for x, y in [(170, 33), (267, 129), (170, 225), (75, 129)]:
        s.box(x, y, 60, 42, 0)
    s.circle(200, 150, 34, accent=True, width=2)
    s.dot(200, 150)


def _pages(s):
    s.box(60, 70, 170, 200, 0)
    s.box(74, 56, 170, 200, 0)
    for i in range(7):
        s.line(96, 86 + i * 22, 220, 86 + i * 22, width=1.1)
    s.box(210, 30, 150, 190, 14, draft=True)
    s.arrow(330, 262, 10, 12)
    s.ink("M300 222 C312 238 322 250 330 262")


def _hierarchy(s):
    s.box(90, 30, 220, 250, 0)
    s.line(118, 72, 262, 72, accent=True, width=5)
    s.line(118, 104, 230, 104, width=2.6)
    for i, w in enumerate((160, 150, 164, 120)):
        s.line(118, 140 + i * 20, 118 + w, 140 + i * 20, width=1.1)
    s.line(118, 236, 200, 236, width=2.2)


def _chart(s):
    s.line(60, 40, 60, 250)
    s.line(60, 250, 360, 250)
    for i, h in enumerate((70, 120, 95, 160)):
        s.box(90 + i * 66, 250 - h, 40, h, 0, accent=(i == 3))
    s.ink("M110 170 C160 140 200 150 240 118 S310 80 336 70", width=1.4)
    s.dot(336, 70)


def _table(s):
    for i in range(6):
        s.line(40, 50 + i * 40, 360, 50 + i * 40, width=1.1)
    for i in range(5):
        s.line(40 + i * 80, 50, 40 + i * 80, 250, width=1.1)
    s.circle(240, 150, 30, accent=True, width=2)
    s.dot(240, 150, 4)


def _path(s):
    s.ink("M40 150 l14 -30 l10 44 l12 -52 l10 60 l12 -40 l10 30 l12 -24", draft=True)
    s.ink("M130 138 C180 110 220 190 270 150 S330 120 352 150", accent=True, width=2)
    s.arrow(352, 150, 1, 0.6, accent=True, width=2)
    s.box(40, 200, 90, 50, -3)
    s.box(260, 200, 90, 50, 2)






def _target(s):
    for r in (96, 64, 32):
        s.circle(200, 150, r, width=1.4)
    s.ink("M60 40 L192 144", accent=True, width=2)
    s.arrow(192, 144, 132, 104, accent=True, width=2)
    s.dot(200, 150)


def _motion(s):
    s.box(100, 60, 220, 150, 0)
    s.ink("M188 104 L236 135 L188 166 Z", accent=True, width=2)
    for i, w in enumerate((50, 70, 40)):
        s.line(40, 110 + i * 26, 40 + w, 110 + i * 26, draft=True)
    s.line(100, 240, 320, 240)
    s.dot(180, 240)


SKETCHES = {  # kind: (draw, EN, AR)
    "scatter": (_scatter, "The same mark drawn four different ways, in four boxes that do not line up.",
                "العلامة نفسها مرسومة بأربع طرق مختلفة، في أربعة مربعات لا تتسق."),
    "search": (_search, "A page of notes under a magnifying glass.", "صفحة ملاحظات تحت عدسة مكبّرة."),
    "grid": (_grid, "Six panels on one grid, the mark in the same place on each.",
             "ست لوحات على شبكة واحدة، والعلامة في المكان نفسه على كلٍّ منها."),
    "devices": (_devices, "A printed box and a phone carrying the same mark, joined by a line.",
                "عبوة مطبوعة وهاتف يحملان العلامة نفسها، ويصل بينهما خط."),
    "hub": (_hub, "Four surfaces arranged around one centre.", "أربع واجهات مرتّبة حول مركز واحد."),
    "pages": (_pages, "A stack of dense pages, the top one slipping away.", "كومة صفحات مزدحمة، وأعلاها ينزلق بعيدًا."),
    "hierarchy": (_hierarchy, "A page where one heading leads and the lines beneath it follow in order.",
                  "صفحة يتقدّمها عنوان واحد، وتتبعه السطور بترتيبها."),
    "chart": (_chart, "A simple bar chart with one bar and one point marked.", "رسم أعمدة بسيط، عُلِّم فيه عمود واحد ونقطة واحدة."),
    "table": (_table, "A dense table with one figure circled.", "جدول مزدحم، ورقم واحد فيه محاط بدائرة."),
    "path": (_path, "A tangled line straightening into a clear path.", "خط متشابك يستقيم ليصبح مسارًا واضحًا."),
    "target": (_target, "One target, one arrow.", "هدف واحد، وسهم واحد."),
    "motion": (_motion, "A frame with a play mark and lines of movement.", "إطار فيه علامة تشغيل وخطوط حركة."),
}


def sketch(kind, alt_id, seed):
    draw, en, ar = SKETCHES[kind]
    s = Sketch(seed)
    draw(s)
    return (f'<svg class="c-sketch" viewBox="0 0 400 300" fill="none" role="img" aria-labelledby="{alt_id}" '
            f'preserveAspectRatio="xMidYMid meet"><title id="{alt_id}">{en}</title>{"".join(s.parts)}</svg>'), (en, ar)


# ---------------------------------------------------------------------------
# The studies. Hero slots: a (wide, 3:2), b (screen, 16:9), c (tall), d (strip).
STORIES = {
    "brand-identity-systems": {
        "behance": "https://www.behance.net/gallery/119607411/Brands-ID",
        "pieces": {
            "identity": (("Identity sheet", "لوحة الهوية"), (3, 2), "sheet"),
            "guidelines": (("Brand guidelines", "دليل الهوية"), (16, 9), "book"),
            "packaging": (("Packaging", "التغليف"), (4, 5), "box"),
            "stationery": (("Stationery", "المطبوعات المكتبية"), (9, 5), "card"),
            "social": (("On social media", "على منصات التواصل"), (4, 5), "phone"),
            "deck": (("Company presentation", "العرض التعريفي"), (16, 9), "screen"),
        },
        "hero": ["identity", "guidelines", "packaging", "stationery"],
        "headline": ("A logo is where a brand starts, not where it ends.", "الشعار بداية العلامة، لا نهايتها."),
        "standfirst": ("Startups, SMEs, FMCG companies, agencies and humanitarian initiatives across Sudan and Oman came to us for an identity. What each of them received was a system: the mark, and the rules that keep it the same on every surface it will ever touch.",
                       "جاءتنا شركات ناشئة ومنشآت صغيرة ومتوسطة وشركات سلع استهلاكية ووكالات ومبادرات إنسانية في السودان وعُمان من أجل هوية. وما حصل عليه كلٌّ منها كان نظامًا: العلامة، والقواعد التي تُبقيها واحدة على كل واجهة ستظهر عليها."),
        "chapters": [
            {"key": "problem", "note": ("the problem", "المشكلة"), "sketch": "scatter",
             "title": ("One logo, four versions of the business.", "شعار واحد، وأربع نسخ من الشركة."),
             "lead": ("Most organisations reach us with a logo and no system. The mark looks one way on the product, another in the report, a third on the website — and every new designer adds a fourth. Customers never see a logo on its own; they see every place it appears, and when those places disagree, the business looks unsure of itself.",
                      "تصلنا معظم المؤسسات بشعار بلا نظام. تبدو العلامة بشكل على المنتج، وبآخر في التقرير، وبثالث على الموقع — وكل مصمم جديد يضيف شكلًا رابعًا. العميل لا يرى الشعار وحده؛ يرى كل مكان يظهر فيه، وحين تختلف هذه الأماكن تبدو الشركة غير واثقة من نفسها."),
             "aside": ("The same problem at every size: from a startup's first product to an organisation's tenth report.",
                       "المشكلة نفسها بكل الأحجام: من أول منتج لشركة ناشئة إلى التقرير العاشر لمؤسسة."),
             "work": []},
            {"key": "research", "note": ("the research", "البحث"), "sketch": "search",
             "title": ("We start with the business, not the typeface.", "نبدأ بالعمل نفسه، لا بالخط."),
             "lead": ("Before anything is drawn we study the organisation, its audience, its goals and the places its communication breaks down. Then we explore several visual directions — and each is judged on one question: can it say what this business needs to say, everywhere it needs to say it?",
                      "قبل أن نرسم أي شيء ندرس المؤسسة وجمهورها وأهدافها والمواضع التي يتعثر فيها تواصلها. ثم نستكشف عدة اتجاهات بصرية — ويُحكم على كلٍّ منها بسؤال واحد: هل يستطيع أن يقول ما تحتاج هذه الشركة أن تقوله، في كل مكان تحتاج أن تقوله فيه؟"),
             "aside": ("A direction that cannot be explained in one sentence is not ready to be drawn.",
                       "الاتجاه الذي لا يُشرح في جملة واحدة ليس جاهزًا للرسم."),
             "work": ["identity"]},
            {"key": "system", "note": ("the system", "النظام"), "sketch": "grid",
             "title": ("One mark, written down so anyone can use it.", "علامة واحدة، مكتوبة بحيث يستطيع أي أحد استخدامها."),
             "lead": ("A logo system that works from a favicon to a shop front. Colours with their values written down. Type chosen to stay legible in Arabic and English. Modular layouts and the supporting shapes, patterns and icons that let the client's own team build a new page without starting from nothing — all of it gathered in guidelines.",
                      "نظام شعار يعمل من أيقونة المتصفح حتى واجهة المتجر. ألوان بقيمها المكتوبة. وخطوط اختيرت لتبقى واضحة بالعربية والإنجليزية. وتخطيطات مرنة الوحدات، وأشكال وأنماط وأيقونات مساندة تمكّن فريق العميل من بناء صفحة جديدة دون أن يبدأ من الصفر — وكل ذلك مجموع في دليل للهوية."),
             "aside": ("Guidelines are written for the client's team, not for other designers.",
                       "يُكتب الدليل لفريق العميل، لا للمصممين الآخرين."),
             "work": ["guidelines"]},
            {"key": "test", "note": ("the test", "الاختبار"), "sketch": "devices",
             "title": ("Tested where it will live: on the shelf and on the screen.", "مُختبَرة حيث ستعيش: على الرف وعلى الشاشة."),
             "lead": ("Every identity is tried at real size on the things it will actually be printed on and shown on — packaging, stationery, signage, a phone in the hand — before anything is handed over. The files leave us ready for the printer and the developer, so nothing has to be redrawn to fit.",
                      "تُجرَّب كل هوية بمقاسها الحقيقي على ما ستُطبع عليه وتُعرض فيه فعلًا — العبوة والمطبوعات المكتبية واللافتات والهاتف في اليد — قبل تسليم أي شيء. وتخرج الملفات من عندنا جاهزة للمطبعة وللمطوّر، فلا يحتاج شيء إلى إعادة رسم ليناسب مكانه."),
             "aside": ("A colour that works on screen and fails in print is caught here, not at the printer.",
                       "اللون الذي ينجح على الشاشة ويفشل في الطباعة يُكتشف هنا، لا في المطبعة."),
             "work": ["packaging", "stationery"]},
            {"key": "result", "note": ("what it produced", "ما أنتجه"), "sketch": "hub",
             "title": ("The same brand wherever the customer meets it.", "العلامة نفسها أينما التقاها العميل."),
             "lead": ("Identity systems that carry across packaging, corporate communication, campaigns, presentations, websites and social platforms. New material is made from the system rather than from scratch, which is what keeps a brand recognisable as the business grows.",
                      "أنظمة هوية تمتد عبر العبوات والتواصل المؤسسي والحملات والعروض والمواقع ومنصات التواصل. يُصنع كل جديد من النظام لا من الصفر، وهذا ما يُبقي العلامة مميّزة كلما كبرت الشركة."),
             "aside": ("We do not publish results we cannot prove. These chapters stop at what was delivered.",
                       "لا ننشر نتائج لا نستطيع إثباتها. تقف هذه الفصول عند ما سُلِّم."),
             "work": ["social", "deck"]},
        ],
        "close": (("An identity is finished when your own team can use it without us. That is the test every system here was built to pass.",
                   "تكتمل الهوية حين يستطيع فريقك استخدامها من دوننا. هذا هو الاختبار الذي بُني كل نظام هنا ليجتازه."),
                  "/services/branding", ("See branding &amp; design", "خدمة الهوية والتصميم")),
    },
    "editorial-publication-design": {
        "behance": "https://www.behance.net/moodboard/226170673/Editorial-Publication-Design",
        "pieces": {
            "spread": (("Report spread", "صفحات التقرير"), (3, 2), "book"),
            "deck": (("Presentation", "العرض التقديمي"), (16, 9), "screen"),
            "cover": (("Report cover", "غلاف التقرير"), (7, 10), "doc"),
            "brochure": (("Brochure", "الكتيّب"), (9, 5), "book"),
        },
        "hero": ["spread", "deck", "cover", "brochure"],
        "headline": ("Long documents, written to be read to the end.", "وثائق طويلة، صُمّمت لتُقرأ حتى آخرها."),
        "standfirst": ("Annual reports, humanitarian publications, brochures and presentations — work where the order of the information matters as much as how it looks. It is where the team has worked longest.",
                       "تقارير سنوية ومطبوعات إنسانية وكتيّبات وعروض تقديمية — عمل يهم فيه ترتيب المعلومة بقدر شكلها. وهو المجال الذي عمل فيه الفريق أطول وقت."),
        "chapters": [
            {"key": "reader", "note": ("the reader", "القارئ"), "sketch": "pages",
             "title": ("A report is only as good as the page where the reader gives up.", "قيمة التقرير تقف عند الصفحة التي يتوقف فيها القارئ."),
             "lead": ("Dense text, pages that change style halfway through, findings scattered across chapters: long reports lose their readers before they reach what matters. And the people who most need the information — donors, partners, decision-makers — are the ones with the least time to dig for it.",
                      "نصوص كثيفة، وصفحات يتغيّر أسلوبها في منتصف الطريق، ونتائج مبعثرة بين الفصول: تفقد التقارير الطويلة قرّاءها قبل أن يصلوا إلى المهم. والذين يحتاجون المعلومة أكثر من غيرهم — المانحون والشركاء وصنّاع القرار — هم أقلّهم وقتًا للبحث عنها."),
             "aside": ("Humanitarian communication and institutional reporting: the documents where clarity is not optional.",
                       "التواصل الإنساني والتقارير المؤسسية: وثائق لا يكون الوضوح فيها خيارًا."),
             "work": []},
            {"key": "content", "note": ("the content", "المحتوى"), "sketch": "hierarchy",
             "title": ("Before the grid, we read the whole thing.", "قبل الشبكة، نقرأ المحتوى كله."),
             "lead": ("Every publication starts with the content, not the layout. We analyse what is there, decide what the reader must see first and what can wait, and plan the document page by page — so the design has a structure to express instead of a pile of text to decorate.",
                      "تبدأ كل مطبوعة بالمحتوى لا بالتخطيط. نحلّل ما هو موجود، ونقرر ما يجب أن يراه القارئ أولًا وما يمكن أن ينتظر، ونخطط الوثيقة صفحةً صفحة — ليجد التصميم بنية يعبّر عنها، لا كومة نصوص يزيّنها."),
             "aside": ("Most layout problems are really hierarchy problems.", "معظم مشكلات التخطيط هي في حقيقتها مشكلات تسلسل."),
             "work": ["cover"]},
            {"key": "grid", "note": ("the grid", "الشبكة"), "sketch": "grid",
             "title": ("A grid that holds from the first page to the last.", "شبكة تصمد من الصفحة الأولى حتى الأخيرة."),
             "lead": ("A strong editorial grid, typography that stays consistent in both languages, and a small set of page types — chapter openers, story pages, data pages, case boxes — built on it. White space is placed on purpose, to give the eye somewhere to rest between the things that matter.",
                      "شبكة تحريرية متينة، وخطوط متسقة باللغتين، ومجموعة صغيرة من أنواع الصفحات مبنية عليها — افتتاحيات الفصول وصفحات القصص وصفحات البيانات والمربعات الجانبية. والمساحات البيضاء موضوعة عن قصد، لتمنح العين مكانًا تستريح فيه بين ما يهم."),
             "aside": ("Modular pages mean next year's report starts from a system, not a blank page.",
                       "الصفحات المرنة تعني أن تقرير العام القادم يبدأ من نظام، لا من صفحة فارغة."),
             "work": ["spread"]},
            {"key": "data", "note": ("the numbers", "الأرقام"), "sketch": "chart",
             "title": ("Numbers designed into the story, not dropped into it.", "أرقام تُصمَّم داخل القصة، لا تُلقى فيها."),
             "lead": ("Charts and infographics are part of the editorial flow: each one sits where the text raises its question, and answers only that. The same system carries into the presentation that goes with the report, so the room sees what the reader saw.",
                      "الرسوم البيانية والإنفوجرافيك جزء من السياق التحريري: يقف كلٌّ منها حيث يطرح النص سؤاله، ولا يجيب إلا عنه. ويمتد النظام نفسه إلى العرض التقديمي المرافق للتقرير، فيرى الحاضرون ما رآه القارئ."),
             "aside": ("Every chart is checked against its source before it is drawn.", "يُراجَع كل رسم بياني مقابل مصدره قبل أن يُرسم."),
             "work": ["deck"]},
            {"key": "result", "note": ("what it produced", "ما أنتجه"), "sketch": "hub",
             "title": ("Publications that speak as one institution.", "مطبوعات تتحدث بصوت مؤسسة واحدة."),
             "lead": ("Reports, brochures and presentations that are easier to navigate and keep a professional institutional look — for humanitarian organisations, NGOs and corporate readers alike — and an editorial system ready for the next one.",
                      "تقارير وكتيّبات وعروض أسهل في التنقل، تحافظ على مظهر مؤسسي احترافي — للمنظمات الإنسانية وغير الحكومية وقرّاء الشركات على حد سواء — ونظام تحريري جاهز للإصدار التالي."),
             "aside": ("We do not publish results we cannot prove. These chapters stop at what was delivered.",
                       "لا ننشر نتائج لا نستطيع إثباتها. تقف هذه الفصول عند ما سُلِّم."),
             "work": ["brochure"]},
        ],
        "close": (("If your next report has to be read, not just published, the work starts with its structure.",
                   "إذا كان تقريرك القادم يجب أن يُقرأ لا أن يُنشر فقط، فالعمل يبدأ ببنيته."),
                  "/#contact", ("Talk to the team", "تحدّث مع الفريق")),
    },
    "information-design": {
        "behance": "https://www.behance.net/moodboard/170306923/Information-Design-Visual-Storytelling",
        "pieces": {
            "visuals": (("Data visuals", "رسوم البيانات"), (3, 2), "chart"),
            "deck": (("Presentation", "العرض التقديمي"), (16, 9), "screen"),
            "infographic": (("Infographic", "الإنفوجرافيك"), (7, 10), "doc"),
            "summary": (("Research summary", "ملخص البحث"), (9, 5), "sheet"),
        },
        "hero": ["visuals", "deck", "infographic", "summary"],
        "headline": ("Research, turned into something people understand.", "أبحاث تتحوّل إلى ما يفهمه الناس."),
        "standfirst": ("Infographics, presentations and data stories built from datasets, technical reports and humanitarian assessments — for readers who need the finding, not the spreadsheet.",
                       "إنفوجرافيك وعروض وقصص بيانات مبنية من مجموعات البيانات والتقارير التقنية والتقييمات الإنسانية — لقرّاء يحتاجون النتيجة، لا جدول البيانات."),
        "chapters": [
            {"key": "gap", "note": ("the gap", "الفجوة"), "sketch": "table",
             "title": ("The insight is in the report. The reader never gets there.", "الفكرة موجودة في التقرير، لكن القارئ لا يصل إليها."),
             "lead": ("Datasets, technical reports and assessments hold valuable insight, written in tables and technical language that only specialists can read. The finding that matters is there — on page forty, in the fourth column — and the people who need it most will not find it.",
                      "تحمل مجموعات البيانات والتقارير التقنية والتقييمات رؤى قيّمة، مكتوبة بجداول ولغة تقنية لا يقرؤها إلا المتخصصون. النتيجة المهمة موجودة — في الصفحة الأربعين، في العمود الرابع — ومن يحتاجها أكثر من غيره لن يجدها."),
             "aside": ("Accuracy that nobody understands helps nobody.", "الدقة التي لا يفهمها أحد لا تنفع أحدًا."),
             "work": []},
            {"key": "question", "note": ("the question", "السؤال"), "sketch": "search",
             "title": ("Every chart starts as a question.", "كل رسم يبدأ بسؤال."),
             "lead": ("We read the research, verify the data, and look for the insight: what does this audience need to know, and what decision is it meant to support? Only then do we decide what to show — and what to leave in the appendix.",
                      "نقرأ البحث، ونتحقق من البيانات، ونبحث عن الفكرة: ماذا يحتاج هذا الجمهور أن يعرف، وأي قرار يُفترض أن تدعمه؟ عندها فقط نقرر ما نعرضه — وما نتركه في الملحق."),
             "aside": ("If a chart cannot say which question it answers, it does not get drawn.", "الرسم الذي لا يقول أي سؤال يجيب عنه، لا يُرسم."),
             "work": ["infographic"]},
            {"key": "narrative", "note": ("the story", "السرد"), "sketch": "path",
             "title": ("Data in the order a person thinks.", "البيانات بالترتيب الذي يفكر به الإنسان."),
             "lead": ("Context first, then the finding, then what it means, then what follows from it. The visual hierarchy walks the eye along that order, so a reader can follow the argument without being told where to look.",
                      "السياق أولًا، ثم النتيجة، ثم معناها، ثم ما يترتب عليها. ويقود التسلسل البصري العين على هذا الترتيب، فيتبع القارئ الفكرة دون أن يُقال له أين ينظر."),
             "aside": ("A story over isolated graphics.", "القصة قبل الرسوم المنفردة."),
             "work": ["visuals"]},
            {"key": "form", "note": ("the form", "الشكل"), "sketch": "chart",
             "title": ("Clarity over decoration. Accuracy over complexity.", "الوضوح قبل الزخرفة، والدقة قبل التعقيد."),
             "lead": ("We choose the simplest chart that tells the truth, give colour a meaning and keep it, and fit each visual into the report or presentation it belongs to — built on the same editorial principles as the pages around it.",
                      "نختار أبسط رسم يقول الحقيقة، ونعطي اللون معنى ونحافظ عليه، ونضع كل عنصر بصري في التقرير أو العرض الذي ينتمي إليه — مبنيًا على الأسس التحريرية نفسها التي بُنيت عليها الصفحات من حوله."),
             "aside": ("Colour is used to mean something, never to fill space.", "يُستخدم اللون ليعني شيئًا، لا ليملأ فراغًا."),
             "work": ["deck"]},
            {"key": "result", "note": ("what it produced", "ما أنتجه"), "sketch": "hub",
             "title": ("Made to be read in one sitting.", "مصمَّمة لتُقرأ في جلسة واحدة."),
             "lead": ("Visual communication that decision-makers, partners and the public can take in quickly without losing accuracy: summaries, infographics and presentations built from the same verified evidence.",
                      "تواصل بصري يستوعبه صنّاع القرار والشركاء والجمهور بسرعة دون أن تضيع الدقة: ملخصات وإنفوجرافيك وعروض مبنية من الأدلة الموثّقة نفسها."),
             "aside": ("We do not publish results we cannot prove. These chapters stop at what was delivered.",
                       "لا ننشر نتائج لا نستطيع إثباتها. تقف هذه الفصول عند ما سُلِّم."),
             "work": ["summary"]},
        ],
        "close": (("If your research has to reach people who will never open the full report, that is where we start.",
                   "إذا كان بحثك يجب أن يصل إلى من لن يفتح التقرير الكامل أبدًا، فمن هناك نبدأ."),
                  "/#contact", ("Talk to the team", "تحدّث مع الفريق")),
    },
    "digital-campaigns": {
        "pieces": {
            "key-visual": (("Key visual", "الصورة الرئيسية"), (3, 2), "sheet"),
            "motion": (("Motion", "الموشن"), (16, 9), "play"),
            "stories": (("Stories", "الستوري"), (9, 16), "phone"),
            "feed": (("Feed posts", "منشورات الحساب"), (9, 5), "grid"),
        },
        "hero": ["key-visual", "motion", "stories", "feed"],
        "headline": ("Not thirty posts. One campaign.", "ليست ثلاثين منشورًا، بل حملة واحدة."),
        "standfirst": ("Campaign systems that bring branding, visual storytelling and motion together — so every format the campaign ships in, on every platform, reads as the same brand.",
                       "أنظمة حملات تجمع الهوية والسرد البصري والموشن — ليبدو كل مقاس تُنشر به الحملة، على كل منصة، علامةً واحدة."),
        "chapters": [
            {"key": "problem", "note": ("the problem", "المشكلة"), "sketch": "scatter",
             "title": ("Good posts can still add up to no brand.", "منشورات جيدة قد لا تصنع علامة."),
             "lead": ("Brands often treat digital communication as a stream of one-off posts. Each one looks fine on its own; together they do not form a presence, and the brand becomes harder to recognise with every new design.",
                      "كثيرًا ما تتعامل العلامات مع التواصل الرقمي كسلسلة من المنشورات المنفصلة. يبدو كلٌّ منها جيدًا وحده؛ لكنها معًا لا تصنع حضورًا، ويصبح التعرّف على العلامة أصعب مع كل تصميم جديد."),
             "aside": ("Recognition is built by repetition, and inconsistency spends it.", "يُبنى التمييز بالتكرار، وعدم الاتساق يستهلكه."),
             "work": []},
            {"key": "direction", "note": ("the direction", "الاتجاه"), "sketch": "target",
             "title": ("One idea, decided before the first post is designed.", "فكرة واحدة تُحسم قبل تصميم أول منشور."),
             "lead": ("We start from the campaign's goals and its audience, and set one visual direction and a key visual the whole campaign grows from. Every later format is a version of that idea, not a new one.",
                      "نبدأ من أهداف الحملة وجمهورها، ونحدد اتجاهًا بصريًا واحدًا وصورة رئيسية تنمو منها الحملة كلها. وكل مقاس لاحق نسخة من هذه الفكرة، لا فكرة جديدة."),
             "aside": ("A campaign with two ideas is two campaigns, each half as strong.", "الحملة بفكرتين حملتان، كلٌّ منهما بنصف القوة."),
             "work": ["key-visual"]},
            {"key": "system", "note": ("the system", "النظام"), "sketch": "grid",
             "title": ("A system that resizes, not a design that restarts.", "نظام يتغيّر مقاسه، لا تصميم يبدأ من جديد."),
             "lead": ("Grid, type, colour and image treatment, set once and adapted to every format the campaign needs — feed posts, stories, covers and banners. A new size is a matter of hours, and it still looks like the campaign.",
                      "شبكة وخطوط وألوان ومعالجة للصور، تُضبط مرة واحدة وتتكيف مع كل مقاس تحتاجه الحملة — منشورات الحساب والستوري والأغلفة والبانرات. المقاس الجديد مسألة ساعات، ويبقى شبيهًا بالحملة."),
             "aside": ("Multi-platform adaptation is designed in from the start, not added at the end.",
                       "التكيف مع المنصات يُصمَّم من البداية، لا يُضاف في النهاية."),
             "work": ["feed", "stories"]},
            {"key": "motion", "note": ("motion", "الحركة"), "sketch": "motion",
             "title": ("Motion where it earns attention, not everywhere.", "الحركة حيث تستحق الانتباه، لا في كل مكان."),
             "lead": ("Motion graphics are built from the same system as the still designs — the same shapes, colours and type, now moving. They go where movement helps the message land, and nowhere it would only add noise.",
                      "يُبنى الموشن جرافيك من النظام نفسه الذي بُنيت منه التصاميم الثابتة — الأشكال والألوان والخطوط نفسها، لكنها تتحرك. ويوضع حيث تساعد الحركة الرسالة على الوصول، لا حيث لا تضيف إلا ضجيجًا."),
             "aside": ("The still and the moving versions of a campaign should be recognisably the same thing.",
                       "النسخة الثابتة والمتحركة من الحملة يجب أن تكونا الشيء نفسه بوضوح."),
             "work": ["motion"]},
            {"key": "result", "note": ("what it produced", "ما أنتجه"), "sketch": "hub",
             "title": ("One presence on every platform the campaign touches.", "حضور واحد على كل منصة تصل إليها الحملة."),
             "lead": ("A campaign system that scales: one brand presence everywhere, content that adapts quickly to each platform, and a set of assets the team can reuse for the next campaign instead of starting again.",
                      "نظام حملات قابل للتوسع: حضور واحد للعلامة في كل مكان، ومحتوى يتكيف بسرعة مع كل منصة، ومجموعة عناصر يعيد الفريق استخدامها في الحملة التالية بدل أن يبدأ من جديد."),
             "aside": ("We do not publish results we cannot prove. These chapters stop at what was delivered.",
                       "لا ننشر نتائج لا نستطيع إثباتها. تقف هذه الفصول عند ما سُلِّم."),
             "work": []},
        ],
        "close": (("If your posts look good one at a time but not together, the fix is a system, not another post.",
                   "إذا كانت منشوراتك جميلة كلٌّ على حدة لكنها لا تتسق معًا، فالحل نظام، لا منشور آخر."),
                  "/services/social", ("See social media management", "خدمة إدارة وسائل التواصل")),
    },
}
