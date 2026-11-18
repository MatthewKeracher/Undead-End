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
- Resources: **Safety, Fuel, Ammo, Food, Water, Hope**

## Action Points (AP)
- Players spend AP to take actions.
- **Sleep** is free: the player gains **2d6 AP**, up to their current **max AP** (see Failing a check).

## Actions
| Action | Cost | Effect |
|---|---|---|
| Sleep | free | Gain 2d6 AP |
| Scout | 1 AP | Reveal **every** unexplored hex adjacent to your location (up to 6). Not allowed if all are already explored. |
| Move | 1 AP | Move to an adjacent revealed hex. *(details TBD)* |
| Scavenge | 1 AP | Roll 1d6 on the tile's 6-entry table (see Tiles). |
| Fortify | 1 AP | Roll 1d6 and add it to SAFETY at current location (max 6). |

## Resources
- Each player keeps their **own** resources.
- Players on the **same tile** may share resources with each other.
- **Safety** is different: it belongs to a **location** and does not move with the player. It buffers against zombies.
- Actions cost only AP, not resources.

### Upkeep per round
Checked at the **start** of the round, before anyone acts (on night rounds, the check comes before the night attack).
| Round | Day/Night | Upkeep |
|---|---|---|
| 1 | Night | 1 Hope |
| 2 | Day | 1 Water |
| 3 | Day | 1 Food |
| 4 | Day | 1 Water |
| 5 | Day | 1 Food |
| 6 | Night | 1 Water *(may become Hope — undecided)* + Safety check |

### Failing a check
- **Max AP:** each player has a max AP (starts at **12**, the most it can be).
  - Every **food or water check paid → max AP +1** (up to 12).
  - Every **food or water check missed → max AP −2** (current AP drops to fit). **Max AP 0 → death.**
  - Sleep can't take you above your max. Players never lose turns.
- **Having to give Hope without having it → the player dies** (the night Hope check when you have 0 Hope). Reaching 0 Hope by itself is survivable.

## Turn structure
- Each round, each player takes **one action or sleeps**.
- Every action costs 1 AP. At **0 AP the player must sleep**.
- Sleeping can happen in any round and uses up the player's round.

## Night
- Rounds **1 and 6** are night.
- At the **start** of each night round (before anyone acts), each occupied tile is attacked by **1d6 zombies** (same contest as scavenging, below).
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
  - **Gun (Handgun):** each shot costs **1 ammo** (no AP).
  - **Melee (Axe):** each swing costs **1 AP** — so swinging eats the AP you'd need to flee.
