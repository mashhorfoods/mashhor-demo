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
