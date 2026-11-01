// The owner's review of the building exteriors (FS-9PN7X §F.1): per building type, the exterior
// pieces beside the back and front pieces they stand in for, then a mock building laid from the
// baked frames as the scenes lay them (pieces along each wall's centreline, a post at every
// corner and door jamb, roof and gables or cap at the back walls' top), once closed (the player outside)
// and once in the interior look (the player inside). A knight stands at the door for scale.
//
// Written to tools/bake/review/contact-building.png (gitignored) on every `npm run bake`, never
// by --check. Review output only: it lays the art the way walls.ts, roofs.ts and the cap plan do,
// but it is a mock, not the client (no trim of part tiles, no light-map, no occluder fade).

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodePng } from "./png.mjs";
import { REVIEW_DIR } from "./contact.mjs";

const WALL_BACK = 3.6;
const ROOF_RISE = 0.7;
/** Screen px per world unit of height (page/projection.js VPX). */
const VPX = (32 / Math.SQRT1_2) * Math.cos(Math.PI / 6);
/** The mock building: tiles along world x and y; the door is the middle tile of the south wall. */
const W = 5;
const D = 3;
const DOOR = 2;
const ZOOM = 2;
const M = 24;

const TYPES = [
  {
    title: "TIMBER (town buildings): exterior | back | front",
    prefix: "",
    exterior: ["plain", "brace", "window"],
    back: ["plain", "brace", "window", "torch"],
    front: ["plain", "brace", "window", "torch"],
    ground: "ground_cobble",
    top: "roof",
  },
  {
    title: "MASONRY (Spire rooms): exterior | back | front",
    prefix: "tower_",
    exterior: ["plain", "pillar"],
    back: ["plain", "pillar", "sconce", "banner", "cobweb"],
    front: ["plain", "pillar"],
    ground: "ground_flags",
    top: "cap",
  },
];
const CLOSED = "closed: player outside (exterior pieces, back posts at every corner, roof and gables or cap, dark opening)";
const OPEN = "interior look: player inside (today's cut-away fronts, roof lifted or cap hidden)";

/** The label texts this review stamps, rendered by the bake page with the contact sheet's. */
export const buildingReviewTexts = () => [...TYPES.map((t) => t.title), CLOSED, OPEN];

const hexRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function canvas(width, height, bg) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set([...bg, 255], i * 4);
  return { width, height, rgba };
}

/** Alpha-blends straight RGBA `px` (w × h) at (x0, y0), clipped to the canvas. */
function blit(c, px, w, h, x0, y0) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  for (let y = 0; y < h; y++) {
    const cy = y0 + y;
    if (cy < 0 || cy >= c.height) continue;
    for (let x = 0; x < w; x++) {
      const cx = x0 + x;
      if (cx < 0 || cx >= c.width) continue;
      const s = (y * w + x) * 4;
      const a = px[s + 3];
      if (a === 0) continue;
      const o = (cy * c.width + cx) * 4;
      const t = a / 255;
      for (let k = 0; k < 3; k++) c.rgba[o + k] = Math.round(px[s + k] * t + c.rgba[o + k] * (1 - t));
    }
  }
}

function upscale(c, z) {
  const out = canvas(c.width * z, c.height * z, [0, 0, 0]);
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const s = (Math.floor(y / z) * c.width + Math.floor(x / z)) * 4;
      c.rgba.copy(out.rgba, (y * out.width + x) * 4, s, s + 4);
    }
  return out;
}

/** One frame of a baked sheet as raw RGBA, with its size and anchor in px. */
function frameOf(sheets, name, anim, index = 0, dir = 0) {
  const s = sheets.find((x) => x.name === name);
  if (!s) throw new Error(`building review: no sheet "${name}"`);
  const a = s.animations[anim ?? Object.keys(s.animations)[0]];
  const list = a.frames[dir];
  return {
    px: Buffer.from(list[index % list.length], "base64"),
    w: s.frameWidth,
    h: s.frameHeight,
    ax: s.anchor.x * s.frameWidth,
    ay: s.anchor.y * s.frameHeight,
  };
}

