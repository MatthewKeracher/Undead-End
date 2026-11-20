// =====================================================================
//  GAME DATA — edit freely. Rules numbers live in CONFIG, tiles below.
// =====================================================================

const CONFIG = {
  startDay: 1,
  startRound: 1,          // 1 = first morning; 5 and 6 are the night
  maxAP: 12,              // highest max AP can grow to
  trackGain: { food: 1, water: 2 },   // max AP gained per check paid
  trackLoss: { food: 1, water: 2 },   // max AP lost per check missed (max AP 0 = death)
  startMaxAP: 12,         // max AP at the start (food & water missed lower it; paid raises it back, up to 12)
  startAP: 8,             // AP at the start (sleep tops it up to max AP)
  startRes: { food: 4, water: 6, booze: 3, fuel: 0, ammo: 0 },   // what every survivor starts with
  startItems: [],                                                // …and carries (nothing: find a weapon)
  startSafety: 0,         // Safety on the starting tile
  maxSafety: 5,           // most Safety a tile can hold, unless its location says otherwise (safety: 0–8 in locations.js)
  maxZombies: 6,          // most zombies a tile can hold — and that many can't be outrun
  maxItems: 6,            // backpack size
  maxCondition: 6,        // most condition any item can have
  maxRerolls: 2,          // landing on a crossed-off row rolls again — up to this many times, then you find nothing
  lootDice: 1,            // a resource find rolls this many d6, × 2 for a Double (item condition and zombie counts stay 1d6)
  lootMin: 2,             // …and its die quietly never shows less than this (2: a find is never just 1)

  // TESTING: items every new game starts with in the backpack (full condition). Set to [] to turn off.
  testStartItems: [],
  testStartVehicles: [],   // parked on the start tile
  testStartRes: {},        // added to the starting rolls
  nightRounds: [5, 6],    // dark on the clock
  attackRounds: [5],      // rounds that start with a night attack
  badNightOn: 2,          // as round 1 starts, a secret 1d6: this or less means a bad night — round 6 attacks too
  // terrain shapes (locations with spread:, in locations.js)
  beltBig: 0.3,           // a new Wasteland belt is a cluster of 7 this often, otherwise a triangle of 3
  rangeArm: [1, 3],       // a new Mountain range runs 1–3 more hexes each way…
  rangeGap: 0.25,         // …each one a gap (a pass: anything but a Mountain) this often…
  rangeTurn: 0.3,         // …and bending 60° this often
  // settlements (places with in:, in locations.js): how many hexes each is planned as, and how common a new one is
  // when scouting (as a count, beside the countryside places). Each hex is a different place from its list.
  settlements: {
    village: { size: 3, count: 1.2 },
    town: { size: 7, count: 0.45 },
    city: { size: 12, count: 0.15 },
  },
  townGap: 2,             // at least this many hexes of countryside between two settlements
  edgeChain: [1, 3],      // a stretch of edge land (Fields, Golf Course: edge: in locations.js) is 1–3 hexes long
  roundSeconds: 30,       // round timer: act within this or lose 1 AP (online always; single player: on by default)

  // What each round of the clock calls for (checked at the END of the round).
  upkeep: {
    1: { water: 1 },
    2: { food: 1 },
    3: { water: 1 },
    4: { food: 1 },
    5: { water: 1 },
    6: { booze: 1 },
  },
};

// Vehicles come in two kinds, each in many looks (same rules, new name and icon): fuel ones (1 🟠 per tile)
// and pedal ones (1 AP per tile). Animals are a third kind: no condition (they never break down, and a Tool
// can't help them) — they drink 1 🔵 water per tile and eat 1 🔴 food per trip instead.
const fuelVehicle = (icon) => ({ icon, vehicle: true, uses: 'fuel', verb: 'Drive', desc: 'Parked on a tile. Drive through scouted tiles: 1 🟠 fuel per tile, −1 condition per trip.' });
const pedalVehicle = (icon) => ({ icon, vehicle: true, uses: 'ap', verb: 'Ride', desc: 'Parked on a tile. Ride through scouted tiles: 1 AP per tile, −1 condition per trip.' });
const animal = (icon) => ({ icon, vehicle: true, animal: true, uses: 'water', eats: 'food', verb: 'Ride', desc: 'Waits on a tile. Ride through scouted tiles: 1 🔵 water per tile and 1 🔴 food per trip. Never breaks down.' });

