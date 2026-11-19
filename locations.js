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
//    count  — (optional) how common it is alone in the countryside when scouting (default 1, or 0 for a
//             place with `in`; fractions like 0.5 are fine).
//    in     — (optional) the settlements it's built in: any of 'village', 'town', 'city'. Settlements are
//             planned whole as you find them (CONFIG.settlements in data.js): a village of 3 hexes, a town
//             of 7, a city of about 12, each a different place from its list. With count: 0 (the default
//             when `in` is given) it's only ever found in one.
//    edge   — (optional) open land planned along the outside of new settlements, e.g. { village: 1, town: 1.5 }:
//             how many stretches (CONFIG.edgeChain hexes, running along the edge) each one of that kind gets —
//             a fraction is a chance of one more. Not found anywhere else (unless it has a count too).
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
//    'Pistol'  'Bow'                             (guns: fire ammo)
//    'Axe'  'Sword'  'Kitchen Knife'  'Frying Pan'  'Cricket Bat'  'Hockey Stick'  'Pickaxe'  'Wrench'   (melee: AP)
//    'Chainsaw'  'Body Armor'  'Tool'  'Pills'  'Binoculars'  'Radio'
//    'Truck'  'Tractor'  'Ambulance'  'Police Car'  'Jeep'  'Van'  'Bus'  'Campervan'  'Fire Engine'
//    'Bike'  'Horse'                             (vehicles)
//                                                an item card (the names in ITEMS, data.js)
//    'Endless Water'  'Endless Double Food'  …   put Endless in front of any result and it
//                                                never runs out (shown with ∞)
//    'Food + Water'  'Pistol + Ammo'  …          a mix: you get every part, each rolled on its own
//                                                (at most one item; no Zombies in a mix)
//
//  Scouting reveals a random place for the countryside (by count, never the start tile) — or the first hex
//  of a new village, town or city, whose other hexes are planned at once and appear as they're revealed.
//  (A belt or range only counts its first hex — the rest of the shape comes on top, so their counts are kept low.)

