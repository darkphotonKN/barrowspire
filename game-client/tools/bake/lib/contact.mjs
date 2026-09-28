// The owner's review of character art (ADR-0021 §5, FS-2325V §E.7): every class and creature ×
// 8 directions × each animation, at game scale (1×) and zoomed ×2.
//
// Written to tools/bake/review/ (gitignored) on every `npm run bake`, never by --check:
//   contact-sheet.png          all sheets at 1×, labelled
//   contact-<sheet>-2x.png     each sheet at ×2 (nearest-neighbour, to inspect pixels)
//   index.html                 the same from the baked atlases themselves, labelled from the
//                              manifest's `facings`, with each clip playing at its fps
// The HTML reads the committed atlases, so it also proves the manifest's frame order.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodePng } from "./png.mjs";
import { CLIENT_ROOT } from "./source.mjs";

export const REVIEW_DIR = join(CLIENT_ROOT, "tools", "bake", "review");

const M = 16; // margin
const LABEL_W = 44; // facing-name column
const GAP = 18; // between animations

const hexRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/** The label texts the contact sheet needs, rendered by the bake page (main.js bakeLabels). */
export function labelTexts(sheets, facings) {
  const texts = new Set(facings);
  for (const s of sheets) {
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
  for (const s of sheets) {
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
    blocks.push({ s, title, header, top: y, cols });
    y += s.directions * s.frameHeight * z + M * 2;
  }
  return { width, height: y, blocks };
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
  for (const { s, title, header, top, cols } of blocks) {
    stamp(titleOf(s), M, title);
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
    facings.forEach((f, d) => stamp(f, M + 6, top + d * s.frameHeight * z + (s.frameHeight * z) / 2 - 9));
  }
  return c;
}

/** The HTML review page: the committed atlases, framed by the manifest, animated. */
export function reviewHtml(manifest, names, theme) {
  const sheets = Object.fromEntries(names.map((n) => [n, manifest.sheets[n]]));
  const atlases = Object.fromEntries(
    [...new Set(names.map((n) => manifest.sheets[n].atlas))].map((k) => [k, `../../../public/art/${manifest.atlases[k].image}`]),
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
function frameCanvas(s, img, pos, z) {
  const c = document.createElement("canvas");
  c.width = s.frameWidth * z; c.height = s.frameHeight * z;
  const draw = (p) => { const g = c.getContext("2d"); g.clearRect(0, 0, c.width, c.height);
    g.drawImage(img, p.x, p.y, s.frameWidth, s.frameHeight, 0, 0, c.width, c.height); };
  if (img.complete) draw(pos); else img.addEventListener("load", () => draw(pos));
  c.draw = draw;
  return c;
}
function table(name, s, anim, z) {
  const a = s.animations[anim]; const img = imgs[s.atlas];
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

/** Writes the review set; returns the files written. */
export function writeReview({ sheets, facings, labels, manifest, theme }) {
  mkdirSync(REVIEW_DIR, { recursive: true });
  writeFileSync(join(REVIEW_DIR, ".gitignore"), "# regenerated by npm run bake for the owner's review; not committed\n*\n!.gitignore\n");
  const files = [];
  const one = composeContact(sheets, facings, labels, theme, 1);
  writeFileSync(join(REVIEW_DIR, "contact-sheet.png"), encodePng(one.width, one.height, one.rgba, { fast: true }));
  files.push("contact-sheet.png");
  for (const s of sheets) {
    const two = composeContact([s], facings, labels, theme, 2);
    const file = `contact-${s.name}-2x.png`;
    writeFileSync(join(REVIEW_DIR, file), encodePng(two.width, two.height, two.rgba, { fast: true }));
    files.push(file);
  }
  writeFileSync(join(REVIEW_DIR, "index.html"), reviewHtml(manifest, sheets.map((s) => s.name), theme));
  files.push("index.html");
  return files.map((f) => join(REVIEW_DIR, f));
}
