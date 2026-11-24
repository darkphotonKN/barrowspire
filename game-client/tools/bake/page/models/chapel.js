// The chapel and its graveyard (FS-R4MYX §H R36): the chapel's pews, altar, lectern and dais, the
// belfry by its door, and the graveyard's headstones, grave flowers, fresh mounds, stone cross and
// low broken wall. Authored in code (ADR-0020, ADR-0021) on the shared materials and key light, at
// the town's scale: one three.js unit is one tile edge (40 world px), +x is world +x, +z is world
// +y, +y is up, and each model's origin is the centre of its footprint, the point the scene places
// it on. Footprints, in world px (x × y):
//   pew             20 × 100, the server's pew rect (owner feedback F1: rebaked from 20 × 70): long
//                   along y, its back on the east (+x) side, the seat facing west toward the altar;
//                   seat 24 px up, back 58 px, a middle support under the long seat
//   chapel_altar    30 × 80, the server's altar rect: long along y, a stone block under a dark
//                   cloth whose frontal hangs on its east face, toward the pews
//   lectern         20 × 20, an oak reading stand, its desk sloping down to the west (the reader
//                   stands on the dais behind it), a closed book on it
//   dais            130 × 200, flat: a low stone platform's flagged top and its front edge, laid
//                   on the floor decal layer like the Inn's rug, so no ground shadow
//   belfry          40 × 40 (r 20): a ruined bell frame on a rubble-stone pier, a dark bell under a
//                   little shingled roof, an iron cross bent off true on its ridge; tall
//   headstone       within 26 × 30, each facing east (its inscription toward the camera); frames
//                   by HEADSTONES: intact, weathered, broken
//   grave_flowers   within 16 × 16, a posy laid on a grave: fresh, the yard's one warm note, or
//                   withered brown stems
//   grave_mound     50 × 28, raw dark earth heaped a little, long along x (the grave runs east
//                   from its head)
//   stone_cross     within 36 × 36, a tall lichened wheel-head cross on two steps, facing east
//   graveyard_wall  one tile of low dry-stone along x or along y: whole or crumbled (WALL_STATES)
//   wayside_cross   within 40 × 40 (r 20, R41): a tall weathered calvary cross on three steps by the
//                   chapel's door and path, facing east; tall, an occluder
//
// Dark fantasy and old: weathered, mossy, cracked stone, dead wood gone grey, rusted iron. Colour
// stays in the bake's channels (design guideline "Gameplay accent"): nothing here is interactable
// or lit, so nothing is amber; the fresh flowers' muted red is the yard's only warmth.

import * as THREE from "three";
import { fbm, hash2, rng, smoothstep, vnoise, vnoise3 } from "../noise.js";
import { mix, shade } from "../palette.js";
import { materials, pixelTexture, plain, textured } from "../materials.js";
import { part, rod, V3 } from "./util.js";

/** World px to model units. */
const u = (px) => px / 40;

/** The headstones' frames by state, in frame order: the client picks a stone by state and index. */
export const HEADSTONES = {
  intact: ["rounded", "gothic"],
  weathered: ["cracked", "leaning", "chipped"],
  broken: ["stump", "snapped"],
};

/** A graveyard wall tile's frames, in frame order. */
export const WALL_STATES = ["whole", "crumbled"];

// ── Palette (BARROW blends only) ─────────────────────────────────────────────────────────

/** Headstone limestone: pale once, grey with a century of rain. */
const LIMESTONE = mix(mix("slateLight", "vellumDark", 0.4), "slate", 0.15);
/** The oldest stones, darker and greener. */
const LIMESTONE_OLD = mix(mix("slate", "vellumFaint", 0.35), "barrowDeep", 0.18);
const LICHEN = mix(mix("slateLight", "vellumDark", 0.45), "arcaneDeep", 0.2);
const MOSS = mix(mix("arcaneDeep", "slate", 0.35), "barrowDeep", 0.15);
const STREAK = mix("charcoal", "slate", 0.4);
const INCISED = mix("charcoal", "slate", 0.3);
/** Field stone for the dry-stone wall: cold slate shot with earth. */
const FIELDSTONE = mix("slate", "barrowBrown", 0.3);
/** The chapel's masonry, as the tower's coursed stone. */
const BLOCK = mix("slate", "barrowBrown", 0.32);
const FLAG = mix(mix("slateLight", "vellumFaint", 0.3), "slate", 0.25);
const JOINT = mix("charcoal", "barrowDeep", 0.45);
const GRIME = mix("charcoal", "barrowDeep", 0.6);
/** Grave earth, turned and damp. */
const EARTH = mix("barrowDeep", "charcoal", 0.3);
const CLAY = mix("barrowBrown", "barrowDeep", 0.55);
/** The altar's cloth: oxblood gone almost black, with a dull gilt band. */
const CLOTH = mix(mix("oxblood", "barrowDeep", 0.45), "pitch", 0.55);
const GILT = mix(mix("brass", "barrowDeep", 0.45), "umber", 0.15);
const PEWTER = mix("slateLight", "slate", 0.35);
/** The bell: bronze darkened and gone green at the lip. */
const BRONZE = mix(mix(mix("brass", "barrowDeep", 0.6), "charcoal", 0.45), "necrotic", 0.2);
const WAX = mix("vellum", "vellumDark", 0.4);
/** The fresh posy: a muted red, the pale of old linen, dark leaves. Never amber. */
const BLOOM_RED = mix("oxblood", "oxbloodText", 0.45);
const BLOOM_PALE = mix("vellum", "vellumDark", 0.2);
const STEM = mix("arcaneDeep", "arcane", 0.3);
const LEAF_DARK = mix("arcaneDeep", "charcoal", 0.25);
const WITHERED = mix("barrowBrown", "vellumDark", 0.3);
const WITHERED_HEAD = mix(mix("barrowDeep", "oxblood", 0.3), "barrowBrown", 0.3);
const TWINE = mix("vellumFaint", "barrowBrown", 0.3);

// ── Materials ────────────────────────────────────────────────────────────────────────────

/** Weathered stone: mottled, pitted, rain-streaked and blotched with lichen. */
const weathered = (base, s, lichen = 0.6) =>
  pixelTexture(128, 128, (x, y) => {
    let c = shade(base, (0.68 + 0.42 * fbm(x / 16, y / 16, s)) * (0.9 + 0.2 * fbm(x / 4, y / 4, s + 1)));
    // rain streaks running down the face
    c = mix(c, STREAK, 0.45 * smoothstep(0.62, 0.85, vnoise(x / 3, y / 46, s + 2)));
    // pits
    if (vnoise(x / 1.6, y / 1.6, s + 3) > 0.86) c = shade(c, 0.7);
    // lichen rosettes
    c = mix(c, LICHEN, lichen * smoothstep(0.6, 0.72, fbm(x / 9, y / 9, s + 4)));
    return c;
  });

