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
  - .htaccess: long caching for the hashed files, and the CSP script hashes
    recomputed for the inline scripts that remain (the reveal failsafe, the
    analytics stub, JSON data blocks).
"""
import base64
import hashlib
import pathlib
import re
import sys

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

    css_name, js_name = f"site.{digest(css)}.css", f"site.{digest(js)}.js"
    (site / "assets" / css_name).write_text(css.strip() + "\n", encoding="utf-8")
    (site / "assets" / js_name).write_text(js.strip() + "\n", encoding="utf-8")
    link = f'<link rel="stylesheet" href="/assets/{css_name}" />'
    script = f'<script type="module" src="/assets/{js_name}"></script>'

    for page, text in texts.items():
        text = re.sub(r"<style>.*?</style>", lambda m: link, text, count=1, flags=re.S)
        text = re.sub(r'<script type="module">.*?</script>', lambda m: script, text, count=1, flags=re.S)
        page.write_text(text, encoding="utf-8")

    go = site / "go.html"
    text = go.read_text(encoding="utf-8")
    a, b = text.find(START), text.find(END)
    if a < 0 or b < 0:
        sys.exit("finalize: SHARED-STYLES markers missing in go.html")
    go.write_text(text[:a] + f"{START}\n    {link}\n{END}" + text[b + len(END):], encoding="utf-8")

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
    htaccess.write_text(rules, encoding="utf-8")

    before = sum(len(t) for t in texts.values())
    after = sum(p.stat().st_size for p in pages)
    print(f"finalize: {len(pages)} pages share {css_name} + {js_name}; HTML {before // 1024} KB → {after // 1024} KB")


if __name__ == "__main__":
    build(pathlib.Path(__file__).resolve().parent.parent / "site")
