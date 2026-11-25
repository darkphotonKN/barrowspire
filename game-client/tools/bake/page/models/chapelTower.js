// The chapel's bell tower (FS-R4MYX §Change: The chapel moves to the far left and gains a bell
// tower, T24): one prop, `chapel_tower`, standing on the tower wall's 140 × 140 footprint against
// the chapel's west end. Authored in code (ADR-0020, ADR-0021) on the shared camera, key light and
// scale: one three.js unit is one tile edge (40 world px), +x is world +x, +z is world +y, +y is
// up, and the origin is the footprint's centre on the ground, the point the scene places it on.
//
// The chapel's own stone, from the chapel walls' material code (chapelBuilding.js): lime over
// coursed limestone, grime run down from the eaves, the string course and the sills, damp and moss
// at the foot, patches where the lime fell away; bare dressed limestone for the plinth, the
// quoins, the string course, the cornice and the openings' surrounds. From the ground:
//   the lower stage   a solid wall to the belfry's floor, one slit lancet in its south face (the
//                     face that stands free; the east face's lower stage is behind the chapel's
//                     roof)
//   the string course parting the stages
//   the belfry        open: a pointed opening in the south and the east face, the two the camera
//                     sees, and a dark bronze bell hanging behind each
//   the spire         a slate pyramid, the chapel roof's slate, kicked out to a small eave, its
//                     hips rolled in lead, an iron cross on its apex a little off true
// Nothing here is lit (T15), and the sheet bakes no ground shadow (the catalogue's `shadow: false`).
//
// Why a bell behind each opening. The camera looks down the footprint's diagonal, so what shows in
// the middle of an opening is not what stands behind its middle: it stands as far to the side as
// it stands back. A single bell hung on the tower's axis is seen through neither opening, only
// behind the corner between them. A bell is hung where each opening shows it (BELL.back).

import * as THREE from "three";
import { fbm, vnoise } from "../noise.js";
import { mix, shade } from "../palette.js";
import { materials, pixelTexture, plain, textured } from "../materials.js";
import { WALL_FOOT } from "../shadow.js";
import { part, rod, V3 } from "./util.js";
import { PX, roughBox, stoneMat } from "./tower.js";
import { archBand, box, chapelBuildingMaterials, dressedAt, lancetShape, limewash, piercedBody, slab } from "./chapelBuilding.js";

/** The footprint's side, the server's tower wall (T6): 140 world px. */
export const BELL_TOWER_FOOT = 3.5;
/** The shaft's side: the lime faces. The plinth and the spire's eave reach out to the footprint. */
export const BELL_TOWER_SHAFT = 3.24;

const HALF = BELL_TOWER_SHAFT / 2;
/** As thick as the chapel's walls. */
const THICK = WALL_FOOT.masonry;
const PLINTH = 0.4;
/**
 * How far the belfry stage stands over the chapel's ridge (7.8 edges): the string course's foot
 * 0.34 above it, so the roof crosses nothing of the stage (owner, 2026-11-25). The stage, the
 * spire and the cross keep their own measures above it; the height is the lower shaft's.
 */
const LIFT = 1.7;
/** The string course's top, the belfry's floor (its openings' sill) and the stonework's top (tile edges). */
const COURSE = 6.62 + LIFT;
const FLOOR = 7.0 + LIFT;
const TOP = 9.3 + LIFT;
/** A belfry opening: half its width, the arch radius, its sill and springing. */
const BELFRY = { half: 0.62, r: 1.0, sill: FLOOR, spring: 8.05 + LIFT };
/** The slit lancet in the lower stage. */
const SLIT = { half: 0.12, r: 0.3, sill: 3.0 + LIFT / 2, spring: 4.3 + LIFT / 2 };
/** A bell: its lip's radius, its lip and crown, and how far it hangs behind its opening's face. */
const BELL = { r: 0.34, lip: 7.46 + LIFT, crown: 8.22 + LIFT, back: 0.64 };
/** The spire: its eave's half-width and foot, where the kick meets the steep pitch, and its apex. */
const SPIRE = { eave: 1.72, foot: TOP + 0.05, kick: { half: 1.36, y: TOP + 0.52 }, apex: 12.5 + LIFT };
/** The cross: its foot on the finial's ball, its height, its arms' span. */
const CROSS = { foot: SPIRE.apex + 0.16, height: 0.74, span: 0.56 };

// ── Palette (BARROW blends only) ─────────────────────────────────────────────────────────