let CHAPEL = null;

/** The chapel's and graveyard's own materials, built once per bake (seeded, so deterministic). */
function chapelMaterials() {
  if (CHAPEL) return CHAPEL;
  const D = THREE.DoubleSide;
  CHAPEL = {
    limestone: textured(weathered(LIMESTONE, 601, 0.45), { rough: 0.95, bump: 0.8 }),
    limestoneOld: textured(weathered(LIMESTONE_OLD, 611, 0.8), { rough: 1, bump: 1 }),
    fieldstone: textured(weathered(FIELDSTONE, 621, 0.35), { rough: 1, bump: 1 }),
    fieldstoneMossy: textured(
      pixelTexture(128, 128, (x, y) =>
        mix(shade(FIELDSTONE, 0.65 + 0.4 * fbm(x / 10, y / 10, 631)), MOSS, 0.75 * smoothstep(0.45, 0.62, fbm(x / 12, y / 12, 632))),
      ),
      { rough: 1, bump: 1 },
    ),
    block: textured(weathered(BLOCK, 641, 0.3), { rough: 0.95, bump: 1.2 }),
    // the dais's flagstones, painted to the platform's top (130 × 200 world px, 2 texture px each)
    flags: textured(flagTexture(), { rough: 0.95, bump: 0.6 }),
    incised: plain(INCISED, { rough: 1 }),
    lichen: plain(LICHEN, { rough: 1, side: D }),
    moss: plain(MOSS, { rough: 1, flat: true }),
    earth: textured(
      pixelTexture(64, 64, (x, y) =>
        mix(shade(EARTH, 0.6 + 0.6 * fbm(x / 6, y / 6, 651)), CLAY, 0.35 * smoothstep(0.55, 0.75, fbm(x / 10, y / 10, 652))),
      ),
      { rough: 1, bump: 1.2 },
    ),
    clod: plain(mix(EARTH, CLAY, 0.3), { rough: 1, flat: true }),
    cloth: textured(
      pixelTexture(128, 128, (x, y) =>
        shade(CLOTH, (0.72 + 0.5 * fbm(x / 14, y / 14, 661)) * ((x + y) % 4 < 2 ? 1 : 0.9) * (0.92 + 0.12 * vnoise(x / 2, y / 40, 662))),
      ),
      { side: D, bump: 0.3 },
    ),
    gilt: plain(GILT, { rough: 0.6, metal: 0.5 }),
    pewter: plain(PEWTER, { rough: 0.45, metal: 0.7 }),
    bronze: plain(BRONZE, { rough: 0.6, metal: 0.45, side: D }),
    wax: plain(WAX, { rough: 0.6 }),
    bloomRed: plain(BLOOM_RED, { rough: 0.8 }),
    bloomPale: plain(BLOOM_PALE, { rough: 0.8 }),
    stem: plain(STEM, { rough: 0.85 }),
    leaf: plain(LEAF_DARK, { rough: 0.9, flat: true, side: D }),
    withered: plain(WITHERED, { rough: 1 }),
    witheredHead: plain(WITHERED_HEAD, { rough: 1, flat: true }),
    twine: plain(TWINE, { rough: 1 }),
  };
  return CHAPEL;
}

/** The dais's flags: courses of large slabs, worn pale where feet go, cracked, dark-jointed. */
function flagTexture() {
  const W = 260;
  const H = 400;
  const R = rng(671);
  // rows of slabs down the platform's length, each row its own joints
  const rows = [];
  for (let y = 0; y < H; ) {
    const h = Math.min(H - y, 64 + Math.floor(R() * 44));
    const xs = [0];
    while (xs[xs.length - 1] < W) xs.push(Math.min(W, xs[xs.length - 1] + 70 + Math.floor(R() * 70)));
    if (W - xs[xs.length - 2] < 40) xs.splice(xs.length - 2, 1);
    rows.push({ y0: y, y1: y + h, xs });
    y += h;
  }
  return pixelTexture(W, H, (x, y) => {
    const row = rows.find((r) => y < r.y1) ?? rows[rows.length - 1];
    let i = 0;
    while (x >= row.xs[i + 1]) i++;
    const dx = Math.min(x - row.xs[i], row.xs[i + 1] - x);
    const dy = Math.min(y - row.y0, row.y1 - y);
    const id = hash2(row.y0, i, 673);
    const edge = Math.min(dx, dy) + (vnoise(x / 3, y / 3, 674) - 0.5) * 2.5;
    let c = shade(FLAG, (0.62 + 0.22 * id) * (0.78 + 0.34 * fbm(x / 18, y / 18, 675)) * (0.93 + 0.1 * vnoise(x / 1.5, y / 1.5, 676)));
    // worn paler down the middle, where the priest has walked for a hundred years
    c = shade(c, 1 + 0.12 * smoothstep(0.35, 0, Math.abs(x / W - 0.6)));
    // grime toward the platform's edge, and a hairline crack through one slab in three
    c = mix(c, GRIME, 0.5 * (1 - smoothstep(0, 18, Math.min(x, W - x, y, H - y))));
    if (id > 0.78 && Math.abs(fbm(x / 22 + id * 9, y / 22, 677, 3) - 0.5) < 0.006) c = mix(c, JOINT, 0.6);
    return mix(c, shade(JOINT, 0.9 + 0.2 * vnoise(x, y, 678)), 1 - smoothstep(0.8, 2.6, edge));
  });
}

// ── Shared shapes ────────────────────────────────────────────────────────────────────────

/** A box from a flat options object. */
const box = (w, h, d, material, o = {}) => part(new THREE.BoxGeometry(w, h, d), material, o);

