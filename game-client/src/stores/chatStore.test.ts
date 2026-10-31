import { describe, expect, it } from "vitest";
import type { KeyValueStore } from "@/characters/roster";
import {
  CHAT_BUFFER,
  CHAT_CHANNELS,
  CHAT_FILTER_KEY,
  CHAT_HISTORY,
  createChatStore,
  visibleChatLines,
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

  it("should keep system lines in a buffer of their own, so they never push a player's line out", () => {
    const store = createChatStore();
    store.getState().receive(line("kept"));
    for (let i = 0; i <= CHAT_BUFFER; i++)
      store.getState().notice({ code: "too_fast", text: `n${i}` });

    const lines = store.getState().lines;
    expect(lines.filter((l) => l.kind === "system")).toHaveLength(CHAT_BUFFER);
    expect(lines[0]).toMatchObject({ kind: "line", text: "kept" });
    expect(lines.find((l) => l.kind === "system")).toMatchObject({
      text: "n1",
    });
  });
});

describe("chatStore (FS-WJGFJ R20 as amended 2026-10-31: a buffer per channel)", () => {
  it("should keep a quiet channel's lines however loud another channel is", () => {
    const store = createChatStore();
    for (let i = 0; i < 10; i++) store.getState().receive(line(`area ${i}`));
    for (let i = 0; i < CHAT_BUFFER * 2; i++)
      store.getState().receive(line(`world ${i}`, { channel: "world" }));

    const lines = store.getState().lines;
    const area = lines.filter((l) => l.kind === "line" && l.channel === "area");
    const world = lines.filter(
      (l) => l.kind === "line" && l.channel === "world",
    );
    expect(area).toHaveLength(10);
    expect(world).toHaveLength(CHAT_BUFFER);
    expect(world[0]).toMatchObject({ text: `world ${CHAT_BUFFER}` });
  });

  it("should keep arrival order across channels in the one stream", () => {
    const store = createChatStore();
    store.getState().receive(line("a1"));
    store.getState().receive(line("w1", { channel: "world" }));
    store.getState().notice({ code: "too_fast", text: "s1" });
    store.getState().receive(line("a2"));

    expect(store.getState().lines.map((l) => l.text)).toEqual([
      "a1",
      "w1",
      "s1",
      "a2",
    ]);
  });
});

describe("chatStore channel filter (FS-WJGFJ R24: hidden, not muted)", () => {
  it("should hide a toggled-off channel's lines from view while still holding them", () => {
    const store = createChatStore();
    store.getState().receive(line("a1"));
    store.getState().receive(line("w1", { channel: "world" }));

    store.getState().toggleChannel("area");
    store.getState().receive(line("a2"));

    expect(visibleChatLines(store.getState()).map((l) => l.text)).toEqual([
      "w1",
    ]);
    expect(store.getState().lines.map((l) => l.text)).toEqual([
      "a1",
      "w1",
      "a2",
    ]);

    store.getState().toggleChannel("area");
    expect(visibleChatLines(store.getState()).map((l) => l.text)).toEqual([
      "a1",
      "w1",
      "a2",
    ]);
  });

  it("should always show system lines, even with every channel off", () => {
    const store = createChatStore();
    for (const channel of CHAT_CHANNELS)
      store.getState().toggleChannel(channel);
    store.getState().receive(line("a1"));
    store.getState().notice({ code: "too_fast", text: "Slow down." });

    expect(visibleChatLines(store.getState()).map((l) => l.text)).toEqual([
      "Slow down.",
    ]);
  });

  it("should start with every channel shown", () => {
    const store = createChatStore();
    for (const channel of CHAT_CHANNELS)
      expect(store.getState().shown[channel]).toBe(true);
  });
});

describe("chatStore filter persistence (FS-WJGFJ R24: kept in this browser)", () => {
  it("should write the filter on change and read it back in the next store", () => {
    const { storage } = memoryStorage();
    createChatStore({ storage: () => storage })
      .getState()
      .toggleChannel("world");

    const next = createChatStore({ storage: () => storage });

    expect(next.getState().shown.world).toBe(false);
    expect(next.getState().shown.area).toBe(true);
  });

  it("should show every channel and keep toggling when storage throws", () => {
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
    };
    const store = createChatStore({ storage: () => throwing });

    for (const channel of CHAT_CHANNELS)
      expect(store.getState().shown[channel]).toBe(true);
    store.getState().toggleChannel("trade");
    expect(store.getState().shown.trade).toBe(false);
  });

  it("should ignore a stored value it cannot read", () => {
    const { storage } = memoryStorage({ [CHAT_FILTER_KEY]: "{not json" });
    const store = createChatStore({ storage: () => storage });
    for (const channel of CHAT_CHANNELS)
      expect(store.getState().shown[channel]).toBe(true);
  });
});

function memoryStorage(seed: Record<string, string> = {}) {
  const data: Record<string, string> = { ...seed };
  const storage: KeyValueStore = {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
  return { storage, data };
}

describe("chatStore folding (FS-WJGFJ Amendment 2026-10-31: collapse)", () => {
  it("should start unfolded, fold and unfold on toggle, and keep it in this browser", () => {
    const { storage } = memoryStorage();
    const store = createChatStore({ storage: () => storage });
    expect(store.getState().folded).toBe(false);

    store.getState().toggleFolded();
    expect(store.getState().folded).toBe(true);
    expect(createChatStore({ storage: () => storage }).getState().folded).toBe(
      true,
    );

    store.getState().toggleFolded();
    expect(createChatStore({ storage: () => storage }).getState().folded).toBe(
      false,
    );
  });

  it("should start unfolded and still fold for the session when storage throws", () => {
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
    };
    const store = createChatStore({ storage: () => throwing });
    expect(store.getState().folded).toBe(false);
    store.getState().toggleFolded();
    expect(store.getState().folded).toBe(true);
  });

  it("should keep the filter and the fold apart", () => {
    const { storage } = memoryStorage();
    const store = createChatStore({ storage: () => storage });
    store.getState().toggleChannel("world");
    store.getState().toggleFolded();

    const next = createChatStore({ storage: () => storage });
    expect(next.getState().shown.world).toBe(false);
    expect(next.getState().folded).toBe(true);
  });
});

describe("chatStore sent history (asked 2026-10-31: recall with the arrow keys)", () => {
  it("should keep the newest sent lines, oldest first, up to the cap", () => {
    const store = createChatStore();
    for (let i = 1; i <= CHAT_HISTORY + 5; i++)
      store.getState().rememberSent(`line ${i}`);

    const sent = store.getState().sent;
    expect(sent).toHaveLength(CHAT_HISTORY);
    expect(sent[0]).toBe("line 6");
    expect(sent.at(-1)).toBe(`line ${CHAT_HISTORY + 5}`);
  });

  it("should not keep the same line twice in a row", () => {
    const store = createChatStore();
    store.getState().rememberSent("hi");
    store.getState().rememberSent("hi");
    store.getState().rememberSent("bye");
    store.getState().rememberSent("hi");
    expect(store.getState().sent).toEqual(["hi", "bye", "hi"]);
  });

  it("should keep nothing in this browser's storage", () => {
    const writes: string[] = [];
    const storage: KeyValueStore = {
      getItem: () => null,
      setItem: (k) => void writes.push(k),
      removeItem: () => undefined,
    };
    createChatStore({ storage: () => storage })
      .getState()
      .rememberSent("private");
    expect(writes).toEqual([]);
  });
});
