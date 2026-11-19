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
  return vm.runInContext('({ Engine, CONFIG, ITEMS, TILES })', ctx);
}
const { Engine: E, CONFIG, TILES, ITEMS } = load();
const def = (name) => TILES.find((t) => t.name === name);

// A fresh one-player game with checks off and an empty backpack (so tests start from a clean slate) — on a
// Farmhouse with nothing planned around it, so tests know where they stand (real games start anywhere).
function game(opts = {}) {
  const S = E.createGame({ seed: 42, checksOff: true, ...opts });
  if (!opts.anywhere) {
    Object.assign(S, { planned: {}, towns: [], townOf: {} });
    S.tiles['0,0'] = { def: def('Farmhouse'), safety: 0, zombies: 0, vehicles: [], looted: [], stashes: [], drawn: { 3: { res: 'water', n: 2 } } };
  }
  E.start(S);
  for (const p of S.players) p.items = [];
  return { S, p: S.players[0] };
}
const act = (S, action) => E.act(S, 0, action);
const decide = (S, choice) => E.act(S, 0, { type: 'decide', choice });
const tile = (S, q, r, name, extra = {}) => (S.tiles[`${q},${r}`] = { def: def(name), safety: 0, zombies: 0, vehicles: [], ...extra });

test('you start somewhere random — anywhere but Wasteland or Mountain, sometimes in a settlement', () => {
  const where = new Set();
  let inTown = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const S = E.createGame({ seed });
    const t = S.tiles['0,0'];
    assert.ok(t.def.passable && !t.def.spread, t.def.name);
    where.add(t.def.name);
    if (t.town !== undefined) inTown++;
  }
  assert.ok(where.size > 15, [...where].join(', '));
  assert.ok(inTown > 10, `${inTown} of 200 start in a settlement`);
});

test('same seed, same game', () => {
  const a = E.createGame({ seed: 7 }), b = E.createGame({ seed: 7 });
  assert.deepEqual(a.players[0].res, b.players[0].res);
  assert.equal(a.rng, b.rng);
});

test('every survivor starts with 8 of 12 AP, 4 food, 6 water, 3 booze, and an empty backpack', () => {
  const S = E.createGame({ seed: 3 });
  assert.equal(S.players[0].ap, 8);
  assert.equal(S.players[0].maxAP, 12);
  assert.deepEqual({ ...S.players[0].res }, { food: 4, water: 6, booze: 3, fuel: 0, ammo: 0 });
  assert.equal(S.players[0].items.length, 0);
});

test('the first move each round is free (but needs 1 AP); the second costs 1 AP and is your action', () => {
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
  assert.match(act(S, { type: 'move', q: 1, r: 0 }).error, /No AP/);   // at 0 AP the free move is off too: sleep
  assert.equal(p.q, 2);
  p.ap = 1;
  assert.ok(!act(S, { type: 'move', q: 1, r: 0 }).error);   // 1 AP is enough, and the free move spends none
  assert.equal(p.ap, 1);
});

test('each survivor remembers the tiles they have stood on', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest'); tile(S, 2, 0, 'Lake');
  assert.deepEqual([...p.visited], ['0,0']);
  act(S, { type: 'move', q: 1, r: 0 });
  act(S, { type: 'move', q: 0, r: 0 });
  assert.deepEqual([...p.visited], ['0,0', '1,0']);       // not the Lake: never been there
});

test('a resource find is never just 1 (2–6, evenly); item condition can still be 1', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const { S, p } = game({ seed });
    S.forced = [2];                     // Farmhouse 2 = Food; its amount is rolled for real
    const food = p.res.food;
    act(S, { type: 'scavenge' });
    seen.add(p.res.food - food);
  }
  assert.deepEqual([...seen].sort(), [2, 3, 4, 5, 6]);
  const { S, p } = game();
  S.forced = [5, 1];                    // Farmhouse 5 = Axe, condition 1
  act(S, { type: 'scavenge' });
  assert.equal(p.items[0].cond, 1);
});

