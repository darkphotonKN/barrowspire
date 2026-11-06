/**
 * The settlement record (FS-GV8WN §G R21): what a resolved player carried home, lost and earned,
 * and whether it has settled. A dark vellum panel with a brass hairline, fixed to the screen in
 * the popup band, its bottom on the anchor the scene gives it (just over the bottom-centre row of
 * buttons, so the Settlement button that toggles it stays reachable). One amber button, Close.
 *
 * The scene owns when it opens and what closing means (the held return to the town, R23):
 * this widget only draws, and reports a press of Close to `onClose`. Built on open and taken
 * down on close, so a closed record holds no hit areas.
 *
 * Game palette only: vellum words, brass frame, amber for the one control. Finds carried out take
 * the safe channel, finds left in the barrow the danger channel, items used up the neutral label.
 * The heading is the end-of-run overlay's, so it may take the blackletter at 30 px (the guideline's
 * "blackletter bound"); everything else is the body serif.
 */

import type Phaser from "phaser";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import type { RecordRow, RecordTone, RecordView } from "./settlement";

/** Over the resolved player's card (1500), under the passing notices (2000). */
export const RECORD_DEPTH = 1600;
export const RECORD_W = 520;

const PAD = 24;
const COL_GAP = 24;
const COL_W = (RECORD_W - 2 * PAD - COL_GAP) / 2;
const ROWS_PER_COL = 4;
const ROW_H = 20;
const CLOSE_W = 160;
const CLOSE_H = 34;
/** The panel never rises past this far from the top of the screen. */
const TOP_MARGIN = 8;
/** Characters a name keeps beside a mark, and alone, before it is cut. */
const NAME_MAX_MARKED = 18;
const NAME_MAX = 30;

const TONE: Record<RecordTone, number> = {
  found: palette.safe,
  unsafe: palette.unsafeFind,
  consumed: palette.hudLabel,
  pending: palette.hudLabel,
  settled: palette.frameBright,
};

type Stage = Pick<Phaser.Scene, "add">;
type Text = Phaser.GameObjects.Text;

export class SettlementRecord {
  private view?: RecordView;
  private panel?: Phaser.GameObjects.Container;
  private statusText?: Text;
  private hits: Phaser.GameObjects.Rectangle[] = [];
  /** The view the open panel was built for, but for its status. */
  private drawnBody?: string;

  constructor(
    private readonly scene: Stage,
    private anchor: { x: number; bottom: number },
    private readonly onClose: () => void,
  ) {}

  /**
   * The logical view changed: the record's place is `anchor` now, and an open record is built
   * again there, its content and state untouched (FS-ZAJMH R13).
   */
  relayout(anchor: { x: number; bottom: number }): void {
    this.anchor = anchor;
    if (!this.panel) return;
    this.close();
    this.open();
  }

  /** The record's content, replaced on every `settlement` (R20). Redrawn now if open. */
  set(view: RecordView): void {
    this.view = view;
    if (!this.panel) return;
    if (bodyOf(view) === this.drawnBody && this.statusText) {
      this.statusText
        .setText(view.status.text)
        .setColor(toCss(TONE[view.status.tone]));
      return;
    }
    this.close();
    this.open();
  }

  /** Up with the latest content; once, however often it is asked. */
  open(): void {
    if (this.panel || !this.view) return;
    this.build(this.view);
  }

  /** Down, its hit areas with it. Nothing is reported: the scene asked. */
  close(): void {
    this.panel?.destroy();
    this.panel = undefined;
    this.statusText = undefined;
    this.hits.forEach((hit) => hit.destroy());
    this.hits = [];
    this.drawnBody = undefined;
  }

  isOpen(): boolean {
    return this.panel !== undefined;
  }

  hasContent(): boolean {
    return this.view !== undefined;
  }

