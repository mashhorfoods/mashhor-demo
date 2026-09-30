"""The content the owner edits from the editing panel (/cms/), kept in
content/ as plain JSON so the panel can commit it and the build can read it:

    content/prices.json            the twelve package prices, by service and
                                   package id (USD, whole numbers)
    content/brands.json            the names in the homepage's "brands from
                                   our work" strip
    content/studies/<slug>.json    a case study's words: its card on /work,
                                   headline, standfirst, the five chapters'
                                   text and the closing statement
    tools/config.json              the WhatsApp number

Texts are plain (no HTML) in both languages; this module escapes them. The
structure a study is built on — its pieces, chapters' order, drawings, links —
stays in tools/case_stories.py and tools/cases.py; the panel edits words, not
the shape of a page.

apply(site) runs first, on the supplied pages as copied: it writes the prices
and the WhatsApp number wherever the supplied site states them, and the later
steps build on those. Unchanged content leaves every page byte for byte as it
was. Anything missing or malformed stops the build with a message saying
which file and field, so a bad edit never reaches the site.
"""
import html
import json
import pathlib
import re

from common import WHATSAPP

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"


def fail(where, what):
    raise SystemExit(f"content: {where}: {what}")


def load(name):
    path = CONTENT / name
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"content/{name}", "missing")
    except json.JSONDecodeError as e:
        fail(f"content/{name}", f"not valid JSON ({e})")


def escape(s):
    return html.escape(s, quote=False).replace('"', "&quot;")


def pair(value, where):
    """{"en": ..., "ar": ...} → (en, ar), whitespace tidied and escaped for HTML."""
    if not isinstance(value, dict):
        fail(where, "expected English and Arabic text")
    out = []
    for lang in ("en", "ar"):
        s = value.get(lang)
        if not isinstance(s, str) or not s.strip():
            fail(where, f"the {'English' if lang == 'en' else 'Arabic'} text is empty")
        out.append(escape(" ".join(s.split())))
    return tuple(out)


# ---------------------------------------------------------------------------
# Words.

def brands():
    data = load("brands.json").get("brands")
    if not isinstance(data, list) or not data:
        fail("content/brands.json", "no brands listed")
    return [pair(b, f"content/brands.json, brand {n}") for n, b in enumerate(data, 1)]


def study(slug):
    """A case study's words, as the build steps use them."""
    name = f"studies/{slug}.json"
    data = load(name)
    at = lambda *keys: f"content/{name}, {' → '.join(keys)}"
    get = lambda d, k: d.get(k) if isinstance(d, dict) else None
    card = data.get("card") or {}
    chapters = data.get("chapters")
    if not isinstance(chapters, dict):
        fail(f"content/{name}", "no chapters")
    return {
        "card": {k: pair(get(card, k), at("card", k)) for k in ("category", "title", "summary")},
        "headline": pair(data.get("headline"), at("headline")),
        "standfirst": pair(data.get("standfirst"), at("standfirst")),
        "chapters": {key: {k: pair(get(ch, k), at("chapters", key, k)) for k in ("note", "title", "lead", "aside")}
                     for key, ch in chapters.items()},
        "close": pair(data.get("close"), at("close")),
    }


# ---------------------------------------------------------------------------
# Prices: stated on the pricing page (each package's card and its WhatsApp
# message, the price data the page's script reads, the "from" in the index),
# in the contact form's package list and in the homepage's "from" per
# service. The service pages are built from these.

def _tier(pricing, svc, tid):
    at = pricing.find(f'aria-labelledby="price-{svc}-{tid}-name">')
    if at < 0:
        return None
    start = pricing.rfind("<article", 0, at)
    return start, pricing.index("</article>", at)


def _sub(text, pattern, repl, want, where):
    out, n = re.subn(pattern, repl, text)
    if n != want:
        raise SystemExit(f"content: prices: {where} — expected {want} place(s) for the price, found {n}")
    return out


