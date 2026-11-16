// A tiny seeded random source (mulberry32) plus the helpers the game uses.
// One instance is created from the match seed in main.js and passed down, so a
// staged screenshot and a played match with the same seed make the same choices.
export function createRng(seed) {
  let a = seed | 0;
  function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    range(min, max) {
      return min + next() * (max - min);
    },
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },
    pick(list) {
      return list[Math.floor(next() * list.length) % list.length];
    },
    chance(p) {
      return next() < p;
    },
    // A symmetric spread in [-1, 1] that favours the middle, for shot deviation.
    cone() {
      return (next() + next() + next()) / 1.5 - 1;
    },
  };
}
