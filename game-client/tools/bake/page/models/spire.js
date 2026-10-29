// The Spire's entrance (FS-0XMCP §R15–§R17): one prop at the hub's north edge, beyond the map,
// showing only the front face and lower storeys of the tower runs climb. A gatehouse with a great
// pointed door, its portcullis raised and its leaves standing open on the dark, buttressed either
// side, set against the round tower, whose two lower storeys and arrow slits rise out of the
// camera's reach (HUB_CAMERA_MARGIN, src/render/world/hubKeepOut.ts): the top is never baked.
//
// Authored in code (ADR-0021) in the tower interior's stone (tower.js, FS-8RBQY), so the outside
// and the inside read as one building. One three.js unit is one tile edge (40 world px), +x is
// world +x, +z is world +y (toward the hub), +y is up. The origin is the foot of the threshold, the
// point the hub places the sprite on.
//
// Amber means interactable on the canvas: the door's two sconces and the warm glow on its
// threshold are the only amber here. Every other light is cold or none.

import * as THREE from "three";
import { fbm, rng, smoothstep } from "../noise.js";
import { color, mix, shade } from "../palette.js";
import { materials, mkCanvas, plain, textured, pixelTexture } from "../materials.js";
import { part } from "./util.js";
import { PX, masonry, roughBox, stoneMat, towerMaterials } from "./tower.js";

// ── Dimensions (tile edges) ─────────────────────────────────────────────────────────
// The tower's radius, centre (z) and baked height. TOWER_H is what HubScene's camera reach is
// checked against (manifest.test.ts): its rim must stand above the reach at every position.
const TOWER_R = 3.6;
const TOWER_Z = -5.6;
const TOWER_H = 12.4;
/** How much narrower the drum is at TOWER_H than at its foot: it tapers toward the spire. */
const TAPER = 0.62;
/** The drum's radius at height `y`. */
const radiusAt = (y) => TOWER_R - TAPER * (y / TOWER_H);
/** The gatehouse: half its width, its height, and the depth of its front wall. */
const GATE_HALF = 2.8;
const GATE_H = 6.2;
const GATE_FRONT = -0.6;
const WALL = 0.6;
/** The great door: half its width, the springing of its arch, the arch's radius. */
const DOOR_HALF = 1.25;
const DOOR_SPRING = 2.5;
const DOOR_ARC = 1.9;
/** The threshold's top, and the three steps down to the map's edge (z 1.5, world y 0). */
const SILL = 0.54;
const STEP = 0.5;
/** The two storeys' string courses on the tower. */
const STOREYS = [6.6, 9.6];

/** The door's sconces: either side of the arch, this high. */
const SCONCE_X = 2.05;
const SCONCE_Y = 3.1;

/** Where the door's warm pool sits, on its threshold (the manifest light). */
export const DOOR_LIGHT = [0, 1.1, GATE_FRONT + 0.2];

// ── Palette (BARROW blends only) ─────────────────────────────────────────────────────
const SLOT = mix("pitch", "charcoal", 0.4);
const IRON = mix("charcoal", "slate", 0.35);

let SPIRE = null;

