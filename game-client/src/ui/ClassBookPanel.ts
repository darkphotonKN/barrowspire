/**
 * The class book's window, the open tome (FS-X2CMM §G R36, R38, R39; §Change: Illuminated pages and the
 * open tome C3–C7, C9): a window on the UI scene (ADR-0084; ADR-0086), drawn from `classBookModel` into
 * `classBookLayout`'s rects in `classBookStyle`'s look. A two-page vellum spread in leather at the view's
 * right side: on the left page the book's title over a hairline rule and a row per page in book order, its
 * 28 px roundel (`PageRoundel`, ADR-0095) inked by its state, its name, and its cost, "Lv N" (the row
 * faint) or "spent"; on the right page the shown page in full, its 64 px roundel, its name, a Scar's scar
 * and where it was earned, its one line, "cost · cooldown" and its hint. The shown page is the one under
 * the pointer, else the first ready page (`shownPage`), and its row takes a soft wash. A recovering page's
 * roundels are swept each frame from its cooldown (`cooldownSwept`, `drawRoundelSweep`). Where a roundel's
 * textures cannot be made, its glyph is drawn in lines.
 *
 * **Drawn in place (C7).** It is built only as it opens and as the book's shape changes (its title, its
 * empty line, its pages' ids: `bookShape`), every page's two roundels with it, the right page's 64 px one
 * hidden while another page is shown. A page's state changing, or the pointer moving to another row,
 * re-inks the roundels and sets the words again; it never makes or takes down a game object.
 *
 * It stands in the windows' band (1300–1303), over the controls panel and under the settlement record,
 * with its own interactive ground over the spread (`uiGround`), so a press or a hover on it never reaches
 * the world: a left-click over it never attacks (R39). Its pointer is handed in by the UI scene in logical
 * units (`uiSceneBook.ts`), hit-tested by hand.
 */

import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { CANVAS_FONT, toCss } from "@/utils/canvasPalette";
import { cooldownSwept } from "./abilityCooldown";
import { bookLayout, rowAt, type TomeLayout } from "./classBookLayout";
import { bookKey, bookShape, bookView, shownPage, type BookSource, type BookView, type PageView } from "./classBookModel";
import { BOOK_STYLE, drawTome, drawWash, type TomeType } from "./classBookStyle";
import type { Rect } from "./hudCornerLayout";
import { PAGE_ICONS } from "./pageIcons";
import { PAGE_ROUNDEL_SIZE, PageRoundel, drawPageLines, drawRoundelSweep } from "./pageRoundel";
import { uiGround } from "./uiGround";
import type { BookPiece, BookWiring } from "./uiSceneBook";

/**
 * The window's depths (ADR-0086 Decision 4): its ground, the spread and a row's wash over the controls
 * panel (1200), its words and line glyphs over them, the roundels over the vellum, a recovering page's
 * sweep over its roundel (ADR-0094: the owner's, at the roundel's depth + 1); all under the settlement
 * record (1600).
 */
export const BOOK_DEPTH = 1300;
const CONTENT_DEPTH = BOOK_DEPTH + 1;
const ROUNDEL_DEPTH = BOOK_DEPTH + 2;
const SWEEP_DEPTH = BOOK_DEPTH + 3;

const ROW = PAGE_ROUNDEL_SIZE.tomeRow;
const LEAF = PAGE_ROUNDEL_SIZE.tomePage;

type Text = Phaser.GameObjects.Text;

/** A row's pieces: its roundel, its name and its mark (C4). */
interface RowParts {
  roundel: PageRoundel;
  name: Text;
  mark: Text;
}

/** The right page's words, top to bottom (C5). */
const LEAF_LINES = ["name", "scar", "line", "earned", "terms", "hint"] as const;
type LeafLine = (typeof LEAF_LINES)[number];
const LEAF_TYPE: Readonly<Record<LeafLine, TomeType>> = {
  name: BOOK_STYLE.type.leafName,
  scar: BOOK_STYLE.type.scar,
  line: BOOK_STYLE.type.line,
  earned: BOOK_STYLE.type.earned,
  terms: BOOK_STYLE.type.terms,
  hint: BOOK_STYLE.type.hint,
};

