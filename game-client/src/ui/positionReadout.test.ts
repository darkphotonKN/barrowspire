import { afterEach, describe, expect, it, vi } from "vitest";
import { contrastRatio } from "@/render/lighting/lighting";
import { RegionGrid, type DungeonMap } from "@/render/world/dungeon";
import fixture from "@/render/world/dungeon.fixture.json";
import { mix, palette } from "@/utils/canvasPalette";
import { MINIMAP, MINIMAP_VIGNETTE, minimapPanel, minimapProjection, minimapRect } from "./minimap";
import { POSITION_READOUT, positionReadoutPlace, showsPositionReadout } from "./positionReadout";

describe("showsPositionReadout", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    { nodeEnv: "development", shown: true },
    { nodeEnv: "test", shown: true },
    { nodeEnv: "production", shown: false },
  ])("is $shown when NODE_ENV is $nodeEnv and nothing overrides it", ({ nodeEnv, shown }) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("NEXT_PUBLIC_SHOW_POSITION_READOUT", "");
    expect(showsPositionReadout()).toBe(shown);
  });

  it.each([
    { nodeEnv: "production", override: "true", shown: true },
    { nodeEnv: "production", override: "1", shown: true },
    { nodeEnv: "production", override: " TRUE ", shown: true },
    { nodeEnv: "development", override: "false", shown: false },
    { nodeEnv: "development", override: "0", shown: false },
  ])(
    "follows NEXT_PUBLIC_SHOW_POSITION_READOUT=$override over NODE_ENV=$nodeEnv",
    ({ nodeEnv, override, shown }) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      vi.stubEnv("NEXT_PUBLIC_SHOW_POSITION_READOUT", override);
      expect(showsPositionReadout()).toBe(shown);
    },
  );

  it.each(["yes", "on", "maybe"])("ignores an unrecognised override %j", (override) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SHOW_POSITION_READOUT", override);
    expect(showsPositionReadout()).toBe(false);
  });
});

