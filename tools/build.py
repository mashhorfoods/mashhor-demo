#!/usr/bin/env python3
"""Build site — the folder that is uploaded to public_html — from:

    source/   the site exactly as supplied (replace it wholesale when a
                     new version arrives; never edit it by hand)
    overlay/  what this project adds: the campaign page (go.html,
                     assets/go.js), the lead endpoint (lead.php, _leads/) and
                     the admin page (admin/)

Steps, in order:
    1. copy source, then overlay, into a fresh site/ (runtime lead data in
       site/_leads is kept)
    2. build_services.py          one page per service; home and pricing unified
       streamline.py              order, repetition, placeholders, shorter copy
       story_hero.py              the case study's hero (its four surfaces)
       about_page.py              the About page, about Pixora and its team
    3. apply-site-refinements.py  spacing, pills, WhatsApp button, hero,
                                  profile, privacy, clean links, CSP
    4. motion.py                  the "quiet luxury" motion layer (CSS half)
       responsive.py              srcset for the supplied site's oversized images
    5. finalize.py                one shared stylesheet + script for every page
                                  (go.html and /admin/ included), CSP, caching

    python3 tools/build.py
"""
import base64
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE, SOURCE, OVERLAY, TOOLS = ROOT / "site", ROOT / "source", ROOT / "overlay", ROOT / "tools"
RUNTIME = ("leads.csv", "rate.json", "admin-state.json", "admin-attempts.json")

kept = {}
leads = SITE / "_leads"
for name in RUNTIME:
    if (leads / name).exists():
        kept[name] = (leads / name).read_bytes()
if SITE.exists():
    shutil.rmtree(SITE)
shutil.copytree(SOURCE, SITE)
shutil.copytree(OVERLAY, SITE, dirs_exist_ok=True)
for name, data in kept.items():
    (leads / name).write_bytes(data)
print("site/: source + overlay copied")

sys.path.insert(0, str(TOOLS))
from common import WHATSAPP  # noqa: E402

# One WhatsApp number: filled into the campaign page, and the supplied site's
# own links must already use it (change it there too if it ever changes).
for name in ("go.html", "assets/go.js"):
    path = SITE / name
    path.write_text(path.read_text(encoding="utf-8").replace("{{WHATSAPP}}", WHATSAPP), encoding="utf-8")
# The hero's still (shown until the video plays, and instead of it under
# reduced motion) is inlined in the page for an instant first paint. The
# supplied one carries the video tool's watermark; overlay/ has a clean copy.
poster = SITE / "assets" / "hero-poster.webp"
home = SITE / "index.html"
text, n = re.subn(r"data:image/webp;base64,[A-Za-z0-9+/=]+",
                  "data:image/webp;base64," + base64.b64encode(poster.read_bytes()).decode(),
                  home.read_text(encoding="utf-8"), count=1)
if n != 1:
    sys.exit("build: the hero still (inline webp) was not found in index.html")
home.write_text(text, encoding="utf-8")
poster.unlink()
for path in SOURCE.glob("*.html"):
    others = set(re.findall(r"wa\.me/(\d+)", path.read_text(encoding="utf-8"))) - {WHATSAPP}
    if others:
        sys.exit(f"build: {path.name} links to WhatsApp {', '.join(others)}, tools/config.json says {WHATSAPP}")
import build_services  # noqa: E402

build_services.build(SITE)
print("services: pages built, home and pricing unified")

import streamline  # noqa: E402

streamline.build(SITE)
print("streamline: sections reordered, repetition and placeholders removed")
import story_hero  # noqa: E402
story_hero.build(SITE)
print("story: hero added")
import about_page  # noqa: E402
about_page.build(SITE)
print("about: page rewritten around the team")

subprocess.run([sys.executable, str(TOOLS / "apply-site-refinements.py")], check=True)

import motion  # noqa: E402

motion.build(SITE)
print("motion: quiet-luxury layer added")

import responsive  # noqa: E402

responsive.build(SITE)

import finalize  # noqa: E402

finalize.build(SITE)
print("done")
