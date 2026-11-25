// The chapel's own building pieces (FS-R4MYX §I R42, the look R23 describes; owner feedback F6): a
// European church in whitewashed limestone, aged in the bake, never tinted. Walls, corner posts,
// the pointed-arch portal over its door, and a slate roof set whose gable ends carry a rose window
// and a stone cross. Authored in code (ADR-0020, ADR-0021) on the shared camera, key light and
// scale: one three.js unit is one tile edge, +x is world +x, +z is world +y, +y is up, and each
// model's origin is the centre of its footprint.
//
// Every piece stands in for one the client already lays, cut and sized as it is, so the client
// swaps the prefix and nothing else:
//   chapel_wall_{back,front}_{plain,pillar}_{x,y}   the tower's masonry partition pieces
//   chapel_wall_back_lancet_{x,y}                   the back plain piece's frame: the lancet from
//                                                    inside (W8)
//   chapel_wall_exterior_{plain,lancet,buttress}_{x,y}  the tower's exterior pieces
//   chapel_post_{back,front}                         the tower's corner piers
//   chapel_door_head_{x,y}                           the tower's door heads
//   chapel_roof_slope, chapel_roof_ridge             the town's roof_slope, roof_ridge
//   chapel_roof_gable_{x,y}                          the town's roof_gable_{x,y}
// Each wall piece, post and door head carries the piece it replaces as an invisible frame guide
// (as tower.js and building.js do), so its frame size and anchor equal that piece's; the slope is
// the town's own slab in slate. The gable alone frames larger than the town's (53 × 257 against
// 50 × 202): wider by the masonry's thickness, taller by the cross on its apex (FS-R4MYX R42's
// note). Its slab is the town gable's own (building.js gableSlab); its two frames are the plain
// piece (0) and the apex piece planGables lays against the ridge (1).
//
// The look, from BARROW only (the whites mixed toward its palest, `vellum`, never pure white):
// lime over coursed stone, the courses faint through it; grime run down from the eaves and from
// each window sill, light; rising damp, a tide line and moss at the foot; patches where the lime
// fell away to the grey stone under it. Aged, but white (owner feedback F6): a face turned east,
// out of the sun, takes a warmer lime so it reads as white as the south. Dressings (plinth, window and door surrounds, buttress
// weatherings, quoins) are bare limestone, darker than the lime. The windows are gothic lancets of
// dark leaded glass, unlit: nothing here declares a light (R15, R23).

import * as THREE from "three";
import { fbm, hash2, rng, smoothstep, vnoise } from "../noise.js";
import { cssRgb, mix, shade } from "../palette.js";
import { canvasTexture, mkCanvas, pixelTexture, textured, plain } from "../materials.js";
import { part } from "./util.js";
import { post, roofRidge, roofSlope, wallPiece, WALL_BACK } from "./architecture.js";
import { doorHead, GABLE_TUCK, gableRake, gableSlab, LENGTH, LINTEL_TOP } from "./building.js";
import { DOOR_GAP } from "./interactables.js";
import { POST_FOOT, WALL_FOOT } from "../shadow.js";
import { brokenTop, masonry, partitionPost, PX, roughBox, slice, stoneMat, towerMaterials } from "./tower.js";

/** As thick as the masonry (R23: no new WALL_FOOT entry). */
const THICK = WALL_FOOT.masonry;
const FACE = THICK / 2;

/** A door gap (80 world px), the run door's; the door head stands on its lintel (LINTEL_TOP). */
const GAP_W = DOOR_GAP;

// ── Palette (BARROW blends only) ─────────────────────────────────────────────────────────

/** The whitewash: vellum, cooled a touch (necrotic, umbraLight) so it reads white, not cream. */
const LIME = mix(mix("vellum", "necrotic", 0.08), "umbraLight", 0.06);
/**
 * The same whitewash on a face turned east (+x), out of the sun: lit by the cold sky and rim light
 * alone, it bakes grey-green beside the sunlit south face. Mixed a step warmer and lifted, it
 * reads as the same white (owner feedback F6).
 */
const LIME_EAST = mix("vellum", "umbraLight", 0.1);
const EAST_LIFT = 1.14;
/** Bare limestone dressings: grey-buff, a step darker than the lime so they read. */
const DRESSED = mix(mix("slateLight", "vellumDark", 0.55), "vellum", 0.18);
const DRESSED_DARK = mix(DRESSED, "slate", 0.45);
/** Grime run down from the eaves and the sills: rain-dirt, a warm grey, kept light (F6: white). */
const STREAK = mix(mix("slate", "vellumDark", 0.3), "barrowDeep", 0.3);
/** Rising damp: a cold green-grey, and the brown tide line at its edge. */
const DAMP = mix(mix("slate", "vellumDark", 0.35), "arcaneDeep", 0.18);
const TIDE = mix("barrowBrown", "slate", 0.4);
const MOSS = mix("arcaneDeep", "barrowDeep", 0.3);
const GRIME = mix("charcoal", "barrowDeep", 0.6);
/** Slate: blue-black, cold. */
const SLATE = mix(mix("slate", "charcoal", 0.45), "necrotic", 0.12);
const SLATE_GAP = mix("pitch", "charcoal", 0.5);
const SLATE_LICHEN = mix(mix("slateLight", "vellumDark", 0.4), "arcaneDeep", 0.2);
/** Leaded glass: near black with a cold cast, a few panes stained deep; lead a little lighter. */
const GLASS = mix("pitch", "necrotic", 0.16);
const GLASS_STAIN = [mix("pitch", "oxblood", 0.32), mix("pitch", "umbra", 0.4), mix("pitch", "arcaneDeep", 0.3)];
const LEAD = mix("slate", "charcoal", 0.25);

// ── Textures ─────────────────────────────────────────────────────────────────────────────

