// The dark-room floor (FS-1J1CB §B R10): every spec look's back, its `n` idle frame, reads no darker
// than the darkest of today's four class backs. First on fixtures, then on the baked sheets.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { decodePng } from "./png.mjs";
import { CLIENT_ROOT } from "./source.mjs";
import { backLuminance, darkRoom, darkestGround, isLookSheet, relativeLuminance } from "./darkRoom.mjs";

const FACINGS = ["e", "se", "s", "sw", "w", "nw", "n", "ne"];
const W = 4;
const H = 2;

/** The grey whose relative luminance is nearest `l`. */
const greyOf = (l) => {
  let best = 0;
  for (let v = 0; v < 256; v++) if (Math.abs(relativeLuminance(v, v, v) - l) < Math.abs(relativeLuminance(best, best, best) - l)) best = v;
  return best;
};

/**
 * A fixture manifest and its one atlas: each sheet a column of 8 idle frames (one per facing),
 * trimmed, its `n` frame in grey `backs[name]`, every other facing white, and in every frame one
 * clear and one half-covered black pixel the measure must not count.
 */
function fixture(backs) {
  const names = Object.keys(backs);
  const width = names.length * W;
  const height = FACINGS.length * H;
  const rgba = Buffer.alloc(width * height * 4);
  const sheets = {};
  names.forEach((name, col) => {
    const g = greyOf(backs[name]);
    const frames = FACINGS.map((f, d) => {
      const x = col * W;
      const y = d * H;
      for (let py = 0; py < H; py++)
        for (let px = 0; px < W; px++) {
          const o = ((y + py) * width + x + px) * 4;
          const v = f === "n" ? g : 255;
          rgba.set([v, v, v, 255], o);
        }
      rgba.set([0, 0, 0, 0], (y * width + x) * 4);
      rgba.set([0, 0, 0, 128], (y * width + x + 1) * 4);
      return [{ x, y, trim: { x: 1, y: 1, w: W, h: H } }];
    });
    sheets[name] = { atlas: "a", frameWidth: 9, frameHeight: 9, trimmed: true, animations: { idle: { fps: 4, loop: true, frames } } };
  });
  return { manifest: { facings: FACINGS, atlases: { a: { image: "a.png", width, height } }, sheets }, atlas: () => ({ width, height, rgba }) };
}

const BASES = { char_knight_base: 0.2, char_archer_base: 0.1, char_wizard_base: 0.3, char_mercenary_base: 0.25 };

describe("the dark-room floor (lib/darkRoom.mjs)", () => {
  it("measures a sheet's back: the opaque pixels of its n idle frame", () => {
    const { manifest, atlas } = fixture({ ...BASES, char_archer_shadow_ranger: 0.08 });
    expect(backLuminance(manifest, "char_archer_shadow_ranger", atlas)).toBeCloseTo(relativeLuminance(80, 80, 80), 6);
  });

  it("takes its floor from the darkest of the four class backs", () => {
    const { manifest, atlas } = fixture(BASES);
    const room = darkRoom(manifest, atlas);
    expect(room.darkest).toBe("char_archer_base");
    expect(room.floor).toBeCloseTo(relativeLuminance(89, 89, 89), 6);
    expect(room.failures).toEqual([]);
  });

  it("fails a look whose back is darker than the floor, naming it", () => {
    const { manifest, atlas } = fixture({ ...BASES, char_archer_shadow_ranger: 0.08, char_knight_guardian: 0.4 });
    const room = darkRoom(manifest, atlas);
    expect(room.looks.map((l) => l.sheet)).toEqual(["char_archer_shadow_ranger", "char_knight_guardian"]);
    expect(room.failures.map((l) => l.sheet)).toEqual(["char_archer_shadow_ranger"]);
  });

  it("passes a look whose back holds the floor", () => {
    const { manifest, atlas } = fixture({ ...BASES, char_archer_shadow_ranger: 0.11 });
    expect(darkRoom(manifest, atlas).failures).toEqual([]);
  });

  it("refuses to judge without all four class backs", () => {
    const { char_wizard_base: _, ...three } = BASES;
    const { manifest, atlas } = fixture(three);
    expect(() => darkRoom(manifest, atlas)).toThrow(/char_wizard_base/);
  });

  it("knows a spec look's sheet by its name (R15), never a class's own or a creature's", () => {
    expect(isLookSheet("char_knight_guardian")).toBe(true);
    expect(isLookSheet("char_archer_shadow_ranger")).toBe(true);
    expect(isLookSheet("char_knight_base")).toBe(false);
    expect(isLookSheet("creature_ghoul_base")).toBe(false);
    expect(isLookSheet("char_folk_base")).toBe(false);
  });
});

describe("the dark-room strip's floor (FS-1J1CB R12)", () => {
  it("is the darkest baked ground tone, by luminance", () => {
    const sheets = { ground_a: { mean: { r: 90, g: 90, b: 90 } }, ground_b: { mean: { r: 60, g: 50, b: 40 } }, char_knight_base: {} };
    expect(darkestGround({ sheets })).toEqual({ name: "ground_b", rgb: [60, 50, 40] });
  });
});

describe("the baked looks hold the dark-room floor (FS-1J1CB R10)", () => {
  const ART = join(CLIENT_ROOT, "public", "art");
  const manifest = JSON.parse(readFileSync(join(ART, "manifest.json"), "utf8"));
  const pages = new Map();
  const atlas = (key) => {
    if (!pages.has(key)) pages.set(key, decodePng(readFileSync(join(ART, manifest.atlases[key].image))));
    return pages.get(key);
  };

  it("holds every char_<class>_<spec> sheet's back at or above the darkest class back", () => {
    for (const s of ["char_knight_base", "char_archer_base", "char_wizard_base", "char_mercenary_base"]) expect(existsSync(join(ART, manifest.atlases[manifest.sheets[s].atlas].image))).toBe(true);
    const room = darkRoom(manifest, atlas);
    expect(room.floor).toBeGreaterThan(0);
    expect(room.failures, `floor ${room.floor.toFixed(4)} (${room.darkest})`).toEqual([]);
  });
});
