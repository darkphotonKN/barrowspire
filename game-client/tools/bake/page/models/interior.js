// The town buildings' furniture and fittings (FS-B0H2D §G R30): the Inn's counter, stools and
// hearth, the store's shelves, the smithy's forge and anvil. Authored in code (ADR-0021) on the
// shared materials and key light, modelled at life size in metres and scaled 1.5 like the
// furniture in props.js, so a stool reads against the reused `table` as a chair does.
//
// One three.js unit is one tile edge (40 world px), so one metre here is 1.5 units, 60 world px.
// +x is world +x, +z is world +y (screen: +x and +z fall toward the viewer). Each model's origin
// is the centre of its footprint, the point the scene places it on. Footprints, in world px:
//   counter     140 × 40 along its axis (x: runs world x; y: runs world y), 63 px tall
//   stool       about 24 across
//   inn_hearth  96 wide × 36 deep, its back on the model's -z face (stands against a north wall,
//               fire facing world +y, toward the door and the camera)
//   shelf       72 wide × 24 deep, its back on -z (against a north wall)
//   forge       84 × 60, its chimney at the back (-z)
//   anvil       about 48 × 30 on its block
//
// Colour stays in the bake's channels (design guideline "Gameplay accent"): nothing here is
// interactable, so nothing is amber but the fire itself, as the brazier's is.

import * as THREE from "three";
import { fbm, rng, vnoise } from "../noise.js";
import { mix, shade } from "../palette.js";
import { glow, materials, pixelTexture, plain, textured, TONE } from "../materials.js";
import { part, rod, scaled, V3 } from "./util.js";

/** Metres to model units: the furniture scale of props.js. */
const S = 1.5;

/** Counter: length and depth in metres (140 × 40 world px), and the top's height. */
const COUNTER_L = 140 / 60;
const COUNTER_D = 40 / 60;
const COUNTER_H = 1.05;

/** Hearth: width and depth in metres (96 × 36 world px). */
const HEARTH_W = 96 / 60;
const HEARTH_D = 36 / 60;
const HEARTH_FIRE_Y = 0.22;

/** Forge: width and depth in metres (84 × 60 world px), and the coal bed's height. */
const FORGE_W = 84 / 60;
const FORGE_D = 60 / 60;
const FORGE_BED_Y = 0.78;

/** Model-space light points (scaled), for the manifest's declared light sources. */
export const HEARTH_FLAME = [0, (HEARTH_FIRE_Y + 0.2) * S, (-HEARTH_D / 2 + 0.34) * S];
export const FORGE_COALS = [-0.08 * S, (FORGE_BED_Y + 0.12) * S, 0.12 * S];

const SOOT = mix("pitch", "charcoal", 0.5);
const PEWTER = mix("slateLight", "slate", 0.35);
const CHEESE = mix("brass", "vellumDark", 0.55);
const RIND = mix("brass", "barrowBrown", 0.45);
const CLAY = mix("ember", "barrowBrown", 0.55);
const CLAY_DARK = mix("barrowBrown", "barrowDeep", 0.4);
const GLAZE = mix("necrotic", "slate", 0.45);
const BOTTLE = mix("arcaneDeep", "charcoal", 0.35);

let INTERIOR = null;

/** The interiors' own materials, built once per bake (seeded, so deterministic). */
function interiorMaterials() {
  if (INTERIOR) return INTERIOR;
  const D = THREE.DoubleSide;
  const cloth = (c, s) =>
    textured(
      pixelTexture(128, 128, (x, y) =>
        shade(c, (0.72 + 0.5 * fbm(x / 14, y / 14, s)) * ((x + y) % 4 < 2 ? 1 : 0.9) * (0.92 + 0.12 * vnoise(x / 2, y / 40, s + 3))),
      ),
      { side: D, bump: 0.3 },
    );
  INTERIOR = {
    // the firebox: soot-black stone that has burned for a hundred winters
    soot: textured(pixelTexture(64, 64, (x, y) => shade(SOOT, 0.6 + 0.6 * fbm(x / 7, y / 7, 501))), { rough: 1 }),
    // hearth and forge stone: the shared stone, a shade warmer and grimier
    rubble: textured(
      pixelTexture(128, 128, (x, y) =>
        shade(mix(TONE.stone, "barrowBrown", 0.18), (0.6 + 0.5 * fbm(x / 12, y / 12, 503)) * (0.88 + 0.22 * fbm(x / 4, y / 4, 504))),
      ),
      { rough: 0.95, bump: 0.9 },
    ),
    ash: textured(pixelTexture(64, 64, (x, y) => shade(mix("slateLight", "charcoal", 0.55), 0.55 + 0.6 * fbm(x / 5, y / 5, 505))), { rough: 1 }),
    pewter: plain(PEWTER, { rough: 0.4, metal: 0.75 }),
    clay: plain(CLAY, { rough: 0.85 }),
    clayDark: plain(CLAY_DARK, { rough: 0.85 }),
    glaze: plain(GLAZE, { rough: 0.35 }),
    bottle: plain(BOTTLE, { rough: 0.2, metal: 0.2 }),
    cheese: plain(CHEESE, { rough: 0.7 }),
    rind: plain(RIND, { rough: 0.8 }),
    bread: plain(mix("barrowBrown", "brass", 0.5), { rough: 0.9 }),
    rope: plain(mix("vellumFaint", "barrowBrown", 0.3), { rough: 1 }),
    linen: cloth(mix("vellum", "vellumFaint", 0.35), 507),
    wool: cloth(mix("slateLight", "necrotic", 0.25), 508),
    russet: cloth(mix("oxblood", "barrowBrown", 0.35), 509),
    green: cloth(mix("arcaneDeep", "barrowDeep", 0.3), 510),
    burlap: cloth(mix("vellumFaint", "barrowBrown", 0.35), 511),
    water: plain(mix("slate", "necrotic", 0.25), { rough: 0.12, metal: 0.4 }),
    // the forge hood: blackened sheet iron
    sheetIron: textured(pixelTexture(64, 64, (x, y) => shade(mix("charcoal", "slate", 0.45), 0.65 + 0.5 * fbm(x / 8, y / 8, 512))), {
      metal: 0.6,
      rough: 0.6,
      side: THREE.DoubleSide,
    }),
    // the forge's heart: hotter than the brazier's coals, under a crust of dark ones
    hot: glow(mix("ember", "amberBright", 0.35), 3.2),
  };
  return INTERIOR;
}

