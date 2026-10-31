import { describe, expect, it } from "vitest";
import type { Point, Rect } from "@/render/iso/projection";
import type { ClientGameState } from "@/types/gameState";
import {
  FOREST_CLEARINGS,
  FOREST_GATE,
  FOREST_SIZE,
  FOREST_WALLS,
} from "./forest.fixture";
import {
  VERGE_DEPTH,
  forestStatics,
  planVerges,
  type VergeLean,
} from "./forestDressing";
import { FOREST_LOOK } from "./fieldLook";
import { worldSeed } from "./ground";
import { dressingBreaches } from "./runDressing";

const LEAN: VergeLean = {
  count: 48,
  weights: [
    [40, "fern"],
    [60, "toadstools"],
    [75, "stump"],
    [90, "fallen_log"],
    [100, "bone_pile"],
  ],
};
const SEED = 0x4649_4531;

const asWall = (r: Rect, i: number) => ({
  id: `w${i}`,
  position: { x: r.x, y: r.y },
  width: r.width,
  height: r.height,
});

/** The Forest's broadcast as the scene sees it: walls, the road home and one clearing's chest. */
const CHEST: Point = { x: FOREST_CLEARINGS[1].x, y: FOREST_CLEARINGS[1].y };
const STATE = {
  walls: FOREST_WALLS.map(asWall),
  gates: [{ id: "g", position: FOREST_GATE, range: 80, destination: "hub" }],
  containers: [
    { id: "c", kind: "chest", position: CHEST, isOpen: false, items: [] },
  ],
} as unknown as Pick<ClientGameState, "walls" | "gates" | "containers">;

const statics = forestStatics(STATE, FOREST_SIZE.width, FOREST_SIZE.height);
const pieces = planVerges(LEAN, SEED, statics);

/** Distance from a point to the nearest point of a rect. */
const reach = (p: Point, r: Rect) =>
  Math.hypot(
    Math.max(r.x - p.x, 0, p.x - r.x - r.width),
    Math.max(r.y - p.y, 0, p.y - r.y - r.height),
  );

describe("forestStatics (FS-3QHQZ §Requirements 28)", () => {
  it("should keep out of the walls, the gate's reach, the chests and the map edge, from the broadcast", () => {
    expect(statics.walls).toHaveLength(FOREST_WALLS.length);
    expect(statics.doors).toHaveLength(1);
    expect(statics.interactables).toEqual([CHEST]);
    expect({ width: statics.width, height: statics.height }).toEqual(
      FOREST_SIZE,
    );
  });

  it("should keep out of a clearing's sack as of its chest (FS-1D6BX §Requirements 14)", () => {
    const SACK: Point = { x: FOREST_CLEARINGS[2].x, y: FOREST_CLEARINGS[2].y };
    const withSack = {
      ...STATE,
      containers: [
        ...STATE.containers!,
        { container_id: "s", entity_id: "s1", kind: "sack", position: SACK, is_open: true, items: [] },
        { container_id: "p", entity_id: "p1", kind: "drop_pile", position: FOREST_GATE, is_open: true, items: [] },
      ],
    } as Pick<ClientGameState, "walls" | "gates" | "containers">;

    expect(forestStatics(withSack, FOREST_SIZE.width, FOREST_SIZE.height).interactables).toEqual([CHEST, SACK]);
  });
});

describe("planVerges (FS-3QHQZ §Requirements 28)", () => {
  it("should strew a forest's worth of ferns, stumps, logs, toadstools and bones", () => {
    expect(pieces.length).toBeGreaterThan(LEAN.count / 2);
    expect(pieces.length).toBeLessThanOrEqual(LEAN.count);
    expect(new Set(pieces.map((p) => p.sheet))).toEqual(
      new Set(["fern", "toadstools", "stump", "fallen_log", "bone_pile"]),
    );
  });

  it("should never place a piece inside the keep-out", () => {
    for (const p of pieces)
      expect(
        dressingBreaches({ from: p.at, to: p.at, r: p.r }, statics),
        `${p.sheet} at ${p.at.x},${p.at.y}`,
      ).toEqual([]);
  });

  it("should strew the trail's verges, never a clearing's middle", () => {
    for (const p of pieces) {
      const nearest = Math.min(...FOREST_WALLS.map((w) => reach(p.at, w)));
      expect(nearest).toBeLessThanOrEqual(VERGE_DEPTH);
      for (const c of FOREST_CLEARINGS)
        expect(Math.hypot(p.at.x - c.x, p.at.y - c.y)).toBeGreaterThan(
          c.radius / 2,
        );
    }
  });

  it("should strew the Forest look's whole verge count along its 3-cell trails (FS-KSD6K §Requirements 17)", () => {
    const lean = FOREST_LOOK.verges;
    // today's density held: twice the trail of the 2 080 x 1 360 Forest, which strewed 37
    expect(lean.count).toBeGreaterThanOrEqual(70);
    for (const seed of [SEED, worldSeed("field")])
      expect(planVerges(lean, seed, statics), `seed ${seed}`).toHaveLength(
        lean.count,
      );
  });

  it("should be decoration only: nothing tall, nothing to click", () => {
    expect(pieces.every((p) => !p.tall)).toBe(true);
  });

  it("should strew the same verges on every client", () => {
    expect(planVerges(LEAN, SEED, statics)).toEqual(pieces);
  });
});