/** The bell: bronze darkened and gone green at the lip. */
const BRONZE = mix(mix(mix("brass", "barrowDeep", 0.6), "charcoal", 0.45), "necrotic", 0.2);
/** The belfry's inside: lime gone grey with a century of bird and weather. */
const INSIDE = mix(mix("vellum", "slate", 0.48), "barrowDeep", 0.14);
/** The quoins: bare limestone between the dressings' grey-buff and the lime, so the corners read without striping the shaft. */
const QUOIN = mix(mix(mix("slateLight", "vellumDark", 0.55), "vellum", 0.18), "vellum", 0.42);
/** The slit's dark, an unglazed opening into the stair; and the lap a slipped slate leaves bare. */
const VOID = mix("pitch", "charcoal", 0.4);

// ── Pieces ───────────────────────────────────────────────────────────────────────────────

/**
 * One seen face of the shaft, built facing +z about the face's middle: the wall pierced by the
 * belfry's opening, the opening's dressed surround, hood mould and sill, and (`slit`) the lower
 * stage's slit lancet. `east` is the face turned out of the sun.
 */
function face(C, { seed, east = false, slit = false }) {
  const W = Math.round(PX * BELL_TOWER_SHAFT);
  const Hp = Math.round(PX * TOP);
  const mid = W / 2;
  const span = (half, y) => ({ x0: Math.round(mid - half * PX), x1: Math.round(mid + half * PX), y: Math.round(y * PX) });
  const tex = limewash(W, Hp, {
    key: 9600,
    seed,
    eaves: true,
    // grime run down from under the cornice, the string course, the belfry's sill and the slit's
    sills: [
      { x0: 0, x1: W, y: Math.round((TOP - 0.16) * PX) },
      { x0: 0, x1: W, y: Math.round((COURSE - 0.18) * PX) },
      span(BELFRY.half + 0.1, BELFRY.sill),
      ...(slit ? [span(SLIT.half + 0.08, SLIT.sill - 0.07)] : []),
    ],
    damp: 0.7,
    moss: 0.7,
    tide: 0.75,
    patches: 5,
    patchReach: PX * 8,
    east,
  });
  const g = new THREE.Group();
  const { half, r, sill, spring } = BELFRY;
  const wall = piercedBody(BELL_TOWER_SHAFT, TOP, THICK, lancetShape(half, r, sill, spring), stoneMat(tex, { bump: 0.9 }), C.lime);
  wall.position.z = HALF - THICK / 2;
  g.add(wall);
  // the opening's surround, carried down its jambs to the sill, under a hood mould on label stops
  g.add(slab(archBand(half + 0.11, r + 0.11, half, r, spring, sill, sill), 0.04, C.dressed, HALF));
  const stop = spring - 0.16;
  g.add(slab(archBand(half + 0.2, r + 0.2, half + 0.13, r + 0.13, spring, stop, stop), 0.07, C.dressed, HALF));
  for (const sx of [-1, 1]) g.add(box(0.1, 0.1, 0.08, C.dressed, { x: sx * (half + 0.165), y: stop - 0.03, z: HALF + 0.04 }));
  g.add(box(2 * half + 0.34, 0.08, 0.14, C.dressed, { y: sill - 0.03, z: HALF + 0.05 }));
  if (slit) {
    const s = new THREE.Group();
    s.name = "slit";
    const sur = 0.07;
    s.add(part(new THREE.ShapeGeometry(lancetShape(SLIT.half, SLIT.r, SLIT.sill, SLIT.spring), 8), plain(VOID, { rough: 1 }), { z: HALF + 0.004 }));
    const outer = lancetShape(SLIT.half + sur, SLIT.r + sur, SLIT.sill - sur, SLIT.spring);
    outer.holes.push(lancetShape(SLIT.half, SLIT.r, SLIT.sill, SLIT.spring));
    s.add(slab(outer, 0.035, C.dressed, HALF));
    g.add(s);
    g.add(part(new THREE.BoxGeometry(2 * SLIT.half + 0.22, 0.06, 0.1), C.dressed, { y: SLIT.sill - sur - 0.03, z: HALF + 0.04, rx: 0.25 }));
  }
  return g;
}

/** The quoins up one corner: dressed blocks, long on one face and short on the other course by course. */
function quoins(g, stone, sx, sz) {
  const course = 0.3;
  const stop = TOP - 0.16;
  for (let k = 0, y = PLINTH; y < stop - 0.01; k++, y += course) {
    const h = Math.min(course, stop - y);
    const [a, b] = k % 2 === 0 ? [0.5, 0.3] : [0.3, 0.5];
    const proud = 0.02;
    g.add(box(a, h, b, stone, { x: sx * (HALF + proud - a / 2), y: y + h / 2, z: sz * (HALF + proud - b / 2) }));
  }
}

