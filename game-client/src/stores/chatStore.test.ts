import { describe, expect, it } from "vitest";
import {
  CHAT_BUFFER,
  createChatStore,
  type ChatLinePayload,
} from "./chatStore";

// FS-WJGFJ §Requirements C20, C23, C29, D32. I-WJGFJ-3: the stream the chat
// window draws from, outside any scene.

let minted = 0;
const line = (
  text: string,
  extra: Partial<ChatLinePayload> = {},
): ChatLinePayload => ({
  message_id: `00000000-0000-4000-8000-${String(++minted).padStart(12, "0")}`,
  sender_id: "11111111-1111-4111-8111-111111111111",
  sender_name: "Wren",
  channel: "area",
  scope: "pod-host",
  sent_at: "2026-10-31T09:30:15.250Z",
  text,
  ...extra,
});

describe("chatStore (FS-WJGFJ C20: the buffer)", () => {
  it("should keep the newest 100 lines and drop the oldest when the 101st arrives", () => {
    const store = createChatStore();

    for (let i = 1; i <= CHAT_BUFFER + 1; i++)
      store.getState().receive(line(`line ${i}`));

    const texts = store.getState().lines.map((l) => l.text);
    expect(texts).toHaveLength(CHAT_BUFFER);
    expect(texts[0]).toBe("line 2");
    expect(texts[texts.length - 1]).toBe(`line ${CHAT_BUFFER + 1}`);
  });
});

describe("chatStore (FS-WJGFJ C23: dedupe)", () => {
  it("should ignore a second arrival of a message_id it has already seen", () => {
    const store = createChatStore();
    const first = line("once");

    store.getState().receive(first);
    store.getState().receive({ ...first, text: "again" });

    expect(store.getState().lines.map((l) => l.text)).toEqual(["once"]);
  });

  it("should forget an id once its line has left the buffer, so the set never grows past it", () => {
    const store = createChatStore();
    const oldest = line("oldest");
    store.getState().receive(oldest);
    for (let i = 0; i < CHAT_BUFFER; i++)
      store.getState().receive(line(`fill ${i}`));

    store.getState().receive({ ...oldest, text: "oldest, back" });

    const texts = store.getState().lines.map((l) => l.text);
    expect(texts[texts.length - 1]).toBe("oldest, back");
    expect(texts).toHaveLength(CHAT_BUFFER);
  });
});

describe("chatStore (FS-WJGFJ C29: notices as system lines)", () => {
  it("should turn a chat_notice into a system line with no sender and no time, in the stream", () => {
    const store = createChatStore();
    store.getState().receive(line("before"));
    store.getState().notice({ code: "too_fast", text: "Slow down." });

    const lines = store.getState().lines;
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({
      kind: "system",
      code: "too_fast",
      text: "Slow down.",
    });
    expect(lines[0]).toMatchObject({ kind: "line", text: "before" });
  });

  it("should count system lines toward the buffer", () => {
    const store = createChatStore();
    for (let i = 0; i < CHAT_BUFFER; i++)
      store.getState().notice({ code: "too_fast", text: `n${i}` });
    store.getState().receive(line("newest"));

    const lines = store.getState().lines;
    expect(lines).toHaveLength(CHAT_BUFFER);
    expect(lines[0]).toMatchObject({ kind: "system", text: "n1" });
    expect(lines[lines.length - 1]).toMatchObject({
      kind: "line",
      text: "newest",
    });
  });
});
