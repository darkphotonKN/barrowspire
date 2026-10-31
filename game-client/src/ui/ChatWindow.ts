/**
 * The chat window at the bottom left of every world view (FS-WJGFJ §C): one stream of every
 * channel's lines, coloured by channel, newest at the bottom. It reads the chat store, so the
 * stream survives every scene change; the scene only places it and takes it down.
 *
 * Neutral HUD, as the ResourceHud: a dark panel with a brass hairline, the body serif. It sits at
 * the HUD's depth, under overlays and popups (R17). It claims no pointer events: only the wheel
 * over its own message area is read, so the world beside it keeps every click (R31). The filter
 * row (I-WJGFJ-5) and the input (I-WJGFJ-4) have their space kept, top and bottom.
 */

import type Phaser from "phaser";
import type { StoreApi } from "zustand";
import type { ChatState } from "@/stores/chatStore";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import {
  CHAT_PAD,
  chatEntryColour,
  chatWindowFrame,
  formatChatEntry,
  scrolledOffset,
  visibleEntries,
  type ChatWindowFrame,
  type Rect,
} from "./chatWindowLayout";

const HUD_DEPTH = 1000;
const FONT_PX = 13;

const within = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

export class ChatWindow {
  private frame: ChatWindowFrame;
  private panel?: Phaser.GameObjects.Graphics;
  private maskShape?: Phaser.GameObjects.Graphics;
  private mask?: Phaser.Display.Masks.GeometryMask;
  private texts: Phaser.GameObjects.Text[] = [];
  /** Lines back from the newest; 0 is following (R21). */
  private offset = 0;
  /** How many lines the store held at the last draw, to hold a scrolled-back view still. */
  private seen: number;
  private unsubscribe: () => void;

  /** `x` is the panel's left edge; `bottom` the screen y of its bottom edge. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly store: StoreApi<ChatState>,
    private readonly x: number,
    bottom: number,
  ) {
    this.frame = chatWindowFrame(x, bottom);
    this.seen = store.getState().lines.length;
    this.drawPanel();
    this.drawLines();
    this.unsubscribe = store.subscribe(() => this.onStream());
    scene.input.on("wheel", this.onWheel, this);
  }

  /** Re-seat the window with its bottom edge at `bottom`: on the ResourceHud's top edge, or the canvas bottom (R18). */
  setBottom(bottom: number): void {
    if (bottom === this.frame.panel.y + this.frame.panel.height) return;
    this.frame = chatWindowFrame(this.x, bottom);
    this.drawPanel();
    this.drawLines();
  }

  destroy(): void {
    this.unsubscribe();
    this.scene.input?.off("wheel", this.onWheel, this);
    this.clearLines();
    this.panel?.destroy();
    this.maskShape?.destroy();
    this.mask?.destroy();
    this.panel = this.maskShape = this.mask = undefined;
  }

  /** A line arrived (or a notice): a scrolled-back view stays on the lines it showed (R21). */
  private onStream(): void {
    const total = this.store.getState().lines.length;
    const added = total - this.seen;
    this.seen = total;
    // a full buffer drops one as it adds one, so its length does not move: still one new line
    if (this.offset > 0) this.offset += added > 0 ? added : 1;
    this.drawLines();
  }

  private onWheel(
    pointer: { x: number; y: number },
    _over: unknown,
    _dx: number,
    dy: number,
  ): void {
    if (!within(this.frame.messages, pointer.x, pointer.y)) return;
    const next = scrolledOffset(
      this.offset,
      dy,
      this.store.getState().lines.length,
    );
    if (next === this.offset) return;
    this.offset = next;
    this.drawLines();
  }

  private drawPanel(): void {
    const { panel } = this.frame;
    const g = (this.panel ??= this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH));
    g.clear();
    g.fillStyle(palette.chatPanel, 0.85);
    g.fillRect(panel.x, panel.y, panel.width, panel.height);
    g.lineStyle(1, palette.frame, 0.35);
    g.strokeRect(panel.x, panel.y, panel.width, panel.height);

    // the message area clips: a wrapped line that overflows the top is cut, not drawn over the filter row
    const m = this.frame.messages;
    this.maskShape?.destroy();
    this.mask?.destroy();
    this.maskShape = this.scene.make.graphics({}, false).setScrollFactor(0);
    // a mask's colour is never drawn, only its shape; any token keeps the fence's literal ban
    this.maskShape.fillStyle(palette.chatPanel);
    this.maskShape.fillRect(m.x, m.y, m.width, m.height);
    this.mask = this.maskShape.createGeometryMask();
  }

  /** The lines in view, laid bottom-up from the message area's foot so a wrapped line pushes the older ones up. */
  private drawLines(): void {
    this.clearLines();
    const entries = visibleEntries(this.store.getState().lines, this.offset);
    const m = this.frame.messages;
    let y = m.y + m.height;
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      const t = this.scene.add
        .text(m.x + CHAT_PAD, 0, formatChatEntry(entry), {
          fontFamily: CANVAS_FONT.body,
          fontSize: `${FONT_PX}px`,
          color: toCss(chatEntryColour(entry)),
          wordWrap: { width: m.width - CHAT_PAD * 2 },
        })
        .setScrollFactor(0)
        .setDepth(HUD_DEPTH);
      y -= t.height;
      t.setPosition(m.x + CHAT_PAD, y);
      if (this.mask) t.setMask(this.mask);
      this.texts.unshift(t);
    }
  }

  private clearLines(): void {
    this.texts.forEach((t) => t.destroy());
    this.texts = [];
  }
}
