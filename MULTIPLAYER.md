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

## 2. Rounds: simultaneous, 30-second timer

Taking turns one player at a time doesn't scale (100 players × 30 s = 50 min per round). So:

- **Every round, all players choose their action at the same time** within **30 seconds**.
- When everyone has locked in, or the timer runs out, the round **resolves** and the clock advances.
- **No choice in time → you Sleep** (auto-action). Disconnected players also auto-Sleep. *(decide: or "do nothing"?)*
- The 6-round day clock is **global** — everyone is on the same day/round, so night falls for everyone at once.
- **Free actions** (drive, use tool, drop item, talk) can be done any time during the 30 s, before you lock in. *(decide)*

### Resolution order (needed because actions happen at once)

Proposed, *to confirm*:

1. **Start-of-round:** resource checks (food/water/hope) for everyone; night attack on every occupied tile on night rounds.
2. **Free actions** already happened live during the 30 s.
3. **Locked-in actions resolve per tile, in a fixed order:** Fortify → Scavenge → Scout → Move.
   - Several players **scavenging the same tile** each roll independently.
   - **Fortify** before others means Safety helps everyone on the tile that round.
   - **Move** last, so you finish the round where you chose to go.
4. **Pending decisions** (Fight/Flee, armor reroll, backpack full, A/D food/water loss) get their **own short timer** (e.g. 10 s) inside the round; default = the safest option (or Flee/Fight? — *decide*).

## 3. World & fog of war

- The **server generates the world once** (seeded, so it can be reproduced) — a fixed layout of tiles, much larger than a solo game (size *to decide*, e.g. radius 15 ≈ 700 tiles).
- **Shared world state:** a tile's **Safety, zombies and parked vehicles are the same for everyone**. If someone fortifies the Farmhouse, it's fortified for all.
- **Personal map:** each player has their own set of **scouted tiles**. You only see tiles you've scouted.
  - You can only **move/drive/flee onto tiles you have scouted** (same rule as now).
  - Other players' scouting **does not** reveal tiles on your map — you'd have to be told (by voice / radio) and go see.
- **What you see on scouted tiles — decided: "last seen".**
  - **Your tile and adjacent tiles are live.**
  - **Everywhere else shows what it was like when you last saw it** — Safety, zombies, vehicles, dropped loot and players, drawn faded with a "last seen Day 3, Round 5" tag.
  - So information goes stale: a tile you fortified yesterday may be overrun now. Radio reports from other players become valuable.
- **Other players are only visible** on tiles you can currently see (your tile + adjacent) — not across the whole map.
- **Spawning:** new players start on a random safe tile (or a few fixed spawn points), with only that tile scouted. *(decide)*
- **Scouting into a tile someone else already found:** you get the same tile (the layout is fixed), it just appears on your map.

## 4. Persistence & joining

