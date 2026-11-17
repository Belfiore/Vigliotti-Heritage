# Vigliotti Family Heritage

A starter website for the Vigliotti family history. Every page is a placeholder that says what will go there. The family tree and the interactive canvas start with Dylan at the center, his parents, his four grandparents, and his sister.

Pages:

- `index.html`: Home
- `family-tree.html`: Family Tree (list view, built from `data/people.json`)
- `tree-canvas.html`: Family Canvas (interactive map, built from `data/people.json`)
- `immigration.html`: Immigration
- `blank-page.html`: Blank Page (reserved for a story unique to this family)
- `research.html`: Records and Research

## Editing the family

All people live in `data/people.json`. Both the Family Tree page and the Family Canvas read it, so edit once and both update. Sources live in `data/sources.json`.

Each person has an `id`, a `displayName`, a `generation` number (0 is the oldest row), and links to `parents`, `spouses` and `children` by `id`. To add someone, copy an existing entry, give it a new `id`, and add that `id` to the relatives' lists.

Things worth knowing:

- Set `"isLiving": true` for anyone who may be alive. The canvas then shows only their name and relationships. Set it to `false` to show dates, places, the at-a-glance table and the timeline.
- Both sets of grandparents are supported: when a couple both have parents listed, the second family is drawn beside the first and linked down to the child.
- `meta.rootPersonId` picks who sits at the center and who the "Relationships to" menu starts on. `meta.directLineLabel` is the wording for the highlighted line.
- Photos go in `images/`. Point a person's `photo` at `images/your-file.jpg`.

## Running it locally

The data loads with `fetch`, so open the site through a local server rather than by double-clicking:

```
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Publishing

The site is plain HTML, CSS and JavaScript with no build step. In the repository settings, set Pages to deploy from the `main` branch, root folder.