/** A window sill's grime run for `limewash`: `half` either side of the piece's middle, at height `y` (tile edges). */
const sillUnder = (half, y) => ({ x0: Math.round(PX / 2 - half * PX), x1: Math.round(PX / 2 + half * PX), y: Math.round(y * PX) });

/** A canvas texture's pixels. */
const pixelsOf = (t) => t.image.getContext("2d").getImageData(0, 0, t.image.width, t.image.height).data;

/**
 * Lime over coursed stone, colour and bump, `W` × `Hp` px with the ground at the bottom. The lime's
 * tone and the stone's courses (`key`) are periodic in `W`, so neighbouring pieces carry on; the
 * wear (`seed`) is kept off the piece's ends. Options:
 *   eaves     grime run down from the top edge (exterior faces); `top(x)` gives the top edge's row
 *             from the ground at column x when it is not level (a gable's raking edge)
 *   sills     [{ x0, x1, y }] px: grime run down from under each
 *   damp      0..1 rising damp at the foot, with its tide line; `tide` its height in tile edges
 *   moss      0..1 moss in the very foot
 *   patches   how many places the lime has fallen away to the stone; `patchReach` how high up the
 *             face they lie, px (three tile edges unless given: the damp lifts the lime low down)
 *   lift      overall tone
 *   east      the face is turned east, out of the sun (LIME_EAST)
 */
export function limewash(W, Hp, o = {}) {
  const key = o.key ?? 9100;
  const seed = o.seed ?? 1;
  const stone = masonry(W, Hp, { key: o.stoneKey ?? 5100, seed: seed + 3, grime: 0.2, damp: 0.25, flaws: 1 });
  const sc = pixelsOf(stone.map);
  const sb = pixelsOf(stone.bump);
  const col = mkCanvas(W, Hp);
  const bmp = mkCanvas(W, Hp);
  const ci = col.getContext("2d").createImageData(W, Hp);
  const bi = bmp.getContext("2d").createImageData(W, Hp);
  const d = ci.data;
  const b = bi.data;
  const R = rng(seed * 53 + 7);
  const top = o.top ?? (() => Hp);
  // the lime fallen away: ragged patches, most of them low where the damp lifts it
  const patches = Array.from({ length: o.patches ?? 2 }, () => ({
    x: 22 + R() * (W - 44),
    y: (0.25 + R() * R() * 0.6) * (o.patchReach ?? Math.min(Hp, PX * 3)),
    rx: 13 + R() * 12,
    ry: 10 + R() * 9,
  }));
  const tideH = PX * (o.tide ?? 0.6);
  const per = Math.round(W / 16);
  for (let y = 0; y < Hp; y++) {
    const yb = Hp - 1 - y;
    for (let x = 0; x < W; x++) {
      const n4 = (y * W + x) * 4;
      const inner = smoothstep(2, 16, Math.min(x, W - 1 - x));
      // the lime's own tone: broad mottling and the brush's horizontal strokes, periodic in W
      const broad = fbm((x * 4) / W, (yb * 4) / W, key, 4, 4);
      const brush = vnoise((x * per) / W, yb / 3.2, key + 1, per);
      let c = shade(o.east ? LIME_EAST : LIME, (o.lift ?? 1.06) * (o.east ? EAST_LIFT : 1) * (0.88 + 0.16 * broad) * (0.965 + 0.05 * brush));
      // the stone's courses faint through the lime: a joint is a shade darker, a little sunk
      const stoneB = sb[n4] / 255;
      const joint = 1 - smoothstep(0.32, 0.5, stoneB);
      c = shade(c, 1 - 0.09 * joint);
      // fallen patches: the stone shows, ringed by the lime's broken edge
      let fallen = 0;
      let rim = 0;
      for (const p of patches) {
        const dd = Math.hypot((x - p.x) / p.rx, (yb - p.y) / p.ry) + (fbm(x / 6, yb / 6, seed + 61, 3) - 0.5) * 0.9;
        fallen = Math.max(fallen, (1 - smoothstep(0.86, 1, dd)) * inner);
        rim = Math.max(rim, (1 - smoothstep(0, 0.14, Math.abs(dd - 1.02))) * inner);
      }
      const stoneC = [sc[n4], sc[n4 + 1], sc[n4 + 2]];
      c = mix(c, mix(stoneC, DRESSED, 0.55), fallen);
      c = shade(c, 1 - 0.07 * rim * (1 - fallen));
      // grime run down from the eaves: long vertical streaks, strongest under the top edge
      if (o.eaves) {
        const below = (top(x) - yb) / PX;
        if (below >= 0) {
          const run = smoothstep(0.5, 0.82, vnoise((x * 24) / W, yb / 70, seed + 31, 24)) * inner;
          const near = Math.exp(-below / 0.35);
          const far = Math.exp(-below / 1.6);
          c = mix(c, STREAK, 0.2 * near + 0.2 * run * far);
        }
      }
      // grime from under each sill
      for (const s of o.sills ?? []) {
        if (yb > s.y || x < s.x0 - 2 || x > s.x1 + 2) continue;
        const down = (s.y - yb) / PX;
        const run = smoothstep(0.38, 0.78, vnoise(x / 2.6, yb / 46, seed + 37));
        const edge = smoothstep(s.x0 - 2, s.x0 + 4, x) * (1 - smoothstep(s.x1 - 4, s.x1 + 2, x));
        c = mix(c, STREAK, (0.15 + 0.25 * run) * Math.exp(-down / 0.9) * edge);
      }
      // rising damp under a ragged tide line, the line itself a brown stain
      if (o.damp) {
        const tide = tideH * (0.82 + 0.36 * fbm((x * 8) / W, 0.5, key + 5, 3, 8));
        const t = (tide - yb) / tide;
        if (t > -0.08) {
          c = mix(c, DAMP, o.damp * (0.3 + 0.4 * Math.max(0, t)) * smoothstep(-0.08, 0.2, t));
          c = mix(c, TIDE, o.damp * 0.32 * (1 - smoothstep(0, 4, Math.abs(yb - tide))));
          c = mix(c, GRIME, o.damp * 0.5 * (1 - smoothstep(0, PX * 0.16, yb)));
        }
      }
      if (o.moss) {
        const m = smoothstep(0.55, 0.72, fbm(x / 8, yb / 8, seed + 41, 3)) * (1 - smoothstep(PX * 0.05, PX * 0.5, yb)) * inner;
        c = mix(c, MOSS, o.moss * m);
      }
      // flecks: pits in the lime
      if (vnoise(x / 1.3, yb / 1.3, seed + 43) > 0.9) c = shade(c, 0.86);
      d[n4] = c[0];
      d[n4 + 1] = c[1];
      d[n4 + 2] = c[2];
      d[n4 + 3] = 255;
      const h = 255 * (fallen > 0.5 ? 0.25 + 0.4 * stoneB : 0.7 + 0.12 * broad - 0.22 * joint + 0.2 * rim);
      b[n4] = b[n4 + 1] = b[n4 + 2] = Math.max(0, Math.min(255, h));
      b[n4 + 3] = 255;
    }
  }
  col.getContext("2d").putImageData(ci, 0, 0);
  bmp.getContext("2d").putImageData(bi, 0, 0);
  return { map: canvasTexture(col), bump: canvasTexture(bmp) };
}

