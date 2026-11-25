/**
 * The UI scene's HUD slot (FS-TQZ5J § Change: Batch 5, R67–R73): the Health and resource bars and the level
 * bar, which each world drew for itself and now hands through the UI bridge as plain data (`hud`), and the
 * ability bar, a UI-scene piece from the start (FS-Q18Q3 §L R40–R43). The slot builds each piece for the
 * world reported, where that world stands it, on the first message that shows it, and takes them all down
 * as the world leaves, so the next world's are new (a new level bar takes its first state as its baseline,
 * FS-BDA7X req 43).
 *
 * Phaser-free: the UI scene hands it the builders (`hudPieces` on itself), so the wiring is tested on its
 * own. The pieces' own rules (a redraw only on a change, the cue on a rise) are theirs, unchanged; the slot
 * only tells the level bar where the ability bar's top stands, so the cue rises over it (FS-Q18Q3 R12, R43).
 */

import type { AbilityBarView } from "./abilityBarView";
import type { Progress } from "./progress";
import { RESOURCE_HUD_AT } from "./ResourceHud";
import type { HudBar } from "./resources";
import type { RollPipView } from "./rollPipView";
import type { SealWindowView } from "./sealWindow";
import { STATUS_MARKS_AT, type StatusMark } from "./statusMarks";
import type { UiBridge, World, WorldReport } from "./uiBridge";

/**
 * World → UI: a HUD piece's data (R68): the ability bar's view or none (`abilityBar`, `runOwnHud`; FS-Q18Q3
 * R40), the bars (`hudBars`), the player's progress (`progressOf`). Each names the world that sent it
 * (§ Change: Batch 6, R137), so one sent late by a world that has left reaches none of the next world's
 * pieces.
 */
export type HudMessage = { readonly world: World } & (
  | { readonly kind: "bar"; readonly bar: AbilityBarView | null }
  | { readonly kind: "bars"; readonly bars: HudBar[] }
  | { readonly kind: "progress"; readonly progress: Progress }
  // a Braziers window's countdown while one runs, none between (FS-5FZ4J §J R53)
  | { readonly kind: "window"; readonly window: SealWindowView | null }
  // the player's lasting statuses beside their own health bar: the Blessing (FS-5FZ4J §J R55)
  | { readonly kind: "statusMarks"; readonly marks: StatusMark[] }
  // the contract's heading under the notices while it is active, none otherwise (FS-4EC7Z §G R34)
  | { readonly kind: "contract"; readonly line: string | null }
  // the roll cooldown pip beside the ability bar, in a run alone; none before the first state (FS-7P736 R16)
  | { readonly kind: "roll"; readonly roll: RollPipView | null }
);

export type HudKind = HudMessage["kind"];

/** A screen point, logical units: a piece's top-left corner. */
export interface HudPoint {
  readonly x: number;
  readonly y: number;
}

/** A HUD piece as the slot keeps it. `AbilityBar`, `ResourceHud` and `ProgressHud` are each one. */
export interface HudPiece<V> {
  show(view: V): void;
  /** The logical view changed: back to its anchor. */
  relayout?(): void;
  destroy(): void;
}

/** The ability bar as the slot keeps it (FS-Q18Q3 R41): it says where its top stands while it is up. */
export interface AbilityBarPiece extends HudPiece<AbilityBarView | null> {
  /** The bar's top (its key plaques' top) while it stands; none while it is down. */
  top(): number | null;
}

/** The level bar as the slot keeps it: told where the ability bar's top stands, or none (FS-Q18Q3 R12). */
export interface ProgressPiece extends HudPiece<Progress> {
  cueOver(top: number | null): void;
}

/** How the slot builds each piece, at its place: the UI scene's real pieces, or a test's. */
export interface HudBuild {
  /** The ability bar places itself, above the level bar (FS-Q18Q3 §B, `abilityBarLayout`). */
  bar(): AbilityBarPiece;
  bars(at: HudPoint): HudPiece<HudBar[]>;
  /** The level bar places itself, along the bottom middle of every world (FS-77DVN §A, `xpBarLayout`). */
  progress(): ProgressPiece;
  /** The Braziers window's countdown places itself, at the top centre (FS-5FZ4J §J R53, `sealWindowFrame`). */
  window(): HudPiece<SealWindowView | null>;
  /** The status marks, from their first one's top-left (FS-5FZ4J §J R55, `statusMarkRects`). */
  statusMarks(at: HudPoint): HudPiece<StatusMark[]>;
  /** The contract's heading line places itself, under the notices at the top centre (FS-4EC7Z §G R34, `contractLineAt`). */
  contract(): HudPiece<string | null>;
  /** The roll pip places itself, one gap right of the ability bar (FS-7P736 R16, `rollPipFrame`). */
  roll(): HudPiece<RollPipView | null>;
}

