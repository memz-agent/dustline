// Kestrel Depot: the one map. A walled freight yard, 52 by 38 metres, with a
// crate yard (site A) in the west, a warehouse (site B) in the east, a split
// middle, and lanes down both flanks. The layout is data: every box below is
// drawn, collided with, pathed around and shot at from the same numbers, so
// what the player sees is exactly what the bots navigate.
//
// Coordinates: x east, z south. Attackers (Wardens) spawn in the south,
// defenders (Vultures) in the north near the sites they hold.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const BOUNDS = { minX: -26, maxX: 26, minZ: -19, maxZ: 19 };

// [centreX, centreZ, width, depth, height, paletteKey]
const BOXES = [
  // Perimeter.
  [0, -19.3, 54.6, 0.6, 4.2, 'surface'],
  [0, 19.3, 54.6, 0.6, 4.2, 'surface'],
  [-26.3, 0, 0.6, 39.2, 4.2, 'surface'],
  [26.3, 0, 0.6, 39.2, 4.2, 'surface'],
  // Site A yard walls (west).
  [-17, -15.5, 13, 0.5, 3.4, 'surface'],
  [-23.5, -10, 0.5, 11, 3.4, 'surface'],
  [-10.5, -13, 0.5, 5, 3.4, 'surface'],
  [-20, -4.5, 7, 0.5, 3.4, 'surface'],
  // Site A crates.
  [-18.5, -9, 1.6, 1.6, 1.15, 'crate'],
  [-15, -11.5, 1.6, 1.6, 2.3, 'crate'],
  [-19.5, -12.5, 2.2, 1.1, 1.15, 'crate'],
  [-13.5, -7, 1.2, 1.2, 1.15, 'sand'],
  // Site B warehouse walls (east).
  [17, -15.5, 13, 0.5, 3.6, 'surface'],
  [23.5, -10, 0.5, 11, 3.6, 'surface'],
  [10.5, -13, 0.5, 5, 3.6, 'surface'],
  [13, -4.5, 5, 0.5, 3.6, 'surface'],
  [20.5, -4.5, 6, 0.5, 3.6, 'surface'],
  [17, -10, 1.2, 1.2, 3.6, 'hairline'],
  // Site B crates.
  [13.5, -12, 1.6, 1.6, 1.15, 'crate'],
  [20, -7.5, 2.2, 1.1, 1.15, 'crate'],
  [14, -7, 1.2, 1.2, 2.3, 'crate'],
  // The split middle: two long walls with a six-metre gap between them.
  [0, -10, 0.6, 12, 3.2, 'surface'],
  [0, 8, 0.6, 12, 3.2, 'surface'],
  [-3.5, -1, 1.6, 1.6, 1.15, 'crate'],
  [3.5, -1, 1.6, 1.6, 1.15, 'crate'],
  // Connector walls shaping the southern lanes.
  [-9, 2, 0.5, 12, 3.0, 'surface'],
  [9, 2, 0.5, 12, 3.0, 'surface'],
  // Containers and cover in the open ground.
  [-21, 10, 6, 2.4, 2.6, 'crate'],
  [21, 10, 6, 2.4, 2.6, 'crate'],
  [-16, 8, 1.6, 1.6, 2.3, 'crate'],
  [16, 8, 1.6, 1.6, 2.3, 'crate'],
  [-6, 13, 1.6, 1.6, 1.15, 'sand'],
  [6, 13, 1.6, 1.6, 1.15, 'sand'],
  [0, 16, 2.4, 1.2, 1.15, 'crate'],
  [-24, 2, 1.4, 1.4, 1.15, 'sand'],
  [24, 2, 1.4, 1.4, 1.15, 'sand'],
  [-4, -16.8, 1.4, 1.4, 1.15, 'sand'],
  [4, -16.8, 1.4, 1.4, 1.15, 'sand'],
  // Planter scrub along the fence line, for a single note of green.
  [-25, -17, 1.6, 1.2, 0.8, 'leaf'],
  [25, 17, 1.6, 1.2, 0.8, 'leaf'],
  [-25, 17, 1.6, 1.2, 0.8, 'leaf'],
];

export const SITES = [
  { id: 'A', x: -17, z: -10, r: 4.4 },
  { id: 'B', x: 17, z: -10, r: 4.4 },
];

