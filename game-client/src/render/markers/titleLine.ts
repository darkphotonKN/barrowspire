/**
 * A player's title line on their nameplate (FS-E1ZDG §K.41): a second, smaller line with their title
 * under their name over their figure, their own and others'; no title, no line. World drawing (ADR-0086
 * 2.1): the town, the fields and the runs each keep one per player and stand it under the name they
 * place, so the three draw one rule. The words are `nameplateTitle`'s.
 */

import type Phaser from "phaser";
import { nameplateTitle } from "@/data/specializations";
import { MARKER_DEPTH } from "./markers";

/** The title line's size, a step under the worlds' 12 px names. */
export const TITLE_LINE_PX = 10;
/** Between the name's foot and the title's top. */
const TITLE_GAP = 1;

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

export class NameplateTitle {
  private line?: Phaser.GameObjects.Text;

  /** `style` is the world's name style; the line takes it at its own size. */
  constructor(
    private readonly scene: Pick<Phaser.Scene, "add">,
    private readonly style: TextStyle,
  ) {}

  /** The line for the player as this state shows them: made, reworded or taken down. */
  show(player: { class: string; specialization?: string }): void {
    const title = nameplateTitle(player);
    if (!title) return this.destroy();
    if (this.line) {
      if (this.line.text !== title) this.line.setText(title);
      return;
    }
    this.line = this.scene.add
      .text(0, 0, title, { ...this.style, fontSize: `${TITLE_LINE_PX}px` })
      .setOrigin(0.5, 1)
      .setDepth(MARKER_DEPTH.name);
  }

  /**
   * Stands the line where `name`'s foot is and lifts the name over it, shown as the name is. Called
   * each time the world places the name, after it: the name is lifted from where it was just put.
   */
  stand(name: Phaser.GameObjects.Text): void {
    const line = this.line;
    if (!line) return;
    const foot = name.y + (1 - name.originY) * name.height;
    line.setPosition(name.x, foot).setVisible(name.visible);
    name.setY(foot - line.height - TITLE_GAP - (1 - name.originY) * name.height);
  }

  /** Shown or hidden with the name, where the world hides it apart from placing it. */
  setVisible(shown: boolean): void {
    this.line?.setVisible(shown);
  }

  destroy(): void {
    this.line?.destroy();
    this.line = undefined;
  }
}
