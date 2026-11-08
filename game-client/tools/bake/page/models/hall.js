// The enlarged Inn's great hall and taproom: the long dining table and its high-backed chairs,
// the great hearth with its chimney breast, the candelabra, lanterns, dark oil paintings, potted
// plants, chests, kegs and rugs. Same rule as the town buildings' furniture (FS-B0H2D §G R30):
// authored in code (ADR-0020, ADR-0021) on the shared materials and key light, modelled at life
// size in metres and scaled 1.5 like interior.js, so a hall chair reads against a stool as a
// chair does.
//
// One three.js unit is one tile edge (40 world px), so one metre here is 1.5 units, 60 world px.
// +x is world +x, +z is world +y (screen: +x and +z fall toward the viewer). Each model's origin
// is the centre of its footprint, the point the scene places it on, unless a note says it is a
// wall face. Facings follow facing.js (s = toward world +y): a faced prop is built facing s and
// turned by yawFor. Footprints, in world px:
//   long_table    240 × 50 along its axis (x: runs world x; y: runs world y), 46 px tall; five
//                 places a side, 48 px apart, centred on the origin
//   hall_chair    about 28 × 27, seat 28 px up, back 68 px; faces s/e/n/w, back opposite
//   hall_hearth   144 wide × 48 deep, its back on -z (stands against a north wall, fire facing
//                 world +y); the chimney breast rises to just under the back wall's top
//   candelabra    about 30 across, 95 px tall, five candles
//   lantern       wall_s: lantern 13 px in front of a north wall's inner face (the origin), its
//                 bracket back to the face; wall_e the same off a west wall; post: on a timber
//                 post at the origin. The glass is at one height in all three, so one light
//   painting      wall-hung, its back on the wall face, the origin 1 px in front of it; s on a
//                 north wall, e on a west wall; three canvases by index (portrait, moor, vanitas)
//   potted_plant  about 26 across; two plants by index (a box shrub in an urn, a bay standard)
//   hall_chest    57 × 29 (index 0, a panelled oak chest) or 50 × 28 (index 1, a domed trunk),
//                 its back on -z; s against a north wall, e against a west wall
//   keg           index 0 one keg on a cradle, 34 × 34; index 1 three in a pyramid on a rack,
//                 54 × 36; its head and tap toward the facing (s or e)
//   rug           index 0 264 × 144 (under the long table and its chairs), index 1 120 × 72 (a
//                 hearth rug), long side along the axis; flat, so no ground shadow
//
// Colour stays in the bake's channels (design guideline "Gameplay accent"): nothing here is
// interactable, so nothing is amber but flame and lit glass. Timber, iron and stone stay muted;
// the brass of the candelabra and the old gilt of the frames are darkened so they warm only
// where a light pool falls on them.

import * as THREE from "three";
import { fbm, hash2, rng, smoothstep, vnoise } from "../noise.js";
import { mix, shade } from "../palette.js";
import { materials, pixelTexture, plain, textured } from "../materials.js";
import { yawFor } from "../facing.js";
import { part, rod, scaled, V3 } from "./util.js";
import { crock, interiorMaterials, masonry, tankard } from "./interior.js";
import { cardCloud, cardMaterial, coreMaterial, randDir } from "./nature.js";

/** Metres to model units: the furniture scale of props.js and interior.js. */
const S = 1.5;

/** The long table: length and depth in metres (240 × 50 world px), and its top's height. */
export const LONG_L = 240 / 60;
export const LONG_D = 50 / 60;
const LONG_TOP = 0.76;
/** The places along the table, in metres from its centre: five a side, 48 world px apart. */
export const LONG_PLACES = [-1.6, -0.8, 0, 0.8, 1.6];

/** The great hearth: width and depth in metres (144 × 48 world px), its opening and fire. */
const HEARTH_W = 144 / 60;
const HEARTH_D = 48 / 60;
const HEARTH_OPEN_W = 1.3;
const HEARTH_OPEN_H = 1.0;
const HEARTH_FIRE_Z = -HEARTH_D / 2 + 0.36;
/** Just under the back wall's top (WALL_BACK 3.6 units = 2.4 m), so it never shows over it. */
const BREAST_TOP = 2.36;

/** The candelabra's candle flames, and the lantern's glass: one height for every mount. */
const CANDLE_Y = 1.56;
const LANTERN_Y = 1.7;
/** How far a wall lantern's glass stands off the wall face, in metres (13 world px). */
const LANTERN_OFF = 13 / 60;

/** Model-space light points (scaled), for the manifest's declared light sources. */
export const HALL_HEARTH_FLAME = [0, 0.45 * S, HEARTH_FIRE_Z * S];
export const CANDELABRA_FLAMES = [0, CANDLE_Y * S, 0];
export const LANTERN_GLASS = [0, LANTERN_Y * S, 0];

/** The canvases, by index. */
export const PAINTINGS = ["portrait", "moor", "vanitas"];

const OLD_GILT = mix(mix("brass", "barrowDeep", 0.45), "umber", 0.15);
const DARK_BRASS = mix("brass", "barrowDeep", 0.38);
/** A pot's clay, darker and browner than a crock's: a big pot of crock clay glows orange. */
const POT_CLAY = mix(mix("ember", "barrowBrown", 0.72), "barrowDeep", 0.35);
const PLANT = mix(mix("arcaneDeep", "barrowDeep", 0.38), "slate", 0.12);
const SOIL = mix("pitch", "barrowDeep", 0.5);
const RUNNER = mix("oxblood", "barrowDeep", 0.66);

/** A box from a flat options object. */
const box = (w, h, d, material, o = {}) => part(new THREE.BoxGeometry(w, h, d), material, o);
/** A lathe from [radius, height] pairs. */
const lathe = (pts, material, o = {}, seg = 16) => part(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), material, o);

/** Turns a model built facing s to `facing`, about its origin. */
function faced(g, facing) {
  g.rotation.y = yawFor(facing);
  return g;
}

// ── materials ────────────────────────────────────────────────────────────────────────

/** Old varnish over a painted field: yellowed, darkened toward the edges, crazed. */
function varnish(c, u, v, s) {
  const crack = Math.abs(vnoise(u * 60, v * 60, s) - 0.5) < 0.025 || Math.abs(vnoise(u * 34, v * 90, s + 1) - 0.5) < 0.018;
  const edge = smoothstep(0, 0.22, Math.min(u, 1 - u, v, 1 - v));
  const grime = 0.8 + 0.2 * fbm(u * 6, v * 6, s + 2);
  return shade(mix(c, "umber", 0.18), (0.55 + 0.45 * edge) * grime * (crack ? 0.72 : 1));
}

