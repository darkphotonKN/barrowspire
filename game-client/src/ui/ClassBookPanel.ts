/**
 * The class book's window (FS-X2CMM §G R36–R39): a window on the UI scene (ADR-0084; ADR-0086), drawn
 * from `classBookModel` into `classBookLayout`'s rects in `classBookStyle`'s look. The windows' frame,
 * title and × (`drawPanelFrame`, `drawPanelTitle`), the title the class's book; under it the vellum leaf
 * and the class's page roundels in book order (`PageRoundel`, ADR-0094), each inked by its state, a
 * locked page captioned "Lv N" and a spent one "spent", a recovering one swept each frame from its
 * cooldown (`cooldownSwept`, `drawRoundelSweep`). Where a roundel's textures cannot be made, its glyph
 * is drawn in lines. Hovering a page shows its tip on the item tip's ground: its name, a Scar's scar and
 * where it was earned, its one line, its cost and cooldown, and why it waits.
 *
 * It stands in the windows' band (1300–1303), over the controls panel and under the settlement record,
 * with its own interactive ground over its rect (`uiGround`), so a press or a hover on it never reaches
 * the world: a left-click over it never attacks (R39). Its tip stands in the item tips' band (2200). Its
 * pointer is handed in by the UI scene in logical units (`uiSceneBook.ts`), hit-tested by hand.
 */

import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { CANVAS_FONT, toCss } from "@/utils/canvasPalette";
import { cooldownSwept } from "./abilityCooldown";
import { bookLayout, pageAt, type BookLayout } from "./classBookLayout";
import { bookKey, bookView, type BookSource, type BookTipLine, type BookView } from "./classBookModel";
import { BOOK_STYLE, drawLeaf } from "./classBookStyle";
import { itemTipRow } from "./gearOverlayLayout";
import { tipGround } from "./itemTip";
import { PAGE_ICONS } from "./pageIcons";
import { PAGE_ROUNDEL_SIZE, PageRoundel, drawPageLines, drawRoundelSweep } from "./pageRoundel";
import { drawPanelFrame, drawPanelTitle, lightClose, type FrameRect } from "./panelFrame";
import { uiGround } from "./uiGround";
import type { BookPiece, BookWiring } from "./uiSceneBook";

/**
 * The window's depths (ADR-0086 Decision 4): its ground and frame over the controls panel (1200), its leaf,
 * captions and line glyphs over them, the roundels over the leaf, a recovering page's sweep over its
 * roundel (ADR-0094: the owner's, at the roundel's depth + 1); all under the settlement record (1600).
 */
export const BOOK_DEPTH = 1300;
const CONTENT_DEPTH = BOOK_DEPTH + 1;
const ROUNDEL_DEPTH = BOOK_DEPTH + 2;
const SWEEP_DEPTH = BOOK_DEPTH + 3;
/** The item tips' band (ADR-0086 Decision 4). */
const TIP_DEPTH = 2200;

const SIZE = PAGE_ROUNDEL_SIZE.book;