interface HudPlaces {
  /** The ability bar stands in this world: where, its own layout says (FS-Q18Q3 §B, R29). */
  readonly bar?: true;
  readonly bars?: HudPoint;
  /** The level bar stands in this world: where, its own layout says (FS-77DVN §A). */
  readonly progress?: true;
  /** A sealed floor's Braziers window counts down in this world: a run's alone. */
  readonly window?: true;
  /** The player's status marks stand here, beside the health bar: a run's alone, as the Blessing is. */
  readonly statusMarks?: HudPoint;
  /** A contract's heading line stands in this world: a run's alone, where contracts are taken. */
  readonly contract?: true;
  /** The roll pip stands beside the ability bar in this world: a run's alone, where the roll is (FS-7P736 R13). */
  readonly roll?: true;
}

/**
 * Where each world stands each piece (R69; FS-77DVN; FS-Q18Q3 R29): the level bar in every world, along the
 * bottom middle by its own layout (§A, §C.13); the bars in the very top left of a run and a field (§E.17);
 * the ability bar above the level bar in a run and a field, never the hub. A piece with no place in a world
 * is never drawn there.
 */
export const HUD_PLACES: Readonly<Record<World, HudPlaces>> = {
  hub: { progress: true },
  field: { progress: true, bars: RESOURCE_HUD_AT.field, bar: true },
  run: { progress: true, bars: RESOURCE_HUD_AT.run, bar: true, window: true, statusMarks: STATUS_MARKS_AT, contract: true, roll: true },
};

interface HudStanding {
  bar?: AbilityBarPiece;
  bars?: HudPiece<HudBar[]>;
  progress?: ProgressPiece;
  window?: HudPiece<SealWindowView | null>;
  statusMarks?: HudPiece<StatusMark[]>;
  contract?: HudPiece<string | null>;
  roll?: HudPiece<RollPipView | null>;
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
      case "bar":
        if (!places.bar) return;
        (pieces.bar ??= this.build.bar()).show(message.bar);
        this.tellCue();
        return;
      case "bars":
        if (places.bars) (pieces.bars ??= this.build.bars(places.bars)).show(message.bars);
        return;
      case "progress":
        if (!places.progress) return;
        if (!pieces.progress) {
          pieces.progress = this.build.progress();
          this.tellCue();
        }
        pieces.progress.show(message.progress);
        return;
      case "window":
        // built on the first window, never for none
        if (!places.window || (!pieces.window && !message.window)) return;
        (pieces.window ??= this.build.window()).show(message.window);
        return;
      case "statusMarks":
        // built on the first mark, never for none
        if (!places.statusMarks || (!pieces.statusMarks && message.marks.length === 0)) return;
        (pieces.statusMarks ??= this.build.statusMarks(places.statusMarks)).show(message.marks);
        return;
      case "contract":
        // built on the first line, never for none
        if (!places.contract || (!pieces.contract && message.line === null)) return;
        (pieces.contract ??= this.build.contract()).show(message.line);
        return;
      case "roll":
        // built on the first pip, never for none
        if (!places.roll || (!pieces.roll && !message.roll)) return;
        (pieces.roll ??= this.build.roll()).show(message.roll);
        return;
    }
  }

  /** The logical view changed: the standing pieces back to their anchors (FS-ZAJMH R13). */
  relayout(): void {
    for (const piece of this.standing()) piece.relayout?.();
    this.tellCue();
  }

  destroy(): void {
    this.takeDown();
    this.builtFor = null;
  }

  /**
   * The level bar told where the ability bar's top stands, or none while no bar stands (FS-Q18Q3 R12): both
   * are this slot's, so nothing crosses the bridge for it (R43).
   */
  private tellCue(): void {
    this.pieces.progress?.cueOver(this.pieces.bar?.top() ?? null);
  }

  private standing(): HudPiece<never>[] {
    return Object.values(this.pieces) as HudPiece<never>[];
  }

  private takeDown(): void {
    for (const piece of this.standing()) piece.destroy();
    this.pieces = {};
  }
}
