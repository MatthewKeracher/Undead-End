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
  for (const p of S.players) p.items = [];   // (before start: so no starting Note is read, and nothing's revealed)
  E.start(S);
  return { S, p: S.players[0] };
}
const act = (S, action) => E.act(S, 0, action);
const decide = (S, choice) => E.act(S, 0, { type: 'decide', choice });
const noteRow = (S) => (E.tileOf(S, S.players[0]).drawn[3] = { item: 'Note' });   // the Farmhouse's Random row: a Note
const tile = (S, q, r, name, extra = {}) => (S.tiles[`${q},${r}`] = { def: def(name), safety: 0, zombies: 0, vehicles: [], ...extra });

test('you start somewhere random that can be fortified — never outdoors — sometimes in a settlement', () => {
  const where = new Set();
  let inTown = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const S = E.createGame({ seed });
    const t = S.tiles['0,0'];
    assert.ok(t.def.passable && !t.def.spread && E.canFortifyHere(t), t.def.name);
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

test('every survivor starts with 8 of 12 AP, 4 food, 6 water, and a Note (condition 6) — hope is carried, not counted', () => {
  const S = E.createGame({ seed: 3 });
  assert.equal(S.players[0].ap, 8);
  assert.equal(S.players[0].maxAP, 12);
  assert.deepEqual({ ...S.players[0].res }, { food: 4, water: 6, fuel: 0, ammo: 0 });
  assert.equal(JSON.stringify(S.players[0].items), JSON.stringify([{ id: 'Note', cond: 6 }]));
});

test('the starting Note waits to be read: reading it, the first place on the trail appears; no Random row is a Note', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const S = E.createGame({ seed, checksOff: true });
    const tiles = Object.keys(S.tiles).length;
    assert.ok(!E.start(S).events.some((e) => e.type === 'lead'));
    const note = S.players[0].items[0];
    assert.equal(note.to, undefined);
    assert.equal(Object.keys(S.tiles).length, tiles);
    const { events } = E.act(S, 0, { type: 'read', item: 0 });
    assert.ok(note.to && note.text, `seed ${seed}`);
    assert.ok(E.leadOpen(S.tiles[note.to]));
    assert.equal(events.find((e) => e.type === 'lead').k, note.to);
    assert.equal(S.players[0].acted, false);   // free
    assert.ok(!Object.values(S.tiles).some((t) => Object.values(t.drawn || {}).some((e) => e.item === 'Note')));
  }
});

