# Zombie Survival — Design Notes

Living rules document for the digital version. Updated as rules are clarified.

## Overview
- **Digital prototype focus: single player.** The engine keeps a players list so multiplayer (sharing, co-op/competitive) can return later.
- Multiplayer survival simulation. Co-op vs competitive is left to the players (no enforced win condition yet).
- Win/lose conditions: TBD — current focus is the survival simulation itself.

## Board
- Hex map (Catan-style).
- Players start on a single hex.
- New locations are revealed by **scouting** (an action).

## Time
- A **day** is a clock of **6 rounds**: 4 day rounds, 2 night rounds.
- Each round, each player takes **one action**.

## Components
- Item cards
- Six-sided dice (d6)
- Resources: **Safety, Fuel, Ammo, Food, Water, Booze**

## Action Points (AP)
- Players spend AP to take actions.
- **Sleep** is free: the player gains **2d6 AP**, up to their current **max AP** (see Failing a check).

## Actions
| Action | Cost | Effect |
|---|---|---|
| Sleep | free | Gain 2d6 AP |
| Scout | 1 AP | Reveal **every** unexplored hex adjacent to your location (up to 6). Not allowed if all are already explored. |
| Move | free / 1 AP | Move to an adjacent hex — explored or not: an **unexplored hex is revealed as you step in** (driving and fleeing too). If it turns out to be impassable (a Mountain), you're blocked and nothing is spent; when fleeing, pick another way (none left = caught). **The first move each round is free** (no AP spent, doesn't use your action) **but you must have at least 1 AP** — so at 0 AP the only option is to sleep; a second move costs 1 AP and **is** your action. |
| Scavenge | 1 AP | Roll 1d6 on the tile's 6-entry table (see Tiles). |
| Fortify | 1 AP | Roll 1d6 and add it to SAFETY at current location (up to that place's max — see Tiles). |

## Resources
- Each player keeps their **own** resources.
- Players on the **same tile** may share resources with each other.
- **Safety** is different: it belongs to a **location** and does not move with the player. It buffers against zombies.
- Actions cost only AP, not resources.

### Upkeep per round
Checked at the **start** of the round, before anyone acts (on night rounds, the check comes before the night attack).
| Round | Day/Night | Upkeep |
|---|---|---|
| 1 | Day | 1 Water |
| 2 | Day | 1 Food |
| 3 | Day | 1 Water |
| 4 | Day | 1 Food |
| 5 | Night | 1 Water *(may become Booze — undecided)* + Safety check |
| 6 | Night | 1 Booze |

Each day starts on round 1, the first morning; rounds 5 and 6 are its night.

### Failing a check
- **Max AP:** each player has a max AP (starts at **12**, the most it can be).
  - **Water** check paid → **max AP +2**; missed → **max AP −2**.
  - **Food** check paid → **max AP +1**; missed → **max AP −1**.
  - Max AP can't go above 12; when it drops, current AP drops to fit. **Max AP 0 → death.** (`CONFIG.trackGain` / `trackLoss`)
  - Sleep can't take you above your max. Players never lose turns.
- **Having to give Booze without having it → the player dies** (the night Booze check when you have 0 Booze). Reaching 0 Booze by itself is survivable.

## Turn structure
- Each round, each player takes **one action or sleeps**.
- Every action costs 1 AP. At **0 AP the player must sleep**.
- Sleeping can happen in any round and uses up the player's round.

## Night
- Rounds **5 and 6** are night.
- At the **start of round 5** (before anyone acts), each occupied tile is attacked by **1d6 zombies** (same contest as scavenging, below). Round 6 is still night (and has the Booze check) but **no attack** (`CONFIG.attackRounds`)…
- …**unless it's a bad night.** As round 1 starts each day, a **secret 1d6** is rolled: on a **1–2** the clock shows a 🟡 on round 6 and **round 6 brings a second attack**, straight after round 5's (`CONFIG.badNightOn`). The roll itself is never shown — just the warning.
- Fighting or fleeing zombies **never uses up your action** for the round — whether they came from a night attack or another player's scavenge. You deal with them, then still act.

## Zombies
- Zombies arrive two ways: a **scavenge roll of 1** (and any other Zombies results on a tile's table), or the **night attack**.
- **Scavenge zombies are finite:** once a Zombies row has been rolled, it's crossed off — rolling it again finds nothing. It **comes back** when the tile has **no Safety and no survivor on it** (checked at the start of each round *(placeholder)*). So clearing a tile makes it safe to scavenge while you stay, and fortifying keeps it clear after you leave. Night attacks are unaffected.
- The number arriving is always **1d6**.
- **Contest Safety:** each zombie cancels one point of the tile's Safety (that Safety is used up). Leftover zombies fill the tile's 6 circles as **black circles** — a tile holds at most 6 zombies.
- A tile with zombies on it blocks **scavenging** and **fortifying** *(fortify block is a placeholder)*.
- Only a player **carrying a weapon** can move onto a tile with zombies.
- **Zombies never leave a tile.**

## Fight or Flee
Triggered when zombies break through onto your tile, or when you move onto a tile with zombies.
Repeat until the tile is clear, you escape, or you die.
- **Fight:** **using an item costs no AP**; the weapon loses **1 condition per fight round** (not per attack). Attack one at a time (**Enter** each): each attack kills 1 zombie. Stop any time (Esc).
  - **Gun (Pistol):** each shot costs **1 ammo** (no AP).
  - **Melee (Axe):** each swing costs **1 AP** — so swinging eats the AP you'd need to flee.
- **Flee:** 1 AP. Roll 1d6 — must roll **higher than the number of zombies** (so 6 zombies can't be outrun).
  On success, move to an adjacent **already-scouted** tile with no zombies.
  **On failure:** only **armor** allows a reroll (−1 armor condition, 1 AP). Otherwise you're **caught**: you can't flee again this encounter and must fight —
  and **with no usable weapon, a failed flee is instant death**.
- **Can't fight (no usable weapon / no ammo / no AP to swing) and can't flee (no AP, no safe scouted neighbour, or too many to outrun) → you die.**

## Items
- Item cards appear **explicitly in tile loot tables** (e.g. "Pistol") so players can plan where to go.
- When found, an item's **condition is rolled 1d6**. Condition = number of uses; at 0 the item breaks.
- **Backpack holds 6 items.** If full when finding one, destroy an item or leave the new one.
- Items can be dropped at any time: a dropped item goes into **your stash** on that tile (see Tiles).
- **Pistol** (gun): see Fight. Found at Police Station, Gun Shop, Hardware Store *(placeholder locations)*.
- **Axe** (melee): see Fight. Found at Farmhouse, Hardware Store, Forest *(placeholder locations)*.
- With both a gun and a melee weapon you choose which to fight with.
- **Armor** (e.g. **Body Armor**): when a **flee roll fails**, armor can take the punch for **−1 condition**, allowing a **reroll** if you have AP left (the reroll costs 1 AP, like any flee attempt). Can repeat while armor and AP last. Found at Police Station, Gun Shop *(placeholder name & locations)*.
- **Vehicles: Truck and Bike.** Work like the gun / axe but for movement. They sit **on a tile, not in the backpack** (found by scavenging → parked on that tile; condition rolled 1d6).
  - **Truck:** 1 **fuel** per tile (no AP). A truck without fuel must be left behind, but can be returned to.
  - **Bike:** 1 **AP** per tile.
  - **−1 condition per trip.** At **0 it breaks down but stays parked** where it stopped — it can't be driven until a **Tool** repairs it. Driving is **free movement**: it does **not** use up your turn, so you can drive somewhere and then take your action there. No storage.
  - Route: pick a hex, move, then pick again. Only **scouted** tiles. You can drive **through** zombie tiles, but stopping on one (or running out of fuel/AP there) triggers Fight or Flee.
  - **Fleeing:** still needs the flee roll, but on success you can escape by vehicle (more than one tile).
  - Tool can repair vehicles on your tile.
  - **Looks** (pure re-skins — same rules, new name and icon): fuel vehicles drive like the Truck, pedal ones like the Bike.
    | Vehicle | Kind | Found at |
    |---|---|---|
    | 🛻 Truck | fuel | Petrol Station (**Truck + Fuel**: you also get 1d6 fuel) |
    | 🚜 Tractor | fuel | Farmhouse (**Tractor + Fuel**) |
    | 🚑 Ambulance | fuel | Hospital |
    | 🚓 Police Car | fuel | Police Station |
    | 🚙 Jeep | fuel | Army Checkpoint |
    | 🚚 Van | fuel | YOLO Foods |
    | 🚌 Bus | fuel | School |
    | 🚐 Campervan | fuel | Campsite |
    | 🚲 Bike | pedal (AP) | School, Campsite |
  - Keys: **E** drives the fuel vehicle parked here, **B** rides the pedal one.
- **Radio** *(multiplayer, planned)*: talk to players **not on your tile** (same-tile voice is the default). Details in `MULTIPLAYER.md`.
- **Tools** (e.g. the **Tool**): have a condition like any item. Can be used **at any time, for free**, to transfer any amount of their condition to another item (max 6 condition). At 0 condition the tool is destroyed. Tool found at Hardware Store, Petrol Station, Campsite *(placeholder name & locations)*.
- **Pills**: taken **at any time, for free** (not your action; not mid-fight): each dose costs **1 condition** and tops your **AP up to your max AP** (max AP itself doesn't change — only food and water do that). Can't be taken when AP is already at max. Found with **1d6 condition**, like any item. Gone at 0 condition. Found at the Pharmacy (two rows) and Hospital *(placeholder)*.
- **Binoculars**: while carried, **Scout reveals the hexes next to you, then the hexes next to those** (the second ring) — **but not past a Mountain**: a hex 2 away is only seen through a non-Mountain hex next to you. With everything next to you explored, you can still scout the second ring. Each scout with them costs **1 condition**; gone at 0. Found at the Campsite and Army Checkpoint *(placeholder)*.
- **Map** *(disabled for now — in no loot table)*: used the moment it's found (never carried, no condition) — like scouting everywhere at once: every unexplored hex next to any explored one is revealed.
- If you carry several weapons of the same kind, the one with the **lowest condition** is used first *(placeholder)*.

## Fuel & Ammo
- Used by item cards (not designed yet).

## Tiles
- A tile can be any real-world location (e.g. hospital, petrol station, farm).
- **Depletion:** when a scavenge roll finds a result (resource or item), that row is **crossed off for good** — unless it's marked **Endless** (∞) in `locations.js`, e.g. the Lake's water. If the d6 lands on a crossed-off row, it's **rolled again automatically** (still a plain d6 each time) — **1 roll plus up to 2 rerolls**; if they all land on crossed-off rows, **you find nothing** and the AP is spent (`CONFIG.maxRerolls`). A tile with every row crossed off — cleared Zombies included — can't be scavenged ("Picked clean").
- **Stashes:** dropped items — and everything a survivor carried when they die — become **"NAME's stash"** on a row of that tile's table. A stash covers a looted row if there is one, otherwise a random row (2–6); up to 5 per tile (your own stash on a tile grows; with all 5 rows taken, things join the oldest). Roll its number to claim it: all its resources, plus its items up to your backpack space (choose which; the rest stay). Once emptied, the row underneath shows again.
  - A tile with no table (Wasteland) only has empty rows — so it can be scavenged just for a stash left there *(placeholder)*.
- Each tile has a **d6 scavenge table**:
  - **1 is always Zombies** (finite — see Zombies).
  - Results 2–6 are the tile's 5 themed items/resources.
  - Every resource result gives **1d6** of that resource (`CONFIG.lootDice`); a **Double** gives **1d6 × 2** (at most one Double per place, on what it's richest in — e.g. YOLO Foods' Double Food, the Gun Shop's Double Ammo). "Triple" (× 3) also works but isn't used. Item condition and zombie counts are **1d6**. A **mix** gives every part, each rolled on its own — used a lot: Food + Water, Food + Booze, Pistol + Ammo, Fuel + Ammo, Tool + Fuel, Truck + Fuel. *(For now, Zombies only ever appear on a 1 — no tile has extra Zombies results.)*
- Tiles differ in what their 5 results give.
- **Wasteland** tiles have **no scavenge table** (Scavenge is blocked) and **cannot be fortified** (Safety stays 0, so night attacks hit in full). Zombies only reach them at night. They come in **belts**: a **triangle of 3** or (30% of the time) a **cluster of 7** — when a fresh one is revealed, the rest of the belt is set on the unexplored hexes around it and appears as you explore (`spread: 'belt'`, `CONFIG.beltBig`). About 14% of the land.
- **Max Safety differs by place** (`safety:` in `locations.js`): **0 outdoors** — Forest, Lake, Campsite, Wasteland, Mountain can't be fortified (night attacks hit in full; cleared zombies drift back as soon as you leave) — and **3–8 indoors**: Pharmacy & Petrol Station 3, YOLO Foods 4, Farmhouse, Pub & Hardware Store 5, Hospital, School & Gun Shop 6, Church & Army Checkpoint 7, Police Station 8. At 7–8 a single night attack (max 6) can't break through.
- **Mountain** tiles are **impassable wasteland**: nobody can move, flee or drive onto or through them. Scouting still reveals them, so they shape the map. They come in **ranges**: a fresh one runs 1–3 more hexes off each way in a rough line (bending now and then), with about a quarter of those left as **passes** — ordinary places to get through (`spread: 'range'`, `CONFIG.rangeArm`, `rangeGap`, `rangeTurn`). About 10% of the land. Belts and ranges don't merge: a hex next to one can't start another of the same kind.

## Open questions
- Round 5: water or booze?
- More item cards; what uses Fuel
- Item cards and their fuel/ammo use
- Starting tile list and their d6 tables (prototype uses placeholders)

## Prototype placeholders (in `data.js` and `locations.js`, change freely)
- Game starts Day 1, Round 1 (first morning).
- Each player starts with **8 AP** (`CONFIG.startAP`) and **max AP 12**, **4 Food, 6 Water and 3 Booze**, 0 Fuel and 0 Ammo (`CONFIG.startRes`), and **no items** (`CONFIG.startItems`) — the Farmhouse's Axe (row 5) is the nearest weapon.
- A tile holds as much Safety as its place allows (default **5**, `CONFIG.maxSafety`) — and at most **6 zombies** (`CONFIG.maxZombies`). Safety belongs to the tile and is shared by everyone on it; it does not decay.
- Scouting reveals a random tile from the tile list for each unexplored neighbour; the scout stays put.
- Sharing resources with a player on the same tile is free (doesn't use the round).
- Player health / death
- Item card list and effects
