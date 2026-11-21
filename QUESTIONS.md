# Undead End — Open Questions

Everything still to decide, in one place. Write your answer under each question (or tick it off) and the rules can be built from here.
Current behaviour is noted in *italics* where the game already does something as a placeholder.

---

## Campaign (single player)

A start, middle and end for a run. *Now: endless survival, scored by days survived; nothing escalates; the Note trail (one Note to start, each stash holding the next) is the only thread.* Nothing here is built yet — think it through first.

### Decided
- [x] **The endgame is rescue.**
  > Answer: Yes — a run ends in rescue (or death). Rescue counts as a win; days survived stays the score either way.
- [x] **Two dimensions:** **time passing** (days, nights, things wearing down) and **scale** — the **countryside → town → city** (more to find, more danger, as you go in).
  > Answer: Yes — the arc moves along both.

### The arc (a first sketch)
- **Start (~days 1–2): get your bearings.** The countryside. The starting Note gives a direction; reach the first stronghold. Learn scout / scavenge / sleep / fortify; first night attack with only Safety and hiding. *(Mostly built: needs tuning.)*
- **Middle (~days 3–7): expand and gear up.** Towns. The trail grows longer (a vehicle earns its keep); local tables run dry and the 18 cap stops hoarding, so you move on; Notes wear down each night, so time presses.
- **End (~days 8–10+): rescue.** The city? The trail's last Note names where rescue comes, and you have to *do* something there, not just arrive — e.g. hold out a night, spend fuel on a generator, signal with a Firecracker (ties into Fuel and Bomb & Firecracker, above).

### Open
- [ ] **How do the two dimensions fit together?** Does the scale drive the arc (countryside → town → city as you go), time drive it (days in → harder), or both — and which leads?
  > Answer:
- [ ] **What escalates with time?** e.g. night attacks (more dice, more bad nights), zombies coming back sooner, Notes wearing down faster, longer stretches between Notes.
  > Answer:
- [ ] **What changes with scale?** e.g. town and city tables richer but with more Zombies rows; more zombies on arrival; higher Safety to hole up in.
  > Answer:
- [ ] **What triggers rescue?** The trail's last Note (after N Notes)? A day count ("hold out 10 days")? Finding a working radio and calling it in? Some mix?
  > Answer:
- [ ] **Where is rescue, and what does it ask of you?** e.g. an Army Checkpoint / Stadium / Hospital roof in the city; hold out a night there, power a signal with fuel, fire a flare. A countdown once called?
  > Answer:
- [ ] **How long is a run?** A day is 6 rounds of up to 1 min each — a 30–45 min session is roughly 8–12 days. Target?
  > Answer:
- [x] **Who writes the Notes?** One survivor throughout (you catch up with them at the rescue), or a chain of different people?
  > Answer: A single author. *(Already so within a run: the starting Note's writer is picked from `LEADS.names`, and every Note after carries the same name.)*
- [ ] **The author: the same person every run, or a new one each run?** And do you meet them at the rescue, or only ever find their trail?
  > Answer:
- [ ] **Does the map know the arc?** e.g. a city guaranteed somewhere along the trail, at a set distance from the start — or left to chance?
  > Answer:

---

## Placement: milieus

The direction: **places come in milieus, not alone** — so the map can be read (🌾 means a farm; ⛏️ means mountains near). Standalone tiles are to be replaced, one by one. *Built: farms (Farmhouse + Barn + 2–4 Fields + maybe an Orchard), castles (Mountains, Lake + Fishing Spot, an Orchard, Forest), village edges (Forest, Lake, Orchards, farms), suburbs (Cottages, Corner Shops, Golf Courses round towns and cities), industry (a Quarry by Mountains, a Fuel Depot by Wasteland); Graveyards in settlements.*

### Decided
- [x] **Industrial:** Quarries and Fuel Depots come with Mountain ranges and Wasteland belts — and only there.
  > Answer: Yes.
- [x] **Fields** only ever ring farms (not settlement edges) — so a Field always means a farm.
  > Answer: Yes.
- [x] **Village edges:** natural land (Forest, Lake…), Orchards, or a farm.
  > Answer: Yes.
- [x] **Suburbs** is a milieu, not a tile: **Cottages, Golf Courses and Corner Shops**, wreathing towns and cities, clumped together. (The Cottage keeps its name.)
  > Answer: Yes.
- [x] **Orchards** beside farms, castles and villages.
  > Answer: Yes.
- [x] **Places that go together:** a Church has a Graveyard beside it; a Car Park sits next to the stores.
  > Answer: Yes — and more of these as standalone tiles are replaced.

### Open
- [ ] **How much wreath?** A town of 7 has ~12 hexes round it, a city ~18. A few stretches of suburb, or most of the way round? *Now: ~2–3 stretches of 1–3 hexes round a town, ~4–5 round a city — tune the `edge:` numbers on Cottage, Corner Shop, Golf Course.*
  > Answer:
- [x] **Fixed positions inside settlements** (a Graveyard beside the Church, a Car Park by the stores)?
  > Answer: No — settlements keep their lists of what can be built in them, placed at random. The Graveyard joins the village, town and city lists (and is no longer found alone); the Car Park stays in the city's.
- [ ] **What's left standing alone**, and what milieu each could join: Forest, Lake, Campsite, Fishing Spot (a Lake's?), Diner, Petrol Station, Army Checkpoint (roadside — no roads yet), Farmhouse and Castle (the heads of their own milieus).
  > Answer:

---

## Single player

### Items
- [ ] **Bomb 💣 and Firecracker 🧨:** weapons with their own mechanics — to design (e.g. clear a whole tile at once; throw to draw zombies to another tile).
  > Answer:
- [ ] **Fuel** is used by the cars (Truck, Jeep, Van, Bus…) and the Chainsaw. Anything else use fuel (generator, Molotov, fire…)?
  > Answer:

### Notes 📝
- [ ] **Notes leading to towns and cities** (idea, 2026-11-21). *Now: a Note leads only to a Castle, Army Checkpoint or Church, standing alone ~6 hexes away (`LEADS.places`, `makeLead`).*
  Plan: towns and cities join that list. A Note picks a town or city you haven't found yet whose nearest edge is ~4–8 hexes away, or founds a new one ~6 away (a stronghold instead, if there's no room). Settlements are planned whole when founded, so the town's **edge hex closest to you** can be found and revealed alone — purple-bordered, with the writer's stash — the rest of the town staying hidden. The Note names the town, not the tile: "Gone to Bramford. Follow if you can. — Mara" (the note lines' "the {place}" would carry its own "the": "the Castle" / "Bramford"; the "reaches…" log and toast name the town too).
  > Answer:
- [ ] **When is a town Note done?** On reaching the marked edge hex (as now), or on setting foot anywhere in the town? *Suggested: the marked hex — the stash is there.*
  > Answer:
- [ ] **Can a Note point to a town you've already found?** *Suggested: no — only undiscovered ones, so it always leads somewhere new.*
  > Answer:
- [ ] **How often a town or city, against a stronghold?** *Suggested: evenly from the five (2 in 5 Notes lead to a settlement); cities could be rarer.*
  > Answer:
- [ ] **The off-screen lead arrow's icon for a town:** the edge hex's own place (⛪, 🏪…) or 🏘️?
  > Answer:

---

## Multiplayer (see `MULTIPLAYER.md`)

### Rounds
- [x] **30 s timer runs out:** auto-Sleep, or do nothing?
  > Answer: You lose 1 AP and the round moves on (disconnected players too). *(Changed from auto-Sleep.)*
- [x] **Free actions** (drive, use tool, drop item, talk) allowed any time during the 30 s?
  > Answer: Yes — live, any time during the 30 s, before or after your action.
- [x] **Resolution order within a round** — proposed: start-of-round checks & night attack → Fortify → Scavenge → Scout → Move. OK?
  > Answer: No fixed order. Rounds are real-time: each action resolves the moment it's chosen, so order = who acts first. Co-op by coordinating timing, competition by racing. After 30 s the round ends and anyone undecided loses 1 AP.
- [x] **Fight/Flee decisions inside a round:** how long a timer (e.g. 10 s), and what's the default if you don't choose?
  > Answer: 10 s. Default: Fight if you have a usable weapon, otherwise Flee.
- [x] **Zombies brought onto your tile by another player's action** — does your Fight/Flee use your round's action?
  > Answer: No — a zombie fight is a reaction; you still get your action.
- [x] **30 s run out during a Fight/Flee** (or other 10 s decision)?
  > Answer: The round waits for open decisions to finish before the next round starts.
- [x] **Single player: use the 30 s timer?**
  > Answer: Yes, on by default; the cheat timer(off) turns it off.
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
  > Answer: 60 s grace period; each round missed meanwhile costs 1 AP.
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
- [x] **Any penalty for killing** (visible "hostile" mark, booze loss…)?
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
