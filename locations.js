// =====================================================================
//  LOCATIONS — edit freely. Every tile the game can place comes from here.
// =====================================================================
//
//  Each location has:
//    name   — shown on the hex
//    icon   — an emoji
//    img    — (optional) a picture to show instead, e.g. 'assets/barn.png' (the emoji stays for the log)
//    table  — its d6 scavenge table: exactly 6 results, for rolls 1 to 6.
//             Roll 1 is always 'Zombies', and roll 3 is always 'Random'. Every row is used up once found — zombies
//             too, though they come back once a tile has no Safety and nobody on it.
//             Leave it out for a tile with nothing
//             to scavenge (Scavenge is blocked there).
//    passable — (optional) false for a tile nobody can enter: no moving, fleeing
//             or driving onto or through it. It still gets revealed by scouting.
//    safety — (optional) the most Safety it can be fortified to: 0 for outdoors (can't be
//             fortified), or 3 to 6 — 6 for a real stronghold. Default 5 (CONFIG.maxSafety).
//    count  — (optional) how common it is alone in the countryside when scouting (default 1, or 0 for a
//             place with `in`; fractions like 0.5 are fine).
//    in     — (optional) the settlements it's built in: any of 'village', 'town', 'city'. Settlements are
//             planned whole as you find them (CONFIG.settlements in data.js): a village of 3 hexes, a town
//             of 7, a city of about 12, each a different place from its list. With count: 0 (the default
//             when `in` is given) it's only ever found in one.
//    edge   — (optional) land planned along the outside of new settlements, e.g. { village: 1, town: 1.5 }:
//             how many stretches (CONFIG.edgeChain hexes, running along the edge) each one of that kind gets —
//             a fraction is a chance of one more. Not found anywhere else (unless it has a count too). A place
//             with `around` (a Farmhouse) comes one at a time, its own milieu round it.
//    group  — (optional) edge places in the same group are laid together, mixed in the same stretches — e.g.
//             'suburbs': Cottages, Corner Shops and Golf Courses clumped round towns and cities. Each group's
//             stretches add up its places' edge numbers; each hex is one of them (the bigger number, the likelier).
//    spread — (optional) 'belt' or 'range': a fresh one grows into a shape on the hexes around it
//             as they're revealed — a belt is a triangle of 3 or a cluster of 7; a range is a
//             chain running off both ways, with gaps (CONFIG.beltBig, rangeArm, rangeGap, rangeTurn).
//    with   — (optional) for a belt or range: places that come with its shape, on a hex beside it, e.g.
//             { Quarry: 0.6 } — how many (a fraction is a chance of one more). Industry by the mountains.
//    around — (optional) the places that come with it, planned on its unexplored neighbours as it's revealed,
//             running round it side by side: { Barn: 1, Fields: [2, 4] } — how many of each (a [min, max] is a
//             random number between; a fraction, a chance of one more; 'rest', last, for every neighbour still
//             free). A place in a settlement gets its own planned as the settlement is founded. Where there's no room,
//             fewer. A place that's only ever found around another can have count: 0.
//
//  Results you can write in a table (capitals don't matter):
//    'Zombies'                                   1d6 zombies arrive
//    'Empty'                                     nothing there: shown blank, and rolled again like a looted row
//    'Random'                                    anything at all: as each tile is placed, this row is given a
//                                                result picked at random from every place's table — zombies,
//                                                Doubles and mixes included (always row 3)
//    'Food'  'Water'  'Fuel'  'Ammo'             gain 1d6 of it (CONFIG.lootDice in data.js)
//    'Double Food'  'Triple Ammo'  …             1d6 × 2 (Double), × 3 (Triple), × 4 (Quadruple) — use sparingly
//    'Pistol'  'Shotgun'                         (guns: fire ammo — the Shotgun kills up to 3 a shot)
//    'Axe'  'Sword'  'Kitchen Knife'  'Frying Pan'  'Cricket Bat'  'Hockey Stick'  'Pickaxe'   (melee: AP)
//    'Chainsaw'  'Body Armor'  'Tool'  'Pills'  'Binoculars'  'Radio'
//    'Truck'  'Tractor'  'Ambulance'  'Police Car'  'Jeep'  'Van'  'Bus'  'Campervan'  'Fire Engine'
//    'Bike'  'Horse'                             (vehicles)
//    'Booze'  'Pills'                            (hope: purple on the table; they also give AP. A Note — hope that shows
//                                                the way — isn't found in tables: you start with one)
//                                                an item card (the names in ITEMS, data.js)
//    'Endless Water'  'Endless Double Food'  …   put Endless in front of any result and it
//                                                never runs out (shown with ∞)
//    'Food + Water'  'Truck + Fuel'  …           a mix: you get every part, each rolled on its own
//                                                (at most one item; no Zombies in a mix)
//
//  Scouting reveals a random place for the countryside (by count) — or the first hex
//  of a new village, town or city, whose other hexes are planned at once and appear as they're revealed.
//  (A belt or range only counts its first hex — the rest of the shape comes on top, so their counts are kept low.)

