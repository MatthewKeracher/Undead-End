// =====================================================================
//  GAME UI — draws the board and plays the engine's events as animations.
//  The rules themselves live in engine.js.
// =====================================================================

const E = Engine;
const { ICON, RES_LABEL, key, neighbors, isNight, cellText, upkeepText, passable, canEnter, canScavengeHere, canFortifyHere,
  canFight, vehicleFuel, vehicleLeft } = E;
const HEX = 120;

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const d6 = () => 1 + Math.floor(Math.random() * 6);   // only for the tumbling dice faces — real rolls happen in the engine
// Keys around S pick a neighbouring hex, laid out like the hexes themselves:
//   Q E        top-left, top-right
//  A   D       left, right
//   Z X        bottom-left, bottom-right
const PICK_DIRS = [[-1, 0], [0, -1], [1, -1], [1, 0], [0, 1], [-1, 1]];
const PICK_KEYS = ['a', 'q', 'e', 'd', 'x', 'z'];
const PICK_MODES = ['move', 'flee', 'drive'];
function pickNumber(p, q, r) {
  const i = PICK_DIRS.findIndex(([a, b]) => p.q + a === q && p.r + b === r);
  return i < 0 ? null : PICK_KEYS[i].toUpperCase();
}

let G = null;        // game state (owned by the engine)
let mode = null;     // 'move' while picking a hex; mirrors the decision being made: 'threat' | 'flee' | 'drive'
let modalKey = null;  // when set, receives all key presses (shooting, backpack-full prompt)
let checksOff = false;   // cheat: skip the food / water / hope checks (kept across new games until reload)
let justRevealed = [];    // tile keys to highlight after scouting, in reveal order
let camInit = false;

const cur = () => G.players[0];   // the survivor on this screen
const tileOf = (p) => E.tileOf(G, p);
const scoutTargets = (p) => E.scoutTargets(G, p);   // next to you, or within 2 with Binoculars
const moveAdj = (p) => E.moveAdj(G, p);
const fleeAdj = (p) => E.fleeAdj(G, p);
const driveAdj = (p) => E.driveAdj(G, p);
const canFlee = (p, t) => E.canFlee(G, p, t);
const vehicleOf = (p, id) => E.vehicleOf(G, p, id);
const canDrive = (p, id) => E.canDrive(G, p, id);
const vehiclesHere = (p) => tileOf(p).vehicles;
const driving = () => (cur().pending?.kind === 'drive' ? cur().pending : null);   // the trip in progress
// Decisions answered from the action tray / map / backpack (hope) rather than a popup
const PENDING_MODE = { threat: 'threat', fleeTo: 'flee', drive: 'drive', hope: 'hope' };

// ---------------------------------------------------------------- setup
function newGame(names = ['Survivor']) {
  G = E.createGame({ names, checksOff });
  $('#popup').hidden = true; busy = false;
  if (paused) togglePause();
  logSeen = 0; mode = null; modalKey = null; selected = null; justRevealed = []; camInit = false; logShown = Infinity; // forces log reset on next render
  prevStats = {};
  render();
  // the opening menu: play, or play the tutorial. Nothing happens (and the round timer waits) until it's answered;
  // then the starting round's check happens straight away.
  const game = G;
  busy = true;
  showMenu().then(async (tut) => {
    if (G !== game) return;
    busy = false;
    tutorial = tut; tutSeen = new Set();
    renderTimer();
    if (tutorial) await tutorCard(TUTORIAL.welcome);
    if (G === game) play([{ type: 'round', day: G.day, round: G.round }, ...E.start(G).events]);
  });
}

// The opening menu (and after New game).
function showMenu() {
  const pop = $('#popup');
  pop.className = 'menu';
  pop.innerHTML = `<div class="pcard menucard">
    <div class="ptitle"><small>A zombie survival game</small><h2>🧟 Undead End</h2></div>
    <div class="menubtns">
      <button class="primary" id="mplay">▶ Play <kbd>Enter</kbd></button>
      <button id="mtut">📖 Tutorial <kbd>T</kbd></button>
    </div>
    <small class="pskip">The tutorial explains each action and item the first time you meet it.</small></div>`;
  pop.hidden = false;
  return new Promise((res) => {
    const go = (tut) => { modalKey = null; pop.hidden = true; res(tut); };
    $('#mplay').onclick = (e) => { e.stopPropagation(); go(false); };
    $('#mtut').onclick = (e) => { e.stopPropagation(); go(true); };
    modalKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); go(false); } else if (e.key.toLowerCase() === 't') go(true); };
  });
}

// ---------------------------------------------------------------- tutorial
// A tutorial game explains each action the first time you pick it (Do it / Not yet) and each item the first
// time you find it. The words are in TUTORIAL (data.js). The round timer stays off throughout.
let tutorial = false;
let tutSeen = new Set();   // actions ('scout') and items ('item:Axe') already explained this game
async function tutorCard({ icon, title, text }, { kicker = 'Tutorial', confirm = false } = {}) {
  const pop = $('#popup');
  pop.className = 'tut';
  pop.innerHTML = `<div class="pcard tutcard">
    <div class="ptitle"><small>${kicker}</small><h2><span class="tutic">${icon}</span> ${esc(title)}</h2></div>
    ${text.map((t) => `<p>${esc(t)}</p>`).join('')}
    <div class="frow">${confirm ? '<button class="primary" id="tyes">Do it <kbd>Enter</kbd></button><button id="tno">Not yet <kbd>Esc</kbd></button>' : '<button class="primary" id="tyes">Got it <kbd>Enter</kbd></button>'}</div></div>`;
  pop.hidden = false;
  const yes = await new Promise((res) => {
    $('#tyes').onclick = (e) => { e.stopPropagation(); res(true); };
    if (confirm) $('#tno').onclick = (e) => { e.stopPropagation(); res(false); };
    modalKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); res(true); } else if (isBack(e)) res(!confirm); };
  });
  modalKey = null;
  pop.hidden = true;
  return yes;
}
// Before an action's first use: what it does. Resolves true to go ahead with it.
async function explain(id) {
  if (!tutorial || tutSeen.has(id) || !TUTORIAL.actions[id]) return true;
  tutSeen.add(id);
  return tutorCard(TUTORIAL.actions[id], { kicker: 'Tutorial · new action', confirm: true });
}
// After anything plays out: an item (or vehicle) you're seeing for the first time — carried, just found, or here.
async function explainFinds() {
  const p = cur();
  const ids = [...p.items.map((it) => it.id), p.pending?.kind === 'backpack' ? p.pending.item.id : null, ...vehiclesHere(p).map((v) => v.id)];
  for (const id of new Set(ids)) {
    if (!id || tutSeen.has(`item:${id}`) || G.over) continue;
    tutSeen.add(`item:${id}`);
    const def = ITEMS[id], kind = def.animal ? 'animal' : def.vehicle ? 'vehicle' : def.weapon ? 'weapon' : def.armor ? 'armor' : 'other';
    await tutorCard({ icon: itemIcon(id), title: id, text: [TUTORIAL.kinds[kind], def.desc, ...(def.animal ? [] : [TUTORIAL.condition])] }, { kicker: 'Tutorial · new find' });
  }
}

// ---------------------------------------------------------------- talking to the engine
// Send an action, play back what happened, then set up whatever decision the engine is waiting on.
async function send(action) {
  if (busy || G.over) return;
  mode = null;
  const res = E.act(G, cur().id, action);
  if (res.error) { toast(res.error); return render(); }
  await play(res.events);
}

let held = {};   // tile key → { safety, zombies } to draw instead, while the event that changed them waits to play
async function play(events) {
  busy = true;
  // the round is over: grey out the action bar until the next one has started and you can act again
  $('#actions').classList.toggle('roundover', events.some((ev) => ev.type === 'round'));
  // a night attack later in the batch has already happened in the engine: until it plays, draw its tile as it was before
  held = {};
  for (const ev of events) if (ev.type === 'night') held[ev.k] ??= ev.c.before;
  for (const ev of events) if (ev.player === undefined || ev.player === cur().id) await show(ev);
  busy = false;
  held = {};
  $('#actions').classList.remove('roundover');
  const d = cur().pending;
  mode = d ? PENDING_MODE[d.kind] ?? null : null;   // whatever was going on (e.g. a drive cut short by the timer) is over
  render();
  if (G.over) return showGameOver();
  if (tutorial) await explainFinds();
  await ask();
}

// Animate one engine event.
async function show(ev) {
  switch (ev.type) {
    case 'sleep': return sleepShow(ev);
    case 'fortify': await fortifyShow(ev); return showSafety(ev.k, ev.after);
    case 'scavenge': return scavengeShow(ev);
    case 'scout': return revealShow(ev);
    case 'reveal': return revealShow(ev, 900);   // stepped into the unknown
    case 'night': await nightShow(ev); delete held[ev.k]; return renderMap();
    case 'checks': return renderStats(ev.stats[cur().id]);   // the check's effect (after any night attack)
    case 'maxApLoss': return maxApLossShow(ev);
    case 'flee': return fleeShow(ev);
    case 'armor': return sfx.armor();
    case 'repair': return sfx.repair();
    case 'boost': return sfx.win(false);
    case 'hide': await hideShow(ev); return renderMap();
    case 'hope': toast(`${ITEMS[ev.item].icon} You find hope in the ${ev.item}.`); return sfx.hope();
    case 'lead': return leadShow(ev);
    case 'driveStep': sfx.drive(ev.fuel); return render();
    case 'move': renderMap(); return wait(450);   // arrive (the camera glides over) before the round can move on
    case 'outOfFuel': return toast(`${ITEMS[ev.vehicle].icon} Out of ${ev.fuel === 'ap' ? 'AP' : ev.fuel} — stopping here.`);
    case 'die': return tone(200, 1.4, 'sawtooth', 0.12, -170);
    case 'round': return roundBannerShow(ev);
    case 'town': return townBannerShow(ev);
    case 'noteDone': return toast(`📝 You've reached the ${ev.name}${ev.by ? ` — ${ev.by}'s stash is here somewhere` : ''}.`);
  }
}

// A new round: a band sweeps across the middle of the board — "Day X · Round Y", with what the round brings.
async function roundBannerShow({ day, round }) {
  const el = $('#roundbanner'), night = isNight(round), attack = E.attackDue(G, round), check = G.checksOff ? '' : upkeepText(round);
  const omen = round === 1 && G.badNight ? ' · <b class="omen">🌘 bad night coming</b>' : '';
  el.className = night ? 'night' : 'day';
  el.innerHTML = `<div class="rb-title">Day ${day} · Round ${round}</div>
    <div class="rb-sub">${night ? '🌙 Night' : '☀️ Day'}${attack ? ' · night attack' : ''}${check ? ` · check ${check}` : ''}${omen}</div>`;
  el.hidden = false;
  if (night) tone(110, 0.9, 'sine', 0.1, -30); else [392, 523].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.06), i * 120));
  await new Promise((res) => { const tm = setTimeout(res, skipAnim ? 0 : 1700); dismissPopup = () => { clearTimeout(tm); res(); }; });
  dismissPopup = null;
  el.hidden = true;
}