let CHAPEL = null;

/** The chapel building's shared materials, built once per bake (seeded, so deterministic). */
export function chapelBuildingMaterials() {
  if (CHAPEL) return CHAPEL;
  const ashlar = (base, s) =>
    pixelTexture(128, 128, (x, y) => {
      // dressed blocks a quarter tile high, a half long, the joints fine
      const row = Math.floor(y / 32);
      const u = (x + (row % 2) * 32) % 64;
      const e = Math.min(u, 64 - u, y % 32, 32 - (y % 32)) + (vnoise(x / 3, y / 3, s) - 0.5) * 1.6;
      const id = hash2(Math.floor((x + (row % 2) * 32) / 64), row, s + 1);
      let c = shade(base, (0.84 + 0.18 * id) * (0.86 + 0.24 * fbm(x / 14, y / 14, s + 2)) * (0.94 + 0.08 * vnoise(x / 1.5, y / 1.5, s + 3)));
      c = mix(c, STREAK, 0.3 * smoothstep(0.6, 0.85, vnoise(x / 3, y / 40, s + 4)));
      return shade(c, 0.72 + 0.28 * smoothstep(0.4, 1.6, e));
    });
  const limeSmall = limewash(128, 128, { key: 9150, seed: 11, patches: 0 });
  CHAPEL = {
    dressed: textured(ashlar(DRESSED, 9201), { rough: 0.93, bump: 0.7 }),
    dressedDark: textured(ashlar(DRESSED_DARK, 9211), { rough: 0.95, bump: 0.8 }),
    lime: stoneMat(limeSmall, { bump: 0.6 }),
    glass: (() => {
      // diamond quarries in lead cames, a few panes stained deep: dark, never lit
      const t = pixelTexture(64, 192, (x, y) => {
        const a = (x + y) / 12;
        const bb = (x - y + 192) / 12;
        const ia = Math.floor(a);
        const ib = Math.floor(bb);
        const fa = a - ia;
        const fb = bb - ib;
        const came = Math.min(fa, 1 - fa, fb, 1 - fb) < 0.09;
        if (came) return shade(LEAD, 0.85 + 0.3 * vnoise(x / 2, y / 2, 9221));
        const id = hash2(ia, ib, 9222);
        const pane = id > 0.86 ? GLASS_STAIN[Math.floor(id * 97) % 3] : GLASS;
        // a sheen across the glass, brighter toward the top, as old crown glass catches the sky
        const sheen = 0.85 + 0.35 * fbm(x / 20, y / 30, 9223) + 0.25 * (1 - y / 192);
        return shade(pane, sheen);
      });
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.3, metalness: 0.35 });
    })(),
    lead: plain(LEAD, { rough: 0.6, metal: 0.5 }),
    joint: plain(mix(GRIME, DRESSED, 0.3), { rough: 1 }),
    slate: (() => {
      const t = pixelTexture(128, 128, (x, y) => {
        // courses of slates 16 px deep, each 32 px wide, joints half a slate over course to course
        // (periodic in the tile, so neighbouring pieces carry on); a few slipped or gone
        const row = Math.floor(y / 16);
        const shift = (row % 2) * 16 + Math.floor(hash2(row, 0, 9231) * 3) * 2;
        const xx = (x + shift) % 128;
        const k = Math.floor(xx / 32);
        const fx = (xx % 32) / 32;
        const fy = (y % 16) / 16;
        const id = hash2(k, row, 9232);
        // a slipped slate hangs a little low and dark; a gone one shows the black under it
        const gone = id > 0.985;
        const slipped = !gone && id > 0.93;
        if (gone && fy < 0.85) return mix(SLATE_GAP, SLATE, 0.35 + 0.2 * vnoise(x, y, 9233));
        const edge = fy > (slipped ? 0.95 : 0.86) ? 0.42 : 1;
        const joint = fx < 0.04 || fx > 0.97 ? 0.45 : 1;
        const tone = (0.72 + 0.4 * id) * (0.9 + 0.2 * fbm(x / 10, y / 10, 9234, 3)) * (0.95 + 0.08 * vnoise(x / 1.4, y / 1.4, 9235));
        let c = shade(SLATE, tone * edge * joint * (1 - 0.22 * fy) * (slipped ? 0.8 : 1));
        // pale lichen rosettes and a little moss in the laps
        c = mix(c, SLATE_LICHEN, 0.6 * smoothstep(0.72, 0.8, fbm(x / 7, y / 7, 9236, 3)));
        c = mix(c, MOSS, 0.5 * smoothstep(0.66, 0.8, fbm(x / 18, y / 18, 9237, 3)) * smoothstep(0.6, 0.95, fy));
        return c;
      });
      return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 0.9, roughness: 0.78, metalness: 0.05 });
    })(),
    ridge: textured(ashlar(mix(DRESSED_DARK, "slate", 0.35), 9241), { rough: 0.95, bump: 0.9 }),
    core: towerMaterials().core,
  };
  return CHAPEL;
}

