import { createStore, type StoreApi } from "zustand";

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

/** The newest lines the window holds, across every channel, notices included (R20). */
export const CHAT_BUFFER = 100;

export interface ChatState {
  lines: ChatEntry[];
  /** A line from the server, kept in arrival order; a repeat of a held message_id is ignored (R23). */
  receive: (line: ChatLinePayload) => void;
  /** A notice from the server, kept as a system line in the stream (R29). */
  notice: (notice: ChatNoticePayload) => void;
}

export function createChatStore(): StoreApi<ChatState> {
  return createStore<ChatState>()((set) => {
    const append = (lines: ChatEntry[], entry: ChatEntry) =>
      [...lines, entry].slice(-CHAT_BUFFER);

    return {
      lines: [],
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
export const useChatStore = createChatStore();
