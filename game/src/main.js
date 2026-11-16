// DUSTLINE — Kestrel Depot. Boot, the fixed-step loop, and every wire between
// the modules: the match owns the rules, the bots own their brains, combat
// owns the bullets, and this file owns the moments where they meet (a shot
// is fired, a soldier falls, the charge changes hands). Simulation steps at
// a fixed 60 Hz; rendering happens at the display's rate on top of it.
//
// ?shot=menu|buy|play|site|end with &seed=N stages a deterministic frame for
// a screenshot, renders it twice, then freezes and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createRng } from './rng.js';
import { createMap, SITES, SPAWNS } from './map.js';
import { createAudio } from './audio.js';
import { createFx } from './fx.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createPlayerWeapons } from './weapon.js';
import { createBots, resetBot, stepBot } from './bots.js';
import { createMatch, ROUND } from './match.js';
import { createHud } from './hud.js';
import { BUY_MENU, GRENADE, WEAPONS, weaponPrice } from './weapons.js';
import { createChargeMesh } from './actor.js';
import { dirFromYawPitch, explosionDamage, fireHitscan, deviate } from './combat.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;
const rng = createRng(seed * 7919 + 13);

// ---- Renderer, scene, camera ------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
window.__dustline = { scene, camera: null };
scene.background = new THREE.Color(0x2a2c33);
scene.fog = new THREE.Fog(new THREE.Color(0x2a2c33), 38, 100);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
camera.rotation.order = 'YXZ';
scene.add(camera);
window.__dustline.camera = camera;
window.__dustline.probeRay = (x, y, z, dx, dy, dz, maxDist = 40) => {
  const ray = new THREE.Raycaster(
    new THREE.Vector3(x, y, z),
    new THREE.Vector3(dx, dy, dz).normalize(),
    0,
    maxDist,
  );
  return ray.intersectObjects(scene.children, true).slice(0, 6).map((h) => ({
    d: +h.distance.toFixed(2),
    geo: h.object.geometry?.type ?? '?',
    scale: h.object.getWorldScale(new THREE.Vector3()).toArray().map((n) => +n.toFixed(2)),
    pos: h.object.getWorldPosition(new THREE.Vector3()).toArray().map((n) => +n.toFixed(2)),
  }));
};

// ---- World pieces -------------------------------------------------------
const map = createMap(scene);
const audio = createAudio();
const fx = createFx(scene);
const hud = createHud();
const player = createPlayer(map);
const body = player.state;
const bots = createBots(scene, rng);
const chargeMesh = createChargeMesh();
scene.add(chargeMesh.group);

const playerActor = {
  name: 'YOU', team: 'atk', isPlayer: true,
  pos: body.position, crouch: false, alive: true,
  hp: 100, armor: 0, helmet: false, money: ROUND.startMoney,
  kills: 0, deaths: 0, plantProgress: 0, speedNow: 0,
};
const actors = [playerActor, ...bots];
const stats = { shots: 0, hits: 0 };
let playerDied = false;
let shakeT = 0;
let shakeMag = 0;

const noise = [];
const world = {
  map,
  rng,
  time: 0,
  actors,
  noise,
  orders: null, // set to match.orders below
  emitNoise(x, z, radius, team) {
    noise.push({ x, z, radius, team, t: world.time });
    if (noise.length > 40) noise.shift();
  },
  fireFrom(shooter, origin, dir, def, spread, tracerFrom) {
    return fireFrom(shooter, origin, dir, def, spread, tracerFrom);
  },
};

// ---- Combat resolution --------------------------------------------------
const shotDir = new THREE.Vector3();
const tracerStart = new THREE.Vector3();
const explosionHits = [];

function killActor(victim, killer, part) {
  victim.alive = false;
  match.onKill(killer, victim);
  hud.killfeed(
    { name: killer ? killer.name : '—', team: killer ? killer.team : victim.team },
    { name: victim.name, team: victim.team },
    part,
  );
  if (victim.isPlayer) {
    playerDied = true;
    hud.showBanner('YOU ARE DOWN', 'Your team fights on', 'lose', 3000);
    audio.roundLose();
  }
}

