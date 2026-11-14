import * as Phaser from "phaser";
import { NOTICE_SCENE, hideDomLayer, type DomLayer } from "@/components/disconnectNotice";
import { relayoutOn, viewport } from "@/render/viewport";
import {
  DISCONNECT_NOTICE,
  NOTICE_DIM_ALPHA,
  NOTICE_TEXT_PX,
  disconnectNoticeFrame,
} from "@/ui/disconnectNoticeLayout";
import { drawPanelFrame, drawPanelTitle } from "@/ui/panelFrame";
import type { Rect } from "@/ui/partyPanelLayout";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { onSceneEnd } from "./sceneEnd";

/** What the notice scene is handed by the controller that starts it (`DisconnectNotice`). */
export interface NoticeHold {
  holdWorlds(): void;
  returnToMenu(): void;
}

const text = (colour: number, px: number) => ({
  fontFamily: CANVAS_FONT.body,
  fontSize: `${px}px`,
  color: toCss(colour),
});

/**
 * The disconnect notice (FS-R6EYZ §B): the world dimmed and held still behind a panel in the
 * shared window frame (no ×: its button is its one way out) under the shared title DISCONNECTED,
 * one line, and **Return to menu** (R8, R9). Its own scene, last in the game's scene
 * list, so it is drawn over every world and outlives a world switch (R11); it draws on the game
 * palette, as every panel in the world does (design guideline "Panels in the world").
 *
 * While up it pauses each world scene that runs under it, every frame (R10), and hides the DOM layer
 * over the canvas, giving it back on its end. Only its button takes it down (R13).
 */
export class DisconnectNoticeScene extends Phaser.Scene {
  private notice?: NoticeHold;
  private parts: Phaser.GameObjects.GameObject[] = [];
  private giveBackDom?: () => void;

  constructor() {
    super({ key: NOTICE_SCENE });
  }

  init(data: { notice?: NoticeHold }): void {
    this.notice = data.notice;
  }

  create(): void {
    this.notice?.holdWorlds();
    this.giveBackDom = hideDomLayer(
      this.game.domContainer as DomLayer | null | undefined,
      document,
    );
    this.draw();
    relayoutOn(this, () => this.draw());
    onSceneEnd(this, () => {
      this.giveBackDom?.();
      this.giveBackDom = undefined;
      this.parts = [];
    });
  }

  update(): void {
    // a world that came up under the notice is held as it comes (R10, R11)
    this.notice?.holdWorlds();
  }

  /** The dim, the panel, its words and its button, centred in the view now (R9). */
  private draw(): void {
    this.parts.forEach((part) => part.destroy());
    const f = disconnectNoticeFrame(viewport);

    // the dim takes the clicks that land beside the panel, and does nothing with them (R13)
    const dim = this.add
      .rectangle(f.dim.x, f.dim.y, f.dim.width, f.dim.height, palette.inkDeep, NOTICE_DIM_ALPHA)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setInteractive();

    const panel = this.add.graphics().setScrollFactor(0);
    drawPanelFrame(this, panel, f.panel, { close: false });
    const title = drawPanelTitle(this, f.panel, DISCONNECT_NOTICE.title).setScrollFactor(0);
    const line = this.add
      .text(f.line.x, f.line.y, DISCONNECT_NOTICE.line, text(palette.hudLabel, NOTICE_TEXT_PX.line))
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.parts = [dim, panel, title, line, ...this.button(f.button)];
  }

  /**
   * Return to menu: brass-outlined, its words in the interactable amber, the outline brightening
   * under the pointer (design guideline "Gameplay accent").
   */
  private button(r: Rect): Phaser.GameObjects.GameObject[] {
    const outline = this.add.graphics().setScrollFactor(0);
    const stroke = (colour: number) => {
      outline.clear();
      outline.lineStyle(1, colour, 0.9);
      outline.strokeRoundedRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1, 3);
    };
    stroke(palette.frame);
    const label = this.add
      .text(
        r.x + r.width / 2,
        r.y + r.height / 2,
        DISCONNECT_NOTICE.button,
        text(palette.interactable, NOTICE_TEXT_PX.button),
      )
      .setOrigin(0.5)
      .setScrollFactor(0);
    const hit = this.add
      .zone(r.x, r.y, r.width, r.height)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setInteractive()
      .on("pointerover", () => stroke(palette.frameBright))
      .on("pointerout", () => stroke(palette.frame))
      .on("pointerdown", () => this.press());
    return [outline, label, hit];
  }

  /**
   * Once per notice. The route stops and starts scenes through the game's scene manager, which
   * does so at once, so it runs after Phaser has finished dispatching this press, as a world
   * switch runs from a socket message, rather than tearing this scene down inside its own input.
   */
  private press(): void {
    const notice = this.notice;
    if (!notice) return;
    this.notice = undefined;
    setTimeout(() => notice.returnToMenu(), 0);
  }
}
