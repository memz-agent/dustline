// Transient effects, all pooled: tracer rounds, impact sparks, muzzle flashes
// for bots, and the charge detonation. Nothing here allocates in the frame
// loop; pools are sized once and recycled, oldest first.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAX_TRACERS = 48;
const MAX_SPARKS = 240;
const MAX_FLASHES = 8;

export function createFx(scene) {
  // Tracers: thin stretched boxes with an additive material, alive ~60 ms.
  const tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1);
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffe9b8'), transparent: true, opacity: 0, depthWrite: false,
    });
    const mesh = new THREE.Mesh(tracerGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerCursor = 0;
  const upRef = new THREE.Vector3(0, 0, 1);

  function tracer(from, to, colour) {
    const slot = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % MAX_TRACERS;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.5) return;
    slot.mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    slot.mesh.scale.set(1, 1, len);
    slot.mesh.lookAt(to.x, to.y, to.z);
    slot.mesh.material.color.set(colour);
    slot.mesh.material.opacity = 0.85;
    slot.mesh.visible = true;
    slot.life = 0.06;
    void upRef;
  }

  // Sparks: one Points cloud; each spark has a velocity and a short life.
  const sparkPos = new Float32Array(MAX_SPARKS * 3);
  const sparkVel = new Float32Array(MAX_SPARKS * 3);
  const sparkLife = new Float32Array(MAX_SPARKS);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: new THREE.Color(PALETTE.accent), size: 0.055, transparent: true, opacity: 0.95, depthWrite: false,
  });
  const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
  sparkPoints.frustumCulled = false;
  scene.add(sparkPoints);
  let sparkCursor = 0;
  for (let i = 0; i < MAX_SPARKS; i += 1) sparkPos[i * 3 + 1] = -50;

  function burst(point, count, colour, speed = 2.6, up = 1.4) {
    sparkMat.color.set(colour);
    for (let n = 0; n < count; n += 1) {
      const i = sparkCursor;
      sparkCursor = (sparkCursor + 1) % MAX_SPARKS;
      sparkPos[i * 3] = point.x;
      sparkPos[i * 3 + 1] = point.y;
      sparkPos[i * 3 + 2] = point.z;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * speed;
      sparkVel[i * 3] = Math.cos(a) * r;
      sparkVel[i * 3 + 1] = Math.random() * up;
      sparkVel[i * 3 + 2] = Math.sin(a) * r;
      sparkLife[i] = 0.25 + Math.random() * 0.3;
    }
  }

  // Bot muzzle flashes: a shared pool of additive planes plus one light.
  const flashes = [];
  const flashGeo = new THREE.PlaneGeometry(0.34, 0.34);
  for (let i = 0; i < MAX_FLASHES; i += 1) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffca7a'), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(flashGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    flashes.push({ mesh, life: 0 });
  }
  let flashCursor = 0;
  const flashLight = new THREE.PointLight(new THREE.Color('#ffca7a'), 0, 9);
  scene.add(flashLight);

  function muzzle(point) {
    const slot = flashes[flashCursor];
    flashCursor = (flashCursor + 1) % MAX_FLASHES;
    slot.mesh.position.copy(point);
    slot.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    slot.mesh.material.opacity = 0.95;
    slot.mesh.visible = true;
    slot.life = 0.05;
    flashLight.position.copy(point);
    flashLight.intensity = 14;
  }

  // The detonation: an expanding shell and a hard light pulse.
  const boomMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffb35c'), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  });
  const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), boomMat);
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color('#ff9a3c'), 0, 30);
  scene.add(boomLight);
  let boomT = -1;
  const boomAt = new THREE.Vector3();

  function explosion(point) {
    boomAt.copy(point);
    boom.position.copy(point);
    boomT = 0;
    boom.visible = true;
    burst(point, 60, '#ffb35c', 7, 5);
    burst(point, 30, PALETTE.ink, 4, 3);
  }

  function step(dt) {
    for (const slot of tracers) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.mesh.material.opacity = Math.max(0, slot.life / 0.06) * 0.85;
      if (slot.life <= 0) slot.mesh.visible = false;
    }
    let anySpark = false;
    for (let i = 0; i < MAX_SPARKS; i += 1) {
      if (sparkLife[i] <= 0) continue;
      anySpark = true;
      sparkLife[i] -= dt;
      sparkVel[i * 3 + 1] -= 6.5 * dt;
      sparkPos[i * 3] += sparkVel[i * 3] * dt;
      sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
      sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
      if (sparkLife[i] <= 0 || sparkPos[i * 3 + 1] < 0.02) {
        sparkPos[i * 3 + 1] = -50;
        sparkLife[i] = 0;
      }
    }
    if (anySpark) sparkGeo.attributes.position.needsUpdate = true;
    for (const slot of flashes) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.mesh.material.opacity = Math.max(0, slot.life / 0.05) * 0.95;
      if (slot.life <= 0) slot.mesh.visible = false;
    }
    if (flashLight.intensity > 0) flashLight.intensity = Math.max(0, flashLight.intensity - dt * 260);
    if (boomT >= 0) {
      boomT += dt;
      const t = boomT / 0.7;
      if (t >= 1) {
        boomT = -1;
        boom.visible = false;
        boomLight.intensity = 0;
      } else {
        const r = 0.5 + t * 7.5;
        boom.scale.set(r, r * 0.7, r);
        boomMat.opacity = (1 - t) * 0.55;
        boomLight.position.copy(boomAt).y += 1.2;
        boomLight.intensity = (1 - t) * 60;
      }
    }
  }

  return { tracer, burst, muzzle, explosion, step };
}
