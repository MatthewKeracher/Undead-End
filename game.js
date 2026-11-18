// =====================================================================
//  GAME UI — draws the board and plays the engine's events as animations.
//  The rules themselves live in engine.js.
// =====================================================================

const E = Engine;
const { ICON, RES_LABEL, key, neighbors, isNight, cellText, upkeepText, passable, canEnter, canScavengeHere, canFortifyHere,
  weaponOf, canShoot, canMelee, canFight, vehicleFuel, vehicleLeft } = E;
const HEX = 120;

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const d6 = () => 1 + Math.floor(Math.random() * 6);   // only for the tumbling dice faces — real rolls happen in the engine
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

let G = null;        // game state (owned by the engine)
let mode = null;     // 'scout' | 'move' while picking a hex; mirrors the decision being made: 'threat' | 'flee' | 'drive'
let modalKey = null;  // when set, receives all key presses (shooting, backpack-full prompt)
let checksOff = false;   // cheat: skip the food / water / hope checks (kept across new games until reload)
let justRevealed = null;  // tile key to highlight after scouting
let camInit = false;

const cur = () => G.players[0];   // the survivor on this screen
const tileOf = (p) => E.tileOf(G, p);
const emptyAdj = (p) => E.emptyAdj(G, p);
const moveAdj = (p) => E.moveAdj(G, p);
const fleeAdj = (p) => E.fleeAdj(G, p);
const driveAdj = (p) => E.driveAdj(G, p);
const canFlee = (p, t) => E.canFlee(G, p, t);
const vehicleOf = (p, id) => E.vehicleOf(G, p, id);
const canDrive = (p, id) => E.canDrive(G, p, id);
const vehiclesHere = (p) => tileOf(p).vehicles;
const driving = () => (cur().pending?.kind === 'drive' ? cur().pending : null);   // the trip in progress
// Decisions answered from the action tray / map rather than a popup
const PENDING_MODE = { threat: 'threat', fleeTo: 'flee', drive: 'drive' };

