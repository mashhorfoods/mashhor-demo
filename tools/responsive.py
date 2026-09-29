#!/usr/bin/env python3
"""Smaller copies of the supplied site's oversized images, and the srcset
that lets each browser take the one it needs.

The About photos are 1672 px wide but never shown wider than ~615 px; the
branding showcase boards are 740–870 px shown at ~280 px (measured on every
page at 390, 1024 and 1440 px wide).

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
ABOUT = ((640, 1280), "(min-width: 64em) 43vw, 92vw")
BOARD = ((400,), "(min-width: 64em) 20vw, (min-width: 48em) 28vw, 68vw")
IMAGES = {
    "about1.webp": (1672, *ABOUT),
    "about2.webp": (1672, *ABOUT),
    "about4.webp": (1672, *ABOUT),
    "B1.webp": (740, *BOARD),
    "B2.webp": (752, *BOARD),
    "B3.webp": (624, *BOARD),
    "B4.webp": (868, *BOARD),
}
# The About page's first photo is its largest paint: fetch it first, not lazily.
EAGER = {"about.html": "about1.webp"}


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
