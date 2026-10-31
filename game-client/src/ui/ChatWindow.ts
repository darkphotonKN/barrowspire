/**
 * The chat window at the bottom left of every world view (FS-WJGFJ §C): one stream of every
 * channel's lines, coloured by channel, newest at the bottom. It reads the chat store, so the
 * stream survives every scene change; the scene only places it and takes it down.
 *
 * Neutral HUD, as the ResourceHud: a dark panel with a brass hairline, the body serif. It sits at
 * the HUD's depth, under overlays and popups (R17). Top to bottom: the channel filter row and the
 * area label (R24, R25), the lines, the input (R26). Only its toggles take a click and only the
 * wheel over its lines is read; a scene asks `covers` so a click on the panel is never an attack
 * in the world behind it (R31).
 */

import type Phaser from "phaser";
import type { StoreApi } from "zustand";
import {
  CHAT_CHANNELS,
  visibleChatLines,
  type ChatChannel,
  type ChatState,
} from "@/stores/chatStore";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { ChatInput, type ChatSend } from "./chatInput";
import type { ChatEntryFactory, ChatEntryHandle } from "./chatEntryField";
import {
  CHAT_INPUT_HINT,
  CHAT_INPUT_PROMPT,
  CHAT_INPUT_TEXT_X,
  CHAT_PAD,
  CHAT_CHANNEL_COLOUR,
  CHAT_FILTER_LABEL,
  chatEntryColour,
  chatWindowFrame,
  formatChatEntry,
  scrolledOffset,
  visibleEntries,
  type ChatWindowFrame,
  type Rect,
} from "./chatWindowLayout";

/** What a scene gives the window: where the player is, and what the input needs to let them type. */
export interface ChatWindowOptions {
  /** The area label at the end of the filter row, in the client's words (R25). */
  area?: string;
  input?: ChatWindowInput;
}

/** What a scene gives the window so the player can type: who owns the keys, and how a line leaves. */
export interface ChatWindowInput {
  /** Whether nothing else (a dialogue, a menu, an overlay) owns Enter and Esc now (R27). */
  mayOpen: () => boolean;
  send: (line: ChatSend) => void;
  /** The text field; the real DOM one in a scene (`domChatEntry`), a stand-in in a test. */
  makeField: ChatEntryFactory;
}