- **Flee:** 1 AP. Roll 1d6 — must roll **higher than the number of zombies** (so 6 zombies can't be outrun).
  On success, move to an adjacent **already-scouted** tile with no zombies.
  **On failure:** only **armor** allows a reroll (−1 armor condition, 1 AP). Otherwise you're **caught**: you can't flee again this encounter and must fight —
  and **with no usable weapon, a failed flee is instant death**.
- **Can't fight (no usable weapon / no ammo / no AP to swing) and can't flee (no AP, no safe scouted neighbour, or too many to outrun) → you die.**

## Items
- Item cards appear **explicitly in tile loot tables** (e.g. "Handgun") so players can plan where to go.
- When found, an item's **condition is rolled 1d6**. Condition = number of uses; at 0 the item breaks.
- **Backpack holds 6 items.** If full when finding one, destroy an item or leave the new one.
- Items can be dropped at any time: a dropped item goes into **your stash** on that tile (see Tiles).
- **Handgun** (gun): see Fight. Found at Police Station, Gun Shop, Hardware Store *(placeholder locations)*.
- **Axe** (melee): see Fight. Found at Farmhouse, Hardware Store, Forest *(placeholder locations)*.
- With both a gun and a melee weapon you choose which to fight with.
- **Armor** (e.g. **Body Armor**): when a **flee roll fails**, armor can take the punch for **−1 condition**, allowing a **reroll** if you have AP left (the reroll costs 1 AP, like any flee attempt). Can repeat while armor and AP last. Found at Police Station, Gun Shop *(placeholder name & locations)*.
- **Vehicles: Truck and Bike.** Work like the gun / axe but for movement. They sit **on a tile, not in the backpack** (found by scavenging → parked on that tile; condition rolled 1d6).
  - **Truck:** 1 **fuel** per tile (no AP). A truck without fuel must be left behind, but can be returned to.
  - **Bike:** 1 **AP** per tile.
  - **−1 condition per trip.** Driving is **free movement**: it does **not** use up your turn, so you can drive somewhere and then take your action there. No storage.
  - Route: pick a hex, move, then pick again. Only **scouted** tiles. You can drive **through** zombie tiles, but stopping on one (or running out of fuel/AP there) triggers Fight or Flee.
  - **Fleeing:** still needs the flee roll, but on success you can escape by vehicle (more than one tile).
  - Toolkit can repair vehicles on your tile.
  - Truck: Farmhouse, Petrol Station. Bike: School, Campsite.
- **Radio** *(multiplayer, planned)*: talk to players **not on your tile** (same-tile voice is the default). Details in `MULTIPLAYER.md`.
- **Tools** (e.g. **Toolkit**): have a condition like any item. Can be used **at any time, for free**, to transfer any amount of their condition to another item (max 6 condition). At 0 condition the tool is destroyed. Toolkit found at Hardware Store, Petrol Station, Campsite *(placeholder name & locations)*.
- If you carry several weapons of the same kind, the one with the **lowest condition** is used first *(placeholder)*.

## Fuel & Ammo
- Used by item cards (not designed yet).

## Tiles
- A tile can be any real-world location (e.g. hospital, petrol station, farm).
- **Depletion:** when a scavenge roll finds a result (resource or item), that row is **crossed off for good** — unless it's marked **Endless** (∞) in `locations.js`, e.g. the Lake's water. Rolling a looted row finds **nothing — the AP is still spent**. Zombies never run out.
- **Stashes:** dropped items — and everything a survivor carried when they die — become **"NAME's stash"** on a row of that tile's table. A stash covers a looted row if there is one, otherwise a random row (2–6); up to 5 per tile (your own stash on a tile grows; with all 5 rows taken, things join the oldest). Roll its number to claim it: all its resources, plus its items up to your backpack space (choose which; the rest stay). Once emptied, the row underneath shows again.
  - A tile with no table (Wasteland) only has empty rows — so it can be scavenged just for a stash left there *(placeholder)*.
- Each tile has a **d6 scavenge table**:
  - **1 is always Zombies** (finite — see Zombies).
  - Results 2–6 are the tile's 5 themed items/resources.
  - Every resource result gives **1d6** of that resource (so tables just say "Food", "Double Food"); a doubled result (e.g. "Double Food") gives **1d6 × 2**. *(For now, Zombies only ever appear on a 1 — no tile has extra Zombies results.)*
- Tiles differ in what their 5 results give.
- **Wasteland** tiles have **no scavenge table** (Scavenge is blocked) and **cannot be fortified** (Safety stays 0, so night attacks hit in full). Zombies only reach them at night. They're the most common tile *(placeholder: 3 in the scouting pool)*.
- **Mountain** tiles are **impassable wasteland**: nobody can move, flee or drive onto or through them. Scouting still reveals them, so they shape the map *(placeholder: 2 in the scouting pool)*.

## Open questions
- Round 6: water or hope?
- More item cards; what uses Fuel
- Item cards and their fuel/ammo use
- Starting tile list and their d6 tables (prototype uses placeholders)

## Prototype placeholders (in `data.js` and `locations.js`, change freely)
- Game starts Day 1, Round 2 (first morning).
- Each player starts with **full AP (12)** and **1d6** each of Food, Water and Hope; 0 Fuel and 0 Ammo.
- A tile holds at most **6 Safety**. Safety belongs to the tile and is shared by everyone on it; it does not decay.
- Scouting reveals a random tile from the tile list for each unexplored neighbour; the scout stays put.
- Sharing resources with a player on the same tile is free (doesn't use the round).
- Player health / death
- Item card list and effects