/** Dressed stone on a face `w` × `h` tile edges: the ashlar at its own scale, not stretched. */
export function dressedAt(m, w, h) {
  const map = m.map.clone();
  map.repeat.set(w, h);
  map.needsUpdate = true;
  return textured(map, { rough: 0.93, bump: 0.7 });
}

/** Hides a frame guide: still counted by the bake's framing, never drawn and never shadowing. */
function guide(obj) {
  obj.visible = false;
  return obj;
}

/** A wall body: a box faced with `face` on its ±z sides, `ends` on ±x, `top` above. */
function body(L, H, T, face, ends, top) {
  return part(new THREE.BoxGeometry(L, H, T), [ends, ends, top, top, face, face], { y: H / 2 });
}

/**
 * A wall body as `body` builds it, pierced through by `hole` (a shape on its face, in the piece's
 * x and height): `face` on its ±z sides, mapped once across the piece as the box's are, `edge` on
 * its ends, top and the hole's sides.
 */
export function piercedBody(L, H, T, hole, face, edge) {
  const outline = new THREE.Shape([new THREE.Vector2(-L / 2, 0), new THREE.Vector2(L / 2, 0), new THREE.Vector2(L / 2, H), new THREE.Vector2(-L / 2, H)]);
  outline.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(outline, { depth: T, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -T / 2);
  // the faces (the extrusion's first group) take the face texture once across the piece
  const [caps] = geo.groups;
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = caps.start; i < caps.start + caps.count; i++) uv.setXY(i, (pos.getX(i) + L / 2) / L, pos.getY(i) / H);
  return part(geo, [face, edge]);
}

/** A box from a flat options object. */
export const box = (w, h, d, material, o = {}) => part(new THREE.BoxGeometry(w, h, d), material, o);

/** Extrudes a shape `depth` toward +z from `z`, its UVs the shape's own units (1 a tile edge). */
export function slab(shape, depth, material, z) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  return part(geo, material, { z });
}

/**
 * The lancet: half its opening's width, the arch radius, its sill and springing (tile edges). One
 * opening for both looks: the outward face's window (chapelExterior) and the inner face's
 * (chapelWall's `lancet`) stand at the same height (W8).
 */
export const LANCET = { half: 0.15, r: 0.36, sill: 1.05, spring: 2.42 };
/**
 * The inner lancet's reveal: how far the opening widens along the wall and drops at the sill from
 * the glass to the room face, and how deep the glass is set in from that face (tile edges).
 */
const SPLAY = { side: 0.08, sill: 0.1, depth: 0.17 };

// ── Gothic shapes ────────────────────────────────────────────────────────────────────────

/**
 * A pointed arch's outline as points, left springing to right springing over the apex: two arcs
 * of radius `r` struck from centres `c` inside the opposite jamb, so the half-span is `r − c`.
 */
function pointedArc(half, r, spring, n = 10) {
  const c = r - half;
  const apex = Math.acos(c / r);
  // the left arc, struck from (c, spring), from the left springing up to the apex on x = 0
  const left = Array.from({ length: n + 1 }, (_, i) => {
    const a = Math.PI - apex * (i / n);
    return [c + r * Math.cos(a), spring + r * Math.sin(a)];
  });
  // the right arc, struck from (-c, spring), from the apex down to the right springing
  const right = Array.from({ length: n }, (_, i) => {
    const a = apex * (1 - (i + 1) / n);
    return [-c + r * Math.cos(a), spring + r * Math.sin(a)];
  });
  return [...left, ...right];
}

/** The apex height of a pointed arch over its springing. */
export const archRise = (half, r) => Math.sqrt(r * r - (r - half) * (r - half));

/**
 * A lancet's outline as points, counter-clockwise seen from its face: the sill's two ends, then up
 * the right jamb, over the pointed head and down to the left springing. Every lancet has as many
 * points, so two outlines of one window pair up point for point (a reveal's loft).
 */
const lancetPoints = (half, r, sill, spring) => [[-half, sill], [half, sill], ...pointedArc(half, r, spring).reverse()];

/** A closed lancet outline: sill, jambs, pointed head. */
export function lancetShape(half, r, sill, spring) {
  const [first, ...rest] = lancetPoints(half, r, sill, spring);
  const s = new THREE.Shape();
  s.moveTo(...first);
  for (const [x, y] of rest) s.lineTo(x, y);
  s.closePath();
  return s;
}

/**
 * The surface between two outlines of one opening (lancetPoints), `a` at depth `za` and `b` at
 * `zb` toward +z: a window's reveal, its faces turned in toward the opening's axis and out toward
 * +z. Its UVs are in tile edges round the outline and across the depth, so a texture keeps its
 * scale.
 */
