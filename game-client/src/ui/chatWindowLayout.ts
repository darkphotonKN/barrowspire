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
export const CHAT_WINDOW_W = 420;
/** How many lines the message area shows at once (R19). */
export const CHAT_VISIBLE_LINES = 8;
/** One line's height at the window's 13px body serif. */
export const CHAT_LINE_H = 20;
/**
 * The carved frame's margin: the rows sit this far inside the panel's edge, so the double brass
 * rule and the corner studs have room and no tab or input lies across them (asked 2026-10-31).
 */
export const CHAT_FRAME_PAD = 5;
/** Room between the newest line and the input row's divider (asked 2026-10-31). */
export const CHAT_LINES_GAP = 12;
/** Room kept above the lines for the channel filter row (I-WJGFJ-5) and below for the input (I-WJGFJ-4). */
export const CHAT_FILTER_ROW_H = 24;
export const CHAT_INPUT_ROW_H = 30;
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
export const CHAT_PICKER_W = 84;
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
 * filter row, the message area and the input stack top to bottom inside the panel's carved frame
 * (R19). Folded, the window is its input row alone in the frame, on the same bottom edge.
 */
export function chatWindowFrame(
  x: number,
  bottom: number,
  folded = false,
): ChatWindowFrame {
  const pad = CHAT_FRAME_PAD;
  const inner = { x: x + pad, width: CHAT_WINDOW_W - pad * 2 };
  if (folded) {
    const top = bottom - pad - CHAT_INPUT_ROW_H;
    const input = { ...inner, y: top, height: CHAT_INPUT_ROW_H };
    return {
      panel: {
        x,
        y: top - pad,
        width: CHAT_WINDOW_W,
        height: CHAT_INPUT_ROW_H + pad * 2,
      },
      filterRow: { ...inner, y: top, height: 0 },
      messages: { ...inner, y: top, height: 0 },
      input,
      lineHeight: CHAT_LINE_H,
    };
  }
  const messagesH = CHAT_VISIBLE_LINES * CHAT_LINE_H + CHAT_LINES_GAP;
  const rowsH = CHAT_FILTER_ROW_H + messagesH + CHAT_INPUT_ROW_H;
  const top = bottom - pad - rowsH;
  return {
    panel: { x, y: top - pad, width: CHAT_WINDOW_W, height: rowsH + pad * 2 },
    filterRow: { ...inner, y: top, height: CHAT_FILTER_ROW_H },
    messages: { ...inner, y: top + CHAT_FILTER_ROW_H, height: messagesH },
    input: {
      ...inner,
      y: top + CHAT_FILTER_ROW_H + messagesH,
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

/**
 * The fold button: the window's top-right corner, so the tab row's right end while unfolded and
 * the input row's right end while folded (asked 2026-10-31).
 */
export function chatFoldButton(frame: ChatWindowFrame): Rect {
  const row = frame.filterRow.height > 0 ? frame.filterRow : frame.input;
  return {
    x: row.x + row.width - CHAT_FOLD_W,
    y: row.y,
    width: CHAT_FOLD_W,
    height: row.height,
  };
}

/** Characters a line may break after anywhere: Chinese and Japanese, which do not space words. */
const BREAKS_ANYWHERE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\uff00-\uffef]/u;

/**
 * A chat line cut into lines no wider than `maxWidth`, each filled before the next begins (asked
 * 2026-10-31: Phaser's own wrap breaks only at spaces, so `Name: ` followed by a Chinese sentence
 * threw the whole sentence to the second line). Latin words break at the last space that fits; a
 * Chinese or Japanese character, or a word too long for a line, breaks where the line is full.
 */
export function wrapChatText(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of Array.from(text)) {
    const next = line + ch;
    if (line === "" || measure(next) <= maxWidth) {
      line = next;
      continue;
    }
    if (ch === " ") {
      lines.push(line);
      line = "";
      continue;
    }
    const space = line.lastIndexOf(" ");
    if (!BREAKS_ANYWHERE.test(ch) && space > 0) {
      lines.push(line.slice(0, space));
      line = line.slice(space + 1) + ch;
    } else {
      lines.push(line);
      line = ch;
    }
  }
  lines.push(line);
  return lines;
}

/** The scrollbar's drawn width, its grab margin either side, and its shortest thumb (asked 2026-10-31). */
export const CHAT_SCROLL_W = 4;
export const CHAT_SCROLL_GRAB = 5;
export const CHAT_SCROLL_THUMB_MIN = 16;

/** The scrollbar's track, down the message area's right edge, clear of its top and of the gap. */
export function chatScrollTrack(frame: ChatWindowFrame): Rect {
  const m = frame.messages;
  return {
    x: m.x + m.width - CHAT_SCROLL_W - 3,
    y: m.y + 3,
    width: CHAT_SCROLL_W,
    height: m.height - CHAT_LINES_GAP - 3,
  };
}

/**
 * The thumb for `total` lines with the view `offset` lines back from the newest, or null while
 * every line fits. Its length is the share in view; following, it sits at the track's foot.
 */
export function chatScrollThumb(
  track: Rect,
  total: number,
  offset: number,
  visible = CHAT_VISIBLE_LINES,
): Rect | null {
  if (total <= visible) return null;
  const height = Math.max(
    CHAT_SCROLL_THUMB_MIN,
    (track.height * visible) / total,
  );
  const furthest = total - visible;
  const back = Math.min(furthest, Math.max(0, offset)) / furthest;
  return {
    x: track.x,
    y: track.y + (track.height - height) * (1 - back),
    width: track.width,
    height,
  };
}

/** The offset that puts the thumb's top at `thumbTop`: the oldest lines at the track's head. */
export function chatScrollOffsetAt(
  track: Rect,
  total: number,
  thumbTop: number,
  visible = CHAT_VISIBLE_LINES,
): number {
  const thumb = chatScrollThumb(track, total, 0, visible);
  if (!thumb) return 0;
  const travel = track.height - thumb.height;
  const down = Math.min(1, Math.max(0, (thumbTop - track.y) / travel));
  return Math.round((1 - down) * (total - visible));
}

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
