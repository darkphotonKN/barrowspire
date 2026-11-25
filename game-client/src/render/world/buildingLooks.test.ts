import { describe, expect, it } from "vitest";
import { WORLD_PX_PER_TILE } from "@/render/iso";
import type { WallState } from "@/types/gameState";
import { BAKE } from "./bake";
import { doorGaps, doorHead, gapDoor, planBuildings, planCap } from "./buildingLooks";
import { EAST_DOOR_WALLS } from "./eastDoor.fixture";
import { housesFrom } from "./houses";
import { townOutline } from "./hubTown.fixture";
import { HUB_TOWN_GOLDEN } from "./hubTownGolden";
import { worldSeed } from "./ground";
import { HUB_INDOOR_DRESSING, townHouseLook } from "./hubInteriors";
import { MASONRY_WALLS, TIMBER_WALLS, planWalls, sideOf } from "./walls";

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
 * The client's town mirror (hub_map.go's buildings), walled as the server walls them, each on its
 * door face: the Inn's street gap off centre, against its partition (ADR-0073), the chapel's in its
 * east wall (FS-R4MYX R6).
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

describe("the town's other buildings beside the chapel's fixed kinds (FS-R4MYX §Change: windows match, W7)", () => {
  /** FNV-1a over a string: a short, stable fingerprint of a whole plan. */
  const fnv = (text: string) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
    return h.toString(16).padStart(8, "0");
  };
  /** Every piece and post of a building, by look: what it is drawn as, where, and how much of it. */
  const fingerprint = (plan: ReturnType<typeof planBuildings>[number]) =>
    fnv(
      JSON.stringify(
        (["shared", "interior", "exterior"] as const).map((look) => [
          plan[look].pieces.map((p) => [p.wallId, p.sheet, p.index, p.at, p.keep, p.depthAt]),
          plan[look].posts.map((p) => [p.wallId, p.sheet, p.at]),
        ]),
      ),
    );

  /** The town's buildings but the chapel, by name, with their house ids. */
  const others = TOWN.map((b, i) => ({ name: b.name, id: `b${i}` })).filter(({ name }) => name !== "Chapel");
  const lookOf = (id: string) => townHouseLook(housesFrom(TOWN_WALLS.filter((w) => w.house_id === id))[0]);
  /** Each house planned alone, in the sheets its look names, with no fixed kinds. */
  const alone = (seed: number, id: string) => {
    const own = TOWN_WALLS.filter((w) => w.house_id === id);
    return planBuildings(own, seed, lookOf(id).sheets)[0];
  };
  /**
   * Each house as the scene plans it (HubScene renderStructures): the town's walls grouped by the
   * sheets each look names, each group planned in one go with every house's fixed kinds from its look.
   */
  const asTheSceneDoes = (seed: number, id: string) => {
    const sheets = lookOf(id).sheets;
    const group = TOWN_WALLS.filter((w) => lookOf(w.house_id!).sheets === sheets);
    return planBuildings(group, seed, sheets, (h) => townHouseLook(h).fixed).find((p) => p.house.id === id)!;
  };

  // Pinned from the code at f9b572d3, before the chapel's fixed kinds landed: the Inn, the store
  // and the smithy plan the same pieces (sheet and index) as then, planned alone or as the scene
  // plans them. Keyed by name, so a failure says which house changed.
  it.each([
    ["alone", alone, 3, { Inn: "bebe208d", "Quartermaster's store": "ceae8ec4", Smithy: "a56cb400" }],
    ["alone", alone, worldSeed("hub"), { Inn: "6b2f2bbe", "Quartermaster's store": "acacb694", Smithy: "456f7e53" }],
    ["as the scene does", asTheSceneDoes, 3, { Inn: "bebe208d", "Quartermaster's store": "ceae8ec4", Smithy: "a56cb400" }],
    ["as the scene does", asTheSceneDoes, worldSeed("hub"), { Inn: "6b2f2bbe", "Quartermaster's store": "acacb694", Smithy: "456f7e53" }],
  ])("should plan every other building exactly as before, planned %s, seed %s", (_path, planOf, seed, before) => {
    expect(others).toHaveLength(3);
    const prints = Object.fromEntries(others.map(({ name, id }) => [name, fingerprint(planOf(seed, id))]));
    expect(prints).toEqual(before);
  });

  it("should plan a Spire room in masonry exactly as before", () => {
    const [room] = planBuildings(building(80, 60, 300, 200, "r"), 5, MASONRY_WALLS);
    expect(fingerprint(room)).toBe("c77694f0");
  });
});