function loft(a, b, za, zb) {
  const pos = [];
  const uv = [];
  const d = Math.abs(zb - za);
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const j = (i + 1) % a.length;
    const step = Math.hypot(a[j][0] - a[i][0], a[j][1] - a[i][1]);
    const A0 = [a[i][0], a[i][1], za, s, 0];
    const A1 = [a[j][0], a[j][1], za, s + step, 0];
    const B0 = [b[i][0], b[i][1], zb, s, d];
    const B1 = [b[j][0], b[j][1], zb, s + step, d];
    for (const v of [A0, B0, A1, A1, B0, B1]) {
      pos.push(v[0], v[1], v[2]);
      uv.push(v[3], v[4]);
    }
    s += step;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

/**
 * A lancet's dark leaded glass on the plane `z`: the pane, and over it a lead mullion down the
 * middle and two transom bars, the cames' iron. Unlit: dark glass, inside and out (R23, W14).
 */
function leadedGlass(g, C, z) {
  const { half, r, sill, spring } = LANCET;
  const rise = archRise(half, r);
  const glassGeo = fitUV(new THREE.ShapeGeometry(lancetShape(half, r, sill, spring), 8));
  g.add(part(glassGeo, C.glass, { z }));
  g.add(box(0.018, spring + rise - sill - 0.04, 0.01, C.lead, { y: (sill + spring + rise) / 2, z: z + 0.008 }));
  for (const ty of [sill + 0.45, sill + 0.9]) g.add(box(2 * half, 0.016, 0.01, C.lead, { y: ty, z: z + 0.008 }));
}

/**
 * A band following a pointed arch, open at both feet: outer arc over, inner arc back. A foot below
 * the springing carries the band down plumb to it; one above starts the band there.
 */
export function archBand(halfOut, rOut, halfIn, rIn, spring, footOut = spring, footIn = spring) {
  const outer = pointedArc(halfOut, rOut, spring, 14).filter(([, y]) => y >= footOut);
  const inner = pointedArc(halfIn, rIn, spring, 14).reverse().filter(([, y]) => y >= footIn);
  const s = new THREE.Shape();
  s.moveTo(outer[0][0], footOut);
  for (const [x, y] of outer) s.lineTo(x, y);
  s.lineTo(outer[outer.length - 1][0], footOut);
  s.lineTo(inner[0][0], footIn);
  for (const [x, y] of inner) s.lineTo(x, y);
  s.lineTo(inner[inner.length - 1][0], footIn);
  s.closePath();
  return s;
}

/** Remaps a geometry's UVs to its own x/y bounds, so a texture covers it once. */
function fitUV(geo) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - min.x) / (max.x - min.x), (pos.getY(i) - min.y) / (max.y - min.y));
  return geo;
}

// ── Walls ────────────────────────────────────────────────────────────────────────────────

/**
 * One tile of the chapel's inside wall: lime on stone, cleaner than the outside (no eaves grime, a
 * little damp at the foot). `variant` is plain | pillar (a plain whitewashed pilaster with a
 * dressed base and capital) | lancet (back only: the outward face's window seen from inside, W8);
 * `H` is the back (full) or front (cut-away) height.
 */
export function chapelWall(H, variant, axis, seed) {
  const C = chapelBuildingMaterials();
  const back = H > 2;
  const lancet = variant === "lancet";
  if (lancet && !back) throw new Error("chapelWall: a lancet is a back piece only; the cut-away front wall carries no window (W7)");
  const Hp = Math.round(PX * H);
  const { half, r, sill, spring } = LANCET;
  const sills = lancet ? [sillUnder(half + SPLAY.side, sill - SPLAY.sill)] : [];
  // no fallen lime beside the opening, where a patch would leave a scrap on the jamb
  const tex = limewash(PX, Hp, { seed: seed + 100, damp: 0.45, tide: 0.5, patches: lancet ? 0 : 1, lift: 1.02, sills });
  const face = stoneMat(tex, { bump: 0.8 });
  // a cut-away top course of lime-crusted stones, a few more standing than the tower's
  const crust = { gone: 0.4, stone: (R) => (R() > 0.35 ? C.lime : C.dressed) };
  const g = new THREE.Group();
  const top = back ? H : H - 0.14;
  if (lancet) {
    // the wall pierced by the window's room-side outline, the reveal splaying in from it to the
    // glass set deep in the wall, and the glass with its lead
    const room = [half + SPLAY.side, r + SPLAY.side, sill - SPLAY.sill, spring];
    g.add(piercedBody(LENGTH, H, THICK, lancetShape(...room), face, C.lime));
    const reveal = part(loft(lancetPoints(half, r, sill, spring), lancetPoints(...room), FACE - SPLAY.depth, FACE), C.lime);
    reveal.userData.reveal = true;
    g.add(reveal);
    leadedGlass(g, C, FACE - SPLAY.depth);
  } else g.add(body(LENGTH, top, THICK, face, C.lime, C.lime));
  // a low dressed plinth along the foot, lifted a hair so the footprint stays the wall's
  g.add(part(roughBox(1.0, 0.2, 0.26, seed + 3, 0.03), C.dressed, { y: 0.03 + 0.1 }));
  if (back) g.add(box(LENGTH, 0.1, 0.26, C.lime, { y: H + 0.05 }));
  else brokenTop(g, LENGTH, THICK, top, H + 0.09, seed * 7 + 1, C, crust);
  if (variant === "pillar") {
    const ph = back ? H - 0.02 : top;
    const pil = slice(tex, -0.17, 0.17, 0, ph, LENGTH, H, 0.8);
    g.add(box(0.34, ph, 0.1, pil, { y: ph / 2, z: FACE + 0.05 }));
    g.add(part(roughBox(0.42, 0.24, 0.14, seed + 6, 0.03), C.dressed, { y: 0.03 + 0.12, z: FACE + 0.06 }));
    if (back) g.add(part(roughBox(0.42, 0.14, 0.15, seed + 7, 0.03), C.dressed, { y: H - 0.09, z: FACE + 0.06 }));
    else brokenTop(g, 0.32, 0.1, top, H + 0.09, seed * 11, C, crust);
  }
  g.add(guide(wallPiece(H, "plain", "x", 1)));
  if (axis === "y") g.rotation.y = Math.PI / 2;
  return g;
}