export const SPAWNS = {
  atk: [
    { x: -3, z: 15.5, yaw: 0 },
    { x: 0, z: 16.8, yaw: 0 },
    { x: 3, z: 15.5, yaw: 0 },
  ],
  def: [
    { x: -13, z: -16.8, yaw: Math.PI },
    { x: 0, z: -17.2, yaw: Math.PI },
    { x: 13, z: -16.8, yaw: Math.PI },
  ],
};

// Where defenders set up, per site, and where attackers hold after a plant.
export const HOLD_POINTS = {
  A: [
    { x: -20.5, z: -6.2, face: { x: -12, z: -2 } },
    { x: -12.2, z: -12.2, face: { x: -16, z: -6 } },
  ],
  B: [
    { x: 20.5, z: -13.2, face: { x: 14, z: -6 } },
    { x: 12.2, z: -6.4, face: { x: 18, z: -12 } },
  ],
  mid: [{ x: 2.6, z: -3.4, face: { x: 0, z: 4 } }],
};
export const PLANT_COVER = {
  A: [
    { x: -21, z: -12.8, face: { x: -12, z: -8 } },
    { x: -12.8, z: -8.6, face: { x: -20, z: -12 } },
  ],
  B: [
    { x: 21.5, z: -6.2, face: { x: 13, z: -10 } },
    { x: 12.8, z: -13.4, face: { x: 20, z: -7 } },
  ],
};

function letterTexture(letter, colour) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.font = '700 190px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = colour;
  g.globalAlpha = 0.85;
  g.fillText(letter, 128, 140);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

export function createMap(scene) {
  const colliders = BOXES.map(([x, z, w, d, h]) => ({
    minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h,
  }));

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'foe' ? 0.55 : 0.93,
      metalness: 0.04,
    });
  }
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const group = new THREE.Group();
  scene.add(group);

  const ground = new THREE.Mesh(new THREE.BoxGeometry(54.6, 0.4, 40.6), materials.sand);
  ground.position.set(0, -0.2, 0);
  ground.receiveShadow = true;
  group.add(ground);
  colliders.push({ minX: -27.3, maxX: 27.3, minZ: -20.3, maxZ: 20.3, h: 0, floor: true });

  for (let i = 0; i < BOXES.length; i += 1) {
    const [x, z, w, d, h, mat] = BOXES[i];
    const mesh = new THREE.Mesh(unitBox, materials[mat]);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Site markings: a painted ring and letter on the ground at each site.
  for (const site of SITES) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.35, site.r, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.02, site.z);
    group.add(ring);
    const letter = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.4),
      new THREE.MeshBasicMaterial({ map: letterTexture(site.id, PALETTE.accent), transparent: true, opacity: 0.8, depthWrite: false }),
    );
    letter.rotation.x = -Math.PI / 2;
    letter.position.set(site.x, 0.03, site.z);
    group.add(letter);
  }

  // Yard light poles: a post and an emissive head. No real light per pole (one
  // directional does the work); the heads just read as the light source.
  const poleMaterial = materials.hairline;
  const headMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.ink), emissive: new THREE.Color(PALETTE.ink), emissiveIntensity: 1.6,
  });
  for (const [x, z] of [[-24, -17], [24, -17], [-24, 17], [24, 17], [0, -18]]) {
    const pole = new THREE.Mesh(unitBox, poleMaterial);
    pole.scale.set(0.18, 5.4, 0.18);
    pole.position.set(x, 2.7, z);
    const head = new THREE.Mesh(unitBox, headMaterial);
    head.scale.set(0.7, 0.16, 0.34);
    head.position.set(x, 5.45, z);
    group.add(pole, head);
  }

  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.muted), new THREE.Color(PALETTE.canvas), 1.3);
  scene.add(sky);
  scene.add(new THREE.AmbientLight(new THREE.Color('#fff2dd'), 0.3));
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffd9ae'), 2.1);
  sun.position.set(-18, 26, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -32;
  sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0007;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.7);
  fill.position.set(14, 10, -16);
  scene.add(fill);

  return { colliders, group, ...createQueries(colliders) };
}

