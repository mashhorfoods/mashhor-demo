"""Drop the stylesheet rules for components no page uses any more.

The supplied stylesheet styles sections this project removed (the process
steps, the showreel, the old service accordion) and a few form controls no
page has. Their rules are dropped at build time — source/ stays as supplied.

Conservative by design:
  - classes are listed by exact name, never by prefix;
  - a selector goes only when a listed class sits in it directly; one that
    names it inside parentheses (:not(.x), :is(.x, .y), :has(.x)) stays;
  - a rule goes only when every selector in its list goes;
  - @keyframes, @font-face and the like are never touched.
The build stops if a listed class turns up on a page again.
"""
import re

DEAD = {
    # The old service accordion (build_services.py replaced it with cards;
    # c-service__cap / __caps are still used and stay).
    "c-service", "c-service-list", "c-service__body", "c-service__chevron", "c-service__content",
    "c-service__cta", "c-service__desc", "c-service__flow", "c-service__index", "c-service__indicator",
    "c-service__name", "c-service__panel", "c-service__panel-inner", "c-service__summary",
    "c-service__trigger", "c-service__visual",
    # "How we work" (removed by streamline.py).
    "c-step", "c-step__body", "c-step__name", "c-step__note", "c-step__num",
    # The showreel (placeholder; removed by streamline.py).
    "c-reel", "c-reel__caption", "c-reel__fallback", "c-reel__video",
    # Controls in the supplied stylesheet that no page has.
    "c-choice", "c-choice__input", "c-choice__label", "c-segmented", "c-segmented__option",
    "c-counter", "c-track",
    # The orbit's SVG sparks, now HTML elements (motion.py SPARKS).
    "c-orbit__spark", "c-orbit__spark--slow",
}
GROUPING = ("@media", "@supports", "@container", "@layer", "@document")


def _block_end(css, i):
    """Index just past the '}' matching the '{' at css[i]; skips strings and comments."""
    depth, n = 0, len(css)
    while i < n:
        c = css[i]
        if c in "\"'":
            i = css.index(c, i + 1) + 1
            continue
        if css.startswith("/*", i):
            i = css.index("*/", i) + 2
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    raise ValueError("unbalanced braces")


def _split_selectors(prelude):
    parts, depth, start = [], 0, 0
    for i, c in enumerate(prelude):
        if c in "([":
            depth += 1
        elif c in ")]":
            depth -= 1
        elif c == "," and depth == 0:
            parts.append(prelude[start:i])
            start = i + 1
    parts.append(prelude[start:])
    return parts


def _dead_selector(selector):
    """True when a DEAD class sits in the selector outside any parentheses."""
    depth, top = 0, []
    for c in selector:
        if c in "([":
            depth += 1
        elif c in ")]":
            depth -= 1
        top.append(c if depth == 0 and c not in ")]" else " ")
    return any(name in DEAD for name in re.findall(r"\.(-?[A-Za-z_][\w-]*)", "".join(top)))


def prune(css):
    out, i, n = [], 0, len(css)
    while i < n:
        if css.startswith("/*", i):
            j = css.index("*/", i) + 2
            out.append(css[i:j])
            i = j
            continue
        brace = css.find("{", i)
        semi = css.find(";", i)
        if brace < 0 or (0 <= semi < brace and css[i:semi].lstrip().startswith("@")):
            # A statement at-rule (@import …;) or trailing text: keep as is.
            j = n if brace < 0 else semi + 1
            out.append(css[i:j])
            i = j
            continue
        end = _block_end(css, brace)
        prelude, body = css[i:brace], css[brace + 1:end - 1]
        head = prelude.strip()
        if head.startswith(GROUPING):
            inner = prune(body)
            if inner.strip():
                out.append(f"{prelude}{{{inner}}}")
        elif head.startswith("@"):
            out.append(css[i:end])  # @keyframes, @font-face, @property, …
        else:
            keep = [s for s in _split_selectors(prelude) if not _dead_selector(s)]
            if keep:
                out.append(",".join(keep) + css[brace:end])
        i = end
    return "".join(out)


def check_unused(pages_text):
    """Stop the build if a page uses a class this module prunes."""
    back = sorted(c for c in DEAD if re.search(r"(?<![\w-])" + re.escape(c) + r"(?![\w-])", pages_text))
    if back:
        raise SystemExit(f"prune_css: {', '.join(back)} used on a page again — take it out of DEAD")
