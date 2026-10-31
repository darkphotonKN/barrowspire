/**
 * The chat window at the bottom left of every world view (FS-WJGFJ §C): one stream of every
 * channel's lines, coloured by channel, newest at the bottom. It reads the chat store, so the
 * stream, the filter and the fold survive every scene change; the scene only places it.
 *
 * Neutral HUD on the game palette: a dark panel in a brass hairline. Top to bottom (FS-WJGFJ
 * Amendment 2026-10-31): the channel tabs (any combination shown, R24), the lines (`Name: text`),
 * a brass divider, and the input row on a near-black ground with the channel picker at its left
 * and the fold button at its right. Folded, the window is that input row alone. It sits at the
 * HUD's depth, under overlays and popups (R17). Only its tabs and the fold button take a click
 * and only the wheel over its lines is read; a scene asks `covers` so a click on the panel is
 * never an attack in the world behind it (R31).
 */

import type Phaser from "phaser";
import type { StoreApi } from "zustand";
import { ActionType } from "@/assets/types/client";
import {
  useChatStore,
  visibleChatLines,
  type ChatState,
} from "@/stores/chatStore";
import { socketManager } from "@/utils/class/SocketManager";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { carvedPanel } from "./carvedPanel";
import { ChatInput, type ChatSend } from "./chatInput";
import {
  domChatInputField,
  type ChatInputFieldFactory,
  type ChatInputFieldHandle,
} from "./chatInputField";
import {
  CHAT_CHANNEL_COLOUR,
  CHAT_FILTER_LABEL,
  CHAT_FOLD_OPEN,
  CHAT_FOLD_SHUT,
  CHAT_FOLD_W,
  CHAT_LINES_GAP,
  CHAT_PAD,
  CHAT_VISIBLE_LINES,
  CHAT_WINDOW_MARGIN,
  CHAT_WINDOW_X,
  CHAT_SCROLL_GRAB,
  CHAT_SCROLL_W,
  CHAT_TAB_PAD,
  chatEntryColour,
  chatFoldButton,
  chatScrollOffsetAt,
  chatScrollThumb,
  chatScrollTrack,
  chatTabSegments,
  chatWindowFrame,
  formatChatEntry,
  scrolledOffset,
  visibleEntries,
  wrapChatText,
  type ChatWindowFrame,
  type Rect,
} from "./chatWindowLayout";

/** What a scene gives the window: what the input needs to let the player type. */
export interface ChatWindowOptions {
  input?: ChatWindowInput;
}

/** What a scene gives the window so the player can type: who owns the keys, and how a line leaves. */
export interface ChatWindowInput {
  /** Whether nothing else (a dialogue, a menu, an overlay) owns Enter and Esc now (R27). */
  mayOpen: () => boolean;
  send: (line: ChatSend) => void;
  /** The text field and picker; the real DOM ones in a scene (`domChatInputField`), a stand-in in a test. */
  makeField: ChatInputFieldFactory;
}

/**
 * The window as a scene hangs it: the app's chat store, the bottom-left corner above the canvas
 * bottom, the real DOM input row, and the scene's own rule for who owns Enter and Esc (R27).
 */
export function mountChatWindow(
  scene: Phaser.Scene,
  mayOpen: () => boolean,
): ChatWindow {
  return new ChatWindow(
    scene,
    useChatStore,
    CHAT_WINDOW_X,
    scene.cameras.main.height - CHAT_WINDOW_MARGIN,
    {
      input: {
        mayOpen,
        send: (line) => socketManager.sendMessage(ActionType.Chat, line),
        makeField: domChatInputField,
      },
    },
  );
}

const HUD_DEPTH = 1000;
const FONT_PX = 14;
const FOLD_FONT_PX = 17;
/** Folded, the ▴ is a small triangle in the body face and reads smaller than ▾: drawn a size up. */
const FOLD_SHUT_FONT_PX = 19;
/** A hidden channel's tab label, drawn faint (R24). */
const TAB_OFF_ALPHA = 0.4;
/** A shown tab's underline, in its channel's colour. */
const TAB_UNDERLINE_H = 2;

