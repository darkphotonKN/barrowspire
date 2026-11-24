/**
 * The town as game-server/game-service/internal/game/hub_map.go lays it out (FS-B0H2D R19, R23),
 * typed: the map's size (common/constants/game.go HubMapWidth × HubMapHeight), its buildings with
 * their partitions and furnishings, the fixed residents and the wandering residents' quarters, in
 * hub_map.go's order.
 *
 * `hubTown.golden.json` is written by the Go test that holds hub_map.go to it
 * (internal/game/hub_town_golden_test.go, `-update` to rewrite) and is never hand-edited. The
 * client's own copies of the town are held to it (HUB_FURNISHINGS and HUB_FIXED_RESIDENTS by
 * `hubInteriors.test.ts`; HUB_SIZE, HUB_DOOR_SPURS and HUB_KEEP_OUT.wander by
 * `hubKeepOut.test.ts`), and the test suites build their walls from it, door gaps included, so a
 * server change to the town fails one side or the other until both agree.
 *
 * Pure data, no Phaser. Read by tests; the scene takes its walls from the server.
 */
import golden from "./hubTown.golden.json";

/** A rect as hub_map.go writes it: top-left x, y and w × h, in world space. */
export interface TownRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The wall a town building's street door is cut in (FS-R4MYX §B R6): the south wall, as every
 * building's but the chapel's, or the east wall.
 */
export type DoorFace = "south" | "east";

export interface TownBuilding extends TownRect {
  name: string;
  /** The wall its street door is cut in. */
  doorFace: DoorFace;
  /**
   * The gap in its door face as the server cuts it: that wall's own rect between its two
   * segments. Centred, save the Inn's, which stands against its partition (ADR-0073).
   */
  doorGap: TownRect;
  /**
   * The wall dividing its rooms as walled: its segments either side of the door gap, each
   * reaching the footprint's edge end on. Empty for a one-room building.
   */
  partitions: TownRect[];
  furnishings: (TownRect & { kind: string })[];
}

export interface TownGolden {
  /** The hub's size, HubMapWidth × HubMapHeight (FS-R4MYX R1, R22). */
  mapSize: { w: number; h: number };
  buildings: TownBuilding[];
  fixedResidents: { name: string; x: number; y: number }[];
  /** Each wandering resident's quarter (hub_map.go hubResidents; FS-R4MYX R40). */
  wanderRegions: (TownRect & { name: string })[];
}

/** The golden's door face, refused if the server writes one the client does not know. */
function doorFace(face: string): DoorFace {
  if (face === "south" || face === "east") return face;
  throw new Error(`hubTown.golden.json: unknown doorFace "${face}"`);
}

export const HUB_TOWN_GOLDEN: TownGolden = {
  ...golden,
  buildings: golden.buildings.map((b) => ({ ...b, doorFace: doorFace(b.doorFace) })),
};
