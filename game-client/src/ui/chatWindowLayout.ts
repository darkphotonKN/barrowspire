/**
 * The chat window's geometry and the stream's presentation (FS-WJGFJ §C), as pure functions
 * the Phaser `ChatWindow` draws from. Nothing here touches a scene, so every rule the window
 * follows is testable without one. Vocabulary: game-client/CONTEXT.md § Chat terms.
 */

import type { ChatChannel, ChatEntry, ChatLine } from "@/stores/chatStore";
import { rarityOf } from "@/marketplace/rarity";
import { palette } from "@/utils/canvasPalette";
import { pairLinks, type ItemSnapshot } from "@/chat/itemLinks";
import { CHAT_SHOWN_CHANNELS } from "./chatInput";
import { CORNER_ICON_GAP, CORNER_ICON_W, CORNER_ICONS, CORNER_MARGIN } from "./hudCornerLayout";

/** The window's left edge and its gap from the canvas bottom, in every world (R18). */
export const CHAT_WINDOW_X = 10;
export const CHAT_WINDOW_MARGIN = 16;
/** How far the corner icon row reaches in from the view's right edge, margin included. */
const CORNER_ROW_REACH =
  CORNER_MARGIN + CORNER_ICONS.length * CORNER_ICON_W + (CORNER_ICONS.length - 1) * CORNER_ICON_GAP;
/**
 * The window's width (R19): its right edge mirrors the corner row's left end (the class book's
 * plate), the same distance in from the left as the row reaches in from the right, so the bottom
 * corners balance (asked 2026-11-24). Derived from the row, so it follows a seventh icon.
 */
export const CHAT_WINDOW_W = CORNER_ROW_REACH - CHAT_WINDOW_X;
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
/** The picker's arrow, after the channel's name (FS-J267Q R2). */
export const CHAT_PICKER_ARROW = "▾";
/** The picker and the text field sit this far in from the input row's ends. */
export const CHAT_ROW_INSET = 4;
/** Room between the picker's divider and the text field. */
export const CHAT_FIELD_GAP = 6;
/** The picker's list (FS-J267Q R3): its width, one row's height, its inner padding. */
export const CHAT_PICKER_LIST_W = 112;
export const CHAT_PICKER_ROW_H = 24;
export const CHAT_PICKER_LIST_PAD = 4;
/** Room between the list's foot and the input row's divider. */
export const CHAT_PICKER_LIST_GAP = 6;
/**
 * A picker or list row's words at the 14 px body serif: their box is this tall, drawn with this
 * much padding above and below so no descender is cut, and lifted by the same so they sit on the
 * row's optical centre (FS-J267Q R2, R3).
 */
export const CHAT_ROW_TEXT_H = 16;
export const CHAT_ROW_TEXT_PAD = 2;
/** The picker's divider stops this far short of the input row's top and of its foot (FS-J267Q R1). */
export const CHAT_DIVIDER_INSET_TOP = 6;
export const CHAT_DIVIDER_INSET_FOOT = 5;

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
 * Where everything sits for a window whose left edge is `x` and whose bottom edge is `bottom`,
 * the canvas bottom margin in every world (R18). The filter row, the message area and the input
 * stack top to bottom inside the panel's carved frame (R19). Folded, the window is its input row
 * alone in the frame, on the same bottom edge.
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

/**
 * `Name: text` (R22 as amended 2026-10-31: no time); a system line is `— text` (R29). A whisper
 * reads `From Name: text`, or `To Name: text` when `selfId`, this player, sent it: the echo
 * (FS-KCQ06 R14).
 */
export function formatChatEntry(entry: ChatEntry, selfId?: string): string {
  if (entry.kind === "system") return `— ${entry.text}`;
  return `${lineHead(entry, selfId)}${entry.text}`;
}

/** What a player's line reads before its text: `Name: `, `From Name: ` or `To Name: `. */
function lineHead(entry: ChatLine, selfId?: string): string {
  const { before, name } = namedIn(entry, selfId);
  return `${before}${name}: `;
}

/** The name a player line shows, whose it is, and the words drawn before it. */
function namedIn(
  entry: ChatLine,
  selfId?: string,
): { before: string; name: string; id: string } {
  if (entry.channel !== "whisper") {
    return { before: "", name: entry.sender_name, id: entry.sender_id };
  }
  return selfId !== undefined && entry.sender_id === selfId
    ? {
        before: "To ",
        name: entry.target_name ?? "",
        id: entry.target_id ?? "",
      }
    : { before: "From ", name: entry.sender_name, id: entry.sender_id };
}

/** A line's clickable name: who it is, and where it sits from the line's left edge. */
export interface ChatNameSpan {
  name: string;
  x: number;
  width: number;
}

/**
 * The name in a drawn line a click whispers to (FS-KCQ06 C15): the sender's, or the target's in a
 * `To Name` echo, placed by `measure` on the very words `formatChatEntry` draws. A system line has
 * none, and neither does this player's own name: a whisper to it would only be refused.
 */
