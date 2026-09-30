#!/usr/bin/env python3
"""What an edit from the panel (/cms/) does to the built site.

Builds a copy of the project with every price changed, a new WhatsApp
number, a renamed brand and a rewritten study, and checks each shows
everywhere it should and the old values nowhere; then that a broken content
file stops the build with a message naming it.

    python3 tests/content.py
"""
import html
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
failed = 0


def check(ok, what):
    global failed
    print(("✓ " if ok else "✗ ") + what)
    failed += not ok


def copy(to):
    for name in ("source", "overlay", "tools", "content"):
        shutil.copytree(ROOT / name, to / name, ignore=shutil.ignore_patterns("__pycache__"))
    (to / "node_modules").symlink_to(ROOT / "node_modules")


def build(at):
    return subprocess.run([sys.executable, "tools/build.py"], cwd=at, capture_output=True, text=True)


def edit(path, change):
    data = json.loads(path.read_text(encoding="utf-8"))
    change(data)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def read(site):
    return {p.relative_to(site).as_posix(): p.read_text(encoding="utf-8")
            for p in site.rglob("*") if p.is_file() and p.suffix in (".html", ".js", ".xml")}


with tempfile.TemporaryDirectory() as tmp:
    at = pathlib.Path(tmp)
    copy(at)
    old = json.loads((at / "content/prices.json").read_text(encoding="utf-8"))
    old_number = json.loads((at / "tools/config.json").read_text(encoding="utf-8"))["whatsapp"]
    new = {svc: {tid: p + 7 for tid, p in tiers.items()} for svc, tiers in old.items()}
    number = "971500000001"
    edit(at / "content/prices.json", lambda d: d.update(new))
    edit(at / "tools/config.json", lambda d: d.update(whatsapp=number))
    edit(at / "content/brands.json", lambda d: d["brands"][1].update(en="Ajwa & Sons", ar="أجوا وأبناؤه"))

    def study(d):
        d["headline"] = {"en": 'Research, "made" <plain> & clear.', "ar": "أبحاث  واضحة\nللجميع."}
        d["card"]["title"]["en"] = "Information & data"
        d["chapters"]["gap"]["aside"]["ar"] = "ملاحظة جديدة على الهامش."
    edit(at / "content/studies/information-design.json", study)

    run = build(at)
    check(run.returncode == 0, "the site builds with every content file edited" + ("" if run.returncode == 0 else ":\n" + run.stderr[-800:]))
    site = read(at / "site")
    everything = "".join(site.values())
    # What a visitor gets, without the scripts' comments.
    code = {name: re.sub(r"^\s*//.*$", "", text, flags=re.M) for name, text in site.items()}

    # Prices.
    for svc, tiers in new.items():
        page = site[f"services/{svc}.html"]
        shown = re.findall(r'<span class="c-tier__amount">(\d+)</span>', page)
        check(sorted(map(int, shown)) == sorted(tiers.values()), f"{svc}: its page shows the new package prices")
        offers = [json.loads(b) for b in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, re.S)]
        prices = sorted(int(o["price"]) for b in offers for o in b.get("offers", []) if isinstance(o, dict) and "price" in o)
        check(prices == sorted(tiers.values()), f"{svc}: search results data carries the new prices")
        low = min(tiers.values())
        check(f'c-detail__packages-amount">{low}<' in site["index.html"] or f'c-svc-card__amount">{low}<' in site["index.html"],
              f"{svc}: the homepage says “from {low}”")
        for tid, p in tiers.items():
            check(re.search(rf'value="{svc}:{tid}" data-label-ar="[^"]* — (من )?{p} دولار">[^<]* — (from )?{p} USD<', site["index.html"]) is not None,
                  f"{svc} · {tid}: the contact form lists it at {p}")
            links = [l for l in re.findall(r'href="(https://wa\.me/[^"]+)"', page) if re.search(rf"(%20|\(){p}%20", l)]
            check(len(links) >= 1, f"{svc} · {tid}: its WhatsApp message quotes {p}")
    for svc, tiers in old.items():
        for tid, p in tiers.items():
            stale = [name for name, text in code.items()
                     if re.search(rf"(%20|\(){p}%20", text) or re.search(rf"(?<![\d.]){p} (USD|دولار)", text)
                     or f'c-tier__amount">{p}<' in text or f'"price":{p},' in text or f'"price":"{p}"' in text]
            check(not stale, f"{svc} · {tid}: the old price {p} is gone" + (f" (still in {', '.join(stale)})" if stale else ""))
    check(f'packages-amount">{min(old["branding"].values())}<' not in site["index.html"], "the homepage's old “from” prices are gone")

    # WhatsApp.
    check(old_number not in everything, f"the old WhatsApp number {old_number} is gone from every page and script")
    check(f"wa.me/{number}" in site["index.html"] and f"wa.me/{number}" in site["go.html"], "links go to the new number")
    check(f"+{number}" in site["accessibility.html"], "the number as written in the text is the new one")

    # Brands and the study.
    check("Ajwa &amp; Sons" in site["index.html"] and "أجوا وأبناؤه" in site["index.html"], "the renamed brand is on the homepage")
    story = site["work/information-design.html"]
    check("Research, &quot;made&quot; &lt;plain&gt; &amp; clear." in story, "the new headline is on the study, escaped")
    check("أبحاث واضحة للجميع." in story, "spaces and line breaks in a text are tidied")
    check("ملاحظة جديدة على الهامش." in story, "a chapter's aside is updated")
    check("Information &amp; data" in site["work.html"], "the study's card on /work has its new title")
    blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', story, re.S)
    try:
        headline = [json.loads(b) for b in blocks][-1].get("headline")
    except json.JSONDecodeError:
        headline = None
    check(headline == 'Research, "made" <plain> & clear.', "search results data carries the new headline, as plain text")

