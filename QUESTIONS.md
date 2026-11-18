# Undead End — Open Questions

Everything still to decide, in one place. Write your answer under each question (or tick it off) and the rules can be built from here.
Current behaviour is noted in *italics* where the game already does something as a placeholder.

---

## Core rules (single player)

### Clock & checks
- [ ] **Round 6 check: water or hope?**
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
- [ ] **Fuel** is only used by the Truck. Anything else use fuel (generator, Molotov, fire for hope…)?
  > Answer:

### Tiles
- [ ] **The real tile list and their d6 tables** — the 14 tiles in `locations.js` are placeholders I invented. What tiles does your board game have?
  > Answer:
- [ ] **Starting tile** — always the Farmhouse?
  > Answer:

### Starting values
- [x] **Starting max AP:** 12. *(AP starts full; food, water, hope are 1d6; fuel & ammo 0.)*
  > Answer: 12

---

## Multiplayer (see `MULTIPLAYER.md`)

### Rounds
- [x] **30 s timer runs out:** auto-Sleep, or do nothing?
  > Answer: Auto-Sleep (disconnected players too).
- [x] **Free actions** (drive, use tool, drop item, talk) allowed any time during the 30 s?
  > Answer: Yes — live, any time during the 30 s, before or after your action.
- [x] **Resolution order within a round** — proposed: start-of-round checks & night attack → Fortify → Scavenge → Scout → Move. OK?
  > Answer: No fixed order. Rounds are real-time: each action resolves the moment it's chosen, so order = who acts first. Co-op by coordinating timing, competition by racing. After 30 s the round ends and anyone undecided Sleeps.
- [x] **Fight/Flee decisions inside a round:** how long a timer (e.g. 10 s), and what's the default if you don't choose?
  > Answer: 10 s. Default: Fight if you have a usable weapon, otherwise Flee.
- [x] **Zombies brought onto your tile by another player's action** — does your Fight/Flee use your round's action?
  > Answer: No — a zombie fight is a reaction; you still get your action.
- [x] **30 s run out during a Fight/Flee** (or other 10 s decision)?
  > Answer: The round waits for open decisions to finish before the next round starts.
- [x] **Single player: use the 30 s timer?**
  > Answer: Optional setting, off by default.
- [x] **Night attack Fight/Flee** (start of round) — does it also use your action for that round, like being caught by another player's zombies?
  > Answer: No — zombie attacks never use up your round.

### World
- [x] **World size** (e.g. radius 15 ≈ 700 tiles)?
  > Answer: Radius 15 (~720 tiles), Mountain ring at the edge.
- [x] **Spawning:** random safe tile, or a few fixed spawn points?
  > Answer: Random safe tile (passable, no zombies, no players).
- [x] **Offline survivors:** stay on the map (and can die), or vanish while you're away?
  > Answer: Logging off kills your survivor and ends their run (loot drops on the tile, days go on the leaderboard).
- [x] **Accidental disconnects:** grace period to reconnect before the survivor dies (e.g. 2 rounds / 60 s, auto-Sleeping meanwhile)?
  > Answer: 60 s grace period, auto-Sleeping meanwhile.
- [x] **Safety decay** in a world that never resets?
  > Answer: No — Safety persists for now.
- [x] **World reset:** never, weekly, or when everyone is dead?
  > Answer: Never — one persistent world.

### Death, stashes & depletion
- [x] **Loot from dead players** — how is it picked up?
  > Answer: It becomes "USERNAME's stash" on a row of the tile's loot table (covering a looted row, else a random non-Zombies row; up to 5). Claim it by scavenging and rolling that number — you get everything at once (items up to your backpack limit; leftovers stay as a smaller stash).
- [x] **Do found results disappear from loot tables?**
  > Answer: Yes, permanently. Rolling a looted row gives nothing (AP wasted). Zombies (row 1) never depletes.
- [x] **Do stashes decay?**
  > Answer: No.
- [x] **Items dropped by living players:** still destroyed, or become a stash?
  > Answer: They become a stash too (added to your stash on that tile).
- [x] **Permanent depletion + no world reset:** the map only gets emptier. Add restocking, world growth at the edge, or leave it?
  > Answer: Leave it for now — an admin chat command `reset()` generates a fresh world when needed.

### PvP (allowed with a weapon)
- [x] **Where:** only players on your own tile?
  > Answer: Yes, same tile only.
- [x] **When:** as your round's action, or any time during the 30 s?
  > Answer: Your round's action; one hit (plus the weapon's usual ammo/AP and condition cost).
- [x] **How a hit resolves:** A) kills outright · B) 1d6 contest · C) costs the victim max AP (0 = death) *(recommended)*
  > Answer: A hit costs the victim 1d6 max AP; 0 = death.
- [x] **Defender's options:** fight back / flee (flee roll vs what?)
  > Answer: 10 s Fight/Flee prompt (doesn't use their action). Flee: 1d6 vs attacker's 1d6, beat it to escape before the hit lands. Fight back: both roll 1d6, higher lands their hit, tie both hit.
- [x] **Does armor absorb a player's hit** (−1 condition)?
  > Answer: Armor soaks damage point for point, like Safety vs zombies; the rest gets through.
- [x] **Does Safety protect against players**, or only zombies?
  > Answer: Zombies only.
- [x] **Any penalty for killing** (visible "hostile" mark, hope loss…)?
  > Answer: No penalty. The killer gets the victim's stash straight away (no roll); anything they can't carry becomes a stash on the tile.

### Multiplayer fights & sharing
- [x] **Night attack with several players on a tile:** fight together / pool kills?
  > Answer: One shared horde — everyone fights at once and every kill shrinks the shared count.
- [x] **Fleeing:** each player rolls separately and can go to different tiles?
  > Answer: Yes, separately. Rescue: if you make your flee and someone else fails, you may roll again to save them — succeed and you both escape, fail and you both die.
- [ ] **Rescue details** *(placeholders in MULTIPLAYER.md §6)*: same target & 1 AP? 10 s prompt, default don't rescue? rescued player comes with you? armor reroll allowed? zombies only, or PvP flees too?
  > Answer:
- [x] **Giving resources/items** to players on the same tile — free action?
  > Answer: Yes, instant, no accept. If their backpack is full the item becomes your stash on the tile.
- [x] **Vehicle passengers?** (Truck 2–4, Bike 1) Can others use a vehicle you parked?
  > Answer: Truck: driver + up to 3 passengers (each accepts). Bike: solo. Parked vehicles belong to nobody — anyone on the tile can take one.

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
- [x] **Days survived** decided. Add later: zombies killed, tiles scouted, other?
  > Answer: Just days survived. Best run per player, all-time only, unique names (tied to a browser token).
