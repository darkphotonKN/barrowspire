// Building exteriors (FS-9PN7X §F, ADR-0036): the outward face of each building type, the stone
// cap a masonry room is closed with, and the dark opening a doorway shows from outside. Authored
// in code (ADR-0021) on the same camera, key light and scale as the shipped world sheets: one
// three.js unit is one tile edge, +x is world +x, +z is world +y, +y is up, and each model's
// origin is the centre of its footprint.
//
// An exterior wall piece stands on exactly the footprint of the back piece of its type
// (architecture.js `wallPiece`, tower.js `partitionWall`), so the client cuts it with the same
// cutWall geometry. Like the tower's partition pieces, each carries the timber back piece as an
// invisible frame guide, which pins its frame size and anchor to the back piece's. The camera
// sees a piece's +z face (a south wall's outside; an east wall's once turned to the y axis), so
// that face is the building's outward surface: weathered, framed or coursed, never dressed with
// a sconce, banner, cobweb or torch, and never lit. Nothing here declares a light.
//
// Exterior corners are the type's existing back posts (FS-9PN7X §B.2): a post is a column, the
// same from both sides, so there is no exterior post here.

import * as THREE from "three";
import { fbm, rng, smoothstep, vnoise } from "../noise.js";
import { color, cssRgb, grey, mix, shade } from "../palette.js";
import { canvasTexture, materials, mkCanvas, pixelTexture, TONE } from "../materials.js";
import { part } from "./util.js";
import { ROOF_RISE, wallPiece, WALL_BACK } from "./architecture.js";
import { masonry, PX, roughBox, stoneMat, towerMaterials } from "./tower.js";

/** A piece is one tile along its axis plus the hair of overlap the timber pieces use. */
const LENGTH = 1.024;
/** Timber wall thickness, as architecture.js; the masonry partition's, as tower.js. */
const THICK = 0.18;
const P_THICK = 0.24;
/** How far exterior relief may stand proud of the centreline: inside the guide's cap (0.26). */
const PROUD = 0.13;

/** The dark opening: the run door's width (50 world px of a 40 px tile) and the door's height. */
export const OPEN_W = 50 / 40;
const JAMB = 0.12;
const CLEAR_W = OPEN_W - 2 * JAMB;
const OPEN_H = 2.4;

// ── Palette (BARROW blends only). The timber tones are architecture.js's, the stone tower.js's,
// so a type's exterior and interior pieces read as one building. ─────────────────────────
const PLASTER_A = mix("slateLight", "vellumFaint", 0.35);
const PLASTER_B = mix("vellumFaint", "barrowBrown", 0.3);
const PLINTH = mix("slate", "slateLight", 0.6);
const MORTAR = mix("charcoal", "slate", 0.3);
const BEAM = mix("barrowDeep", "charcoal", 0.25);
const BEAM_GRAIN = mix("charcoal", "pitch", 0.5);
/** Rain run-off under the timbers and splash-back at the foot: the weather side of plaster. */
const STAIN = mix("barrowDeep", "slate", 0.45);
const LICHEN = mix("arcaneDeep", "slateLight", 0.35);
const STONE_LO = mix("slate", "barrowDeep", 0.4);
const STONE_MID = mix("slate", "barrowBrown", 0.32);
const STONE_HI = mix("slateLight", "vellumFaint", 0.32);
const CAP_JOINT = mix("charcoal", "barrowDeep", 0.45);
/** The way in, seen from outside: the canvas's darkest ink (palette.inkDeep). */
const DARK = "pitch";

/** Hides a frame guide: still counted by the bake's framing, never drawn and never shadowing. */
function guide(obj) {
  obj.visible = false;
  return obj;
}

/** The flat darkness of a doorway: unlit, untoned, exactly the token. */
let VOID = null;
function voidMaterial() {
  VOID ??= new THREE.MeshBasicMaterial({ color: color(DARK), toneMapped: false });
  return VOID;
}

// ── Timber: the outside of a half-timbered house ────────────────────────────────────────

/**
 * The street face of a timber wall, `W` × `Hp` px with the ground at the bottom: weathered
 * plaster between oak timbers on a tall stone plinth. `frame` lays the timbers: an array of
 * [x, y, w, h] in px, plus optional diagonal braces [[x0, y0, x1, y1, width]]. Returns the face
 * texture; it doubles as the bump map, as architecture.js's does.
 */