  private build(view: RecordView): void {
    const { add } = this.scene;
    const parts: Phaser.GameObjects.GameObject[] = [];
    const text = (
      x: number,
      y: number,
      content: string,
      size: number,
      colour: number,
      extra = {},
    ) => {
      const made = add.text(x, y, content, {
        fontFamily: CANVAS_FONT.body,
        fontSize: `${size}px`,
        color: toCss(colour),
        ...extra,
      });
      parts.push(made);
      return made;
    };
    const centre = RECORD_W / 2;

    let y = 18;
    text(centre, y, view.title, 30, palette.hudText, {
      fontFamily: CANVAS_FONT.display,
    }).setOrigin(0.5, 0);
    y += 42;
    this.statusText = text(
      centre,
      y,
      view.status.text,
      14,
      TONE[view.status.tone],
      { letterSpacing: 2 },
    ).setOrigin(0.5, 0);
    y += 30;

    y = this.section(
      text,
      y,
      "CARRIED HOME",
      view.carried,
      view.carriedMore,
      "Nothing came home",
    );
    if (view.lost.length > 0)
      y = this.section(text, y, "LOST", view.lost, view.lostMore);

    y += 4;
    text(centre, y, view.earned, 14, palette.hudText).setOrigin(0.5, 0);
    y += 22;
    text(centre, y, view.delve, 13, palette.hudLabel).setOrigin(0.5, 0);
    y += 30;

    const closeY = y + CLOSE_H / 2;
    const height = closeY + CLOSE_H / 2 + 18;
    const left = this.anchor.x - RECORD_W / 2;
    const top = Math.max(TOP_MARGIN, this.anchor.bottom - height);

    const frame = add.graphics();
    frame.fillStyle(palette.ink, 0.94);
    frame.fillRoundedRect(0, 0, RECORD_W, height, 10);
    frame.lineStyle(1, palette.frame, 0.6);
    frame.strokeRoundedRect(0, 0, RECORD_W, height, 10);

    const face = add.graphics();
    const paint = (fill: number) => {
      face.clear();
      face.fillStyle(fill, 1);
      face.fillRoundedRect(
        centre - CLOSE_W / 2,
        closeY - CLOSE_H / 2,
        CLOSE_W,
        CLOSE_H,
        6,
      );
    };
    paint(palette.interactable);
    const label = add
      .text(centre, closeY, "CLOSE", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "14px",
        color: toCss(palette.ink),
        fontStyle: "bold",
        letterSpacing: 3,
      })
      .setOrigin(0.5);

    this.panel = add
      .container(left, top, [frame, ...parts, face, label])
      .setScrollFactor(0)
      .setDepth(RECORD_DEPTH);

    // hit areas live outside containers so pointer events work reliably. The blocker eats clicks
    // on the panel, so nothing under it (the resolved card's buttons) answers through it.
    const blocker = add
      .rectangle(
        this.anchor.x,
        top + height / 2,
        RECORD_W,
        height,
        palette.inkDeep,
        0,
      )
      .setInteractive()
      .setScrollFactor(0)
      .setDepth(RECORD_DEPTH)
      .setName("settlement-record");
    const closeHit = add
      .rectangle(
        this.anchor.x,
        top + closeY,
        CLOSE_W,
        CLOSE_H,
        palette.inkDeep,
        0,
      )
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(RECORD_DEPTH + 1)
      .setName("close-the-record");
    closeHit.on("pointerover", () => paint(palette.interactableBright));
    closeHit.on("pointerout", () => paint(palette.interactable));
    closeHit.on("pointerdown", () => this.onClose());
    this.hits = [blocker, closeHit];
    this.drawnBody = bodyOf(view);
  }

  /** A labelled list in two columns, then "and n more"; returns the y below it. */
  private section(
    text: (
      x: number,
      y: number,
      content: string,
      size: number,
      colour: number,
      extra?: object,
    ) => Text,
    y: number,
    title: string,
    rows: RecordRow[],
    more: number,
    empty?: string,
  ): number {
    text(PAD, y, title, 12, palette.hudLabel, { letterSpacing: 2 });
    y += 20;
    if (rows.length === 0) {
      text(PAD, y, empty ?? "", 13, palette.hudFaint);
      return y + ROW_H + 8;
    }
    rows.forEach((row, i) => {
      const x = PAD + Math.floor(i / ROWS_PER_COL) * (COL_W + COL_GAP);
      const rowY = y + (i % ROWS_PER_COL) * ROW_H;
      text(
        x,
        rowY,
        cut(row.name, row.mark ? NAME_MAX_MARKED : NAME_MAX),
        13,
        palette.hudText,
      );
      if (row.mark)
        text(
          x + COL_W,
          rowY + 1,
          row.mark.text,
          12,
          TONE[row.mark.tone],
        ).setOrigin(1, 0);
    });
    y += Math.min(rows.length, ROWS_PER_COL) * ROW_H;
    if (more > 0) {
      text(PAD, y, `and ${more} more`, 12, palette.hudLabel);
      y += ROW_H;
    }
    return y + 8;
  }
}

/** Everything a record shows but its status: what decides whether a new copy needs a rebuild. */
function bodyOf(view: RecordView): string {
  return JSON.stringify({ ...view, status: undefined });
}

function cut(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}
