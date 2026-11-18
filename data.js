// =====================================================================
//  GAME DATA — edit freely. Rules numbers live in CONFIG, tiles below.
// =====================================================================

const CONFIG = {
  startDay: 1,
  startRound: 2,          // 1 = first night round; 2 = first morning
  maxAP: 12,              // highest max AP can grow to
  trackGain: { food: 1, water: 2 },   // max AP gained per check paid
  trackLoss: { food: 1, water: 2 },   // max AP lost per check missed (max AP 0 = death)
  startMaxAP: 12,         // max AP at the start (food & water missed lower it; paid raises it back, up to 12)
  startRes: { food: 4, water: 6, hope: 3, fuel: 0, ammo: 0 },   // what every survivor starts with; AP starts full
  startItems: [{ id: 'Axe', cond: 3 }],                          // …and carries
  startSafety: 0,         // Safety on the starting tile
  maxSafety: 5,           // most Safety a tile can hold, unless its location says otherwise (safety: 0–8 in locations.js)
  maxZombies: 6,          // most zombies a tile can hold — and that many can't be outrun
  maxItems: 6,            // backpack size
  maxCondition: 6,        // most condition any item can have
  maxRerolls: 2,          // landing on a crossed-off row rolls again — up to this many times, then you find nothing
  lootDice: 2,            // a resource find rolls this many d6 (item condition and zombie counts stay 1d6)

  // TESTING: items every new game starts with in the backpack (full condition). Set to [] to turn off.
  testStartItems: [],
  testStartVehicles: [],   // parked on the start tile
  testStartRes: {},        // added to the starting rolls
  nightRounds: [1, 6],    // dark on the clock
  attackRounds: [6],      // rounds that start with a night attack
  badNightOn: 2,          // as round 2 starts, a secret 1d6: this or less means a bad night — round 1 attacks too
  roundSeconds: 30,       // round timer: act within this or lose 1 AP (online always; single player: on by default)

  // What each round of the clock calls for (checked at the END of the round).
  upkeep: {
    1: { hope: 1 },
    2: { water: 1 },
    3: { food: 1 },
    4: { water: 1 },
    5: { food: 1 },
    6: { water: 1 },
  },
};

// Item cards. Condition = uses left; at 0 the item breaks.
const ITEMS = {
  Handgun: { icon: '🔫', weapon: true, uses: 'ammo', verb: 'Fire', desc: 'Fight: no AP; 1 condition per round; each 🟢 ammo fired kills 1 zombie.' },
  Axe:     { icon: '🪓', weapon: true, uses: 'ap',   verb: 'Swing', desc: 'Fight: 1 condition per round; each swing costs 1 AP and kills 1 zombie.' },
  'Body Armor': { icon: '🦺', armor: true, desc: 'When a flee roll fails: take the hit for −1 condition and reroll (1 AP).' },
  Truck: { icon: '🛻', vehicle: true, uses: 'fuel', verb: 'Drive', desc: 'Parked on a tile. Drive through scouted tiles: 1 🟠 fuel per tile, −1 condition per trip.' },
  Bike:  { icon: '🚲', vehicle: true, uses: 'ap',   verb: 'Ride',  desc: 'Parked on a tile. Ride through scouted tiles: 1 AP per tile, −1 condition per trip.' },
  // Multiplayer (planned — see MULTIPLAYER.md): talk to players on other tiles. No effect in single player; not in any loot table yet.
  Radio:   { icon: '📻', radio: true, desc: 'Multiplayer: lets you talk to players on other tiles who also carry a radio. −1 condition per round used.' },
  Toolkit: { icon: '🧰', tool: true, desc: 'Use any time (free): transfer some of its condition to another item. Destroyed at 0.' },
};

