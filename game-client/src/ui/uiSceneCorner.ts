/**
 * The corner row on the UI scene (FS-TQZ5J §C R13–R15, FS-3EBCA): built from the world's report,
 * once per world, and taken down as the world leaves. Its presses are requests the reported world
 * answers through the UI bridge (R11), each inside the UI scene's act, so a press plays the interface
 * sounds' rule once for the press and the world's answer together (R22). The refusals read the report
 * (R14). Phaser-free: the UI scene hands it the row's builder (`HudCorner` on itself), so the wiring
 * is tested on its own.
 *
 * The row stands over everything the world draws, so where the world keeps the screen it holds what
 * the world's own pieces held when the row was the world's, read on each `sync` (the UI scene's every
 * frame, and at once after each press): while the world reports its ESC menu open, every icon but
 * Menu (FS-3EBCA R18; its blocker under the UI scene until the menu moves, I-TQZ5J-4); while the town
 * reports a dialogue open, every icon (its answers' hit areas lie under the row, and no icon answers
 * under a dialogue).
 */

import type { CornerIconSpec } from "./HudCorner";
import type { CornerIcon } from "./hudCornerLayout";
import type { UiBridge, UiRequest, UiToggle, WorldReport } from "./uiBridge";

/** The row as the UI scene keeps it. `HudCorner` is one. */
export interface CornerRow {
  hold(icons: readonly CornerIcon[]): void;
  relayout(): void;
  destroy(): void;
}

/** What of the bridge the row reads and asks through. */
export type CornerBridge = Pick<UiBridge, "world" | "act" | "request">;

/** The icons that toggle a world window (R14), in the row's order after Menu. */
const TOGGLES: readonly UiToggle[] = ["inventory", "character", "party"];

export class UiCornerRow {
  private row: CornerRow | null = null;
  /** The world the standing row was built for, and the icons built. */
  private builtFor: WorldReport["world"] | null = null;
  private built: CornerIcon[] = [];
  /** The hold the row was last given, by its icons; none yet, so the first sync always gives one. */
  private held: string | null = null;

  constructor(
    private readonly bridge: CornerBridge,
    private readonly build: (icons: CornerIconSpec[]) => CornerRow,
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
    this.built = icons.map((spec) => spec.icon);
    this.sync();
  }

  /** The row held where the world keeps the screen now, let go where it no longer does. */
  sync(): void {
    if (!this.row) return;
    const held = this.heldNow();
    const key = held.join();
    if (key === this.held) return;
    this.held = key;
    this.row.hold(held);
  }

  /** Every icon under a dialogue; every icon but Menu under the world's ESC menu; else none. */
  private heldNow(): CornerIcon[] {
    const report = this.bridge.world;
    if (report?.blockers().dialogue) return [...this.built];
    if (report?.windows().menu) return this.built.filter((icon) => icon !== "menu");
    return [];
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
    this.built = [];
    this.held = null;
  }

  /**
   * Menu, Inventory, Character and Party; outside the town the Mailbox too, greyed, the mailbox being
   * the town's: the town's own envelope stands in its slot there (R13; FS-3EBCA R9).
   */
  private icons(world: WorldReport["world"]): CornerIconSpec[] {
    const icons: CornerIconSpec[] = [
      { icon: "menu", press: () => this.send("menu", { kind: "toggleMenu" }) },
      ...TOGGLES.map((window) => ({
        icon: window,
        press: () => this.send(window, { kind: "toggle", window }),
      })),
    ];
    return world === "hub" ? icons : [...icons, { icon: "mail", greyed: true }];
  }

  /** A press: the request inside the UI scene's act, unless refused; the hold read again at once. */
  private send(icon: CornerIcon, request: UiRequest): void {
    this.bridge.act(() => {
      if (!this.refused(icon)) this.bridge.request(request);
    });
    this.sync();
  }

  /**
   * Whether the world reported refuses `icon`'s press now (R14; FS-3EBCA R6–R8, R18): every icon but
   * Menu while its ESC menu is open, and Party while a dialogue is. Menu is the world's to refuse.
   */
  private refused(icon: CornerIcon): boolean {
    const report = this.bridge.world;
    if (!report) return true;
    if (icon === "menu") return false;
    if (report.windows().menu) return true;
    return icon === "party" && report.blockers().dialogue;
  }
}