function fireFrom(shooter, origin, dir, def, spread, tracerFrom) {
  const phase = match.state.phase;
  if (phase !== 'live' && phase !== 'planted') return null;
  deviate(dir, spread, rng, shotDir);
  const result = fireHitscan(map, actors, shooter, origin, shotDir, def);
  tracerStart.copy(tracerFrom ?? origin).addScaledVector(shotDir, 0.4);
  fx.tracer(tracerStart, result.point, def.tracer);
  const distToPlayer = Math.hypot(origin.x - body.position.x, origin.z - body.position.z);
  audio.shot(def.id, shooter.isPlayer ? 0 : distToPlayer);
  world.emitNoise(shooter.pos.x, shooter.pos.z, 27, shooter.team);
  if (shooter.isPlayer) {
    stats.shots += 1;
    player.recoil(def.recoilPitch * (0.8 + rng.next() * 0.5), (rng.next() - 0.5) * def.recoilPitch * 0.7);
  }
  if (result.kind === 'world') {
    fx.burst(result.point, 5, PALETTE.muted, 2.2, 1.2);
  } else if (result.kind === 'actor') {
    fx.burst(result.point, 8, '#c8452c', 2.4, 1.3);
    if (shooter.isPlayer) {
      stats.hits += 1;
      hud.hitMarker(result.killed);
      audio.hit(result.killed);
    }
    if (result.actor.isPlayer) {
      hud.hurtFlash(result.killed ? 1 : 0.65);
      audio.hurt();
      const yawTo = Math.atan2(-(shooter.pos.x - body.position.x), -(shooter.pos.z - body.position.z));
      let rel = yawTo - body.yaw;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      hud.damageFrom(-rel * 180 / Math.PI);
      shakeT = Math.max(shakeT, 0.18);
      shakeMag = Math.max(shakeMag, 0.006);
    }
    if (result.killed && result.actor.alive) killActor(result.actor, shooter, result.part);
  }
  return result;
}

// ---- The player's weapons ----------------------------------------------
const eyePos = new THREE.Vector3();
const aimDir = new THREE.Vector3();
const weapons = createPlayerWeapons(camera, {
  shoot(def, spread, muzzleTip) {
    eyePos.set(body.position.x, body.position.y + body.eye, body.position.z);
    dirFromYawPitch(body.yaw, body.pitch, aimDir);
    fireFrom(playerActor, eyePos, aimDir, def, spread, muzzleTip);
  },
  dryFire() {
    audio.dryFire();
  },
  reloadStart() {
    audio.reloadStart();
  },
  reloadEnd() {
    audio.reloadEnd();
  },
  ammoChanged() {},
  grenadeExplode(pos) {
    fx.explosion(pos);
    const dist = Math.hypot(pos.x - body.position.x, pos.z - body.position.z);
    audio.grenadeBoom(dist);
    if (dist < 9) {
      shakeT = Math.max(shakeT, 0.3);
      shakeMag = Math.max(shakeMag, 0.01 * (1 - dist / 9));
    }
    explosionDamage(map, actors, pos, GRENADE.radius, GRENADE.maxDamage, explosionHits);
    for (const hit of explosionHits) {
      if (hit.killed && hit.actor.alive) killActor(hit.actor, playerActor, 'grenade');
      else if (hit.actor.isPlayer) hud.hurtFlash(0.8);
    }
  },
});

// ---- Match wiring ---------------------------------------------------------
const matchEvents = {
  roundStart() {
    respawnAll();
  },
  needsRespawn() {},
  liveStart() {},
  roundEnd(winner, reason) {
    const won = winner === 'atk';
    hud.showBanner(won ? 'ROUND WON' : 'ROUND LOST', reason, won ? 'win' : 'lose', 3400);
    if (playerActor.alive) {
      if (won) audio.roundWin();
      else audio.roundLose();
    }
  },
  matchEnd() {},
  planted(siteId) {
    hud.showBanner('CHARGE PLANTED', `Site ${siteId} — defend it`, 'win', 2400);
    audio.plantBeep(true);
  },
  defused() {},
  detonated(x, z) {
    fx.explosion(new THREE.Vector3(x, 0.4, z));
    audio.explosion();
    shakeT = 0.7;
    shakeMag = 0.02;
  },
  chargeDropped() {},
  chargePickedUp() {},
  chargeBeep(final) {
    audio.plantBeep(final);
  },
};
const match = createMatch(rng, matchEvents);
world.orders = match.orders;