// ---------------------------------------------------------------- setup
function newGame(names = ['Survivor']) {
  G = E.createGame({ names, checksOff });
  $('#popup').hidden = true; busy = false;
  logSeen = 0; mode = null; modalKey = null; selected = null; justRevealed = null; camInit = false; logShown = Infinity; // forces log reset on next render
  prevStats = {};
  render();
  // the starting round's check happens straight away (after a beat so you see your starting resources)
  const game = G;
  setTimeout(() => { if (G === game) play(E.start(G).events); }, 600);
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

async function play(events) {
  busy = true;
  for (const ev of events) if (ev.player === undefined || ev.player === cur().id) await show(ev);
  busy = false;
  const d = cur().pending;
  if (d) mode = PENDING_MODE[d.kind] ?? null;
  render();
  if (G.over) return showGameOver();
  await ask();
}

// Animate one engine event.
async function show(ev) {
  switch (ev.type) {
    case 'sleep': return sleepShow(ev);
    case 'fortify': return fortifyShow(ev);
    case 'scavenge': return scavengeShow(ev);
    case 'scout': return revealShow(ev);
    case 'night': return nightShow(ev);
    case 'checks': return renderStats(ev.stats[cur().id]);   // the check's effect shows before any night attack
    case 'maxApLoss': return maxApLossShow(ev);
    case 'flee': return fleeShow(ev);
    case 'armor': return sfx.armor();
    case 'repair': return sfx.repair();
    case 'driveStep': sfx.drive(ev.fuel); return render();
    case 'outOfFuel': return toast(`${ITEMS[ev.vehicle].icon} Out of ${ev.fuel === 'fuel' ? 'fuel' : 'AP'} — stopping here.`);
    case 'die': return tone(200, 1.4, 'sawtooth', 0.12, -170);
  }
}

// Decisions that need a popup. (Fight or Flee, where to flee and driving use the action tray and the map.)
async function ask() {
  const p = cur(), d = p.pending;
  if (!d) return;
  if (d.kind === 'fight') return fightPopup(p);
  if (d.kind === 'armor') return send({ type: 'decide', choice: await armorPrompt(p.items[d.item]) });
  if (d.kind === 'escape') return send({ type: 'decide', choice: await chooseEscape(d.options) });
  if (d.kind === 'backpack') return send({ type: 'decide', choice: await backpackPrompt(p, d.item) });
}

// ---------------------------------------------------------------- round timer (optional in single player)
// CONFIG.roundSeconds to act each round, or you sleep — as online. Paused while animations play.
// Acting ends the round straight away (you're the only survivor), so the clock only bites if you hesitate.
let timerOn = false;
try { timerOn = localStorage.getItem('roundTimer') === '1'; } catch { /* storage unavailable */ }
const timer = { game: null, day: 0, round: 0, left: 0, fired: false };
const fullTime = () => CONFIG.roundSeconds * 1000;
function tickTimer(dt) {
  if (!G) return;
  if (timer.game !== G || timer.day !== G.day || timer.round !== G.round) {   // new game or new round: full time again
    Object.assign(timer, { game: G, day: G.day, round: G.round, left: fullTime(), fired: false });
  }
  if (timerOn && !busy && !G.over && !timer.fired) {
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
      // mid-decision (e.g. Fight or Flee), the engine waits for it, then you sleep
      toast(res.events.length ? "⏱️ Time's up — you sleep." : "⏱️ Time's up — deal with this, then you sleep.");
      if (res.events.length) play(res.events); else render();
    }
  }
  renderTimer();
}
function renderTimer() {
  const el = $('#timer');
  if (!timerOn || !G || G.over) { el.innerHTML = ''; el.className = ''; return; }
  const s = Math.ceil(timer.left / 1000);
  el.className = `${s <= 10 ? 'low' : ''} ${busy ? 'paused' : ''}`;
  el.innerHTML = `⏱️ <b>${s}s</b><span class="bar"><i style="width:${(100 * timer.left / fullTime()).toFixed(1)}%"></i></span>`;
}
function setTimer(on) {
  timerOn = on;
  try { localStorage.setItem('roundTimer', on ? '1' : '0'); } catch { /* storage unavailable */ }
  Object.assign(timer, { left: fullTime(), fired: false });   // a fresh 30 s when switched on
  $('#timerbtn').classList.toggle('on', on);
  $('#timerbtn').innerHTML = `⏱️<span class="lbl"> Timer ${on ? 'on' : 'off'}</span>`;
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
  $('#pres').innerHTML = ev.ok ? `<div class="big good">Escaped!</div><small class="muted">Pick a safe hex: A Q W D X Z</small>` : `<div class="big bad">Caught!</div>`;
  if (ev.ok) sfx.win(false); else { pop.classList.add('zombie'); sfx.zombie(); }
  await popupHold(ev.ok ? 1400 : 2200);
}

