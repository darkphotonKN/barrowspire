/**
 * The corner row on the UI scene (FS-TQZ5J §C R13–R15, FS-3EBCA): built from the world's report,
 * once per world, and taken down as the world leaves. Its presses are requests the reported world
 * answers through the UI bridge (R11), each inside the UI scene's act, so a press plays the interface
 * sounds' rule once for the press and the world's answer together (R22). The refusals read the report
 * (R14). Phaser-free: the UI scene hands it the row's builder (`HudCorner` on itself), so the wiring
 * is tested on its own.
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
import type { UiBridge, UiToggle, WorldReport } from "./uiBridge";

/** The row as the UI scene keeps it. `HudCorner` is one. */
export interface CornerRow {
  relayout(): void;
  destroy(): void;
  /** Whether a screen point lies on an icon's plate, or on `icon`'s only. */
  covers(x: number, y: number, icon?: CornerIcon): boolean;
}

/** What of the bridge the row reads, asks and plays through. */
export type CornerBridge = Pick<UiBridge, "world" | "ui" | "act" | "play" | "request">;

/** The icons that toggle a world window (R14), in the row's order after Menu. */
const TOGGLES: readonly UiToggle[] = ["inventory", "character", "party"];

export class UiCornerRow {
  private row: CornerRow | null = null;
  /** The world the standing row was built for. */
  private builtFor: WorldReport["world"] | null = null;

  constructor(
    private readonly bridge: CornerBridge,
    private readonly build: (icons: CornerIconSpec[]) => CornerRow,
    /** The Menu icon's press: the UI scene's menu slot's (R14, R16). */
    private readonly menu: () => void,
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
   * Menu, Inventory, Character and Party; outside the town the Mailbox too, greyed, the mailbox being
   * the town's: the town's own envelope stands in its slot there (R13; FS-3EBCA R9).
   */
  private icons(world: WorldReport["world"]): CornerIconSpec[] {
    // a hover on a pressable icon, and the greyed Mailbox's press, sounded (FS-WDM0X § Change M5, M10)
    const hovered = () => this.bridge.play("menu_hover");
    const icons: CornerIconSpec[] = [
      { icon: "menu", press: () => this.send("menu", this.menu), hovered },
      ...TOGGLES.map((window) => ({
        icon: window,
        press: () => this.send(window, () => this.bridge.request({ kind: "toggle", window })),
        hovered,
      })),
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

  /** What a press can change, as one key: the world's windows and the UI's menu slot. */
  private screen(): string {
    const windows = this.bridge.world?.windows();
    return JSON.stringify([windows?.letter, windows?.party, windows?.inventory, windows?.character, this.bridge.ui.menuOpen]);
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
