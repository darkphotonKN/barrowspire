import { describe, expect, it } from "vitest";
import { WORLD_PX_PER_TILE } from "@/render/iso";
import type { DoorState, WallState } from "@/types/gameState";
import { BAKE } from "./bake";
import { darkOpening, doorGaps, planBuildings, planCap } from "./buildingLooks";
import { housesFrom } from "./houses";
import { HUB_TOWN_GOLDEN } from "./hubTownGolden";
import { MASONRY_WALLS, TIMBER_WALLS, planWalls } from "./walls";

const T = WORLD_PX_PER_TILE;
const THICK = 20;
const DOOR = 50;

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

/** A building walled as AddBuilding and addHubBuilding do: 20 thick, a centred 50 gap in the south. */
const building = (x: number, y: number, w: number, h: number, id: string) => {
  const side = (w - DOOR) / 2;
  return [
    wall(x, y, w, THICK, id),
    wall(x, y, THICK, h, id),
    wall(x + w - THICK, y, THICK, h, id),
    wall(x, y + h - THICK, side, THICK, id),
    wall(x + side + DOOR, y + h - THICK, side, THICK, id),
  ];
};

/** The same, with no gap: the owner's running hub may build them so (FS-9PN7X "Edge States"). */
const gapless = (x: number, y: number, w: number, h: number, id: string) => [
  wall(x, y, w, THICK, id),
  wall(x, y, THICK, h, id),
  wall(x + w - THICK, y, THICK, h, id),
  wall(x, y + h - THICK, w, THICK, id),
];

/** The client's town mirror (hub_map.go's buildings), walled as the server walls them. */
const TOWN = HUB_TOWN_GOLDEN.buildings;
const TOWN_WALLS = TOWN.flatMap(({ x, y, w, h }, i) => building(x, y, w, h, `b${i}`));

describe("planBuildings (FS-9PN7X §B.2)", () => {
  const walls = [...TOWN_WALLS, wall(0, 0, 200, THICK)];
  const plans = planBuildings(walls, 3);

  it("should plan one building per house, in housesFrom order, leaving out walls with no house", () => {
    expect(plans.map((p) => p.house)).toEqual(housesFrom(walls));
    const ids = plans.flatMap((p) =>
      [p.shared, p.interior, p.exterior].flatMap((l) => l.pieces.map((x) => x.wallId)),
    );
    expect(ids).not.toContain(walls.at(-1)!.entity_id);
  });

  it("should give the interior look exactly what planWalls draws today", () => {
    const today = planWalls(TOWN_WALLS, 3);
    const interior = plans.flatMap((p) => [...p.shared.pieces, ...p.interior.pieces]);
    const posts = plans.flatMap((p) => [...p.shared.posts, ...p.interior.posts]);
    const key = (p: { sheet: string; at: { x: number; y: number } }) =>
      `${p.sheet}@${p.at.x},${p.at.y}`;
    expect(interior.map(key).sort()).toEqual(today.pieces.map(key).sort());
    expect(posts.map(key).sort()).toEqual(today.posts.map(key).sort());
  });

  it("should share the north and west walls and the full-height posts between both looks", () => {
    for (const { shared } of plans) {
      expect(shared.pieces.every((p) => /^wall_back_/.test(p.sheet))).toBe(true);
      expect(shared.posts.every((p) => p.sheet === "post_back")).toBe(true);
    }
  });

  it("should stand each exterior piece on its cut-away piece's at, sort corner, trim and axis", () => {
    for (const { interior, exterior } of plans) {
      const shape = (p: (typeof interior.pieces)[number]) => [
        p.wallId,
        p.at,
        p.depthAt,
        p.keep,
        p.axis,
      ];
      expect(exterior.pieces.map(shape)).toEqual(interior.pieces.map(shape));
      expect(interior.pieces.every((p) => /^wall_front_/.test(p.sheet))).toBe(true);
      expect(
        exterior.pieces.every((p) =>
          /^wall_exterior_(plain|brace|window)_[xy]$/.test(p.sheet),
        ),
      ).toBe(true);
      expect(exterior.pieces.every((p) => p.height === "back")).toBe(true);
    }
  });

  it("should post the exterior's front corners and door jambs full height, with the back post", () => {
    for (const { interior, exterior } of plans) {
      // SE corner and the two jambs are cut away inside; outside they are columns
      expect(interior.posts).toHaveLength(3);
      expect(interior.posts.every((p) => p.sheet === "post_front")).toBe(true);
      expect(exterior.posts.map((p) => p.at)).toEqual(interior.posts.map((p) => p.at));
      expect(exterior.posts.every((p) => p.sheet === "post_back" && p.height === "back")).toBe(
        true,
      );
    }
  });

  it("should name the masonry exterior and its piers for a Spire room", () => {
    const [room] = planBuildings(building(80, 60, 300, 200, "r"), 5, MASONRY_WALLS);
    for (const p of room.exterior.pieces)
      expect(p.sheet).toMatch(/^tower_wall_exterior_(plain|pillar)_[xy]$/);
    expect(new Set(room.exterior.posts.map((p) => p.sheet))).toEqual(new Set(["tower_post_back"]));
  });

  it("should plan the same buildings for the same walls on every client", () => {
    expect(planBuildings(walls, 3)).toEqual(plans);
  });
});

describe("planCap (FS-9PN7X §B.3, §F.3)", () => {
  const room = housesFrom(building(80, 60, 300, 200, "r"))[0];
  const cap = planCap(room, MASONRY_WALLS, 4);

  it("should lay one-tile tower_cap pieces at the back walls' top", () => {
    expect(cap.length).toBeGreaterThan(0);
    for (const p of cap) {
      expect(p.sheet).toBe("tower_cap");
      expect(p.lift).toBeCloseTo(BAKE.WALL_BACK * BAKE.VPX);
    }
  });

  it("should cover the whole room rect with whole tiles, overhanging where a part tile would leave a gap", () => {
    // 300 × 200 is 7.5 × 5 tiles: 8 × 5 pieces, a tile apart
    expect(cap).toHaveLength(8 * 5);
    const xs = [...new Set(cap.map((p) => p.at.x))].sort((a, b) => a - b);
    const ys = [...new Set(cap.map((p) => p.at.y))].sort((a, b) => a - b);
    expect(xs[0] - T / 2).toBeLessThanOrEqual(room.x);
    expect(xs.at(-1)! + T / 2).toBeGreaterThanOrEqual(room.x + room.width);
    expect(ys[0] - T / 2).toBeLessThanOrEqual(room.y);
    expect(ys.at(-1)! + T / 2).toBeGreaterThanOrEqual(room.y + room.height);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBe(T);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBe(T);
    // no tile wasted past the room
    expect(xs.length).toBe(Math.ceil(room.width / T));
    expect(ys.length).toBe(Math.ceil(room.height / T));
  });

  it("should be deterministic, varying the slab by a hash", () => {
    expect(planCap(room, MASONRY_WALLS, 4)).toEqual(cap);
    expect(new Set(cap.map((p) => p.index)).size).toBeGreaterThan(1);
  });

  it("should lay no cap on a building type with a roof", () => {
    expect(planCap(room, TIMBER_WALLS, 4)).toEqual([]);
  });
});

describe("doorGaps (FS-9PN7X §B.5)", () => {
  it("should find each town building's door gap from the walls, the gap's own rect", () => {
    const gaps = doorGaps(TOWN_WALLS);
    expect(gaps).toHaveLength(3);
    expect(gaps).toEqual(
      TOWN.map(({ x, y, w, h }, i) => ({
        houseId: `b${i}`,
        position: { x: x + (w - DOOR) / 2, y: y + h - THICK },
        width: DOOR,
        height: THICK,
      })),
    );
  });

  it("should find no gap in a gapless building, nor between two buildings' walls", () => {
    expect(doorGaps(gapless(0, 0, 300, 200, "a"))).toEqual([]);
    // two buildings side by side: their north walls are collinear, but belong to different houses
    expect(
      doorGaps([...gapless(0, 0, 200, 200, "a"), ...gapless(260, 0, 200, 200, "b")]),
    ).toEqual([]);
  });

  it("should find a gap in an east or west wall too", () => {
    const walls = [
      wall(0, 0, 300, THICK, "e"),
      wall(0, 0, THICK, 200, "e"),
      wall(0, 200 - THICK, 300, THICK, "e"),
      wall(280, 0, THICK, 75, "e"),
      wall(280, 125, THICK, 75, "e"),
    ];
    expect(doorGaps(walls)).toEqual([
      { houseId: "e", position: { x: 280, y: 75 }, width: THICK, height: DOOR },
    ]);
  });

  it("should not take two collinear furnishings inside a building for a gap", () => {
    const walls = [
      ...gapless(0, 0, 400, 300, "f"),
      wall(60, 100, 40, 30, "f"),
      wall(160, 100, 40, 30, "f"),
    ];
    expect(doorGaps(walls)).toEqual([]);
  });
});

describe("darkOpening (FS-9PN7X §B.5, §F.4)", () => {
  it("should cover a town door gap with the timber dark opening along x", () => {
    const [gap] = doorGaps(TOWN_WALLS);
    expect(darkOpening(gap, TIMBER_WALLS)).toEqual({
      sheet: "door_dark_x",
      axis: "x",
      at: { x: gap.position.x + DOOR / 2, y: gap.position.y + THICK / 2 },
      depthAt: gap.position,
      rect: { x: gap.position.x, y: gap.position.y, width: DOOR, height: THICK },
    });
  });

  it("should give an open Spire door the masonry dark opening on the door's own axis", () => {
    const door: DoorState = {
      entity_id: "d",
      position: { x: 500, y: 300 },
      width: THICK,
      height: DOOR,
      is_open: true,
    };
    const spot = darkOpening(door, MASONRY_WALLS);
    expect(spot.sheet).toBe("tower_door_dark_y");
    expect(spot.axis).toBe("y");
    expect(spot.at).toEqual({ x: 510, y: 325 });
    expect(darkOpening({ ...door, width: DOOR, height: THICK }, MASONRY_WALLS).sheet).toBe(
      "tower_door_dark_x",
    );
  });
});