test('a mixed row gives both parts: Tractor + Fuel, Food + Water', () => {
  const { S, p } = game();
  S.forced = [6, 4, 3];                 // Farmhouse 6 = Tractor + Fuel: condition 4, fuel 3
  act(S, { type: 'scavenge' });
  assert.deepEqual({ ...E.tileOf(S, p).vehicles[0] }, { id: 'Tractor', cond: 4 });
  assert.equal(p.res.fuel, 3);
  assert.equal(E.cellText(E.tileOf(S, p).def.table[5]), 'Tractor + Fuel');
  const t = tile(S, 1, 0, 'YOLO Foods');   // 4 = Food + Water
  act(S, { type: 'move', q: 1, r: 0 });
  const food = p.res.food, water = p.res.water;
  S.forced = [4, 2, 5];                 // food 2, water 5
  act(S, { type: 'scavenge' });
  assert.deepEqual([p.res.food - food, p.res.water - water], [2, 5]);
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
  b.items.push({ id: 'Pistol', cond: 3 }); b.res.ammo = 5;
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

test('scavenge a resource: 1d6 of it; a Double is 1d6 × 2', () => {
  const { S, p } = game();
  S.forced = [2, 5];                    // Farmhouse 2 = Food, die 5
  const food = p.res.food;
  act(S, { type: 'scavenge' });
  assert.equal(p.res.food, food + 5);
  assert.equal(p.ap, CONFIG.startAP - 1);
  tile(S, 1, 0, 'Forest');              // 4 = Double Food
  act(S, { type: 'move', q: 1, r: 0 });
  S.forced = [4, 4];
  act(S, { type: 'scavenge' });
  assert.equal(p.res.food, food + 5 + 8);
});

test('row 3 is Random everywhere: drawn as the tile is placed — anything from any table, zombies included', () => {
  for (const t of TILES.filter((x) => x.table.length)) assert.ok(t.table[2].random, `${t.name} row 3`);
  const got = new Set();
  let zombies = 0, n = 0;
  for (let seed = 1; seed <= 15; seed++) {
    const S = explore(seed, 4);
    for (const t of Object.values(S.tiles)) {
      if (!t.def.table.length) continue;
      const e = t.drawn?.[3];   // (a stash may cover the row — the result is still there underneath)
      assert.ok(e && !e.random && !e.endless, `${t.def.name} row 3: ${JSON.stringify(e)}`);
      n++; if (e.zombies) zombies++;
      got.add(E.cellText(e));
    }
  }
  assert.ok(zombies / n > 0.1 && zombies / n < 0.4, `zombies on ${zombies} of ${n}`);
  assert.ok([...got].some((x) => x.startsWith('Double')) && [...got].some((x) => x.includes(' + ')), [...got].join(', '));
  // and it's an ordinary row: scavenging a 3 finds what it shows, then it's crossed off
  const { S, p } = game({ seed: 5, anywhere: true });
  const shown = E.tableView(E.tileOf(S, p))[2].e;
  S.forced = [3];
  const ev = act(S, { type: 'scavenge' }).events.find((x) => x.type === 'scavenge');
  assert.deepEqual(ev.hit.e, shown);
  assert.ok(E.tileOf(S, p).looted.includes(3));
  assert.equal(JSON.parse(JSON.stringify(S)).tiles['0,0'].drawn[3].zombies, shown.zombies);   // saved with the tile
});

test('scavenge zombies: Safety absorbs, the rest break through → fight', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest');              // somewhere to run, so running out of ammo isn't death
  E.tileOf(S, p).safety = 2;
  p.items.push({ id: 'Pistol', cond: 4 }); p.res.ammo = 2;
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

test('terrain comes in shapes: Wasteland belts of 3 or 7, Mountains in ranges', () => {
  const sizes = [], R = 5;
  let mountains = 0, linked = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const { S, p } = game({ seed });
    for (let ring = 0; ring < R; ring++) for (const k of Object.keys(S.tiles)) {   // explore outward, scouting everywhere
      const [q, r] = k.split(',').map(Number);
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) !== ring) continue;
      Object.assign(p, { q, r, ap: 12, acted: false, pending: null, queue: [] });
      act(S, { type: 'scout' });
    }
    const name = (a, b) => S.tiles[`${a},${b}`]?.def.name, seen = new Set();
    for (const [k, t] of Object.entries(S.tiles)) {
      const [q, r] = k.split(',').map(Number);
      if (t.def.name === 'Mountain' && E.neighbors(q, r).every(([a, b]) => name(a, b))) {
        mountains++; if (E.neighbors(q, r).some(([a, b]) => name(a, b) === 'Mountain')) linked++;
      }
      if (t.def.name !== 'Wasteland' || seen.has(k)) continue;
      const group = [k], todo = [k]; let whole = true; seen.add(k);   // the belt, if it's fully explored
      while (todo.length) {
        const [a, b] = todo.pop().split(',').map(Number);
        for (const [c, d] of E.neighbors(a, b)) {
          if (!name(c, d)) whole = false;
          else if (name(c, d) === 'Wasteland' && !seen.has(`${c},${d}`)) { seen.add(`${c},${d}`); group.push(`${c},${d}`); todo.push(`${c},${d}`); }
        }
      }
      if (whole) sizes.push(group.length);
    }
  }
  assert.ok(sizes.length > 20);
  assert.ok(sizes.filter((n) => n === 3 || n === 7).length / sizes.length > 0.9, `belt sizes: ${sizes}`);
  assert.ok(linked / mountains > 0.7, `${linked} of ${mountains} mountains touch another`);
});

