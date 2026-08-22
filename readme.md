# mariosinani.com

Personal website of Mario A. Sinani.

## Structure

```
├── about
├── assets
│   ├── fonts
│   ├── icons
│   ├── logos
│   └── og
├── atom.xml
├── CNAME
├── css
├── education
├── experience
├── js
│   └── scenes
├── lab
├── publications
├── research
├── tools
└── index.html
```

## Checks

```
python3 tools/check.py        # pages, links, classes, sitemap, imports
node tools/test-scenes.mjs    # the models against the numbers of the papers
node tools/test-engine.mjs    # the engine: the loop, the pause and the fixed frame
node tools/trace.mjs          # each scene against its recorded fingerprint
node tools/trace.mjs --write  # record the fingerprints again after a change
```

`tools/trace.mjs` draws each scene into a stub context and hashes the
calls, so a refactor that changes no behaviour keeps the same hash. The
same checks run on each push, in `.github/workflows/checks.yml`.

## Local development

```sh
python3 -m http.server 8080
```

then open <http://localhost:8080>. Edit and refresh.

This server sends no cache instruction, so a browser can keep an old
stylesheet or an old module and show the page in the wrong shape. Give
the page a hard reload after a change to a file in `css/` or in `js/`:
Ctrl+Shift+R, or Cmd+Shift+R on a Mac.
