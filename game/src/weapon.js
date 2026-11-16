// The player's hands: one view model per weapon, the firing cycle, and the
// grenades. This module owns ammunition, bloom and recoil; it never decides
// what a bullet hits. When a round leaves the barrel it calls events.shoot
// with the weapon's table row and the spread the shooter's stance earned,
// and main.js resolves the ray. Accuracy is the game's promise: standing
// still (or crouched) the spread nearly vanishes, running it blooms wide,
// and every shot adds bloom that only patience burns off.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS, GRENADE } from './weapons.js';

const darkMetal = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.45, metalness: 0.5 });
const bodyMetal = new THREE.MeshStandardMaterial({ color: new THREE.Color('#22242a'), roughness: 0.5, metalness: 0.35 });
const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });
const unitBox = new THREE.BoxGeometry(1, 1, 1);

function box(parent, mat, x, y, z, sx, sy, sz) {
  const mesh = new THREE.Mesh(unitBox, mat);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

// Four low-poly view models, distinct silhouettes: stubby pistol, fat SMG,
// long rifle, scoped DMR.
function buildViewModels() {
  const models = {};
  {
    const g = new THREE.Group();
    box(g, bodyMetal, 0, 0, 0, 0.075, 0.11, 0.24);
    box(g, darkMetal, 0, 0.02, -0.2, 0.05, 0.06, 0.14);
    box(g, darkMetal, 0, -0.1, 0.05, 0.07, 0.12, 0.09);
    models.p9 = g;
  }
  {
    const g = new THREE.Group();
    box(g, bodyMetal, 0, 0, -0.05, 0.1, 0.13, 0.4);
    box(g, darkMetal, 0, 0.01, -0.32, 0.055, 0.055, 0.2);
    box(g, accentMat, 0, -0.11, -0.08, 0.06, 0.14, 0.08);
    box(g, darkMetal, 0, 0.09, -0.02, 0.05, 0.05, 0.22);
    models.wasp = g;
  }
  {
    const g = new THREE.Group();
    box(g, bodyMetal, 0, 0, 0, 0.09, 0.11, 0.46);
    box(g, darkMetal, 0, 0.02, -0.42, 0.045, 0.045, 0.34);
    box(g, darkMetal, 0, -0.09, 0.02, 0.06, 0.16, 0.07);
    box(g, darkMetal, 0, 0.1, 0.05, 0.05, 0.06, 0.2);
    box(g, accentMat, 0, 0.085, -0.18, 0.02, 0.03, 0.1);
    models.kestrel = g;
  }
  {
    const g = new THREE.Group();
    box(g, bodyMetal, 0, 0, 0, 0.085, 0.1, 0.52);
    box(g, darkMetal, 0, 0.015, -0.5, 0.04, 0.04, 0.4);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.2, 10), darkMetal);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.1, -0.05);
    g.add(scope);
    box(g, darkMetal, 0, -0.09, 0.06, 0.06, 0.14, 0.07);
    models.longshot = g;
  }
  for (const g of Object.values(models)) {
    g.position.set(0.24, -0.22, -0.45);
    g.visible = false;
  }
  return models;
}

