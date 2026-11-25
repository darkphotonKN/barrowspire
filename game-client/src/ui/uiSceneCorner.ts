/**
 * The corner row on the UI scene (FS-TQZ5J §C R13–R15, FS-3EBCA): built from the world's report,
 * once per world, and taken down as the world leaves. Its presses are requests the reported world
 * answers through the UI bridge (R11), each inside the UI scene's act, so a press plays the interface
 * sounds' rule once for the press and the world's answer together (R22). The refusals read the report
 * (R14). Phaser-free: the UI scene hands it the row's builder (`HudCorner` on itself), so the wiring
 * is tested on its own.
 *
 * Party is the UI scene's own party panel (§ Change: Phase 2: the party, R39), and Inventory and
 * Character its own gear overlay (§ Change: Phase 3, R55): a press toggles it there, inside the same
 * act, under the same refusals.
 *
 * Tree is the UI scene's own passive tree (FS-8RZ51 R32): its press toggles it there, inside the same act,
 * under the gear's refusals. Its marker, on while the player holds unspent points (R33), is set on the
 * standing row as the points change, never rebuilding it, and on each row built after.
 *
 * Book is the UI scene's own class book (FS-X2CMM R36), in a run only: its press toggles it there, inside the
 * same act; in the hub and the fields it stands greyed, as the Mailbox does outside the town, and its press
 * plays the refusal alone.
 *
 * Menu is the UI scene's own menu slot's (R16): its press is handed to the slot. While the slot is
 * filled its blocker, in the same scene and over the row, takes every icon's hover and press but
 * Menu's, whose plate it leaves to the icon (FS-3EBCA R18, `covers`).
 *
 * Under the town's dialogue it holds nothing: the card stands in the same scene at the popup band
 * (`uiSceneDialogue.ts`, FS-TQZ5J A2 R32), its rows' hit areas over the row, so they take their own
 * presses by depth, as when both were the town's; what answers on the row under it is what the town
 * refuses (R14).
 */

import type { CornerIconSpec } from "./HudCorner";
import type { CornerIcon } from "./hudCornerLayout";
import type { UiBridge, WorldReport } from "./uiBridge";

/** The party panel as the row's Party icon reaches it: the UI scene's own (§ Change: Phase 2: the party, R39). */
export interface CornerParty {
  isOpen(): boolean;
  toggle(): void;
}

/** No party panel: a row whose Party icon changes nothing. */
const NO_PARTY: CornerParty = { isOpen: () => false, toggle: () => {} };

/** The gear overlay as the row's Inventory and Character icons reach it: the UI scene's own (§ Change: Phase 3, R55). */
export interface CornerGear {
  isInventoryOpen(): boolean;
  isCharacterOpen(): boolean;
  /** Under the gear's own refusals: the menu slot and the world's `blockers().gear`. */
  toggle(window: "inventory" | "character"): void;
}

/** No gear overlay: a row whose Inventory and Character change nothing. */
const NO_GEAR: CornerGear = { isInventoryOpen: () => false, isCharacterOpen: () => false, toggle: () => {} };

/** The passive tree as the row's Tree icon reaches it: the UI scene's own (FS-8RZ51 R32). */
export interface CornerTree {
  isOpen(): boolean;
  /** Under the tree's own refusals: the gear's. */
  toggle(): void;
}

/** No tree: a row whose Tree icon changes nothing. */
const NO_TREE: CornerTree = { isOpen: () => false, toggle: () => {} };

/** The class book as the row's Book icon reaches it: the UI scene's own (FS-X2CMM R36). */
export interface CornerBook {
  isOpen(): boolean;
  /** Under the book's own refusals. */
  toggle(): void;
}

/** No book: a row whose Book icon changes nothing. */
const NO_BOOK: CornerBook = { isOpen: () => false, toggle: () => {} };

/** The row as the UI scene keeps it. `HudCorner` is one. */
export interface CornerRow {
  relayout(): void;
  destroy(): void;
  /** Whether a screen point lies on an icon's plate, or on `icon`'s only. */
  covers(x: number, y: number, icon?: CornerIcon): boolean;
  /** The Tree icon's marker on or off (FS-8RZ51 R33). */
  mark(on: boolean): void;
}

/** What of the bridge the row reads, asks and plays through. */
export type CornerBridge = Pick<UiBridge, "world" | "ui" | "act" | "play" | "request">;

/** The icons that toggle the gear overlay's panels (R14), in the row's order after Menu; Party follows them. */
const TOGGLES = ["inventory", "character"] as const;

export class UiCornerRow {
  private row: CornerRow | null = null;
  /** The world the standing row was built for. */
  private builtFor: WorldReport["world"] | null = null;
  /** The Tree icon's marker, set on each row built (FS-8RZ51 R33). */
  private marked = false;

