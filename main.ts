// DUSTLINE — Kestrel Depot: the hand-in program for threejs-fps-02.
// The game itself is the game/ folder beside this file: plain static files
// the browser loads as ES modules, with three.js 0.187.0 vendored under
// game/vendor/three/ and named by the import map in game/index.html.
// This program's one job is to hand that game in: it copies game/ and
// screenshots/ into the output directory and writes dossier.json there
// with buildDossier from the kit's library (vendor/makefun-threejs.ts,
// untouched), which is the exact summary the sealed gate re-derives and
// compares byte for byte.
//
// Run it the way the grader does, with the output directory standing in
// for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game locally with:  node serve.ts   (http://localhost:8080)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps are the scorer's own: at most 4 screenshots of 256 KiB each,
// at most 993 files and 48 MiB under game/, and the dossier's source text
// capped at 160 KiB. Passing tighter caps than these would refuse a game
// the scorer itself would accept, so they are set to match it exactly.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(out, 'dossier.json'), dossier);
