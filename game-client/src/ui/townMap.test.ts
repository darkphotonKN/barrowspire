import { describe, expect, it } from "vitest";
import { HUB_TOWN_GOLDEN } from "@/render/world/hubTownGolden";
import { townOutline } from "@/render/world/hubTown.fixture";
import type { WallState } from "@/types/gameState";
import { notchDepth } from "./worldMap";
import { townMap } from "./townMap";

// FS-P0HSP §B (I-P0HSP-1): the town's map from a hub state's walls and gates, and the town's size.

const TOWN = { width: 2000, height: 1000 };
/** The town's buildings walled as hub_map.go walls them, each wall with its house's id; partitions and furnishings too. */
const WALLS: WallState[] = HUB_TOWN_GOLDEN.buildings.flatMap((b, i) => {
  const house = `house-${i}`;
  const rects = [
    ...townOutline(b),
    ...b.partitions.map((p) => [p.x, p.y, p.w, p.h] as const),
    ...b.furnishings.map((f) => [f.x, f.y, f.w, f.h] as const),
  ];
  return rects.map(([x, y, width, height], j) => ({
    entity_id: `${house}-wall-${j}`,
    house_id: house,
    position: { x, y },
    width,
    height,
  }));
});
const gate = (destination: string, x: number, y: number) => ({
  entity_id: `${destination}-gate`,
  destination: destination as "spire",
  position: { x, y },
  range: 80,
});
const GATES = [gate("spire", 1000, 50), gate("forest", 40, 580), gate("meadows", 1960, 360), gate("dev_test_room", 120, 900)];
const NORMAL = 1 / 12;

describe("townMap (FS-P0HSP §B, I-P0HSP-1)", () => {
  it("should lay the town's whole diamond as its ground (§B.6)", () => {
    expect(townMap({ walls: WALLS, gates: GATES }, TOWN).ground).toEqual([
      [
        { x: 0, y: 0 },
        { x: 2000, y: 0 },
        { x: 2000, y: 1000 },
        { x: 0, y: 1000 },
      ],
    ]);
  });

  it("should line the edge with a 160 px gap at the Spire, the Forest and the Meadows gates, none for the dev test room's (§B.7)", () => {
    const { lines } = townMap({ walls: WALLS, gates: GATES }, TOWN);
    const ends = lines.flatMap((r) => [r.points[0], r.points[r.points.length - 1]]);
    expect(ends).toEqual(
      expect.arrayContaining([
        { x: 920, y: 0 },
        { x: 1080, y: 0 },
        { x: 0, y: 500 },
        { x: 0, y: 660 },
        { x: 2000, y: 280 },
        { x: 2000, y: 440 },
      ]),
    );
    expect(ends).toHaveLength(6);
    // the south edge unbroken, its corners joined
    expect(lines.some((r) => r.points.some((p) => p.x === 2000 && p.y === 1000) && r.points.some((p) => p.x === 0 && p.y === 1000))).toBe(true);
  });

  it("should fill each building's footprint solid, its door cut as one notch, its interior never drawn (§B.8, §B.9)", () => {
    const solids = townMap({ walls: WALLS, gates: GATES }, TOWN).solids!(NORMAL);
    expect(solids).toHaveLength(HUB_TOWN_GOLDEN.buildings.length);
    const d = notchDepth(20, NORMAL);
    HUB_TOWN_GOLDEN.buildings.forEach((b, i) => {
      const { x: x0, w } = b.doorGap;
      const south = b.y + b.h;
      // the rect and one notch: 8 corners, nothing of a partition or a furnishing
      expect(solids[i]).toEqual([
        { x: b.x, y: b.y },
        { x: b.x + b.w, y: b.y },
        { x: b.x + b.w, y: south },
        { x: x0 + w, y: south },
        { x: x0 + w, y: south - d },
        { x: x0, y: south - d },
        { x: x0, y: south },
        { x: b.x, y: south },
      ]);
    });
  });

  it("should change its key only with what it draws: the same state twice, one key", () => {
    const a = townMap({ walls: WALLS, gates: GATES }, TOWN);
    const b = townMap({ walls: [...WALLS], gates: [...GATES] }, TOWN);
    expect(a.key).toBe(b.key);
    expect(townMap({ walls: WALLS.slice(1), gates: GATES }, TOWN).key).not.toBe(a.key);
    expect(townMap({ walls: WALLS, gates: GATES.slice(1) }, TOWN).key).not.toBe(a.key);
  });
});
