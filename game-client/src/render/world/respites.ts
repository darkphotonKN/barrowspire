/**
 * A floor's respites on the canvas (FS-5FZ4J §J R51, R52): the healing fountain and the hallowed
 * altar, each drawn from its baked sheet on the resident `sealed` group at its server position, in
 * the frame its state names: the fountain full or dry, the altar dormant or prayed. The broadcast
 * is the whole truth: one no longer listed goes. The altar's sheet declares its candlelight, which
 * burns only while it is dormant (I-5FZ4J-8); the fountain declares none.
 *
 * The altar is the E target (Pray) in reach until it is prayed at; the fountain never is (it heals
 * whoever stands by it, on the server's tick). It drives the scene through the seal's own stage
 * ({@link SealStage}), so the scene draws, stands and lights a respite as it does a seal piece, and
 * is tested without a canvas, as `SummoningSet` is.
 */

import type { Point } from "@/render/iso/projection";
import type { FountainState, HallowedAltarState } from "@/types/gameState";
import type { SealStage } from "./seal";
import { fountainLook, hallowedAltarLook, type SealLook } from "./sealLooks";
import { INTERACT_RANGE } from "./stairs";

/** What E reaches here (R52): the hallowed altar, to Pray at. */
export type RespiteTarget = { kind: "hallowed_altar"; entityId: string };

/** The part of the seal's stage a respite needs: no decal, and one layer. */
export type RespiteStage<S extends { destroy(): void }> = Pick<SealStage<S>, "add" | "show" | "stand" | "glow">;

type Kind = "fountain" | "hallowed_altar";

interface Drawn<S> {
  entityId: string;
  sprite: S;
  pos: Point;
  look: SealLook;
  /** A hallowed altar not yet prayed at: its candles burn and E reaches it. Never the fountain. */
  dormant: boolean;
}

/** What one respite in its state draws, and whether it is a dormant altar. */
function respiteOf(kind: Kind, wire: FountainState | HallowedAltarState): { look: SealLook; dormant: boolean } {
  if (kind === "fountain") return { look: fountainLook((wire as FountainState).dry), dormant: false };
  const prayed = (wire as HallowedAltarState).prayed;
  return { look: hallowedAltarLook(prayed), dormant: !prayed };
}

export class RespiteSet<S extends { destroy(): void }> {
  private readonly drawn = new Map<Kind, Drawn<S>>();

  constructor(private readonly stage: RespiteStage<S>) {}

  /** Make the canvas match the broadcast. */
  sync(state: { fountain?: FountainState; hallowed_altar?: HallowedAltarState }): void {
    this.syncOne("fountain", state.fountain);
    this.syncOne("hallowed_altar", state.hallowed_altar);
  }

  /** The dormant hallowed altar the interact key reaches from `me`, or `null` (R52). */
  nearby(me: Point): RespiteTarget | null {
    const altar = this.drawn.get("hallowed_altar");
    if (!altar?.dormant || Math.hypot(me.x - altar.pos.x, me.y - altar.pos.y) >= INTERACT_RANGE) return null;
    return { kind: "hallowed_altar", entityId: altar.entityId };
  }

  /** The sprite drawn for one listed respite: what a prayer's bar stands over (R54). */
  drawnFor(entityId: string): S[] {
    return [...this.drawn.values()].filter((d) => d.entityId === entityId).map((d) => d.sprite);
  }

  /** Each respite drawn, with where it stands: what the hide rule and the fog read. */
  placed(): { readonly sprite: S; readonly pos: Point }[] {
    return [...this.drawn.values()].map(({ sprite, pos }) => ({ sprite, pos }));
  }

  /** Destroy both, the altar's candles out first, and forget them. */
  clear(): void {
    for (const d of this.drawn.values()) this.drop(d);
    this.drawn.clear();
  }

  /** Forget both without touching them: the scene has already destroyed its objects. */
  forget(): void {
    this.drawn.clear();
  }

  private syncOne(kind: Kind, wire: FountainState | HallowedAltarState | undefined): void {
    const held = this.drawn.get(kind);
    if (held && held.entityId !== wire?.entity_id) {
      this.drop(held);
      this.drawn.delete(kind);
    }
    if (!wire) return;

    const { look, dormant } = respiteOf(kind, wire);
    const pos = { x: wire.position.x, y: wire.position.y };
    const drawn = this.drawn.get(kind);
    if (!drawn) {
      const sprite = this.stage.add(look, pos, "standing", 0);
      if (dormant) this.stage.glow(sprite, pos, true);
      this.drawn.set(kind, { entityId: wire.entity_id, sprite, pos, look, dormant });
      return;
    }
    if (drawn.look.frame !== look.frame) {
      drawn.look = look;
      this.stage.show(drawn.sprite, look);
    }
    if (drawn.pos.x !== pos.x || drawn.pos.y !== pos.y) {
      drawn.pos = pos;
      this.stage.stand(drawn.sprite, pos, 0);
    }
    if (drawn.dormant !== dormant) {
      drawn.dormant = dormant;
      this.stage.glow(drawn.sprite, pos, dormant);
    }
  }

  private drop(d: Drawn<S>): void {
    if (d.dormant) this.stage.glow(d.sprite, d.pos, false);
    d.sprite.destroy();
  }
}
