import { describe, expect, it } from "vitest";
import { WORLD_PX_PER_TILE, type Rect } from "@/render/iso";
import {
  PERIMETER_POST,
  PERIMETER_THICKNESS,
  planPerimeter,
} from "./perimeter";

const T = WORLD_PX_PER_TILE;
/** The run's play area: the client's `mapWidth` × `mapHeight`. */
const W = 1440;
const H = 960;

/** Whether a rect has any area inside the play area (touching its edge is outside). */
const intrudes = (r: Rect) =>
  r.x < W && r.x + r.width > 0 && r.y < H && r.y + r.height > 0;

describe("planPerimeter (FS-8RBQY §B.5)", () => {
  const { pieces, posts } = planPerimeter(W, H);
  const side = (s: string) => pieces.filter((p) => p.side === s);

  it("should stand every piece and post wholly outside the play area", () => {
    for (const p of [...pieces, ...posts])
      expect(intrudes(p.rect), JSON.stringify(p)).toBe(false);
  });

  it("should put the inner face of every run on the play area's edge", () => {
    for (const p of side("north")) expect(p.rect.y + p.rect.height).toBe(0);
    for (const p of side("west")) expect(p.rect.x + p.rect.width).toBe(0);
    for (const p of side("south")) expect(p.rect.y).toBe(H);
    for (const p of side("east")) expect(p.rect.x).toBe(W);
  });

  it("should centre each piece on its footprint, half the wall's thickness out", () => {
    const half = PERIMETER_THICKNESS / 2;
    expect(PERIMETER_THICKNESS).toBeCloseTo(0.62 * T);
    for (const p of side("north")) expect(p.at.y).toBeCloseTo(-half);
    for (const p of side("west")) expect(p.at.x).toBeCloseTo(-half);
    for (const p of side("south")) expect(p.at.y).toBeCloseTo(H + half);
    for (const p of side("east")) expect(p.at.x).toBeCloseTo(W + half);
  });

  it("should run one piece per tile along each side, edge to edge", () => {
    expect(side("north").map((p) => p.at.x)).toEqual(
      [...Array(W / T).keys()].map((k) => (k + 0.5) * T),
    );
    expect(side("south")).toHaveLength(W / T);
    expect(side("west").map((p) => p.at.y)).toEqual(
      [...Array(H / T).keys()].map((k) => (k + 0.5) * T),
    );
    expect(side("east")).toHaveLength(H / T);
  });

  it("should stand north and west full height, with arrow slits among the plain", () => {
    for (const s of ["north", "west"]) {
      const run = side(s);
      const axis = s === "north" ? "x" : "y";
      for (const p of run) {
        expect(p.height).toBe("back");
        expect(p.sheet).toMatch(
          new RegExp(`^tower_perimeter_back_(plain|slit)_${axis}$`),
        );
      }
      const slits = run.filter((p) => p.sheet.includes("_slit_"));
      expect(slits.length).toBeGreaterThanOrEqual(3);
      expect(slits.length).toBeLessThan(run.length / 4);
    }
  });

  it("should space the slits at a fixed pitch", () => {
    const gaps = (s: string) => {
      const ks = side(s).flatMap((p, k) =>
        p.sheet.includes("_slit_") ? [k] : [],
      );
      return new Set(ks.slice(1).map((k, i) => k - ks[i]));
    };
    expect(gaps("north").size).toBe(1);
    expect(gaps("north")).toEqual(gaps("west"));
  });

  it("should keep south and east low and plain, so they never cover anything in play", () => {
    for (const [s, axis] of [
      ["south", "x"],
      ["east", "y"],
    ]) {
      expect(side(s).length).toBeGreaterThan(0);
      for (const p of side(s)) {
        expect(p.height).toBe("front");
        expect(p.sheet).toBe(`tower_perimeter_front_plain_${axis}`);
      }
    }
  });

  it("should pier each corner, as tall as the tallest run it joins", () => {
    const at = (x: number, y: number) =>
      posts.find((p) => p.at.x === x && p.at.y === y)?.sheet;
    const o = PERIMETER_POST / 2;
    expect(posts).toHaveLength(4);
    expect(at(-o, -o)).toBe("tower_perimeter_post_back"); // north meets west
    expect(at(W + o, -o)).toBe("tower_perimeter_post_back"); // north meets east
    expect(at(-o, H + o)).toBe("tower_perimeter_post_back"); // west meets south
    expect(at(W + o, H + o)).toBe("tower_perimeter_post_front"); // south meets east
  });

  it("should sort each piece by the back corner of its footprint", () => {
    for (const p of pieces)
      expect(p.depthAt).toEqual({ x: p.rect.x, y: p.rect.y });
  });

  it("should plan the same wall on every call", () => {
    expect(planPerimeter(W, H)).toEqual({ pieces, posts });
    // and give neighbouring pieces different frames, so the run does not repeat one stone
    expect(new Set(side("north").map((p) => p.index % 2)).size).toBe(2);
  });
});