/** A box from a flat options object. */
const box = (w, h, d, material, o = {}) => part(new THREE.BoxGeometry(w, h, d), material, o);

/**
 * Rubble masonry filling a w × h face of depth d centred on (x, ·, z), bottom at y0: courses of
 * single stones, each a hair off true, so it reads as laid stone rather than one textured block.
 */
function masonry(g, { x = 0, z = 0, y0 = 0, w, h, d }, material, R) {
  let y = y0;
  let course = 0;
  while (y < y0 + h - 0.01) {
    let ch = Math.min(0.12 + R() * 0.07, y0 + h - y);
    if (y0 + h - y - ch < 0.08) ch = y0 + h - y;
    let left = x - w / 2 + (course % 2 ? 0 : 0.04 + R() * 0.06);
    if (course % 2 === 0) g.add(box(left - (x - w / 2), ch - 0.012, d, material, { x: (x - w / 2 + left) / 2, y: y + ch / 2, z }));
    while (left < x + w / 2 - 0.01) {
      let sw = Math.min(0.16 + R() * 0.16, x + w / 2 - left);
      // never leave a sliver at the course's end: the last stone takes it
      if (x + w / 2 - left - sw < 0.08) sw = x + w / 2 - left;
      g.add(
        box(sw - 0.014, ch - 0.014, d + (R() - 0.5) * 0.02, material, {
          x: left + sw / 2,
          y: y + ch / 2,
          z: z + (R() - 0.5) * 0.012,
          ry: (R() - 0.5) * 0.03,
          rz: (R() - 0.5) * 0.02,
        }),
      );
      left += sw;
    }
    y += ch;
    course++;
  }
  // the mortar behind, so the joints read dark rather than see-through
  g.add(box(w - 0.02, h - 0.03, d - 0.02, materials().black, { x, y: y0 + (h - 0.03) / 2, z }));
}

/** A pewter tankard: a tapered drum with a handle. */
function tankard(g, x, y, z, ry, T) {
  const t = new THREE.Group();
  t.position.set(x, y, z);
  t.rotation.y = ry;
  t.add(part(new THREE.CylinderGeometry(0.038, 0.045, 0.12, 12), T.pewter, { y: 0.06 }));
  t.add(part(new THREE.TorusGeometry(0.035, 0.008, 5, 10, Math.PI), T.pewter, { x: 0.045, y: 0.065, rz: -Math.PI / 2 }));
  g.add(t);
}

/** A clay jug or crock: a lathe of height h and belly radius r. */
function crock(g, x, y, z, r, h, material, { neck = 0.45, lid = null } = {}) {
  const prof = [
    [0.01, 0],
    [0.75, 0.02],
    [1.0, 0.35],
    [0.9, 0.75],
    [neck, 0.92],
    [neck + 0.08, 1.0],
    [neck, 1.0],
  ].map(([a, b]) => new THREE.Vector2(a * r, b * h));
  g.add(part(new THREE.LatheGeometry(prof, 14), material, { x, y, z }));
  if (lid) g.add(part(new THREE.CylinderGeometry(neck * r + 0.01, neck * r + 0.01, 0.015, 12), lid, { x, y: y + h, z }));
}

/** A bottle: a dark glass lathe with a cork. */
function bottle(g, x, y, z, M, T) {
  const prof = [
    [0.01, 0],
    [0.04, 0.005],
    [0.04, 0.12],
    [0.015, 0.17],
    [0.013, 0.22],
  ].map(([a, b]) => new THREE.Vector2(a, b));
  g.add(part(new THREE.LatheGeometry(prof, 10), T.bottle, { x, y, z }));
  g.add(part(new THREE.CylinderGeometry(0.012, 0.012, 0.025, 6), M.wood, { x, y: y + 0.225, z }));
}

