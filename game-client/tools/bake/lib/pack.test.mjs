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
