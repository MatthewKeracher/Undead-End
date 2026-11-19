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
//    count  — (optional) how common it is when scouting (default 1; fractions like 0.5 are fine).
//    spread — (optional) 'belt' or 'range': a fresh one grows into a shape on the hexes around it
//             as they're revealed — a belt is a triangle of 3 or a cluster of 7; a range is a
//             chain running off both ways, with gaps (CONFIG.beltBig, rangeArm, rangeGap, rangeTurn).
//    start  — (optional) true for the tile every game starts on. Exactly one
//             location must have it; that one is never drawn when scouting.
//
//  Results you can write in a table (capitals don't matter):
//    'Zombies'                                   1d6 zombies arrive
//    'Food'  'Water'  'Booze'  'Fuel'  'Ammo'     gain 1d6 of it (CONFIG.lootDice in data.js)
//    'Double Food'  'Triple Ammo'  …             1d6 × 2 (Double), × 3 (Triple), × 4 (Quadruple) — use sparingly
//    'Axe'  'Pistol'  'Body Armor'  'Tool'  'Pills'  'Binoculars'  'Radio'
//    'Truck'  'Tractor'  'Ambulance'  'Police Car'  'Jeep'  'Van'  'Bus'  'Campervan'  'Bike'   (vehicles)
//                                                an item card (the names in ITEMS, data.js)
//    'Endless Water'  'Endless Double Food'  …   put Endless in front of any result and it
//                                                never runs out (shown with ∞)
//    'Food + Water'  'Pistol + Ammo'  …          a mix: you get every part, each rolled on its own
//                                                (at most one item; no Zombies in a mix)
//
//  Scouting reveals a random location from this list (not the start tile),
//  so a location with count: 3 is three times as common as one without. (A belt or range only
//  counts its first hex — the rest of the shape comes on top, so their counts are kept low.)

// Themed: each place leans on what you'd really find there. A resource row gives 1d6; a Double
// (one per place at most, where it's richest) gives 1d6 × 2; a mix gives each part.
const LOCATIONS = [
  { name: 'Farmhouse',      icon: '🏚️', safety: 5, start: true,
    table: ['Zombies',       'Food',           'Food + Water',   'Water',          'Axe',            'Tractor + Fuel'] },

  // food & water
  { name: 'YOLO Foods',     icon: '🛒', safety: 4, table: ['Zombies',       'Food',           'Double Food',    'Food + Water',   'Van',            'Booze'] },
  { name: 'Lake',           icon: '🏞️', safety: 0, table: ['Zombies',       'Endless Water',  'Double Water',   'Water',          'Food',           'Fuel'] },
  { name: 'Forest',         icon: '🌲', safety: 0, table: ['Zombies',       'Food',           'Double Food',    'Food + Water',   'Water',          'Axe'] },
  { name: 'Church',         icon: '⛪', safety: 7, table: ['Zombies',       'Food',           'Food + Water',   'Water',          'Water',          'Food'] },
  { name: 'School',         icon: '🏫', safety: 6, table: ['Zombies',       'Food + Water',   'Food',           'Double Food',    'Bus',            'Bike'] },
  // booze
  { name: 'Pub',            icon: '🍺', safety: 5, table: ['Zombies',       'Booze',          'Double Booze',   'Food + Booze',   'Water',          'Food'] },
  // medicine
  { name: 'Hospital',       icon: '🏥', safety: 6, table: ['Zombies',       'Ambulance',      'Pills',          'Food + Water',   'Double Water',   'Food'] },
  { name: 'Pharmacy',       icon: '💊', safety: 3, table: ['Zombies',       'Pills',          'Pills',          'Water',          'Food + Water',   'Food'] },
  // weapons
  { name: 'Police Station', icon: '👮', safety: 8, table: ['Zombies',       'Pistol',         'Pistol + Ammo',  'Ammo',           'Police Car',     'Body Armor'] },
  { name: 'Gun Shop',       icon: '🎯', safety: 6, table: ['Zombies',       'Pistol',         'Pistol + Ammo',  'Ammo',           'Double Ammo',    'Body Armor'] },
  { name: 'Army Checkpoint', icon: '🪖', safety: 7, table: ['Zombies',       'Binoculars',     'Pistol + Ammo',  'Fuel + Ammo',    'Double Ammo',    'Jeep'] },
  // tools & travel
  { name: 'Hardware Store', icon: '🔨', safety: 5, table: ['Zombies',       'Tool',           'Tool + Fuel',    'Axe',            'Axe',            'Fuel'] },
  { name: 'Petrol Station', icon: '⛽', safety: 3, table: ['Zombies',       'Fuel',           'Double Fuel',    'Food + Booze',   'Tool',           'Truck + Fuel'] },
  { name: 'Campsite',       icon: '⛺', safety: 0, table: ['Zombies',       'Food + Water',   'Fuel + Ammo',    'Booze',          'Campervan',      'Bike'] },

  // Wasteland: nothing to find and nowhere to hide. Comes in belts (a triangle of 3 or a cluster of 7).
  { name: 'Wasteland',      icon: '🏜️', safety: 0, count: 1.2, spread: 'belt' },
  // Mountain: impassable wasteland — it blocks the way. Comes in ranges: chains with gaps to get through.
  { name: 'Mountain',       icon: '⛰️', safety: 0, passable: false, count: 0.9, spread: 'range' },
];
