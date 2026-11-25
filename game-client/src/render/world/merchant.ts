/**
 * The wandering merchant on the canvas (FS-9JV5K §F R21, §G R26): the third respite, drawn at his
 * server position from his own sheet on the on-demand `merchant` group (`NPC_ART`, ADR-0071 Decision
 * 6), and until it lands as his stand-in, the mercenary's resident base sheet under its wash. The
 * group is asked for the first time a state carries him, whether or not he is in sight; once it is
 * in he is re-dressed on his own sprite. His nameplate and lantern light come with his body: the
 * scene's stage makes them with it and lets them go with it.
 *
 * The broadcast is the whole truth: a merchant no longer listed goes (a new floor's has another
 * entity id). He is the E target in reach (the wares panel), and the latest wares he lists are held
 * for the panel. Pure, so it is tested without a canvas, as {@link RespiteSet} is.
 */

import type { Point } from "@/render/iso/projection";
import { npcArtFor } from "@/render/art/sceneArt";
import type { LightSource } from "@/render/lighting/lighting";
import { palette } from "@/utils/canvasPalette";
import type { MerchantState } from "@/types/gameState";
import { INTERACT_RANGE } from "./stairs";

/** What his body draws: a sheet, under a multiply tint while it is the stand-in. */
export interface MerchantLook {
  sheet: string;
  tint?: number;
}

/** What E reaches here (R21): the merchant, to open his wares panel. */
export type MerchantTarget = { kind: "merchant"; entityId: string };

/** The scene's side: his body, with its nameplate and lantern, drawn, re-dressed and stood. */
export interface MerchantStage<S extends { destroy(): void }> {
  /** His body in `look` at `at`, his nameplate and lantern light with it; destroying it takes them too. */
  add(look: MerchantLook, at: Point): S;
  /** His body, on its own sprite, in another look: his own sheet landed. */
  wear(body: S, look: MerchantLook): void;
  stand(body: S, at: Point): void;
}

/** The art he is drawn from: whether a sheet is in, and the scene's on-demand fetch (`onDemandArt`). */
export interface MerchantArt {
  has(sheet: string): boolean;
  fetch(group: string, landed: () => void): void;
}

/**
 * How far under his sheet's crown (its head's top, screen px) the lantern's lit glass hangs: the pack's
 * arm hangs it out beside his head, its glass a little below his hat's crown (the bake's `peddlerPack`).
 */
const GLASS_UNDER_CROWN = 6;
/** Where his sheet measures no crown (the stand-in without one): about a head's height up, at his hat. */
const UNMEASURED_LIFT = 80;

/**
 * His soft lantern light (R21), at `feet` (screen px): a small warm pool at the lit glass, hung beside
 * his head, so lifted from `crown` (his sheet's head height over its anchor, screen px, as drawn),
 * brighter at its heart than an interactable's glint and far softer than a sconce, flickering as a
 * flame does. Amber, because the player can act on him (guideline "Gameplay accent"). One of the
 * floor's fixed lights, kind `merchant_lantern`.
 */
export function merchantLantern(feet: Point, seed: number, crown?: number): LightSource {
  const lift = crown === undefined ? UNMEASURED_LIFT : crown - GLASS_UNDER_CROWN;
  return {
    x: feet.x,
    y: feet.y - lift,
    radius: 120,
    color: palette.merchantLantern,
    intensity: 0.42,
    flicker: 0.18,
    seed,
  };
}

/** His row of `NPC_ART`: his group, his sheet and his stand-in. */
const ROW = npcArtFor("merchant");

interface Drawn<S> {
  entityId: string;
  body: S;
  pos: Point;
  look: MerchantLook;
}

export class MerchantSet<S extends { destroy(): void }> {
  private drawn?: Drawn<S>;
  private latest?: MerchantState;

  constructor(
    private readonly stage: MerchantStage<S>,
    /** Read at each use: the scene's art and fetch stand only once it has created. */
    private readonly art: () => MerchantArt | undefined,
  ) {}

  /** Make the canvas match the broadcast. */
  sync(state: { merchant?: MerchantState }): void {
    const wire = state.merchant;
    this.latest = wire;
    if (this.drawn && this.drawn.entityId !== wire?.entity_id) this.drop();
    if (!wire) return;

    const pos = { x: wire.position.x, y: wire.position.y };
    if (!this.drawn) {
      this.fetchOwn();
      const look = this.look();
      this.drawn = { entityId: wire.entity_id, body: this.stage.add(look, pos), pos, look };
      return;
    }
    if (this.drawn.pos.x !== pos.x || this.drawn.pos.y !== pos.y) {
      this.drawn.pos = pos;
      this.stage.stand(this.drawn.body, pos);
    }
  }

  /** The merchant as the latest broadcast lists him, wares and all; none without one. */
  current(): MerchantState | undefined {
    return this.latest;
  }

  /** The merchant E reaches from `me`, with how far he stands: what E weighs against the other targets in reach. */
  reach(me: Point): { target: MerchantTarget; distance: number } | null {
    const d = this.drawn;
    if (!d) return null;
    const distance = Math.hypot(me.x - d.pos.x, me.y - d.pos.y);
    if (distance >= INTERACT_RANGE) return null;
    return { target: { kind: "merchant", entityId: d.entityId }, distance };
  }

  /** His body, with where he stands: what the hide rule and the fog read. */
  placed(): { readonly sprite: S; readonly pos: Point }[] {
    return this.drawn ? [{ sprite: this.drawn.body, pos: this.drawn.pos }] : [];
  }

  /** Destroy his body and forget him. */
  clear(): void {
    this.drop();
    this.latest = undefined;
  }

  /** Forget him without touching his body: the scene has already destroyed its objects. */
  forget(): void {
    this.drawn = undefined;
    this.latest = undefined;
  }

  /** His own sheet once it is in, else his stand-in (ADR-0071 Decision 3). */
  private look(): MerchantLook {
    if (!ROW || this.art()?.has(ROW.sheet)) return { sheet: ROW?.sheet ?? "npc_merchant" };
    return { sheet: ROW.standIn.sheet, ...(ROW.standIn.tint === undefined ? {} : { tint: ROW.standIn.tint }) };
  }

  /** Asks for his group if it is not in; the fetch itself is once a scene. */
  private fetchOwn(): void {
    const art = this.art();
    if (ROW && art && !art.has(ROW.sheet)) art.fetch(ROW.group, () => this.landed());
  }

  /** His group is in: the body drawn now, if any, wears his own sheet. */
  private landed(): void {
    const d = this.drawn;
    if (!d) return;
    const look = this.look();
    if (look.sheet === d.look.sheet) return;
    d.look = look;
    this.stage.wear(d.body, look);
  }

  private drop(): void {
    this.drawn?.body.destroy();
    this.drawn = undefined;
  }
}
