#!/usr/bin/env python3
"""Copy index.html's stylesheet into the campaign page, verbatim.

go.html is hand-written, but its tokens, fonts and components must be the
site's own. This copies the single <style> block of index.html between the
SHARED-STYLES markers in go.html. Run it whenever the site is rebuilt:

    python3 pixora/tools/sync-shared-styles.py

Idempotent; exits non-zero if either anchor is missing.
"""
import pathlib
import re
import sys

SITE = pathlib.Path(__file__).resolve().parent.parent / "site"
SOURCE = SITE / "index.html"
TARGETS = [SITE / "go.html"]
START, END = "<!-- SHARED-STYLES:START -->", "<!-- SHARED-STYLES:END -->"

source = SOURCE.read_text(encoding="utf-8")
match = re.search(r"<style>.*?</style>", source, re.S)
if not match:
    sys.exit(f"no <style> block in {SOURCE}")
block = f"{START}\n    {match.group(0)}\n{END}"

for target in TARGETS:
    text = target.read_text(encoding="utf-8")
    a, b = text.find(START), text.find(END)
    if a < 0 or b < 0:
        sys.exit(f"SHARED-STYLES markers missing in {target}")
    updated = text[:a] + block + text[b + len(END):]
    if updated != text:
        target.write_text(updated, encoding="utf-8")
    print(f"{target.name}: shared styles {'updated' if updated != text else 'already current'}")