/** How much of the carved panel's ground covers the world behind it. */
/**
 * Solid while the player types, so the line they write reads cleanly; see-through while the window
 * is open but idle, so it hides less of the world (asked 2026-10-31).
 */
const OPACITY_TYPING = 1;
const OPACITY_IDLE = 0.55;

/**
 * The divider above the input: a brass rule fading toward both ends with a small brass lozenge at
 * its centre, the flourish game UIs set between a frame's parts (asked 2026-10-31).
 */
function drawFlourishRule(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
): void {
  const mid = x + width / 2;
  const steps: [number, number][] = [
    [0.04, 0.15],
    [0.16, 0.35],
    [0.3, 0.55],
  ];
  for (const [from, alpha] of steps) {
    g.lineStyle(1, palette.chatRule, alpha);
    g.lineBetween(x + width * from, y, mid - 7, y);
    g.lineBetween(mid + 7, y, x + width * (1 - from), y);
  }
  g.fillStyle(palette.chatRule, 0.9);
  g.fillTriangle(mid - 5, y, mid, y - 3.5, mid + 5, y);
  g.fillTriangle(mid - 5, y, mid, y + 3.5, mid + 5, y);
  g.fillStyle(palette.frameBright, 0.85);
  g.fillCircle(mid, y, 1.2);
}

const within = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

/** The window's chrome type: tabs, the idle input row, the fold button. Crisp, no shadow. */
const textStyle = (colour: number) => ({
  fontFamily: CANVAS_FONT.body,
  fontSize: `${FONT_PX}px`,
  color: toCss(colour),
});

/** A chat line's type: a soft dark shadow keeps the words legible when the idle panel lets a bright field through. */
const lineStyle = (colour: number) => ({
  ...textStyle(colour),
  shadow: {
    offsetX: 1,
    offsetY: 1,
    color: toCss(palette.chatInputGround),
    blur: 2,
    fill: true,
  },
});

export class ChatWindow {
  private bottom: number;
  private frame: ChatWindowFrame;
  private panel?: Phaser.GameObjects.Graphics;
  private maskShape?: Phaser.GameObjects.Graphics;
  private mask?: Phaser.Display.Masks.GeometryMask;
  private lineTexts: Phaser.GameObjects.Text[] = [];
  private scrollbar?: Phaser.GameObjects.Graphics;
  /** While the thumb is held: how far below its top it was grabbed. */
  private grabbed: number | null = null;
  private tabTexts: Phaser.GameObjects.Text[] = [];
  private foldText?: Phaser.GameObjects.Text;

  /** Lines back from the newest; 0 is following (R21). */
  private offset = 0;
  private unsubscribe: () => void;
  private field?: ChatInputFieldHandle;
  private input?: ChatInput;

