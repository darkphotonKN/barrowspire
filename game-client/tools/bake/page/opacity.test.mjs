import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { applyOpacity } from "./opacity.js";
import { decodePng } from "../lib/png.mjs";

/** One straight-RGBA pixel per entry. */
const px = (...pixels) => new Uint8ClampedArray(pixels.flat());

describe("applyOpacity (a translucent creature's baked alpha, FS-3QHQZ §C R29)", () => {
  it("scales a covered pixel's alpha by the opacity pass's value there", () => {
    const out = applyOpacity(px([200, 210, 220, 255]), px([153, 153, 153, 255]), { floor: 0.5 });
    expect([...out]).toEqual([200, 210, 220, 153]);
  });

  it("keeps a fully opaque part (the eyes) at full alpha", () => {
    const out = applyOpacity(px([190, 40, 30, 255]), px([255, 255, 255, 255]), { floor: 0.5 });
    expect(out[3]).toBe(255);
  });

  it("fades a part whose opacity pass is dark to nothing", () => {
    const out = applyOpacity(px([120, 120, 120, 255]), px([0, 0, 0, 255]), { floor: 0.5 });
    expect(out[3]).toBe(0);
  });

  it("gives a pixel no part covers (the ground shadow) the floor opacity", () => {
    const out = applyOpacity(px([0, 0, 0, 100]), px([0, 0, 0, 0]), { floor: 0.5 });
    expect(out[3]).toBe(50);
  });

  it("blends toward the floor at a part's anti-aliased edge", () => {
    const out = applyOpacity(px([90, 90, 90, 200]), px([255, 255, 255, 128]), { floor: 0 });
    expect(out[3]).toBe(Math.round((200 * 128) / 255));
  });

  it("never changes a colour or an empty pixel", () => {
    const full = px([10, 20, 30, 255], [0, 0, 0, 0]);
    const out = applyOpacity(full, px([100, 100, 100, 255], [200, 200, 200, 255]), { floor: 0.5 });
    expect([...out.slice(0, 3)]).toEqual([10, 20, 30]);
    expect([...out.slice(4)]).toEqual([0, 0, 0, 0]);
  });

  it("refuses passes of different sizes", () => {
    expect(() => applyOpacity(px([0, 0, 0, 0]), px([0, 0, 0, 0], [0, 0, 0, 0]))).toThrow();
  });
});

// The baked sheet itself (FS-3QHQZ §C R29): the ghost's body is translucent, its eyes are not.
describe("the baked ghost", () => {
  const ART = join(dirname(fileURLToPath(import.meta.url)), "../../../public/art");
  const manifest = JSON.parse(readFileSync(join(ART, "manifest.json"), "utf8"));
  const pages = new Map();
  /** Every pixel of one clip's frames in one facing, as straight RGBA. */
  const pixels = (sheet, anim, facing) => {
    const s = manifest.sheets[sheet];
    const key = s.animations[anim].atlas ?? s.atlas;
    if (!pages.has(key)) pages.set(key, decodePng(readFileSync(join(ART, manifest.atlases[key].image))));
    const page = pages.get(key);
    const d = manifest.facings.indexOf(facing);
    const out = [];
    for (const { x, y } of s.animations[anim].frames[d])
      for (let row = 0; row < s.frameHeight; row++)
        for (let col = 0; col < s.frameWidth; col++) {
          const i = ((y + row) * page.width + x + col) * 4;
          out.push([page.rgba[i], page.rgba[i + 1], page.rgba[i + 2], page.rgba[i + 3]]);
        }
    return out;
  };
  /** Ember red: the hostile eye, red well above green and blue. */
  const ember = ([r, g, b]) => r > 1.5 * g && r > 1.5 * b;
  const ALPHA = Math.round(0.6 * 255);

  it("bakes the ghost's body at about 0.6 alpha, never more, except at the eyes", () => {
    const s = manifest.sheets.creature_ghost_base;
    const [w, h] = [s.frameWidth, s.frameHeight];
    const px = pixels("creature_ghost_base", "idle", "se");
    const body = px.filter(([, , , a]) => Math.abs(a - ALPHA) <= 3);
    expect(body.length).toBeGreaterThan(300);
    // an eye's rim blends the opaque eye with the body around it: within 2 px of an ember pixel
    const solid = [];
    for (let f = 0; f * w * h < px.length; f++) {
      const at = (x, y) => px[f * w * h + y * w + x];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (at(x, y)[3] <= ALPHA + 8) continue;
          let nearEye = false;
          for (let dy = -2; dy <= 2 && !nearEye; dy++)
            for (let dx = -2; dx <= 2 && !nearEye; dx++) {
              const q = x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h ? at(x + dx, y + dy) : null;
              nearEye = q !== null && q[3] > ALPHA && ember(q);
            }
          if (!nearEye) solid.push([f, x, y, ...at(x, y)]);
        }
    }
    expect(solid).toEqual([]);
  });

  it("keeps the ghost's eyes opaque", () => {
    const eyes = pixels("creature_ghost_base", "idle", "se").filter((p) => p[3] >= 230 && ember(p));
    expect(eyes.length).toBeGreaterThan(0);
  });

  it("leaves the zombie opaque", () => {
    const px = pixels("creature_zombie_base", "idle", "se");
    expect(px.filter(([, , , a]) => a === 255).length).toBeGreaterThan(500);
  });

  it("fades the ghost out entirely by the last frame of its death", () => {
    const s = manifest.sheets.creature_ghost_base;
    const last = s.animations.death.frames[0].length - 1;
    const px = pixels("creature_ghost_base", "death", "se");
    const frame = px.slice(last * s.frameWidth * s.frameHeight);
    expect(frame.filter(([, , , a]) => a > 8)).toEqual([]);
  });
});
