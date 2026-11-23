// The owner's review of character art (ADR-0021 §5, FS-2325V §E.7): every class and creature ×
// 8 directions × each animation, at game scale (1×) and zoomed ×2. A re-baked class shows its
// `run`, `walk_attack` (its legs over 0.75 walk cycles) and `backpedal_attack` (the attack over the
// walk's legs run backward, 0.75 cycles) beside its `walk` and `attack` (FS-JS7C8 R37, R41), in clip
// order; no sheet carries a standalone backpedal. The archer and her looks show `run` as her
// sprint (the trunk about 20° forward, a quicker, shorter stride with knee drive and heel kick,
// the bow held two-handed low in front at about 45°) and carry no `walk_attack` and no
// `backpedal_attack` (FS-JS7C8 § Change: The archer's sprint and low-ready bow R79, R85): her
// clips are idle, walk, attack, death and run. The mercenary and his looks show `run` as the same
// sprint with the sword trailing behind (the sword arm back, the hand at the hip, the curved blade
// low behind him, its point and its edge down and off the ground) and carry no `walk_attack` and
// no `backpedal_attack` (FS-JS7C8 § Change: The mercenary's sprint and trailing sword R107, R113):
// his clips are idle, walk, attack, death, parry and run. The wizard and her looks show `run` as
// the sprint's lean and 16 fps cadence on her own legs (the shared fast run's, at a 12% shorter
// stride), her sceptre or focus carried as before, and `attack` as the pointed cast (the arm
// reached out all but straight, the staff or focus along the aim at chest-to-shoulder height),
// and carry no `walk_attack` and no `backpedal_attack` (FS-JS7C8 § Change: The wizard's sprint and
// pointed cast R131, R136): her clips are idle, walk, attack, death and run. The tower interior sheets
// (FS-8RBQY §D.7) follow the cast on the same sheet, one row per sheet, frames left to right.
//
// Written to tools/bake/review/ (gitignored) on every `npm run bake`, never by --check:
//   contact-sheet.png          all sheets at 1×, labelled; past CONTACT_PAGE_BYTES of pixels the
//                              rest run on in contact-sheet-2.png, -3 … (one image tops 4 GiB of RGBA
//                              once the cast outgrows it, which Node cannot allocate)
//   contact-<sheet>-2x.png     each character sheet at ×2 (nearest-neighbour, to inspect pixels)
//   contact-tower-2x.png       every tower sheet at ×2
//   contact-spire-2x.png       the Spire's facade at ×2 (FS-0XMCP §R15)
//   contact-forest-2x.png      the Forlorn Forest's trees and dressing at ×2 (FS-3QHQZ §C R30)
//   contact-interior-2x.png    the town buildings' furniture and fittings at ×2 (FS-B0H2D §G R30)
//   contact-building-2x.png    the building exteriors and stone cap at ×2 (FS-9PN7X §F)
//   contact-hall-2x.png        the enlarged Inn's great hall and taproom at ×2
//   <LINEUPS file>             a family lineup per art slice at ×2 (FS-C8VM7 §H R48): one row per
//                              sheet, each step beside the one below it, at key frames
//   contact-looks-<class>.png  a class's baked spec looks beside the class (FS-1J1CB R12), at game
//                              scale: every clip × 8 facings, each look's frame under the class's
//   contact-darkroom-<class>.png  the dark-room strip (R10, R12) at ×2: the back-facing frames of
//                              the floor's class, the class and its looks, on the run's darkest
//                              floor under the run's ambient
//   index.html                 the same from the baked atlases themselves, labelled from the
//                              manifest's `facings`, with each clip playing at its fps
// The HTML reads the committed atlases, so it also proves the manifest's frame order.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodePng } from "./png.mjs";
import { CLIENT_ROOT } from "./source.mjs";
import { downscale } from "./downscale.mjs";
import { CLASS_STEMS, isLookSheet } from "./darkRoom.mjs";

export const REVIEW_DIR = join(CLIENT_ROOT, "tools", "bake", "review");

const M = 16; // margin
const LABEL_W = 44; // facing-name column
const GAP = 18; // between animations

const hexRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/**
 * The family lineups (FS-C8VM7 §H R48), one per art slice, for the owner to gate a family's look
 * on: each row a sheet, a family's step-0 look first and its steps after it, so each shade sits
 * beside the one below it. A lineup is written only when every sheet it names was baked.
 */