export class ClassBookPanel implements BookPiece {
  private shown = false;
  private source: BookSource | undefined;
  private heardAt = 0;
  private drawnKey = "";
  private pointer = { x: -1, y: -1 };
  private view?: BookView;
  private layout?: BookLayout;
  private parts: Phaser.GameObjects.GameObject[] = [];
  private roundels: PageRoundel[] = [];
  private ground?: { destroy(): void };
  private lines?: Phaser.GameObjects.Graphics;
  private sweep?: Phaser.GameObjects.Graphics;
  private closeMark?: { box: FrameRect; glyph: Phaser.GameObjects.Text; lit: boolean };
  /** The page under the pointer, by index, and its tip. */
  private hovered = -1;
  private tip?: { container: Phaser.GameObjects.Container; width: number; height: number };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly wiring: BookWiring,
  ) {}

  isOpen(): boolean {
    return this.shown;
  }

  open(): void {
    if (this.shown) return;
    this.shown = true;
    this.build();
  }

  close(): void {
    if (!this.shown) return;
    this.shown = false;
    this.teardown();
  }

  /** The owner's state, heard at `heardAt`: drawn again only where a page's state changed (R38). */
  show(source: BookSource | undefined, heardAt: number): void {
    this.source = source;
    this.heardAt = heardAt;
    if (!this.shown) return;
    const view = bookView(source);
    if (bookKey(view) !== this.drawnKey) this.rebuild();
    else this.view = view;
  }

  /** A recovering page's sweep, run down from when its cooldown was heard (R38; ADR-0094 "Not ready"). */
  frame(now: number): void {
    const sweep = this.sweep;
    const view = this.view;
    const layout = this.layout;
    if (!sweep || !view || !layout) return;
    sweep.clear();
    view.pages.forEach((page, i) => {
      if (page.state === "recovering") drawRoundelSweep(sweep, layout.pages[i], SIZE, cooldownSwept(page.cooldown, this.heardAt, now));
    });
  }

  pointerMove(x: number, y: number): void {
    this.pointer = { x, y };
    this.updateHover();
  }

  /** A press: the × closes it, a page is handed on (slice 11 arms it), and every press on the panel is the book's. */
  pointerDown(x: number, y: number): boolean {
    const layout = this.layout;
    const view = this.view;
    if (!this.shown || !layout || !view) return false;
    if (this.closeMark && inside(this.closeMark.box, x, y)) {
      this.wiring.dismiss();
      return true;
    }
    if (!inside(layout.panel, x, y)) return false;
    const at = pageAt(layout, x, y);
    if (at >= 0) this.wiring.pick(view.pages[at]);
    return true;
  }

  owns(object: unknown): boolean {
    return !!this.ground && object === this.ground;
  }

  relayout(): void {
    if (this.shown) this.rebuild();
  }

  destroy(): void {
    this.shown = false;
    this.teardown();
  }

  private rebuild(): void {
    this.teardown();
    this.build();
  }

  private build(): void {
    const view = bookView(this.source);
    this.view = view;
    this.drawnKey = bookKey(view);
    const layout = bookLayout(viewport, view.pages.length);
    this.layout = layout;
    const { panel } = layout;
    this.ground = uiGround(this.scene, BOOK_DEPTH)(panel);
    const frame = this.scene.add.graphics();
    const { close, glyph } = drawPanelFrame(this.scene, frame, panel);
    this.closeMark = { box: close, glyph, lit: false };
    const chrome = this.scene.add.container(0, 0, [frame, drawPanelTitle(this.scene, panel, view.title), glyph]);
    chrome.setDepth(BOOK_DEPTH).setScrollFactor(0);
    const leaf = this.scene.add.graphics();
    drawLeaf(leaf, layout.leaf);
    this.lines = this.scene.add.graphics();
    const content = this.scene.add.container(0, 0, [leaf, this.lines, ...this.captions(view, layout)]);
    content.setDepth(CONTENT_DEPTH).setScrollFactor(0);
    this.sweep = this.scene.add.graphics().setDepth(SWEEP_DEPTH).setScrollFactor(0);
    this.parts = [chrome, content, this.sweep];
    this.roundels = view.pages.map(
      (page) => new PageRoundel({ scene: this.scene, depth: ROUNDEL_DEPTH, icon: PAGE_ICONS[page.id], size: SIZE, name: page.id, lost: () => this.drawPages() }),
    );
    this.hovered = -1;
    this.drawPages();
    this.updateHover();
  }

  /** Each page's caption under its roundel (R38), or an empty book's line. */
  private captions(view: BookView, layout: BookLayout): Phaser.GameObjects.Text[] {
    const text = (x: number, y: number, words: string, px: number, ink: number, origin: [number, number]) =>
      this.scene.add.text(x, y, words, { fontFamily: CANVAS_FONT.body, fontSize: `${px}px`, color: toCss(ink) }).setOrigin(...origin);
    const { caption, empty } = BOOK_STYLE;
    if (view.empty) return [text(layout.empty.x, layout.empty.y, view.empty, empty.px, empty.ink, [0.5, 0.5])];
    return view.pages.flatMap((page, i) =>
      page.caption ? [text(layout.captions[i].x, layout.captions[i].y, page.caption, caption.px, page.state === "locked" ? caption.locked : caption.spent, [0.5, 0])] : [],
    );
  }

  /** Every roundel in its state, the hovered one lifted; where one cannot stand, its glyph in lines. */
  private drawPages(): void {
    const view = this.view;
    const layout = this.layout;
    const lines = this.lines?.clear();
    if (!view || !layout) return;
    view.pages.forEach((page, i) => {
      const box = layout.pages[i];
      if (this.roundels[i]?.show(box, page.state, i === this.hovered)) return;
      if (lines) drawPageLines(lines, PAGE_ICONS[page.id], box, SIZE, page.state);
    });
  }

  /** The × lit under the pointer; the page under it lifted, its tip beside it (R37). */
  private updateHover(): void {
    const layout = this.layout;
    const view = this.view;
    if (!this.shown || !layout || !view) return;
    const mark = this.closeMark;
    if (mark) {
      const lit = inside(mark.box, this.pointer.x, this.pointer.y);
      if (lit !== mark.lit) lightClose(mark.glyph, (mark.lit = lit));
    }
    const at = pageAt(layout, this.pointer.x, this.pointer.y);
    if (at !== this.hovered) {
      this.hovered = at;
      this.hideTip();
      this.drawPages();
      if (at >= 0) this.tip = this.buildTip(view.pages[at].tip);
    }
    if (this.tip) {
      const [place] = itemTipRow([this.tip], this.pointer, viewport);
      this.tip.container.setPosition(place.x, place.y);
    }
  }

  /** A page's tip on the item tip's ground (R37): one line per part, each in its tone. */
  private buildTip(lines: readonly BookTipLine[]) {
    const { pad, lineGap, wrap, tones } = BOOK_STYLE.tip;
    let y = pad;
    const texts = lines.map((line) => {
      const tone: { px: number; ink: number; italic?: boolean } = tones[line.tone];
      const t = this.scene.add.text(pad, y, line.text, {
        fontFamily: CANVAS_FONT.body,
        fontSize: `${tone.px}px`,
        color: toCss(tone.ink),
        fontStyle: tone.italic ? "italic" : undefined,
        wordWrap: { width: wrap },
      });
      y += t.height + lineGap;
      return t;
    });
    const width = Math.round(Math.max(0, ...texts.map((t) => t.width)) + pad * 2);
    const height = Math.round(y - lineGap + pad);
    const container = this.scene.add.container(0, 0, [tipGround(this.scene, width, height), ...texts]);
    container.setDepth(TIP_DEPTH).setScrollFactor(0);
    return { container, width, height };
  }

  private hideTip(): void {
    this.tip?.container.destroy();
    this.tip = undefined;
  }

  private teardown(): void {
    this.hideTip();
    for (const r of this.roundels) r.destroy();
    this.roundels = [];
    for (const p of this.parts) p.destroy();
    this.parts = [];
    this.ground?.destroy();
    this.ground = undefined;
    this.lines = undefined;
    this.sweep = undefined;
    this.closeMark = undefined;
    this.layout = undefined;
    this.view = undefined;
    this.hovered = -1;
    this.drawnKey = "";
  }
}

function inside(r: FrameRect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

/** The class book for the run on `scene` (the UI scene), as `uiSceneBook.ts` keeps it. */
export function mountClassBook(scene: Phaser.Scene, wiring: BookWiring): BookPiece {
  return new ClassBookPanel(scene, wiring);
}
