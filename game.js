// =====================================================================
//  GAME ENGINE
// =====================================================================

const RES = ['food', 'water', 'morale', 'fuel', 'ammo'];
const ICON = { food: '🔴', water: '🔵', morale: '🟣', fuel: '🟠', ammo: '🟢', safety: '🟡', ap: '🎲' };
const DIE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const COLORS = ['#e4572e', '#29a3d6', '#f3c13a', '#9b5de5', '#2ec4b6', '#ff7eb6'];
const HEX = 120;
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const key = (q, r) => `${q},${r}`;
const d6 = () => 1 + Math.floor(Math.random() * 6);
const isNight = (r) => CONFIG.nightRounds.includes(r);
const neighbors = (q, r) => DIRS.map(([a, b]) => [q + a, r + b]);
// Keys around S pick a neighbouring hex, laid out like the hexes themselves:
//   Q W        top-left, top-right
//  A   D       left, right
//   Z X        bottom-left, bottom-right
const PICK_DIRS = [[-1, 0], [0, -1], [1, -1], [1, 0], [0, 1], [-1, 1]];
const PICK_KEYS = ['a', 'q', 'w', 'd', 'x', 'z'];
const PICK_MODES = ['scout', 'move', 'flee', 'drive'];
function pickNumber(p, q, r) {
  const i = PICK_DIRS.findIndex(([a, b]) => p.q + a === q && p.r + b === r);
  return i < 0 ? null : PICK_KEYS[i].toUpperCase();
}

let G = null;        // game state
let mode = null;     // 'scout' | 'move' | 'threat' | 'flee' | null
let fleeDone = null;  // resolves the pending flee-destination pick
let threatChoice = null; // resolves the pending Fight / Flee choice
let driving = null;   // { p, v, steps, done } while a vehicle trip is in progress
let modalKey = null;  // when set, receives all key presses (shooting, backpack-full prompt)
let rolls = [];       // dice rolled by the last action: [{ value, label }]
let rollsFresh = false;

const cur = () => G.players[G.turn];
const tileOf = (p) => G.tiles[key(p.q, p.r)];
const emptyAdj = (p) => neighbors(p.q, p.r).filter(([q, r]) => !G.tiles[key(q, r)]);
const tileAdj = (p) => neighbors(p.q, p.r).filter(([q, r]) => G.tiles[key(q, r)]);
// Items
// A weapon's `uses` says what each attack spends: 'ammo' (gun: 1 ammo per shot) or 'ap' (melee: 1 AP per swing).
// With several of the same kind, the one with the lowest condition is used first.
const weaponOf = (p, uses) => p.items
  .filter((it) => ITEMS[it.id]?.weapon && it.cond > 0 && (!uses || ITEMS[it.id].uses === uses))
  .sort((a, b) => a.cond - b.cond)[0];
// Tiles with zombies can only be entered by a player carrying a weapon.
const canEnter = (p, t) => !t.zombies || !!weaponOf(p);
const moveAdj = (p) => tileAdj(p).filter(([q, r]) => canEnter(p, G.tiles[key(q, r)]));
// Fleeing: only to an adjacent, already-scouted tile with no zombies.
const fleeAdj = (p) => neighbors(p.q, p.r).filter(([q, r]) => { const t = G.tiles[key(q, r)]; return t && !t.zombies; });
const playersAt = (q, r) => G.players.filter((p) => p.q === q && p.r === r);

function log(msg, cls = '') { G.log.push({ msg, cls }); }
// log a message with the dice just rolled shown beside it
function logRoll(msg, cls = '') { G.log.push({ msg, cls, dice: rolls.map((d) => d.value) }); }

function upkeepText(r) {
  return Object.entries(CONFIG.upkeep[r] || {}).map(([res, n]) => `${n} ${ICON[res]}`).join(' ');
}

// ---------------------------------------------------------------- setup
function newGame(names) {
  G = { day: CONFIG.startDay, round: CONFIG.startRound, turn: 0, tiles: {}, players: [], log: [] };
  G.tiles[key(0, 0)] = { def: START_TILE, safety: CONFIG.startSafety, zombies: 0, vehicles: [] };
  for (const id of CONFIG.testStartVehicles || []) G.tiles[key(0, 0)].vehicles.push({ id, cond: CONFIG.maxCondition });
  names.forEach((name, i) => {
    // AP, food, water and morale each start at 1d6
    const p = { name, color: COLORS[i % COLORS.length], q: 0, r: 0, ap: d6(), maxAP: CONFIG.startMaxAP, res: { ...CONFIG.startRes }, items: [], skip: false };
    for (const k of ['food', 'water', 'morale']) p.res[k] = d6();
    p.ap = Math.min(p.ap, p.maxAP);
    for (const id of CONFIG.testStartItems || []) p.items.push({ id, cond: CONFIG.maxCondition });
    for (const [k, n] of Object.entries(CONFIG.testStartRes || {})) p.res[k] += n;
    G.players.push(p);
  });
  $('#popup').hidden = true; busy = false;
  logSeen = 0; rolls = []; forced = []; mode = null; fleeDone = null; driving = null; threatChoice = null; modalKey = null; logShown = Infinity; // forces log reset on next render
  log(`Day ${G.day} begins. ${names.length} survivor${names.length > 1 ? 's' : ''} shelter at the ${START_TILE.name}.`, 'phase');
  for (const p of G.players) {
    G.log.push({ msg: `${p.name} starts with ${p.ap} 🎲 AP, ${p.res.food} ${ICON.food} food, ${p.res.water} ${ICON.water} water, ${p.res.morale} ${ICON.morale} morale.`, cls: '', dice: [p.ap, p.res.food, p.res.water, p.res.morale] });
  }
  log(roundBanner(), 'phase');
  prevStats = {};
  render();
  // the starting round's check happens straight away (after a beat so you see your starting resources)
  setTimeout(async () => { await startOfRound(); render(); if (G.over) showGameOver(); }, 600);
}

function roundBanner() {
  return `Day ${G.day}, Round ${G.round} — ${isNight(G.round) ? '🌙 Night' : '☀️ Day'}`;
}

// ---------------------------------------------------------------- turn flow
async function nextTurn() {
  mode = null; selected = null;
  G.turn++;
  await advanceToActivePlayer();
  render();
  if (G.over) showGameOver();
}

// Moves G.turn to the next player who can act, ending rounds as needed.
async function advanceToActivePlayer() {
  for (let guard = 0; guard < 1000; guard++) {
    if (G.turn >= G.players.length) { G.turn = 0; await endRound(); }
    if (G.over) return;
    const p = G.players[G.turn];
    if (p.dead) { G.turn++; continue; }
    if (p.skip) {
      p.skip = false;
      log(`${p.name} is too dehydrated to act and skips this turn.`, 'bad');
      toast(`🔵 No water — too dehydrated to act. Round ${G.round} skipped.`);
      G.turn++;
      continue;
    }
    return;
  }
}

async function endRound() {
  G.round++;
  if (G.round > 6) { G.round = 1; G.day++; log(`☀️→🌙 Day ${G.day} begins.`, 'phase'); }
  log(roundBanner(), 'phase');
  await startOfRound();
}

// Everything that happens at the START of a round, before anyone acts:
// 1) this round's resource check, 2) the night attack on night rounds.
async function startOfRound() {
  const r = G.round;
  const up = CONFIG.upkeep[r] || {};
  if (Object.keys(up).length) log(`Round ${r} check — ${upkeepText(r)}`, 'phase');
  for (const p of G.players) {
    if (p.dead) continue;
    for (const [res, n] of Object.entries(up)) {
      const body = res === 'food' || res === 'water';   // food & water feed your max AP
      if (p.res[res] >= n) {
        p.res[res] -= n;
        if (body && p.maxAP < CONFIG.maxAP) {
          p.maxAP++;
          log(`${p.name} uses ${n} ${ICON[res]} ${res} — max AP ${p.maxAP - 1} → ${p.maxAP}.`, 'good');
        } else log(`${p.name} uses ${n} ${ICON[res]} ${res}.`);
      } else if (body) {
        p.res[res] = 0;
        render();
        busy = true;
        await maxApLossShow(p, res);
        busy = false;
        p.maxAP--;
        p.ap = Math.min(p.ap, p.maxAP);
        log(`${p.name} has no ${res}! Max AP ${p.maxAP + 1} → ${p.maxAP}.`, 'bad');
        if (p.maxAP <= 0) { render(); die(p, `${p.name} ${res === 'food' ? 'starved' : 'died of thirst'} (max AP 0).`); }
      } else {
        p.res[res] = 0;
        await failCheck(p, res);
      }
    }
  }
  if (G.over) return;
  render();
  if (isNight(r)) await nightAttack();
}

// Missing food or water: the player chooses to lose 1 AP or 1 morale.
async function failCheck(p, res) {
  if (res === 'food' || res === 'water') {
    const what = res === 'food' ? `${ICON.food} No food` : `${ICON.water} No water`;
    const opts = [['ap', `🎲 Lose 1 AP`, `${p.ap} → ${p.ap - 1}`, p.ap > 0], ['morale', `${ICON.morale} Lose 1 morale`, `${p.res.morale} → ${p.res.morale - 1}`, p.res.morale > 0]];
    if (!opts.some((o) => o[3])) {   // no AP to give, so it must be morale — and there is none
      render();
      return die(p, `${p.name} has no ${res}, no strength and no morale left to give.`);
    }
    render();
    const pick = opts.filter((o) => o[3]).length === 1 ? opts.find((o) => o[3])[0] : await lossChoice(what, opts);
    if (pick === 'ap') p.ap--; else p.res.morale--;
    log(`${p.name} has no ${res}! Loses 1 ${pick === 'ap' ? '🎲 AP' : `${ICON.morale} morale`}.`, 'bad');
    toast(`${what} — −1 ${pick === 'ap' ? 'AP' : 'morale'}.`);
  } else if (res === 'morale') {   // the night morale check can't be paid
    render();
    die(p, `${p.name} has lost all hope (no ${ICON.morale} morale to give).`);
  } else {
    log(`${p.name} has no ${res}!`, 'bad');
  }
}

