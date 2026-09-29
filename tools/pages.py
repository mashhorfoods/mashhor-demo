#!/usr/bin/env python3
"""A preview copy of the built site for GitHub Pages.

The real site lives at the root of its domain, so every link and asset path
starts at "/" (/assets/…, /services/…). GitHub Pages serves this repository
under /<repo>/, where those paths would miss; this copies site/ to dist/pages/
with them moved under the base path. Nothing else changes, with three
exceptions, because Pages is static and public:
  - no PHP: lead.php, admin/ and _leads/ stay out (as source they would be
    downloadable); the campaign form then offers WhatsApp, as it does
    whenever the endpoint cannot be reached;
  - no .htaccess (Pages ignores it);
  - every page says noindex: the preview must not compete in search with
    the real site (its canonical links already point there).

    python3 tools/pages.py /mashhor-demo      (after tools/build.py)
"""
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE, OUT = ROOT / "site", ROOT / "dist" / "pages"
LEAVE_OUT = {"lead.php", "admin", "_leads", ".htaccess"}
# The site's own top-level paths; anything else starting with "/" is text
# ("/month") or protocol-relative ("//") and stays as it is.
ROUTE = r"(?=assets/|services/|work\b|pricing|about|story|privacy|terms|accessibility|go\b|#)"


def rebase(text, base, kind):
    if kind in ("html", "js"):
        # Attributes (href="/…", src, srcset, data-*) and JS strings ('/story').
        text = re.sub(r"""(["'`])/""" + ROUTE, lambda m: f"{m.group(1)}{base}/", text)
    if kind == "html":
        # The home link itself: href="/". (Not in JS, where '/' is also
        # just a separator, as in path.split('/').)
        text = text.replace('href="/"', f'href="{base}/"')
        # The later candidates in a srcset: ", /assets/…".
        text = re.sub(r",\s*/(?=assets/)", f", {base}/", text)
    if kind == "js" and "const HOME = " in text:
        # The site script builds its menu and footer links as HOME + "#id",
        # with HOME = '/' away from the homepage.
        old = "const HOME = document.getElementById('home') ? '' : '/';"
        if old not in text:
            sys.exit("pages: the site script's HOME constant changed — update tools/pages.py")
        text = text.replace(old, f"const HOME = document.getElementById('home') ? '' : '{base}/';")
    if kind in ("html", "css"):
        text = re.sub(r"url\(/(?=assets/)", f"url({base}/", text)
    if kind == "html":
        text = text.replace("<head>", '<head>\n    <meta name="robots" content="noindex" />', 1)
    return text


def build(base):
    base = "/" + base.strip("/")
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(SITE, OUT, ignore=lambda d, names: [n for n in names if pathlib.Path(d) == SITE and n in LEAVE_OUT])
    for path in OUT.rglob("*"):
        kind = {".html": "html", ".js": "js", ".css": "css"}.get(path.suffix)
        if kind:
            path.write_text(rebase(path.read_text(encoding="utf-8"), base, kind), encoding="utf-8")
    left = [str(p.relative_to(OUT)) for p in OUT.rglob("*.html") if re.search(r'(?:href|src)="/(?!/|' + base.strip("/") + ")", p.read_text(encoding="utf-8"))]
    if left:
        sys.exit(f"pages: root paths left in {', '.join(left)}")
    print(f"pages: dist/pages/ ready for {base}/")


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "/mashhor-demo")