/**
 * One tile of the chapel's outside wall, full height: lime on stone, grime run down from the eaves,
 * damp, a tide line and moss at the foot, on a bare limestone plinth, under a dressed cornice.
 * `variant` is plain | lancet (a tall gothic pointed window of dark leaded glass, unlit, in a
 * chamfered surround under a hood mould, on a sloped sill) | buttress (a two-stage stepped
 * buttress of bare dressed limestone, each stage capped by a sloped weathering stone).
 */
export function chapelExterior(variant, axis, seed) {
  const C = chapelBuildingMaterials();
  const H = WALL_BACK;
  const Hp = Math.round(PX * H);
  const { half, r, sill, spring } = LANCET;
  const lancet = variant === "lancet";
  const sills = lancet ? [sillUnder(half + 0.08, sill - 0.07)] : [];
  const tex = limewash(PX, Hp, { seed: seed + 200, eaves: true, sills, damp: 0.5, moss: 0.45, patches: 2, tide: 0.6, east: axis === "y" });
  const face = stoneMat(tex, { bump: 0.9 });
  const g = new THREE.Group();
  g.add(body(LENGTH, H, THICK, face, C.lime, C.lime));
  g.add(box(LENGTH, 0.1, 0.26, C.lime, { y: H + 0.05 }));
  // the plinth: bare limestone, chamfered into the wall at its top, damp and mossy
  g.add(part(roughBox(1.0, 0.38, 0.266, seed + 3, 0.02), C.dressedDark, { y: 0.02 + 0.19 }));
  // a dressed cornice under the eaves
  g.add(part(roughBox(1.0, 0.12, 0.27, seed + 5, 0.015), C.dressed, { y: H - 0.1 }));
  if (lancet) {
    // the dark glass, a hair proud of the lime, and its lead
    leadedGlass(g, C, FACE + 0.004);
    // the chamfered surround: an outline of dressed stone about the opening
    const sur = 0.055;
    const outer = lancetShape(half + sur, r + sur, sill - sur, spring);
    outer.holes.push(lancetShape(half, r, sill, spring));
    g.add(slab(outer, 0.03, C.dressed, FACE));
    // the hood mould over the head, its label stops a little below the springing
    const stop = spring - 0.14;
    g.add(slab(archBand(half + 0.12, r + 0.12, half + 0.075, r + 0.075, spring, stop, stop), 0.05, C.dressed, FACE));
    for (const sx of [-1, 1]) g.add(box(0.07, 0.07, 0.06, C.dressed, { x: sx * (half + 0.1), y: stop - 0.02, z: FACE + 0.03 }));
    // the sill, sloped to throw the rain
    g.add(part(new THREE.BoxGeometry(2 * half + 0.18, 0.06, 0.1), C.dressed, { y: sill - sur - 0.03, z: FACE + 0.04, rx: 0.25 }));
  }
  if (variant === "buttress") {
    // two stages, stepped back, each under a sloped weathering; lime on the faces, stone on the slopes
    const st = [
      { w: 0.42, d: 0.24, h: 1.7 },
      { w: 0.34, d: 0.14, h: 3.0 },
    ];
    for (const [i, s] of st.entries()) {
      const m = dressedAt(C.dressed, s.w, s.h);
      g.add(part(new THREE.BoxGeometry(s.w, s.h, s.d), m, { y: s.h / 2, z: FACE + s.d / 2 }));
      // the weathering stone: a slope from the stage's face back to the stage above (or the wall)
      const back = i === 0 ? st[1].d : 0;
      const run = s.d - back;
      const drop = Math.min(0.32, run * 1.6 + 0.08);
      const len = Math.hypot(run, drop);
      g.add(
        part(new THREE.BoxGeometry(s.w + 0.03, 0.05, len + 0.02), C.dressedDark, {
          y: s.h + drop / 2 - 0.02,
          z: FACE + back + run / 2,
          rx: Math.atan2(drop, run),
        }),
      );
      // the stone under the slope, from the stage's top back to the stage above (or the wall)
      const wedge = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(run, 0), new THREE.Vector2(0, drop)]);
      const wg = new THREE.ExtrudeGeometry(wedge, { depth: s.w, bevelEnabled: false });
      g.add(part(wg, C.dressed, { x: s.w / 2, y: s.h, z: FACE + back, ry: -Math.PI / 2 }));
    }
    // the plinth carried round the buttress's foot
    g.add(part(roughBox(0.46, 0.38, 0.26, seed + 9, 0.02), C.dressedDark, { y: 0.02 + 0.19, z: FACE + 0.1 }));
  }
  g.add(guide(wallPiece(H, "plain", "x", 1)));
  if (axis === "y") g.rotation.y = Math.PI / 2;
  return g;
}

/**
 * A corner pier, framed as the tower's (and so as the timber post): lime over a stone core, its
 * arrises dressed with quoins, long and short course by course, under a dressed cap.
 */
export function chapelPost(H) {
  const C = chapelBuildingMaterials();
  const g = new THREE.Group();
  const h = H + 0.08;
  const Hp = Math.round(PX * h);
  const lime = limewash(36, Hp, { key: 9300, seed: 31, damp: 0.6, tide: 0.55, patches: 0 });
  // the quoins painted over the lime: dressed blocks at the arrises, a long one and a short one
  // course by course, each course a quarter tile
  const map = lime.map.image.getContext("2d");
  const course = 32;
  const R = rng(9301);
  for (let k = 0, y = Hp; y > 0; k++, y -= course) {
    const long = k % 2 === 0;
    const w = long ? 36 : 22;
    const c = shade(DRESSED, 0.86 + 0.2 * R());
    map.fillStyle = cssRgb(c);
    map.fillRect(0, Math.max(0, y - course + 1.5), w, course - 3);
  }
  lime.map.needsUpdate = true;
  const face = stoneMat(lime, { bump: 0.7 });
  g.add(box(POST_FOOT, 0.05, POST_FOOT, C.dressedDark, { y: 0.025 }));
  g.add(part(new THREE.BoxGeometry(0.28, h, 0.28), [face, face, C.lime, C.lime, face, face], { y: 0.04 + h / 2 }));
  g.add(box(0.3, 0.08, 0.3, C.dressed, { y: H + 0.16 }));
  g.add(guide(partitionPost(H)));
  g.add(guide(post(H)));
  return g;
}

