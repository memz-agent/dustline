// The five bot soldiers: two Warden teammates, three Vulture defenders. Each
// runs the same brain: perceive (sight with field of view and reaction time,
// plus hearing gunfire and running feet), decide (advance, hold, engage,
// plant, defuse), move along A* paths with the shared slide collision, and
// shoot in bursts with the shared hitscan, stopping to fire because a moving
// bot is as inaccurate as a moving player. Skill is per-bot numbers, not
// cheats: reaction time and aim error, nothing that bends a bullet.
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';
import { createBotMesh } from './actor.js';
import { chestHeight, dirFromYawPitch, eyeHeight } from './combat.js';

const RADIUS = 0.36;
const TURN_RATE = 7.5;

const ROSTER = [
  { name: 'Vex', team: 'atk', skill: 0.55 },
  { name: 'Ondo', team: 'atk', skill: 0.45 },
  { name: 'Rasp', team: 'def', skill: 0.6 },
  { name: 'Kett', team: 'def', skill: 0.5 },
  { name: 'Mire', team: 'def', skill: 0.4 },
];

export function createBots(scene, rng) {
  const bots = ROSTER.map((spec, i) => {
    const mesh = createBotMesh(spec.team);
    scene.add(mesh.group);
    return {
      id: `bot-${i}`,
      name: spec.name,
      team: spec.team,
      isPlayer: false,
      skill: spec.skill,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      crouch: false,
      alive: true,
      hp: 100,
      armor: 0,
      helmet: false,
      weaponId: 'p9',
      mag: WEAPONS.p9.mag,
      reserve: WEAPONS.p9.reserve,
      reloadLeft: 0,
      money: 800,
      kills: 0,
      deaths: 0,
      mesh,
      brain: {
        mode: 'hold',
        path: [],
        pathIdx: 0,
        goal: null,
        repathT: 0,
        thinkT: Math.random() * 0.12,
        target: null,
        seenT: 0, // how long the current target has been continuously visible
        lastKnown: null,
        heardT: 0,
        burstLeft: 0,
        burstPauseT: 0,
        fireT: 0,
        strafeDir: 1,
        strafeT: 0,
        scanYaw: 0,
        channelT: 0,
        channelKind: null,
        deathT: 0,
        alert: 0,
      },
    };
  });
  return bots;
}

export function resetBot(bot, spawn) {
  bot.pos.set(spawn.x, 0, spawn.z);
  bot.vel.set(0, 0, 0);
  bot.yaw = spawn.yaw;
  bot.pitch = 0;
  bot.crouch = false;
  bot.alive = true;
  bot.hp = 100;
  bot.armor = 0;
  bot.helmet = false;
  bot.weaponId = 'p9';
  bot.mag = WEAPONS.p9.mag;
  bot.reserve = WEAPONS.p9.reserve;
  bot.reloadLeft = 0;
  const b = bot.brain;
  b.mode = 'hold';
  b.path = [];
  b.pathIdx = 0;
  b.goal = null;
  b.target = null;
  b.seenT = 0;
  b.lastKnown = null;
  b.burstLeft = 0;
  b.burstPauseT = 0;
  b.fireT = 0;
  b.channelT = 0;
  b.channelKind = null;
  b.deathT = 0;
  b.alert = 0;
  bot.mesh.reset();
  bot.mesh.group.visible = true;
  syncMesh(bot, 0, 0);
}

function syncMesh(bot, dt, time) {
  bot.mesh.group.position.set(bot.pos.x, 0, bot.pos.z);
  bot.mesh.group.rotation.y = bot.yaw;
  bot.mesh.setCrouch(bot.crouch);
  bot.mesh.animate(dt, Math.hypot(bot.vel.x, bot.vel.z), time);
}

function turnToward(bot, wantYaw, dt) {
  let diff = wantYaw - bot.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxTurn = TURN_RATE * dt;
  bot.yaw += Math.max(-maxTurn, Math.min(maxTurn, diff));
  return Math.abs(diff);
}