// Before the first Play click the yard is the menu backdrop: put every bot
// on its spawn so the scene behind the panel is already the match's world.
{
  let ai = 0;
  let di = 0;
  for (const bot of bots) {
    const spawn = bot.team === 'atk' ? SPAWNS.atk[ai++ === 0 ? 0 : 2] : SPAWNS.def[di++ % SPAWNS.def.length];
    resetBot(bot, spawn);
  }
}

function respawnAll() {
  const spawn = SPAWNS.atk[1];
  player.teleport(spawn.x, spawn.z, spawn.yaw);
  playerActor.hp = 100;
  playerActor.alive = true;
  playerActor.plantProgress = 0;
  if (playerDied) {
    weapons.dropPrimary();
    weapons.state.grenades = 0;
    playerActor.armor = 0;
    playerActor.helmet = false;
  }
  playerDied = false;
  weapons.refillSidearm();
  for (const bot of bots) {
    const keep = bot.alive
      ? { weaponId: bot.weaponId, mag: bot.mag, reserve: bot.reserve, armor: bot.armor, helmet: bot.helmet }
      : null;
    resetBot(bot, bot.resetTo);
    if (keep) {
      bot.weaponId = keep.weaponId;
      bot.mag = keep.mag;
      bot.reserve = keep.reserve;
      bot.armor = keep.armor;
      bot.helmet = keep.helmet;
    }
    match.botBuy(bot);
  }
}

// ---- Buying ---------------------------------------------------------------
function buyStateFor(row) {
  const price = weaponPrice(row);
  if (row.kind === 'weapon') {
    if (weapons.state.primary === row.id) return 'owned';
  } else if (row.kind === 'armor') {
    if (row.id === 'vest' && playerActor.armor >= 100) return 'owned';
    if (row.id === 'vestHelmet' && playerActor.helmet && playerActor.armor >= 100) return 'owned';
  } else if (row.kind === 'grenade') {
    if (weapons.state.grenades >= GRENADE.maxCarry) return 'owned';
  }
  return playerActor.money < price ? 'cant' : 'ok';
}

function tryBuy(index) {
  if (match.state.phase !== 'buy') return;
  const row = BUY_MENU[index];
  if (!row || buyStateFor(row) !== 'ok') {
    audio.denied();
    return;
  }
  const price = weaponPrice(row);
  playerActor.money -= price;
  if (row.kind === 'weapon') weapons.setPrimary(row.id);
  else if (row.kind === 'armor') {
    playerActor.armor = 100;
    if (row.id === 'vestHelmet') playerActor.helmet = true;
  } else if (row.kind === 'grenade') weapons.addGrenade();
  audio.buy();
}
hud.onBuy(tryBuy);

// ---- Flow: panels, pointer lock, start ------------------------------------
let matchStarted = false;
hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (!matchStarted || match.state.phase === 'matchEnd') {
    if (match.state.phase === 'matchEnd') {
      weapons.reset();
      playerActor.armor = 0;
      playerActor.helmet = false;
      playerActor.kills = 0;
      playerActor.deaths = 0;
      stats.shots = 0;
      stats.hits = 0;
    }
    matchStarted = true;
    hud.showHud();
    match.startMatch(playerActor, bots);
  }
  input.requestLock();
});

const input = createInput(renderer.domElement, (locked) => {
  if (shot) return;
  if (locked) {
    hud.hidePanel();
  } else if (matchStarted && match.state.phase !== 'matchEnd') {
    hud.showPanel('pause', { round: match.state.round, atk: match.state.score.atk, def: match.state.score.def });
  }
});