function timberFace(W, Hp, seed, { plinth, frame, braces = [], window = null, rakes = [] }) {
  const c = mkCanvas(W, Hp);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(W, Hp);
  const d = img.data;
  // where timbers sit, so plaster under each one carries its run-off streak
  const under = new Float32Array(W);
  for (const [x, , w] of frame) for (let k = Math.max(0, Math.floor(x)); k < Math.min(W, x + w); k++) under[k] = 1;
  for (let y = 0; y < Hp; y++)
    for (let x = 0; x < W; x++) {
      const n = fbm(x / 26 + seed * 7, y / 26, seed, 4);
      const st = fbm(x / 3 + seed, y / 70, seed + 3, 2);
      const sp = vnoise(x / 1.6, y / 1.6, seed + 5);
      const v = (0.76 + 0.32 * n) * (0.92 + 0.1 * sp) * (1 - 0.12 * st) * (1 - 0.18 * smoothstep(Hp * 0.6, Hp, y));
      let col = mix(PLASTER_A, PLASTER_B, smoothstep(0.55, 0.8, n));
      // rain streaks: thin vertical runs, heavier near the timbers and toward the foot
      const run = smoothstep(0.62, 0.86, vnoise(x / 2.2, y / 90, seed + 9)) * (0.35 + 0.65 * smoothstep(0, Hp, y));
      col = mix(col, STAIN, 0.42 * run + 0.18 * under[x] * smoothstep(0.4, 0.9, vnoise(x / 3, y / 40, seed + 10)));
      // patches of lichen on the plaster's lower half
      const li = smoothstep(0.7, 0.84, fbm(x / 9, y / 9, seed + 11, 3)) * smoothstep(Hp * 0.35, Hp, y);
      col = mix(col, LICHEN, 0.45 * li);
      const i = (y * W + x) * 4;
      d[i] = col[0] * v;
      d[i + 1] = col[1] * v;
      d[i + 2] = col[2] * v;
      d[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);

  const R = rng(seed * 31 + 11);
  // the plinth: coursed rubble stone, splash-stained and mossy at the foot
  if (plinth > 0) {
    const rowH = 19;
    ctx.fillStyle = cssRgb(MORTAR);
    ctx.fillRect(0, Hp - plinth, W, plinth);
    for (let y = Hp - plinth, row = 0; y < Hp; y += rowH, row++) {
      let x = -(row % 2) * 22 - R() * 10;
      while (x < W) {
        const bw = 30 + R() * 26;
        ctx.fillStyle = cssRgb(shade(PLINTH, 0.7 + R() * 0.36));
        ctx.fillRect(x + 1.5, y + 1.5, bw - 3, rowH - 3);
        ctx.fillStyle = cssRgb(grey(255), 0.09);
        ctx.fillRect(x + 1.5, y + 1.5, bw - 3, 2);
        ctx.fillStyle = cssRgb(grey(0), 0.3);
        ctx.fillRect(x + 1.5, y + rowH - 4, bw - 3, 2.5);
        x += bw;
      }
    }
    for (let i = 0; i < 900; i++) {
      const x = R() * W;
      const y = Hp - plinth + R() * plinth;
      ctx.fillStyle = R() > 0.5 ? cssRgb(grey(0), 0.25) : cssRgb(grey(255), 0.07);
      ctx.fillRect(x, y, 1.5, 1.5);
    }
    for (let i = 0; i < 320; i++) {
      const x = R() * W;
      const y = Hp - R() * R() * plinth * 0.9;
      ctx.fillStyle = cssRgb(shade(TONE.moss, 0.9 + R() * 0.5), 0.4);
      ctx.fillRect(x, y, 2, 2);
    }
    const splash = ctx.createLinearGradient(0, Hp, 0, Hp - plinth);
    splash.addColorStop(0, cssRgb(STAIN, 0.55));
    splash.addColorStop(1, cssRgb(STAIN, 0));
    ctx.fillStyle = splash;
    ctx.fillRect(0, Hp - plinth, W, plinth);
  }

  // oak timbers, silvered and checked by weather: the grain runs along each one
  const beam = (x, y, w, h) => {
    ctx.fillStyle = cssRgb(BEAM);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = cssRgb(BEAM_GRAIN, 0.6);
    ctx.lineWidth = 1;
    const along = w > h;
    for (let k = 0; k < (along ? h : w) / 2.5; k++) {
      ctx.beginPath();
      if (along) {
        const yy = y + 1 + k * 2.5 + R();
        ctx.moveTo(x, yy);
        ctx.lineTo(x + w, yy + (R() - 0.5) * 2);
      } else {
        const xx = x + 1 + k * 2.5 + R();
        ctx.moveTo(xx, y);
        ctx.lineTo(xx + (R() - 0.5) * 2, y + h);
      }
      ctx.stroke();
    }
    // a few deep checks (splits), and the weathered grey on the upper edge
    for (let k = 0; k < (along ? w : h) / 40; k++) {
      ctx.fillStyle = cssRgb(grey(0), 0.45);
      if (along) ctx.fillRect(x + R() * w, y + h * (0.3 + 0.4 * R()), 6 + R() * 10, 1);
      else ctx.fillRect(x + w * (0.3 + 0.4 * R()), y + R() * h, 1, 6 + R() * 10);
    }
    ctx.fillStyle = cssRgb(mix("slateLight", "vellum", 0.4), 0.12);
    if (along) ctx.fillRect(x, y, w, 1.5);
    else ctx.fillRect(x, y, 1.5, h);
  };
  const brace = ([x0, y0, x1, y1, bw]) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0 - bw / 2, y0);
    ctx.lineTo(x0 + bw / 2, y0);
    ctx.lineTo(x1 + bw / 2, y1);
    ctx.lineTo(x1 - bw / 2, y1);
    ctx.closePath();
    ctx.clip();
    beam(Math.min(x0, x1) - bw, Math.min(y0, y1), Math.abs(x1 - x0) + 2 * bw, Math.abs(y1 - y0));
    ctx.restore();
  };
  for (const b of braces) brace(b);
  for (const f of frame) beam(...f);
  // raking timbers [yLeft, yRight, depth]: straight across the face from edge to edge, at any
  // slope, their grain along them (the gable's rafter and collar)
  for (const [y0, y1, t] of rakes) {
    ctx.save();
    ctx.translate(0, y0);
    ctx.rotate(Math.atan2(y1 - y0, W));
    beam(-2, 0, Math.hypot(W, y1 - y0) + 4, t);
    ctx.restore();
  }
  if (window) {
    // the shuttered window's opening: a dark reveal round the shutters, under an oak surround
    const [x0, y0, x1, y1] = window;
    beam(x0 - 7, y0 - 7, x1 - x0 + 14, y1 - y0 + 14);
    ctx.fillStyle = cssRgb(DARK);
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  return canvasTexture(c);
}