// Weapons come in kinds too, each in many looks: guns fire ammo, melee weapons cost AP.
const gun = (icon, verb = 'Fire', extra = {}) => ({ icon, weapon: true, uses: 'ammo', verb, desc: 'Fight: no AP; 1 condition per round; each 🟢 ammo fired kills 1 zombie.', ...extra });
const melee = (icon, verb = 'Swing') => ({ icon, weapon: true, uses: 'ap', verb, desc: `Fight: 1 condition per round; each ${verb.toLowerCase()} costs 1 AP and kills 1 zombie.` });

// Item cards. Condition = uses left; at 0 the item breaks.
const ITEMS = {
  Pistol: gun('🔫'),
  Bow: gun('🏹', 'Loose', { sound: 'bow' }),
  Axe: melee('🪓'),
  Sword: melee('🗡️', 'Slash'),
  'Kitchen Knife': melee('🔪', 'Stab'),
  'Frying Pan': melee('🍳'),
  'Cricket Bat': melee('🏏'),
  'Hockey Stick': melee('🏒'),
  Pickaxe: melee('⛏️'),
  Wrench: melee('🔧'),
  Chainsaw: { icon: '🪚', img: 'assets/chainsaw.png', weapon: true, uses: 'fuel', kills: 3, verb: 'Rev', desc: 'Fight: 1 condition per round; each rev burns 1 🟠 fuel and kills up to 3 zombies.' },
  'Body Armor': { icon: '🦺', armor: true, desc: 'When a flee roll fails: take the hit for −1 condition and reroll (1 AP).' },
  Truck: fuelVehicle('🛻'),
  Tractor: fuelVehicle('🚜'),
  Ambulance: fuelVehicle('🚑'),
  'Police Car': fuelVehicle('🚓'),
  Jeep: fuelVehicle('🚙'),
  Van: fuelVehicle('🚚'),
  Bus: fuelVehicle('🚌'),
  Campervan: fuelVehicle('🚐'),
  'Fire Engine': fuelVehicle('🚒'),
  Bike: pedalVehicle('🚲'),
  Horse: animal('🐎'),
  // Multiplayer (planned — see MULTIPLAYER.md): talk to players on other tiles. No effect in single player; not in any loot table yet.
  Radio:   { icon: '📻', radio: true, desc: 'Multiplayer: lets you talk to players on other tiles who also carry a radio. −1 condition per round used.' },
  Tool: { icon: '🧰', tool: true, desc: 'Use any time (free): transfer some of its condition to another item. Destroyed at 0.' },
  // Map: disabled for now — in no loot table (the cheat item(map) still reads one).
  Map:   { icon: '🗺️', map: true, desc: 'Used the moment you find it (never carried): reveals every unexplored hex next to an explored one.' },
  Binoculars: { icon: '🔭', binoculars: true, desc: 'Scouting also reveals the hexes beyond the ones next to you — but not past a Mountain. −1 condition per scout; gone at 0.' },
  Pills: { icon: '💊', pills: true, desc: 'Take any time (free): AP back up to your max AP. −1 condition per dose; gone at 0.' },
};

