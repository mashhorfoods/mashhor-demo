#!/usr/bin/env python3
"""Smaller copies of the supplied site's oversized images, and the srcset
that lets each browser take the one it needs.

The About photos are 1672 px wide but never shown wider than ~615 px
(measured at 390, 1024 and 1440 px wide).

    python3 tools/responsive.py --make   # once, when an image here changes:
                                         # writes overlay/assets/<name>-<w>.webp
                                         # (needs ffmpeg; FFMPEG=/path/to/ffmpeg)

The build (step after motion.py) only edits the pages and stops if a copy is
missing, so it needs no ffmpeg.
"""
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
# name → (full width, smaller widths, sizes)
IMAGES = {}  # none at present (About's photos come in their sizes: tools/about-images)
# A page's largest paint, fetched first rather than lazily (About's hero
# photo is written eager, with its own srcset, by about_page.py).
EAGER = {}


def variant(name, w):
    stem, ext = name.rsplit(".", 1)
    return f"{stem}-{w}.{ext}"


def make():
    ff = os.environ.get("FFMPEG", "ffmpeg")
    for name, (_, widths, _) in IMAGES.items():
        for w in widths:
            out = ROOT / "overlay" / "assets" / variant(name, w)
            subprocess.run([ff, "-v", "error", "-y", "-i", str(ROOT / "source" / "assets" / name),
                            "-vf", f"scale={w}:-2:flags=lanczos", "-c:v", "libwebp", "-quality", "80",
                            "-compression_level", "6", str(out)], check=True)
            print(out.relative_to(ROOT))


def build(site: pathlib.Path):
    for name, (full, widths, _) in IMAGES.items():
        for w in widths:
            if not (site / "assets" / variant(name, w)).exists():
                sys.exit(f"responsive: assets/{variant(name, w)} missing — run tools/responsive.py --make")
    pages = [p for p in list(site.glob("*.html")) + list(site.glob("services/*.html")) if p.name != "go.html"]
    for page in pages:
        text = page.read_text(encoding="utf-8")
        before = text

        def add(m):
            tag, name = m.group(0), m.group(1)
            if name not in IMAGES or "srcset=" in tag:
                return tag
            full, widths, sizes = IMAGES[name]
            srcset = ", ".join([f"/assets/{variant(name, w)} {w}w" for w in widths] + [f"/assets/{name} {full}w"])
            tag = tag.replace(f'src="/assets/{name}"', f'src="/assets/{name}" srcset="{srcset}" sizes="{sizes}"', 1)
            if EAGER.get(page.name) == name:
                tag = tag.replace('loading="lazy"', 'fetchpriority="high"', 1)
            return tag

        text = re.sub(r'<img\b[^>]*?src="/assets/([^"]+)"[^>]*>', add, text, flags=re.S)
        if text != before:
            page.write_text(text, encoding="utf-8")
    print(f"responsive: srcset for {len(IMAGES)} oversized images")


if __name__ == "__main__":
    if sys.argv[1:] == ["--make"]:
        make()
    else:
        build(ROOT / "site")