// ---- Per-step simulation ----------------------------------------------------
const fireInput = { firing: false, trigger: false };

function step(dt) {
  world.time += dt;
  const phase = match.state.phase;
  const simRunning = matchStarted && phase !== 'menu';
  if (!simRunning) return;

  match.step(dt, playerActor, bots);

  // The player body moves in buy, live and planted phases while alive.
  const canMove = playerActor.alive && (phase === 'buy' || phase === 'live' || phase === 'planted');
  if (canMove && (input.state.locked || shot)) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    player.step(dt, input.state.keys, weapons.currentDef().moveFactor);
    if (body.stepped) {
      audio.footstep(body.movingFast);
      world.emitNoise(body.position.x, body.position.z, body.noiseRadius, 'atk');
    }
  }
  playerActor.crouch = body.crouching;
  playerActor.speedNow = body.speed;

  // Pressed keys: buys, swaps, grenade, reload, mute.
  const pressed = input.takePressed();
  if (pressed.has('KeyM')) audio.toggleMute();
  if (phase === 'buy') {
    for (let i = 0; i < BUY_MENU.length; i += 1) {
      if (pressed.has(`Digit${i + 1}`)) tryBuy(i);
    }
  } else if (playerActor.alive && (phase === 'live' || phase === 'planted')) {
    if (pressed.has('Digit1') && weapons.state.primary) weapons.switchTo(weapons.state.primary);
    if (pressed.has('Digit2')) weapons.switchTo('p9');
    if (pressed.has('KeyG')) {
      eyePos.set(body.position.x, body.position.y + body.eye, body.position.z);
      dirFromYawPitch(body.yaw, body.pitch, aimDir);
      if (weapons.throwGrenade(eyePos, aimDir, scene)) audio.throwWhoosh();
    }
  }
  if (pressed.has('KeyR') && playerActor.alive) weapons.reload();

  // Planting: the carrier holds E inside a site.
  if (phase === 'live' && playerActor.alive && match.charge.state === 'carried' && match.charge.carrier === playerActor) {
    const site = match.siteAt(body.position.x, body.position.z);
    if (site && input.state.keys.has('KeyE') && body.speed < 1.2) {
      playerActor.plantProgress = Math.min(1, playerActor.plantProgress + dt / ROUND.plantTime);
      if (Math.floor(world.time * 3) !== Math.floor((world.time - dt) * 3)) audio.channelTick();
    } else {
      playerActor.plantProgress = Math.max(0, playerActor.plantProgress - dt * 2);
    }
  } else {
    playerActor.plantProgress = 0;
  }

  // Weapons and bots.
  fireInput.firing = input.state.firing && playerActor.alive && (phase === 'live' || phase === 'planted');
  fireInput.trigger = input.takeTrigger() && playerActor.alive;
  weapons.step(dt, fireInput, body, map);
  if (phase === 'live' || phase === 'planted') {
    for (const bot of bots) stepBot(bot, dt, world);
  }
  fx.step(dt);

  // Noise events age out.
  while (noise.length && world.time - noise[0].t > 4) noise.shift();

  // The charge prop follows its state.
  const charge = match.charge;
  if (charge.state === 'carried') {
    if (charge.carrier && !charge.carrier.isPlayer) {
      chargeMesh.group.visible = true;
      chargeMesh.group.position.set(charge.carrier.pos.x, 1.02, charge.carrier.pos.z);
      chargeMesh.group.rotation.y = charge.carrier.yaw;
      chargeMesh.setBlink(true, false);
    } else {
      chargeMesh.group.visible = false;
    }
  } else {
    chargeMesh.group.visible = true;
    chargeMesh.group.position.set(charge.x, 0, charge.z);
    chargeMesh.group.rotation.y = 0.4;
    chargeMesh.setBlink(true, charge.state === 'planted' && charge.fuseT < 8);
  }

  if (match.state.phase === 'matchEnd' && !hud.panelVisible()) {
    hud.showPanel('end', {
      matchWinner: match.state.matchWinner,
      atk: match.state.score.atk,
      def: match.state.score.def,
      statsHtml: statsTable(),
    });
    input.exitLock();
  }
}

