/**
 * Stairs up on the canvas (FS-F6F88 req 27, 30): one interactable per stairs entity in the run's
 * state broadcast, diffed by `entity_id` like the switch and the escape door, and none on the top
 * floor, where the list is empty.
 *
 * The set drives the scene's objects through {@link StairsStage}, the narrow slice of Phaser it
 * needs, so it is tested without a canvas.
 */

import type { Point } from "@/render/iso/projection";
import type { StairsState } from "@/types/gameState";

/**
 * World px from a delver to an interactable's centre within which the interact key reaches it:
 * the server's default interact range, the same the switch and the escape door use.
 */
export const INTERACT_RANGE = 60;

/** What the set asks of the scene: draw a stairs at a world point, or move one there. */
export interface StairsStage<S extends { destroy(): void }> {
  add(at: Point): S;
  stand(sprite: S, at: Point): void;
}

export class StairsSet<S extends { destroy(): void }> {
  private readonly drawn = new Map<string, { sprite: S; pos: Point }>();

  constructor(private readonly stage: StairsStage<S>) {}

  /** Make the canvas match the broadcast: the broadcast is the whole truth. */
  sync(stairs: StairsState[]): void {
    const present = new Set(stairs.map((s) => s.entity_id));
    for (const [id, drawn] of this.drawn) {
      if (present.has(id)) continue;
      drawn.sprite.destroy();
      this.drawn.delete(id);
    }

    for (const s of stairs) {
      const pos = { x: s.position.x, y: s.position.y };
      const drawn = this.drawn.get(s.entity_id);
      if (!drawn) {
        this.drawn.set(s.entity_id, { sprite: this.stage.add(pos), pos });
      } else if (drawn.pos.x !== pos.x || drawn.pos.y !== pos.y) {
        drawn.pos = pos;
        this.stage.stand(drawn.sprite, pos);
      }
    }
  }

  /** The stairs the interact key reaches from `me`, or `null`. */
  nearby(me: Point): string | null {
    for (const [id, { pos }] of this.drawn) {
      if (Math.hypot(me.x - pos.x, me.y - pos.y) < INTERACT_RANGE) return id;
    }
    return null;
  }

  /** Destroy every stairs and forget it. */
  clear(): void {
    for (const { sprite } of this.drawn.values()) sprite.destroy();
    this.drawn.clear();
  }

  /** Forget every stairs without touching it: the scene has already destroyed its objects. */
  forget(): void {
    this.drawn.clear();
  }
}
