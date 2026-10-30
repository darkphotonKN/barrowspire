/**
 * The Forlorn Forest as the server's branching-trail generator lays it for seed 20261029
 * (game-server/game-service/internal/levelgen, `Generate(ForestParams, 20261029)`, the layout its
 * `testdata/forest-20261029.golden` draws). A test fixture only: the scene reads the Forest's walls,
 * gate and chests from the server's state, never from here.
 */

import type { Point, Rect } from "@/render/iso/projection";

export const FOREST_SIZE = { width: 3120, height: 2000 } as const;

/** Every wall rect, as broadcast: the generator's merged rects, top then left. */
export const FOREST_WALLS: readonly Rect[] = [
  { x: 0, y: 0, width: 3120, height: 80 },
  { x: 0, y: 80, width: 1360, height: 80 },
  { x: 2000, y: 80, width: 80, height: 320 },
  { x: 2960, y: 80, width: 160, height: 560 },
  { x: 0, y: 160, width: 1280, height: 80 },
  { x: 0, y: 240, width: 1360, height: 160 },
  { x: 2320, y: 320, width: 400, height: 320 },
  { x: 0, y: 400, width: 1520, height: 80 },
  { x: 1600, y: 400, width: 160, height: 80 },
  { x: 0, y: 480, width: 1760, height: 400 },
  { x: 2000, y: 640, width: 640, height: 160 },
  { x: 3040, y: 640, width: 80, height: 400 },
  { x: 2000, y: 800, width: 560, height: 80 },
  { x: 0, y: 880, width: 560, height: 80 },
  { x: 640, y: 880, width: 560, height: 80 },
  { x: 1280, y: 880, width: 480, height: 80 },
  { x: 2000, y: 880, width: 640, height: 160 },
  { x: 0, y: 960, width: 400, height: 160 },
  { x: 800, y: 960, width: 240, height: 160 },
  { x: 1440, y: 960, width: 320, height: 80 },
  { x: 1680, y: 1040, width: 80, height: 560 },
  { x: 2000, y: 1040, width: 800, height: 80 },
  { x: 2880, y: 1040, width: 240, height: 80 },
  { x: 0, y: 1120, width: 320, height: 80 },
  { x: 880, y: 1120, width: 80, height: 80 },
  { x: 2000, y: 1120, width: 1120, height: 240 },
  { x: 0, y: 1200, width: 400, height: 160 },
  { x: 800, y: 1200, width: 240, height: 160 },
  { x: 0, y: 1360, width: 480, height: 160 },
  { x: 720, y: 1360, width: 480, height: 80 },
  { x: 1280, y: 1360, width: 160, height: 80 },
  { x: 720, y: 1440, width: 720, height: 240 },
  { x: 0, y: 1520, width: 240, height: 80 },
  { x: 320, y: 1520, width: 160, height: 80 },
  { x: 0, y: 1600, width: 80, height: 320 },
  { x: 1680, y: 1600, width: 400, height: 80 },
  { x: 2320, y: 1600, width: 800, height: 320 },
  { x: 0, y: 1920, width: 3120, height: 80 },
];

/** The entrance gate, inside the mouth on the east edge, leading to the hub. */
export const FOREST_GATE: Point = { x: 3080, y: 1480 };

/** Each trail's clearing: its centre and radius, world px. The first ends the main trail. */
export const FOREST_CLEARINGS: readonly (Point & { radius: number })[] = [
  { x: 1240, y: 1160, radius: 240 },
  { x: 600, y: 1160, radius: 240 },
  { x: 280, y: 1800, radius: 240 },
  { x: 1560, y: 200, radius: 240 },
  { x: 2840, y: 840, radius: 240 },
];
