// Bot bodies: a low-poly soldier built from boxes and one sphere, in team
// colours. The proportions are not decoration: the combat code tests shots
// against a head sphere at 1.62 m and a torso box centred at 1.06 m, and the
// model is built to those same numbers, so a shot that looks like a headshot
// is one. Walk cycles swing the limbs; a death tips the whole group over.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const unitBox = new THREE.BoxGeometry(1, 1, 1);

function part(geometry, material, x, y, z, sx, sy, sz) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

export function createBotMesh(team) {
  const teamColour = team === 'atk' ? PALETTE.accent : PALETTE.foe;
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'atk' ? '#4c4438' : '#3d4149'), roughness: 0.95 });
  const vest = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColour), roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a186'), roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.6, metalness: 0.3 });

  const group = new THREE.Group();

  // Legs pivot at the hip: each is a group at hip height with the mesh below.
  const legL = part(unitBox, cloth, 0, -0.39, 0, 0.16, 0.78, 0.2);
  const legR = part(unitBox, cloth, 0, -0.39, 0, 0.16, 0.78, 0.2);
  const legLGroup = new THREE.Group();
  legLGroup.position.set(-0.11, 0.78, 0);
  legLGroup.add(legL);
  const legRGroup = new THREE.Group();
  legRGroup.position.set(0.11, 0.78, 0);
  legRGroup.add(legR);
  group.add(legLGroup, legRGroup);

  const torso = part(unitBox, vest, 0, 1.09, 0, 0.52, 0.62, 0.28);
  const belt = part(unitBox, dark, 0, 0.8, 0, 0.5, 0.1, 0.27);
  group.add(torso, belt);

  const armLGroup = new THREE.Group();
  armLGroup.position.set(-0.33, 1.36, 0);
  const armL = part(unitBox, cloth, 0, -0.26, 0, 0.12, 0.56, 0.14);
  armLGroup.add(armL);
  const armRGroup = new THREE.Group();
  armRGroup.position.set(0.33, 1.36, 0);
  const armR = part(unitBox, cloth, 0, -0.26, 0, 0.12, 0.56, 0.14);
  armRGroup.add(armR);
  // Both arms reach forward to the rifle, the classic ready pose.
  armLGroup.rotation.x = -0.85;
  armRGroup.rotation.x = -1.05;
  armLGroup.rotation.z = 0.35;
  group.add(armLGroup, armRGroup);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
  head.position.set(0, 1.62, 0);
  head.castShadow = true;
  const helmet = part(unitBox, dark, 0, 1.7, 0, 0.36, 0.14, 0.36);
  group.add(head, helmet);

  const gun = part(unitBox, dark, 0.18, 1.24, -0.34, 0.07, 0.13, 0.66);
  group.add(gun);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0.18, 1.26, -0.7);
  group.add(muzzle);

  let walkPhase = 0;
  let fallT = 1; // 1 = upright

  return {
    group,
    muzzle,
    setHelmet(on) {
      helmet.visible = on;
    },
    // Advance the walk cycle by distance travelled; idle sways a little.
    animate(dt, speed, time) {
      walkPhase += dt * (4 + speed * 1.7);
      const swing = Math.min(1, speed / 3) * 0.55;
      legLGroup.rotation.x = Math.sin(walkPhase) * swing;
      legRGroup.rotation.x = -Math.sin(walkPhase) * swing;
      const bob = Math.abs(Math.sin(walkPhase)) * 0.03 * Math.min(1, speed / 3);
      group.position.y = bob + (fallT < 1 ? 0 : 0);
      armLGroup.rotation.x = -0.85 + Math.sin(time * 1.3) * 0.02;
    },
    setCrouch(on) {
      group.scale.y = on ? 0.78 : 1;
    },
    // Tip the body over: 0 upright, 1 flat. Driven by the bot's death timer.
    setFall(t) {
      fallT = t;
      group.rotation.x = -t * 1.5;
      group.position.y = -t * 0.25;
    },
    reset() {
      fallT = 1;
      group.rotation.x = 0;
      group.position.y = 0;
      group.scale.y = 1;
    },
  };
}

// The breach charge: a slab with a keypad and a light that blinks faster as
// the fuse burns down. Carried on a back, dropped on the ground, or planted.
export function createChargeMesh() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.5, metalness: 0.4 });
  const body = new THREE.Mesh(unitBox, bodyMat);
  body.scale.set(0.42, 0.3, 0.16);
  body.position.y = 0.15;
  body.castShadow = true;
  const lightMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.foe), emissive: new THREE.Color(PALETTE.foe), emissiveIntensity: 2,
  });
  const lamp = new THREE.Mesh(unitBox, lightMat);
  lamp.scale.set(0.09, 0.05, 0.05);
  lamp.position.set(0, 0.33, 0);
  group.add(body, lamp);
  return {
    group,
    setBlink(on, fast) {
      lightMat.emissiveIntensity = on ? (fast ? 3.2 : 1.6) : 0.15;
      lamp.visible = true;
    },
  };
}