const LOSS_KEYS = ['a', 'd'];   // A = lose AP, D = lose morale
async function lossChoice(what, opts) {
  const pop = $('#popup');
  pop.className = 'zombie';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>End of round</small><h2>${what}!</h2></div>
    <p class="muted">Choose what it costs you:</p>
    <ol class="pack-choose">${opts.map((o, n) => `<li><button data-n="${n}" ${o[3] ? '' : 'disabled'}><kbd>${LOSS_KEYS[n].toUpperCase()}</kbd> ${o[1]} <em>${o[2]}</em></button></li>`).join('')}</ol>
    <small class="pskip">press A or D, or click</small></div>`;
  pop.hidden = false;
  sfx.zombie();
  const pick = await new Promise((res) => {
    pop.querySelectorAll('[data-n]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); if (opts[+b.dataset.n][3]) res(opts[+b.dataset.n][0]); }));
    modalKey = (e) => { const o = opts[LOSS_KEYS.indexOf(e.key.toLowerCase())]; if (o && o[3]) res(o[0]); };
  });
  modalKey = null;
  pop.hidden = true;
  return pick;
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

async function nightAttack() {
  const groups = {};
  for (const p of G.players) (groups[key(p.q, p.r)] ??= []).push(p);
  for (const [k, grp] of Object.entries(groups)) {
    const t = G.tiles[k];
    const n = roll('Night zombies');
    const c = zombieContest(t, n);
    render();
    busy = true;
    await nightShow(t, c);
    busy = false;
    applyContest(t, c);
    logRoll(`🌙 ${n} zombie${n > 1 ? 's' : ''} attack the ${t.def.name} in the night. ${contestText(c)}`, c.left ? 'bad' : 'good');
    if (t.zombies) for (const p of grp) await threatPrompt(p);
    if (G.over) return;
  }
}

// ---------------------------------------------------------------- death
const alive = () => G.players.filter((p) => !p.dead);
function die(p, why) {
  p.dead = true;
  log(`☠️ ${why} The zombies get ${p.name}.`, 'bad');
  if (!alive().length) G.over = { why, day: G.day, round: G.round };
  tone(200, 1.4, 'sawtooth', 0.12, -170);
}

function showGameOver() {
  const o = G.over, pop = $('#popup');
  const rounds = (o.day - CONFIG.startDay) * 6 + (o.round - CONFIG.startRound);
  pop.className = 'zombie dead';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>Game over</small><h2>☠️ You died</h2></div>
    <p>${esc(o.why)}</p>
    <div class="big bad">Day ${o.day}, Round ${o.round}</div>
    <p class="muted">Survived ${rounds} round${rounds === 1 ? '' : 's'} · ${Object.keys(G.tiles).length} location${Object.keys(G.tiles).length === 1 ? '' : 's'} found</p>
    <button class="primary" id="again">New game <kbd>Enter</kbd></button></div>`;
  pop.hidden = false;
  $('#again').onclick = (e) => { e.stopPropagation(); newGame(['Survivor']); };
}

// ---------------------------------------------------------------- fight / flee
// Zombies on your tile: choose Fight (free to start; gun: 1 ammo/shot, melee: 1 AP/swing) or Flee (1 AP, roll 1d6 > zombies).
// Repeats until the tile is clear, you escape, or you die.
// Using an item costs no AP. Gun needs ammo; melee needs AP for at least one swing.
const canShoot = (p) => !!weaponOf(p, 'ammo') && p.res.ammo > 0;
const canMelee = (p) => !!weaponOf(p, 'ap') && p.ap >= 1;
const canFight = (p) => canShoot(p) || canMelee(p);
// After a failed flee (and no armor reroll) you're caught: no more fleeing this encounter.
const canFlee = (p, t) => !p.caught && p.ap >= 1 && fleeAdj(p).length > 0 && t.zombies < 6;

async function threatPrompt(p) {
  const t = tileOf(p);
  p.caught = false;
  while (t.zombies && !p.dead) {
    if (!canFight(p) && !canFlee(p, t)) {
      return die(p, p.ap < 1 ? `${p.name} has no strength left (0 🎲 AP) and nothing to fight with.`
        : !fleeAdj(p).length ? `${p.name} can't fight and has nowhere to run.`
        : `${p.name} can't fight and can't outrun ${t.zombies} zombies.`);
    }
    mode = 'threat';
    render();
    const choice = await new Promise((res) => { threatChoice = res; });
    threatChoice = null;
    mode = null;
    if (choice === 'shoot') await fightRound(p, t, weaponOf(p, 'ammo'));
    else if (choice === 'melee') await fightRound(p, t, weaponOf(p, 'ap'));
    else if (await fleeAttempt(p, t)) { p.caught = false; return; }
    else {
      // Failed flee: caught. Without a weapon to fight back with, that's the end.
      p.caught = true;
      if (!canFight(p)) return die(p, `${p.name} failed to flee and had nothing to fight back with.`);
      log(`${p.name} is caught — no escape now, fight!`, 'bad');
    }
  }
  p.caught = false;
  mode = null;
  render();
}

const armorOf = (p) => p.items.filter((it) => ITEMS[it.id]?.armor && it.cond > 0).sort((a, b) => a.cond - b.cond)[0];

async function fleeAttempt(p, t) {
  p.ap--;
  let r = roll('Flee');
  render();
  busy = true;
  let ok = await fleeShow(t, r);
  busy = false;
  logRoll(`${p.name} tries to flee ${t.zombies} zombie${t.zombies > 1 ? 's' : ''} — rolls ${r}${ok ? ': escapes!' : ` (needed more than ${t.zombies}): caught!`}`, ok ? 'good' : 'bad');
  // Armor can take the punch: −1 armor condition, then reroll (costs 1 AP).
  while (!ok) {
    const armor = armorOf(p);
    if (!armor || p.ap < 1) break;
    if (!(await armorPrompt(p, armor))) break;
    armor.cond--; p.ap--;
    sfx.armor();
    log(`${ITEMS[armor.id].icon} ${p.name}'s ${armor.id} takes the hit (condition ${armor.cond}).`, 'good');
    if (armor.cond <= 0) { p.items.splice(p.items.indexOf(armor), 1); log(`${ITEMS[armor.id].icon} The ${armor.id} is destroyed.`, 'bad'); }
    r = roll('Flee reroll');
    render();
    busy = true;
    ok = await fleeShow(t, r);
    busy = false;
    logRoll(`${p.name} rerolls the flee — ${r}${ok ? ': escapes!' : `: caught again!`}`, ok ? 'good' : 'bad');
  }
  if (!ok) return false;
  // Escape on foot (1 hex, must be zombie-free) or in a vehicle on this tile (several hexes).
  const opts = [['foot', '🏃 On foot', '1 hex', fleeAdj(p).length > 0]];
  for (const id of Object.keys(ITEMS).filter((k) => ITEMS[k].vehicle)) {
    const v = vehicleOf(p, id);
    if (v) opts.push([id, `${ITEMS[id].icon} ${id}`, `1 ${vehicleFuel(v) === 'fuel' ? ICON.fuel : '🎲'} per tile`, vehicleLeft(p, v) > 0]);
  }
  let how = 'foot';
  if (opts.length > 1) how = await chooseEscape(opts);
  if (how !== 'foot') { await driveTrip(p, vehicleOf(p, how), true); return true; }
  mode = 'flee';
  render();
  await new Promise((res) => { fleeDone = res; });
  fleeDone = null;
  mode = null;
  return true;
}

async function chooseEscape(opts) {
  const pop = $('#popup');
  const ok = opts.filter((o) => o[3]);
  pop.className = '';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>Escaped!</small><h2>How do you get away?</h2></div>
    <ol class="pack-choose">${opts.map((o, n) => `<li><button data-n="${n}" ${o[3] ? '' : 'disabled'}><kbd>${n + 1}</kbd> ${o[1]} <em>${o[2]}</em></button></li>`).join('')}</ol>
    <small class="pskip">press 1–${opts.length} or click</small></div>`;
  pop.hidden = false;
  const pick = await new Promise((res) => {
    pop.querySelectorAll('[data-n]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); if (opts[+b.dataset.n][3]) res(opts[+b.dataset.n][0]); }));
    modalKey = (e) => { const o = opts[+e.key - 1]; if (o && o[3]) res(o[0]); };
  });
  modalKey = null;
  pop.hidden = true;
  return pick || ok[0][0];
}

async function armorPrompt(p, armor) {
  const pop = $('#popup');
  pop.className = 'zombie';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>Caught!</small><h2>${ITEMS[armor.id].icon} ${esc(armor.id)} can take the hit</h2></div>
    <p>${condPips(armor.cond)} → ${condPips(armor.cond - 1)}</p>
    <div class="frow">
      <button class="primary" id="ayes">Take the hit &amp; reroll <small>(−1 condition, 1 AP)</small> <kbd>Enter</kbd></button>
      <button id="ano">No <kbd>Esc</kbd></button>
    </div></div>`;
  pop.hidden = false;
  const yes = await new Promise((res) => {
    $('#ayes').onclick = (e) => { e.stopPropagation(); res(true); };
    $('#ano').onclick = (e) => { e.stopPropagation(); res(false); };
    modalKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); res(true); } else if (e.key === 'Escape') res(false); };
  });
  modalKey = null;
  pop.hidden = true;
  return yes;
}

