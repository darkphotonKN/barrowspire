/**
 * Footprint hit-testing (FS-2325V §C.6, CONTEXT.md "Footprint"): a click lands on a world object
 * when the world point under the pointer is on the ground the object stands on, not when it
 * touches the object's sprite. A sprite is taller than its footprint; its head stands over other
 * ground.
 *
 * A living monster is also hit over its drawn body (FS-48CTQ §C.5, CONTEXT.md "Body column"):
 * {@link bodyHitArea}, a screen-space column standing on the same feet.
 */

import { screenToWorld, worldToScreen, type Point } from "@/render/iso";

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
 * The screen point under the pointer. Phaser calls a hit area with frame-local coordinates (from
 * the frame's top-left, unscaled: `InputManager.pointWithinHitArea`); this undoes that.
 */
function screenPoint(localX: number, localY: number, obj: Placed): Point {
  return {
    x: obj.x + (localX - obj.displayOriginX) * obj.scaleX,
    y: obj.y + (localY - obj.displayOriginY) * obj.scaleY,
  };
}

/**
 * A Phaser `hitAreaCallback` that hits a round footprint of `radius` world px around `centre()`.
 *
 *   sprite.setInteractive({ hitArea: {}, hitAreaCallback: footprintHitArea(() => pos, 20) });
 *
 * The screen point under the pointer is taken back through the projection into the world point
 * under it.
 */
export function footprintHitArea(centre: () => Point, radius: number) {
  return (
    _area: unknown,
    localX: number,
    localY: number,
    obj: Placed,
  ): boolean => {
    const s = screenPoint(localX, localY, obj);
    const p = screenToWorld(s.x, s.y);
    const c = centre();
    return Math.hypot(p.x - c.x, p.y - c.y) <= radius;
  };
}

/** A figure's drawn body, in screen px from its feet: half its width either side, and its height. */
export interface BodyColumn {
  halfWidth: number;
  height: number;
}

/**
 * A Phaser `hitAreaCallback` that hits the screen-space column a figure's body is drawn in: from
 * the projection of its world position `feet()` up `height` px, `halfWidth` px either side. It is
 * screen px, so the sprite's own scale does not enter it. Below the feet it misses; the footprint
 * has the ground.
 */
export function bodyHitArea(feet: () => Point, body: BodyColumn) {
  return (
    _area: unknown,
    localX: number,
    localY: number,
    obj: Placed,
  ): boolean => {
    const s = screenPoint(localX, localY, obj);
    const f = feet();
    const at = worldToScreen(f.x, f.y);
    const up = at.y - s.y;
    return Math.abs(s.x - at.x) <= body.halfWidth && up >= 0 && up <= body.height;
  };
}
