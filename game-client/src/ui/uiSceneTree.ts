/**
 * The passive tree on the UI scene (FS-8RZ51 §G R32–R37, R41; ADR-0084, ADR-0086 rules 1.1, 1.2): the
 * overlay, built for each world reported and taken down as it leaves, as the gear overlay is
 * (`uiSceneGear.ts`). It reads the own-player state each world already hands the gear every tick (the
 * gear message `seen`, its `character`, R41), so no world changes for it and no new request crosses the
 * bridge.
 *
 * P and the corner row's tree icon toggle it (R32), under the gear overlay's refusals: the menu slot
 * filled, or the world's `blockers().gear` (R36). It is a window of the gear overlay's family: opening it
 * closes Inventory and Character and asks the world to close its letter panel, as the gear's opening
 * does; opening either gear panel closes it (the gear slot's `opened`). Its open state is a part of the
 * UI's state (`reportUi({ tree })`), so the bridge's `gearOpened` ends a world's aim as it opens and the
 * interface sounds' window rule plays the character panel's open and close for it (v1). The run's end
 * clears it, silently. While the player holds unspent points it sets the corner icon's marker (R33).
 *
 * In town a node's press spends through the tree's own commands (R38; ADR-0085 Decision 2), handed in
 * as `commands`, never a bridge request; the slot claims their refusals as it mounts and hands each to
 * the tree standing.
 *
 * Phaser-free: the UI scene hands it the builder (`mountPassiveTree` on itself), so the wiring is tested
 * on its own.
 */

import type { CharacterSource } from "./characterSheet";
import type { PassiveTreeCommands } from "./passiveTreeCommands";
import type { TreeSource } from "./passiveTreeModel";
import type { GearMessage, UiBridge, World, WorldReport } from "./uiBridge";

/** The overlay as the UI scene keeps it. `PassiveTreeOverlay` is one. */
export interface TreePiece {
  isOpen(): boolean;
  open(): void;
  close(): void;
  /** The own player's state now: drawn at once while open, and as it opens (R41). */
  show(source: TreeSource | undefined): void;
  /** A move over the UI scene, logical units: its hovers and tooltips. */
  pointerMove(x: number, y: number): void;
  /** A press over the UI scene, logical units: whether it was the overlay's. */
  pointerDown(x: number, y: number): boolean;
  /** Whether an object Phaser lists under the pointer is the overlay's own ground. */
  owns(object: unknown): boolean;
  /** The server refused a spend: its reason, in the server's words (R38, R21). */
  refused(reason: string): void;
  relayout(): void;
  destroy(): void;
}

/** What a world's tree is built with. */
export interface TreeWiring {
  /** The world it stands in: outside the town its footer says points are spent in town (R38). */
  world: World;
  /** Its own × pressed: it closes through the UI scene's act, its state reported after. */
  dismiss: () => void;
  /** Spends a point on a node up to a target rank, through the tree's own commands (R38); whether it went. */
  spend: (nodeId: string, rank: number) => boolean;
}

/** What the slot reaches beside the bridge: the gear it closes as it opens, the corner icon's marker. */
export interface TreeDeps {
  /** The gear overlay's Inventory and Character close as the tree opens (R36). */
  gear?: { close(): boolean };
  /** The corner icon's marker, on while the player holds unspent points (R33). */
  marker?: (on: boolean) => void;
  /**
   * The tree's own commands (R38; ADR-0085 Decision 2): each world's tree spends through them, and the
   * slot claims their refusals as it mounts, open or not, so none reaches the session's global handler.
   */
  commands?: PassiveTreeCommands;
}

/** What of the bridge the slot reads, asks, acts and reports through. */
export type TreeBridge = Pick<UiBridge, "world" | "ui" | "act" | "request" | "reportUi">;

export class UiTreeSlot {
  private piece: TreePiece | null = null;
  /** The world the standing piece was built for. */
  private builtFor: World | null = null;
  /** The own player's state the world last handed: kept across worlds, so a new world's tree has it. */
  private last: TreeSource | undefined;
  /** The marker as last set, so a tick that changes nothing sets nothing. */
  private marked: boolean | undefined;