/** Texture px rows from the ground for a model height `h` on a face `Hp` px tall. */
const rowAt = (Hp, h) => Math.round(Hp - h * 128);

/** The shuttered window's opening, model space: the back piece's leaded window, closed up. */
const SHUTTER = { x: 0.234, y0: 1.55, y1: 2.75 };

/**
 * One tile of timber exterior wall, full height. `variant` is plain | brace | window: close
 * studding below the rail; a St Andrew's cross; or a shuttered window, its oak leaves closed and
 * barred, under a drip hood. The window is dark, never lit.
 */
export function timberExterior(variant, axis, seed) {
  const M = materials();
  const H = WALL_BACK;
  const W = 128;
  const Hp = Math.round(128 * H);
  const plinth = Math.round(0.8 * 128);
  const top = Hp - plinth - 12;
  const mid = Math.round(top * 0.46);
  // posts at the ends, the wall plate and the sill beam, a rail at mid height
  const frame = [
    [0, 0, 10, top + 12],
    [W - 10, 0, 10, top + 12],
    [0, 0, W, 12],
    [0, top, W, 12],
    [0, mid, W, 11],
  ];
  const braces = [];
  let window = null;
  if (variant === "plain") for (const x of [38, 80]) frame.push([x, mid + 11, 10, top - mid - 11]);
  if (variant === "brace") {
    braces.push([12, top, W - 12, mid + 11, 10], [W - 12, top, 12, mid + 11, 10]);
    frame.push([W / 2 - 5, 12, 10, mid - 12]);
  }
  if (variant === "window") {
    window = [34, rowAt(Hp, SHUTTER.y1), 94, rowAt(Hp, SHUTTER.y0)];
    for (const x of [22, 96]) frame.push([x, mid + 11, 10, top - mid - 11]);
  }
  const map = timberFace(W, Hp, seed, { plinth, frame, braces, window });
  const face = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 0.6, roughness: 0.92 });
  const g = new THREE.Group();
  // the outward face toward +z; the inside face (never seen from outside) carries it too
  g.add(part(new THREE.BoxGeometry(LENGTH, H, THICK), [M.cap, M.cap, M.cap, M.cap, face, face], { y: H / 2 }));
  g.add(part(new THREE.BoxGeometry(LENGTH, 0.1, 0.26), M.cap, { y: H + 0.05 }));
  // a weathered stone water table along the plinth's top: the line rain is thrown off
  g.add(part(new THREE.BoxGeometry(LENGTH, 0.05, 0.04), M.cap, { y: 0.8 + 0.025, z: THICK / 2 + 0.02 }));
  if (variant === "window") {
    const z = THICK / 2;
    const leafW = SHUTTER.x - 0.005;
    const leafH = SHUTTER.y1 - SHUTTER.y0 - 0.02;
    const cy = (SHUTTER.y0 + SHUTTER.y1) / 2;
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Group();
      leaf.position.set(sx * (SHUTTER.x / 2 + 0.0025), cy, z + 0.016);
      leaf.add(part(new THREE.BoxGeometry(leafW, leafH, 0.024), M.woodDark));
      // ledges and strap hinges, the hinges toward the outer edge
      for (const y of [-leafH * 0.32, leafH * 0.32]) {
        leaf.add(part(new THREE.BoxGeometry(leafW - 0.02, 0.06, 0.012), M.woodDark, { y, z: 0.016 }));
        leaf.add(part(new THREE.BoxGeometry(leafW * 0.7, 0.026, 0.008), M.iron, { x: sx * leafW * 0.14, y, z: 0.025 }));
      }
      g.add(leaf);
    }
    // the bar across both leaves, a sill below and a drip hood above
    g.add(part(new THREE.BoxGeometry(SHUTTER.x * 2 - 0.04, 0.04, 0.016), M.iron, { y: cy, z: z + 0.04 }));
    g.add(part(new THREE.BoxGeometry(SHUTTER.x * 2 + 0.12, 0.05, PROUD - z + 0.02), M.cap, { y: SHUTTER.y0 - 0.035, z: (z + PROUD) / 2 }));
    g.add(part(new THREE.BoxGeometry(SHUTTER.x * 2 + 0.16, 0.05, PROUD - z + 0.02), M.beam, { y: SHUTTER.y1 + 0.1, z: (z + PROUD) / 2, rx: 0.25 }));
  }
  g.add(guide(wallPiece(H, "plain", "x", 1)));
  if (axis === "y") g.rotation.y = Math.PI / 2;
  return g;
}