/**
 * The draw list of one mock building, in tiles: what to draw where, sorted the way the scene's
 * footprint order sorts it. `closed` picks the exterior look.
 */
function plan(type, closed) {
  const p = type.prefix;
  const items = [];
  const at = (sheet, anim, index, x, y, depth, lift = 0) => items.push({ sheet, anim, index, x, y, depth, lift });
  for (let i = -2; i < W + 2; i++)
    for (let j = -2; j < D + 3; j++) at(type.ground, "variants", (i * 7 + j * 3 + 20) % 4, i + 0.5, j + 0.5, -1e3);
  const pick = (kinds, k) => kinds[k % kinds.length];
  // north and west: full-height back pieces in both looks
  for (let i = 0; i < W; i++) at(`${p}wall_back_${pick(type.back, i)}_x`, "variants", i, i + 0.5, 0, i);
  for (let j = 0; j < D; j++) at(`${p}wall_back_${pick(type.back, j + 2)}_y`, "variants", j, 0, j + 0.5, j);
  // south and east: exterior pieces outside, cut-away fronts inside
  const side = closed ? (k) => `${p}wall_exterior_${pick(type.exterior, k)}` : (k) => `${p}wall_front_${pick(type.front, k)}`;
  for (let i = 0; i < W; i++) if (i !== DOOR) at(`${side(i)}_x`, "variants", i, i + 0.5, D, i + D);
  for (let j = 0; j < D; j++) at(`${side(j + 1)}_y`, "variants", j, W, j + 0.5, W + j);
  if (closed) at(`${p}door_dark_x`, "default", 0, DOOR + 0.5, D, DOOR + D + 0.5);
  else if (p === "tower_") at("door_x", "open", 0, DOOR + 0.5, D, DOOR + D + 0.5);
  // posts at every corner and door jamb: back posts all round outside; inside, as tall as the
  // tallest wall they join
  const posts = [
    [0, 0, "back"],
    [W, 0, "back"],
    [0, D, "back"],
    [W, D, "front"],
    [DOOR, D, "front"],
    [DOOR + 1, D, "front"],
  ];
  for (const [x, y, h] of posts) at(`${p}post_${closed ? "back" : h}`, "default", 0, x, y, x + y + 0.01);
  // the knight at the door, outside
  items.push({ sheet: "char_knight_base", anim: "idle", index: 0, dir: 2, x: DOOR + 0.5, y: D + 1.1, depth: DOOR + D + 1.6, lift: 0 });
  if (closed && type.top === "roof") {
    // planRoof for this house: ridge along x, 10 world px of eave
    const eave = 10 / 40;
    const cols = Math.ceil(W + 2 * eave - 1e-6);
    const rows = Math.ceil(D / 2 + eave - 1e-6);
    for (let i = 0; i < cols; i++) {
      const x = W / 2 + (i + 0.5 - cols / 2);
      for (let j = 0; j < rows; j++) {
        const lift = WALL_BACK + (rows - 1 - j) * ROOF_RISE;
        at("roof_slope", "n", 0, x, D / 2 - (j + 0.5), 1e3 + x + D / 2 - (j + 0.5), lift);
        at("roof_slope", "s", 0, x, D / 2 + (j + 0.5), 1e3 + x + D / 2 + (j + 0.5), lift);
      }
      at("roof_ridge", "x", 0, x, D / 2, 1e3 + x + D / 2 + 0.01, WALL_BACK + rows * ROOF_RISE);
    }
    // planGables for this house: at both ends of the ridge, each half laid outward from the ridge
    // in step with the roof's rows, the last pulled in to end on the side wall. Each sorts from a
    // tile before its low corner on the end wall's line: behind the end wall that hides its foot,
    // ahead of the north wall behind it, under the roof
    const reach = D / 2;
    const count = Math.max(1, Math.ceil(reach - 1e-6));
    for (const end of [0, W])
      for (const [half, sign] of [
        ["s", 1],
        ["n", -1],
      ])
        for (let k = 0; k < count; k++) {
          const inner = Math.min(k, Math.max(0, reach - 1));
          const y = D / 2 + sign * (inner + 0.5);
          // drawn from its foot: its top edge starts a back wall's height up, on the roof's line
          at("roof_gable_x", half, 0, end, y, end + y - 1.5, (rows - inner - 1) * ROOF_RISE);
        }
  }
  if (closed && type.top === "cap")
    for (let i = 0; i < W; i++) for (let j = 0; j < D; j++) at("tower_cap", "variants", i * 3 + j, i + 0.5, j + 0.5, 1e3 + i + j, WALL_BACK);
  return items.sort((a, b) => a.depth - b.depth);
}