// First steps into a village, town or city: a band across the board names it, with its welcome sign (TOWN_SIGNS).
const townSign = (name) => TOWN_SIGNS[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TOWN_SIGNS.length];
async function townBannerShow({ name, kind }) {
  const el = $('#roundbanner');
  el.className = 'town';
  el.innerHTML = `<div class="rb-sub">You have discovered the ${kind} of</div><div class="rb-title">${esc(name)}</div><div class="rb-sign">“${esc(townSign(name))}”</div>`;
  el.hidden = false;
  [392, 494, 587, 784].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.06), i * 110));
  await new Promise((res) => { const tm = setTimeout(res, skipAnim ? 0 : 2600); dismissPopup = () => { clearTimeout(tm); res(); }; });
  dismissPopup = null;
  el.hidden = true;
}

// Decisions that need a popup. (Fight or Flee, where to flee and driving use the action tray and the map.)
async function ask() {
  const p = cur(), d = p.pending;
  if (!d) return;
  if (d.kind === 'fight') return fightPopup(p);
  if (d.kind === 'armor') return send({ type: 'decide', choice: await armorPrompt(p.items[d.item]) });
  if (d.kind === 'escape') return send({ type: 'decide', choice: await chooseEscape(d.options) });
  if (d.kind === 'backpack') return send({ type: 'decide', choice: await backpackPrompt(p, d.item) });
  if (d.kind === 'stash') return send({ type: 'decide', choice: await stashPrompt(d) });
}

// ---------------------------------------------------------------- round timer (optional in single player: cheat timer(on))
// CONFIG.roundSeconds to act each round, or you lose 1 AP — as online. Paused while animations play.
// Acting ends the round straight away (you're the only survivor), so the clock only bites if you hesitate.
let timerOn = true;   // on by default; timer(off) turns it off (remembered)
try { timerOn = localStorage.getItem('roundTimer') !== '0'; } catch { /* storage unavailable */ }
const timer = { game: null, day: 0, round: 0, left: 0, fired: false };
const fullTime = () => CONFIG.roundSeconds * 1000;
function tickTimer(dt) {
  if (!G) return;
  if (timer.game !== G || timer.day !== G.day || timer.round !== G.round) {   // new game or new round: full time again
    Object.assign(timer, { game: G, day: G.day, round: G.round, left: fullTime(), fired: false });
  }
  if (timerOn && !tutorial && !busy && !paused && !G.over && !timer.fired) {
    const before = Math.ceil(timer.left / 1000);
    timer.left = Math.max(0, timer.left - dt);
    const s = Math.ceil(timer.left / 1000);
    if (s < before && s > 0 && s <= 5) tone(880, 0.05, 'square', 0.04);   // tick tock
    // out of time — but let any open popup (fight, armor, backpack…) be answered first
    if (!timer.left && !modalKey) {
      timer.fired = true;
      if (!cur().pending) mode = null;   // stop picking a hex — but keep Fight or Flee etc. on screen
      const res = E.timeUp(G);
      tone(220, 0.4, 'sawtooth', 0.08, -80);
      // mid-decision (e.g. Fight or Flee), the engine waits for it, then you lose the AP
      toast(cur().pending ? "⏱️ Time's up — deal with this, then you lose 1 AP." : "⏱️ Time's up — you lose 1 AP.");
      if (res.events.length) play(res.events); else render();
    }
  }
  renderTimer();
}
function renderTimer() {
  const el = $('#timer');
  if (!timerOn || tutorial || !G || G.over) { el.innerHTML = ''; el.className = ''; return; }
  const s = Math.ceil(timer.left / 1000);
  el.className = `${s <= 10 ? 'low' : ''} ${busy || paused ? 'paused' : ''}`;
  el.innerHTML = `⏱️ <b>${s}s</b><span class="bar"><i style="width:${(100 * timer.left / fullTime()).toFixed(1)}%"></i></span>`;
}
// Pause (single player only — online the clock is shared): stops the round timer and covers the board.
let paused = false;
function togglePause() {
  if (!G || G.over) return;
  paused = !paused;
  $('#pauseveil').hidden = !paused;
  tone(paused ? 330 : 494, 0.12, 'triangle', 0.06);
  renderTimer();
}

function setTimer(on) {
  timerOn = on;
  try { localStorage.setItem('roundTimer', on ? '1' : '0'); } catch { /* storage unavailable */ }
  Object.assign(timer, { left: fullTime(), fired: false });   // a fresh 30 s when switched on
  renderTimer();
}

// ---------------------------------------------------------------- death
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

// ---------------------------------------------------------------- fight / flee popups
async function chooseEscape(opts) {
  const pop = $('#popup');
  pop.className = '';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>Escaped!</small><h2>How do you get away?</h2></div>
    <ol class="pack-choose">${opts.map((o, n) => `<li><button data-n="${n}" ${o.ok ? '' : 'disabled'}><kbd>${n + 1}</kbd> ${o.label} <em>${o.sub}</em></button></li>`).join('')}</ol>
    <small class="pskip">press 1–${opts.length} or click</small></div>`;
  pop.hidden = false;
  const pick = await new Promise((res) => {
    pop.querySelectorAll('[data-n]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); if (opts[+b.dataset.n].ok) res(opts[+b.dataset.n].id); }));
    modalKey = (e) => { const o = opts[+e.key - 1]; if (o && o.ok) res(o.id); };
  });
  modalKey = null;
  pop.hidden = true;
  return pick;
}

async function armorPrompt(armor) {
  const pop = $('#popup');
  pop.className = 'zombie';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>Caught!</small><h2>${itemIcon(armor.id)} ${esc(armor.id)} can take the hit</h2></div>
    <p>${condPips(armor.cond)} → ${condPips(armor.cond - 1)}</p>
    <div class="frow">
      <button class="primary" id="ayes">Take the hit &amp; reroll <small>(−1 condition, 1 AP)</small> <kbd>Enter</kbd></button>
      <button id="ano">No <kbd>Backspace</kbd></button>
    </div></div>`;
  pop.hidden = false;
  const yes = await new Promise((res) => {
    $('#ayes').onclick = (e) => { e.stopPropagation(); res(true); };
    $('#ano').onclick = (e) => { e.stopPropagation(); res(false); };
    modalKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); res(true); } else if (isBack(e)) res(false); };
  });
  modalKey = null;
  pop.hidden = true;
  return yes;
}

