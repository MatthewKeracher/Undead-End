# Undead End — Multiplayer Plan

Planning notes for taking the single-player prototype online. Nothing here is built yet.
Rules decisions still belong in `DESIGN.md`; this file is about **how** multiplayer works and what has to change.

---

## 1. Decided

| | |
|---|---|
| **Server** | **Public**, always-on, **up to 100 players** in one shared world |
| **Turn timer** | **30 seconds** per round |
| **Map** | The **server knows the whole tile layout**; every player has their **own fog of war** and must **scout** to reveal tiles on *their* map |
| **Talking** | **Same tile → voice by default.** Different tiles → only with a **Radio** |
| **Play style** | Co-op or competitive is up to the players (as in the board game) |
| **Far tiles** | **"Last seen"** — live info only on your tile + adjacent; elsewhere you see what it was like when you last saw it |
| **PvP** | **Allowed if you have a weapon** |
| **Death** | Dead players **drop all their resources and items on the tile** |
| **Scoring** | **Days-survived leaderboard** (no win condition for now) |

## 2. Rounds: real-time, 30-second timer *(decided)*

Taking turns one player at a time doesn't scale (100 players × 30 s = 50 min per round). So every round is a **30-second real-time window**:

1. **Start of round:** on night rounds, the night attack on every occupied tile first (fights settled); then resource checks (food/water/hope) for everyone.
2. **The 30 s window:** every player may take **one action**, and it **resolves the moment it's chosen** — no lock-in, no waiting for others.
   - The server handles actions **in the order they arrive**, so the order on a tile is simply who acted first.
   - **Co-op** comes from timing: talk it through on proximity voice — "I'll fortify now, then you scavenge", "scout north, then I'll move there".
   - **Competition** comes from racing: grab the scavenge first, scout a hex before a rival, move in or out before zombies arrive.
   - Other players' results show up live on your screen (log, toast, the hex changing) but don't block you with a popup.
3. **Round end:** after **30 s** (or as soon as every living player has acted), the round ends. **Anyone who hasn't acted loses 1 AP** (no free Sleep). Disconnected players are treated the same during the reconnect grace period — see §4.

- The 6-round day clock is **global** — everyone is on the same day/round, so night falls for everyone at once.
- **Free actions** (drive, use tool, drop item, give, talk) happen **live**, **any time during the 30 s — before or after your action**. Drive somewhere and act there, or act and then drive off, hand items over, or repair.
  - Note: this allows hit-and-run (e.g. scavenge, roll zombies onto a shared tile, then drive away). Intended — it's part of the competitive side.
