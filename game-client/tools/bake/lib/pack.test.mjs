import { describe, it, expect } from "vitest";
import { packAtlases, MAX_SIZE } from "./pack.mjs";

const sheet = (name, group, w, h, n) => ({ name, group, frameWidth: w, frameHeight: h, frameCount: n });

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("packAtlases", () => {
  it("packs each group onto its own page, never overlapping, within the page", () => {
    const sheets = [
      sheet("tree", "nature", 200, 230, 2),
      sheet("rock", "nature", 110, 70, 3),
      sheet("door", "props", 130, 140, 3),
    ];
    const pages = packAtlases(sheets);
    expect(pages.map((p) => p.key)).toEqual(["nature-0", "props-0"]);
    for (const p of pages) {
      const rects = Object.entries(p.placements).flatMap(([name, spots]) => {
        const s = sheets.find((x) => x.name === name);
        return spots.map((o) => ({ ...o, w: s.frameWidth, h: s.frameHeight }));
      });
      for (const r of rects) {
        expect(r.x + r.w).toBeLessThanOrEqual(p.width);
        expect(r.y + r.h).toBeLessThanOrEqual(p.height);
      }
      rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)));
    }
  });

  it("is deterministic: the same catalogue packs identically", () => {
    const sheets = [sheet("a", "g", 50, 60, 4), sheet("b", "g", 50, 60, 1), sheet("c", "g", 70, 20, 2)];
    expect(packAtlases(sheets)).toEqual(packAtlases([...sheets].reverse()));
  });

  it("spills onto a second page rather than exceed the size limit", () => {
    const sheets = Array.from({ length: 12 }, (_, i) => sheet(`s${i}`, "g", 1000, 1000, 2));
    const pages = packAtlases(sheets);
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) {
      expect(p.width).toBeLessThanOrEqual(MAX_SIZE);
      expect(p.height).toBeLessThanOrEqual(MAX_SIZE);
    }
  });

  it("widens a page for a sheet too tall to fit at the default width, rather than fail", () => {
    // a character: 224 frames of 222x197 is 25 rows at 2048 wide, taller than 4096
    const sheets = [sheet("troll", "creatures", 222, 197, 224), sheet("ghoul", "creatures", 128, 129, 224)];
    const pages = packAtlases(sheets);
    for (const p of pages) {
      expect(p.width).toBeLessThanOrEqual(MAX_SIZE);
      expect(p.height).toBeLessThanOrEqual(MAX_SIZE);
    }
    const troll = pages.flatMap((p) => p.placements.troll ?? []);
    expect(troll).toHaveLength(224);
    const page = pages.find((p) => p.placements.troll);
    for (const o of troll) {
      expect(o.x + 222).toBeLessThanOrEqual(page.width);
      expect(o.y + 197).toBeLessThanOrEqual(page.height);
    }
  });

  describe("a sheet larger than one page (FS-Q14EV §B.7)", () => {
    const anims = [
      ["idle", 48],
      ["walk", 64],
      ["attack", 88],
      ["death", 64],
    ];
    const boss = {
      ...sheet("demon", "boss", 400, 330, 264),
      animations: anims.map(([name, frameCount]) => ({ name, frameCount })),
    };

    it("places it one animation per block, each animation whole on one page, over as many pages as it needs", () => {
      const pages = packAtlases([boss]);
      expect(pages.length).toBeGreaterThan(1);
      const pageOf = {};
      for (const p of pages) {
        expect(p.placements.demon).toBeUndefined();
        const rects = [];
        for (const [anim, spots] of Object.entries(p.parts.demon ?? {})) {
          expect(pageOf[anim], anim).toBeUndefined();
          pageOf[anim] = p.key;
          expect(spots).toHaveLength(anims.find(([n]) => n === anim)[1]);
          for (const o of spots) {
            expect(o.x + 400).toBeLessThanOrEqual(p.width);
            expect(o.y + 330).toBeLessThanOrEqual(p.height);
            rects.push({ ...o, w: 400, h: 330 });
          }
        }
        rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)));
        expect(p.width).toBeLessThanOrEqual(MAX_SIZE);
        expect(p.height).toBeLessThanOrEqual(MAX_SIZE);
        expect(p.key.startsWith("boss-")).toBe(true);
      }
      expect(Object.keys(pageOf).sort()).toEqual(anims.map(([n]) => n).sort());
    });

    it("lets its animations share a page where they fit, rather than one page each", () => {
      const pages = packAtlases([boss]);
      expect(pages.length).toBeLessThan(anims.length);
      expect(pages.some((p) => Object.keys(p.parts.demon ?? {}).length > 1)).toBe(true);
    });

    it("keeps a sheet that fits one page whole, with no parts, whether or not it lists its animations", () => {
      const small = { ...sheet("ghoul", "creatures", 124, 125, 224), animations: [{ name: "idle", frameCount: 224 }] };
      const [page] = packAtlases([small]);
      expect(page.placements.ghoul).toHaveLength(224);
      expect(page.parts).toEqual({});
    });

    it("leaves the other sheets of its group where they would be without it", () => {
      const others = [sheet("a", "creatures", 216, 191, 224), sheet("b", "creatures", 124, 125, 224)];
      const alone = packAtlases(others);
      const withBoss = packAtlases([...others, { ...boss, group: "boss" }]);
      expect(withBoss.filter((p) => p.group === "creatures")).toEqual(alone);
    });

    it("still throws for one animation too large for a page on its own", () => {
      const huge = { ...sheet("titan", "boss", 900, 900, 40), animations: [{ name: "idle", frameCount: 40 }] };
      expect(() => packAtlases([huge])).toThrow(/titan.*idle/);
    });

    it("packs it identically every time", () => {
      expect(packAtlases([boss])).toEqual(packAtlases([boss]));
    });
  });
});

