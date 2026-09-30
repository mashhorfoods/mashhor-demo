"""The editing panel, /cms/: Sveltia CMS (MIT, pinned in package.json), which
edits the files in content/ and tools/config.json and commits each save to
GitHub; the push builds, tests and uploads the site (.github/workflows/).

    site/cms/index.html               loads the panel
    site/cms/sveltia-cms-<ver>.js     the panel itself, from node_modules
    site/cms/config.yml               what it edits, written here from the
                                      content files, so every price, study and
                                      chapter present is editable, labelled,
                                      and nothing can be added or removed
                                      that the build could not place
    site/cms/.htaccess                its own security policy (it talks to
                                      api.github.com), never cached, never
                                      indexed

Signing in takes a GitHub token with write access to this repository's
contents (LAUNCH.md says how to make one); without it the panel shows its
sign-in screen and nothing else.
"""
import json
import pathlib
import re
import shutil

import content

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPO, BRANCH = "mashhorfoods/mashhor-demo", "main"
SERVICES = {"branding": "الهوية والتصميم", "websites": "المواقع الإلكترونية",
            "social": "إدارة وسائل التواصل", "marketing": "الإعلانات المدفوعة"}
TIER_NAME = r'<h3 class="c-tier__name" id="price-{svc}-{tid}-name"[^>]*>([^<]+)</h3>'

# Scripts: only the panel's own file. Off-site it reaches GitHub (the content
# and the signed-in user's avatar), unpkg.com for its Arabic interface text
# (data, never code) and jsDelivr for its typeface.
POLICY = ("default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; "
          "script-src 'self'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
          "font-src 'self' data: https://cdn.jsdelivr.net; "
          "img-src 'self' data: blob: https://avatars.githubusercontent.com https://raw.githubusercontent.com; "
          "connect-src 'self' data: blob: https://api.github.com https://raw.githubusercontent.com "
          "https://www.githubstatus.com https://unpkg.com")

HTACCESS = f"""# The editing panel. Its own policy: it talks to GitHub, and nothing else.
<IfModule mod_headers.c>
  Header set Content-Security-Policy "{POLICY}"
  Header set X-Robots-Tag "noindex, nofollow"
  Header set Cache-Control "no-cache"
  <FilesMatch "^sveltia-cms-[0-9.]+\\.js$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
</IfModule>
<IfModule mod_mime.c>
  AddType text/yaml .yml
</IfModule>
"""

PAGE = """<!doctype html>
<html lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>تحرير المحتوى — بيكسورا</title>
  <link rel="cms-config-url" type="text/yaml" href="config.yml">
</head>
<body>
  <script src="{script}"></script>
</body>
</html>
"""


def text(name, label, hint=None, long=False):
    """A bilingual text: English and Arabic, both required."""
    field = lambda lang, lab: {"name": lang, "label": lab, "widget": "text" if long else "string", "required": True}
    out = {"name": name, "label": label, "widget": "object", "collapsed": False,
           "fields": [field("ar", "بالعربية"), field("en", "English")]}
    if hint:
        out["hint"] = hint
    return out