async function fleeShow(ev) {
  const pop = $('#popup');
  skipAnim = false;
  pop.className = '';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>🏃 Flee</small><h2>Roll more than ${ev.zombies}</h2></div>
    <div class="cpips">${[...Array(6)].map((_, i) => `<i class="${i < ev.zombies ? 'zed' : ''}"></i>`).join('')}</div>
    <div class="prow2"><div class="slot" id="pd2d"></div></div>
    <div class="presult" id="pres"></div>
    <small class="pskip">click or press any key</small></div>`;
  pop.hidden = false;
  await wait(150);
  await rollDie($('#pd2d'), ev.r, 1000);
  await wait(200);
  $('#pres').innerHTML = ev.ok ? `<div class="big good">Escaped!</div><small class="muted">Pick a safe hex: A Q E D X Z</small>` : `<div class="big bad">Caught!</div>`;
  if (ev.ok) sfx.win(false); else { pop.classList.add('zombie'); sfx.zombie(); }
  await popupHold(ev.ok ? 1400 : 2200);
}

// One round of fighting (the engine has already taken 1 weapon condition). Each attack (Enter) costs 1 ammo (gun),
// 1 AP (melee) or 1 fuel (chainsaw) and kills 1 zombie (the chainsaw: up to 6 — the whole tile). The popup stays open for the whole fight round.
async function fightPopup(p) {
  const d = p.pending, t = tileOf(p), w = p.items[d.weapon], def = ITEMS[w.id], melee = def.uses === 'ap';
  const left = () => (melee ? p.ap : p.res[def.uses]);
  const unit = { ap: 'AP', ammo: 'ammo', fuel: 'fuel' }[def.uses], verb = def.verb.toLowerCase();
  const fighting = () => p.pending === d;
  const pop = $('#popup');
  pop.className = 'fight';
  let after = [];   // events from the attack (or stop) that ended the fight round
  const draw = () => {
    pop.innerHTML = `<div class="pcard">
      <div class="ptitle"><small>⚔️ Fight · ${esc(t.def.name)}</small><h2>${t.zombies ? `${t.zombies} zombie${t.zombies > 1 ? 's' : ''}` : 'Clear!'}</h2></div>
      <div class="cpips">${[...Array(6)].map((_, i) => `<i class="${i < t.zombies ? 'zed' : i < d.start ? 'dead' : ''}"></i>`).join('')}</div>
      <div class="fammo">${melee ? `${ICON.ap} <b class="${p.ap <= 1 ? 'warnap' : ''}">${p.ap}</b> AP` : `${ICON[def.uses]} <b>${left()}</b> ${unit}`} · ${itemIcon(w.id)} ${w.id} condition ${condPips(w.cond)}</div>
      ${melee && p.ap === 1 && t.zombies ? `<div class="note bad">Last AP — swinging now leaves you nothing to flee with.</div>` : ''}
      <div class="frow">
        <button class="primary" id="fire" ${fighting() && left() && t.zombies ? '' : 'disabled'}>${itemIcon(w.id)} ${def.verb} <small>(1 ${unit}${def.kills > 1 ? ` · up to ${def.kills} 🧟` : ''})</small> <kbd>Enter</kbd></button>
        <button id="stop">Stop <kbd>Backspace</kbd></button>
      </div>
      <small class="pskip"><kbd>Shift</kbd>+<kbd>Enter</kbd> ${verb} until clear (or out of ${unit})</small></div>`;
    $('#fire').onclick = (e) => { e.stopPropagation(); fire(); };
    $('#stop').onclick = (e) => { e.stopPropagation(); stop(); };
  };
  let done;
  const over = new Promise((res) => { done = res; });
  const finish = () => { modalKey = null; done(); };
  const fire = () => {
    if (!fighting()) return;
    const res = E.act(G, p.id, { type: 'decide', choice: 'attack' });
    if (res.error) return;
    (sfx[def.sound] ?? { ap: sfx.axe, ammo: sfx.gun, fuel: sfx.saw }[def.uses])();
    draw();
    pop.querySelector('.pcard').classList.add('flash');
    const kills = res.events.find((ev) => ev.type === 'hit')?.kills ?? 1;
    for (let i = t.zombies; i < t.zombies + kills; i++) pop.querySelectorAll('.cpips i')[i]?.classList.add('hit');
    renderStats();
    if (!fighting()) { after = res.events; setTimeout(finish, 700); }
  };
  const stop = () => {
    if (fighting()) after = E.act(G, p.id, { type: 'decide', choice: 'stop' }).events;
    finish();
  };
  // Shift+Enter: keep attacking until the tile is clear or you run out of ammo / AP.
  let auto = false;
  const fireAll = () => {
    if (auto) return;
    auto = true;
    const step = () => { if (!fighting() || !modalKey) return; fire(); setTimeout(step, 220); };
    step();
  };
  modalKey = (e) => {
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); fireAll(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!auto) fire(); }
    else if (isBack(e)) stop();
  };
  draw();
  pop.hidden = false;
  await over;
  pop.hidden = true;
  await play(after.filter((ev) => ev.type !== 'hit'));
}

// An item's picture for HTML: its own image if it has one (img: in data.js), otherwise its emoji.
// (Plain text — toasts, the log — always uses the emoji.)
const itemIcon = (id) => ITEMS[id].img ? `<img class="iimg" src="${ITEMS[id].img}" alt="${ITEMS[id].icon}">` : ITEMS[id].icon;
// condition pips — purple for a hope item (pass its id)
const condPips = (n, id) => `<span class="cond ${ITEMS[id]?.hope ? 'hope' : ''}">${[...Array(6)].map((_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;

// ---------------------------------------------------------------- items
// Backpack full: pick an item to leave on this tile (the new one is last — picking it leaves it where it was found).
async function backpackPrompt(p, item) {
  const pop = $('#popup');
  const all = [...p.items, item];
  pop.className = '';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>Backpack full (${CONFIG.maxItems}/${CONFIG.maxItems})</small><h2>Leave one here</h2></div>
    <ol class="pack-choose">${all.map((it, i) => `<li><button data-i="${i}"><kbd>${i + 1}</kbd> ${itemIcon(it.id)} ${it.id} ${condPips(it.cond, it.id)}${i === all.length - 1 ? ' <em>NEW</em>' : ''}</button></li>`).join('')}</ol>
    <small class="pskip">press 1–${all.length} or click · it stays on this tile, condition and all</small></div>`;
  pop.hidden = false;
  const i = await new Promise((res) => {
    pop.querySelectorAll('[data-i]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); res(+b.dataset.i); }));
    modalKey = (e) => { const n = +e.key; if (n >= 1 && n <= all.length) res(n - 1); };
  });
  modalKey = null;
  pop.hidden = true;
  return i;
}

// A Note names a place: it appears on the map, purple-bordered, and the camera glides over to show it.
async function leadShow(ev) {
  justRevealed = [ev.k];
  renderMap();
  cameraTo(...pix(...ev.k.split(',').map(Number)));
  toast(`📝 “${ev.text}”`);
  sfx.hope();
  await new Promise((res) => { const tm = setTimeout(res, skipAnim ? 0 : 2400); dismissPopup = () => { clearTimeout(tm); res(); }; });
  dismissPopup = null;
  justRevealed = [];
  renderMap();   // back to you
}

// A stash whose items don't all fit: choose what to carry from your backpack and the stash together (yours start
// ticked) — up to 6. Whatever you don't carry stays in the stash.
async function stashPrompt(d) {
  const p = cur(), s = G.tiles[d.k].stashes.find((x) => x.row === d.row), mine = p.items.length;
  const all = [...p.items, ...s.items], max = CONFIG.maxItems;
  const pop = $('#popup'), picked = new Set(p.items.map((_, i) => i));
  pop.className = '';
  pop.hidden = false;
  return new Promise((res) => {
    const done = () => { modalKey = null; pop.hidden = true; res([...picked]); };
    const toggle = (i) => {
      if (picked.has(i)) picked.delete(i); else if (picked.size < max) picked.add(i);
      draw();
    };
    const row = (it, i) => `<li><button data-i="${i}" class="${picked.has(i) ? 'on' : ''}" ${!picked.has(i) && picked.size >= max ? 'disabled' : ''}>${i < 9 ? `<kbd>${i + 1}</kbd>` : ''} ${itemIcon(it.id)} ${it.id} ${condPips(it.cond, it.id)}${picked.has(i) ? ' <em>CARRY</em>' : ''}</button></li>`;
    const draw = () => {
      pop.innerHTML = `<div class="pcard">
        <div class="ptitle"><small>🎒 ${esc(s.owner)}'s stash</small><h2>What do you carry? <span class="muted">${picked.size}/${max}</span></h2></div>
        <ol class="pack-choose">
          ${mine ? `<li class="pc-head">Your backpack</li>${all.slice(0, mine).map((it, i) => row(it, i)).join('')}` : ''}
          <li class="pc-head">${esc(s.owner)}'s stash</li>${all.slice(mine).map((it, i) => row(it, mine + i)).join('')}
        </ol>
        <button class="primary" id="take">Carry ${picked.size} <kbd>Enter</kbd></button>
        <small class="pskip">tap to swap · the rest stay in the stash</small></div>`;
      pop.querySelectorAll('[data-i]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); toggle(+b.dataset.i); }));
      $('#take').onclick = (e) => { e.stopPropagation(); done(); };
    };
    modalKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); done(); return; }
      const n = +e.key;
      if (n >= 1 && n <= Math.min(9, all.length)) toggle(n - 1);
    };
    draw();
  });
}

// Short on-screen message above the action tray.
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// Tools: free to use at any time (outside popups). Transfer some of the tool's condition to another
// item or a vehicle on your tile (up to its max of 6). A tool at 0 condition is destroyed.
async function useTool(i) {
  const p = cur(), tool = p.items[i];
  if (!tool || !ITEMS[tool.id]?.tool || busy || modalKey || G.over || p.pending) return;
  const targets = [...p.items.map((it, index) => ({ it, from: 'pack', index })), ...vehiclesHere(p).map((it, index) => ({ it, from: 'tile', index }))]
    .filter(({ it }) => it !== tool && it.cond < CONFIG.maxCondition);
  const pop = $('#popup');
  const close = () => { modalKey = null; pop.hidden = true; };
  if (!targets.length) {
    toast(`${ITEMS[tool.id].icon} Nothing to repair — every other item is at full condition (${CONFIG.maxCondition}).`);
    return;
  }
  if (!(await explain('tool'))) return;
  pop.className = 'tool';
  // step 1: pick the item to repair
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>${itemIcon(tool.id)} ${tool.id} ${condPips(tool.cond)}</small><h2>Repair which item?</h2></div>
    <ol class="pack-choose">${targets.map(({ it }, n) => `<li><button data-n="${n}"><kbd>${n + 1}</kbd> ${itemIcon(it.id)} ${it.id} ${condPips(it.cond)}</button></li>`).join('')}</ol>
    <small class="pskip">press 1–${targets.length} or click · Backspace to cancel</small></div>`;
  pop.hidden = false;
  const target = await new Promise((res) => {
    pop.querySelectorAll('[data-n]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); res(targets[+b.dataset.n]); }));
    modalKey = (e) => { if (isBack(e)) res(null); const n = +e.key; if (n >= 1 && n <= targets.length) res(targets[n - 1]); };
  });
  if (!target) return close();
  // step 2: how much condition to transfer
  const max = Math.min(tool.cond, CONFIG.maxCondition - target.it.cond);
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>${itemIcon(tool.id)} ${tool.id} ${condPips(tool.cond)} → ${itemIcon(target.it.id)} ${target.it.id} ${condPips(target.it.cond)}</small><h2>Transfer how much?</h2></div>
    <div class="frow">${[...Array(max)].map((_, n) => `<button data-a="${n + 1}"><kbd>${n + 1}</kbd></button>`).join('')}</div>
    <small class="pskip">press 1–${max} or click · Backspace to cancel</small></div>`;
  const amount = await new Promise((res) => {
    pop.querySelectorAll('[data-a]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); res(+b.dataset.a); }));
    modalKey = (e) => { if (isBack(e)) res(0); const n = +e.key; if (n >= 1 && n <= max) res(n); };
  });
  close();
  if (!amount) return render();
  send({ type: 'tool', tool: i, target: { from: target.from, index: target.index }, amount });
}

async function dropItem(i) {
  if (!cur().items[i] || busy || modalKey) return;
  if (await explain('drop')) send({ type: 'drop', item: i });
}
async function takePills(i) {
  if (cur().pending || busy || modalKey) return;
  if (await explain('pills')) send({ type: 'boost', item: i });
}

// ---------------------------------------------------------------- actions
// Buttons and hotkeys come here. Scout and Move first ask for a hex (clickHex).
// In a tutorial, each action's first use is explained first (and can be called off).
async function act(name) {
  if (busy || modalKey || G.over) return;
  const p = cur();
  if (mode === 'threat') { if ((name === 'flee' || name === 'hide') && await explain(name)) send({ type: 'decide', choice: name }); return; }   // weapons: in the backpack
  if (name === 'stopdrive') return send({ type: 'decide', choice: 'stop' });   // the touch way to end a trip
  if (p.pending) return;
  if (name === 'move') { if (mode !== name && !(await explain('move'))) return; mode = mode === name ? null : name; return render(); }
  if (name === 'pause') return togglePause();
  if (isDriveKey(name)) name = keyedVehicle(p, name);
  if (!name) return;
  if (ITEMS[name]?.vehicle) { if (await explain('drive')) send({ type: 'drive', vehicle: name }); return; }
  if (await explain(name)) send({ type: name });
}

// A hex picked on the map (or with A Q E D X Z) while moving, fleeing or driving.
function clickHex(q, r) {
  if (busy || !mode) return;
  const p = cur(), t = G.tiles[key(q, r)];
  if (!neighbors(p.q, p.r).some(([a, b]) => a === q && b === r)) return;
  // unexplored hexes (no tile yet) are fair game: they're revealed as you arrive
  if (mode === 'move' && (!t || canEnter(p, t))) send({ type: 'move', q, r });
  else if (mode === 'flee' && (!t || (passable(t) && !t.zombies))) send({ type: 'decide', choice: { q, r } });
  else if (mode === 'drive' && (!t || passable(t))) send({ type: 'decide', choice: { q, r } });
}

// New locations: they appear one after another around you, then pause so the player can take them in.
async function revealShow(ev, pause = 2800) {
  justRevealed = ev.tiles.map((x) => x.k);
  renderMap();
  const towns = [...new Map(ev.tiles.filter((x) => x.town).map((x) => [x.town, x])).values()];   // the settlements they belong to
  toast(`${ev.map ? '🗺️ The Map shows' : '🔭 Discovered'}: ${ev.tiles.map((x) => `${x.icon} ${x.name}`).join(', ')}${towns.length ? ` · 🏘️ ${towns.map((x) => `${x.town} (${x.kind})`).join(', ')}` : ''}`);
  ev.tiles.forEach((_, i) => setTimeout(() => tone(520 + i * 60, 0.15, 'triangle', 0.07), i * 120));
  await new Promise((res) => { const tm = setTimeout(res, pause + ev.tiles.length * 120); dismissPopup = () => { clearTimeout(tm); res(); }; });
  dismissPopup = null;
  justRevealed = [];
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
// Recorded sounds (assets/), restarted rather than stacked when played again quickly.
const CLIPS = { chainsaw: 'assets/chainsaw.mp3', pistol: 'assets/pistol.mp3', shotgun: 'assets/shotgun.mp3' }, clipEls = {};
function clip(name, volume = 0.7) {
  if (muted) return;
  try {
    const a = (clipEls[name] ??= Object.assign(new Audio(CLIPS[name]), { preload: 'auto' }));
    a.volume = volume; a.currentTime = 0;
    a.play().catch(() => { /* not allowed yet, or unavailable */ });
  } catch { /* audio unavailable */ }
}
const sfx = {
  tick: () => tone(500 + Math.random() * 500, 0.03, 'square', 0.025),
  land: () => tone(140, 0.18, 'triangle', 0.15, -40),
  win: (big) => (big ? [523, 659, 784, 1047] : [523, 659, 784]).forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.07), i * 90)),
  count: () => tone(900, 0.02, 'square', 0.02),
  gun: () => clip('pistol'),        // guns (the Pistol)
  shotgun: () => clip('shotgun'),   // the blast, then the pump
  // resource sounds: dir = +1 gained, -1 spent
  res: (k, dir) => {
    if (dir < 0) {
      if (k === 'food') { noise(0.07, 0.25, 1800); setTimeout(() => noise(0.06, 0.2, 1400), 90); setTimeout(() => noise(0.05, 0.15, 1100), 170); }   // crunch crunch
      else if (k === 'water') { tone(520, 0.12, 'sine', 0.15, -260); setTimeout(() => tone(380, 0.14, 'sine', 0.12, -180), 130); }               // gulp gulp
      else if (k === 'fuel') { noise(0.3, 0.12, 600); tone(140, 0.3, 'sine', 0.08, -40); }                                                      // slosh
      else if (k === 'ammo') { if (!modalKey) tone(1600, 0.03, 'square', 0.05); }                                                             // click (gun fight has its own sound)
    } else {
      const base = { food: 440, water: 587, fuel: 330, ammo: 784 }[k] || 500;
      tone(base, 0.09, 'triangle', 0.08); setTimeout(() => tone(base * 1.5, 0.12, 'triangle', 0.07), 70);   // little pickup chime
    }
  },
  hope: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.5, 'sine', 0.05), i * 160)),   // a music-box rise
  repair: () => [0, 110, 220].forEach((d, i) => setTimeout(() => { noise(0.05, 0.2, 3000); tone(900 + i * 200, 0.05, 'square', 0.03); }, d)),
  armor: () => { noise(0.12, 0.35, 900); tone(180, 0.2, 'square', 0.1, -60); setTimeout(() => tone(1200, 0.25, 'triangle', 0.04, -300), 60); },
  drive: (kind) => kind === 'fuel'
    ? (tone(70, 0.4, 'sawtooth', 0.09, 40), noise(0.35, 0.12, 400))
    : kind === 'water'   // hooves: clip-clop
      ? [0, 140, 300, 440].forEach((d, i) => setTimeout(() => { noise(0.04, 0.12, 1800); tone(i % 2 ? 520 : 680, 0.04, 'square', 0.04); }, d))
      : (noise(0.08, 0.1, 2500), setTimeout(() => tone(1400, 0.08, 'sine', 0.05), 80)),
  axe: () => { tone(320, 0.12, 'sawtooth', 0.05, -260); setTimeout(() => tone(70, 0.18, 'square', 0.18, -30), 90); },
  bow: () => { tone(220, 0.25, 'triangle', 0.12, -120); noise(0.12, 0.12, 4000); },   // twang and whoosh
  saw: () => clip('chainsaw'),
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

async function scavengeShow({ name, rows: table, tries, r, hit, amt, amts, dice, c }) {
  const e = hit.e;
  const pop = $('#popup');
  skipAnim = false;
  pop.className = '';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>Scavenging</small><h2>${esc(name)}</h2></div>
    <div class="prow">
      <div class="slot" id="pd1"></div>
      <ol class="ptable">${table.map((row, i) => `<li data-i="${i + 1}" class="${rowClass(row)}"><b>${i + 1}</b>${esc(rowText(row))}</li>`).join('')}</ol>
    </div>
    <div class="prow2" id="pd2"></div>
    <div class="presult" id="pres"></div>
    <small class="pskip">click or press any key</small></div>`;
  pop.hidden = false;

  const rows = [...pop.querySelectorAll('.ptable li')];
  const mark = (v) => rows.forEach((li) => li.classList.toggle('hl', +li.dataset.i === v));
  await wait(150);
  // a crossed-off row: shake it and roll again, until the die lands on something
  for (const [i, v] of tries.entries()) {
    await rollDie($('#pd1'), v, i ? 700 : 1100, mark);
    if (i === tries.length - 1) break;
    rows[v - 1].classList.add('nope');
    $('#pres').innerHTML = `<small class="muted">${v} is already looted — rolling again (${i + 1}/${CONFIG.maxRerolls})…</small>`;
    tone(300, 0.15, 'triangle', 0.06, -120);
    await wait(500);
    rows[v - 1].classList.remove('nope');
  }
  $('#pres').innerHTML = '';
  rows.forEach((li) => li.classList.remove('hl'));
  rows[r - 1].classList.add('picked');
  await wait(350);

  if (hit.kind === 'looted') {   // out of rerolls
    rows[r - 1].classList.remove('picked');
    rows[r - 1].classList.add('nope');
    $('#pres').innerHTML = `<div class="big bad">You found nothing</div><small class="muted">Every roll landed on a looted row.</small>`;
    tone(300, 0.25, 'triangle', 0.07, -120); setTimeout(() => tone(200, 0.35, 'triangle', 0.07, -80), 160);
  } else if (hit.kind === 'stash') {
    const s = hit.stash, lone = E.loneItem(s);
    $('#pres').innerHTML = lone ? `<div class="big good jackpot">${itemIcon(lone.id)} ${esc(lone.id)}</div><div>${condPips(lone.cond, lone.id)}</div>`
      : `<div class="big good jackpot">🎒 ${esc(s.owner)}'s stash</div><div class="stashgot">${E.stashText(s) || 'empty'}</div>`;
    pop.classList.add('jackpot');
    sfx.win(true);
  } else if (e.zombies) {
    pop.classList.add('zombie'); sfx.zombie();
    $('#pd2').innerHTML = `<span class="muted">How many?</span><div class="slot" id="pd2d"></div>`;
    await rollDie($('#pd2d'), amt, 800);
    await wait(250);
    await contestAnim(c);
  } else {
    // one die per part of the row (a mix like Food + Water or Truck + Fuel has two)
    const parts = e.parts ?? [e];
    let big = false, shown = '';
    for (const [i, x] of parts.entries()) {
      const a = amts[i];
      if (ITEMS[x.item]?.map || ITEMS[x.item]?.animal) {   // no condition to roll: a map is read straight away, an animal never wears out
        shown += `<div class="big good jackpot">${itemIcon(x.item)} ${esc(x.item)}</div><small class="muted">${ITEMS[x.item].map ? 'It shows the land all around…' : `It waits here — 1 ${ICON.water}/tile, 1 ${ICON.food}/trip`}</small>`;
        $('#pres').innerHTML = shown;
        big = true;
        continue;
      }
      $('#pd2').innerHTML = `<span class="muted">${x.item ? `${esc(x.item)} condition?` : parts.length > 1 ? `How much ${x.res}?` : 'How much?'}</span>${dice[i].map((_, j) => `<div class="slot" id="pd2d${j}"></div>`).join('')}${x.n > 1 ? `<span class="mult">× ${x.n}</span>` : ''}`;
      await Promise.all(dice[i].map((v, j) => rollDie($(`#pd2d${j}`), v, 800 + j * 150)));
      await wait(250);
      if (x.item) {
        shown += `<div class="big good jackpot">${itemIcon(x.item)} ${esc(x.item)}</div><div>${condPips(a, x.item)}</div>`;
        $('#pres').innerHTML = shown;
        big = true;
      } else {
        const total = a * x.n;
        big ||= total >= 8;
        $('#pres').innerHTML = `${shown}<div class="big good ${total >= 8 ? 'jackpot' : ''}">+<span id="pcount">0</span> ${ICON[x.res]} ${RES_LABEL[x.res]}</div>`;
        for (let k = 1; k <= total; k++) { $('#pcount').textContent = k; sfx.count(); await wait(Math.min(70, 500 / total)); }
        shown = $('#pres').innerHTML.replace(' id="pcount"', '');
      }
    }
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
  const max = c.slots ?? CONFIG.maxZombies;   // circles for Safety and zombies alike
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
  const lost = c.n - added;
  $('#ctext').innerHTML = `<div class="big bad">🧟 ${c.left} ${c.after.safety ? 'at the door' : 'broke through'}!</div>`
    + (c.after.safety ? `<small class="muted">🟡 ${c.after.safety} Safety between you.</small>` : lost > 0 ? `<small class="muted">The tile is overrun (max ${CONFIG.maxZombies}).</small>` : '');
  $('#popup').classList.add('zombie'); sfx.zombie();
}

// Hiding: the zombies march left into the 🟡 Safety — the one in front meets the last yellow pip and both go,
// then the rest march on into the next, until one side runs out. Any left stand where the Safety was.
async function hideShow({ name, c }) {
  const pop = $('#popup');
  skipAnim = false;
  pop.className = '';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>🛡️ Hiding</small><h2>${esc(name)}</h2></div>
    <div class="presult" id="pres"><div class="cpips ${c.slots > 8 ? 'many' : ''}">${[...Array(c.slots)].map((_, i) =>
      `<i class="${i < c.before.safety ? 'on' : i < c.before.safety + c.before.zombies ? 'zed' : ''}"></i>`).join('')}</div><div id="ctext"></div></div>
    <small class="pskip">click or press any key</small></div>`;
  pop.hidden = false;
  const pips = [...pop.querySelectorAll('.cpips i')];
  const yellow = pips.slice(0, c.before.safety), zeds = pips.slice(c.before.safety, c.before.safety + c.before.zombies);
  const slot = pips.length > 1 ? pips[1].offsetLeft - pips[0].offsetLeft : 36;   // one circle's step along the row
  for (const z of zeds) z.classList.add('march');
  await wait(350);
  for (let i = 0; i < c.absorbed; i++) {
    // the i-th zombie leads now: march everyone still standing until it's on the last yellow pip left
    const shift = -(2 * i + 1) * slot;
    for (const z of zeds.slice(i)) z.style.transform = `translateX(${shift}px)`;
    tone(70 + i * 6, 0.12, 'square', 0.05, -10);   // footsteps
    await wait(260);
    yellow[c.before.safety - 1 - i].className = 'burst';
    zeds[i].classList.add('gone');
    tone(220 - i * 15, 0.12, 'triangle', 0.1, -80);
    await wait(180);
  }
  $('#ctext').innerHTML = c.left
    ? `<div class="big bad">🧟 ${c.left} still here!</div><small class="muted">🟡 ${c.before.safety} → 0</small>`
    : `<div class="big good">🟡 Safety held!</div><small class="muted">🟡 ${c.before.safety} → ${c.after.safety}</small>`;
  if (c.left) { pop.classList.add('zombie'); sfx.zombie(); } else sfx.win(false);
  await popupHold(1800);
}

async function fortifyShow({ name, r, before, after, max }) {
  const pop = $('#popup');
  skipAnim = false;
  pop.className = '';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>🔨 Fortifying</small><h2>${esc(name)}</h2></div>
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

// Fill a tile's Safety pips straight away. The map is only redrawn once the whole batch has played, and fortifying
// ends the round, so the new round's banner, check and night attack would otherwise all play over the old pips.
function showSafety(k, n) {
  document.querySelectorAll(`#map .hex[data-k="${k}"] .pip`).forEach((c, i) => c.classList.toggle('on', i < n));
}

// Missed food / water: pause the game and show the max AP ring losing a segment.
async function maxApLossShow({ res, oldMax, newMax, oldAp, newAp }) {
  const pop = $('#popup');
  const what = res === 'food' ? `${ICON.food} No food` : res === 'water' ? `${ICON.water} No water` : `${ICON.hope} Nothing to hope for`;
  skipAnim = false;
  pop.className = 'zombie';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>Round ${G.round} check</small><h2>${what}!</h2></div>
    <div class="bigap" id="bigap">${apGauge(oldAp, '', oldMax)}</div>
    <div class="presult" id="pres"></div>
    <small class="pskip">click or press any key</small></div>`;
  pop.hidden = false;
  tone(300, 0.5, 'sawtooth', 0.08, -200);
  await wait(900);
  $('#bigap').innerHTML = apGauge(newAp, '', newMax, newMax, -1, oldMax);   // the lost segments crack and go dark
  noise(0.25, 0.3, 700); tone(90, 0.6, 'square', 0.12, -40);
  await wait(500);
  $('#pres').innerHTML = newMax > 0
    ? `<div class="big bad">Max AP ${oldMax} → ${newMax}</div><small class="muted">Each ${res === 'hope' ? 'night you find hope' : `${res} check you pay`} raises it by ${CONFIG.trackGain[res]}; each one missed costs ${CONFIG.trackLoss[res]}.</small>`
    : `<div class="big bad">Max AP 0</div>`;
  await popupHold(newMax > 0 ? 2600 : 1500);
}

// Sleep: roll both dice, then the AP dial fills segment by segment.
// Sleep: the 1d6 roll (plus the tile's 🟡 Safety) in a popup, then the AP ring around the clock fills, a segment at a time.
async function sleepShow({ dice, bonus = 0, from, to, max }) {
  const r = dice.reduce((a, b) => a + b, 0) + bonus;
  const pop = $('#popup');
  skipAnim = false;
  pop.className = 'sleep';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>😴 Sleeping</small><h2>Rest &amp; recover</h2></div>
    <div class="prow sleepsum">${dice.map((_, i) => `<div class="slot" id="pdsl${i}"></div>`).join('')}${bonus
      ? `<span class="plus">+</span><div class="cpips sleepsafe">${'<i></i>'.repeat(bonus)}</div>` : ''}</div>
    <div class="presult" id="pres"></div>
    <small class="pskip">click or press any key</small></div>`;
  pop.hidden = false;
  await wait(150);
  await Promise.all(dice.map((v, i) => rollDie($(`#pdsl${i}`), v, 900 + i * 150)));
  // then the tile's 🟡 Safety, a pip at a time: die + Safety = the AP
  for (const pip of pop.querySelectorAll('.sleepsafe i')) {
    pip.className = 'on fill'; tone(520, 0.08, 'triangle', 0.06);
    await wait(170);
  }
  $('#pres').innerHTML = `<div class="big good">= +${r} AP</div>${bonus ? '' : '<small class="muted">No 🟡 Safety here to add</small>'}`;
  await popupHold(1100);
  pop.hidden = true;
  renderApRing(from, '', max);
  await wait(200);
  for (let a = from + 1; a <= to; a++) {
    renderApRing(a, '', max, a - 1);
    tone(330 + a * 45, 0.14, 'sine', 0.09);
    await wait(220);
  }
  const wasted = from + r - to;
  if (wasted > 0) toast(`😴 ${wasted} AP wasted — max AP ${max}`);
  sfx.win(to >= max);
  await wait(500);
}

async function nightShow({ name, c }) {
  const pop = $('#popup');
  skipAnim = false;
  pop.className = 'night';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>🌙 Night attack</small><h2>${esc(name)}</h2></div>
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

// Round clock: 6 wedges, nights (1 & 6) at the top like midnight, a hand that sweeps forward. Your AP rings it:
// 12 segments around the outside, two to a round (renderApRing).
const CLOCK_R = 80, CLOCK_R0 = 30;
function wedgePath(a0, a1, r0, r1) {
  const P = (a, r) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  return `M${P(a0, r1)} A${r1} ${r1} 0 0 1 ${P(a1, r1)} L${P(a1, r0)} A${r0} ${r0} 0 0 0 ${P(a0, r0)}Z`;
}
const wedgeCenterDeg = (r) => -90 + r * 60 + 30;   // degrees, 0 = right, clockwise: round 1 (first morning) at 3 o'clock, night (5, 6) across the top
function renderClock() {
  let s = '';
  for (let r = 1; r <= 6; r++) {
    const c = wedgeCenterDeg(r) * Math.PI / 180, a0 = c - Math.PI / 6, a1 = c + Math.PI / 6;
    const now = r === G.round;
    const off = now ? 3 : 0;
    const icons = (E.attackDue(G, r) ? '🟡' : '') + Object.keys(CONFIG.upkeep[r] || {}).map((res) => ICON[res]).join('');   // a night attack tests your Safety first (round 6 only on a bad night), then the check
    const lx = 57 * Math.cos(c), ly = 57 * Math.sin(c);
    s += `<g class="wedge ${isNight(r) ? 'night' : 'day'} ${now ? 'now' : ''}" transform="translate(${(off * Math.cos(c)).toFixed(2)} ${(off * Math.sin(c)).toFixed(2)})">
      <path d="${wedgePath(a0 + 0.015, a1 - 0.015, CLOCK_R0 + 2, CLOCK_R)}"/>
      <text x="${lx.toFixed(1)}" y="${(ly - 3).toFixed(1)}" class="rn">${r}</text>
      <text x="${lx.toFixed(1)}" y="${(ly + 12).toFixed(1)}" class="up">${icons}</text></g>`;
  }
  $('#wedges').innerHTML = s;
  $('#clockday').textContent = G.day;
  $('#banner').innerHTML = `<i style="background:${cur().color}"></i><h1><span class="long">${E.roundBanner(G)}</span><span class="short">Day ${G.day} · Round ${G.round} ${isNight(G.round) ? '🌙' : '☀️'}</span></h1>`;
  // monotonic angle so the hand always sweeps clockwise, even from round 6 → 1
  const turns = (G.day - 1) * 6 + G.round;
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

// A loot table row as words: looted rows are struck through (CSS), stashes show whose they are —
// and a lone item left there shows as itself, with its condition.
const shortName = (n) => (n.length > 9 ? `${n.slice(0, 8)}…` : n);
const rowText = (row) => {
  if (row.kind !== 'stash') return row.e ? cellText(row.e) : '—';
  const lone = E.loneItem(row.stash);
  return lone ? `${lone.id} (${lone.cond})` : `🎒 ${shortName(row.stash.owner)}'s stash`;
};
const hopeRow = (row) => (row.kind === 'stash' ? row.stash.lead || ITEMS[E.loneItem(row.stash)?.id]?.hope : row.kind === 'item' && [row.e, ...(row.e.parts || [])].some((x) => ITEMS[x.item]?.hope));
const rowClass = (row) => (row.kind !== 'looted' && hopeRow(row) ? 'hope' : row.kind === 'stash' && E.loneItem(row.stash) ? 'it' : { zombies: 'z', item: 'it', looted: 'looted', stash: 'stash' }[row.kind] || '');

// Results 2–6. 1 is always Zombies, so it isn't listed — the pips below show any zombies on the tile.
function tableSvg(x, y, t) {
  if (!t.def.passable) return `<text x="${x}" y="${y + 4}" class="empty">Impassable</text>`;
  if (!canScavengeHere(t)) return `<text x="${x}" y="${y + 4}" class="empty">Nothing to scavenge</text>`;
  const rows = E.tableView(t).slice(1), ch = 21, w = HEX + 16, h = ch * rows.length;
  let s = `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="3" class="tbl"/>`;
  rows.forEach((row, i) => {
    const ty = y - h / 2 + i * ch + ch / 2 + 5;
    const txt = rowText(row);   // long rows (a stash: "🎒 Survivor's stash") get slightly smaller text to stay in the box
    s += `<text x="${x - w / 2 + 8}" y="${ty}" class="cell ${rowClass(row)} ${txt.length > 14 ? 'long' : ''}"><tspan class="n">${row.row}</tspan>  ${esc(txt)}</text>`;
  });
  return s;
}

// Safety pips along the bottom of the hex: filled = current Safety, hollow = room to fortify, black = zombies.
// There's a circle for every zombie a tile can hold; the last (beyond max Safety) only ever holds zombies.
function safetySvg(x, y, t) {
  const top = E.maxSafetyOf(t), n = t.safety, z = t.zombies, max = Math.max(CONFIG.maxZombies, top, n + z), gap = max > 8 ? 12 : max > 6 ? 15 : 17;   // both on a tile: side by side
  let s = '';
  for (let i = 0; i < max; i++) {
    const cx = x + (i - (max - 1) / 2) * gap;
    s += `<circle cx="${cx}" cy="${y}" r="${max > 8 ? 5 : max > 6 ? 6 : 6.5}" class="pip ${i < n ? 'on' : i < n + z ? 'zed' : ''} ${i >= top ? 'zonly' : ''}"/>`;
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
    const k = Math.max(0, Math.min(1, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 3);   // frame time can precede t0
    cam.x = sx + (cam.tx - sx) * e; cam.y = sy + (cam.ty - sy) * e;
    applyView();
    cam.anim = k < 1 ? requestAnimationFrame(step) : null;
  };
  cam.anim = requestAnimationFrame(step);
}
// the touch layout (phones and tablets, either way up — style.css): the map fills the board under everything else
const touchUI = matchMedia('(pointer: coarse), (orientation: portrait), (max-width: 1100px), (max-height: 500px)');   // same as style.css
function applyView() {
  const svg = $('#map'), b = svg.getBoundingClientRect();
  if (!b.width || !b.height) return;
  // there, frame the open space left between the clock, the AP dial and the trays (#mapframe) rather than the whole map
  const fr = touchUI.matches ? $('#mapframe').getBoundingClientRect() : b, f = fr.width && fr.height ? fr : b;
  // zoom out a little on small screens. In the touch layout, fit your hex (208 × 240) to the open space with a
  // little room, but never below 0.8 — any smaller and the loot table gets hard to read
  const fit = touchUI.matches ? Math.max(0.8, Math.min(1.3, f.width / 360, f.height / 320)) : Math.min(1, b.width / 520, b.height / 480);
  const z = fit * userZoom;   // …times however far you've pinched or scrolled
  const w = b.width / z, h = b.height / z;
  const dx = (f.left + f.width / 2 - (b.left + b.width / 2)) / z, dy = (f.top + f.height / 2 - (b.top + b.height / 2)) / z;
  const vx = cam.x - dx - drag.x / z - w / 2, vy = cam.y - dy - drag.y / z - h / 2;
  svg.setAttribute('viewBox', `${vx} ${vy} ${w} ${h}`);
  leadMarks(vx, vy, z, b, f);
}
// A place a Note leads to, out of view: a purple marker with its icon on a ring around your hex (clear of the
// trays and dials), pointing the way — a compass.
function leadMarks(vx, vy, z, b, f) {
  const board = $('#board').getBoundingClientRect(), ring = Math.min(f.width / 2 - 30, f.height / 2 - 30, 250);
  const cx = f.left + f.width / 2, cy = f.top + f.height / 2;
  $('#leadmarks').innerHTML = Object.entries(G?.tiles || {}).filter(([, t]) => E.leadOpen(t)).map(([k, t]) => {
    const [x, y] = pix(...k.split(',').map(Number));
    const sx = b.left + (x - vx) * z, sy = b.top + (y - vy) * z;   // where it is on screen
    if (sx > f.left && sx < f.right && sy > f.top && sy < f.bottom) return '';   // in view: its border shows it
    const a = Math.atan2(sy - cy, sx - cx);
    return `<div class="leadmark" style="left:${cx + ring * Math.cos(a) - board.left}px;top:${cy + ring * Math.sin(a) - board.top}px"><i style="transform:rotate(${a}rad)"></i><span>${t.def.icon}</span></div>`;
  }).join('');
}
window.addEventListener('resize', applyView);

// Zooming: pinch on a touch screen, or scroll (mouse wheel, trackpad scroll or trackpad pinch) over the map.
// It scales the fitted zoom above and stays where you leave it; the view stays centred on your hex.
const ZOOM_MIN = 0.4, ZOOM_MAX = 2.5;
let userZoom = 1;
function setZoom(k) {
  userZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, k));
  applyView();
}
$('#map').addEventListener('wheel', (e) => {
  e.preventDefault();   // not the page: the map
  const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;   // lines / pages → pixels
  setZoom(userZoom * Math.exp(-px * (e.ctrlKey ? 0.01 : 0.0015)));   // ctrlKey: a trackpad pinch, which sends small steps
}, { passive: false });

// Dragging the map (mouse or touch) looks around; let go and it springs back to centre on your hex.
// drag.x/y is how far the map has been pulled, in screen pixels, on top of the camera.
const drag = { x: 0, y: 0, id: null, sx: 0, sy: 0, ox: 0, oy: 0, moved: false, justDragged: false, anim: null };
function springBack() {
  const fx = drag.x, fy = drag.y, t0 = performance.now(), dur = 450;
  const step = (now) => {
    const k = Math.max(0, Math.min(1, (now - t0) / dur)), e = 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2;   // ease-out-back: a little overshoot
    drag.x = fx * (1 - e); drag.y = fy * (1 - e);
    applyView();
    drag.anim = k < 1 ? requestAnimationFrame(step) : null;
  };
  drag.anim = requestAnimationFrame(step);
}
// Two fingers down: a pinch. pts tracks the fingers on the map; pinch holds the spread and zoom it started from.
const pts = new Map();
let pinch = null;
const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
$('#map').addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2) {   // the second finger: stop dragging, start pinching
    pinch = { d0: spread(), z0: userZoom };
    if (drag.id !== null) { drag.id = null; drag.moved = false; $('#map').classList.remove('dragging'); if (drag.x || drag.y) springBack(); }
    return;
  }
  if (e.button !== 0 || drag.id !== null || pinch) return;
  if (drag.anim) { cancelAnimationFrame(drag.anim); drag.anim = null; }   // grabbed mid-spring: carry on from there
  Object.assign(drag, { id: e.pointerId, sx: e.clientX - drag.x, sy: e.clientY - drag.y, ox: drag.x, oy: drag.y, moved: false });
});
$('#map').addEventListener('pointermove', (e) => {
  if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pts.size >= 2) return setZoom(pinch.z0 * spread() / pinch.d0);
  if (e.pointerId !== drag.id) return;
  const x = e.clientX - drag.sx, y = e.clientY - drag.sy;
  if (!drag.moved && Math.hypot(x - drag.ox, y - drag.oy) < 8) return;   // still a tap, not a drag
  if (!drag.moved) { drag.moved = true; $('#map').setPointerCapture(e.pointerId); $('#map').classList.add('dragging'); }
  drag.x = x; drag.y = y;
  applyView();
});
const dragEnd = (e) => {
  pts.delete(e.pointerId);
  if (pinch) {
    if (pts.size < 2) pinch = null;
    drag.justDragged = true;   // lifting a pinching finger isn't a tap on a tile
    setTimeout(() => { drag.justDragged = false; }, 0);
    return;
  }
  if (e.pointerId !== drag.id) return;
  drag.id = null;
  if (drag.moved) {
    $('#map').classList.remove('dragging');
    drag.justDragged = true;   // the click that follows letting go isn't a click on a tile
    setTimeout(() => { drag.justDragged = false; }, 0);
  }
  if (drag.x || drag.y) springBack();
};
$('#map').addEventListener('pointerup', dragEnd);
$('#map').addEventListener('pointercancel', dragEnd);

// Right column (backpack + resources) runs down the board, stopping above the action dock if they'd overlap.
function fitRightCol() {
  if ($('#board').classList.contains('threat')) return;   // the dock is in the middle during Fight or Flee
  const b = $('#board').getBoundingClientRect(), d = $('#dock').getBoundingClientRect(), c = $('#rightcol').getBoundingClientRect();
  $('#board').style.setProperty('--dockh', d.right > c.left ? `${b.bottom - d.top}px` : '0px');
}
const viewWatch = new ResizeObserver(applyView);   // the map and its open space change size when the log docks, the phone turns…
viewWatch.observe($('#map'));
viewWatch.observe($('#mapframe'));
const dockWatch = new ResizeObserver(fitRightCol);
dockWatch.observe($('#dock'));
dockWatch.observe($('#board'));

// Vehicles parked on a tile: a vertical column in the space right of the loot table.
// Broken-down ones (condition 0) are greyed out until repaired.
function vehicleSvg(x, y, vs) {
  const gap = 24, top = y - ((vs.length - 1) * gap) / 2;
  return vs.map((v, i) => `<text x="${x}" y="${top + i * gap + 6}" class="veh ${v.cond > 0 || ITEMS[v.id].animal ? '' : 'broken'}">${ITEMS[v.id].icon}</text>`).join('');
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
    const target = adj.has(k) && PICK_MODES.includes(mode);   // you can head into the unknown: it's revealed as you arrive
    svg += `<g class="hex fog ${target ? 'target' : ''}" data-k="${k}">
      <polygon points="${hexPoints(x, y, HEX - 2)}"/>${target ? pickBadge(x, y, pickNumber(p, q, r), true) : ''}</g>`;
  }

  let hereSvg = '';
  for (const k in G.tiles) {
    const [q, r] = k.split(',').map(Number);
    const [x, y] = pix(q, r);
    const t = held[k] ? { ...G.tiles[k], ...held[k] } : G.tiles[k];
    const danger = t.def.table.filter((e) => e.zombies).length;
    const isHere = q === p.q && r === p.r;
    const town = G.towns?.[t.town], townLabel = town ? `${town.name} (${town.kind})` : '';
    const target = adj.has(k) && ((mode === 'move' && canEnter(p, t)) || (mode === 'flee' && passable(t) && !t.zombies) || (mode === 'drive' && passable(t)));
    const g = `<g class="hex tile d${Math.min(danger, 4)} ${t.def.table.length ? '' : 'barren'} ${canFortifyHere(t) ? '' : 'nofort'} ${passable(t) ? '' : 'impassable'} ${justRevealed.includes(k) ? 'revealed' : ''} ${isHere ? 'here' : ''} ${target ? 'target' : ''} ${t.zombies ? 'infested' : ''} ${town ? 'town' : ''} ${E.leadOpen(t) ? 'lead' : ''}" data-k="${k}" ${justRevealed.includes(k) ? `style="--i:${justRevealed.indexOf(k)}"` : ''}>
      <polygon points="${hexPoints(x, y, HEX - (isHere ? 4 : 2))}" ${isHere ? `style="stroke:${p.color}"` : ''}/>
      ${isHere ? `${town ? `<text x="${x}" y="${y - HEX * 0.72}" class="townname">${esc(town.name)}</text>` : ''}<text x="${x}" y="${y - HEX * 0.56}" class="name">${esc(t.def.name)}</text>${tableSvg(x, y + 4, t)}`
        : `<text x="${x}" y="${y - 10}" class="art"><title>${esc(t.def.name)}${town ? ` — ${esc(townLabel)}` : ''}</title>${t.def.icon}</text>`}
      ${passable(t) && (isHere || p.visited?.includes(k)) ? safetySvg(x, isHere ? y + HEX * 0.64 : y + 50, t) : ''}
      ${isHere || p.visited?.includes(k) ? vehicleSvg(x + HEX * 0.69, y + 4, [...(t.vehicles || []), ...(isHere && driving() ? [driving().v] : [])]) : ''}
      ${target ? pickBadge(x, y - HEX * 0.8, pickNumber(p, q, r)) : ''}</g>`;
    if (isHere) hereSvg = g; else svg += g;   // draw current tile last so its border sits on top
  }

  $('#map').innerHTML = svg + hereSvg;
  const [cx, cy] = pix(p.q, p.r);
  if (!camInit) { cam.x = cx; cam.y = cy; camInit = true; applyView(); }
  cameraTo(cx, cy);

  $('#hint').textContent = mode === 'flee' || mode === 'threat' || mode === 'drive' ? ''
    : mode === 'move' ? 'Press A Q E D X Z or click a highlighted tile to move there. (Backspace to cancel)' : '';
}

// AP gauge: a ring of 12 segments like the clock. Colour shows how full you are.
// Colour: purple when you're at your max, otherwise by how much of the full 12 you have.
function apLevel(ap, max) {
  const f = ap / CONFIG.maxAP;
  return ap >= max ? 'full' : f >= 2 / 3 ? 'high' : f >= 1 / 3 ? 'mid' : 'low';
}
// Your AP around the outside of the clock: 12 segments from the top, clockwise — lit up to your AP (coloured by
// apLevel), dim up to your max AP, black beyond it (food, water and hope raise / lower the max).
function renderApRing(ap, flash, max, gaining = -1) {
  const n = CONFIG.maxAP, step = (2 * Math.PI) / n, gap = 0.03;
  let s = `<title>${ap} AP (max ${max})</title>`;
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + i * step + gap, a1 = a0 + step - gap * 2;
    s += `<path d="${wedgePath(a0, a1, 86, 98)}" class="seg ${i < ap ? 'on' : i >= max ? 'locked' : ''} ${i === gaining ? 'gaining' : ''}"/>`;
  }
  $('#apring').innerHTML = s;
  const clock = $('#clock');
  clock.classList.remove('full', 'high', 'mid', 'low', 'up', 'down');
  void clock.getBoundingClientRect();   // restart the pop animation
  clock.classList.add(apLevel(ap, max), ...(flash ? [flash] : []));
}
// The big AP gauge in popups (sleep, max AP lost). Segments above your current max AP are locked.
function apGauge(ap, flash, max, losing = -1, gaining = -1, losingEnd = losing + 1) {
  const n = CONFIG.maxAP, step = (2 * Math.PI) / n, gap = 0.04;
  let s = '';
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + i * step + gap, a1 = a0 + step - gap * 2;
    s += `<path d="${wedgePath(a0, a1, 52, 80)}" class="seg ${i < ap ? 'on' : i >= max ? 'locked' : ''} ${i >= losing && i < losingEnd && losing >= 0 ? 'losing' : ''} ${i === gaining ? 'gaining' : ''}"/>`;
  }
  return `<svg viewBox="-90 -90 180 180" class="apgauge ${apLevel(ap, max)} ${flash}">
    ${s}<circle r="48" class="hub"/>
    <text y="8" class="num">${ap}</text><text y="26" class="lbl">AP</text><text y="40" class="maxl">max ${max}</text></svg>`;
}

