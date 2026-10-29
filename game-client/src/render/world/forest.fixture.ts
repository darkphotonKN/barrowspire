/**
 * The Forlorn Forest as the server's branching-trail generator lays it for seed 20261029
 * (game-server/game-service/internal/levelgen, `Generate(ForestParams, 20261029)`, the layout its
 * `testdata/forest-20261029.golden` draws). A test fixture only: the scene reads the Forest's walls,
 * gate and chests from the server's state, never from here.
 */

import type { Point, Rect } from "@/render/iso/projection";

export const FOREST_SIZE = { width: 2080, height: 1360 } as const;

/** Every wall rect, as broadcast: the generator's merged rects, top then left. */
export const FOREST_WALLS: readonly Rect[] = [
  { x: 0, y: 0, width: 2080, height: 80 },
  { x: 0, y: 80, width: 240, height: 160 },
  { x: 1200, y: 80, width: 880, height: 160 },
  { x: 0, y: 240, width: 320, height: 80 },
  { x: 480, y: 240, width: 320, height: 80 },
  { x: 960, y: 240, width: 80, height: 240 },
  { x: 1200, y: 240, width: 80, height: 80 },
  { x: 1440, y: 240, width: 640, height: 80 },
  { x: 0, y: 320, width: 800, height: 160 },
  { x: 1520, y: 320, width: 560, height: 160 },
  { x: 0, y: 480, width: 560, height: 80 },
  { x: 720, y: 480, width: 80, height: 80 },
  { x: 960, y: 480, width: 320, height: 80 },
  { x: 1440, y: 480, width: 640, height: 80 },
  { x: 0, y: 560, width: 480, height: 160 },
  { x: 960, y: 560, width: 1120, height: 240 },
  { x: 0, y: 720, width: 560, height: 80 },
  { x: 720, y: 720, width: 80, height: 80 },
  { x: 0, y: 800, width: 800, height: 160 },
  { x: 960, y: 800, width: 320, height: 240 },
  { x: 0, y: 960, width: 320, height: 80 },
  { x: 480, y: 960, width: 320, height: 80 },
  { x: 1440, y: 960, width: 640, height: 240 },
  { x: 0, y: 1040, width: 240, height: 160 },
  { x: 0, y: 1200, width: 320, height: 80 },
  { x: 480, y: 1200, width: 1600, height: 80 },
  { x: 0, y: 1280, width: 2080, height: 80 },
];

/** The entrance gate, inside the mouth on the east edge, leading to the hub. */
export const FOREST_GATE: Point = { x: 2040, y: 880 };

/** Each trail's clearing: its centre and radius, world px. The first ends the main trail. */
export const FOREST_CLEARINGS: readonly (Point & { radius: number })[] = [
  { x: 640, y: 640, radius: 160 },
  { x: 400, y: 1120, radius: 160 },
  { x: 400, y: 160, radius: 160 },
  { x: 1360, y: 400, radius: 160 },
];