export function chatNameSpan(
  entry: ChatEntry,
  selfId: string | undefined,
  measure: (s: string) => number,
): ChatNameSpan | null {
  if (entry.kind === "system") return null;
  const { before, name, id } = namedIn(entry, selfId);
  if (!name || (selfId !== undefined && id === selfId)) return null;
  return { name, x: before ? measure(before) : 0, width: measure(name) };
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
  return wrapChatSegments([{ kind: "text", text }], maxWidth, measure).map(
    (row) => row.map((piece) => (piece.kind === "text" ? piece.text : "")).join(""),
  );
}

/**
 * The link tag's look (FS-KBA4Q R33, R34): a first pass the owner tunes in game, and retuning any
 * of them is `Tunes FS-KBA4Q`. The ground behind the bracketed name is the name's own colour at
 * this alpha, with no border (owner tune); the name stands this far inside the ground's left and
 * right edges, and the ground this far from the words either side of it.
 */
export const CHAT_TAG_GROUND_ALPHA = 0.16;
export const CHAT_TAG_PAD = 3;
export const CHAT_TAG_SPACE = 3;
/** The ground stops this far short of its row's top and foot, so tags on two rows never touch. */
export const CHAT_TAG_INSET_Y = 1;
/**
 * A row that holds a tag stands this much taller above and below its words than a plain row,
 * so the name has room inside the ground's top and foot. Rows of words only keep a plain row.
 */
export const CHAT_TAG_PAD_Y = 3;
/** What ends a name cut to fit a row (R35). */
export const CHAT_TAG_CUT = "…";

/**
 * The colour a link tag is drawn in (R33): the item's rarity, by the palette tokens and the rule
 * the item tip uses (`itemView`), or the ordinary text colour for an item that names no rarity.
 */
export function chatTagColour(item: ItemSnapshot): number {
  return item.rarity?.trim()
    ? palette.rarity[rarityOf(item.rarity).token]
    : palette.hudText;
}

/** A stretch of a line as it is drawn: words, or an item link's tag. */
export type ChatSegment =
  | { kind: "text"; text: string }
  | { kind: "tag"; item: ItemSnapshot };

/**
 * A player's line with item links, cut into its words and its link tags (R32): the head and the
 * text as `formatChatEntry` gives them, each paired `[Name]` token (R10) replaced by a tag. Null
 * for an entry that links nothing (a system line, a line with no snapshot, or none that pairs): it
 * is drawn as the one text it always was. A token is only ever read out of the line's text, never
 * out of a name.
 */
export function chatEntrySegments(
  entry: ChatEntry,
  selfId?: string,
): ChatSegment[] | null {
  if (entry.kind === "system" || !entry.items) return null;
  const links = pairLinks(entry.text, entry.items);
  if (links.length === 0) return null;
  const segments: ChatSegment[] = [];
  let words = lineHead(entry, selfId);
  let from = 0;
  for (const link of links) {
    words += entry.text.slice(from, link.start);
    if (words !== "") segments.push({ kind: "text", text: words });
    segments.push({ kind: "tag", item: link.item });
    words = "";
    from = link.end;
  }
  words += entry.text.slice(from);
  if (words !== "") segments.push({ kind: "text", text: words });
  return segments;
}

/** A piece of one drawn row, `x` from the row's left edge. */
export type ChatRowPiece =
  | { kind: "text"; x: number; text: string }
  | {
      kind: "tag";
      /** The ground's left edge and its width: the name stands `CHAT_TAG_PAD` inside it. */
      x: number;
      width: number;
      /** The name as drawn, in brackets: the item's, or cut with `CHAT_TAG_CUT` when wider than a row. */
      name: string;
      item: ItemSnapshot;
    };

/** A tag's words: the item's name in brackets, so a tag reads as a link even on a common item's plain colour. */
export const chatTagLabel = (name: string): string => `[${name}]`;

/** As much of `name` as `room` holds with the cut mark after it. */
function cutToFit(
  name: string,
  room: number,
  measure: (s: string) => number,
): string {
  const chars = Array.from(name);
  for (let kept = chars.length - 1; kept > 0; kept--) {
    const cut = chars.slice(0, kept).join("").trimEnd() + CHAT_TAG_CUT;
    if (measure(cut) <= room) return cut;
  }
  return CHAT_TAG_CUT;
}

/**
 * A line's segments laid out in rows no wider than `maxWidth`. Words wrap as `wrapChatText` says,
 * each row filled before the next begins, around the tags. A tag is never split (R35): one that
 * does not fit what is left of a row moves whole to the next; one wider than a whole row stands on
 * a row of its own, its name cut to the row's width. A tag's edge is a place a row may break, so a
 * word touching a tag is not broken inside for want of a space.
 */