// ── Timber: the gable that closes a roof's end ─────────────────────────────────────────────

/** How far a gable's top edge reaches up into the roof slab over it, so no light shows between. */
const GABLE_TUCK = 0.05;

/**
 * One tile of timber gable (FS-9PN7X, ADR-0036): the end wall carried up from the walls' tops to
 * the roof, in the outward face of the timber exterior pieces (plaster in an oak frame, the same
 * texel scale and light), so a closed house shows no inside under its roof.
 *
 * It is laid as the roof is (src/render/world/roofs.ts planGables): one piece under each slope
 * row at each end of the ridge, its top edge climbing one ROOF_RISE across its tile toward the
 * ridge, from WALL_BACK above its origin (the centre of its footprint, on the ground like a wall
 * piece's). The scene lifts it so that low end meets the roof's line over it; whichever row it
 * stands under, its foot then reaches down behind the walls' tops, in the end wall's plane, and
 * the wall in front hides it. Studs stand plumb and the rafter and collar run with the slope, so
 * neighbouring pieces at any height join up.
 *
 * `axis` is the ridge's: x closes an x ridge's east and west ends (the piece runs along world y,
 * turned like a `_y` wall, its outward face to +x); y closes a y ridge's north and south ends (it
 * runs along world x, outward face to +y). `half` is the roof half it stands under, by that
 * half's downhill side, as roof_slope's facings: s | n on an x ridge, e | w on a y ridge.
 */
