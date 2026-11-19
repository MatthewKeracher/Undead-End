// Rules tests for engine.js. Run with:  node --test tests/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Load the browser scripts (locations.js → data.js → engine.js) into one context, as index.html does.
function load() {
  const ctx = { document: { body: { insertAdjacentHTML() {} } }, console };
  vm.createContext(ctx);
  for (const f of ['locations.js', 'data.js', 'engine.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
  }
  return vm.runInContext('({ Engine, CONFIG, ITEMS, TILES, START_TILE })', ctx);
}
const { Engine: E, CONFIG, TILES } = load();
const def = (name) => TILES.find((t) => t.name === name);

// A fresh one-player game with checks off and an empty backpack (so tests start from a clean slate).
function game(opts = {}) {
  const S = E.createGame({ seed: 42, checksOff: true, ...opts });
  E.start(S);
  for (const p of S.players) p.items = [];
  return { S, p: S.players[0] };
}
const act = (S, action) => E.act(S, 0, action);
const decide = (S, choice) => E.act(S, 0, { type: 'decide', choice });
const tile = (S, q, r, name, extra = {}) => (S.tiles[`${q},${r}`] = { def: def(name), safety: 0, zombies: 0, vehicles: [], ...extra });

test('same seed, same game', () => {
  const a = E.createGame({ seed: 7 }), b = E.createGame({ seed: 7 });
  assert.deepEqual(a.players[0].res, b.players[0].res);
  assert.equal(a.rng, b.rng);
});

test('every survivor starts with 4 food, 6 water, 3 hope, and an Axe at condition 3', () => {
  const S = E.createGame({ seed: 3 });
  assert.deepEqual({ ...S.players[0].res }, { food: 4, water: 6, hope: 3, fuel: 0, ammo: 0 });
  assert.deepEqual([...S.players[0].items].map((it) => ({ ...it })), [{ id: 'Axe', cond: 3 }]);
});

test('the first move each round is free; the second costs 1 AP and is your action', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest'); tile(S, 2, 0, 'Lake');
  const ap = p.ap;
  act(S, { type: 'move', q: 1, r: 0 });
  assert.equal(p.ap, ap);
  assert.equal(p.acted, false);
  assert.equal(S.round, 1);
  act(S, { type: 'move', q: 2, r: 0 });
  assert.equal(p.ap, ap - 1);
  assert.equal(S.round, 2);             // that was the round's action
  p.ap = 0;
  assert.ok(!act(S, { type: 'move', q: 1, r: 0 }).error);   // the free move needs no AP
});

test('a mixed row gives both parts: Truck + Fuel, Food + Water', () => {
  const { S, p } = game();
  S.forced = [6, 4, 3, 2];              // Farmhouse 6 = Truck + Fuel: condition 4, fuel 3 + 2
  act(S, { type: 'scavenge' });
  assert.equal(E.tileOf(S, p).vehicles[0].cond, 4);
  assert.equal(p.res.fuel, 5);
  assert.equal(E.cellText(E.tileOf(S, p).def.table[5]), 'Truck + Fuel');
  const t = tile(S, 1, 0, 'YOLO Foods');   // 4 = Food + Water
  act(S, { type: 'move', q: 1, r: 0 });
  const food = p.res.food, water = p.res.water;
  S.forced = [4, 2, 1, 5, 1];           // food 2 + 1, water 5 + 1
  act(S, { type: 'scavenge' });
  assert.deepEqual([p.res.food - food, p.res.water - water], [3, 6]);
  assert.equal(E.tableView(t)[3].kind, 'looted');
});

test('sleep gains 2d6 AP up to max and ends the round', () => {
  const { S, p } = game();
  p.ap = 2; S.forced = [3, 5];
  const { events } = act(S, { type: 'sleep' });
  assert.equal(p.ap, 10);
  assert.deepEqual([...events.find((e) => e.type === 'sleep').dice], [3, 5]);
  assert.equal(S.round, 2);              // single player: round ends once you've acted
  assert.equal(p.acted, false);          // …and you can act again in the new round
  p.ap = 11; S.forced = [6, 6];
  act(S, { type: 'sleep' });
  assert.equal(p.ap, 12);                // capped at max AP
});

