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
//    fortify — (optional) false for a tile that can't be fortified: its Safety
//             stays at 0, so every night attack hits it in full.
//    passable — (optional) false for a tile nobody can enter: no moving, fleeing
//             or driving onto or through it. It still gets revealed by scouting.
//    count  — (optional) how many of this tile are in the scouting pool (default 1).
//    start  — (optional) true for the tile every game starts on. Exactly one
//             location must have it; that one is never drawn when scouting.
//
//  Results you can write in a table (capitals don't matter):
//    'Zombies'                                   1d6 zombies arrive
//    'Food'  'Water'  'Hope'  'Fuel'  'Ammo'     gain 1d6 of it
//    'Double Food'  'Triple Ammo'  …             gain 1d6 × 2 (Double), × 3 (Triple), × 4 (Quadruple)
//    'Axe'  'Handgun'  'Body Armor'  'Truck'  'Bike'  'Toolkit'  'Radio'
//                                                an item card (the names in ITEMS, data.js)
//    'Endless Water'  'Endless Double Food'  …   put Endless in front of any result and it
//                                                never runs out (shown with ∞)
//
//  Scouting reveals a random location from this list (not the start tile),
//  so a location with count: 3 is three times as common as one without.

// Themed: each place leans on what you'd really find there, with at most three rows of any one thing.
const LOCATIONS = [
  { name: 'Farmhouse',      icon: '🏚️', start: true,
    table: ['Zombies', 'Food',         'Double Food',  'Water',        'Axe',          'Truck'] },

  // food & drink
  { name: 'YOLO Foods',     icon: '🛒', table: ['Zombies', 'Food',         'Double Food',  'Double Food',  'Water',        'Double Water'] },
  { name: 'Lake',           icon: '🏞️', table: ['Zombies', 'Endless Water', 'Double Water', 'Triple Water', 'Food',        'Hope'] },
  { name: 'Forest',         icon: '🌲', table: ['Zombies', 'Food',         'Double Food',  'Water',        'Axe',          'Hope'] },
  { name: 'Pub',            icon: '🍺', table: ['Zombies', 'Hope',         'Double Hope',  'Food',         'Water',        'Double Water'] },
  // hope
  { name: 'Church',         icon: '⛪', table: ['Zombies', 'Hope',         'Double Hope',  'Hope',         'Food',         'Water'] },
  { name: 'Hospital',       icon: '🏥', table: ['Zombies', 'Hope',         'Double Hope',  'Double Hope',  'Water',        'Food'] },
  { name: 'Pharmacy',       icon: '💊', table: ['Zombies', 'Hope',         'Hope',         'Water',        'Double Water', 'Food'] },
  { name: 'School',         icon: '🏫', table: ['Zombies', 'Food',         'Water',        'Hope',         'Double Hope',  'Bike'] },
  // weapons
  { name: 'Police Station', icon: '🚓', table: ['Zombies', 'Handgun',      'Handgun',      'Ammo',         'Double Ammo',  'Body Armor'] },
  { name: 'Gun Shop',       icon: '🎯', table: ['Zombies', 'Handgun',      'Ammo',         'Double Ammo',  'Triple Ammo',  'Body Armor'] },
  { name: 'Army Checkpoint', icon: '⛺', table: ['Zombies', 'Handgun',     'Handgun',      'Double Ammo',  'Food',         'Water'] },
  // tools & travel
  { name: 'Hardware Store', icon: '🔨', table: ['Zombies', 'Toolkit',      'Toolkit',      'Axe',          'Axe',          'Fuel'] },
  { name: 'Petrol Station', icon: '⛽', table: ['Zombies', 'Fuel',         'Double Fuel',  'Water',        'Toolkit',      'Truck'] },
  { name: 'Campsite',       icon: '⛺', table: ['Zombies', 'Food',         'Water',        'Fuel',         'Axe',          'Bike'] },

  // Wasteland: nothing to find and nowhere to hide.
  { name: 'Wasteland',      icon: '🏜️', fortify: false, count: 3 },
  // Mountain: impassable wasteland — it blocks the way.
  { name: 'Mountain',       icon: '⛰️', fortify: false, passable: false, count: 2 },
];
