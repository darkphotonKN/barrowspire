import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { composeDarkRoom, composeLooks, composeOutline, contactPages, lookSets, outlineTexts, writeReview } from "./contact.mjs";
import { decodePng } from "./png.mjs";

// a creature sheet as the bake hands it to the review: 8 facings, four clips of `n` frames
const sheet = (name, w = 100, h = 100, n = 6) => ({
  name,
  frameWidth: w,
  frameHeight: h,
  directions: 8,
  animations: Object.fromEntries(["idle", "walk", "attack", "death"].map((a) => [a, { fps: 8, loop: false, frames: Array.from({ length: 8 }, () => Array(n).fill("")) }])),
});

describe("the 1x contact sheet's pages (lib/contact.mjs)", () => {
  it("keeps a cast that fits on one page", () => {
    const cast = [sheet("a"), sheet("b")];
    expect(contactPages(cast, new Map())).toEqual([cast]);
  });

  it("runs on to further pages, in order, each within the budget, rather than one image Node cannot allocate", () => {
    const cast = Array.from({ length: 9 }, (_, i) => sheet(`s${i}`));
    // one sheet's block is about 2.5k x 0.85k px at 1x: a budget of three blocks' worth
    const pages = contactPages(cast, new Map(), 3 * 2500 * 900 * 4);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat().map((s) => s.name)).toEqual(cast.map((s) => s.name));
    for (const p of pages) expect(p.length).toBeGreaterThan(0);
  });
});

// A class sheet as the bake hands it over, baked at 1.5x: 8 facings, its frames solid `rgb` inside
// a clear rim two screen px wide, its anchor at the foot. `clips` maps each clip to its frame count.
const SCALE = 1.5;
const FW = 12;
const FH = 12;
const RIM = 3;
const solid = (rgb) => {
  const px = Buffer.alloc(FW * FH * 4);
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (x >= RIM && y >= RIM && x < FW - RIM && y < FH - RIM) px.set([...rgb, 255], (y * FW + x) * 4);
  return px.toString("base64");
};
const classSheet = (name, rgb, clips = { idle: 2, walk: 3 }) => ({
  name,
  frameWidth: FW,
  frameHeight: FH,
  scale: SCALE,
  anchor: { x: 0.5, y: 1 },
  directions: 8,
  source: "authored",
  animations: Object.fromEntries(Object.entries(clips).map(([a, n]) => [a, { fps: 8, loop: true, frames: Array.from({ length: 8 }, () => Array(n).fill(solid(rgb))) }])),
});
const FACINGS = ["e", "se", "s", "sw", "w", "nw", "n", "ne"];
const THEME = { barrowDeep: "#101010", charcoal: "#202020", barrowBrown: "#403020", vellum: "#c0c0c0", pitch: "#000000" };
const at = (c, x, y) => [...c.rgba.subarray((y * c.width + x) * 4, (y * c.width + x) * 4 + 3)];

