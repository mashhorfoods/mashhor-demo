"""Shared by the build steps."""
import json
import pathlib

CONFIG = json.loads((pathlib.Path(__file__).resolve().parent / "config.json").read_text(encoding="utf-8"))
# The business WhatsApp number, digits only (as wa.me wants it). The one place
# to change it: build.py writes it into go.html / go.js and checks that the
# supplied site's own links use the same number.
WHATSAPP = CONFIG["whatsapp"]
WA = f"https://wa.me/{WHATSAPP}"


def inject_css(page, css):
    """Append a block of CSS to the end of the page's stylesheet."""
    close = page.find("</style>")
    if close < 0:
        raise SystemExit("inject_css: page has no <style> block")
    return page[:close] + css + page[close:]


def pages(site, go=False):
    """The site's pages — every .html at the top and in services/ — in a fixed
    order. The campaign page (go.html) carries its own copy and styles, so it
    is left out unless asked for."""
    found = sorted(list(site.glob("*.html")) + list(site.glob("services/*.html")))
    return [p for p in found if go or p.name != "go.html"]


def inject_all(site, css):
    """Append a block of CSS to every page's stylesheet. Every page gets it,
    whether it uses it or not: finalize.py merges the pages' stylesheets into
    one shared file and refuses if they differ."""
    for page in pages(site):
        page.write_text(inject_css(page.read_text(encoding="utf-8"), css), encoding="utf-8")


def drop(site, names, step, keep_used=False):
    """Supplied files that no longer ship (a block or image this project
    replaced) leave site/assets. If a page still names one, the build stops —
    or, with keep_used, the file simply stays."""
    text = "".join(p.read_text(encoding="utf-8") for p in pages(site, go=True))
    for name in names:
        path = site / "assets" / name
        if not path.exists():
            continue
        if name in text:
            if keep_used:
                continue
            raise SystemExit(f"{step}: assets/{name} is dropped, but a page still uses it")
        path.unlink()