/** A box whose vertices are pushed about by noise: a rough-hewn, weathered or broken stone. */
function roughStone(w, h, d, seed, amount = 0.18, seg = 3) {
  const geo = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const s = Math.min(w, h, d);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = vnoise3(v.x * 7 + seed, v.y * 7, v.z * 7, seed) - 0.5;
    pos.setXYZ(i, v.x + n * s * amount, v.y + n * s * amount * 0.6, v.z + n * s * amount);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * A stone slab standing in the y-z plane, its faces to east and west: `outline` is [z, y] points
 * round its face (bottom at y 0), extruded `thick` along x about the origin, its edges softened.
 */
function slab(outline, thick, material, bevel = 0.012) {
  const shape = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thick - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  geo.translate(0, bevel, -(thick - 2 * bevel) / 2);
  // shape x → world +z, extrusion → world x
  return part(geo, material, { ry: -Math.PI / 2 });
}

/** An arc's points from angle a0 to a1 about (cz, cy), radius r, in `n` steps (inclusive). */
const arc = (cz, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => {
  const a = a0 + ((a1 - a0) * i) / n;
  return [cz + r * Math.cos(a), cy + r * Math.sin(a)];
});

/** Moss and grass tufts round a stone's foot: low, flattened lumps inside `rz` × `rx` about (x, z). */
function mossFoot(g, R, n, { x = 0, z = 0, rx = 0.15, rz = 0.3 } = {}) {
  const C = chapelMaterials();
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2;
    const s = 0.035 + R() * 0.04;
    g.add(part(new THREE.IcosahedronGeometry(s, 0), C.moss, { x: x + Math.cos(a) * rx * (0.6 + R() * 0.4), y: s * 0.25, z: z + Math.sin(a) * rz * (0.6 + R() * 0.4), sy: 0.5, ry: R() * 3 }));
  }
}

/** Lichen rosettes on a slab's east face (x = `face`): flat discs between y0 and y1, |z| < half. */
function lichenOn(g, R, n, face, y0, y1, half) {
  const C = chapelMaterials();
  for (let i = 0; i < n; i++)
    g.add(
      part(new THREE.CircleGeometry(0.02 + R() * 0.035, 8), C.lichen, {
        x: face + 0.002,
        y: y0 + R() * (y1 - y0),
        z: (R() - 0.5) * 2 * half,
        ry: Math.PI / 2,
      }),
    );
}

// ── The chapel ───────────────────────────────────────────────────────────────────────────

/** Pew: depth (x) and length (y) in units, the server's 20 × 100 rect (owner feedback F1). */
const PEW_D = u(20);
const PEW_L = u(100);
const PEW_SEAT = u(24);
const PEW_BACK = u(58);

/**
 * A plain dark-oak pew with a back: two solid ends, a seat plank, a back board leaning a little
 * east, a book rail on the back's east face for the pew behind, a hymnal left on the seat. A
 * pew this long has a middle support under its seat.
 */
export function pew() {
  const M = materials();
  const g = new THREE.Group();
  const R = rng(681);
  const L = PEW_L - 0.02;
  // the ends: solid boards from the floor, rounded off at the top
  for (const sz of [-1, 1]) {
    const z = sz * (L / 2 - 0.025);
    g.add(box(PEW_D - 0.03, PEW_SEAT + 0.32, 0.05, M.woodDark, { x: 0, y: (PEW_SEAT + 0.32) / 2, z }));
    g.add(part(new THREE.CylinderGeometry(0.035, 0.035, PEW_D - 0.03, 8), M.woodDark, { y: PEW_SEAT + 0.32, z, rz: Math.PI / 2 }));
  }
  // the seat, toward the west, its front edge rounded
  const seatW = PEW_D - 0.12;
  g.add(box(seatW, 0.05, L - 0.1, M.woodDark, { x: -0.04, y: PEW_SEAT, rz: (R() - 0.5) * 0.02 }));
  g.add(part(new THREE.CylinderGeometry(0.028, 0.028, L - 0.1, 8), M.woodDark, { x: -0.04 - seatW / 2, y: PEW_SEAT, rx: Math.PI / 2 }));
  // a rail under the seat to stiffen the ends, and a middle support under the long seat
  g.add(box(0.04, 0.06, L - 0.1, M.beam, { x: -0.02, y: 0.18 }));
  g.add(box(PEW_D - 0.1, PEW_SEAT - 0.03, 0.05, M.woodDark, { x: 0.01, y: (PEW_SEAT - 0.03) / 2 }));
  // the back: rises from behind the seat, leaning a little east, under a capping rail
  const lean = 0.08;
  const backH = PEW_BACK - PEW_SEAT + 0.04;
  const back = new THREE.Group();
  back.position.set(0.12, PEW_SEAT - 0.04, 0);
  back.rotation.z = -lean;
  back.add(box(0.04, backH, L - 0.1, M.woodDark, { y: backH / 2 }));
  back.add(box(0.07, 0.04, L - 0.06, M.beam, { y: backH + 0.01 }));
  // the book rail on the back's east face, for the pew behind
  back.add(box(0.07, 0.025, L - 0.16, M.woodDark, { x: 0.05, y: backH - 0.32 }));
  g.add(back);
  // a hymnal left on the seat, its leather gone dull
  g.add(box(0.14, 0.03, 0.2, M.leather, { x: -0.06, y: PEW_SEAT + 0.04, z: L * 0.22, ry: 0.3 }));
  return g;
}

/** Altar: depth (x) and length (y) in units, the server's 30 × 80 rect. */
const ALTAR_D = u(30);
const ALTAR_L = u(80);
const ALTAR_TOP = 1.45;

/**
 * The chapel's altar: a stone block on a plinth under an overhanging mensa slab, a dark cloth laid
 * over the slab with its frontal hanging on the east face (an embroidered cross worn pale, a dull
 * gilt band, a fringe), a small iron cross and a pewter chalice on it, old wax down one corner.
 */