test('one round action per round when rounds are timed', () => {
  const { S, p } = game({ autoEnd: false });
  S.forced = [1, 1];
  act(S, { type: 'sleep' });
  assert.equal(p.acted, true);
  assert.match(act(S, { type: 'sleep' }).error, /already acted/);
  act(S, { type: 'tool', tool: 0 });     // free actions still allowed (this one fails validation, not the round rule)
  E.timeUp(S);
  assert.equal(S.round, 2);
});

test('time up: anyone who has not acted loses 1 AP', () => {
  const { S, p } = game({ autoEnd: false, names: ['A', 'B'] });
  const [a, b] = S.players;
  a.ap = 5; b.ap = 5;
  S.forced = [1, 1];
  E.act(S, 0, { type: 'sleep' });       // A sleeps (+2)
  E.timeUp(S);                          // B didn't choose → −1 AP
  assert.equal(a.ap, 7);
  assert.equal(b.ap, 4);
  assert.equal(S.round, 2);
  assert.ok(S.log.some((l) => l.msg.includes("B didn't act in time — loses 1")));
});

test('time up mid-drive: you stop where you are, and lose 1 AP', () => {
  const { S, p } = game({ autoEnd: false });
  tile(S, 1, 0, 'Forest'); tile(S, 2, 0, 'Lake');
  E.tileOf(S, p).vehicles.push({ id: 'Truck', cond: 4 });
  p.res.fuel = 5; p.ap = 3;
  act(S, { type: 'drive', vehicle: 'Truck' });
  decide(S, { q: 1, r: 0 });
  E.timeUp(S);
  assert.equal(p.pending, null);
  assert.deepEqual([p.q, p.r], [1, 0]);
  assert.equal(E.tileOf(S, p).vehicles[0].cond, 3);   // parked here, −1 for the trip
  assert.equal(p.ap, 2);                              // 3 − 1
  assert.equal(S.round, 2);
});

test('time up waits for an open decision, then that player loses 1 AP', () => {
  const { S } = game({ autoEnd: false, names: ['A', 'B'] });
  const [a, b] = S.players;
  E.act(S, 0, { type: 'sleep' });
  b.items.push({ id: 'Handgun', cond: 3 }); b.res.ammo = 5;
  E.cheat(S, 1, 'zombies', [2]);        // B is mid Fight/Flee
  assert.equal(b.pending.kind, 'threat');
  E.timeUp(S);
  assert.equal(S.round, 1);             // round waits
  E.act(S, 1, { type: 'decide', choice: 'shoot' });
  E.act(S, 1, { type: 'decide', choice: 'attack' });
  S.forced = [1, 1];
  E.act(S, 1, { type: 'decide', choice: 'attack' });   // tile clear → B sleeps → round ends
  assert.equal(b.pending, null);
  assert.equal(S.round, 2);
  assert.ok(a.ap > 0);
});

test('scavenge a resource: 2d6 of it', () => {
  const { S, p } = game();
  S.forced = [3, 5, 4];                 // Farmhouse 3 = Food, dice 5 + 4
  const food = p.res.food;
  act(S, { type: 'scavenge' });
  assert.equal(p.res.food, food + 9);
  assert.equal(p.ap, 11);
});

test('scavenge zombies: Safety absorbs, the rest break through → fight', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest');              // somewhere to run, so running out of ammo isn't death
  E.tileOf(S, p).safety = 2;
  p.items.push({ id: 'Handgun', cond: 4 }); p.res.ammo = 2;
  S.forced = [1, 5];                    // 5 zombies vs Safety 2 → 3 through
  act(S, { type: 'scavenge' });
  const t = E.tileOf(S, p);
  assert.equal(t.safety, 0);
  assert.equal(t.zombies, 3);
  assert.equal(p.pending.kind, 'threat');
  decide(S, 'shoot');
  assert.equal(p.pending.kind, 'fight');
  assert.equal(p.items[0].cond, 3);     // −1 condition per fight round
  decide(S, 'attack'); decide(S, 'attack');   // out of ammo → fight round ends
  assert.equal(t.zombies, 1);
  assert.equal(p.pending.kind, 'threat');     // still zombies: Fight or Flee again
});

