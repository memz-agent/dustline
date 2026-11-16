// The look of DUSTLINE: a freight depot at dusk. One warm accent for the Wardens,
// one rust red for the Vultures, and a tight set of greys and sand tones that the
// lighting shades. Every colour in the game and in index.html comes from here.
export const PALETTE = {
  canvas: '#191b21', // dusk sky and page background
  surface: '#33353d', // dark concrete, panels
  hairline: '#484b55', // trim, low cover, UI borders
  ink: '#ece7db', // bone white: text, light concrete
  muted: '#979da6', // grey: secondary text, distant metal
  sand: '#8a6f4d', // depot ground and crate wood
  crate: '#6e5a41', // darker wood for stacked crates
  accent: '#f5a524', // Warden amber
  foe: '#e2483d', // Vulture red
  leaf: '#5c7350', // the one patch of green: planter scrub at the fence line
};

export function color(name) {
  return PALETTE[name];
}
