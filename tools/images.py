#!/usr/bin/env python3
"""The project's photographs, encoded once into overlay/assets as WebP in the
sizes each page asks for. Run it when an image changes, then rebuild; the
build itself never encodes anything (the results are committed).

    python3 tools/images.py covers [folder]   # service covers
    python3 tools/images.py about  <folder>   # About photographs
    python3 tools/images.py board             # the Pixora identity board
    python3 tools/images.py cases             # the case study covers
    python3 tools/images.py work  <folder>    # the work shown in the case studies

  covers  <folder>/svc-<id>.png|.jpg (16:10, at least 1600 wide; default
          tools/service-covers/out) → svc-<id>.webp (1600×1000) and
          svc-<id>-1200.webp / -800.webp, each cropped to fill 16:10.
  about   <folder>/about-hero.png, about-team.png, about-process.png (as
          generated, 1672 wide) → about-*.webp (1672×940) and
          about-*-640.webp / -1280.webp.

  board   tools/share-cards/out/pixora-board.png (rendered by
          tools/share-cards/render.mjs, 1800×1200) → pixora-board.webp and
          pixora-board-900.webp (the campaign page's hero).

  cases   tools/share-cards/out/case-<slug>.png (rendered by render.mjs,
          1600×1000) → case-<slug>.webp and case-<slug>-800.webp — only
          for studies whose first piece of work is still a placeholder (once
          it is real, it is the study's cover).

  work    <folder>/<slug>-<piece>.png|.jpg|.webp, named after a study and one of
          its pieces in tools/case_stories.py (e.g. talk-about-sudan-map.png)
          → case-<slug>-<piece>.webp (1600 wide) and -800.webp, cropped to
          the piece's proportions. Rebuild, and the image replaces the
          placeholder wherever the piece appears.

ffmpeg does the work (FFMPEG=/path/to/ffmpeg if it is not on the PATH).
"""
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "overlay" / "assets"
FF = os.environ.get("FFMPEG", "ffmpeg")


def webp(src, dest, vf, quality):
    subprocess.run([FF, "-v", "error", "-y", "-i", str(src), "-vf", vf, "-c:v", "libwebp",
                    "-quality", str(quality), "-compression_level", "6", str(OUT / dest)], check=True)


def covers(folder):
    for src in sorted(folder.glob("svc-*.*")):
        for w, h in ((1600, 1000), (1200, 750), (800, 500)):
            name = src.stem if w == 1600 else f"{src.stem}-{w}"
            webp(src, f"{name}.webp", f"scale={w}:{h}:force_original_aspect_ratio=increase:flags=lanczos,crop={w}:{h}", 82)
        print(f"overlay/assets/{src.stem}.webp (+ -1200, -800)")


def about(folder):
    for name in ("about-hero", "about-team", "about-process"):
        src = folder / f"{name}.png"
        webp(src, f"{name}.webp", "crop=1672:940:0:0", 82)
        for w in (640, 1280):
            webp(src, f"{name}-{w}.webp", f"crop=1672:940:0:0,scale={w}:-2:flags=lanczos", 80)
        print(f"overlay/assets/{name}.webp (+ -640, -1280)")


def board():
    src = ROOT / "tools" / "share-cards" / "out" / "pixora-board.png"
    webp(src, "pixora-board.webp", "scale=1800:1200:flags=lanczos", 84)
    webp(src, "pixora-board-900.webp", "scale=900:600:flags=lanczos", 84)
    print("overlay/assets/pixora-board.webp (+ -900)")


def cases():
    sys.path.insert(0, str(ROOT / "tools"))
    from cases import cover_name
    for src in sorted((ROOT / "tools" / "share-cards" / "out").glob("case-*.png")):
        if cover_name(src.stem[len("case-"):]) != src.stem:
            print(f"skipped {src.name}: the study's cover is its real work now")
            continue
        webp(src, f"{src.stem}.webp", "scale=1600:1000:flags=lanczos", 82)
        webp(src, f"{src.stem}-800.webp", "scale=800:500:flags=lanczos", 82)
        print(f"overlay/assets/{src.stem}.webp (+ -800)")


def work(folder):
    sys.path.insert(0, str(ROOT / "tools"))
    from case_stories import STORIES
    names = {f"{slug}-{key}": ratio for slug, st in STORIES.items() for key, (_, ratio, _) in st["pieces"].items()}
    found = 0
    for src in sorted(folder.iterdir()):
        if src.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            continue
        # "x.png.png", as some tools save it, is x.
        stem = src.name
        while pathlib.Path(stem).suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
            stem = pathlib.Path(stem).stem
        if stem not in names:
            print(f"skipped {src.name}: not <slug>-<piece> of a study in tools/case_stories.py")
            continue
        w, h = names[stem]
        for width, suffix in ((1600, ""), (800, "-800")):
            height = round(width * h / w)
            webp(src, f"case-{stem}{suffix}.webp",
                 f"scale={width}:{height}:force_original_aspect_ratio=increase:flags=lanczos,crop={width}:{height}", 82)
        found += 1
        print(f"overlay/assets/case-{stem}.webp (+ -800)")
        # The study's first piece is its cover now: the drawn one goes.
        slug = next(s for s in STORIES if stem.startswith(s + "-"))
        if stem == f"{slug}-{STORIES[slug]['hero'][0]}":
            for old in (f"case-{slug}.webp", f"case-{slug}-800.webp"):
                if (OUT / old).exists():
                    (OUT / old).unlink()
                    print(f"removed overlay/assets/{old} (the drawn cover)")
    if not found:
        sys.exit(f"work: no images named <slug>-<piece> in {folder}")


if __name__ == "__main__":
    kind, *rest = sys.argv[1:] or [""]
    if kind == "covers":
        covers(pathlib.Path(rest[0]) if rest else ROOT / "tools" / "service-covers" / "out")
    elif kind == "about" and rest:
        about(pathlib.Path(rest[0]))
    elif kind == "board":
        board()
    elif kind == "cases":
        cases()
    elif kind == "work" and rest:
        work(pathlib.Path(rest[0]))
    else:
        sys.exit(__doc__)