export function chapelAltar() {
  const M = materials();
  const C = chapelMaterials();
  const g = new THREE.Group();
  const R = rng(691);
  g.add(part(roughStone(ALTAR_D - 0.02, 0.1, ALTAR_L - 0.02, 692, 0.12), C.block, { y: 0.05 }));
  g.add(part(roughStone(ALTAR_D - 0.18, ALTAR_TOP - 0.22, ALTAR_L - 0.2, 693, 0.06), C.block, { y: 0.1 + (ALTAR_TOP - 0.22) / 2 }));
  const slabY = ALTAR_TOP - 0.06;
  g.add(part(roughStone(ALTAR_D - 0.04, 0.1, ALTAR_L - 0.06, 694, 0.08), C.limestone, { y: slabY }));
  // the cloth over the slab, and its frontal down the east face
  const top = slabY + 0.05;
  g.add(box(ALTAR_D - 0.06, 0.012, ALTAR_L - 0.3, C.cloth, { y: top + 0.006 }));
  const frontX = ALTAR_D / 2 - 0.02;
  const dropH = 0.62;
  g.add(box(0.012, dropH, ALTAR_L - 0.3, C.cloth, { x: frontX, y: top - dropH / 2 }));
  g.add(box(0.016, 0.035, ALTAR_L - 0.3, C.gilt, { x: frontX + 0.002, y: top - dropH + 0.09 }));
  // the embroidered cross, its thread gone the colour of old bone
  g.add(box(0.016, 0.3, 0.04, C.bloomPale, { x: frontX + 0.002, y: top - 0.3 }));
  g.add(box(0.016, 0.04, 0.2, C.bloomPale, { x: frontX + 0.002, y: top - 0.22 }));
  // the fringe along the frontal's hem
  for (let i = 0; i < 26; i++) {
    const z = -(ALTAR_L - 0.32) / 2 + (i + 0.5) * ((ALTAR_L - 0.32) / 26);
    g.add(box(0.01, 0.05 + R() * 0.015, 0.018, C.cloth, { x: frontX, y: top - dropH - 0.025, z }));
  }
  // a small iron cross at the slab's middle, a chalice before it
  g.add(box(0.12, 0.05, 0.16, M.iron, { y: top + 0.04 }));
  g.add(box(0.035, 0.4, 0.035, M.iron, { y: top + 0.25 }));
  g.add(box(0.035, 0.035, 0.22, M.iron, { y: top + 0.34 }));
  const chalice = [
    [0.001, 0],
    [0.07, 0.01],
    [0.03, 0.04],
    [0.018, 0.12],
    [0.03, 0.15],
    [0.07, 0.22],
    [0.065, 0.23],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(part(new THREE.LatheGeometry(chalice, 12), C.pewter, { x: 0.12, y: top + 0.012, z: 0.22 }));
  // old wax run down the slab's north-east corner
  g.add(part(new THREE.CylinderGeometry(0.03, 0.04, 0.05, 8), C.wax, { x: frontX - 0.06, y: top + 0.03, z: -(ALTAR_L / 2 - 0.22) }));
  for (const [dz, len] of [
    [0, 0.12],
    [0.04, 0.2],
  ])
    g.add(box(0.012, len, 0.02, C.wax, { x: frontX - 0.005, y: slabY - len / 2 + 0.04, z: -(ALTAR_L / 2 - 0.2) + dz }));
  return g;
}

/** Lectern: its square footprint in units (about 20 × 20 world px). */
const LECTERN = u(20);

/**
 * An oak reading stand: a cross foot, a chamfered post with a knop, a sloped desk falling to the
 * west where the reader stands, a lip along its low edge, a thick closed book lying on it.
 */
export function lectern() {
  const M = materials();
  const g = new THREE.Group();
  for (const ry of [Math.PI / 4, -Math.PI / 4]) g.add(box(LECTERN * 0.95, 0.09, 0.1, M.woodDark, { y: 0.045, ry }));
  g.add(part(new THREE.CylinderGeometry(0.075, 0.095, 1.5, 8), M.woodDark, { y: 0.09 + 0.75 }));
  g.add(part(new THREE.CylinderGeometry(0.105, 0.105, 0.07, 8), M.beam, { y: 0.8 }));
  // the desk: its high edge east, falling to the west
  const tilt = 0.5;
  // the desk's body: a wedge-deep box under the sloped top, so the stand reads from the side
  g.add(box(0.2, 0.16, 0.4, M.woodDark, { y: 1.62 }));
  const desk = new THREE.Group();
  desk.position.set(0, 1.74, 0);
  desk.rotation.z = tilt;
  desk.add(box(0.4, 0.05, 0.44, M.woodDark));
  desk.add(box(0.035, 0.06, 0.44, M.beam, { x: -0.2, y: 0.04 }));
  // the book, shut: boards, a block of pages, its spine to the north
  desk.add(box(0.26, 0.012, 0.32, M.leather, { x: 0.01, y: 0.024 }));
  desk.add(box(0.25, 0.05, 0.3, M.vellum, { x: 0.012, y: 0.055 }));
  desk.add(box(0.26, 0.012, 0.32, M.leather, { x: 0.01, y: 0.086 }));
  desk.add(part(new THREE.CylinderGeometry(0.036, 0.036, 0.26, 8), M.leather, { x: 0.01, y: 0.055, z: -0.15, rz: Math.PI / 2 }));
  // a ribbon marker hanging off the low edge
  desk.add(box(0.012, 0.14, 0.018, chapelMaterials().cloth, { x: -0.13, y: -0.02, z: 0.06 }));
  g.add(desk);
  return g;
}

/** Dais: its width (x) and length (y) in units, 130 × 200 world px, and its height. */
const DAIS_W = u(130);
const DAIS_L = u(200);
const DAIS_H = 0.075;

/**
 * The low stone platform the altar stands on: a flagged top and a kerb of dressed stone along its
 * edge, a few stones of the kerb sunk or chipped. Flat, for the floor decal layer.
 */
export function dais() {
  const M = materials();
  const C = chapelMaterials();
  const g = new THREE.Group();
  // the body, its top the flags (BoxGeometry faces: +x, -x, +y, -y, +z, -z)
  g.add(part(new THREE.BoxGeometry(DAIS_W - 0.06, DAIS_H, DAIS_L - 0.06), [M.cap, M.cap, C.flags, M.cap, M.cap, M.cap], { y: DAIS_H / 2 }));
  // the kerb: dressed stones along the east (front) and south edges, the camera's sides
  const R = rng(701);
  const kerb = (along, at, len, axis) => {
    for (let s = -len / 2; s < len / 2 - 0.05; ) {
      const l = Math.min(0.42 + R() * 0.3, len / 2 - s);
      const h = DAIS_H + (R() - 0.6) * 0.02;
      const geo = roughStone(axis === "x" ? 0.12 : l - 0.012, h, axis === "x" ? l - 0.012 : 0.12, Math.floor(R() * 1000), 0.06, 2);
      const c = s + l / 2;
      g.add(part(geo, M.cap, axis === "x" ? { x: at, y: h / 2, z: c } : { x: c, y: h / 2, z: at }));
      s += l;
    }
  };
  kerb("z", DAIS_W / 2 - 0.06, DAIS_L, "x");
  kerb("x", DAIS_L / 2 - 0.06, DAIS_W - 0.12, "z");
  return g;
}

// ── The belfry ───────────────────────────────────────────────────────────────────────────

/** The bell frame's corner posts stand this far either side of the centre. */
const POST = 0.36;
const PIER_H = 1.15;
const FRAME_TOP = 3.55;

/** A rubble-stone pier: coursed blocks round a dark core, a corner of its top course gone. */
function pier(g, M, C, R) {
  const W = 0.9;
  g.add(box(W - 0.12, PIER_H - 0.02, W - 0.12, M.black, { y: (PIER_H - 0.02) / 2 }));
  let y = 0;
  while (y < PIER_H - 0.02) {
    const ch = Math.min(0.16 + R() * 0.08, PIER_H - y);
    const top = y + ch >= PIER_H - 0.02;
    for (const [axis, side] of [
      ["x", -1],
      ["x", 1],
      ["z", -1],
      ["z", 1],
    ]) {
      // random block lengths break the joints from course to course
      let s = -W / 2;
      while (s < W / 2 - 0.02) {
        const l = Math.min(0.22 + R() * 0.2, W / 2 - s);
        // the ruined corner: the top course gone at the south-east
        const ruin = top && side === 1 && s + l / 2 > 0.05;
        if (!ruin) {
          const mat = R() > 0.75 ? C.fieldstoneMossy : C.block;
          const geo = roughStone(axis === "x" ? l - 0.015 : 0.13, ch - 0.012, axis === "x" ? 0.13 : l - 0.015, Math.floor(R() * 1000), 0.14, 2);
          const c = s + l / 2;
          const off = side * (W / 2 - 0.065);
          g.add(part(geo, mat, axis === "x" ? { x: c, y: y + ch / 2, z: off } : { x: off, y: y + ch / 2, z: c }));
        }
        s += l;
      }
    }
    y += ch;
  }
  // the stone that fell from the ruined corner, at the pier's foot
  g.add(part(roughStone(0.2, 0.12, 0.13, 711, 0.2, 2), C.block, { x: 0.36, y: 0.05, z: 0.34, ry: 0.7, rz: 0.2 }));
  mossFoot(g, R, 12, { rx: 0.42, rz: 0.42 });
}

/** The bent iron cross on the ridge: straight to a kink, then the rest bent off true. */
function bentCross(g, M, y) {
  g.add(box(0.12, 0.06, 0.12, M.iron, { y: y + 0.03 }));
  g.add(box(0.045, 0.34, 0.045, M.rust, { y: y + 0.06 + 0.17 }));
  const upper = new THREE.Group();
  upper.position.set(0, y + 0.4, 0);
  upper.rotation.set(0.07, 0, 0.2);
  upper.add(box(0.045, 0.42, 0.045, M.rust, { y: 0.21 }));
  // the arms run along y (north–south): the cross faces east, the way the chapel's door does
  const arms = new THREE.Group();
  arms.position.set(0, 0.24, 0);
  arms.rotation.x = 0.1;
  arms.add(box(0.04, 0.04, 0.36, M.rust));
  for (const sz of [-1, 1]) arms.add(part(new THREE.SphereGeometry(0.028, 8, 6), M.iron, { z: sz * 0.18 }));
  upper.add(arms);
  upper.add(part(new THREE.SphereGeometry(0.03, 8, 6), M.iron, { y: 0.43 }));
  g.add(upper);
}

/**
 * The belfry: a ruined bell frame of weathered timber on a rubble-stone pier, braced on its sides
 * (one brace snapped and hanging), a dark bronze bell hung from its headstock, under a little
 * shingled roof with shingles gone, an iron cross on the ridge bent a little off true.
 */
export function belfry() {
  const M = materials();
  const C = chapelMaterials();
  const g = new THREE.Group();
  const R = rng(721);
  pier(g, M, C, R);
  // sill beams on the pier, posts at the corners, a top plate
  for (const sz of [-1, 1]) g.add(box(2 * POST + 0.1, 0.09, 0.1, M.beam, { y: PIER_H + 0.045, z: sz * POST }));
  for (const sx of [-1, 1]) g.add(box(0.1, 0.09, 2 * POST - 0.1, M.beam, { x: sx * POST, y: PIER_H + 0.045 }));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const h = FRAME_TOP - PIER_H;
      g.add(box(0.09, h, 0.09, M.beam, { x: sx * POST, y: PIER_H + h / 2, z: sz * POST, rx: (R() - 0.5) * 0.03, rz: (R() - 0.5) * 0.03 }));
    }
  for (const sz of [-1, 1]) g.add(box(2 * POST + 0.12, 0.1, 0.1, M.beam, { y: FRAME_TOP + 0.05, z: sz * POST }));
  for (const sx of [-1, 1]) g.add(box(0.1, 0.1, 2 * POST - 0.1, M.beam, { x: sx * POST, y: FRAME_TOP + 0.05 }));
  // braces: a saltire on each side, the south-east one snapped and hanging
  const lo = PIER_H + 0.1;
  const hi = PIER_H + 1.15;
  for (const sz of [-1, 1]) {
    g.add(rod(V3(-POST, lo, sz * POST), V3(POST, hi, sz * POST), 0.03, 0.03, M.woodDark, 5));
    if (sz === 1) {
      g.add(rod(V3(POST, lo, POST), V3(0.08, lo + 0.62, POST), 0.03, 0.028, M.woodDark, 5));
      g.add(rod(V3(-POST, hi, POST), V3(-0.12, hi - 0.15, POST + 0.02), 0.03, 0.028, M.woodDark, 5));
    } else g.add(rod(V3(POST, lo, sz * POST), V3(-POST, hi, sz * POST), 0.03, 0.03, M.woodDark, 5));
  }
  for (const sx of [-1, 1]) {
    g.add(rod(V3(sx * POST, lo, -POST), V3(sx * POST, hi, POST), 0.03, 0.03, M.woodDark, 5));
    g.add(rod(V3(sx * POST, lo, POST), V3(sx * POST, hi, -POST), 0.03, 0.03, M.woodDark, 5));
  }
  // bearers between the posts, the headstock across them, the bell hung from it
  const stockY = FRAME_TOP - 0.3;
  for (const sx of [-1, 1]) g.add(box(0.08, 0.08, 2 * POST - 0.1, M.woodDark, { x: sx * 0.28, y: stockY - 0.06 }));
  g.add(box(0.64, 0.12, 0.12, M.beam, { y: stockY + 0.04 }));
  for (const sx of [-1, 1]) g.add(box(0.025, 0.16, 0.13, M.iron, { x: sx * 0.08, y: stockY - 0.06 }));
  const bell = [
    [0.21, 0],
    [0.225, 0.025],
    [0.19, 0.07],
    [0.155, 0.2],
    [0.135, 0.34],
    [0.115, 0.4],
    [0.06, 0.45],
    [0.001, 0.46],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const bellY = stockY - 0.14 - 0.46;
  g.add(part(new THREE.LatheGeometry(bell, 20), C.bronze, { y: bellY }));
  g.add(part(new THREE.TorusGeometry(0.2, 0.012, 5, 20), C.bronze, { y: bellY + 0.045, rx: Math.PI / 2 }));
  g.add(part(new THREE.SphereGeometry(0.045, 8, 6), M.iron, { y: bellY - 0.02 }));
  // the bell rope, rotted through and hanging short
  g.add(rod(V3(0.05, bellY + 0.05, 0.02), V3(0.08, bellY - 0.55, 0.05), 0.012, 0.01, C.twine, 4));
  // the little roof: shingles in rows down each slope, a few gone, a ridge beam, the cross
  const half = 0.44;
  const rise = 0.4;
  const roofY = FRAME_TOP + 0.1;
  const pitch = Math.atan2(rise, half);
  const slopeLen = Math.hypot(half, rise);
  for (const sz of [-1, 1]) {
    const rows = 5;
    for (let r = 0; r < rows; r++) {
      const t = (r + 0.5) / rows;
      const y = roofY + rise * (1 - t);
      const z = sz * half * t;
      for (let k = 0; k < 6; k++) {
        if (R() < 0.12 && r > 0) continue;
        const x = -0.45 + (k + 0.5) * 0.15 + (r % 2 ? 0.04 : 0) - 0.02;
        if (Math.abs(x) > 0.47) continue;
        g.add(box(0.145, 0.025, slopeLen / rows + 0.04, R() > 0.3 ? M.woodDark : M.beam, { x, y: y + 0.02, z, rx: sz * pitch, rz: (R() - 0.5) * 0.05 }));
      }
    }
    // the slope's boards under the shingles, dark where the shingles are gone
    g.add(box(0.96, 0.02, slopeLen, M.black, { y: roofY + rise / 2, z: (sz * half) / 2, rx: sz * pitch }));
  }
  g.add(box(0.98, 0.07, 0.08, M.beam, { y: roofY + rise + 0.02 }));
  bentCross(g, M, roofY + rise + 0.05);
  return g;
}

// ── The graveyard ────────────────────────────────────────────────────────────────────────

const STONE_THICK = 0.13;

/** A headstone's face outline, [z, y] round it, by shape. */
function stoneOutline(shape, R) {
  if (shape === "rounded") {
    const w = 0.54;
    const h = 1.0;
    return [[-w / 2, 0], [w / 2, 0], ...arc(0, h - w / 2, w / 2, 0, Math.PI, 14)];
  }
  if (shape === "gothic") {
    // a pointed arch: two arcs struck from the opposite shoulders
    const w = 0.48;
    const h = 1.12;
    const shoulder = h - 0.866 * w;
    return [[-w / 2, 0], [w / 2, 0], ...arc(-w / 2, shoulder, w, 0, Math.PI / 3, 8), ...arc(w / 2, shoulder, w, (2 * Math.PI) / 3, Math.PI, 8).slice(1)];
  }
  if (shape === "chipped") {
    // rounded, its north shoulder broken away in a jagged bite
    const w = 0.54;
    const h = 0.98;
    const top = arc(0, h - w / 2, w / 2, Math.PI * 0.42, Math.PI, 10);
    return [[-w / 2, 0], [w / 2, 0], [w / 2, h - w / 2 - 0.1], [w / 2 - 0.06, h - w / 2 - 0.04], [w / 2 - 0.05, h - 0.12], [w / 2 - 0.12, h - 0.1], [w / 2 - 0.15, h - 0.04], ...top];
  }
  // a broken stump: the stone snapped off, its top a jagged line
  const w = shape === "snapped" ? 0.5 : 0.54;
  const lo = shape === "snapped" ? 0.17 : 0.26;
  const n = 7;
  const jag = Array.from({ length: n + 1 }, (_, i) => [w / 2 - (w * i) / n, lo + R() * 0.12 + (i % 2 ? 0.04 : 0)]);
  return [[-w / 2, 0], [w / 2, 0], ...jag];
}

/** Incised lines on a slab's east face: a little cross near the top, lines of a worn inscription. */
function inscription(g, C, R, top, half, { lines = 4, cross = true } = {}) {
  const x = STONE_THICK / 2 + 0.003;
  if (cross) {
    g.add(box(0.006, 0.12, 0.022, C.incised, { x, y: top - 0.1 }));
    g.add(box(0.006, 0.022, 0.08, C.incised, { x, y: top - 0.075 }));
  }
  for (let i = 0; i < lines; i++) {
    const w = half * (1.1 - R() * 0.5) * (i === 0 ? 1.1 : 1);
    g.add(box(0.006, 0.016, w, C.incised, { x, y: top - 0.24 - i * 0.07, z: (R() - 0.5) * 0.03 }));
  }
}

/** A jagged crack down a slab's east face: short dark strokes zig-zagging from (y0, z0) to (y1, z1). */
function crack(g, C, R, [z0, y0], [z1, y1]) {
  const x = STONE_THICK / 2 + 0.004;
  const n = 6;
  let a = V3(x, y0, z0);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const b = V3(x, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t + (i < n ? (R() - 0.5) * 0.06 : 0));
    g.add(rod(a, b, 0.008, 0.006, C.incised, 4));
    a = b;
  }
}

