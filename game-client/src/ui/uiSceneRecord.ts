/**
 * The run's settlement record and its controls panel on the UI scene (FS-TQZ5J § Change: Phase 3, R50,
 * R56–R59, R61; the note on ADR-0083 2.3).
 *
 * The record is drawn from the run's data (`record`: its view and whether it is up), where and as the
 * run drew it, its bottom on the anchor over the bottom-centre row. The run keeps what it means: its
 * content, its open state, the held town and the SETTLEMENT button (FS-GV8WN R19–R25). Its Close plays
 * `menu_click`, then asks the run to close it, which may let a held town in (FS-WDM0X § Pass 2b E5); its
 * hover plays `menu_hover` (E4).
 *
 * The controls panel is the UI scene's own in the run: H opens and closes it, refused while the menu
 * slot is filled and once the run has ended (its keyboard was off); the run's end appearing closes it,
 * silently (R58). Both are taken down as the run leaves. Its open plays `dialog_open` and the player's
 * close `dialog_cancel`; any other window opening closes it silently; Q and Esc close it first
 * (FS-84N1G R11, R16–R18).
 *
 * Phaser-free: the UI scene hands each its builder, so the wiring is tested on its own.
 */

import type { ShownRecord, UiBridge, World, WorldReport } from "./uiBridge";
import type { RecordView } from "./settlement";

/** The record as the UI scene keeps it. `SettlementRecord` is one. */
export interface RecordPiece {
  set(view: RecordView): void;
  open(): void;
  /** Down, its hit areas with it. */
  close(): void;
  relayout(anchor: { x: number; bottom: number }): void;
}

/** Builds the record at `anchor`, its Close and its Close's hover handed in. */
export type RecordBuilder = (anchor: { x: number; bottom: number }, onClose: () => void, onCloseHovered: () => void) => RecordPiece;

export class UiRecordSlot {
  private record: RecordPiece | null = null;
  /** The world the standing record was drawn for. */
  private builtFor: World | null = null;
  /** Whether the run last said its record is up. */
  private up = false;

  constructor(
    private readonly bridge: Pick<UiBridge, "play" | "request">,
    private readonly build: RecordBuilder,
    /** Its place now: centred across, just over the bottom-centre row (`recordAnchor`). */
    private readonly anchor: () => { x: number; bottom: number },
  ) {}

  /** Heard each world report, and none as the world leaves: a record of another world, or of none, goes. */
  world(report: WorldReport | null): void {
    if (report && report.world === this.builtFor) return;
    this.takeDown();
  }

  /**
   * The run's record (R52, R57): drawn with its view, up or down as the run says; none, gone. Built on
   * the first, as the run built it on its first `settlement`.
   */
  show(shown: ShownRecord | null, world: World | null): void {
    if (!shown) return this.takeDown();
    if (!this.record) {
      this.record = this.build(
        this.anchor(),
        () => {
          // before the close, which may let a held town in (FS-WDM0X § Pass 2b E5)
          this.bridge.play("menu_click");
          this.bridge.request({ kind: "close", window: "record" });
        },
        () => this.bridge.play("menu_hover"),
      );
      this.builtFor = world;
    }
    this.record.set(shown.view);
    this.up = shown.open;
    if (shown.open) this.record.open();
    else this.record.close();
  }

  /** Whether the record stands up now (FS-84N1G R16). */
  isOpen(): boolean {
    return this.record !== null && this.up;
  }

  /** The logical view changed: the record at its new place, its content and state untouched (FS-ZAJMH R13). */
  relayout(): void {
    this.record?.relayout(this.anchor());
  }

  destroy(): void {
    this.takeDown();
  }

  private takeDown(): void {
    this.record?.close();
    this.record = null;
    this.builtFor = null;
    this.up = false;
  }
}

/** The controls panel as the UI scene keeps it, with its ground. */
export interface ControlsPiece {
  /** The logical view changed: back to the centre, rasterised again. */
  relayout(): void;
  destroy(): void;
}

/** Builds the controls panel, its × handed in (FS-84N1G R14). */
export type ControlsBuilder = (onClose: () => void) => ControlsPiece;

/** The UI's windows other than the controls panel, each open or not, by name (FS-84N1G R16). */
export type OpenWindows = Readonly<Record<string, boolean>>;

export class UiControlsSlot {
  private panel: ControlsPiece | null = null;
  /** The windows as last handed (`sync`). */
  private seen: OpenWindows = {};

  constructor(
    private readonly bridge: Pick<UiBridge, "world" | "ui" | "act" | "play">,
    private readonly build: ControlsBuilder,
  ) {}

  /** Heard each world report, and none as the world leaves: it stands in the run alone, and goes with it. */
  world(report: WorldReport | null): void {
    if (report?.world !== "run") this.close();
  }

  isOpen(): boolean {
    return this.panel !== null;
  }

  /**
   * H (R56): opens or closes it in the run, through the UI scene's act, `dialog_open` as it opens and
   * `dialog_cancel` as it closes (FS-84N1G R11); refused, silently, while the menu slot is filled and
   * after the run's end.
   */
  toggle(): void {
    if (!this.mayOpen()) return;
    this.bridge.act(() => {
      if (this.panel) return this.dismiss();
      this.bridge.play("dialog_open");
      this.open();
    });
  }

  /**
   * The run began (FS-84N1G R1, R2): it opens as H would, but silently, the game having opened it (FS-WDM0X
   * S4); refused under the menu slot and after the run's end, and not tried again; already open, it stays.
   */
  runBegun(): void {
    if (this.mayOpen()) this.open();
  }

  /** The player closed it (its ×, FS-84N1G R14): `dialog_cancel`, inside the UI scene's act. */
  dismiss(): void {
    if (!this.panel) return;
    this.bridge.act(() => {
      this.bridge.play("dialog_cancel");
      this.close();
    });
  }

  /**
   * Q (FS-84N1G R18): while it is open, Q closes it as the player's close and nothing else; whether it
   * took Q. Refused, as every gear key is, under the menu slot and after the run's end.
   */
  closeKey(): boolean {
    if (!this.panel || !this.mayOpen()) return false;
    this.dismiss();
    return true;
  }

  /**
   * Which windows are open now, handed once a frame by the UI scene (FS-84N1G R16): one shut at the last
   * hand and open now closes the panel, silently, so only its own opening sounds. A window open as the
   * panel opened does not close it.
   */
  sync(open: OpenWindows): void {
    const opened = Object.keys(open).some((window) => open[window] && !this.seen[window]);
    this.seen = open;
    if (opened) this.close();
  }

  /** Closed by the game, silently (FS-WDM0X S4): the run's end appeared (R58), or the run left. */
  close(): void {
    this.panel?.destroy();
    this.panel = null;
  }

  relayout(): void {
    this.panel?.relayout();
  }

  destroy(): void {
    this.close();
  }

  /** Whether it may open now: in the run, the menu slot empty, the run not ended (R56). */
  private mayOpen(): boolean {
    const report = this.bridge.world;
    return report?.world === "run" && !this.bridge.ui.menuOpen && !report.facts().ended;
  }

  private open(): void {
    this.panel ??= this.build(() => this.dismiss());
  }
}