// One round of fighting (the engine has already taken 1 weapon condition). Each attack (Enter) kills 1 zombie
// and costs 1 ammo (gun) or 1 AP (melee). The popup stays open for the whole fight round.
async function fightPopup(p) {
  const d = p.pending, t = tileOf(p), w = p.items[d.weapon], def = ITEMS[w.id], melee = def.uses === 'ap';
  const left = () => (melee ? p.ap : p.res.ammo);
  const fighting = () => p.pending === d;
  const pop = $('#popup');
  pop.className = 'fight';
  let after = [];   // events from the attack (or stop) that ended the fight round
  const draw = () => {
    pop.innerHTML = `<div class="pcard">
      <div class="ptitle"><small>⚔️ Fight · ${esc(t.def.name)}</small><h2>${t.zombies ? `${t.zombies} zombie${t.zombies > 1 ? 's' : ''}` : 'Clear!'}</h2></div>
      <div class="cpips">${[...Array(6)].map((_, i) => `<i class="${i < t.zombies ? 'zed' : i < d.start ? 'dead' : ''}"></i>`).join('')}</div>
      <div class="fammo">${melee ? `${ICON.ap} <b class="${p.ap <= 1 ? 'warnap' : ''}">${p.ap}</b> AP` : `${ICON.ammo} <b>${p.res.ammo}</b> ammo`} · ${def.icon} ${w.id} condition ${condPips(w.cond)}</div>
      ${melee && p.ap === 1 && t.zombies ? `<div class="note bad">Last AP — swinging now leaves you nothing to flee with.</div>` : ''}
      <div class="frow">
        <button class="primary" id="fire" ${fighting() && left() && t.zombies ? '' : 'disabled'}>${def.icon} ${def.verb} <small>(1 ${melee ? 'AP' : 'ammo'})</small> <kbd>Enter</kbd></button>
        <button id="stop">Stop <kbd>Esc</kbd></button>
      </div>
      <small class="pskip"><kbd>Shift</kbd>+<kbd>Enter</kbd> ${melee ? 'swing' : 'fire'} until clear (or out of ${melee ? 'AP' : 'ammo'})</small></div>`;
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
    if (melee) sfx.axe(); else sfx.gun();
    draw();
    pop.querySelector('.pcard').classList.add('flash');
    pop.querySelectorAll('.cpips i')[t.zombies]?.classList.add('hit');
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
    else if (e.key === 'Escape') stop();
  };
  draw();
  pop.hidden = false;
  await over;
  pop.hidden = true;
  await play(after.filter((ev) => ev.type !== 'hit'));
}