function createQueries(colliders) {
  // ---- 2D helpers -------------------------------------------------------
  function circleHitsBox(x, z, r, c) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx;
    const dz = z - nz;
    return dx * dx + dz * dz < r * r;
  }

  // Move a ground actor by (dx, dz), one axis at a time, sliding on boxes.
  function slideMove(pos, dx, dz, radius) {
    if (dx !== 0) {
      const nx = pos.x + dx;
      let blocked = false;
      for (const c of colliders) {
        if (c.floor || c.h < 0.5) continue;
        if (circleHitsBox(nx, pos.z, radius, c)) { blocked = true; break; }
      }
      if (!blocked) pos.x = nx;
    }
    if (dz !== 0) {
      const nz = pos.z + dz;
      let blocked = false;
      for (const c of colliders) {
        if (c.floor || c.h < 0.5) continue;
        if (circleHitsBox(pos.x, nz, radius, c)) { blocked = true; break; }
      }
      if (!blocked) pos.z = nz;
    }
    pos.x = Math.max(BOUNDS.minX + radius, Math.min(BOUNDS.maxX - radius, pos.x));
    pos.z = Math.max(BOUNDS.minZ + radius, Math.min(BOUNDS.maxZ - radius, pos.z));
  }

  // Does the 2D segment pass through a box at all? Returns the [t0, t1] span.
  function segmentSpan(x0, z0, x1, z1, c) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    let t0 = 0;
    let t1 = 1;
    if (Math.abs(dx) < 1e-9) {
      if (x0 < c.minX || x0 > c.maxX) return null;
    } else {
      let ta = (c.minX - x0) / dx;
      let tb = (c.maxX - x0) / dx;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
    if (Math.abs(dz) < 1e-9) {
      if (z0 < c.minZ || z0 > c.maxZ) return null;
    } else {
      let ta = (c.minZ - z0) / dz;
      let tb = (c.maxZ - z0) / dz;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
    return [t0, t1];
  }

  // Height-aware sight line: a box blocks the view only where its top rises
  // above the line between the two eye heights, so a crouched defender behind
  // a 1.15 m crate is hidden from a standing attacker, and visible to nobody
  // is claimed wrongly.
  function sightBlocked(x0, z0, h0, x1, z1, h1) {
    for (const c of colliders) {
      if (c.floor || c.h < 0.85) continue;
      const span = segmentSpan(x0, z0, x1, z1, c);
      if (!span) continue;
      const tm = (span[0] + span[1]) / 2;
      const lineH = h0 + (h1 - h0) * tm;
      if (c.h > lineH - 0.04) return true;
    }
    return false;
  }

  // Path LOS uses the low boxes too: a path may not cut through a crate.
  function pathBlocked(x0, z0, x1, z1) {
    for (const c of colliders) {
      if (c.floor || c.h < 0.5) continue;
      if (segmentSpan(x0, z0, x1, z1, c)) return true;
    }
    return false;
  }

  // ---- 3D raycast against the box world --------------------------------
  const ray = { t: 0, x: 0, y: 0, z: 0, hit: false, floor: false };
  function raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist;
    let bestFloor = false;
    for (const c of colliders) {
      const minY = c.floor ? -0.4 : 0;
      const maxY = c.floor ? 0 : c.h;
      let tmin = 0;
      let tmax = best;
      // X slab
      if (Math.abs(dx) < 1e-9) { if (ox < c.minX || ox > c.maxX) continue; } else {
        let ta = (c.minX - ox) / dx; let tb = (c.maxX - ox) / dx;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        tmin = Math.max(tmin, ta); tmax = Math.min(tmax, tb);
        if (tmin > tmax) continue;
      }
      // Y slab
      if (Math.abs(dy) < 1e-9) { if (oy < minY || oy > maxY) continue; } else {
        let ta = (minY - oy) / dy; let tb = (maxY - oy) / dy;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        tmin = Math.max(tmin, ta); tmax = Math.min(tmax, tb);
        if (tmin > tmax) continue;
      }
      // Z slab
      if (Math.abs(dz) < 1e-9) { if (oz < c.minZ || oz > c.maxZ) continue; } else {
        let ta = (c.minZ - oz) / dz; let tb = (c.maxZ - oz) / dz;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        tmin = Math.max(tmin, ta); tmax = Math.min(tmax, tb);
        if (tmin > tmax) continue;
      }
      if (tmin < best) { best = tmin; bestFloor = !!c.floor; }
    }
    ray.t = best;
    ray.hit = best < maxDist;
    ray.floor = bestFloor;
    ray.x = ox + dx * best;
    ray.y = oy + dy * best;
    ray.z = oz + dz * best;
    return ray;
  }

  // ---- Navigation grid + A* --------------------------------------------
  const CELL = 1.0;
  const GW = Math.floor((BOUNDS.maxX - BOUNDS.minX) / CELL);
  const GH = Math.floor((BOUNDS.maxZ - BOUNDS.minZ) / CELL);
  const blocked = new Uint8Array(GW * GH);
  for (let gz = 0; gz < GH; gz += 1) {
    for (let gx = 0; gx < GW; gx += 1) {
      const cx = BOUNDS.minX + (gx + 0.5) * CELL;
      const cz = BOUNDS.minZ + (gz + 0.5) * CELL;
      for (const c of colliders) {
        if (c.floor || c.h < 0.5) continue;
        if (cx > c.minX - 0.45 && cx < c.maxX + 0.45 && cz > c.minZ - 0.45 && cz < c.maxZ + 0.45) {
          blocked[gz * GW + gx] = 1;
          break;
        }
      }
    }
  }
  const cellOf = (x, z) => [
    Math.max(0, Math.min(GW - 1, Math.floor((x - BOUNDS.minX) / CELL))),
    Math.max(0, Math.min(GH - 1, Math.floor((z - BOUNDS.minZ) / CELL))),
  ];
  const cellCentre = (gx, gz) => [BOUNDS.minX + (gx + 0.5) * CELL, BOUNDS.minZ + (gz + 0.5) * CELL];

  function nearestFree(gx, gz) {
    if (!blocked[gz * GW + gx]) return [gx, gz];
    for (let r = 1; r < 6; r += 1) {
      for (let dz = -r; dz <= r; dz += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const x = gx + dx;
          const z = gz + dz;
          if (x < 0 || z < 0 || x >= GW || z >= GH) continue;
          if (!blocked[z * GW + x]) return [x, z];
        }
      }
    }
    return [gx, gz];
  }

  // A* over the grid, then greedy line-of-sight smoothing, so bots walk
  // believable lines instead of hugging cell centres.
  function findPath(from, to) {
    const [sx, sz] = nearestFree(...cellOf(from.x, from.z));
    const [tx, tz] = nearestFree(...cellOf(to.x, to.z));
    const start = sz * GW + sx;
    const goal = tz * GW + tx;
    if (start === goal) return [{ x: to.x, z: to.z }];
    const came = new Int32Array(GW * GH).fill(-1);
    const gScore = new Float32Array(GW * GH).fill(Infinity);
    const closed = new Uint8Array(GW * GH);
    gScore[start] = 0;
    const open = [start];
    const heuristic = (i) => {
      const x = i % GW;
      const z = Math.floor(i / GW);
      return Math.hypot(x - tx, z - tz);
    };
    let found = false;
    while (open.length) {
      let bestIdx = 0;
      for (let i = 1; i < open.length; i += 1) {
        if (gScore[open[i]] + heuristic(open[i]) < gScore[open[bestIdx]] + heuristic(open[bestIdx])) bestIdx = i;
      }
      const current = open.splice(bestIdx, 1)[0];
      if (current === goal) { found = true; break; }
      if (closed[current]) continue;
      closed[current] = 1;
      const cx = current % GW;
      const cz = Math.floor(current / GW);
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dz === 0) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= GW || nz >= GH) continue;
          const ni = nz * GW + nx;
          if (blocked[ni] || closed[ni]) continue;
          if (dx !== 0 && dz !== 0 && (blocked[cz * GW + nx] || blocked[nz * GW + cx])) continue;
          const cost = gScore[current] + (dx !== 0 && dz !== 0 ? 1.414 : 1);
          if (cost < gScore[ni]) {
            gScore[ni] = cost;
            came[ni] = current;
            open.push(ni);
          }
        }
      }
    }
    if (!found) return [{ x: to.x, z: to.z }];
    const cells = [];
    let cursor = goal;
    while (cursor !== -1) {
      cells.push(cursor);
      cursor = came[cursor];
    }
    cells.reverse();
    const points = cells.map((i) => {
      const [x, z] = cellCentre(i % GW, Math.floor(i / GW));
      return { x, z };
    });
    points[points.length - 1] = { x: to.x, z: to.z };
    // Greedy smoothing: keep only the corners the walker actually turns at.
    const smooth = [points[0]];
    let anchor = 0;
    for (let i = 2; i < points.length; i += 1) {
      if (pathBlocked(points[anchor].x, points[anchor].z, points[i].x, points[i].z)) {
        smooth.push(points[i - 1]);
        anchor = i - 1;
      }
    }
    if (points.length > 1) smooth.push(points[points.length - 1]);
    return smooth;
  }

  return { slideMove, sightBlocked, pathBlocked, raycast, findPath };
}
