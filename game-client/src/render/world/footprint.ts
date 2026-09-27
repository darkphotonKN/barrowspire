/**
 * Footprint hit-testing (FS-2325V §C.6, CONTEXT.md "Footprint"): a click lands on a world object
 * when the world point under the pointer is on the ground the object stands on, not when it
 * touches the object's sprite. A sprite is taller than its footprint; its head stands over other
 * ground.
 */

import { screenToWorld, type Point } from "@/render/iso";

/** What the callback needs from the Game Object Phaser passes it. */
interface Placed {
  x: number;
  y: number;
  displayOriginX: number;
  displayOriginY: number;
  scaleX: number;
  scaleY: number;
}

/**
 * A Phaser `hitAreaCallback` that hits a round footprint of `radius` world px around `centre()`.
 *
 *   sprite.setInteractive({ hitArea: {}, hitAreaCallback: footprintHitArea(() => pos, 20) });
 *
 * Phaser calls it with frame-local coordinates (from the frame's top-left); they are turned back
 * into the screen point, then through the projection into the world point under the pointer.
 */
export function footprintHitArea(centre: () => Point, radius: number) {
  return (
    _area: unknown,
    localX: number,
    localY: number,
    obj: Placed,
  ): boolean => {
    const sx = obj.x + (localX - obj.displayOriginX) * obj.scaleX;
    const sy = obj.y + (localY - obj.displayOriginY) * obj.scaleY;
    const p = screenToWorld(sx, sy);
    const c = centre();
    return Math.hypot(p.x - c.x, p.y - c.y) <= radius;
  };
}