export const LINEUPS = [
  {
    file: "contact-old-family-variants-2x.png",
    sheets: [
      "creature_ghoul_base",
      "creature_ghast_base",
      "creature_ravener_base",
      "creature_bone_archer_base",
      "creature_ashen_archer_base",
      "creature_wight_archer_base",
      "creature_troll_base",
      "creature_cave_troll_base",
      "creature_blood_troll_base",
      "creature_barrow_thrall_base",
      "creature_plague_thrall_base",
      "creature_blightborn_base",
      "creature_spire_wraith_base",
      "creature_shade_base",
      "creature_phantom_base",
      "creature_banshee_base",
    ],
  },
  {
    // the goblin beside the ghoul it stands below, each step's blade and shield looks
    file: "contact-goblin-2x.png",
    sheets: [
      "creature_ghoul_base",
      "creature_goblin_base",
      "creature_goblin_shield_base",
      "creature_goblin_cutthroat_base",
      "creature_goblin_cutthroat_shield_base",
      "creature_goblin_reaver_base",
      "creature_goblin_reaver_shield_base",
      "creature_goblin_warchief_base",
      "creature_goblin_warchief_shield_base",
    ],
  },
  {
    // the ogre beside the troll it stands over, and its steps
    file: "contact-ogre-2x.png",
    sheets: ["creature_troll_base", "creature_ogre_base", "creature_ogre_mauler_base", "creature_ogre_tyrant_base"],
  },
  {
    // the dark warrior and its Reaper, beside the ghoul (the bare skeleton it must not read as) and the troll
    file: "contact-dark-warrior-2x.png",
    sheets: ["creature_ghoul_base", "creature_troll_base", "creature_dark_warrior_base", "creature_dark_reaper_base"],
  },
  {
    // the Tome of Filth and the altar's two states, beside the chest they stand smaller than (FS-3103M §H R23)
    file: "contact-tome-altar-2x.png",
    sheets: ["chest", "tome", "altar"],
  },
];

/** The sheets each lineup names, from `sheets`; a lineup missing one is left out. */
export function lineupSets(sheets) {
  const byName = new Map(sheets.map((s) => [s.name, s]));
  return LINEUPS.filter((l) => l.sheets.every((n) => byName.has(n))).map((l) => ({ file: l.file, sheets: l.sheets.map((n) => byName.get(n)) }));
}

/**
 * A lineup's cells for a sheet: an 8-way sheet's idle in every facing, then its walk, its attack's
 * wind-up and strike and its death's last frame facing se; a one-facing sheet's every frame.
 */
function lineupCells(s, facings) {
  if (s.directions === 1) return Object.values(s.animations).flatMap((a) => a.frames[0]);
  const se = facings.indexOf("se");
  const at = (anim, i) => s.animations[anim] && s.animations[anim].frames[se][Math.min(i, s.animations[anim].frames[se].length - 1)];
  const idle = s.animations.idle.frames.map((dir) => dir[0]);
  return [...idle, at("walk", 2), at("attack", 1), at("attack", 3), at("death", Infinity)].filter(Boolean);
}

/** One lineup image at zoom `z`: a row per sheet, its name over it, every frame stood on one anchor. */
export function composeLineup(sheets, facings, labels, theme, z = 2) {
  const bg = mixRgb(hexRgb(theme.barrowDeep), hexRgb(theme.charcoal), 0.35);
  const cell = mixRgb(bg, hexRgb(theme.barrowBrown), 0.25);
  const ax = Math.max(...sheets.map((s) => s.anchor.x * s.frameWidth));
  const ay = Math.max(...sheets.map((s) => s.anchor.y * s.frameHeight));
  const cw = Math.ceil(ax + Math.max(...sheets.map((s) => (1 - s.anchor.x) * s.frameWidth)));
  const ch = Math.ceil(ay + Math.max(...sheets.map((s) => (1 - s.anchor.y) * s.frameHeight)));
  const lh = Math.max(18, ...sheets.map((s) => labels.get(s.name)?.h ?? 0));
  const cols = Math.max(...sheets.map((s) => lineupCells(s, facings).length));
  const rowH = lh + 4 + ch * z + M;
  const c = canvas(M * 2 + cols * cw * z, M + sheets.length * rowH, bg);
  sheets.forEach((s, r) => {
    const top = M + r * rowH;
    const l = labels.get(s.name);
    if (l) blit(c, l.px, l.w, l.h, M, top);
    lineupCells(s, facings).forEach((b64, i) => {
      const x = M + i * cw * z;
      const y = top + lh + 4;
      fill(c, x + 1, y + 1, cw * z - 2, ch * z - 2, cell);
      blit(c, Buffer.from(b64, "base64"), s.frameWidth, s.frameHeight, x + Math.round(ax - s.anchor.x * s.frameWidth) * z, y + Math.round(ay - s.anchor.y * s.frameHeight) * z, z);
    });
  });
  return c;
}