/** A wheel of cheese, cut or whole. */
function cheese(g, x, y, z, r, T) {
  g.add(part(new THREE.CylinderGeometry(r, r, r * 0.6, 16), [T.rind, T.cheese, T.cheese], { x, y: y + r * 0.3, z }));
}

/** A cloth bolt lying along x. */
function bolt(g, x, y, z, len, r, material, M) {
  g.add(part(new THREE.CylinderGeometry(r, r, len, 12), material, { x, y: y + r, z, rz: Math.PI / 2 }));
  g.add(part(new THREE.CylinderGeometry(0.012, 0.012, len + 0.04, 6), M.woodDark, { x, y: y + r, z, rz: Math.PI / 2 }));
}

/** A coil of rope lying flat. */
function coil(g, x, y, z, T) {
  for (let i = 0; i < 3; i++)
    g.add(part(new THREE.TorusGeometry(0.09 - i * 0.012, 0.014, 5, 16), T.rope, { x, y: y + 0.014 + i * 0.024, z, rx: Math.PI / 2 }));
}

/**
 * The Inn's counter along x: a thick plank top on a panelled front (+z, the customers' side),
 * open shelving behind (-z) for the innkeeper's crocks and tankards, a small keg on a cradle at
 * one end. Built along x; the `y` frame turns it to run along world y with its front to the west
 * (the R18 Inn: counter near the east wall, the Alewife behind it).
 */
export function counter(axis) {
  const M = materials();
  const T = interiorMaterials();
  const g = new THREE.Group();
  const L = COUNTER_L;
  const D = COUNTER_D;
  const H = COUNTER_H;
  const R = rng(axis === "x" ? 521 : 522);
  // plinth and the carcass
  g.add(box(L - 0.04, 0.08, D - 0.1, M.beam, { y: 0.04 }));
  const divider = -0.02;
  const front = D / 2 - 0.06;
  g.add(box(L - 0.06, H - 0.12, front - divider, M.woodDark, { y: (H - 0.12) / 2 + 0.04, z: (front + divider) / 2 }));
  for (const sx of [-1, 1]) g.add(box(0.05, H - 0.08, D - 0.1, M.beam, { x: sx * (L / 2 - 0.05), y: (H - 0.08) / 2 }));
  // the front: stiles and rails framing sunk panels
  const bays = 4;
  const bay = (L - 0.06) / bays;
  for (let i = 0; i <= bays; i++) g.add(box(0.07, H - 0.1, 0.04, M.beam, { x: -L / 2 + 0.03 + i * bay, y: (H - 0.1) / 2 + 0.04, z: front }));
  for (const y of [0.12, H - 0.12]) g.add(box(L - 0.04, 0.08, 0.04, M.beam, { y, z: front }));
  for (let i = 0; i < bays; i++) {
    const x = -L / 2 + 0.03 + (i + 0.5) * bay;
    g.add(box(bay - 0.09, H - 0.34, 0.025, M.woodDark, { x, y: H / 2 - 0.02, z: front - 0.01 }));
    g.add(box(bay - 0.2, H - 0.46, 0.02, M.woodDark, { x, y: H / 2 - 0.02, z: front + 0.005 }));
    // a scuffed kick line where boots have rested
    g.add(box(bay - 0.1, 0.03, 0.01, M.woodDark, { x, y: 0.2, z: front + 0.022 }));
  }
  // the top: a thick slab overhanging the front, its edge rounded by wear
  g.add(box(L + 0.06, 0.07, D + 0.08, M.woodDark, { y: H - 0.035, z: 0.02 }));
  g.add(part(new THREE.CylinderGeometry(0.035, 0.035, L + 0.06, 8), M.woodDark, { y: H - 0.035, z: D / 2 + 0.06, rz: Math.PI / 2 }));
  // the back: two open shelves under the top, stocked
  const back = -D / 2 + 0.04;
  const shelfZ = (back + divider) / 2;
  for (const y of [0.32, 0.64]) g.add(box(L - 0.14, 0.03, divider - back, M.wood, { y, z: shelfZ }));
  for (let i = 1; i < 3; i++) g.add(box(0.04, H - 0.12, divider - back, M.beam, { x: -L / 2 + (i * L) / 3, y: (H - 0.12) / 2 + 0.04, z: shelfZ }));
  for (let i = 0; i < 7; i++) {
    const x = -L / 2 + 0.2 + i * ((L - 0.4) / 6) + (R() - 0.5) * 0.05;
    if (i % 3 === 0) crock(g, x, 0.335, shelfZ, 0.07, 0.2, i % 2 ? T.clay : T.clayDark, { lid: M.wood });
    else tankard(g, x, 0.335, shelfZ, R() * 3, T);
    if (i % 2 === 0) bottle(g, x + 0.06, 0.655, shelfZ, M, T);
    else crock(g, x, 0.655, shelfZ, 0.06, 0.16, T.glaze);
    // a small keg on the bottom board, between the posts
    if (i === 2 || i === 5) {
      const staves = [
        [0.09, 0],
        [0.105, 0.11],
        [0.09, 0.22],
      ].map(([r, y]) => new THREE.Vector2(r, y));
      g.add(part(new THREE.LatheGeometry(staves, 14), M.staves, { x: x - 0.05, y: 0.18, z: shelfZ - 0.11, rx: Math.PI / 2 }));
    }
  }
  // on top: tankards, a jug, a cloth, and a little keg on its cradle at the +x end
  const top = H;
  tankard(g, -0.55, top, 0.06, 0.4, T);
  tankard(g, -0.42, top, -0.04, 2.2, T);
  tankard(g, 0.18, top, 0.1, 1.1, T);
  crock(g, -0.05, top, -0.06, 0.07, 0.22, T.clay);
  g.add(box(0.26, 0.012, 0.18, T.linen, { x: 0.38, y: top + 0.006, z: 0.02, ry: 0.35 }));
  const keg = new THREE.Group();
  keg.position.set(L / 2 - 0.26, top, -0.04);
  for (const sx of [-1, 1]) keg.add(box(0.04, 0.08, 0.3, M.beam, { x: sx * 0.12, y: 0.04 }));
  const staves = [
    [0.13, 0],
    [0.155, 0.13],
    [0.13, 0.28],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  keg.add(part(new THREE.LatheGeometry(staves, 16), M.staves, { y: 0.17, z: -0.14, rx: Math.PI / 2 }));
  keg.add(part(new THREE.CircleGeometry(0.13, 16), M.wood, { y: 0.17, z: 0.14 + 0.001 }));
  for (const z of [-0.1, 0.1]) keg.add(part(new THREE.TorusGeometry(0.152, 0.008, 5, 18), M.iron, { y: 0.17, z }));
  keg.add(rod(V3(0, 0.12, 0.14), V3(0, 0.12, 0.2), 0.012, 0.012, M.iron));
  keg.add(rod(V3(0, 0.12, 0.2), V3(0, 0.08, 0.2), 0.01, 0.008, M.iron));
  g.add(keg);
  if (axis === "y") g.rotation.y = -Math.PI / 2;
  return scaled(g, S);
}

/** A three-legged round stool (variant 0) or a square joint stool (variant 1). */
export function stool(variant) {
  const M = materials();
  const g = new THREE.Group();
  const R = rng(531 + variant);
  if (variant === 0) {
    const seatY = 0.46;
    g.add(part(new THREE.CylinderGeometry(0.17, 0.165, 0.045, 18), M.wood, { y: seatY, ry: R() }));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.3;
      g.add(rod(V3(Math.cos(a) * 0.19, 0, Math.sin(a) * 0.19), V3(Math.cos(a) * 0.09, seatY - 0.02, Math.sin(a) * 0.09), 0.022, 0.018, M.woodDark, 6));
    }
    g.add(part(new THREE.TorusGeometry(0.135, 0.01, 5, 18), M.woodDark, { y: 0.16, rx: Math.PI / 2 }));
    return scaled(g, S);
  }
  const seatY = 0.48;
  g.add(box(0.32, 0.045, 0.26, M.wood, { y: seatY, ry: (R() - 0.5) * 0.04 }));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(box(0.04, seatY - 0.02, 0.04, M.woodDark, { x: sx * 0.125, y: (seatY - 0.02) / 2, z: sz * 0.095, rz: sx * 0.06, rx: -sz * 0.06 }));
  for (const sz of [-1, 1]) g.add(box(0.27, 0.03, 0.025, M.woodDark, { y: 0.12, z: sz * 0.1 }));
  g.add(box(0.025, 0.03, 0.2, M.woodDark, { y: 0.2 }));
  return scaled(g, S);
}

