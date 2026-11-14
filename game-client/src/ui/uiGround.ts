/**
 * A UI piece's ground on the UI scene (FS-TQZ5J § Change: Phase 2: the party, R40): an interactive
 * rect that draws nothing, standing under the piece's own buttons, so Phaser stops a press, a wheel or
 * a move on the piece at the UI scene (R7) rather than handing it to the world. Made before the
 * buttons at the piece's depth, it lies under them: Phaser hit-tests equal depths in display order.
 */

import type Phaser from "phaser";
import type { Rect } from "./partyPanelLayout";

/** Makes a ground, and hands back its taking down. */
export type GroundMaker = (rect: Rect) => { destroy(): void };

/** A ground for `scene`'s pieces at `depth`: a zone, held against the screen, no hand cursor. */
export function uiGround(scene: Phaser.Scene, depth: number): GroundMaker {
  return (rect) =>
    scene.add
      .zone(rect.x, rect.y, rect.width, rect.height)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(depth)
      .setInteractive();
}