/** A dark oil portrait: a sitter in black with a pale face, lit from the left, on umber. */
function portraitCanvas(u, v) {
  const s = 701;
  // the ground: deep umber, a breath lighter behind the head
  let c = mix("pitch", "barrowDeep", 0.55 + 0.35 * Math.exp(-((u - 0.5) ** 2 + (v - 0.68) ** 2) * 12));
  // the body: black shoulders falling off both sides
  const shoulder = 0.34 - 0.55 * (u - 0.5) ** 2;
  if (v < shoulder + 0.05 * fbm(u * 8, v * 8, s)) c = mix("pitch", "charcoal", 0.5 + 0.3 * smoothstep(0.2, 0.5, u));
  // a white falling collar
  const collar = Math.abs(u - 0.5) < 0.16 - (0.4 - v) * 0.6 && v > 0.3 && v < 0.4;
  if (collar) c = shade(mix("vellumDark", "vellumFaint", 0.4), 0.7 + 0.4 * (1 - u));
  // the face, an oval, lit from the left
  const fu = (u - 0.5) / 0.13;
  const fv = (v - 0.58) / 0.17;
  const f = fu * fu + fv * fv;
  if (f < 1) {
    const lit = 0.55 + 0.6 * smoothstep(0.75, 0.2, u) - 0.25 * smoothstep(0.4, 1, f);
    c = shade(mix("vellumDark", "barrowBrown", 0.35), lit);
    // eyes and mouth: shadowed hollows
    if (Math.abs(fv - 0.15) < 0.12 && Math.abs(Math.abs(fu) - 0.38) < 0.16) c = shade(c, 0.55);
    if (Math.abs(fv + 0.5) < 0.07 && Math.abs(fu) < 0.3) c = shade(c, 0.6);
  }
  // dark hair over the brow and down to the jaw
  const hu = (u - 0.5) / 0.16;
  const hv = (v - 0.64) / 0.2;
  if (hu * hu + hv * hv < 1 && (f >= 1 || fv > 0.62)) c = mix("pitch", "barrowDeep", 0.3);
  return varnish(c, u, v, s);
}

/** A moor under storm: a low barrow with standing stones, a dead tree, a pale band at the horizon. */
function moorCanvas(u, v) {
  const s = 711;
  const horizon = 0.38 + 0.04 * Math.sin(u * 5) + 0.03 * fbm(u * 6, 0, s);
  let c;
  if (v > horizon) {
    // the sky: slate cloud heavy above, a sick pale band low down
    const t = (v - horizon) / (1 - horizon);
    const cloud = fbm(u * 4, v * 6, s + 1);
    c = mix(mix("vellumDark", "slateLight", 0.5), mix("slate", "charcoal", 0.5), smoothstep(0, 0.45, t));
    c = shade(c, 0.6 + 0.5 * cloud);
  } else {
    // the moor: barrow brown going to black in the foreground
    c = shade(mix("barrowDeep", "arcaneDeep", 0.2), 0.45 + 0.6 * (v / horizon) * (0.7 + 0.4 * fbm(u * 10, v * 10, s + 2)));
  }
  // the barrow mound and its stones against the band
  const mound = horizon + 0.12 * Math.exp(-(((u - 0.62) / 0.16) ** 2));
  if (v > horizon - 0.01 && v < mound) c = shade(mix("barrowDeep", "charcoal", 0.4), 0.75);
  for (const x of [0.56, 0.61, 0.67]) if (Math.abs(u - x) < 0.011 && v > mound - 0.02 && v < mound + 0.06 - (x - 0.6) * 0.3) c = mix("charcoal", "pitch", 0.4);
  // a dead tree to the left: a crooked trunk, two limbs
  const tx = 0.22 + 0.02 * Math.sin(v * 9);
  if (Math.abs(u - tx) < 0.012 && v < 0.7 && v > 0.2) c = "pitch";
  if (v > 0.55 && v < 0.75 && Math.abs(u - (tx + (v - 0.55) * 0.9)) < 0.008) c = "pitch";
  if (v > 0.5 && v < 0.66 && Math.abs(u - (tx - (v - 0.5) * 0.8)) < 0.008) c = "pitch";
  return varnish(c, u, v, s);
}

/** A vanitas: a skull, a guttering candle and a closed book on a table's edge, out of the dark. */
function vanitasCanvas(u, v) {
  const s = 721;
  const glowAt = Math.exp(-((u - 0.7) ** 2 + (v - 0.6) ** 2) * 9);
  let c = mix("pitch", "barrowDeep", 0.35 + 0.5 * glowAt);
  // the table edge
  if (v < 0.3) c = shade(mix("barrowBrown", "barrowDeep", 0.5), 0.5 + 0.5 * glowAt + 0.15 * fbm(u * 20, v * 4, s));
  if (Math.abs(v - 0.3) < 0.012) c = shade("barrowBrown", 0.9 + glowAt);
  // the book, oxblood, lying under the skull
  if (v > 0.3 && v < 0.38 && u > 0.12 && u < 0.58) c = shade(mix("oxblood", "barrowDeep", 0.3), 0.6 + 0.6 * glowAt);
  if (v > 0.3 && v < 0.37 && u > 0.14 && u < 0.56 && Math.abs(v - 0.335) < 0.006) c = shade("vellumDark", 0.6);
  // the skull: a dome, its sockets and nose dark, lit from the candle's side
  const ku = (u - 0.36) / 0.15;
  const kv = (v - 0.5) / 0.13;
  const k = ku * ku + kv * kv;
  if (k < 1 || (v > 0.38 && v < 0.44 && Math.abs(u - 0.38) < 0.08)) {
    c = shade(mix("vellum", "vellumDark", 0.4), 0.45 + 0.65 * smoothstep(0.2, 0.55, u) + 0.3 * glowAt);
    for (const ex of [0.3, 0.42]) if ((u - ex) ** 2 / 0.0018 + (v - 0.49) ** 2 / 0.0016 < 1) c = "pitch";
    if (Math.abs(u - 0.37) < 0.015 && Math.abs(v - 0.44) < 0.022) c = mix("pitch", "charcoal", 0.5);
  }
  // the candle, and its small flame
  if (Math.abs(u - 0.72) < 0.03 && v > 0.3 && v < 0.55) c = shade(mix("vellum", "vellumFaint", 0.3), 0.8 + 0.4 * smoothstep(0.75, 0.7, u));
  const fl = ((u - 0.72) / 0.016) ** 2 + ((v - 0.585) / 0.035) ** 2;
  if (fl < 1) c = mix("amber", "vellum", 0.4 * (1 - fl));
  return varnish(c, u, v, s);
}

const CANVASES = { portrait: portraitCanvas, moor: moorCanvas, vanitas: vanitasCanvas };