function statsTable() {
  const rows = actors
    .slice()
    .sort((a, b) => (b.kills ?? 0) - (a.kills ?? 0))
    .map((a) => `<tr><td class="${a.team}">${a.name}</td><td>${a.team === 'atk' ? 'Wardens' : 'Vultures'}</td><td>${a.kills ?? 0}</td><td>${a.deaths ?? 0}</td></tr>`)
    .join('');
  const acc = stats.shots ? Math.round((stats.hits / stats.shots) * 100) : 0;
  return `<tr><th>Soldier</th><th>Side</th><th>K</th><th>D</th></tr>${rows}<tr><td colspan="4">Your accuracy: ${acc}% (${stats.hits}/${stats.shots})</td></tr>`;
}

// ---- HUD snapshot -------------------------------------------------------------
function objectiveText() {
  const s = match.state;
  if (!playerActor.alive) return 'You are down — your team fights on';
  switch (s.phase) {
    case 'buy': return `Buy phase — target site ${match.state.targetSite.id} · spend with 1–6`;
    case 'live': {
      const c = match.charge;
      if (c.state === 'carried' && c.carrier === playerActor) return 'You carry the charge — hold E at site A or B to plant';
      if (c.state === 'dropped') return 'The charge is down — recover it';
      return `Plant the breach charge at site ${match.state.targetSite.id}, or eliminate the Vultures`;
    }
    case 'planted': return 'Charge planted — defend it until it blows';
    case 'end': return s.winner === 'atk' ? 'Round to the Wardens' : 'Round to the Vultures';
    default: return '';
  }
}

function pushHud() {
  const s = match.state;
  const a = weapons.ammo[weapons.state.current];
  const def = weapons.currentDef();
  hud.update({
    timer: s.phase === 'buy' || s.phase === 'live' ? s.timer : s.phase === 'planted' ? match.charge.fuseT : 0,
    phase: s.phase,
    score: s.score,
    round: Math.max(1, s.round),
    objective: objectiveText(),
    hp: playerActor.hp,
    armor: playerActor.armor,
    helmet: playerActor.helmet,
    money: playerActor.money,
    weaponName: def.name,
    mag: a.mag,
    reserve: a.reserve,
    magSize: def.mag,
    grenades: weapons.state.grenades,
    spreadPx: weapons.spreadNow(body) * 620,
    dots: actors.map((x) => ({ team: x.team, alive: x.alive })),
    buyOpen: s.phase === 'buy' && matchStarted,
    buyStates: BUY_MENU.map((row) => buyStateFor(row)),
  });
  // Plant progress bar.
  if (playerActor.plantProgress > 0 && playerActor.plantProgress < 1) {
    hud.setProgress(playerActor.plantProgress, 'PLANTING THE CHARGE');
  } else if (match.charge.carrier === playerActor && match.charge.state === 'carried' && match.siteAt(body.position.x, body.position.z)) {
    hud.setProgress(0, 'HOLD E TO PLANT');
  } else {
    hud.setProgress(null);
  }
}

// ---- Camera ---------------------------------------------------------------------
function syncCamera() {
  shakeT = Math.max(0, shakeT - 1 / 60);
  const shX = shakeT > 0 ? (rng.next() - 0.5) * shakeMag * shakeT * 8 : 0;
  const shY = shakeT > 0 ? (rng.next() - 0.5) * shakeMag * shakeT * 8 : 0;
  if (!playerActor.alive && matchStarted) {
    camera.position.set(body.position.x, body.position.y + 1.1, body.position.z);
    camera.rotation.set(-0.25, body.yaw, 0.5);
    return;
  }
  camera.position.set(body.position.x + shX, body.position.y + body.eye + shY, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0);
}

