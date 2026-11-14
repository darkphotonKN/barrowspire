/**
 * The settlement record (FS-GV8WN §G R21): what a resolved player carried home, lost and earned,
 * and whether it has settled. A dark vellum panel with a brass hairline, fixed to the screen in
 * the popup band, its bottom on the anchor the scene gives it (just over the bottom-centre row of
 * buttons, so the Settlement button that toggles it stays reachable). One amber button, Close.
 *
 * The scene owns when it opens and what closing means (the held return to the town, R23):
 * this widget only draws, and reports a press of Close to `onClose` and the pointer coming onto it
 * to `onCloseHovered` (its sounds are the scene's, FS-WDM0X § Pass 2b E4, E5). Built on open and taken
 * down on close, so a closed record holds no hit areas.
 *
 * Every row is listed (FS-GV8WN §Change: The settlement record scrolls): the CARRIED HOME and
 * LOST sections share one scroll area under the status line, never taller than the two sections
 * of four the record held before, and the wheel over the panel moves them 24 px a notch while the
 * title, status, earned and delve lines and Close stay put. A section of up to eight rows is laid
 * out as it always was; a longer one fills its first column with half its rows, rounded up.
 *
 * Game palette only: vellum words, brass frame, amber for the one control. Finds carried out take
 * the safe channel, finds left in the barrow the danger channel, items used up the neutral label.
 * The heading is every window's title (`drawPanelTitle`, FS-3EBCA R20), no longer the
 * blackletter the guideline would permit here; everything is the body serif.
 */

import type Phaser from "phaser";
import { fillMaskArea, maskInView, viewport } from "@/render/viewport";
import { onSceneEnd } from "@/scenes/sceneEnd";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { drawPanelTitle } from "./panelFrame";
import type { Rect } from "./partyPanelLayout";
import type { RecordRow, RecordTone, RecordView } from "./settlement";

/** Over the resolved player's card (1500), under the passing notices (2000). */
export const RECORD_DEPTH = 1600;
export const RECORD_W = 520;

const PAD = 24;
const COL_GAP = 24;
const COL_W = (RECORD_W - 2 * PAD - COL_GAP) / 2;
/** A section's first column holds at least this many rows (a short list keeps today's 4 + 4). */
const ROWS_PER_COL = 4;
const ROW_H = 20;
/** A section's heading, and the gap after its rows. */
const HEADING_H = 20;
const SECTION_GAP = 8;
/** The scroll area's top in the panel: under the title band and the status line. */
const AREA_TOP = 90;
/** The panel but its scroll area: title band, status, earned and delve lines, Close, foot. */
const FIXED_H = 198;
/**
 * The scroll area's tallest: two sections of four rows, each with its heading, as the tallest
 * body before the record scrolled (FS-GV8WN §Change: The settlement record scrolls S4).
 */
const AREA_MAX = 2 * (HEADING_H + ROWS_PER_COL * ROW_H + SECTION_GAP);
/** Px the area moves a wheel notch, as the letter panel's body (S6). */
const SCROLL_STEP = 24;
const THUMB_W = 4;
const THUMB_MIN = 16;
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

type Stage = Pick<Phaser.Scene, "add" | "make" | "cameras" | "events">;
type Text = Phaser.GameObjects.Text;
type Write = (
  x: number,
  y: number,
  content: string,
  size: number,
  colour: number,
  extra?: object,
) => Text;

/** The open record's scroll area: where it stands, what it holds, and its one mask. */
interface ScrollArea {
  /** The area's screen rect. */
  rect: { x: number; y: number; width: number; height: number };
  /** The two sections' full height. */
  content: number;
  layer: Phaser.GameObjects.Layer;
  shape: Phaser.GameObjects.Graphics;
  /** The render scale the shape was last drawn on. */
  scale: number;
  thumb: Phaser.GameObjects.Graphics;
  /** Each heading and row with its screen place at offset 0. */
  texts: { text: Text; x: number; y: number }[];
}

