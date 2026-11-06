import { describe, expect, it } from "vitest";
import { FULLSCREEN_BUTTON } from "@/render/viewport";
import { BAG_CAPACITY } from "./bag";
import {
  BAG_COLUMNS,
  BAG_ROWS,
  gearPanelLayout,
  HINT_H,
  itemTipRow,
  overlayLayout,
  overPanel,
  PANEL_PAD,
  rowWindow,
  STASH_COLUMNS,
  STASH_ROWS,
  stashPanelLayout,
  statsPanelArea,
} from "./gearOverlayLayout";
import { STASH_CAPACITY } from "./stash";

const SIZES: [number, number][] = [
  [1080, 720],
  [1920, 1080],
  [800, 500],
  [640, 400],
];

describe("overlayLayout (FS-HRH2J R2: two mirrored edge panels, a clear middle band)", () => {
  it.each(SIZES)(
    "should anchor a panel to each side edge at %ix%i, mirrored in size",
    (w, h) => {
      const { left, right } = overlayLayout(w, h);
      expect(left.x).toBeLessThanOrEqual(12);
      expect(w - (right.x + right.w)).toBe(left.x);
      expect(right.w).toBe(left.w);
      expect(right.h).toBe(left.h);
      expect(right.y).toBe(left.y);
    },
  );

  it.each(SIZES)(
    "should leave a clear band of 20–30%% of the width in the middle at %ix%i",
    (w, h) => {
      const { left, right, band } = overlayLayout(w, h);
      const clear = right.x - (left.x + left.w);
      expect(clear / w).toBeGreaterThanOrEqual(0.2);
      expect(clear / w).toBeLessThanOrEqual(0.3);
      expect(band).toEqual({ x: left.x + left.w, w: clear });
    },
  );

  it.each(SIZES)(
    "should stand about 95%% of the height with a small gap at the top at %ix%i",
    (w, h) => {
      const { left } = overlayLayout(w, h);
      expect(left.y).toBeGreaterThan(0);
      expect(left.y / h).toBeLessThanOrEqual(0.06);
      expect(left.h / h).toBeGreaterThanOrEqual(0.9);
      expect(left.y + left.h).toBeLessThanOrEqual(h);
    },
  );
});

describe("overPanel (FS-HRH2J R8: a press over a panel is the overlay's)", () => {
  const layout = overlayLayout(1080, 720);
  const { left, right, band } = layout;

  it.each([
    ["inside the left panel", left.x + 20, left.y + 20, true],
    [
      "inside the right panel",
      right.x + right.w - 20,
      right.y + right.h - 20,
      true,
    ],
    ["in the clear middle band", band.x + band.w / 2, 360, false],
    ["in the top gap above a panel", left.x + 20, left.y / 2, false],
  ])("should say a point %s is %s", (_, x, y, over) => {
    expect(overPanel(layout, x, y)).toBe(over);
  });
});

describe("the bag grid (FS-HRH2J R14)", () => {
  it("should be 6 columns by 5 rows: 30 cells, the bag's capacity", () => {
    expect(BAG_COLUMNS).toBe(6);
    expect(BAG_ROWS).toBe(5);
    expect(BAG_COLUMNS * BAG_ROWS).toBe(BAG_CAPACITY);
  });
});