// Themed: each place leans on what you'd really find there. A resource row gives 1d6; a Double
// (one per place at most, where it's richest) gives 1d6 × 2; a mix gives each part.
const LOCATIONS = [
  { name: 'Farmhouse',      icon: '🏚️', safety: 5, start: true,
    table: ['Zombies',       'Food',           'Food + Water',   'Water',          'Axe',            'Tractor + Fuel'] },

  // ---- countryside: found alone, by count
  { name: 'Forest',         icon: '🌲', safety: 0, table: ['Zombies',       'Food',           'Double Food',    'Food + Water',   'Water',          'Axe'] },
  { name: 'Lake',           icon: '🏞️', safety: 0, table: ['Zombies',       'Endless Water',  'Double Water',   'Water',          'Food',           'Fuel'] },
  { name: 'Campsite',       icon: '⛺', safety: 0, table: ['Zombies',       'Food + Water',   'Fuel + Ammo',    'Bow',            'Campervan',      'Bike'] },
  { name: 'Farm',           icon: '🐄', safety: 4, table: ['Zombies',       'Food',           'Double Food',    'Food + Water',   'Water',          'Tractor'] },
  { name: 'Orchard',        icon: '🍎', safety: 0, table: ['Zombies',       'Food',           'Double Food',    'Food + Booze',   'Booze',          'Water'] },
  { name: 'Cottage',        icon: '🏡', safety: 4, count: 0.6, in: ['village'],
    table: ['Zombies',       'Food',           'Water',          'Booze',          'Food + Water',   'Axe'] },
  { name: 'Hut',            icon: '🛖', safety: 2, count: 0.6, table: ['Zombies', 'Food + Water', 'Water',          'Food',           'Booze',          'Axe'] },
  { name: 'Fishing Spot',   icon: '🎣', safety: 0, count: 0.7, table: ['Zombies', 'Food',       'Double Food',    'Food + Water',   'Water',          'Booze'] },
  { name: 'Stables',        icon: '🐎', safety: 3, count: 0.6, table: ['Zombies', 'Food',       'Water',          'Food + Water',   'Axe',            'Horse'] },
  { name: 'Quarry',         icon: '⛏️', safety: 0, count: 0.6, table: ['Zombies', 'Tool',       'Fuel',           'Double Fuel',    'Pickaxe',        'Chainsaw'] },
  // the best walls around, and almost nothing to find: somewhere to reach before nightfall
  { name: 'Castle',         icon: '🏰', safety: 8, count: 0.3, table: ['Zombies', 'Water',      'Food',           'Bow + Ammo',     'Sword',          'Body Armor'] },
  // mostly zombies
  { name: 'Graveyard',      icon: '🪦', safety: 0, count: 0.5, table: ['Zombies', 'Zombies',    'Zombies',        'Booze',          'Tool',           'Axe'] },
  // roadside: alone in the country (the Petrol Station is also built in towns)
  { name: 'Petrol Station', icon: '⛽', safety: 3, count: 0.5, in: ['town'],
    table: ['Zombies',       'Fuel',           'Double Fuel',    'Food + Booze',   'Tool',           'Truck + Fuel'] },
  { name: 'Army Checkpoint', icon: '🪖', safety: 7, count: 0.4, table: ['Zombies', 'Binoculars', 'Pistol + Ammo',  'Fuel + Ammo',    'Double Ammo',    'Jeep'] },
  { name: 'Diner',          icon: '🍔', safety: 3, count: 0.5, table: ['Zombies', 'Food',       'Double Food',    'Food + Booze',   'Frying Pan',     'Food + Water'] },
  { name: 'Fuel Depot',     icon: '🛢️', safety: 3, count: 0.3, table: ['Zombies', 'Fuel',       'Double Fuel',    'Fuel + Ammo',    'Tool',           'Truck + Fuel'] },

  // ---- villages (and bigger)
  { name: 'Church',         icon: '⛪', safety: 7, in: ['village', 'town', 'city'],
    table: ['Zombies',       'Food',           'Food + Water',   'Water',          'Water',          'Food'] },
  { name: 'Pub',            icon: '🍺', safety: 5, in: ['village', 'town', 'city'],
    table: ['Zombies',       'Booze',          'Double Booze',   'Food + Booze',   'Water',          'Cricket Bat'] },
  { name: 'Corner Shop',    icon: '🏪', safety: 3, in: ['village', 'town', 'city'],
    table: ['Zombies',       'Food',           'Water',          'Booze',          'Food + Water',   'Kitchen Knife'] },
  { name: 'Post Office',    icon: '🏤', safety: 4, in: ['village', 'town', 'city'],
    table: ['Zombies',       'Food + Water',   'Booze',          'Tool',           'Pills',          'Bike'] },

  // ---- towns (and cities)
  { name: 'YOLO Foods',     icon: '🛒', safety: 4, in: ['town', 'city'],
    table: ['Zombies',       'Food',           'Double Food',    'Food + Water',   'Van',            'Booze'] },
  { name: 'Café',           icon: '☕', safety: 3, in: ['town', 'city'],
    table: ['Zombies',       'Food',           'Water',          'Food + Water',   'Double Water',   'Frying Pan'] },
  { name: 'Hotel',          icon: '🏨', safety: 6, in: ['town', 'city'],
    table: ['Zombies',       'Kitchen Knife',           'Water',          'Booze',          'Double Booze',   'Food + Water'] },
  { name: 'School',         icon: '🏫', safety: 6, in: ['town', 'city'],
    table: ['Zombies',       'Food + Water',   'Cricket Bat',    'Double Food',    'Bus',            'Bike'] },
  { name: 'Library',        icon: '📚', safety: 6, in: ['town', 'city'],
    table: ['Zombies',       'Binoculars',     'Food',           'Water',          'Food + Water',   'Booze'] },
  { name: 'Pharmacy',       icon: '💊', safety: 3, in: ['town', 'city'],
    table: ['Zombies',       'Pills',          'Pills',          'Water',          'Food + Water',   'Food'] },
  { name: 'Hardware Store', icon: '🔨', safety: 5, in: ['town', 'city'],
    table: ['Zombies',       'Tool',           'Tool + Fuel',    'Axe',            'Chainsaw',       'Fuel'] },
  { name: 'Garage',         icon: '🔧', safety: 5, in: ['town', 'city'],
    table: ['Zombies',       'Tool',           'Fuel',           'Double Fuel',    'Wrench',    'Truck'] },
  { name: 'Fire Station',   icon: '🚒', safety: 7, in: ['town', 'city'],
    table: ['Zombies',       'Axe',            'Chainsaw',       'Body Armor',     'Double Water',   'Fire Engine'] },
  // guns are a town thing: cities have only the Police Station
  { name: 'Gun Shop',       icon: '🎯', safety: 6, in: ['town'],
    table: ['Zombies',       'Pistol',         'Pistol + Ammo',  'Ammo',           'Double Ammo',    'Body Armor'] },
  { name: "Sheriff's Office", icon: '🤠', safety: 7, in: ['town'],
    table: ['Zombies',       'Pistol',         'Pistol + Ammo',  'Ammo',           'Body Armor',     'Police Car'] },

  // ---- cities only
  { name: 'Hospital',       icon: '🏥', safety: 6, in: ['city'],
    table: ['Zombies',       'Ambulance',      'Pills',          'Food + Water',   'Double Water',   'Food'] },
  { name: 'Police Station', icon: '👮', safety: 8, in: ['city'],
    table: ['Zombies',       'Zombies',        'Pistol',         'Ammo',           'Body Armor',     'Police Car'] },
  { name: 'Shopping Mall',  icon: '🏬', safety: 5, in: ['city'],
    table: ['Zombies',       'Zombies',        'Double Food',    'Double Water',   'Double Booze',   'Food + Water'] },
  { name: 'Train Station',  icon: '🚉', safety: 4, in: ['city'],
    table: ['Zombies',       'Zombies',        'Food',           'Ammo',           'Food + Water',   'Booze'] },
  { name: 'Stadium',        icon: '🏟️', safety: 6, in: ['city'],
    table: ['Zombies',       'Zombies',        'Zombies',        'Double Ammo',    'Hockey Stick',    'Jeep'] },
  { name: 'Car Park',       icon: '🅿️', safety: 2, in: ['city'],
    table: ['Zombies',       'Fuel',           'Double Fuel',    'Van',            'Jeep',           'Truck + Fuel'] },
  // a vault: the strongest walls in the city, and nothing worth taking
  { name: 'Bank',           icon: '🏦', safety: 8, in: ['city'] },

  // ---- settlement edges: open land planned around the outside of a settlement as it's founded, in short chains
  // along its edge or on their own (edge: how many per settlement of each kind — 1.5 = one, and half the time two)
  { name: 'Fields',         icon: '🌾', safety: 0, edge: { village: 1, town: 1.5 } },
  { name: 'Golf Course',    icon: '⛳', safety: 0, edge: { town: 0.4, city: 0.8 } },

  // Wasteland: nothing to find and nowhere to hide. Comes in belts (a triangle of 3 or a cluster of 7).
  { name: 'Wasteland',      icon: '🏜️', safety: 0, count: 1.2, spread: 'belt' },
  // Mountain: impassable wasteland — it blocks the way. Comes in ranges: chains with gaps to get through.
  { name: 'Mountain',       icon: '⛰️', safety: 0, passable: false, count: 0.9, spread: 'range' },
];