export class SettlementRecord {
  private view?: RecordView;
  private panel?: Phaser.GameObjects.Container;
  private statusText?: Text;
  private hits: Phaser.GameObjects.Rectangle[] = [];
  /** Where the open record stands, logical units; none while it is down. */
  private drawnRect: Rect | null = null;
  /** The view the open panel was built for, but for its status. */
  private drawnBody?: string;
  private area?: ScrollArea;
  /** Px the area is scrolled down; 0 is the top (S6, S8). */
  private offset = 0;
  /** Ends the open record's render-scale watch and its scene-end hook. */
  private stopWatching?: () => void;

  constructor(
    private readonly scene: Stage,
    private anchor: { x: number; bottom: number },
    private readonly onClose: () => void,
    /** The pointer came onto Close: the scene's sound for it (FS-WDM0X § Pass 2b E4). */
    private readonly onCloseHovered: () => void = () => {},
  ) {}

  /**
   * The logical view changed: the record's place is `anchor` now, and an open record is built
   * again there, its content and state untouched (FS-ZAJMH R13), its offset kept but clamped to
   * the new area (S8).
   */
  relayout(anchor: { x: number; bottom: number }): void {
    this.anchor = anchor;
    if (!this.panel) return;
    const kept = this.offset;
    this.close();
    this.offset = kept;
    this.open();
  }

  /**
   * The record's content, replaced on every `settlement` (R20). Redrawn now if open: a copy that
   * changes only the status changes only the status line, keeping the offset; a new body is drawn
   * from the top (S8).
   */
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

  /** Down, its hit areas with it, and at the top when opened again (S8). Nothing is reported: the scene asked. */
  close(): void {
    this.stopWatching?.();
    this.panel?.destroy();
    this.panel = undefined;
    this.statusText = undefined;
    this.hits.forEach((hit) => hit.destroy());
    this.hits = [];
    this.drawnRect = null;
    // the Layer (and its texts) before the shape that masks it
    this.area?.layer.destroy();
    this.area?.shape.destroy();
    this.area?.thumb.destroy();
    this.area = undefined;
    this.offset = 0;
    this.drawnBody = undefined;
  }

  isOpen(): boolean {
    return this.panel !== undefined;
  }

  /** Where it stands while open, logical units; none while down (FS-84N1G R20: what it covers). */
  rect(): Rect | null {
    return this.drawnRect;
  }

  hasContent(): boolean {
    return this.view !== undefined;
  }

  private build(view: RecordView): void {
    const { add } = this.scene;
    const write: Write = (x, y, content, size, colour, extra = {}) =>
      add.text(x, y, content, {
        fontFamily: CANVAS_FONT.body,
        fontSize: `${size}px`,
        color: toCss(colour),
        ...extra,
      });
    const parts: Phaser.GameObjects.GameObject[] = [];
    const text: Write = (...args) => {
      const made = write(...args);
      parts.push(made);
      return made;
    };
    const centre = RECORD_W / 2;
    const content = recordContentHeight(view);
    const areaHeight = recordAreaHeight(content, this.anchor.bottom);
    const height = FIXED_H + areaHeight;
    const left = this.anchor.x - RECORD_W / 2;
    const top = Math.max(TOP_MARGIN, this.anchor.bottom - height);
    this.drawnRect = { x: this.anchor.x - RECORD_W / 2, y: top, width: RECORD_W, height };

    // the windows' one title, in capitals, no longer the blackletter (FS-3EBCA R20, R22)
    parts.push(
      drawPanelTitle(this.scene, { x: 0, y: 0, width: RECORD_W }, view.title),
    );
    this.statusText = text(
      centre,
      60,
      view.status.text,
      14,
      TONE[view.status.tone],
      { letterSpacing: 2 },
    ).setOrigin(0.5, 0);

    let y = AREA_TOP + areaHeight + 4;
    text(centre, y, view.earned, 14, palette.hudText).setOrigin(0.5, 0);
    y += 22;
    text(centre, y, view.delve, 13, palette.hudLabel).setOrigin(0.5, 0);
    y += 30;

    const closeY = y + CLOSE_H / 2;
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

    this.area = this.buildArea(
      view,
      write,
      {
        x: left,
        y: top + AREA_TOP,
        width: RECORD_W,
        height: areaHeight,
      },
      content,
    );
    this.scrollTo(this.offset);

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
      .setInteractive()
      .setScrollFactor(0)
      .setDepth(RECORD_DEPTH + 1)
      .setName("close-the-record");
    closeHit.on("pointerover", () => {
      paint(palette.interactableBright);
      this.onCloseHovered();
    });
    closeHit.on("pointerout", () => paint(palette.interactable));
    closeHit.on("pointerdown", () => this.onClose());
    // a wheel over the panel is the panel's alone, moving or not: stopped here, the scene's own
    // `wheel` (chat window, gear overlay) is never emitted (Phaser 4.2.1 InputPlugin#processWheelEvent)
    for (const hit of [blocker, closeHit])
      hit.on(
        "wheel",
        (
          _pointer: Phaser.Input.Pointer,
          _dx: number,
          dy: number,
          _dz: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          event.stopPropagation();
          this.scrollTo(this.offset + Math.sign(dy) * SCROLL_STEP);
        },
      );
    this.hits = [blocker, closeHit];
    this.drawnBody = bodyOf(view);
  }

