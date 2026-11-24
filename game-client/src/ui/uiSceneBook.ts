/**
 * The class book on the UI scene (FS-X2CMM §G R36–R39; ADR-0084, ADR-0086): the book's window, built for
 * the run as it is reported and taken down as it leaves, as the passive tree is (`uiSceneTree.ts`). It
 * stands in a run only: the hub and the fields build none, so K and the corner icon do nothing there
 * (the icon greyed, `uiSceneCorner.ts`). It reads the own-player state each world already hands the
 * gear every tick (the gear message `seen`, its `character`): the owner's book, level and class
 * resource. No world changes for it.
 *
 * K and the corner row's book icon toggle it, refused while the menu slot is filled, after the run's
 * end and once the player is out of the delve. It is one of the windows: its opening closes the gear
 * overlay and the passive tree, which stand where it does; it steps aside, silently, when any other
 * window opens after it (`sync`, each frame, as the controls panel does, FS-84N1G R16); Esc closes it
 * (`escapeOrder.ts`). Its open state is a part of the UI's state (`reportUi({ book })`), so the bridge's
 * `gearOpened` ends a world's aim as it opens and the interface sounds' window rule plays for it. The
 * game never pauses: the world goes on under it, and only a press on its own ground is its (R39).
 *
 * A press on a page is handed to `pick`, the hook slice 11 (I-X2CMM-11) fills: there the run arms the
 * page through a new `UiRequest` kind, or casts a none or self page at once (§H R40, R44a). In this
 * slice a page takes the press and nothing more happens.
 *
 * Phaser-free: the UI scene hands it the builder (`mountClassBook` on itself), so the wiring is tested on
 * its own.
 */

import type { CharacterSource } from "./characterSheet";
import type { BookSource, PageView } from "./classBookModel";
import type { GearMessage, UiBridge, World, WorldReport } from "./uiBridge";

/** The book's window as the UI scene keeps it. `ClassBookPanel` is one. */
export interface BookPiece {
  isOpen(): boolean;
  open(): void;
  close(): void;
  /** The owner's state now, and when it was heard (on the slot's clock, ms): drawn at once while open, and as it opens. */
  show(source: BookSource | undefined, heardAt: number): void;
  /** Each frame while open, on the slot's clock: a recovering page's sweep runs down (R38). */
  frame(now: number): void;
  /** A move over the UI scene, logical units: its hover and tip (R37). */
  pointerMove(x: number, y: number): void;
  /** A press over the UI scene, logical units: whether it was the book's. */
  pointerDown(x: number, y: number): boolean;
  /** Whether an object Phaser lists under the pointer is the book's own ground. */
  owns(object: unknown): boolean;
  relayout(): void;
  destroy(): void;
}

/** What a run's book is built with. */
export interface BookWiring {
  /** Its own × pressed: it closes through the UI scene's act, its state reported after. */
  dismiss: () => void;
  /** A page pressed: slice 11's arming hook (`UiBookSlot.pick`). */
  pick: (page: PageView) => void;
}

/**
 * The other windows the book steps aside for (R36), each open or not, the UI scene's to say: the menu
 * slot, the gear overlay's panels and the stash, the container view, the party panel, the settlement
 * record, the letter panel, the passive tree and the controls panel.
 */
export type BookOthers = Readonly<Partial<Record<"menu" | "inventory" | "character" | "stash" | "container" | "party" | "record" | "letter" | "tree" | "controls", boolean>>>;

/** What the slot reaches beside the bridge. */
export interface BookDeps {
  /** The gear overlay's Inventory and Character, closed as the book opens. */
  gear?: { close(): boolean };
  /** The passive tree, closed as the book opens. */
  tree?: { close(): boolean };
  /** The other windows now; none, none is open. */
  others?: () => BookOthers;
  /** The slot's clock, ms: when a state was heard, and each frame. The page's, unless a test hands its own. */
  now?: () => number;
}

/** What of the bridge the slot reads, asks, acts and reports through. */
export type BookBridge = Pick<UiBridge, "world" | "ui" | "act" | "request" | "reportUi">;

export class UiBookSlot {
  private piece: BookPiece | null = null;
  /** The owner's state the world last handed, and when: kept across worlds, so the run's book has it at once. */
  private last: BookSource | undefined;
  private heardAt = 0;
  /** The other windows as last read: at the last `sync`, or as the book opened. */
  private seen: BookOthers = {};

  constructor(
    private readonly bridge: BookBridge,
    private readonly build: (world: World, wiring: BookWiring) => BookPiece,
    private readonly deps: BookDeps = {},
  ) {}