describe("a trimmed sheet (spike/archer-2x, lib/trim.mjs)", () => {
  // frames cut to their pixels: each its own size, none larger than the 160 x 140 frame
  const sizes = (n, seed = 1) =>
    Array.from({ length: n }, (_, i) => ({ w: 40 + ((i * 37 + seed * 11) % 120), h: 50 + ((i * 53 + seed * 7) % 90) }));
  const trimmed = (name, group, frames, animations) => ({
    ...sheet(name, group, 160, 140, frames.length),
    frames,
    ...(animations ? { animations } : {}),
  });
  const rectsOf = (page, s) =>
    Object.entries(page.placements)
      .filter(([name]) => name === s.name)
      .flatMap(([, spots]) => spots.map((o, i) => ({ ...o, w: s.frames[i].w, h: s.frames[i].h })));

  it("packs each frame at its own size, within the page, never overlapping, PAD apart", () => {
    const s = trimmed("archer", "archer", sizes(80));
    const [page, more] = packAtlases([s]);
    expect(more).toBeUndefined();
    const rects = rectsOf(page, s);
    expect(rects).toHaveLength(80);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(2);
      expect(r.y).toBeGreaterThanOrEqual(2);
      expect(r.x + r.w).toBeLessThanOrEqual(page.width);
      expect(r.y + r.h).toBeLessThanOrEqual(page.height);
    }
    // grown by the padding, no two frames touch: the packer keeps PAD (2) between them
    const grown = rects.map((r) => ({ x: r.x, y: r.y, w: r.w + 2, h: r.h + 2 }));
    grown.forEach((a, i) => grown.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)));
  });

  it("needs a smaller page than the same frames uncut", () => {
    const cut = trimmed("archer", "archer", sizes(80));
    const whole = sheet("archer", "archer", 160, 140, 80);
    const area = (pages) => pages.reduce((n, p) => n + p.width * p.height, 0);
    expect(area(packAtlases([cut]))).toBeLessThan(area(packAtlases([whole])) * 0.75);
  });

  it("packs identically every time", () => {
    const s = trimmed("archer", "archer", sizes(60));
    expect(packAtlases([s])).toEqual(packAtlases([structuredClone(s)]));
  });

  it("splits by animation when the cut frames cannot fit one page, each animation whole on one page", () => {
    const frames = Array.from({ length: 4 * 120 }, () => ({ w: 300, h: 260 }));
    const anims = ["idle", "walk", "attack", "death"].map((name) => ({ name, frameCount: 120 }));
    const s = trimmed("big", "big", frames, anims);
    s.frameWidth = 320;
    s.frameHeight = 280;
    const pages = packAtlases([s]);
    expect(pages.length).toBeGreaterThan(1);
    const seen = {};
    for (const p of pages) {
      expect(p.placements.big).toBeUndefined();
      expect(p.width).toBeLessThanOrEqual(MAX_SIZE);
      expect(p.height).toBeLessThanOrEqual(MAX_SIZE);
      for (const [anim, spots] of Object.entries(p.parts.big ?? {})) {
        expect(seen[anim]).toBeUndefined();
        seen[anim] = p.key;
        expect(spots).toHaveLength(120);
        for (const o of spots) {
          expect(o.x + 300).toBeLessThanOrEqual(p.width);
          expect(o.y + 260).toBeLessThanOrEqual(p.height);
        }
      }
    }
    expect(Object.keys(seen).sort()).toEqual(["attack", "death", "idle", "walk"]);
  });

  it("leaves every other group's pages as they were", () => {
    const others = [sheet("a", "creatures", 216, 191, 224), sheet("b", "creatures", 124, 125, 224)];
    const withArcher = packAtlases([...others, trimmed("archer", "archer", sizes(80))]);
    expect(withArcher.filter((p) => p.group === "creatures")).toEqual(packAtlases(others));
  });

  it("refuses frame sizes that do not match the frame count", () => {
    const s = { ...trimmed("archer", "archer", sizes(5)), frameCount: 6 };
    expect(() => packAtlases([s])).toThrow(/archer.*5 frame sizes for 6/);
  });
});
