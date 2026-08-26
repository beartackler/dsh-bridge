# dsh-bridge site

Static catalog for the dsh-bridge verified plugin list. Plain HTML, CSS, and vanilla JS.
No frameworks, no external requests in the page itself (no CDNs, no web fonts), and no
build step beyond the data generator.

## Files

- `index.html` - the catalog page: hero, sticky filter bar (search, grade and category
  selects with counts), semantic table, grade legend, empty and error states.
- `style.css` - design tokens in OKLCH, typography-led hierarchy, light and dark modes
  via `prefers-color-scheme`, reduced-motion support. Grade colors are colorblind-safe:
  A teal, B blue, C amber, D orange, F red, used consistently in badges and legend.
- `app.js` - renders the table from `data.json`, handles search and filters client-side.
- `data.json` - generated. Do not edit by hand.
- `build.mjs` - generates `data.json` from repo state.

## Regenerating data.json

From anywhere (paths resolve relative to the script):

```bash
node site/build.mjs
```

## Viewing

Browsers block `fetch` of local files from `file://` origins, so serve the directory:

```bash
python3 -m http.server 8000 --directory site
# then open http://localhost:8000/
```