/** Logs on iron firedogs, coals beneath and a few flames: the fire of the hearth. */
function fire(g, x, y, z, M, R) {
  for (const sx of [-1, 1]) {
    g.add(box(0.03, 0.04, 0.3, M.iron, { x: x + sx * 0.2, y: y + 0.06, z }));
    g.add(rod(V3(x + sx * 0.2, y, z + 0.15), V3(x + sx * 0.2, y + 0.2, z + 0.16), 0.016, 0.014, M.iron, 6));
  }
  for (let i = 0; i < 14; i++)
    g.add(
      part(new THREE.SphereGeometry(0.035 + R() * 0.025, 6, 5), R() > 0.4 ? M.coal : M.black, {
        x: x + (R() - 0.5) * 0.5,
        y: y + 0.02,
        z: z + (R() - 0.5) * 0.24,
      }),
    );
  for (const [dz, rz] of [
    [-0.05, 0.08],
    [0.06, -0.06],
  ])
    g.add(part(new THREE.CylinderGeometry(0.05, 0.055, 0.6, 9), M.bark, { x, y: y + 0.12 + (dz > 0 ? 0.07 : 0), z: z + dz, rz: Math.PI / 2 + rz }));
  for (let i = 0; i < 4; i++)
    g.add(part(new THREE.ConeGeometry(0.05 + R() * 0.02, 0.2 + R() * 0.1, 7), M.flame, { x: x + (R() - 0.5) * 0.3, y: y + 0.28, z: z + (R() - 0.5) * 0.1 }));
}