  constructor(
    private readonly bridge: TreeBridge,
    private readonly build: (world: World, wiring: TreeWiring) => TreePiece,
    private readonly deps: TreeDeps = {},
  ) {
    // a refusal heard with no tree standing is dropped: the spend it answers went with its world
    deps.commands?.onRefused((reason) => this.piece?.refused(reason));
  }

  /** Heard each world report, and none as the world leaves: a tree for the world reported, kept while it stands. */
  show(report: WorldReport | null): void {
    if (report && this.piece && this.builtFor === report.world) return;
    this.takeDown();
    if (!report) return;
    this.piece = this.build(report.world, {
      world: report.world,
      dismiss: () => this.bridge.act(() => void this.close()),
      spend: (nodeId, rank) => this.deps.commands?.spend(nodeId, rank) ?? false,
    });
    this.builtFor = report.world;
  }

  isOpen(): boolean {
    return this.piece?.isOpen() ?? false;
  }

  /**
   * The corner row's tree icon, and P inside the UI scene's act (R32): refused while the menu slot is
   * filled or the world turns the gear away (R36). Opening it closes the gear overlay and asks the world
   * to close its letter panel, as a gear panel's opening does.
   */
  toggle(): void {
    const piece = this.piece;
    const report = this.bridge.world;
    if (!piece || !report || this.bridge.ui.menuOpen || report.blockers().gear) return;
    if (piece.isOpen()) piece.close();
    else {
      this.deps.gear?.close();
      this.bridge.request({ kind: "close", window: "letter" });
      piece.open();
      piece.show(this.last);
    }
    this.report();
  }

  /** P (R32): the toggle through the UI scene's act, refused as the gear's keys are after the run's end. */
  key(): void {
    const report = this.bridge.world;
    if (!report || !this.piece || this.bridge.ui.menuOpen || report.facts().ended) return;
    this.bridge.act(() => this.toggle());
  }

  /** It closes: Esc's tree step, the menu opening, a gear panel opening. Whether it was open. */
  close(): boolean {
    const was = this.isOpen();
    this.piece?.close();
    this.report();
    return was;
  }

  /** The world's gear data (R41): its `seen` character is the tree's too; the marker follows its points (R33). */
  hear(message: GearMessage): void {
    if (message.kind !== "seen" || !message.character) return;
    this.last = treeSource(message.character);
    if (this.piece?.isOpen()) this.piece.show(this.last);
    const on = (this.last.passive_points ?? 0) > 0;
    if (on === this.marked) return;
    this.marked = on;
    this.deps.marker?.(on);
  }

  /**
   * A move over the UI scene, logical units, with what Phaser lists under the pointer: the open tree's,
   * unless another piece drawn over it (the party panel) is the top object there, when it hears none.
   */
  pointerMove(x: number, y: number, over: readonly unknown[]): void {
    const piece = this.piece;
    if (!piece?.isOpen()) return;
    if (this.under(piece, over)) piece.pointerMove(-1, -1);
    else piece.pointerMove(x, y);
  }

  /** A press over the UI scene: the open tree's only on its own ground; whether it took it. */
  pointerDown(x: number, y: number, over: readonly unknown[]): boolean {
    const piece = this.piece;
    if (!piece?.isOpen() || this.under(piece, over)) return false;
    return piece.pointerDown(x, y);
  }

  /** Whether another piece is the top object under the pointer. */
  private under(piece: TreePiece, over: readonly unknown[]): boolean {
    return over.length > 0 && !piece.owns(over[0]);
  }

  /** The run's end appeared: it closes outside any player action, so it plays nothing (R36). */
  endPopped(): void {
    this.piece?.close();
    this.report();
  }

  relayout(): void {
    this.piece?.relayout();
  }

  destroy(): void {
    this.takeDown();
  }

  private report(): void {
    this.bridge.reportUi({ tree: this.isOpen() });
  }

  private takeDown(): void {
    const piece = this.piece;
    this.piece = null;
    this.builtFor = null;
    if (!piece) return;
    piece.close();
    piece.destroy();
    this.report();
  }
}

/** What the tree reads of the character the world handed (R41). */
function treeSource(character: CharacterSource): TreeSource {
  const { class: className, level, passive_ranks, passive_points } = character;
  return { class: className, level, passive_ranks, passive_points };
}
