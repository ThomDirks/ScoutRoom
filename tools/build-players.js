#!/usr/bin/env node
/* Turns one or more SoFIFA scans (.tsv or .csv) into data/players.json.
   Usage: node tools/build-players.js scan1.tsv [scan2.tsv ...]
   Later files win when the same player appears twice. */
const fs = require('fs');
const path = require('path');
const Engine = require(path.join(__dirname, '..', 'js', 'engine.js'));

const files = process.argv.slice(2);
if (!files.length) { console.error('Give me at least one scan file.'); process.exit(1); }

const byKey = new Map();
for (const f of files) {
  const r = Engine.parseTable(fs.readFileSync(f, 'utf8'));
  if (r.error) { console.error(f + ': ' + r.error); process.exit(1); }
  console.log(f + ': ' + r.players.length + ' players. Columns: ' + r.recognized.join(', '));
  r.players.forEach(p => { delete p.demo; byKey.set(p.key, p); });
}
const players = [...byKey.values()];
const keys = [...new Set(players.flatMap(p => Object.keys(p)))];
const rows = players.map(p => keys.map(k => (p[k] === undefined ? null : p[k])));
const out = { version: new Date().toISOString(), count: players.length, keys, rows };
const target = path.join(__dirname, '..', 'data', 'players.json');
fs.writeFileSync(target, JSON.stringify(out));
const withAttrs = players.filter(p => Engine.ATTR_KEYS.filter(k => p[k] != null).length >= 20).length;
console.log('Wrote ' + target + ' (' + (fs.statSync(target).size / 1e6).toFixed(1) + ' MB), ' + players.length + ' players, ' + withAttrs + ' with the full attribute set.');
