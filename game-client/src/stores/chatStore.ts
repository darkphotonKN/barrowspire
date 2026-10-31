import { createStore, type StoreApi } from "zustand";
import type { KeyValueStore } from "@/characters/roster";

/**
 * The chat stream the window draws from (FS-WJGFJ §C). It lives outside any scene, so walking
 * from town into the Spire and back never clears it; only a page reload does (R20). The server
 * is the only writer of lines: the client renders what the pod stamped and nothing else (R4).
 * Vocabulary: game-client/CONTEXT.md § Chat terms.
 */

/** The kinds of talk a line can belong to: the closed set, mirrored on the server (R32). */
export const CHAT_CHANNELS = [
  "area",
  "world",
  "party",
  "whisper",
  "trade",
] as const;
export type ChatChannel = (typeof CHAT_CHANNELS)[number];

/** A line as the pod stamps and sends it on the `chat` action (R3). */
export interface ChatLinePayload {
  message_id: string;
  sender_id: string;
  sender_name: string;
  channel: ChatChannel;
  scope: string;
  /** UTC, RFC 3339 with milliseconds. */
  sent_at: string;
  text: string;
}

/** A system line about chat, on the `chat_notice` action (R7): a code to switch on, words to show. */
export interface ChatNoticePayload {
  code: string;
  text: string;
}

/** A player's line as the window holds it. */
export interface ChatLine extends ChatLinePayload {
  kind: "line";
}

/** A system line as the window holds it: no sender, no time, never filtered (R29). */
export interface ChatSystemLine extends ChatNoticePayload {
  kind: "system";
}

export type ChatEntry = ChatLine | ChatSystemLine;

/** Whether a frame off the wire is a stamped line: the pod is trusted, a bad frame is not rendered. */
export function isChatLine(payload: unknown): payload is ChatLinePayload {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.message_id === "string" &&
    typeof p.sender_id === "string" &&
    typeof p.sender_name === "string" &&
    typeof p.text === "string" &&
    typeof p.sent_at === "string" &&
    (CHAT_CHANNELS as readonly string[]).includes(p.channel as string)
  );
}

export function isChatNotice(payload: unknown): payload is ChatNoticePayload {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return typeof p.code === "string" && typeof p.text === "string";
}

/**
 * The newest lines kept per channel, and for system lines on their own (R20, amended with the
 * user 2026-10-31): a loud channel only ever pushes out its own old lines, never a quiet one's.
 */
export const CHAT_BUFFER = 100;

/** Which buffer an entry counts against: its channel, or the system lines' own. */
const bufferOf = (entry: ChatEntry): ChatChannel | "system" =>
  entry.kind === "system" ? "system" : entry.channel;

/** Which channels the window shows; a hidden channel's lines are still held (R24). */
export type ChatChannelsShown = Readonly<Record<ChatChannel, boolean>>;

/** Where the channel filter is kept in this browser (R24). */
export const CHAT_FILTER_KEY = "barrowspire.chat.shown";
/** Where the window's folded state is kept in this browser (FS-WJGFJ Amendment 2026-10-31). */
export const CHAT_FOLDED_KEY = "barrowspire.chat.folded";

const ALL_SHOWN: ChatChannelsShown = {
  area: true,
  world: true,
  party: true,
  whisper: true,
  trade: true,
};

/**
 * The most sent lines kept for recall with the arrow keys (asked 2026-10-31). Chat recall is
 * reached for a few lines back, rarely dozens; a terminal keeps more because commands repeat.
 */
export const CHAT_RECALL_DEPTH = 50;

export interface ChatState {
  lines: ChatEntry[];
  shown: ChatChannelsShown;
  /** Shows a hidden channel or hides a shown one, and keeps the choice in this browser (R24). */
  toggleChannel: (channel: ChatChannel) => void;
  /** Whether the window is folded down to its input row. */
  folded: boolean;
  /** Folds or unfolds the window, and keeps the choice in this browser. */
  toggleFolded: () => void;
  /**
   * The lines this player sent, oldest first, for recall in the input. Held for the page's life
   * only, like the stream: never written to this browser's storage.
   */
  sent: string[];
  /** Keeps a sent line for recall; the same line twice in a row is kept once. */
  rememberSent: (line: string) => void;
  /** A line from the server, kept in arrival order; a repeat of a held message_id is ignored (R23). */
  receive: (line: ChatLinePayload) => void;
  /** A notice from the server, kept as a system line in the stream (R29). */
  notice: (notice: ChatNoticePayload) => void;
}

