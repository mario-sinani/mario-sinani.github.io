# mariosinani.com

Personal website of Mario A. Sinani.

## Structure

```
index.html                      home: hero, about, research, experience,
                                publications timeline, education, contact
publications/
  index.html                    the full publication list - abstracts,
                                DOIs, type filter, BibTeX
  <paper-slug>/index.html       one page per publication, each with its
                                own animated background scene
css/                            one stylesheet per feature
  tokens.css                    design tokens: palette, type, layout
  base|components|nav|hero|about|research|experience|publications|
  education|footer|motion.css   the home page's features
  pubs-page|paper|cite.css      the publication pages' features
js/                             one module per concern, ES modules
  main.js                       entry point: home page
  publications-page.js          entry point: publication list
  paper-page.js                 entry point: paper pages; picks the scene
                                named by the canvas's data-field
  site.js                       the features every page shares
  theme.js                      system/light/dark, persisted
  nav.js | reveal.js | email.js | pub-filter.js | abstract.js | cite.js
  field-canvas.js               canvas engine: sizing, palette, loop,
                                reduced-motion stills
  streaklines.js | flowlines.js | potential-flow.js | ink.js
                                what the scenes are built from
  scenes/                       one animated background per subject
    lifting-cylinder.js         the home hero's flow field
    stage.js                    where a paper scene sits on the page
    pitching-section | incidence-sweep | hinged-wingtip |
    beam-modes | event-tracking | image-servo .js
assets/
  fonts/ | logos/ | icons/ | og-image.png
sitemap.xml | robots.txt | site.webmanifest | CNAME
```

No framework, no build step, no dependencies: plain HTML, CSS and ES
modules, served as-is.

## Local development

```sh
python3 -m http.server 8080
```

then open <http://localhost:8080>. Edit and refresh.