// ---- The loop ----------------------------------------------------------------------
let accumulator = 0;
let lastTime = performance.now();
let frozen = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    if (matchStarted) pushHud();
  }
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Screenshot staging --------------------------------------------------------------
function settle(n) {
  for (let i = 0; i < n; i += 1) step(FIXED_STEP);
}

function stageShot(name) {
  hud.showHud();
  if (name === 'menu') {
    // The start panel over the yard: everyone at spawn, camera at the gate.
    matchStarted = false;
    for (const bot of bots) {
      const spawn = bot.team === 'atk' ? SPAWNS.atk[bots.indexOf(bot) % 3] : SPAWNS.def[bots.indexOf(bot) % 3];
      resetBot(bot, spawn);
    }
    player.teleport(0, 18.6, 0);
    body.pitch = 0.02;
    syncCamera();
    hud.showPanel('start');
    return;
  }
  matchStarted = true;
  match.startMatch(playerActor, bots);
  hud.hidePanel();
  if (name === 'buy') {
    // Angle the spawn view across the yard: dead ahead is the mid spine
    // wall, which fills a straight-on frame with one dark slab.
    player.teleport(0, 16.8, 0.55);
    playerActor.money = 2650;
    weapons.setPrimary('kestrel');
    playerActor.money = 2650; // setPrimary is free; show a mid-buy purse
    playerActor.armor = 100;
    settle(2);
  } else if (name === 'play' || name === 'site' || name === 'end') {
    match.state.phase = 'live';
    match.state.phaseT = 64;
    match.state.timer = 64;
    match.state.round = 6;
    match.state.score.atk = 3;
    match.state.score.def = 2;
    playerActor.money = 1450;
    playerActor.armor = 55;
    weapons.setPrimary('kestrel');
    if (name === 'play') {
      player.teleport(2.5, 6.5, 0);
      const rasp = bots[2];
      rasp.pos.set(1.4, 0, -3.2);
      rasp.yaw = Math.PI;
      rasp.brain.mode = 'hold';
      const vex = bots[0];
      vex.pos.set(-2.6, 0, 1.5);
      vex.yaw = 0.2;
      settle(16);
      // Aim squarely at the Vulture's chest and put one live round in the
      // air: tracer, impact sparks and the hit marker all show in frame.
      body.yaw = Math.atan2(-(rasp.pos.x - body.position.x), -(rasp.pos.z - body.position.z));
      body.pitch = Math.atan2(1.18 - (body.position.y + body.eye), Math.hypot(rasp.pos.x - body.position.x, rasp.pos.z - body.position.z));
      eyePos.set(body.position.x, body.position.y + body.eye, body.position.z);
      dirFromYawPitch(body.yaw, body.pitch, aimDir);
      fireFrom(playerActor, eyePos, aimDir, WEAPONS.kestrel, 0.0005, undefined);
      // A second tracer drawn eye-to-impact so the shot reads in a still.
      fx.tracer(eyePos, new THREE.Vector3(rasp.pos.x, 1.18, rasp.pos.z), WEAPONS.kestrel.tracer);
      hud.hitMarker(false);
    } else if (name === 'site') {
      match.charge.state = 'carried';
      match.charge.carrier = playerActor;
      player.teleport(-14.8, -7.5, 0.71);
      body.pitch = -0.02;
      playerActor.plantProgress = 0.62;
      const kett = bots[3];
      kett.pos.set(-19.5, 0, -12.5);
      kett.yaw = -2.2;
      settle(10);
      playerActor.plantProgress = 0.62;
      hud.setProgress(0.62, 'PLANTING THE CHARGE');
    } else {
      // end: the round banner over a quiet yard.
      player.teleport(0, 4, 0);
      match.state.phase = 'end';
      match.state.winner = 'atk';
      match.state.score.atk = 4;
      match.state.score.def = 2;
      settle(6);
      hud.showBanner('ROUND WON', 'ELIMINATION', 'win', 100000);
    }
  }
  pushHud();
  syncCamera();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

if (shot) {
  stageShot(shot);
  paintTwiceThenReady();
} else {
  requestAnimationFrame(frame);
}
