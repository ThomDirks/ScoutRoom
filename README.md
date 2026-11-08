# Scout Room

A recruitment tool for EA FC career mode. It scores SoFIFA players on three things: how well they fit a possession, midfield-led system, how likely they are to sign for your club right now, and how well they fit the club's story.

It is a plain static site. No build step, no server, no AI needed to run it. Open the GitHub Pages link and go.

## Layout

```
index.html          the page shell
css/style.css       all styling
js/engine.js        scoring: system fit, signing willingness, lore
js/app.js           the interface, saving, importing
data/clubs/         one JSON file per league, plus index.json listing them
```

## Loading players

Open the Data tab. It has the steps: copy a script, run it in the console on your SoFIFA list, upload the file it saves.

## Adding or changing clubs

Quick way, in the app: Lore tab, pick a club and edit it, or paste a JSON profile. This is saved in your browser only.

Permanent way, in the repo:

1. In the Lore tab press "Copy the whole-league request template". Give it to any AI with the league and season filled in.
2. Save the JSON array it returns as `data/clubs/<league>.json`.
3. Add the file name to `data/clubs/index.json`.
4. Commit. The site picks it up on the next load.

To turn your in-app edits into a file instead, press "Copy my edited clubs as a league file" in the Lore tab and save the result the same way.

A club profile looks like this:

```json
{
  "name": "Wolverhampton Wanderers",
  "league": "Championship",
  "country": "England",
  "prestige": 58,
  "sources": { "Portugal": 10, "England": 4 },
  "feeders": ["Benfica", "Sporting CP"],
  "feederLeagues": [],
  "ties": [],
  "rivals": ["West Bromwich Albion"],
  "style": { "youth": 5, "veteran": 5, "physical": 6, "technical": 6, "pace": 6 },
  "ageIdeal": [20, 30],
  "notes": "Long Portuguese pipeline."
}
```

`sources` weights run 0 to 10 (10 is the club's classic pipeline). Prestige runs 0 to 100.

## Running it locally

Browsers block reading the `data` folder from a file:// address. Run `python -m http.server` in this folder and open http://localhost:8000, or just use the Pages link.
