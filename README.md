# Undead End

A digital prototype of a hex-tile zombie survival board game. Scout the map, scavenge for food, water and gear, fortify your shelter, and survive the night.

## Play

**Play online:** https://matthewkeracher.github.io/Undead-End/

Or open `index.html` in a browser — no build step or install needed.

The game opens on a small menu: **Play**, or **Tutorial**, which explains each action the first time you pick it (you can call it off) and each item the first time you find it. The round timer is off in the tutorial.

## Controls

| Key | Action |
|---|---|
| R | Sleep (gain 1d6 AP + the tile's 🟡 Safety, up to 6) |
| S | Scout (reveals every hex around you) |
| W | Move |
| A | Scavenge |
| F | Fortify |
| E / B / H | Drive truck / Ride bike / Ride horse (when one is on your tile) |
| Enter | Confirm selected action |
| Backspace | Deselect / cancel / stop driving (Esc works too) |
| A Q E D X Z | Pick a neighbouring hex (move / flee / drive) |
| 1–6, then Enter / W / F | Fight with that weapon / Flee (in Move's place) / Hide (in Fortify's) behind the tile's Safety (when zombies are on your tile: usable weapons light up in the backpack) |
| 1–6, then Enter | Pick a backpack slot and use it (Tool, Pills) — or leave the item there |
| Shift+Enter | Keep attacking until clear |
| T | Use tool |
| Tab | Open / close the log & note box |
| P | Pause / resume (single player) — it also pauses by itself when you switch tab or window |
| M | Mute |

## Files

- `DESIGN.md` — the rules as they currently stand, plus open questions
- `MULTIPLAYER.md` — plan for online multiplayer, voice and the Radio
- `QUESTIONS.md` — every open rules question, with space for answers
- `locations.js` — every location, its d6 scavenge table, and where it's found: alone in the countryside or built in villages, towns and cities (edit freely)
- `data.js` — rules numbers, items and the tutorial's words (edit freely)
- `engine.js` — the rules: no screen code, seeded dice, actions in → events out (runs in the browser now, on the multiplayer server later)
- `game.js` — the UI: draws the board and animates the engine's events
- `tests/` — rules tests: `node --test`
- `style.css`, `index.html` — layout and styling
- `tools/stamp.js` — tags the files in `index.html` with a fingerprint (`game.js?v=…`) so browsers, phones included, pick up an update on a normal reload. `tools/pre-commit` runs it on every commit; install it once with `ln -s ../../tools/pre-commit .git/hooks/pre-commit`

Testing cheats can be typed into the log's note box, e.g. `scavenge(1)`, `sleep(6)`, `item(axe)`, `checks()` (toggle resource checks), `timer(on)` / `timer(off)` (1 min round timer), `help()`.