describe("the spec looks' review (FS-1J1CB R12, lib/contact.mjs)", () => {
  const base = classSheet("char_archer_base", [200, 0, 0]);
  const hunter = classSheet("char_archer_hunter", [0, 200, 0]);
  const shadow = classSheet("char_archer_shadow_ranger", [0, 0, 200], { idle: 2, walk: 3, attack_offhand: 4 });

  it("sets each class with a baked look beside its own sheet, and no other", () => {
    const sets = lookSets([classSheet("char_knight_base", [1, 1, 1]), shadow, base, hunter, sheet("creature_ghoul_base")]);
    expect(sets.map((s) => [s.stem, s.base.name, s.looks.map((l) => l.name)])).toEqual([["archer", "char_archer_base", ["char_archer_hunter", "char_archer_shadow_ranger"]]]);
    expect(lookSets([hunter])).toEqual([]);
  });

  it("lays each look's frame under the class's same frame, every clip × 8 facings, at game scale", () => {
    const c = composeLooks(base, [hunter, shadow], FACINGS, new Map(), THEME);
    // a 12 px frame baked at 1.5x is 8 screen px: a column per frame of each clip, the look's own clips after
    const cell = FW / SCALE;
    const cols = 2 + 3 + 4;
    expect(c.width).toBeGreaterThanOrEqual(cols * cell);
    // find the class's first idle frame in the first facing, then the looks' straight under it
    const red = [];
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (at(c, x, y)[0] > 120 && at(c, x, y)[1] < 60) red.push([x, y]);
    const [x0, y0] = red[0];
    expect(at(c, x0, y0 + cell)[1]).toBeGreaterThan(120);
    expect(at(c, x0, y0 + 2 * cell)[2]).toBeGreaterThan(120);
    // the class's frame once in every facing down that column: eight runs of red
    let runs = 0;
    for (let y = y0; y < c.height; y++) if (at(c, x0, y)[0] > 120 && !(at(c, x0, y - 1)[0] > 120)) runs++;
    expect(runs).toBe(8);
  });

  it("lights the dark-room strip as the world does: sprite and floor under the run's ambient", () => {
    const floor = [100, 80, 60];
    const ambient = [128, 128, 255];
    const c = composeDarkRoom([base, hunter], FACINGS, new Map(), THEME, { floor, ambient }, 1);
    const colours = new Set();
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) colours.add(at(c, x, y).join());
    expect(colours).toContain([50, 40, 60].join());
    // the class's red and the hunter's green, each halved by the ambient's red and green
    expect(colours).toContain([100, 0, 0].join());
    expect(colours).toContain([0, 100, 0].join());
  });

  it("writes each class's looks sheet and dark-room strip with the review", () => {
    const dir = mkdtempSync(join(tmpdir(), "look-review-"));
    const sheets = [base, hunter];
    const manifest = { sheets: {} };
    const files = writeReview({ sheets: [], facings: FACINGS, labels: new Map(), manifest, theme: THEME, looks: lookSets(sheets), darkRoom: { sheet: base, floor: [10, 10, 10], ambient: [200, 200, 200] }, dir });
    expect(files.map((f) => f.slice(dir.length + 1))).toEqual(["contact-looks-archer.png", "contact-darkroom-archer.png", "contact-outline-archer.png", "index.html"]);
    for (const f of files.slice(0, 3)) expect(decodePng(readFileSync(f)).width).toBeGreaterThan(0);
  });
});

describe("the outline strip (FS-1J1CB §Change: Looks v2 R70, lib/contact.mjs)", () => {
  // the strike is attack key 3: each sheet's attack frames solid, its strike frame a clear one
  const withAttack = (name, rgb) => {
    const s = classSheet(name, rgb, { idle: 2, attack: 7 });
    const empty = Buffer.alloc(FW * FH * 4).toString("base64");
    s.animations.attack.frames = s.animations.attack.frames.map((dir) => dir.map((b64, i) => (i === 3 ? solid(rgb) : empty)));
    return s;
  };
  const base = withAttack("char_knight_base", [200, 0, 0]);
  const guardian = withAttack("char_knight_guardian", [0, 200, 0]);
  const berserker = withAttack("char_knight_berserker", [0, 0, 200]);

  it("fills each look, its base and its sibling black on a pale ground, idle and strike × 8 facings, a row each", () => {
    const c = composeOutline(base, [guardian, berserker], FACINGS, new Map(), THEME, 1);
    const black = (x, y) => at(c, x, y).every((v) => v === 0);
    const cell = FW / SCALE;
    // every colour on the strip is the ground, the pale cells or black: no sheet's own colour shows
    const colours = new Set();
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) colours.add(at(c, x, y).join());
    for (const rgb of [[200, 0, 0], [0, 200, 0], [0, 0, 200]]) expect(colours).not.toContain(rgb.join());
    // black runs across the first figure row: idle and strike in each of the 8 facings
    let y = 0;
    while (y < c.height && ![...Array(c.width).keys()].some((x) => black(x, y))) y++;
    let runs = 0;
    for (let x = 1; x < c.width; x++) if (black(x, y + 1) && !black(x - 1, y + 1)) runs++;
    expect(runs).toBe(16);
    // three rows of figures, one per sheet
    let rows = 0;
    const col = [...Array(c.width).keys()].find((x) => black(x, y + 1));
    for (let yy = 1; yy < c.height; yy++) if (black(col, yy) && !black(col, yy - 1)) rows++;
    expect(rows).toBe(3);
    expect(cell).toBe(8);
  });

  it("prints each look's R51 figures under the strip, against its base and its sibling", () => {
    const texts = outlineTexts({ base, looks: [guardian, berserker] }, FACINGS);
    expect(texts).toEqual([
      "char_knight_guardian  ·  outline vs char_knight_base 0.000  ·  vs char_knight_berserker 0.000",
      "char_knight_berserker  ·  outline vs char_knight_base 0.000  ·  vs char_knight_guardian 0.000",
    ]);
  });
});