  /** `x` is the panel's left edge; `bottom` the screen y of its bottom edge. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly store: StoreApi<ChatState>,
    private readonly x: number,
    bottom: number,
    options: ChatWindowOptions = {},
  ) {
    this.bottom = bottom;
    this.frame = this.frameNow();
    this.drawAll();
    this.unsubscribe = store.subscribe((state, prev) =>
      this.onStore(state, prev),
    );
    scene.input.on("wheel", this.onWheel, this);
    scene.input.on("pointerdown", this.onPress, this);
    scene.events.on("postupdate", this.watchKeys, this);
    scene.input.on("pointermove", this.onDrag, this);
    scene.input.on("pointerup", this.onRelease, this);
    if (options.input) this.buildInput(options.input);
    this.drawInputRow();
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
    if (bottom === this.bottom) return;
    this.bottom = bottom;
    this.relayout();
  }

  destroy(): void {
    this.unsubscribe();
    this.scene.input?.off("wheel", this.onWheel, this);
    this.scene.input?.off("pointerdown", this.onPress, this);
    this.scene.input?.off("pointermove", this.onDrag, this);
    this.scene.input?.off("pointerup", this.onRelease, this);
    this.scene.events?.off("postupdate", this.watchKeys, this);
    this.scene.input?.keyboard?.off("keydown-ENTER", this.onEnter, this);
    this.input?.cancel();
    this.field?.destroy();
    this.field = this.input = undefined;
    this.clearLines();
    this.clearTabs();
    this.foldText?.destroy();
    this.panel?.destroy();
    this.scrollbar?.destroy();
    this.scrollbar = undefined;
    this.maskShape?.destroy();
    this.mask?.destroy();
    this.foldText = this.panel = this.maskShape = this.mask = undefined;
  }

  /** The text field's place: the whole input row, short of the fold button while folded. */
  private fieldRect(): Rect {
    const input = this.frame.input;
    return this.store.getState().folded
      ? { ...input, width: input.width - CHAT_FOLD_W }
      : input;
  }

  private frameNow(): ChatWindowFrame {
    return chatWindowFrame(this.x, this.bottom, this.store.getState().folded);
  }

  private relayout(): void {
    this.frame = this.frameNow();
    this.drawAll();
    this.field?.moveTo(this.fieldRect());
    this.drawInputRow();
  }

  private drawAll(): void {
    this.rebuildMask();
    this.drawPanel();
    this.drawTabs();
    this.drawLines();
  }

  /**
   * The store changed. A fold re-lays the window; a toggle redraws the tabs and goes back to the
   * newest lines (R24). A new line the player can see leaves a scrolled-back view on the lines it
   * showed; one in a hidden channel, or any line while folded, moves nothing (R21).
   */
  private onStore(state: ChatState, prev: ChatState): void {
    if (state.folded !== prev.folded) {
      this.offset = 0;
      this.relayout();
      return;
    }
    if (state.shown !== prev.shown) {
      this.offset = 0;
      this.drawPanel();
      this.drawTabs();
      this.drawLines();
      return;
    }
    const newest = state.lines[state.lines.length - 1];
    const arrived =
      newest !== undefined && newest !== prev.lines[prev.lines.length - 1];
    if (!arrived || state.folded) return;
    const seen = newest.kind === "system" || state.shown[newest.channel];
    if (!seen) return;
    // a full buffer drops one line as it adds one, so the offset never passes the oldest line
    if (this.offset > 0) {
      this.offset = Math.min(
        this.offset + 1,
        Math.max(0, this.scrollable() - CHAT_VISIBLE_LINES),
      );
    }
    this.drawLines();
  }

  /** The input: a field and picker over the input row, the rules in `ChatInput`, Enter in the scene to open it (R26). */
  private buildInput(typing: ChatWindowInput): void {
    const keyboard = () => this.scene.input?.keyboard;
    let input: ChatInput | undefined;
    this.mayOpen = typing.mayOpen;
    this.field = typing.makeField(this.scene, this.fieldRect(), {
      focused: () => input?.focused(),
      blurred: () => input?.blurred(),
      keyDown: (key, composing) => input?.keyDown(key, composing),
      typed: (composing) => input?.typed(composing),
      picked: (channel) => input?.pick(channel),
    });
    input = new ChatInput({
      field: this.field,
      keyboard,
      mayOpen: typing.mayOpen,
      send: typing.send,
      changed: () => this.inputChanged(),
      recall: {
        lines: () => this.store.getState().sent,
        remember: (line) => this.store.getState().rememberSent(line),
      },
    });
    this.input = input;
    keyboard()?.on("keydown-ENTER", this.onEnter, this);
  }

  /** How much of the world the panel hides now: all of it while typing. */
  private opacity(): number {
    return this.isTyping() ? OPACITY_TYPING : OPACITY_IDLE;
  }

