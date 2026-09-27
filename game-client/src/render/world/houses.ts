import type { Point } from "@/render/iso";
import type { WallState } from "@/types/gameState";

/**
 * A house: the world rect its walls enclose. Walls carry the id of the house they belong to, so
 * the rect is the bounding box of that group, never a second list of coordinates to drift out of
 * step with the server's. Presentation only: the server owns collision.
 */
export interface House {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Every house the walls describe, in the order their first wall appears. */
export function housesFrom(walls: readonly WallState[]): House[] {
  const bounds = new Map<
    string,
    { minX: number; minY: number; maxX: number; maxY: number }
  >();
  for (const w of walls) {
    if (!w.house_id) continue;
    const b = bounds.get(w.house_id) ?? {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    b.minX = Math.min(b.minX, w.position.x);
    b.minY = Math.min(b.minY, w.position.y);
    b.maxX = Math.max(b.maxX, w.position.x + w.width);
    b.maxY = Math.max(b.maxY, w.position.y + w.height);
    bounds.set(w.house_id, b);
  }
  return [...bounds].map(([id, b]) => ({
    id,
    x: b.minX,
    y: b.minY,
    width: b.maxX - b.minX,
    height: b.maxY - b.minY,
  }));
}

/**
 * Whether a world position stands in a house: the scene's inside test, edges inclusive
 * (FS-2325V "Edge States": the projection does not change it).
 */
export function insideHouse(p: Point, h: House): boolean {
  return (
    p.x >= h.x && p.x <= h.x + h.width && p.y >= h.y && p.y <= h.y + h.height
  );
}