/**
 * A headstone facing east, its inscription toward the camera. `state` and `index` pick its frame
 * (HEADSTONES): intact (rounded, gothic), weathered (cracked, leaning, chipped), broken (a jagged
 * stump, or one snapped lower with its broken corner lying at its foot).
 */
export function headstone(state, index) {
  const C = chapelMaterials();
  const which = HEADSTONES[state]?.[index];
  if (!which) throw new Error(`headstone: no ${state} stone ${index}`);
  const R = rng(731 + Object.keys(HEADSTONES).indexOf(state) * 10 + index);
  const g = new THREE.Group();
  const stone = new THREE.Group();
  const old = state !== "intact";
  const mat = old ? C.limestoneOld : C.limestone;
  const shape = which === "cracked" || which === "leaning" ? "rounded" : which;
  const outline = stoneOutline(shape, R);
  stone.add(slab(outline, STONE_THICK, mat));
  const top = Math.max(...outline.map(([, y]) => y));
  const half = Math.max(...outline.map(([z]) => z));
  if (state !== "broken") inscription(stone, C, R, top, half, { lines: which === "gothic" ? 3 : 4, cross: which !== "chipped" });
  else {
    // a last line or two of the inscription survive on the stump
    stone.add(box(0.006, 0.014, half * 0.9, C.incised, { x: STONE_THICK / 2 + 0.003, y: 0.12 }));
  }
  lichenOn(stone, R, old ? 9 : 4, STONE_THICK / 2 + 0.002, 0.05, top - 0.06, half - 0.06);
  if (which === "cracked") crack(stone, C, R, [half - 0.04, top - 0.12], [-half + 0.08, 0.18]);
  if (which === "chipped") {
    // the bitten-off corner's chips at its foot
    for (let i = 0; i < 3; i++)
      g.add(part(roughStone(0.05 + R() * 0.04, 0.03, 0.05 + R() * 0.03, 741 + i, 0.3, 2), mat, { x: 0.1 + R() * 0.12, y: 0.015, z: 0.12 + R() * 0.12, ry: R() * 3 }));
  }
  if (which === "snapped") {
    // the broken corner lying face-up east of the stump
    g.add(part(roughStone(0.16, 0.05, 0.2, 751, 0.25, 2), mat, { x: 0.19, y: 0.022, z: -0.04, ry: 0.5, rz: 0.08 }));
  }
  if (which === "leaning") {
    // sunk at the foot and heeled back to the west, a little to the north; the ground heaved east
    stone.rotation.set(-0.16, 0, 0.2);
    stone.position.set(0, 0, 0.06);
    g.add(part(new THREE.SphereGeometry(0.18, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), C.earth, { x: 0.12, y: -0.01, z: 0, sx: 0.8, sy: 0.25, sz: 1.4 }));
  }
  g.add(stone);
  mossFoot(g, R, old ? 10 : 6, { rx: 0.13, rz: half + 0.02 });
  return g;
}