// Explore a game out to radius R (scouting from every hex in turn), returning its state.
function explore(seed, R) {
  const { S, p } = game({ seed, anywhere: true, autoEnd: false });   // no rounds pass (no nights to die in)
  for (let ring = 0; ring < R; ring++) for (const k of Object.keys(S.tiles)) {
    const [q, r] = k.split(',').map(Number);
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) !== ring) continue;
    Object.assign(p, { q, r, ap: 12, acted: false, pending: null, queue: [] });
    act(S, { type: 'scout' });
  }
  return S;
}

test('settlements: villages of 3, towns of 7, cities of 12 — each hex a different place built there', () => {
  const sizes = { village: [], town: [], city: [] };
  for (let seed = 1; seed <= 40; seed++) {
    const S = explore(seed, 7);
    S.towns.forEach((town, id) => {
      const keys = Object.keys(S.townOf).filter((k) => S.townOf[k] === id);
      const found = keys.map((k) => S.tiles[k]).filter(Boolean);
      for (const t of found) {
        assert.ok(t.def.in.includes(town.kind), `${t.def.name} in a ${town.kind}`);
        assert.equal(t.town, id);
      }
      const names = keys.map((k) => S.tiles[k]?.def.name ?? S.planned[k]);
      assert.equal(new Set(names).size, names.length, `no repeats in ${town.name}: ${names}`);
      sizes[town.kind].push(keys.length);
      // countryside between settlements: no hex of another one within CONFIG.townGap
      for (const k of keys) for (const [k2, id2] of Object.entries(S.townOf)) {
        if (id2 === id) continue;
        const [a, b] = k.split(',').map(Number), [c, d] = k2.split(',').map(Number);
        assert.ok((Math.abs(a - c) + Math.abs(b - d) + Math.abs(a + b - c - d)) / 2 > CONFIG.townGap, `${town.name} too close to ${S.towns[id2].name}`);
      }
    });
  }
  for (const [kind, list] of Object.entries(sizes)) {
    assert.ok(list.length > 3, `${kind}s found: ${list.length}`);
    const full = list.filter((n) => n === CONFIG.settlements[kind].size).length;
    assert.ok(full / list.length > 0.7, `${kind} sizes: ${list}`);   // hemmed in by the map now and then: smaller
  }
});

