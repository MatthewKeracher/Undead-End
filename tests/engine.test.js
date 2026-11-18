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

// A fresh one-player game with checks off (so tests aren't disturbed by food / water / hope).
function game(opts = {}) {
  const S = E.createGame({ seed: 42, checksOff: true, ...opts });
  E.start(S);
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

test('sleep gains 2d6 AP up to max and ends the round', () => {
  const { S, p } = game();
  p.ap = 2; S.forced = [3, 5];
  const { events } = act(S, { type: 'sleep' });
  assert.equal(p.ap, 10);
  assert.deepEqual([...events.find((e) => e.type === 'sleep').dice], [3, 5]);
  assert.equal(S.round, 3);              // single player: round ends once you've acted
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
  assert.equal(S.round, 3);
});

test('time up: anyone who has not acted sleeps', () => {
  const { S, p } = game({ autoEnd: false, names: ['A', 'B'] });
  const [a, b] = S.players;
  a.ap = 5; b.ap = 5;
  S.forced = [1, 1];
  E.act(S, 0, { type: 'sleep' });       // A sleeps (+2)
  S.forced = [2, 2];
  E.timeUp(S);                          // B didn't choose → sleeps (+4)
  assert.equal(a.ap, 7);
  assert.equal(b.ap, 9);
  assert.equal(S.round, 3);
  assert.ok(S.log.some((l) => l.msg.includes("B didn't choose in time")));
});

test('time up waits for an open decision, then that player sleeps', () => {
  const { S } = game({ autoEnd: false, names: ['A', 'B'] });
  const [a, b] = S.players;
  E.act(S, 0, { type: 'sleep' });
  b.items.push({ id: 'Handgun', cond: 3 }); b.res.ammo = 5;
  E.cheat(S, 1, 'zombies', [2]);        // B is mid Fight/Flee
  assert.equal(b.pending.kind, 'threat');
  E.timeUp(S);
  assert.equal(S.round, 2);             // round waits
  E.act(S, 1, { type: 'decide', choice: 'shoot' });
  E.act(S, 1, { type: 'decide', choice: 'attack' });
  S.forced = [1, 1];
  E.act(S, 1, { type: 'decide', choice: 'attack' });   // tile clear → B sleeps → round ends
  assert.equal(b.pending, null);
  assert.equal(S.round, 3);
  assert.ok(a.ap > 0);
});

test('scavenge a resource: amount × multiplier', () => {
  const { S, p } = game();
  S.forced = [4, 5];                    // Farmhouse 4 = Double Food, amount 5
  const food = p.res.food;
  act(S, { type: 'scavenge' });
  assert.equal(p.res.food, food + 10);
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
  assert.match(decide(S, { q: 0, r: -1 }).error, /safe hex/);   // unexplored
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
  assert.match(act(S, { type: 'scavenge' }).error, /Nothing to scavenge/);
  assert.match(act(S, { type: 'fortify' }).error, /can't be fortified/);
});

test('Mountain: impassable on foot and by vehicle', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Mountain');
  assert.match(act(S, { type: 'move', q: 1, r: 0 }).error, /Can't move/);
  E.tileOf(S, p).vehicles.push({ id: 'Truck', cond: 3 }); p.res.fuel = 3;
  assert.ok(act(S, { type: 'drive', vehicle: 'Truck' }).error);   // nowhere passable to go
});

test('scout reveals a random tile next to you', () => {
  const { S, p } = game();
  const { events } = act(S, { type: 'scout', q: 0, r: 1 });
  assert.ok(S.tiles['0,1']);
  assert.equal(events.find((e) => e.type === 'scout').k, '0,1');
  assert.match(act(S, { type: 'scout', q: 3, r: 3 }).error, /next to you/);
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
  assert.equal(S.round, 2);
});

test('night attack: Safety holds, or zombies break through', () => {
  const { S, p } = game();
  tile(S, 1, 0, 'Forest');              // somewhere to run
  S.round = 5;
  E.tileOf(S, p).safety = 6;
  S.forced = [1, 1, 3];                 // sleep 1+1, then 3 zombies at night (round 6)
  act(S, { type: 'sleep' });
  assert.equal(S.round, 6);
  assert.equal(E.tileOf(S, p).safety, 3);
  assert.equal(p.pending, null);
  S.forced = [1, 1, 6];                 // round 1 is night too: 6 vs Safety 3
  act(S, { type: 'sleep' });
  assert.equal(E.tileOf(S, p).zombies, 3);
  assert.equal(p.pending.kind, 'threat');
});

test('missing water costs max AP; max AP 0 is death', () => {
  const { S, p } = game({ checksOff: false });
  p.res.water = 0; p.maxAP = 2; p.ap = 2;
  S.round = 3;                          // round 4 checks water
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
  const a = act(S, { type: 'scout', q: 0, r: 1 }), b = E.act(copy, 0, { type: 'scout', q: 0, r: 1 });
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(JSON.parse(JSON.stringify(S)), JSON.parse(JSON.stringify(copy)));
});