export function timberGable(axis, half) {
  const M = materials();
  const L = LENGTH;
  // which local end is high: the ridge side. A y-axis piece is turned a quarter, so local +x
  // is world -y (north): an x ridge's south half climbs toward it. Unturned, local x is world
  // x: a y ridge's east half climbs toward the west, local -x.
  const highAt = (axis === "x" ? half === "s" : half === "w") ? 1 : -1;
  const topAt = (x) => WALL_BACK + GABLE_TUCK + ROOF_RISE * (0.5 + highAt * x);
  const height = topAt(highAt * (L / 2));
  const W = 128;
  const Hp = Math.round(128 * height);
  // the top edge's texture row at the face's left and right ends (row 0 is the high end's top)
  const yl = Hp - topAt(-L / 2) * 128;
  const yr = Hp - topAt(L / 2) * 128;
  const map = timberFace(W, Hp, 23 + (highAt > 0 ? 0 : 4), {
    plinth: 0,
    // plumb studs: half a post at each end (two halves make one where pieces meet) and one
    // between, so the rhythm reads as the close studding of the walls below
    frame: [
      [0, 0, 6, Hp],
      [W - 6, 0, 6, Hp],
      [W / 2 - 5, 0, 10, Hp],
    ],
    rakes: [
      // the verge rafter under the roof's edge, and a collar a little over half a tile below
      [yl + GABLE_TUCK * 128, yr + GABLE_TUCK * 128, 14],
      [yl + 78, yr + 78, 11],
    ],
  });
  const face = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 0.6, roughness: 0.92 });
  const shape = new THREE.Shape();
  shape.moveTo(-L / 2, 0);
  shape.lineTo(L / 2, 0);
  shape.lineTo(L / 2, topAt(L / 2));
  shape.lineTo(-L / 2, topAt(-L / 2));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: THICK, bevelEnabled: false });
  geo.translate(0, 0, -THICK / 2);
  // the faces' texture spans the piece: u across its length, v from its foot to its high end
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const caps = geo.groups[0];
  for (let i = caps.start; i < caps.start + caps.count; i++) uv.setXY(i, (pos.getX(i) + L / 2) / L, pos.getY(i) / height);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, [face, M.beam]));
  if (axis === "x") g.rotation.y = Math.PI / 2;
  return g;
}

// ── Masonry: the outside of a Spire room ─────────────────────────────────────────────────

/** A masonry wall body: a box faced with `face` on its ±z sides, `ends` on ±x, `top` above. */
function body(L, H, T, face, ends, top) {
  return part(new THREE.BoxGeometry(L, H, T), [ends, ends, top, top, face, face], { y: H / 2 });
}

/**
 * One tile of masonry exterior wall, full height: the room's outer face, weather-streaked, on a
 * chamfered plinth, a string course at the door head's height, and a corbel table under the
 * coping. `variant` is plain | pillar (a buttress with a sloped weathering).
 */
