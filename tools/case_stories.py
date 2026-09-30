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

The words — headline, standfirst, each chapter's annotation, title, lead
and aside, the closing statement — live in content/studies/<slug>.json, where
the editing panel (/cms/) changes them; this file holds the shape they fill.
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
# The studies' shape. Hero slots: a (wide, 3:2), b (screen, 16:9), c (tall),
# d (strip). Their words — headline, standfirst, each chapter's annotation,
# title, lead and aside, the closing statement — are in
# content/studies/<slug>.json (edited from /cms/) and joined in below.
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
        "chapters": [
            {"key": "problem", "sketch": "scatter", "work": []},
            {"key": "research", "sketch": "search", "work": ["identity"]},
            {"key": "system", "sketch": "grid", "work": ["guidelines"]},
            {"key": "test", "sketch": "devices", "work": ["packaging", "stationery"]},
            {"key": "result", "sketch": "hub", "work": ["social", "deck"]},
        ],
        "close": ("/services/branding", ("See branding &amp; design", "خدمة الهوية والتصميم")),
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
        "chapters": [
            {"key": "reader", "sketch": "pages", "work": []},
            {"key": "content", "sketch": "hierarchy", "work": ["cover"]},
            {"key": "grid", "sketch": "grid", "work": ["spread"]},
            {"key": "data", "sketch": "chart", "work": ["deck"]},
            {"key": "result", "sketch": "hub", "work": ["brochure"]},
        ],
        "close": ("/#contact", ("Talk to the team", "تحدّث مع الفريق")),
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
        "chapters": [
            {"key": "gap", "sketch": "table", "work": []},
            {"key": "question", "sketch": "search", "work": ["infographic"]},
            {"key": "narrative", "sketch": "path", "work": ["visuals"]},
            {"key": "form", "sketch": "chart", "work": ["deck"]},
            {"key": "result", "sketch": "hub", "work": ["summary"]},
        ],
        "close": ("/#contact", ("Talk to the team", "تحدّث مع الفريق")),
    },
    "digital-campaigns": {
        "pieces": {
            "key-visual": (("Key visual", "الصورة الرئيسية"), (3, 2), "sheet"),
            "motion": (("Motion", "الموشن"), (16, 9), "play"),
            "stories": (("Stories", "الستوري"), (9, 16), "phone"),
            "feed": (("Feed posts", "منشورات الحساب"), (9, 5), "grid"),
        },
        "hero": ["key-visual", "motion", "stories", "feed"],
        "chapters": [
            {"key": "problem", "sketch": "scatter", "work": []},
            {"key": "direction", "sketch": "target", "work": ["key-visual"]},
            {"key": "system", "sketch": "grid", "work": ["feed", "stories"]},
            {"key": "motion", "sketch": "motion", "work": ["motion"]},
            {"key": "result", "sketch": "hub", "work": []},
        ],
        "close": ("/services/social", ("See social media management", "خدمة إدارة وسائل التواصل")),
    },
}


def _words():
    """Join each study's words (content/studies/<slug>.json) to its shape."""
    import content
    for slug, st in STORIES.items():
        words = content.study(slug)
        keys = [ch["key"] for ch in st["chapters"]]
        if list(words["chapters"]) != keys:
            raise SystemExit(f"content: content/studies/{slug}.json: the chapters must be {', '.join(keys)}, in that order")
        st["headline"], st["standfirst"] = words["headline"], words["standfirst"]
        for ch in st["chapters"]:
            ch.update(words["chapters"][ch["key"]])
        href, label = st["close"]
        st["close"] = (words["close"], href, label)
        st["card"] = words["card"]


_words()
