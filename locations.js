// =====================================================================
//  LOCATIONS — edit freely. Every tile the game can place comes from here.
// =====================================================================
//
//  Each location has:
//    name   — shown on the hex
//    icon   — an emoji
//    table  — its d6 scavenge table: exactly 6 results, for rolls 1 to 6.
//             Roll 1 is always 'Zombies'. Leave it out for a tile with nothing
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
//
//  Scouting reveals a random location from this list (not the start tile),
//  so a location with count: 3 is three times as common as one without.

const LOCATIONS = [
  { name: 'Farmhouse',      icon: '🏚️', start: true,
    table: ['Zombies', 'Food',        'Water',       'Double Food',  'Axe',         'Truck'] },

  { name: 'YOLO Foods',    icon: '🛒', table: ['Zombies', 'Water',       'Double Food', 'Double Water', 'Food',        'Hope'] },
  { name: 'Petrol Station', icon: '⛽', table: ['Zombies', 'Double Fuel', 'Toolkit',     'Truck',        'Water',       'Fuel'] },
  { name: 'Hospital',       icon: '🏥', table: ['Zombies', 'Water',       'Hope',        'Water',        'Double Hope', 'Food'] },
  { name: 'Police Station', icon: '🚓', table: ['Zombies', 'Ammo',        'Triple Ammo', 'Handgun',      'Double Ammo', 'Body Armor'] },
  { name: 'Hardware Store', icon: '🔨', table: ['Zombies', 'Toolkit',     'Axe',         'Ammo',         'Water',       'Handgun'] },
  { name: 'School',         icon: '🏫', table: ['Zombies', 'Food',        'Food',        'Water',        'Double Hope', 'Bike'] },
  { name: 'Church',         icon: '⛪', table: ['Zombies', 'Double Hope', 'Hope',        'Water',        'Food',        'Water'] },
  { name: 'Pharmacy',       icon: '💊', table: ['Zombies', 'Water',       'Hope',        'Double Water', 'Food',        'Hope'] },
  { name: 'Gun Shop',       icon: '🎯', table: ['Zombies', 'Ammo',        'Double Ammo', 'Triple Ammo',  'Handgun',     'Body Armor'] },
  { name: 'Forest',         icon: '🌲', table: ['Zombies', 'Food',        'Water',       'Axe',          'Food',        'Hope'] },
  { name: 'Lake',           icon: '🏞️', table: ['Zombies', 'Double Water', 'Double Water', 'Food',      'Hope',        'Water'] },
  { name: 'Pub',            icon: '🍺', table: ['Zombies', 'Food',        'Double Hope', 'Hope',         'Food',        'Water'] },
  { name: 'Campsite',       icon: '⛺', table: ['Zombies', 'Fuel',        'Food',        'Water',        'Bike',        'Toolkit'] },
  // Wasteland: nothing to find and nowhere to hide.
  { name: 'Wasteland',      icon: '🏜️', fortify: false, count: 3 },
  // Mountain: impassable wasteland — it blocks the way.
  { name: 'Mountain',       icon: '⛰️', fortify: false, passable: false, count: 2 },

  { name: 'Army Checkpoint',icon: '⛺', table: ['Zombies', 'Fuel',        'Food',        'Water',        'Handgun',        'Ammo'] },
];