const HUD_DEPTH = 1000;
const FONT_PX = 13;
/** A hidden channel's toggle, drawn faint (R24). */
const TOGGLE_OFF_ALPHA = 0.35;
const TOGGLE_GAP = 10;

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
  private unsubscribe: () => void;
  private filterTexts: Phaser.GameObjects.Text[] = [];
  private areaText?: Phaser.GameObjects.Text;
  private field?: ChatEntryHandle;
  private input?: ChatInput;
  private promptText?: Phaser.GameObjects.Text;
  private hintText?: Phaser.GameObjects.Text;

  /** `x` is the panel's left edge; `bottom` the screen y of its bottom edge. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly store: StoreApi<ChatState>,
    private readonly x: number,
    bottom: number,
    private readonly options: ChatWindowOptions = {},
  ) {
    this.frame = chatWindowFrame(x, bottom);
    this.drawPanel();
    this.drawFilterRow();
    this.drawLines();
    this.unsubscribe = store.subscribe((state, prev) =>
      this.onStream(state, prev),
    );
    scene.input.on("wheel", this.onWheel, this);
    if (options.input) this.buildInput(options.input);
  }

  /** Whether a screen point lies on the window: a scene's click there is the window's, not the world's (R31). */
  covers(x: number, y: number): boolean {
    return within(this.frame.panel, x, y);
  }

  /** Whether the player is typing in the input right now. */
  isTyping(): boolean {
    return this.input?.isOpen() ?? false;
  }

  /** The scene takes the keys back (the end-of-run overlay): close the input and drop the draft (R27). */
  cancelInput(): void {
    this.input?.cancel();
  }

  /** Re-seat the window with its bottom edge at `bottom`: on the ResourceHud's top edge, or the canvas bottom (R18). */
  setBottom(bottom: number): void {
    if (bottom === this.frame.panel.y + this.frame.panel.height) return;
    this.frame = chatWindowFrame(this.x, bottom);
    this.drawPanel();
    this.drawFilterRow();
    this.drawLines();
    this.field?.moveTo(this.frame.input);
    this.drawInputRow();
  }

  destroy(): void {
    this.unsubscribe();
    this.scene.input?.off("wheel", this.onWheel, this);
    this.scene.input?.keyboard?.off("keydown-ENTER", this.onEnter, this);
    this.input?.cancel();
    this.field?.destroy();
    this.promptText?.destroy();
    this.hintText?.destroy();
    this.field = this.input = this.promptText = this.hintText = undefined;
    this.clearLines();
    this.clearFilterRow();
    this.panel?.destroy();
    this.maskShape?.destroy();
    this.mask?.destroy();
    this.panel = this.maskShape = this.mask = undefined;
  }

  /**
   * The store changed. A toggle redraws the row and goes back to the newest lines (R24). A new
   * line the player can see leaves a scrolled-back view on the lines it showed; one in a hidden
   * channel moves nothing (R21).
   */
  private onStream(state: ChatState, prev: ChatState): void {
    if (state.shown !== prev.shown) {
      this.offset = 0;
      this.drawFilterRow();
      this.drawLines();
      return;
    }
    const newest = state.lines[state.lines.length - 1];
    const arrived =
      newest !== undefined && newest !== prev.lines[prev.lines.length - 1];
    if (!arrived) return;
    const seen = newest.kind === "system" || state.shown[newest.channel];
    if (!seen) return;
    if (this.offset > 0) this.offset += 1;
    this.drawLines();
  }

  /** The input: a field over the input row, the rules in `ChatInput`, Enter in the scene to open it (R26). */
  private buildInput(typing: ChatWindowInput): void {
    const keyboard = () => this.scene.input?.keyboard;
    let input: ChatInput | undefined;
    this.field = typing.makeField(this.scene, this.frame.input, {
      focused: () => input?.focused(),
      blurred: () => input?.blurred(),
      keyDown: (key, composing) => input?.keyDown(key, composing),
      typed: (composing) => input?.typed(composing),
    });
    input = new ChatInput({
      field: this.field,
      keyboard,
      mayOpen: typing.mayOpen,
      send: typing.send,
      changed: () => this.drawInputRow(),
    });
    this.input = input;
    keyboard()?.on("keydown-ENTER", this.onEnter, this);
    this.drawInputRow();
  }

  private onEnter(): void {
    this.input?.requestOpen();
  }

  /** The `>` prompt, and the hint while the input is closed with nothing typed. */
  private drawInputRow(): void {
    if (!this.input || !this.field) return;
    const r = this.frame.input;
    const y = r.y + (r.height - 16) / 2;
    const style = {
      fontFamily: CANVAS_FONT.body,
      fontSize: `${FONT_PX}px`,
      color: toCss(palette.chatSystem),
    };
    this.promptText?.destroy();
    this.promptText = this.scene.add
      .text(r.x + CHAT_PAD, y, CHAT_INPUT_PROMPT, style)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
    this.hintText?.destroy();
    this.hintText = undefined;
    if (!this.input.isOpen() && this.field.value === "") {
      this.hintText = this.scene.add
        .text(r.x + CHAT_INPUT_TEXT_X, y, CHAT_INPUT_HINT, style)
        .setScrollFactor(0)
        .setDepth(HUD_DEPTH);
    }
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
      visibleChatLines(this.store.getState()).length,
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
    const entries = visibleEntries(
      visibleChatLines(this.store.getState()),
      this.offset,
    );
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

  /**
   * The five channel toggles left to right, each in its channel's colour and faint while hidden,
   * and the area label at the row's right end (R24, R25). Drawn again on every toggle.
   */
  private drawFilterRow(): void {
    this.clearFilterRow();
    const row = this.frame.filterRow;
    const y = row.y + (row.height - 16) / 2;
    const shown = this.store.getState().shown;
    let x = row.x + CHAT_PAD;
    for (const channel of CHAT_CHANNELS) {
      const toggle = this.scene.add
        .text(x, y, CHAT_FILTER_LABEL[channel], {
          fontFamily: CANVAS_FONT.body,
          fontSize: `${FONT_PX}px`,
          color: toCss(CHAT_CHANNEL_COLOUR[channel]),
        })
        .setScrollFactor(0)
        .setDepth(HUD_DEPTH)
        .setAlpha(shown[channel] ? 1 : TOGGLE_OFF_ALPHA)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.toggle(channel));
      this.filterTexts.push(toggle);
      x += toggle.width + TOGGLE_GAP;
    }
    if (this.options.area) {
      this.areaText = this.scene.add
        .text(row.x + row.width - CHAT_PAD, y, this.options.area, {
          fontFamily: CANVAS_FONT.body,
          fontSize: `${FONT_PX}px`,
          color: toCss(palette.chatSystem),
        })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(HUD_DEPTH);
    }
  }

  private toggle(channel: ChatChannel): void {
    this.store.getState().toggleChannel(channel);
  }

  private clearFilterRow(): void {
    this.filterTexts.forEach((t) => t.destroy());
    this.filterTexts = [];
    this.areaText?.destroy();
    this.areaText = undefined;
  }

  private clearLines(): void {
    this.texts.forEach((t) => t.destroy());
    this.texts = [];
  }
}