/** A dark bronze bell, its lip at the group's foot: the waist, the shoulder, the crown, a clapper. */
function bell(name, M) {
  const g = new THREE.Group();
  g.name = name;
  const h = BELL.crown - BELL.lip;
  const profile = [
    [0.95, 0],
    [1, 0.05],
    [0.8, 0.16],
    [0.62, 0.42],
    [0.52, 0.72],
    [0.44, 0.86],
    [0.25, 0.97],
    [0.004, 1],
  ].map(([rr, y]) => new THREE.Vector2(rr * BELL.r, y * h));
  const bronze = plain(BRONZE, { rough: 0.6, metal: 0.45, side: THREE.DoubleSide });
  g.add(part(new THREE.LatheGeometry(profile, 20), bronze));
  g.add(part(new THREE.TorusGeometry(BELL.r * 0.9, 0.02, 5, 20), bronze, { y: 0.09, rx: Math.PI / 2 }));
  g.add(part(new THREE.SphereGeometry(0.06, 8, 6), M.iron, { y: 0.02 }));
  return g;
}

/**
 * The four faces of a pyramid's tier, from half-width `h0` at height `y0` up to `h1` at `y1` (a
 * point when `h1` is 0). UVs in tile edges: along the eave, and up the slope from `v0`.
 */
