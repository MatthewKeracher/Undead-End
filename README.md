# Undead End

A digital prototype of a hex-tile zombie survival board game. Scout the map, scavenge for food, water and gear, fortify your shelter, and survive the night.

## Play

**Play online:** https://matthewkeracher.github.io/Undead-End/

Or open `index.html` in a browser — no build step or install needed.

## Controls

| Key | Action |
|---|---|
| R | Sleep (gain 1d6 AP) |
| S | Scout |
| W | Move |
| A | Scavenge |
| F | Fortify |
| E / B | Drive truck / Ride bike (when one is on your tile) |
| Enter | Confirm selected action |
| A Q W D X Z | Pick a neighbouring hex (scout / move / flee / drive) |
| Q / W / E | Shoot / Melee / Flee (when zombies are on your tile) |
| Shift+Enter | Keep attacking until clear |
| T | Use tool |
| Tab | Open / close the log & note box |
| M | Mute |

## Files

- `DESIGN.md` — the rules as they currently stand, plus open questions
- `MULTIPLAYER.md` — plan for online multiplayer, voice and the Radio
- `QUESTIONS.md` — every open rules question, with space for answers
- `data.js` — rules numbers, tiles and items (edit freely)
- `game.js` — game engine and UI
- `style.css`, `index.html` — layout and styling

Testing cheats can be typed into the log's note box, e.g. `scavenge(1)`, `sleep(6)`, `item(axe)`, `help()`.