- **Zombie fights don't use your action:** if a night attack, or another player's scavenge, brings zombies onto your tile, you face Fight/Flee — then still take your action for the round (if the 30 s aren't up).
- **Pending decisions** (Fight/Flee, armor reroll, backpack full, A/D food/water loss) get their **own 10 s timer**. If time runs out on **Fight/Flee**: **Fight if you have a usable weapon, otherwise Flee**.
- **Round end waits for open decisions:** if the 30 s run out mid-fight, the next round (and its checks / night attack) starts once every open decision has finished (≤ 10 s more).
- **Single player:** the 30 s timer is **on by default**; the cheat `timer(off)` turns it off (then the round only ends when you act).

## 3. World & fog of war

- The **server generates the world once** (seeded, so it can be reproduced) — a fixed layout of tiles, much larger than a solo game **radius 15 ≈ 720 tiles** (~7 per player at 100), edged by a ring of Mountains. *(decided)*
- **Shared world state:** a tile's **Safety, zombies and parked vehicles are the same for everyone**. If someone fortifies the Farmhouse, it's fortified for all.
- **Personal map:** each player has their own set of **scouted tiles**. You only see tiles you've scouted.
  - You can only **move/drive/flee onto tiles you have scouted** (same rule as now).
  - Other players' scouting **does not** reveal tiles on your map — you'd have to be told (by voice / radio) and go see.
- **What you see on scouted tiles — decided: "last seen".**
  - **Your tile and adjacent tiles are live.**
  - **Everywhere else shows what it was like when you last saw it** — Safety, zombies, vehicles, loot tables (looted rows, stashes) and players, drawn faded with a "last seen Day 3, Round 5" tag.
  - So information goes stale: a tile you fortified yesterday may be overrun now. Radio reports from other players become valuable.
- **Other players are only visible** on tiles you can currently see (your tile + adjacent) — not across the whole map.
- **Spawning:** new and respawning players start on a **random safe tile** — passable, no zombies, no other players — with only that tile scouted. *(decided)*
- **Scouting** reveals every hex around you on *your* map. A tile someone else already found is the same tile (the layout is fixed) — it just appears on your map.

## 4. Persistence & joining

- The world **runs continuously**; players join and leave.
- **Logging off kills your survivor** and ends their run *(decided)* — the same as any death: everything they carried drops on the tile, their days survived go on the leaderboard, and next time you join you start a new survivor. A run lasts exactly as long as you stay.
  - **Accidental disconnects** (dropped connection, closed tab by mistake): a **60 s grace period** to reconnect before the survivor dies (each round missed meanwhile costs 1 AP, like any round you don't act in). Reconnect in time and you carry on. *(decided)*
- **Death:** your survivor is gone; you **respawn as a new survivor** on a random safe tile with a fresh fog of war.
  - **Everything they carried drops on the tile** — all resources and all backpack items and becomes **"USERNAME's stash"** on that tile's loot table (see §6a) — unless another player killed them, in which case the killer takes it straight away (§6c).
  - Your **days survived** goes on the leaderboard (§6b).
- **World reset: never** — one persistent world. Fortified tiles, looted rows, stashes and the map build up over time. *(decided)*
- **Safety persists** — it doesn't decay, even in a world that never resets. *(decided for now; revisit if the map fills up with Safety 6 tiles)*

## 5. Talking: proximity voice & the Radio

### Default: proximity voice (same tile)

- Players **on the same tile** hear each other automatically; leaving the tile cuts the link.
- **Push-to-talk vs open mic** — *decide* (push-to-talk is safer on a public server).
- With 100 players, peer-to-peer audio won't scale → use an **SFU voice service** (e.g. **LiveKit**): each tile is a voice room; the game server moves you between rooms as you move.
- **Public server moderation:** mute/block individual players, report, and a server-side mute. Needed from day one on a public server.

### Radio item 📻

Lets players talk to people **not on their tile**.

Proposed rules (*to confirm*):

- **Item** in the backpack, **condition 1–6**.
- **Both ends need a Radio** — you only reach players who also carry one.
- **Channels:** all radios on one public channel (chaotic with 100), or tune to a channel number 1–6 (*recommended* — a d6 theme, and groups can pick a private-ish channel).
- **Cost:** **−1 condition per round you transmit** (like weapons: per round, not per word). At 0 it breaks; tools can repair it.
- **Range:** unlimited, or N hexes? *(decide)*
- Radio audio gets a crackly filter.
- **Found at:** *(decide — e.g. Police Station, Campsite, School)*

Already added to `data.js` (`Radio`, 📻): no effect in single player, not in any loot table yet; test with cheat `item(radio)`.

### Text

The log's note box becomes **text chat** with the same rules: same tile by default, other tiles only via Radio (same channel).

## 6. Multiplayer rules (for `DESIGN.md`) *(decided)*

- **One shared horde:** when zombies break through onto a tile with several players (night attack or someone's scavenge), they're a **single group**. Everyone gets their Fight/Flee prompt at once; **every kill by anyone shrinks the shared count** — which also makes fleeing easier for the rest (the flee roll must beat the zombies *left*).
- **Fleeing is separate:** each player rolls their own flee and picks their own destination.
  - **Rescue:** if you make your flee roll and another player on the tile fails theirs, you may **roll again to save them**. **Succeed and you both escape; fail and you both die.**
  - *Placeholders, to confirm:* the rescue roll uses the same target (beat the zombies left) and costs 1 AP like any flee attempt · you get a 10 s prompt, default **don't rescue** · a rescued player escapes with you to your destination · no armor reroll on a rescue roll · you may try to save each failed player, one roll each · zombie fights only (not PvP).
- **Giving is instant:** resources & items given to a player on your tile go straight to them (free action, no accept). If their backpack is full, the item becomes **your stash** on the tile instead.
- **Vehicles:** the **Truck carries the driver + up to 3 passengers** from the same tile (each passenger accepts; the trip costs them nothing). The **Bike is solo**. Parked vehicles **belong to nobody** — anyone on the tile can take one, so leaving it unguarded is a risk.
### 6a. Loot tables: depletion and stashes *(decided — built in single player, see DESIGN.md)*

**Depletion — permanent.** When a scavenge roll finds a result (resource or item), that row of the tile's table is **crossed off for good**. Landing on a looted row **rolls again** until the die finds something. Zombies are crossed off too once they come, and drift back when the tile has no Safety and nobody on it. A tile with every row crossed off can't be scavenged.
- Shared world: a row looted by anyone is looted for everyone. "Last seen" shows the table as you last saw it, so a tile you remember as full may have been stripped since.
- **The world is allowed to run dry** *(decided for now)*: with no restocking, the map only ever gets emptier (~720 tiles × 5 rows ≈ 3,600 results). When it's stripped, an admin types **`reset()`** in chat to generate a fresh world. Restocking or world growth can be revisited later.

**Stashes — a dead player's loot joins the tile's table.** When a survivor dies (including logging off), everything they carried becomes **"USERNAME's stash"** 🎒 on a row of that tile's table:
- It **covers a row until taken**: a looted row if there is one, otherwise a random non-Zombies row. Up to 5 stashes per tile (rows 2–6).
- You claim it by **scavenging and rolling that number** — a gamble, and others on the tile can race you for it.
- Rolling it gives **everything at once**: all their resources, plus their items up to your backpack limit (choose what to leave). Items left behind stay as a smaller stash on the same row.
- Once emptied, the row underneath shows again (looted rows stay looted).
- Stashes don't decay.

**Dropped items become a stash too** *(decided)*: an item a living player drops goes into **their stash on that tile** (one is created if they don't have one there), so you can leave gear for a teammate — or bait. *(Placeholder: if the tile already has 5 stashes and none is yours, the item joins the oldest.)*
Single player gets depletion too (shared rules).

### 6b. Leaderboard *(decided)*

- **One stat: days survived** (and rounds, as the tie-break). A run ends at death — including logging off.
- **Best run per player:** each player appears once, with their best run.
- **All-time only** — one hall of fame (the world never resets either).
- **Unique names:** first come, first served, tied to a browser token, so nobody can pose as someone else on the board.
- Shows: name and days/rounds of their best run. Top 10 + your own best.

### 6c. Player vs player — allowed with a weapon

Decided: you can attack another player **if you have a weapon**.

- **Where:** only players **on your tile**. *(decided)*
- **Cost:** attacking is **your round's action** and makes **one hit**, plus the weapon's usual cost (Pistol: 1 ammo · Axe: 1 AP · −1 condition). One attack per round; free actions still allow hit-and-run (attack, then drive off). *(decided)*
- **A hit costs the victim 1d6 max AP** — the same "health bar" food & water use; **max AP 0 = death**. About 3–4 hits kill from full (12); eating heals (+1 max AP per paid check). *(decided)*
- **Defender's response** *(decided)* — the target gets the usual **10 s Fight/Flee prompt** (default: fight if armed, else flee). It **doesn't use their action**.
  - **Flee:** roll 1d6 vs the attacker's 1d6 — **beat it** to escape before the hit lands, moving to an adjacent passable tile as when fleeing zombies (1 AP). Fail and the hit lands.
  - **Fight back** (if armed): both roll 1d6; the **higher lands their hit** on the other; **tie: both hit**. The defender pays their weapon's usual cost.
- **Armor soaks damage like Safety** *(decided)*: each point of a hit uses up 1 armor condition; whatever's left gets through. (A 4-damage hit on armor at condition 3 breaks it and 1 gets through.) It still gives the flee reroll against zombies; a Tool repairs it.
- **Safety protects against zombies only** *(decided)* — everyone on a fortified tile is inside the same walls.
- **No penalty for killing** *(decided)*. The **killer gets the victim's stash straight away** — no scavenge roll: all their resources, plus items up to the killer's backpack limit (choose what to leave). Anything left over becomes the victim's stash on the tile's loot table as usual. Whoever lands the killing hit is the killer (a defender fighting back can be the one who kills).
- **Same-tile voice** means attackers and victims can hear each other — good for drama, worth keeping.

## 7. Architecture

The website is static (GitHub Pages), so a separate **always-on realtime server** is needed.

```
Browser (UI, animations, personal fog of war)
   ⇅ WebSocket: intents up, events + your-view-of-the-world down
Game server (whole world, all rules, all dice, 30 s round clock)
   ⇅ database (world + survivors, so the world survives restarts)
Voice service (LiveKit SFU) — one voice room per occupied tile + radio channels
```

- **Server is authoritative:** owns the world and rolls every die. Clients send *intents* ("scavenge", "move to 2,-1"); the server validates, resolves at round end, and sends each player **only what they can see** (their fog of war — never the whole map, or people could cheat by reading it).
- **Animations** stay client-side, driven by events ("you rolled 4 → Double Food, +6").
- **Hosting:** a single always-on Node server is fine for 100 players (e.g. **Fly.io / Render**, or **Colyseus Cloud**). Cloudflare Durable Objects/PartyKit also work. Database: SQLite/Postgres.
- **Accounts:** a **unique name** + browser token (to reconnect within the grace period and keep your leaderboard history). Clearing your browser loses the token — and the name. Real login later, if needed.

### Code changes needed first (in this repo)

1. **Split engine from UI** — `game.js` mixes rules, rendering and animations. Pull the rules into a pure module: `state + action → new state + events[]`. No DOM, no waiting on popups.
2. **Per-player view** — the engine knows the whole world; a `viewFor(player)` function returns only that player's scouted tiles and what they can see.
3. **Choices become pending decisions** in the state (Fight/Flee, armor, backpack full, A/D loss, tool target) that the server waits on with a timer.
4. **Real-time rounds** — a 30 s window where each action resolves on arrival (§2); round ends on the timer or when everyone has acted.
5. **Seeded RNG** for world generation and dice (replays/debugging).
6. **Cheats** — admin-only on the server, including **`reset()`** to generate a fresh world.

The same engine then runs in the browser for single player and on the server for multiplayer.

## 8. UI additions

- **Join screen:** pick a unique name (or reclaim yours via the browser token) → spawn into the public world. (Private rooms could come later.)
- **Round timer:** a 30 s countdown ring — could wrap the existing clock, or sit on the action tray; shows who on your tile has already acted.
- **Players pane** (already exists): "Players in server" becomes a count + a list of players **you can see**; 🎙️ speaking, 📻 on your radio channel.
- **Fog of war:** unscouted tiles stay as fog; "last seen" info faded on far tiles.
- **Mic:** permission prompt, mute toggle, push-to-talk key, per-player mute.

## 9. Roadmap

1. **Engine refactor** (pure rules + events + per-player view) — single player keeps working. *(Done: `engine.js` + `tests/`. Per-player view waits for fog of war in step 3.)*
2. **Real-time rounds + 30 s timer** in single player (proves the round flow). *(Done: on by default; `timer(off)` to turn it off.)*
3. **Server + world + fog of war**, text chat only; small playtests.
4. **Persistence** (reconnect grace, death → respawn), **depletion & stashes** in loot tables, **leaderboard**.
5. **Proximity voice** (LiveKit, tile rooms).
6. **Radio** (channels, condition cost, text + voice).
6½. **PvP** (rules settled in §6c).
7. **Moderation** (mute/block/report) before opening it fully public.
8. Scale test to 100.

## 10. Open questions

- Voice: push-to-talk or open mic?
- Radio: channels, range, cost, where found.