/** Screen px of a world point in tiles, `lift` world units above the ground. */
const screen = (x, y, lift) => ({ x: (x - y) * 32, y: (x + y) * 16 - lift * VPX });

/** Every review file's absolute path. */
export function writeBuildingReview({ sheets, labels, theme }) {
  const bg = mixRgb(hexRgb(theme.barrowDeep), hexRgb(theme.charcoal), 0.35);
  // one row per type: the pieces side by side, then the two mock buildings
  const rows = TYPES.map((type) => {
    const pieces = [
      ...type.exterior.map((k) => `${type.prefix}wall_exterior_${k}_x`),
      `${type.prefix}door_dark_x`,
      ...type.back.map((k) => `${type.prefix}wall_back_${k}_x`),
      `${type.prefix}post_back`,
      ...type.front.map((k) => `${type.prefix}wall_front_${k}_x`),
      `${type.prefix}post_front`,
      ...(type.top === "cap" ? ["tower_cap"] : ["roof_gable_x", "roof_gable_y"]),
    ];
    return { type, pieces };
  });
  // the mock's screen bounds: the ground apron and the roof ridge
  const minX = screen(-2, D + 3, 0).x - 40;
  const maxX = screen(W + 2, -2, 0).x + 40;
  const minY = screen(-2, -2, 0).y - (WALL_BACK + 2) * VPX;
  const maxY = screen(W + 2, D + 3, 0).y + 20;
  const mockW = Math.ceil(maxX - minX);
  const mockH = Math.ceil(maxY - minY);
  const lh = 20;
  const pieceH = 190;
  const rowH = lh + pieceH + lh + mockH + M;
  const rowW = ({ pieces }) => pieces.reduce((n, name) => n + frameOf(sheets, name).w + 6, M);
  const width = Math.max(2 * mockW + 3 * M, ...rows.map(rowW));
  const c = canvas(width, M + rows.length * rowH, bg);
  const stamp = (text, x, y) => {
    const l = labels.get(text);
    if (l) blit(c, l.px, l.w, l.h, x, y);
  };
  rows.forEach(({ type, pieces }, r) => {
    let y = M + r * rowH;
    stamp(type.title, M, y);
    y += lh;
    let x = M;
    for (const name of pieces) {
      const f = frameOf(sheets, name, undefined, 0);
      blit(c, f.px, f.w, f.h, x, y + pieceH - f.h);
      x += f.w + 6;
    }
    y += pieceH;
    [true, false].forEach((closed, k) => {
      const ox = M + k * (mockW + M) - minX;
      stamp(closed ? CLOSED : OPEN, M + k * (mockW + M), y);
      const oy = y + lh - minY;
      for (const it of plan(type, closed)) {
        const f = frameOf(sheets, it.sheet, it.anim, it.index, it.dir ?? 0);
        const s = screen(it.x, it.y, it.lift);
        blit(c, f.px, f.w, f.h, ox + s.x - f.ax, oy + s.y - f.ay);
      }
    });
  });
  const out = upscale(c, ZOOM);
  const file = join(REVIEW_DIR, "contact-building.png");
  writeFileSync(file, encodePng(out.width, out.height, out.rgba, { fast: true }));
  return [file];
}