describe("the position readout's look and place (FS-56CKV §C)", () => {
  /** The widest line it shows on a floor with a minimap (§C.17). */
  const WIDEST = "X: 5760 Y: 3840";
  /**
   * A generous bound on a line's box at the readout's size, as Phaser measures one: no glyph of the
   * HUD face is wider than 0.6 em on average over a line of digits, capitals and colons, and its
   * ascent and descent come under 1.5 em. No canvas here to measure with, so the bound stands in.
   */
  const boxOf = (text: string) => {
    const px = parseInt(POSITION_READOUT.fontSize, 10);
    return { width: text.length * px * 0.6, height: px * 1.5 };
  };

  it("should hold its look as named values: 10 px, no backing, a HUD text token at a partial alpha, over the minimap's depth (§C.15, §C.16)", () => {
    expect(POSITION_READOUT.fontSize).toBe("10px");
    expect(POSITION_READOUT.colour).toBe(palette.hudText);
    expect(POSITION_READOUT.alpha).toBeGreaterThan(0);
    expect(POSITION_READOUT.alpha).toBeLessThan(1);
    expect(POSITION_READOUT.depth).toBeGreaterThan(MINIMAP.depth);
    expect(POSITION_READOUT.inset).toBe(MINIMAP.inset);
    expect(POSITION_READOUT.gap).toBe(4);
  });

  it("should keep its ink at 3:1 or better over the backing however dark the vignette makes it, out to the vignette's darkest, its corner (§C.15)", () => {
    // where two of the vignette's bands meet at the rim, each at its edge alpha, it is at its darkest
    const darkest = 1 - (1 - MINIMAP_VIGNETTE.edgeAlpha) ** 2;
    for (let t = 0; t <= darkest + 1e-9; t += 0.01) {
      const backing = mix(palette.hudPanel, palette.inkDeep, Math.min(t, darkest));
      const ink = mix(backing, POSITION_READOUT.colour, POSITION_READOUT.alpha);
      expect(contrastRatio(ink, backing)).toBeGreaterThanOrEqual(3);
    }
  });

  // FS-56CKV §Change: Map mode icon, D8: out of the icon's way, in the map's top-right corner
  it("should stand inside a shown minimap, its right and top edges 4 px in from the panel's (§Change: Map mode icon, D8)", () => {
    expect(positionReadoutPlace(minimapRect(1070, 44), { right: 1070, bottom: 204 })).toEqual({
      x: 1066,
      y: 48,
      origin: { x: 1, y: 0 },
    });
  });

  it("should stand 4 px under the column's last line, right-aligned on the column's x, with no minimap shown (§C.18)", () => {
    expect(positionReadoutPlace(null, { right: 1070, bottom: 92 })).toEqual({ x: 1070, y: 96, origin: { x: 1, y: 0 } });
  });

  it("should stand on whole logical px", () => {
    const place = positionReadoutPlace(null, { right: 1069.6, bottom: 91.6 });
    expect([place.x, place.y]).toEqual([1070, 96]);
    const inside = positionReadoutPlace({ x: 853.6, y: 43.6, width: 216, height: 108 }, { right: 0, bottom: 0 });
    expect([inside.x, inside.y]).toEqual([1066, 48]);
  });

  // §Change: Map mode icon, D8: the diamond is symmetric about its centre, so the panel's top-right
  // corner is as empty as its bottom-left, where the readout stood before (§C.17)
  it("should lie, at its widest text, above floor 1's diamond's upper-right edge, so it covers no floor (§C.17; §Change: Map mode icon, D8)", () => {
    const grid = new RegionGrid(fixture as DungeonMap);
    const project = minimapProjection(grid);
    const [w, h] = [grid.cols * grid.cell, grid.rows * grid.cell];
    const corners = [project({ x: 0, y: 0 }), project({ x: w, y: 0 }), project({ x: w, y: h }), project({ x: 0, y: h })];
    const top = corners.reduce((a, b) => (b.y < a.y ? b : a));
    const right = corners.reduce((a, b) => (b.x > a.x ? b : a));
    // the top vertex at (88, 4), the right at (208, 64): the left (8, 44) and bottom (128, 104) turned about the middle
    expect([top, right].map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([[88, 4], [208, 64]]);
    // the readout in the panel's own px: its top-right at its place less the panel's top-left
    const panel = minimapRect(MINIMAP.width, 0);
    const at = positionReadoutPlace(panel, { right: 0, bottom: 0 });
    const box = boxOf(WIDEST);
    const [x0, x1, bottom] = [at.x - panel.x - box.width, at.x - panel.x, at.y - panel.y + box.height];
    // the edge's y over the box's span; the box's bottom is above it all the way across
    const edgeY = (x: number) => top.y + ((x - top.x) * (right.y - top.y)) / (right.x - top.x);
    expect(x0).toBeGreaterThan(top.x);
    expect(x1).toBeLessThanOrEqual(panel.width);
    expect(bottom).toBeLessThan(Math.min(edgeY(x0), edgeY(x1)));
  });

  // FS-1SEF0 §B.11: in the enlarged minimap's corner, at its own 10 px, it still covers no floor
  it("should lie above floor 1's diamond's upper-right edge in the enlarged minimap too (FS-1SEF0 §B.11; §Change: Map mode icon, D8)", () => {
    const grid = new RegionGrid(fixture as DungeonMap);
    const look = minimapPanel("enlarged");
    const project = minimapProjection(grid, look);
    const [w] = [grid.cols * grid.cell];
    const top = project({ x: 0, y: 0 });
    const right = project({ x: w, y: 0 });
    const panel = minimapRect(look.width, 0, look);
    const at = positionReadoutPlace(panel, { right: 0, bottom: 0 });
    expect([at.x, at.y]).toEqual([320, 4]);
    const box = boxOf(WIDEST);
    const [x0, x1, bottom] = [at.x - panel.x - box.width, at.x - panel.x, at.y - panel.y + box.height];
    const edgeY = (x: number) => top.y + ((x - top.x) * (right.y - top.y)) / (right.x - top.x);
    expect(x0).toBeGreaterThan(top.x);
    expect(bottom).toBeLessThan(Math.min(edgeY(x0), edgeY(x1)));
  });
});
