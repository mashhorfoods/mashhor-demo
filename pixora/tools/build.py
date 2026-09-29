#!/usr/bin/env python3
"""Build pixora/site — the folder that is uploaded to public_html — from:

    pixora/source/   the site exactly as supplied (replace it wholesale when a
                     new version arrives; never edit it by hand)
    pixora/overlay/  what this project adds: the campaign page (go.html,
                     assets/go.js), the lead endpoint (lead.php, _leads/) and
                     the admin page (admin/)

Steps, in order:
    1. copy source, then overlay, into a fresh site/ (runtime lead data in
       site/_leads is kept)
    2. build_services.py          one page per service; home and pricing unified
    3. apply-site-refinements.py  spacing, pills, WhatsApp button, hero,
                                  profile, privacy, clean links, CSP
    4. sync-shared-styles.py      the homepage stylesheet into go.html

    python3 pixora/tools/build.py
"""
import pathlib
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
import build_services  # noqa: E402

build_services.build(SITE)
print("services: pages built, home and pricing unified")

for script in ("apply-site-refinements.py", "sync-shared-styles.py"):
    subprocess.run([sys.executable, str(TOOLS / script)], check=True)
print("done")