  /** The input opened, closed or its draft changed: the panel redraws only when its opacity flips. */
  private inputChanged(): void {
    const typing = this.isTyping();
    if (typing !== this.drawnTyping) {
      this.drawnTyping = typing;
      // typing in a folded window unfolds it, so the player sees what they answer (asked 2026-10-31)
      if (typing && this.store.getState().folded) {
        this.store.getState().toggleFolded();
        return;
      }
      // the graphics layer is reused in place, so the words drawn above it stay above it
      this.drawPanel();
    }
  }
  private drawnTyping = false;

  /**
   * Once a frame: the DOM row is shown while the player may type and hidden while something else
   * owns the keys, since a browser element always draws above the canvas and would otherwise sit
   * over the end-of-run card and the overlays (R17). The row looks the same idle and typing.
   */
  private watchKeys(): void {
    if (!this.mayOpen || !this.field) return;
    const allowed = this.mayOpen();
    if (allowed === this.rowShown) return;
    this.rowShown = allowed;
    if (allowed) {
      this.field.show();
    } else {
      // an overlay took the keys mid-line: the draft goes with the input (R27)
      this.input?.cancel();
      this.field.hide();
    }
  }
  private rowShown = true;
  private mayOpen?: () => boolean;

  private onEnter(): void {
    this.input?.requestOpen();
  }

  /**
   * A press while typing: one in the world lets go of the input (draft kept, keyboard back) so the
   * player plays on at once; one on the panel, a tab or the fold button, keeps them typing. The
   * browser will not move focus itself, since Phaser prevents a canvas mousedown's default.
   */
  private onPress(pointer: { x: number; y: number }): void {
    if (this.grabScrollbar(pointer)) return;
    if (!this.input?.isOpen() || this.covers(pointer.x, pointer.y)) return;
    this.field?.blur();
  }

  /** How many lines the player can scroll through now: the ones their filter shows. */
  private scrollable(): number {
    return visibleChatLines(this.store.getState()).length;
  }

  /**
   * A press on the scrollbar (asked 2026-10-31): on the thumb it is held where it was caught; on the
   * bare track the thumb jumps to centre on the press. Reports whether the press was the bar's.
   */
  private grabScrollbar(pointer: { x: number; y: number }): boolean {
    if (this.store.getState().folded) return false;
    const track = chatScrollTrack(this.frame);
    const onBar =
      pointer.x >= track.x - CHAT_SCROLL_GRAB &&
      pointer.x <= track.x + track.width + CHAT_SCROLL_GRAB &&
      pointer.y >= track.y &&
      pointer.y <= track.y + track.height;
    if (!onBar) return false;
    const thumb = chatScrollThumb(track, this.scrollable(), this.offset);
    if (!thumb) return false;
    const onThumb = pointer.y >= thumb.y && pointer.y <= thumb.y + thumb.height;
    this.grabbed = onThumb ? pointer.y - thumb.y : thumb.height / 2;
    this.scrollTo(pointer.y);
    return true;
  }

  /** While the thumb is held, the view follows the pointer up and down, wherever it wanders. */
  private onDrag(pointer: { x: number; y: number }): void {
    if (this.grabbed !== null) this.scrollTo(pointer.y);
  }

  private onRelease(): void {
    this.grabbed = null;
  }

  private scrollTo(pointerY: number): void {
    const track = chatScrollTrack(this.frame);
    const next = chatScrollOffsetAt(
      track,
      this.scrollable(),
      pointerY - (this.grabbed ?? 0),
    );
    if (next === this.offset) return;
    this.offset = next;
    this.drawLines();
  }

