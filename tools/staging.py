"""A test package: the built site, ready to upload to a testing domain on a
real host (Apache + PHP, like Hostinger) — everything works as it will live
(forms, /admin/, /cms/, clean addresses, the security policy), but:

  - nothing is indexed: every page says noindex, the server sends
    X-Robots-Tag, and robots.txt closes the whole site;
  - no analytics: the Plausible tag is removed, so test visits never count
    as real ones;
  - no HSTS: the testing domain is not pinned to HTTPS for a year (it still
    redirects to https://, so it needs an SSL certificate, like the real one).

Links, redirects and lead.php already follow whatever domain serves them.
Canonical addresses, previews and the sitemap keep naming the real domain.

    python3 tools/build.py && python3 tools/staging.py   →   dist/pixora-staging-<commit>.zip
"""
import pathlib
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE, DIST = ROOT / "site", ROOT / "dist"
RUNTIME = ("leads.csv", "rate.json", "admin-state.json", "admin-attempts.json")


def fail(what):
    sys.exit(f"staging: {what}")


def build():
    sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip() or "local"
    out = DIST / f"pixora-staging-{sha}"
    if out.exists():
        shutil.rmtree(out)
    # Never ship requests or admin state from a local run.
    shutil.copytree(SITE, out, ignore=lambda d, names: [n for n in names if pathlib.Path(d).name == "_leads" and n in RUNTIME])

    for page in out.rglob("*.html"):
        text = page.read_text(encoding="utf-8")
        text, n = re.subn(r'\s*<script defer data-domain="[^"]*" src="https://plausible\.io/[^"]*"></script>', "", text)
        text = re.sub(r'\s*<meta name="robots" content="[^"]*" ?/?>', "", text)
        text, m = re.subn(r"<head>", '<head>\n    <meta name="robots" content="noindex, nofollow" />', text, count=1)
        if not m:
            fail(f"{page.relative_to(out)} has no <head>")
        page.write_text(text, encoding="utf-8")

    ht = out / ".htaccess"
    text = ht.read_text(encoding="utf-8")
    text, n = re.subn(r'\n  Header always set Strict-Transport-Security "[^"]*"', "", text)
    if n != 1:
        fail(".htaccess: the HSTS header was not found")
    text, n = re.subn(r"(<IfModule mod_headers\.c>\n)", r'\1  # Test copy: kept out of search.\n  Header always set X-Robots-Tag "noindex, nofollow"\n', text, count=1)
    if n != 1:
        fail(".htaccess: no mod_headers block")
    ht.write_text(text, encoding="utf-8")
    (out / "robots.txt").write_text("# Test copy of the Pixora site: not for search engines.\nUser-agent: *\nDisallow: /\n", encoding="utf-8")

    left = [str(p.relative_to(out)) for p in out.rglob("*.html") if "plausible.io/js" in p.read_text(encoding="utf-8")]
    if left:
        fail(f"analytics still on {', '.join(left)}")

    archive = out.with_suffix(".zip")
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for path in sorted(out.rglob("*")):
            if path.is_file():
                z.write(path, path.relative_to(out).as_posix())
    print(f"staging: {archive.relative_to(ROOT)} ({archive.stat().st_size // 1024} KB)")
    return archive


if __name__ == "__main__":
    build()