test('flee: beat the zombies, then pick a safe hex', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest');
  E.cheat(S, 0, 'zombies', [2]);
  S.forced = [5];
  decide(S, 'flee');
  assert.equal(p.pending.kind, 'fleeTo');
  assert.match(decide(S, { q: 3, r: 3 }).error, /safe hex/);    // not next to you
  decide(S, { q: 1, r: 0 });
  assert.deepEqual([p.q, p.r], [1, 0]);
  assert.equal(p.pending, null);
});

test('failed flee with no weapon is death', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest');
  E.cheat(S, 0, 'zombies', [4]);
  S.forced = [2];
  const { events } = decide(S, 'flee');
  assert.equal(p.dead, true);
  assert.ok(S.over);
  assert.ok(events.some((e) => e.type === 'die'));
});

test('armor takes the hit and allows a reroll', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest');
  p.items.push({ id: 'Body Armor', cond: 2 });
  E.cheat(S, 0, 'zombies', [3]);
  S.forced = [1, 6];
  decide(S, 'flee');
  assert.equal(p.pending.kind, 'armor');
  decide(S, true);
  assert.equal(p.items[0].cond, 1);
  assert.equal(p.pending.kind, 'fleeTo');
});

test('Wasteland: nothing to scavenge, can\'t fortify', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Wasteland');
  act(S, { type: 'move', q: 1, r: 0 });
  assert.match(act(S, { type: 'scavenge' }).error, /Nothing left to scavenge/);
  assert.match(act(S, { type: 'fortify' }).error, /can't be fortified/);
});

test('Mountain: impassable on foot and by vehicle', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Mountain');
  assert.match(act(S, { type: 'move', q: 1, r: 0 }).error, /Can't move/);
  E.tileOf(S, p).vehicles.push({ id: 'Truck', cond: 3 }); p.res.fuel = 3;
  act(S, { type: 'drive', vehicle: 'Truck' });
  assert.match(decide(S, { q: 1, r: 0 }).error, /Can't drive/);
  assert.deepEqual([p.q, p.r, p.res.fuel], [0, 0, 3]);
});

// Make every unexplored hex reveal as `name` (for tests that need a particular discovery).
function rigPool(name, fn) {
  const saved = [...TILES];
  TILES.splice(0, TILES.length, def(name));
  try { fn(); } finally { TILES.splice(0, TILES.length, ...saved); }
}

test('moving, driving and fleeing into an unexplored hex reveals it as you arrive', () => {
  const { S, p } = game();
  rigPool('Forest', () => {
    const ap = p.ap;
    const { events } = act(S, { type: 'move', q: 1, r: 0 });
    assert.equal(S.tiles['1,0'].def.name, 'Forest');
    assert.deepEqual([p.q, p.r, p.ap], [1, 0, ap]);                  // the free move
    assert.equal(events.find((e) => e.type === 'reveal').tiles[0].k, '1,0');
    E.tileOf(S, p).vehicles.push({ id: 'Bike', cond: 3 });
    act(S, { type: 'drive', vehicle: 'Bike' });
    decide(S, { q: 2, r: 0 }); decide(S, 'stop');
    assert.deepEqual([p.q, p.r], [2, 0]);
    E.cheat(S, 0, 'zombies', [2]);
    S.forced = [6];
    decide(S, 'flee');
    if (p.pending.kind === 'escape') decide(S, 'foot');   // the Bike is here too: run on foot
    decide(S, { q: 3, r: 0 });
    assert.deepEqual([p.q, p.r], [3, 0]);
  });
});

test('a hidden Mountain blocks the way: revealed, nothing spent', () => {
  const { S, p } = game();
  rigPool('Mountain', () => {
    const ap = p.ap;
    assert.ok(!act(S, { type: 'move', q: 1, r: 0 }).error);
    assert.equal(S.tiles['1,0'].def.name, 'Mountain');
    assert.deepEqual([p.q, p.r, p.ap, p.freeMoved], [0, 0, ap, false]);
    // fleeing: blocked, so pick another way — and if there's none left, you're caught
    for (const [q, r] of E.neighbors(0, 0)) if (!S.tiles[`${q},${r}`]) S.tiles[`${q},${r}`] = { def: def('Mountain'), safety: 0, zombies: 0, vehicles: [], looted: [], stashes: [] };
    delete S.tiles['0,1'];
    E.cheat(S, 0, 'zombies', [2]);
    S.forced = [6];
    decide(S, 'flee');
    decide(S, { q: 0, r: 1 });          // the last way out is a Mountain too
    assert.equal(p.dead, true);         // caught, and no weapon
  });
});

test('scout reveals every unexplored hex next to you', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest');              // already explored: stays as it is
  const ap = p.ap;
  const { events } = act(S, { type: 'scout' });
  assert.equal(Object.keys(S.tiles).length, 7);
  assert.equal(S.tiles['1,0'].def.name, 'Forest');
  assert.equal(events.find((e) => e.type === 'scout').tiles.length, 5);
  assert.equal(p.ap, ap - 1);
  assert.match(act(S, { type: 'scout' }).error, /already explored/);
});

