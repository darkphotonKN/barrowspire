/**
 * The Open tome card (FS-X2CMM §Change: Illuminated pages and the open tome C3–C5): the real class
 * book panel (`ClassBookPanel`) opened on a sample Spellbook, at its place in a run's 1080 × 720 view,
 * with the run's HUD pieces it must stand clear of outlined faintly (the ability bar, the chat, the
 * corner row, the top-right column). Its own canvas, drawn at the viewport's render scale; the panel's
 * roundels rebuild at each. `npm run contact:tome` renders it to docs/art/class-book-open-tome.png.
 */

import * as Phaser from "phaser";
import { installCrispText } from "@/render/crispText";
import { backingSize, fitGame, viewport } from "@/render/viewport";
import { fitCamera } from "@/render/viewport/camera";
import { onSceneEnd } from "@/scenes/sceneEnd";
import type { BookPageState } from "@/types/gameState";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { BARROW, BARROW_HEX } from "@/utils/theme";
import { abilityBarFrame } from "@/ui/abilityBarLayout";
import { CHAT_WINDOW_MARGIN, CHAT_WINDOW_X, chatWindowFrame } from "@/ui/chatWindowLayout";
import { ClassBookPanel } from "@/ui/ClassBookPanel";
import { bookLayout } from "@/ui/classBookLayout";
import type { BookSource } from "@/ui/classBookModel";
import { CORNER_ICONS, cornerIconFrame, type Rect } from "@/ui/hudCornerLayout";
import { MINIMAP } from "@/ui/minimap";
import { topRightCorner } from "@/ui/topRightColumn";

/** The card's view: a run's, at its narrowest. */
export const TOME_SHEET = { width: 1080, height: 720 } as const;

const page = (id: string, unlock_level: number, cost: number, over: Partial<BookPageState> = {}): BookPageState => ({
  id,
  unlock_level,
  cost,
  cooldown: { remaining: 0, total: 0 },
  spent: false,
  cooldown_length: 0,
  cast_time: 0,
  ...over,
});

/**
 * A level 12 mage at 30 mana, so every state shows: Witchlight ready, Far Hand recovering, Levitate
 * short of its cost, Binding Glyph and Recall locked.
 */
export const SAMPLE_BOOK: BookSource = {
  class: "mage",
  level: 12,
  resource: { kind: "mana", current: 30, max: 100, ability_cost: 10 },
  book: {
    pages: [
      page("witchlight", 2, 20, { cooldown_length: 45, cast_time: 1 }),
      page("far_hand", 5, 15, { cooldown_length: 30, cast_time: 1, cooldown: { remaining: 18, total: 30 } }),
      page("levitate", 9, 35, { cooldown_length: 90, cast_time: 1.5 }),
      page("binding_glyph", 13, 40, { cooldown_length: 60, cast_time: 2.5 }),
      page("recall", 17, 50, { limit: "floor", cast_time: 3 }),
    ],
  },
};

export class OpenTomeScene extends Phaser.Scene {
  private panel?: ClassBookPanel;
  private parts: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: "OpenTomeScene" });
  }

  create(): void {
    fitCamera(this.cameras.main);
    this.cameras.main.setBackgroundColor(BARROW_HEX.pitch);
    onSceneEnd(this, () => this.dispose());
    this.outlineHud();
    this.panel = new ClassBookPanel(this, { dismiss: () => {}, pick: () => {} });
    this.panel.show(SAMPLE_BOOK, 0);
    this.panel.open();
    this.panel.frame(0);
  }

  /** The pointer over the book's row `row` (none: -1), and the sweeps as they stand when the book was heard. */
  hover(row: number): void {
    const panel = this.panel;
    if (!panel) return;
    const box = bookLayout(viewport, SAMPLE_BOOK.book!.pages.length).rows[row]?.box;
    panel.pointerMove(box ? box.x + box.width / 2 : -1, box ? box.y + box.height / 2 : -1);
    panel.frame(0);
  }

  dispose(): void {
    this.panel?.destroy();
    this.panel = undefined;
    for (const p of this.parts) p.destroy();
    this.parts = [];
  }

  /** What the book must stand clear of, faint, each named. */
  private outlineHud(): void {
    const g = this.add.graphics().setDepth(0);
    this.parts.push(g);
    const corner = CORNER_ICONS.map((icon) => cornerIconFrame(icon, TOME_SHEET));
    const cornerRow: Rect = {
      x: Math.min(...corner.map((r) => r.x)),
      y: corner[0].y,
      width: Math.max(...corner.map((r) => r.x + r.width)) - Math.min(...corner.map((r) => r.x)),
      height: corner[0].height,
    };
    const column = topRightCorner(TOME_SHEET, { ...MINIMAP, mode: "normal" });
    const pieces: [string, Rect][] = [
      ["ability bar", abilityBarFrame(TOME_SHEET).row],
      ["chat", chatWindowFrame(CHAT_WINDOW_X, TOME_SHEET.height - CHAT_WINDOW_MARGIN).panel],
      ["corner row", cornerRow],
      ["minimap", column.minimap!],
    ];
    for (const [name, r] of pieces) {
      g.fillStyle(palette.hudPanel, 0.6);
      g.fillRect(r.x, r.y, r.width, r.height);
      g.lineStyle(1, palette.frame, 0.35);
      g.strokeRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1);
      const t = this.add
        .text(r.x + 6, r.y + 4, name, { fontFamily: CANVAS_FONT.body, fontSize: "11px", color: toCss(palette.hudFaint) })
        .setDepth(1);
      this.parts.push(t);
    }
    // the player, in the view's middle
    g.fillStyle(palette.hudFaint, 0.5);
    g.fillCircle(TOME_SHEET.width / 2, TOME_SHEET.height / 2, 6);
  }
}

/** The card's own game on `parent`, in the card's own view. `unmount` ends it and puts the page's view back. */
export function mountOpenTome(parent: HTMLElement): { sheet: OpenTomeScene; unmount(): void } {
  const before = viewport.current();
  viewport.set({ ...TOME_SHEET, renderScale: 1, cssScale: 1 });
  installCrispText();
  const sheet = new OpenTomeScene();
  const backing = backingSize(viewport.current());
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    scale: { mode: Phaser.Scale.NONE, width: backing.width, height: backing.height, zoom: 1 },
    backgroundColor: BARROW.pitch,
    render: { roundPixels: true, antialias: true, pixelArt: false },
    scene: [sheet],
  });
  const unfit = fitGame(game);
  return {
    sheet,
    unmount: () => {
      unfit();
      sheet.dispose();
      game.destroy(true);
      viewport.set(before);
    },
  };
}