/**
 * The spec looks to review (FS-1J1CB R12), one set per class with a look baked: the class's own
 * sheet and its looks', from `sheets`. A class whose own sheet was not baked has no set.
 */
export function lookSets(sheets) {
  const byName = new Map(sheets.map((s) => [s.name, s]));
  return CLASS_STEMS.flatMap((stem) => {
    const base = byName.get(`char_${stem}_base`);
    const looks = sheets.filter((s) => isLookSheet(s.name) && s.name.startsWith(`char_${stem}_`)).sort((a, b) => (a.name < b.name ? -1 : 1));
    return base && looks.length ? [{ stem, base, looks }] : [];
  });
}

/** A sheet's frame at game scale: a sheet baked at `scale` px per screen px brought back to 1x. */
const at1x = (s, b64) => downscale(Buffer.from(b64, "base64"), s.frameWidth, s.frameHeight, s.scale ?? 1);

/** Sheets laid on one anchor at game scale: the anchor's px and the cell that holds every frame. */
function commonCell(sheets) {
  const w = (s) => s.frameWidth / (s.scale ?? 1);
  const h = (s) => s.frameHeight / (s.scale ?? 1);
  const ax = Math.max(...sheets.map((s) => s.anchor.x * w(s)));
  const ay = Math.max(...sheets.map((s) => s.anchor.y * h(s)));
  return {
    cw: Math.ceil(ax + Math.max(...sheets.map((s) => (1 - s.anchor.x) * w(s)))),
    ch: Math.ceil(ay + Math.max(...sheets.map((s) => (1 - s.anchor.y) * h(s)))),
    // where a sheet's 1x frame goes in the cell, so its anchor lands on the common one
    off: (s) => [Math.round(ax - s.anchor.x * w(s)), Math.round(ay - s.anchor.y * h(s))],
    w,
    h,
  };
}

/**
 * A class's looks beside it (FS-1J1CB R12) at game scale: a column per frame of every clip any of
 * them has, in clip order (a look's own clips, the Berserker's off-hand ones, after the class's),
 * and for each facing a row per sheet, the class first, so each look's frame sits under the
 * class's same frame. Every frame stands on one anchor.
 */
export function composeLooks(base, looks, facings, labels, theme) {
  const sheets = [base, ...looks];
  const bg = mixRgb(hexRgb(theme.barrowDeep), hexRgb(theme.charcoal), 0.35);
  const cells = [mixRgb(bg, hexRgb(theme.barrowBrown), 0.18), mixRgb(bg, hexRgb(theme.barrowBrown), 0.32)];
  const { cw, ch, off, w, h } = commonCell(sheets);
  const clips = [...new Set(sheets.flatMap((s) => Object.keys(s.animations)))];
  const span = (anim) => Math.max(...sheets.map((s) => s.animations[anim]?.frames[0].length ?? 0));
  const lh = Math.max(18, ...[...labels.values()].map((l) => l.h));
  const lw = Math.max(LABEL_W, ...sheets.map((s) => labels.get(s.name)?.w ?? 0)) + 12;
  const cols = [];
  let x = M + lw;
  for (const anim of clips) {
    cols.push({ anim, x });
    x += span(anim) * cw + GAP;
  }
  const titles = M;
  const header = titles + sheets.length * (lh + 4) + 4;
  const top = header + lh + 4;
  const groupH = sheets.length * ch + GAP;
  const c = canvas(x - GAP + M, top + facings.length * groupH, bg);
  const stamp = (text, sx, sy) => {
    const l = labels.get(text);
    if (l) blit(c, l.px, l.w, l.h, sx, sy);
  };
  sheets.forEach((s, r) => stamp(titleOf(s), M, titles + r * (lh + 4)));
  for (const { anim, x: cx } of cols) {
    const owner = sheets.find((s) => s.animations[anim]);
    stamp(headerOf(anim, owner.animations[anim]), cx, header);
  }
  facings.forEach((f, d) => {
    sheets.forEach((s, r) => {
      const y = top + d * groupH + r * ch;
      stamp(s.name, M, y + 2);
      if (r === 0) stamp(f, M, y + 2 + lh);
      const [ox, oy] = off(s);
      for (const { anim, x: cx } of cols) {
        const a = s.animations[anim];
        for (let i = 0; i < span(anim); i++) fill(c, cx + i * cw + 1, y + 1, cw - 2, ch - 2, cells[r === 0 ? 0 : 1]);
        a?.frames[d].forEach((b64, i) => blit(c, at1x(s, b64), w(s), h(s), cx + i * cw + ox, y + oy));
      }
    });
  });
  return c;
}

