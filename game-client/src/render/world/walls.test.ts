import { describe, expect, it } from "vitest";
import { TILE_WIDTH, WORLD_PX_PER_TILE } from "@/render/iso";
import type { WallState } from "@/types/gameState";
import { housesFrom } from "./houses";
import { cutWall, heightOf, planWalls, sideOf, trimCrop } from "./walls";

const T = WORLD_PX_PER_TILE;

const wall = (
  x: number,
  y: number,
  width: number,
  height: number,
  house_id?: string,
): WallState => ({
  entity_id: `${house_id}:${x},${y},${width},${height}`,
  house_id,
  position: { x, y },
  width,
  height,
});

/** AddBuilding's run house: 300×200, walls 20 thick, a 50-wide door gap in the south wall. */
const runHouse = (bx: number, by: number) => [
  wall(bx, by, 300, 20, "h"),
  wall(bx, by, 20, 200, "h"),
  wall(bx + 280, by, 20, 200, "h"),
  wall(bx, by + 180, 125, 20, "h"),
  wall(bx + 175, by + 180, 125, 20, "h"),
];

describe("sideOf / heightOf", () => {
  const walls = runHouse(100, 60);
  const [house] = housesFrom(walls);

  it("should name the side of the house each wall stands on", () => {
    expect(walls.map((w) => sideOf(w, house))).toEqual([
      "north",
      "west",
      "east",
      "south",
      "south",
    ]);
  });

  it("should stand north and west sides full height and cut away south and east", () => {
    expect(heightOf("north")).toBe("back");
    expect(heightOf("west")).toBe("back");
    expect(heightOf("south")).toBe("front");
    expect(heightOf("east")).toBe("front");
    // a wall that belongs to no house has no front to cut away
    expect(heightOf(undefined)).toBe("back");
  });
});

describe("cutWall", () => {
  it("should cut a 5.5-tile wall into 5 full pieces and 1 trimmed piece", () => {
    const pieces = cutWall(wall(0, 0, 5.5 * T, 20), "back", 3);
    expect(pieces).toHaveLength(6);
    expect(pieces.slice(0, 5).every((p) => p.keep === 1)).toBe(true);
    expect(pieces[5].keep).toBeCloseTo(0.5);
    // one tile apart along the wall's centreline; the trimmed piece stands where a full one would
    expect(pieces.map((p) => p.at)).toEqual(
      [0.5, 1.5, 2.5, 3.5, 4.5, 5.5].map((k) => ({ x: k * T, y: 10 })),
    );
  });

  it("should take the wall's height and axis in the sheet name", () => {
    const back = cutWall(wall(0, 0, 3 * T, 20), "back", 1);
    const front = cutWall(wall(0, 0, 20, 3 * T), "front", 1);
    expect(
      back.every((p) =>
        /^wall_back_(plain|brace|window|torch)_x$/.test(p.sheet),
      ),
    ).toBe(true);
    expect(
      front.every((p) =>
        /^wall_front_(plain|brace|window|torch)_y$/.test(p.sheet),
      ),
    ).toBe(true);
    expect(front.map((p) => p.at)).toEqual(
      [0.5, 1.5, 2.5].map((k) => ({ x: 10, y: k * T })),
    );
  });

  it("should keep a trimmed piece plain, so a cut never slices a window or a torch", () => {
    for (let seed = 0; seed < 40; seed++) {
      const last = cutWall(wall(0, 0, 2.3 * T, 20), "back", seed).at(-1)!;
      expect(last.sheet).toBe("wall_back_plain_x");
    }
  });

  it("should pick the same variants for the same wall on every client", () => {
    const a = cutWall(wall(120, 40, 12 * T, 20), "back", 9);
    const b = cutWall(wall(120, 40, 12 * T, 20), "back", 9);
    expect(a).toEqual(b);
    expect(new Set(a.map((p) => p.sheet)).size).toBeGreaterThan(1);
  });

  it("should leave a wall shorter than a tile as one trimmed piece", () => {
    const [piece, ...rest] = cutWall(wall(0, 0, 25, 20), "front", 1);
    expect(rest).toEqual([]);
    expect(piece.keep).toBeCloseTo(25 / T);
  });

  it("should sort each piece by the back corner of its footprint", () => {
    const pieces = cutWall(wall(100, 60, 3 * T, 20), "back", 1);
    expect(pieces.map((p) => p.depthAt)).toEqual([
      { x: 100, y: 60 },
      { x: 140, y: 60 },
      { x: 180, y: 60 },
    ]);
  });
});

describe("planWalls", () => {
  it("should post every corner and door jamb once, as tall as the tallest wall it joins", () => {
    const { posts } = planWalls(runHouse(100, 60), 1);
    const at = (x: number, y: number) =>
      posts.find((p) => p.at.x === x && p.at.y === y)?.sheet;
    expect(posts).toHaveLength(6);
    expect(at(110, 70)).toBe("post_back"); // NW: north + west
    expect(at(390, 70)).toBe("post_back"); // NE: north (back) meets east (front)
    expect(at(110, 250)).toBe("post_back"); // SW: west (back) meets south (front)
    expect(at(390, 250)).toBe("post_front"); // SE: east + south, both cut away
    expect(at(215, 250)).toBe("post_front"); // door jambs
    expect(at(285, 250)).toBe("post_front");
  });

  it("should name the server wall every piece and post belongs to, so they go with it", () => {
    const walls = runHouse(100, 60);
    const ids = new Set(walls.map((w) => w.entity_id));
    const { pieces, posts } = planWalls(walls, 1);
    expect([...pieces, ...posts].every((p) => ids.has(p.wallId))).toBe(true);
    // the north wall's pieces are its own
    const north = walls[0].entity_id;
    expect(
      pieces.filter((p) => p.wallId === north).every((p) => p.at.y === 70),
    ).toBe(true);
  });

  it("should stand the north and west walls full height and the south and east low", () => {
    const { pieces } = planWalls(runHouse(100, 60), 1);
    const heights = (pred: (x: number, y: number) => boolean) =>
      new Set(
        pieces
          .filter((p) => pred(p.at.x, p.at.y))
          .map((p) => p.sheet.split("_")[1]),
      );
    expect(heights((_, y) => y === 70)).toEqual(new Set(["back"])); // north
    expect(heights((x, y) => x === 110 && y > 70)).toEqual(new Set(["back"])); // west
    expect(heights((x, y) => x === 390 && y > 70)).toEqual(new Set(["front"])); // east
    expect(heights((_, y) => y === 250)).toEqual(new Set(["front"])); // south
  });
});

describe("trimCrop", () => {
  const frame = { width: 136, anchorX: 0.25 };
  const origin = 136 * 0.25;

  it("should keep a whole piece whole", () => {
    expect(trimCrop("x", 1, frame)).toEqual({ x: 0, width: 136 });
  });

  it("should cut an x-axis piece on the screen column where its kept length ends", () => {
    // world +x runs screen-right: half a tile kept ends at the origin
    expect(trimCrop("x", 0.5, frame)).toEqual({ x: 0, width: origin });
    expect(trimCrop("x", 0.25, frame).width).toBeCloseTo(
      origin - TILE_WIDTH / 8,
    );
  });

  it("should cut a y-axis piece from the other side, since world +y runs screen-left", () => {
    const crop = trimCrop("y", 0.25, frame);
    expect(crop.x).toBeCloseTo(origin + TILE_WIDTH / 8);
    expect(crop.x + crop.width).toBe(136);
  });
});