def apply_prices(site):
    prices = load("prices.json")
    pricing_path, index_path = site / "pricing.html", site / "index.html"
    pricing = pricing_path.read_text(encoding="utf-8")
    index = index_path.read_text(encoding="utf-8")
    listed = set(re.findall(r'aria-labelledby="price-([a-z]+)-([a-z]+-[a-z]+)-name"', pricing))
    given = {(svc, tid) for svc, tiers in prices.items() if isinstance(tiers, dict) for tid in tiers}
    if listed - given:
        fail("content/prices.json", "no price for " + ", ".join(f"{s} · {t}" for s, t in sorted(listed - given)))
    if given - listed:
        fail("content/prices.json", "not a package on the pricing page: " + ", ".join(f"{s} · {t}" for s, t in sorted(given - listed)))

    block = re.search(r'(<script type="application/json" id="build-packages">)(.*?)(</script>)', pricing, re.S)
    packages = json.loads(block.group(2))
    packages_changed = False
    for svc, tiers in prices.items():
        old_prices = []
        for tid, new in tiers.items():
            where = f"{svc} · {tid}"
            if not isinstance(new, int) or isinstance(new, bool) or not 1 <= new <= 1_000_000:
                fail("content/prices.json", f"{where}: the price must be a whole number of dollars")
            start, end = _tier(pricing, svc, tid)
            card = pricing[start:end]
            old = int(re.search(r'<span class="c-tier__amount">(\d+)</span>', card).group(1))
            old_prices.append(old)
            if new == old:
                continue
            card = _sub(card, rf'(<span class="c-tier__amount">){old}(</span>)', rf"\g<1>{new}\2", 1, where)
            # The WhatsApp message: "(from 990 USD, …)" or "(250 USD, …)", in
            # the link and in its English and Arabic versions.
            card = _sub(card, rf"(?:(?<=%20)|(?<=\()){old}(?=%20)", str(new), 3, where + " (WhatsApp message)")
            pricing = pricing[:start] + card + pricing[end:]
            for t in next(p for p in packages if p["service"] == f"svc.{svc}")["tiers"]:
                if t["id"] == tid:
                    t["price"] = new
                    packages_changed = True
            index = _sub(index, rf'(value="{svc}:{tid}" data-label-ar="[^"]* — (?:من )?){old}( دولار">[^<]* — (?:from )?){old}( USD<)',
                         rf"\g<1>{new}\g<2>{new}\3", 1, where + " (contact form)")
        low, old_low = min(tiers.values()), min(old_prices)
        if low != old_low:
            pricing = _sub(pricing, rf'(?s)(<a class="c-index__link" href="#{svc}">.*?c-index__amount">){old_low}(<)',
                           rf"\g<1>{low}\2", 1, f"{svc} (pricing index)")
            index = _sub(index, rf'(?s)(id="{svc}-packages">.*?c-detail__packages-amount">){old_low}(<)',
                         rf"\g<1>{low}\2", 1, f"{svc} (homepage)")
    if packages_changed:
        data = json.dumps(packages, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
        pricing = pricing[:block.start(2)] + data + pricing[block.end(2):]
    pricing_path.write_text(pricing, encoding="utf-8")
    index_path.write_text(index, encoding="utf-8")


# ---------------------------------------------------------------------------
# WhatsApp: the supplied pages carry their own number; the one in
# tools/config.json replaces it wherever it appears (links, attributes the
# scripts read, and the number as written in the text).

def apply_whatsapp(site):
    for path in sorted(site.rglob("*")):
        if path.suffix not in (".html", ".js") or not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        new = text
        for old in set(re.findall(r"wa\.me/(\d+)", text)) - {WHATSAPP}:
            new = re.sub(rf"\+{old[:3]} ?{old[3:]}\b", f"+{WHATSAPP}", new)
            new = re.sub(rf"(?<!\d){old}(?!\d)", WHATSAPP, new)
        if new != text:
            path.write_text(new, encoding="utf-8")


def apply(site):
    apply_whatsapp(site)
    apply_prices(site)