def settings():
    pricing = (ROOT / "source" / "pricing.html").read_text(encoding="utf-8")
    prices = content.load("prices.json")
    services = []
    for svc, tiers in prices.items():
        fields = []
        for tid in tiers:
            name = re.search(TIER_NAME.format(svc=svc, tid=tid), pricing).group(1).strip()
            fields.append({"name": tid, "label": name, "widget": "number", "value_type": "int",
                           "min": 1, "max": 1000000, "step": 1, "required": True})
        services.append({"name": svc, "label": SERVICES[svc], "widget": "object", "collapsed": False,
                         "hint": "بالدولار الأمريكي. «يبدأ من» في الصفحة الرئيسية يُحسب من أقل باقة.", "fields": fields})
    return {
        "name": "settings", "label": "الأسعار والتواصل", "label_singular": "إعداد",
        "icon": "sell",
        "files": [
            {"name": "prices", "label": "أسعار الباقات", "file": "content/prices.json", "format": "json",
             "fields": services},
            {"name": "whatsapp", "label": "رقم واتساب", "file": "tools/config.json", "format": "json",
             "fields": [{"name": "whatsapp", "label": "الرقم", "widget": "string", "required": True,
                         "hint": "أرقام فقط، بمفتاح الدولة ومن دون + أو مسافات. مثال: 971501234567",
                         "pattern": ["^[1-9][0-9]{7,14}$", "أرقام فقط بمفتاح الدولة، من 8 إلى 15 رقمًا، بلا + ولا مسافات"]}]},
            {"name": "brands", "label": "علامات من أعمالنا", "file": "content/brands.json", "format": "json",
             "fields": [{"name": "brands", "label": "العلامات", "label_singular": "علامة", "widget": "list",
                         "min": 3, "max": 12, "collapsed": True, "summary": "{{fields.ar}} — {{fields.en}}",
                         "fields": [{"name": "ar", "label": "بالعربية", "widget": "string", "required": True},
                                    {"name": "en", "label": "English", "widget": "string", "required": True}]}]},
        ],
    }


def studies():
    from cases import CASES
    files = []
    for c in CASES:
        slug = c["slug"]
        data = content.load(f"studies/{slug}.json")
        chapters = []
        for n, (key, ch) in enumerate(data["chapters"].items(), 1):
            chapters.append({"name": key, "label": f"الفصل {n} · {ch['note']['ar']}", "widget": "object", "collapsed": True,
                             "fields": [text("note", "العنوان الصغير (فوق الفصل)"), text("title", "عنوان الفصل"),
                                        text("lead", "النص", long=True), text("aside", "ملاحظة جانبية", long=True)]})
        files.append({
            "name": slug, "label": data["card"]["title"]["ar"], "file": f"content/studies/{slug}.json", "format": "json",
            "fields": [
                {"name": "card", "label": "البطاقة في صفحة الأعمال", "widget": "object", "collapsed": True,
                 "fields": [text("category", "التصنيف"), text("title", "العنوان"), text("summary", "الوصف المختصر", long=True)]},
                text("headline", "العنوان الرئيسي"),
                text("standfirst", "المقدمة", long=True),
                {"name": "chapters", "label": "الفصول", "widget": "object", "collapsed": False, "fields": chapters},
                text("close", "الجملة الختامية", long=True),
            ],
        })
    return {"name": "studies", "label": "دراسات الحالة", "label_singular": "دراسة", "icon": "auto_stories",
            "description": "كلمات كل دراسة بالعربية والإنجليزية. الصور وترتيب الفصول ثابتة في الكود.", "files": files}


def build(site):
    package = ROOT / "node_modules" / "@sveltia" / "cms"
    if not package.exists():
        raise SystemExit("cms: node_modules/@sveltia/cms is missing — run `npm ci` first")
    version = json.loads((package / "package.json").read_text(encoding="utf-8"))["version"]
    out = site / "cms"
    out.mkdir()
    script = f"sveltia-cms-{version}.js"
    shutil.copyfile(package / "dist" / "sveltia-cms.js", out / script)
    shutil.copyfile(package / "LICENSE.txt", out / "LICENSE.txt")
    (out / "index.html").write_text(PAGE.format(script=script), encoding="utf-8")
    (out / ".htaccess").write_text(HTACCESS, encoding="utf-8")
    config = {
        "backend": {"name": "github", "repo": REPO, "branch": BRANCH,
                    "commit_messages": {"update": "Content: {{path}} (edited in /cms/)",
                                        "create": "Content: {{path}} (edited in /cms/)",
                                        "delete": "Content: {{path}} removed (in /cms/)"}},
        "site_url": "https://zaokalyamamah.online",
        "display_url": "https://zaokalyamamah.online",
        "media_folder": "overlay/assets/uploads",
        "public_folder": "/assets/uploads",
        "publish_mode": "simple",
        "editor": {"preview": False},
        "collections": [settings(), studies()],
    }
    # JSON is YAML too: the panel reads it as its config.yml.
    (out / "config.yml").write_text("# Written by tools/cms.py from content/ — edit that, not this.\n"
                                    + json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
