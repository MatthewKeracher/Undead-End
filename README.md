# Undead End

A digital prototype of a hex-tile zombie survival board game. Scout the map, scavenge for food, water and gear, fortify your shelter, and survive the night.

## Play

**Play online:** https://matthewkeracher.github.io/Undead-End/

Or open `index.html` in a browser — no build step or install needed.

## Controls

| Key | Action |
|---|---|
| R | Sleep (gain 2d6 AP) |
| S | Scout (reveals every hex around you) |
| W | Move |
| A | Scavenge |
| F | Fortify |
| E / B | Drive truck / Ride bike (when one is on your tile) |
| Enter | Confirm selected action |
| Backspace | Deselect / cancel / stop driving (Esc works too) |
| A Q E D X Z | Pick a neighbouring hex (move / flee / drive) |
| Q / W / E | Shoot / Melee / Flee (when zombies are on your tile) |
| Shift+Enter | Keep attacking until clear |
| T | Use tool |
| Tab | Open / close the log & note box |
| P | Pause / resume (single player) |
| M | Mute |

## Files

- `DESIGN.md` — the rules as they currently stand, plus open questions
- `MULTIPLAYER.md` — plan for online multiplayer, voice and the Radio
- `QUESTIONS.md` — every open rules question, with space for answers
- `locations.js` — every location and its d6 scavenge table (edit freely)
- `data.js` — rules numbers and items (edit freely)
- `engine.js` — the rules: no screen code, seeded dice, actions in → events out (runs in the browser now, on the multiplayer server later)
- `game.js` — the UI: draws the board and animates the engine's events
- `tests/` — rules tests: `node --test`
- `style.css`, `index.html` — layout and styling

Testing cheats can be typed into the log's note box, e.g. `scavenge(1)`, `sleep(6)`, `item(axe)`, `checks()` (toggle resource checks), `timer(on)` / `timer(off)` (30 s round timer), `help()`.