export class ClassBookPanel implements BookPiece {
  private shown = false;
  private source: BookSource | undefined;
  private heardAt = 0;
  /** What was built (`bookShape`) and what was drawn (`bookKey`), with the hovered row. */
  private builtShape = "";
  private drawnKey = "";
  private pointer = { x: -1, y: -1 };
  private view?: BookView;
  private layout?: TomeLayout;
  private parts: Phaser.GameObjects.GameObject[] = [];
  private rows: RowParts[] = [];
  /** Each page's 64 px roundel for the right page, by its index; only the shown page's stands. */
  private leafRoundels: PageRoundel[] = [];
  private leafTexts?: Record<LeafLine, Text>;
  private ground?: { destroy(): void };
  private lines?: Phaser.GameObjects.Graphics;
  private wash?: Phaser.GameObjects.Graphics;
  private sweep?: Phaser.GameObjects.Graphics;
  private closeMark?: { box: Rect; glyph: Text; lit: boolean };
  /** The row under the pointer, by index; -1 off every row. */
  private hovered = -1;

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

  /**
   * The owner's state, heard at `heardAt` (R38, C7): built again only as the book's shape changes; a
   * page's state changing is drawn in place, and a tick that changes nothing drawn draws nothing.
   */
  show(source: BookSource | undefined, heardAt: number): void {
    this.source = source;
    this.heardAt = heardAt;
    if (!this.shown) return;
    const view = bookView(source);
    if (bookShape(view) !== this.builtShape) {
      this.rebuild();
      return;
    }
    this.view = view;
    if (bookKey(view) !== this.drawnKey) this.draw();
  }

  /** A recovering page's sweeps, its row's and the right page's, run down from when its cooldown was heard (R38). */
  frame(now: number): void {
    const { sweep, view, layout } = this;
    if (!sweep || !view || !layout) return;
    sweep.clear();
    const at = shownPage(view, this.hovered);
    view.pages.forEach((page, i) => {
      if (page.state !== "recovering") return;
      const swept = cooldownSwept(page.cooldown, this.heardAt, now);
      drawRoundelSweep(sweep, layout.rows[i].roundel, ROW, swept);
      if (i === at) drawRoundelSweep(sweep, layout.leaf.roundel, LEAF, swept);
    });
  }

  pointerMove(x: number, y: number): void {
    this.pointer = { x, y };
    this.updateHover();
  }

