/**
 * The Tome of Filth and the Altar of Consecration on the canvas (FS-3103M §I R27): each drawn from
 * its baked sheet on the resident `summoning` group (§H R23) at its server position, the altar in
 * its `dormant` or `burned` frame. The broadcast is the whole truth: a tome no longer listed
 * (taken, or cut by distance) goes, and an altar is on its floor only.
 *
 * The set drives the scene's objects through {@link SummoningStage}, the narrow slice of Phaser it
 * needs, so it is tested without a canvas, as `StairsSet` is.
 */

import type { Point } from "@/render/iso/projection";
import type { AltarState, TomeState } from "@/types/gameState";
import { INTERACT_RANGE } from "./stairs";

/** The tome's sheet and its one still frame. */
export const TOME = { sheet: "tome", frame: "default" } as const;

/** The altar's sheet: two states framed together, so the swap never moves it (§H R23). */
export const ALTAR = { sheet: "altar" } as const;

export type AltarFrame = "dormant" | "burned";

/** The frame the altar shows for its server state. */
export function altarFrame(burned: boolean): AltarFrame {
  return burned ? "burned" : "dormant";
}

/** A piece's sheet and the frame it shows. */
export interface SummoningLook {
  sheet: string;
  frame: string;
}

/** What E reaches here: the tome to take, or the altar to burn it at. */
export type SummoningTarget = { kind: "tome"; entityId: string } | { kind: "altar"; entityId: string };

/** What the set asks of the scene: draw a piece at a world point, show a frame on it, move it. */
export interface SummoningStage<S extends { destroy(): void }> {
  add(look: SummoningLook, at: Point): S;
  show(sprite: S, look: SummoningLook): void;
  stand(sprite: S, at: Point): void;
}

type Kind = SummoningTarget["kind"];

interface Drawn<S> {
  entityId: string;
  sprite: S;
  pos: Point;
  frame: string;
  /** Whether E reaches it: a listed tome, an altar not yet burned. */
  reachable: boolean;
}

export class SummoningSet<S extends { destroy(): void }> {
  private readonly drawn = new Map<Kind, Drawn<S>>();

  constructor(private readonly stage: SummoningStage<S>) {}

  /** Make the canvas match the broadcast. */
  sync(state: { tome?: TomeState; altar?: AltarState }): void {
    this.syncOne("tome", state.tome, TOME.frame, true);
    const altar = state.altar;
    this.syncOne("altar", altar, altarFrame(altar?.burned === true), altar?.burned !== true);
  }

  private syncOne(
    kind: Kind,
    entity: { entity_id: string; position: Point } | undefined,
    frame: string,
    reachable: boolean,
  ): void {
    const drawn = this.drawn.get(kind);
    if (drawn && drawn.entityId !== entity?.entity_id) {
      drawn.sprite.destroy();
      this.drawn.delete(kind);
    }
    if (!entity) return;

    const sheet = kind === "tome" ? TOME.sheet : ALTAR.sheet;
    const pos = { x: entity.position.x, y: entity.position.y };
    const held = this.drawn.get(kind);
    if (!held) {
      this.drawn.set(kind, { entityId: entity.entity_id, sprite: this.stage.add({ sheet, frame }, pos), pos, frame, reachable });
      return;
    }
    held.reachable = reachable;
    if (held.frame !== frame) {
      held.frame = frame;
      this.stage.show(held.sprite, { sheet, frame });
    }
    if (held.pos.x !== pos.x || held.pos.y !== pos.y) {
      held.pos = pos;
      this.stage.stand(held.sprite, pos);
    }
  }

  /** The tome or unburned altar the interact key reaches from `me`, or `null` (R27). */
  nearby(me: Point): SummoningTarget | null {
    for (const [kind, { entityId, pos, reachable }] of this.drawn) {
      if (reachable && Math.hypot(me.x - pos.x, me.y - pos.y) < INTERACT_RANGE) return { kind, entityId };
    }
    return null;
  }

  /** Each piece drawn, with where it stands: what the hide rule and the fog read. */
  placed(): { readonly sprite: S; readonly pos: Point }[] {
    return [...this.drawn.values()].map(({ sprite, pos }) => ({ sprite, pos }));
  }

  /** Destroy both and forget them. */
  clear(): void {
    for (const { sprite } of this.drawn.values()) sprite.destroy();
    this.drawn.clear();
  }

  /** Forget both without touching them: the scene has already destroyed its objects. */
  forget(): void {
    this.drawn.clear();
  }
}
