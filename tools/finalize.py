#!/usr/bin/env python3
"""Last build step: one stylesheet and one script, shared by every page.

Every page of the supplied site carries the same ~150 KB stylesheet and the
same ~75 KB script inline — thirteen copies, downloaded again on every page.
This moves each into a single file named by its content hash
(assets/site.<hash>.css / .js): downloaded once, cached for a year, and a
changed file gets a new name, so no visitor ever runs a stale copy.

Then:
  - go.html links the same stylesheet (between its SHARED-STYLES markers);
    /admin/ finds it through the homepage;
  - the shared stylesheet loses the rules of components no page uses
    (prune_css.py);
  - .htaccess: long caching for the hashed files, and the CSP script hashes
    recomputed for the inline scripts that remain (the reveal failsafe, the
    analytics stub, JSON data blocks).
"""
import base64
import hashlib
import pathlib
import re
import sys

import prune_css

START, END = "<!-- SHARED-STYLES:START -->", "<!-- SHARED-STYLES:END -->"


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:10]


def build(site: pathlib.Path):
    pages = sorted(p for p in list(site.glob("*.html")) + list(site.glob("services/*.html")) if p.name != "go.html")
    texts = {p: p.read_text(encoding="utf-8") for p in pages}

    styles = {re.search(r"<style>(.*?)</style>", t, re.S).group(1) for t in texts.values()}
    modules = {re.search(r'<script type="module">(.*?)</script>', t, re.S).group(1) for t in texts.values()}
    if len(styles) != 1 or len(modules) != 1:
        sys.exit(f"finalize: pages disagree ({len(styles)} stylesheets, {len(modules)} scripts) — refusing to merge")
    css, js = styles.pop(), modules.pop()

    # Rules for components no page uses any more (see prune_css.py).
    uses = "".join(re.sub(r"<style>.*?</style>", "", t, flags=re.S) for t in texts.values()) + js
    for extra in ("go.html", "assets/go.js", "assets/motion.js", "admin/index.php", "admin/admin.js"):
        uses += re.sub(r"<style>.*?</style>", "", (site / extra).read_text(encoding="utf-8"), flags=re.S)
    prune_css.check_unused(uses)
    before_css = len(css)
    css = prune_css.prune(css)
    print(f"finalize: unused component styles pruned, {(before_css - len(css)) // 1024} KB")

    css_name, js_name = f"site.{digest(css)}.css", f"site.{digest(js)}.js"
    (site / "assets" / css_name).write_text(css.strip() + "\n", encoding="utf-8")
    (site / "assets" / js_name).write_text(js.strip() + "\n", encoding="utf-8")
    link = f'<link rel="stylesheet" href="/assets/{css_name}" />'
    # The motion layer (overlay/assets/motion.js) ships hashed the same way.
    motion_src = site / "assets" / "motion.js"
    motion_js = motion_src.read_text(encoding="utf-8")
    motion_name = f"motion.{digest(motion_js)}.js"
    (site / "assets" / motion_name).write_text(motion_js, encoding="utf-8")
    motion_src.unlink()
    motion = f'<script type="module" src="/assets/{motion_name}"></script>'
    script = f'<script type="module" src="/assets/{js_name}"></script>\n    {motion}'

    for page, text in texts.items():
        text = re.sub(r"<style>.*?</style>", lambda m: link, text, count=1, flags=re.S)
        text = re.sub(r'<script type="module">.*?</script>', lambda m: script, text, count=1, flags=re.S)
        page.write_text(text, encoding="utf-8")

    go = site / "go.html"
    text = go.read_text(encoding="utf-8")
    a, b = text.find(START), text.find(END)
    if a < 0 or b < 0:
        sys.exit("finalize: SHARED-STYLES markers missing in go.html")
    text = text[:a] + f"{START}\n    {link}\n{END}" + text[b + len(END):]
    text = re.sub(r'\s*<script type="module" src="/assets/motion\.[a-f0-9]+\.js"></script>', "", text)
    text = text.replace("</head>", f"    {motion}\n  </head>", 1)
    go.write_text(text, encoding="utf-8")

    htaccess = site / ".htaccess"
    rules = htaccess.read_text(encoding="utf-8")
    hashes = []
    for page in pages + [go]:
        for body in re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", page.read_text(encoding="utf-8"), re.S):
            h = "'sha256-" + base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode() + "'"
            if h not in hashes:
                hashes.append(h)
    rules = re.sub(r"(script-src 'self' https://plausible\.io)(?: '[^']+')+", lambda m: m.group(1) + " " + " ".join(hashes), rules)
    if "text/css" not in rules.split("<IfModule mod_expires.c>", 1)[1].split("</IfModule>", 1)[0]:
        rules = rules.replace('  ExpiresByType font/woff2 "access plus 1 year"',
                              '  ExpiresByType font/woff2 "access plus 1 year"\n'
                              '  # site.<hash>.css / .js: the name changes whenever the content does.\n'
                              '  ExpiresByType text/css "access plus 1 year"\n'
                              '  ExpiresByType text/javascript "access plus 1 year"\n'
                              '  ExpiresByType application/javascript "access plus 1 year"', 1)
    # HTML is small and names every hashed file it needs, so it is never kept:
    # browsers revalidate it on each visit, and LiteSpeed / the Hostinger CDN
    # (which cache desktop and mobile copies separately) do not store it — a
    # new upload shows on every device at once.
    rules = rules.replace('ExpiresByType text/html "access plus 1 hour"', 'ExpiresByType text/html "access plus 0 seconds"')
    rules = rules.replace('    Header set Cache-Control "public, max-age=3600, must-revalidate"\n',
                          '    Header set Cache-Control "no-cache"\n'
                          '    Header set X-LiteSpeed-Cache-Control "no-cache"\n'
                          '    Header set CDN-Cache-Control "no-store"\n')
    rules = rules.replace("a stale SITE, not a stale stylesheet. One hour, revalidated.", "a stale SITE, not a stale stylesheet. Revalidated on every visit.")
    htaccess.write_text(rules, encoding="utf-8")

    before = sum(len(t) for t in texts.values())
    after = sum(p.stat().st_size for p in pages)
    print(f"finalize: {len(pages)} pages share {css_name} + {js_name}; HTML {before // 1024} KB → {after // 1024} KB")


if __name__ == "__main__":
    build(pathlib.Path(__file__).resolve().parent.parent / "site")
