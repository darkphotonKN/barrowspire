import { worldToScreen } from "./projection";

/**
 * Which of eight world directions a character faces. FS-2325V §A.6.
 *
 * World compass, not screen: `n` is world -y, `e` is world +x. That matches how
 * the bake turns a model (in 45° steps on the ground plane under the fixed
 * isometric camera), so on screen `n` is drawn up-right, as in UO.
 * Presentation only; nothing here is sent to the server.
 */
export type Facing8 = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

/** The four facings today's placeholder character textures were drawn in (screen axes). */
export type ScreenFacing = "up" | "down" | "left" | "right";

/** Counter-clockwise from east in a y-up frame, one per 45° sector. */
const COMPASS: Facing8[] = ["e", "ne", "n", "nw", "w", "sw", "s", "se"];

/**
 * The facing for a world velocity, snapped to the nearest 45°. Standing still
 * keeps `current` rather than snapping to a default.
 */
export function facingFrom(vx: number, vy: number, current: Facing8): Facing8 {
  if (vx === 0 && vy === 0) return current;

  // world y grows southward; flip it so the angle runs counter-clockwise
  const angle = Math.atan2(-vy, vx);
  const sector = Math.round(angle / (Math.PI / 4));

  return COMPASS[(sector + 8) % 8];
}

const UNIT: Record<Facing8, [number, number]> = {
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
  nw: [-1, -1],
};

/**
 * The placeholder texture nearest a world facing once it is projected: the
 * dominant screen axis of the direction as drawn. Stands in until the 8-way
 * character sheets exist (FS-2325V §E).
 */
export function nearestScreenFacing(facing: Facing8): ScreenFacing {
  const [dx, dy] = UNIT[facing];
  const s = worldToScreen(dx, dy);

  if (Math.abs(s.y) > Math.abs(s.x)) return s.y < 0 ? "up" : "down";

  return s.x < 0 ? "left" : "right";
}