/** A rug's woven pattern over a rug `L` × `D` metres: field, guard stripes, border and medallion. */
function rugTexture(L, D, seed) {
  const W = Math.round(L * 64);
  const H = Math.round(D * 64);
  const field = mix(mix("oxblood", "barrowDeep", 0.55), "charcoal", 0.15);
  const border = mix("charcoal", "barrowDeep", 0.3);
  const motif = mix("vellumDark", "barrowBrown", 0.62);
  const guard = mix("brass", "barrowDeep", 0.62);
  return pixelTexture(W, H, (x, y) => {
    const mx = (x + 0.5) / 64;
    const my = (y + 0.5) / 64;
    const e = Math.min(mx, L - mx, my, D - my);
    let c = field;
    const bw = Math.min(0.24, D * 0.16);
    if (e < bw) {
      c = border;
      // a running hook motif along the border
      const t = (Math.abs(mx - L / 2) + Math.abs(my - D / 2)) * 9;
      if (Math.abs(e - bw * 0.5) < bw * 0.18 && Math.sin(t) > 0.2) c = motif;
    }
    if (Math.abs(e - bw) < 0.025 || Math.abs(e - 0.04) < 0.015) c = guard;
    if (e >= bw + 0.025) {
      // the field: a lattice of small lozenges, and a large one at the centre
      const lu = (mx - L / 2) / 0.22;
      const lv = (my - D / 2) / 0.22;
      const cell = Math.abs((((lu + lv) % 2) + 2) % 2 - 1) + Math.abs((((lu - lv) % 2) + 2) % 2 - 1);
      if (cell < 0.35) c = mix(field, motif, 0.55);
      const md = Math.abs(mx - L / 2) / (L * 0.2) + Math.abs(my - D / 2) / (D * 0.26);
      if (md < 1) c = md > 0.82 ? guard : md > 0.7 ? border : mix(border, field, 0.5);
      if (md < 0.32) c = motif;
    }
    // weave, and wear where feet go: the middle and the long edges
    const weave = (x + y) % 3 === 0 ? 0.88 : 1;
    const worn = 1 - 0.18 * smoothstep(0.55, 0.8, fbm(mx * 3, my * 3, seed));
    return shade(c, (0.62 + 0.36 * fbm(mx * 9, my * 9, seed + 1)) * weave * worn);
  });
}

let HALL = null;

/** The hall's own materials, built once per bake (seeded, so deterministic). */
function hallMaterials() {
  if (HALL) return HALL;
  HALL = {
    gilt: textured(pixelTexture(64, 64, (x, y) => shade(OLD_GILT, 0.7 + 0.5 * fbm(x / 6, y / 6, 731))), { metal: 0.65, rough: 0.5 }),
    giltDark: plain(mix(OLD_GILT, "pitch", 0.45), { metal: 0.4, rough: 0.6 }),
    brass: textured(pixelTexture(64, 64, (x, y) => shade(DARK_BRASS, 0.75 + 0.4 * fbm(x / 8, y / 8, 732))), { metal: 0.85, rough: 0.38 }),
    canvases: Object.fromEntries(
      Object.entries(CANVASES).map(([k, fn]) => [k, textured(pixelTexture(96, 96, (x, y) => fn((x + 0.5) / 96, 1 - (y + 0.5) / 96)), { rough: 0.55, bump: 0.15 })]),
    ),
    canvasBack: plain(mix("barrowDeep", "pitch", 0.5)),
    plate: plain(mix("slate", "charcoal", 0.25), { rough: 0.5, metal: 0.6 }),
    pot: textured(pixelTexture(64, 64, (x, y) => shade(POT_CLAY, 0.72 + 0.4 * fbm(x / 7, y / 7, 734))), { rough: 0.9 }),
    potDark: textured(pixelTexture(64, 64, (x, y) => shade(mix(POT_CLAY, "charcoal", 0.35), 0.72 + 0.4 * fbm(x / 7, y / 7, 735))), { rough: 0.9 }),
    runner: textured(pixelTexture(64, 64, (x, y) => shade(RUNNER, (0.7 + 0.4 * fbm(x / 9, y / 9, 733)) * ((x + y) % 3 === 0 ? 0.88 : 1))), { bump: 0.3 }),
    meat: plain(mix("oxblood", "barrowBrown", 0.55), { rough: 0.7 }),
    apple: plain(mix("oxblood", "brass", 0.25), { rough: 0.6 }),
    rugs: [rugTexture(4.4, 2.4, 741), rugTexture(2.0, 1.2, 742)].map((t) => textured(t, { bump: 0.25, rough: 1 })),
    rugEdge: plain(mix("barrowDeep", "pitch", 0.4), { rough: 1 }),
    fringe: plain(mix("vellumFaint", "barrowBrown", 0.45), { rough: 1 }),
    soil: plain(SOIL, { rough: 1 }),
    stem: plain(mix("barrowDeep", "barrowBrown", 0.4), { rough: 1 }),
  };
  return HALL;
}

// ── the long table and its chairs ──────────────────────────────────────────────────────

/** A pewter plate with what is on it: `what` is 0 bare, 1 bread, 2 meat, 3 apples. */
function place(g, x, z, what, H, T, R) {
  const y = LONG_TOP;
  g.add(part(new THREE.CylinderGeometry(0.12, 0.1, 0.014, 16), H.plate, { x, y: y + 0.007, z }));
  if (what === 1) g.add(part(new THREE.SphereGeometry(0.06, 8, 6), T.bread, { x: x + 0.02, y: y + 0.035, z, sy: 0.6, sx: 1.3 }));
  if (what === 2) g.add(part(new THREE.SphereGeometry(0.055, 8, 6), H.meat, { x, y: y + 0.035, z, sy: 0.55, sx: 1.4, ry: R() * 3 }));
  if (what === 3) for (let i = 0; i < 3; i++) g.add(part(new THREE.SphereGeometry(0.03, 7, 5), H.apple, { x: x + (R() - 0.5) * 0.1, y: y + 0.04, z: z + (R() - 0.5) * 0.1 }));
}

/** An iron pricket candlestick with a stub of candle; its flame is tiny, so it declares no light. */
function candlestick(g, x, y, z, M, h = 0.1) {
  g.add(part(new THREE.CylinderGeometry(0.045, 0.055, 0.015, 10), M.iron, { x, y: y + 0.008, z }));
  g.add(part(new THREE.CylinderGeometry(0.01, 0.014, 0.1, 6), M.iron, { x, y: y + 0.06, z }));
  g.add(part(new THREE.CylinderGeometry(0.035, 0.03, 0.012, 10), M.iron, { x, y: y + 0.11, z }));
  g.add(part(new THREE.CylinderGeometry(0.02, 0.022, h, 8), M.vellum, { x, y: y + 0.116 + h / 2, z }));
  g.add(part(new THREE.ConeGeometry(0.012, 0.035, 6), M.flame, { x, y: y + 0.135 + h, z }));
}

/**
 * The great hall's long dining table along x: a top of three oak boards on breadboard ends,
 * three trestles on a through-stretcher, a dark runner down its middle. Five places a side
 * (LONG_PLACES), plates and tankards at them, the runner carrying a roast on a board, a jug, a
 * bowl of apples and two candlesticks. The `y` frame turns it to run along world y.
 */