test('settlement places are never found alone; guns: Gun Shop and Sheriff in towns, Police Station in cities', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const S = explore(seed, 6);
    for (const t of Object.values(S.tiles)) {
      if (t.town === undefined) assert.ok(t.def.count > 0 || Object.keys(t.def.edge).length, `${t.def.name} alone in the country`);
      else {
        const kind = S.towns[t.town].kind;
        if (['Gun Shop', "Sheriff's Office"].includes(t.def.name)) assert.equal(kind, 'town');
        if (t.def.name === 'Police Station') assert.equal(kind, 'city');
      }
    }
  }
});

test('Fields edge villages and towns, Golf Courses edge towns and cities — and are found nowhere else', () => {
  const seen = { Fields: 0, 'Golf Course': 0 };
  for (let seed = 1; seed <= 30; seed++) {
    const S = explore(seed, 7);
    for (const [k, t] of Object.entries(S.tiles)) {
      if (!seen.hasOwnProperty(t.def.name)) continue;
      seen[t.def.name]++;
      const [q, r] = k.split(',').map(Number);
      const kinds = E.neighbors(q, r).map(([a, b]) => S.towns[S.townOf[`${a},${b}`]]?.kind).filter(Boolean);
      const want = t.def.name === 'Fields' ? ['village', 'town'] : ['town', 'city'];
      // on the edge of the right kind of settlement — or carrying on along it from a hex that is
      const onEdge = kinds.some((x) => want.includes(x)) || E.neighbors(q, r).some(([a, b]) => {
        const n = S.tiles[`${a},${b}`]?.def.name ?? S.planned[`${a},${b}`];
        return n === t.def.name && E.neighbors(a, b).some(([c, d]) => want.includes(S.towns[S.townOf[`${c},${d}`]]?.kind));
      });
      assert.ok(onEdge, `${t.def.name} at ${k} isn't on the edge of a ${want.join(' or ')}`);
    }
  }
  assert.ok(seen.Fields > seen['Golf Course'] && seen['Golf Course'] > 0, JSON.stringify(seen));
});

test('weapon looks: melee ones cost AP, the Bow fires ammo like the Pistol', () => {
  for (const id of ['Axe', 'Sword', 'Kitchen Knife', 'Frying Pan', 'Cricket Bat', 'Hockey Stick', 'Pickaxe', 'Wrench']) assert.equal(ITEMS[id].uses, 'ap', id);
  for (const id of ['Pistol', 'Bow']) assert.equal(ITEMS[id].uses, 'ammo', id);
  const { S, p } = game();
  p.items.push({ id: 'Frying Pan', cond: 2 });
  tile(S, 1, 0, 'Forest');
  S.forced = [1, 2];
  act(S, { type: 'scavenge' });
  decide(S, 'melee');
  decide(S, 'attack'); decide(S, 'attack');
  assert.equal(E.tileOf(S, p).zombies, 0);
});

test('chainsaw: each rev burns 1 fuel and kills up to 3 zombies; −1 condition per fight round', () => {
  const { S, p } = game();
  p.items.push({ id: 'Chainsaw', cond: 3 });
  p.res.fuel = 5;
  tile(S, 1, 0, 'Forest');
  S.forced = [1, 5];           // scavenge: 5 zombies, no Safety → all 5 through
  act(S, { type: 'scavenge' });
  assert.equal(p.pending.kind, 'threat');
  assert.ok(E.canSaw(p));
  decide(S, 'saw');
  assert.equal(p.items[0].cond, 2);
  decide(S, 'attack');
  assert.equal(E.tileOf(S, p).zombies, 2);
  assert.equal(p.res.fuel, 4);
  decide(S, 'attack');   // only 2 left: the rev takes both
  assert.equal(E.tileOf(S, p).zombies, 0);
  assert.equal(p.res.fuel, 3);
  assert.equal(p.pending, null);
});