// Backpack: 6 slots in the top-right column of the board. ✕ arms, second click leaves it on this tile.
// Keys 1–6 highlight a slot; Enter then presses its button (Use / Take, or else ✕).
// Some choices are made here (packPick): when the night asks for hope, hope items get a Hope button; when zombies
// are on you, each weapon you can use gets its verb (Fire, Swing…) — everything else greys out.
let dropArmed = -1, packSel = -1;
const FIGHT_EXPLAIN = { ammo: 'shoot', ap: 'melee', fuel: 'saw' };   // the tutorial card for each kind of weapon
function packPick(p, it, i) {
  if (mode === 'hope') return ITEMS[it.id].hope && { cls: 'hope', btn: `<button class="use hope" data-pick="${i}" title="Lean on it tonight (−1 condition)">Hope</button>` };
  if (mode === 'threat') return E.canWield(p, it) && { cls: 'fight', btn: `<button class="use fight" data-pick="${i}" title="Fight with it">${ITEMS[it.id].verb}</button>` };
  return null;
}
const picking = () => mode === 'hope' || mode === 'threat';
async function pickFromPack(i) {
  const p = cur(), it = p.items[i];
  if (busy || modalKey || !it || !packPick(p, it, i)) return;
  packSel = -1;
  if (mode === 'hope') return send({ type: 'decide', choice: i });
  if (await explain(FIGHT_EXPLAIN[ITEMS[it.id].uses])) send({ type: 'decide', choice: { weapon: i } });
}
function renderPack() {
  const p = cur(), choosing = picking();
  if (!p.items[packSel] || (choosing && !packPick(p, p.items[packSel], packSel))) packSel = -1;
  $('#pack').classList.toggle('hoping', mode === 'hope');
  $('#pack').classList.toggle('fighting', mode === 'threat');
  // the header folds the backpack away on small screens (see style.css)
  let h = `<button type="button" class="packhead" data-packtoggle><span class="packname"><span class="word">Backpack</span><span class="bag">🎒</span> ${p.items.length}/${CONFIG.maxItems}</span>`
    // folded, it shows each item in brief: icon, name and condition (just icon and condition once there are more than 3)
    + `<span class="packicons ${p.items.length > 3 ? 'many' : ''}">${p.items.map((it) => `<span class="pchip"><span class="ic">${itemIcon(it.id)}</span><span class="pinfo"><b>${esc(it.id)}</b>${condPips(it.cond, it.id)}</span></span>`).join('')}</span><span class="caret"></span></button>`;
  for (let i = 0; i < CONFIG.maxItems; i++) {
    const it = p.items[i];
    const pick = it && choosing && packPick(p, it, i);
    h += it && choosing
      ? `<div class="slot-item ${pick ? `pickable ${pick.cls}` : 'greyed'} ${packSel === i ? 'sel' : ''}" data-slot="${i}"><kbd class="slotkey">${i + 1}</kbd><span class="ic">${itemIcon(it.id)}</span><div><b>${esc(it.id)}</b>${condPips(it.cond, it.id)}</div>
          ${pick ? pick.btn : ''}</div>`
      : it
      ? `<div class="slot-item ${packSel === i ? 'sel' : ''}" data-slot="${i}"><kbd class="slotkey">${i + 1}</kbd><span class="ic">${itemIcon(it.id)}</span><div><b>${esc(it.id)}</b>${condPips(it.cond, it.id)}</div>
          ${ITEMS[it.id].tool ? `<button class="use" data-use="${i}" title="Use tool (T)">Use <kbd>T</kbd></button>` : ''}
          ${ITEMS[it.id].boost ? `<button class="use" data-pill="${i}" title="+${ITEMS[it.id].boost} AP, −${ITEMS[it.id].toll} max AP (−1 condition)">${ITEMS[it.id].verb}</button>` : ''}
          <button class="drop ${dropArmed === i ? 'armed' : ''}" data-drop="${i}" title="Leave it on this tile">${dropArmed === i ? 'Leave it?' : '✕'}</button></div>`
      : `<div class="slot-item empty"></div>`;
  }
  $('#pack').innerHTML = h;
}