async function fleeShow(t, r) {
  const pop = $('#popup');
  skipAnim = false;
  pop.className = '';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>🏃 Flee</small><h2>Roll more than ${t.zombies}</h2></div>
    <div class="cpips">${[...Array(6)].map((_, i) => `<i class="${i < t.zombies ? 'zed' : ''}"></i>`).join('')}</div>
    <div class="prow2"><div class="slot" id="pd2d"></div></div>
    <div class="presult" id="pres"></div>
    <small class="pskip">click or press any key</small></div>`;
  pop.hidden = false;
  await wait(150);
  await rollDie($('#pd2d'), r, 1000);
  await wait(200);
  const ok = r > t.zombies;
  $('#pres').innerHTML = ok ? `<div class="big good">Escaped!</div><small class="muted">Pick a safe hex: A Q W D X Z</small>` : `<div class="big bad">Caught!</div>`;
  if (ok) sfx.win(false); else { pop.classList.add('zombie'); sfx.zombie(); }
  await popupHold(ok ? 1400 : 2200);
  return ok;
}

// One round of fighting: no AP to start, weapon loses 1 condition. Each attack (Enter) kills 1 zombie
// and costs 1 ammo (gun) or 1 AP (melee).
async function fightRound(p, t, w) {
  const def = ITEMS[w.id], melee = def.uses === 'ap';
  const left = () => (melee ? p.ap : p.res.ammo);
  w.cond--;
  const start = t.zombies;
  let shots = 0;
  const pop = $('#popup');
  pop.className = 'fight';
  const draw = () => {
    pop.innerHTML = `<div class="pcard">
      <div class="ptitle"><small>⚔️ Fight · ${esc(t.def.name)}</small><h2>${t.zombies ? `${t.zombies} zombie${t.zombies > 1 ? 's' : ''}` : 'Clear!'}</h2></div>
      <div class="cpips">${[...Array(6)].map((_, i) => `<i class="${i < t.zombies ? 'zed' : i < start ? 'dead' : ''}"></i>`).join('')}</div>
      <div class="fammo">${melee ? `${ICON.ap} <b class="${p.ap <= 1 ? 'warnap' : ''}">${p.ap}</b> AP` : `${ICON.ammo} <b>${p.res.ammo}</b> ammo`} · ${def.icon} ${w.id} condition ${condPips(w.cond)}</div>
      ${melee && p.ap === 1 && t.zombies ? `<div class="note bad">Last AP — swinging now leaves you nothing to flee with.</div>` : ''}
      <div class="frow">
        <button class="primary" id="fire" ${left() && t.zombies ? '' : 'disabled'}>${def.icon} ${def.verb} <small>(1 ${melee ? 'AP' : 'ammo'})</small> <kbd>Enter</kbd></button>
        <button id="stop">Stop <kbd>Esc</kbd></button>
      </div>
      <small class="pskip"><kbd>Shift</kbd>+<kbd>Enter</kbd> ${melee ? 'swing' : 'fire'} until clear (or out of ${melee ? 'AP' : 'ammo'})</small></div>`;
    $('#fire').onclick = (e) => { e.stopPropagation(); fire(); };
    $('#stop').onclick = (e) => { e.stopPropagation(); finish(); };
  };
  let done;
  const over = new Promise((res) => { done = res; });
  const fire = () => {
    if (!left() || !t.zombies) return;
    if (melee) p.ap--; else p.res.ammo--;
    t.zombies--; shots++;
    if (melee) sfx.axe(); else sfx.gun();
    draw();
    pop.querySelector('.pcard').classList.add('flash');
    const pips = pop.querySelectorAll('.cpips i');
    pips[t.zombies]?.classList.add('hit');
    renderStats();
    if (!t.zombies || !left()) setTimeout(finish, 700);
  };
  const finish = () => { modalKey = null; done(); };
  // Shift+Enter: keep attacking until the tile is clear or you run out of ammo / AP.
  let auto = false;
  const fireAll = () => {
    if (auto) return;
    auto = true;
    const step = () => { if (!left() || !t.zombies || !modalKey) return; fire(); setTimeout(step, 220); };
    step();
  };
  modalKey = (e) => {
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); fireAll(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!auto) fire(); }
    else if (e.key === 'Escape') finish();
  };
  draw();
  pop.hidden = false;
  await over;
  pop.hidden = true;
  const noun = melee ? 'swing' : 'shot';
  log(`${p.name} fights with the ${w.id}: ${shots} ${noun}${shots === 1 ? '' : 's'}, ${shots} zombie${shots === 1 ? '' : 's'} down${t.zombies ? `, ${t.zombies} left` : ' — tile cleared!'}.`, t.zombies ? 'bad' : 'good');
  if (w.cond <= 0) {
    p.items.splice(p.items.indexOf(w), 1);
    log(`${ITEMS[w.id].icon} ${p.name}'s ${w.id} breaks!`, 'bad');
  }
  render();
}

const condPips = (n) => `<span class="cond">${[...Array(6)].map((_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;

// ---------------------------------------------------------------- vehicles
// Vehicles sit on tiles (not in the backpack). Truck: 1 fuel per tile. Bike: 1 AP per tile.
// −1 condition per trip. Only scouted tiles; you can pass through zombie tiles but stopping on one triggers them.
const vehicleFuel = (v) => ITEMS[v.id].uses;                 // 'fuel' | 'ap'
const vehicleLeft = (p, v) => (vehicleFuel(v) === 'fuel' ? p.res.fuel : p.ap);
const vehiclesHere = (p) => (tileOf(p).vehicles ||= []);
const vehicleOf = (p, id) => vehiclesHere(p).filter((v) => v.id === id && v.cond > 0).sort((a, b) => a.cond - b.cond)[0];
const canDrive = (p, id) => { const v = vehicleOf(p, id); return !!v && vehicleLeft(p, v) > 0 && tileAdj(p).length > 0; };

async function driveTrip(p, v, flee = false) {
  const def = ITEMS[v.id];
  vehiclesHere(p).splice(vehiclesHere(p).indexOf(v), 1);   // vehicle travels with you
  mode = 'drive';
  await new Promise((done) => { driving = { p, v, steps: 0, flee, done }; render(); });
  const t = tileOf(p);
  if (driving.steps) {
    v.cond--;
    log(`${p.name} ${def.verb.toLowerCase()}s the ${def.icon} ${v.id} ${driving.steps} tile${driving.steps > 1 ? 's' : ''} to the ${t.def.name}.`, t.zombies ? 'bad' : '');
  }
  if (v.cond > 0) (t.vehicles ||= []).push(v);
  else log(`${def.icon} The ${v.id} breaks down for good.`, 'bad');
  const steps = driving.steps;
  driving = null;
  mode = null;
  if (t.zombies && steps) { log(`🧟 ${t.zombies} zombie${t.zombies > 1 ? 's' : ''} at the ${t.def.name}!`, 'bad'); await threatPrompt(p); }
  return steps;
}

function driveStep(q, r) {
  const { p, v } = driving, t = G.tiles[key(q, r)];
  if (!t || vehicleLeft(p, v) < 1) return;
  if (vehicleFuel(v) === 'fuel') p.res.fuel--; else p.ap--;
  p.q = q; p.r = r;
  driving.steps++;
  sfx.drive(vehicleFuel(v));
  if (vehicleLeft(p, v) < 1) { toast(`${ITEMS[v.id].icon} Out of ${vehicleFuel(v) === 'fuel' ? 'fuel' : 'AP'} — stopping here.`); return driving.done(); }
  render();
}

// ---------------------------------------------------------------- items
async function gainItem(p, id, cond) {
  const item = { id, cond };
  if (p.items.length < CONFIG.maxItems) {
    p.items.push(item);
    log(`${p.name} finds a ${ITEMS[id].icon} ${id} (condition ${cond}).`, 'good');
    return;
  }
  // Backpack full: destroy one to make room, or leave the new item.
  const pop = $('#popup');
  const all = [...p.items, item];
  pop.className = '';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>Backpack full (${CONFIG.maxItems}/${CONFIG.maxItems})</small><h2>Destroy one item</h2></div>
    <ol class="pack-choose">${all.map((it, i) => `<li><button data-i="${i}"><kbd>${i + 1}</kbd> ${ITEMS[it.id].icon} ${it.id} ${condPips(it.cond)}${i === all.length - 1 ? ' <em>NEW</em>' : ''}</button></li>`).join('')}</ol>
    <small class="pskip">press 1–${all.length} or click</small></div>`;
  pop.hidden = false;
  const i = await new Promise((res) => {
    pop.querySelectorAll('[data-i]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); res(+b.dataset.i); }));
    modalKey = (e) => { const n = +e.key; if (n >= 1 && n <= all.length) res(n - 1); };
  });
  modalKey = null;
  pop.hidden = true;
  const gone = all[i];
  all.splice(i, 1);
  p.items = all;
  log(gone === item
    ? `${p.name} leaves the ${ITEMS[id].icon} ${id} behind — backpack full.`
    : `${p.name} destroys their ${ITEMS[gone.id].icon} ${gone.id} to carry the ${ITEMS[id].icon} ${id}.`, 'bad');
}

// Tools: free to use at any time (outside popups). Transfer some of the tool's condition to another
// item (up to that item's max of 6). A tool at 0 condition is destroyed.
// Short on-screen message above the action tray.
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