test('backpack full: choose what to destroy', () => {
  const { S, p } = game();
  for (let i = 0; i < 6; i++) p.items.push({ id: 'Toolkit', cond: 1 });
  E.cheat(S, 0, 'item', ['axe', 4]);
  assert.equal(p.pending.kind, 'backpack');
  decide(S, 0);
  assert.equal(p.items.length, 6);
  assert.equal(p.items[5].id, 'Axe');
});

test('driving is free movement: fuel per tile, −1 condition per trip, round not used', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest'); tile(S, 2, 0, 'Lake');
  E.tileOf(S, p).vehicles.push({ id: 'Truck', cond: 3 });
  p.res.fuel = 5;
  act(S, { type: 'drive', vehicle: 'Truck' });
  decide(S, { q: 1, r: 0 }); decide(S, { q: 2, r: 0 }); decide(S, 'stop');
  assert.deepEqual([p.q, p.r], [2, 0]);
  assert.equal(p.res.fuel, 3);
  assert.equal(E.tileOf(S, p).vehicles[0].cond, 2);
  assert.equal(p.acted, false);
  assert.equal(S.round, 1);
});

test('a vehicle at 0 condition stays parked, broken, until a Toolkit fixes it', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest');
  E.tileOf(S, p).vehicles.push({ id: 'Bike', cond: 1 });
  act(S, { type: 'drive', vehicle: 'Bike' });
  decide(S, { q: 1, r: 0 }); decide(S, 'stop');
  const here = E.tileOf(S, p);
  assert.equal(here.vehicles.length, 1);
  assert.equal(here.vehicles[0].cond, 0);
  assert.ok(act(S, { type: 'drive', vehicle: 'Bike' }).error);     // broken: won't go
  p.items.push({ id: 'Toolkit', cond: 3 });
  act(S, { type: 'tool', tool: 0, target: { from: 'tile', index: 0 }, amount: 2 });
  assert.equal(here.vehicles[0].cond, 2);
  assert.ok(!act(S, { type: 'drive', vehicle: 'Bike' }).error);    // fixed
});

test('night attack: Safety holds, or zombies break through', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest');              // somewhere to run
  S.round = 4;
  E.tileOf(S, p).safety = 6;
  S.forced = [1, 1, 3];                 // sleep 1+1, then 3 zombies at night (round 5)
  act(S, { type: 'sleep' });
  assert.equal(S.round, 5);
  assert.equal(E.tileOf(S, p).safety, 3);
  assert.equal(p.pending, null);
  S.badNight = false;                   // (a good night)
  S.forced = [1, 1];                    // round 6 is night, but there's no attack
  act(S, { type: 'sleep' });
  assert.equal(S.round, 6);
  assert.equal(E.tileOf(S, p).safety, 3);
  E.tileOf(S, p).safety = 2;
  S.round = 4;
  S.forced = [1, 1, 6];                 // next round 5: 6 zombies vs Safety 2
  act(S, { type: 'sleep' });
  assert.equal(E.tileOf(S, p).zombies, 4);
  assert.equal(p.pending.kind, 'threat');
});