export function masonryExterior(variant, axis, seed) {
  const T = towerMaterials();
  const H = WALL_BACK;
  const tex = masonry(PX, Math.round(PX * H), { seed: seed + 40, grime: 0.75, damp: 0.7, moss: 0.3, flaws: 3 });
  const g = new THREE.Group();
  g.add(body(LENGTH, H, P_THICK, stoneMat(tex), T.block, T.cap));
  g.add(part(new THREE.BoxGeometry(LENGTH, 0.1, 0.26), T.cap, { y: H + 0.05 }));
  // the plinth: a deep base course of larger, lighter stones
  g.add(part(roughBox(1.0, 0.34, PROUD * 2, seed + 3, 0.03), T.block, { y: 0.03 + 0.17 }));
  // a string course at the door head's height, and corbels under the coping
  g.add(part(roughBox(1.0, 0.1, PROUD * 2, seed + 5, 0.02), T.blockLight, { y: OPEN_H + 0.21 }));
  for (const x of [-0.375, -0.125, 0.125, 0.375])
    g.add(part(roughBox(0.12, 0.14, 0.05, seed + 17 + Math.round(x * 8), 0.05), T.blockLight, { x, y: H - 0.17, z: P_THICK / 2 + 0.006 }));
  if (variant === "pillar") {
    // a buttress standing proud of the face, stepped back under a sloped weathering stone
    const bh = H - 0.5;
    g.add(part(new THREE.BoxGeometry(0.38, bh, 0.12), T.pier, { y: bh / 2, z: P_THICK / 2 + 0.06 }));
    g.add(part(roughBox(0.46, 0.4, 0.16, seed + 6, 0.04), T.blockLight, { y: 0.03 + 0.2, z: P_THICK / 2 + 0.07 }));
    g.add(part(new THREE.BoxGeometry(0.42, 0.06, 0.16), T.cap, { y: bh + 0.03, z: P_THICK / 2 + 0.05, rx: 0.5 }));
  }
  g.add(guide(wallPiece(H, "plain", "x", 1)));
  if (axis === "y") g.rotation.y = Math.PI / 2;
  return g;
}

// ── The stone cap ─────────────────────────────────────────────────────────────────────────

/** Thick enough to cover the walls' copings (WALL_BACK + 0.1) it is laid over. */
const CAP_THICK = 0.13;

/**
 * One tile of the stone cap a masonry room is closed with from outside (FS-9PN7X §F.3): a flat
 * slab of dressed flags laid at the back walls' top. Its origin is the centre of its footprint at
 * the slab's underside, like a roof slope's at its eave, so the scene lifts it by WALL_BACK. The
 * flags' joints are periodic in one tile, so neighbouring caps lay one continuous roof; a variant
 * only changes the wear inside the tile.
 */
export function towerCap(variant) {
  const T = towerMaterials();
  const S = 128;
  const seed = 6100 + variant * 7;
  const top = pixelTexture(S, S, (x, y) => {
    // two courses of flags across the tile, the second course's joints half a flag over. Every
    // term but the wear is periodic in one tile (a flag over the tile's edge is the same flag on
    // both sides), and the wear fades out toward the edge, so any two variants abut seamlessly.
    const row = y < S / 2 ? 0 : 1;
    const u = (x + row * 32) % 64;
    const jx = Math.min(u, 64 - u);
    const jy = Math.min(y % 64, 64 - (y % 64));
    const e = Math.min(jx, jy) + (vnoise(x / 4, y / 4, 6011, 32) - 0.5) * 2.5;
    const flag = Math.floor(((x + row * 32) % S) / 64);
    const id = vnoise(flag * 3.1 + row * 7.3, row * 1.7, 6012);
    const n = fbm(x / 16, y / 16, 6013, 4, 8);
    const inner = smoothstep(0, 12, Math.min(x, S - 1 - x, y, S - 1 - y));
    const wear = vnoise(x / 1.5, y / 1.5, seed);
    let c = shade(mix(STONE_LO, STONE_MID, smoothstep(0.15, 0.85, id * 0.3 + n * 0.7)), (0.8 + 0.3 * n) * (0.95 + 0.08 * (inner * wear + (1 - inner) * 0.5)));
    // a flag's worn arris, then the joint itself
    c = shade(c, 0.84 + 0.16 * smoothstep(0, 8, e));
    c = mix(c, CAP_JOINT, 1 - smoothstep(0.6, 2, e));
    // weather: rain-darkened toward the joints; lichen and grime in patches, the variant's own
    c = mix(c, STONE_LO, 0.25 * (1 - smoothstep(2, 14, e)));
    const li = smoothstep(0.66, 0.8, fbm(x / 10, y / 10, seed + 1, 3)) * smoothstep(2, 6, e) * inner;
    c = mix(c, LICHEN, 0.5 * li);
    const grime = smoothstep(0.6, 0.85, fbm(x / 22, y / 22, seed + 2, 3)) * inner;
    return mix(c, mix("charcoal", "barrowDeep", 0.5), 0.3 * grime);
  });
  const slab = new THREE.MeshStandardMaterial({ map: top, bumpMap: top, bumpScale: 0.9, roughness: 0.95 });
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(LENGTH, CAP_THICK, LENGTH), [T.block, T.block, slab, T.block, T.block, T.block], { y: CAP_THICK / 2 }));
  return g;
}