describe("gearPanelLayout (FS-HRH2J R13–14, R23; edge state Small window)", () => {
  const right = overlayLayout(1080, 720).right;
  const inside = (r: { x: number; y: number; w: number; h: number }) =>
    r.x >= right.x &&
    r.y >= right.y &&
    r.x + r.w <= right.x + right.w &&
    r.y + r.h <= right.y + right.h;

  it("should lay ten gear slots above a 6×5 grid of bag cells, all inside the panel", () => {
    const layout = gearPanelLayout(right, 0);
    expect(Object.keys(layout.slots)).toHaveLength(10);
    expect(layout.cells).toHaveLength(30);
    for (const r of [
      ...Object.values(layout.slots),
      ...layout.cells.map((c) => c.rect),
    ])
      expect(inside(r)).toBe(true);
    const lowestSlot = Math.max(
      ...Object.values(layout.slots).map((s) => s.y + s.h),
    );
    expect(Math.min(...layout.cells.map((c) => c.rect.y))).toBeGreaterThan(
      lowestSlot,
    );
  });

  it("should fill cells left to right, top to bottom, in bag order", () => {
    const { cells } = gearPanelLayout(right, 7);
    expect(cells.slice(0, 7).map((c) => c.index)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(cells[1].rect.x).toBeGreaterThan(cells[0].rect.x);
    expect(cells[6].rect.y).toBeGreaterThan(cells[0].rect.y);
    expect(cells[6].rect.x).toBe(cells[0].rect.x);
  });

  it("should grow rows of 6 past 30, the extra cells marked over capacity, and never shrink the 30", () => {
    const base = gearPanelLayout(right, 30);
    const over = gearPanelLayout(right, 34);
    expect(over.rows).toBe(6);
    expect(over.cell).toBe(base.cell);
    const scrolled = gearPanelLayout(right, 34, over.rows);
    expect(scrolled.cells.filter((c) => c.over).map((c) => c.index)).toEqual([
      30, 31, 32, 33, 34, 35,
    ]);
    expect(base.cells.some((c) => c.over)).toBe(false);
  });

  it("should scroll the grid when its rows do not fit, keeping every cell reachable", () => {
    const small = overlayLayout(640, 400).right;
    const first = gearPanelLayout(small, 60);
    expect(first.visibleRows).toBeLessThan(first.rows);
    const last = gearPanelLayout(small, 60, first.rows);
    expect(last.scroll).toBe(first.rows - first.visibleRows);
    expect(last.cells.at(-1)?.index).toBe(first.rows * BAG_COLUMNS - 1);
  });
});

describe("the hint line (FS-NV54P R25: the longer hint stays inside the right panel)", () => {
  // the hint is drawn 4px into its area at 10px, wrapped to the panel's inner width; the stash
  // hint wraps to three lines on the narrowest panel, each about 12px tall (Phaser's ~1.2em)
  it("should leave room for three 10px lines", () => {
    expect(HINT_H).toBeGreaterThanOrEqual(4 + 3 * 12);
  });

  it.each(SIZES)(
    "should sit inside the right panel, below every bag cell shown, at %ix%i",
    (w, h) => {
      const { right } = overlayLayout(w, h);
      const g = gearPanelLayout(right, BAG_CAPACITY);
      expect(g.hintY + HINT_H).toBeLessThanOrEqual(
        right.y + right.h - PANEL_PAD,
      );
      const gridBottom = Math.max(...g.cells.map((c) => c.rect.y + c.rect.h));
      expect(gridBottom).toBeLessThanOrEqual(g.hintY);
      expect(g.visibleRows).toBeGreaterThan(0);
    },
  );
});

describe("the purse line (FS-7TGZ3 §A R1: under the bag grid, above the hint)", () => {
  const cases = SIZES.flatMap(([w, h]) =>
    [0, BAG_CAPACITY, 60].map((count) => [w, h, count] as const),
  );

  it.each(cases)(
    "should sit under every bag cell shown and above the hint, inside the panel, at %ix%i with %i items",
    (w, h, count) => {
      const { right } = overlayLayout(w, h);
      const g = gearPanelLayout(right, count);
      const gridBottom = Math.max(...g.cells.map((c) => c.rect.y + c.rect.h));
      expect(g.purse.y).toBeGreaterThan(gridBottom);
      expect(g.purse.y + g.purse.h).toBeLessThanOrEqual(g.hintY);
      expect(g.purse.x).toBeGreaterThanOrEqual(right.x + PANEL_PAD);
      expect(g.purse.x + g.purse.w).toBeLessThanOrEqual(
        right.x + right.w - PANEL_PAD,
      );
    },
  );

  it("should line up with the bag grid's edges, tall enough for the coin and a 12px amount", () => {
    const g = gearPanelLayout(overlayLayout(1080, 720).right, 7);
    expect(g.purse.x).toBe(g.grid.x);
    expect(g.purse.w).toBe(g.grid.w);
    expect(g.purse.h).toBeGreaterThanOrEqual(16);
  });

  it("should stay under the grid as an over-capacity bag scrolls", () => {
    const small = overlayLayout(640, 400).right;
    const first = gearPanelLayout(small, 60);
    const last = gearPanelLayout(small, 60, first.rows);
    for (const g of [first, last]) {
      expect(g.purse.y).toBeGreaterThan(g.grid.y + g.grid.h);
      expect(g.purse.y + g.purse.h).toBeLessThanOrEqual(g.hintY);
    }
  });
});

describe("statsPanelArea (FS-HRH2J §C: the stats panel's insides)", () => {
  it.each(SIZES)(
    "should sit inside the left panel, below its title, at %ix%i",
    (w, h) => {
      const { left, right } = overlayLayout(w, h);
      const area = statsPanelArea(left);
      const gear = gearPanelLayout(right, 0);

      expect(area.x).toBeGreaterThan(left.x);
      expect(area.x + area.w).toBeLessThan(left.x + left.w);
      // the stats begin where the gear panel's slots begin, so the two panels read level
      expect(area.y).toBe(gear.slots.head.y);
      expect(area.y + area.h).toBeLessThan(left.y + left.h);
    },
  );
});

describe("stashPanelLayout (FS-VPD8Y R35–36: the stash grid in the left panel)", () => {
  const { left, right } = overlayLayout(1080, 720);
  const inside = (r: { x: number; y: number; w: number; h: number }) =>
    r.x >= left.x &&
    r.y >= left.y &&
    r.x + r.w <= left.x + left.w &&
    r.y + r.h <= left.y + left.h;

  it("should be 6 columns by 10 rows: 60 cells, the stash's capacity", () => {
    expect(STASH_COLUMNS).toBe(6);
    expect(STASH_ROWS).toBe(10);
    expect(STASH_COLUMNS * STASH_ROWS).toBe(STASH_CAPACITY);
  });

  it.each(SIZES)(
    "should lay 60 cells and the count line inside the left panel, level with the gear panel, at %ix%i",
    (w, h) => {
      const layout = overlayLayout(w, h);
      const stash = stashPanelLayout(layout.left, 0);
      const fits = (r: { x: number; y: number; w: number; h: number }) =>
        r.x >= layout.left.x &&
        r.y >= layout.left.y &&
        r.x + r.w <= layout.left.x + layout.left.w &&
        r.y + r.h <= layout.left.y + layout.left.h;
      // a short window scrolls the rows it cannot show, but every row shown is inside
      expect(stash.rows).toBe(10);
      for (const c of stash.cells) expect(fits(c.rect)).toBe(true);
      expect(stash.countY).toBe(gearPanelLayout(layout.right, 0).slots.head.y);
      expect(Math.min(...stash.cells.map((c) => c.rect.y))).toBeGreaterThan(
        stash.countY,
      );
    },
  );

  it("should show all 60 cells, none over, in stash order on a normal window", () => {
    const stash = stashPanelLayout(left, 7);
    expect(stash.cells).toHaveLength(60);
    expect(stash.visibleRows).toBe(10);
    expect(stash.cells.some((c) => c.over)).toBe(false);
    for (const c of stash.cells) expect(inside(c.rect)).toBe(true);
    expect(stash.cells.slice(0, 7).map((c) => c.index)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(stash.cells[6].rect.y).toBeGreaterThan(stash.cells[0].rect.y);
    expect(stash.cells[6].rect.x).toBe(stash.cells[0].rect.x);
  });

  it("should grow rows of 6 past 60, the extra cells marked over capacity, and never shrink the 60 (R36)", () => {
    const base = stashPanelLayout(left, 60);
    const over = stashPanelLayout(left, 64);
    expect(over.rows).toBe(11);
    expect(over.cell).toBe(base.cell);
    const scrolled = stashPanelLayout(left, 64, over.rows);
    expect(scrolled.cells.filter((c) => c.over).map((c) => c.index)).toEqual([
      60, 61, 62, 63, 64, 65,
    ]);
    expect(base.cells.some((c) => c.over)).toBe(false);
  });

  it("should scroll the grid when its rows do not fit, keeping every cell reachable (R36)", () => {
    const first = stashPanelLayout(left, 64);
    expect(first.visibleRows).toBeLessThan(first.rows);
    const last = stashPanelLayout(left, 64, first.rows);
    expect(last.scroll).toBe(first.rows - first.visibleRows);
    expect(last.cells.at(-1)?.index).toBe(first.rows * STASH_COLUMNS - 1);
  });

  it("should not reach into the right panel", () => {
    const stash = stashPanelLayout(left, 64);
    expect(stash.grid.x + stash.grid.w).toBeLessThan(right.x);
  });
});

describe("rowWindow (FS-HRH2J edge state Small window: panel contents scroll)", () => {
  it("should show every row, unscrolled, when they all fit", () => {
    expect(rowWindow([10, 20, 30], 60, 5)).toEqual({
      first: 0,
      count: 3,
      rows: 3,
    });
  });

  it("should show only the rows that fit whole, from the first scrolled to", () => {
    expect(rowWindow([10, 20, 30, 10], 35, 0)).toEqual({
      first: 0,
      count: 2,
      rows: 4,
    });
    expect(rowWindow([10, 20, 30, 10], 35, 2)).toEqual({
      first: 2,
      count: 1,
      rows: 4,
    });
  });

  it("should stop scrolling once the last row is in view", () => {
    // [30, 10] is the tail that fits: scrolling past row 2 stays at row 2
    expect(rowWindow([10, 20, 30, 10], 45, 9).first).toBe(2);
    expect(rowWindow([10, 20, 30, 10], 45, -3).first).toBe(0);
  });

  it("should draw nothing past the space, even a row taller than it", () => {
    expect(rowWindow([50], 20, 0)).toEqual({ first: 0, count: 0, rows: 1 });
  });
});

describe("itemTipRow (FS-NV54P §D R17–19: the item tip and its worn tips in one row)", () => {
  const tip = (width: number, height = 120) => ({ width, height });
  const screen = { width: 1080, height: 720 };

  it.each([
    {
      name: "one tip right of the pointer, as today's tip",
      tips: [tip(280)],
      pointer: { x: 300, y: 200 },
      want: [{ x: 314, y: 190 }],
    },
    {
      name: "two tips right of the pointer, a small gap between, tops aligned",
      tips: [tip(280), tip(280, 200)],
      pointer: { x: 300, y: 200 },
      want: [
        { x: 314, y: 190 },
        { x: 602, y: 190 },
      ],
    },
    {
      name: "the whole row flipped left near the right edge, its order kept",
      tips: [tip(280), tip(280)],
      pointer: { x: 900, y: 200 },
      want: [
        { x: 324, y: 190 },
        { x: 612, y: 190 },
      ],
    },
    {
      name: "raised above the pointer near the bottom, by the tallest tip",
      tips: [tip(280, 100), tip(280, 300)],
      pointer: { x: 300, y: 600 },
      want: [
        { x: 314, y: 292 },
        { x: 602, y: 292 },
      ],
    },
    {
      name: "never raised above the top edge",
      tips: [tip(280, 700)],
      pointer: { x: 300, y: 600 },
      want: [{ x: 314, y: 4 }],
    },
    {
      name: "a ring's three tips right of the pointer, in slot order",
      tips: [tip(280), tip(280), tip(280)],
      pointer: { x: 100, y: 200 },
      want: [
        { x: 114, y: 190 },
        { x: 402, y: 190 },
        { x: 690, y: 190 },
      ],
    },
    {
      name: "a ring's three tips flipped whole left near the right edge, their order kept",
      tips: [tip(280), tip(280), tip(280)],
      pointer: { x: 1000, y: 200 },
      want: [
        { x: 136, y: 190 },
        { x: 424, y: 190 },
        { x: 712, y: 190 },
      ],
    },
    {
      name: "pushed in from the right edge where neither side fits",
      tips: [tip(280), tip(280), tip(280)],
      pointer: { x: 540, y: 200 },
      want: [
        { x: 220, y: 190 },
        { x: 508, y: 190 },
        { x: 796, y: 190 },
      ],
    },
    {
      name: "the left edge kept on a screen narrower than the row",
      tips: [tip(280), tip(280), tip(280)],
      pointer: { x: 300, y: 200 },
      screen: { width: 640, height: 400 },
      want: [
        { x: 4, y: 190 },
        { x: 292, y: 190 },
        { x: 580, y: 190 },
      ],
    },
  ])("should place $name", ({ tips, pointer, want, ...rest }) => {
    expect(itemTipRow(tips, pointer, rest.screen ?? screen)).toEqual(want);
  });

  it.each(SIZES)(
    "should keep a row that fits the screen wholly on it at %ix%i, wherever the pointer is",
    (w, h) => {
      const tips = [tip(280, 150), tip(280, 220)];
      for (const px of [0, w / 4, w / 2, (3 * w) / 4, w])
        for (const py of [0, h / 2, h]) {
          const at = itemTipRow(
            tips,
            { x: px, y: py },
            { width: w, height: h },
          );
          at.forEach((p, i) => {
            expect(p.x).toBeGreaterThanOrEqual(0);
            expect(p.x + tips[i].width).toBeLessThanOrEqual(w);
            expect(p.y).toBeGreaterThanOrEqual(0);
            expect(p.y + tips[i].height).toBeLessThanOrEqual(h);
            expect(p.y).toBe(at[0].y);
          });
        }
    },
  );

  it.each(SIZES)(
    "should keep a ring's three-tip row on screen at %ix%i wherever the pointer is, the left edge winning where it is wider than the screen (R19)",
    (w, h) => {
      const tips = [tip(280, 150), tip(280, 220), tip(280, 180)];
      const rowW = 3 * 280 + 2 * 8;
      for (const px of [0, w / 4, w / 2, (3 * w) / 4, w])
        for (const py of [0, h / 2, h]) {
          const at = itemTipRow(
            tips,
            { x: px, y: py },
            { width: w, height: h },
          );
          expect(at.map((p) => p.x)).toEqual([
            at[0].x,
            at[0].x + 288,
            at[0].x + 576,
          ]);
          at.forEach((p, i) => {
            expect(p.y).toBe(at[0].y);
            expect(p.y).toBeGreaterThanOrEqual(0);
            expect(p.y + tips[i].height).toBeLessThanOrEqual(h);
          });
          if (rowW <= w) {
            expect(at[0].x).toBeGreaterThanOrEqual(0);
            expect(at[2].x + 280).toBeLessThanOrEqual(w);
          } else expect(at[0].x).toBe(4);
        }
    },
  );
});

// FS-ZAJMH R18 escalation check: the fullscreen button in the game frame's top-right corner sits
// above the gear panel's top edge, so the open overlay is never under it, at 1080 or 1280.
describe("overlayLayout and the fullscreen button", () => {
  it.each([1080, 1280])("should start the right panel below the button at logical width %i", (width) => {
    const { right } = overlayLayout(width, 720);
    expect(right.y).toBeGreaterThan(FULLSCREEN_BUTTON.inset + FULLSCREEN_BUTTON.height);
  });
});
