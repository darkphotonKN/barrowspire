/**
 * The UI scene's lore slot (FS-XWHZP §A–§C; FS-TQZ5J § Change: Merge with main, the owner's 2026-11-14
 * call 「蓋在面板上方」, overriding that change's note that the lines stay the run's): the run's lore lines,
 * which it drew for itself, now handed through the UI bridge as plain data (`lore`, ADR-0084: nothing
 * callable crosses), so they draw over the UI scene's panels as they drew over the run's own (ADR-0086
 * Decision 2.3, 1.3: a piece that comes to overlap a UI piece moves). The run says each line,
 * `{ text, tone }`, and a floor change's clear; the UI scene's one `LoreLines` owns the queue, the
 * timing, the dust and the relayout, unchanged. A line from a world not reported (one that has left, heard late) draws nothing, and the
 * lines and their queue go as the world leaves.
 *
 * Phaser-free: the UI scene hands it its lines (`mountLore`), so the wiring is tested on its own.
 */

import type Phaser from "phaser";
import { relayoutOn } from "@/render/viewport";
import { onSceneEnd } from "@/scenes/sceneEnd";
import type { LoreLine, LoreLines } from "./loreLine";
import type { UiBridge, World, WorldReport } from "./uiBridge";

/**
 * World → UI: a lore line to say (`say`), or every line down and the queue empty (`clear`, a floor
 * change, R15). Each names the world that sent it, so one sent late by a world that has left says nothing.
 */
export type LoreMessage = { readonly world: World } & (
  | { readonly kind: "say"; readonly line: LoreLine }
  | { readonly kind: "clear" }
);

/** What of the lines the slot drives. `LoreLines` is one. */
export type LorePiece = Pick<LoreLines, "say" | "relayout" | "clear">;

/**
 * The slot over `bridge`: told each world report, and none as a world leaves, and each line the world
 * says. Returns the stop. The UI scene's `mountLore` hears the bridge through this.
 */
export function hearLore(slot: UiLoreSlot, bridge: Pick<UiBridge, "world" | "onWorld" | "onScreen">): () => void {
  slot.world(bridge.world);
  const stopWorld = bridge.onWorld((report) => slot.world(report));
  const stopScreen = bridge.onScreen({ lore: (message) => slot.hear(message) });
  return () => {
    stopWorld();
    stopScreen();
  };
}

export class UiLoreSlot {
  /** The world whose lines are heard; none, no world reported. */
  private heardFor: World | null = null;

  constructor(
    private readonly bridge: Pick<UiBridge, "world">,
    private readonly lines: LorePiece,
  ) {}

  /** Another world, or a leave, takes every line down and empties the queue; the same world again keeps them. */
  world(report: WorldReport | null): void {
    if (report && report.world === this.heardFor) return;
    this.lines.clear();
    this.heardFor = report?.world ?? null;
  }

  /** What the world reported says: a line, or a clear. From any other world, nothing. */
  hear(message: LoreMessage): void {
    if (message.world !== this.heardFor || this.bridge.world?.world !== message.world) return;
    if (message.kind === "say") this.lines.say(message.line);
    else this.lines.clear();
  }

  /** The logical view changed: the line showing stands at its place in the new view (FS-ZAJMH R13). */
  relayout(): void {
    this.lines.relayout();
  }
}

/**
 * The lore slot on the UI scene, over its lines: heard from now on, relaid out with the view, deaf at
 * the scene's end (the lines let their own go with the scene, `LoreLines`).
 */
export function mountLore(scene: Phaser.Scene, bridge: UiBridge, lines: LorePiece): UiLoreSlot {
  const slot = new UiLoreSlot(bridge, lines);
  const stop = hearLore(slot, bridge);
  relayoutOn(scene, () => slot.relayout());
  onSceneEnd(scene, () => stop());
  return slot;
}