async function useTool(i) {
  const p = cur(), tool = p.items[i];
  if (!tool || !ITEMS[tool.id]?.tool || busy || modalKey || G.over) return;
  const targets = [...p.items, ...vehiclesHere(p)].filter((it) => it !== tool && it.cond < CONFIG.maxCondition);
  const pop = $('#popup');
  const close = () => { modalKey = null; pop.hidden = true; };
  pop.className = 'tool';
  if (!targets.length) {
    toast(`${ITEMS[tool.id].icon} Nothing to repair — every other item is at full condition (${CONFIG.maxCondition}).`);
    return;
  }
  // step 1: pick the item to repair
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>${ITEMS[tool.id].icon} ${tool.id} ${condPips(tool.cond)}</small><h2>Repair which item?</h2></div>
    <ol class="pack-choose">${targets.map((it, n) => `<li><button data-n="${n}"><kbd>${n + 1}</kbd> ${ITEMS[it.id].icon} ${it.id} ${condPips(it.cond)}</button></li>`).join('')}</ol>
    <small class="pskip">press 1–${targets.length} or click · Esc to cancel</small></div>`;
  pop.hidden = false;
  const target = await new Promise((res) => {
    pop.querySelectorAll('[data-n]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); res(targets[+b.dataset.n]); }));
    modalKey = (e) => { if (e.key === 'Escape') res(null); const n = +e.key; if (n >= 1 && n <= targets.length) res(targets[n - 1]); };
  });
  if (!target) return close();
  // step 2: how much condition to transfer
  const max = Math.min(tool.cond, CONFIG.maxCondition - target.cond);
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>${ITEMS[tool.id].icon} ${tool.id} ${condPips(tool.cond)} → ${ITEMS[target.id].icon} ${target.id} ${condPips(target.cond)}</small><h2>Transfer how much?</h2></div>
    <div class="frow">${[...Array(max)].map((_, n) => `<button data-a="${n + 1}"><kbd>${n + 1}</kbd></button>`).join('')}</div>
    <small class="pskip">press 1–${max} or click · Esc to cancel</small></div>`;
  const amt = await new Promise((res) => {
    pop.querySelectorAll('[data-a]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); res(+b.dataset.a); }));
    modalKey = (e) => { if (e.key === 'Escape') res(0); const n = +e.key; if (n >= 1 && n <= max) res(n); };
  });
  close();
  if (!amt) return render();
  tool.cond -= amt; target.cond += amt;
  sfx.repair();
  log(`${p.name} uses the ${ITEMS[tool.id].icon} ${tool.id} on the ${ITEMS[target.id].icon} ${target.id}: +${amt} condition (now ${target.cond}).`, 'good');
  if (tool.cond <= 0) {
    p.items.splice(p.items.indexOf(tool), 1);
    log(`${ITEMS[tool.id].icon} The ${tool.id} is used up and destroyed.`, 'bad');
  }
  render();
}

function dropItem(i) {
  const p = cur(), it = p.items[i];
  if (!it || busy || modalKey) return;
  p.items.splice(i, 1);
  log(`${p.name} destroys their ${ITEMS[it.id].icon} ${it.id}.`, 'bad');
  render();
}

// ---------------------------------------------------------------- actions
let forced = [];   // cheat: queued values for the next game rolls (see cheats below)
function roll(label, keep = false) {
  if (!keep) rolls = [];
  const value = forced.length ? forced.shift() : d6();
  rolls.push({ value, label }); rollsFresh = true;
  return value;
}

async function act(name) {
  if (mode === 'threat') {
    const p = cur(), t = tileOf(p);
    if (name === 'shoot' && canShoot(p)) threatChoice?.('shoot');
    if (name === 'melee' && canMelee(p)) threatChoice?.('melee');
    if (name === 'flee' && canFlee(p, t)) threatChoice?.('flee');
    return;
  }
  if (busy || mode === 'flee' || modalKey || G.over) return;
  const p = cur(), t = tileOf(p);

  if (name === 'sleep') {
    const r = roll('Sleep');
    const before = p.ap;
    render();
    busy = true;
    await sleepShow(p, r);
    busy = false;
    p.ap = Math.min(p.maxAP, p.ap + r);
    logRoll(`${p.name} sleeps and gains ${p.ap - before} 🎲 AP${before + r > p.maxAP ? ` (rolled ${r}, max ${p.maxAP})` : ''}.`);
    return nextTurn();
  }
  if (ITEMS[name]?.vehicle) {   // driving is free movement: it doesn't use up your turn
    if (!canDrive(p, name)) return;
    await driveTrip(p, vehicleOf(p, name));
    if (G.over) { render(); return showGameOver(); }
    return render();
  }
  if (p.ap < 1) return;

  if (name === 'fortify') {
    if (t.safety >= CONFIG.maxSafety || t.zombies) return;
    p.ap--;
    const r = roll('Fortify');
    const before = t.safety;
    const after = Math.min(CONFIG.maxSafety, t.safety + r);
    render();
    busy = true;
    await fortifyShow(t, r, before, after);
    busy = false;
    t.safety = after;
    logRoll(`${p.name} fortifies the ${t.def.name} — rolls ${r}: 🟡 ${before} → ${t.safety}${before + r > CONFIG.maxSafety ? ` (max ${CONFIG.maxSafety})` : ''}.`, 'good');
    return nextTurn();
  }

  if (name === 'scavenge') {
    if (t.zombies) return;
    p.ap--;
    const r = roll('Scavenge');
    const e = t.def.table[r - 1];
    const amt = roll(e.res ? cellText(e) : e.item ? 'Condition' : 'Zombies', true);
    const c = e.zombies ? zombieContest(t, amt) : null;
    busy = true;
    await scavengeShow(t, r, e, amt, c);
    busy = false;
    if (c) {
      applyContest(t, c);
      logRoll(`${p.name} scavenges the ${t.def.name} — rolls ${r}: 🧟 ${amt} zombie${amt > 1 ? 's' : ''}! ${contestText(c)}`, c.left ? 'bad' : 'good');
      if (t.zombies) await threatPrompt(p);
      if (G.over) { render(); return showGameOver(); }
    } else if (e.item) {
      logRoll(`${p.name} scavenges the ${t.def.name} — rolls ${r}: ${ITEMS[e.item].icon} ${e.item}, condition ${amt}.`, 'good');
      if (ITEMS[e.item].vehicle) {
        (t.vehicles ||= []).push({ id: e.item, cond: amt });
        log(`${ITEMS[e.item].icon} The ${e.item} is parked at the ${t.def.name}.`, 'good');
      } else await gainItem(p, e.item, amt);
    } else {
      const got = amt * e.n;
      p.res[e.res] += got;
      logRoll(`${p.name} scavenges the ${t.def.name} — rolls ${r}: ${cellText(e)} → rolls ${amt}${e.n > 1 ? ` ×${e.n}` : ''} = ${got} ${ICON[e.res]} ${e.res}.`, 'good');
    }
    return nextTurn();
  }

  if (name === 'scout' || name === 'move') {
    mode = mode === name ? null : name;
    render();
  }
}

function clickHex(q, r) {
  if (busy) return;
  if (!mode) return;
  const p = cur();
  if (!neighbors(p.q, p.r).some(([a, b]) => a === q && b === r)) return;
  const k = key(q, r);

  if (mode === 'drive') return driveStep(q, r);
  if (mode === 'flee') {
    if (!G.tiles[k] || G.tiles[k].zombies) return;
    log(`${p.name} flees to the ${G.tiles[k].def.name}.`, 'bad');
    p.q = q; p.r = r;
    fleeDone?.();
  } else if (mode === 'scout' && !G.tiles[k]) {
    const def = TILES[Math.floor(Math.random() * TILES.length)];
    G.tiles[k] = { def, safety: 0, zombies: 0, vehicles: [] };
    p.ap--;
    log(`${p.name} scouts and discovers a ${def.icon} ${def.name}.`);
    nextTurn();
  } else if (mode === 'move' && G.tiles[k] && canEnter(p, G.tiles[k])) {
    const t = G.tiles[k];
    p.q = q; p.r = r; p.ap--;
    mode = null;
    log(`${p.name} moves to the ${t.def.name}${t.zombies ? ` — ${t.zombies} zombie${t.zombies > 1 ? 's' : ''} inside!` : ''}.`, t.zombies ? 'bad' : '');
    (async () => {
      if (t.zombies) await threatPrompt(p);
      if (G.over) { render(); return showGameOver(); }
      nextTurn();
    })();
  }
}

function give(toIdx, res) {
  const p = cur(), o = G.players[toIdx];
  if (p.res[res] < 1 || o.q !== p.q || o.r !== p.r) return;
  p.res[res]--; o.res[res]++;
  log(`${p.name} gives 1 ${ICON[res]} ${res} to ${o.name}.`);
  render();
}

// ---------------------------------------------------------------- scavenge popup + sound
let busy = false;       // true while the popup is playing: blocks other input
let skipAnim = false;   // click / key during the animation fast-forwards it
let dismissPopup = null;

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const dieHtml = (v, cls = '') => PIPS[v]
  ? `<div class="die ${cls}" style="--rot:${(Math.random() * 40 - 20).toFixed(0)}deg">${[...Array(9)].map((_, i) => `<i class="${PIPS[v].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`
  : `<div class="die num ${cls}">${v}</div>`;
// small crisp die for the log
const dieSvg = (v, s = 20) => !PIPS[v]
  ? `<svg class="sdie" width="${s}" height="${s}" viewBox="0 0 30 30"><rect x="1" y="1" width="28" height="28" rx="6"/><text x="15" y="21" text-anchor="middle" font-size="16" font-weight="800" fill="#1b1b1b">${v}</text></svg>`
  : `<svg class="sdie" width="${s}" height="${s}" viewBox="0 0 30 30"><rect x="1" y="1" width="28" height="28" rx="6"/>${PIPS[v].map((i) => `<circle cx="${7.5 + (i % 3) * 7.5}" cy="${7.5 + Math.floor(i / 3) * 7.5}" r="2.8"/>`).join('')}</svg>`;
const wait = (ms) => new Promise((res) => setTimeout(res, skipAnim ? 0 : ms));

// sound (tiny WebAudio blips, no files)
function noise(dur, vol, cutoff) {
  if (muted) return;
  try {
    AC ??= new AudioContext();
    const buf = AC.createBuffer(1, AC.sampleRate * dur, AC.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = cutoff; g.gain.value = vol;
    src.connect(f).connect(g).connect(AC.destination); src.start();
  } catch { /* audio unavailable */ }
}
let AC = null, muted = false;
function tone(freq, dur = 0.05, type = 'square', vol = 0.04, slide = 0) {
  if (muted) return;
  try {
    AC ??= new AudioContext();
    const o = AC.createOscillator(), g = AC.createGain(), now = AC.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, now);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), now + dur);
    g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(AC.destination); o.start(now); o.stop(now + dur);
  } catch { /* audio unavailable */ }
}
const sfx = {
  tick: () => tone(500 + Math.random() * 500, 0.03, 'square', 0.025),
  land: () => tone(140, 0.18, 'triangle', 0.15, -40),
  win: (big) => (big ? [523, 659, 784, 1047] : [523, 659, 784]).forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.07), i * 90)),
  count: () => tone(900, 0.02, 'square', 0.02),
  gun: () => {
    if (muted) return;
    try {
      AC ??= new AudioContext();
      const len = 0.25, buf = AC.createBuffer(1, AC.sampleRate * len, AC.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
      const src = AC.createBufferSource(), g = AC.createGain();
      src.buffer = buf; g.gain.value = 0.35;
      src.connect(g).connect(AC.destination); src.start();
      tone(90, 0.15, 'triangle', 0.2, -50);
    } catch { /* audio unavailable */ }
  },
  // resource sounds: dir = +1 gained, -1 spent
  res: (k, dir) => {
    if (dir < 0) {
      if (k === 'food') { noise(0.07, 0.25, 1800); setTimeout(() => noise(0.06, 0.2, 1400), 90); setTimeout(() => noise(0.05, 0.15, 1100), 170); }   // crunch crunch
      else if (k === 'water') { tone(520, 0.12, 'sine', 0.15, -260); setTimeout(() => tone(380, 0.14, 'sine', 0.12, -180), 130); }               // gulp gulp
      else if (k === 'morale') { [392, 349, 294].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.07), i * 140)); }             // sad sigh
      else if (k === 'fuel') { noise(0.3, 0.12, 600); tone(140, 0.3, 'sine', 0.08, -40); }                                                      // slosh
      else if (k === 'ammo') { if (!modalKey) tone(1600, 0.03, 'square', 0.05); }                                                             // click (gun fight has its own sound)
    } else {
      const base = { food: 440, water: 587, morale: 659, fuel: 330, ammo: 784 }[k] || 500;
      tone(base, 0.09, 'triangle', 0.08); setTimeout(() => tone(base * 1.5, 0.12, 'triangle', 0.07), 70);   // little pickup chime
    }
  },
  repair: () => [0, 110, 220].forEach((d, i) => setTimeout(() => { noise(0.05, 0.2, 3000); tone(900 + i * 200, 0.05, 'square', 0.03); }, d)),
  armor: () => { noise(0.12, 0.35, 900); tone(180, 0.2, 'square', 0.1, -60); setTimeout(() => tone(1200, 0.25, 'triangle', 0.04, -300), 60); },
  drive: (kind) => kind === 'fuel'
    ? (tone(70, 0.4, 'sawtooth', 0.09, 40), noise(0.35, 0.12, 400))
    : (noise(0.08, 0.1, 2500), setTimeout(() => tone(1400, 0.08, 'sine', 0.05), 80)),
  axe: () => { tone(320, 0.12, 'sawtooth', 0.05, -260); setTimeout(() => tone(70, 0.18, 'square', 0.18, -30), 90); },
  zombie: () => { tone(95, 0.9, 'sawtooth', 0.12, -50); setTimeout(() => tone(70, 0.7, 'sawtooth', 0.1, -30), 150); },
};