export function wrapChatSegments(
  segments: readonly ChatSegment[],
  maxWidth: number,
  measure: (s: string) => number,
): ChatRowPiece[][] {
  const rows: ChatRowPiece[][] = [];
  let row: ChatRowPiece[] = [];
  /** The words being filled, not yet a piece, and where they start in the row. */
  let line = "";
  let x = 0;
  /** An over-wide tag has its row to itself: whatever comes next starts a new one. */
  let rowFull = false;
  const closeWords = () => {
    if (line === "") return;
    row.push({ kind: "text", x, text: line });
    x += measure(line);
    line = "";
  };
  const nextRow = () => {
    closeWords();
    rows.push(row);
    row = [];
    x = 0;
    rowFull = false;
  };
  const tagSpace = (CHAT_TAG_SPACE + CHAT_TAG_PAD) * 2;

  for (const segment of segments) {
    if (segment.kind === "tag") {
      closeWords();
      let name = chatTagLabel(segment.item.name);
      if (row.length > 0 && (rowFull || x + measure(name) + tagSpace > maxWidth))
        nextRow();
      if (measure(name) + tagSpace > maxWidth) {
        const room = maxWidth - tagSpace - measure(chatTagLabel(""));
        name = chatTagLabel(cutToFit(segment.item.name, room, measure));
        rowFull = true;
      }
      const width = measure(name) + CHAT_TAG_PAD * 2;
      row.push({
        kind: "tag",
        x: x + CHAT_TAG_SPACE,
        width,
        name,
        item: segment.item,
      });
      x += width + CHAT_TAG_SPACE * 2;
      continue;
    }
    for (const ch of Array.from(segment.text)) {
      if (rowFull) {
        nextRow();
        if (ch === " ") continue;
      }
      const next = line + ch;
      if ((row.length === 0 && line === "") || x + measure(next) <= maxWidth) {
        line = next;
        continue;
      }
      if (ch === " ") {
        nextRow();
        continue;
      }
      // words that follow a tag on this row may break at their first character too
      const afterTag = row.length > 0;
      const space = line.lastIndexOf(" ");
      if (BREAKS_ANYWHERE.test(ch) || (space <= 0 && !afterTag)) {
        nextRow();
        line = ch;
      } else {
        const rest = line.slice(space + 1);
        line = line.slice(0, Math.max(0, space));
        nextRow();
        line = rest + ch;
      }
    }
  }
  closeWords();
  rows.push(row);
  return rows;
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
 * The filter row's tab segments, one per shown channel, joined edge to edge from the row's left,
 * each as wide as its label (`measure`) plus padding (R24 as amended 2026-10-31).
 */
export function chatTabSegments(
  row: Rect,
  measure: (label: string) => number,
): ChatTabSegment[] {
  let x = row.x;
  return CHAT_SHOWN_CHANNELS.map((channel) => {
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

/** The canvas channel picker at the input row's left (FS-J267Q R1). */
export function chatPickerRect(frame: ChatWindowFrame): Rect {
  const input = frame.input;
  return {
    x: input.x + CHAT_ROW_INSET,
    y: input.y,
    width: CHAT_PICKER_W,
    height: input.height,
  };
}

/** Where a picker or list row's words are drawn from: their padded box centred on `rect`, lifted by the padding. */
export function rowTextY(rect: Rect): number {
  return rect.y + (rect.height - CHAT_ROW_TEXT_H) / 2 - CHAT_ROW_TEXT_PAD;
}

/**
 * The text field's place (FS-J267Q R1): the input row right of the picker and its
 * divider, short of the fold button while folded.
 */
export function chatFieldRect(frame: ChatWindowFrame, folded: boolean): Rect {
  const input = frame.input;
  const picker = chatPickerRect(frame);
  const x = picker.x + picker.width + CHAT_FIELD_GAP;
  const right =
    input.x + input.width - CHAT_ROW_INSET - (folded ? CHAT_FOLD_W : 0);
  return { x, y: input.y, width: right - x, height: input.height };
}

export interface ChatPickerRow extends Rect {
  channel: ChatChannel;
}

export interface ChatPickerList {
  box: Rect;
  rows: ChatPickerRow[];
}

/**
 * The picker's open list (FS-J267Q R3): the shown channels in order, top to bottom,
 * in a box that opens upward from just above the input row, left-aligned with the picker, so it
 * lies over the chat lines and never over the text field.
 */
export function chatPickerList(frame: ChatWindowFrame): ChatPickerList {
  const picker = chatPickerRect(frame);
  const height =
    CHAT_SHOWN_CHANNELS.length * CHAT_PICKER_ROW_H + CHAT_PICKER_LIST_PAD * 2;
  const box = {
    x: picker.x,
    y: frame.input.y - CHAT_PICKER_LIST_GAP - height,
    width: CHAT_PICKER_LIST_W,
    height,
  };
  const rows = CHAT_SHOWN_CHANNELS.map((channel, i) => ({
    channel,
    x: box.x + CHAT_PICKER_LIST_PAD,
    y: box.y + CHAT_PICKER_LIST_PAD + i * CHAT_PICKER_ROW_H,
    width: box.width - CHAT_PICKER_LIST_PAD * 2,
    height: CHAT_PICKER_ROW_H,
  }));
  return { box, rows };
}

/**
 * The text field's accessible name (FS-J267Q R7): a screen reader cannot read the
 * canvas picker, so the field says which channel it sends to.
 */
export function chatFieldLabel(channel: ChatChannel): string {
  return `Chat — ${CHAT_FILTER_LABEL[channel]}`;
}