test('a bad night: round 6 attacks too (after round 5), so two attacks back to back', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest');
  E.tileOf(S, p).safety = 6;
  S.badNight = true;
  assert.equal(E.attackDue(S, 6), true);
  S.round = 4;
  S.forced = [1, 1, 2];                 // round 5: 2 zombies, absorbed
  act(S, { type: 'sleep' });
  S.forced = [1, 1, 3];                 // round 6 on a bad night: 3 more
  act(S, { type: 'sleep' });
  assert.equal(E.tileOf(S, p).safety, 1);
  assert.equal(S.log.filter((l) => l.msg.includes('in the night')).length, 2);
});

test('the bad-night roll happens secretly as round 1 starts: roughly 1 in 3', () => {
  let bad = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const S = E.createGame({ seed, checksOff: true });
    E.start(S);                         // the game starts at round 1
    if (S.badNight) bad++;
    assert.ok(!S.log.some((l) => l.dice && l.msg.includes('bad night')));   // no dice shown for it
  }
  assert.ok(bad > 150 && bad < 250, `${bad} bad nights in 600`);
});

test('max AP: water ±2, food ±1', () => {
  const { S, p } = game({ checksOff: false });
  p.maxAP = 6; p.ap = 6; p.res.water = 0; p.res.food = 5;
  S.round = 2;                          // round 3: water check — missed
  S.forced = [1, 1]; act(S, { type: 'sleep' });
  assert.equal(p.maxAP, 4);
  p.res.water = 5;
  S.round = 6;                          // round 1: water check — paid
  S.badNight = false;
  S.forced = [1, 1]; act(S, { type: 'sleep' });
  assert.equal(p.maxAP, 6);
  S.forced = [1, 1]; act(S, { type: 'sleep' });   // round 2: food check — paid
  assert.equal(p.maxAP, 7);
  p.res.food = 0;
  S.round = 3;                          // round 4: food check — missed
  S.forced = [1, 1]; act(S, { type: 'sleep' });
  assert.equal(p.maxAP, 6);
});

test('Safety tops out at 5; a tile still holds up to 6 zombies', () => {
  const { S, p } = game();
  const t = E.tileOf(S, p);
  t.safety = 3;
  S.forced = [6];
  act(S, { type: 'fortify' });
  assert.equal(t.safety, 5);
  assert.match(act(S, { type: 'fortify' }).error, /full \(5\)/);
  E.cheat(S, 0, 'zombies', [9]);
  assert.equal(t.zombies, 6);
});

test('each place has its own max Safety: outdoors 0, up to 8 for a stronghold', () => {
  const { S, p } = game();
  assert.equal(E.maxSafetyOf(tile(S, 1, 0, 'Lake')), 0);
  assert.equal(E.canFortifyHere(S.tiles['1,0']), false);
  const police = tile(S, 0, 1, 'Police Station');
  assert.equal(E.maxSafetyOf(police), 8);
  act(S, { type: 'move', q: 0, r: 1 });
  S.forced = [6]; act(S, { type: 'fortify' });
  p.acted = false;
  S.forced = [6]; act(S, { type: 'fortify' });
  assert.equal(police.safety, 8);
  assert.equal(E.maxSafetyOf(tile(S, 2, 0, 'Pharmacy')), 3);
});

test('missing water costs max AP; max AP 0 is death', () => {
  const { S, p } = game({ checksOff: false });
  p.res.water = 0; p.maxAP = 2; p.ap = 2;
  S.round = 2;                          // round 3 checks water
  S.forced = [1, 1];
  const { events } = act(S, { type: 'sleep' });
  assert.ok(events.some((e) => e.type === 'maxApLoss' && e.newMax === 0));
  assert.equal(p.dead, true);
});