  constructor(
    private readonly bridge: CornerBridge,
    private readonly build: (icons: CornerIconSpec[]) => CornerRow,
    /** The Menu icon's press: the UI scene's menu slot's (R14, R16). */
    private readonly menu: () => void,
    /** The Party icon's panel: the UI scene's party slot (§ Change: Phase 2: the party, R39). */
    private readonly party: CornerParty = NO_PARTY,
    /** The Inventory and Character icons' overlay: the UI scene's gear slot (§ Change: Phase 3, R55). */
    private readonly gear: CornerGear = NO_GEAR,
    /** The Tree icon's overlay: the UI scene's tree slot (FS-8RZ51 R32). */
    private readonly tree: CornerTree = NO_TREE,
    /** The Book icon's window: the UI scene's book slot (FS-X2CMM R36). */
    private readonly book: CornerBook = NO_BOOK,
  ) {}

  /**
   * Heard each world report, and none as the world leaves (R13): a row for the world reported, built
   * anew after a leave or for another world; a report of the world the row stands for keeps it.
   */
  show(report: WorldReport | null): void {
    if (report && this.row && this.builtFor === report.world) return;
    this.takeDown();
    if (!report) return;
    const icons = this.icons(report.world);
    this.row = this.build(icons);
    this.builtFor = report.world;
    if (this.marked) this.row.mark(true);
  }

  /** The Tree icon's marker, on while the player holds unspent points (FS-8RZ51 R33): set on the standing row. */
  mark(on: boolean): void {
    this.marked = on;
    this.row?.mark(on);
  }

  /** Whether a screen point lies on the standing row's plates, or on `icon`'s: the menu's blocker leaves Menu's (FS-3EBCA R18). */
  covers(x: number, y: number, icon?: CornerIcon): boolean {
    return this.row?.covers(x, y, icon) ?? false;
  }

  /** The logical view changed: the row back to the corner (FS-ZAJMH R13). */
  relayout(): void {
    this.row?.relayout();
  }

  destroy(): void {
    this.takeDown();
  }

  private takeDown(): void {
    this.row?.destroy();
    this.row = null;
    this.builtFor = null;
  }

  /**
   * Menu, Inventory, Character, Party, Tree (FS-8RZ51 R32) and Book, greyed outside a run (FS-X2CMM R36);
   * outside the town the Mailbox too, greyed, the mailbox being the town's: the town's own envelope stands
   * in its slot there (R13; FS-3EBCA R9).
   */
  private icons(world: WorldReport["world"]): CornerIconSpec[] {
    // a hover on a pressable icon, and the greyed Mailbox's press, sounded (FS-WDM0X § Change M5, M10)
    const hovered = () => this.bridge.play("menu_hover");
    const icons: CornerIconSpec[] = [
      { icon: "menu", press: () => this.send("menu", this.menu), hovered },
      ...TOGGLES.map((window) => ({
        icon: window,
        press: () => this.send(window, () => this.gear.toggle(window)),
        hovered,
      })),
      { icon: "party", press: () => this.send("party", () => this.party.toggle()), hovered },
      { icon: "tree", press: () => this.send("tree", () => this.tree.toggle()), hovered },
      world === "run"
        ? { icon: "book", press: () => this.send("book", () => this.book.toggle()), hovered }
        : { icon: "book", greyed: true, refused: () => this.bridge.play("menu_error") },
    ];
    const greyedMail: CornerIconSpec = { icon: "mail", greyed: true, refused: () => this.bridge.play("menu_error") };
    return world === "hub" ? icons : [...icons, greyedMail];
  }

  /**
   * A press: its answer inside the UI scene's act, unless refused. A press refused, or answered with
   * no window changed (the world turned it away), plays `menu_error` (FS-WDM0X § Change M10); one that
   * changed a window plays that window's sound alone.
   */
  private send(icon: CornerIcon, answer: () => void): void {
    this.bridge.act(() => {
      if (this.refused(icon)) return this.bridge.play("menu_error");
      const before = this.screen();
      answer();
      if (this.screen() === before) this.bridge.play("menu_error");
    });
  }

  /** What a press can change, as one key: the world's letter panel, the UI's party panel, gear overlay, tree, book and menu slot. */
  private screen(): string {
    const windows = this.bridge.world?.windows();
    return JSON.stringify([
      windows?.letter,
      this.party.isOpen(),
      this.gear.isInventoryOpen(),
      this.gear.isCharacterOpen(),
      this.tree.isOpen(),
      this.book.isOpen(),
      this.bridge.ui.menuOpen,
    ]);
  }

  /**
   * Whether `icon`'s press is refused now (R14; FS-3EBCA R6–R8, R18): every icon but Menu while the
   * menu slot is filled, and Party while the town's dialogue is open. Menu is the slot's to refuse.
   */
  private refused(icon: CornerIcon): boolean {
    const report = this.bridge.world;
    if (!report) return true;
    if (icon === "menu") return false;
    if (this.bridge.ui.menuOpen) return true;
    return icon === "party" && report.blockers().dialogue;
  }
}