/**
 * The dark-room strip (FS-1J1CB R10, R12) at zoom `z`: a row per sheet (`sheets`: the floor's
 * class, the class, its looks), each its back-facing (`n`) idle and walk frames at game scale,
 * lit as the world lights them: sprite and floor both multiplied by the run's ambient, the floor
 * the run's darkest ground tone. `floor` and `ambient` are sRGB [r, g, b].
 */
export function composeDarkRoom(sheets, facings, labels, theme, { floor, ambient }, z = 2) {
  const bg = mixRgb(hexRgb(theme.barrowDeep), hexRgb(theme.charcoal), 0.35);
  const lit = (rgb) => rgb.map((v, i) => Math.round((v * ambient[i]) / 255));
  const ground = lit(floor);
  const n = facings.indexOf("n");
  const { cw, ch, off, w, h } = commonCell(sheets);
  const framesOf = (s) => ["idle", "walk"].flatMap((anim) => s.animations[anim]?.frames[n] ?? []);
  const lh = Math.max(18, ...[...labels.values()].map((l) => l.h));
  const cols = Math.max(...sheets.map((s) => framesOf(s).length));
  const rowH = lh + 4 + ch * z + M;
  const c = canvas(M * 2 + cols * cw * z, M + sheets.length * rowH, bg);
  sheets.forEach((s, r) => {
    const y0 = M + r * rowH;
    const l = labels.get(s.name);
    if (l) blit(c, l.px, l.w, l.h, M, y0);
    const [ox, oy] = off(s);
    framesOf(s).forEach((b64, i) => {
      const x = M + i * cw * z;
      const y = y0 + lh + 4;
      fill(c, x, y, cw * z, ch * z, ground);
      // the sprite under the light-map: each texel multiplied by the ambient
      const px = at1x(s, b64);
      for (let o = 0; o < px.length; o += 4) [px[o], px[o + 1], px[o + 2]] = lit([px[o], px[o + 1], px[o + 2]]);
      blit(c, px, w(s), h(s), x + ox * z, y + oy * z, z);
    });
  });
  return c;
}

/** The label texts the contact sheet needs, rendered by the bake page (main.js bakeLabels). */
export function labelTexts(sheets, facings) {
  const texts = new Set(facings);
  for (const s of sheets) {
    texts.add(s.name);
    texts.add(titleOf(s));
    for (const [anim, a] of Object.entries(s.animations)) texts.add(headerOf(anim, a));
  }
  return [...texts];
}

const titleOf = (s) => `${s.name}  ·  ${s.frameWidth}×${s.frameHeight}  ·  ${s.source}`;
const headerOf = (anim, a) => `${anim}  ${a.frames[0].length}f @ ${a.fps}fps${a.loop ? " loop" : ""}`;

function canvas(width, height, bg) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = bg[0];
    rgba[i * 4 + 1] = bg[1];
    rgba[i * 4 + 2] = bg[2];
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, rgba };
}

function fill(c, x0, y0, w, h, col) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const o = (y * c.width + x) * 4;
      c.rgba[o] = col[0];
      c.rgba[o + 1] = col[1];
      c.rgba[o + 2] = col[2];
    }
}

