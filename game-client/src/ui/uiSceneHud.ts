/**
 * The UI scene's HUD slot (FS-TQZ5J § Change: Batch 5, R67–R73): the ability card, the potion cell, the
 * Health and resource bars and the level bar, which each world drew for itself and now hands through the
 * UI bridge as plain data (`hud`). The slot builds each piece for the world reported, where that world
 * stood it, on the first message that shows it, and takes them all down as the world leaves, so the next
 * world's are new (a new level bar takes its first state as its baseline, FS-BDA7X req 43).
 *
 * Phaser-free: the UI scene hands it the builders (`hudPieces` on itself), so the wiring is tested on its
 * own. The pieces' own rules (a redraw only on a change, the cue on a rise) are theirs, unchanged.
 */

import type { Placement } from "@/render/viewport";
import type { AbilityCardView } from "./abilityCard";
import { ABILITY_CARD_PLACE } from "./hudCornerLayout";
import { POTION_CELL_GAP, type PotionCellView } from "./potions";
import type { Progress } from "./progress";
import { HUD_COLUMN_W, RESOURCE_HUD_AT } from "./ResourceHud";
import type { HudBar } from "./resources";
import type { UiBridge, World, WorldReport } from "./uiBridge";

/**
 * World → UI: a HUD piece's data (R68), sent where the world showed the piece before: the ability card's
 * view or none (`abilityCard`), the potion cell's or none (`potionCell`), the bars (`hudBars`), the
 * player's progress (`progressOf`). Each names the world that sent it (§ Change: Batch 6, R137), so one
 * sent late by a world that has left reaches none of the next world's pieces.
 */
export type HudMessage = { readonly world: World } & (
  | { readonly kind: "ability"; readonly card: AbilityCardView | null }
  | { readonly kind: "potion"; readonly cell: PotionCellView | null }
  | { readonly kind: "bars"; readonly bars: HudBar[] }
  | { readonly kind: "progress"; readonly progress: Progress }
);

export type HudKind = HudMessage["kind"];

/** A screen point, logical units: a piece's top-left corner. */
export interface HudPoint {
  readonly x: number;
  readonly y: number;
}

/** A HUD piece as the slot keeps it. `AbilityHud`, `PotionHud`, `ResourceHud` and `ProgressHud` are each one. */
export interface HudPiece<V> {
  show(view: V): void;
  /** The logical view changed: back to its anchor. */
  relayout?(): void;
  destroy(): void;
}

/** How the slot builds each piece, at its place: the UI scene's real pieces, or a test's. */
export interface HudBuild {
  ability(place: Placement): HudPiece<AbilityCardView | null>;
  potion(at: HudPoint): HudPiece<PotionCellView | null>;
  bars(at: HudPoint): HudPiece<HudBar[]>;
  /** The level bar places itself, along the bottom middle of every world (FS-77DVN §A, `xpBarLayout`). */
  progress(): HudPiece<Progress>;
}

interface HudPlaces {
  readonly ability?: Placement;
  readonly potion?: HudPoint;
  readonly bars?: HudPoint;
  /** The level bar stands in this world: where, its own layout says (FS-77DVN §A). */
  readonly progress?: true;
}

/**
 * Where each world stands each piece (R69; FS-77DVN): the level bar in every world, along the bottom
 * middle by its own layout (§A, §C.13); a field's bars in its corner and the card above the corner row;
 * the run's bars in the very top left, as a field's (§E.17), the potion cell right of them and the card.
 * A piece with no place in a world is never drawn there.
 */
export const HUD_PLACES: Readonly<Record<World, HudPlaces>> = {
  hub: { progress: true },
  field: { progress: true, bars: RESOURCE_HUD_AT.field, ability: ABILITY_CARD_PLACE },
  run: {
    progress: true,
    bars: RESOURCE_HUD_AT.run,
    potion: { x: RESOURCE_HUD_AT.run.x + HUD_COLUMN_W + POTION_CELL_GAP, y: RESOURCE_HUD_AT.run.y },
    ability: ABILITY_CARD_PLACE,
  },
};

interface HudStanding {
  ability?: HudPiece<AbilityCardView | null>;
  potion?: HudPiece<PotionCellView | null>;
  bars?: HudPiece<HudBar[]>;
  progress?: HudPiece<Progress>;
}

/**
 * The slot over `bridge` (R67; § Change: Batch 6, R138): built for the world reported now and each one
 * after, taken down as each leaves, fed what each hands. Returns the stop. The UI scene's `mountHud` and
 * the tests' stand-in both hear the bridge through this, one wiring.
 */
export function hearHud(slot: UiHudSlot, bridge: Pick<UiBridge, "world" | "onWorld" | "onScreen">): () => void {
  slot.world(bridge.world);
  const stopWorld = bridge.onWorld((report) => slot.world(report));
  const stopScreen = bridge.onScreen({ hud: (message) => slot.hear(message) });
  return () => {
    stopWorld();
    stopScreen();
  };
}

export class UiHudSlot {
  private pieces: HudStanding = {};
  /** The world the standing pieces were built for; none, no world reported. */
  private builtFor: World | null = null;

  constructor(
    private readonly bridge: Pick<UiBridge, "world">,
    private readonly build: HudBuild,
  ) {}

  /**
   * Heard each world report, and none as the world leaves (R67): another world, or a leave, takes every
   * piece down; a report of the world they stand for keeps them.
   */
  world(report: WorldReport | null): void {
    if (report && report.world === this.builtFor) return;
    this.takeDown();
    this.builtFor = report?.world ?? null;
  }

  /**
   * What the world reported hands (R68): its piece built at its place on the first, shown each time. A
   * message from any other world (one that has left, heard late) draws nothing (§ Change: Batch 6, R137).
   */
  hear(message: HudMessage): void {
    const world = message.world;
    if (world !== this.builtFor || this.bridge.world?.world !== world) return;
    const places = HUD_PLACES[world];
    const pieces = this.pieces;
    switch (message.kind) {
      case "ability":
        if (places.ability) (pieces.ability ??= this.build.ability(places.ability)).show(message.card);
        return;
      case "potion":
        if (places.potion) (pieces.potion ??= this.build.potion(places.potion)).show(message.cell);
        return;
      case "bars":
        if (places.bars) (pieces.bars ??= this.build.bars(places.bars)).show(message.bars);
        return;
      case "progress":
        if (places.progress) (pieces.progress ??= this.build.progress()).show(message.progress);
        return;
    }
  }

  /** The logical view changed: the standing pieces back to their anchors (FS-ZAJMH R13). */
  relayout(): void {
    for (const piece of this.standing()) piece.relayout?.();
  }

  destroy(): void {
    this.takeDown();
    this.builtFor = null;
  }

  private standing(): HudPiece<never>[] {
    return Object.values(this.pieces) as HudPiece<never>[];
  }

  private takeDown(): void {
    for (const piece of this.standing()) piece.destroy();
    this.pieces = {};
  }
}