with tempfile.TemporaryDirectory() as tmp:
    at = pathlib.Path(tmp)
    for name, change, says in [
        ("content/studies/digital-campaigns.json", lambda d: d["chapters"]["problem"].pop("aside"), "digital-campaigns.json, chapters → problem → aside"),
        ("content/studies/digital-campaigns.json", lambda d: d["chapters"].pop("result"), "the chapters must be"),
        ("content/prices.json", lambda d: d["branding"].update({"tier-starter": "cheap"}), "whole number"),
        ("content/prices.json", lambda d: d["branding"].pop("tier-advanced"), "no price for branding · tier-advanced"),
        ("content/brands.json", lambda d: d["brands"][0].update(ar=" "), "brands.json, brand 1"),
    ]:
        shutil.rmtree(at, ignore_errors=True)
        copy(at)
        edit(at / name, change)
        run = build(at)
        check(run.returncode != 0 and says in run.stderr + run.stdout,
              f"a broken {name.split('/')[-1]} stops the build and says where ({says})"
              + ("" if run.returncode != 0 else " — it built anyway"))
    shutil.rmtree(at, ignore_errors=True)
    at.mkdir()

# The panel saves only the fields its config names: anything in a content
# file without a field would be dropped by the first save.
config = json.loads((ROOT / "site/cms/config.yml").read_text(encoding="utf-8").split("\n", 1)[1])


def leaves(data, fields, at=""):
    """Paths in data that no field covers, and fields with nothing in data."""
    missing = []
    by = {f["name"]: f for f in fields}
    for key, value in data.items():
        f = by.get(key)
        if not f:
            missing.append(at + key)
        elif f["widget"] == "object":
            missing += leaves(value, f["fields"], f"{at}{key} → ")
        elif f["widget"] == "list":
            for item in value:
                missing += leaves(item, f["fields"], f"{at}{key} → ")
    missing += [f"{at}{name} (no such value)" for name in by if name not in data]
    return missing


files = [f for c in config["collections"] for f in c["files"]]
for f in files:
    data = json.loads((ROOT / f["file"]).read_text(encoding="utf-8"))
    gaps = leaves(data, f["fields"])
    check(not gaps, f"/cms/ has a field for everything in {f['file']}" + (f": {', '.join(gaps)}" if gaps else ""))
edited = {f["file"] for f in files}
on_disk = {p.relative_to(ROOT).as_posix() for p in (ROOT / "content").rglob("*.json")} | {"tools/config.json"}
check(edited == on_disk, "/cms/ edits every content file" + ("" if edited == on_disk else f": {sorted(on_disk ^ edited)}"))
check(config["backend"]["repo"] == "mashhorfoods/mashhor-demo" and config["backend"]["branch"] == "main",
      "/cms/ saves to main of the site's repository")

print(f"\n{'✓' if not failed else '✗'} content: {failed} failed")
sys.exit(1 if failed else 0)