/**
 * Flowers laid on a grave, stems to the west (the stone) and heads to the east. `fresh`: a small
 * posy tied with twine, muted red and linen-pale blooms among dark leaves, the yard's one warm
 * note. `withered`: the same posy a month on, brown stems, heads shrivelled and drooping, petals
 * fallen about it.
 */
export function graveFlowers(state) {
  const C = chapelMaterials();
  const fresh = state === "fresh";
  const g = new THREE.Group();
  const R = rng(fresh ? 761 : 762);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1) - 0.5) * 0.9 + (R() - 0.5) * 0.15;
    const len = 0.24 + R() * 0.08;
    const from = V3(-0.14, 0.02, (R() - 0.5) * 0.03);
    const to = V3(-0.14 + Math.cos(a) * len, fresh ? 0.03 + R() * 0.04 : 0.015, Math.sin(a) * len * 0.9);
    g.add(rod(from, to, 0.006, 0.005, fresh ? C.stem : C.withered, 4));
    if (fresh) {
      const bloom = i % 3 === 1 ? C.bloomPale : C.bloomRed;
      g.add(part(new THREE.IcosahedronGeometry(0.03 + R() * 0.012, 0), bloom, { x: to.x, y: to.y + 0.012, z: to.z, sy: 0.8, ry: R() * 3 }));
      if (i % 2 === 0) g.add(part(new THREE.CircleGeometry(0.03, 5), C.leaf, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + 0.01, z: (from.z + to.z) / 2 + 0.02, rx: -Math.PI / 2 + 0.3, rz: R() * 3, sx: 1.6 }));
    } else {
      // shrivelled heads bowed to the ground
      g.add(part(new THREE.IcosahedronGeometry(0.018 + R() * 0.008, 0), C.witheredHead, { x: to.x + 0.01, y: 0.015, z: to.z, sy: 0.6 }));
    }
  }
  // the twine binding the stems
  g.add(part(new THREE.TorusGeometry(0.022, 0.006, 4, 10), C.twine, { x: -0.08, y: 0.025, ry: Math.PI / 2 }));
  if (!fresh)
    for (let i = 0; i < 6; i++)
      g.add(part(new THREE.CircleGeometry(0.012, 5), C.witheredHead, { x: 0.02 + R() * 0.14, y: 0.004, z: (R() - 0.5) * 0.28, rx: -Math.PI / 2, rz: R() * 3 }));
  return g;
}

