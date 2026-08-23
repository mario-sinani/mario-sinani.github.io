"""The list of modules that each page preloads.

    python3 tools/preloads.py           # say which lists are wrong
    python3 tools/preloads.py --write   # write the correct lists

A page preloads every module it loads: the modules its entry point
imports, and the scenes it names in a data-scene or a data-field
attribute, with the modules those scenes import. The home page takes one
of two fields at random, so it preloads both. The entry point itself
comes from the script element, and does not need a preload.

check.py runs the same rule, so a list that drifts fails a check."""

import os, re, sys, glob

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
IMPORT = re.compile(r"import\s+[^;]*?from\s+'([^']+)'", re.S)
ORDER = ["js/site.js", "js/theme.js", "js/field-canvas.js", "js/canvas-surface.js",
         "js/frame-loop.js", "js/ink.js", "js/scenes/stage.js", "js/scenes/registry.js",
         "js/field-pause.js", "js/reveal.js", "js/email.js", "js/nav.js"]


def graph(entry, seen=None):
    """The modules that one module pulls in, including itself."""
    seen = set() if seen is None else seen
    entry = os.path.normpath(entry)
    if entry in seen or not os.path.isfile(entry):
        return seen
    seen.add(entry)
    for spec in IMPORT.findall(open(entry, encoding="utf-8").read()):
        graph(os.path.join(os.path.dirname(entry), spec), seen)
    return seen


def needed(page, text):
    """Every module the page loads, as paths from the root."""
    entry = re.search(r'<script type="module" src="([^"]+)"', text)
    if not entry:
        return None, None
    here = os.path.dirname(page) or "."
    start = os.path.normpath(os.path.join(ROOT if entry.group(1).startswith("/") else here,
                                          entry.group(1).lstrip("/")))
    want = graph(start)
    for name in sorted(set(re.findall(r'data-(?:scene|field)="([\w-]+)"', text))):
        want |= graph(os.path.join(ROOT, "js/scenes", name + ".js"))
    if start.endswith("main.js"):        # the home page takes one field of two
        want |= graph(os.path.join(ROOT, "js/scenes/vortex-street.js"))
        want |= graph(os.path.join(ROOT, "js/scenes/lifting-cylinder.js"))
    if start.endswith("not-found.js"):
        want |= graph(os.path.join(ROOT, "js/scenes/vortex-street.js"))
    want.discard(start)
    return {os.path.relpath(p, ROOT) for p in want}, start


def sort_key(path):
    return (ORDER.index(path) if path in ORDER else len(ORDER), path)


def links(page, want):
    """The preload elements, in the order the site keeps them."""
    here = os.path.dirname(page) or "."
    up = os.path.relpath(ROOT, os.path.join(ROOT, here))
    prefix = "/" if page == "404.html" else (up + "/" if up != "." else "")
    return ["  <link rel=\"modulepreload\" href=\"%s%s\">" % (prefix, p) for p in sorted(want, key=sort_key)]


def main(write):
    os.chdir(ROOT)
    faults = 0
    for page in sorted(glob.glob("**/*.html", recursive=True)):
        if page.startswith("tools/"):
            continue
        text = open(page, encoding="utf-8").read()
        want, start = needed(page, text)
        if want is None:
            continue
        block = re.search(r"(?m)^(  <link rel=\"modulepreload\"[^\n]*\n)+", text)
        if not block:
            continue
        new = "\n".join(links(page, want)) + "\n"
        if new == block.group(0):
            continue
        faults += 1
        if write:
            open(page, "w", encoding="utf-8").write(text[:block.start()] + new + text[block.end():])
            print("%s: %d preloads written" % (page, len(want)))
        else:
            have = set(re.findall(r'modulepreload" href="([^"]+)"', block.group(0)))
            print("%s: the preload list is not the module graph" % page)
    if not write and faults:
        print("\nrun: python3 tools/preloads.py --write")
    return faults


if __name__ == "__main__":
    sys.exit(1 if main("--write" in sys.argv) and "--write" not in sys.argv else 0)