// Players section (collapsible, top of the right panel): everyone in the game, then who's on your tile.
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

// Resource tray under the backpack; values that changed since last render flash green/red.
// `p` can be a snapshot ({ ap, maxAP, res }) to show values from partway through an event.
let prevStats = {};
function renderStats(p = cur()) {
  const vals = { ...p.res };
  // AP rings the clock (renderApRing)
  const apd = prevStats.ap === undefined ? '' : (p.ap > prevStats.ap || p.maxAP > prevStats.maxAP) ? 'up' : (p.ap < prevStats.ap || p.maxAP < prevStats.maxAP) ? 'down' : '';
  renderApRing(p.ap, apd, p.maxAP);
  const label = { ap: 'AP', food: 'Food', water: 'Water', fuel: 'Fuel', ammo: 'Ammo' };
  $('#stats').innerHTML = Object.entries(vals).map(([k, v]) => {
    const prev = prevStats[k];
    const d = prev === undefined ? '' : v > prev ? 'up' : v < prev ? 'down' : '';
    const low = ['food', 'water'].includes(k) && v <= 2 ? (v <= 1 ? 'low1' : 'low2') : '';
    if (d) setTimeout(() => sfx.res(k, d === 'up' ? 1 : -1), 0);
    const delta = d ? `<span class="delta ${d}">${v > prev ? '+' : '−'}${Math.abs(v - prev)}</span>` : '';
    return `<div class="stat ${k} ${d} ${low}" title="${label[k]}"><div class="orb"><b>${v}</b>${delta}</div><small>${label[k]}</small></div>`;
  }).join('');
  prevStats = { ...vals, ap: p.ap, maxAP: p.maxAP };
}