test('nothing is dropped at will: only a full backpack leaves something behind; only a Note can be read', () => {
  const { S, p } = game();
  p.items.push({ id: 'Axe', cond: 3 });
  assert.match(act(S, { type: 'drop', item: 0 }).error, /Unknown action/);
  assert.equal(p.items.length, 1);
  assert.match(act(S, { type: 'read', item: 0 }).error, /Nothing to read/);
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

test('sleep: 1d6 AP plus the Safety on the tile — up to max AP — and it ends the round', () => {
  const { S, p } = game();
  E.tileOf(S, p).safety = 3;
  p.ap = 2; S.forced = [4];
  const { events } = act(S, { type: 'sleep' });
  assert.equal(p.ap, 9);                 // 2 + 4 + 🟡 3
  const ev = events.find((e) => e.type === 'sleep');
  assert.deepEqual([...ev.dice], [4]);
  assert.equal(ev.bonus, 3);
  assert.equal(S.round, 2);              // single player: round ends once you've acted
  assert.equal(p.acted, false);          // …and you can act again in the new round
  p.ap = 11; S.forced = [6];
  act(S, { type: 'sleep' });
  assert.equal(p.ap, 12);                // capped at max AP
  E.tileOf(S, p).safety = 0;             // out in the open: just the 1d6
  p.ap = 2; S.forced = [4];
  act(S, { type: 'sleep' });
  assert.equal(p.ap, 6);
  E.tileOf(S, p).safety = 8;             // Safety over 6 adds just 6
  p.ap = 0; S.forced = [1];
  const ev8 = act(S, { type: 'sleep' }).events.find((e) => e.type === 'sleep');
  assert.equal(ev8.bonus, 6);
  assert.equal(p.ap, 7);
});

test('one round action per round when rounds are timed', () => {
  const { S, p } = game({ autoEnd: false });
  S.forced = [1];
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
  S.forced = [1];
  E.act(S, 0, { type: 'sleep' });       // A sleeps (+1: no Safety, 1d6)
  E.timeUp(S);                          // B didn't choose → −1 AP
  assert.equal(a.ap, 6);
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
  S.forced = [1, 1];
  E.act(S, 1, { type: 'decide', choice: 'shoot' });   // tile clear → B sleeps → round ends
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

test('zombies come past Safety: fight some down, then hide — Safety stops the rest, one for one', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest');              // somewhere to run, so running out of ammo isn't death
  E.tileOf(S, p).safety = 2;
  p.items.push({ id: 'Pistol', cond: 4 }); p.res.ammo = 3;
  S.forced = [1, 5];                    // 5 zombies, and Safety 2 doesn't stop them yet
  act(S, { type: 'scavenge' });
  const t = E.tileOf(S, p);
  assert.equal(t.safety, 2);
  assert.equal(t.zombies, 5);
  assert.equal(p.pending.kind, 'threat');
  assert.equal(E.canHide(p, t), true);
  decide(S, 'shoot');                   // one shot each click
  assert.equal(p.items[0].cond, 3);     // −1 condition: the gun's drawn for this encounter
  decide(S, 'shoot');
  assert.equal(p.items[0].cond, 3);     // …and only once
  assert.equal(t.zombies, 3);
  assert.equal(p.pending.kind, 'threat');     // still zombies: fight, flee or hide
  decide(S, 'hide');                    // Safety 2 stops 2 of the 3
  assert.deepEqual([t.safety, t.zombies], [0, 1]);
  assert.equal(p.pending.kind, 'threat');
  assert.equal(E.canHide(p, t), false); // no Safety left to hide behind
});

test('with no usable weapon there is no choice: the Safety takes them at once, as it always did', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest');
  const t = E.tileOf(S, p);
  t.safety = 4;
  p.items.push({ id: 'Pistol', cond: 4 }); p.res.ammo = 0;   // a gun, but nothing to fire
  S.forced = [1, 6];                    // 6 zombies
  act(S, { type: 'scavenge' });
  assert.deepEqual([t.safety, t.zombies], [0, 2]);   // 4 stopped; 2 come through
  assert.equal(p.pending.kind, 'threat');   // the 2 left: flee (nothing to fight with)
  assert.equal(E.canHide(p, t), false);
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

test('weapon looks: melee ones cost AP; guns (Pistol, Shotgun) fire ammo', () => {
  for (const id of ['Axe', 'Sword', 'Kitchen Knife', 'Frying Pan', 'Cricket Bat', 'Hockey Stick', 'Pickaxe']) assert.equal(ITEMS[id].uses, 'ap', id);
  for (const id of ['Pistol', 'Shotgun']) assert.equal(ITEMS[id].uses, 'ammo', id);
  assert.equal(ITEMS.Bow, undefined);   // (gone: the Castle has Ammo instead)
  const { S, p } = game();
  p.items.push({ id: 'Frying Pan', cond: 2 });
  tile(S, 1, 0, 'Forest');
  S.forced = [1, 2];
  act(S, { type: 'scavenge' });
  decide(S, 'melee'); decide(S, 'melee');
  assert.equal(E.tileOf(S, p).zombies, 0);
});

test('fight with the weapon you pick from the backpack — if you have what it takes to use it', () => {
  const { S, p } = game();
  p.items.push({ id: 'Pistol', cond: 4 }, { id: 'Axe', cond: 1 }, { id: 'Sword', cond: 5 }, { id: 'Booze', cond: 2 });
  p.res.ammo = 0;
  E.cheat(S, 0, 'zombies', [2]);
  assert.equal(p.pending.kind, 'threat');
  assert.ok(decide(S, { weapon: 0 }).error);   // the Pistol: no ammo
  assert.ok(decide(S, { weapon: 3 }).error);   // Booze is no weapon
  assert.equal(E.canWield(p, p.items[2]), true);
  decide(S, { weapon: 2 });                    // the Sword, not the more worn Axe: one swing
  assert.equal(E.tileOf(S, p).zombies, 1);
  assert.equal(p.items[2].cond, 4);            // −1 condition: drawn for this encounter
  assert.equal(p.items[1].cond, 1);            // the Axe untouched
  assert.equal(p.pending.kind, 'threat');      // one left: swing again, switch, flee…
});

test('weapon condition is spent once per encounter, per weapon; one worn to 0 lasts the encounter, then breaks', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest');
  p.items.push({ id: 'Axe', cond: 1 }, { id: 'Pistol', cond: 3 });
  p.ap = 10; p.res.ammo = 5;
  E.cheat(S, 0, 'zombies', [5]);
  decide(S, { weapon: 0 });                    // the Axe: 1 → 0, but still swinging
  assert.equal(p.items[0].cond, 0);
  decide(S, { weapon: 0 });
  assert.equal(E.tileOf(S, p).zombies, 3);
  decide(S, { weapon: 1 });                    // switch to the Pistol: its first shot costs it 1
  assert.equal(p.items[1].cond, 2);
  const pistol = p.items[1];
  decide(S, { weapon: 1 }); decide(S, { weapon: 1 });
  assert.equal(pistol.cond, 2);
  assert.equal(E.tileOf(S, p).zombies, 0);     // cleared: the encounter's over…
  assert.equal(p.items.map((x) => x.id).join(), 'Pistol');   // …and the worn-out Axe breaks
  assert.equal(p.items[0].drawn, undefined);
  E.cheat(S, 0, 'zombies', [1]);               // a new encounter: drawing the Pistol costs again
  decide(S, { weapon: 0 });
  assert.equal(p.items[0].cond, 1);
});

test('an encounter ended by hiding puts the weapons away too — a worn-out one breaks', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest');
  E.tileOf(S, p).safety = 2;
  p.items.push({ id: 'Axe', cond: 1 });
  E.cheat(S, 0, 'zombies', [3]);
  decide(S, { weapon: 0 });                    // one swing: the Axe at 0
  decide(S, 'hide');                           // the Safety takes the other two
  assert.equal(E.tileOf(S, p).zombies, 0);
  assert.equal(p.items.length, 0);
});

test('shotgun: each shot burns 1 ammo and kills up to 3 zombies', () => {
  assert.equal(ITEMS.Shotgun.uses, 'ammo');
  const { S, p } = game();
  p.items.push({ id: 'Shotgun', cond: 3 });
  p.res.ammo = 2;
  tile(S, 1, 0, 'Forest');
  S.forced = [1, 5];           // scavenge: 5 zombies
  act(S, { type: 'scavenge' });
  decide(S, { weapon: 0 });
  assert.equal(E.tileOf(S, p).zombies, 2);
  assert.equal(p.res.ammo, 1);
  decide(S, { weapon: 0 });    // 2 left: one shot takes both
  assert.equal(E.tileOf(S, p).zombies, 0);
  assert.equal(p.res.ammo, 0);
});

test('chainsaw: each rev burns 1 fuel and kills up to 3; −1 condition once per encounter', () => {
  const { S, p } = game();
  p.items.push({ id: 'Chainsaw', cond: 3 });
  p.res.fuel = 5;
  tile(S, 1, 0, 'Forest');
  S.forced = [1, 6];           // scavenge: 6 zombies, no Safety → all 6 through (the most a tile holds)
  act(S, { type: 'scavenge' });
  assert.equal(p.pending.kind, 'threat');
  assert.ok(E.canSaw(p));
  decide(S, 'saw');      // one rev: three of them
  assert.equal(E.tileOf(S, p).zombies, 3);
  assert.equal(p.res.fuel, 4);
  decide(S, 'saw');      // and the other three
  assert.equal(p.items[0].cond, 2);
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

test('backpack full: leave one here — in the row the new item came from, condition and all', () => {
  const { S, p } = game();
  const t = E.tileOf(S, p);
  p.items.push({ id: 'Pistol', cond: 2 });
  for (let i = 0; i < 5; i++) p.items.push({ id: 'Tool', cond: 1 });
  S.forced = [5, 4];                    // Farmhouse 5 = Axe, condition 4
  act(S, { type: 'scavenge' });
  assert.equal(p.pending.kind, 'backpack');
  decide(S, 0);                         // leave the Pistol
  assert.equal(p.items.length, 6);
  assert.equal(p.items[5].id, 'Axe');
  assert.equal(JSON.stringify(t.stashes.map((x) => [x.row, x.items])), JSON.stringify([[5, [{ id: 'Pistol', cond: 2 }]]]));
  assert.deepEqual({ ...E.loneItem(t.stashes[0]) }, { id: 'Pistol', cond: 2 });   // one item: it's just the Pistol
});

test('backpack full: leaving the new item leaves it where it was found, to come back for', () => {
  const { S, p } = game();
  const t = E.tileOf(S, p);
  for (let i = 0; i < 6; i++) p.items.push({ id: 'Tool', cond: 1 });
  S.forced = [5, 3];                    // the Axe, condition 3
  act(S, { type: 'scavenge' });
  decide(S, 6);                         // the new one
  assert.equal(p.items.filter((x) => x.id === 'Axe').length, 0);
  assert.equal(E.tableView(t)[4].kind, 'stash');
  p.items.pop();                        // make room, and roll it again: the same Axe, still condition 3
  S.forced = [5];
  act(S, { type: 'scavenge' });
  assert.deepEqual({ ...p.items.at(-1) }, { id: 'Axe', cond: 3 });
  assert.equal(t.stashes.length, 0);
  assert.equal(E.tableView(t)[4].kind, 'looted');
});

test('a lone item left on a tile is found as itself, and a full backpack can swap for it', () => {
  const { S, p } = game();
  const t = E.tileOf(S, p);
  t.looted = [4];
  t.stashes = [{ owner: 'Ana', row: 4, res: {}, items: [{ id: 'Pistol', cond: 1 }] }];
  for (let i = 0; i < 6; i++) p.items.push({ id: 'Tool', cond: 5 });
  S.forced = [4];
  act(S, { type: 'scavenge' });
  assert.equal(p.pending.kind, 'backpack');
  assert.deepEqual({ ...p.pending.item }, { id: 'Pistol', cond: 1 });   // no fresh condition roll
  decide(S, 0);                         // leave a Tool in its place
  assert.deepEqual({ ...p.items.at(-1) }, { id: 'Pistol', cond: 1 });
  assert.equal(JSON.stringify(t.stashes.map((x) => [x.owner, x.row, x.items])), JSON.stringify([['Survivor', 4, [{ id: 'Tool', cond: 5 }]]]));
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

test('booze: +6 AP for −1 max AP; pills: +12 AP for −2 max AP — free, −1 condition, gone at 0', () => {
  const { S, p } = game();
  p.items.push({ id: 'Pills', cond: 1 }, { id: 'Booze', cond: 2 });
  p.ap = 1; p.maxAP = 12;
  assert.ok(!act(S, { type: 'boost', item: 0 }).error);   // Pills: max 12 → 10, AP 1 + 12, capped at 10
  assert.deepEqual([p.ap, p.maxAP, p.acted], [10, 10, false]);   // free: not your action
  assert.equal(p.items[0].id, 'Booze');  // last dose: the Pills are gone
  assert.match(act(S, { type: 'boost', item: 0 }).error, /already full/);   // no wasting a swig
  p.ap = 2;
  act(S, { type: 'boost', item: 0 });   // Booze: max 10 → 9, AP 2 + 6
  assert.deepEqual([p.ap, p.maxAP, p.items[0].cond], [8, 9, 1]);
  p.ap = 0; p.maxAP = 1;
  assert.match(act(S, { type: 'boost', item: 0 }).error, /worn down/);   // it would leave no max AP at all
  p.items = [{ id: 'Note', cond: 2 }];
  assert.ok(act(S, { type: 'boost', item: 0 }).error);   // a Note is hope, but no AP
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

test('the Horse drinks 1 water per tile, eats 1 food per trip, and never breaks down', () => {
  assert.equal(ITEMS.Horse.uses, 'water');
  const { S, p } = game();
  tile(S, 1, 0, 'Forest'); tile(S, 2, 0, 'Lake');
  E.tileOf(S, p).vehicles.push({ id: 'Horse' });
  p.res.water = 5; p.res.food = 1; p.ap = 4; p.res.fuel = 0;
  act(S, { type: 'drive', vehicle: 'Horse' });
  decide(S, { q: 1, r: 0 }); decide(S, { q: 2, r: 0 }); decide(S, 'stop');
  assert.deepEqual([p.q, p.r], [2, 0]);
  assert.equal(p.res.water, 3);                          // 1 per tile
  assert.equal(p.res.food, 0);                           // 1 for the trip
  assert.equal(p.ap, 4);                                 // no AP
  assert.deepEqual({ ...E.tileOf(S, p).vehicles[0] }, { id: 'Horse' });   // no condition to lose
  assert.ok(act(S, { type: 'drive', vehicle: 'Horse' }).error);   // no food: it won't set off
  p.res.food = 2; p.res.water = 0;
  assert.ok(act(S, { type: 'drive', vehicle: 'Horse' }).error);   // no water either
  p.items.push({ id: 'Tool', cond: 3 });
  assert.ok(act(S, { type: 'tool', tool: 0, target: { from: 'tile', index: 0 }, amount: 1 }).error);   // a Tool can't help it
});

test('a Horse found at the Stables waits there, with no condition', () => {
  const { S, p } = game();
  S.tiles['0,0'] = { def: def('Stables'), safety: 0, zombies: 0, vehicles: [], looted: [], stashes: [] };
  S.forced = [6, 4];                    // Stables 6 = Horse
  act(S, { type: 'scavenge' });
  assert.deepEqual({ ...E.tileOf(S, p).vehicles[0] }, { id: 'Horse' });
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
  S.forced = [1, 3];                    // sleep 1, then 3 zombies at night (round 5)
  act(S, { type: 'sleep' });
  assert.equal(S.round, 5);              // no weapon: the Safety takes them at once
  assert.equal(E.tileOf(S, p).safety, 3);
  assert.equal(E.tileOf(S, p).zombies, 0);
  assert.equal(p.pending, null);
  S.badNight = false;                   // (a good night)
  S.forced = [1];                       // round 6 is night, but there's no attack
  act(S, { type: 'sleep' });
  assert.equal(S.round, 6);
  assert.equal(E.tileOf(S, p).safety, 3);
  E.tileOf(S, p).safety = 2;
  S.round = 4;
  S.forced = [1, 6];                    // next round 5: 6 zombies vs Safety 2 — no weapon, can't outrun 6: it hides
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
  S.forced = [1, 2];                    // round 5: 2 zombies — no weapon: the Safety takes them
  act(S, { type: 'sleep' });
  S.forced = [1, 3];                    // round 6 on a bad night: 3 more
  act(S, { type: 'sleep' });
  assert.equal(E.tileOf(S, p).safety, 1);
  assert.equal(S.log.filter((l) => l.msg.includes('in the night')).length, 2);
});

test('zombies come first: a night attack is fought or fled before the round\'s check', () => {
  const { S, p } = game({ checksOff: false });
  tile(S, 1, 0, 'Forest');
  p.items.push({ id: 'Booze', cond: 2 }, { id: 'Axe', cond: 3 });
  p.maxAP = 10; p.ap = 4;
  S.round = 5; S.badNight = true;
  S.forced = [1, 4];                    // sleep 1 (no Safety: 1d6), then round 6 on a bad night: 4 zombies
  act(S, { type: 'sleep' });
  assert.equal(S.round, 6);
  assert.equal(p.pending.kind, 'threat');   // not the hope check
  assert.equal(p.items[0].cond, 2);
  S.forced = [6];
  decide(S, 'flee');
  decide(S, { q: 1, r: 0 });            // got away…
  assert.equal(p.pending.kind, 'hope');  // …and only now: what hope is there?
  decide(S, 0);
  assert.equal(p.items[0].cond, 1);
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
  S.forced = [1]; act(S, { type: 'sleep' });
  assert.equal(p.maxAP, 4);
  p.res.water = 5;
  S.round = 6;                          // round 1: water check — paid
  S.badNight = false;
  S.forced = [1]; act(S, { type: 'sleep' });
  assert.equal(p.maxAP, 6);
  S.forced = [1]; act(S, { type: 'sleep' });   // round 2: food check — paid
  assert.equal(p.maxAP, 7);
  p.res.food = 0;
  S.round = 3;                          // round 4: food check — missed
  S.forced = [1]; act(S, { type: 'sleep' });
  assert.equal(p.maxAP, 6);
});

test('round 6 asks for hope: you pick a hope item and spend a pip of it', () => {
  const { S, p } = game({ checksOff: false });
  p.items.push({ id: 'Axe', cond: 3 }, { id: 'Pills', cond: 1 }, { id: 'Booze', cond: 2 });
  p.maxAP = 8; p.ap = 4;
  S.round = 5; S.badNight = false;
  S.forced = [1]; act(S, { type: 'sleep' });
  assert.equal(S.round, 6);
  assert.equal(p.pending.kind, 'hope');
  assert.ok(decide(S, 0).error);        // the Axe is no hope
  decide(S, 1);                         // the Pills: their last pip
  assert.equal(p.items.map((x) => x.id).join(), 'Axe,Booze');
  assert.equal(p.maxAP, 10);            // paid: +2, like water
  assert.equal(p.pending, null);
});

test('with a Note in the backpack, hope comes from the Note — no choice; Booze and Pills are kept for emergencies', () => {
  const { S, p } = game({ checksOff: false });
  p.items.push({ id: 'Booze', cond: 3 }, { id: 'Note', cond: 1, to: '9,9', by: 'Mara' }, { id: 'Pills', cond: 2 });
  p.maxAP = 8; p.ap = 4;
  S.round = 5; S.badNight = false;
  S.forced = [1]; act(S, { type: 'sleep' });
  assert.equal(S.round, 6);
  assert.equal(p.pending, null);        // not asked
  assert.equal(p.items.map((x) => x.id).join(), 'Booze,Pills');   // the Note's last pip: gone
  assert.equal(p.maxAP, 10);
});

test('nothing to hope for: max AP −2 (and at 0, you give up)', () => {
  const { S, p } = game({ checksOff: false });
  p.items.push({ id: 'Axe', cond: 3 });
  p.maxAP = 5; p.ap = 4;
  S.round = 5; S.badNight = false;
  S.forced = [1]; act(S, { type: 'sleep' });
  assert.equal(p.pending, null);
  assert.equal(p.maxAP, 3);
  assert.equal(p.dead, false);
  p.maxAP = 2; S.round = 5;
  S.forced = [1]; act(S, { type: 'sleep' });
  assert.equal(p.dead, true);
});

test('hope is Booze, Pills and Notes: items on the tables, not a resource', () => {
  assert.deepEqual({ ...def('Pub').table[1] }, { item: 'Booze' });
  assert.deepEqual(Object.keys(ITEMS).filter((id) => ITEMS[id].hope).sort(), ['Booze', 'Note', 'Pills']);
  const { S, p } = game();
  p.items.push({ id: 'Tool', cond: 3 }, { id: 'Booze', cond: 1 });
  assert.ok(act(S, { type: 'tool', tool: 0, target: { from: 'pack', index: 1 }, amount: 1 }).error);   // no topping up hope
});

test('finding a Note reveals a place 6 hexes away, where its writer left a stash', () => {
  const { S, p } = game();
  noteRow(S);
  S.forced = [3];                       // Farmhouse 3 (Random) = Note — always found at full condition (no roll)
  const tiles = Object.keys(S.tiles).length;
  act(S, { type: 'scavenge' });
  const note = p.items[0];
  assert.equal(note.to, undefined);     // found, not read: nothing appears yet
  assert.equal(Object.keys(S.tiles).length, tiles);
  const { events } = act(S, { type: 'read', item: 0 });   // reading it (free): the place it names appears
  assert.equal(note.id, 'Note');
  assert.equal(note.cond, 6);
  assert.ok(note.text.length <= 280 && note.text.includes(S.tiles[note.to].def.name) && note.text.includes(note.by), note.text);
  const [q, r] = note.to.split(',').map(Number);
  assert.equal((Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2, 6);
  const there = S.tiles[note.to];
  assert.ok(['Castle', 'Army Checkpoint', 'Church'].includes(there.def.name), there.def.name);   // a stronghold
  assert.ok(E.leadOpen(there));
  assert.equal(events.find((e) => e.type === 'lead').k, note.to);
  // the stash: their next Note, food and water, a melee weapon or a gun and ammo, pills or binoculars
  const st = there.stashes[0], ids = st.items.map((x) => x.id);
  assert.equal(st.owner, note.by);
  assert.ok([2, 4, 5, 6].includes(st.row));
  assert.equal(ids[0], 'Note');
  assert.ok(st.res.food >= 2 && st.res.water >= 2);
  assert.ok(ITEMS[ids[1]].weapon && ITEMS[ids[1]].uses !== 'fuel');
  assert.equal(ITEMS[ids[1]].uses === 'ammo', st.res.ammo >= 2);   // a gun comes with ammo
  assert.ok(['Pills', 'Binoculars'].includes(ids[2]));
  assert.equal(E.tableView(there)[st.row - 1].kind, 'stash');
});

test('reaching the place a Note names: it loses hope — down to 1 pip, once', () => {
  const { S, p } = game();
  noteRow(S);
  S.forced = [3];                       // Farmhouse 3 (Random) = Note (6 pips)
  act(S, { type: 'scavenge' });
  act(S, { type: 'read', item: 0 });
  const note = p.items[0], [q, r] = note.to.split(',').map(Number);
  p.items.push({ id: 'Note', cond: 1, to: '9,9', by: 'Sam' });   // another Note, elsewhere: it stays
  tile(S, q - 1, r, 'Forest');
  p.q = q - 1; p.r = r; p.acted = false; p.freeMoved = false;
  const { events } = act(S, { type: 'move', q, r });
  assert.ok(p.items.includes(note));    // still carried…
  assert.equal(note.cond, 1);           // …at 1 pip (from 6)
  const ev = events.find((e) => e.type === 'noteDone');
  assert.deepEqual([ev.item, ev.from, ev.to], [0, 6, 1]);   // (for the UI: which slot, and the pips going out)
  assert.equal(p.items.find((x) => x.by === 'Sam').cond, 1);   // the other Note: untouched
  assert.equal(events.find((e) => e.type === 'noteDone').name, S.tiles[note.to].def.name);
  assert.match(S.log.find((l) => /isn't here/.test(l.msg)).msg, /isn't here\. Note loses hope\./);
  assert.ok(E.leadOpen(S.tiles[note.to]));   // the stash is still there to find
  p.acted = false; p.freeMoved = false;
  assert.ok(!act(S, { type: 'move', q: q - 1, r }).events.some((e) => e.type === 'noteDone'));   // once only
});

test('no table has a Note (the rows that did are Ammo now), and guns come without ammo', () => {
  assert.ok(!TILES.some((t) => t.table.some((e) => e.item === 'Note' || e.parts?.some((x) => x.item === 'Note'))));
  assert.ok(!TILES.some((t) => t.table.some((e) => e.parts?.some((x) => x.item && ITEMS[x.item].uses === 'ammo'))));
  assert.deepEqual({ ...def('Farmhouse').table[3] }, { res: 'ammo', n: 1 });
});

test('an Empty row: shown blank, and rolled again like a looted one', () => {
  const { S, p } = game();
  const t = E.tileOf(S, p);
  t.def = { ...t.def, table: t.def.table.map((e, i) => (i === 3 ? { empty: 1 } : e)) };   // Farmhouse 4: Empty
  assert.equal(E.tableView(t)[3].kind, 'looted');
  assert.equal(E.cellText({ empty: 1 }), '');
  const food = p.res.food;
  S.forced = [4, 2, 3, 5];
  act(S, { type: 'scavenge' });
  assert.equal(p.res.food, food + 3);   // rolled again: 2 = Food + Water (3 food, 5 water)
  assert.ok(S.log.some((l) => /4 \(empty\), then 2/.test(l.msg)));
});

test('randomNote: a Random row is a Note that often — but never while a place a Note named is still to be reached', () => {
  const { S, p } = game(), was = CONFIG.randomNote;
  CONFIG.randomNote = 1 / 6;            // (0 in play: the starting Note's trail is the only one)
  const notes = (n) => { let c = 0; for (let i = 0; i < n; i++) if (E.anyResult(S).item === 'Note') c++; return c; };
  const c = notes(6000);
  assert.ok(c > 850 && c < 1150, `${c} of 6000`);
  S.leads = [{ k: '9,9', pid: p.id }];
  assert.equal(notes(600), 0);          // a lead waiting: no Notes
  p.visited.push('9,9');
  assert.ok(notes(600) > 0);            // reached: Notes again
  CONFIG.randomNote = was;
});

test('Notes only ever lead to strongholds: a Castle, Army Checkpoint or Church', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const S = E.createGame({ seed, checksOff: true });
    E.start(S);
    E.cheat(S, 0, 'item', ['note', 3]);
    const i = S.players[0].items.findLastIndex((x) => x.id === 'Note'), note = S.players[0].items[i];
    E.act(S, 0, { type: 'read', item: i });
    assert.ok(['Castle', 'Army Checkpoint', 'Church'].includes(S.tiles[note.to].def.name), `seed ${seed}: ${S.tiles[note.to].def.name}`);
  }
});

test('taking the stash: everything, and its Note leads on — same writer — to the next one', () => {
  const { S, p } = game();
  noteRow(S);
  S.forced = [3];
  act(S, { type: 'scavenge' });
  act(S, { type: 'read', item: 0 });
  const first = p.items[0], there = S.tiles[first.to], st = there.stashes[0];
  [p.q, p.r] = first.to.split(',').map(Number);
  const food = p.res.food + st.res.food;
  S.forced = [st.row];
  act(S, { type: 'scavenge' });
  assert.equal(p.res.food, food);
  assert.equal(p.items.length, 4);      // the first Note (its place reached: 1 pip) and the stash's three
  assert.equal(first.cond, 1);
  assert.equal(E.leadOpen(there), false);   // emptied: the border goes
  const next = p.items[1];
  assert.equal(next.id, 'Note');
  assert.equal(next.by, first.by);
  assert.equal(next.to, undefined);     // taken, not read
  act(S, { type: 'read', item: 1 });
  assert.ok(E.leadOpen(S.tiles[next.to]));
  const tiles = Object.keys(S.tiles).length, to = next.to;
  const { events } = act(S, { type: 'read', item: 1 });   // read again: the same place, shown again — nothing new
  assert.equal(Object.keys(S.tiles).length, tiles);
  assert.equal(next.to, to);
  const ev = events.find((e) => e.type === 'lead');
  assert.ok(ev.again && ev.k === to && ev.text === next.text);
});

test('every place is found with half its max Safety, rounded down — the starting one too', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const S = E.createGame({ seed });
    E.start(S);
    act(S, { type: 'scout' });
    for (const t of Object.values(S.tiles)) assert.equal(t.safety, Math.floor(E.maxSafetyOf(t) / 2), t.def.name);
  }
});

test('setting foot in a settlement for the first time announces it — once, whichever tile of it', () => {
  const { S, p } = game();
  S.towns = [{ name: 'Blackfield', kind: 'town' }];
  tile(S, 1, 0, 'Church', { town: 0, looted: [], stashes: [] });
  tile(S, 2, 0, 'Pub', { town: 0, looted: [], stashes: [] });
  const { events } = act(S, { type: 'move', q: 1, r: 0 });
  assert.deepEqual({ ...events.find((e) => e.type === 'town') }, { type: 'town', player: 0, name: 'Blackfield', kind: 'town' });
  assert.ok(S.log.some((l) => l.msg.includes('discovered the town of Blackfield')));
  const next = act(S, { type: 'move', q: 2, r: 0 });   // another tile of the same town: no banner
  assert.ok(!next.events.some((e) => e.type === 'town'));
});

test('Safety tops out at the max for the place (a Farmhouse: 4); a tile still holds up to 6 zombies', () => {
  const { S, p } = game();
  const t = E.tileOf(S, p);
  t.safety = 3;
  S.forced = [6];
  act(S, { type: 'fortify' });
  assert.equal(t.safety, 4);
  assert.match(act(S, { type: 'fortify' }).error, /full \(4\)/);
  p.items.push({ id: 'Axe', cond: 3 });  // (so it's a choice, not an automatic hide)
  E.cheat(S, 0, 'zombies', [9]);
  assert.equal(t.zombies, 6);
});

test('each place has its own max Safety: outdoors 0, else 3 to 6 — 6 for a stronghold', () => {
  assert.ok(TILES.every((t) => t.safety === 0 || (t.safety >= 3 && t.safety <= 6)), TILES.filter((t) => t.safety && (t.safety < 3 || t.safety > 6)).map((t) => t.name).join());
  assert.deepEqual([...new Set(TILES.map((t) => t.safety))].sort().join(), '0,3,4,5,6');   // every level in use
  const { S, p } = game();
  assert.equal(E.maxSafetyOf(tile(S, 1, 0, 'Lake')), 0);
  assert.equal(E.canFortifyHere(S.tiles['1,0']), false);
  const police = tile(S, 0, 1, 'Police Station');
  assert.equal(E.maxSafetyOf(police), 6);
  act(S, { type: 'move', q: 0, r: 1 });
  S.forced = [6]; act(S, { type: 'fortify' });
  assert.equal(police.safety, 6);
  assert.equal(E.maxSafetyOf(tile(S, 2, 0, 'Pharmacy')), 3);
});

test('missing water costs max AP; max AP 0 is death', () => {
  const { S, p } = game({ checksOff: false });
  p.res.water = 0; p.maxAP = 2; p.ap = 2;
  S.round = 2;                          // round 3 checks water
  S.forced = [1];
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
  S.forced = [2, 3, 3];                 // Farmhouse 2 = Food + Water
  act(S, { type: 'scavenge' });
  assert.deepEqual([...E.tileOf(S, p).looted], [2]);
  const water = p.res.water;
  S.forced = [2, 2, 3, 4];              // 2 (looted), 2 (looted), then 3 = this test's Double Water: 4 × 2
  const { events } = act(S, { type: 'scavenge' });
  const ev = events.find((e) => e.type === 'scavenge');
  assert.deepEqual([...ev.tries], [2, 2, 3]);
  assert.equal(p.res.water, water + 8);
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
  S.forced = [1, 2];                    // 2 zombies — no weapon: the Safety takes them
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

test('things left behind go in your stash on the tile, on a looted row if there is one', () => {
  const { S, p } = game();
  const t = E.tileOf(S, p);
  t.looted = [4];
  E.addToStash(S, t, p.name, { items: [{ id: 'Axe', cond: 3 }] });
  E.addToStash(S, t, p.name, { items: [{ id: 'Tool', cond: 2 }] });
  assert.equal(t.stashes.length, 1);    // one stash per owner per tile — it grows
  assert.equal(t.stashes[0].row, 4);
  assert.equal(t.stashes[0].owner, 'Survivor');
  assert.equal(E.tableView(t)[3].kind, 'stash');
  assert.equal(E.loneItem(t.stashes[0]), null);   // two things: a stash
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

test('stash with more items than your backpack holds: choose what to carry from both — the rest stay', () => {
  const { S, p } = game();
  const t = E.tileOf(S, p);
  for (let i = 0; i < 5; i++) p.items.push({ id: 'Tool', cond: 1 });
  t.stashes = [{ owner: 'Ana', row: 3, res: {}, items: [{ id: 'Axe', cond: 2 }, { id: 'Pistol', cond: 5 }] }];
  S.forced = [3];
  act(S, { type: 'scavenge' });
  assert.equal(p.pending.kind, 'stash');
  assert.match(decide(S, [0, 1, 2, 3, 4, 5, 6]).error, /up to 6/);
  decide(S, [0, 1, 2, 3, 4, 6]);        // the five Tools and the Pistol (index 5 + 1)
  assert.equal(p.items.at(-1).id, 'Pistol');
  assert.equal(t.stashes[0].items.length, 1);   // the Axe stays
  assert.equal(t.stashes[0].items[0].id, 'Axe');
});

test('backpack full: swap with a stash — what you leave stays in it, condition and all', () => {
  const { S, p } = game();
  const t = E.tileOf(S, p);
  for (let i = 0; i < 6; i++) p.items.push({ id: 'Tool', cond: i + 1 });
  t.stashes = [{ owner: 'Mara', row: 2, lead: true, res: { food: 3 }, items: [{ id: 'Note', cond: 2, by: 'Mara' }, { id: 'Axe', cond: 4 }, { id: 'Pills', cond: 3 }] }];
  const tiles = Object.keys(S.tiles).length;
  S.forced = [2];
  act(S, { type: 'scavenge' });
  assert.equal(p.pending.kind, 'stash');
  assert.equal(E.leadOpen(t), false);   // found: no longer marked, whatever's left in it
  decide(S, [2, 3, 4, 5, 6, 7]);        // leave the first two Tools; take the Note and the Axe
  assert.equal(p.items.map((x) => x.id).join(), 'Tool,Tool,Tool,Tool,Note,Axe');
  assert.equal(JSON.stringify(t.stashes[0].items), JSON.stringify([{ id: 'Tool', cond: 1 }, { id: 'Tool', cond: 2 }, { id: 'Pills', cond: 3 }]));
  assert.equal(Object.keys(S.tiles).length, tiles);   // the Note taken isn't read yet: nothing new appears
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
  E.addToStash(S, t, p.name, { items: [{ id: 'Axe', cond: 3 }] });
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
  E.addToStash(S, t, p.name, { items: [{ id: 'Axe', cond: 3 }] });
  assert.equal(t.stashes.length, 5);
  assert.equal(t.stashes[0].items.at(-1).id, 'Axe');
});

test('Bubba(): +25 of each resource, a Shotgun and an Axe at full condition, and a Truck parked on your tile', () => {
  const { S, p } = game();
  const res = { ...p.res };
  const { say } = E.cheat(S, 0, 'bubba', []);
  assert.match(say, /Bubba/);
  for (const k of Object.keys(res)) assert.equal(p.res[k], 18);   // capped — the rest is left here, in your stash
  const st = E.tileOf(S, p).stashes.find((x) => x.owner === p.name);
  for (const k of Object.keys(res)) assert.equal(st.res[k], res[k] + 25 - 18);
  assert.deepEqual(p.items.map((x) => [x.id, x.cond]), [['Shotgun', 6], ['Axe', 6]]);
  assert.ok(E.tileOf(S, p).vehicles.some((v) => v.id === 'Truck' && v.cond === 6));
});

test('driving onto or through the place a Note names: nothing till the trip ends — then the Note loses hope', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest'); tile(S, 2, 0, 'Lake'); tile(S, 3, 0, 'Lake');
  E.tileOf(S, p).vehicles.push({ id: 'Truck', cond: 3 });
  p.res.fuel = 5;
  p.items.push({ id: 'Note', cond: 2, to: '1,0', by: 'Mara' }, { id: 'Note', cond: 2, to: '3,0', by: 'Tom' });
  act(S, { type: 'drive', vehicle: 'Truck' });
  const through = decide(S, { q: 1, r: 0 }).events;   // through Mara's place…
  decide(S, { q: 2, r: 0 });
  const onto = decide(S, { q: 3, r: 0 }).events;      // …and onto Tom's
  assert.ok(![...through, ...onto].some((e) => e.type === 'noteDone'));
  assert.equal(p.items.length, 2);
  const { events } = decide(S, 'stop');
  assert.equal(events.filter((e) => e.type === 'noteDone').map((e) => e.by).join(), 'Mara,Tom');
  assert.equal(p.items.map((x) => x.cond).join(), '1,1');   // both lose hope: 1 pip each
});

test('resources cap at 18: a find beyond it leaves the rest on the tile, in your stash on that row', () => {
  const { S, p } = game();
  p.res.food = 15;
  S.forced = [2, 6, 3];                 // Farmhouse 2 = Food + Water: 6 food, 3 water
  const water = p.res.water;
  act(S, { type: 'scavenge' });
  assert.equal(p.res.food, 18);
  assert.equal(p.res.water, water + 3);
  const st = E.tileOf(S, p).stashes[0];
  assert.deepEqual([st.owner, st.row, st.res.food, st.res.water], ['Survivor', 2, 3, undefined]);   // the 3 that didn't fit
  assert.equal(E.tableView(E.tileOf(S, p))[1].kind, 'stash');
  assert.match(S.log.find((l) => /can't carry more than 18/.test(l.msg)).msg, /3 .* left in their stash at the Farmhouse \(row 2\)/);
});

test('rolling a stash over the cap: you take what fits, the rest stays in it', () => {
  const { S, p } = game();
  const t = E.tileOf(S, p);
  t.stashes = [{ owner: 'Ana', row: 5, res: { food: 10, ammo: 2 }, items: [] }];
  p.res.food = 12;
  S.forced = [5];
  act(S, { type: 'scavenge' });
  assert.equal(p.res.food, 18);
  assert.equal(p.res.ammo, 2);
  assert.deepEqual({ ...t.stashes[0].res }, { food: 4 });   // still there, for later
  p.res.food = 99; E.cheat(S, 0, 'food', [99]);
  assert.equal(p.res.food, 18);         // food(n) caps too
});