function yawTo(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

// Perception + decisions, run on a stagger so five brains never spike a frame.
function think(bot, dt, world) {
  const b = bot.brain;
  const orders = world.orders;
  const eye = eyeHeight(bot);

  // Sight: nearest visible enemy, FOV 105 degrees, or point-blank awareness.
  let visible = null;
  let visibleDist = Infinity;
  for (const enemy of world.actors) {
    if (!enemy.alive || enemy.team === bot.team) continue;
    const dx = enemy.pos.x - bot.pos.x;
    const dz = enemy.pos.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 55) continue;
    if (dist > 6) {
      const facing = yawTo(bot.pos, enemy.pos);
      let diff = Math.abs(facing - bot.yaw);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > 1.83) continue;
    }
    if (world.map.sightBlocked(bot.pos.x, bot.pos.z, eye, enemy.pos.x, enemy.pos.z, chestHeight(enemy))) continue;
    if (dist < visibleDist) {
      visible = enemy;
      visibleDist = dist;
    }
  }
  if (visible) {
    if (b.target !== visible) b.seenT = 0;
    b.target = visible;
    b.seenT += dt;
    b.lastKnown = { x: visible.pos.x, z: visible.pos.z, t: world.time };
    b.alert = 1;
  } else {
    b.seenT = 0;
    if (b.target && (!b.target.alive || world.time - (b.lastKnown?.t ?? 0) > 3.5)) b.target = null;
  }

  // Hearing: shots and running feet within their radius give a direction.
  for (const ev of world.noise) {
    if (ev.t <= b.heardT || ev.team === bot.team) continue;
    const dist = Math.hypot(ev.x - bot.pos.x, ev.z - bot.pos.z);
    if (dist < ev.radius) {
      b.lastKnown = { x: ev.x, z: ev.z, t: ev.t };
      b.alert = Math.max(b.alert, 0.7);
      b.heardT = ev.t;
    }
  }

  // Decide the mode. A visible enemy always interrupts, except mid-channel
  // with the enemy still far away: finishing the plant wins rounds.
  const phase = orders.phase;
  const channeling = b.channelKind && (phase === 'live' || phase === 'planted');
  if (visible && !(channeling && visibleDist > 11)) {
    b.mode = 'engage';
    b.channelKind = null;
    b.channelT = 0;
  } else if (channeling) {
    b.mode = b.channelKind;
  } else if (bot.team === 'atk') {
    if (phase === 'planted') {
      b.mode = 'hold';
      b.holdAt = orders.plantCoverFor(bot);
    } else if (orders.chargeCarrier === bot && orders.atSite(bot)) {
      b.mode = 'plant';
    } else if (orders.chargeCarrier === bot || !orders.chargeCarrier) {
      b.mode = 'advance';
      b.goal = orders.chargeCarrier === bot ? orders.targetSite : orders.chargePos;
    } else {
      b.mode = 'advance';
      b.goal = orders.escortPoint(bot);
    }
  } else {
    // Defenders.
    if (phase === 'planted') {
      if (orders.chargeDefusableBy(bot)) {
        b.mode = 'defuse';
      } else {
        b.mode = 'advance';
        b.goal = orders.plantedSitePos;
      }
    } else {
      b.mode = 'hold';
      b.holdAt = orders.holdPointFor(bot);
      // A heard enemy near my site pulls me a few steps toward the sound.
      if (b.lastKnown && world.time - b.lastKnown.t < 2.5 && b.alert > 0.5) {
        b.mode = 'advance';
        b.goal = b.lastKnown;
      }
    }
  }
  if (b.mode === 'engage' && !visible && b.lastKnown) {
    b.mode = 'advance';
    b.goal = b.lastKnown;
  }
}