/**
 * The chapel's portal head over its door gap (R23): lime carried on over the door to the wall top,
 * and on it a pointed arch of dressed voussoirs springing from impost blocks over the door's jambs,
 * the tympanum inside it over the door's lintel in darker stone with a cross carved standing
 * proud, under a hood mould. Framed as `tower_door_head_{x,y}`, so the door (`door_{x,y}`) stands
 * under it as under the tower's.
 */
export function chapelDoorHead(axis) {
  const C = chapelBuildingMaterials();
  const H = WALL_BACK;
  const h = H - LINTEL_TOP;
  const g = new THREE.Group();
  const W = Math.round(PX * GAP_W);
  const tex = limewash(W, Math.round(PX * h), { key: 9400, seed: 41, eaves: true, patches: 1, east: axis === "y" });
  g.add(body(GAP_W, h, THICK, stoneMat(tex, { bump: 0.9 }), C.lime, C.lime).translateY(LINTEL_TOP));
  g.add(box(GAP_W, 0.1, 0.26, C.lime, { y: H + 0.05 }));
  g.add(box(GAP_W - 0.01, 0.12, 0.255, C.dressed, { y: H - 0.1 }));
  // the arch springs below the lintel's top, from imposts over the door frame's posts
  const spring = 2.12;
  const half = 0.8;
  const r = 1.25;
  const ring = 0.13;
  const rise = archRise(half, r);
  g.add(slab(archBand(half + ring, r + ring, half, r, spring), 0.045, C.dressed, FACE));
  // the voussoirs' joints: dark cuts across the ring, radial to each arc's centre
  const c = r - half;
  const apexA = Math.acos(c / r);
  const mid = r + ring / 2;
  for (let k = 1; k < 7; k++) {
    const a = Math.PI - apexA * (k / 7);
    g.add(part(new THREE.BoxGeometry(ring + 0.01, 0.014, 0.01), C.joint, { x: c + mid * Math.cos(a), y: spring + mid * Math.sin(a), z: FACE + 0.046, rz: a }));
    const b = apexA * (k / 7);
    g.add(part(new THREE.BoxGeometry(ring + 0.01, 0.014, 0.01), C.joint, { x: -c + mid * Math.cos(b), y: spring + mid * Math.sin(b), z: FACE + 0.046, rz: b }));
  }
  // the keystone, a little proud
  g.add(box(0.12, 0.16, 0.06, C.dressed, { y: spring + archRise(half + ring / 2, r + ring / 2), z: FACE + 0.03 }));
  // the imposts the arch springs from, and the lime filling past the ring to the gap's edges
  for (const sx of [-1, 1]) {
    g.add(box(0.16, 0.08, 0.06, C.dressed, { x: sx * (half + ring / 2 - 0.015), y: spring - 0.04, z: FACE + 0.03 }));
    g.add(box(GAP_W / 2 - half - ring + 0.01, LINTEL_TOP - spring + 0.08, THICK, C.lime, { x: sx * (GAP_W / 2 - (GAP_W / 2 - half - ring) / 2), y: (spring - 0.08 + LINTEL_TOP) / 2 + 0.04 }));
  }
  // the tympanum: the arch's field above the lintel, darker stone, a carved cross standing proud
  const tyY = LINTEL_TOP;
  const tyX = c - Math.sqrt(r * r - (tyY - spring) ** 2);
  const ty = new THREE.Shape();
  ty.moveTo(tyX, tyY);
  ty.lineTo(-tyX, tyY);
  for (const [x, y] of pointedArc(half, r, spring, 14).reverse()) if (y > tyY) ty.lineTo(x, y);
  ty.closePath();
  g.add(slab(ty, 0.012, C.dressedDark, FACE));
  const crossY = tyY + (spring + rise - tyY) * 0.48;
  // the cross worked in the stone's palest face, so it reads against the shadowed field
  g.add(box(0.09, 0.52, 0.035, C.lime, { y: crossY, z: FACE + 0.028 }));
  g.add(box(0.34, 0.09, 0.035, C.lime, { y: crossY + 0.09, z: FACE + 0.028 }));
  // the hood mould over the arch, from label stops at about the lintel's height
  const hr = r + ring + 0.09;
  const foot = spring + 0.48;
  g.add(slab(archBand(half + ring + 0.09, hr, half + ring + 0.03, hr - 0.06, spring, foot, foot), 0.05, C.dressed, FACE));
  // the label stops, under the band's feet
  const footX = (rr) => c - Math.sqrt(rr * rr - (foot - spring) ** 2);
  const stopX = (footX(hr) + footX(hr - 0.06)) / 2;
  for (const sx of [-1, 1]) g.add(box(0.08, 0.08, 0.05, C.dressed, { x: sx * stopX, y: foot - 0.02, z: FACE + 0.025 }));
  g.add(guide(doorHead("masonry", "x")));
  if (axis === "y") g.rotation.y = Math.PI / 2;
  return g;
}

// ── The slate roof ───────────────────────────────────────────────────────────────────────

/** One tile of slate roof, descending toward `facing`: the town's slope slab in dark slate. */
export function chapelRoofSlope(facing) {
  return roofSlope(facing, chapelBuildingMaterials().slate);
}

/**
 * The stone ridge along the named world axis: rounded ridge stones bedded on mortar, a dark joint
 * between each, sitting on the top of the highest slope row, framed as the town's ridge.
 */
