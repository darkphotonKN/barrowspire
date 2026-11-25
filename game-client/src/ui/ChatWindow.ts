/**
 * The chat window at the bottom left of every world view (FS-WJGFJ §C): one stream of every
 * channel's lines, coloured by channel, newest at the bottom. It reads the chat store, so the
 * stream, the filter and the fold survive every scene change; the scene only places it.
 *
 * Neutral HUD on the game palette: a dark panel in a brass hairline. Top to bottom (FS-WJGFJ
 * Amendment 2026-10-31): the channel tabs (any combination shown, R24), the lines (`Name: text`),
 * a brass divider, and the input row on a near-black ground with the channel picker at its left
 * and the fold button at its right. Folded, the window is that input row alone. It sits at the
 * HUD's depth, under overlays and popups (R17). Its tabs, the fold button and the names in its
 * lines take a click (a name starts a whisper, FS-KCQ06 C15), and only the wheel over its lines is
 * read.
 *
 * It is the UI scene's (FS-TQZ5J § Change: Batch 6, R125): it stands on grounds of its own over its
 * panel and its open list, so a press, a move or the wheel on it never reaches the world (R129), and it
 * acts on the UI scene's scene-wide events only with nothing, or one of its own objects, top-most under
 * the pointer, so every UI piece drawn above it is its cover (R130).
 */

import type Phaser from "phaser";
import type { StoreApi } from "zustand";
import type { ChatChannel } from "@/stores/chatStore";
import { visibleChatLines, type ChatState } from "@/stores/chatStore";
import type { UiEffect } from "@/audio/uiSounds";
import type { ItemState } from "@/types/gameState";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { carvedPanel } from "./carvedPanel";
import { ChatInput, type ChatSend } from "./chatInput";
import type { ChatInputFieldFactory, ChatInputFieldHandle } from "./chatInputField";
import { snapshotItemView, type ItemSnapshot } from "@/chat/itemLinks";
import { isLinkPress, type PressedPointer } from "./linkPress";
import {
  CHAT_CHANNEL_COLOUR,
  CHAT_DIVIDER_INSET_FOOT,
  CHAT_DIVIDER_INSET_TOP,
  CHAT_FILTER_LABEL,
  CHAT_FOLD_OPEN,
  CHAT_FOLD_SHUT,
  CHAT_LINES_GAP,
  CHAT_PAD,
  CHAT_PICKER_ARROW,
  CHAT_ROW_TEXT_PAD,
  CHAT_VISIBLE_LINES,
  CHAT_SCROLL_GRAB,
  CHAT_SCROLL_W,
  CHAT_TAB_PAD,
  CHAT_TAG_GROUND_ALPHA,
  CHAT_TAG_INSET_Y,
  CHAT_TAG_PAD_Y,
  CHAT_TAG_PAD,
  chatEntryColour,
  chatEntrySegments,
  chatFieldRect,
  chatFoldButton,
  chatPickerList,
  chatPickerRect,
  chatNameSpan,
  chatScrollOffsetAt,
  chatScrollThumb,
  chatScrollTrack,
  chatTabSegments,
  chatTagColour,
  chatWindowFrame,
  formatChatEntry,
  rowTextY,
  scrolledOffset,
  visibleEntries,
  wrapChatSegments,
  wrapChatText,
  type ChatSegment,
  type ChatWindowFrame,
  type Rect,
} from "./chatWindowLayout";
import { itemTipRow } from "./gearOverlayLayout";
import { buildItemTip, type ItemTip } from "./itemTip";
import {
  fillMaskArea,
  maskInView,
  relayoutOn,
  viewport,
} from "@/render/viewport";

/** What a scene gives the window: what the input needs to let the player type, and who is playing. */
export interface ChatWindowOptions {
  input?: ChatWindowInput;
  /** This player's id: a whisper they sent is their echo, `To Name` (FS-KCQ06 R14). */
  selfId?: () => string | undefined;
  /**
   * Plays an interface sound on the game's one player (FS-WDM0X § Pass 2: the chat, C1–C5): a tab
   * pressed, the picker's list opened or shut, a hover, a draft refused. None, nothing plays.
   */
  play?: (effect: UiEffect) => void;
  /** Told as the player begins and stops typing (FS-TQZ5J § Change: Batch 6, R127): the UI's state. */
  typing?: (on: boolean) => void;
}

/** A link tag as it is drawn now (FS-KBA4Q R32): the item it shows, and its ground on the screen in logical units. */
export interface ChatTagHit {
  item: ItemSnapshot;
  rect: Rect;
}

/** What Phaser lists under the pointer for a scene-wide event (`currentlyOver`, top-most first). */
type Over = readonly unknown[] | undefined;

/** What a scene gives the window so the player can type: who owns the keys, and how a line leaves. */
export interface ChatWindowInput {
  /** Whether nothing else (a dialogue, a menu, an overlay) owns Enter and Esc now (R27). */
  mayOpen: () => boolean;
  /** Whether what owns the keys now was opened by a press elsewhere, so the draft is kept (`ChatInputDeps`). */
  keepsDraft?: () => boolean;
  send: (line: ChatSend) => void;
  /** The text field; the real DOM one in a scene (`domChatInputField`), a stand-in in a test. */
  makeField: ChatInputFieldFactory;
  /** The channels that may be picked; the server's open ones unless a test says otherwise. */
  open?: ReadonlySet<ChatChannel>;
}

