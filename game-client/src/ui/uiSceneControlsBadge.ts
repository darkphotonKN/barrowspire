/**
 * The run's controls badge on the UI scene (FS-84N1G R4, R7, R8): it stands in the run exactly while the
 * run says its ability card is up (`abilityCard`, through the bridge) and the run has not ended (its
 * facts), so it goes with the card at a death, an escape and the dead spectator's leave button, at the
 * end, and as the run leaves. Its hover plays `menu_hover`; its press toggles the controls panel, as H
 * does (its sounds the panel's), refused while the menu slot is filled with `menu_error`.
 *
 * Phaser-free: the UI scene hands it the builder (`ControlsBadge` on itself) and the controls panel's
 * toggle, so the wiring is tested on its own.
 */

import type { UiBridge, WorldReport } from "./uiBridge";

/** What the badge does when pressed and hovered: the slot's. `ControlsBadge` takes it. */
export interface BadgeSpec {
  press(): void;
  hovered(): void;
}

/** The badge as the UI scene keeps it. `ControlsBadge` is one. */
export interface BadgePiece {
  /** The logical view changed: back above the ability card. */
  relayout(): void;
  destroy(): void;
}

export class UiControlsBadge {
  private piece: BadgePiece | null = null;
  /** Whether the run last said its ability card is up; none said, it is not. */
  private cardUp = false;

  constructor(
    private readonly bridge: Pick<UiBridge, "world" | "ui" | "play">,
    private readonly controls: { toggle(): void },
    private readonly build: (spec: BadgeSpec) => BadgePiece,
  ) {}

  /** Heard each world report, and none as the world leaves: a run's end takes it down; a leave forgets the card. */
  world(report: WorldReport | null): void {
    if (report?.world !== "run") this.cardUp = false;
    this.stand();
  }

  /** The run's ability card came up or went (R4). */
  abilityCard(up: boolean): void {
    this.cardUp = up;
    this.stand();
  }

  isUp(): boolean {
    return this.piece !== null;
  }

  relayout(): void {
    this.piece?.relayout();
  }

  destroy(): void {
    this.piece?.destroy();
    this.piece = null;
  }

  /** Up exactly while the run is reported, says its card is up, and has not ended. */
  private stand(): void {
    const report = this.bridge.world;
    const want = report?.world === "run" && this.cardUp && !report.facts().ended;
    if (want && !this.piece)
      this.piece = this.build({
        press: () => this.press(),
        hovered: () => this.bridge.play("menu_hover"),
      });
    else if (!want) this.destroy();
  }

  /** A press (R8): the panel toggled as H toggles it; under the menu slot, refused with `menu_error`. */
  private press(): void {
    if (this.bridge.ui.menuOpen) return this.bridge.play("menu_error");
    this.controls.toggle();
  }
}
