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
└── index.html
```

## Local development

```sh
python3 -m http.server 8080
```

then open <http://localhost:8080>. Edit and refresh.

This server sends no cache instruction, so a browser can keep an old
stylesheet or an old module and show the page in the wrong shape. Give
the page a hard reload after a change to a file in `css/` or in `js/`:
Ctrl+Shift+R, or Cmd+Shift+R on a Mac.
