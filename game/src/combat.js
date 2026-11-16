// Hitscan combat, shared by the player and every bot so a bullet means the
// same thing in every hands. A shot is a ray: it is tested against the map's
// boxes and against each living actor's three body zones (head sphere, torso
// box, leg box, at the same heights actor.js builds), and the nearest hit
// wins. Damage then runs the weapon's range falloff, the zone multiplier and
// the target's armour, in that order.
import * as THREE from 'three';

export const PART_MULTIPLIER = { head: 4, torso: 1, legs: 0.75 };

const ZONES = {
  stand: [
    { part: 'head', kind: 'sphere', cy: 1.62, r: 0.17 },
    { part: 'torso', kind: 'box', minY: 0.76, maxY: 1.42, hx: 0.31, hz: 0.22 },
    { part: 'legs', kind: 'box', minY: 0.0, maxY: 0.76, hx: 0.29, hz: 0.2 },
  ],
  crouch: [
    { part: 'head', kind: 'sphere', cy: 1.16, r: 0.17 },
    { part: 'torso', kind: 'box', minY: 0.52, maxY: 1.08, hx: 0.31, hz: 0.22 },
    { part: 'legs', kind: 'box', minY: 0.0, maxY: 0.52, hx: 0.29, hz: 0.2 },
  ],
};

export function eyeHeight(actor) {
  return actor.crouch ? 1.14 : 1.62;
}
export function chestHeight(actor) {
  return actor.crouch ? 0.86 : 1.18;
}

const tmpDir = new THREE.Vector3();

// Bend a direction by a random cone of the given half-angle (radians).
export function deviate(dir, spread, rng, out) {
  out.copy(dir);
  out.x += rng.cone() * spread;
  out.y += rng.cone() * spread;
  out.z += rng.cone() * spread;
  out.normalize();
  return out;
}

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return -1;
  return tca - Math.sqrt(r2 - d2);
}

function rayBox(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ) {
  let tmin = 0;
  let tmax = Infinity;
  if (Math.abs(dx) < 1e-9) { if (ox < minX || ox > maxX) return -1; } else {
    let ta = (minX - ox) / dx; let tb = (maxX - ox) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    tmin = Math.max(tmin, ta); tmax = Math.min(tmax, tb);
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dy) < 1e-9) { if (oy < minY || oy > maxY) return -1; } else {
    let ta = (minY - oy) / dy; let tb = (maxY - oy) / dy;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    tmin = Math.max(tmin, ta); tmax = Math.min(tmax, tb);
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dz) < 1e-9) { if (oz < minZ || oz > maxZ) return -1; } else {
    let ta = (minZ - oz) / dz; let tb = (maxZ - oz) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    tmin = Math.max(tmin, ta); tmax = Math.min(tmax, tb);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

// The nearest zone hit on one actor, or null.
export function rayActor(ox, oy, oz, dx, dy, dz, actor, maxT) {
  const zones = actor.crouch ? ZONES.crouch : ZONES.stand;
  const px = actor.pos.x;
  const pz = actor.pos.z;
  let best = null;
  for (const zone of zones) {
    let t;
    if (zone.kind === 'sphere') {
      t = raySphere(ox, oy, oz, dx, dy, dz, px, zone.cy, pz, zone.r);
    } else {
      t = rayBox(ox, oy, oz, dx, dy, dz, px - zone.hx, zone.minY, pz - zone.hz, px + zone.hx, zone.maxY, pz + zone.hz);
    }
    if (t > 0 && t < maxT && (!best || t < best.t)) best = { t, part: zone.part };
  }
  return best;
}

// Damage after falloff, zone and armour. Mutates the target's hp and armour;
// returns the health damage actually dealt.
export function applyDamage(target, baseDamage, part, distance, def) {
  let dmg = baseDamage;
  if (distance > def.falloffStart) {
    const span = Math.max(1, def.falloffEnd - def.falloffStart);
    const f = Math.min(1, (distance - def.falloffStart) / span);
    dmg *= 1 - f * (1 - def.minDamageScale);
  }
  dmg *= PART_MULTIPLIER[part];
  if (part === 'head' && target.helmet) dmg *= 0.55;
  let healthDamage = dmg;
  if (target.armor > 0) {
    healthDamage = dmg * 0.5;
    target.armor = Math.max(0, target.armor - dmg * 0.4);
  }
  target.hp -= healthDamage;
  return healthDamage;
}

// Fire one hitscan round. `actors` are the possible targets (the shooter's
// own entry is skipped by identity). Returns a plain result object the
// caller turns into tracers, sounds, hit markers and kill feed entries.
export function fireHitscan(map, actors, shooter, origin, dir, def) {
  const world = map.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 120);
  let limit = world.hit ? world.t : 120;
  let bestActor = null;
  let bestPart = null;
  let bestT = limit;
  for (const actor of actors) {
    if (actor === shooter || !actor.alive) continue;
    const hit = rayActor(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, actor, bestT);
    if (hit) {
      bestT = hit.t;
      bestActor = actor;
      bestPart = hit.part;
    }
  }
  const point = new THREE.Vector3(
    origin.x + dir.x * bestT,
    origin.y + dir.y * bestT,
    origin.z + dir.z * bestT,
  );
  if (!bestActor) {
    return { kind: world.hit ? 'world' : 'none', point, distance: bestT, floor: world.floor };
  }
  const dealt = applyDamage(bestActor, def.damage, bestPart, bestT, def);
  return {
    kind: 'actor', point, distance: bestT, actor: bestActor, part: bestPart,
    damage: dealt, killed: bestActor.hp <= 0,
  };
}

// Area damage for grenades and the detonation: linear falloff with distance,
// softened (not stopped) by a wall in the way.
export function explosionDamage(map, actors, center, radius, maxDamage, out) {
  out.length = 0;
  for (const actor of actors) {
    if (!actor.alive) continue;
    const dx = actor.pos.x - center.x;
    const dz = actor.pos.z - center.z;
    const dy = 1.0 - center.y;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > radius) continue;
    let dmg = maxDamage * (1 - dist / radius);
    if (map.sightBlocked(center.x, center.z, Math.max(0.4, center.y), actor.pos.x, actor.pos.z, 1.0)) dmg *= 0.35;
    actor.hp -= dmg;
    out.push({ actor, damage: dmg, killed: actor.hp <= 0 });
  }
  return out;
}

export function dirFromYawPitch(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  return out;
}

export { tmpDir };