// Tutorial games (chosen from the opening menu): a card before the first round, a card for each action the
// first time you pick it (Do it / Not yet), and one for each item the first time you find it — that card
// uses the item's desc above, with a line about its kind. Edit freely.
const TUTORIAL = {
  welcome: {
    icon: '🧟', title: 'Welcome, survivor',
    text: [
      'Stay alive as long as you can. Each day is 6 rounds — the clock, top left. Rounds 5 and 6 are night, and at night the zombies come.',
      'Each round you take one action. Most cost 1 🎲 AP; sleeping gets AP back.',
      'Each round also asks for something, shown on the clock: 🔴 food and 🔵 water keep your max AP up (miss them and it drops — at 0 you die). 🟣 Booze gets you through the night: no booze when round 6 asks for it, and you die.',
      '🟠 Fuel and 🟢 ammo run vehicles and guns. 🟡 Safety belongs to a place — it stops zombies at night.',
      'Each action and item is explained the first time you meet it. The round timer is off while you learn.',
    ],
  },
  actions: {
    sleep: { icon: '😴', title: 'Sleep', text: ['Rest for the round: roll 2d6 and gain that much AP, up to your max AP. Free — but it is your action.', 'At 0 AP, sleeping is all you can do.'] },
    scout: { icon: '🔭', title: 'Scout', text: ['1 AP: reveals every unexplored hex next to you, so you can see where to go. You stay where you are.'] },
    move: { icon: '🚶', title: 'Move', text: ['Step into a hex next to you — pick it on the map (or press A Q E D X Z). An unexplored hex is revealed as you arrive.', 'Your first move each round is free and still leaves you your action — but you need at least 1 AP. A second move costs 1 AP and is your action.'] },
    scavenge: { icon: '🔍', title: 'Scavenge', text: ['1 AP: roll a d6 on this place\'s table. A 1 is always zombies, a 3 is a random find. What you find is crossed off.', 'Zombies drift back once nobody\'s here and the place has no Safety. You can\'t scavenge with zombies on the tile.'] },
    fortify: { icon: '🔨', title: 'Fortify', text: ['1 AP: add 1d6 🟡 Safety to this place, up to its max.', 'At night each point of Safety stops one attacking zombie (and is used up). Safety stays with the place, not with you.'] },
    drive: { icon: '🛻', title: 'Drive or ride', text: ['Free movement: it doesn\'t use your action. Steer hex by hex through scouted hexes; each tile costs fuel, AP or water, depending on what you\'re in.', 'You can pass through zombies, but stopping on them means a fight.'] },
    shoot: { icon: '🔫', title: 'Shoot', text: ['Each shot fires 1 🟢 ammo and kills 1 zombie. No AP.', 'The gun loses 1 condition for each round of fighting, not each shot.'] },
    melee: { icon: '🪓', title: 'Melee', text: ['Each swing costs 1 🎲 AP and kills 1 zombie — AP you might need to flee.', 'The weapon loses 1 condition for each round of fighting, not each swing.'] },
    saw: { icon: '🪚', title: 'Saw', text: ['Each rev burns 1 🟠 fuel and kills up to 3 zombies.'] },
    flee: { icon: '🏃', title: 'Flee', text: ['1 AP: roll a d6 and beat the number of zombies to escape to a safe, scouted hex next to you — or away in a vehicle here.', 'Fail and you\'re caught: you must fight. Six zombies can\'t be outrun.'] },
    tool: { icon: '🧰', title: 'Use a tool', text: ['Free, any time: move some of the tool\'s condition onto another item, or a vehicle on your tile (up to 6). The tool is gone at 0.'] },
    pills: { icon: '💊', title: 'Take pills', text: ['Free, any time: one dose tops your AP up to your max AP. −1 condition per dose.'] },
    drop: { icon: '✕', title: 'Leave an item', text: ['Leave it on this tile, condition and all. It takes a row of the table — roll that row to pick it up again.'] },
  },
  // the line above an item's desc on its card
  kinds: {
    weapon: 'A weapon — used when zombies are on your tile.',
    armor: 'Armor — worn, not used.',
    vehicle: 'A vehicle — too big for your backpack, it stays parked on its tile.',
    animal: 'An animal — it waits on its tile.',
    other: 'An item for your backpack.',
  },
  condition: 'Condition (the dots) is how many uses are left; at 0 it breaks.',
};