// Move along the current path; returns the speed actually travelled.
function followPath(bot, dt, world, speed) {
  const b = bot.brain;
  if (!b.goal) return 0;
  b.repathT -= dt;
  const goalMoved = !b.pathGoal || Math.hypot(b.pathGoal.x - b.goal.x, b.pathGoal.z - b.goal.z) > 1.2;
  if ((b.pathIdx >= b.path.length || goalMoved) && b.repathT <= 0) {
    b.path = world.map.findPath(bot.pos, b.goal);
    b.pathIdx = 0;
    b.pathGoal = { x: b.goal.x, z: b.goal.z };
    b.repathT = 2.2;
  }
  let target = b.path[b.pathIdx];
  while (target && Math.hypot(target.x - bot.pos.x, target.z - bot.pos.z) < 0.55) {
    b.pathIdx += 1;
    target = b.path[b.pathIdx];
  }
  if (!target) target = b.goal;
  return moveToward(bot, dt, world, target, speed);
}

function moveToward(bot, dt, world, target, speed) {
  const dx = target.x - bot.pos.x;
  const dz = target.z - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.05) {
    bot.vel.x *= 0.8;
    bot.vel.z *= 0.8;
    world.map.slideMove(bot.pos, bot.vel.x * dt, bot.vel.z * dt, RADIUS);
    return 0;
  }
  const wantYaw = Math.atan2(-dx, -dz);
  turnToward(bot, wantYaw, dt);
  const vx = (dx / dist) * speed;
  const vz = (dz / dist) * speed;
  const blend = Math.min(1, dt * 8);
  bot.vel.x += (vx - bot.vel.x) * blend;
  bot.vel.z += (vz - bot.vel.z) * blend;
  // Gentle separation so bots never stack inside each other.
  for (const other of world.actors) {
    if (other === bot || !other.alive || other.isPlayer) continue;
    const ox = bot.pos.x - other.pos.x;
    const oz = bot.pos.z - other.pos.z;
    const od = Math.hypot(ox, oz);
    if (od > 0.01 && od < 0.8) {
      bot.vel.x += (ox / od) * (0.8 - od) * 3 * dt * 8;
      bot.vel.z += (oz / od) * (0.8 - od) * 3 * dt * 8;
    }
  }
  world.map.slideMove(bot.pos, bot.vel.x * dt, bot.vel.z * dt, RADIUS);
  return Math.hypot(bot.vel.x, bot.vel.z);
}

const fireDir = new THREE.Vector3();
const fireOrigin = new THREE.Vector3();

function botFire(bot, dt, world) {
  const b = bot.brain;
  const def = WEAPONS[bot.weaponId];
  b.fireT -= dt;
  if (bot.reloadLeft > 0) {
    bot.reloadLeft -= dt;
    return;
  }
  if (bot.mag <= 0) {
    if (bot.reserve > 0) {
      bot.reloadLeft = def.reloadTime;
      const take = Math.min(def.mag - bot.mag, bot.reserve);
      bot.mag += take;
      bot.reserve -= take;
    }
    return;
  }
  if (!b.target || !b.target.alive) return;
  const reaction = 0.62 - bot.skill * 0.34;
  if (b.seenT < reaction) return;
  if (b.burstPauseT > 0) {
    b.burstPauseT -= dt;
    return;
  }
  if (b.burstLeft <= 0) b.burstLeft = 3 + Math.floor(world.rng.next() * 4);
  if (b.fireT > 0) return;
  b.fireT = 60 / def.rpm;
  b.burstLeft -= 1;
  if (b.burstLeft <= 0) b.burstPauseT = 0.32 + world.rng.next() * 0.4;

  const target = b.target;
  fireOrigin.set(bot.pos.x, eyeHeight(bot), bot.pos.z);
  const aimY = target.crouch ? 0.95 : 1.22;
  fireDir.set(target.pos.x - fireOrigin.x, aimY - fireOrigin.y, target.pos.z - fireOrigin.z);
  const dist = fireDir.length();
  fireDir.normalize();
  // Aim error: worse with distance, a moving target and a moving bot.
  const targetSpeed = target.isPlayer ? target.speedNow ?? 0 : Math.hypot(target.vel.x, target.vel.z);
  const mySpeed = Math.hypot(bot.vel.x, bot.vel.z);
  const spread = 0.028 - bot.skill * 0.013 + dist * 0.0007 + targetSpeed * 0.0035 + mySpeed * 0.004;
  world.fireFrom(bot, fireOrigin, fireDir, def, spread);
  bot.mag -= 1;
}