export function longTable(axis) {
  const M = materials();
  const T = interiorMaterials();
  const H = hallMaterials();
  const g = new THREE.Group();
  const R = rng(611);
  const L = LONG_L;
  const D = LONG_D;
  const top = LONG_TOP;
  // the top: three boards, a hair apart and not quite level, between breadboard ends
  const boards = 3;
  const bw = (D - 0.02) / boards;
  for (let i = 0; i < boards; i++)
    g.add(box(L - 0.17, 0.075, bw - 0.01, M.woodDark, { y: top - 0.0375 + (R() - 0.5) * 0.006, z: -D / 2 + 0.01 + (i + 0.5) * bw }));
  for (const sx of [-1, 1]) g.add(box(0.085, 0.08, D, M.beam, { x: sx * (L / 2 - 0.0425), y: top - 0.04 }));
  // trestles: a splayed foot, a post and a cross-head under the top
  for (const tx of [-(L / 2 - 0.34), 0, L / 2 - 0.34]) {
    g.add(box(0.13, 0.09, D - 0.06, M.beam, { x: tx, y: 0.045 }));
    for (const sz of [-1, 1]) g.add(box(0.13, 0.05, 0.08, M.beam, { x: tx, y: 0.09 + 0.025, z: sz * (D / 2 - 0.12), rx: sz * 0.5 }));
    g.add(box(0.11, top - 0.2, 0.15, M.woodDark, { x: tx, y: 0.09 + (top - 0.2) / 2 }));
    g.add(box(0.11, 0.07, D - 0.14, M.beam, { x: tx, y: top - 0.11 }));
  }
  // the stretcher through the posts, wedged where it passes the end trestles
  g.add(box(L - 0.5, 0.1, 0.07, M.beam, { y: 0.32 }));
  for (const sx of [-1, 1]) g.add(box(0.035, 0.14, 0.05, M.wood, { x: sx * (L / 2 - 0.34 + 0.1), y: 0.32 }));
  // the runner down the middle, and what stands on it
  g.add(box(L - 0.5, 0.006, 0.3, H.runner, { y: top + 0.003 }));
  g.add(box(0.42, 0.03, 0.24, M.wood, { x: -0.38, y: top + 0.021 }));
  g.add(part(new THREE.SphereGeometry(0.12, 10, 8), H.meat, { x: -0.38, y: top + 0.08, sy: 0.6, sx: 1.4 }));
  g.add(rod(V3(-0.2, top + 0.09, 0.02), V3(-0.12, top + 0.12, 0.03), 0.014, 0.01, M.bone, 5));
  crock(g, 0.42, top + 0.006, -0.02, 0.08, 0.24, T.clay);
  g.add(lathe([[0.02, 0], [0.13, 0.02], [0.16, 0.08], [0.15, 0.085]], T.clayDark, { x: 0.95, y: top + 0.006, z: 0.03 }));
  for (let i = 0; i < 5; i++) g.add(part(new THREE.SphereGeometry(0.036, 7, 5), H.apple, { x: 0.95 + (R() - 0.5) * 0.13, y: top + 0.08, z: 0.03 + (R() - 0.5) * 0.13 }));
  candlestick(g, -1.2, top, 0, M);
  candlestick(g, 1.25, top, 0, M, 0.07);
  // the places: a plate each side, a tankard at most, bread or meat on some
  LONG_PLACES.forEach((x, i) => {
    for (const sz of [-1, 1]) {
      const k = i * 2 + (sz > 0 ? 1 : 0);
      place(g, x, sz * 0.25, [1, 0, 2, 3, 0, 1, 2, 0, 3, 1][k], H, T, R);
      if (hash2(i, sz, 613) > 0.35) tankard(g, x + 0.17, top, sz * 0.22, R() * 3, T);
    }
  });
  if (axis === "y") g.rotation.y = Math.PI / 2;
  return scaled(g, S);
}

/**
 * A high-backed oak chair for the long table: turned back posts with finials, a leather seat and
 * back panel on stretchered legs. Built facing s (the sitter faces world +y), its back on -z, and
 * turned by facing.js's yaw, so `n` stands south of a table along x and `s` north of it.
 */
export function hallChair(facing) {
  const M = materials();
  const g = new THREE.Group();
  const seatY = 0.46;
  const w = 0.46;
  const d = 0.44;
  // front legs, square and plain
  for (const sx of [-1, 1]) g.add(box(0.05, seatY - 0.03, 0.05, M.woodDark, { x: sx * (w / 2 - 0.03), y: (seatY - 0.03) / 2, z: d / 2 - 0.03 }));
  // back posts: up from the floor to the crest, turned, a finial each
  const backZ = -d / 2 + 0.03;
  for (const sx of [-1, 1]) {
    g.add(rod(V3(sx * (w / 2 - 0.03), 0, backZ), V3(sx * (w / 2 - 0.03), 1.1, backZ - 0.06), 0.03, 0.024, M.woodDark, 8));
    g.add(part(new THREE.SphereGeometry(0.035, 8, 6), M.woodDark, { x: sx * (w / 2 - 0.03), y: 1.13, z: backZ - 0.065, sy: 1.3 }));
  }
  // seat frame, leather seat; low stretchers all round
  g.add(box(w, 0.05, d, M.beam, { y: seatY - 0.025 }));
  g.add(box(w - 0.06, 0.035, d - 0.06, M.leather, { y: seatY + 0.012 }));
  for (const sz of [-1, 1]) g.add(box(0.03, 0.035, d - 0.06, M.beam, { x: sz * (w / 2 - 0.03), y: 0.13 }));
  g.add(box(w - 0.06, 0.035, 0.03, M.beam, { y: 0.2, z: d / 2 - 0.03 }));
  // the back: a carved crest rail, a lower rail, a leather panel between, raked a touch
  const back = new THREE.Group();
  back.position.set(0, seatY, backZ);
  back.rotation.x = -0.06;
  back.add(box(w - 0.02, 0.13, 0.045, M.woodDark, { y: 0.57 }));
  back.add(box(w - 0.12, 0.04, 0.05, M.beam, { y: 0.66 }));
  back.add(box(w - 0.06, 0.05, 0.04, M.woodDark, { y: 0.14 }));
  back.add(box(w - 0.08, 0.34, 0.02, M.leather, { y: 0.33, z: 0.005 }));
  g.add(back);
  faced(g, facing);
  return scaled(g, S);
}

// ── the great hearth ───────────────────────────────────────────────────────────────────