/** Fresh mound: length (x) and width (y) in units, 50 × 28 world px. */
const MOUND_L = u(50);
const MOUND_W = u(28);

/** A fresh grave: raw dark earth heaped long along x, lumpy, clods and stones tumbled off it. */
export function graveMound() {
  const C = chapelMaterials();
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = vnoise3(v.x * 3 + 2, v.y * 3, v.z * 3, 771) - 0.5;
    const k = 1 + n * 0.16;
    pos.setXYZ(i, v.x * k, v.y * (1 + n * 0.3), v.z * k);
  }
  geo.computeVertexNormals();
  g.add(part(geo, C.earth, { sx: MOUND_L / 2 - 0.08, sy: 0.28, sz: MOUND_W / 2 - 0.05 }));
  const R = rng(772);
  for (let i = 0; i < 16; i++) {
    const x = (R() - 0.5) * (MOUND_L - 0.2);
    const z = (R() - 0.5) * (MOUND_W - 0.12);
    const s = 0.025 + R() * 0.035;
    const hy = 0.28 * Math.sqrt(Math.max(0, 1 - (x / (MOUND_L / 2)) ** 2 - (z / (MOUND_W / 2)) ** 2));
    g.add(part(new THREE.DodecahedronGeometry(s, 0), R() > 0.8 ? C.fieldstone : C.clod, { x, y: hy + s * 0.3, z, ry: R() * 3, sy: 0.7 }));
  }
  return g;
}

/**
 * A tall wheel-head cross of the same grey stone as the oldest graves, on two rough steps, facing
 * east: its shaft and arms dressed square, a ring about the crossing, one arm chipped, lichen
 * thick on its weather side and moss on its steps.
 */
export function stoneCross() {
  const C = chapelMaterials();
  const g = new THREE.Group();
  const R = rng(781);
  g.add(part(roughStone(0.82, 0.18, 0.82, 782, 0.1), C.fieldstoneMossy, { y: 0.09 }));
  g.add(part(roughStone(0.54, 0.18, 0.54, 783, 0.1), C.limestoneOld, { y: 0.27 }));
  const base = 0.36;
  const shaft = 2.45;
  g.add(part(roughStone(0.17, shaft, 0.21, 784, 0.04, 4), C.limestoneOld, { y: base + shaft / 2 }));
  const armY = base + shaft - 0.42;
  // the arms run along y: the cross faces east
  g.add(part(roughStone(0.16, 0.16, 0.32, 785, 0.05), C.limestoneOld, { y: armY, z: -0.25 }));
  // the south arm, its end broken off
  g.add(part(roughStone(0.16, 0.16, 0.22, 786, 0.12), C.limestoneOld, { y: armY, z: 0.2 }));
  g.add(part(new THREE.TorusGeometry(0.24, 0.035, 6, 24), C.limestoneOld, { y: armY, ry: Math.PI / 2 }));
  // lichen on the shaft's east face and the ring
  for (let i = 0; i < 12; i++)
    g.add(part(new THREE.CircleGeometry(0.025 + R() * 0.035, 8), C.lichen, { x: 0.088, y: base + 0.15 + R() * (shaft - 0.3), z: (R() - 0.5) * 0.15, ry: Math.PI / 2 }));
  mossFoot(g, R, 14, { rx: 0.38, rz: 0.38 });
  return g;
}

