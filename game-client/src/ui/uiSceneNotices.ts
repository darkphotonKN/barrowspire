/**
 * The UI scene's screen notices (FS-TQZ5J Amendment A2 R28, R33, R34): the passing lines the worlds
 * say, the town's and the field's (`HubScene.notice`, `FieldScene.notice` at 74ecdf3c) and the run's
 * notifications (`BarrowspireScene.showNotification`), said through the UI bridge as plain data and
 * drawn here with today's look, place, depth and timing, on the UI scene's own clock: so they stand
 * over the interface, and hold with the UI scene under the disconnect notice (R5).
 *
 * Each notice is its own, several standing at once where they are said at once, each where it was
 * said (a new view moves none: it is gone in moments). A notice is not the player's: it plays no
 * sound and takes no input (FS-WDM0X § Change: Menu, dialog and notice sounds, owner listening check
 * 2026-11-14, which takes back M16's chimes). A world's notices go as it leaves, as its shutdown took
 * them down when they were its own (R34).
 */

import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import type { Notice, UiBridge, WorldReport } from "./uiBridge";

/** The town's and the field's passing line: under the queue panel at the top centre, for 3.2 s. */
const LINE_Y = 72;
const LINE_MS = 3200;
/** Under the menu, over the corner row by being said after it (A2 R28). */
const LINE_DEPTH = 1000;
/** The run's notification: lower, larger, on its backing, held 1 s then faded over 2 s. */
const RUN_Y = 100;
const RUN_HOLD_MS = 1000;
const RUN_FADE_MS = 2000;
/** In the popup band with the menu: over it when said after it opened (A2 R28). */
const RUN_DEPTH = 2000;

/**
 * One line of HUD chrome on a charcoal ground: the town's queue panel's Leave button and a passing
 * notice are this shape, so they stand the same height side by side. The colour is the channel
 * (docs/design-guideline.md, Gameplay accent): vellum to read, amber to press.
 */
export function hudLine(colour: number): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: CANVAS_FONT.body,
    fontSize: "14px",
    color: toCss(colour),
    backgroundColor: toCss(BARROW_HEX.charcoal),
    padding: { x: 12, y: 8 },
  };
}

/** What a notice draws with: the UI scene's factory, clock and tweens. */
export interface NoticeStage {
  add: Pick<Phaser.GameObjects.GameObjectFactory, "text">;
  time: Pick<Phaser.Time.Clock, "delayedCall">;
  tweens: Pick<Phaser.Tweens.TweenManager, "add">;
}

/** A notice standing: taken down early, its timer or tween with it, as its world leaves. */
export interface DrawnNotice {
  takeDown(): void;
}

/**
 * Draws one notice with today's look, place, depth and timing (A2 R33): the town's or the field's line
 * in the neutral HUD register, gone after 3.2 s; the run's on its backing colour, held 1 s and faded
 * over 2 s. `gone` is told when it goes on its own.
 */
export function drawNotice(stage: NoticeStage, notice: Notice, gone: () => void): DrawnNotice {
  const { look } = notice;
  if (look.world !== "run") {
    const line = stage.add
      .text(viewport.centerX, LINE_Y, notice.text, hudLine(BARROW_HEX.vellum))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(LINE_DEPTH);
    const timer = stage.time.delayedCall(LINE_MS, () => {
      line.destroy();
      gone();
    });
    return {
      takeDown: () => {
        timer?.remove(false);
        line.destroy();
      },
    };
  }
  const notification = stage.add.text(viewport.centerX, RUN_Y, notice.text, {
    fontFamily: CANVAS_FONT.body,
    fontSize: "20px",
    color: toCss(palette.hudText),
    backgroundColor: toCss(look.backing),
    padding: { x: 20, y: 10 },
  });
  notification.setOrigin(0.5);
  notification.setScrollFactor(0);
  notification.setDepth(RUN_DEPTH);
  const fade = stage.tweens.add({
    targets: notification,
    alpha: 0,
    duration: RUN_FADE_MS,
    delay: RUN_HOLD_MS,
    onComplete: () => {
      notification.destroy();
      gone();
    },
  });
  return {
    takeDown: () => {
      fade?.remove();
      notification.destroy();
    },
  };
}

/**
 * The notices the world reported has said, standing (R33), taken down as it leaves or another world
 * reports (R34). Phaser-free: the UI scene hands it the drawing (`drawNotice` on itself).
 */
export class UiNoticeLayer {
  private readonly standing = new Set<DrawnNotice>();
  /** The world the standing notices were said by. */
  private saidBy: WorldReport | null = null;

  constructor(
    private readonly bridge: Pick<UiBridge, "world">,
    private readonly draw: (notice: Notice, gone: () => void) => DrawnNotice,
  ) {}

  /** A notice the world says: drawn at once; nothing while no world is reported, none to say it. */
  say(notice: Notice): void {
    const report = this.bridge.world;
    if (!report) return;
    if (report !== this.saidBy) this.clear();
    this.saidBy = report;
    const drawn: DrawnNotice = this.draw(notice, () => void this.standing.delete(drawn));
    this.standing.add(drawn);
  }

  /** The world's report heard again, or none as it leaves: its notices go with it (R34). */
  sync(): void {
    if (this.bridge.world !== this.saidBy) this.clear();
  }

  /** Every notice standing taken down: the world's leaving, the UI scene's end. */
  clear(): void {
    for (const drawn of this.standing) drawn.takeDown();
    this.standing.clear();
    this.saidBy = null;
  }
}