export function chapelRoofRidge(axis) {
  const C = chapelBuildingMaterials();
  const g = new THREE.Group();
  g.add(box(LENGTH, 0.08, 0.25, C.dressedDark, { y: 0.04 }));
  for (const k of [-1, 0, 1]) {
    const len = LENGTH / 3 - 0.02;
    g.add(part(new THREE.CylinderGeometry(0.1, 0.1, len, 10, 1, false, 0, Math.PI), C.ridge, { x: (k * LENGTH) / 3, y: 0.09, rz: Math.PI / 2 }));
    g.add(box(len, 0.03, 0.2, C.ridge, { x: (k * LENGTH) / 3, y: 0.08 }));
  }
  g.add(guide(roofRidge("x")));
  if (axis === "y") g.rotation.y = Math.PI / 2;
  return g;
}

/**
 * The rose window: its centre below the apex, its glass radius and its moulded ring's width (tile
 * edges). As large as the roof's verge allows: seen from the camera, the near slope's overhang
 * comes down across the gable's upper corner, so the window sits low enough to clear it whole.
 */
export const OCULUS = { below: 2.42, r: 0.52, ring: 0.085 };
/**
 * The stone cross on the apex: its height over the apex, its arms' span. Tall enough to clear the
 * far slope, which (seen from the camera, all but edge-on) stands about 5 px over the ridge line
 * per row: a six-row roof hides the finial's lowest 30 px or so.
 */
export const FINIAL = { height: 1.45, span: 0.56 };

/**
 * One tile of the chapel's gable (the town's timberGable, laid by planGables unchanged), in lime
 * over stone with grime run down from under the roof's edge. `apex` is the piece against the ridge
 * (planGables' first, k = 0): it carries its half of the rose window, a round oculus of dark leaded
 * glass with stone tracery in a moulded ring, and its half of the stone cross finial standing on
 * the apex, so the two halves of an end meet in one window and one cross over the ridge.
 *
 * `axis` and `half` as timberGable: the ridge's axis, and the roof half by its downhill side.
 */
export function chapelGable(axis, half, apex = false) {
  const C = chapelBuildingMaterials();
  const L = LENGTH;
  const { highAt, topAt, height } = gableRake(axis, half);
  const W = 128;
  const Hp = Math.round(128 * height);
  // the raking top edge's row from the ground at texture column x (u across the piece's length)
  const top = (x) => topAt(-L / 2 + (x / W) * L) * 128 - GABLE_TUCK * 128 - 6;
  const tex = limewash(W, Hp, { key: 9500, seed: 51 + (highAt > 0 ? 0 : 4), eaves: true, top, patches: 1, east: axis === "x" });
  const face = stoneMat(tex, { bump: 0.9 });
  const g = new THREE.Group();
  g.add(gableSlab(axis, half, THICK, face, C.lime));
  if (apex) {
    // the seam with the other half's apex piece lies on the ridge, half a tile from this piece's
    // centre on its high side; this piece holds what lies on its own side of it
    const sx = highAt * 0.5;
    const inward = -highAt;
    const ridgeY = topAt(sx);
    // the rose window on the outward face (+z: the camera never sees a gable's other side): dark
    // glass, a moulded ring, three spokes of tracery and a boss, this piece's half of each
    const { r } = OCULUS;
    const oy = ridgeY - OCULUS.below;
    const z = THICK / 2;
    const start = (inward < 0 ? Math.PI / 2 : -Math.PI / 2) - 0.02;
    const arc = Math.PI + 0.04;
    const disc = new THREE.CircleGeometry(r, 24, start, arc);
    // the glass's UVs about the whole window, so the two halves join into one pattern
    const p = disc.attributes.position;
    const q = disc.attributes.uv;
    for (let i = 0; i < p.count; i++) q.setXY(i, 0.5 + p.getX(i) / (2 * r), 0.5 + p.getY(i) / (2 * r));
    g.add(part(disc, C.glass, { x: sx, y: oy, z: z + 0.004 }));
    const ringShape = new THREE.Shape();
    ringShape.absarc(0, 0, r + OCULUS.ring, start, start + arc, false);
    ringShape.absarc(0, 0, r - 0.01, start + arc, start, true);
    ringShape.closePath();
    g.add(part(new THREE.ExtrudeGeometry(ringShape, { depth: 0.04, bevelEnabled: false, curveSegments: 24 }), C.dressed, { x: sx, y: oy, z }));
    for (const k of [0, 1, 2]) {
      const a = start + 0.02 + (Math.PI * (k + 0.5)) / 3;
      g.add(box(r, 0.03, 0.012, C.dressed, { x: sx + Math.cos(a) * (r / 2), y: oy + Math.sin(a) * (r / 2), z: z + 0.012, rz: a }));
    }
    g.add(part(new THREE.CircleGeometry(0.085, 12, start, arc), C.dressed, { x: sx, y: oy, z: z + 0.02 }));
    // the cross finial: a plinth block on the apex, the shaft, the arms; its half on this side
    const halfBox = (w, h, dz, y, material) =>
      g.add(box(w / 2 + 0.01, h, dz, material, { x: sx + inward * ((w / 2 - 0.01) / 2), y }));
    const base = ridgeY - GABLE_TUCK;
    halfBox(0.3, 0.22, 0.2, base + 0.11, C.dressedDark);
    halfBox(0.22, 0.06, 0.17, base + 0.25, C.dressed);
    const shaftH = FINIAL.height - 0.28;
    halfBox(0.14, shaftH, 0.14, base + 0.28 + shaftH / 2, C.dressed);
    const armY = base + FINIAL.height - 0.36;
    halfBox(FINIAL.span, 0.14, 0.14, armY, C.dressed);
  }
  if (axis === "x") g.rotation.y = Math.PI / 2;
  return g;
}