async function rollDie(slot, final, ms, onFace) {
  const t0 = performance.now(); let delay = 45;
  while (!skipAnim && performance.now() - t0 < ms) {
    const v = d6(); slot.innerHTML = dieHtml(v, 'tumble'); onFace?.(v); sfx.tick();
    await wait(delay); delay *= 1.13;
  }
  slot.innerHTML = dieHtml(final, 'land'); onFace?.(final); sfx.land();
}

async function scavengeShow(t, r, e, amt, c) {
  const pop = $('#popup');
  skipAnim = false;
  pop.className = '';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>Scavenging</small><h2>${esc(t.def.name)}</h2></div>
    <div class="prow">
      <div class="slot" id="pd1"></div>
      <ol class="ptable">${t.def.table.map((x, i) => `<li data-i="${i + 1}" class="${x.zombies ? 'z' : x.item ? 'it' : ''}"><b>${i + 1}</b>${cellText(x)}</li>`).join('')}</ol>
    </div>
    <div class="prow2" id="pd2"></div>
    <div class="presult" id="pres"></div>
    <small class="pskip">click or press any key</small></div>`;
  pop.hidden = false;

  const rows = [...pop.querySelectorAll('.ptable li')];
  const mark = (v) => rows.forEach((li) => li.classList.toggle('hl', +li.dataset.i === v));
  await wait(150);
  await rollDie($('#pd1'), r, 1100, mark);
  rows.forEach((li) => li.classList.remove('hl'));
  rows[r - 1].classList.add('picked');
  await wait(350);

  if (e.item) {
    $('#pd2').innerHTML = `<span class="muted">Condition?</span><div class="slot" id="pd2d"></div>`;
    await rollDie($('#pd2d'), amt, 800);
    await wait(250);
    $('#pres').innerHTML = `<div class="big good jackpot">${ITEMS[e.item].icon} ${esc(e.item)}</div><div>${condPips(amt)}</div>`;
    pop.classList.add('jackpot');
    sfx.win(true);
  } else if (e.zombies) {
    pop.classList.add('zombie'); sfx.zombie();
    $('#pd2').innerHTML = `<span class="muted">How many?</span><div class="slot" id="pd2d"></div>`;
    await rollDie($('#pd2d'), amt, 800);
    await wait(250);
    await contestAnim(c);
  } else {
    $('#pd2').innerHTML = `<span class="muted">How much?</span><div class="slot" id="pd2d"></div>${e.n > 1 ? `<span class="mult">× ${e.n}</span>` : ''}`;
    await rollDie($('#pd2d'), amt, 800);
    await wait(250);
    const total = amt * e.n, big = total >= 8;
    $('#pres').innerHTML = `<div class="big good ${big ? 'jackpot' : ''}">+<span id="pcount">0</span> ${ICON[e.res]} ${RES_LABEL[e.res]}</div>`;
    for (let i = 1; i <= total; i++) { $('#pcount').textContent = i; sfx.count(); await wait(Math.min(70, 500 / total)); }
    if (big) pop.classList.add('jackpot');
    sfx.win(big);
  }

  await popupHold();
}

// Shared ending: wait for click / key / timeout, then close.
async function popupHold(ms = 3000) {
  skipAnim = false;
  await new Promise((res) => { const tm = setTimeout(res, ms); dismissPopup = () => { clearTimeout(tm); res(); }; });
  dismissPopup = null;
  $('#popup').hidden = true;
}

// Animate zombies contesting Safety in the popup: yellow pips burst, then black ones fill in.
async function contestAnim(c) {
  const el = $('#pres');
  const max = CONFIG.maxSafety;
  el.innerHTML = `<div class="cpips">${[...Array(max)].map((_, i) =>
    `<i class="${i < c.before.safety ? 'on' : i < c.before.safety + c.before.zombies ? 'zed' : ''}"></i>`).join('')}</div><div id="ctext"></div>`;
  const pips = [...el.querySelectorAll('.cpips i')];
  await wait(300);
  for (let i = 0; i < c.absorbed; i++) {
    const pip = pips[c.before.safety - 1 - i];
    pip.className = 'burst'; tone(220 - i * 15, 0.12, 'triangle', 0.1, -80);
    await wait(260);
  }
  const added = c.after.zombies - c.before.zombies;
  for (let j = 0; j < added; j++) {
    pips[c.after.safety + c.before.zombies + j].className = 'zed pop';
    tone(80 + Math.random() * 30, 0.25, 'sawtooth', 0.09, -20);
    await wait(280);
  }
  const lost = c.left - added;
  $('#ctext').innerHTML = c.left
    ? `<div class="big bad">🧟 ${c.left} broke through!</div>${lost > 0 ? `<small class="muted">The tile is overrun (max ${max}).</small>` : ''}`
    : `<div class="big good">🟡 Safety held!</div><small class="muted">Absorbed ${c.n} — 🟡 ${c.before.safety} → ${c.after.safety}</small>`;
  if (c.left) { $('#popup').classList.add('zombie'); sfx.zombie(); } else sfx.win(false);
}

async function fortifyShow(t, r, before, after) {
  const pop = $('#popup'), max = CONFIG.maxSafety;
  skipAnim = false;
  pop.className = '';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>🔨 Fortifying</small><h2>${esc(t.def.name)}</h2></div>
    <div class="prow2"><span class="muted">How much?</span><div class="slot" id="pd2d"></div></div>
    <div class="cpips">${[...Array(max)].map((_, i) => `<i class="${i < before ? 'on' : ''}"></i>`).join('')}</div>
    <div class="presult" id="pres"></div>
    <small class="pskip">click or press any key</small></div>`;
  pop.hidden = false;
  await wait(150);
  await rollDie($('#pd2d'), r, 900);
  await wait(300);
  const pips = [...pop.querySelectorAll('.cpips i')];
  for (let i = before; i < after; i++) {
    pips[i].className = 'on fill';
    tone(300 + i * 70, 0.12, 'triangle', 0.1); noise(0.05, 0.15, 2000);   // hammer + rising note
    await wait(380);
  }
  const wasted = before + r - after;
  $('#pres').innerHTML = `<div class="big good">🟡 +${after - before} Safety</div>${wasted > 0 ? `<small class="muted">${wasted} wasted — max ${max}</small>` : ''}`;
  sfx.win(after === max);
  await popupHold(1800);
}

// Missed food / water: pause the game and show the max AP ring losing a segment.
async function maxApLossShow(p, res) {
  const pop = $('#popup'), oldMax = p.maxAP, newMax = p.maxAP - 1, newAp = Math.min(p.ap, newMax);
  const what = res === 'food' ? `${ICON.food} No food` : `${ICON.water} No water`;
  skipAnim = false;
  pop.className = 'zombie';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>Round ${G.round} check</small><h2>${what}!</h2></div>
    <div class="bigap" id="bigap">${apGauge(p.ap, '', oldMax)}</div>
    <div class="presult" id="pres"></div>
    <small class="pskip">click or press any key</small></div>`;
  pop.hidden = false;
  tone(300, 0.5, 'sawtooth', 0.08, -200);
  await wait(900);
  $('#bigap').innerHTML = apGauge(newAp, '', newMax, newMax);   // segment newMax cracks and goes dark
  noise(0.25, 0.3, 700); tone(90, 0.6, 'square', 0.12, -40);
  await wait(500);
  $('#pres').innerHTML = newMax > 0
    ? `<div class="big bad">Max AP ${oldMax} → ${newMax}</div><small class="muted">Find ${res} — each one you have at a check raises it again.</small>`
    : `<div class="big bad">Max AP 0</div>`;
  await popupHold(newMax > 0 ? 2600 : 1500);
}

// Sleep: roll the die, then the AP dial fills segment by segment.
async function sleepShow(p, r) {
  const pop = $('#popup'), from = p.ap, to = Math.min(p.maxAP, p.ap + r);
  skipAnim = false;
  pop.className = 'sleep';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>😴 Sleeping</small><h2>Rest &amp; recover</h2></div>
    <div class="prow"><div class="slot" id="pd2d"></div><div class="bigap" id="bigap">${apGauge(from, '', p.maxAP)}</div></div>
    <div class="presult" id="pres"></div>
    <small class="pskip">click or press any key</small></div>`;
  pop.hidden = false;
  await wait(150);
  await rollDie($('#pd2d'), r, 900);
  await wait(250);
  for (let a = from + 1; a <= to; a++) {
    $('#bigap').innerHTML = apGauge(a, '', p.maxAP, -1, a - 1);
    tone(330 + a * 45, 0.14, 'sine', 0.09);
    await wait(260);
  }
  const wasted = from + r - to;
  $('#pres').innerHTML = `<div class="big good">+${to - from} AP</div>${wasted > 0 ? `<small class="muted">${wasted} wasted — max AP ${p.maxAP}</small>` : ''}`;
  sfx.win(to >= p.maxAP);
  await popupHold(1600);
}