/**
 * One tile of low dry-stone wall along `axis`, its stones laid without mortar in rough courses and
 * capped with stones set on edge. `whole`: standing to its full height. `crumbled`: fallen to a
 * course or two, its cope and upper stones tumbled to either side.
 */
export function graveyardWall(axis, state) {
  const C = chapelMaterials();
  const g = new THREE.Group();
  const crumbled = state === "crumbled";
  const R = rng(crumbled ? 792 : 791);
  const L = 1.03;
  const courses = [0.12, 0.11, 0.1, 0.1];
  const thick = (k) => 0.36 - k * 0.04;
  let y = 0;
  courses.forEach((ch, k) => {
    // a crumbled wall keeps its lowest course whole, then less and less of each above
    const keep = crumbled ? [1, 0.55, 0.2, 0][k] : 1;
    for (let s = -L / 2; s < L / 2 - 0.01; ) {
      const l = Math.min(0.16 + R() * 0.16, L / 2 - s);
      if (R() < keep) {
        const mat = R() > 0.7 ? C.fieldstoneMossy : C.fieldstone;
        g.add(part(roughStone(l - 0.01, ch - 0.008, thick(k), Math.floor(R() * 1000), 0.22, 2), mat, { x: s + l / 2, y: y + ch / 2, z: (R() - 0.5) * 0.02, rz: (R() - 0.5) * 0.06 }));
      }
      s += l;
    }
    y += ch;
  });
  if (!crumbled) {
    // the cope: flat stones on edge across the top
    for (let s = -L / 2 + 0.03; s < L / 2 - 0.03; s += 0.085) {
      const h = 0.13 + R() * 0.05;
      g.add(part(roughStone(0.065, h, thick(3) - 0.02, Math.floor(R() * 1000), 0.2, 2), C.fieldstone, { x: s + 0.03, y: y + h / 2 - 0.02, rz: (R() - 0.5) * 0.25 }));
    }
  } else {
    // the fallen stones lying either side of the wall
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      g.add(
        part(roughStone(0.14 + R() * 0.1, 0.08 + R() * 0.03, 0.14 + R() * 0.06, 801 + i, 0.25, 2), R() > 0.5 ? C.fieldstoneMossy : C.fieldstone, {
          x: (R() - 0.5) * (L - 0.25),
          y: 0.04,
          z: side * (0.26 + R() * 0.16),
          ry: R() * 3,
          rz: (R() - 0.5) * 0.4,
        }),
      );
    }
  }
  mossFoot(g, R, crumbled ? 10 : 6, { rx: L / 2 - 0.05, rz: 0.2 });
  if (axis === "y") g.rotation.y = Math.PI / 2;
  return g;
}

// ── The wayside cross ────────────────────────────────────────────────────────────────────

/** The wayside cross's steps, foot first: each step's square side and rise (units). */
const CALVARY_STEPS = [
  [0.92, 0.17],
  [0.72, 0.16],
  [0.5, 0.15],
];

/**
 * A tall wayside calvary by the chapel's door (R41, owner feedback F6: crosses outside): a Latin cross
 * of weathered limestone, its shaft chamfered and its arms ending in small square terminals, set in
 * a socket stone on three worn steps, facing east (its arms run along y). A little gabled weather
 * hood over the crossing, rain streaks and lichen down its east face, moss in the steps' joints, a
 * chipped step edge. Grey with age, not whitewashed: it stands outside the lime.
 */
export function waysideCross() {
  const C = chapelMaterials();
  const g = new THREE.Group();
  const R = rng(811);
  let y = 0;
  CALVARY_STEPS.forEach(([s, h], k) => {
    g.add(part(roughStone(s, h, s, 812 + k, 0.07), k === 0 ? C.fieldstoneMossy : C.limestoneOld, { y: y + h / 2 }));
    y += h;
  });
  // the step's chipped south-east corner, its piece fallen beside it
  g.add(part(roughStone(0.12, 0.07, 0.1, 816, 0.25, 2), C.limestoneOld, { x: 0.4, y: 0.035, z: 0.4, ry: 0.6 }));
  // the socket stone the shaft is leaded into
  const socketH = 0.34;
  g.add(part(roughStone(0.34, socketH, 0.34, 817, 0.05), C.limestoneOld, { y: y + socketH / 2 }));
  y += socketH;
  // the shaft, chamfered (eight-sided), and the cross-head
  const shaft = 2.55;
  g.add(part(new THREE.CylinderGeometry(0.085, 0.1, shaft, 8), C.limestone, { y: y + shaft / 2, ry: Math.PI / 8 }));
  const armY = y + shaft - 0.52;
  const span = 0.86;
  // the arms run along y: the cross faces east, toward the path and the camera's side
  g.add(part(roughStone(0.15, 0.15, span, 818, 0.03, 2), C.limestone, { y: armY }));
  for (const sz of [-1, 1]) g.add(part(roughStone(0.17, 0.2, 0.08, 819 + sz, 0.05, 2), C.limestone, { y: armY, z: sz * (span / 2 + 0.02) }));
  g.add(part(roughStone(0.17, 0.12, 0.17, 821, 0.05, 2), C.limestone, { y: y + shaft + 0.04 }));
  // the weather hood: two little stone slopes over the crossing, its ridge along y
  for (const sx of [-1, 1])
    g.add(box(0.15, 0.03, 0.34, C.limestoneOld, { x: sx * 0.06, y: y + shaft + 0.16, rz: -sx * 0.55 }));
  // rain streaks and lichen down the east face, moss at the foot of the steps
  for (let i = 0; i < 10; i++)
    g.add(part(new THREE.CircleGeometry(0.022 + R() * 0.03, 8), C.lichen, { x: 0.092, y: y + 0.2 + R() * (shaft - 0.5), z: (R() - 0.5) * 0.1, ry: Math.PI / 2 }));
  for (let i = 0; i < 4; i++)
    g.add(part(new THREE.CircleGeometry(0.02 + R() * 0.02, 8), C.lichen, { x: 0.077, y: armY + (R() - 0.5) * 0.08, z: (R() - 0.5) * (span - 0.1), ry: Math.PI / 2 }));
  mossFoot(g, R, 16, { rx: 0.44, rz: 0.44 });
  return g;
}