  /** The track and its thumb, drawn only while there is more than fits. */
  private drawScrollbar(): void {
    const g = (this.scrollbar ??= this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH));
    g.clear();
    if (this.store.getState().folded) return;
    const track = chatScrollTrack(this.frame);
    const thumb = chatScrollThumb(track, this.scrollable(), this.offset);
    if (!thumb) return;
    g.fillStyle(palette.chatRule, 0.18);
    g.fillRoundedRect(track.x, track.y, track.width, track.height, 2);
    g.fillStyle(palette.chatRule, 0.75);
    g.fillRoundedRect(thumb.x, thumb.y, thumb.width, thumb.height, 2);
  }

  private onWheel(
    pointer: { x: number; y: number },
    _over: unknown,
    _dx: number,
    dy: number,
  ): void {
    if (
      this.store.getState().folded ||
      !within(this.frame.messages, pointer.x, pointer.y)
    )
      return;
    const next = scrolledOffset(
      this.offset,
      dy,
      visibleChatLines(this.store.getState()).length,
    );
    if (next === this.offset) return;
    this.offset = next;
    this.drawLines();
  }

  /**
   * The panel, the shown tabs' grounds and underlines, the tab separators, the divider and the
   * input row's near-black ground, all in one graphics layer under the words.
   */
  private drawPanel(): void {
    const { panel, filterRow, messages, input } = this.frame;
    const g = (this.panel ??= this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH));
    g.clear();
    // the in-world panel house style, as the NPC dialogue wears it, letting a little world through
    carvedPanel(g, panel.x, panel.y, panel.width, panel.height, {
      opacity: this.opacity(),
    });

    if (filterRow.height > 0) {
      const shown = this.store.getState().shown;
      for (const segment of chatTabSegments(filterRow, (label) =>
        this.labelWidth(label),
      )) {
        if (shown[segment.channel]) {
          g.fillStyle(palette.chatTabOn, 0.9);
          g.fillRect(segment.x, segment.y, segment.width, segment.height);
          g.fillStyle(CHAT_CHANNEL_COLOUR[segment.channel], 0.9);
          g.fillRect(
            segment.x,
            segment.y + segment.height - TAB_UNDERLINE_H,
            segment.width,
            TAB_UNDERLINE_H,
          );
        }
        g.lineStyle(1, palette.chatRule, 0.3);
        g.lineBetween(
          segment.x + segment.width,
          segment.y + 4,
          segment.x + segment.width,
          segment.y + segment.height - 4,
        );
      }
      g.lineStyle(1, palette.chatRule, 0.35);
      g.lineBetween(
        filterRow.x,
        filterRow.y + filterRow.height,
        filterRow.x + filterRow.width,
        filterRow.y + filterRow.height,
      );
    }

    g.fillStyle(palette.chatInputGround, 0.95 * this.opacity());
    g.fillRoundedRect(input.x, input.y + 1, input.width, input.height - 1, 3);
    if (messages.height > 0) drawFlourishRule(g, input.x, input.y, input.width);
  }

  /**
   * The message area's clip: a wrapped line that overflows the top is cut, not drawn over the
   * tabs. Built once per frame geometry, never on a mere redraw. A destroyed mask that a drawn
   * line still wears throws inside Phaser's render and stops the whole game (the cmd-tab freeze,
   * 2026-10-31), so the old one goes only once no line wears it: `drawLines` follows every rebuild.
   */
  private rebuildMask(): void {
    const { messages } = this.frame;
    this.clearLines();
    this.maskShape?.destroy();
    this.mask?.destroy();
    this.maskShape = this.scene.make.graphics({}, false).setScrollFactor(0);
    // a mask's colour is never drawn, only its shape; any token keeps the fence's literal ban
    this.maskShape.fillStyle(palette.chatPanel);
    this.maskShape.fillRect(
      messages.x,
      messages.y,
      messages.width,
      messages.height,
    );
    this.mask = this.maskShape.createGeometryMask();
  }

  /** A tab label's width at the window's font, measured once per label. */
  private labelWidth(label: string): number {
    let width = this.measured.get(label);
    if (width === undefined) {
      const probe = this.scene.add.text(
        0,
        0,
        label,
        textStyle(palette.chatSystem),
      );
      width = probe.width;
      probe.destroy();
      this.measured.set(label, width);
    }
    return width;
  }
  private readonly measured = new Map<string, number>();

  /** The tab labels, centred in their segments, faint while their channel is hidden (R24). */
  private drawTabs(): void {
    this.clearTabs();
    const row = this.frame.filterRow;
    if (row.height === 0) return;
    const shown = this.store.getState().shown;
    const y = row.y + (row.height - 16) / 2;
    for (const segment of chatTabSegments(row, (label) =>
      this.labelWidth(label),
    )) {
      const tab = this.scene.add
        .text(segment.x + CHAT_TAB_PAD, y, CHAT_FILTER_LABEL[segment.channel], {
          ...textStyle(CHAT_CHANNEL_COLOUR[segment.channel]),
          padding: { x: CHAT_TAB_PAD, y: 3 },
        })
        .setScrollFactor(0)
        .setDepth(HUD_DEPTH)
        .setAlpha(shown[segment.channel] ? 1 : TAB_OFF_ALPHA)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () =>
          this.store.getState().toggleChannel(segment.channel),
        );
      // the padding widens the hit area to the whole segment; the label still sits where it did
      tab.setPosition(segment.x, y - 3);
      this.tabTexts.push(tab);
    }
  }

  /** The lines in view, laid bottom-up from the message area's foot so a wrapped line pushes the older ones up. */
  private drawLines(): void {
    this.clearLines();
    this.drawScrollbar();
    const m = this.frame.messages;
    if (m.height === 0) return;
    const entries = visibleEntries(
      visibleChatLines(this.store.getState()),
      this.offset,
    );
    // the newest line stands a little above the input row's divider
    let y = m.y + m.height - CHAT_LINES_GAP;
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      const t = this.scene.add
        .text(m.x + CHAT_PAD, 0, formatChatEntry(entry), {
          ...lineStyle(chatEntryColour(entry)),
          // fill each line before breaking: Phaser's own wrap breaks only at spaces, so a Chinese
          // sentence after "Name: " would jump whole to the next line
          // clear of the scrollbar at the right edge
          wordWrap: {
            width: m.width - CHAT_PAD * 2 - CHAT_SCROLL_W,
            callback: (text: string, self: Phaser.GameObjects.Text) =>
              wrapChatText(
                text,
                m.width - CHAT_PAD * 2 - CHAT_SCROLL_W,
                (part) => self.context.measureText(part).width,
              ),
          },
        })
        .setScrollFactor(0)
        .setDepth(HUD_DEPTH);
      y -= t.height;
      t.setPosition(m.x + CHAT_PAD, y);
      if (this.mask) t.setMask(this.mask);
      this.lineTexts.unshift(t);
    }
  }

  /** The fold button at the input row's right, and the hint while the input is closed with nothing typed. */
  private drawInputRow(): void {
    const folded = this.store.getState().folded;

    // the window's top-right corner: the tab row's end, or the input row's while folded
    const corner = chatFoldButton(this.frame);
    const foldPx = folded ? FOLD_SHUT_FONT_PX : FOLD_FONT_PX;
    this.foldText?.destroy();
    this.foldText = this.scene.add
      .text(
        corner.x,
        corner.y + (corner.height - foldPx - 4) / 2,
        folded ? CHAT_FOLD_SHUT : CHAT_FOLD_OPEN,
        {
          ...textStyle(palette.chatSystem),
          // a little larger than the words, so the corner button reads at a glance (asked 2026-10-31)
          fontSize: `${foldPx}px`,
          padding: { x: 6, y: 1 },
        },
      )
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.store.getState().toggleFolded());
  }

  private clearTabs(): void {
    this.tabTexts.forEach((t) => t.destroy());
    this.tabTexts = [];
  }

  private clearLines(): void {
    this.lineTexts.forEach((t) => t.destroy());
    this.lineTexts = [];
  }
}