// Themed: rows 2, 4, 5 and 6 are what you'd really find at each place (row 1 is Zombies, row 3 is drawn at random
// as the tile is placed). A resource row gives 1d6; a Double (where a place is richest) gives 1d6 × 2; a mix gives each part.
const LOCATIONS = [
  // a farm: the Farmhouse, with its Barn, Fields and maybe an Orchard round it (its count is low: each farm covers 4–7
  // hexes) — out in the country, or at a village's edge
  { name: 'Farmhouse',      icon: '🏚️', safety: 4, count: 0.5, edge: { village: 0.5 }, around: { Barn: 1, Fields: [2, 4], Orchard: [0, 1] },
    table: ['Zombies',       'Food + Water',  'Random',        'Ammo',          'Axe',           'Tractor + Fuel'] },

  // ---- countryside: found alone, by count
  { name: 'Forest',         icon: '🌲', safety: 0, count: 1, edge: { village: 0.8 }, table: ['Zombies',       'Food',          'Random',        'Double Food',   'Water',         'Axe'] },
  { name: 'Lake',           icon: '🏞️', safety: 0, count: 1, edge: { village: 0.4 }, table: ['Zombies',       'Endless Water', 'Random',        'Double Water',  'Water',         'Food'] },
  { name: 'Campsite',       icon: '⛺', safety: 0, table: ['Zombies',       'Food + Water',  'Random',        'Ammo',          'Campervan',     'Bike'] },
  { name: 'Orchard',        icon: '🍎', safety: 0, count: 0, edge: { village: 0.6 }, table: ['Zombies',       'Food',          'Random',        'Double Food',   'Food + Booze',  'Booze'] },
  { name: 'Cottage',        icon: '🏡', safety: 4, edge: { town: 1.5, city: 2.5 }, group: 'suburbs',
    table: ['Zombies',       'Food',          'Random',        'Food + Water',  'Kitchen Knife', 'Booze'] },
  { name: 'Fishing Spot',   icon: '🎣', safety: 0, count: 0.7, table: ['Zombies',       'Food',          'Random',        'Double Food',   'Water',         'Food + Water'] },
  { name: 'Barn',           icon: '🛖', img: 'assets/barn.png', safety: 3, count: 0, table: ['Zombies',       'Water',         'Random',        'Food + Water',  'Double Food',   'Horse'] },
  { name: 'Quarry',         icon: '⛏️', safety: 0, count: 0, table: ['Zombies',       'Pickaxe',       'Random',        'Tool',          'Water',         'Tool + Fuel'] },
  // the best walls around, and almost nothing to find: somewhere to reach before nightfall
  // a castle stands alone in the wilds: a Mountain or two, a Lake with a Fishing Spot on its shore, an Orchard, Forest all round
  { name: 'Castle',         icon: '🏰', safety: 6, count: 0.3, around: { Mountain: [0, 2], Lake: [0, 1], 'Fishing Spot': [0, 1], Orchard: [0, 1], Forest: 'rest' }, table: ['Zombies',       'Sword',         'Random',        'Ammo',          'Body Armor',    'Booze'] },
  // mostly zombies
  { name: 'Graveyard',      icon: '🪦', safety: 0, in: ['village', 'town', 'city'], table: ['Zombies',       'Zombies',       'Random',        'Pickaxe',       'Tool',          'Ammo'] },
  // roadside: alone in the country (the Petrol Station is also built in towns)
  { name: 'Petrol Station', icon: '⛽', safety: 3, count: 0.5, in: ['town'],
    table: ['Zombies',       'Fuel',          'Random',        'Fuel + Water',  'Food + Booze',  'Truck + Fuel'] },
  { name: 'Army Checkpoint', icon: '🪖', safety: 6, count: 0.4, table: ['Zombies',       'Pistol',        'Random',        'Ammo + Water',  'Binoculars',    'Jeep'] },
  { name: 'Diner',          icon: '🍔', safety: 3, count: 0.5, table: ['Zombies',       'Water',         'Random',        'Double Food',   'Food + Water',  'Frying Pan'] },
  // (now and then a Helipad beside it — and beside a city's Hospital)
  { name: 'Fuel Depot',     icon: '🛢️', safety: 3, count: 0, around: { Helipad: 0.25 }, table: ['Zombies',       'Fuel',          'Random',        'Double Fuel',   'Tool + Fuel',   'Truck + Fuel'] },

  // ---- villages (and bigger)
  { name: 'Church',         icon: '⛪', safety: 6, in: ['village', 'town', 'city'],
    table: ['Zombies',       'Food',          'Random',        'Water',         'Food + Water',  'Ammo'] },
  { name: 'Pub',            icon: '🍺', safety: 4, in: ['village', 'town', 'city'],
    table: ['Zombies',       'Booze',         'Random',        'Food + Water',  'Food + Booze',  'Cricket Bat'] },
  { name: 'Corner Shop',    icon: '🏪', safety: 3, in: ['village', 'town', 'city'], edge: { town: 0.6, city: 1 }, group: 'suburbs',
    table: ['Zombies',       'Food',          'Random',        'Water',         'Booze',         'Food + Water'] },
  { name: 'Post Office',    icon: '🏤', safety: 4, in: ['village', 'town', 'city'],
    table: ['Zombies',       'Tool',          'Random',        'Ammo',          'Binoculars',    'Bike'] },

  // ---- towns (and cities)
  { name: 'YOLO Foods',     icon: '🛒', safety: 4, in: ['town', 'city'],
    table: ['Zombies',       'Double Food',   'Random',        'Food + Water',  'Booze',         'Van'] },
  { name: 'Café',           icon: '☕', safety: 3, in: ['town', 'city'],
    table: ['Zombies',       'Food',          'Random',        'Water',         'Food + Water',  'Frying Pan'] },
  { name: 'Hotel',          icon: '🏨', safety: 5, in: ['town', 'city'],
    table: ['Zombies',       'Food',          'Random',        'Water',         'Booze',         'Kitchen Knife'] },
  { name: 'School',         icon: '🏫', safety: 5, in: ['town', 'city'],
    table: ['Zombies',       'Food + Water',  'Random',        'Cricket Bat',   'Hockey Stick',  'Bus'] },
  { name: 'Library',        icon: '📚', safety: 5, in: ['town', 'city'],
    table: ['Zombies',       'Binoculars',    'Random',        'Ammo',          'Food',          'Food + Water'] },
  { name: 'Pharmacy',       icon: '💊', safety: 3, in: ['town', 'city'],
    table: ['Zombies',       'Pills',         'Random',        'Pills',         'Water',         'Food + Water'] },
  { name: 'Hardware Store', icon: '🔨', safety: 4, in: ['town', 'city'],
    table: ['Zombies',       'Water',         'Random',        'Axe',           'Chainsaw',      'Tool + Fuel'] },
  { name: 'Garage',         icon: '🔧', safety: 4, in: ['town', 'city'],
    table: ['Zombies',       'Tool',          'Random',        'Double Fuel',   'Water',         'Truck'] },
  { name: 'Fire Station',   icon: '🚒', safety: 6, in: ['town', 'city'],
    table: ['Zombies',       'Axe',           'Random',        'Chainsaw',      'Double Water',  'Fire Engine'] },
  // guns are a town thing: cities have only the Police Station
  { name: 'Gun Shop',       icon: '🎯', safety: 5, in: ['town'],
    table: ['Zombies',       'Shotgun',       'Random',        'Pistol',        'Double Ammo',   'Body Armor'] },
  { name: "Sheriff's Office", icon: '🤠', safety: 6, in: ['town'],
    table: ['Zombies',       'Pistol',        'Random',        'Shotgun',       'Body Armor',    'Police Car'] },

  // ---- cities only
  { name: 'Hospital',       icon: '🏥', safety: 5, in: ['city'], around: { Helipad: 0.3 },
    table: ['Zombies',       'Pills',         'Random',        'Pills',         'Food + Water',  'Ambulance'] },
  { name: 'Police Station', icon: '👮', safety: 6, in: ['city'],
    table: ['Zombies',       'Shotgun',       'Random',        'Ammo',          'Body Armor',    'Police Car'] },
  { name: 'Shopping Mall',  icon: '🏬', safety: 4, in: ['city'],
    table: ['Zombies',       'Double Food',   'Random',        'Double Water',  'Pills',         'Food + Water'] },
  { name: 'Train Station',  icon: '🚉', safety: 4, in: ['city'],
    table: ['Zombies',       'Zombies',       'Random',        'Food',          'Food + Water',  'Ammo'] },
  { name: 'Stadium',        icon: '🏟️', safety: 5, in: ['city'],
    table: ['Zombies',       'Zombies',       'Random',        'Double Water',  'Cricket Bat',   'Food + Booze'] },
  { name: 'Car Park',       icon: '🅿️', safety: 3, in: ['city'],
    table: ['Zombies',       'Fuel',          'Random',        'Van',           'Jeep',          'Truck + Fuel'] },
  // a vault: the strongest walls in the city, and nothing worth taking
  { name: 'Bank',           icon: '🏦', safety: 6, in: ['city'] },

  // ---- settlement edges: open land planned around the outside of a settlement as it's founded, in short chains
  // along its edge or on their own (edge: how many per settlement of each kind — 1.5 = one, and half the time two)
  // a landing pad, only ever beside a Fuel Depot or a Hospital (and not often): a Helicopter on it, maybe
  { name: 'Helipad',        icon: '🛬', safety: 0, count: 0, table: ['Zombies',       'Helicopter',    'Random',        'Tool',          'Fuel',          'Ammo'] },
  { name: 'Fields',         icon: '🌾', safety: 0, count: 0 },   // only ever round a farm
  { name: 'Golf Course',    icon: '⛳', safety: 0, edge: { town: 0.4, city: 0.8 }, group: 'suburbs' },

  // Wasteland: nothing to find and nowhere to hide. Comes in belts (a triangle of 3 or a cluster of 7).
  { name: 'Wasteland',      icon: '🏜️', safety: 0, count: 1.2, spread: 'belt', with: { 'Fuel Depot': 0.5 } },
  // Mountain: impassable wasteland — it blocks the way. Comes in ranges: chains with gaps to get through.
  { name: 'Mountain',       icon: '⛰️', safety: 0, passable: false, count: 0.9, spread: 'range', with: { Quarry: 0.6 } },
];