/** The facade's own materials, built once per bake (seeded, so deterministic). */
function spireMaterials() {
  if (SPIRE) return SPIRE;
  const T = towerMaterials();
  // the gatehouse front: one masonry face over its whole width, soot above both sconces
  const sconceY = Math.round(SCONCE_Y * PX);
  const front = masonry(Math.round(PX * GATE_HALF * 2), Math.round(PX * GATE_H), {
    key: 5500,
    seed: 17,
    course: [30, 44],
    block: [48, 96],
    soot: [-1, 1].map((s) => ({ x: Math.round((GATE_HALF + s * SCONCE_X) * PX), y: sconceY, r: 30 })),
    grime: 0.75,
    damp: 0.55,
    moss: 0.4,
    flaws: 6,
  });
  // the tower: a face that repeats round the drum, with no foot or fade of its own (the drum's
  // vertex colours carry the grime at its foot and the dark it climbs into)
  const drum = masonry(512, 512, { key: 5500, seed: 23, course: [30, 44], block: [48, 96], grime: 0, damp: 0.7, flaws: 5 });
  for (const t of [drum.map, drum.bump]) t.repeat.set(6, TOWER_H / 4);
  const side = masonry(Math.round(PX * 3), Math.round(PX * GATE_H), { key: 5510, seed: 29, course: [30, 44], block: [48, 96], grime: 0.7, damp: 0.6, moss: 0.3 });
  // light dressed stone for the arch's voussoirs, the string courses, sills and lintels
  const dressed = masonry(256, 256, { key: 5350, seed: 31, course: [40, 60], block: [50, 90], lift: 1.15, grime: 0, damp: 0.2, flaws: 2 });
  // the threshold's warm wash: amber at the door, gone by the top step
  const wash = mkCanvas(128, 128);
  const ctx = wash.getContext("2d");
  const grad = ctx.createRadialGradient(64, 0, 4, 64, 0, 120);
  const [r, g, b] = mix("amber", "amberBright", 0.25).map((v) => Math.round(v));
  grad.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
  grad.addColorStop(0.45, `rgba(${r},${g},${b},0.35)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const washTex = new THREE.CanvasTexture(wash);
  washTex.colorSpace = THREE.SRGBColorSpace;
  SPIRE = {
    front,
    frontMat: stoneMat(front, { bump: 1.5 }),
    drum: stoneMat(drum, { bump: 1.4, vc: true }),
    side: stoneMat(side, { bump: 1.4 }),
    dressed: stoneMat(dressed, { bump: 1.3 }),
    reveal: T.dark,
    slot: plain(SLOT, { rough: 1 }),
    void: new THREE.MeshBasicMaterial({ color: color("pitch") }),
    passage: stoneMat(masonry(128, 128, { key: 5330, course: [30, 44], block: [50, 90], lift: 0.3, grime: 0, flaws: 0 }), { bump: 1 }),
    // the sconces' fire: amber, held below white so it keeps its hue through the tone map
    flame: new THREE.MeshStandardMaterial({ color: color("pitch"), emissive: color("amber"), emissiveIntensity: 1.05 }),
    iron: textured(
      pixelTexture(64, 64, (x, y) => shade(IRON, 0.75 + 0.4 * fbm(x / 6, y / 6, 5801)), 1),
      { metal: 0.6, rough: 0.65 },
    ),
    wash: new THREE.MeshBasicMaterial({ map: washTex, transparent: true, depthWrite: false }),
    flags: T.dark,
  };
  return SPIRE;
}

// ── Shapes ───────────────────────────────────────────────────────────────────────────

/**
 * A pointed (two-centred) arch's outline, from the left springing up to the apex and down to the
 * right: `half` its half-width, `spring` the springing's height, `arc` each side's radius.
 */
function archOutline(half, spring, arc, n = 14) {
  const cx = arc - half; // each side's centre lies inside the opening, on the springing line
  const top = Math.acos(-cx / arc);
  const left = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (Math.PI - top) * (i / n);
    left.push([cx + arc * Math.cos(a), spring + arc * Math.sin(a)]);
  }
  const right = left
    .slice(0, -1)
    .reverse()
    .map(([x, y]) => [-x, y]);
  return [[-half, 0], ...left, ...right, [half, 0]];
}

const shapeOf = (pts) => {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return s;
};

const pathOf = (pts) => {
  const p = new THREE.Path();
  pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
  p.closePath();
  return p;
};

/** A material showing the part of a face texture an extruded shape's cap spans (UVs in units). */
function capOf(tex, x0, width, height, bump = 1.5) {
  const cut = (src) => {
    const c = src.clone();
    c.repeat.set(1 / width, 1 / height);
    c.offset.set(-x0 / width, 0);
    c.needsUpdate = true;
    return c;
  };
  return stoneMat({ map: cut(tex.map), bump: cut(tex.bump) }, { bump });
}

/** Extrudes `shape` by `depth` toward +z, its front cap at `front`. */
function slab(shape, depth, materials, front) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  return part(geo, materials, { z: front - depth });
}

// ── The parts ────────────────────────────────────────────────────────────────────────

/** The round tower: a battered plinth, the drum, two string courses and its arrow slits. */
function tower(g, S, T) {
  const segs = 72;
  const geo = new THREE.CylinderGeometry(radiusAt(TOWER_H), TOWER_R, TOWER_H, segs, 24, false, Math.PI);
  geo.translate(0, TOWER_H / 2, 0);
  // grime at the foot, and the drum darkening as it climbs out of the hub's light
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const foot = 0.62 + 0.38 * smoothstep(0, 1.6, y);
    const dusk = 1 - 0.55 * smoothstep(5.5, TOWER_H, y);
    const v = foot * dusk;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const drum = new THREE.Mesh(geo, S.drum);
  drum.position.z = TOWER_Z;
  g.add(drum);
  // a battered plinth round its foot
  g.add(part(new THREE.CylinderGeometry(TOWER_R + 0.02, TOWER_R + 0.42, 1.1, segs, 1, true, Math.PI), T.block, { y: 0.55, z: TOWER_Z }));
  g.add(part(new THREE.CylinderGeometry(TOWER_R + 0.08, TOWER_R + 0.1, 0.14, segs, 1, false, Math.PI), S.dressed, { y: 1.15, z: TOWER_Z }));
  // string courses at the storeys
  for (const y of STOREYS) {
    const r = radiusAt(y);
    g.add(part(new THREE.CylinderGeometry(r + 0.12, r + 0.12, 0.2, segs, 1, false, Math.PI), S.dressed, { y, z: TOWER_Z }));
    g.add(part(new THREE.CylinderGeometry(r + 0.05, r + 0.12, 0.12, segs, 1, true, Math.PI), S.dressed, { y: y - 0.16, z: TOWER_Z }));
  }
  // arrow slits: low beside the gatehouse, then up the two storeys
  const slits = [
    [-58, 2.7],
    [58, 2.7],
    [-30, 7.4],
    [0, 7.6],
    [30, 7.4],
    [-44, 10.5],
    [-14, 10.7],
    [16, 10.7],
    [46, 10.5],
  ];
  for (const [deg, y] of slits) slit(g, S, (deg * Math.PI) / 180, y, 1.25);
}

/** One arrow slit in the drum at angle `phi` from the front, its foot at `y`, `h` tall. */
function slit(g, S, phi, y, h) {
  const r = radiusAt(y + h / 2);
  const at = (d) => ({ x: Math.sin(phi) * (r + d), z: TOWER_Z + Math.cos(phi) * (r + d), ry: phi });
  // dressed jambs, a lintel and a sill, a hand's breadth of dark between
  g.add(part(new THREE.BoxGeometry(0.1, h, 0.04), S.slot, { y: y + h / 2, ...at(0.01) }));
  for (const s of [-1, 1]) {
    const side = { x: Math.cos(phi) * 0.11 * s, z: -Math.sin(phi) * 0.11 * s };
    const p = at(0.02);
    g.add(part(new THREE.BoxGeometry(0.12, h + 0.1, 0.06), S.dressed, { y: y + h / 2, x: p.x + side.x, z: p.z + side.z, ry: phi }));
  }
  g.add(part(roughBox(0.42, 0.16, 0.1, Math.round(phi * 100) + 7, 0.05), S.dressed, { y: y + h + 0.08, ...at(0.03) }));
  g.add(part(roughBox(0.36, 0.1, 0.12, Math.round(phi * 100) + 9, 0.05), S.dressed, { y: y - 0.05, ...at(0.03) }));
}

/** The gatehouse: its pierced front wall, body, arch, parapet, the door and the dark beyond. */
function gatehouse(g, S, T, M) {
  const W = GATE_HALF * 2;
  const arch = archOutline(DOOR_HALF, DOOR_SPRING, DOOR_ARC);
  const apex = Math.max(...arch.map(([, y]) => y));

  // the front wall, pierced by the door; its reveal in dark stone
  const outline = shapeOf([
    [-GATE_HALF, 0],
    [GATE_HALF, 0],
    [GATE_HALF, GATE_H],
    [-GATE_HALF, GATE_H],
  ]);
  outline.holes.push(pathOf(arch));
  const face = capOf(S.front, -GATE_HALF, W, GATE_H);
  g.add(slab(outline, WALL, [face, S.reveal], GATE_FRONT));

  // the body behind it, back into the drum
  const back = TOWER_Z + Math.sqrt(TOWER_R * TOWER_R - GATE_HALF * GATE_HALF) - 0.3;
  const depth = GATE_FRONT - WALL - back;
  // in three blocks round the passage: [+x, -x, +y, -y, +z, -z] faces, the passage's in dark stone
  const bz = back + depth / 2;
  const sideW = GATE_HALF - DOOR_HALF;
  for (const s of [-1, 1]) {
    const faces = [S.side, S.side, T.cap, T.cap, S.side, S.side];
    faces[s < 0 ? 0 : 1] = S.passage;
    g.add(part(new THREE.BoxGeometry(sideW, GATE_H, depth), faces, { x: s * (DOOR_HALF + sideW / 2), y: GATE_H / 2, z: bz }));
  }
  g.add(part(new THREE.BoxGeometry(DOOR_HALF * 2, GATE_H - apex, depth), [S.side, S.side, T.cap, S.passage, S.side, S.side], { y: (GATE_H + apex) / 2, z: bz }));

  // the passage: a floor at the threshold's height running into the black
  g.add(part(new THREE.BoxGeometry(DOOR_HALF * 2, SILL, depth), T.dark, { y: SILL / 2, z: bz }));
  g.add(part(new THREE.PlaneGeometry(DOOR_HALF * 2, apex), S.void, { y: apex / 2, z: GATE_FRONT - WALL - 1.3 }));

  // the arch's voussoirs: two orders, the outer standing proudest, and a keystone
  for (const [grow, proud, seed] of [
    [0.24, 0.05, 1],
    [0.46, 0.1, 2],
  ]) {
    const inner = archOutline(DOOR_HALF + grow - 0.22, DOOR_SPRING, DOOR_ARC + grow - 0.22);
    const outer = archOutline(DOOR_HALF + grow, DOOR_SPRING, DOOR_ARC + grow);
    const ring = shapeOf(outer);
    ring.holes.push(pathOf(inner));
    g.add(slab(ring, proud + 0.02, [S.dressed, S.dressed], GATE_FRONT + proud));
    // jambs below the springing on each side of this order
    for (const s of [-1, 1])
      g.add(part(roughBox(0.22, DOOR_SPRING, proud + 0.02, seed * 10 + s + 20, 0.03), S.dressed, { x: s * (DOOR_HALF + grow - 0.11), y: DOOR_SPRING / 2, z: GATE_FRONT + (proud + 0.02) / 2 - 0.01 }));
  }
  g.add(part(roughBox(0.34, 0.46, 0.16, 61, 0.05), S.dressed, { y: apex + 0.34, z: GATE_FRONT + 0.06 }));

  // the portcullis, raised: its spiked foot hanging in the arch's head
  const pz = GATE_FRONT - 0.32;
  const foot = 3.3;
  for (let x = -1.1; x <= 1.11; x += 0.22) {
    g.add(part(new THREE.BoxGeometry(0.055, 1.8, 0.055), S.iron, { x, y: foot + 0.9, z: pz }));
    g.add(part(new THREE.ConeGeometry(0.04, 0.2, 4), S.iron, { x, y: foot - 0.1, z: pz, rx: Math.PI }));
  }
  for (const y of [foot + 0.2, foot + 0.62, foot + 1.04]) g.add(part(new THREE.BoxGeometry(2.4, 0.055, 0.065), S.iron, { y, z: pz }));

  // the doors: iron-banded leaves standing open on the dark, swung back against the passage
  const leaf = archOutline(DOOR_HALF - 0.03, DOOR_SPRING, DOOR_ARC - 0.03).filter(([x]) => x <= 0.001);
  for (const s of [-1, 1]) {
    const pts = leaf.map(([x, y]) => [(x + DOOR_HALF - 0.03) * 1, y]);
    const shape = shapeOf([...pts, [0.001, 0]]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false, curveSegments: 1 });
    geo.translate(0, 0, -0.05);
    if (s > 0) geo.scale(-1, 1, 1);
    const door = new THREE.Group();
    door.add(new THREE.Mesh(geo, [T.oldWoodDark, T.oldWoodDark]));
    // three straps and a ring
    for (const y of [0.5, 1.45, 2.4])
      door.add(part(new THREE.BoxGeometry(DOOR_HALF - 0.08, 0.08, 0.13), S.iron, { x: -s * (DOOR_HALF - 0.08) / 2, y, z: 0 }));
    door.add(part(new THREE.TorusGeometry(0.08, 0.016, 5, 10), S.iron, { x: -s * (DOOR_HALF - 0.3), y: 1.3, z: 0.07 }));
    door.position.set(s * (DOOR_HALF - 0.04), SILL - 0.01, GATE_FRONT - WALL + 0.02);
    door.rotation.y = s * -0.85;
    g.add(door);
  }

  // the threshold: a worn slab under the arch, and the warm wash spilling over it
  g.add(part(roughBox(DOOR_HALF * 2 + 0.5, SILL, 0.95, 71, 0.04), T.blockLight, { y: SILL / 2, z: GATE_FRONT + 0.1 }));
  g.add(part(new THREE.PlaneGeometry(DOOR_HALF * 2.4, 1.6), S.wash, { y: SILL + 0.012, z: GATE_FRONT + 0.15, rx: -Math.PI / 2 }));

  // the sconces either side of the door: iron cages, burning amber
  for (const s of [-1, 1]) {
    const x = s * SCONCE_X;
    const fy = SCONCE_Y;
    const fz = GATE_FRONT + 0.28;
    g.add(part(new THREE.BoxGeometry(0.12, 0.26, 0.03), T.rust, { x, y: fy - 0.44, z: GATE_FRONT + 0.015 }));
    g.add(part(new THREE.BoxGeometry(0.035, 0.035, 0.26), M.iron, { x, y: fy - 0.36, z: GATE_FRONT + 0.14 }));
    g.add(part(new THREE.CylinderGeometry(0.075, 0.045, 0.13, 8, 1, true), M.ironDouble, { x, y: fy - 0.27, z: fz }));
    g.add(part(new THREE.TorusGeometry(0.075, 0.011, 5, 12), M.iron, { x, y: fy - 0.21, z: fz, rx: Math.PI / 2 }));
    g.add(part(new THREE.SphereGeometry(0.055, 7, 5), M.coal, { x, y: fy - 0.12, z: fz }));
    g.add(part(new THREE.ConeGeometry(0.085, 0.32, 8), S.flame, { x, y: fy + 0.03, z: fz }));
    g.add(part(new THREE.ConeGeometry(0.05, 0.2, 7), S.flame, { x: x + 0.02, y: fy + 0.12, z: fz + 0.01, rz: 0.15 }));
  }

  // two slits over the door
  for (const s of [-1, 1]) {
    const x = s * 1.95;
    g.add(part(new THREE.BoxGeometry(0.1, 0.8, 0.02), S.slot, { x, y: 4.95, z: GATE_FRONT + 0.01 }));
    g.add(part(roughBox(0.4, 0.14, 0.08, 80 + s, 0.05), S.dressed, { x, y: 5.42, z: GATE_FRONT + 0.03 }));
    g.add(part(roughBox(0.34, 0.09, 0.1, 82 + s, 0.05), S.dressed, { x, y: 4.5, z: GATE_FRONT + 0.03 }));
  }

  // a corbel table under the parapet, then the parapet and its merlons along the front and sides
  const R = rng(5811);
  for (let x = -GATE_HALF + 0.2; x <= GATE_HALF - 0.19; x += 0.4)
    g.add(part(roughBox(0.18, 0.24, 0.2, Math.floor(R() * 1000), 0.06), S.dressed, { x, y: GATE_H - 0.42, z: GATE_FRONT + 0.08 }));
  const PAR = 0.5;
  g.add(part(new THREE.BoxGeometry(W + 0.24, PAR, 0.3), [S.side, S.side, T.cap, T.cap, S.frontMat, S.frontMat], { y: GATE_H - 0.3 + PAR / 2, z: GATE_FRONT + 0.02 }));
  for (const s of [-1, 1])
    g.add(part(new THREE.BoxGeometry(0.3, PAR, depth + WALL), [S.side, S.side, T.cap, T.cap, S.side, S.side], { x: s * (GATE_HALF - 0.03), y: GATE_H - 0.3 + PAR / 2, z: back + (depth + WALL) / 2 }));
  const merlon = (x, z, ry = 0) =>
    g.add(part(roughBox(0.5, 0.55, 0.3, Math.floor(R() * 1000), 0.03), S.side, { x, y: GATE_H + 0.2 + 0.27, z, ry }));
  for (let x = -GATE_HALF + 0.13; x <= GATE_HALF; x += 0.9) merlon(x + 0.12, GATE_FRONT + 0.02);
  for (const s of [-1, 1]) for (let z = GATE_FRONT - 0.9; z > back; z -= 0.9) merlon(s * (GATE_HALF - 0.03), z, Math.PI / 2);
}

/** A stepped buttress at a front corner of the gatehouse, its weatherings sloping to the wall. */
function buttress(g, S, T, x) {
  const w = 0.82;
  // profile in (z, y): forward from the wall at GATE_FRONT, two stages with sloped tops
  const f = GATE_FRONT;
  const profile = [
    [f - 0.3, 0],
    [f + 1.05, 0],
    [f + 1.05, 2.7],
    [f + 0.6, 3.3],
    [f + 0.6, 5.0],
    [f - 0.3, 5.95],
  ];
  const shape = shapeOf(profile.map(([z, y]) => [z, y]));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false, curveSegments: 1 });
  // the profile is drawn in its own (x = z, y) plane: turn it so its extrusion runs along x
  geo.rotateY(-Math.PI / 2);
  geo.translate(x + w / 2, 0, 0);
  // faces and sides share one masonry; the shape's cap UVs are (z, y) in units
  const cap = stoneMat(
    (() => {
      const t = masonry(Math.round(PX * 1.4), Math.round(PX * 6), { key: 5700, seed: x > 0 ? 3 : 4, course: [30, 44], block: [56, 60], grime: 0.75, moss: 0.4, damp: 0.5 });
      for (const tx of [t.map, t.bump]) {
        tx.repeat.set(1 / 1.4, 1 / 6);
        tx.offset.set(-(f - 0.3) / 1.4, 0);
      }
      return t;
    })(),
    { bump: 1.5 },
  );
  g.add(new THREE.Mesh(geo, [cap, S.side]));
  // dressed copings on the two weatherings, and a plinth at the foot
  g.add(part(roughBox(w + 0.08, 0.1, 0.78, Math.round(x * 10) + 5, 0.04), S.dressed, { x, y: 3.02, z: f + 0.83, rx: 0.93 }));
  g.add(part(roughBox(w + 0.08, 0.1, 1.34, Math.round(x * 10) + 6, 0.04), S.dressed, { x, y: 5.5, z: f + 0.15, rx: 0.81 }));
  g.add(part(roughBox(w + 0.16, 0.42, 1.5, Math.round(x * 10) + 7, 0.05), T.block, { x, y: 0.03 + 0.21, z: f + 0.4 }));
}

/** The threshold's three steps down to the map's edge, worn hollow in the middle. */
function steps(g, T) {
  for (let k = 1; k <= 3; k++) {
    const top = SILL - 0.135 * k;
    const half = DOOR_HALF + 0.35 + 0.2 * k;
    const z0 = GATE_FRONT + 0.575 + (k - 1) * STEP;
    // each step laid in three or four stones
    const R = rng(5820 + k);
    let x = -half;
    while (x < half - 0.05) {
      const w = Math.min(half - x, 0.7 + R() * 0.5);
      g.add(part(roughBox(w - 0.03, top, STEP + 0.06, Math.floor(R() * 1000), 0.05), T.blockLight, { x: x + w / 2, y: top / 2, z: z0 + STEP / 2 }));
      x += w;
    }
  }
}

/** Flagstones round the foot of it all, laid in courses, ragged at the ends where the ground takes over. */
function forecourt(g, S) {
  const R = rng(5830);
  const D = 0.5;
  for (let row = 0; row < 9; row++) {
    const z = GATE_FRONT + 1.85 - row * D;
    const reach = 4.6 - 0.25 * Math.max(0, 2 - row) - R() * 0.9;
    let x = -reach - R() * 0.4;
    while (x < reach) {
      const w = Math.min(reach - x, 0.38 + R() * 0.45);
      const cx = x + w / 2;
      x += w;
      // under the steps and the threshold the stone is already laid; inside the drum, none shows
      if (Math.abs(cx) < DOOR_HALF + 1.05 && z > GATE_FRONT - 0.3) continue;
      if (Math.hypot(cx, z - TOWER_Z) < TOWER_R + 0.25) continue;
      // a stone or two lost at the ragged ends
      if (Math.abs(cx) > reach - 1 && R() < 0.35) continue;
      g.add(part(roughBox(w - 0.035, 0.06, D - 0.035, Math.floor(R() * 1000), 0.1, 2), S.flags, { x: cx, y: 0.03, z: z + (R() - 0.5) * 0.03, ry: (R() - 0.5) * 0.05 }));
    }
  }
}

/**
 * Shallow pilaster strips up the drum between its slits, tapering with it, so it reads as a
 * spire climbing out of sight rather than a squat keep.
 */
function strips(g, S) {
  for (const deg of [-70, -22, 22, 70]) {
    const phi = (deg * Math.PI) / 180;
    const lean = Math.atan2(TAPER, TOWER_H);
    const y = 1.1 + (TOWER_H - 1.1) / 2;
    const mid = radiusAt(y) + 0.06;
    const strip = part(new THREE.BoxGeometry(0.36, TOWER_H - 1.1, 0.14), S.side, {
      x: Math.sin(phi) * mid,
      y,
      z: TOWER_Z + Math.cos(phi) * mid,
      ry: phi,
      rx: -lean,
    });
    // turn to face out first, then lean in with the taper
    strip.rotation.order = "YXZ";
    g.add(strip);
  }
}

/** The Spire's entrance (FS-0XMCP §R15): the whole prop, origin at the threshold's foot. */
export function spireFacade() {
  const T = towerMaterials();
  const S = spireMaterials();
  const M = materials();
  const g = new THREE.Group();
  forecourt(g, S);
  tower(g, S, T);
  strips(g, S);
  gatehouse(g, S, T, M);
  for (const s of [-1, 1]) buttress(g, S, T, s * GATE_HALF);
  steps(g, T);
  return g;
}
