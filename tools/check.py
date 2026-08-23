"""Check the site: one h1 for each page, links that resolve, classes
that a stylesheet defines, structured data that parses, a sitemap that
holds every page, and imports that point at a file.

    python3 tools/check.py

It prints OK, or one line for each fault, and gives a status of 1 when
it finds one."""

import os, re, sys, glob, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from urllib.parse import urlparse

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
os.chdir(ROOT)
bad = []
def err(m): bad.append(m)

pages = sorted(p for p in glob.glob("**/*.html", recursive=True) if not p.startswith("tools/"))
css = "\n".join(open(p, encoding="utf-8").read() for p in glob.glob("css/*.css"))
defined = set(re.findall(r'\.([A-Za-z][\w-]*)', css))
# A class can be a hook for a script and carry no style of its own. Only
# the three forms below make a hook, so a name in another string does not
# hide an unknown class.
for module in glob.glob("js/**/*.js", recursive=True):
    src = open(module, encoding="utf-8").read()
    defined.update(re.findall(r"classList\.\w+\('([\w-]+)'\)", src))
    defined.update(re.findall(r"querySelector(?:All)?\('\.([\w-]+)", src))
    defined.update(re.findall(r"className = '([\w-]+)'", src))
titles, descs = {}, {}

for p in pages:
    s = open(p, encoding="utf-8").read()
    base = os.path.dirname(p)

    # one h1
    if len(re.findall(r'<h1[ >]', s)) != 1: err(f"{p}: h1 count {len(re.findall(r'<h1[ >]', s))}")
    if 'lang="en-US"' not in s: err(f"{p}: lang")

    # json-ld parses
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
        try: json.loads(m.group(1))
        except Exception as e: err(f"{p}: json-ld {e}")

    # unique title / description
    t = re.search(r'<title>(.*?)</title>', s, re.S)
    if t: titles.setdefault(t.group(1), []).append(p)
    d = re.search(r'<meta name="description" content="(.*?)"', s, re.S)
    if d: descs.setdefault(d.group(1), []).append(p)

    # local links resolve
    for href in re.findall(r'(?:href|src)="([^"]+)"', s):
        if href.startswith(("http", "mailto:", "#", "data:")): continue
        path = urlparse(href).path
        if not path: continue
        target = (path.lstrip("/") or ".") if href.startswith("/") else os.path.normpath(os.path.join(base, path))
        if target.endswith("/") or os.path.isdir(target):
            target = os.path.join(target.rstrip("/"), "index.html")
        if not os.path.exists(target): err(f"{p}: dead link {href} -> {target}")

    # every class resolves
    for attr in re.findall(r'class="([^"]*)"', s):
        for c in attr.split():
            if c not in defined and c != "js": err(f"{p}: unknown class .{c}")

    # anchors resolve
    ids = set(re.findall(r'id="([^"]+)"', s))
    for a in re.findall(r'href="#([^"]+)"', s):
        if a not in ids: err(f"{p}: dead anchor #{a}")

    # canonical matches the folder
    c = re.search(r'<link rel="canonical" href="https://mariosinani\.com(/[^"]*)"', s)
    if c:
        want = "/" if p == "index.html" else "/" + os.path.dirname(p) + "/"
        if c.group(1) != want: err(f"{p}: canonical {c.group(1)} != {want}")

for t, ps in titles.items():
    if len(ps) > 1: err(f"duplicate title {t!r}: {ps}")
for d, ps in descs.items():
    if len(ps) > 1: err(f"duplicate description: {ps}")

# the preload list of a page is the module graph of that page
import preloads as preload_rule
for p in pages:
    text = open(p, encoding="utf-8").read()
    want, start = preload_rule.needed(p, text)
    if want is None:
        continue
    have = set()
    for href in re.findall(r'modulepreload" href="([^"]+)"', text):
        base = os.path.dirname(p) or "."
        have.add(os.path.relpath(os.path.normpath(os.path.join("." if href.startswith("/") else base, href.lstrip("/")))))
    for extra in sorted(have - want):
        err(f"{p}: preloads {extra}, which it never loads")
    for gap in sorted(want - have):
        err(f"{p}: loads {gap}, which it does not preload")

# every scene a page names must be in the registry
registry = open("js/scenes/registry.js", encoding="utf-8").read()
known = set(re.findall(r"'([\w-]+)': \(\) => import", registry))
for p in pages:
    text = open(p, encoding="utf-8").read()
    for name in set(re.findall(r'data-(?:scene|field)="([\w-]+)"', text)):
        if name not in known:
            err(f"{p}: no scene by the name {name}")
        if not os.path.isfile(f"js/scenes/{name}.js"):
            err(f"{p}: the scene {name} has no file")

# sitemap matches the page set
smap = set(re.findall(r'<loc>https://mariosinani\.com(/[^<]*)</loc>', open("sitemap.xml").read()))
have = {"/" if p == "index.html" else "/" + os.path.dirname(p) + "/" for p in pages if p != "404.html"}
if smap != have: err(f"sitemap != pages\n  only sitemap: {smap-have}\n  only pages: {have-smap}")

# module imports resolve
for j in glob.glob("js/**/*.js", recursive=True):
    for spec in re.findall(r"from\s+'([^']+)'", open(j).read()):
        t = os.path.normpath(os.path.join(os.path.dirname(j), spec))
        if not os.path.exists(t): err(f"{j}: bad import {spec}")

# balanced braces in css
for c in glob.glob("css/*.css"):
    s = open(c).read()
    if s.count("{") != s.count("}"): err(f"{c}: braces {s.count('{')}/{s.count('}')}")

# atom parses
import xml.etree.ElementTree as ET
for x in ("atom.xml", "sitemap.xml"):
    try: ET.parse(x)
    except Exception as e: err(f"{x}: {e}")

print("\n".join(bad) if bad else "OK")
sys.exit(1 if bad else 0)
