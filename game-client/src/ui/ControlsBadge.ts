/**
 * The run's controls badge (FS-84N1G R3, R5–R9): a book above the ability card that opens and closes the
 * controls panel, as H does.
 *
 * Drawn as the corner row's icons are (ADR-0080): an embossed bronze **knockout** of the owner's book
 * (`BOOK`, `knockoutBook.ts`) through the shared renderer, bare over the world on a plate the corner
 * icons' size, lifted toward the bright amber under the pointer, where the corner row's label names it
 * and its key (`CornerLabel`). Where the scene cannot make the knockout's texture, the book's line
 * glyph (`drawBookLines`), so the plate is never empty. The plate is its press area; a press answers on the release, as
 * the HUD buttons do (FS-R82NV R28). No cursor of its own: the bone hand stays (FS-KYPQ9 § Change).
 *
 * It decides nothing: what a press and a hover do is handed in. It stands in the UI scene, at the
 * corner row's depth (ADR-0086 1.1); `uiSceneControlsBadge.ts` says when.
 */

import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { palette } from "@/utils/canvasPalette";
import { CornerLabel } from "./cornerLabel";
import { CONTROLS_BADGE_LABEL, controlsBadgeFrame, type Rect } from "./hudCornerLayout";
import { BRONZE, Knockout } from "./knockout";
import { BOOK, drawBookLines } from "./knockoutBook";
import type { BadgeSpec } from "./uiSceneControlsBadge";

/** The corner row's depth (ADR-0086 Decision 4). */
const HUD_DEPTH = 1000;

export class ControlsBadge {
  private frame: Rect;
  private hovered = false;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly zone: Phaser.GameObjects.Zone;
  private readonly knockout: Knockout;
  private readonly label: CornerLabel;

  constructor(scene: Phaser.Scene, spec: BadgeSpec) {
    const f = (this.frame = controlsBadgeFrame(viewport));
    this.label = new CornerLabel(scene);
    this.graphics = scene.add.graphics().setScrollFactor(0).setDepth(HUD_DEPTH);
    this.zone = scene.add
      .zone(f.x, f.y, f.width, f.height)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH)
      .setInteractive()
      .on("pointerover", () => this.hover(true, spec))
      .on("pointerout", () => this.hover(false, spec))
      // on the release, as the HUD buttons answer (FS-R82NV R28)
      .on("pointerup", () => spec.press());
    // drawn again at a new render scale; where that fails, the book goes back to its lines
    this.knockout = new Knockout({
      scene,
      depth: HUD_DEPTH,
      picture: BOOK,
      ink: BRONZE,
      name: "the controls badge",
      lost: () => this.draw(),
    });
    this.draw();
  }

  /** The logical view changed: back above the ability card (FS-ZAJMH R12, R13). */
  relayout(): void {
    this.frame = controlsBadgeFrame(viewport);
    this.zone.setPosition(this.frame.x, this.frame.y);
    this.draw();
    if (this.hovered) this.label.show(this.frame, CONTROLS_BADGE_LABEL);
  }

  destroy(): void {
    this.label.hide();
    this.knockout.destroy();
    this.graphics.destroy();
    this.zone.destroy();
  }

  private hover(on: boolean, spec: BadgeSpec): void {
    if (this.hovered === on) return;
    this.hovered = on;
    this.draw();
    if (!on) return this.label.hide();
    this.label.show(this.frame, CONTROLS_BADGE_LABEL);
    spec.hovered();
  }

  private draw(): void {
    const g = this.graphics.clear();
    const f = this.frame;
    if (this.knockout.show(f, this.hovered)) return;
    // the book's lines, in the corner row's line glyph amber (ADR-0080 fallback; HudCorner's draw)
    const ink = this.hovered ? palette.interactableBright : palette.interactable;
    drawBookLines(g, f.x + f.width / 2, f.y + f.height / 2, ink, this.hovered ? 1 : 0.85);
  }
}