// Make every unexplored hex reveal as `name` (for tests that need a particular discovery).
function rigPool(name, fn) {
  const saved = [...TILES], counts = Object.values(CONFIG.settlements).map((s) => s.count);
  TILES.splice(0, TILES.length, def(name));
  Object.values(CONFIG.settlements).forEach((s) => { s.count = 0; });   // no new villages, towns or cities either
  try { fn(); } finally {
    TILES.splice(0, TILES.length, ...saved);
    Object.values(CONFIG.settlements).forEach((s, i) => { s.count = counts[i]; });
  }
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
  for (let i = 0; i < 6; i++) p.items.push({ id: 'Tool', cond: 1 });
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

test('pills: a free dose tops AP up to max AP (max AP unchanged), −1 condition; gone at 0', () => {
  const { S, p } = game();
  p.items.push({ id: 'Pills', cond: 2 });
  p.ap = 1; p.maxAP = 7;
  assert.ok(!act(S, { type: 'pills', item: 0 }).error);
  assert.deepEqual([p.ap, p.maxAP, p.items[0].cond, p.acted], [7, 7, 1, false]);   // free: not your action
  assert.match(act(S, { type: 'pills', item: 0 }).error, /already full/);        // no wasting a dose
  p.ap = 0;
  act(S, { type: 'pills', item: 0 });
  assert.equal(p.ap, 7);
  assert.equal(p.items.length, 0);      // last dose: gone
});

test('a Map (disabled in the tables for now) is read at once: every unexplored hex next to an explored one is revealed', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest');
  const before = Object.keys(S.tiles).length;   // the Farmhouse and the Forest, side by side
  const { events } = E.cheat(S, 0, 'item', ['map']);
  assert.equal(Object.keys(S.tiles).length - before, 8);   // the ring around the pair
  assert.ok(events.some((e) => e.type === 'scout' && e.map && e.tiles.length === 8));
  assert.ok(!p.items.some((it) => it.id === 'Map'));       // never carried
  assert.ok(!TILES.some((t) => t.table.some((e) => e.item === 'Map' || e.parts?.some((x) => x.item === 'Map'))));
});

test('binoculars: a scout reveals every unexplored hex within 2, −1 condition; gone at 0', () => {
  const { S, p } = game();
  p.items.push({ id: 'Binoculars', cond: 1 });
  rigPool('Forest', () => act(S, { type: 'scout' }));
  assert.equal(Object.keys(S.tiles).length, 1 + 6 + 12);   // two rings around you
  assert.equal(p.items.length, 0);                          // last use: gone
  assert.ok(S.tiles['2,0'] && S.tiles['0,-2'] && !S.tiles['3,0']);   // 2 away: seen; 3 away: not
  assert.equal(E.scoutTargets(S, p).length, 0);             // without them, only next to you: all explored
});

test("binoculars can't see past a Mountain", () => {
  const { S, p } = game();
  p.items.push({ id: 'Binoculars', cond: 6 });
  tile(S, 1, 0, 'Mountain');
  rigPool('Forest', () => act(S, { type: 'scout' }));
  assert.ok(!S.tiles['2,0']);           // only seen through the Mountain: hidden
  assert.ok(S.tiles['2,-1'] && S.tiles['1,1']);   // also next to an open hex: seen
  assert.equal(Object.keys(S.tiles).length, 1 + 6 + 11);
});

test('every vehicle is a Truck or a Bike underneath: fuel ones drive on fuel, pedal ones on AP', () => {
  const fuel = ['Truck', 'Tractor', 'Ambulance', 'Police Car', 'Jeep', 'Van', 'Bus', 'Campervan', 'Fire Engine'];
  for (const id of fuel) assert.equal(ITEMS[id].uses, 'fuel', id);
  assert.equal(ITEMS.Bike.uses, 'ap');
  const { S, p } = game();
  tile(S, 1, 0, 'Forest');
  E.tileOf(S, p).vehicles.push({ id: 'Ambulance', cond: 3 });
  p.res.fuel = 2;
  act(S, { type: 'drive', vehicle: 'Ambulance' });
  act(S, { type: 'decide', choice: { q: 1, r: 0 } });
  assert.equal(p.res.fuel, 1);
  assert.deepEqual([p.q, p.r], [1, 0]);
});