// Tiles are read from LOCATIONS (locations.js): each table entry is written as words
// ('Double Food', 'Axe', …) and turned into { zombies } / { res, n } / { item } here.
const MULTIPLIERS = { double: 2, triple: 3, quadruple: 4 };
function parseResult(text, where) {
  let t = String(text).trim().toLowerCase().replace(/\s+/g, ' ');
  if (t === 'zombies') return { zombies: 1 };
  if (t === 'random') return { random: 1 };   // anything: drawn from every place's table as the tile is placed
  // 'Endless …' never runs out: the row is never crossed off
  const endless = t.startsWith('endless ');
  if (endless) t = t.slice(8);
  if (endless && t === 'random') throw new Error(`${where}: "${text}" — a Random row can't be Endless.`);
  // a mix, e.g. 'Food + Water' or 'Truck + Fuel': each part rolls its own 1d6
  if (t.includes('+')) {
    const parts = t.split('+').map((x) => parseResult(x, where));
    if (parts.some((x) => x.zombies || x.random || x.parts || x.endless)) throw new Error(`${where}: "${text}" — a mix can't include Zombies or Random (and put Endless at the front).`);
    if (parts.filter((x) => x.item).length > 1) throw new Error(`${where}: "${text}" — a mix can have at most one item.`);
    return { parts, ...(endless && { endless }) };
  }
  const [first, ...rest] = t.split(' ');
  const n = MULTIPLIERS[first] && rest.length ? MULTIPLIERS[first] : 1;
  const res = n > 1 ? rest.join(' ') : t;
  if (['food', 'water', 'booze', 'fuel', 'ammo'].includes(res)) return { res, n, ...(endless && { endless }) };
  const item = Object.keys(ITEMS).find((id) => id.toLowerCase() === t);
  if (item) return { item, ...(endless && { endless }) };
  throw new Error(`${where}: "${text}" isn't a result I know. Use Zombies, Food/Water/Booze/Fuel/Ammo (optionally Double/Triple/Quadruple, and/or Endless), or an item: ${Object.keys(ITEMS).join(', ')}.`);
}
function loadLocations(list) {
  const errors = [];
  const tiles = list.map((loc, i) => {
    const where = `Location ${i + 1}${loc.name ? ` (${loc.name})` : ''}`;
    if (!loc.name) errors.push(`${where}: missing a name.`);
    const raw = loc.table ?? [];   // no table = nothing to scavenge
    if (!Array.isArray(raw) || (raw.length && raw.length !== 6)) { errors.push(`${where}: the table needs exactly 6 results (rolls 1–6), or leave it out for nothing to scavenge.`); return null; }
    const settlements = loc.in ?? [];
    if (!Array.isArray(settlements) || settlements.some((x) => !CONFIG.settlements[x])) errors.push(`${where}: in must be a list of ${Object.keys(CONFIG.settlements).map((x) => `'${x}'`).join(', ')}.`);
    const edge = loc.edge ?? {};
    if (typeof edge !== 'object' || Object.entries(edge).some(([k, n]) => !CONFIG.settlements[k] || !(typeof n === 'number' && n >= 0))) errors.push(`${where}: edge must look like { village: 1, town: 1.5 } — settlement kinds and how many stretches each.`);
    const placed = settlements.length > 0 || Object.keys(edge).length > 0;   // built in settlements, or laid around them
    const count = loc.count ?? (placed ? 0 : 1);   // …isn't found alone, unless given a count
    if (!(typeof count === 'number' && count >= 0) || (!count && !placed)) errors.push(`${where}: count must be a number above 0 (e.g. 1, 3 or 0.5) — or 0 for a place found only in or around settlements (in: […] or edge: {…}).`);
    if (loc.spread && settlements.length) errors.push(`${where}: a belt or range can't also be built in settlements.`);
    if (loc.spread && !['belt', 'range'].includes(loc.spread)) errors.push(`${where}: spread must be 'belt' or 'range'.`);
    const table = raw.map((x, r) => { try { return parseResult(x, `${where}, roll ${r + 1}`); } catch (e) { errors.push(e.message); return null; } });
    if (raw.length && String(raw[2]).trim().toLowerCase() !== 'random') errors.push(`${where}: roll 3 is always 'Random' (it's "${raw[2]}").`);
    // most Safety it can be fortified to: safety: N, or 0 (also fortify: false) for outdoors
    const safety = loc.fortify === false ? 0 : loc.safety ?? CONFIG.maxSafety;
    if (!Number.isInteger(safety) || safety < 0 || safety > 12) errors.push(`${where}: safety must be a whole number from 0 (outdoors) to 12.`);
    return { name: loc.name, icon: loc.icon || '', safety, fortify: safety > 0, passable: loc.passable !== false, count, in: settlements, edge, spread: loc.spread || null, table };
  });
  if (tiles.filter((t) => t && t.count > 0).length < 1) errors.push('Add at least one location with a count above 0, for scouting.');
  for (const [kind, { size }] of Object.entries(CONFIG.settlements)) {
    const n = tiles.filter((t) => t && t.in.includes(kind)).length;
    if (n < size) errors.push(`A ${kind} is ${size} hexes, each a different place, but only ${n} locations have in: '${kind}'.`);
  }
  if (errors.length) {   // show the problems on the page instead of a blank screen
    document.body.insertAdjacentHTML('afterbegin', `<pre style="position:fixed;inset:16px auto auto 16px;z-index:99;max-width:calc(100% - 32px);white-space:pre-wrap;padding:12px 16px;background:#3a0d0d;color:#ffd6cf;border:1px solid #e86a5a;border-radius:8px;font:13px/1.5 ui-monospace,monospace">locations.js has problems:\n• ${errors.map((e) => e.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('\n• ')}</pre>`);
    throw new Error(`locations.js: ${errors.join(' | ')}`);
  }
  return tiles;   // every place; the scouting pool is drawn from them by count (engine.js reveal)
}
const TILES = loadLocations(LOCATIONS);