- The world **runs continuously**; players join and leave.
- Your survivor is **saved** to your account/browser — rejoin and carry on (if you weren't killed while away).
- While offline your survivor **stays on the map** and auto-Sleeps — so night attacks can still kill them. *(decide: or they vanish while offline?)*
- **Death:** your survivor is gone; you **respawn as a new survivor** at a spawn point with a fresh fog of war.
  - **Everything they carried drops on the tile** — all resources and all backpack items (see §6a). Anyone who reaches the tile can take it.
  - Your **days survived** goes on the leaderboard (§6b).
- **World reset:** never, weekly, or when everyone dies? *(decide)*

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

## 6. Multiplayer rules to decide (for `DESIGN.md`)

- **Night attack with several players on a tile:** one 1d6 roll vs Safety for the tile; then each player faces Fight/Flee — fight together (pool kills)?
- **Fleeing:** each player rolls separately; can flee to different tiles.
- **Sharing/trading:** give resources & items to players on the **same tile** (free action).
- **Vehicles:** passengers? (Truck 2–4, Bike 1.) Who drives? Can others use a vehicle you parked?
### 6a. Loot on tiles (new — needed for death drops)

Today only vehicles can sit on a tile; items dropped by a living player are destroyed. Death drops add **loot piles**:

- A tile can hold a **pile** of resources and items (shown as a 🎒 icon on the hex, and in "last seen" info).
- **Picking up:** free action on your tile? or costs 1 AP? *(decide)* — choose what to take; backpack limit (6) still applies.
- **Living players dropping items:** still destroys them (current rule), or should they now go on the pile too? *(decide)*
- Piles never decay? *(decide)*
- Single player gets this too once built (useful if you ever want to stash things).

### 6b. Leaderboard

- **Days survived** per survivor (a death ends that survivor's run; respawning starts a new one at Day 0).
- Shows: name, days (and rounds) survived, alive/dead. Top 10 + your own best.
- Possible later: most zombies killed, most tiles scouted.

### 6c. Player vs player — allowed with a weapon

Decided: you can attack another player **if you have a weapon**. To decide how it works:

- **Where:** only players **on your tile**? (Recommended — same as zombies.)
- **When:** as your round's action (attack instead of scavenge etc.), or any time during the 30 s?
- **How it resolves** — players have no health, so options:
  - **A. Like zombies:** each shot/swing that hits kills outright (brutal; fits "1 bullet kills 1 zombie").
  - **B. Contest:** attacker rolls 1d6 vs defender's 1d6 (+armor? +weapon?); loser dies or loses something.
  - **C. Damage to max AP:** a hit costs the victim max AP (the same "health bar" food & water use) — 0 = death. *(Recommended: reuses an existing system and gives the victim a chance.)*
- **Defender's response:** Fight back (if armed) or Flee (same flee roll vs… attacker count?).
- **Armor** absorbs a hit for −1 condition, like it rescues a failed flee?
- **Safety:** does a fortified tile protect you from players too, or only zombies?
- **Consequences:** killer gets the victim's drop (it's on the tile). Any penalty for killing — e.g. a "hostile" mark visible to others, or hope loss?
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
- **Accounts:** at minimum a name + browser token to reclaim your survivor; real login later.

### Code changes needed first (in this repo)

1. **Split engine from UI** — `game.js` mixes rules, rendering and animations. Pull the rules into a pure module: `state + action → new state + events[]`. No DOM, no waiting on popups.
2. **Per-player view** — the engine knows the whole world; a `viewFor(player)` function returns only that player's scouted tiles and what they can see.
3. **Choices become pending decisions** in the state (Fight/Flee, armor, backpack full, A/D loss, tool target) that the server waits on with a timer.
4. **Simultaneous round resolution** — collect actions, resolve in the order in §2.
5. **Seeded RNG** for world generation and dice (replays/debugging).
6. **Cheats** — admin-only on the server.

The same engine then runs in the browser for single player and on the server for multiplayer.

## 8. UI additions

- **Join screen:** pick a name → spawn into the public world. (Private rooms could come later.)
- **Round timer:** a 30 s countdown ring — could wrap the existing clock, or sit on the action tray; **lock-in** state shown.
- **Players pane** (already exists): "Players in server" becomes a count + a list of players **you can see**; 🎙️ speaking, 📻 on your radio channel.
- **Fog of war:** unscouted tiles stay as fog; "last seen" info faded on far tiles.
- **Mic:** permission prompt, mute toggle, push-to-talk key, per-player mute.

## 9. Roadmap

1. **Engine refactor** (pure rules + events + per-player view) — single player keeps working.
2. **Simultaneous rounds + 30 s timer** in single player (proves the round flow).
3. **Server + world + fog of war**, text chat only; small playtests.
4. **Persistence** (rejoin, death → respawn), **loot piles** on tiles, **leaderboard**.
5. **Proximity voice** (LiveKit, tile rooms).
6. **Radio** (channels, condition cost, text + voice).
6½. **PvP** (once the rules in §6c are settled).
7. **Moderation** (mute/block/report) before opening it fully public.
8. Scale test to 100.

## 10. Open questions

- Timer runs out → auto-Sleep or do nothing?
- Free actions during the 30 s?
- Resolution order within a round (proposed: Fortify → Scavenge → Scout → Move).
- Fight/Flee decision timer and default.
- World size; spawn points.
- Offline survivors: stay on the map (and can die) or vanish?
- Death: respawn rules; picking up loot piles (free or AP?); do living players' drops go on piles too?
- World reset schedule.
- PvP: how attacks resolve (recommended: hits cost max AP), defender options, does Safety protect, any penalty for killing?
- Voice: push-to-talk or open mic?
- Radio: channels, range, cost, where found.