/** Alpha-blends straight RGBA `px` (w × h) at (x0, y0), scaled by `z` (nearest). */
function blit(c, px, w, h, x0, y0, z = 1) {
  for (let y = 0; y < h * z; y++) {
    const sy = Math.floor(y / z);
    const row = (y0 + y) * c.width;
    for (let x = 0; x < w * z; x++) {
      const s = (sy * w + Math.floor(x / z)) * 4;
      const a = px[s + 3];
      if (a === 0) continue;
      const o = (row + x0 + x) * 4;
      const t = a / 255;
      c.rgba[o] = Math.round(px[s] * t + c.rgba[o] * (1 - t));
      c.rgba[o + 1] = Math.round(px[s + 1] * t + c.rgba[o + 1] * (1 - t));
      c.rgba[o + 2] = Math.round(px[s + 2] * t + c.rgba[o + 2] * (1 - t));
    }
  }
}

function layout(sheets, z, labels) {
  const lh = labels.get(sheets[0] ? titleOf(sheets[0]) : "")?.h ?? 18;
  const blocks = [];
  let y = M;
  let width = 0;
  // a character or creature: one block per sheet, a row per facing
  for (const s of sheets.filter((x) => x.directions > 1)) {
    const title = y;
    y += lh + 4;
    const header = y;
    y += lh;
    const cols = [];
    let x = M + LABEL_W;
    for (const [anim, a] of Object.entries(s.animations)) {
      cols.push({ anim, a, x });
      x += a.frames[0].length * s.frameWidth * z + GAP;
    }
    width = Math.max(width, x - GAP + M);
    blocks.push({ s, title, titleX: M, header, top: y, cols });
    y += s.directions * s.frameHeight * z + M * 2;
  }
  // a one-facing sheet (the tower's): blocks flow left to right, wrapping at the widest row
  const wrap = Math.max(width, 1600 * z);
  let x0 = M;
  let rowH = 0;
  for (const s of sheets.filter((x) => x.directions === 1)) {
    const framesW = Object.values(s.animations).reduce((n, a) => n + a.frames[0].length * s.frameWidth * z + GAP, -GAP);
    const w = Math.max(framesW, labels.get(titleOf(s))?.w ?? 0);
    if (x0 > M && x0 + w > wrap) {
      y += rowH;
      x0 = M;
      rowH = 0;
    }
    const cols = [];
    let x = x0;
    for (const [anim, a] of Object.entries(s.animations)) {
      cols.push({ anim, a, x });
      x += a.frames[0].length * s.frameWidth * z + GAP;
    }
    blocks.push({ s, title: y, titleX: x0, header: y + lh + 4, top: y + 2 * lh + 4, cols });
    rowH = Math.max(rowH, 2 * lh + 4 + s.frameHeight * z + M * 2);
    x0 += w + GAP * 2;
    width = Math.max(width, x0 - GAP * 2 + M);
  }
  return { width, height: y + rowH, blocks };
}

/** One contact sheet image for `sheets` at zoom `z`. `theme` is BARROW. */
export function composeContact(sheets, facings, labels, theme, z = 1) {
  const bg = mixRgb(hexRgb(theme.barrowDeep), hexRgb(theme.charcoal), 0.35);
  const cell = mixRgb(bg, hexRgb(theme.barrowBrown), 0.25);
  const { width, height, blocks } = layout(sheets, z, labels);
  const c = canvas(width, height, bg);
  const stamp = (text, x, y) => {
    const l = labels.get(text);
    if (l) blit(c, l.px, l.w, l.h, x, y);
  };
  for (const { s, title, titleX, header, top, cols } of blocks) {
    stamp(titleOf(s), titleX, title);
    for (const { anim, a, x } of cols) {
      stamp(headerOf(anim, a), x, header);
      a.frames.forEach((dir, d) =>
        dir.forEach((b64, i) => {
          const fx = x + i * s.frameWidth * z;
          const fy = top + d * s.frameHeight * z;
          fill(c, fx + 1, fy + 1, s.frameWidth * z - 2, s.frameHeight * z - 2, cell);
          blit(c, Buffer.from(b64, "base64"), s.frameWidth, s.frameHeight, fx, fy, z);
        }),
      );
    }
    if (s.directions > 1) facings.forEach((f, d) => stamp(f, M + 6, top + d * s.frameHeight * z + (s.frameHeight * z) / 2 - 9));
  }
  return c;
}