  /**
   * The scroll area: the headings and rows as camera-fixed Texts at their screen places, in one
   * Layer above the frame, masked once by the area (S5, as `ChatWindow`'s `shapeMask`; ADR-0057
   * §Masks). The Layer is given a scroll factor of 0 as the chat's is: `maskInView` reads one.
   * The shape lies on the backing px grid, so a new render scale alone redraws it in place; that
   * watch ends on close, or on the scene's end, since the scene drops the record without closing it.
   */
  private buildArea(
    view: RecordView,
    write: Write,
    rect: ScrollArea["rect"],
    content: number,
  ): ScrollArea {
    const shape = this.scene.make.graphics({}, false).setScrollFactor(0);
    const layer = Object.assign(this.scene.add.layer(), {
      scrollFactorX: 0,
      scrollFactorY: 0,
    }).setDepth(RECORD_DEPTH);
    maskInView(layer, shape, this.scene.cameras.main);
    const texts: ScrollArea["texts"] = [];
    const held: Write = (x, y, ...rest) => {
      const made = write(rect.x + x, rect.y + y, ...rest).setScrollFactor(0);
      layer.add(made);
      texts.push({ text: made, x: rect.x + x, y: rect.y + y });
      return made;
    };
    let y = this.section(
      held,
      0,
      "CARRIED HOME",
      view.carried,
      "Nothing came home",
    );
    if (view.lost.length > 0) y = this.section(held, y, "LOST", view.lost);
    // above the Layer; it takes no input (S7)
    const thumb = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(RECORD_DEPTH);
    const area = { rect, content, layer, shape, scale: 0, thumb, texts };
    this.shapeMask(area);
    const unwatchScale = viewport.onChange((now) => {
      if (this.area && now.renderScale !== this.area.scale)
        this.shapeMask(this.area);
    });
    const unhookEnd = onSceneEnd(this.scene, () => this.stopWatching?.());
    this.stopWatching = () => {
      unwatchScale();
      unhookEnd();
      this.stopWatching = undefined;
    };
    return area;
  }

  /** Fills the area's shape on the backing px grid of the render scale now (`fillMaskArea`). */
  private shapeMask(area: ScrollArea): void {
    area.scale = viewport.renderScale;
    area.shape.clear();
    // a mask's colour is never drawn, only its alpha; any token keeps the fence's literal ban
    fillMaskArea(area.shape, area.rect, palette.hudText, area.scale);
  }