  /** A press: the × closes it, a row is handed on (slice 11 arms or casts it), and every press on the spread is the book's. */
  pointerDown(x: number, y: number): boolean {
    const { layout, view } = this;
    if (!this.shown || !layout || !view) return false;
    if (this.closeMark && inside(this.closeMark.box, x, y)) {
      this.wiring.dismiss();
      return true;
    }
    if (!inside(layout.panel, x, y)) return false;
    const at = rowAt(layout, x, y);
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

  /** Everything the book's shape holds, made once: the spread, each row's pieces, both roundels per page, the right page's words. */
  private build(): void {
    const view = bookView(this.source);
    this.view = view;
    this.builtShape = bookShape(view);
    const layout = bookLayout(viewport, view.pages.length);
    this.layout = layout;
    const { type } = BOOK_STYLE;
    this.ground = uiGround(this.scene, BOOK_DEPTH)(layout.panel);
    const spread = this.scene.add.graphics();
    drawTome(spread, layout);
    this.wash = this.scene.add.graphics();
    const chrome = this.scene.add.container(0, 0, [spread, this.wash]);
    chrome.setDepth(BOOK_DEPTH).setScrollFactor(0);

    const words: Text[] = [this.text(layout.title.x, layout.title.y, view.title, type.title, [0.5, 0.5])];
    if (view.empty) words.push(this.text(layout.empty.x, layout.empty.y, view.empty, type.empty, [0.5, 0], layout.rule.x2 - layout.rule.x1));
    this.rows = view.pages.map((page, i) => {
      const at = layout.rows[i];
      const parts = {
        roundel: this.roundel(page, ROW),
        name: this.text(at.name.x, at.name.y, "", type.name, [0, 0.5]),
        mark: this.text(at.mark.x, at.mark.y, "", type.mark, [1, 0.5]),
      };
      words.push(parts.name, parts.mark);
      return parts;
    });
    this.leafRoundels = view.pages.map((page) => this.roundel(page, LEAF));
    const { x, top, wrap } = layout.leaf;
    this.leafTexts = Object.fromEntries(LEAF_LINES.map((line) => [line, this.text(x, top, "", LEAF_TYPE[line], [0.5, 0], wrap)])) as Record<LeafLine, Text>;
    words.push(...Object.values(this.leafTexts));
    const close = this.text(layout.close.x + layout.close.width / 2, layout.close.y + layout.close.height / 2, "×", type.close, [0.5, 0.5]);
    this.closeMark = { box: layout.close, glyph: close, lit: false };
    words.push(close);

    this.lines = this.scene.add.graphics();
    const content = this.scene.add.container(0, 0, [this.lines, ...words]);
    content.setDepth(CONTENT_DEPTH).setScrollFactor(0);
    this.sweep = this.scene.add.graphics().setDepth(SWEEP_DEPTH).setScrollFactor(0);
    this.parts = [chrome, content, this.sweep];
    this.hovered = -1;
    this.draw();
    this.updateHover();
  }

  private text(x: number, y: number, words: string, t: TomeType, origin: [number, number], wrap?: number): Text {
    return this.scene.add
      .text(x, y, words, {
        fontFamily: CANVAS_FONT.body,
        fontSize: `${t.px}px`,
        color: toCss(t.ink),
        fontStyle: t.italic ? "italic" : undefined,
        letterSpacing: t.spacing,
        align: wrap ? "center" : undefined,
        wordWrap: wrap ? { width: wrap } : undefined,
        lineSpacing: wrap ? BOOK_STYLE.leaf.lineSpacing : undefined,
      })
      .setOrigin(...origin);
  }

  private roundel(page: PageView, size: number): PageRoundel {
    return new PageRoundel({ scene: this.scene, depth: ROUNDEL_DEPTH, icon: PAGE_ICONS[page.id], size, name: page.id, lost: () => this.draw() });
  }

  /** The rows and the right page in the view's states, in place (C7). */
  private draw(): void {
    const { view, layout } = this;
    if (!view || !layout) return;
    this.drawnKey = bookKey(view);
    const lines = this.lines?.clear();
    const at = shownPage(view, this.hovered);
    this.wash?.clear();
    if (this.wash && at >= 0) drawWash(this.wash, layout.rows[at].box);
    view.pages.forEach((page, i) => {
      const box = layout.rows[i].roundel;
      if (!this.rows[i].roundel.show(box, page.state, i === this.hovered) && lines) drawPageLines(lines, PAGE_ICONS[page.id], box, ROW, page.state);
      const alpha = page.faint ? BOOK_STYLE.faint : 1;
      this.rows[i].name.setText(page.copy.name).setAlpha(alpha);
      this.rows[i].mark.setText(page.mark).setAlpha(alpha);
    });
    this.leafRoundels.forEach((r, i) => {
      if (i !== at) return r.hide();
      const page = view.pages[i];
      if (!r.show(layout.leaf.roundel, page.state) && lines) drawPageLines(lines, PAGE_ICONS[page.id], layout.leaf.roundel, LEAF, page.state);
    });
    this.drawLeaf(at >= 0 ? view.pages[at] : undefined);
  }

  /** The right page's words for `page`, flowed top to bottom under its roundel; blank with none (C5). */
  private drawLeaf(page: PageView | undefined): void {
    const texts = this.leafTexts;
    const layout = this.layout;
    if (!texts || !layout) return;
    const { afterName, afterScar, between } = BOOK_STYLE.leaf;
    let y = layout.leaf.top;
    for (const line of LEAF_LINES) {
      const words = page?.leaf[line] ?? "";
      const t = texts[line].setText(words).setY(y);
      if (!words) continue;
      y += t.height + (line === "name" ? (page?.leaf.scar ? afterName : afterScar) : line === "scar" ? afterScar : between);
    }
  }

  /** The × lit under the pointer; the row under it lifted and shown on the right page (C5). */
  private updateHover(): void {
    const { layout, view } = this;
    if (!this.shown || !layout || !view) return;
    const mark = this.closeMark;
    if (mark) {
      const lit = inside(mark.box, this.pointer.x, this.pointer.y);
      if (lit !== mark.lit) mark.glyph.setColor(toCss((mark.lit = lit) ? BOOK_STYLE.type.closeLit.ink : BOOK_STYLE.type.close.ink));
    }
    const at = rowAt(layout, this.pointer.x, this.pointer.y);
    if (at === this.hovered) return;
    this.hovered = at;
    this.draw();
  }

  private teardown(): void {
    for (const r of [...this.rows.map((row) => row.roundel), ...this.leafRoundels]) r.destroy();
    this.rows = [];
    this.leafRoundels = [];
    for (const p of this.parts) p.destroy();
    this.parts = [];
    this.ground?.destroy();
    this.ground = undefined;
    this.leafTexts = undefined;
    this.lines = undefined;
    this.wash = undefined;
    this.sweep = undefined;
    this.closeMark = undefined;
    this.layout = undefined;
    this.view = undefined;
    this.hovered = -1;
    this.builtShape = "";
    this.drawnKey = "";
  }
}

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

/** The class book for the run on `scene` (the UI scene), as `uiSceneBook.ts` keeps it. */
export function mountClassBook(scene: Phaser.Scene, wiring: BookWiring): BookPiece {
  return new ClassBookPanel(scene, wiring);
}
