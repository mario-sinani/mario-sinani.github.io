# mariosinani.com

Personal website of Mario A. Sinani — Marie Skłodowska-Curie Researcher and
PhD candidate in Aeronautics at Imperial College London.

Hand-written static site: no framework, no build step, zero external
dependencies. Hosted on GitHub Pages at [mariosinani.com](https://mariosinani.com).

## Structure

```
index.html            Page markup
css/                  One stylesheet per feature
  tokens.css          Design tokens: palette, themes, type, layout
  base.css            Reset, page ground, global typography
  components.css      Shared components: sections, pills, logo chips
  nav|hero|about|research|experience|publications|education|footer|motion.css
js/                   ES modules, composed in main.js
  theme.js            Color-scheme resolution and manual toggle
  flowfield.js        Hero animation: potential flow past a lifting cylinder
  reveal.js           Scroll-reveal transitions
  email.js            Runtime email assembly (scraper protection)
assets/
  fonts/              Self-hosted woff2 subsets + @font-face declarations
  logos/              Organization marks (experience & education)
  icons/              Favicons and app icons
  og-image.png        Social share card (Open Graph / Twitter)
```

## Local development

```sh
python3 -m http.server 8080
```

then open <http://localhost:8080>. Every file is served as-is; edit and refresh.