/** The HTML review page: the committed atlases, framed by the manifest, animated. */
export function reviewHtml(manifest, names, theme) {
  const sheets = Object.fromEntries(names.map((n) => [n, manifest.sheets[n]]));
  // a sheet's own atlas, plus any page an oversized sheet's animation spilled onto (FS-Q14EV §B.7)
  const pagesOf = (s) => [s.atlas, ...Object.values(s.animations).map((a) => a.atlas ?? s.atlas)];
  const atlases = Object.fromEntries(
    [...new Set(names.flatMap((n) => pagesOf(manifest.sheets[n])))].map((k) => [k, `../../../public/art/${manifest.atlases[k].image}`]),
  );
  const data = JSON.stringify({ facings: manifest.facings, sheets, atlases });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Barrowspire character review</title>
<style>
body{margin:0;padding:16px;background:${theme.charcoal};color:${theme.vellum};font:14px/1.4 sans-serif}
h1{font-size:18px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 6px;color:${theme.amber}}
p{margin:0 0 12px;color:${theme.vellumDark}}
table{border-collapse:collapse;margin:0 0 10px}td,th{padding:0 6px 0 0;vertical-align:middle}
th{font-weight:600;text-align:left;color:${theme.vellumDark};font-size:12px}
canvas{background:${theme.umber};display:block}
.z2 canvas{image-rendering:auto}
.scale{display:flex;gap:24px;flex-wrap:wrap}
</style></head><body>
<h1>Character and creature review (FS-2325V §E.7)</h1>
<p>Every class and creature, 8 facings × each animation. Left: game scale (1×). Right: ×2. The
first column plays the clip at its fps. Rows are labelled from the manifest's <code>facings</code>;
se faces the viewer. Regenerated by <code>npm run bake</code>.</p>
<div id="root"></div>
<script>
const D = ${data};
const root = document.getElementById("root");
const imgs = {};
for (const [k, src] of Object.entries(D.atlases)) { imgs[k] = new Image(); imgs[k].src = src; }
function frameCanvas(s, img, pos, zoom) {
  // a sheet baked at 2x (FS-HF0WW) is drawn at half its px, as the game draws it
  const z = zoom / (s.scale || 1);
  const c = document.createElement("canvas");
  c.width = s.frameWidth * z; c.height = s.frameHeight * z;
  // a trimmed frame's cut goes back where it was cut from (lib/trim.mjs)
  const draw = (p) => { const g = c.getContext("2d"); g.clearRect(0, 0, c.width, c.height);
    const t = p.trim || { x: 0, y: 0, w: s.frameWidth, h: s.frameHeight };
    g.drawImage(img, p.x, p.y, t.w, t.h, t.x * z, t.y * z, t.w * z, t.h * z); };
  if (img.complete) draw(pos); else img.addEventListener("load", () => draw(pos));
  c.draw = draw;
  return c;
}
function table(name, s, anim, z) {
  const a = s.animations[anim]; const img = imgs[a.atlas || s.atlas];
  const t = document.createElement("table");
  const head = t.insertRow(); head.innerHTML = "<th></th><th>play</th>" + a.frames[0].map((_, i) => "<th>" + i + "</th>").join("");
  a.frames.forEach((dir, d) => {
    const r = t.insertRow();
    r.insertCell().textContent = D.facings[d];
    const live = frameCanvas(s, img, dir[0], z); r.insertCell().appendChild(live);
    let i = 0;
    setInterval(() => { i = a.loop ? (i + 1) % dir.length : Math.min(dir.length, i + 1) % (dir.length + 4);
      live.draw(dir[Math.min(i, dir.length - 1)]); }, 1000 / (a.fps || 1));
    dir.forEach((p) => r.insertCell().appendChild(frameCanvas(s, img, p, z)));
  });
  return t;
}
for (const [name, s] of Object.entries(D.sheets)) {
  const h = document.createElement("h2"); h.textContent = name + "  ·  " + s.frameWidth + "×" + s.frameHeight + "  ·  " + s.source; root.appendChild(h);
  for (const anim of Object.keys(s.animations)) {
    const a = s.animations[anim];
    const sub = document.createElement("p"); sub.textContent = anim + " — " + a.frames[0].length + " frames @ " + a.fps + " fps" + (a.loop ? ", loops" : ", plays once"); root.appendChild(sub);
    const row = document.createElement("div"); row.className = "scale";
    const z1 = document.createElement("div"); z1.appendChild(table(name, s, anim, 1));
    const z2 = document.createElement("div"); z2.className = "z2"; z2.appendChild(table(name, s, anim, 2));
    row.append(z1, z2); root.appendChild(row);
  }
}
</script></body></html>
`;
}

/** The most RGBA one page of the 1x contact sheet may hold: a quarter of what Node can allocate. */
export const CONTACT_PAGE_BYTES = 2 ** 30;

/** `sheets` split, in order, into runs whose 1x contact sheet stays within CONTACT_PAGE_BYTES. */
export function contactPages(sheets, labels, budget = CONTACT_PAGE_BYTES) {
  const pages = [];
  let page = [];
  const bytes = (set) => {
    const { width, height } = layout(set, 1, labels);
    return width * height * 4;
  };
  for (const s of sheets) {
    if (page.length && bytes([...page, s]) > budget) {
      pages.push(page);
      page = [];
    }
    page.push(s);
  }
  if (page.length) pages.push(page);
  return pages;
}

/**
 * Writes the review set into `dir` (`lineups`: lineupSets of every baked sheet; `looks`: lookSets
 * of every baked sheet, with `darkRoom`: the floor's class sheet and the run's floor and ambient);
 * returns the files written.
 */
export function writeReview({ sheets, facings, labels, manifest, theme, lineups = [], looks = [], darkRoom = null, dir = REVIEW_DIR }) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".gitignore"), "# regenerated by npm run bake for the owner's review; not committed\n*\n!.gitignore\n");
  const files = [];
  contactPages(sheets, labels).forEach((page, i) => {
    const one = composeContact(page, facings, labels, theme, 1);
    const file = i === 0 ? "contact-sheet.png" : `contact-sheet-${i + 1}.png`;
    writeFileSync(join(dir, file), encodePng(one.width, one.height, one.rgba, { fast: true }));
    files.push(file);
  });
  const cast = sheets.filter((s) => s.directions > 1);
  for (const s of cast) {
    const two = composeContact([s], facings, labels, theme, 2);
    const file = `contact-${s.name}-2x.png`;
    writeFileSync(join(dir, file), encodePng(two.width, two.height, two.rgba, { fast: true }));
    files.push(file);
  }
  const tower = sheets.filter((s) => s.group === "tower");
  if (tower.length) {
    const two = composeContact(tower, facings, labels, theme, 2);
    writeFileSync(join(dir, "contact-tower-2x.png"), encodePng(two.width, two.height, two.rgba, { fast: true }));
    files.push("contact-tower-2x.png");
  }
  for (const group of ["spire", "forest", "interior", "building", "hall"]) {
    const set = sheets.filter((s) => s.group === group);
    if (!set.length) continue;
    const two = composeContact(set, facings, labels, theme, 2);
    const file = `contact-${group}-2x.png`;
    writeFileSync(join(dir, file), encodePng(two.width, two.height, two.rgba, { fast: true }));
    files.push(file);
  }
  for (const l of lineups) {
    const two = composeLineup(l.sheets, facings, labels, theme, 2);
    writeFileSync(join(dir, l.file), encodePng(two.width, two.height, two.rgba, { fast: true }));
    files.push(l.file);
  }
  // the spec looks' gate (FS-1J1CB R12): each class's looks beside it, and their backs in the dark
  for (const { stem, base, looks: set } of looks) {
    const one = composeLooks(base, set, facings, labels, theme);
    const file = `contact-looks-${stem}.png`;
    writeFileSync(join(dir, file), encodePng(one.width, one.height, one.rgba, { fast: true }));
    files.push(file);
    if (!darkRoom) continue;
    const strip = composeDarkRoom([...(darkRoom.sheet && darkRoom.sheet !== base ? [darkRoom.sheet] : []), base, ...set], facings, labels, theme, darkRoom);
    const stripFile = `contact-darkroom-${stem}.png`;
    writeFileSync(join(dir, stripFile), encodePng(strip.width, strip.height, strip.rgba, { fast: true }));
    files.push(stripFile);
  }
  writeFileSync(join(dir, "index.html"), reviewHtml(manifest, cast.map((s) => s.name), theme));
  files.push("index.html");
  return files.map((f) => join(dir, f));
}