test('state survives a JSON round trip and plays on identically', () => {
  const { S } = game();
  tile(S, 1, 0, 'Forest');
  act(S, { type: 'scavenge' });
  const copy = JSON.parse(JSON.stringify(S));
  const a = act(S, { type: 'scout' }), b = E.act(copy, 0, { type: 'scout' });
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(JSON.parse(JSON.stringify(S)), JSON.parse(JSON.stringify(copy)));
});

// ---------------------------------------------------------------- depletion & stashes
test('found results are crossed off; landing on one rolls again until it finds something', () => {
  const { S, p } = game();
  S.forced = [2, 3, 3];                 // Farmhouse 2 = Food
  act(S, { type: 'scavenge' });
  assert.deepEqual([...E.tileOf(S, p).looted], [2]);
  const food = p.res.food;
  S.forced = [2, 2, 3, 4, 4];           // 2 (looted), 2 (looted), then 3 = Food: 4 + 4
  const { events } = act(S, { type: 'scavenge' });
  const ev = events.find((e) => e.type === 'scavenge');
  assert.deepEqual([...ev.tries], [2, 2, 3]);
  assert.equal(p.res.food, food + 8);
  assert.ok(S.log.some((l) => l.msg.includes('2 (looted), 2 (looted), then 3')));
});

test('1 roll + 2 rerolls: then you find nothing (AP still spent)', () => {
  const { S, p } = game();
  const t = E.tileOf(S, p);
  t.looted = [2, 3, 4, 5];              // only Zombies and Truck + Fuel left
  const ap = p.ap, food = p.res.food;
  S.forced = [2, 3, 4];                 // three tries, all looted
  const { events } = act(S, { type: 'scavenge' });
  const ev = events.find((e) => e.type === 'scavenge');
  assert.deepEqual([...ev.tries], [2, 3, 4]);
  assert.equal(ev.hit.kind, 'looted');
  assert.equal(p.ap, ap - 1);
  assert.equal(p.res.food, food);
  assert.ok(S.log.some((l) => l.msg.includes('finds nothing')));
});

test('a tile with every row crossed off (zombies cleared too) can\'t be scavenged', () => {
  const { S, p } = game();
  const t = E.tileOf(S, p);
  t.looted = [1, 2, 3, 4, 5, 6];
  assert.equal(E.canScavengeHere(t), false);
  assert.match(act(S, { type: 'scavenge' }).error, /Nothing left/);
});

test('an Endless row is never crossed off', () => {
  const { S, p } = game();
  const t = tile(S, 1, 0, 'Lake');      // Lake 2 = Endless Water
  act(S, { type: 'move', q: 1, r: 0 });
  assert.equal(t.def.table[1].endless, true);
  const water = p.res.water;
  S.forced = [2, 3, 1]; act(S, { type: 'scavenge' });
  S.forced = [2, 4, 2]; act(S, { type: 'scavenge' });
  assert.equal(p.res.water, water + 10);
  assert.equal(E.tableView(t)[1].kind, 'res');
  assert.equal(E.cellText(t.def.table[1]), 'Water ∞');
});

test('zombies are crossed off once they come, and drift back when nobody is there and there is no Safety', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest');
  const home = E.tileOf(S, p);
  home.safety = 6;
  S.forced = [1, 2];                    // 2 zombies, absorbed by Safety
  act(S, { type: 'scavenge' });
  assert.equal(E.tableView(home)[0].kind, 'looted');
  S.forced = [1, 4, 2, 2];
  act(S, { type: 'scavenge' });         // the cleared row is rolled again: 4 = Water
  assert.equal(home.zombies, 0);
  // still here, or still has Safety: they stay away
  act(S, { type: 'move', q: 1, r: 0 });
  assert.equal(E.tableView(home)[0].kind, 'looted');   // Safety 4 left
  home.safety = 0;
  act(S, { type: 'sleep' });            // next round starts: no Safety, nobody there
  assert.equal(E.tableView(home)[0].kind, 'zombies');
});

