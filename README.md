# Vigliotti Family Heritage

The Vigliotti and Walsh families, drawn from Dylan Vigliotti: the home page, the family tree, the interactive canvas, the family map, a Discovery Timeline of each research find, immigration, and the records behind them.

## How the site is built

The interactive family tree (`tree-canvas.html`), the family map (`map.html`) and the navigation bar come from the shared engine, [Belfiore/family-site-engine](https://github.com/Belfiore/family-site-engine). Everything else here belongs to this family:

| | |
| --- | --- |
| `site.config.json` | The site's settings: its name and pages, the navigation, the tree's labels, the map's home region, and the palette. See the engine's `docs/site-config.md` |
| `data/people.json`, `data/sources.json` | The family and the records. See the engine's `docs/data-format.md` |
| `data/places.json` | The one places dataset. The website map and any exported map are generated from this file, never edited by hand |
| `data/discovery-timeline.json` | Each research find, with the date it was found and a headline. The Discovery Timeline page and the Key Discoveries on the home page both read this file |
| `*.html`, `styles.css`, `family-tree.js`, `discovery-timeline.js` | The home page, the list view of the tree, the Discovery Timeline, the story pages and their scripts |
| `images/` | Photographs and record images, when the family has them |
| `tests/` | Checks of the canvas, the map and the Discovery Timeline, run against every build before it is published |

On every push to `main`, GitHub Actions checks the data, builds the site with the engine version this site's channel points to (`engine.channel`: `stable`), runs the tests against the build, and publishes it. If anything fails, nothing is published and the live site stays as it was. A pull request gets the same checks without publishing.

The Pages source should be **GitHub Actions**, not "Deploy from a branch". The live site will keep its older files until the first engine build is approved and merged.

## Changing the site

- **The family**: edit `data/*.json`. The build checks every change and says what to fix.
- **A new research find**: add an entry to `data/discovery-timeline.json` with `foundDate` (the date the find was made) and `headline`. The timeline page and the home page update from that file.
- **A place**: add it to `data/places.json` first, then regenerate any export with `python3 tools/export-places.py`. Living people are not placed on the map.
- **A page**: edit it as usual. The navigation bar on every page comes from `nav` in `site.config.json`; whatever bar a page has is replaced.

Living people are recorded by name and relationship only: no dates and no addresses.

## Seeing it before it is published

With a copy of the engine next to this repository:

```sh
python3 ../family-site-engine/build/validate.py --site .
python3 ../family-site-engine/build/build_site.py --site . --out _site
python3 -m http.server -d _site 8000      # open http://localhost:8000
node tests/verify-canvas.js               # needs Node and Playwright with Chromium
node tests/verify-map.js
node tests/verify-discovery.js
```

## Rolling back

If an engine release breaks something here: **Actions > Build and publish the site > Run workflow**, with the engine version that last worked. To stay on it until a fix is out, set `"engine": { "version": "1.0.1" }` in `site.config.json`, and remove it afterwards.

## Follow-up in the engine repository

This site is not yet listed in `sites.json` in Belfiore/family-site-engine, so it will not be told automatically when the stable channel moves. Adding `{ "repo": "Belfiore/Vigliotti-Heritage", "name": "Vigliotti", "channel": "stable" }` there is a separate change, and needs a dispatch token that can reach this repository.
