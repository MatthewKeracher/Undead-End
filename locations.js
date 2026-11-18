// =====================================================================
//  LOCATIONS — edit freely. Every tile the game can place comes from here.
// =====================================================================
//
//  Each location has:
//    name   — shown on the hex
//    icon   — an emoji
//    table  — its d6 scavenge table: exactly 6 results, for rolls 1 to 6.
//             Roll 1 is always 'Zombies'. Every row is used up once found — zombies
//             too, though they come back once a tile has no Safety and nobody on it.
//             Leave it out for a tile with nothing
//             to scavenge (Scavenge is blocked there).
//    passable — (optional) false for a tile nobody can enter: no moving, fleeing
//             or driving onto or through it. It still gets revealed by scouting.
//    safety — (optional) the most Safety it can be fortified to: 0 for outdoors (can't be
//             fortified), up to 8 for a real stronghold. Default 5 (CONFIG.maxSafety).
//    count  — (optional) how many of this tile are in the scouting pool (default 1).
//    start  — (optional) true for the tile every game starts on. Exactly one
//             location must have it; that one is never drawn when scouting.
//
//  Results you can write in a table (capitals don't matter):
//    'Zombies'                                   1d6 zombies arrive
//    'Food'  'Water'  'Hope'  'Fuel'  'Ammo'     gain 2d6 of it (CONFIG.lootDice in data.js)
//    'Double Food'  'Triple Ammo'  …             × 2 (Double), × 3 (Triple), × 4 (Quadruple) — use sparingly
//    'Axe'  'Handgun'  'Body Armor'  'Truck'  'Bike'  'Toolkit'  'Radio'
//                                                an item card (the names in ITEMS, data.js)
//    'Endless Water'  'Endless Double Food'  …   put Endless in front of any result and it
//                                                never runs out (shown with ∞)
//    'Food + Water'  'Truck + Fuel'  …           a mix: each part rolls its own 1d6
//                                                (at most one item; no Zombies in a mix)
//
//  Scouting reveals a random location from this list (not the start tile),
//  so a location with count: 3 is three times as common as one without.

// Themed: each place leans on what you'd really find there, with at most three rows of any one thing.
const LOCATIONS = [
  { name: 'Farmhouse',      icon: '🏚️', safety: 5, start: true,
    table: ['Zombies',       'Food',          'Food',          'Water',         'Axe',           'Truck + Fuel'] },

  // food & drink
  { name: 'YOLO Foods',     icon: '🛒', safety: 4, table: ['Zombies',       'Food',          'Food',          'Food + Water',  'Water',         'Water'] },
  { name: 'Lake',           icon: '🏞️', safety: 0, table: ['Zombies',       'Endless Water', 'Water',         'Water',         'Food',          'Hope'] },
  { name: 'Forest',         icon: '🌲', safety: 0, table: ['Zombies',       'Food',          'Food',          'Water',         'Axe',           'Hope'] },
  { name: 'Pub',            icon: '🍺', safety: 5, table: ['Zombies',       'Hope',          'Hope',          'Food',          'Water',         'Water'] },
  // hope
  { name: 'Church',         icon: '⛪', safety: 7, table: ['Zombies',       'Hope',          'Hope',          'Hope',          'Food',          'Water'] },
  { name: 'Hospital',       icon: '🏥', safety: 6, table: ['Zombies',       'Hope',          'Hope',          'Hope',          'Water',         'Food'] },
  { name: 'Pharmacy',       icon: '💊', safety: 3, table: ['Zombies',       'Hope',          'Hope',          'Water',         'Water',         'Food'] },
  { name: 'School',         icon: '🏫', safety: 6, table: ['Zombies',       'Food + Water',  'Hope',          'Hope',          'Food',          'Bike'] },
  // weapons
  { name: 'Police Station', icon: '🚓', safety: 8, table: ['Zombies',       'Handgun',       'Handgun',       'Ammo',          'Ammo',          'Body Armor'] },
  { name: 'Gun Shop',       icon: '🎯', safety: 6, table: ['Zombies',       'Handgun',       'Ammo',          'Ammo',          'Ammo',          'Body Armor'] },
  { name: 'Army Checkpoint', icon: '⛺', safety: 7, table: ['Zombies',       'Handgun',       'Handgun',       'Ammo',          'Food + Water',  'Ammo'] },
  // tools & travel
  { name: 'Hardware Store', icon: '🔨', safety: 5, table: ['Zombies',       'Toolkit',       'Toolkit',       'Axe',           'Axe',           'Fuel'] },
  { name: 'Petrol Station', icon: '⛽', safety: 3, table: ['Zombies',       'Fuel',          'Fuel',          'Food + Water',  'Toolkit',       'Truck + Fuel'] },
  { name: 'Campsite',       icon: '⛺', safety: 0, table: ['Zombies',       'Food + Water',  'Fuel',          'Hope',          'Axe',           'Bike'] },

  // Wasteland: nothing to find and nowhere to hide.
  { name: 'Wasteland',      icon: '🏜️', safety: 0, count: 3 },
  // Mountain: impassable wasteland — it blocks the way.
  { name: 'Mountain',       icon: '⛰️', safety: 0, passable: false, count: 2 },
];
