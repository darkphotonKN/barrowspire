import { describe, expect, it } from "vitest";
import { projectedBounds } from "@/render/iso/projection";
import { CHUNK_MAX, ChunkGrid, ChunkVisibility } from "./chunks";

/** Floor 1's ground as the run paints it: the projected map and a 48 px margin. */
const DUNGEON = projectedBounds(5760, 3840, 48);
/** Floors 2 and 3's. */
const TOWER = projectedBounds(1440, 960, 48);

describe("ChunkGrid (FS-KE075 §H.44)", () => {
  it("cuts the ground into chunks no larger than asked, covering it exactly", () => {
    const grid = new ChunkGrid(DUNGEON, 1024);
    expect([grid.cols, grid.rows]).toEqual([8, 4]);
    for (const r of grid.rects) {
      expect(r.width).toBeLessThanOrEqual(1024);
      expect(r.height).toBeLessThanOrEqual(1024);
    }
    const area = grid.rects.reduce((sum, r) => sum + r.width * r.height, 0);
    expect(area).toBe(Math.ceil(DUNGEON.width) * Math.ceil(DUNGEON.height));
    // side by side, from the bounds' corner, with no gap or overlap
    expect(grid.rects[0]).toMatchObject({ x: DUNGEON.x, y: DUNGEON.y });
    expect(grid.rects[1].x).toBe(grid.rects[0].x + grid.rects[0].width);
    expect(grid.rects[grid.cols].y).toBe(grid.rects[0].y + grid.rects[0].height);
  });

  it("never makes a chunk larger than a drawing context every GPU takes", () => {
    const grid = new ChunkGrid(DUNGEON, 8192);
    expect(Math.max(...grid.rects.map((r) => Math.max(r.width, r.height)))).toBeLessThanOrEqual(CHUNK_MAX);
    expect(CHUNK_MAX).toBe(2048);
  });

  it("keeps a ground that fits in one chunk as one, exactly as it was painted before (floors 2–3)", () => {
    const grid = new ChunkGrid(TOWER, CHUNK_MAX);
    expect(grid.rects).toEqual([
      { x: TOWER.x, y: TOWER.y, width: Math.ceil(TOWER.width), height: Math.ceil(TOWER.height) },
    ]);
  });

  it("names the chunk a screen point lies in, the nearest edge chunk for a point off the ground", () => {
    const grid = new ChunkGrid(DUNGEON, 1024);
    const [first, second] = grid.rects;
    expect(grid.indexAt({ x: first.x + 1, y: first.y + 1 })).toBe(0);
    expect(grid.indexAt({ x: second.x + 1, y: second.y + 1 })).toBe(1);
    expect(grid.indexAt({ x: first.x - 500, y: first.y - 500 })).toBe(0);
    expect(grid.indexAt({ x: 1e6, y: 1e6 })).toBe(grid.rects.length - 1);
  });

  it("finds the chunks within one chunk of a view", () => {
    const grid = new ChunkGrid(DUNGEON, 1024);
    const c = grid.rects[2 * grid.cols + 3]; // row 2, column 3
    // a view wholly inside that chunk: it and its eight neighbours
    const near = grid.near({ x: c.x + 10, y: c.y + 10, width: 100, height: 100 });
    const want = [1, 2, 3].flatMap((row) => [2, 3, 4].map((col) => row * grid.cols + col));
    expect(near).toEqual(want);
  });
});

/** A part that records whether it is shown, as a Phaser game object's `setVisible` does. */
const part = () => {
  const p = { visible: true, setVisible: (v: boolean) => ((p.visible = v), p) };
  return p;
};

describe("ChunkVisibility (FS-KE075 §H.45)", () => {
  const grid = new ChunkGrid(DUNGEON, 1024);
  const centre = (i: number) => ({ x: grid.rects[i].x + 500, y: grid.rects[i].y + 500 });
  /** A small view inside chunk (col, row). */
  const viewIn = (col: number, row: number) => {
    const r = grid.rects[row * grid.cols + col];
    return { x: r.x + 100, y: r.y + 100, width: 200, height: 200 };
  };

  it("shows only the parts in chunks within one chunk of the view, and hides the rest", () => {
    const chunks = new ChunkVisibility(grid);
    const parts = grid.rects.map((_, i) => {
      const p = part();
      chunks.add(p, centre(i));
      return p;
    });
    chunks.update(viewIn(0, 0));
    const shown = parts.flatMap((p, i) => (p.visible ? [i] : []));
    expect(shown).toEqual([0, 1, grid.cols, grid.cols + 1]);
  });

  it("hides a part added in a chunk out of reach, and shows one added in reach", () => {
    const chunks = new ChunkVisibility(grid);
    chunks.update(viewIn(0, 0));
    const far = part();
    const close = part();
    chunks.add(far, centre(grid.rects.length - 1));
    chunks.add(close, centre(0));
    expect([far.visible, close.visible]).toEqual([false, true]);
  });

  it("toggles only when the camera crosses a chunk edge", () => {
    const chunks = new ChunkVisibility(grid);
    const p = part();
    chunks.add(p, centre(5));
    expect(chunks.update(viewIn(0, 0))).toBe(true);
    expect(p.visible).toBe(false);
    // a pan within the same chunk changes nothing
    const v = viewIn(0, 0);
    expect(chunks.update({ ...v, x: v.x + 50 })).toBe(false);
    // into reach of chunk 5 (column 5): from column 4
    expect(chunks.update(viewIn(4, 0))).toBe(true);
    expect(p.visible).toBe(true);
    expect(chunks.shown(5)).toBe(true);
    expect(chunks.shown(0)).toBe(false);
  });

  it("forgets every part on clear", () => {
    const chunks = new ChunkVisibility(grid);
    const p = part();
    chunks.add(p, centre(0));
    chunks.clear();
    chunks.update(viewIn(7, 3));
    expect(p.visible).toBe(true);
  });
});