function tier(h0, y0, h1, y1, v0) {
  const pos = [];
  const uv = [];
  const v1 = v0 + Math.hypot(h0 - h1, y1 - y0);
  // the south face's corners, counter-clockwise from outside; the others turn about the axis
  const quad = [
    [-h0, y0, h0, -h0, v0],
    [h0, y0, h0, h0, v0],
    [h1, y1, h1, h1, v1],
    [-h1, y1, h1, -h1, v1],
  ];
  const tris = h1 > 0 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
  for (let turn = 0; turn < 4; turn++) {
    const c = Math.round(Math.cos((turn * Math.PI) / 2));
    const s = Math.round(Math.sin((turn * Math.PI) / 2));
    for (const i of tris) {
      const [x, y, z, u, v] = quad[i];
      pos.push(x * c + z * s, y, -x * s + z * c);
      uv.push(u, v);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Where slates have slipped on the spire's two seen faces: the face's turn about the axis (0 the
 * south, a quarter the east), how far along the eave's line and up the steep pitch (0..1), how far
 * the slate slid and how far it swung.
 */
const SLIPPED = [
  [0, -0.46, 0.13, 0.2, 0.3],
  [0, 0.12, 0.52, 0.14, -0.22],
  [1, 0.36, 0.27, 0.18, -0.28],
  [1, -0.22, 0.34, 0.22, 0.24],
];

/** One slipped slate on the steep pitch: the dark lap it left bare, and the slate hanging askew under it. */
function slipped(C, gap, [turn, along, up, slid, swing]) {
  const { kick, apex } = SPIRE;
  const rise = apex - kick.y;
  const len = Math.hypot(rise, kick.half);
  const pitch = Math.atan2(rise, kick.half);
  const g = new THREE.Group();
  g.rotation.y = (turn * Math.PI) / 2;
  // a point `t` up the south face, `lift` off it along its normal
  const at = (t, lift) => ({ x: along * kick.half * (1 - t), y: kick.y + t * rise + (lift * kick.half) / len, z: kick.half * (1 - t) + (lift * rise) / len });
  g.add(box(0.2, 0.012, 0.11, gap, { ...at(up, 0.004), rx: pitch }));
  g.add(part(new THREE.BoxGeometry(0.2, 0.025, 0.12), C.slate, { ...at(up - slid / len, 0.02), rx: pitch, ry: swing }));
  return g;
}

/** The slate spire on its eave, its hips rolled in lead, a lead cap and a ball on its apex, a few slates slipped. */
function spire(C) {
  const g = new THREE.Group();
  g.name = "spire";
  const { eave, foot, kick, apex } = SPIRE;
  // the eave's board, dark under the slates
  g.add(box(2 * eave, 0.05, 2 * eave, C.ridge, { y: foot - 0.025 }));
  g.add(part(tier(eave, foot, kick.half, kick.y, 0), C.slate));
  g.add(part(tier(kick.half, kick.y, 0, apex, Math.hypot(eave - kick.half, kick.y - foot)), C.slate));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(rod(V3(sx * eave, foot + 0.01, sz * eave), V3(sx * kick.half, kick.y + 0.01, sz * kick.half), 0.03, 0.03, C.lead, 6));
      g.add(rod(V3(sx * kick.half, kick.y + 0.01, sz * kick.half), V3(0, apex, 0), 0.03, 0.02, C.lead, 6));
    }
  const gap = plain(VOID, { rough: 1 });
  for (const s of SLIPPED) g.add(slipped(C, gap, s));
  g.add(part(new THREE.CylinderGeometry(0.03, 0.17, 0.36, 8), C.lead, { y: apex - 0.08 }));
  g.add(part(new THREE.SphereGeometry(0.075, 10, 8), C.lead, { y: apex + 0.12 }));
  return g;
}

/**
 * The iron cross on the spire's ball, turned to face the camera (its arms across the view) and
 * leaning a little off true.
 */
function cross(M) {
  const g = new THREE.Group();
  g.name = "cross";
  g.position.y = CROSS.foot;
  g.rotation.set(0.04, Math.PI / 4, 0.09);
  g.add(box(0.09, CROSS.height, 0.09, M.rust, { y: CROSS.height / 2 }));
  const armY = CROSS.height - 0.23;
  g.add(box(CROSS.span, 0.09, 0.09, M.rust, { y: armY }));
  for (const [x, y] of [
    [-CROSS.span / 2, armY],
    [CROSS.span / 2, armY],
    [0, CROSS.height],
  ])
    g.add(part(new THREE.SphereGeometry(0.055, 8, 6), M.iron, { x, y }));
  return g;
}

/**
 * The chapel's bell tower (T24): the lime shaft on its plinth, quoined at the corners, a slit
 * lancet in the south face's solid lower stage; over a string course the open belfry, a dark bell
 * behind each of its two seen openings; a slate pyramid spire and its cross. Its parts by name:
 * `masonry` (the stonework, to the spire's eave), `bell_south` and `bell_east`, `spire`, `cross`.
 */
export function chapelTower() {
  const M = materials();
  const C = chapelBuildingMaterials();
  const g = new THREE.Group();
  const stone = new THREE.Group();
  stone.name = "masonry";
  g.add(stone);

  // the two seen faces, and the two walls behind them, seen only from inside through the openings
  stone.add(face(C, { seed: 61, slit: true }));
  const east = face(C, { seed: 67, east: true });
  east.rotation.y = Math.PI / 2;
  stone.add(east);
  const inside = plain(INSIDE, { rough: 1 });
  stone.add(box(BELL_TOWER_SHAFT - THICK, TOP, THICK, inside, { x: -THICK / 2, y: TOP / 2, z: -(HALF - THICK / 2) }));
  stone.add(box(THICK, TOP, BELL_TOWER_SHAFT - THICK, inside, { x: -(HALF - THICK / 2), y: TOP / 2, z: -THICK / 2 }));

  // the plinth, chamfered into the shaft; the quoins; the string course; the cornice under the eave
  stone.add(part(roughBox(BELL_TOWER_FOOT - 0.02, PLINTH, BELL_TOWER_FOOT - 0.02, 9611, 0.02), dressedAt(C.dressedDark, BELL_TOWER_FOOT, PLINTH), { y: PLINTH / 2 + 0.01 }));
  stone.add(box(BELL_TOWER_SHAFT + 0.1, 0.07, BELL_TOWER_SHAFT + 0.1, C.dressed, { y: PLINTH + 0.035 }));
  const quoin = textured(
    pixelTexture(64, 64, (x, y) => shade(QUOIN, (0.9 + 0.2 * fbm(x / 9, y / 9, 9631, 3)) * (0.96 + 0.08 * vnoise(x / 1.5, y / 1.5, 9632)))),
    { rough: 0.93, bump: 0.5 },
  );
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) quoins(stone, quoin, sx, sz);
  stone.add(box(BELL_TOWER_SHAFT + 0.14, 0.18, BELL_TOWER_SHAFT + 0.14, dressedAt(C.dressed, BELL_TOWER_SHAFT, 0.18), { y: COURSE - 0.09 }));
  stone.add(box(BELL_TOWER_SHAFT + 0.12, 0.16, BELL_TOWER_SHAFT + 0.12, dressedAt(C.dressed, BELL_TOWER_SHAFT, 0.16), { y: TOP - 0.08 }));
  // the belfry's floor, a hair under the sills
  stone.add(box(BELL_TOWER_SHAFT - 2 * THICK, 0.14, BELL_TOWER_SHAFT - 2 * THICK, M.woodDark, { y: FLOOR - 0.1 }));

  // a bell where each opening shows it, hung from a beam across the stage
  const south = bell("bell_south", M);
  south.position.set(-BELL.back, BELL.lip, HALF - BELL.back);
  const eastBell = bell("bell_east", M);
  eastBell.position.set(HALF - BELL.back, BELL.lip, -BELL.back);
  g.add(south, eastBell);
  const beam = BELL_TOWER_SHAFT - 2 * THICK;
  g.add(box(beam, 0.14, 0.14, M.beam, { y: BELL.crown + 0.07, z: HALF - BELL.back }));
  g.add(box(0.14, 0.14, beam, M.beam, { x: HALF - BELL.back, y: BELL.crown + 0.07 }));

  g.add(spire(C), cross(M));
  return g;
}
