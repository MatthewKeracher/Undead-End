// =====================================================================
//  GAME DATA — edit freely. Rules numbers live in CONFIG, tiles below.
// =====================================================================

const CONFIG = {
  startDay: 1,
  startRound: 2,          // 1 = first night round; 2 = first morning
  maxAP: 12,              // highest max AP can grow to
  trackGain: 1,           // max AP gained per food / water check paid
  trackLoss: 2,           // max AP lost per food / water check missed (0 = death)
  startMaxAP: 6,          // max AP at the start (grows to 12 with food & water)
  startRes: { food: 0, water: 0, hope: 0, fuel: 0, ammo: 0 },   // AP, food, water, hope are rolled 1d6 at start
  startSafety: 0,         // Safety on the starting tile
  maxSafety: 6,           // most Safety any tile can hold
  maxItems: 6,            // backpack size
  maxCondition: 6,        // most condition any item can have

  // TESTING: items every new game starts with in the backpack (full condition). Set to [] to turn off.
  testStartItems: [],
  testStartVehicles: [],   // parked on the start tile
  testStartRes: {},        // added to the starting rolls
  nightRounds: [1, 6],

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

// Scavenge table helpers
const Z = (n = 1) => ({ zombies: n });     // zombies
const R = (res, n = 1) => ({ res, n });   // resource: food, water, hope, fuel, ammo
const I = (item) => ({ item });           // item card (condition rolled 1d6 when found)

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

// Each tile has a d6 table: entries are results 1–6. Result 1 is always zombies (and for now, only 1).
const START_TILE = {
  name: 'Farmhouse', icon: '🏚️',
  table: [Z(), R('food'), R('water'), R('food', 2), I('Axe'), I('Truck')],
};

const TILES = [
  { name: 'Supermarket',    icon: '🛒', table: [Z(), R('water'), R('food', 2), R('water', 2), R('food'), R('hope')] },
  { name: 'Petrol Station', icon: '⛽', table: [Z(), R('fuel', 2), I('Toolkit'), I('Truck'), R('water'), R('fuel')] },
  { name: 'Hospital',       icon: '🏥', table: [Z(), R('water'), R('hope'), R('water'), R('hope', 2), R('food')] },
  { name: 'Police Station', icon: '🚓', table: [Z(), R('ammo'), R('ammo', 3), I('Handgun'), R('ammo', 2), I('Body Armor')] },
  { name: 'Hardware Store', icon: '🔨', table: [Z(), I('Toolkit'), I('Axe'), R('ammo'), R('water'), I('Handgun')] },
  { name: 'School',         icon: '🏫', table: [Z(), R('food'), R('food'), R('water'), R('hope', 2), I('Bike')] },
  { name: 'Church',         icon: '⛪', table: [Z(), R('hope', 2), R('hope'), R('water'), R('food'), R('water')] },
  { name: 'Pharmacy',       icon: '💊', table: [Z(), R('water'), R('hope'), R('water', 2), R('food'), R('hope')] },
  { name: 'Gun Shop',       icon: '🎯', table: [Z(), R('ammo'), R('ammo', 2), R('ammo', 3), I('Handgun'), I('Body Armor')] },
  { name: 'Forest',         icon: '🌲', table: [Z(), R('food'), R('water'), I('Axe'), R('food'), R('hope')] },
  { name: 'Lake',           icon: '🏞️', table: [Z(), R('water', 2), R('water', 2), R('food'), R('hope'), R('water')] },
  { name: 'Pub',            icon: '🍺', table: [Z(), R('food'), R('hope', 2), R('hope'), R('food'), R('water')] },
  { name: 'Campsite',       icon: '⛺', table: [Z(), R('fuel'), R('food'), R('water'), I('Bike'), I('Toolkit')] },
];
