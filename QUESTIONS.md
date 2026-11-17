# Undead End — Open Questions

Everything still to decide, in one place. Write your answer under each question (or tick it off) and the rules can be built from here.
Current behaviour is noted in *italics* where the game already does something as a placeholder.

---

## Core rules (single player)

### Clock & checks
- [ ] **Round 6 check: water or morale?**
  *Now: 1 water.*
  > Answer:

### Zombies
- [ ] **Can you Fortify a tile that has zombies on it?**
  *Now: no, blocked until cleared.*
  > Answer:
- [ ] **Should some tiles be more dangerous again (extra Zombies results on 2, 3…)?**
  *Now: zombies only on a 1, on every tile.*
  > Answer:

### Fight & flee
- [ ] **Failed flee while carrying a usable weapon:** survive and must fight (now), or die anyway unless you have armor?
  *Now: caught → must fight; only die if you have no usable weapon.*
  > Answer:
- [ ] **Axe condition:** −1 per fight round (like the gun), or −1 per swing?
  *Now: per round.*
  > Answer:
- [ ] **Several weapons of the same kind:** which is used?
  *Now: the one with the lowest condition.*
  > Answer:

### Vehicles
- [ ] **How many trips per round?**
  *Now: unlimited (each costs 1 condition).*
  > Answer:
- [ ] **Vehicle locations** — Truck: Farmhouse, Petrol Station. Bike: School, Campsite. Keep?
  > Answer:

### Items
- [ ] **Tool name** — "Toolkit" OK?
  > Answer:
- [ ] **Can a tool repair another tool?**
  *Now: yes.*
  > Answer:
- [ ] **Armor name** — "Body Armor" OK?
  > Answer:
- [ ] **Item locations** (all placeholders): Handgun — Police Station, Gun Shop, Hardware Store · Axe — Farmhouse, Hardware Store, Forest · Body Armor — Police Station, Gun Shop · Toolkit — Hardware Store, Petrol Station, Campsite. Keep / change?
  > Answer:
- [ ] **More item cards** — what else is in the deck?
  > Answer:
- [ ] **Fuel** is only used by the Truck. Anything else use fuel (generator, Molotov, fire for morale…)?
  > Answer:

### Tiles
- [ ] **The real tile list and their d6 tables** — the 14 tiles in `data.js` are placeholders I invented. What tiles does your board game have?
  > Answer:
- [ ] **Starting tile** — always the Farmhouse?
  > Answer:

### Starting values
- [ ] **Starting max AP:** 6? *(AP, food, water, morale are 1d6; fuel & ammo 0.)*
  > Answer:

---

## Multiplayer (see `MULTIPLAYER.md`)

### Rounds
- [ ] **30 s timer runs out:** auto-Sleep, or do nothing?
  > Answer:
- [ ] **Free actions** (drive, use tool, drop item, talk) allowed any time during the 30 s?
  > Answer:
- [ ] **Resolution order within a round** — proposed: start-of-round checks & night attack → Fortify → Scavenge → Scout → Move. OK?
  > Answer:
- [ ] **Fight/Flee decisions inside a round:** how long a timer (e.g. 10 s), and what's the default if you don't choose?
  > Answer:

### World
- [ ] **World size** (e.g. radius 15 ≈ 700 tiles)?
  > Answer:
- [ ] **Spawning:** random safe tile, or a few fixed spawn points?
  > Answer:
- [ ] **Offline survivors:** stay on the map (and can die), or vanish while you're away?
  > Answer:
- [ ] **World reset:** never, weekly, or when everyone is dead?
  > Answer:

### Death & loot piles
- [ ] **Picking up from a loot pile:** free, or costs 1 AP?
  > Answer:
- [ ] **Items dropped by living players:** still destroyed, or go on the tile's pile?
  > Answer:
- [ ] **Do loot piles ever decay/disappear?**
  > Answer:

### PvP (allowed with a weapon)
- [ ] **Where:** only players on your own tile?
  > Answer:
- [ ] **When:** as your round's action, or any time during the 30 s?
  > Answer:
- [ ] **How a hit resolves:** A) kills outright · B) 1d6 contest · C) costs the victim max AP (0 = death) *(recommended)*
  > Answer:
- [ ] **Defender's options:** fight back / flee (flee roll vs what?)
  > Answer:
- [ ] **Does armor absorb a player's hit** (−1 condition)?
  > Answer:
- [ ] **Does Safety protect against players**, or only zombies?
  > Answer:
- [ ] **Any penalty for killing** (visible "hostile" mark, morale loss…)?
  > Answer:

### Multiplayer fights & sharing
- [ ] **Night attack with several players on a tile:** fight together / pool kills?
  > Answer:
- [ ] **Fleeing:** each player rolls separately and can go to different tiles?
  > Answer:
- [ ] **Giving resources/items** to players on the same tile — free action?
  > Answer:
- [ ] **Vehicle passengers?** (Truck 2–4, Bike 1) Can others use a vehicle you parked?
  > Answer:

### Voice & Radio
- [ ] **Proximity voice:** push-to-talk or open mic?
  > Answer:
- [ ] **Radio:** do both players need one?
  > Answer:
- [ ] **Radio channels:** one public channel, or channels 1–6 *(recommended)*?
  > Answer:
- [ ] **Radio range:** unlimited, or N hexes?
  > Answer:
- [ ] **Radio cost:** −1 condition per round you transmit?
  > Answer:
- [ ] **Where is the Radio found?**
  > Answer:

### Leaderboard
- [ ] **Days survived** decided. Add later: zombies killed, tiles scouted, other?
  > Answer:
