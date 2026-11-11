import { describe, expect, it } from "vitest";
import { WORLD_PX_PER_TILE } from "@/render/iso";
import type { WallState } from "@/types/gameState";
import { BAKE } from "./bake";
import { doorGaps, doorHead, gapDoor, planBuildings, planCap } from "./buildingLooks";
import { housesFrom } from "./houses";
import { townOutline } from "./hubTown.fixture";
import { HUB_TOWN_GOLDEN } from "./hubTownGolden";
import { MASONRY_WALLS, TIMBER_WALLS, planWalls } from "./walls";

const T = WORLD_PX_PER_TILE;
const THICK = 20;
const DOOR = 80;

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

/** A building walled as AddBuilding does a run house: 20 thick, a centred 80 gap in the south. */
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

/**
 * The client's town mirror (hub_map.go's buildings), walled as the server walls them: the Inn's
 * street gap off centre, against its partition (ADR-0073).
 */
const TOWN = HUB_TOWN_GOLDEN.buildings;
const TOWN_WALLS = TOWN.flatMap((b, i) => townOutline(b).map(([x, y, w, h]) => wall(x, y, w, h, `b${i}`)));

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
    // the golden's gaps, as the server cuts them: the Inn's 15 px east of centre with its west
    // jamb on the partition's east face (ADR-0073), the store's and the smithy's centred
    expect(gaps).toEqual(
      TOWN.map(({ doorGap: g }, i) => ({
        houseId: `b${i}`,
        position: { x: g.x, y: g.y },
        width: g.w,
        height: g.h,
      })),
    );
    expect(gaps).toHaveLength(3);
  });

  it("should open the Inn's street gap wholly into the taproom, no partition standing in it (FS-MMA2H R10)", () => {
    const [inn] = doorGaps(TOWN_WALLS);
    const partitions = TOWN[0].partitions;
    expect(partitions.length).toBeGreaterThan(0);
    for (const p of partitions) expect(p.x + p.w).toBeLessThanOrEqual(inn.position.x);
    expect(inn.position.x + inn.width).toBeLessThanOrEqual(TOWN[0].x + TOWN[0].w - THICK);
  });

  it("should find the same gaps with the partition and the furnishings among the walls", () => {
    const indoors = TOWN.flatMap((b, i) =>
      [...b.partitions, ...b.furnishings].map(({ x, y, w, h }) => wall(x, y, w, h, `b${i}`)),
    );
    expect(doorGaps([...TOWN_WALLS, ...indoors])).toEqual(doorGaps(TOWN_WALLS));
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
      wall(280, 0, THICK, 60, "e"),
      wall(280, 140, THICK, 60, "e"),
    ];
    expect(doorGaps(walls)).toEqual([
      { houseId: "e", position: { x: 280, y: 60 }, width: THICK, height: DOOR },
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

describe("gapDoor (FS-9PN7X §B.5, amended 2026-11-03)", () => {
  it("should hang a shut plank door, no lock on it, in a town door gap while the player is outside", () => {
    const [gap] = doorGaps(TOWN_WALLS);
    expect(gapDoor(gap, false)).toEqual({
      sheet: "door_x",
      frame: "shut",
      axis: "x",
      at: { x: gap.position.x + DOOR / 2, y: gap.position.y + THICK / 2 },
      depthAt: gap.position,
      rect: { x: gap.position.x, y: gap.position.y, width: DOOR, height: THICK },
    });
  });

  it("should show the door open while the player is inside its building", () => {
    const [gap] = doorGaps(TOWN_WALLS);
    expect(gapDoor(gap, true)).toEqual({ ...gapDoor(gap, false), frame: "open" });
  });

  it("should turn the door to the gap's own axis, as the door sheets name it", () => {
    const gap = { houseId: "e", position: { x: 280, y: 60 }, width: THICK, height: DOOR };
    const door = gapDoor(gap, false);
    expect(door.sheet).toBe("door_y");
    expect(door.axis).toBe("y");
    expect(door.at).toEqual({ x: 290, y: 100 });
    expect(gapDoor(gap, true).sheet).toBe("door_y");
  });
});

describe("doorHead (FS-9PN7X §B.5, amended 2026-11-03)", () => {
  it("should close a town door gap over the door's lintel in the type's own wall, sorted like the door", () => {
    const [gap] = doorGaps(TOWN_WALLS);
    expect(doorHead(gap, TIMBER_WALLS)).toEqual({
      sheet: "door_head_x",
      axis: "x",
      at: { x: gap.position.x + DOOR / 2, y: gap.position.y + THICK / 2 },
      depthAt: gap.position,
      rect: { x: gap.position.x, y: gap.position.y, width: DOOR, height: THICK },
    });
  });

  it("should give a Spire room's gap the masonry head, on the gap's own axis", () => {
    const gap = { houseId: "r", position: { x: 280, y: 60 }, width: THICK, height: DOOR };
    expect(doorHead(gap, MASONRY_WALLS).sheet).toBe("tower_door_head_y");
    expect(doorHead({ ...gap, width: DOOR, height: THICK }, MASONRY_WALLS).sheet).toBe("tower_door_head_x");
  });
});

describe("a run house's 80 px door (FS-MMA2H §B R7, R8)", () => {
  /** The stretch of the south wall's line a piece's kept footprint covers. */
  const span = (p: { at: { x: number }; keep: number }) => [p.at.x - T / 2, p.at.x - T / 2 + p.keep * T];

  it.each([
    [300, 200, 110],
    [400, 300, 160],
    [500, 400, 210],
  ])("should draw a %i × %i house's door centred, posted at both jambs, nothing in the gap", (w, h, side) => {
    const walls = building(80, 60, w, h, "r");
    const south = 60 + h - THICK;
    const [west, east] = [80 + side, 80 + side + DOOR];
    const [gap, ...others] = doorGaps(walls);
    expect(others).toEqual([]);
    expect(gap).toEqual({ houseId: "r", position: { x: west, y: south }, width: DOOR, height: THICK });
    // the door and its head stand at the gap's centre, and a head's placeholder is the gap's width
    const centre = { x: 80 + w / 2, y: south + THICK / 2 };
    expect(gapDoor(gap, false).at).toEqual(centre);
    expect(doorHead(gap, MASONRY_WALLS).at).toEqual(centre);
    expect(doorHead(gap, MASONRY_WALLS).rect.width).toBe(DOOR);

    const [plan] = planBuildings(walls, 5, MASONRY_WALLS);
    for (const look of [plan.interior, plan.exterior]) {
      // a post at each jamb: on the wall's centreline, half the wall's thickness in from its end
      const jambs = look.posts.filter((p) => p.at.y === centre.y).map((p) => p.at.x);
      expect(jambs).toEqual(expect.arrayContaining([west - THICK / 2, east + THICK / 2]));
      // no post and no piece of the south wall stands in the gap
      expect(look.posts.some((p) => p.at.y === centre.y && p.at.x > west && p.at.x < east)).toBe(false);
      const onSouth = look.pieces.filter((p) => p.axis === "x" && p.at.y === centre.y);
      expect(onSouth.length).toBeGreaterThan(0);
      for (const p of onSouth) {
        const [from, to] = span(p);
        expect(to <= west + 1e-6 || from >= east - 1e-6, `${p.sheet} at ${from}–${to}`).toBe(true);
      }
    }
  });
});
