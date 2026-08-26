# dsh-bridge site

Static catalog for the dsh-bridge verified plugin list. Plain HTML, CSS, and vanilla JS. No build step beyond the data generator, no external requests in the page itself (no CDNs, no web fonts), and it works offline from `file://`.

## Files

- `index.html` - the catalog page: hero, search, grade and category filters, table with expandable verdict rows.
- `style.css` - typography-first styling. Light/dark follows `prefers-color-scheme`. Grade colors are colorblind-safe: A teal, B blue, C amber, D orange, F red.
- `app.js` - renders the table from `data.json`, handles search and filters.
- `data.json` - generated. Do not edit by hand.
- `build.mjs` - generates `data.json` from repo state.

## Regenerating data.json

From anywhere (paths resolve relative to the script):

```bash
node site/build.mjs
```

The script parses the review table out of `docs/catalog/INDEX.md`, joins each row against `docs/catalog/manifest.json` for category and description, and writes `site/data.json`. Run it whenever `docs/catalog/INDEX.md` or the manifest changes.

## Viewing

Open `site/index.html` directly in a browser, or serve it:

```bash
node -e "require('http').createServer((q,s)=>{require('fs').readFile('site/'+(q.url==='/'?'index.html':q.url),(e,d)=>{e?(s.statusCode=404,s.end()):s.end(d)}}).listen(8123)"
```

Then visit http://localhost:8123. Card links point at GitHub-rendered markdown in the dsh-bridge repository; they need network access, everything else does not.