/** A big log fire: three logs on iron firedogs, a bed of coals, tall flames. */
function greatFire(g, z, M, R) {
  for (const sx of [-1, 1]) {
    g.add(box(0.04, 0.05, 0.42, M.iron, { x: sx * 0.34, y: 0.11, z }));
    g.add(rod(V3(sx * 0.34, 0.06, z + 0.21), V3(sx * 0.34, 0.36, z + 0.22), 0.022, 0.018, M.iron, 6));
    g.add(part(new THREE.SphereGeometry(0.03, 8, 6), M.iron, { x: sx * 0.34, y: 0.38, z: z + 0.22 }));
  }
  for (let i = 0; i < 24; i++)
    g.add(
      part(new THREE.SphereGeometry(0.035 + R() * 0.03, 6, 5), R() > 0.35 ? M.coal : M.black, {
        x: (R() - 0.5) * 0.9,
        y: 0.08,
        z: z + (R() - 0.5) * 0.34,
      }),
    );
  for (const [dz, dy, rz] of [
    [-0.08, 0.16, 0.05],
    [0.08, 0.16, -0.04],
    [0, 0.27, 0.1],
  ])
    g.add(part(new THREE.CylinderGeometry(0.07, 0.075, 0.9, 10), M.bark, { y: dy, z: z + dz, rz: Math.PI / 2 + rz }));
  // the flames: a low red-gold bed along the logs, a few tongues standing out of it
  for (let i = 0; i < 9; i++)
    g.add(
      part(new THREE.ConeGeometry(0.05 + R() * 0.02, 0.12 + R() * 0.08, 7), M.ember, {
        x: (R() - 0.5) * 0.7,
        y: 0.3 + R() * 0.04,
        z: z + (R() - 0.5) * 0.16,
      }),
    );
  for (let i = 0; i < 4; i++)
    g.add(
      part(new THREE.ConeGeometry(0.028 + R() * 0.012, 0.1 + R() * 0.07, 7), M.flame, {
        x: (R() - 0.5) * 0.5,
        y: 0.36 + R() * 0.04,
        z: z + (R() - 0.5) * 0.1,
      }),
    );
}

/** Red-deer antlers on an oak shield, the beams sweeping out and up with their tines. */
function antlers(g, y, z, M) {
  const plaque = new THREE.Shape();
  plaque.moveTo(-0.12, 0.16);
  plaque.lineTo(0.12, 0.16);
  plaque.lineTo(0.12, -0.04);
  plaque.quadraticCurveTo(0.1, -0.14, 0, -0.18);
  plaque.quadraticCurveTo(-0.1, -0.14, -0.12, -0.04);
  plaque.closePath();
  g.add(part(new THREE.ExtrudeGeometry(plaque, { depth: 0.04, bevelEnabled: false }), M.woodDark, { y, z }));
  g.add(part(new THREE.SphereGeometry(0.07, 10, 8), M.bone, { y: y + 0.06, z: z + 0.07, sy: 0.75, sz: 0.7 }));
  for (const sx of [-1, 1]) {
    const beam = [V3(sx * 0.05, y + 0.1, z + 0.09), V3(sx * 0.22, y + 0.16, z + 0.14), V3(sx * 0.38, y + 0.3, z + 0.13), V3(sx * 0.46, y + 0.48, z + 0.1), V3(sx * 0.44, y + 0.62, z + 0.08)];
    for (let i = 0; i < beam.length - 1; i++) g.add(rod(beam[i], beam[i + 1], 0.03 - i * 0.005, 0.026 - i * 0.005, M.bone, 6));
    // tines: brow, bez and the crown's fork, each forward and up
    for (const [i, dx, dy, dz] of [
      [1, 0.04, 0.12, 0.08],
      [2, -0.02, 0.15, 0.06],
      [3, -0.08, 0.13, 0.03],
      [4, 0.06, 0.1, 0.02],
    ])
      g.add(rod(beam[i], V3(beam[i].x + sx * dx, beam[i].y + dy, beam[i].z + dz), 0.018, 0.008, M.bone, 5));
  }
}

/**
 * The great hall's hearth: a fireplace of laid stone under a dressed lintel with a keystone, a
 * raised hearth slab, an oak mantel shelf, and a chimney breast rising to just under the wall top
 * with a pair of antlers on it. Stands against a north wall, fire facing world +y. Split logs
 * stack by the left jamb, fire irons stand by the right.
 */
export function hallHearth() {
  const M = materials();
  const T = interiorMaterials();
  const g = new THREE.Group();
  const R = rng(621);
  const W = HEARTH_W;
  const D = HEARTH_D;
  const backZ = -D / 2;
  const openW = HEARTH_OPEN_W;
  const openH = HEARTH_OPEN_H;
  const jambW = (W - openW) / 2;
  const slab = 0.07;
  // the raised hearth slab, the full width, its front edge worn
  g.add(box(W, slab, D, M.cap, { y: slab / 2 }));
  // the firebox: soot back and cheeks, ash on the floor
  g.add(box(openW + 0.04, openH, 0.1, T.soot, { y: slab + openH / 2, z: backZ + 0.05 }));
  for (const sx of [-1, 1]) g.add(box(0.06, openH, D - 0.2, T.soot, { x: sx * (openW / 2 - 0.03), y: slab + openH / 2, z: backZ + (D - 0.2) / 2 }));
  g.add(box(openW - 0.08, 0.03, D - 0.2, T.ash, { y: slab + 0.015, z: backZ + (D - 0.2) / 2 + 0.05 }));
  // jambs of laid stone with dressed quoins at the opening
  for (const sx of [-1, 1]) {
    masonry(g, { x: sx * (openW / 2 + jambW / 2), z: 0, y0: slab, w: jambW, h: openH, d: D - 0.08 }, T.rubble, R);
    for (let i = 0; i < 4; i++)
      g.add(box(0.2, openH / 4 - 0.015, 0.16, M.cap, { x: sx * (openW / 2 + 0.1), y: slab + (i + 0.5) * (openH / 4), z: D / 2 - 0.12 + (i % 2) * 0.01 }));
  }
  // the lintel: three dressed stones, the keystone proud and a little taller
  const lintelY = slab + openH;
  for (const [x, w, h, dz] of [
    [-0.52, 0.86, 0.22, 0],
    [0.52, 0.86, 0.22, 0],
    [0, 0.2, 0.28, 0.02],
  ])
    g.add(box(w - 0.012, h, D - 0.06 + dz, M.cap, { x, y: lintelY + h / 2 - (h - 0.22) / 2, z: dz / 2 }));
  // the mantel shelf: an oak beam on two stone corbels, its front edge over the hearth
  const mantelY = lintelY + 0.24;
  for (const sx of [-1, 1]) g.add(box(0.14, 0.1, 0.16, M.cap, { x: sx * (W / 2 - 0.2), y: mantelY - 0.05, z: D / 2 - 0.04 }));
  g.add(box(W + 0.1, 0.12, 0.34, M.beam, { y: mantelY + 0.06, z: D / 2 - 0.14 }));
  candlestick(g, -0.85, mantelY + 0.12, D / 2 - 0.14, M, 0.12);
  candlestick(g, 0.85, mantelY + 0.12, D / 2 - 0.14, M, 0.12);
  tankard(g, -0.5, mantelY + 0.12, D / 2 - 0.12, 0.7, T);
  crock(g, 0.48, mantelY + 0.12, D / 2 - 0.16, 0.07, 0.2, T.glaze);
  // the chimney breast, set back from the mantel, to just under the wall top, with a cornice
  const breastY = mantelY + 0.12;
  const breastD = D - 0.34;
  const breastZ = backZ + breastD / 2;
  masonry(g, { x: 0, z: breastZ, y0: breastY, w: W - 0.34, h: BREAST_TOP - breastY - 0.06, d: breastD }, T.rubble, R);
  g.add(box(W - 0.26, 0.06, breastD + 0.06, M.cap, { y: BREAST_TOP - 0.03, z: breastZ + 0.02 }));
  antlers(g, breastY + 0.3, breastZ + breastD / 2, M);
  // the fire
  greatFire(g, HEARTH_FIRE_Z, M, R);
  // split logs stacked by the left jamb, fire irons standing by the right
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 3 - row; i++)
      g.add(
        part(new THREE.CylinderGeometry(0.055, 0.06, 0.32, 7), M.bark, {
          x: -W / 2 + 0.2 + (i + row * 0.5) * 0.115,
          y: slab + 0.058 + row * 0.1,
          z: D / 2 - 0.18 + (R() - 0.5) * 0.03,
          rx: Math.PI / 2,
          ry: (R() - 0.5) * 0.2,
        }),
      );
  const irons = W / 2 - 0.22;
  g.add(part(new THREE.CylinderGeometry(0.07, 0.08, 0.02, 10), M.iron, { x: irons, y: slab + 0.01, z: D / 2 - 0.18 }));
  g.add(rod(V3(irons, slab, D / 2 - 0.18), V3(irons, slab + 0.72, D / 2 - 0.18), 0.012, 0.012, M.iron, 6));
  for (const [dx, dz] of [
    [0.05, 0.02],
    [-0.04, 0.03],
    [0.01, -0.05],
  ])
    g.add(rod(V3(irons + dx, slab + 0.04, D / 2 - 0.18 + dz), V3(irons + dx * 0.4, slab + 0.68, D / 2 - 0.18 + dz * 0.4), 0.009, 0.009, M.iron, 5));
  return scaled(g, S);
}