export function createPlayerWeapons(camera, events) {
  const models = buildViewModels();
  for (const g of Object.values(models)) camera.add(g);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffca7a'), transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color('#ffca7a'), 0, 6);
  camera.add(flashLight);

  const ammo = {};
  for (const id of Object.keys(WEAPONS)) {
    ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  }
  const state = {
    primary: null,
    current: 'p9',
    grenades: 0,
    cooldown: 0,
    reloadLeft: 0,
    bloom: 0,
    kick: 0,
    flashLeft: 0,
    switchLeft: 0,
    bobPhase: 0,
  };
  let muzzleTip = new THREE.Vector3();

  function currentDef() {
    return WEAPONS[state.current];
  }
  function showCurrent() {
    for (const [id, g] of Object.entries(models)) g.visible = id === state.current;
    const def = currentDef();
    flash.position.set(0.24, -0.19, state.current === 'p9' ? -0.72 : state.current === 'longshot' ? -1.2 : -0.95);
    flashLight.position.copy(flash.position);
    void def;
  }
  showCurrent();

  function switchTo(id) {
    if (state.current === id || state.switchLeft > 0) return;
    if (id !== 'p9' && state.primary !== id) return;
    state.current = id;
    state.reloadLeft = 0;
    state.switchLeft = 0.32;
    state.bloom = 0;
    showCurrent();
  }

  function reload() {
    const def = currentDef();
    const a = ammo[state.current];
    if (state.reloadLeft > 0 || a.mag >= def.mag || a.reserve <= 0) return;
    state.reloadLeft = def.reloadTime;
    events.reloadStart();
  }

  function spreadFor(speed, crouching) {
    const def = currentDef();
    const moveF = Math.min(1, speed / 5.4);
    let spread = def.spreadStill + moveF * def.spreadMove + state.bloom;
    if (crouching) spread *= 0.65;
    return spread;
  }

  // Live grenades in flight, simulated here, detonated through events.
  const grenades = [];

  function step(dt, input, body, map) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.switchLeft = Math.max(0, state.switchLeft - dt);
    state.bloom = Math.max(0, state.bloom - dt * currentDef().bloomDecay * 8);
    state.kick += (0 - state.kick) * Math.min(1, dt * 13);
    state.flashLeft = Math.max(0, state.flashLeft - dt);
    flash.visible = state.flashLeft > 0;
    if (flash.visible) flash.rotation.z += dt * 26;
    flashLight.intensity = state.flashLeft > 0 ? 16 : 0;

    const model = models[state.current];
    state.bobPhase += dt * (2 + body.speed * 1.9);
    const bob = Math.min(1, body.speed / 5) * 0.011;
    model.position.y = -0.22 + Math.sin(state.bobPhase * 2) * bob - state.switchLeft * 0.24;
    model.position.z = -0.45 + state.kick;
    model.rotation.x = state.kick * 2.4 + state.switchLeft * 1.4 + (state.reloadLeft > 0 ? -0.6 * Math.sin((1 - state.reloadLeft / currentDef().reloadTime) * Math.PI) : 0);

    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      if (state.reloadLeft === 0) {
        const def = currentDef();
        const a = ammo[state.current];
        const take = Math.min(def.mag - a.mag, a.reserve);
        a.mag += take;
        a.reserve -= take;
        events.reloadEnd();
        events.ammoChanged();
      }
    }

    // Firing.
    if (state.switchLeft <= 0 && state.reloadLeft <= 0 && state.cooldown <= 0) {
      const def = currentDef();
      const want = def.automatic ? input.firing : input.trigger;
      if (want) {
        const a = ammo[state.current];
        if (a.mag <= 0) {
          if (input.trigger) {
            events.dryFire();
            state.cooldown = 0.28;
          }
        } else {
          a.mag -= 1;
          state.cooldown = 60 / def.rpm;
          state.bloom = Math.min(0.05, state.bloom + def.bloomPerShot);
          state.kick = 0.05 + def.recoilPitch * 1.4;
          state.flashLeft = 0.05;
          muzzleTip.setFromMatrixPosition(models[state.current].matrixWorld);
          events.shoot(def, spreadFor(body.speed, body.crouching), muzzleTip);
          events.ammoChanged();
          if (a.mag === 0) reload();
        }
      }
    }

    // Grenades in flight.
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= 19 * dt;
      const nx = g.pos.x + g.vel.x * dt;
      const nz = g.pos.z + g.vel.z * dt;
      const before = { x: g.pos.x, z: g.pos.z };
      map.slideMove(g.pos, g.vel.x * dt, g.vel.z * dt, 0.12);
      if (Math.abs(g.pos.x - before.x) < Math.abs(g.vel.x * dt) * 0.4) g.vel.x *= -0.35;
      if (Math.abs(g.pos.z - before.z) < Math.abs(g.vel.z * dt) * 0.4) g.vel.z *= -0.35;
      void nx; void nz;
      g.pos.y += g.vel.y * dt;
      if (g.pos.y < 0.13) {
        g.pos.y = 0.13;
        g.vel.y = Math.abs(g.vel.y) > 1.4 ? -g.vel.y * 0.38 : 0;
        g.vel.x *= 0.72;
        g.vel.z *= 0.72;
      }
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += dt * 6;
      g.mesh.rotation.z += dt * 4;
      if (g.fuse <= 0) {
        events.grenadeExplode(g.pos.clone());
        g.mesh.removeFromParent();
        grenades.splice(i, 1);
      }
    }
  }

  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.foe), roughness: 0.5 });

  return {
    state,
    ammo,
    step,
    reload,
    switchTo,
    currentDef,
    spreadNow(body) {
      return spreadFor(body.speed, body.crouching);
    },
    setPrimary(id) {
      state.primary = id;
      ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      switchTo(id);
    },
    dropPrimary() {
      state.primary = null;
      if (state.current !== 'p9') switchTo('p9');
    },
    addGrenade() {
      state.grenades = Math.min(GRENADE.maxCarry, state.grenades + 1);
    },
    refillSidearm() {
      ammo.p9 = { mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve };
    },
    throwGrenade(origin, dir, scene) {
      if (state.grenades <= 0 || state.switchLeft > 0) return false;
      state.grenades -= 1;
      const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
      scene.add(mesh);
      const pos = origin.clone().addScaledVector(dir, 0.4);
      pos.y -= 0.1;
      const vel = dir.clone().multiplyScalar(GRENADE.throwSpeed);
      vel.y += 3.2;
      grenades.push({ pos, vel, fuse: GRENADE.fuseSeconds, mesh });
      events.ammoChanged();
      return true;
    },
    reset() {
      for (const id of Object.keys(WEAPONS)) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      state.primary = null;
      state.current = 'p9';
      state.grenades = 0;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.bloom = 0;
      for (const g of grenades) g.mesh.removeFromParent();
      grenades.length = 0;
      showCurrent();
    },
  };
}