const condPips = (n) => `<span class="cond">${[...Array(6)].map((_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;

// ---------------------------------------------------------------- items
// Backpack full: pick an item to destroy (the new one is last — picking it leaves it behind).
async function backpackPrompt(p, item) {
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
  return i;
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
  pop.className = 'tool';
  if (!targets.length) {
    toast(`${ITEMS[tool.id].icon} Nothing to repair — every other item is at full condition (${CONFIG.maxCondition}).`);
    return;
  }
  // step 1: pick the item to repair
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>${ITEMS[tool.id].icon} ${tool.id} ${condPips(tool.cond)}</small><h2>Repair which item?</h2></div>
    <ol class="pack-choose">${targets.map(({ it }, n) => `<li><button data-n="${n}"><kbd>${n + 1}</kbd> ${ITEMS[it.id].icon} ${it.id} ${condPips(it.cond)}</button></li>`).join('')}</ol>
    <small class="pskip">press 1–${targets.length} or click · Esc to cancel</small></div>`;
  pop.hidden = false;
  const target = await new Promise((res) => {
    pop.querySelectorAll('[data-n]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); res(targets[+b.dataset.n]); }));
    modalKey = (e) => { if (e.key === 'Escape') res(null); const n = +e.key; if (n >= 1 && n <= targets.length) res(targets[n - 1]); };
  });
  if (!target) return close();
  // step 2: how much condition to transfer
  const max = Math.min(tool.cond, CONFIG.maxCondition - target.it.cond);
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>${ITEMS[tool.id].icon} ${tool.id} ${condPips(tool.cond)} → ${ITEMS[target.it.id].icon} ${target.it.id} ${condPips(target.it.cond)}</small><h2>Transfer how much?</h2></div>
    <div class="frow">${[...Array(max)].map((_, n) => `<button data-a="${n + 1}"><kbd>${n + 1}</kbd></button>`).join('')}</div>
    <small class="pskip">press 1–${max} or click · Esc to cancel</small></div>`;
  const amount = await new Promise((res) => {
    pop.querySelectorAll('[data-a]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); res(+b.dataset.a); }));
    modalKey = (e) => { if (e.key === 'Escape') res(0); const n = +e.key; if (n >= 1 && n <= max) res(n); };
  });
  close();
  if (!amount) return render();
  send({ type: 'tool', tool: i, target: { from: target.from, index: target.index }, amount });
}

function dropItem(i) {
  if (!cur().items[i] || busy || modalKey) return;
  send({ type: 'drop', item: i });
}

// ---------------------------------------------------------------- actions
// Buttons and hotkeys come here. Scout and Move first ask for a hex (clickHex).
function act(name) {
  if (busy || modalKey || G.over) return;
  const p = cur();
  if (mode === 'threat') { if (['shoot', 'melee', 'flee'].includes(name)) send({ type: 'decide', choice: name }); return; }
  if (p.pending) return;
  if (name === 'scout' || name === 'move') { mode = mode === name ? null : name; return render(); }
  if (ITEMS[name]?.vehicle) return send({ type: 'drive', vehicle: name });
  send({ type: name });
}

// A hex picked on the map (or with A Q W D X Z) while scouting, moving, fleeing or driving.
function clickHex(q, r) {
  if (busy || !mode) return;
  const p = cur(), t = G.tiles[key(q, r)];
  if (!neighbors(p.q, p.r).some(([a, b]) => a === q && b === r)) return;
  if (mode === 'scout' && !t) send({ type: 'scout', q, r });
  else if (mode === 'move' && canEnter(p, t)) send({ type: 'move', q, r });
  else if (mode === 'flee' && passable(t) && !t.zombies) send({ type: 'decide', choice: { q, r } });
  else if (mode === 'drive' && passable(t)) send({ type: 'decide', choice: { q, r } });
}

// A new location: highlight it and pause so the player can take it in before the round moves on.
async function revealShow(ev) {
  justRevealed = ev.k;
  renderMap();
  toast(`🔭 Discovered: ${ev.icon} ${ev.name}`);
  tone(520, 0.15, 'triangle', 0.07); setTimeout(() => tone(780, 0.25, 'triangle', 0.07), 120);
  await new Promise((res) => { const tm = setTimeout(res, 2800); dismissPopup = () => { clearTimeout(tm); res(); }; });
  dismissPopup = null;
  justRevealed = null;
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
      else if (k === 'hope') { [392, 349, 294].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.07), i * 140)); }             // sad sigh
      else if (k === 'fuel') { noise(0.3, 0.12, 600); tone(140, 0.3, 'sine', 0.08, -40); }                                                      // slosh
      else if (k === 'ammo') { if (!modalKey) tone(1600, 0.03, 'square', 0.05); }                                                             // click (gun fight has its own sound)
    } else {
      const base = { food: 440, water: 587, hope: 659, fuel: 330, ammo: 784 }[k] || 500;
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

async function scavengeShow({ name, table, r, e, amt, c }) {
  const pop = $('#popup');
  skipAnim = false;
  pop.className = '';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>Scavenging</small><h2>${esc(name)}</h2></div>
    <div class="prow">
      <div class="slot" id="pd1"></div>
      <ol class="ptable">${table.map((x, i) => `<li data-i="${i + 1}" class="${x.zombies ? 'z' : x.item ? 'it' : ''}"><b>${i + 1}</b>${cellText(x)}</li>`).join('')}</ol>
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

async function fortifyShow({ name, r, before, after }) {
  const pop = $('#popup'), max = CONFIG.maxSafety;
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

// Missed food / water: pause the game and show the max AP ring losing a segment.
async function maxApLossShow({ res, oldMax, newMax, oldAp, newAp }) {
  const pop = $('#popup');
  const what = res === 'food' ? `${ICON.food} No food` : `${ICON.water} No water`;
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
    ? `<div class="big bad">Max AP ${oldMax} → ${newMax}</div><small class="muted">Each ${res} you have at a check raises it by ${CONFIG.trackGain}; each one missed costs ${CONFIG.trackLoss}.</small>`
    : `<div class="big bad">Max AP 0</div>`;
  await popupHold(newMax > 0 ? 2600 : 1500);
}

// Sleep: roll both dice, then the AP dial fills segment by segment.
async function sleepShow({ dice, from, to, max }) {
  const r = dice[0] + dice[1];
  const pop = $('#popup');
  skipAnim = false;
  pop.className = 'sleep';
  pop.innerHTML = `<div class="pcard">
    <div class="ptitle"><small>😴 Sleeping</small><h2>Rest &amp; recover</h2></div>
    <div class="prow"><div class="dicecol"><div class="slot" id="pd2a"></div><div class="slot" id="pd2b"></div></div><div class="bigap" id="bigap">${apGauge(from, '', max)}</div></div>
    <div class="presult" id="pres"></div>
    <small class="pskip">click or press any key</small></div>`;
  pop.hidden = false;
  await wait(150);
  await Promise.all([rollDie($('#pd2a'), dice[0], 900), rollDie($('#pd2b'), dice[1], 1050)]);
  await wait(250);
  for (let a = from + 1; a <= to; a++) {
    $('#bigap').innerHTML = apGauge(a, '', max, -1, a - 1);
    tone(330 + a * 45, 0.14, 'sine', 0.09);
    await wait(260);
  }
  const wasted = from + r - to;
  $('#pres').innerHTML = `<div class="big good">+${to - from} AP</div><small class="muted">${dice[0]} + ${dice[1]} = ${r}</small>${wasted > 0 ? '<br>' : ''}${wasted > 0 ? `<small class="muted">${wasted} wasted — max AP ${max}</small>` : ''}`;
  sfx.win(to >= max);
  await popupHold(1600);
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
  $('#banner').innerHTML = `<i style="background:${cur().color}"></i><h1>${E.roundBanner(G)}</h1>`;
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

// Result 1 is always Zombies on every tile, so it isn't listed — only results 2–6.
function tableSvg(x, y, def) {
  if (!def.passable) return `<text x="${x}" y="${y + 4}" class="empty">Impassable</text>`;
  if (!def.table.length) return `<text x="${x}" y="${y + 4}" class="empty">Nothing to scavenge</text>`;
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
    const k = Math.max(0, Math.min(1, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 3);   // frame time can precede t0
    cam.x = sx + (cam.tx - sx) * e; cam.y = sy + (cam.ty - sy) * e;
    applyView();
    cam.anim = k < 1 ? requestAnimationFrame(step) : null;
  };
  cam.anim = requestAnimationFrame(step);
}
function applyView() {
  const svg = $('#map'), b = svg.getBoundingClientRect();
  if (!b.width || !b.height) return;
  const z = Math.min(1, b.width / 520, b.height / 480);   // zoom out a little on small screens
  const w = b.width / z, h = b.height / z;
  svg.setAttribute('viewBox', `${cam.x - w / 2} ${cam.y - h / 2} ${w} ${h}`);
}
window.addEventListener('resize', applyView);

// Right column (backpack + resources) runs down the board, stopping above the action dock if they'd overlap.
function fitRightCol() {
  const b = $('#board').getBoundingClientRect(), d = $('#dock').getBoundingClientRect(), c = $('#rightcol').getBoundingClientRect();
  $('#board').style.setProperty('--dockh', d.right > c.left ? `${b.bottom - d.top}px` : '0px');
}
const dockWatch = new ResizeObserver(fitRightCol);
dockWatch.observe($('#dock'));
dockWatch.observe($('#board'));

// Vehicles parked on a tile: a vertical column in the space right of the loot table.
function vehicleSvg(x, y, vs) {
  const gap = 24, top = y - ((vs.length - 1) * gap) / 2;
  return vs.map((v, i) => `<text x="${x}" y="${top + i * gap + 6}" class="veh">${ITEMS[v.id].icon}</text>`).join('');
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
    const target = adj.has(k) && ((mode === 'move' && canEnter(p, t)) || (mode === 'flee' && passable(t) && !t.zombies) || (mode === 'drive' && passable(t)));
    const g = `<g class="hex tile d${Math.min(danger, 4)} ${canScavengeHere(t) ? '' : 'barren'} ${canFortifyHere(t) ? '' : 'nofort'} ${passable(t) ? '' : 'impassable'} ${k === justRevealed ? 'revealed' : ''} ${isHere ? 'here' : ''} ${target ? 'target' : ''} ${t.zombies ? 'infested' : ''}" data-k="${k}">
      <polygon points="${hexPoints(x, y, HEX - (isHere ? 4 : 2))}" ${isHere ? `style="stroke:${p.color}"` : ''}/>
      <text x="${x}" y="${y - HEX * 0.56}" class="name">${esc(t.def.name)}</text>
      ${tableSvg(x, y + 4, t.def)}
      ${passable(t) ? safetySvg(x, y + HEX * 0.64, t.safety, t.zombies) : ''}
      ${vehicleSvg(x + HEX * 0.69, y + 4, [...(t.vehicles || []), ...(isHere && driving() ? [driving().v] : [])])}
      ${target ? pickBadge(x, y - HEX * 0.8, pickNumber(p, q, r)) : ''}</g>`;
    if (isHere) hereSvg = g; else svg += g;   // draw current tile last so its border sits on top
  }

  $('#map').innerHTML = svg + hereSvg;
  const [cx, cy] = pix(p.q, p.r);
  if (!camInit) { cam.x = cx; cam.y = cy; camInit = true; applyView(); }
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

// Backpack: 6 slots in the top-right column of the board. ✕ arms, second click destroys.
let dropArmed = -1;
function renderPack() {
  const p = cur();
  // the header folds the backpack away on small screens (see style.css)
  let h = `<button type="button" class="packhead" data-packtoggle><span class="packname"><span class="word">Backpack</span><span class="bag">🎒</span> ${p.items.length}/${CONFIG.maxItems}</span>`
    + `<span class="packicons">${p.items.map((it) => ITEMS[it.id].icon).join('')}</span><span class="caret"></span></button>`;
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
  // AP gets its own big counter in the bottom-left of the board
  const apd = prevStats.ap === undefined ? '' : (p.ap > prevStats.ap || p.maxAP > prevStats.maxAP) ? 'up' : (p.ap < prevStats.ap || p.maxAP < prevStats.maxAP) ? 'down' : '';
  $('#apbox').innerHTML = apGauge(p.ap, apd, p.maxAP);
  const label = { ap: 'AP', food: 'Food', water: 'Water', hope: 'Hope', fuel: 'Fuel', ammo: 'Ammo' };
  $('#stats').innerHTML = Object.entries(vals).map(([k, v]) => {
    const prev = prevStats[k];
    const d = prev === undefined ? '' : v > prev ? 'up' : v < prev ? 'down' : '';
    const low = ['food', 'water', 'hope'].includes(k) && v <= 2 ? (v <= 1 ? 'low1' : 'low2') : '';
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
    const { v, steps, flee } = driving(), fuel = vehicleFuel(v) === 'fuel';
    $('#actions').innerHTML = `
      ${t.zombies ? `<div class="note bad">🧟 ${t.zombies} zombie${t.zombies > 1 ? 's' : ''} here — stopping on this tile triggers them!</div>` : ''}
      <div class="note good">${ITEMS[v.id].icon} ${flee ? 'Escaping' : 'Driving'} the ${v.id} — ${fuel ? `${ICON.fuel} ${p.res.fuel} fuel` : `🎲 ${p.ap} AP`} left · ${steps} tile${steps === 1 ? '' : 's'} so far.
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
  const nextUp = G.checksOff ? '' : upkeepText(nextRound);
  if (nextUp && !isNight(nextRound)) warn = `<div class="note">Next round starts with a check: ${nextUp}</div>`;
  if (isNight(nextRound)) {
    warn = `<div class="note ${isNight(G.round) ? 'bad' : ''}">🌙 Next round starts with ${nextUp ? `a ${nextUp} check and ` : ''}a night attack — 1d6 🧟 vs your 🟡 ${t.safety}.${apWarn}</div>`;
  }

  $('#actions').innerHTML = `
    ${warn}
    ${noAP ? `<div class="note bad">Out of AP — you must sleep.</div>` : ''}
    <div class="ribbon">
      ${btn('sleep', '😴 Sleep', 'Gain 2d6 AP', false)}
      ${btn('scout', '🔭 Scout', '1 AP · reveal hex', noAP || !emptyAdj(p).length)}
      ${btn('move', '🚶 Move', '1 AP · adjacent', noAP || !moveAdj(p).length)}
      ${btn('scavenge', '🔍 Scavenge', !canScavengeHere(t) ? 'Nothing to find' : t.zombies ? 'Blocked by zombies' : '1 AP · roll d6', noAP || !canScavengeHere(t) || t.zombies > 0)}
      ${Object.keys(ITEMS).filter((id) => ITEMS[id].vehicle && vehicleOf(p, id)).map((id) => {
        const v = vehicleOf(p, id), fuel = vehicleFuel(v) === 'fuel';
        return btn(id, `${ITEMS[id].icon} ${ITEMS[id].verb}`, !driveAdj(p).length ? 'Nowhere to go' : vehicleLeft(p, v) < 1 ? (fuel ? 'No fuel' : 'No AP') : `1 ${fuel ? ICON.fuel : '🎲'}/tile · cond ${v.cond}`, !canDrive(p, id));
      }).join('')}
      ${btn('fortify', '🔨 Fortify', !canFortifyHere(t) ? "Can't be fortified" : t.zombies ? 'Blocked by zombies' : t.safety >= CONFIG.maxSafety ? `Safety full (${CONFIG.maxSafety})` : '1 AP · +1d6 🟡', noAP || !canFortifyHere(t) || t.zombies > 0 || t.safety >= CONFIG.maxSafety)}
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
  'sleep(n) sleep(a,b)': 'sleep and gain n AP (2–12), or force both dice',
  'fortify(n)': 'fortify with a roll of n',
  'flee(n)': 'force your next flee roll',
  'night(n)': 'night attack now with n zombies',
  'zombies(n)': 'set zombies on your tile (fight/flee if > 0)',
  'safety(n)': 'set your tile\'s Safety',
  'item(name[,cond])': 'add an item (vehicles park on your tile)',
  'ap(n) maxap(n) food(n) water(n) hope(n) fuel(n) ammo(n)': 'set a value',
  'round(n) day(n)': 'jump the clock (no checks run)',
  'checks() checks(on|off)': 'toggle the food / water / hope checks',
  'reset()': 'start a fresh world (admin-only once online)',
};
async function runCheat(cmd, args) {
  const n = args.map((a) => (isNaN(+a) ? a : +a));
  const say = (m) => { G.log.push({ msg: `🛠️ ${m}`, cls: 'cheat' }); toast(`🛠️ ${m}`); };
  if (busy || modalKey) return say('Busy — finish the current popup first.');
  if (cmd === 'help') { G.log.push({ msg: '🛠️ Cheats: ' + Object.entries(CHEATS).map(([k, v]) => `${k} — ${v}`).join(' · '), cls: 'cheat' }); return setLog(true); }
  if (cmd === 'reset') { newGame(['Survivor']); return say('World reset'); }
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
  if (modalKey) { modalKey(e); return; }
  if (busy) { e.preventDefault(); popupInput(); return; }   // skip an animation — even the one where you die
  if (G.over) { if (e.key === 'Enter') { e.preventDefault(); newGame(['Survivor']); } return; }
  if (mode === 'drive' && (e.key === 'Enter' || e.key === 'Escape')) {
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
  if (e.target.closest('[data-packtoggle]')) { $('#pack').classList.toggle('open'); return; }
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
$('#timerbtn').onclick = () => setTimer(!timerOn);
setTimer(timerOn);
let lastTick = performance.now();
setInterval(() => { const now = performance.now(); tickTimer(now - lastTick); lastTick = now; }, 100);

newGame(['Survivor']);