// ── lights ─────────────────────────────────────────────────────────────────────────────

/**
 * A floor-standing candelabra in dark brass: three splayed feet, a turned shaft with knops, four
 * arms sweeping up around a centre candle, each candle on its own drip pan.
 */
export function candelabra() {
  const M = materials();
  const H = hallMaterials();
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    g.add(rod(V3(0, 0.16, 0), V3(Math.cos(a) * 0.22, 0.02, Math.sin(a) * 0.22), 0.022, 0.016, H.brass, 6));
    g.add(part(new THREE.SphereGeometry(0.03, 8, 6), H.brass, { x: Math.cos(a) * 0.23, y: 0.025, z: Math.sin(a) * 0.23 }));
  }
  g.add(
    lathe(
      [
        [0.001, 0.1],
        [0.09, 0.12],
        [0.06, 0.2],
        [0.03, 0.26],
        [0.045, 0.3],
        [0.022, 0.34],
        [0.02, 0.8],
        [0.045, 0.84],
        [0.02, 0.88],
        [0.018, 1.22],
        [0.05, 1.25],
        [0.03, 1.29],
        [0.001, 1.3],
      ],
      H.brass,
    ),
  );
  const cup = (x, y, z) => {
    g.add(part(new THREE.CylinderGeometry(0.05, 0.03, 0.02, 12), H.brass, { x, y, z }));
    g.add(part(new THREE.CylinderGeometry(0.017, 0.019, 0.17, 8), M.vellum, { x, y: y + 0.095, z }));
    g.add(part(new THREE.ConeGeometry(0.016, 0.05, 6), M.flame, { x, y: CANDLE_Y, z }));
  };
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const [cx, cz] = [Math.cos(a), Math.sin(a)];
    const pts = [V3(cx * 0.03, 1.12, cz * 0.03), V3(cx * 0.14, 1.12, cz * 0.14), V3(cx * 0.22, 1.2, cz * 0.22), V3(cx * 0.23, 1.32, cz * 0.23)];
    for (let k = 0; k < pts.length - 1; k++) g.add(rod(pts[k], pts[k + 1], 0.014, 0.013, H.brass, 6));
    cup(cx * 0.23, 1.33, cz * 0.23);
  }
  cup(0, 1.33, 0);
  return scaled(g, S);
}

/**
 * An iron lantern with lit glass, hung from a wall bracket (`wall_s` off a north wall, `wall_e`
 * off a west wall) or set on a timber post (`post`). The glass sits at the origin at LANTERN_Y in
 * every mount, so the sheet declares one light.
 */
export function lantern(mount) {
  const M = materials();
  const g = new THREE.Group();
  const y = LANTERN_Y;
  // the lantern: a base plate, four corner posts round the glass, a pyramid cap and a ring
  const lw = 0.16;
  const lh = 0.24;
  g.add(box(lw + 0.03, 0.025, lw + 0.03, M.iron, { y: y - lh / 2 }));
  g.add(box(lw - 0.02, lh - 0.02, lw - 0.02, M.glass, { y }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.018, lh, 0.018, M.iron, { x: (sx * lw) / 2, y, z: (sz * lw) / 2 }));
  for (const dy of [-0.03, 0.05]) g.add(box(lw + 0.005, 0.012, lw + 0.005, M.iron, { y: y + dy }));
  g.add(part(new THREE.ConeGeometry(lw * 0.82, 0.1, 4), M.iron, { y: y + lh / 2 + 0.05, ry: Math.PI / 4 }));
  g.add(part(new THREE.TorusGeometry(0.025, 0.007, 5, 12), M.iron, { y: y + lh / 2 + 0.12 }));
  if (mount === "post") {
    // a timber post on a stone foot, an iron cap plate under the lantern
    const top = y - lh / 2 - 0.0125;
    g.add(box(0.26, 0.12, 0.26, M.cap, { y: 0.06 }));
    g.add(box(0.12, top - 0.12, 0.12, M.beam, { y: 0.12 + (top - 0.12) / 2 }));
    for (const sx of [-1, 1]) g.add(box(0.03, 0.12, 0.13, M.beam, { x: sx * 0.07, y: 0.18, rz: sx * 0.6 }));
    g.add(box(0.18, 0.02, 0.18, M.iron, { y: top - 0.01 }));
    return scaled(g, S);
  }
  // the bracket: a back plate on the wall face, a scrolled arm out over the lantern, a short hook
  const back = -LANTERN_OFF;
  const armY = y + lh / 2 + 0.19;
  g.add(box(0.07, 0.24, 0.02, M.iron, { y: armY - 0.06, z: back + 0.01 }));
  g.add(rod(V3(0, armY, back), V3(0, armY, 0.02), 0.012, 0.011, M.iron, 6));
  g.add(rod(V3(0, armY - 0.16, back), V3(0, armY - 0.01, -0.06), 0.009, 0.009, M.iron, 5));
  g.add(part(new THREE.TorusGeometry(0.03, 0.006, 5, 12, Math.PI * 1.4), M.iron, { y: armY + 0.02, z: 0.03, rz: 0.6 }));
  g.add(rod(V3(0, armY, 0), V3(0, y + lh / 2 + 0.14, 0), 0.006, 0.006, M.iron, 4));
  faced(g, mount === "wall_e" ? "e" : "s");
  return scaled(g, S);
}