async function nightShow(t, c) {
  const pop = $('#popup');
  skipAnim = false;
  pop.className = 'night';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>🌙 Night attack</small><h2>${esc(t.def.name)}</h2></div>
    <div class="prow2"><span class="muted">How many zombies?</span><div class="slot" id="pd2d"></div></div>
    <div class="presult" id="pres"></div>
    <small class="pskip">click or press any key</small></div>`;
  pop.hidden = false;
  await wait(200);
  await rollDie($('#pd2d'), c.n, 1000);
  await wait(250);
  await contestAnim(c);
  await popupHold();
}

function popupInput() {
  if (dismissPopup) dismissPopup(); else skipAnim = true;
}

// ---------------------------------------------------------------- render
function render() {
  renderClock();
  renderStats();
  renderPack();
  renderPlayers();
  renderMap();
  renderPanel();
}

// Round clock: 6 wedges, nights (1 & 6) at the top like midnight, a hand that sweeps forward.
const CLOCK_R = 84, CLOCK_R0 = 30;
function wedgePath(a0, a1, r0, r1) {
  const P = (a, r) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  return `M${P(a0, r1)} A${r1} ${r1} 0 0 1 ${P(a1, r1)} L${P(a1, r0)} A${r0} ${r0} 0 0 0 ${P(a0, r0)}Z`;
}
const wedgeCenterDeg = (r) => -90 + (r - 1) * 60 + 30;   // degrees, 0 = right, clockwise
function renderClock() {
  let s = '';
  for (let r = 1; r <= 6; r++) {
    const c = wedgeCenterDeg(r) * Math.PI / 180, a0 = c - Math.PI / 6, a1 = c + Math.PI / 6;
    const now = r === G.round;
    const off = now ? 5 : 0;
    const icons = Object.keys(CONFIG.upkeep[r] || {}).map((res) => ICON[res]).join('') + (isNight(r) ? '🟡' : '');
    const lx = 57 * Math.cos(c), ly = 57 * Math.sin(c);
    s += `<g class="wedge ${isNight(r) ? 'night' : 'day'} ${now ? 'now' : ''}" transform="translate(${(off * Math.cos(c)).toFixed(2)} ${(off * Math.sin(c)).toFixed(2)})">
      <path d="${wedgePath(a0 + 0.015, a1 - 0.015, CLOCK_R0 + 2, CLOCK_R)}"/>
      <text x="${lx.toFixed(1)}" y="${(ly - 3).toFixed(1)}" class="rn">${r}</text>
      <text x="${lx.toFixed(1)}" y="${(ly + 12).toFixed(1)}" class="up">${icons}</text></g>`;
  }
  $('#wedges').innerHTML = s;
  $('#clockday').textContent = G.day;
  $('#banner').innerHTML = `<i style="background:${cur().color}"></i><h1>${roundBanner()}</h1>`;
  // monotonic angle so the hand always sweeps clockwise, even from round 6 → 1
  const turns = (G.day - 1) * 6 + (G.round - 1);
  $('#hand').style.transform = `rotate(${turns * 60 + 30}deg)`;
}

// pointy-top hexes
const pix = (q, r) => [HEX * Math.sqrt(3) * (q + r / 2), HEX * 1.5 * r];
function hexPoints(cx, cy, s) {
  return [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(cx + s * Math.cos(a)).toFixed(1)},${(cy + s * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

const RES_LABEL = { food: 'Food', water: 'Water', morale: 'Morale', fuel: 'Fuel', ammo: 'Ammo' };
function cellText(e) {
  if (e.zombies) return e.zombies > 1 ? `Zombies ×${e.zombies}` : 'Zombies';
  if (e.item) return e.item;
  const mult = { 2: 'Double', 3: 'Triple', 4: 'Quadruple' }[e.n];
  return e.n > 1 ? (mult ? `${mult} ${RES_LABEL[e.res]}` : `${RES_LABEL[e.res]} ×${e.n}`) : RES_LABEL[e.res];
}

// Result 1 is always Zombies on every tile, so it isn't listed — only results 2–6.
function tableSvg(x, y, def) {
  const ch = 20, w = HEX, h = ch * 5;
  let s = `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="3" class="tbl"/>`;
  def.table.forEach((e, i) => {
    if (i === 0) return;
    const ty = y - h / 2 + (i - 1) * ch + ch / 2 + 4;
    s += `<text x="${x - w / 2 + 8}" y="${ty}" class="cell ${e.zombies ? 'z' : e.item ? 'it' : ''}"><tspan class="n">${i + 1}</tspan>  ${cellText(e)}</text>`;
  });
  return s;
}

// Safety pips along the bottom of the hex: filled = current Safety, hollow = room to fortify.
function safetySvg(x, y, n, z = 0) {
  const max = CONFIG.maxSafety, gap = 17;
  let s = '';
  for (let i = 0; i < max; i++) {
    const cx = x + (i - (max - 1) / 2) * gap;
    s += `<circle cx="${cx}" cy="${y}" r="6.5" class="pip ${i < n ? 'on' : i < n + z ? 'zed' : ''}"/>`;
  }
  return s;
}

// Camera: keeps the current hex centred, with a short glide between positions.
const cam = { x: 0, y: 0, tx: 0, ty: 0, anim: null };
function cameraTo(x, y) {
  cam.tx = x; cam.ty = y;
  if (cam.anim) cancelAnimationFrame(cam.anim);
  const sx = cam.x, sy = cam.y, t0 = performance.now(), dur = 350;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    cam.x = sx + (cam.tx - sx) * e; cam.y = sy + (cam.ty - sy) * e;
    applyView();
    cam.anim = k < 1 ? requestAnimationFrame(step) : null;
  };
  cam.anim = requestAnimationFrame(step);
}
function applyView() {
  const svg = $('#map'), b = svg.getBoundingClientRect();
  if (!b.width || !b.height) return;
  const z = Math.min(1, b.width / 520);              // zoom out a little on narrow screens
  const w = b.width / z, h = b.height / z;
  svg.setAttribute('viewBox', `${cam.x - w / 2} ${cam.y - h / 2} ${w} ${h}`);
}
window.addEventListener('resize', applyView);

function vehicleSvg(x, y, vs) {
  if (!vs.length) return '';
  return `<text x="${x}" y="${y}" class="veh">${vs.map((v) => ITEMS[v.id].icon).join('')}</text>`;
}

function pickBadge(x, y, n, big = false) {
  const r = big ? 22 : 13;
  return `<g class="pick ${big ? 'big' : ''}"><circle cx="${x}" cy="${y}" r="${r}"/><text x="${x}" y="${y + (big ? 9 : 5)}">${n}</text></g>`;
}

function renderMap() {
  const p = cur();
  const adj = new Set(neighbors(p.q, p.r).map(([q, r]) => key(q, r)));
  const fog = new Map();
  for (const k in G.tiles) {
    const [q, r] = k.split(',').map(Number);
    for (const [a, b] of neighbors(q, r)) { const kk = key(a, b); if (!G.tiles[kk]) fog.set(kk, [a, b]); }
  }

  let svg = '';
  for (const [k, [q, r]] of fog) {
    const [x, y] = pix(q, r);
    const target = mode === 'scout' && adj.has(k);
    svg += `<g class="hex fog ${target ? 'target' : ''}" data-k="${k}">
      <polygon points="${hexPoints(x, y, HEX - 2)}"/>${target ? pickBadge(x, y, pickNumber(p, q, r), true) : ''}</g>`;
  }

  let hereSvg = '';
  for (const k in G.tiles) {
    const [q, r] = k.split(',').map(Number);
    const [x, y] = pix(q, r);
    const t = G.tiles[k];
    const danger = t.def.table.filter((e) => e.zombies).length;
    const isHere = q === p.q && r === p.r;
    const target = adj.has(k) && ((mode === 'move' && canEnter(p, t)) || (mode === 'flee' && !t.zombies) || mode === 'drive');
    const g = `<g class="hex tile d${Math.min(danger, 4)} ${isHere ? 'here' : ''} ${target ? 'target' : ''} ${t.zombies ? 'infested' : ''}" data-k="${k}">
      <polygon points="${hexPoints(x, y, HEX - (isHere ? 4 : 2))}" ${isHere ? `style="stroke:${p.color}"` : ''}/>
      <text x="${x}" y="${y - HEX * 0.56}" class="name">${esc(t.def.name)}</text>
      ${tableSvg(x, y + 4, t.def)}
      ${safetySvg(x, y + HEX * 0.64, t.safety, t.zombies)}
      ${vehicleSvg(x, y + HEX * 0.84, [...(t.vehicles || []), ...(isHere && driving ? [driving.v] : [])])}
      ${target ? pickBadge(x, y - HEX * 0.8, pickNumber(p, q, r)) : ''}</g>`;
    if (isHere) hereSvg = g; else svg += g;   // draw current tile last so its border sits on top
  }

  $('#map').innerHTML = svg + hereSvg;
  const [cx, cy] = pix(p.q, p.r);
  if (!G.camInit) { cam.x = cx; cam.y = cy; G.camInit = true; applyView(); }
  cameraTo(cx, cy);

  $('#hint').textContent = mode === 'flee' || mode === 'threat' || mode === 'drive' ? ''
    : mode === 'scout' ? 'Press A Q W D X Z or click a highlighted hex to scout it. (Esc to cancel)'
    : mode === 'move' ? 'Press A Q W D X Z or click a highlighted tile to move there. (Esc to cancel)' : '';
}

// AP gauge: a ring of 12 segments like the clock. Colour shows how full you are.
// Colour: purple when you're at your max, otherwise by how much of the full 12 you have.
function apLevel(ap, max) {
  const f = ap / CONFIG.maxAP;
  return ap >= max ? 'full' : f >= 2 / 3 ? 'high' : f >= 1 / 3 ? 'mid' : 'low';
}
// Segments above your current max AP are locked (food & water raise / lower the max).
function apGauge(ap, flash, max, losing = -1, gaining = -1) {
  const n = CONFIG.maxAP, step = (2 * Math.PI) / n, gap = 0.04;
  let s = '';
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + i * step + gap, a1 = a0 + step - gap * 2;
    s += `<path d="${wedgePath(a0, a1, 52, 80)}" class="seg ${i < ap ? 'on' : i >= max ? 'locked' : ''} ${i === losing ? 'losing' : ''} ${i === gaining ? 'gaining' : ''}"/>`;
  }
  return `<svg viewBox="-90 -90 180 180" class="apgauge ${apLevel(ap, max)} ${flash}">
    ${s}<circle r="48" class="hub"/>
    <text y="8" class="num">${ap}</text><text y="26" class="lbl">AP</text><text y="40" class="maxl">max ${max}</text></svg>`;
}

// Backpack: 6 slots down the left side of the board. ✕ arms, second click destroys.
let dropArmed = -1;
function renderPack() {
  const p = cur();
  let h = `<div class="packhead">Backpack ${p.items.length}/${CONFIG.maxItems}</div>`;
  for (let i = 0; i < CONFIG.maxItems; i++) {
    const it = p.items[i];
    h += it
      ? `<div class="slot-item"><span class="ic">${ITEMS[it.id].icon}</span><div><b>${esc(it.id)}</b>${condPips(it.cond)}</div>
          ${ITEMS[it.id].tool ? `<button class="use" data-use="${i}" title="Use tool (T)">Use <kbd>T</kbd></button>` : ''}
          <button class="drop ${dropArmed === i ? 'armed' : ''}" data-drop="${i}" title="Destroy item">${dropArmed === i ? 'Destroy?' : '✕'}</button></div>`
      : `<div class="slot-item empty"></div>`;
  }
  $('#pack').innerHTML = h;
}

// Players pane (bottom-right): everyone in the game, then who's on your tile.
function renderPlayers() {
  const p = cur();
  const row = (o, sub) => `<div class="prow-pl ${o.dead ? 'dead' : ''} ${o === p ? 'me' : ''}">
    <i style="background:${o.color}"></i><b>${esc(o.name)}${o === p ? ' <em>(you)</em>' : ''}</b><small>${sub}</small></div>`;
  const here = G.players.filter((o) => o.q === p.q && o.r === p.r);
  $('#players').innerHTML = `
    <div class="packhead">Players in server ${G.players.length}</div>
    ${G.players.map((o) => row(o, o.dead ? '☠️ dead' : esc(G.tiles[key(o.q, o.r)].def.name))).join('')}
    <div class="packhead" style="margin-top:8px">Players on tile ${here.length}</div>
    ${here.map((o) => row(o, o.dead ? '☠️' : `🎲 ${o.ap}`)).join('')}`;
}

// Resource counter in the header; values that changed since last render flash green/red.
let prevStats = {};
function renderStats() {
  const p = cur();
  const vals = { ...p.res };
  // AP gets its own big counter in the bottom-left of the board
  const apd = prevStats.ap === undefined ? '' : (p.ap > prevStats.ap || p.maxAP > prevStats.maxAP) ? 'up' : (p.ap < prevStats.ap || p.maxAP < prevStats.maxAP) ? 'down' : '';
  $('#apbox').innerHTML = apGauge(p.ap, apd, p.maxAP);
  const label = { ap: 'AP', food: 'Food', water: 'Water', morale: 'Morale', fuel: 'Fuel', ammo: 'Ammo' };
  $('#stats').innerHTML = Object.entries(vals).map(([k, v]) => {
    const prev = prevStats[k];
    const d = prev === undefined ? '' : v > prev ? 'up' : v < prev ? 'down' : '';
    const low = ['food', 'water', 'morale'].includes(k) && v <= 2 ? (v <= 1 ? 'low1' : 'low2') : '';
    if (d) setTimeout(() => sfx.res(k, d === 'up' ? 1 : -1), 0);
    const delta = d ? `<span class="delta ${d}">${v > prev ? '+' : '−'}${Math.abs(v - prev)}</span>` : '';
    return `<div class="stat ${k} ${d} ${low}" title="${label[k]}"><div class="orb"><b>${v}</b>${delta}</div><small>${label[k]}</small></div>`;
  }).join('');
  prevStats = { ...vals, ap: p.ap, maxAP: p.maxAP };
}

function renderPanel() {
  const p = cur(), t = tileOf(p);
  const noAP = p.ap < 1;
  const btn = (id, label, sub, dis) => {
    const keys = mode === 'threat' ? THREAT_KEYS : HOTKEYS;
    const hk = Object.keys(keys).find((k) => keys[k] === id);
    if (dis && selected === id) selected = null;
    return `<button class="act ${mode === id ? 'on' : ''} ${selected === id ? 'sel' : ''}" data-act="${id}" ${dis ? 'disabled' : ''}><b>${label}${hk ? `<kbd>${hk.toUpperCase()}</kbd>` : ''}</b><small>${sub}</small></button>`;
  };

  if (mode === 'threat') {
    const gun = weaponOf(p, 'ammo'), axe = weaponOf(p, 'ap');
    $('#actions').innerHTML = `
      <div class="note bad">🧟 ${t.zombies} zombie${t.zombies > 1 ? 's' : ''} on the ${esc(t.def.name)}! ${p.caught ? 'You were caught — fight!' : canFight(p) ? 'Fight or flee.' : 'No weapon — if you fail to flee, you die.'}</div>
      <div class="ribbon threat">
        ${btn('shoot', '🔫 Shoot', !gun ? 'Needs a gun' : !p.res.ammo ? 'No ammo' : `1 ${ICON.ammo} per shot · ${gun.id} ${gun.cond}`, !canShoot(p))}
        ${btn('melee', '🪓 Melee', !axe ? 'Needs a melee weapon' : p.ap < 1 ? 'No AP' : `1 🎲 per swing · ${axe.id} ${axe.cond}`, !canMelee(p))}
        ${btn('flee', '🏃 Flee', p.caught ? 'Caught — must fight' : !fleeAdj(p).length ? 'Nowhere to run' : t.zombies >= 6 ? 'Too many to outrun' : p.ap < 1 ? 'No AP' : `1 AP · roll > ${t.zombies}`, !canFlee(p, t))}
      </div>`;
    renderLog();
    return;
  }
  if (mode === 'drive') {
    const { v } = driving, fuel = vehicleFuel(v) === 'fuel';
    $('#actions').innerHTML = `
      ${t.zombies ? `<div class="note bad">🧟 ${t.zombies} zombie${t.zombies > 1 ? 's' : ''} here — stopping on this tile triggers them!</div>` : ''}
      <div class="note good">${ITEMS[v.id].icon} ${driving.flee ? 'Escaping' : 'Driving'} the ${v.id} — ${fuel ? `${ICON.fuel} ${p.res.fuel} fuel` : `🎲 ${p.ap} AP`} left · ${driving.steps} tile${driving.steps === 1 ? '' : 's'} so far.
        Next hex: A Q W D X Z · <b>Enter</b> / <b>Esc</b> to stop here.</div>`;
    renderLog();
    return;
  }
  if (mode === 'flee') {
    $('#actions').innerHTML = `
      <div class="note good">🏃 You got away! Press A Q W D X Z or click a highlighted hex to run to.</div>`;
    renderLog();
    return;
  }

  let warn = '';
  const apWarn = p.ap < 2 ? ` Fleeing costs 1 🎲 — keep some AP!` : '';
  const nextRound = G.round % 6 + 1;
  const nextUp = upkeepText(nextRound);
  if (nextUp && !isNight(nextRound)) warn = `<div class="note">Next round starts with a check: ${nextUp}</div>`;
  if (isNight(nextRound)) {
    warn = `<div class="note ${isNight(G.round) ? 'bad' : ''}">🌙 Next round starts with ${nextUp ? `a ${nextUp} check and ` : ''}a night attack — 1d6 🧟 vs your 🟡 ${t.safety}.${apWarn}</div>`;
  }

  $('#actions').innerHTML = `
    ${warn}
    ${noAP ? `<div class="note bad">Out of AP — you must sleep.</div>` : ''}
    <div class="ribbon">
      ${btn('sleep', '😴 Sleep', 'Gain 1d6 AP', false)}
      ${btn('scout', '🔭 Scout', '1 AP · reveal hex', noAP || !emptyAdj(p).length)}
      ${btn('move', '🚶 Move', '1 AP · adjacent', noAP || !moveAdj(p).length)}
      ${btn('scavenge', '🔍 Scavenge', t.zombies ? 'Blocked by zombies' : '1 AP · roll d6', noAP || t.zombies > 0)}
      ${Object.keys(ITEMS).filter((id) => ITEMS[id].vehicle && vehicleOf(p, id)).map((id) => {
        const v = vehicleOf(p, id), fuel = vehicleFuel(v) === 'fuel';
        return btn(id, `${ITEMS[id].icon} ${ITEMS[id].verb}`, !tileAdj(p).length ? 'Nowhere to go' : vehicleLeft(p, v) < 1 ? (fuel ? 'No fuel' : 'No AP') : `1 ${fuel ? ICON.fuel : '🎲'}/tile · cond ${v.cond}`, !canDrive(p, id));
      }).join('')}
      ${btn('fortify', '🔨 Fortify', t.zombies ? 'Blocked by zombies' : t.safety >= CONFIG.maxSafety ? `Safety full (${CONFIG.maxSafety})` : '1 AP · +1d6 🟡', noAP || t.zombies > 0 || t.safety >= CONFIG.maxSafety)}
    </div>`;

  renderLog();
}

// Chat-style log: only appends new entries, so scrolling back through history isn't disturbed.
let logShown = 0;
function renderLog() {
  const el = $('#log');
  if (logShown > G.log.length) { el.innerHTML = ''; logShown = 0; }
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  let h = '';
  for (const l of G.log.slice(logShown)) {
    if (l.cls === 'phase') { h += `<div class="msg phase"><span>${esc(l.msg)}</span></div>`; continue; }
    const dice = l.dice ? `<span class="mdice">${l.dice.map((v) => dieSvg(v)).join('')}</span>` : '';
    const who = l.cls === 'chat' ? `<b class="who-name">${esc(l.who)}</b>` : '';
    h += `<div class="msg ${l.cls}">${who}<div class="bubble">${dice}<span>${esc(l.msg)}</span></div></div>`;
  }
  if (h) el.insertAdjacentHTML('beforeend', h);
  logShown = G.log.length;
  updateUnread();
  if (nearBottom || h) el.scrollTop = el.scrollHeight;
}

// ---------------------------------------------------------------- wiring
$('#map').addEventListener('click', (e) => {
  const g = e.target.closest('[data-k]');
  if (g) { const [q, r] = g.dataset.k.split(',').map(Number); clickHex(q, r); }
});
$('#actions').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.act) act(b.dataset.act);
});
const HOTKEYS = { r: 'sleep', s: 'scout', w: 'move', a: 'scavenge', f: 'fortify', e: 'Truck', b: 'Bike' };
const THREAT_KEYS = { q: 'shoot', w: 'melee', e: 'flee' };
// ---------------------------------------------------------------- cheats (testing)
// Type in the note box, e.g.  scavenge(1)   scavenge(4,6)   sleep(8)   zombies(3)   item(axe)   help()
const CHEATS = {
  help: 'list cheats',
  'roll(a,b,…)': 'force the next dice rolls',
  'scavenge(r[,amount])': 'scavenge with table roll r (and amount / condition / zombie count)',
  'sleep(n)': 'sleep and gain n AP',
  'fortify(n)': 'fortify with a roll of n',
  'flee(n)': 'force your next flee roll',
  'night(n)': 'night attack now with n zombies',
  'zombies(n)': 'set zombies on your tile (fight/flee if > 0)',
  'safety(n)': 'set your tile\'s Safety',
  'item(name[,cond])': 'add an item (vehicles park on your tile)',
  'ap(n) maxap(n) food(n) water(n) morale(n) fuel(n) ammo(n)': 'set a value',
  'round(n) day(n)': 'jump the clock (no checks run)',
};
async function runCheat(cmd, args) {
  const p = cur(), t = tileOf(p), n = args.map((a) => (isNaN(+a) ? a : +a));
  const say = (m) => { G.log.push({ msg: `🛠️ ${m}`, cls: 'cheat' }); toast(`🛠️ ${m}`); };
  if (busy || modalKey) return say('Busy — finish the current popup first.');
  switch (cmd) {
    case 'help': G.log.push({ msg: '🛠️ Cheats: ' + Object.entries(CHEATS).map(([k, v]) => `${k} — ${v}`).join(' · '), cls: 'cheat' }); setLog(true); break;
    case 'roll': forced.push(...n.filter((v) => typeof v === 'number')); say(`Next rolls forced: ${forced.join(', ')}`); break;
    case 'scavenge':
      if (p.ap < 1) return say('No AP — use ap(n) first.');
      if (t.zombies) return say('Zombies here block scavenging — use zombies(0).');
      forced = [n[0], ...(n[1] !== undefined ? [n[1]] : [])]; say(`Scavenge forced: ${n.join(', ')}`);
      if (n[1] === undefined) forced.push(d6());
      await act('scavenge'); break;
    case 'sleep': forced = [n[0] ?? 6]; say(`Sleep forced: ${n[0]}`); await act('sleep'); break;
    case 'fortify':
      if (p.ap < 1) return say('No AP — use ap(n) first.');
      forced = [n[0] ?? 6]; say(`Fortify forced: ${n[0]}`); await act('fortify'); break;
    case 'flee': forced.push(n[0] ?? 6); say(`Next flee roll forced: ${n[0]}`); break;
    case 'night': forced = [n[0] ?? 6]; say(`Night attack: ${n[0]} zombies`); await nightAttack(); render(); if (G.over) showGameOver(); break;
    case 'zombies': t.zombies = Math.max(0, Math.min(6, n[0] ?? 0)); say(`Zombies here: ${t.zombies}`); render(); if (t.zombies) { await threatPrompt(p); render(); if (G.over) showGameOver(); } break;
    case 'safety': t.safety = Math.max(0, Math.min(CONFIG.maxSafety, n[0] ?? 0)); say(`Safety here: ${t.safety}`); render(); break;
    case 'item': {
      const id = Object.keys(ITEMS).find((k) => k.toLowerCase().replace(/\s/g, '') === String(n[0] ?? '').toLowerCase().replace(/\s/g, ''));
      if (!id) return say(`Unknown item. Items: ${Object.keys(ITEMS).join(', ')}`);
      const cond = Math.max(1, Math.min(CONFIG.maxCondition, n[1] ?? CONFIG.maxCondition));
      if (ITEMS[id].vehicle) { (t.vehicles ||= []).push({ id, cond }); say(`${id} (${cond}) parked here`); }
      else { await gainItem(p, id, cond); say(`${id} (${cond}) added`); }
      render(); break;
    }
    case 'ap': p.ap = Math.max(0, Math.min(p.maxAP, n[0] ?? 0)); say(`AP: ${p.ap}`); render(); break;
    case 'maxap': p.maxAP = Math.max(1, Math.min(CONFIG.maxAP, n[0] ?? CONFIG.maxAP)); p.ap = Math.min(p.ap, p.maxAP); say(`Max AP: ${p.maxAP}`); render(); break;
    case 'food': case 'water': case 'morale': case 'fuel': case 'ammo': p.res[cmd] = Math.max(0, n[0] ?? 0); say(`${cmd}: ${p.res[cmd]}`); render(); break;
    case 'round': G.round = Math.max(1, Math.min(6, n[0] ?? 1)); say(`Round ${G.round}`); render(); break;
    case 'day': G.day = Math.max(1, n[0] ?? 1); say(`Day ${G.day}`); render(); break;
    default: say(`Unknown cheat "${cmd}" — try help()`);
  }
}

$('#chatform').addEventListener('submit', (e) => {
  e.preventDefault();
  const inp = $('#chatinput'), msg = inp.value.trim();
  if (!msg) return;
  inp.value = '';
  const m = msg.match(/^\/?\s*([a-z]+)\s*(?:\((.*)\))?\s*$/i);
  if (m && (m[2] !== undefined || m[1].toLowerCase() === 'help')) {   // cheat command
    G.log.push({ msg, cls: 'chat', who: cur().name });
    inp.blur();
    runCheat(m[1].toLowerCase(), (m[2] ?? '').split(',').map((s) => s.trim()).filter(Boolean));
    renderLog();
    return;
  }
  G.log.push({ msg, cls: 'chat', who: cur().name });
  renderLog();
});
// Hotkeys select (highlight) an action; Enter confirms it. Tab always jumps to the note box.
let selected = null;
function selectAction(id) {
  selected = id;
  document.querySelectorAll('#actions .act').forEach((b) => b.classList.toggle('sel', b.dataset.act === id));
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {   // toggle between the note box and the game
    e.preventDefault();
    const inp = $('#chatinput');
    if (document.activeElement === inp) { inp.blur(); setLog(false); } else { setLog(true); inp.focus(); }
    return;
  }
  if (e.target.matches?.('input, textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (G.over) { if (e.key === 'Enter') { e.preventDefault(); newGame(['Survivor']); } return; }
  if (modalKey) { modalKey(e); return; }
  if (busy) { e.preventDefault(); popupInput(); return; }
  if (mode === 'drive' && (e.key === 'Enter' || e.key === 'Escape')) {
    e.preventDefault();
    if (driving.flee && !driving.steps) toast('Pick at least one hex to escape to.'); else driving.done();
    return;
  }
  const k = e.key.toLowerCase();
  if (k === 'm') { toggleMute(); return; }
  if (k === 'l' && !PICK_MODES.includes(mode)) { setLog(!logOpen()); return; }
  if (k === 't' && !PICK_MODES.includes(mode)) {   // use the first tool in the backpack
    const i = cur().items.findIndex((it) => ITEMS[it.id]?.tool);
    if (i >= 0) useTool(i); else toast('🧰 No tool in your backpack.');
    return;
  }
  if (PICK_MODES.includes(mode) && PICK_KEYS.includes(k)) {   // pick a neighbouring hex while scouting / moving / fleeing
    const p = cur(), [a, b] = PICK_DIRS[PICK_KEYS.indexOf(k)];
    clickHex(p.q + a, p.r + b);      // clickHex ignores invalid targets
    return;
  }
  if (e.key === 'Escape') {
    if (mode && mode !== 'flee') { mode = null; render(); } else if (selected) selectAction(null);
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    const b = selected && $(`#actions [data-act="${selected}"]`);
    if (b && !b.disabled) { selected = null; b.click(); }
    return;
  }
  const id = (mode === 'threat' ? THREAT_KEYS : HOTKEYS)[k];
  if (id) {
    const b = $(`#actions [data-act="${id}"]`);
    if (b && !b.disabled) selectAction(id);
    else if (b) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); }   // shake: not available
  }
});
$('#newgame').onclick = () => { if (!busy) newGame(['Survivor']); };
$('#popup').addEventListener('click', () => { if (!modalKey) popupInput(); });
$('#pack').addEventListener('click', (e) => {
  const u = e.target.closest('[data-use]'); if (u) { useTool(+u.dataset.use); return; }
  const b = e.target.closest('[data-drop]'); if (!b) return;
  const i = +b.dataset.drop;
  if (dropArmed === i) { dropArmed = -1; dropItem(i); } else { dropArmed = i; renderPack(); }
});
document.addEventListener('click', (e) => { if (dropArmed >= 0 && !e.target.closest('#pack')) { dropArmed = -1; renderPack(); } });
// Log panel: hidden by default; remembered per browser.
// Unread counter: log messages (not round markers) added while the log is hidden.
let logSeen = 0;
function updateUnread() {
  if (!G) return;
  if (logOpen()) logSeen = G.log.length;
  const n = G.log.slice(logSeen).filter((l) => l.cls !== 'phase').length;
  const open = logOpen();
  $('#logtoggle').innerHTML = `📜 ${open ? 'Hide' : 'Show'} log${!open && n ? ` <span class="unread">${n > 99 ? '99+' : n}</span>` : ''}`;
}
function setLog(open) {
  document.body.classList.toggle('log-open', open);
  updateUnread();
  try { localStorage.setItem('logOpen', open ? '1' : '0'); } catch { /* storage unavailable */ }
  requestAnimationFrame(applyView);
  if (open) { const el = $('#log'); el.scrollTop = el.scrollHeight; }
}
const logOpen = () => document.body.classList.contains('log-open');
$('#logtoggle').onclick = () => setLog(!logOpen());
try { setLog(localStorage.getItem('logOpen') === '1'); } catch { setLog(false); }

function toggleMute() { muted = !muted; $('#mute').textContent = muted ? '🔇' : '🔊'; }
$('#mute').onclick = toggleMute;

newGame(['Survivor']);