// ── The dark opening ──────────────────────────────────────────────────────────────────────

/**
 * Plaster and oak over a timber doorway, `W` px wide: the wall plate, a king stud and the
 * weathered plaster either side, so the head reads as the wall it stands in.
 */
function timberHead(clearW, h, seed) {
  const W = Math.round(128 * clearW);
  const Hp = Math.round(128 * h);
  return timberFace(W, Hp, seed, {
    plinth: 0,
    frame: [
      [0, 0, W, 12],
      [W / 2 - 5, 12, 10, Hp - 12],
    ],
  });
}

/**
 * The way into a building seen from outside (FS-9PN7X §B.5, §F.4): a full-height frame, as wide
 * as the run's door (50 world px), its lintel and reveals in the building's own material, the
 * wall carried on over the lintel to the coping, and flat darkness inside. `type` is timber |
 * masonry; `axis` x runs along world x, y along world y, as the door sheets do.
 */
export function darkOpening(type, axis) {
  const M = materials();
  const H = WALL_BACK;
  const g = new THREE.Group();
  const head = H - OPEN_H;
  if (type === "timber") {
    for (const sx of [-1, 1])
      g.add(part(new THREE.BoxGeometry(JAMB, H, 0.22), M.beam, { x: sx * (OPEN_W / 2 - JAMB / 2), y: H / 2 }));
    const map = timberHead(CLEAR_W, head - 0.16, 61);
    const face = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 0.6, roughness: 0.92 });
    g.add(part(new THREE.BoxGeometry(CLEAR_W, head - 0.16, THICK), [M.cap, M.cap, M.cap, M.cap, face, face], { y: OPEN_H + 0.16 + (head - 0.16) / 2 }));
    g.add(part(new THREE.BoxGeometry(CLEAR_W + 0.04, 0.16, 0.22), M.beam, { y: OPEN_H + 0.08 }));
    g.add(part(new THREE.BoxGeometry(OPEN_W, 0.1, 0.26), M.cap, { y: H + 0.05 }));
    g.add(part(new THREE.BoxGeometry(CLEAR_W, 0.05, 0.28), M.stone, { y: 0.025 }));
  } else {
    const T = towerMaterials();
    const R = rng(axis === "x" ? 71 : 73);
    // quoined reveals: dressed blocks with a clean inner arris, long and short in turn on the
    // outer side, bonding into the walls either side
    let y = 0;
    for (let k = 0; y < OPEN_H - 0.01; k++) {
      const bh = Math.min(0.3 + R() * 0.06, OPEN_H - y);
      const bw = k % 2 ? JAMB + 0.1 : JAMB;
      for (const sx of [-1, 1])
        g.add(part(roughBox(bw, bh - 0.01, PROUD * 2, Math.floor(R() * 1000), 0.04), T.blockLight, { x: sx * (CLEAR_W / 2 + bw / 2), y: y + bh / 2 }));
      y += bh;
    }
    const tex = masonry(Math.round(PX * OPEN_W), Math.round(PX * head), { key: 5600, seed: 3, grime: 0, damp: 0.6, flaws: 1 });
    g.add(body(OPEN_W, head, P_THICK, stoneMat(tex), T.block, T.cap).translateY(OPEN_H));
    g.add(part(roughBox(CLEAR_W + 0.3, 0.28, PROUD * 2, 79, 0.03), T.blockLight, { y: OPEN_H + 0.14 }));
    g.add(part(new THREE.BoxGeometry(OPEN_W, 0.1, 0.26), T.cap, { y: H + 0.05 }));
    g.add(part(roughBox(CLEAR_W, 0.06, 0.3, 83, 0.03), T.cap, { y: 0.03 }));
  }
  // the darkness: the doorway's void, set back so the reveals show their depth
  g.add(part(new THREE.BoxGeometry(CLEAR_W, OPEN_H, 0.12), voidMaterial(), { y: OPEN_H / 2, z: -0.02 }));
  if (axis === "y") g.rotation.y = Math.PI / 2;
  return g;
}
