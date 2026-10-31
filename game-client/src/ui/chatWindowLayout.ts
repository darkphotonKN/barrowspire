/**
 * The chat window's geometry and the stream's presentation (FS-WJGFJ §C), as pure functions
 * the Phaser `ChatWindow` draws from. Nothing here touches a scene, so every rule the window
 * follows is testable without one. Vocabulary: game-client/CONTEXT.md § Chat terms.
 */

import {
  CHAT_CHANNELS,
  type ChatChannel,
  type ChatEntry,
} from "@/stores/chatStore";
import { palette } from "@/utils/canvasPalette";

/** The window's left edge and its gap from the canvas bottom, as the ResourceHud's (R18). */
export const CHAT_WINDOW_X = 10;
export const CHAT_WINDOW_MARGIN = 16;
/** The window's width (R19). */
export const CHAT_WINDOW_W = 360;
/** How many lines the message area shows at once (R19). */
export const CHAT_VISIBLE_LINES = 8;
/** One line's height at the window's 13px body serif. */
export const CHAT_LINE_H = 18;
/** Room kept above the lines for the channel filter row (I-WJGFJ-5) and below for the input (I-WJGFJ-4). */
export const CHAT_FILTER_ROW_H = 22;
export const CHAT_INPUT_ROW_H = 24;
/** What the input row says while it is closed and empty (R26). */
export const CHAT_INPUT_HINT = "Press Enter to speak";
/** The fold button's face: unfolded it offers to fold, folded to unfold (Amendment 2026-10-31). */
export const CHAT_FOLD_OPEN = "▾";
export const CHAT_FOLD_SHUT = "▴";
/** Inset from the panel edge to the text. */
export const CHAT_PAD = 8;
/** The fold button's square at the right end of the input row (Amendment 2026-10-31). */
export const CHAT_FOLD_W = 24;
/** A tab segment's padding either side of its label. */
export const CHAT_TAB_PAD = 9;
/** The channel picker's width at the input row's left (Amendment 2026-10-31). */
export const CHAT_PICKER_W = 74;
/** Where the typed text (and the hint) starts in the input row, clear of the picker. */
export const CHAT_INPUT_TEXT_X = CHAT_PICKER_W + 6;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChatWindowFrame {
  panel: Rect;
  filterRow: Rect;
  messages: Rect;
  input: Rect;
  lineHeight: number;
}

/**
 * Where everything sits for a window whose left edge is `x` and whose bottom edge is `bottom`:
 * directly above the ResourceHud when there is one, on the canvas bottom otherwise (R18). The
 * filter row, the message area and the input stack top to bottom inside the panel (R19). Folded,
 * the window is its input row alone, still standing on the same bottom edge.
 */
export function chatWindowFrame(
  x: number,
  bottom: number,
  folded = false,
): ChatWindowFrame {
  if (folded) {
    const top = bottom - CHAT_INPUT_ROW_H;
    const input = { x, y: top, width: CHAT_WINDOW_W, height: CHAT_INPUT_ROW_H };
    return {
      panel: { ...input },
      filterRow: { x, y: top, width: CHAT_WINDOW_W, height: 0 },
      messages: { x, y: top, width: CHAT_WINDOW_W, height: 0 },
      input,
      lineHeight: CHAT_LINE_H,
    };
  }
  const messagesH = CHAT_VISIBLE_LINES * CHAT_LINE_H;
  const height = CHAT_FILTER_ROW_H + messagesH + CHAT_INPUT_ROW_H;
  const top = bottom - height;
  return {
    panel: { x, y: top, width: CHAT_WINDOW_W, height },
    filterRow: { x, y: top, width: CHAT_WINDOW_W, height: CHAT_FILTER_ROW_H },
    messages: {
      x,
      y: top + CHAT_FILTER_ROW_H,
      width: CHAT_WINDOW_W,
      height: messagesH,
    },
    input: {
      x,
      y: top + CHAT_FILTER_ROW_H + messagesH,
      width: CHAT_WINDOW_W,
      height: CHAT_INPUT_ROW_H,
    },
    lineHeight: CHAT_LINE_H,
  };
}

/** `Name: text` (R22 as amended 2026-10-31: no time); a system line is `— text` (R29). */
export function formatChatEntry(entry: ChatEntry): string {
  if (entry.kind === "system") return `— ${entry.text}`;
  return `${entry.sender_name}: ${entry.text}`;
}

/**
 * The lines in view: the newest `count` while following (offset 0), or the window `offset`
 * lines further back (R21). An offset past the start shows the start.
 */
export function visibleEntries(
  lines: readonly ChatEntry[],
  offset: number,
  count = CHAT_VISIBLE_LINES,
): ChatEntry[] {
  const end = Math.max(0, lines.length - offset);
  return lines.slice(Math.max(0, end - count), end);
}

/**
 * The offset after one wheel notch: up (negative deltaY) scrolls one line back, down one
 * forward, never past the oldest line in view nor past the newest (R21).
 */
export function scrolledOffset(
  offset: number,
  deltaY: number,
  total: number,
  count = CHAT_VISIBLE_LINES,
): number {
  const furthest = Math.max(0, total - count);
  const next = deltaY < 0 ? offset + 1 : offset - 1;
  return Math.min(furthest, Math.max(0, next));
}

/** Each channel's text colour, and the system line's, from the canvas palette (R30). */
export const CHAT_CHANNEL_COLOUR: Readonly<Record<ChatChannel, number>> = {
  area: palette.chatArea,
  world: palette.chatWorld,
  party: palette.chatParty,
  whisper: palette.chatWhisper,
  trade: palette.chatTrade,
};

export interface ChatTabSegment extends Rect {
  channel: ChatChannel;
}

/**
 * The filter row's five tab segments, joined edge to edge from the row's left, each as wide as its
 * label (`measure`) plus padding (R24 as amended 2026-10-31).
 */
export function chatTabSegments(
  row: Rect,
  measure: (label: string) => number,
): ChatTabSegment[] {
  let x = row.x;
  return CHAT_CHANNELS.map((channel) => {
    const width = Math.round(
      measure(CHAT_FILTER_LABEL[channel]) + CHAT_TAB_PAD * 2,
    );
    const segment = { channel, x, y: row.y, width, height: row.height };
    x += width;
    return segment;
  });
}

/** What each channel's toggle reads in the filter row (R24). */
export const CHAT_FILTER_LABEL: Readonly<Record<ChatChannel, string>> = {
  area: "Area",
  world: "World",
  party: "Party",
  whisper: "Whisper",
  trade: "Trade",
};

/** The colour an entry is drawn in. */
export function chatEntryColour(entry: ChatEntry): number {
  return entry.kind === "system"
    ? palette.chatSystem
    : CHAT_CHANNEL_COLOUR[entry.channel];
}