describe("the chapel's fixed kinds: its window bays and the plain wall behind its hung dressing (FS-R4MYX §Change: windows match, W1–W7)", () => {
  const CHAPEL = `b${TOWN.findIndex((b) => b.name === "Chapel")}`;
  const OWN = TOWN_WALLS.filter((w) => w.house_id === CHAPEL);
  /** The chapel as the scene plans it: its own material, the kinds its look fixes. */
  const plan = (seed: number) => {
    const [p] = planBuildings(OWN, seed, townHouseLook(housesFrom(OWN)[0]).sheets, (h) => townHouseLook(h).fixed);
    return p;
  };
  const kindOf = (p: { sheet: string }) => p.sheet.split("_")[3];
  /** The wall's centrelines: north y 1310, south 1730, west x 230, east 830 (the chapel at (220, 1300), T1). */
  const [NORTH, SOUTH, WEST, EAST] = [1310, 1730, 230, 830];
  const north = (seed: number) => plan(seed).shared.pieces.filter((p) => p.axis === "x" && p.at.y === NORTH);
  const southOut = (seed: number) => plan(seed).exterior.pieces.filter((p) => p.axis === "x" && p.at.y === SOUTH);
  const lancetsAlong = (pieces: readonly { sheet: string; at: { x: number; y: number }; axis: string }[]) =>
    pieces.filter((p) => kindOf(p) === "lancet").map((p) => (p.axis === "x" ? p.at.x : p.at.y));

  it.each([3, worldSeed("hub")])("should stand a north inner lancet at exactly each south outward lancet's x, seed %s (W4)", (seed) => {
    const outside = lancetsAlong(southOut(seed));
    expect(outside.length).toBeGreaterThan(0);
    const inside = lancetsAlong(north(seed));
    expect(new Set(inside)).toEqual(new Set(outside));
    for (const p of north(seed).filter((q) => kindOf(q) === "lancet")) expect(p.sheet).toBe("chapel_wall_back_lancet_x");
  });

  it.each([3, worldSeed("hub")])(
    "should draw every kind the chapel fixes on a planned piece of that face and side, as named, seed %s (W1)",
    (seed) => {
      // the keys are world places: a moved wall or door gap that left one on no piece would quietly drop it
      const p = plan(seed);
      const house = housesFrom(OWN)[0];
      const fixed = townHouseLook(house).fixed!;
      const looks = { back: p.shared, front: p.interior, outward: p.exterior };
      const wallOf = new Map(OWN.map((w) => [w.entity_id, w]));
      let named = 0;
      for (const face of ["back", "front", "outward"] as const)
        for (const [side, kinds] of Object.entries(fixed[face] ?? {}))
          for (const [at, kind] of Object.entries(kinds.at)) {
            named++;
            const on = looks[face].pieces.filter(
              (q) => sideOf(wallOf.get(q.wallId)!, house) === side && (q.axis === "x" ? q.at.x : q.at.y) === Number(at),
            );
            expect(on.map(kindOf), `${face} ${side} at ${at}`).toEqual([kind]);
          }
      expect(named).toBeGreaterThan(0);
    },
  );

  it("should share one piece grid on the north and south walls: x 220–840, a piece every 40 px from 240 (W4)", () => {
    const xs = (pieces: readonly { at: { x: number } }[]) => pieces.map((p) => p.at.x);
    expect(xs(north(3))).toEqual(xs(southOut(3)));
    expect(xs(north(3))).toEqual(Array.from({ length: 16 }, (_, k) => 240 + 40 * k));
  });

  /** Every piece of a plan, in all three looks. */
  const allPiecesOf = (p: ReturnType<typeof plan>) => [...p.shared.pieces, ...p.interior.pieces, ...p.exterior.pieces];
  const allPieces = (seed: number) => allPiecesOf(plan(seed));
  /** The posts every look stands. */
  const allPosts = (seed: number) => {
    const p = plan(seed);
    return [...p.shared.posts, ...p.interior.posts, ...p.exterior.posts];
  };

  it("should fix every outward kind, the inner lancets and the plain pieces behind the hung dressing, whatever the seed (W1)", () => {
    const [a, b] = [plan(3), plan(worldSeed("hub"))];
    const fixed = (p: ReturnType<typeof plan>) => ({
      outward: p.exterior.pieces.map((q) => [q.at, q.sheet]),
      lancets: allPiecesOf(p).filter((q) => kindOf(q) === "lancet").map((q) => [q.at, q.sheet]),
      behind: p.shared.pieces.filter((q) => q.at.x === WEST && behindHung(q)).map((q) => [q.at, q.sheet]),
    });
    expect(fixed(a)).toEqual(fixed(b));
    // what the rule leaves open is hashed still: the variant frames, and the inner plain-or-pillar picks
    expect(a.exterior.pieces.map((q) => q.index)).not.toEqual(b.exterior.pieces.map((q) => q.index));
    const open = (p: ReturnType<typeof plan>) => p.shared.pieces.filter((q) => kindOf(q) !== "lancet" && !(q.at.x === WEST && behindHung(q)));
    expect(new Set([...open(a), ...open(b)].map(kindOf))).toEqual(new Set(["plain", "pillar"]));
  });

  it.each([3, worldSeed("hub")])("should stand no lancet on a trimmed piece or on a piece holding a post, seed %s (W2)", (seed) => {
    const lancets = allPieces(seed).filter((p) => kindOf(p) === "lancet");
    expect(lancets.length).toBeGreaterThan(0);
    for (const p of lancets) {
      expect(p.keep, `${p.sheet} at ${p.at.x}, ${p.at.y}`).toBe(1);
      const along = p.axis === "x" ? "x" : "y";
      const across = p.axis === "x" ? "y" : "x";
      const held = allPosts(seed).filter(
        (q) => q.at[across] === p.at[across] && Math.abs(q.at[along] - p.at[along]) < T / 2,
      );
      expect(held, `${p.sheet} at ${p.at.x}, ${p.at.y}`).toEqual([]);
    }
  });

  it("should alternate lancet and buttress along the south outward face, mirrored about x 530 (W3)", () => {
    const run = southOut(3).map((p) => ({ x: p.at.x, kind: kindOf(p) }));
    const lancets = run.flatMap((p, i) => (p.kind === "lancet" ? [i] : []));
    expect(lancets.length).toBeGreaterThan(1);
    // exactly one buttress between neighbouring lancets, and one outside the first and the last
    for (const [i, j] of lancets.slice(1).map((j, k) => [lancets[k], j])) {
      expect(j - i).toBe(2);
      expect(run[i + 1].kind).toBe("buttress");
    }
    expect(run[lancets[0] - 1].kind).toBe("buttress");
    expect(run[lancets.at(-1)! + 1].kind).toBe("buttress");
    // every other piece is plain
    const flanking = new Set(lancets.flatMap((i) => [i - 1, i, i + 1]));
    for (const [i, p] of run.entries()) if (!flanking.has(i)) expect(p.kind, `x ${p.x}`).toBe("plain");
    // each lancet's mirror about the wall's middle has a lancet within half a tile
    const xs = lancets.map((i) => run[i].x);
    for (const x of xs) expect(Math.min(...xs.map((m) => Math.abs(m - (2 * 530 - x)))), `x ${x}`).toBeLessThanOrEqual(T / 2);
  });

  it("should stand a lancet each side of the east door, none adjoining, mirrored about y 1520 (W5)", () => {
    const east = plan(3).exterior.pieces.filter((p) => p.axis === "y" && p.at.x === EAST);
    const segments = [...new Set(east.map((p) => p.wallId))];
    expect(segments).toHaveLength(2);
    const ys = lancetsAlong(east);
    for (const id of segments) expect(lancetsAlong(east.filter((p) => p.wallId === id)).length, id).toBeGreaterThan(0);
    for (const y of ys) {
      expect(ys.filter((o) => Math.abs(o - y) === T), `y ${y}`).toEqual([]);
      expect(Math.min(...ys.map((m) => Math.abs(m - (2 * 1520 - y)))), `y ${y}`).toBeLessThanOrEqual(T / 2);
    }
    for (const p of east.filter((q) => kindOf(q) !== "lancet")) expect(["plain", "buttress"]).toContain(kindOf(p));
  });

  /** The crucifix and murals on the west wall: their footprints along y. */
  const HUNG = HUB_INDOOR_DRESSING.filter((s) => s.sheet === "chapel_crucifix" || s.sheet === "chapel_mural");
  /** Whether a west piece's 40 px along the wall overlaps a hung piece's footprint. */
  const behindHung = (p: { at: { y: number } }) =>
    HUNG.some((s) => p.at.y - T / 2 < s.at.y + s.size[1] / 2 && s.at.y - s.size[1] / 2 < p.at.y + T / 2);

  it("should stand no lancet on the west wall, and plain pieces behind the crucifix and murals, whatever the seed (W6)", () => {
    expect(HUNG).toHaveLength(3);
    // enough seeds that a hashed pillar behind a hung piece would turn up
    for (const seed of [worldSeed("hub"), ...Array.from({ length: 24 }, (_, i) => i + 1)]) {
      const west = plan(seed).shared.pieces.filter((p) => p.axis === "y" && p.at.x === WEST);
      expect(west).toHaveLength(11);
      expect(west.filter((p) => kindOf(p) === "lancet")).toEqual([]);
      const behind = west.filter(behindHung);
      expect(behind.length).toBeGreaterThan(0);
      for (const p of behind) expect(p.sheet, `y ${p.at.y}, seed ${seed}`).toBe("chapel_wall_back_plain_y");
    }
  });

  it.each([3, worldSeed("hub")])("should keep the cut-away south and east fronts plain or pillar, never a lancet, seed %s (W7)", (seed) => {
    const fronts = plan(seed).interior.pieces;
    expect(fronts.length).toBeGreaterThan(0);
    for (const p of fronts) expect(p.sheet).toMatch(/^chapel_wall_front_(plain|pillar)_[xy]$/);
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
    // jamb on the partition's east face (ADR-0073), the store's and the smithy's centred, the
    // chapel's centred in its east wall (FS-R4MYX R6)
    expect(gaps).toEqual(
      TOWN.map(({ doorGap: g }, i) => ({
        houseId: `b${i}`,
        position: { x: g.x, y: g.y },
        width: g.w,
        height: g.h,
      })),
    );
    expect(gaps).toHaveLength(TOWN.length);
  });

  it("should find each gap in the wall on its building's door face (FS-R4MYX R6, R9)", () => {
    const along = (g: { width: number; height: number }) => (g.width > g.height ? "south" : "east");
    expect(doorGaps(TOWN_WALLS).map(along)).toEqual(TOWN.map((b) => b.doorFace));
    expect(TOWN.map((b) => b.doorFace)).toContain("east");
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

/**
 * Each town building's door gap with the axis its face gives it: along x in a south wall, along y
 * in an east wall (FS-R4MYX R9), and the gap's size along that axis.
 */
const TOWN_DOORS = doorGaps(TOWN_WALLS).map((gap, i) => {
  const axis = TOWN[i].doorFace === "east" ? ("y" as const) : ("x" as const);
  const [width, height] = axis === "x" ? [DOOR, THICK] : [THICK, DOOR];
  return [`${TOWN[i].name}'s ${TOWN[i].doorFace} door`, { gap, axis, width, height }] as const;
});

describe("gapDoor (FS-9PN7X §B.5, amended 2026-11-03)", () => {
  it.each(TOWN_DOORS)(
    "should hang a shut plank door, no lock on it, in the %s gap on its face's axis while the player is outside",
    (_, { gap, axis, width, height }) => {
      expect(gapDoor(gap, false)).toEqual({
        sheet: `door_${axis}`,
        frame: "shut",
        axis,
        at: { x: gap.position.x + width / 2, y: gap.position.y + height / 2 },
        depthAt: gap.position,
        rect: { x: gap.position.x, y: gap.position.y, width, height },
      });
    },
  );

  it.each(TOWN_DOORS)("should show the %s open while the player is inside its building", (_, { gap }) => {
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
  it.each(TOWN_DOORS)(
    "should close the %s gap over the door's lintel in the type's own wall, on its face's axis, sorted like the door",
    (_, { gap, axis, width, height }) => {
      expect(doorHead(gap, TIMBER_WALLS)).toEqual({
        sheet: `door_head_${axis}`,
        axis,
        at: { x: gap.position.x + width / 2, y: gap.position.y + height / 2 },
        depthAt: gap.position,
        rect: { x: gap.position.x, y: gap.position.y, width, height },
      });
    },
  );

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

describe("a town building's east door (FS-R4MYX §B R9; FS-MMA2H R8; ADR-0036)", () => {
  /** The east wall's centreline, and the gap's span along it. */
  const EAST_X = 1130;
  const [north, south] = [1170, 1250];
  /** The stretch of the east wall's line a piece's kept footprint covers. */
  const span = (p: { at: { y: number }; keep: number }) => [p.at.y - T / 2, p.at.y - T / 2 + p.keep * T];

  it("should find one gap on axis y in the east wall, the gap's own rect", () => {
    const gaps = doorGaps(EAST_DOOR_WALLS);
    expect(gaps).toEqual([{ houseId: "east-door", position: { x: 1120, y: north }, width: THICK, height: DOOR }]);
  });

  it("should hang a door_y in it, shut from outside and open from inside, at the gap's centre", () => {
    const [gap] = doorGaps(EAST_DOOR_WALLS);
    const shut = gapDoor(gap, false);
    expect(shut).toEqual({
      sheet: "door_y",
      frame: "shut",
      axis: "y",
      at: { x: EAST_X, y: 1210 },
      depthAt: { x: 1120, y: north },
      rect: { x: 1120, y: north, width: THICK, height: DOOR },
    });
    expect(gapDoor(gap, true)).toEqual({ ...shut, frame: "open" });
  });

  it.each([
    ["timber", TIMBER_WALLS, "door_head_y"],
    ["masonry", MASONRY_WALLS, "tower_door_head_y"],
  ])("should close the gap over the lintel with the %s head, sorted like the door under it", (_, sheets, sheet) => {
    const [gap] = doorGaps(EAST_DOOR_WALLS);
    expect(doorHead(gap, sheets)).toEqual({
      sheet,
      axis: "y",
      at: gapDoor(gap, false).at,
      depthAt: gapDoor(gap, false).depthAt,
      rect: gapDoor(gap, false).rect,
    });
  });

  it.each([
    ["timber", TIMBER_WALLS, ""],
    ["masonry", MASONRY_WALLS, "tower_"],
  ])("should post both jambs and draw nothing in the gap, in both %s looks", (_, sheets, prefix) => {
    const [plan] = planBuildings(EAST_DOOR_WALLS, 5, sheets);
    for (const [look, post] of [
      [plan.interior, `${prefix}post_front`],
      [plan.exterior, `${prefix}post_back`],
    ] as const) {
      // a post at each jamb: on the east wall's centreline, half the wall's thickness in from its end
      const onEast = look.posts.filter((p) => p.at.x === EAST_X);
      expect(onEast.map((p) => p.at.y)).toEqual(expect.arrayContaining([north - THICK / 2, south + THICK / 2]));
      for (const p of onEast) expect(p.sheet).toBe(post);
      // no post and no piece of the east wall stands in the gap
      expect(onEast.some((p) => p.at.y > north && p.at.y < south)).toBe(false);
      const pieces = look.pieces.filter((p) => p.axis === "y" && p.at.x === EAST_X);
      expect(pieces.length).toBeGreaterThan(0);
      for (const p of pieces) {
        const [from, to] = span(p);
        expect(to <= north + 1e-6 || from >= south - 1e-6, `${p.sheet} at ${from}–${to}`).toBe(true);
      }
    }
    // the south wall whole: its pieces run its length unbroken, none of the gap's posts on it
    const southPieces = plan.exterior.pieces.filter((p) => p.axis === "x" && p.at.y === 1370);
    expect(southPieces.reduce((n, p) => n + p.keep * T, 0)).toBeCloseTo(480);
  });

  it("should stand the east front full height outside, on the cut-away's footprint, in the outward face", () => {
    const [plan] = planBuildings(EAST_DOOR_WALLS, 5, MASONRY_WALLS);
    const shape = (p: (typeof plan.interior.pieces)[number]) => [p.wallId, p.at, p.depthAt, p.keep, p.axis];
    expect(plan.exterior.pieces.map(shape)).toEqual(plan.interior.pieces.map(shape));
    for (const p of plan.exterior.pieces) expect(p.sheet).toMatch(/^tower_wall_exterior_(plain|pillar)_[xy]$/);
    // the SE corner and the two jambs, cut away inside, columns outside
    expect(plan.interior.posts).toHaveLength(3);
    expect(plan.exterior.posts.map((p) => p.at)).toEqual(plan.interior.posts.map((p) => p.at));
  });
});