test('dropping an item leaves it in your stash, on a looted row if there is one', () => {
  const { S, p } = game();
  const t = E.tileOf(S, p);
  t.looted = [4];
  p.items.push({ id: 'Axe', cond: 3 }, { id: 'Toolkit', cond: 2 });
  act(S, { type: 'drop', item: 0 });
  act(S, { type: 'drop', item: 0 });
  assert.equal(p.items.length, 0);
  assert.equal(t.stashes.length, 1);    // one stash per owner per tile — it grows
  assert.equal(t.stashes[0].row, 4);
  assert.equal(t.stashes[0].owner, 'Survivor');
  assert.equal(E.tableView(t)[3].kind, 'stash');
});

test('rolling a stash takes everything; once empty, the row underneath shows again', () => {
  const { S, p } = game();
  const t = E.tileOf(S, p);
  t.looted = [5];
  t.stashes = [{ owner: 'Ana', row: 5, res: { food: 4, ammo: 2 }, items: [{ id: 'Handgun', cond: 3 }] }];
  const food = p.res.food;
  S.forced = [5];
  const { events } = act(S, { type: 'scavenge' });
  assert.equal(events.find((e) => e.type === 'scavenge').hit.kind, 'stash');
  assert.equal(p.res.food, food + 4);
  assert.equal(p.res.ammo, 2);
  assert.equal(p.items[0].id, 'Handgun');
  assert.equal(t.stashes.length, 0);
  assert.equal(E.tableView(t)[4].kind, 'looted');
});

test('stash with more items than your backpack holds: choose what to take', () => {
  const { S, p } = game();
  const t = E.tileOf(S, p);
  for (let i = 0; i < 5; i++) p.items.push({ id: 'Toolkit', cond: 1 });
  t.stashes = [{ owner: 'Ana', row: 3, res: {}, items: [{ id: 'Axe', cond: 2 }, { id: 'Handgun', cond: 5 }] }];
  S.forced = [3];
  act(S, { type: 'scavenge' });
  assert.equal(p.pending.kind, 'stash');
  assert.match(decide(S, [0, 1]).error, /up to 1/);
  decide(S, [1]);
  assert.equal(p.items.at(-1).id, 'Handgun');
  assert.equal(t.stashes[0].items.length, 1);   // the Axe stays
  assert.equal(t.stashes[0].items[0].id, 'Axe');
});

test('death leaves everything in a stash on the tile', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest');
  p.items.push({ id: 'Toolkit', cond: 2 });
  p.res.ammo = 3;
  E.cheat(S, 0, 'zombies', [4]);
  S.forced = [2];
  decide(S, 'flee');
  assert.equal(p.dead, true);
  const s = E.tileOf(S, p).stashes[0];
  assert.equal(s.owner, 'Survivor');
  assert.equal(s.res.ammo, 3);
  assert.equal(s.items[0].id, 'Toolkit');
  assert.equal(p.items.length, 0);
});

test('a stash on a Wasteland can be scavenged for; other rolls find nothing', () => {
  const { S, p } = game();
  const t = tile(S, 1, 0, 'Wasteland');
  act(S, { type: 'move', q: 1, r: 0 });
  assert.equal(E.canScavengeHere(t), false);
  p.items.push({ id: 'Axe', cond: 3 });
  act(S, { type: 'drop', item: 0 });
  assert.equal(E.canScavengeHere(t), true);
  const row = t.stashes[0].row, other = [2, 3, 4, 5, 6].find((x) => x !== row);
  S.forced = [other, row];              // an empty row is rolled again — and lands on the stash
  const { events } = act(S, { type: 'scavenge' });
  assert.deepEqual([...events.find((e) => e.type === 'scavenge').tries], [other, row]);
  assert.equal(p.items[0].id, 'Axe');
  assert.equal(E.canScavengeHere(t), false);
});

test('a tile holds 5 stashes at most; then things join the oldest', () => {
  const { S, p } = game();
  const t = E.tileOf(S, p);
  t.stashes = ['A', 'B', 'C', 'D', 'E'].map((owner, i) => ({ owner, row: i + 2, res: {}, items: [{ id: 'Toolkit', cond: 1 }] }));
  p.items.push({ id: 'Axe', cond: 3 });
  act(S, { type: 'drop', item: 0 });
  assert.equal(t.stashes.length, 5);
  assert.equal(t.stashes[0].items.at(-1).id, 'Axe');
});
