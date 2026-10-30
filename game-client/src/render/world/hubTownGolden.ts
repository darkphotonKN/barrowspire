/**
 * The town as game-server/game-service/internal/game/hub_map.go lays it out (FS-B0H2D R19, R23),
 * typed: its buildings with their furnishings, and the fixed residents, in hub_map.go's order.
 *
 * `hubTown.golden.json` is written by the Go test that holds hub_map.go to it
 * (internal/game/hub_town_golden_test.go, `-update` to rewrite) and is never hand-edited. The
 * client's own copies of the town (HUB_FURNISHINGS, HUB_FIXED_RESIDENTS) are held to it by
 * `hubInteriors.test.ts`, and the test suites build their walls from it, so a server change to
 * the town fails one side or the other until both agree.
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

export interface TownBuilding extends TownRect {
  name: string;
  furnishings: (TownRect & { kind: string })[];
}

export interface TownGolden {
  buildings: TownBuilding[];
  fixedResidents: { name: string; x: number; y: number }[];
}

export const HUB_TOWN_GOLDEN: TownGolden = golden;