/**
 * The Inn's hearth: a rubble-stone fireplace with an oak mantel beam and a chimney breast,
 * standing against a north wall with the fire facing world +y. A pot hangs on its crane, a
 * hearthstone lies before it, a poker and a log basket beside it.
 */
export function innHearth() {
  const M = materials();
  const T = interiorMaterials();
  const g = new THREE.Group();
  const R = rng(541);
  const W = HEARTH_W;
  const D = HEARTH_D;
  const backZ = -D / 2;
  const openW = 0.9;
  const jambW = (W - openW) / 2;
  const mantelY = 0.9;
  const breastTop = 2.25;
  // the firebox: back and floor in soot
  g.add(box(openW + 0.04, mantelY, 0.08, T.soot, { y: mantelY / 2, z: backZ + 0.04 }));
  g.add(box(openW, 0.06, D - 0.1, T.ash, { y: 0.07, z: 0.01 }));
  // jambs of laid stone, and the breast above the mantel, set back a little
  for (const sx of [-1, 1]) masonry(g, { x: sx * (openW / 2 + jambW / 2), z: 0, y0: 0, w: jambW, h: mantelY, d: D }, T.rubble, R);
  masonry(g, { x: 0, z: -0.06, y0: mantelY + 0.12, w: W - 0.12, h: 0.5, d: D - 0.12 }, T.rubble, R);
  masonry(g, { x: 0, z: -0.1, y0: mantelY + 0.62, w: W - 0.36, h: breastTop - mantelY - 0.62, d: D - 0.2 }, T.rubble, R);
  // the weathering shoulders where the breast steps in
  for (const sx of [-1, 1]) g.add(box(0.14, 0.05, D - 0.16, M.cap, { x: sx * (W / 2 - 0.13), y: mantelY + 0.645, z: -0.08, rz: sx * -0.35 }));
  // the mantel beam, and what stands on it
  g.add(box(W + 0.08, 0.14, D * 0.62, M.beam, { y: mantelY + 0.06, z: D * 0.19 }));
  crock(g, -0.52, mantelY + 0.13, D * 0.2, 0.06, 0.18, T.clay);
  g.add(part(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 8), M.vellum, { x: 0.3, y: mantelY + 0.18, z: D * 0.2 }));
  g.add(part(new THREE.CylinderGeometry(0.05, 0.045, 0.02, 10), M.iron, { x: 0.3, y: mantelY + 0.14, z: D * 0.2 }));
  tankard(g, 0.55, mantelY + 0.13, D * 0.18, 0.6, T);
  g.add(box(W - 0.3, 0.06, D - 0.14, M.cap, { y: breastTop + 0.03, z: -0.1 }));
  // the hearthstone, and the fire
  g.add(box(W - 0.1, 0.06, 0.26, M.cap, { y: 0.03, z: D / 2 + 0.12 }));
  fire(g, 0, HEARTH_FIRE_Y - 0.1, backZ + 0.34, M, R);
  // a crane from the left jamb, a pot hung over the fire's edge
  g.add(rod(V3(-openW / 2 + 0.03, 0.15, backZ + 0.16), V3(-openW / 2 + 0.03, 0.78, backZ + 0.16), 0.016, 0.016, M.iron, 6));
  g.add(rod(V3(-openW / 2 + 0.03, 0.72, backZ + 0.16), V3(-0.08, 0.72, backZ + 0.32), 0.014, 0.014, M.iron, 6));
  g.add(rod(V3(-0.1, 0.72, backZ + 0.31), V3(-0.1, 0.56, backZ + 0.31), 0.006, 0.006, M.iron, 4));
  const pot = [
    [0.04, 0],
    [0.12, 0.03],
    [0.14, 0.1],
    [0.11, 0.17],
    [0.12, 0.18],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(part(new THREE.LatheGeometry(pot, 16), M.ironDouble, { x: -0.1, y: 0.38, z: backZ + 0.31 }));
  // poker and shovel against the right jamb, a basket of split logs at its foot
  g.add(rod(V3(openW / 2 + 0.06, 0.02, D / 2 + 0.05), V3(openW / 2 + 0.02, 0.62, D / 2 - 0.02), 0.01, 0.01, M.iron, 6));
  g.add(rod(V3(openW / 2 + 0.12, 0.02, D / 2 + 0.06), V3(openW / 2 + 0.1, 0.58, D / 2 - 0.02), 0.01, 0.01, M.iron, 6));
  g.add(box(0.09, 0.012, 0.11, M.iron, { x: openW / 2 + 0.12, y: 0.06, z: D / 2 + 0.07, rx: 0.3 }));
  const basket = [
    [0.13, 0],
    [0.17, 0.05],
    [0.18, 0.16],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(part(new THREE.LatheGeometry(basket, 14), M.staves, { x: W / 2 + 0.12, z: D / 2 - 0.04 }));
  for (let i = 0; i < 5; i++)
    g.add(part(new THREE.CylinderGeometry(0.035, 0.04, 0.34, 7), M.bark, { x: W / 2 + 0.12 + (R() - 0.5) * 0.14, y: 0.18 + R() * 0.06, z: D / 2 - 0.04 + (R() - 0.5) * 0.14, rx: Math.PI / 2 + (R() - 0.5) * 0.4, rz: (R() - 0.5) * 0.4 }));
  return scaled(g, S);
}

/**
 * The store's shelves: an open plank rack standing against a north wall, stocked. Variant 0 is
 * provisions (crocks, cheeses, loaves, a sack), variant 1 wares (cloth bolts, bottles, boots, a
 * coil of rope, folded blankets).
 */
export function shelf(variant) {
  const M = materials();
  const T = interiorMaterials();
  const g = new THREE.Group();
  const R = rng(551 + variant);
  const W = 72 / 60;
  const D = 24 / 60;
  const H = 1.85;
  const shelves = [0.1, 0.55, 1.0, 1.45];
  // back boards, uprights, the shelves and a cornice
  for (let i = 0; i < 5; i++) g.add(box(W / 5 - 0.008, H - 0.04, 0.02, M.wood, { x: -W / 2 + (i + 0.5) * (W / 5), y: (H - 0.04) / 2, z: -D / 2 + 0.01 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.05, H, 0.05, M.beam, { x: sx * (W / 2 - 0.025), y: H / 2, z: sz * (D / 2 - 0.025) }));
  for (const sx of [-1, 1]) g.add(box(0.02, H - 0.1, D - 0.06, M.woodDark, { x: sx * (W / 2 - 0.02), y: H / 2 }));
  for (const y of shelves) g.add(box(W - 0.06, 0.03, D - 0.02, M.woodDark, { y }));
  g.add(box(W + 0.06, 0.06, D + 0.06, M.beam, { y: H + 0.03 }));
  const z = 0.01;
  if (variant === 0) {
    // bottom: a sack and a lidded crock
    g.add(part(new THREE.SphereGeometry(0.17, 12, 10), T.burlap, { x: -0.3, y: 0.27, z, sy: 1.1, sz: 0.85 }));
    crock(g, 0.12, 0.115, z, 0.11, 0.28, T.clayDark, { lid: M.wood });
    crock(g, 0.38, 0.115, z, 0.08, 0.22, T.clay);
    // second: cheeses, one cut
    cheese(g, -0.36, 0.565, z, 0.13, T);
    cheese(g, -0.36, 0.565 + 0.078, z, 0.12, T);
    cheese(g, -0.04, 0.565, z + 0.02, 0.11, T);
    cheese(g, 0.26, 0.565, z, 0.12, T);
    // third: crocks and jars
    for (let i = 0; i < 5; i++) crock(g, -0.42 + i * 0.21, 1.015, z + (R() - 0.5) * 0.05, 0.06 + R() * 0.02, 0.16 + R() * 0.08, [T.clay, T.glaze, T.clayDark][i % 3], i % 2 ? {} : { lid: M.wood });
    // top: loaves and a basket
    for (let i = 0; i < 3; i++)
      g.add(part(new THREE.CapsuleGeometry(0.055, 0.14, 4, 8), T.bread, { x: -0.38 + i * 0.16, y: 1.525, z: z + (R() - 0.5) * 0.06, rz: Math.PI / 2, ry: (R() - 0.5) * 0.5 }));
    const basket = [
      [0.1, 0],
      [0.14, 0.04],
      [0.15, 0.13],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    g.add(part(new THREE.LatheGeometry(basket, 14), M.staves, { x: 0.3, y: 1.465, z }));
    return scaled(g, S);
  }
  // bottom: boots and a coil of rope
  for (const [x, ry] of [
    [-0.36, 0.2],
    [-0.22, -0.1],
  ]) {
    g.add(box(0.09, 0.22, 0.1, M.leather, { x, y: 0.225, z: z - 0.03, ry }));
    g.add(box(0.09, 0.07, 0.24, M.leather, { x, y: 0.15, z: z + 0.04, ry }));
  }
  coil(g, 0.05, 0.115, z, T);
  crock(g, 0.38, 0.115, z, 0.09, 0.24, T.clayDark, { lid: M.wood });
  // second: cloth bolts stacked
  bolt(g, -0.18, 0.565, z, 0.62, 0.07, T.russet, M);
  bolt(g, -0.18, 0.565 + 0.14, z, 0.62, 0.065, T.wool, M);
  bolt(g, 0.3, 0.565, z, 0.4, 0.07, T.green, M);
  // third: bottles and a small chest
  for (let i = 0; i < 5; i++) bottle(g, -0.46 + i * 0.12, 1.015, z + (R() - 0.5) * 0.08, M, T);
  g.add(box(0.3, 0.18, 0.22, M.woodDark, { x: 0.32, y: 1.105, z }));
  g.add(box(0.31, 0.02, 0.23, M.iron, { x: 0.32, y: 1.15, z }));
  // top: folded blankets
  for (let i = 0; i < 3; i++) g.add(box(0.42, 0.07, 0.3, [T.wool, T.linen, T.russet][i], { x: -0.22 + (R() - 0.5) * 0.03, y: 1.5 + i * 0.07, z, ry: (R() - 0.5) * 0.12 }));
  g.add(box(0.3, 0.06, 0.26, T.green, { x: 0.32, y: 1.495, z, ry: 0.06 }));
  return scaled(g, S);
}

/** A teardrop board for the bellows, lying flat, its point toward -x. */
function bellowsBoard() {
  const sh = new THREE.Shape();
  sh.moveTo(-0.3, 0);
  sh.quadraticCurveTo(-0.05, 0.17, 0.16, 0.16);
  sh.quadraticCurveTo(0.27, 0.12, 0.27, 0);
  sh.quadraticCurveTo(0.27, -0.12, 0.16, -0.16);
  sh.quadraticCurveTo(-0.05, -0.17, -0.3, 0);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.025, bevelEnabled: false, curveSegments: 10 });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** Great bellows lying on a trestle: two teardrop boards, pleated leather between, an iron nozzle to -x. */
function bellows(g, x, y, z, M) {
  const b = new THREE.Group();
  b.position.set(x, y, z);
  b.add(part(bellowsBoard(), M.woodDark, { y: 0 }));
  b.add(part(bellowsBoard(), M.woodDark, { y: 0.17, rz: 0.1 }));
  // the leather: three pleats, each a little narrower toward the point
  for (let i = 0; i < 3; i++) {
    const t = (i + 1) / 4;
    b.add(part(bellowsBoard(), M.leather, { x: 0.03 * t, y: 0.03 + 0.11 * t, sx: 1.06, sz: 1.08, sy: 0.9, rz: 0.06 * t }));
  }
  b.add(rod(V3(-0.3, 0.05, 0), V3(-0.5, 0.03, 0), 0.03, 0.018, M.iron, 8));
  // the lever: a pole up from the back of the top board
  b.add(rod(V3(0.26, 0.2, 0), V3(0.45, 0.42, 0), 0.016, 0.016, M.wood, 6));
  b.add(rod(V3(0.45, 0.42, -0.08), V3(0.45, 0.42, 0.08), 0.012, 0.012, M.wood, 6));
  g.add(b);
}

/**
 * The smithy's forge: a waist-high stone hearth with a dished coal bed and an iron rim, a hood
 * and chimney rising from its back, bellows at its side, a quench tub at its front corner. It is
 * a furnishing standing free of the walls (R12), so it is finished on every side.
 */
export function forge() {
  const M = materials();
  const T = interiorMaterials();
  const g = new THREE.Group();
  const R = rng(561);
  const W = FORGE_W - 0.2;
  const D = FORGE_D - 0.2;
  const bed = FORGE_BED_Y;
  const ox = -0.08;
  // the hearth block
  masonry(g, { x: ox, z: 0, y0: 0, w: W, h: bed - 0.06, d: D }, T.rubble, R);
  g.add(box(W + 0.04, 0.08, D + 0.04, M.cap, { x: ox, y: bed - 0.04 }));
  // the bed: ash and dark coal around a hot heart, an iron rim, the tuyère from the side
  g.add(box(W - 0.2, 0.03, D - 0.26, T.ash, { x: ox, y: bed + 0.01, z: 0.08 }));
  for (const [x, z, w, d] of [
    [ox, 0.08 - (D - 0.22) / 2, W - 0.16, 0.025],
    [ox, 0.08 + (D - 0.22) / 2, W - 0.16, 0.025],
    [ox - (W - 0.16) / 2, 0.08, 0.025, D - 0.22],
    [ox + (W - 0.16) / 2, 0.08, 0.025, D - 0.22],
  ])
    g.add(box(w, 0.05, d, M.iron, { x, y: bed + 0.025, z }));
  for (let i = 0; i < 30; i++) {
    const a = R() * Math.PI * 2;
    const r = Math.sqrt(R());
    const hot = r < 0.55;
    g.add(
      part(new THREE.IcosahedronGeometry(0.03 + R() * 0.025, 0), hot ? (R() > 0.3 ? T.hot : M.coal) : R() > 0.75 ? M.coal : M.black, {
        x: ox + Math.cos(a) * r * 0.3,
        y: bed + 0.035 + (hot ? 0.01 : 0),
        z: 0.1 + Math.sin(a) * r * 0.18,
      }),
    );
  }
  for (let i = 0; i < 2; i++) g.add(part(new THREE.ConeGeometry(0.04, 0.14, 6), M.flame, { x: ox - 0.04 + i * 0.09, y: bed + 0.11, z: 0.12 }));
  // a bar in the fire, its end glowing
  g.add(rod(V3(ox + 0.05, bed + 0.06, 0.12), V3(ox + 0.62, bed + 0.12, 0.3), 0.012, 0.012, M.iron, 6));
  // the back: a stone chimney stack and a sloped hood over the bed
  const stackD = 0.34;
  const stackZ = -D / 2 + stackD / 2;
  masonry(g, { x: ox, z: stackZ, y0: bed, w: W - 0.1, h: 0.55, d: stackD }, T.rubble, R);
  const hoodY = bed + 0.55;
  g.add(box(W - 0.04, 0.08, stackD + 0.12, M.cap, { x: ox, y: hoodY + 0.04, z: stackZ + 0.04 }));
  const hood = new THREE.CylinderGeometry(0.22, 0.48, 0.42, 4, 1, true);
  g.add(part(hood, T.sheetIron, { x: ox, y: hoodY + 0.29, z: stackZ + 0.1, ry: Math.PI / 4, sz: 0.7 }));
  masonry(g, { x: ox, z: stackZ, y0: hoodY + 0.5, w: 0.42, h: 0.75, d: 0.3 }, T.rubble, R);
  g.add(box(0.5, 0.06, 0.38, M.cap, { x: ox, y: hoodY + 1.28, z: stackZ }));
  // bellows on a trestle at the +x side, its nozzle into the hearth
  for (const z of [-0.1, 0.14]) g.add(box(0.05, 0.5, 0.05, M.beam, { x: ox + W / 2 + 0.3, y: 0.25, z }));
  g.add(box(0.06, 0.05, 0.34, M.beam, { x: ox + W / 2 + 0.3, y: 0.5, z: 0.02 }));
  bellows(g, ox + W / 2 + 0.36, 0.52, 0.02, M);
  // tools hung on the rim, and a quench tub at the front corner
  for (let i = 0; i < 3; i++) {
    const x = ox - W / 2 + 0.12 + i * 0.1;
    g.add(rod(V3(x, bed + 0.02, D / 2 + 0.03), V3(x + 0.02, bed - 0.5, D / 2 + 0.05), 0.009, 0.009, M.iron, 5));
  }
  const tub = [
    [0.15, 0],
    [0.19, 0.3],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(part(new THREE.LatheGeometry(tub, 16), M.staves, { x: ox - W / 2 - 0.08, z: D / 2 - 0.02 }));
  g.add(part(new THREE.CircleGeometry(0.17, 16), T.water, { x: ox - W / 2 - 0.08, y: 0.25, z: D / 2 - 0.02, rx: -Math.PI / 2 }));
  for (const y of [0.05, 0.25]) g.add(part(new THREE.TorusGeometry(0.155 + y * 0.13, 0.008, 5, 18), M.iron, { x: ox - W / 2 - 0.08, y, z: D / 2 - 0.02, rx: Math.PI / 2 }));
  // spilled coal at its foot
  for (let i = 0; i < 9; i++)
    g.add(part(new THREE.IcosahedronGeometry(0.03 + R() * 0.02, 0), M.black, { x: ox + (R() - 0.3) * 0.4, y: 0.02, z: D / 2 + 0.08 + R() * 0.08 }));
  return scaled(g, S);
}

/** The smith's anvil on its oak block, a hammer on the face and tongs leaning on the block. */
export function anvil() {
  const M = materials();
  const g = new THREE.Group();
  const R = rng(571);
  // the block: an oak round, end grain up, a hoop of iron
  g.add(part(new THREE.CylinderGeometry(0.2, 0.23, 0.42, 14), M.bark, { y: 0.21 }));
  g.add(part(new THREE.CylinderGeometry(0.195, 0.195, 0.01, 14), M.wood, { y: 0.425 }));
  g.add(part(new THREE.TorusGeometry(0.212, 0.01, 5, 20), M.iron, { y: 0.34, rx: Math.PI / 2 }));
  // the anvil: feet, waist, body and face, a horn to +x, the heel to -x
  const a = new THREE.Group();
  a.position.y = 0.43;
  a.rotation.y = 0.15;
  a.add(box(0.32, 0.05, 0.2, M.iron, { y: 0.025 }));
  a.add(box(0.22, 0.05, 0.15, M.iron, { y: 0.07 }));
  a.add(box(0.14, 0.08, 0.1, M.iron, { y: 0.135 }));
  a.add(box(0.36, 0.08, 0.12, M.iron, { y: 0.215 }));
  a.add(box(0.36, 0.012, 0.115, M.steel, { y: 0.261 }));
  a.add(part(new THREE.ConeGeometry(0.05, 0.22, 10), M.iron, { x: 0.28, y: 0.22, rz: -Math.PI / 2 }));
  a.add(box(0.1, 0.06, 0.08, M.iron, { x: -0.22, y: 0.225 }));
  // the hammer lying on the face
  a.add(box(0.1, 0.04, 0.04, M.steel, { x: -0.05, y: 0.287, z: 0.02, ry: 0.5 }));
  a.add(rod(V3(-0.05, 0.287, 0.02), V3(0.12, 0.29, 0.22), 0.012, 0.014, M.wood, 6));
  g.add(a);
  // tongs leaning on the block, and a scatter of scale at its foot
  g.add(rod(V3(0.24, 0.0, 0.18), V3(0.16, 0.4, 0.06), 0.008, 0.008, M.iron, 5));
  g.add(rod(V3(0.27, 0.0, 0.15), V3(0.17, 0.4, 0.04), 0.008, 0.008, M.iron, 5));
  for (let i = 0; i < 8; i++)
    g.add(box(0.02 + R() * 0.02, 0.006, 0.02 + R() * 0.02, M.black, { x: (R() - 0.5) * 0.6, y: 0.003, z: 0.15 + R() * 0.15, ry: R() * 3 }));
  return scaled(g, S);
}