const HUD_DEPTH = 1000;
/** A hovered link tag's item tip (FS-KBA4Q R37): the depth every canvas item tip stands at, above every panel. */
const TIP_DEPTH = 2200;
const FONT_PX = 14;
const FOLD_FONT_PX = 17;
/** Folded, the ▴ is a small triangle in the body face and reads smaller than ▾: drawn a size up. */
const FOLD_SHUT_FONT_PX = 19;
/** A hidden channel's tab label, drawn faint (R24). */
const TAB_OFF_ALPHA = 0.4;
/** A shown tab's underline, in its channel's colour. */
const TAB_UNDERLINE_H = 2;
/**
 * The picker's list (FS-J267Q R3) draws over the chat lines, under every popup and
 * overlay (2000): its ground and frame one step above the HUD, its words one more.
 */
const LIST_DEPTH = HUD_DEPTH + 1;
/** A closed channel's row in the list, drawn faint as a hidden tab is. */
const ROW_CLOSED_ALPHA = TAB_OFF_ALPHA;
/** The label's inset from the picker's left edge, and the ▾'s from its divider. */
const PICKER_LABEL_INSET = 4;
const PICKER_ARROW_INSET = 8;
/** Words whose drawn height is one row's: a text's height is its font's, whatever it says. */
const ROW_PROBE = "Mg";

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