test('a vehicle at 0 condition stays parked, broken, until a Tool fixes it', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest');
  E.tileOf(S, p).vehicles.push({ id: 'Bike', cond: 1 });
  act(S, { type: 'drive', vehicle: 'Bike' });
  decide(S, { q: 1, r: 0 }); decide(S, 'stop');
  const here = E.tileOf(S, p);
  assert.equal(here.vehicles.length, 1);
  assert.equal(here.vehicles[0].cond, 0);
  assert.ok(act(S, { type: 'drive', vehicle: 'Bike' }).error);     // broken: won't go
  p.items.push({ id: 'Tool', cond: 3 });
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
  S.forced = [2, 3];                    // Farmhouse 2 = Food
  act(S, { type: 'scavenge' });
  assert.deepEqual([...E.tileOf(S, p).looted], [2]);
  const water = p.res.water;
  S.forced = [2, 2, 4, 4];              // 2 (looted), 2 (looted), then 4 = Water: 4
  const { events } = act(S, { type: 'scavenge' });
  const ev = events.find((e) => e.type === 'scavenge');
  assert.deepEqual([...ev.tries], [2, 2, 4]);
  assert.equal(p.res.water, water + 4);
  assert.ok(S.log.some((l) => l.msg.includes('2 (looted), 2 (looted), then 4')));
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
  S.forced = [2, 3]; act(S, { type: 'scavenge' });
  S.forced = [2, 4]; act(S, { type: 'scavenge' });
  assert.equal(p.res.water, water + 7);
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
  p.items.push({ id: 'Axe', cond: 3 }, { id: 'Tool', cond: 2 });
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
  t.stashes = [{ owner: 'Ana', row: 5, res: { food: 4, ammo: 2 }, items: [{ id: 'Pistol', cond: 3 }] }];
  const food = p.res.food;
  S.forced = [5];
  const { events } = act(S, { type: 'scavenge' });
  assert.equal(events.find((e) => e.type === 'scavenge').hit.kind, 'stash');
  assert.equal(p.res.food, food + 4);
  assert.equal(p.res.ammo, 2);
  assert.equal(p.items[0].id, 'Pistol');
  assert.equal(t.stashes.length, 0);
  assert.equal(E.tableView(t)[4].kind, 'looted');
});

test('stash with more items than your backpack holds: choose what to take', () => {
  const { S, p } = game();
  const t = E.tileOf(S, p);
  for (let i = 0; i < 5; i++) p.items.push({ id: 'Tool', cond: 1 });
  t.stashes = [{ owner: 'Ana', row: 3, res: {}, items: [{ id: 'Axe', cond: 2 }, { id: 'Pistol', cond: 5 }] }];
  S.forced = [3];
  act(S, { type: 'scavenge' });
  assert.equal(p.pending.kind, 'stash');
  assert.match(decide(S, [0, 1]).error, /up to 1/);
  decide(S, [1]);
  assert.equal(p.items.at(-1).id, 'Pistol');
  assert.equal(t.stashes[0].items.length, 1);   // the Axe stays
  assert.equal(t.stashes[0].items[0].id, 'Axe');
});

test('death leaves everything in a stash on the tile', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest');
  p.items.push({ id: 'Tool', cond: 2 });
  p.res.ammo = 3;
  E.cheat(S, 0, 'zombies', [4]);
  S.forced = [2];
  decide(S, 'flee');
  assert.equal(p.dead, true);
  const s = E.tileOf(S, p).stashes[0];
  assert.equal(s.owner, 'Survivor');
  assert.equal(s.res.ammo, 3);
  assert.equal(s.items[0].id, 'Tool');
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
  t.stashes = ['A', 'B', 'C', 'D', 'E'].map((owner, i) => ({ owner, row: i + 2, res: {}, items: [{ id: 'Tool', cond: 1 }] }));
  p.items.push({ id: 'Axe', cond: 3 });
  act(S, { type: 'drop', item: 0 });
  assert.equal(t.stashes.length, 5);
  assert.equal(t.stashes[0].items.at(-1).id, 'Axe');
});