// Tiles are read from LOCATIONS (locations.js): each table entry is written as words
// ('Double Food', 'Axe', …) and turned into { zombies } / { res, n } / { item } here.
const MULTIPLIERS = { double: 2, triple: 3, quadruple: 4 };
function parseResult(text, where) {
  let t = String(text).trim().toLowerCase().replace(/\s+/g, ' ');
  if (t === 'zombies') return { zombies: 1 };
  // 'Endless …' never runs out: the row is never crossed off
  const endless = t.startsWith('endless ');
  if (endless) t = t.slice(8);
  // a mix, e.g. 'Food + Water' or 'Truck + Fuel': each part rolls its own 1d6
  if (t.includes('+')) {
    const parts = t.split('+').map((x) => parseResult(x, where));
    if (parts.some((x) => x.zombies || x.parts || x.endless)) throw new Error(`${where}: "${text}" — a mix can't include Zombies (and put Endless at the front).`);
    if (parts.filter((x) => x.item).length > 1) throw new Error(`${where}: "${text}" — a mix can have at most one item.`);
    return { parts, ...(endless && { endless }) };
  }
  const [first, ...rest] = t.split(' ');
  const n = MULTIPLIERS[first] && rest.length ? MULTIPLIERS[first] : 1;
  const res = n > 1 ? rest.join(' ') : t;
  if (['food', 'water', 'hope', 'fuel', 'ammo'].includes(res)) return { res, n, ...(endless && { endless }) };
  const item = Object.keys(ITEMS).find((id) => id.toLowerCase() === t);
  if (item) return { item, ...(endless && { endless }) };
  throw new Error(`${where}: "${text}" isn't a result I know. Use Zombies, Food/Water/Hope/Fuel/Ammo (optionally Double/Triple/Quadruple, and/or Endless), or an item: ${Object.keys(ITEMS).join(', ')}.`);
}
function loadLocations(list) {
  const errors = [];
  const tiles = list.map((loc, i) => {
    const where = `Location ${i + 1}${loc.name ? ` (${loc.name})` : ''}`;
    if (!loc.name) errors.push(`${where}: missing a name.`);
    const raw = loc.table ?? [];   // no table = nothing to scavenge
    if (!Array.isArray(raw) || (raw.length && raw.length !== 6)) { errors.push(`${where}: the table needs exactly 6 results (rolls 1–6), or leave it out for nothing to scavenge.`); return null; }
    const count = loc.count ?? 1;
    if (!Number.isInteger(count) || count < 1) errors.push(`${where}: count must be a whole number, 1 or more.`);
    const table = raw.map((x, r) => { try { return parseResult(x, `${where}, roll ${r + 1}`); } catch (e) { errors.push(e.message); return null; } });
    if (loc.start && loc.passable === false) errors.push(`${where}: the start tile can't be impassable.`);
    // most Safety it can be fortified to: safety: N, or 0 (also fortify: false) for outdoors
    const safety = loc.fortify === false ? 0 : loc.safety ?? CONFIG.maxSafety;
    if (!Number.isInteger(safety) || safety < 0 || safety > 12) errors.push(`${where}: safety must be a whole number from 0 (outdoors) to 12.`);
    return { name: loc.name, icon: loc.icon || '', start: !!loc.start, safety, fortify: safety > 0, passable: loc.passable !== false, count, table };
  });
  const starts = tiles.filter((t) => t && t.start);
  if (starts.length !== 1) errors.push(`Exactly one location needs start: true (found ${starts.length}).`);
  if (tiles.filter((t) => t && !t.start).length < 1) errors.push('Add at least one location without start: true, for scouting.');
  if (errors.length) {   // show the problems on the page instead of a blank screen
    document.body.insertAdjacentHTML('afterbegin', `<pre style="position:fixed;inset:16px auto auto 16px;z-index:99;max-width:calc(100% - 32px);white-space:pre-wrap;padding:12px 16px;background:#3a0d0d;color:#ffd6cf;border:1px solid #e86a5a;border-radius:8px;font:13px/1.5 ui-monospace,monospace">locations.js has problems:\n• ${errors.map((e) => e.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('\n• ')}</pre>`);
    throw new Error(`locations.js: ${errors.join(' | ')}`);
  }
  return { start: starts[0], tiles: tiles.filter((t) => !t.start).flatMap((t) => Array(t.count).fill(t)) };
}
const { start: START_TILE, tiles: TILES } = loadLocations(LOCATIONS);
