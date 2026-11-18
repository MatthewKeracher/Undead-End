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
  const ICON = { food: '🔴', water: '🔵', hope: '🟣', fuel: '🟠', ammo: '🟢', safety: '🟡', ap: '🎲' };
  const RES_LABEL = { food: 'Food', water: 'Water', hope: 'Hope', fuel: 'Fuel', ammo: 'Ammo' };
  const COLORS = ['#e4572e', '#29a3d6', '#f3c13a', '#9b5de5', '#2ec4b6', '#ff7eb6'];
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

  const key = (q, r) => `${q},${r}`;
  const neighbors = (q, r) => DIRS.map(([a, b]) => [q + a, r + b]);
  const isAdjacent = (p, q, r) => neighbors(p.q, p.r).some(([a, b]) => a === q && b === r);
  const isNight = (r) => CONFIG.nightRounds.includes(r);
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
  function roll(S, keep = false) {
    if (!keep) S.rolls = [];
    const v = S.forced.length ? S.forced.shift() : d6(S);
    S.rolls.push(v);
    return v;
  }

  // ---------------------------------------------------------------- lookups
  const tileOf = (S, p) => S.tiles[key(p.q, p.r)];
  const emptyAdj = (S, p) => neighbors(p.q, p.r).filter(([q, r]) => !S.tiles[key(q, r)]);
  const tileAdj = (S, p) => neighbors(p.q, p.r).filter(([q, r]) => S.tiles[key(q, r)]);
  // Impassable tiles (e.g. Mountain) can't be moved, fled or driven onto.
  const passable = (t) => !!t && t.def.passable;
  const driveAdj = (S, p) => tileAdj(S, p).filter(([q, r]) => passable(S.tiles[key(q, r)]));
  // A weapon's `uses` says what each attack spends: 'ammo' (gun: 1 ammo per shot) or 'ap' (melee: 1 AP per swing).
  // With several of the same kind, the one with the lowest condition is used first.
  const weaponOf = (p, uses) => p.items
    .filter((it) => ITEMS[it.id]?.weapon && it.cond > 0 && (!uses || ITEMS[it.id].uses === uses))
    .sort((a, b) => a.cond - b.cond)[0];
  const armorOf = (p) => p.items.filter((it) => ITEMS[it.id]?.armor && it.cond > 0).sort((a, b) => a.cond - b.cond)[0];
  // Tiles with zombies can only be entered by a player carrying a weapon.
  const canEnter = (p, t) => passable(t) && (!t.zombies || !!weaponOf(p));
  const moveAdj = (S, p) => tileAdj(S, p).filter(([q, r]) => canEnter(p, S.tiles[key(q, r)]));
  const canScavengeHere = (t) => t.def.table.length > 0;   // tiles without a table (e.g. Wasteland) have nothing to find
  const canFortifyHere = (t) => t.def.fortify;
  // Fleeing: only to an adjacent, already-scouted, passable tile with no zombies.
  const fleeAdj = (S, p) => neighbors(p.q, p.r).filter(([q, r]) => { const t = S.tiles[key(q, r)]; return passable(t) && !t.zombies; });
  const canShoot = (p) => !!weaponOf(p, 'ammo') && p.res.ammo > 0;
  const canMelee = (p) => !!weaponOf(p, 'ap') && p.ap >= 1;
  const canFight = (p) => canShoot(p) || canMelee(p);
  // After a failed flee (and no armor reroll) you're caught: no more fleeing this encounter.
  const canFlee = (S, p, t) => !p.caught && p.ap >= 1 && fleeAdj(S, p).length > 0 && t.zombies < 6;

  // Vehicles sit on tiles (not in the backpack). Truck: 1 fuel per tile. Bike: 1 AP per tile.
  const vehicleFuel = (v) => ITEMS[v.id].uses;                 // 'fuel' | 'ap'
  const vehicleLeft = (p, v) => (vehicleFuel(v) === 'fuel' ? p.res.fuel : p.ap);
  const vehicleOf = (S, p, id) => (tileOf(S, p).vehicles || []).filter((v) => v.id === id && v.cond > 0).sort((a, b) => a.cond - b.cond)[0];
  const canDrive = (S, p, id) => { const v = vehicleOf(S, p, id); return !!v && vehicleLeft(p, v) > 0 && driveAdj(S, p).length > 0; };

  function cellText(e) {
    if (e.zombies) return e.zombies > 1 ? `Zombies ×${e.zombies}` : 'Zombies';
    if (e.item) return e.item;
    const mult = { 2: 'Double', 3: 'Triple', 4: 'Quadruple' }[e.n];
    return e.n > 1 ? (mult ? `${mult} ${RES_LABEL[e.res]}` : `${RES_LABEL[e.res]} ×${e.n}`) : RES_LABEL[e.res];
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
  const newTile = (def, safety = 0) => ({ def, safety, zombies: 0, vehicles: [] });

  // autoEnd: the round ends as soon as every survivor has acted (single player).
  // Without it, the host ends rounds with timeUp() (the 30 s timer).
  function createGame({ names = ['Survivor'], seed = (Math.random() * 2 ** 32) >>> 0, autoEnd = true, checksOff = false } = {}) {
    const S = {
      seed, rng: seed | 0, day: CONFIG.startDay, round: CONFIG.startRound, tiles: {}, players: [],
      log: [], events: [], rolls: [], forced: [], autoEnd, timesUp: false, checksOff, over: null,
    };
    S.tiles[key(0, 0)] = newTile(START_TILE, CONFIG.startSafety);
    for (const id of CONFIG.testStartVehicles || []) S.tiles[key(0, 0)].vehicles.push({ id, cond: CONFIG.maxCondition });
    names.forEach((name, i) => {
      // full AP; food, water and hope each start at 1d6
      const p = {
        id: i, name, color: COLORS[i % COLORS.length], q: 0, r: 0, ap: CONFIG.startMaxAP, maxAP: CONFIG.startMaxAP,
        res: { ...CONFIG.startRes }, items: [], dead: false, acted: false, caught: false, pending: null, queue: [],
      };
      for (const k of ['food', 'water', 'hope']) p.res[k] = d6(S);
      for (const id of CONFIG.testStartItems || []) p.items.push({ id, cond: CONFIG.maxCondition });
      for (const [k, n] of Object.entries(CONFIG.testStartRes || {})) p.res[k] += n;
      S.players.push(p);
    });
    log(S, `Day ${S.day} begins. ${plural(names.length, 'survivor')} shelter at the ${START_TILE.name}.`, 'phase');
    for (const p of S.players) {
      S.log.push({ msg: `${p.name} starts with full 🎲 ${p.ap} AP, ${p.res.food} ${ICON.food} food, ${p.res.water} ${ICON.water} water, ${p.res.hope} ${ICON.hope} hope.`, cls: '', dice: [p.res.food, p.res.water, p.res.hope] });
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
    return { events: S.events };
  }

  // Run each player's queued steps until they need a decision; end the round when everyone's done.
  function settle(S) {
    for (let guard = 0; guard < 1000 && !S.over; guard++) {
      let progressed = false;
      for (const p of S.players) {
        while (!p.dead && !p.pending && p.queue.length && !S.over) { STEPS[p.queue.shift().type](S, p); progressed = true; }
      }
      if (S.over) return;
      // time's up: anyone who hasn't acted sleeps — those mid-decision once it's done (the round waits for them)
      if (S.timesUp) for (const p of S.players) if (!p.dead && !p.acted && !busyPlayer(p)) { log(S, `⏱️ ${p.name} didn't choose in time and sleeps.`); sleep(S, p); }
      if ((S.autoEnd || S.timesUp) && roundDone(S)) { S.timesUp = false; endRound(S); continue; }
      if (!progressed) return;
    }
  }
  const busyPlayer = (p) => !!p.pending || p.queue.length > 0;
  const roundDone = (S) => S.players.every((p) => p.dead || (p.acted && !busyPlayer(p)));

  function endRound(S) {
    S.round++;
    if (S.round > 6) { S.round = 1; S.day++; log(S, `☀️→🌙 Day ${S.day} begins.`, 'phase'); }
    log(S, roundBanner(S), 'phase');
    for (const p of S.players) p.acted = false;
    emit(S, { type: 'round', day: S.day, round: S.round });
    startOfRound(S);
  }

  // The 30 s timer ran out (multiplayer, or the optional single-player timer). See settle().
  const timeUp = (S) => run(S, () => { S.timesUp = true; });

  // Everything that happens at the START of a round, before anyone acts:
  // 1) this round's resource check, 2) the night attack on night rounds.
  // Food & water feed max AP: each check paid → +trackGain (max 12); each missed → −trackLoss. Max AP 0 = death.
  // A Hope check you can't pay is death.
  function startOfRound(S) {
    const r = S.round;
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
            p.maxAP = Math.min(CONFIG.maxAP, p.maxAP + CONFIG.trackGain);
            log(S, `${p.name} uses ${n} ${ICON[res]} ${res} — max AP ${oldMax} → ${p.maxAP}.`, 'good');
          } else log(S, `${p.name} uses ${n} ${ICON[res]} ${res}.`);
        } else if (body) {
          const oldMax = p.maxAP, oldAp = p.ap;
          p.res[res] = 0;
          p.maxAP = Math.max(0, p.maxAP - CONFIG.trackLoss);
          p.ap = Math.min(p.ap, p.maxAP);
          emit(S, { type: 'maxApLoss', player: p.id, res, oldMax, newMax: p.maxAP, oldAp, newAp: p.ap });
          log(S, `${p.name} has no ${res}! Max AP ${oldMax} → ${p.maxAP}.`, 'bad');
          if (p.maxAP <= 0) die(S, p, `${p.name} ${res === 'food' ? 'starved' : 'died of thirst'} (max AP 0).`);
        } else if (res === 'hope') {
          p.res[res] = 0;
          die(S, p, `${p.name} has lost all hope (no ${ICON.hope} hope to give).`);
        } else {
          p.res[res] = 0;
          log(S, `${p.name} has no ${res}!`, 'bad');
        }
      }
    }
    if (S.over) return;
    emit(S, { type: 'checks', stats: Object.fromEntries(S.players.map((p) => [p.id, statsOf(p)])) });
    if (isNight(r)) nightAttack(S);
  }

  // ---------------------------------------------------------------- zombies
  // 1d6 zombies arrive: each one cancels (and uses up) a point of Safety; the rest
  // fill the tile's circles as zombies, up to 6.
  function zombieContest(t, n) {
    const absorbed = Math.min(t.safety, n), left = n - absorbed;
    const zombies = Math.min(CONFIG.maxSafety, (t.zombies || 0) + left);
    return { n, absorbed, left, before: { safety: t.safety, zombies: t.zombies || 0 }, after: { safety: t.safety - absorbed, zombies } };
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
  // −1 condition per trip. Only scouted tiles; you can pass through zombie tiles but stopping on one triggers them.
  function startDrive(S, p, id, fleeing = false) {
    const t = tileOf(S, p), v = vehicleOf(S, p, id);
    t.vehicles.splice(t.vehicles.indexOf(v), 1);   // the vehicle travels with you
    p.pending = { kind: 'drive', v, steps: 0, flee: fleeing };
  }
  function driveStep(S, p, q, r) {
    const d = p.pending, t = S.tiles[key(q, r)];
    if (!isAdjacent(p, q, r) || !passable(t) || vehicleLeft(p, d.v) < 1) return "Can't drive there.";
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
    if (v.cond > 0) t.vehicles.push(v);
    else log(S, `${def.icon} The ${v.id} breaks down for good.`, 'bad');
    if (t.zombies && steps) { log(S, `🧟 ${plural(t.zombies, 'zombie')} at the ${t.def.name}!`, 'bad'); p.queue.unshift({ type: 'threat' }); }
  }

  // ---------------------------------------------------------------- items
  // Backpack full: destroy one to make room, or leave the new item (a 'backpack' decision).
  function gainItem(S, p, id, cond) {
    if (p.items.length < CONFIG.maxItems) {
      p.items.push({ id, cond });
      log(S, `${p.name} finds a ${ITEMS[id].icon} ${id} (condition ${cond}).`, 'good');
      return;
    }
    p.pending = { kind: 'backpack', item: { id, cond } };
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
      if (t.safety >= CONFIG.maxSafety) return `Safety is full (${CONFIG.maxSafety}).`;
      p.ap--;
      const r = roll(S), before = t.safety;
      t.safety = Math.min(CONFIG.maxSafety, t.safety + r);
      emit(S, { type: 'fortify', player: p.id, k: key(p.q, p.r), name: t.def.name, r, before, after: t.safety });
      logRoll(S, `${p.name} fortifies the ${t.def.name} — rolls ${r}: 🟡 ${before} → ${t.safety}${before + r > CONFIG.maxSafety ? ` (max ${CONFIG.maxSafety})` : ''}.`, 'good');
      p.acted = true;
    },
    scavenge(S, p) {
      const t = tileOf(S, p);
      if (p.ap < 1) return 'No AP.';
      if (!canScavengeHere(t)) return 'Nothing to scavenge on this tile.';
      if (t.zombies) return 'Zombies here block scavenging.';
      p.ap--;
      p.acted = true;
      const r = roll(S), e = t.def.table[r - 1];
      const amt = roll(S, true);
      const c = e.zombies ? zombieContest(t, amt) : null;
      emit(S, { type: 'scavenge', player: p.id, k: key(p.q, p.r), name: t.def.name, table: t.def.table, r, e, amt, c });
      if (c) {
        applyContest(t, c);
        logRoll(S, `${p.name} scavenges the ${t.def.name} — rolls ${r}: 🧟 ${plural(amt, 'zombie')}! ${contestText(c)}`, c.left ? 'bad' : 'good');
        if (t.zombies) p.queue.push({ type: 'threat' });
      } else if (e.item) {
        logRoll(S, `${p.name} scavenges the ${t.def.name} — rolls ${r}: ${ITEMS[e.item].icon} ${e.item}, condition ${amt}.`, 'good');
        if (ITEMS[e.item].vehicle) {
          t.vehicles.push({ id: e.item, cond: amt });
          log(S, `${ITEMS[e.item].icon} The ${e.item} is parked at the ${t.def.name}.`, 'good');
        } else gainItem(S, p, e.item, amt);
      } else {
        const got = amt * e.n;
        p.res[e.res] += got;
        logRoll(S, `${p.name} scavenges the ${t.def.name} — rolls ${r}: ${cellText(e)} → rolls ${amt}${e.n > 1 ? ` ×${e.n}` : ''} = ${got} ${ICON[e.res]} ${e.res}.`, 'good');
      }
    },
    scout(S, p, { q, r }) {
      const k = key(q, r);
      if (p.ap < 1) return 'No AP.';
      if (!isAdjacent(p, q, r) || S.tiles[k]) return 'Scout an unexplored hex next to you.';
      const def = TILES[Math.floor(rand(S) * TILES.length)];
      S.tiles[k] = newTile(def);
      p.ap--;
      log(S, `${p.name} scouts and discovers a ${def.icon} ${def.name}.`);
      emit(S, { type: 'scout', player: p.id, k, name: def.name, icon: def.icon });
      p.acted = true;
    },
    move(S, p, { q, r }) {
      const t = S.tiles[key(q, r)];
      if (p.ap < 1) return 'No AP.';
      if (!isAdjacent(p, q, r) || !t || !canEnter(p, t)) return "Can't move there.";
      p.q = q; p.r = r; p.ap--;
      log(S, `${p.name} moves to the ${t.def.name}${t.zombies ? ` — ${plural(t.zombies, 'zombie')} inside!` : ''}.`, t.zombies ? 'bad' : '');
      if (t.zombies) p.queue.push({ type: 'threat' });
      p.acted = true;
    },
  };

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
    // Dropping destroys the item (in multiplayer it will become a stash on the tile).
    drop(S, p, { item: i }) {
      const it = p.items[i];
      if (!it) return 'No such item.';
      p.items.splice(i, 1);
      log(S, `${p.name} destroys their ${ITEMS[it.id].icon} ${it.id}.`, 'bad');
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
      const t = S.tiles[key(q, r)];
      if (!isAdjacent(p, q, r) || !passable(t) || t.zombies) return 'Pick a safe hex next to you.';
      log(S, `${p.name} flees to the ${t.def.name}.`, 'bad');
      p.q = q; p.r = r;
      p.pending = null; p.caught = false;
    },
    drive(S, p, choice) {
      if (choice === 'stop') {
        if (p.pending.flee && !p.pending.steps) return 'Pick at least one hex to escape to.';
        return endDrive(S, p);
      }
      return driveStep(S, p, choice?.q, choice?.r);
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
          if (!canScavengeHere(t)) { say = 'Nothing to scavenge on this tile.'; break; }
          if (t.zombies) { say = 'Zombies here block scavenging — use zombies(0).'; break; }
          S.forced = [n[0], n[1] ?? d6(S)];
          say = `Scavenge forced: ${n.join(', ')}`;
          ROUND_ACTIONS.scavenge(S, p); break;
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
          t.zombies = Math.max(0, Math.min(6, n[0] ?? 0)); say = `Zombies here: ${t.zombies}`;
          if (t.zombies) p.queue.push({ type: 'threat' });
          break;
        case 'safety': t.safety = Math.max(0, Math.min(CONFIG.maxSafety, n[0] ?? 0)); say = `Safety here: ${t.safety}`; break;
        case 'item': {
          const item = Object.keys(ITEMS).find((k) => k.toLowerCase().replace(/\s/g, '') === String(n[0] ?? '').toLowerCase().replace(/\s/g, ''));
          if (!item) { say = `Unknown item. Items: ${Object.keys(ITEMS).join(', ')}`; break; }
          const cond = Math.max(1, Math.min(CONFIG.maxCondition, n[1] ?? CONFIG.maxCondition));
          if (ITEMS[item].vehicle) { t.vehicles.push({ id: item, cond }); say = `${item} (${cond}) parked here`; } else { gainItem(S, p, item, cond); say = `${item} (${cond}) added`; }
          break;
        }
        case 'ap': p.ap = Math.max(0, Math.min(p.maxAP, n[0] ?? 0)); say = `AP: ${p.ap}`; break;
        case 'maxap': p.maxAP = Math.max(1, Math.min(CONFIG.maxAP, n[0] ?? CONFIG.maxAP)); p.ap = Math.min(p.ap, p.maxAP); say = `Max AP: ${p.maxAP}`; break;
        case 'food': case 'water': case 'hope': case 'fuel': case 'ammo': p.res[cmd] = Math.max(0, n[0] ?? 0); say = `${cmd}: ${p.res[cmd]}`; break;
        case 'checks': {
          const v = String(n[0] ?? '').toLowerCase();
          S.checksOff = v === 'off' ? true : v === 'on' ? false : !S.checksOff;
          say = `Resource checks ${S.checksOff ? 'OFF — no food, water or hope is taken' : 'ON'}`; break;
        }
        case 'round': S.round = Math.max(1, Math.min(6, n[0] ?? 1)); say = `Round ${S.round}`; break;
        case 'day': S.day = Math.max(1, n[0] ?? 1); say = `Day ${S.day}`; break;
        default: say = `Unknown cheat "${cmd}" — try help()`;
      }
    });
    return { ...res, say };
  }

  return {
    ICON, RES_LABEL, key, neighbors, isNight, cellText, upkeepText, roundBanner,
    tileOf, emptyAdj, tileAdj, passable, driveAdj, weaponOf, armorOf, canEnter, moveAdj, canScavengeHere, canFortifyHere,
    fleeAdj, canShoot, canMelee, canFight, canFlee, vehicleFuel, vehicleLeft, vehicleOf, canDrive,
    createGame, start, act, timeUp, cheat,
  };
})();

if (typeof module !== 'undefined') module.exports = Engine;
