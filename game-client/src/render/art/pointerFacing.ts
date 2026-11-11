/**
 * The pointer facing (FS-JS7C8 §D): the nearest of the 8 world facings from the local player's
 * character toward the world point under the pointer, moving or standing. Presentation only: no
 * aim, range, target or hit reads it (R25), and nothing is sent from here.
 *
 *   const facing = followPointer(this);              // in create(): one per world
 *   ...
 *   anim.face(facing(pos));                          // each frame, before anim.step
 */

import type * as Phaser from "phaser";
import { facingFrom, screenToWorld, type Facing8, type Point } from "@/render/iso";

/** The rule, Phaser-free: which way the character looks, given where the pointer is. */
export class PointerFacing {
  private facing?: Facing8;
  private followed = false;

  /** The pointer moved over the canvas: from now on the character turns to it. */
  moved(): void {
    this.followed = true;
  }

  /**
   * This frame's facing from `from` (the character's drawn world position) toward `pointer` (the
   * world point under the pointer, or undefined while it is off the canvas). Before the pointer
   * first moves in this world there is none, so the spawn facing stands; off the canvas, or
   * with the pointer on the character's own footprint, the last facing stays (R26).
   */
  follow(from: Point, pointer: Point | undefined): Facing8 | undefined {
    if (!this.followed || !pointer) return this.facing;
    const dx = pointer.x - from.x;
    const dy = pointer.y - from.y;
    if (dx !== 0 || dy !== 0) this.facing = facingFrom(dx, dy, "se");
    return this.facing;
  }
}

/**
 * A scene's pointer facing, for one visit of a world: follows the pointer once it moves over
 * the canvas, and is let go with the scene (R26: a new world starts without one). Each call
 * reads the pointer through the camera now, so the facing keeps up as the camera follows the
 * body.
 */
export function followPointer(scene: Phaser.Scene): (from: Point) => Facing8 | undefined {
  const facing = new PointerFacing();
  const moved = () => facing.moved();
  scene.input.on("pointermove", moved);
  scene.events.once("shutdown", () => scene.input?.off("pointermove", moved));
  return (from) => {
    if (!scene.input.isOver) return facing.follow(from, undefined);
    // Phaser types the result as `Vector2 | object`; with no output given it is a Vector2
    const screen = scene.input.activePointer.positionToCamera(scene.cameras.main) as Phaser.Math.Vector2;
    return facing.follow(from, screenToWorld(screen.x, screen.y));
  };
}
