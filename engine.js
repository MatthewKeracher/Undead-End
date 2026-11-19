// =====================================================================
//  ENGINE — the rules, with no screen code. The same file runs in the
//  browser (single player) and, later, on the multiplayer server.
//
//  Engine.act(state, playerId, action) → { events } or { error }
//  Everything that happens comes back as events for the UI to animate.
//  When the rules need a choice (Fight or Flee, armor, backpack full…)
//  it's stored on the player as `pending`, and answered with a 'decide'
//  action. The state is plain data, so it can be saved or sent as JSON.
// =====================================================================

const Engine = (() => {
  const ICON = { food: '🔴', water: '🔵', booze: '🟣', fuel: '🟠', ammo: '🟢', safety: '🟡', ap: '🎲' };
  const RES_LABEL = { food: 'Food', water: 'Water', booze: 'Booze', fuel: 'Fuel', ammo: 'Ammo' };
  const COLORS = ['#e4572e', '#29a3d6', '#f3c13a', '#9b5de5', '#2ec4b6', '#ff7eb6'];
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

  const key = (q, r) => `${q},${r}`;
  const neighbors = (q, r) => DIRS.map(([a, b]) => [q + a, r + b]);
  const isAdjacent = (p, q, r) => neighbors(p.q, p.r).some(([a, b]) => a === q && b === r);
  const isNight = (r) => CONFIG.nightRounds.includes(r);
  const isAttack = (r) => CONFIG.attackRounds.includes(r);   // a night attack starts this round
  // …plus round 6 when a bad night is coming (see startOfRound)
  const attackDue = (S, r) => isAttack(r) || (r === 6 && S.badNight);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // ---------------------------------------------------------------- dice
  // Seeded (mulberry32), so a game can be replayed from its seed. Cheats can force the next rolls.
  function rand(S) {
    let t = (S.rng = (S.rng + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const d6 = (S) => 1 + Math.floor(rand(S) * 6);
  // `keep` adds to the dice already rolled for this message (e.g. scavenge: table roll, then amount)
  // `min` quietly rules out low faces: the die reads min–6, evenly (resource finds use 2 — never a 1)
  function roll(S, keep = false, min = 1) {
    if (!keep) S.rolls = [];
    const v = S.forced.length ? Math.max(min, S.forced.shift()) : min + Math.floor(rand(S) * (7 - min));
    S.rolls.push(v);
    return v;
  }

  // ---------------------------------------------------------------- lookups
  const tileOf = (S, p) => S.tiles[key(p.q, p.r)];
  const emptyAdj = (S, p) => neighbors(p.q, p.r).filter(([q, r]) => !S.tiles[key(q, r)]);
  // Binoculars double your scouting range: the hexes next to you, then the ones next to those —
  // but you can't see past a Mountain.
  const binocularsOf = (p) => p.items.filter((it) => ITEMS[it.id]?.binoculars && it.cond > 0).sort((a, b) => a.cond - b.cond)[0];
  // What a scout could reveal: the unexplored hexes next to you, and with Binoculars the unexplored ones
  // beyond them, seen through a hex next to you that isn't a Mountain (an unexplored one might turn out to be).
  function scoutTargets(S, p) {
    const near = neighbors(p.q, p.r), nearKeys = new Set(near.map(([q, r]) => key(q, r))), out = new Map();
    for (const [q, r] of near) if (!S.tiles[key(q, r)]) out.set(key(q, r), [q, r]);
    if (binocularsOf(p)) {
      for (const [q, r] of near) {
        const t = S.tiles[key(q, r)];
        if (t && !passable(t)) continue;   // a Mountain blocks the view
        for (const [a, b] of neighbors(q, r)) {
          const k = key(a, b);
          if (!S.tiles[k] && !nearKeys.has(k) && !(a === p.q && b === p.r)) out.set(k, [a, b]);
        }
      }
    }
    return [...out.values()];
  }
  const tileAdj = (S, p) => neighbors(p.q, p.r).filter(([q, r]) => S.tiles[key(q, r)]);
  // Impassable tiles (e.g. Mountain) can't be moved, fled or driven onto.
  const passable = (t) => !!t && t.def.passable;
  // Moving, driving and fleeing can head into unexplored hexes too: they're revealed as you enter (see enterHex).
  const driveAdj = (S, p) => neighbors(p.q, p.r).filter(([q, r]) => { const t = S.tiles[key(q, r)]; return !t || passable(t); });
  // A weapon's `uses` says what each attack spends: 'ammo' (gun: 1 ammo per shot) or 'ap' (melee: 1 AP per swing).
  // With several of the same kind, the one with the lowest condition is used first.
  const weaponOf = (p, uses) => p.items
    .filter((it) => ITEMS[it.id]?.weapon && it.cond > 0 && (!uses || ITEMS[it.id].uses === uses))
    .sort((a, b) => a.cond - b.cond)[0];
  const armorOf = (p) => p.items.filter((it) => ITEMS[it.id]?.armor && it.cond > 0).sort((a, b) => a.cond - b.cond)[0];
  // Tiles with zombies can only be entered by a player carrying a weapon.
  const canEnter = (p, t) => passable(t) && (!t.zombies || !!weaponOf(p));
  const moveAdj = (S, p) => neighbors(p.q, p.r).filter(([q, r]) => { const t = S.tiles[key(q, r)]; return !t || canEnter(p, t); });
  const maxSafetyOf = (t) => t.def.safety ?? CONFIG.maxSafety;   // each location has its own (0 = outdoors)
  const canFortifyHere = (t) => maxSafetyOf(t) > 0;

  // ---------------------------------------------------------------- loot tables
  // Found results are crossed off for good (t.looted: row numbers). Zombies are crossed off too once
  // they've come, but drift back (see restockZombies). A survivor's stash covers a row until it's
  // emptied (t.stashes). A tile with no table (e.g. Wasteland) has only empty rows — so it can only be
  // scavenged for a stash left there.
  const stashAt = (t, row) => (t.stashes || []).find((s) => s.row === row);
  const rowEntry = (t, row) => t.def.table[row - 1] ?? (row === 1 ? { zombies: 1 } : null);
  function lootRow(t, row) {
    const stash = stashAt(t, row);
    if (stash) return { kind: 'stash', stash };
    const e = rowEntry(t, row);
    if (!e || (t.looted || []).includes(row)) return { kind: 'looted', e };
    if (e.zombies) return { kind: 'zombies', e };
    return { kind: e.item || e.parts?.some((x) => x.item) ? 'item' : 'res', e };
  }
  const tableView = (t) => [1, 2, 3, 4, 5, 6].map((row) => ({ row, ...lootRow(t, row) }));
  // something to scavenge for: a table (or a stash left on a tile without one), and at least one row not crossed off
  const canScavengeHere = (t) => (t.def.table.length > 0 || (t.stashes || []).length > 0) && tableView(t).some((r) => r.kind !== 'looted');
  const hasStuff = (s) => s.items.length > 0 || Object.values(s.res).some((n) => n > 0);
  const stashText = (s) => [...Object.entries(s.res).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${ICON[k]}`),
    ...s.items.map((it) => ITEMS[it.id].icon)].join(' ');
  // Fleeing: only to an adjacent, already-scouted, passable tile with no zombies.
  const fleeAdj = (S, p) => neighbors(p.q, p.r).filter(([q, r]) => { const t = S.tiles[key(q, r)]; return !t || (passable(t) && !t.zombies); });
  const canShoot = (p) => !!weaponOf(p, 'ammo') && p.res.ammo > 0;
  const canMelee = (p) => !!weaponOf(p, 'ap') && p.ap >= 1;
  const canFight = (p) => canShoot(p) || canMelee(p);
  // After a failed flee (and no armor reroll) you're caught: no more fleeing this encounter.
  const canFlee = (S, p, t) => !p.caught && p.ap >= 1 && fleeAdj(S, p).length > 0 && t.zombies < CONFIG.maxZombies;

  // Vehicles sit on tiles (not in the backpack). Truck: 1 fuel per tile. Bike: 1 AP per tile.
  const vehicleFuel = (v) => ITEMS[v.id].uses;                 // 'fuel' | 'ap'
  const vehicleLeft = (p, v) => (vehicleFuel(v) === 'fuel' ? p.res.fuel : p.ap);
  const vehicleOf = (S, p, id) => (tileOf(S, p).vehicles || []).filter((v) => v.id === id && v.cond > 0).sort((a, b) => a.cond - b.cond)[0];
  const canDrive = (S, p, id) => { const v = vehicleOf(S, p, id); return !!v && vehicleLeft(p, v) > 0 && driveAdj(S, p).length > 0; };

  function cellText(e) {
    if (e.zombies) return e.zombies > 1 ? `Zombies ×${e.zombies}` : 'Zombies';
    const forever = e.endless ? ' ∞' : '';   // an Endless row never runs out
    if (e.parts) return e.parts.map(cellText).join(' + ') + forever;
    if (e.item) return e.item + forever;
    const mult = { 2: 'Double', 3: 'Triple', 4: 'Quadruple' }[e.n];
    return (e.n > 1 ? (mult ? `${mult} ${RES_LABEL[e.res]}` : `${RES_LABEL[e.res]} ×${e.n}`) : RES_LABEL[e.res]) + forever;
  }
  const upkeepText = (r) => Object.entries(CONFIG.upkeep[r] || {}).map(([res, n]) => `${n} ${ICON[res]}`).join(' ');
  const roundBanner = (S) => `Day ${S.day}, Round ${S.round} — ${isNight(S.round) ? '🌙 Night' : '☀️ Day'}`;

  // ---------------------------------------------------------------- log + events
  function log(S, msg, cls = '') { S.log.push({ msg, cls }); }
  // log a message with the dice just rolled shown beside it
  function logRoll(S, msg, cls = '') { S.log.push({ msg, cls, dice: [...S.rolls] }); }
  function emit(S, ev) { S.events.push(ev); }
  const statsOf = (p) => ({ ap: p.ap, maxAP: p.maxAP, res: { ...p.res } });

  // ---------------------------------------------------------------- setup
  const newTile = (def, safety = 0) => ({ def, safety, zombies: 0, vehicles: [], looted: [], stashes: [] });
  // A random location from the scouting pool, each as likely as its count (optionally only those that pass `ok`).
  function drawTile(S, ok = () => true) {
    const pool = TILES.filter(ok).length ? TILES.filter(ok) : TILES;
    let x = rand(S) * pool.reduce((n, t) => n + t.count, 0);
    return pool.find((t) => (x -= t.count) < 0) ?? pool.at(-1);
  }
  // An unexplored hex becomes a random location — unless a belt or range already claimed it (S.planned).
  function reveal(S, q, r) {
    const k = key(q, r), plan = S.planned[k];
    delete S.planned[k];
    // next to a belt or range (seen or planned), it can't start another of the same kind: shapes stay apart
    const touches = (name) => neighbors(q, r).some(([a, b]) => (S.tiles[key(a, b)]?.def.name ?? S.planned[key(a, b)]) === name);
    const def = plan === 'pass' ? drawTile(S, (t) => !t.spread)   // a gap in a range: an ordinary place
      : (plan && TILES.find((t) => t.name === plan)) || drawTile(S, (t) => !(t.spread && (touches(t.name) || !roomFor(S, q, r, t))));
    S.tiles[k] = newTile(def);
    if (!plan && def.spread) spread(S, q, r, def);   // a fresh Wasteland or Mountain grows its shape
    return { k, name: def.name, icon: def.icon };
  }
  // Room for a shape to start here? A belt needs two touching unexplored neighbours (a triangle at least);
  // a range needs one unexplored neighbour. Without it, the hex is drawn as something else — no lone ones.
  function roomFor(S, q, r, def) {
    const open = ([a, b]) => !S.tiles[key(a, b)] && !S.planned[key(a, b)], around = neighbors(q, r);
    return def.spread === 'belt' ? around.some((h, i) => open(h) && open(around[(i + 1) % 6])) : around.some(open);
  }
  // Terrain comes in shapes, planned onto unexplored hexes (and only those) around a fresh one:
  // a belt is a triangle of 3 (two neighbours that touch each other) or, CONFIG.beltBig of the time, a cluster
  // of 7 (a hex and all six around it — centred on it or a neighbour, wherever there's room); a range runs CONFIG.rangeArm hexes off each way in a rough line, bending 60°
  // CONFIG.rangeTurn of the time, with CONFIG.rangeGap of its hexes (never the first each way) left as passes.
  function spread(S, q, r, def) {
    const open = ([a, b]) => !S.tiles[key(a, b)] && !S.planned[key(a, b)];
    const plan = ([a, b], what) => { if (open([a, b])) S.planned[key(a, b)] = what; };
    const around = neighbors(q, r);
    if (def.spread === 'belt') {
      if (rand(S) < CONFIG.beltBig) {   // centred on whichever of it and its neighbours leaves the most room
        const room = ([a, b]) => [[a, b], ...neighbors(a, b)].filter((h) => (h[0] === q && h[1] === r) || open(h)).length;
        const centres = [[q, r], ...around.filter(open)], most = Math.max(...centres.map(room));
        const [cq, cr] = centres.filter((c) => room(c) === most)[Math.floor(rand(S) * centres.filter((c) => room(c) === most).length)];
        return [[cq, cr], ...neighbors(cq, cr)].forEach((h) => plan(h, def.name));
      }
      const pairs = [0, 1, 2, 3, 4, 5].map((i) => [around[i], around[(i + 1) % 6]]);   // neighbours in turn touch
      const clear = pairs.filter((pr) => pr.every(open));
      const pick = (clear.length ? clear : pairs)[Math.floor(rand(S) * (clear.length || 6))];
      return pick.forEach((h) => plan(h, def.name));
    }
    if (def.spread === 'range') {
      // run it across open country: the line through it with the most unexplored ends
      const opens = [0, 1, 2].map((d) => [d, open(around[d]) + open(around[d + 3])]);
      const best = Math.max(...opens.map(([, n]) => n)), lines = opens.filter(([, n]) => n === best);
      const d0 = lines[Math.floor(rand(S) * lines.length)][0] + (rand(S) < 0.5 ? 3 : 0), [lo, hi] = CONFIG.rangeArm;
      for (const start of [d0, (d0 + 3) % 6]) {   // two arms, opposite ways
        let [a, b] = [q, r], d = start;
        const len = lo + Math.floor(rand(S) * (hi - lo + 1));
        for (let i = 0; i < len; i++) {
          if (rand(S) < CONFIG.rangeTurn) d = (d + (rand(S) < 0.5 ? 1 : 5)) % 6;
          [a, b] = [a + DIRS[d][0], b + DIRS[d][1]];
          plan([a, b], i > 0 && rand(S) < CONFIG.rangeGap ? 'pass' : def.name);   // the first hex each way is always Mountain
        }
      }
    }
  }
  // Stepping into a hex (on foot, by vehicle or fleeing): an unexplored one is revealed as you arrive.
  // Returns its tile — or null if it turned out to be impassable (you stay put).
  function enterHex(S, p, q, r) {
    let t = S.tiles[key(q, r)];
    if (!t) {
      const found = reveal(S, q, r);
      t = S.tiles[found.k];
      log(S, `${p.name} heads into the unknown and finds ${/^[aeiou]/i.test(found.name) ? 'an' : 'a'} ${found.icon} ${found.name}.`);
      emit(S, { type: 'reveal', player: p.id, tiles: [found] });
      if (!passable(t)) { log(S, `${found.icon} The ${found.name} blocks the way.`, 'bad'); return null; }
    }
    return t;
  }

  // autoEnd: the round ends as soon as every survivor has acted (single player).
  // Without it, the host ends rounds with timeUp() (the 30 s timer).
  function createGame({ names = ['Survivor'], seed = (Math.random() * 2 ** 32) >>> 0, autoEnd = true, checksOff = false } = {}) {
    const S = {
      seed, rng: seed | 0, day: CONFIG.startDay, round: CONFIG.startRound, tiles: {}, planned: {}, players: [],
      log: [], events: [], rolls: [], forced: [], autoEnd, timesUp: false, checksOff, badNight: false, over: null,
    };
    S.tiles[key(0, 0)] = newTile(START_TILE, CONFIG.startSafety);
    for (const id of CONFIG.testStartVehicles || []) S.tiles[key(0, 0)].vehicles.push({ id, cond: CONFIG.maxCondition });
    names.forEach((name, i) => {
      // CONFIG.startAP (8 of 12), CONFIG.startRes (4 food, 6 water, 3 booze) and CONFIG.startItems (none)
      const p = {
        id: i, name, color: COLORS[i % COLORS.length], q: 0, r: 0, ap: Math.min(CONFIG.startAP, CONFIG.startMaxAP), maxAP: CONFIG.startMaxAP,
        res: { ...CONFIG.startRes }, items: [], dead: false, acted: false, freeMoved: false, caught: false, pending: null, queue: [], visited: ['0,0'],
      };
      for (const it of CONFIG.startItems || []) p.items.push({ ...it });
      for (const id of CONFIG.testStartItems || []) p.items.push({ id, cond: CONFIG.maxCondition });
      for (const [k, n] of Object.entries(CONFIG.testStartRes || {})) p.res[k] += n;
      S.players.push(p);
    });
    log(S, `Day ${S.day} begins. ${plural(names.length, 'survivor')} shelter at the ${START_TILE.name}.`, 'phase');
    for (const p of S.players) {
      log(S, `${p.name} starts with 🎲 ${p.ap} AP, ${p.res.food} ${ICON.food} food, ${p.res.water} ${ICON.water} water, ${p.res.booze} ${ICON.booze} booze.`);
    }
    log(S, roundBanner(S), 'phase');
    return S;
  }

  // The first round's check (the UI calls this after a beat, so you see your starting resources first).
  const start = (S) => run(S, () => startOfRound(S));

  // ---------------------------------------------------------------- turn flow
  // Wraps every entry point: collects the events, then lets queued steps and round ends play out.
  function run(S, fn) {
    S.events = [];
    const error = fn();
    if (error) return { error, events: S.events };
    settle(S);
    markVisited(S);
    return { events: S.events };
  }
  // Each survivor remembers the tiles they've stood on (p.visited) — the UI shows their Safety there.
  function markVisited(S) {
    for (const p of S.players) if (!p.dead && !(p.visited ||= []).includes(key(p.q, p.r))) p.visited.push(key(p.q, p.r));
  }

  // Run each player's queued steps until they need a decision; end the round when everyone's done.
  function settle(S) {
    for (let guard = 0; guard < 1000 && !S.over; guard++) {
      let progressed = false;
      for (const p of S.players) {
        while (!p.dead && !p.pending && p.queue.length && !S.over) { STEPS[p.queue.shift().type](S, p); progressed = true; }
      }
      if (S.over) return;
      // time's up: anyone who hasn't acted loses 1 AP — those mid-decision once it's done (the round waits for them).
      // A drive in progress stops where it is (unless it's an escape that hasn't left the zombies yet).
      if (S.timesUp) {
        for (const p of S.players) {
          const d = p.pending;
          if (!p.dead && d?.kind === 'drive' && !(d.flee && !d.steps)) {
            log(S, `⏱️ Time's up — ${p.name} stops the ${ITEMS[d.v.id].icon} ${d.v.id} here.`, 'bad');
            endDrive(S, p);
            progressed = true;
          }
        }
        for (const p of S.players) {
          if (p.dead || p.acted || busyPlayer(p)) continue;
          const lost = Math.min(1, p.ap);
          p.ap -= lost; p.acted = true;
          log(S, `⏱️ ${p.name} didn't act in time${lost ? ' — loses 1 🎲 AP' : ''}.`, 'bad');
          emit(S, { type: 'timeout', player: p.id, lost });
        }
      }
      if ((S.autoEnd || S.timesUp) && roundDone(S)) { S.timesUp = false; endRound(S); continue; }
      if (!progressed) return;
    }
  }
  const busyPlayer = (p) => !!p.pending || p.queue.length > 0;
  const roundDone = (S) => S.players.every((p) => p.dead || (p.acted && !busyPlayer(p)));

  function endRound(S) {
    S.round++;
    if (S.round > 6) { S.round = 1; S.day++; log(S, `🌅 Day ${S.day} begins.`, 'phase'); }
    log(S, roundBanner(S), 'phase');
    for (const p of S.players) { p.acted = false; p.freeMoved = false; }
    emit(S, { type: 'round', day: S.day, round: S.round });
    startOfRound(S);
  }

  // The 30 s timer ran out: anyone who hasn't acted loses 1 AP and the round ends. See settle().
  const timeUp = (S) => run(S, () => { S.timesUp = true; });

  // Everything that happens at the START of a round, before anyone acts:
  // 1) this round's resource check, 2) the night attack (CONFIG.attackRounds, or round 6 on a bad night).
  // As round 1 starts, a secret 1d6 decides whether the coming night is a bad one (CONFIG.badNightOn).
  // Food & water feed max AP: each check paid → +trackGain[res] (max 12); each missed → −trackLoss[res]. Max AP 0 = death.
  // (Water: ±2, food: ±1.)
  // A Booze check you can't pay is death.
  // Zombies drift back into a tile's table once it has no Safety and nobody is on it.
  function restockZombies(S) {
    for (const [k, t] of Object.entries(S.tiles)) {
      if (!t.looted?.length || t.safety > 0 || S.players.some((p) => !p.dead && key(p.q, p.r) === k)) continue;
      t.looted = t.looted.filter((row) => !rowEntry(t, row)?.zombies);
    }
  }

  function startOfRound(S) {
    const r = S.round;
    restockZombies(S);
    if (r === 1) {   // secret: only the result shows (a 🟡 on round 6 of the clock)
      S.badNight = d6(S) <= CONFIG.badNightOn;
      if (S.badNight) log(S, '🌘 Something stirs… a bad night is coming: zombies after midnight too (round 6).', 'bad');
    }
    if (S.checksOff && Object.keys(CONFIG.upkeep[r] || {}).length) log(S, `Round ${r} check skipped (cheat: checks off)`, 'cheat');
    const up = S.checksOff ? {} : CONFIG.upkeep[r] || {};
    if (Object.keys(up).length) log(S, `Round ${r} check — ${upkeepText(r)}`, 'phase');
    for (const p of S.players) {
      if (p.dead) continue;
      for (const [res, n] of Object.entries(up)) {
        if (p.dead) break;
        const body = res === 'food' || res === 'water';   // food & water feed your max AP
        if (p.res[res] >= n) {
          p.res[res] -= n;
          if (body && p.maxAP < CONFIG.maxAP) {
            const oldMax = p.maxAP;
            p.maxAP = Math.min(CONFIG.maxAP, p.maxAP + CONFIG.trackGain[res]);
            log(S, `${p.name} uses ${n} ${ICON[res]} ${res} — max AP ${oldMax} → ${p.maxAP}.`, 'good');
          } else log(S, `${p.name} uses ${n} ${ICON[res]} ${res}.`);
        } else if (body) {
          const oldMax = p.maxAP, oldAp = p.ap;
          p.res[res] = 0;
          p.maxAP = Math.max(0, p.maxAP - CONFIG.trackLoss[res]);
          p.ap = Math.min(p.ap, p.maxAP);
          emit(S, { type: 'maxApLoss', player: p.id, res, oldMax, newMax: p.maxAP, oldAp, newAp: p.ap });
          log(S, `${p.name} has no ${res}! Max AP ${oldMax} → ${p.maxAP}.`, 'bad');
          if (p.maxAP <= 0) die(S, p, `${p.name} ${res === 'food' ? 'starved' : 'died of thirst'} (max AP 0).`);
        } else if (res === 'booze') {
          p.res[res] = 0;
          die(S, p, `${p.name} can't face another night sober (no ${ICON.booze} booze left).`);
        } else {
          p.res[res] = 0;
          log(S, `${p.name} has no ${res}!`, 'bad');
        }
      }
    }
    if (S.over) return;
    emit(S, { type: 'checks', stats: Object.fromEntries(S.players.map((p) => [p.id, statsOf(p)])) });
    if (attackDue(S, r)) nightAttack(S);
  }

  // ---------------------------------------------------------------- zombies
  // 1d6 zombies arrive: each one cancels (and uses up) a point of Safety; the rest
  // fill the tile's circles as zombies, up to CONFIG.maxZombies (6).
  function zombieContest(t, n) {
    const absorbed = Math.min(t.safety, n), left = n - absorbed;
    const zombies = Math.min(CONFIG.maxZombies, (t.zombies || 0) + left);
    const slots = Math.max(CONFIG.maxZombies, maxSafetyOf(t));   // circles to draw: Safety and zombies share them
    return { n, absorbed, left, slots, before: { safety: t.safety, zombies: t.zombies || 0 }, after: { safety: t.safety - absorbed, zombies } };
  }
  function applyContest(t, c) { t.safety = c.after.safety; t.zombies = c.after.zombies; }
  function contestText(c) {
    if (!c.left) return `🟡 Safety holds — absorbs all ${c.n} (🟡 ${c.before.safety} → ${c.after.safety}).`;
    return `${c.absorbed ? `🟡 Safety absorbs ${c.absorbed}, ` : ''}🧟 ${c.left} break${c.left === 1 ? 's' : ''} through!`;
  }

  // Each occupied tile is attacked by 1d6 zombies; everyone on a tile they break through faces Fight or Flee.
  function nightAttack(S) {
    const groups = {};
    for (const p of S.players) if (!p.dead) (groups[key(p.q, p.r)] ??= []).push(p);
    for (const [k, grp] of Object.entries(groups)) {
      const t = S.tiles[k];
      const n = roll(S);
      const c = zombieContest(t, n);
      emit(S, { type: 'night', k, name: t.def.name, c });
      applyContest(t, c);
      logRoll(S, `🌙 ${plural(n, 'zombie')} attack the ${t.def.name} in the night. ${contestText(c)}`, c.left ? 'bad' : 'good');
      if (t.zombies) for (const p of grp) p.queue.push({ type: 'threat' });
    }
  }

  // ---------------------------------------------------------------- death
  const alive = (S) => S.players.filter((p) => !p.dead);
  function die(S, p, why) {
    p.dead = true; p.pending = null; p.queue = [];
    log(S, `☠️ ${why} The zombies get ${p.name}.`, 'bad');
    const t = tileOf(S, p);
    if (hasStuff({ res: p.res, items: p.items })) {   // everything they carried becomes their stash on the tile
      const s = addToStash(S, t, p.name, { res: p.res, items: p.items });
      p.items = []; p.res = Object.fromEntries(Object.keys(p.res).map((k) => [k, 0]));
      log(S, `🎒 Everything ${p.name} carried is left in a stash at the ${t.def.name} (row ${s.row}).`);
    }
    emit(S, { type: 'die', player: p.id, why });
    if (!alive(S).length) S.over = { why, day: S.day, round: S.round };
  }

  // ---------------------------------------------------------------- fight / flee
  // Zombies on your tile: choose Fight (free to start; gun: 1 ammo/shot, melee: 1 AP/swing) or Flee (1 AP, roll 1d6 > zombies).
  // Repeats until the tile is clear, you escape, or you die.
  const STEPS = {
    threat(S, p) {
      const t = tileOf(S, p);
      if (!t.zombies) { p.caught = false; return; }
      if (!canFight(p) && !canFlee(S, p, t)) {
        return die(S, p, p.ap < 1 ? `${p.name} has no strength left (0 🎲 AP) and nothing to fight with.`
          : !fleeAdj(S, p).length ? `${p.name} can't fight and has nowhere to run.`
          : `${p.name} can't fight and can't outrun ${t.zombies} zombies.`);
      }
      p.pending = { kind: 'threat' };
    },
  };

  // One round of fighting: no AP to start, weapon loses 1 condition. Each attack kills 1 zombie
  // and costs 1 ammo (gun) or 1 AP (melee).
  function startFight(S, p, uses) {
    const w = weaponOf(p, uses), t = tileOf(S, p);
    w.cond--;
    p.pending = { kind: 'fight', weapon: p.items.indexOf(w), start: t.zombies, shots: 0 };
    emit(S, { type: 'fight', player: p.id, weapon: w.id });
  }
  function attack(S, p) {
    const d = p.pending, w = p.items[d.weapon], t = tileOf(S, p), melee = ITEMS[w.id].uses === 'ap';
    if ((melee ? p.ap : p.res.ammo) < 1 || !t.zombies) return 'Nothing to attack with.';
    if (melee) p.ap--; else p.res.ammo--;
    t.zombies--; d.shots++;
    emit(S, { type: 'hit', player: p.id, weapon: w.id, melee, zombies: t.zombies });
    if (!t.zombies || (melee ? p.ap : p.res.ammo) < 1) endFight(S, p);
  }
  function endFight(S, p) {
    const d = p.pending, w = p.items[d.weapon], t = tileOf(S, p), melee = ITEMS[w.id].uses === 'ap';
    p.pending = null;
    log(S, `${p.name} fights with the ${w.id}: ${plural(d.shots, melee ? 'swing' : 'shot')}, ${plural(d.shots, 'zombie')} down${t.zombies ? `, ${t.zombies} left` : ' — tile cleared!'}.`, t.zombies ? 'bad' : 'good');
    if (w.cond <= 0) {
      p.items.splice(d.weapon, 1);
      log(S, `${ITEMS[w.id].icon} ${p.name}'s ${w.id} breaks!`, 'bad');
    }
    p.queue.unshift({ type: 'threat' });
  }

  function flee(S, p, reroll = false) {
    const t = tileOf(S, p);
    const r = roll(S), ok = r > t.zombies;
    emit(S, { type: 'flee', player: p.id, r, zombies: t.zombies, ok, reroll });
    if (reroll) logRoll(S, `${p.name} rerolls the flee — ${r}${ok ? ': escapes!' : ': caught again!'}`, ok ? 'good' : 'bad');
    else logRoll(S, `${p.name} tries to flee ${plural(t.zombies, 'zombie')} — rolls ${r}${ok ? ': escapes!' : ` (needed more than ${t.zombies}): caught!`}`, ok ? 'good' : 'bad');
    if (ok) return escapeOptions(S, p);
    // Armor can take the punch: −1 armor condition, then reroll (costs 1 AP).
    const armor = armorOf(p);
    if (armor && p.ap >= 1) p.pending = { kind: 'armor', item: p.items.indexOf(armor) };
    else caught(S, p);
  }
  // Failed flee: caught. Without a weapon to fight back with, that's the end.
  function caught(S, p) {
    p.caught = true;
    if (!canFight(p)) return die(S, p, `${p.name} failed to flee and had nothing to fight back with.`);
    log(S, `${p.name} is caught — no escape now, fight!`, 'bad');
    p.queue.unshift({ type: 'threat' });
  }
  // Escape on foot (1 hex, must be zombie-free) or in a vehicle on this tile (several hexes).
  function escapeOptions(S, p) {
    const opts = [{ id: 'foot', label: '🏃 On foot', sub: '1 hex', ok: fleeAdj(S, p).length > 0 }];
    for (const id of Object.keys(ITEMS).filter((k) => ITEMS[k].vehicle)) {
      const v = vehicleOf(S, p, id);
      if (v) opts.push({ id, label: `${ITEMS[id].icon} ${id}`, sub: `1 ${vehicleFuel(v) === 'fuel' ? ICON.fuel : '🎲'} per tile`, ok: vehicleLeft(p, v) > 0 && driveAdj(S, p).length > 0 });
    }
    p.pending = opts.length > 1 ? { kind: 'escape', options: opts } : { kind: 'fleeTo' };
  }

  // ---------------------------------------------------------------- vehicles
  // −1 condition per trip; at 0 it stays parked, broken down, until a Tool repairs it.
  // Only scouted tiles; you can pass through zombie tiles but stopping on one triggers them.
  function startDrive(S, p, id, fleeing = false) {
    const t = tileOf(S, p), v = vehicleOf(S, p, id);
    t.vehicles.splice(t.vehicles.indexOf(v), 1);   // the vehicle travels with you
    p.pending = { kind: 'drive', v, steps: 0, flee: fleeing };
  }
  function driveStep(S, p, q, r) {
    const d = p.pending;
    if (!isAdjacent(p, q, r) || vehicleLeft(p, d.v) < 1) return "Can't drive there.";
    const t = enterHex(S, p, q, r);
    if (!t) return;   // blocked by a Mountain: pick another way
    if (!passable(t)) return "Can't drive there.";
    if (vehicleFuel(d.v) === 'fuel') p.res.fuel--; else p.ap--;
    p.q = q; p.r = r;
    d.steps++;
    emit(S, { type: 'driveStep', player: p.id, vehicle: d.v.id, fuel: vehicleFuel(d.v), q, r });
    if (vehicleLeft(p, d.v) < 1) { emit(S, { type: 'outOfFuel', player: p.id, vehicle: d.v.id, fuel: vehicleFuel(d.v) }); endDrive(S, p); }
  }
  function endDrive(S, p) {
    const { v, steps } = p.pending, def = ITEMS[v.id], t = tileOf(S, p);
    p.pending = null;
    if (steps) {
      v.cond--;
      log(S, `${p.name} ${def.verb.toLowerCase()}s the ${def.icon} ${v.id} ${plural(steps, 'tile')} to the ${t.def.name}.`, t.zombies ? 'bad' : '');
    }
    t.vehicles.push(v);   // parked here — even broken down, so a Tool can fix it
    if (v.cond <= 0) log(S, `${def.icon} The ${v.id} breaks down at the ${t.def.name} — it needs a Tool before it'll go again.`, 'bad');
    if (t.zombies && steps) { log(S, `🧟 ${plural(t.zombies, 'zombie')} at the ${t.def.name}!`, 'bad'); p.queue.unshift({ type: 'threat' }); }
  }

  // ---------------------------------------------------------------- stashes
  // A survivor's stash covers a looted row if there is one, else a random free row (2–6). Up to 5 per tile;
  // your own stash on a tile just grows, and once every row is taken, things join the oldest stash.
  function addToStash(S, t, owner, { res = {}, items = [] }) {
    t.stashes ||= [];
    let s = t.stashes.find((x) => x.owner === owner);
    if (!s) {
      const free = [2, 3, 4, 5, 6].filter((row) => !stashAt(t, row));
      if (free.length) {
        const looted = free.filter((row) => lootRow(t, row).kind === 'looted');
        const pool = looted.length ? looted : free;
        s = { owner, row: pool[Math.floor(rand(S) * pool.length)], res: {}, items: [] };
        t.stashes.push(s);
      } else s = t.stashes[0];
    }
    for (const [k, n] of Object.entries(res)) if (n > 0) s.res[k] = (s.res[k] || 0) + n;
    s.items.push(...items);
    return s;
  }
  // Rolling a stash: all its resources, and its items as far as your backpack allows (you choose if they don't all fit).
  function claimStash(S, p, t, s, at) {
    const got = stashText({ res: s.res, items: [] });
    for (const [k, n] of Object.entries(s.res)) p.res[k] += n;
    s.res = {};
    logRoll(S, `${at}: 🎒 ${s.owner}'s stash${got ? ` — ${got}` : ''}!`, 'good');
    const room = CONFIG.maxItems - p.items.length;
    if (s.items.length <= room) takeFromStash(S, p, t, s, s.items.map((_, i) => i));
    else p.pending = { kind: 'stash', k: key(p.q, p.r), row: s.row, room };
  }
  function takeFromStash(S, p, t, s, picks) {
    const taken = s.items.filter((_, i) => picks.includes(i));
    s.items = s.items.filter((_, i) => !picks.includes(i));
    p.items.push(...taken);
    if (taken.length) log(S, `${p.name} takes ${taken.map((it) => `${ITEMS[it.id].icon} ${it.id}`).join(', ')} from ${s.owner}'s stash.`, 'good');
    if (s.items.length) log(S, `${plural(s.items.length, 'item')} stay in ${s.owner}'s stash.`);
    if (!hasStuff(s)) t.stashes.splice(t.stashes.indexOf(s), 1);   // emptied: the row underneath shows again
  }

  // ---------------------------------------------------------------- items
  // Backpack full: destroy one to make room, or leave the new item (a 'backpack' decision).
  function gainItem(S, p, id, cond) {
    if (ITEMS[id].map) return readMap(S, p);
    if (p.items.length < CONFIG.maxItems) {
      p.items.push({ id, cond });
      log(S, `${p.name} finds a ${ITEMS[id].icon} ${id} (condition ${cond}).`, 'good');
      return;
    }
    p.pending = { kind: 'backpack', item: { id, cond } };
  }

  // A Map is used the moment it's found, like scouting everywhere at once: every unexplored hex
  // next to an explored one is revealed.
  function readMap(S, p) {
    const edge = new Set();
    for (const k of Object.keys(S.tiles)) {
      const [q, r] = k.split(',').map(Number);
      for (const [a, b] of neighbors(q, r)) if (!S.tiles[key(a, b)]) edge.add(key(a, b));
    }
    const found = [...edge].map((k) => reveal(S, ...k.split(',').map(Number)));
    log(S, found.length ? `${ITEMS.Map.icon} ${p.name} reads the Map: ${plural(found.length, 'new place')} revealed.` : `${ITEMS.Map.icon} The Map shows nothing new.`, 'good');
    if (found.length) emit(S, { type: 'scout', player: p.id, tiles: found, map: true });
  }

  // ---------------------------------------------------------------- actions
  // Round actions: one per round. Sleep is free; the rest cost 1 AP.
  function sleep(S, p) {
    const dice = [roll(S), roll(S, true)], r = dice[0] + dice[1];
    const from = p.ap;
    p.ap = Math.min(p.maxAP, p.ap + r);
    emit(S, { type: 'sleep', player: p.id, dice, from, to: p.ap, max: p.maxAP });
    logRoll(S, `${p.name} sleeps — rolls ${dice[0]} + ${dice[1]} — and gains ${p.ap - from} 🎲 AP${from + r > p.maxAP ? ` (max ${p.maxAP})` : ''}.`);
    p.acted = true;
  }

  const ROUND_ACTIONS = {
    sleep,
    fortify(S, p) {
      const t = tileOf(S, p);
      if (p.ap < 1) return 'No AP.';
      if (!canFortifyHere(t)) return "This tile can't be fortified.";
      if (t.zombies) return 'Zombies here block fortifying.';
      const max = maxSafetyOf(t);
      if (t.safety >= max) return `Safety is full (${max}).`;
      p.ap--;
      const r = roll(S), before = t.safety;
      t.safety = Math.min(max, t.safety + r);
      emit(S, { type: 'fortify', player: p.id, k: key(p.q, p.r), name: t.def.name, r, before, after: t.safety, max });
      logRoll(S, `${p.name} fortifies the ${t.def.name} — rolls ${r}: 🟡 ${before} → ${t.safety}${before + r > max ? ` (max ${max})` : ''}.`, 'good');
      p.acted = true;
    },
    scavenge(S, p) {
      const t = tileOf(S, p);
      if (p.ap < 1) return 'No AP.';
      if (!canScavengeHere(t)) return 'Nothing left to scavenge on this tile.';
      if (t.zombies) return 'Zombies here block scavenging.';
      p.ap--;
      p.acted = true;
      // roll 1d6 for the row; a crossed-off row is rolled again — up to CONFIG.maxRerolls times, then you find nothing
      const rows = tableView(t), tries = [];
      do tries.push(roll(S, tries.length > 0)); while (rows[tries.at(-1) - 1].kind === 'looted' && tries.length <= CONFIG.maxRerolls);
      const r = tries.at(-1), hit = rows[r - 1], e = hit.e;
      // then dice for each part: a resource rolls CONFIG.lootDice d6; zombies and an item's condition roll 1d6
      const parts = hit.kind === 'stash' || hit.kind === 'looted' ? [] : e.parts ?? [e];
      const dice = parts.map((x) => Array.from({ length: x.res ? CONFIG.lootDice : ITEMS[x.item]?.map ? 0 : 1 }, () => roll(S, true, x.res ? CONFIG.lootMin : 1)));   // a Map has no condition
      const amts = dice.map((d) => d.reduce((a, b) => a + b, 0)), amt = amts[0] ?? null;
      const c = hit.kind === 'zombies' ? zombieContest(t, amt) : null;
      const snap = (x) => JSON.parse(JSON.stringify(x));   // events carry the table as it was when you rolled
      emit(S, { type: 'scavenge', player: p.id, k: key(p.q, p.r), name: t.def.name, rows: snap(rows), tries, r, hit: snap(hit), amt, amts, dice, c });
      const at = `${p.name} scavenges the ${t.def.name} — rolls ${tries.length > 1 ? `${tries.slice(0, -1).map((x) => `${x} (looted)`).join(', ')}, then ${r}` : r}`;
      if (c) {
        (t.looted ||= []).push(r);   // these zombies have come; the row is clear until they drift back
        applyContest(t, c);
        logRoll(S, `${at}: 🧟 ${plural(amt, 'zombie')}! ${contestText(c)}`, c.left ? 'bad' : 'good');
        if (t.zombies) p.queue.push({ type: 'threat' });
      } else if (hit.kind === 'looted') {
        logRoll(S, `${p.name} scavenges the ${t.def.name} — rolls ${tries.join(', ')}: all looted — finds nothing.`, 'bad');
      } else if (hit.kind === 'stash') {
        claimStash(S, p, t, hit.stash, at);
      } else {
        if (!e.endless) (t.looted ||= []).push(r);   // found: crossed off for good (unless it's Endless)
        const found = parts.map((x, i) => {
          if (x.item) return ITEMS[x.item].map ? `${ITEMS[x.item].icon} ${x.item}` : `${ITEMS[x.item].icon} ${x.item}, condition ${amts[i]}`;
          p.res[x.res] += amts[i] * x.n;
          return `${cellText(x)} → ${dice[i].join(' + ')}${x.n > 1 ? ` ×${x.n}` : ''} = ${amts[i] * x.n} ${ICON[x.res]} ${x.res}`;
        });
        logRoll(S, `${at}: ${found.join(' · ')}.`, 'good');
        parts.forEach((x, i) => {
          if (!x.item) return;
          if (ITEMS[x.item].vehicle) {
            t.vehicles.push({ id: x.item, cond: amts[i] });
            log(S, `${ITEMS[x.item].icon} The ${x.item} is parked at the ${t.def.name}.`, 'good');
          } else gainItem(S, p, x.item, amts[i]);
        });
      }
    },
    // Scouting reveals every unexplored hex next to you (and beyond, with Binoculars), each a random location.
    scout(S, p) {
      const bino = binocularsOf(p);
      if (p.ap < 1) return 'No AP.';
      if (!scoutTargets(S, p).length) return `Everything ${bino ? 'in sight' : 'around you'} is already explored.`;
      p.ap--;
      // the hexes next to you first; then, with Binoculars, what you can see beyond them (Mountains now block)
      const found = emptyAdj(S, p).map(([q, r]) => reveal(S, q, r));
      if (bino) found.push(...scoutTargets(S, p).map(([q, r]) => reveal(S, q, r)));
      const names = found.map((f) => `${/^[aeiou]/i.test(f.name) ? 'an' : 'a'} ${f.icon} ${f.name}`);
      log(S, `${p.name} scouts${bino ? ` with the ${ITEMS[bino.id].icon} ${bino.id}` : ''} and discovers ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]}.`);
      emit(S, { type: 'scout', player: p.id, tiles: found });
      if (bino && --bino.cond <= 0) {   // each scout with them wears them down
        p.items.splice(p.items.indexOf(bino), 1);
        log(S, `${ITEMS[bino.id].icon} The ${bino.id} break.`, 'bad');
      }
      p.acted = true;
    },
    move: (S, p, { q, r }) => moveTo(S, p, q, r, false),
  };

  // Moving: the first move each round is free (no AP, doesn't use your action); another costs 1 AP and is your action.
  // Either way you need at least 1 AP, so at 0 AP the only thing left is to sleep.
  function moveTo(S, p, q, r, free) {
    if (p.ap < 1) return 'No AP — you must sleep.';
    if (!isAdjacent(p, q, r)) return "Can't move there.";
    const t = enterHex(S, p, q, r);
    if (!t) return;   // a Mountain was in the way: revealed, nothing spent
    if (!canEnter(p, t)) return "Can't move there.";
    p.q = q; p.r = r;
    emit(S, { type: 'move', player: p.id, q, r });   // the UI walks you there before anything else plays
    if (free) p.freeMoved = true; else { p.ap--; p.acted = true; }
    log(S, `${p.name} ${free ? 'walks' : 'moves on'} to the ${t.def.name}${t.zombies ? ` — ${plural(t.zombies, 'zombie')} inside!` : ''}.`, t.zombies ? 'bad' : '');
    if (t.zombies) p.queue.push({ type: 'threat' });
  }

  // Free actions: any time you're not in the middle of a decision; they don't use up your round.
  const FREE_ACTIONS = {
    // driving is free movement: the trip is a 'drive' decision you steer hex by hex
    drive(S, p, { vehicle }) {
      if (!canDrive(S, p, vehicle)) return `Can't ${ITEMS[vehicle]?.verb?.toLowerCase() ?? 'use'} that now.`;
      startDrive(S, p, vehicle);
    },
    // Tools: transfer some of the tool's condition to another item (up to its max). A tool at 0 condition is destroyed.
    // target: { from: 'pack' | 'tile', index }
    tool(S, p, { tool: i, target, amount }) {
      const tool = p.items[i], list = target?.from === 'tile' ? tileOf(S, p).vehicles : p.items, it = list?.[target?.index];
      if (!tool || !ITEMS[tool.id]?.tool || !it || it === tool) return 'Pick a tool and an item to repair.';
      if (!(amount >= 1 && amount <= Math.min(tool.cond, CONFIG.maxCondition - it.cond))) return 'Not that much.';
      tool.cond -= amount; it.cond += amount;
      emit(S, { type: 'repair', player: p.id, tool: tool.id, target: it.id, amount });
      log(S, `${p.name} uses the ${ITEMS[tool.id].icon} ${tool.id} on the ${ITEMS[it.id].icon} ${it.id}: +${amount} condition (now ${it.cond}).`, 'good');
      if (tool.cond <= 0) {
        p.items.splice(i, 1);
        log(S, `${ITEMS[tool.id].icon} The ${tool.id} is used up and destroyed.`, 'bad');
      }
    },
    // Pills: a dose (−1 condition) tops your AP up to your max AP (max AP itself doesn't change). Gone at 0.
    pills(S, p, { item: i }) {
      const it = p.items[i];
      if (!it || !ITEMS[it.id]?.pills) return 'Pick some pills to take.';
      if (p.ap >= p.maxAP) return 'Your AP is already full.';
      const ap = p.ap;
      it.cond--; p.ap = p.maxAP;
      emit(S, { type: 'pills', player: p.id, item: it.id, ap, cond: it.cond });
      log(S, `${p.name} takes the ${ITEMS[it.id].icon} ${it.id}: AP ${ap} → ${p.ap}.`, 'good');
      if (it.cond <= 0) {
        p.items.splice(i, 1);
        log(S, `${ITEMS[it.id].icon} The ${it.id} are all gone.`, 'bad');
      }
    },
    // Dropping leaves the item in your stash on this tile — anyone who rolls that row can take it.
    drop(S, p, { item: i }) {
      const it = p.items[i], t = tileOf(S, p);
      if (!it) return 'No such item.';
      p.items.splice(i, 1);
      const s = addToStash(S, t, p.name, { items: [it] });
      log(S, `${p.name} leaves their ${ITEMS[it.id].icon} ${it.id} in ${s.owner === p.name ? 'their' : `${s.owner}'s`} stash at the ${t.def.name} (row ${s.row}).`);
    },
    give(S, p, { to, res }) {
      const o = S.players[to];
      if (!o || o === p || o.dead || o.q !== p.q || o.r !== p.r || !(p.res[res] >= 1)) return "Can't give that.";
      p.res[res]--; o.res[res]++;
      log(S, `${p.name} gives 1 ${ICON[res]} ${res} to ${o.name}.`);
    },
  };

  // Answers to pending decisions.
  const DECISIONS = {
    threat(S, p, choice) {
      const t = tileOf(S, p);
      if (choice === 'shoot' && canShoot(p)) { p.pending = null; return startFight(S, p, 'ammo'); }
      if (choice === 'melee' && canMelee(p)) { p.pending = null; return startFight(S, p, 'ap'); }
      if (choice === 'flee' && canFlee(S, p, t)) { p.pending = null; p.ap--; return flee(S, p); }
      return "You can't do that now.";
    },
    fight(S, p, choice) {
      if (choice === 'attack') return attack(S, p);
      if (choice === 'stop') return endFight(S, p);
      return 'Attack or stop.';
    },
    armor(S, p, yes) {
      const armor = p.items[p.pending.item];
      p.pending = null;
      if (!yes) return caught(S, p);
      armor.cond--; p.ap--;
      emit(S, { type: 'armor', player: p.id, item: armor.id, cond: armor.cond });
      log(S, `${ITEMS[armor.id].icon} ${p.name}'s ${armor.id} takes the hit (condition ${armor.cond}).`, 'good');
      if (armor.cond <= 0) { p.items.splice(p.items.indexOf(armor), 1); log(S, `${ITEMS[armor.id].icon} The ${armor.id} is destroyed.`, 'bad'); }
      flee(S, p, true);
    },
    escape(S, p, choice) {
      const o = p.pending.options.find((x) => x.id === choice && x.ok);
      if (!o) return 'Pick a way out.';
      if (choice === 'foot') p.pending = { kind: 'fleeTo' };
      else startDrive(S, p, choice, true);
    },
    fleeTo(S, p, { q, r } = {}) {
      if (!isAdjacent(p, q, r)) return 'Pick a safe hex next to you.';
      const t = enterHex(S, p, q, r);
      if (!t) {   // ran into a Mountain: pick another way out — if there is one
        if (!fleeAdj(S, p).length) { p.pending = null; caught(S, p); }
        return;
      }
      if (!passable(t) || t.zombies) return 'Pick a safe hex next to you.';
      log(S, `${p.name} flees to the ${t.def.name}.`, 'bad');
      p.q = q; p.r = r;
      emit(S, { type: 'move', player: p.id, q, r });
      p.pending = null; p.caught = false;
    },
    drive(S, p, choice) {
      if (choice === 'stop') {
        if (p.pending.flee && !p.pending.steps) return 'Pick at least one hex to escape to.';
        return endDrive(S, p);
      }
      return driveStep(S, p, choice?.q, choice?.r);
    },
    // indices of the stash's items to take (up to the room in your backpack); the rest stay
    stash(S, p, picks) {
      const d = p.pending, t = S.tiles[d.k], s = stashAt(t, d.row);
      if (!s) { p.pending = null; return void log(S, 'The stash is gone.', 'bad'); }   // someone else emptied it first
      if (!Array.isArray(picks) || new Set(picks).size !== picks.length || picks.length > d.room
        || picks.some((i) => !(i >= 0 && i < s.items.length))) return `Pick up to ${d.room} items.`;
      p.pending = null;
      takeFromStash(S, p, t, s, picks);
    },
    // index of the item to destroy (the new item is last: choosing it leaves it behind)
    backpack(S, p, i) {
      const item = p.pending.item, all = [...p.items, item];
      if (!(i >= 0 && i < all.length)) return 'Pick an item to destroy.';
      p.pending = null;
      const gone = all.splice(i, 1)[0];
      p.items = all;
      log(S, gone === item
        ? `${p.name} leaves the ${ITEMS[item.id].icon} ${item.id} behind — backpack full.`
        : `${p.name} destroys their ${ITEMS[gone.id].icon} ${gone.id} to carry the ${ITEMS[item.id].icon} ${item.id}.`, 'bad');
    },
  };

  // The one entry point for players. action: { type, ...args }
  function act(S, id, action) {
    const p = S.players[id];
    return run(S, () => {
      if (S.over) return 'The game is over.';
      if (!p || p.dead) return "You're dead.";
      if (action.type === 'decide') {
        if (!p.pending) return 'Nothing to decide.';
        return DECISIONS[p.pending.kind](S, p, action.choice);
      }
      if (p.pending || p.queue.length) return 'Deal with what is happening first.';
      if (action.type === 'move' && !p.freeMoved) return moveTo(S, p, action.q, action.r, true);
      if (FREE_ACTIONS[action.type]) return FREE_ACTIONS[action.type](S, p, action);
      if (ROUND_ACTIONS[action.type]) {
        if (p.acted) return 'You have already acted this round.';
        return ROUND_ACTIONS[action.type](S, p, action);
      }
      return `Unknown action "${action.type}".`;
    });
  }

  // ---------------------------------------------------------------- cheats (testing; admin-only once online)
  // Returns { events, say } — `say` is the message to show.
  function cheat(S, id, cmd, n) {
    const p = S.players[id], t = tileOf(S, p);
    let say = '';
    const busy = p.pending || p.queue.length;
    const res = run(S, () => {
      switch (cmd) {
        case 'roll': S.forced.push(...n.filter((v) => typeof v === 'number')); say = `Next rolls forced: ${S.forced.join(', ')}`; break;
        case 'scavenge':
          if (busy) { say = 'Busy — deal with what is happening first.'; break; }
          if (p.ap < 1) { say = 'No AP — use ap(n) first.'; break; }
          if (!canScavengeHere(t)) { say = 'Nothing left to scavenge on this tile.'; break; }
          if (t.zombies) { say = 'Zombies here block scavenging — use zombies(0).'; break; }
          S.forced = [...n];   // table roll, then any of the amount dice
          say = `Scavenge forced: ${n.join(', ')}`;
          ROUND_ACTIONS.scavenge(S, p);
          S.forced = [];   // a looted or stash row doesn't use the second die
          break;
        case 'sleep': {   // sleep(8) splits the total over the two dice; sleep(3,5) sets each die
          if (busy) { say = 'Busy — deal with what is happening first.'; break; }
          const total = Math.max(2, Math.min(12, n[0] ?? 12));
          S.forced = n.length > 1 ? [n[0], n[1]] : [Math.min(6, total - 1), total - Math.min(6, total - 1)];
          say = `Sleep forced: ${S.forced.join(' + ')}`;
          sleep(S, p); break;
        }
        case 'fortify':
          if (busy) { say = 'Busy — deal with what is happening first.'; break; }
          if (p.ap < 1) { say = 'No AP — use ap(n) first.'; break; }
          if (!canFortifyHere(t)) { say = "This tile can't be fortified."; break; }
          S.forced = [n[0] ?? 6]; say = `Fortify forced: ${n[0]}`;
          { const err = ROUND_ACTIONS.fortify(S, p); if (err) { S.forced = []; say = err; } }
          break;
        case 'flee': S.forced.push(n[0] ?? 6); say = `Next flee roll forced: ${n[0]}`; break;
        case 'night': S.forced = [n[0] ?? 6]; say = `Night attack: ${n[0]} zombies`; nightAttack(S); break;
        case 'zombies':
          t.zombies = Math.max(0, Math.min(CONFIG.maxZombies, n[0] ?? 0)); say = `Zombies here: ${t.zombies}`;
          if (t.zombies) p.queue.push({ type: 'threat' });
          break;
        case 'safety': t.safety = Math.max(0, Math.min(maxSafetyOf(t), n[0] ?? 0)); say = `Safety here: ${t.safety}`; break;
        case 'item': {
          const item = Object.keys(ITEMS).find((k) => k.toLowerCase().replace(/\s/g, '') === String(n[0] ?? '').toLowerCase().replace(/\s/g, ''));
          if (!item) { say = `Unknown item. Items: ${Object.keys(ITEMS).join(', ')}`; break; }
          const cond = Math.max(1, Math.min(CONFIG.maxCondition, n[1] ?? CONFIG.maxCondition));
          if (ITEMS[item].vehicle) { t.vehicles.push({ id: item, cond }); say = `${item} (${cond}) parked here`; } else { gainItem(S, p, item, cond); say = `${item} (${cond}) added`; }
          break;
        }
        case 'ap': p.ap = Math.max(0, Math.min(p.maxAP, n[0] ?? 0)); say = `AP: ${p.ap}`; break;
        case 'maxap': p.maxAP = Math.max(1, Math.min(CONFIG.maxAP, n[0] ?? CONFIG.maxAP)); p.ap = Math.min(p.ap, p.maxAP); say = `Max AP: ${p.maxAP}`; break;
        case 'food': case 'water': case 'booze': case 'fuel': case 'ammo': p.res[cmd] = Math.max(0, n[0] ?? 0); say = `${cmd}: ${p.res[cmd]}`; break;
        case 'checks': {
          const v = String(n[0] ?? '').toLowerCase();
          S.checksOff = v === 'off' ? true : v === 'on' ? false : !S.checksOff;
          say = `Resource checks ${S.checksOff ? 'OFF — no food, water or booze is taken' : 'ON'}`; break;
        }
        case 'badnight': {
          const v = String(n[0] ?? '').toLowerCase();
          S.badNight = v === 'off' ? false : v === 'on' ? true : !S.badNight;
          say = `Bad night ${S.badNight ? 'ON — round 6 attacks too' : 'OFF'}`; break;
        }
        case 'round': S.round = Math.max(1, Math.min(6, n[0] ?? 1)); say = `Round ${S.round}`; break;
        case 'day': S.day = Math.max(1, n[0] ?? 1); say = `Day ${S.day}`; break;
        default: say = `Unknown cheat "${cmd}" — try help()`;
      }
    });
    return { ...res, say };
  }

  return {
    ICON, RES_LABEL, key, neighbors, isNight, isAttack, attackDue, cellText, upkeepText, roundBanner,
    tileOf, emptyAdj, scoutTargets, binocularsOf, tileAdj, passable, driveAdj, weaponOf, armorOf, canEnter, moveAdj, canScavengeHere, canFortifyHere, maxSafetyOf, tableView, stashText,
    fleeAdj, canShoot, canMelee, canFight, canFlee, vehicleFuel, vehicleLeft, vehicleOf, canDrive,
    createGame, start, act, timeUp, cheat,
  };
})();

if (typeof module !== 'undefined') module.exports = Engine;