// ── the walls: paintings ───────────────────────────────────────────────────────────────

/** Painting sizes in metres, outer frame: [width, height], by canvas. */
const PAINTING_SIZE = { portrait: [0.64, 0.84], moor: [1.04, 0.7], vanitas: [0.82, 0.66] };

/**
 * A dark oil in a carved frame of old gilt, hung on a wall with its top tipped forward a little,
 * its centre at 1.6 m. Built on a north wall facing s, its back on the wall face (z = -0.02).
 */
export function painting(facing, which) {
  const H = hallMaterials();
  const g = new THREE.Group();
  const [w, h] = PAINTING_SIZE[which];
  const f = 0.075;
  const pic = new THREE.Group();
  pic.position.set(0, 1.6, -0.02);
  pic.rotation.x = 0.05;
  // the frame: an outer moulding, a dark inner slip, then the canvas sunk behind
  for (const [x, y, fw, fh] of [
    [0, h / 2 - f / 2, w, f],
    [0, -h / 2 + f / 2, w, f],
    [-w / 2 + f / 2, 0, f, h - 2 * f],
    [w / 2 - f / 2, 0, f, h - 2 * f],
  ]) {
    pic.add(box(fw, fh, 0.05, H.gilt, { x, y, z: 0.025 }));
    pic.add(box(fw - (fw === f ? 0.03 : 0), fh - (fh === f ? 0.03 : 0), 0.012, H.giltDark, { x, y, z: 0.055 }));
  }
  pic.add(box(w - 2 * f + 0.02, h - 2 * f + 0.02, 0.012, H.canvasBack, { z: 0.012 }));
  pic.add(part(new THREE.PlaneGeometry(w - 2 * f + 0.01, h - 2 * f + 0.01), H.canvases[which], { z: 0.02 }));
  g.add(pic);
  // an unseen mark at the floor origin, so the frame holds the anchor the scene stands it on
  const foot = box(0.01, 0.01, 0.01, H.canvasBack);
  foot.visible = false;
  g.add(foot);
  faced(g, facing);
  return scaled(g, S);
}

// ── plants ─────────────────────────────────────────────────────────────────────────────

/** Leaf cards over `lumps` ([x, y, z, r]), in the plant's dark green. */
function foliage(g, lumps, R, cardSize = 0.15, perLump = 60) {
  const cards = [];
  const core = coreMaterial(PLANT, 0.4);
  for (const [x, y, z, r] of lumps) {
    const C = new THREE.Vector3(x, y, z);
    g.add(part(new THREE.SphereGeometry(r * 0.72, 10, 8), core, { x, y, z }));
    for (let k = 0; k < perLump; k++) {
      const dir = randDir(R, 0.3);
      const dist = r * (0.62 + 0.42 * R());
      cards.push({
        p: C.clone().addScaledVector(dir, dist),
        n: dir,
        size: cardSize * (0.8 + 0.4 * R()),
        rx: R() * 6.3,
        ry: R() * 6.3,
        rz: R() * 6.3,
        c: Math.min(1.25, Math.max(0.3, 0.5 + 0.45 * dir.y)),
        g: 0.95 + R() * 0.1,
      });
    }
  }
  g.add(new THREE.Mesh(cardCloud(cards), cardMaterial(PLANT, false)));
}

/** A potted plant: 0 a clipped box shrub in a clay urn, 1 a bay trained to a standard in a tall pot. */
export function pottedPlant(variant) {
  const T = interiorMaterials();
  const H = hallMaterials();
  const g = new THREE.Group();
  const R = rng(651 + variant);
  if (variant === 0) {
    g.add(
      lathe(
        [
          [0.001, 0],
          [0.12, 0],
          [0.12, 0.03],
          [0.08, 0.07],
          [0.16, 0.16],
          [0.2, 0.28],
          [0.19, 0.34],
          [0.22, 0.36],
          [0.22, 0.4],
          [0.18, 0.4],
        ],
        H.pot,
        {},
        18,
      ),
    );
    g.add(part(new THREE.CylinderGeometry(0.18, 0.18, 0.01, 16), H.soil, { y: 0.385 }));
    foliage(g, [
      [0, 0.6, 0, 0.24],
      [0.09, 0.52, 0.07, 0.17],
      [-0.08, 0.5, -0.05, 0.17],
    ], R);
    return scaled(g, S);
  }
  g.add(
    lathe(
      [
        [0.001, 0],
        [0.13, 0],
        [0.16, 0.36],
        [0.18, 0.38],
        [0.18, 0.42],
        [0.15, 0.42],
      ],
      H.potDark,
      {},
      16,
    ),
  );
  g.add(part(new THREE.CylinderGeometry(0.15, 0.15, 0.01, 14), H.soil, { y: 0.405 }));
  g.add(rod(V3(0, 0.4, 0), V3(0.02, 0.95, 0.01), 0.022, 0.016, H.stem, 6));
  foliage(g, [
    [0.02, 1.12, 0.01, 0.24],
    [0.08, 1.02, 0.06, 0.15],
    [-0.06, 1.2, -0.04, 0.15],
  ], R, 0.14, 70);
  return scaled(g, S);
}

// ── storage: chests and kegs ───────────────────────────────────────────────────────────

/**
 * A chest for the hall, never a container (nothing amber, no lock that reads as one): 0 an oak
 * chest with two sunk panels, strap hinges over the lid and an iron hasp; 1 a domed trunk in
 * dark leather with iron bands and end rings. Built against a north wall, front facing s.
 */