// Rows 2–6 still worth rolling for (unlooted finds and stashes).
const lootLeft = (t) => E.tableView(t).filter((row) => row.row > 1 && row.kind !== 'looted' && row.kind !== 'zombies').length;

function renderPanel() {
  const p = cur(), t = tileOf(p);
  const noAP = p.ap < 1;
  // Fight or Flee moves to the middle of the board; back at the bottom, re-fit the right column around it
  if ($('#board').classList.toggle('threat', mode === 'threat') === false) requestAnimationFrame(fitRightCol);
  const btn = (id, label, sub, dis) => {
    const keys = mode === 'threat' ? THREAT_KEYS : HOTKEYS;
    const hk = Object.keys(keys).find((k) => keys[k] === id || (ITEMS[id]?.vehicle && keys[k] === DRIVE_KEY[ITEMS[id].uses]));
    if (dis && selected === id) selected = null;
    // the emoji and the words are separate, so phones and upright tablets can show the emoji alone (title has the rest)
    const [, icon, rest] = label.match(/^(<img[^>]*>|\S+) (.*)$/), words = [rest];   // the emoji (or item picture), then the words
    return `<button class="act ${mode === id ? 'on' : ''} ${selected === id ? 'sel' : ''}" data-act="${id}" title="${esc(`${words.join(' ')} — ${sub}`)}" ${dis ? 'disabled' : ''}><b><span class="ai">${icon}</span><span class="al"> ${words.join(' ')}</span>${hk ? `<kbd>${hk.toUpperCase()}</kbd>` : ''}</b><small>${sub}</small></button>`;
  };

  if (mode === 'threat') {   // fight with a weapon picked in the backpack (renderPack) — or flee, here
    $('#actions').innerHTML = `
      <div class="note bad">🧟 ${t.zombies} zombie${t.zombies > 1 ? 's' : ''} on the ${esc(t.def.name)}! ${p.caught ? 'Caught — fight with a weapon from your backpack!' : canFight(p) ? `Pick a weapon from your backpack, flee${t.safety ? ' or hide' : ''}.` : 'Nothing to fight with — if you fail to flee, you die.'}</div>
      <div class="ribbon threat">
        ${btn('flee', '🏃 Flee', p.caught ? 'Caught — must fight' : !fleeAdj(p).length ? 'Nowhere to run' : t.zombies >= 6 ? 'Too many to outrun' : p.ap < 1 ? 'No AP' : `1 AP · roll > ${t.zombies}`, !canFlee(p, t))}
        ${t.safety ? btn('hide', '🛡️ Hide', p.caught ? 'Caught — must fight' : `Free · 🟡 ${t.safety} stops ${Math.min(t.safety, t.zombies)}`, !E.canHide(p, t)) : ''}
      </div>`;
    renderLog();
    return;
  }
  if (mode === 'drive') {
    const { v, steps, flee } = driving(), uses = vehicleFuel(v);
    $('#actions').innerHTML = `
      ${t.zombies ? `<div class="note bad">🧟 ${t.zombies} zombie${t.zombies > 1 ? 's' : ''} here — stopping on this tile triggers them!</div>` : ''}
      <div class="note good">${itemIcon(v.id)} ${flee ? 'Escaping' : ITEMS[v.id].verb === 'Ride' ? 'Riding' : 'Driving'} the ${v.id} — ${uses === 'ap' ? `🎲 ${p.ap} AP` : `${ICON[uses]} ${p.res[uses]} ${uses}`} left · ${steps} tile${steps === 1 ? '' : 's'} so far.
        Next hex: A Q E D X Z or tap one.</div>
      <div class="ribbon">${btn('stopdrive', '⏹ Stop here', flee && !steps ? 'Pick a hex first' : 'Enter / Backspace', flee && !steps)}</div>`;
    renderLog();
    return;
  }
  if (mode === 'hope') {   // the night asks for hope: it's picked in the backpack (renderPack)
    $('#actions').innerHTML = `<div class="note hope">🌙 What hope is there? Pick it from your backpack.</div>`;
    renderLog();
    return;
  }
  if (mode === 'flee') {
    $('#actions').innerHTML = `
      <div class="note good">🏃 You got away! Press A Q E D X Z or click a highlighted hex to run to.</div>`;
    renderLog();
    return;
  }

  let warn = '';
  const apWarn = p.ap < 2 ? ` Fleeing costs 1 🎲 — keep some AP!` : '';
  const nextRound = G.round % 6 + 1;
  const nextUp = G.checksOff ? '' : upkeepText(nextRound);
  if (nextUp && !E.attackDue(G, nextRound)) warn = `<div class="note">Next round starts with a check: ${nextUp}</div>`;
  if (E.attackDue(G, nextRound)) {
    warn = `<div class="note ${isNight(G.round) ? 'bad' : ''}">🌙 Next round starts with a night attack — 1d6 🧟 vs your 🟡 ${t.safety}${nextUp ? `, then a ${nextUp} check` : ''}.${apWarn}</div>`;
  }

  $('#actions').innerHTML = `
    ${warn}
    ${noAP ? `<div class="note bad">Out of AP — you must sleep.</div>` : ''}
    <div class="ribbon main">
      ${btn('pause', '⏸ Pause', 'Stop the clock', false)}
      ${btn('sleep', '😴 Sleep', t.safety ? `Gain 1d6 + ${t.safety} AP (🟡)` : 'Gain 1d6 AP · no 🟡', false)}
      ${btn('scout', '🔭 Scout', scoutTargets(p).length ? `1 AP · reveal ${E.binocularsOf(p) ? 'up to ' : ''}${scoutTargets(p).length} hex${scoutTargets(p).length === 1 ? '' : 'es'}${E.binocularsOf(p) ? ' (binoculars)' : ''}` : 'All explored', noAP || !scoutTargets(p).length)}
      ${btn('move', '🚶 Move', p.freeMoved ? '1 AP · uses your action' : 'Free move · needs 1 AP', noAP || !moveAdj(p).length)}
      ${btn('scavenge', '🔍 Scavenge', !canScavengeHere(t) ? (t.def.table.length ? 'Picked clean' : 'Nothing to find') : t.zombies ? 'Blocked by zombies' : lootLeft(t) ? `1 AP · ${lootLeft(t)} of 5 left` : '1 AP · only zombies left', noAP || !canScavengeHere(t) || t.zombies > 0)}
      ${Object.keys(ITEMS).filter((id) => ITEMS[id].vehicle && vehiclesHere(p).some((v) => v.id === id)).map((id) => {
        const v = vehicleOf(p, id);
        if (!v) return btn(id, `${itemIcon(id)} ${ITEMS[id].verb}`, 'Broken — needs a Tool', true);
        const uses = vehicleFuel(v), eats = ITEMS[id].eats;
        return btn(id, `${itemIcon(id)} ${ITEMS[id].verb}`, !driveAdj(p).length ? 'Nowhere to go' : vehicleLeft(p, v) < 1 ? `No ${uses === 'ap' ? 'AP' : uses}` : !E.vehicleFed(p, v) ? `No ${eats}`
          : `1 ${ICON[uses]}/tile · ${eats ? `1 ${ICON[eats]}/trip` : `cond ${v.cond}`}`, !canDrive(p, id));
      }).join('')}
      ${btn('fortify', '🔨 Fortify', !canFortifyHere(t) ? "Can't be fortified" : t.zombies ? 'Blocked by zombies' : t.safety >= E.maxSafetyOf(t) ? `Safety full (${E.maxSafetyOf(t)})` : `1 AP · +1d6 🟡 (max ${E.maxSafetyOf(t)})`, noAP || !canFortifyHere(t) || t.zombies > 0 || t.safety >= E.maxSafetyOf(t))}
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
  if (drag.justDragged) return;
  const g = e.target.closest('[data-k]');
  if (g) { const [q, r] = g.dataset.k.split(',').map(Number); clickHex(q, r); }
});
$('#actions').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.act) act(b.dataset.act);
});
const HOTKEYS = { r: 'sleep', s: 'scout', w: 'move', a: 'scavenge', f: 'fortify', e: 'driveFuel', b: 'driveAP', h: 'driveWater', p: 'pause' };   // E / B / H: a fuel / pedal vehicle / animal here
// E / B / H stand for whichever fuel vehicle / pedal vehicle / animal is here (its button is named after it, e.g. 'Tractor')
const DRIVE_KEY = { fuel: 'driveFuel', ap: 'driveAP', water: 'driveWater' };
const isDriveKey = (name) => Object.values(DRIVE_KEY).includes(name);
const keyedVehicle = (p, key) => vehiclesHere(p).find((x) => DRIVE_KEY[ITEMS[x.id].uses] === key)?.id;
const THREAT_KEYS = { e: 'flee', r: 'hide' };   // weapons: 1–6 picks the slot, Enter swings it
// Backspace cancels / goes back (Esc still works too, but full-screen Chrome can take it for itself).
const isBack = (e) => e.key === 'Backspace' || e.key === 'Escape';
// ---------------------------------------------------------------- cheats (testing)
// Type in the note box, e.g.  scavenge(1)   scavenge(4,6)   sleep(8)   zombies(3)   item(axe)   help()
const CHEATS = {
  help: 'list cheats',
  'roll(a,b,…)': 'force the next dice rolls',
  'scavenge(r[,a,b])': 'scavenge with table roll r (and the amount dice / condition / zombie count)',
  'sleep(n) sleep(a,b)': 'sleep and gain n AP (2–12), or force both dice',
  'fortify(n)': 'fortify with a roll of n',
  'flee(n)': 'force your next flee roll',
  'night(n)': 'night attack now with n zombies',
  'zombies(n)': 'set zombies on your tile (fight/flee if > 0)',
  'safety(n)': 'set your tile\'s Safety',
  'item(name[,cond])': 'add an item (vehicles park on your tile)',
  'ap(n) maxap(n) food(n) water(n) fuel(n) ammo(n)': 'set a value',
  'round(n) day(n)': 'jump the clock (no checks run)',
  'checks() checks(on|off)': 'toggle the food / water / hope checks',
  'badnight() badnight(on|off)': 'toggle a bad night (round 6 attacks too)',
  'timer() timer(on|off)': 'the 30 s round timer: act in time or lose 1 AP (remembered)',
  'reset()': 'start a fresh world (admin-only once online)',
};
async function runCheat(cmd, args) {
  const n = args.map((a) => (isNaN(+a) ? a : +a));
  const say = (m) => { G.log.push({ msg: `🛠️ ${m}`, cls: 'cheat' }); toast(`🛠️ ${m}`); };
  if (busy || modalKey) return say('Busy — finish the current popup first.');
  if (cmd === 'help') { G.log.push({ msg: '🛠️ Cheats: ' + Object.entries(CHEATS).map(([k, v]) => `${k} — ${v}`).join(' · '), cls: 'cheat' }); return setLog(true); }
  if (cmd === 'reset') { newGame(['Survivor']); return say('World reset'); }
  if (cmd === 'timer') {
    const v = String(n[0] ?? '').toLowerCase();
    setTimer(v === 'off' ? false : v === 'on' ? true : !timerOn);
    return say(`Round timer ${timerOn ? `ON — act within ${CONFIG.roundSeconds} s or lose 1 AP` : 'OFF'}`);
  }
  const res = E.cheat(G, cur().id, cmd, n);
  checksOff = G.checksOff;
  say(res.say);
  await play(res.events);
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
  if (id && packSel >= 0) selectSlot(-1);   // one highlight at a time, so Enter is never ambiguous
  document.querySelectorAll('#actions .act').forEach((b) => b.classList.toggle('sel', b.dataset.act === id));
}
function selectSlot(i) {
  packSel = i;
  if (i >= 0 && selected) selectAction(null);
  renderPack();
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
  if (e.key.toLowerCase() === 'p' && G && !G.over) { e.preventDefault(); togglePause(); return; }   // pause / resume, any time
  if (paused) return;   // nothing else while paused
  if (modalKey) { modalKey(e); return; }
  if (busy) { e.preventDefault(); popupInput(); return; }   // skip an animation — even the one where you die
  if (G.over) { if (e.key === 'Enter') { e.preventDefault(); newGame(['Survivor']); } return; }
  if (mode === 'drive' && (e.key === 'Enter' || isBack(e))) {
    e.preventDefault();
    send({ type: 'decide', choice: 'stop' });
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
  if (/^[1-6]$/.test(k)) {   // highlight a backpack slot (again to un-highlight)
    const i = +k - 1;
    if (!cur().items[i]) return toast(`Backpack slot ${k} is empty.`);
    if (picking() && !packPick(cur(), cur().items[i], i)) return;   // greyed out: not a choice now
    selectSlot(packSel === i ? -1 : i);
    return;
  }
  if (isBack(e)) {   // clear the highlighted action or slot; then stop picking a hex (decisions like Fight or Flee stay)
    e.preventDefault();
    if (selected) selectAction(null);
    else if (packSel >= 0) { dropArmed = -1; selectSlot(-1); }
    else if (mode === 'move') { mode = null; render(); }
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (packSel >= 0) {   // the slot's own button: Use / Take, otherwise ✕ (Enter again to leave it)
      const slot = $('#pack .slot-item.sel'), btn = slot?.querySelector('.use') ?? slot?.querySelector('.drop');
      btn?.click();
      if (btn?.matches('.use')) selectSlot(-1);   // after the click: redrawing first would detach the button
      return;
    }
    const b = selected && $(`#actions [data-act="${selected}"]`);
    if (b && !b.disabled) { selected = null; b.click(); }
    return;
  }
  let id = (mode === 'threat' ? THREAT_KEYS : HOTKEYS)[k];
  if (isDriveKey(id)) id = keyedVehicle(cur(), id);
  if (id) {
    const b = $(`#actions [data-act="${id}"]`);
    if (b && !b.disabled) selectAction(id);
    else if (b) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); }   // shake: not available
  }
});
$('#newgame').onclick = () => { if (!busy) newGame(['Survivor']); };
$('#pauseveil').addEventListener('click', togglePause);
$('#popup').addEventListener('click', () => { if (!modalKey) popupInput(); });
// A popup card taller or wider than the board (a phone on its side) is scaled down to fit rather than cut off.
function fitCard() {
  const pop = $('#popup'), card = pop.querySelector('.pcard');
  if (!card || pop.hidden) return;
  const cs = getComputedStyle(pop);
  const h = pop.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const w = pop.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  card.style.scale = String(Math.min(1, h / card.offsetHeight, w / card.offsetWidth));   // scale ignores layout, so offset* stay unscaled
}
const cardWatch = new ResizeObserver(fitCard);   // the card grows as rows and dice appear
cardWatch.observe($('#popup'));
new MutationObserver(() => { const c = $('#popup .pcard'); if (c) cardWatch.observe(c); fitCard(); }).observe($('#popup'), { childList: true, attributes: true, attributeFilter: ['hidden'] });
$('#pack').addEventListener('click', (e) => {
  if (e.target.closest('[data-packtoggle]')) { $('#pack').classList.toggle('open'); return; }
  const u = e.target.closest('[data-use]'); if (u) { useTool(+u.dataset.use); return; }
  const pl = e.target.closest('[data-pill]'); if (pl) { takePills(+pl.dataset.pill); return; }
  const pk = e.target.closest('[data-pick]') ?? (picking() && e.target.closest('.slot-item.pickable'));   // hope, or a weapon: tap the item
  if (pk) { pickFromPack(+(pk.dataset.pick ?? pk.dataset.slot)); return; }
  const b = e.target.closest('[data-drop]');
  if (!b) {   // the slot itself: what is it? (phones show only the icon)
    const it = cur().items[e.target.closest('[data-slot]')?.dataset.slot];
    if (it) toast(it.text ? `${ITEMS[it.id].icon} “${it.text}”` : `${ITEMS[it.id].icon} ${it.id} — condition ${it.cond}. ${ITEMS[it.id].desc}`);
    return;
  }
  const i = +b.dataset.drop;
  if (dropArmed === i) { dropArmed = -1; dropItem(i); } else { dropArmed = i; renderPack(); }
});
// a tap anywhere else disarms ✕ (composedPath, as the tapped button may already have been redrawn away)
document.addEventListener('click', (e) => { if (dropArmed >= 0 && !e.composedPath().includes($('#pack'))) { dropArmed = -1; renderPack(); } });
// Log panel: hidden by default; remembered per browser.
// Unread counter: log messages (not round markers) added while the log is hidden.
let logSeen = 0;
function updateUnread() {
  if (!G) return;
  if (logOpen()) logSeen = G.log.length;
  const n = G.log.slice(logSeen).filter((l) => l.cls !== 'phase').length;
  const open = logOpen();
  $('#logtoggle').innerHTML = `📜<span class="lbl"> ${open ? 'Hide' : 'Show'} log</span>${!open && n ? ` <span class="unread">${n > 99 ? '99+' : n}</span>` : ''}`;
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
const playersBox = $('#playersbox');
try { playersBox.open = localStorage.getItem('playersOpen') !== '0'; } catch { /* storage unavailable */ }
playersBox.addEventListener('toggle', () => { try { localStorage.setItem('playersOpen', playersBox.open ? '1' : '0'); } catch { /* storage unavailable */ } });

function toggleMute() { muted = !muted; $('#mute').textContent = muted ? '🔇' : '🔊'; }
$('#mute').onclick = toggleMute;
setTimer(timerOn);
let lastTick = performance.now();
setInterval(() => { const now = performance.now(); tickTimer(now - lastTick); lastTick = now; }, 100);

newGame(['Survivor']);