  /** The area's headings and rows `offset` px up, clamped to its ends, and the thumb with them. */
  private scrollTo(offset: number): void {
    const area = this.area;
    if (!area) return;
    this.offset = recordScroll(offset, area.content, area.rect.height);
    for (const { text, x, y } of area.texts)
      text.setPosition(x, y - this.offset);
    area.thumb.clear();
    const thumb = recordThumb(area.rect.height, area.content, this.offset);
    if (!thumb) return;
    area.thumb.fillStyle(palette.frame, 1);
    area.thumb.fillRoundedRect(
      area.rect.x + thumb.x,
      area.rect.y + thumb.y,
      thumb.width,
      thumb.height,
      2,
    );
  }

  /** A labelled list in two columns, filled column-major (S2); returns the y below it. */
  private section(
    text: Write,
    y: number,
    title: string,
    rows: RecordRow[],
    empty?: string,
  ): number {
    text(PAD, y, title, 12, palette.hudLabel, { letterSpacing: 2 });
    if (rows.length === 0) {
      text(PAD, y + HEADING_H, empty ?? "", 13, palette.hudFaint);
      return y + recordSectionHeight(0);
    }
    rows.forEach((row, i) => {
      const spot = recordRowSpot(i, rows.length);
      const x = PAD + spot.column * (COL_W + COL_GAP);
      const rowY = y + HEADING_H + spot.row * ROW_H;
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
    return y + recordSectionHeight(rows.length);
  }
}

/** Rows in the first column of a section of `n`: four, or half of them rounded up past eight (S2). */
export function recordColumnRows(n: number): number {
  return Math.max(ROWS_PER_COL, Math.ceil(n / 2));
}

/** Where row `i` of a section of `n` stands: column-major, the first column filled first (S2). */
export function recordRowSpot(
  i: number,
  n: number,
): { column: 0 | 1; row: number } {
  const first = recordColumnRows(n);
  return i < first ? { column: 0, row: i } : { column: 1, row: i - first };
}

/** A section of `n` rows: its heading, its first column's rows, the gap after; 0 is the empty line. */
export function recordSectionHeight(n: number): number {
  const rows = Math.max(1, Math.min(n, recordColumnRows(n)));
  return HEADING_H + rows * ROW_H + SECTION_GAP;
}

/** Both sections, as the scroll area holds them: an empty LOST is left out (S3). */
export function recordContentHeight(
  view: Pick<RecordView, "carried" | "lost">,
): number {
  const lost = view.lost.length > 0 ? recordSectionHeight(view.lost.length) : 0;
  return recordSectionHeight(view.carried.length) + lost;
}

/**
 * The scroll area: the content's height, at most {@link AREA_MAX}, and short enough that the panel
 * with its bottom on `anchorBottom` stays below {@link TOP_MARGIN}; never under a row (S4).
 */
export function recordAreaHeight(
  content: number,
  anchorBottom: number,
): number {
  return Math.max(
    ROW_H,
    Math.min(content, AREA_MAX, anchorBottom - TOP_MARGIN - FIXED_H),
  );
}

/** An offset kept to [0, content − area] (S6). */
export function recordScroll(
  offset: number,
  content: number,
  area: number,
): number {
  return Math.min(Math.max(0, content - area), Math.max(0, offset));
}

/**
 * The thumb, in the panel's right padding (x in the panel, y down from the area's top), or null
 * while the content fits: as long as the share in view, at least {@link THUMB_MIN}, placed by
 * the share scrolled (S7).
 */
export function recordThumb(
  area: number,
  content: number,
  offset: number,
): { x: number; y: number; width: number; height: number } | null {
  if (content <= area) return null;
  const height = Math.max(THUMB_MIN, (area * area) / content);
  const at = recordScroll(offset, content, area) / (content - area);
  return {
    x: RECORD_W - PAD + (PAD - THUMB_W) / 2,
    y: (area - height) * at,
    width: THUMB_W,
    height,
  };
}

/** Everything a record shows but its status: what decides whether a new copy needs a rebuild. */
function bodyOf(view: RecordView): string {
  return JSON.stringify({ ...view, status: undefined });
}

function cut(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}