export interface ChatStoreDeps {
  /** Read lazily: there is no localStorage while Next renders on the server. */
  storage: () => KeyValueStore;
}

const noStorage: KeyValueStore = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

/** The filter as this browser kept it, or every channel shown when there is none or it cannot be read. */
function readShown(storage: () => KeyValueStore): ChatChannelsShown {
  try {
    const raw = storage().getItem(CHAT_FILTER_KEY);
    if (!raw) return ALL_SHOWN;
    const hidden: unknown = JSON.parse(raw);
    if (!Array.isArray(hidden)) return ALL_SHOWN;
    const shown = { ...ALL_SHOWN };
    for (const channel of CHAT_CHANNELS)
      if (hidden.includes(channel)) shown[channel] = false;
    return shown;
  } catch {
    return ALL_SHOWN;
  }
}

/** Whether this browser kept the window folded; unfolded when it kept nothing or cannot say. */
function readFolded(storage: () => KeyValueStore): boolean {
  try {
    return storage().getItem(CHAT_FOLDED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeFolded(storage: () => KeyValueStore, folded: boolean): void {
  try {
    storage().setItem(CHAT_FOLDED_KEY, folded ? "1" : "0");
  } catch {
    // as the filter: the fold holds for the session
  }
}

/** Keeps the hidden channels; a storage that refuses is ignored, and the choice lasts the session. */
function writeShown(
  storage: () => KeyValueStore,
  shown: ChatChannelsShown,
): void {
  try {
    storage().setItem(
      CHAT_FILTER_KEY,
      JSON.stringify(CHAT_CHANNELS.filter((channel) => !shown[channel])),
    );
  } catch {
    // private window, blocked site data: the toggle still holds until the page goes
  }
}

/** The lines the window draws: every system line, and a player's line only if its channel is shown (R24, R29). */
export function visibleChatLines(
  state: Pick<ChatState, "lines" | "shown">,
): ChatEntry[] {
  return state.lines.filter(
    (entry) => entry.kind === "system" || state.shown[entry.channel],
  );
}

export function createChatStore(
  { storage }: ChatStoreDeps = { storage: () => noStorage },
): StoreApi<ChatState> {
  return createStore<ChatState>()((set) => {
    /** The entry added at the end; past its buffer's limit, that buffer's oldest goes. */
    const append = (lines: ChatEntry[], entry: ChatEntry): ChatEntry[] => {
      const buffer = bufferOf(entry);
      const next = [...lines, entry];
      if (
        next.filter((held) => bufferOf(held) === buffer).length <= CHAT_BUFFER
      )
        return next;
      next.splice(
        next.findIndex((held) => bufferOf(held) === buffer),
        1,
      );
      return next;
    };

    return {
      lines: [],
      shown: readShown(storage),
      folded: readFolded(storage),
      sent: [],
      rememberSent: (line) =>
        set((state) =>
          state.sent.at(-1) === line
            ? state
            : { sent: [...state.sent, line].slice(-CHAT_RECALL_DEPTH) },
        ),
      toggleFolded: () =>
        set((state) => {
          writeFolded(storage, !state.folded);
          return { folded: !state.folded };
        }),
      toggleChannel: (channel) =>
        set((state) => {
          const shown = { ...state.shown, [channel]: !state.shown[channel] };
          writeShown(storage, shown);
          return { shown };
        }),
      receive: (line) =>
        set((state) => {
          // a line already in the buffer is the same line arriving twice (R23); one that has
          // scrolled out is forgotten with it, so a stale id costs nothing to hold
          const seen = state.lines.some(
            (held) =>
              held.kind === "line" && held.message_id === line.message_id,
          );
          if (seen) return state;
          return { lines: append(state.lines, { kind: "line", ...line }) };
        }),
      notice: (notice) =>
        set((state) => ({
          lines: append(state.lines, { kind: "system", ...notice }),
        })),
    };
  });
}

/** The app's chat stream. The socket writes it; the window reads it, through `getState()` and `subscribe`. */
export const useChatStore = createChatStore({
  storage: () =>
    typeof window === "undefined" ? noStorage : window.localStorage,
});