export function hallChest(facing, variant) {
  const M = materials();
  const g = new THREE.Group();
  if (variant === 0) {
    const W = 0.95;
    const D = 0.48;
    const Hh = 0.46;
    g.add(box(W, Hh, D, M.woodDark, { y: Hh / 2 + 0.04 }));
    // stiles as feet, a plinth between
    for (const sx of [-1, 1]) g.add(box(0.08, Hh + 0.04, D + 0.01, M.beam, { x: sx * (W / 2 - 0.04), y: (Hh + 0.04) / 2 }));
    // the front: two sunk panels between a muntin
    for (const sx of [-1, 1]) {
      g.add(box(W / 2 - 0.14, Hh - 0.16, 0.012, M.wood, { x: sx * (W / 4 - 0.01), y: Hh / 2 + 0.04, z: D / 2 + 0.002 }));
      g.add(box(W / 2 - 0.22, Hh - 0.26, 0.012, M.woodDark, { x: sx * (W / 4 - 0.01), y: Hh / 2 + 0.04, z: D / 2 + 0.008 }));
    }
    // the lid, moulded at its edge; two strap hinges over it and down the front, a hasp between
    g.add(box(W + 0.04, 0.05, D + 0.04, M.woodDark, { y: Hh + 0.065 }));
    g.add(box(W + 0.02, 0.02, D + 0.06, M.beam, { y: Hh + 0.045 }));
    for (const sx of [-1, 1]) {
      g.add(box(0.05, 0.012, D + 0.05, M.iron, { x: sx * 0.28, y: Hh + 0.095 }));
      g.add(box(0.05, 0.16, 0.012, M.iron, { x: sx * 0.28, y: Hh - 0.01, z: D / 2 + 0.024 }));
    }
    g.add(box(0.06, 0.12, 0.016, M.iron, { y: Hh - 0.0, z: D / 2 + 0.02 }));
    g.add(part(new THREE.TorusGeometry(0.022, 0.006, 5, 10), M.iron, { y: Hh - 0.08, z: D / 2 + 0.026 }));
    faced(g, facing);
    return scaled(g, S);
  }
  const W = 0.82;
  const D = 0.46;
  const Hh = 0.36;
  g.add(box(W, Hh, D, M.leather, { y: Hh / 2 + 0.03 }));
  g.add(box(W + 0.02, 0.03, D + 0.02, M.beam, { y: 0.015 }));
  // the domed lid: a half drum along x, squashed
  const dome = new THREE.CylinderGeometry(D / 2, D / 2, W, 16, 1, false, 0, Math.PI);
  g.add(part(dome, M.leather, { y: Hh + 0.03, rz: Math.PI / 2 }));
  // iron bands: up the box and over the dome, three of them, and the end caps of the dome
  for (const x of [-W / 2 + 0.08, 0, W / 2 - 0.08]) {
    g.add(box(0.04, Hh, D + 0.012, M.iron, { x, y: Hh / 2 + 0.03 }));
    g.add(part(new THREE.TorusGeometry(D / 2 + 0.006, 0.012, 4, 16, Math.PI), M.iron, { x, y: Hh + 0.03, ry: Math.PI / 2 }));
  }
  for (const sx of [-1, 1]) {
    g.add(part(new THREE.CircleGeometry(D / 2, 16, 0, Math.PI), M.woodDark, { x: sx * (W / 2 + 0.001), y: Hh + 0.03, ry: (sx * Math.PI) / 2 }));
    g.add(part(new THREE.TorusGeometry(0.04, 0.008, 5, 12), M.iron, { x: sx * (W / 2 + 0.012), y: Hh * 0.7, ry: Math.PI / 2 }));
  }
  g.add(box(0.07, 0.1, 0.014, M.iron, { y: Hh - 0.02, z: D / 2 + 0.008 }));
  faced(g, facing);
  return scaled(g, S);
}

/** A small keg lying along z, its head at +z: staves, three iron hoops and a wooden tap. */
function kegBody(g, x, y, z, M, tap = true) {
  const k = new THREE.Group();
  k.position.set(x, y, z);
  const L = 0.52;
  const staves = [
    [0.17, -L / 2],
    [0.2, -L / 4],
    [0.21, 0],
    [0.2, L / 4],
    [0.17, L / 2],
  ];
  k.add(lathe(staves, M.staves, { rx: Math.PI / 2 }, 18));
  for (const sz of [-1, 1]) k.add(part(new THREE.CircleGeometry(0.17, 18), M.wood, { z: sz * (L / 2 + 0.001), ry: sz > 0 ? 0 : Math.PI }));
  for (const [zz, r] of [
    [-L / 2 + 0.05, 0.178],
    [0, 0.212],
    [L / 2 - 0.05, 0.178],
  ])
    k.add(part(new THREE.TorusGeometry(r, 0.01, 5, 20), M.iron, { z: zz }));
  if (tap) {
    k.add(rod(V3(0, -0.08, L / 2), V3(0, -0.08, L / 2 + 0.08), 0.018, 0.014, M.wood, 6));
    k.add(rod(V3(0, -0.08, L / 2 + 0.07), V3(0, -0.13, L / 2 + 0.07), 0.012, 0.01, M.wood, 6));
    k.add(box(0.05, 0.015, 0.015, M.iron, { y: -0.055, z: L / 2 + 0.05 }));
  }
  g.add(k);
}

/** Kegs on their side, head and tap toward the facing: 0 one on a cradle, 1 three in a pyramid on a rack. */
export function keg(facing, variant) {
  const M = materials();
  const g = new THREE.Group();
  if (variant === 0) {
    for (const sz of [-1, 1]) {
      g.add(box(0.42, 0.08, 0.07, M.beam, { y: 0.04, z: sz * 0.15 }));
      for (const sx of [-1, 1]) g.add(box(0.07, 0.06, 0.07, M.beam, { x: sx * 0.16, y: 0.1, z: sz * 0.15 }));
    }
    kegBody(g, 0, 0.32, 0, M);
    faced(g, facing);
    return scaled(g, S);
  }
  for (const sx of [-1, 1]) g.add(box(0.07, 0.07, 0.56, M.beam, { x: sx * 0.24, y: 0.035 }));
  for (const sz of [-1, 1]) g.add(box(0.86, 0.06, 0.06, M.beam, { y: 0.1, z: sz * 0.2 }));
  kegBody(g, -0.215, 0.33, 0, M);
  kegBody(g, 0.215, 0.33, 0, M);
  kegBody(g, 0, 0.33 + 0.37, 0, M, false);
  faced(g, facing);
  return scaled(g, S);
}

// ── the floor: rugs ────────────────────────────────────────────────────────────────────

/** Rug sizes in metres, [length along the axis, depth]: 0 under the long table, 1 by the hearth. */
const RUG_SIZE = [
  [4.4, 2.4],
  [2.0, 1.2],
];

/**
 * A woven rug lying flat, its long side along the axis: an oxblood field of lozenges, a dark
 * border and guard stripes, worn where feet go, a fringe at its short ends. Its cloth rucks a
 * little, so it lies on the boards rather than being painted on them.
 */
export function rug(axis, variant) {
  const H = hallMaterials();
  const g = new THREE.Group();
  const [L, D] = RUG_SIZE[variant];
  const geo = new THREE.PlaneGeometry(L, D, 40, 20);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, 0.012 + 0.008 * vnoise(x * 2.2 + 5, y * 2.2, 761 + variant) + 0.012 * Math.max(0, Math.sin(x * 1.7 + y * 0.6 + variant) - 0.7));
  }
  geo.computeVertexNormals();
  g.add(part(geo, H.rugs[variant], { rx: -Math.PI / 2 }));
  g.add(box(L - 0.02, 0.012, D - 0.02, H.rugEdge, { y: 0.006 }));
  const R = rng(771 + variant);
  for (const sx of [-1, 1])
    for (let i = 0; i < Math.round(D / 0.05); i++)
      g.add(box(0.06 + R() * 0.03, 0.006, 0.018, H.fringe, { x: sx * (L / 2 + 0.03), y: 0.006, z: -D / 2 + 0.025 + i * 0.05, ry: (R() - 0.5) * 0.4 }));
  if (axis === "y") g.rotation.y = Math.PI / 2;
  return scaled(g, S);
}