export function stepBot(bot, dt, world) {
  const b = bot.brain;
  if (!bot.alive) {
    b.deathT += dt;
    bot.mesh.setFall(Math.min(1, b.deathT / 0.45));
    return;
  }
  b.thinkT -= dt;
  if (b.thinkT <= 0) {
    b.thinkT = 0.12;
    think(bot, 0.12, world);
  }
  b.alert = Math.max(0, b.alert - dt * 0.1);

  let speedNow = 0;
  if (b.mode === 'engage' && b.target) {
    // Combat movement: hold a fighting range, strafe, stop for the burst.
    const t = b.target;
    const dx = t.pos.x - bot.pos.x;
    const dz = t.pos.z - bot.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    turnToward(bot, Math.atan2(-dx, -dz), dt);
    b.strafeT -= dt;
    if (b.strafeT <= 0) {
      b.strafeT = 0.7 + world.rng.next() * 0.8;
      b.strafeDir = world.rng.chance(0.5) ? 1 : -1;
    }
    const bursting = b.burstLeft > 0 && b.burstPauseT <= 0;
    let mx = 0;
    let mz = 0;
    if (!bursting) {
      const sideX = (-dz / dist) * b.strafeDir;
      const sideZ = (dx / dist) * b.strafeDir;
      let radial = 0;
      if (dist > 19) radial = 1;
      else if (dist < 6.5) radial = -1;
      mx = sideX * 0.8 + (dx / dist) * radial;
      mz = sideZ * 0.8 + (dz / dist) * radial;
      const ml = Math.hypot(mx, mz) || 1;
      const goal = { x: bot.pos.x + (mx / ml) * 2, z: bot.pos.z + (mz / ml) * 2 };
      speedNow = moveToward(bot, dt, world, goal, 2.6);
    } else {
      bot.vel.x *= 0.7;
      bot.vel.z *= 0.7;
      world.map.slideMove(bot.pos, bot.vel.x * dt, bot.vel.z * dt, RADIUS);
    }
    bot.crouch = dist > 13 && world.rng.chance(0.4);
    botFire(bot, dt, world);
  } else if (b.mode === 'plant' || b.mode === 'defuse') {
    // Channel in place; match.js watches the timer and completes the act.
    bot.vel.x *= 0.8;
    bot.vel.z *= 0.8;
    bot.crouch = b.mode === 'defuse';
    b.channelKind = b.mode;
    b.channelT += dt;
    if (b.mode === 'plant') turnToward(bot, bot.yaw + Math.sin(world.time * 0.7) * 0.002, dt);
  } else if (b.mode === 'hold') {
    const hold = b.holdAt;
    if (hold && Math.hypot(hold.x - bot.pos.x, hold.z - bot.pos.z) > 0.9) {
      b.goal = hold;
      speedNow = followPath(bot, dt, world, bot.alert > 0.4 ? 4.4 : 3.4);
    } else {
      bot.vel.x *= 0.8;
      bot.vel.z *= 0.8;
      world.map.slideMove(bot.pos, bot.vel.x * dt, bot.vel.z * dt, RADIUS);
      if (hold?.face) {
        const baseYaw = yawTo(bot.pos, hold.face);
        b.scanYaw = baseYaw + Math.sin(world.time * 0.45 + bot.pos.x) * 0.55;
        turnToward(bot, b.scanYaw, dt);
      }
      bot.crouch = bot.team === 'def' && world.rng.chance(0.995);
    }
    b.channelKind = null;
    b.channelT = 0;
  } else {
    // advance
    bot.crouch = false;
    speedNow = followPath(bot, dt, world, b.alert > 0.4 ? 4.5 : 3.6);
    b.channelKind = null;
    b.channelT = 0;
  }

  // Running feet are heard; walking in combat is quiet.
  if (speedNow > 3.4) world.emitNoise(bot.pos.x, bot.pos.z, 11, bot.team);
  syncMesh(bot, dt, world.time);
  bot.mesh.setHelmet(bot.helmet);
}
