import { describe, expect, it } from "vitest";
import { HUB_TOWN_GOLDEN } from "@/render/world/hubTownGolden";
import { townOutline, townWalls } from "@/render/world/hubTown.fixture";
import { HUB_SIZE } from "@/render/world/hubKeepOut";
import type { WallState } from "@/types/gameState";
import { HUB_STASH_CHEST } from "@/render/world/hubStash";
import { EAST_DOOR_WALLS } from "@/render/world/eastDoor.fixture";
import { notchDepth } from "./worldMap";
import { TownPlan, townMap } from "./townMap";

// FS-P0HSP §B (I-P0HSP-1): the town's map from a hub state's walls and gates, and the town's size.

/** The town's size, the scene's one hub size (FS-R4MYX R22). */
const TOWN = HUB_SIZE;
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
        { x: 2000, y: TOWN.height },
        { x: 0, y: TOWN.height },
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
    expect(lines.some((r) => r.points.some((p) => p.x === 2000 && p.y === TOWN.height) && r.points.some((p) => p.x === 0 && p.y === TOWN.height))).toBe(true);
  });

  it("should fill each building's footprint solid, its door cut as one notch on its door face, its interior never drawn (§B.8, §B.9; FS-R4MYX R11)", () => {
    const solids = townMap({ walls: WALLS, gates: GATES }, TOWN).solids!(NORMAL);
    expect(solids).toHaveLength(HUB_TOWN_GOLDEN.buildings.length);
    const d = notchDepth(20, NORMAL);
    HUB_TOWN_GOLDEN.buildings.forEach((b, i) => {
      const [east, south] = [b.x + b.w, b.y + b.h];
      const g = b.doorGap;
      // the rect and one notch: 8 corners, nothing of a partition or a furnishing
      const notch =
        b.doorFace === "east"
          ? [
              { x: east, y: g.y },
              { x: east - d, y: g.y },
              { x: east - d, y: g.y + g.h },
              { x: east, y: g.y + g.h },
            ]
          : [];
      const southNotch =
        b.doorFace === "south"
          ? [
              { x: g.x + g.w, y: south },
              { x: g.x + g.w, y: south - d },
              { x: g.x, y: south - d },
              { x: g.x, y: south },
            ]
          : [];
      expect(solids[i], b.name).toEqual([
        { x: b.x, y: b.y },
        { x: east, y: b.y },
        ...notch,
        { x: east, y: south },
        ...southNotch,
        { x: b.x, y: south },
      ]);
    });
    expect(HUB_TOWN_GOLDEN.buildings.map((b) => b.doorFace)).toContain("east");
  });

  describe("the moved chapel and its bell tower (FS-R4MYX §Change: the chapel moves to the far left, T26)", () => {
    const tower = HUB_TOWN_GOLDEN.bellTower;
    /** The town's walls with the bell tower's one wall, under its own house id (hubTown.fixture.ts). */
    const WITH_TOWER: WallState[] = [...WALLS, ...townWalls().filter((w) => w.position.x === tower.x && w.position.y === tower.y)];
    const solids = townMap({ walls: WITH_TOWER, gates: GATES }, TOWN).solids!(NORMAL);
    const chapel = HUB_TOWN_GOLDEN.buildings.find((b) => b.name === "Chapel")!;

    it("should carry the tower's wall in the state: one more wall than the buildings'", () => {
      expect(WITH_TOWER).toHaveLength(WALLS.length + 1);
    });

    it("should show the tower's block solid in the walls' ink, with no notch: its plain rect", () => {
      expect(solids).toHaveLength(HUB_TOWN_GOLDEN.buildings.length + 1);
      expect(solids.at(-1)).toEqual([
        { x: tower.x, y: tower.y },
        { x: tower.x + tower.w, y: tower.y },
        { x: tower.x + tower.w, y: tower.y + tower.h },
        { x: tower.x, y: tower.y + tower.h },
      ]);
    });

    it("should stand the block against the chapel's west side, within its depth", () => {
      expect(tower.x + tower.w).toBe(chapel.x);
      expect(tower.y).toBeGreaterThanOrEqual(chapel.y);
      expect(tower.y + tower.h).toBeLessThanOrEqual(chapel.y + chapel.h);
    });

    it("should show the chapel at its new place, its door notched on its east side", () => {
      const d = notchDepth(20, NORMAL);
      const [east, south] = [chapel.x + chapel.w, chapel.y + chapel.h];
      const g = chapel.doorGap;
      expect([chapel.x, chapel.y]).toEqual([220, 1300]);
      expect(solids[HUB_TOWN_GOLDEN.buildings.indexOf(chapel)]).toEqual([
        { x: chapel.x, y: chapel.y },
        { x: east, y: chapel.y },
        { x: east, y: g.y },
        { x: east - d, y: g.y },
        { x: east - d, y: g.y + g.h },
        { x: east, y: g.y + g.h },
        { x: east, y: south },
        { x: chapel.x, y: south },
      ]);
    });

    it("should change the other buildings' solids in nothing for the tower", () => {
      expect(solids.slice(0, -1)).toEqual(townMap({ walls: WALLS, gates: GATES }, TOWN).solids!(NORMAL));
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

describe("townMap with the door in the east wall (FS-R4MYX §B R11)", () => {
  it.each([[NORMAL], [1.5 / 12], [0.125]])(
    "should fill an east-door building solid, its door notched into its east side notchDepth deep, at scale %f",
    (k) => {
      const [solid, ...rest] = townMap({ walls: EAST_DOOR_WALLS }, HUB_SIZE).solids!(k);
      expect(rest).toEqual([]);
      const d = notchDepth(20, k);
      expect(solid).toEqual([
        { x: 660, y: 1040 },
        { x: 1140, y: 1040 },
        { x: 1140, y: 1170 },
        { x: 1140 - d, y: 1170 },
        { x: 1140 - d, y: 1250 },
        { x: 1140, y: 1250 },
        { x: 1140, y: 1380 },
        { x: 660, y: 1380 },
      ]);
    },
  );
});

// FS-P0HSP §C (I-P0HSP-2): the town's map marks.
describe("townMap marks (FS-P0HSP §C, I-P0HSP-2)", () => {
  const npc = (entity_id: string, fn: string, x: number, y: number) => ({
    entity_id,
    name: entity_id,
    function: fn as "",
    position: { x, y },
  });
  const ELDER = npc("elder", "storyteller", 1140, 680);
  const QUARTERMASTER = npc("quartermaster", "storekeeper", 1280, 270);
  const RESIDENT = npc("resident", "", 600, 700);
  const NPCS = [ELDER, QUARTERMASTER, RESIDENT];

  it("should mark the Spire's gate a tower, every other gate a teleport, the stash a chest and the Quartermaster a bag (§C.14)", () => {
    const { marks } = townMap({ walls: WALLS, gates: GATES, npcs: NPCS }, TOWN);
    expect(marks).toEqual([
      { kind: "tower", at: { x: 1000, y: 50 } },
      { kind: "teleport", at: { x: 40, y: 580 } },
      { kind: "teleport", at: { x: 1960, y: 360 } },
      { kind: "teleport", at: { x: 120, y: 900 } },
      { kind: "chest", at: HUB_STASH_CHEST.at },
      { kind: "bag", at: { x: 1280, y: 270 } },
    ]);
  });

  // Nick, 2026-11-12: "只是講故事的 NPC 不需要在地圖上標"
  it("should mark nothing for the Elder: a storyteller only tells a story, and is no lozenge either (§C.14, §C.15)", () => {
    const { marks } = townMap({ walls: WALLS, gates: [], npcs: [ELDER] }, TOWN);
    expect(marks).toEqual([{ kind: "chest", at: HUB_STASH_CHEST.at }]);
    expect(marks.some((m) => m.at.x === 1140 && m.at.y === 680)).toBe(false);
  });

  it("should mark nothing for an ambient resident, and a lozenge for a function the client has no glyph for (§C.14, §C.15)", () => {
    const { marks } = townMap({ walls: WALLS, gates: [], npcs: [RESIDENT, npc("smith", "smith", 1600, 200)] }, TOWN);
    expect(marks).toEqual([
      { kind: "chest", at: HUB_STASH_CHEST.at },
      { kind: "lozenge", at: { x: 1600, y: 200 } },
    ]);
  });

  it("should keep its key while only the residents walk, and change it when a function NPC or a gate does (§C.20)", () => {
    const key = townMap({ walls: WALLS, gates: GATES, npcs: NPCS }, TOWN).key;
    const walked = townMap({ walls: WALLS, gates: GATES, npcs: [ELDER, QUARTERMASTER, { ...RESIDENT, position: { x: 900, y: 650 } }] }, TOWN).key;
    expect(walked).toBe(key);
    const moved = townMap({ walls: WALLS, gates: GATES, npcs: [ELDER, { ...QUARTERMASTER, position: { x: 1290, y: 270 } }, RESIDENT] }, TOWN).key;
    expect(moved).not.toBe(key);
    expect(townMap({ walls: WALLS, gates: GATES, npcs: [ELDER, RESIDENT] }, TOWN).key).not.toBe(key);
  });
});

// FS-P0HSP §C.20 (review round 1): the town's plan built only when what it is built from changes,
// so the 30 Hz hub states of an unchanged town cost nothing but a short key.
describe("TownPlan (FS-P0HSP §A.4, §C.20)", () => {
  const npc = (entity_id: string, fn: string, x: number, y: number) => ({ entity_id, name: entity_id, function: fn as "", position: { x, y } });
  const QUARTERMASTER = npc("quartermaster", "storekeeper", 1280, 270);
  const ELDER = npc("elder", "storyteller", 1140, 680);
  const resident = (x: number) => npc("resident", "", x, 700);
  /** A hub state's town as a fresh broadcast parses it: new arrays and objects, the same content. */
  const broadcast = (npcs = [QUARTERMASTER, ELDER, resident(600)]) => ({
    walls: WALLS.map((w) => ({ ...w, position: { ...w.position } })),
    gates: GATES.map((g) => ({ ...g, position: { ...g.position } })),
    npcs: npcs.map((n) => ({ ...n, position: { ...n.position } })),
  });

  it("should build the town's map as townMap does", () => {
    const town = broadcast();
    const plan = new TownPlan(TOWN).of(town);
    const built = townMap(town, TOWN);
    expect(plan.key).toBe(built.key);
    expect(plan.marks).toEqual(built.marks);
    expect(plan.lines).toEqual(built.lines);
  });

  it("should hand back the plan it built, building nothing, while the town is unchanged state after state", () => {
    const plans = new TownPlan(TOWN);
    const first = plans.of(broadcast());
    expect(plans.of(broadcast())).toBe(first);
    // the same arrays again: not even a key to read
    const same = broadcast();
    const again = plans.of(same);
    expect(plans.of(same)).toBe(again);
    expect(again).toBe(first);
  });

  it("should build nothing while only the residents walk, or the Elder, who has no mark", () => {
    const plans = new TownPlan(TOWN);
    const first = plans.of(broadcast());
    expect(plans.of(broadcast([QUARTERMASTER, { ...ELDER, position: { x: 1150, y: 690 } }, resident(900)]))).toBe(first);
  });

  it("should build anew when the walls, a gate or a marked NPC change", () => {
    const plans = new TownPlan(TOWN);
    const first = plans.of(broadcast());
    const fewer = plans.of({ ...broadcast(), walls: WALLS.slice(1) });
    expect(fewer).not.toBe(first);
    expect(fewer.key).toBe(townMap({ ...broadcast(), walls: WALLS.slice(1) }, TOWN).key);
    const gateless = plans.of({ ...broadcast(), gates: GATES.slice(1) });
    expect(gateless).not.toBe(fewer);
    const moved = plans.of(broadcast([{ ...QUARTERMASTER, position: { x: 1290, y: 270 } }, ELDER]));
    expect(moved).not.toBe(gateless);
    expect(moved.marks.find((m) => m.kind === "bag")!.at).toEqual({ x: 1290, y: 270 });
  });
});