/** The window's chrome type: tabs, the fold button. Crisp, no shadow. */
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
  private frame: ChatWindowFrame;
  private panel?: Phaser.GameObjects.Graphics;
  /** The message area's shape, redrawn in place as the area moves; the lines' one mask. */
  private maskShape?: Phaser.GameObjects.Graphics;
  /**
   * What the lines are drawn in: one Layer, masked once by the message area (ADR-0057 §Masks: a
   * mask is a filter pass, so the lines share one rather than wearing one each).
   */
  private lineLayer?: Phaser.GameObjects.Layer;
  private lineTexts: Phaser.GameObjects.Text[] = [];
  /** Each link tag drawn now (FS-KBA4Q R32), for `linkTagAt`. */
  private tagHits: ChatTagHit[] = [];
  /** The words top of the first row of the linked line drawn last (`drawLinkedLine`). */
  private linkedWordsTop = 0;
  /** The link tags' grounds and borders, in the line layer under the words; made with the first tag. */
  private tagGrounds?: Phaser.GameObjects.Graphics;
  /** Measures a linked line's words for its wrap, as a plain line's own text measures its own; made with the first tag. */
  private ruler?: Phaser.GameObjects.Text;
  /** The hovered link tag's item and its tip (FS-KBA4Q R37); none while no tag is hovered. */
  private tagTip?: { item: ItemSnapshot; tip: ItemTip };
  /**
   * Where the pointer last was, in logical units, while the window was free under it (R130); null
   * once a UI piece covers it there, it leaves the game, or before it ever moved. What a redraw
   * re-reads the hovered tag from, since the lines move under a still pointer.
   */
  private hoverPoint: { x: number; y: number } | null = null;
  /** Each drawn line's clickable name, where it is drawn now (FS-KCQ06 C15). */
  private nameHits: { name: string; rect: Rect }[] = [];
  /** The name the pointer went down on, if it did; the release on it is the click. */
  private pressedName: string | null = null;
  private scrollbar?: Phaser.GameObjects.Graphics;
  /** While the thumb is held: how far below its top it was grabbed. */
  private grabbed: number | null = null;
  private tabTexts: Phaser.GameObjects.Text[] = [];
  private foldText?: Phaser.GameObjects.Text;
  /** The canvas picker's words (its label and ▾) and its open list (FS-J267Q). */
  private pickerTexts: Phaser.GameObjects.Text[] = [];
  private listPanel?: Phaser.GameObjects.Graphics;
  /** What the picker last drew, so a keystroke that changes none of it redraws nothing. */
  private pickerDrawn = "";
  /** Whether the input row is shown: hidden while something else owns the keys (R26 idle row). */
  private rowShown = false;
  private stopRelayout?: () => void;

  /** Lines back from the newest; 0 is following (R21). */
  private offset = 0;
  private unsubscribe: () => void;
  /** Stops redrawing the clip on a render-scale change. */
  private unwatchScale: () => void;
  /** The render scale the clip was last drawn on. */
  private maskScale = 0;
  private field?: ChatInputFieldHandle;
  private input?: ChatInput;
  private readonly selfId: () => string | undefined;
  private readonly play: (effect: UiEffect) => void;
  private readonly typing: (on: boolean) => void;
  /** Whether the player was last reported typing (R127). */
  private reportedTyping = false;
  /**
   * Its ground over the panel (R129): made first, so every object of its own drawn after at its depth
   * stands over it; moved with the panel as it folds.
   */
  private readonly ground: Phaser.GameObjects.Zone;
  /** Its ground over the open list, wherever the list reaches; none while the list is shut. */
  private listGround?: Phaser.GameObjects.Zone;
  /**
   * Every interactive object it ever made, its grounds included: what Phaser lists top-most is its own
   * even once drawn again (a tab destroyed by its own press is still the one Phaser hands the scene).
   */
  private readonly mine = new WeakSet<object>();
  /** The tab or the list's row the pointer is on, by where it is: a hover plays once on entering one (C4). */
  private hovered: string | null = null;

  /** `x` is the panel's left edge; `bottom` the screen y of its bottom edge. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly store: StoreApi<ChatState>,
    private readonly x: number,
    private readonly bottom: number,
    options: ChatWindowOptions = {},
  ) {
    this.selfId = options.selfId ?? (() => undefined);
    this.play = options.play ?? (() => {});
    this.typing = options.typing ?? (() => {});
    this.frame = this.frameNow();
    this.ground = this.makeGround(this.frame.panel, HUD_DEPTH);
    this.drawAll();
    this.unsubscribe = store.subscribe((state, prev) =>
      this.onStore(state, prev),
    );
    // the clip lies on the backing px grid, so a new render scale alone redraws it
    this.unwatchScale = viewport.onChange((view) => {
      if (view.renderScale !== this.maskScale) this.shapeMask();
    });
    scene.input.on("wheel", this.onWheel, this);
    scene.input.on("pointerdown", this.onPress, this);
    scene.events.on("postupdate", this.watchKeys, this);
    scene.input.on("pointermove", this.onDrag, this);
    scene.input.on("pointerup", this.onRelease, this);
    scene.input.on("gameout", this.onPointerOut, this);
    scene.events.on("postupdate", this.watchTagTip, this);
    if (options.input) this.buildInput(options.input);
    this.drawInputRow();
  }

  /**
   * Whether a screen point lies on the window by its place, its open list included (FS-TQZ5J § Change:
   * Batch 6, R129): what the UI scene claims a press by while a world's press holds its cameras aside.
   */
  holds(x: number, y: number): boolean {
    if (within(this.frame.panel, x, y)) return true;
    // the open list is the window's too, wherever it reaches (FS-J267Q R4)
    return (
      (this.input?.pickerOpen() ?? false) &&
      within(chatPickerList(this.frame).box, x, y)
    );
  }

  /**
   * Whether a press keeps the window's field focused (FS-TQZ5J § Change: Batch 6, R131; A1 R26, as the party
   * panel's): the press is its own, Phaser's top-most hit one of its objects (R130), it lies on the window,
   * and its field holds focus. A UI piece drawn over the window there takes the press, and the field lets go.
   */
  keepsField(x: number, y: number, over: Over): boolean {
    const top = over?.[0];
    const own = typeof top === "object" && top !== null && this.mine.has(top);
    return own && this.holds(x, y) && this.isTyping();
  }

  /**
   * An item linked from the gear overlay (FS-KBA4Q R3): the input writes its token at the caret, holds
   * its snapshot and takes the focus, opening if it was closed; it does nothing where chat may not open
   * (R7). No input, or the window gone, nothing.
   */
  link(item: ItemState): void {
    if (this.destroyed) return;
    this.input?.link(item);
  }

  /**
   * The link tag drawn under a point in logical units, if any (FS-KBA4Q R32): the item it shows and
   * where its ground sits. Only inside the message area, as a name: a tag cut off above it lies
   * under the tabs. None under the open channel list, which is drawn over the lines there. A tag
   * takes no click (R39); this is what a hover reads (R37).
   */
  linkTagAt(x: number, y: number): ChatTagHit | null {
    if (!within(this.frame.messages, x, y)) return null;
    if (this.listGround && within(chatPickerList(this.frame).box, x, y)) return null;
    return this.tagHits.find((hit) => within(hit.rect, x, y)) ?? null;
  }

  /**
   * Where the text field stands while its row is shown, in logical units; null while it is hidden
   * or the window has none. The field is a browser element, drawn above everything on the canvas,
   * so an item tip is placed clear of it (FS-KBA4Q): the window's own, and the gear overlay's
   * through the UI scene.
   */
  fieldRow(): Rect | null {
    return this.field && this.rowShown ? this.fieldRect() : null;
  }

  /** Whether the player is typing in the input right now. */
  isTyping(): boolean {
    return this.input?.isOpen() ?? false;
  }

  /** Re-reads who owns the keys now, between frames: the world changed its report (FS-TQZ5J § Change: Batch 6, R128). */
  sync(): void {
    this.watchKeys();
  }

  /** The screen y of the panel's top edge as it now sits: what the invite prompts stack down to (FS-NCC9J R24). */
  topEdge(): number {
    return this.frameNow().panel.y;
  }

  destroy(): void {
    // closing the input below draws nothing: the window is going, and on a game destroy (leaving
    // /game) the scene's game-object factory has destroyed itself first (scenes/sceneEnd.ts)
    this.destroyed = true;
    this.unsubscribe();
    this.unwatchScale();
    this.scene.input?.off("wheel", this.onWheel, this);
    this.scene.input?.off("pointerdown", this.onPress, this);
    this.scene.input?.off("pointermove", this.onDrag, this);
    this.scene.input?.off("pointerup", this.onRelease, this);
    this.scene.input?.off("gameout", this.onPointerOut, this);
    this.scene.events?.off("postupdate", this.watchKeys, this);
    this.scene.events?.off("postupdate", this.watchTagTip, this);
    this.hoverPoint = null;
    this.hideTagTip();
    this.scene.input?.keyboard?.off("keydown-ENTER", this.onEnter, this);
    this.stopRelayout?.();
    this.input?.cancel();
    this.clearPicker();
    this.listPanel?.destroy();
    this.listPanel = undefined;
    this.field?.destroy();
    this.field = this.input = undefined;
    this.clearLines();
    this.clearTabs();
    this.foldText?.destroy();
    this.ground.destroy();
    this.listGround?.destroy();
    this.listGround = undefined;
    this.panel?.destroy();
    this.scrollbar?.destroy();
    this.scrollbar = undefined;
    this.tagGrounds?.destroy();
    this.ruler?.destroy();
    this.tagGrounds = this.ruler = undefined;
    this.lineLayer?.destroy();
    this.maskShape?.destroy();
    this.foldText = this.panel = this.maskShape = this.lineLayer = undefined;
  }

  /** The text field's place: the input row right of the picker, short of the fold button while folded. */
  private fieldRect(): Rect {
    return chatFieldRect(this.frame, this.store.getState().folded);
  }

  private frameNow(): ChatWindowFrame {
    return chatWindowFrame(this.x, this.bottom, this.store.getState().folded);
  }

  private relayout(): void {
    this.frame = this.frameNow();
    const { panel } = this.frame;
    this.ground.setPosition(panel.x, panel.y).setSize(panel.width, panel.height);
    this.drawAll();
    this.field?.moveTo(this.fieldRect());
    this.drawInputRow();
    this.drawPicker(true);
  }

  private drawAll(): void {
    this.shapeMask();
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
    this.field = typing.makeField(this.scene, this.fieldRect(), {
      focused: () => input?.focused(),
      blurred: () => input?.blurred(),
      keyDown: (key, composing, shift) => input?.keyDown(key, composing, shift),
      typed: (composing) => input?.typed(composing),
    });
    input = new ChatInput({
      field: this.field,
      keyboard,
      mayOpen: typing.mayOpen,
      keepsDraft: typing.keepsDraft,
      send: typing.send,
      open: typing.open,
      play: (effect) => this.play(effect),
      changed: () => this.inputChanged(),
      // a refused link press is a system line in the stream (FS-KBA4Q R11, R12)
      notice: (notice) => this.store.getState().notice(notice),
      recall: {
        lines: () => this.store.getState().sent,
        remember: (line) => this.store.getState().rememberSent(line),
      },
    });
    this.input = input;
    keyboard()?.on("keydown-ENTER", this.onEnter, this);
    // the list closes when the logical view changes size (FS-J267Q R6)
    this.stopRelayout = relayoutOn(this.scene, () => input?.closePicker());
    // apply the key owner now, so a window built under an overlay never shows its row a frame
    this.watchKeys();
  }

  /** How much of the world the panel hides now: all of it while typing. */
  private opacity(): number {
    return this.isTyping() ? OPACITY_TYPING : OPACITY_IDLE;
  }

  /** The input opened, closed or its draft changed: the panel redraws only when its opacity flips. */
  private inputChanged(): void {
    // told even as the window goes, so the world's keyboard is handed back (FS-TQZ5J § Change: Batch 6, R127)
    const typing = this.isTyping();
    if (typing !== this.reportedTyping) {
      this.reportedTyping = typing;
      this.typing(typing);
    }
    if (this.destroyed) return;
    this.drawPicker();
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
  /** Set as the window is let go: nothing is drawn after. */
  private destroyed = false;

  /**
   * Once a frame: the DOM row is shown while the player may type and hidden while something else
   * owns the keys, since a browser element always draws above the canvas and would otherwise sit
   * over the end-of-run card and the overlays (R17). The row looks the same idle and typing.
   */
  private watchKeys(): void {
    // the input decides (and drops a half-typed line when the keys are taken); the window only
    // shows or hides its DOM row
    const allowed = this.input?.sync();
    if (allowed === undefined || !this.field) return;
    if (allowed) this.field.show();
    else this.field.hide();
    // the canvas picker and its divider show and hide with the browser field (FS-J267Q R8)
    this.rowShown = allowed;
    this.drawPanel();
    this.drawPicker(true);
  }

  private onEnter(): void {
    this.input?.requestOpen();
  }

  /**
   * A press while typing: one in the world lets go of the input (draft kept, keyboard back) so the
   * player plays on at once; one on the panel, a tab or the fold button, keeps them typing. The
   * browser will not move focus itself, since Phaser prevents a canvas mousedown's default.
   */
  private onPress(pointer: { x: number; y: number } & PressedPointer, over?: Over): void {
    this.pressedName = null;
    // Phaser's pointer.x/y are backing px; the window is laid out in logical units (FS-ZAJMH R15)
    const at = viewport.toLogical(pointer);
    // a press on a UI piece drawn over the window is that piece's: nothing here is grabbed or named
    // (FS-TQZ5J § Change: Batch 6, R130), and the field lets go (A1 R26)
    if (!this.freeUnder(over)) {
      // but for a link press (FS-KBA4Q R4): the gear overlay answers it, and typing goes on
      if (this.input?.isOpen() && !isLinkPress(pointer)) this.field?.blur();
      return;
    }
    if (this.pressPicker(at)) return;
    if (this.grabScrollbar(at)) return;
    this.pressedName = this.nameAt(at.x, at.y);
    if (!this.input?.isOpen() || this.holds(at.x, at.y)) return;
    this.field?.blur();
  }

  /**
   * Whether the window may act on a scene-wide event: Phaser lists nothing top-most under the pointer, or
   * one of the window's own objects (FS-TQZ5J § Change: Batch 6, R130). Anything else there is a UI piece
   * drawn above it: the letter panel, the gear overlay, the party panel, the controls panel, the record,
   * the menu, the dialogue card, a notice.
   */
  private freeUnder(over: Over): boolean {
    const top = over?.[0];
    return top === undefined || (typeof top === "object" && top !== null && this.mine.has(top));
  }

  /** An interactive object of its own: what its own presses land on (R130). */
  private own<T extends object>(object: T): T {
    this.mine.add(object);
    return object;
  }

  /** A ground of its own at `rect`, drawing nothing, under the bone hand (R129; uiGround's make). */
  private makeGround(rect: Rect, depth: number): Phaser.GameObjects.Zone {
    return this.own(
      this.scene.add
        .zone(rect.x, rect.y, rect.width, rect.height)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(depth)
        .setInteractive(),
    );
  }

  /**
   * The name drawn under a screen point, if any. Only inside the message area: a wrapped line's
   * head cut off above it lies under the tabs.
   */
  private nameAt(x: number, y: number): string | null {
    if (!within(this.frame.messages, x, y)) return null;
    return this.nameHits.find((hit) => within(hit.rect, x, y))?.name ?? null;
  }

  /** How many lines the player can scroll through now: the ones their filter shows. */
  private scrollable(): number {
    return visibleChatLines(this.store.getState()).length;
  }

  /**
   * A press on the scrollbar (asked 2026-10-31): on the thumb it is held where it was caught; on the
   * bare track the thumb jumps to centre on the press. Reports whether the press was the bar's.
   * `pointer` in logical units.
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

  /**
   * While the thumb is held, the view follows the pointer up and down, wherever it wanders; a row of the
   * open list and a tab light only with nothing over the window there (R130).
   */
  private onDrag(pointer: { x: number; y: number }, over?: Over): void {
    const at = viewport.toLogical(pointer);
    if (this.grabbed !== null) this.scrollTo(at.y);
    const free = this.freeUnder(over);
    const row = free ? this.listRowAt(at.x, at.y) : null;
    if (row) this.input?.hover(row);
    this.hoverAt(at, row, free);
    this.hoverPoint = free ? at : null;
    this.syncTagTip();
  }

  /**
   * The item tip of the link tag under the pointer (FS-KBA4Q R37, R38): the bag's tip for the
   * tag's snapshot, beside the pointer and inside the view, above every panel. Made as the pointer
   * comes onto a tag, moved with it along the tag, and gone once no tag is under it: it left the
   * tag, the lines were drawn again without the tag there (a scroll, a new line, a filter, a
   * fold), or a UI piece covers the window there. A tag takes no click and no compare (R39).
   */
  private syncTagTip(): void {
    const at = this.hoverPoint;
    const hit = at && this.linkTagAt(at.x, at.y);
    if (!at || !hit) {
      this.hideTagTip();
      return;
    }
    if (this.tagTip?.item !== hit.item) {
      this.hideTagTip();
      const tip = buildItemTip(this.scene, snapshotItemView(hit.item));
      tip.container.setDepth(TIP_DEPTH).setScrollFactor(0);
      this.tagTip = { item: hit.item, tip };
    }
    // the pointer is in logical units, so the screen the tip stays on is the logical view (FS-ZAJMH R15)
    // and clear of the shown text field, which would show through it
    const [place] = itemTipRow([this.tagTip.tip], at, viewport, this.fieldRow());
    this.tagTip.tip.container.setPosition(place.x, place.y);
  }

  private hideTagTip(): void {
    this.tagTip?.tip.container.destroy();
    this.tagTip = undefined;
  }

  /** The pointer left the game: nothing is hovered until it moves over the window again. */
  private onPointerOut(): void {
    this.hoverPoint = null;
    this.hideTagTip();
  }

  /**
   * Once a frame while a tip shows: a UI piece that came over the tag under a still pointer (a
   * panel opened by its key) takes the tip, though no pointer event says so (R37, FS-TQZ5J R130).
   * Phaser lists what is under the pointer only as it moves, so the window asks it here.
   */
  private watchTagTip(): void {
    if (!this.tagTip) return;
    const input = this.scene.input;
    const pointer = input.activePointer;
    if (this.freeUnder(input.sortGameObjects(input.hitTestPointer(pointer), pointer))) return;
    this.hoverPoint = null;
    this.hideTagTip();
  }

  /**
   * `menu_hover` as the pointer comes onto a tab or a row of the open list it can pick (FS-WDM0X § Pass
   * 2: the chat, C4), judged by where it is, so one drawn again under a still pointer plays nothing more;
   * none while a UI piece drawn over the window is top-most there (`free` false, FS-TQZ5J R130).
   */
  private hoverAt(at: { x: number; y: number }, row: ChatChannel | null, free: boolean): void {
    const pickable = row !== null && (this.input?.canPick(row) ?? false);
    const target = !free ? null : pickable ? `row ${row}` : this.tabAt(at.x, at.y);
    if (target !== null && target !== this.hovered) this.play("menu_hover");
    this.hovered = target;
  }

  /** The tab under a logical point, if the tabs are drawn. */
  private tabAt(x: number, y: number): string | null {
    const row = this.frame.filterRow;
    if (row.height === 0) return null;
    const segment = chatTabSegments(row, (label) => this.labelWidth(label)).find((s) => within(s, x, y));
    return segment ? `tab ${segment.channel}` : null;
  }

  /**
   * A release ends a thumb drag; one on the name it went down on starts a whisper to it (FS-KCQ06
   * C15). On the release, not the press, as the fold button: the scene's attack handler has asked
   * whether the press was the window's before anything here moves (R31).
   */
  private onRelease(pointer: { x: number; y: number }, over?: Over): void {
    this.grabbed = null;
    const pressed = this.pressedName;
    this.pressedName = null;
    // a release on a UI piece drawn over the window picks no row and names nobody (R130)
    if (!this.freeUnder(over)) return;
    const at = viewport.toLogical(pointer);
    // a release on a row picks it, as a native drop-down does: a press on the picker and a drag
    // down the list picks too (FS-J267Q R4); a closed channel's row does nothing
    const row = this.listRowAt(at.x, at.y);
    if (row) {
      this.input?.pick(row);
      return;
    }
    if (pressed !== null && pressed === this.nameAt(at.x, at.y)) {
      this.input?.whisperTo(pressed);
    }
  }

  /**
   * A press on the canvas picker or its list (FS-J267Q R4), `at` in logical units. On
   * the picker it opens the input and toggles the list; on the list it waits for the release; any
   * other press shuts an open list and goes on as before. Reports whether the press was theirs.
   */
  private pressPicker(at: { x: number; y: number }): boolean {
    const input = this.input;
    if (!input || !this.rowShown) return false;
    if (within(chatPickerRect(this.frame), at.x, at.y)) {
      input.togglePicker();
      return true;
    }
    if (!input.pickerOpen()) return false;
    if (within(chatPickerList(this.frame).box, at.x, at.y)) return true;
    // the player's press outside it shuts it (FS-WDM0X § Pass 2: the chat, C3); one on a tab plays the
    // tab's sound alone, the list shut silently with it: one press, one sound (FS-TQZ5J § Change: Batch 6, R135)
    if (this.tabAt(at.x, at.y) !== null) input.closePicker();
    else input.dismissPicker();
    return false;
  }

  /** The channel of the open list's row at a logical point, if the list is open and one is there. */
  private listRowAt(x: number, y: number): ChatChannel | null {
    if (!this.input?.pickerOpen()) return null;
    return (
      chatPickerList(this.frame).rows.find((r) => within(r, x, y))?.channel ??
      null
    );
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
    over: Over,
    _dx: number,
    dy: number,
  ): void {
    const at = viewport.toLogical(pointer);
    // a wheel on a UI piece drawn over the window is that piece's: the settlement record keeps it over
    // the lines (FS-GV8WN S6; FS-TQZ5J § Change: Batch 6, R130)
    if (
      this.store.getState().folded ||
      !within(this.frame.messages, at.x, at.y) ||
      !this.freeUnder(over)
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
    // the picker's divider, on the canvas so no half-pixel seam opens against the browser field at
    // a fractional render scale (FS-J267Q R1); as faint as the window's other rules
    if (this.rowShown) {
      const picker = chatPickerRect(this.frame);
      const x = Math.round(picker.x + picker.width) + 0.5;
      g.lineStyle(1, palette.chatRule, 0.35);
      g.lineBetween(
        x,
        picker.y + CHAT_DIVIDER_INSET_TOP,
        x,
        picker.y + picker.height - CHAT_DIVIDER_INSET_FOOT,
      );
    }
  }

  /**
   * The message area's clip: a wrapped line that overflows the top is cut, not drawn over the
   * tabs. The lines sit in one Layer, masked once by one shape when the window is first drawn
   * (ADR-0057 §Masks: a mask is a filter pass); a new frame geometry (a resize, a fold) redraws
   * that shape in place, so the mask is never laid twice and its shape is never destroyed under
   * it (a destroyed mask stopped the whole game in Phaser 3: the cmd-tab freeze, 2026-10-31).
   *
   * A Layer has no transform and no scroll factor of its own (Phaser gives it no ScrollFactor
   * component): its lines keep their scroll factor 0 while its filter draws them through the
   * camera, so the clip neither slides with the world nor lands half a view off. Probed at render
   * scale 1, 1.5 and 2 with the camera scrolled and moving (I-ADR0057-3), its lines came out
   * within 1/255 of Phaser 3.90's per-line masks at 1 and 2, where a Container's and per-line
   * filters' were resampled. It is given a scroll factor of 0 here all the same: `Maskable` asks a
   * masked object for one, and should Phaser ever fix the scroll-factor bug `maskInView`
   * describes by applying the scroll factor to a context-focused filter, a Layer without one would
   * be placed by `undefined`. That does not change `maskInView`'s branch today: a Layer has no
   * size, so it gets the origin correction either way.
   *
   * The area is drawn by `fillMaskArea` on the backing px grid of the render scale it is drawn at,
   * so the clip's edge rows and columns let the lines through as 3.90's did (I-ADR0057-3); a new
   * render scale alone redraws it.
   */
  private shapeMask(): void {
    const { messages } = this.frame;
    if (!this.maskShape || !this.lineLayer) {
      this.maskShape = this.scene.make.graphics({}, false).setScrollFactor(0);
      const layer = Object.assign(this.scene.add.layer(), {
        scrollFactorX: 0,
        scrollFactorY: 0,
      }).setDepth(HUD_DEPTH);
      maskInView(layer, this.maskShape, this.scene.cameras.main);
      this.lineLayer = layer;
    }
    this.maskScale = viewport.renderScale;
    this.maskShape.clear();
    // a mask's colour is never drawn, only its alpha; any token keeps the fence's literal ban
    fillMaskArea(this.maskShape, messages, palette.chatPanel, this.maskScale);
  }

  /** A tab label's width at the window's font, measured once per label. */
  private labelWidth(label: string): number {
    return this.wordsSize(label).width;
  }

  /**
   * Some words' drawn size on one line at the window's font, measured once per words: a tab label,
   * or a name and what stands before it in a chat line (the shadow does not widen a line).
   */
  private wordsSize(words: string): { width: number; height: number } {
    let size = this.measured.get(words);
    if (size === undefined) {
      const probe = this.scene.add.text(
        0,
        0,
        words,
        textStyle(palette.chatSystem),
      );
      size = { width: probe.width, height: probe.height };
      probe.destroy();
      this.measured.set(words, size);
    }
    return size;
  }
  private readonly measured = new Map<
    string,
    { width: number; height: number }
  >();

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
        .setInteractive()
        .on("pointerdown", () => {
          // each press toggles the channel's lines, so each plays (FS-WDM0X § Pass 2: the chat, C1)
          this.play("menu_tab");
          this.store.getState().toggleChannel(segment.channel);
        });
      // the padding widens the hit area to the whole segment; the label still sits where it did
      tab.setPosition(segment.x, y - 3);
      this.tabTexts.push(this.own(tab));
    }
  }

  /** The lines drawn again, and the hovered tag's tip with them: it stays, changes or goes as the lines moved under a still pointer (FS-KBA4Q R37). */
  private drawLines(): void {
    this.layLines();
    this.syncTagTip();
  }

  /** The lines in view, laid bottom-up from the message area's foot so a wrapped line pushes the older ones up. */
  private layLines(): void {
    this.clearLines();
    this.drawScrollbar();
    // above what the scene drew at HUD depth since, as when every redraw made its lines anew
    this.lineLayer?.setToTop();
    const m = this.frame.messages;
    if (m.height === 0) return;
    const entries = visibleEntries(
      visibleChatLines(this.store.getState()),
      this.offset,
    );
    const self = this.selfId();
    // the newest line stands a little above the input row's divider
    let y = m.y + m.height - CHAT_LINES_GAP;
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      const segments = chatEntrySegments(entry, self);
      y = segments
        ? this.drawLinkedLine(segments, chatEntryColour(entry), y)
        : this.drawPlainLine(formatChatEntry(entry, self), chatEntryColour(entry), y);
      const wordsTop = segments ? this.linkedWordsTop : y;
      // the name heads the line's first row, so its hit area is that row's, as wide as the name
      const span = chatNameSpan(
        entry,
        self,
        (words) => this.wordsSize(words).width,
      );
      if (span) {
        this.nameHits.push({
          name: span.name,
          rect: {
            x: m.x + CHAT_PAD + span.x,
            y: wordsTop,
            width: span.width,
            height: this.wordsSize(span.name).height,
          },
        });
      }
    }
  }

  /** How wide a line's words may run: the message area inside its padding, clear of the scrollbar at the right edge. */
  private lineRoom(): number {
    return this.frame.messages.width - CHAT_PAD * 2 - CHAT_SCROLL_W;
  }

  /** A line with no item link: one text, wrapped by its own callback, its foot at `foot`. Returns its top. */
  private drawPlainLine(words: string, colour: number, foot: number): number {
    const m = this.frame.messages;
    const room = this.lineRoom();
    const t = this.scene.add
      .text(m.x + CHAT_PAD, 0, words, {
        ...lineStyle(colour),
        // fill each line before breaking: Phaser's own wrap breaks only at spaces, so a Chinese
        // sentence after "Name: " would jump whole to the next line
        wordWrap: {
          width: room,
          callback: (text: string, self: Phaser.GameObjects.Text) =>
            wrapChatText(
              text,
              room,
              (part) => self.context.measureText(part).width,
            ),
        },
      })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
    const top = foot - t.height;
    t.setPosition(m.x + CHAT_PAD, top);
    this.lineLayer?.add(t);
    this.lineTexts.unshift(t);
    return top;
  }

  /**
   * A line with item links (FS-KBA4Q R32–R35), its foot at `foot`: its rows laid out by
   * `wrapChatSegments`, each stretch of words a text of its own in the line's colour, each link a
   * tag: the item's name in brackets, in its rarity colour, on a faint ground of that hue.
   * A row of words only is one plain row high; a row with a tag stands `CHAT_TAG_PAD_Y` taller
   * above and below its words. Returns its top; the first row's words top is left in
   * `linkedWordsTop` for the sender's name hit area.
   */
  private drawLinkedLine(
    segments: readonly ChatSegment[],
    colour: number,
    foot: number,
  ): number {
    const left = this.frame.messages.x + CHAT_PAD;
    const ruler = (this.ruler ??= this.scene.add
      .text(0, 0, "", textStyle(palette.chatSystem))
      .setVisible(false));
    // whole units, so a tag's ground and border land on whole px beside its words
    const rows = wrapChatSegments(segments, this.lineRoom(), (words) =>
      Math.ceil(ruler.context.measureText(words).width),
    );
    const wordsH = this.wordsSize(ROW_PROBE).height;
    const padY = (row: (typeof rows)[number]) =>
      row.some((piece) => piece.kind !== "text") ? CHAT_TAG_PAD_Y : 0;
    const top = rows.reduce((y, row) => y - wordsH - padY(row) * 2, foot);
    let y = top;
    this.linkedWordsTop = top + (rows.length > 0 ? padY(rows[0]) : 0);
    for (const row of rows) {
      const pad = padY(row);
      const rowH = wordsH + pad * 2;
      const wordsY = y + pad;
      for (const piece of row) {
        if (piece.kind === "text") {
          this.addLineWords(left + piece.x, wordsY, piece.text, colour);
          continue;
        }
        const hue = chatTagColour(piece.item);
        const rect = {
          x: left + piece.x,
          y: y + CHAT_TAG_INSET_Y,
          width: piece.width,
          height: rowH - CHAT_TAG_INSET_Y * 2,
        };
        this.drawTagGround(rect, hue);
        this.addLineWords(rect.x + CHAT_TAG_PAD, wordsY, piece.name, hue);
        this.tagHits.push({ item: piece.item, rect });
      }
      y += rowH;
    }
    return top;
  }

  /** One row's stretch of words in a linked line, in the masked line layer. */
  private addLineWords(x: number, y: number, words: string, colour: number): void {
    const t = this.scene.add
      .text(x, y, words, lineStyle(colour))
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
    this.lineLayer?.add(t);
    this.lineTexts.push(t);
  }

  /**
   * A link tag's ground, no border (FS-KBA4Q R33, R34; owner tune), in the one graphics every tag
   * shares. It sits in the line layer, so the message area clips it as it
   * clips the words, a step under them in the layer's own order.
   */
  private drawTagGround(rect: Rect, hue: number): void {
    if (!this.tagGrounds) {
      this.tagGrounds = this.scene.add
        .graphics()
        .setScrollFactor(0)
        .setDepth(HUD_DEPTH - 1);
      this.lineLayer?.add(this.tagGrounds);
    }
    const { x, y, width, height } = rect;
    this.tagGrounds.fillStyle(hue, CHAT_TAG_GROUND_ALPHA).fillRect(x, y, width, height);
  }

  /**
   * The canvas picker (FS-J267Q R2, R3): the current channel and a ▾ in its colour at
   * the input row's left, the same idle and typing; and, while open, the list above the row. Drawn
   * only while the row is shown, and redrawn only when what it shows changes, unless `force`d by a
   * move or a show. Its text is made at the render scale and crisped again with the game's
   * (FS-ZAJMH R5), as all the window's text is.
   */
  private drawPicker(force = false): void {
    const input = this.input;
    const field = this.field;
    const open = input?.pickerOpen() ?? false;
    const state = `${this.rowShown}|${field?.channel}|${open}|${input?.highlighted()}`;
    if (!force && state === this.pickerDrawn) return;
    this.pickerDrawn = state;
    this.clearPicker();
    this.listPanel?.clear();
    this.groundList(open && !!input && !!field && this.rowShown);
    // the list opened over a hovered tag, or shut off one, under a still pointer (FS-KBA4Q R37)
    this.syncTagTip();
    if (!input || !field || !this.rowShown) return;

    const picker = chatPickerRect(this.frame);
    const colour = CHAT_CHANNEL_COLOUR[field.channel];
    const y = rowTextY(picker);
    const label = this.scene.add
      .text(
        picker.x + PICKER_LABEL_INSET,
        y,
        CHAT_FILTER_LABEL[field.channel],
        {
          ...textStyle(colour),
          padding: { x: 0, y: CHAT_ROW_TEXT_PAD },
        },
      )
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH)
      // the whole picker is the hit area; the window hit-tests it itself. It once showed the hand
      // here; it stays interactive as it was, under the bone hand (FS-KYPQ9 § Change: Every hover keeps the bone hand)
      .setInteractive();
    const arrowWidth = this.wordsSize(CHAT_PICKER_ARROW).width;
    const arrow = this.scene.add
      .text(
        picker.x + picker.width - PICKER_ARROW_INSET - arrowWidth,
        y,
        CHAT_PICKER_ARROW,
        { ...textStyle(colour), padding: { x: 0, y: CHAT_ROW_TEXT_PAD } },
      )
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH)
      .setInteractive();
    this.pickerTexts.push(this.own(label), this.own(arrow));
    if (open) this.drawList(input);
  }

  /** The open list's ground over its box, wherever it reaches; none while it is shut (R129). */
  private groundList(open: boolean): void {
    if (!open) {
      this.listGround?.destroy();
      this.listGround = undefined;
      return;
    }
    const { box } = chatPickerList(this.frame);
    if (this.listGround) this.listGround.setPosition(box.x, box.y).setSize(box.width, box.height);
    else this.listGround = this.makeGround(box, LIST_DEPTH);
  }

  /** The open list: near-black ground, a fine brass frame, a row per shown channel in its colour. */
  private drawList(input: ChatInput): void {
    const { box, rows } = chatPickerList(this.frame);
    const g = (this.listPanel ??= this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(LIST_DEPTH));
    g.clear();
    g.fillStyle(palette.chatInputGround, 0.97);
    g.fillRoundedRect(box.x, box.y, box.width, box.height, 3);
    g.lineStyle(1, palette.chatRule, 0.5);
    g.strokeRoundedRect(
      box.x + 0.5,
      box.y + 0.5,
      box.width - 1,
      box.height - 1,
      3,
    );
    const highlighted = input.highlighted();
    for (const row of rows) {
      const pickable = input.canPick(row.channel);
      if (row.channel === highlighted) {
        // the tabs' shown ground, and a bar in the channel's colour where a tab has its underline
        g.fillStyle(palette.chatTabOn, 0.9);
        g.fillRect(row.x, row.y, row.width, row.height);
        g.fillStyle(CHAT_CHANNEL_COLOUR[row.channel], 0.9);
        g.fillRect(row.x, row.y + 4, TAB_UNDERLINE_H, row.height - 8);
      }
      const t = this.scene.add
        .text(
          row.x + CHAT_TAB_PAD,
          rowTextY(row),
          CHAT_FILTER_LABEL[row.channel],
          {
            ...textStyle(CHAT_CHANNEL_COLOUR[row.channel]),
            padding: { x: 0, y: CHAT_ROW_TEXT_PAD },
          },
        )
        .setScrollFactor(0)
        .setDepth(LIST_DEPTH + 1)
        .setAlpha(pickable ? 1 : ROW_CLOSED_ALPHA);
      if (pickable) t.setInteractive();
      this.pickerTexts.push(this.own(t));
    }
  }

  private clearPicker(): void {
    this.pickerTexts.forEach((t) => t.destroy());
    this.pickerTexts = [];
  }

  /** The fold button in the window's top-right corner. The hint is the DOM field's placeholder. */
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
      .setInteractive()
      // on the release, not the press (asked 2026-11-02): folding on the press shrank the window
      // before the scene's attack handler asked whether that press was the window's (R31)
      .on("pointerup", () => this.store.getState().toggleFolded());
    this.own(this.foldText);
  }

  private clearTabs(): void {
    this.tabTexts.forEach((t) => t.destroy());
    this.tabTexts = [];
  }

  private clearLines(): void {
    this.lineTexts.forEach((t) => t.destroy());
    this.lineTexts = [];
    this.nameHits = [];
    this.tagHits = [];
    this.tagGrounds?.clear();
  }
}