  /** Heard each world report, and none as the world leaves: a book for the run, kept while it stands; none elsewhere. */
  show(report: WorldReport | null): void {
    if (report?.world === "run" && this.piece) return;
    this.takeDown();
    if (report?.world !== "run") return;
    this.piece = this.build(report.world, {
      dismiss: () => this.bridge.act(() => void this.close()),
      pick: (page) => this.pick(page),
    });
  }

  /** Whether the book can open in the world reported: in a run only (R36). The corner icon greys without it. */
  available(): boolean {
    return !!this.piece && this.bridge.world?.world === "run";
  }

  isOpen(): boolean {
    return this.piece?.isOpen() ?? false;
  }

  /**
   * The corner row's book icon, and K inside the UI scene's act (R36): refused outside a run, while the
   * menu slot is filled, after the run's end and once the player is out of the delve. Opening it closes
   * the gear overlay and the passive tree.
   */
  toggle(): void {
    const piece = this.piece;
    if (!piece || this.refused()) return;
    if (piece.isOpen()) piece.close();
    else {
      this.deps.gear?.close();
      this.deps.tree?.close();
      piece.open();
      piece.show(this.last, this.heardAt);
      this.seen = this.others();
    }
    this.report();
  }

  /** K (R36): the toggle through the UI scene's act; nothing outside a run. */
  key(): void {
    if (!this.piece || this.refused()) return;
    this.bridge.act(() => this.toggle());
  }

  /** It closes: Esc's book step, the menu opening. Whether it was open. */
  close(): boolean {
    const was = this.isOpen();
    this.piece?.close();
    this.report();
    return was;
  }

  /** The world's gear data: its `seen` character is the book's too, heard now (R37, R38). */
  hear(message: GearMessage): void {
    if (message.kind !== "seen" || !message.character) return;
    this.last = bookSource(message.character);
    this.heardAt = this.now();
    if (this.piece?.isOpen()) this.piece.show(this.last, this.heardAt);
  }

  /**
   * Once a frame, before the keys: the open book closes, silently, as the player dies or escapes (Edge
   * States) or as any other window opens after it (R36). A window open as it opened does not close it.
   */
  sync(): void {
    if (!this.isOpen()) return;
    const report = this.bridge.world;
    const open = this.others();
    const opened = Object.entries(open).some(([window, on]) => on && !this.seen[window as keyof BookOthers]);
    this.seen = open;
    if (opened || !report || report.facts().resolved || report.facts().ended) this.close();
  }

  /** Each frame: the open book's sweeps run down on the slot's clock (R38). */
  frame(): void {
    if (this.piece?.isOpen()) this.piece.frame(this.now());
  }

  /** A move over the UI scene, logical units, with what Phaser lists under the pointer: the open book's, unless another piece is on top. */
  pointerMove(x: number, y: number, over: readonly unknown[]): void {
    const piece = this.piece;
    if (!piece?.isOpen()) return;
    if (this.under(piece, over)) piece.pointerMove(-1, -1);
    else piece.pointerMove(x, y);
  }

  /** A press over the UI scene: the open book's only on its own ground; whether it took it (R39: it never attacks). */
  pointerDown(x: number, y: number, over: readonly unknown[]): boolean {
    const piece = this.piece;
    if (!piece?.isOpen() || this.under(piece, over)) return false;
    return piece.pointerDown(x, y);
  }

  /** The run's end appeared: it closes outside any player action, so it plays nothing. */
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

  /**
   * A page pressed in the open book (§H R40): slice 11's hook. There a ready page of kind ground, ally or
   * interactable asks the run to arm it (a new `UiRequest` kind through `this.bridge.request`), a ready
   * none or self page asks for its cast at once, and a locked, recovering, spent or dim page does
   * nothing. In this slice the press is the book's and nothing more happens.
   */
  private pick(_page: PageView): void {}

  private refused(): boolean {
    const report = this.bridge.world;
    if (!report || report.world !== "run" || this.bridge.ui.menuOpen) return true;
    const facts = report.facts();
    return facts.ended || facts.resolved;
  }

  private others(): BookOthers {
    return this.deps.others?.() ?? {};
  }

  private now(): number {
    return this.deps.now?.() ?? (typeof performance === "undefined" ? Date.now() : performance.now());
  }

  private under(piece: BookPiece, over: readonly unknown[]): boolean {
    return over.length > 0 && !piece.owns(over[0]);
  }

  private report(): void {
    this.bridge.reportUi({ book: this.isOpen() });
  }

  private takeDown(): void {
    const piece = this.piece;
    this.piece = null;
    if (!piece) return;
    piece.close();
    piece.destroy();
    this.report();
  }
}

/** What the book reads of the character the world handed (R37, R38). */
function bookSource(character: CharacterSource): BookSource {
  const { class: className, level, resource, book } = character;
  return { class: className, level, resource, book };
}
