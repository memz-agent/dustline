// The armoury: every weapon and buyable item in DUSTLINE, as data. Combat code
// reads these numbers and nothing else, so balance lives in exactly one table.
// Damage is per pellet at point blank; combat.js applies the part multiplier
// (head 4x, torso 1x, legs 0.75x), armour and the range falloff between
// falloffStart and falloffEnd, below which a hit keeps minDamageScale.
export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', slot: 'sidearm', price: 0,
    damage: 34, rpm: 340, automatic: false, mag: 12, reserve: 60,
    reloadTime: 1.5, spreadStill: 0.006, spreadMove: 0.035, bloomPerShot: 0.006, bloomDecay: 0.05,
    recoilPitch: 0.011, falloffStart: 12, falloffEnd: 34, minDamageScale: 0.5,
    moveFactor: 1.0, tracer: '#ffd9a0',
  },
  wasp: {
    id: 'wasp', name: 'VK-9 Wasp', slot: 'primary', price: 1000,
    damage: 26, rpm: 780, automatic: true, mag: 30, reserve: 90,
    reloadTime: 1.9, spreadStill: 0.009, spreadMove: 0.045, bloomPerShot: 0.008, bloomDecay: 0.07,
    recoilPitch: 0.008, falloffStart: 10, falloffEnd: 26, minDamageScale: 0.45,
    moveFactor: 0.99, tracer: '#ffe9b8',
  },
  kestrel: {
    id: 'kestrel', name: 'AR-7 Kestrel', slot: 'primary', price: 2500,
    damage: 33, rpm: 640, automatic: true, mag: 30, reserve: 90,
    reloadTime: 2.2, spreadStill: 0.004, spreadMove: 0.038, bloomPerShot: 0.007, bloomDecay: 0.06,
    recoilPitch: 0.012, falloffStart: 18, falloffEnd: 46, minDamageScale: 0.6,
    moveFactor: 0.97, tracer: '#fff3cf',
  },
  longshot: {
    id: 'longshot', name: 'Longshot-12', slot: 'primary', price: 3200,
    damage: 92, rpm: 68, automatic: false, mag: 5, reserve: 25,
    reloadTime: 2.6, spreadStill: 0.0008, spreadMove: 0.06, bloomPerShot: 0.02, bloomDecay: 0.03,
    recoilPitch: 0.045, falloffStart: 30, falloffEnd: 70, minDamageScale: 0.8,
    moveFactor: 0.93, tracer: '#cfe8ff',
  },
};

// The buy menu, in key order. Keys 1-6 during the buy phase buy the row.
export const BUY_MENU = [
  { key: '1', kind: 'weapon', id: 'wasp', label: 'VK-9 Wasp SMG' },
  { key: '2', kind: 'weapon', id: 'kestrel', label: 'AR-7 Kestrel Rifle' },
  { key: '3', kind: 'weapon', id: 'longshot', label: 'Longshot-12 DMR' },
  { key: '4', kind: 'armor', id: 'vest', label: 'Kevlar Vest', price: 650 },
  { key: '5', kind: 'armor', id: 'vestHelmet', label: 'Vest + Helmet', price: 1000 },
  { key: '6', kind: 'grenade', id: 'shard', label: 'Shard Grenade', price: 300 },
];

export const GRENADE = {
  maxCarry: 2,
  fuseSeconds: 1.5,
  radius: 5.2,
  maxDamage: 118,
  throwSpeed: 15,
};

export function weaponPrice(row) {
  if (row.kind === 'weapon') return WEAPONS[row.id].price;
  return row.price;
}
