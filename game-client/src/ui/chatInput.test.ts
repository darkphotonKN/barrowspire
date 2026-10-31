import { describe, expect, it, vi } from "vitest";
import type { ChatChannel } from "@/stores/chatStore";
import {
  CHAT_TEXT_MAX,
  ChatInput,
  clampChatText,
  type ChatEntryField,
  type SceneKeyboard,
} from "./chatInput";

// FS-WJGFJ §Requirements C26–C28. I-WJGFJ-4: the chat input's rules, on stand-ins for the
// text field and the scene's keyboard. The DOM field itself is a thin adapter over these.

function fakeField(): ChatEntryField & { focused: boolean } {
  return {
    value: "",
    channel: "area",
    focused: false,
    focus() {
      this.focused = true;
    },
    blur() {
      this.focused = false;
    },
  };
}

function rig(mayOpen = () => true, open: ChatChannel[] = ["area"]) {
  const field = fakeField();
  const keyboard: SceneKeyboard = { enabled: true, resetKeys: vi.fn() };
  const send = vi.fn();
  const changed = vi.fn();
  const sent: string[] = [];
  const history = {
    lines: () => sent,
    remember: (line: string) => void sent.push(line),
  };
  const input = new ChatInput({
    field,
    keyboard: () => keyboard,
    mayOpen,
    send,
    changed,
    open: new Set(open),
    history,
  });
  return { field, keyboard, send, changed, input, sent };
}

describe("ChatInput opening (C26, C27)", () => {
  it("should focus the field, disable the scene's keyboard and clear held presses when nothing owns Enter", () => {
    const { input, field, keyboard } = rig();

    expect(input.requestOpen()).toBe(true);
    input.focused();

    expect(field.focused).toBe(true);
    expect(input.isOpen()).toBe(true);
    expect(keyboard.enabled).toBe(false);
    expect(keyboard.resetKeys).toHaveBeenCalled();
  });
});

describe("ChatInput refusing to open (C27)", () => {
  it("should not open while something else owns Enter, and should give back a focus it took by click", () => {
    const { input, field, keyboard } = rig(() => false);

    expect(input.requestOpen()).toBe(false);
    expect(field.focused).toBe(false);

    // a click focuses the field directly; the input hands focus straight back
    field.focus();
    input.focused();
    expect(field.focused).toBe(false);
    expect(input.isOpen()).toBe(false);
    expect(keyboard.enabled).toBe(true);
  });
});

describe("ChatInput sending (C26, C28)", () => {
  function opened() {
    const r = rig();
    r.input.requestOpen();
    r.input.focused();
    return r;
  }

  // Revised by the user 2026-10-31: the input stays open after a line is sent, so the next one can
  // follow straight away; Enter on nothing, Esc, or a press in the world closes it.
  it("should send the draft on the area channel, clear it and stay open for the next line on Enter", () => {
    const { input, field, keyboard, send } = opened();
    field.value = "w";

    input.keyDown("Enter", false);

    expect(send).toHaveBeenCalledWith({ channel: "area", text: "w" });
    expect(field.value).toBe("");
    expect(field.focused).toBe(true);
    expect(input.isOpen()).toBe(true);
    expect(keyboard.enabled).toBe(false);
  });

  it("should close on a second Enter once the line has gone", () => {
    const { input, field, keyboard, send } = opened();
    field.value = "one";
    input.keyDown("Enter", false);

    input.keyDown("Enter", false);

    expect(send).toHaveBeenCalledTimes(1);
    expect(input.isOpen()).toBe(false);
    expect(field.focused).toBe(false);
    expect(keyboard.enabled).toBe(true);
  });

  it("should close without sending on Enter with nothing typed", () => {
    const { input, field, send } = opened();
    field.value = "   ";

    input.keyDown("Enter", false);

    expect(send).not.toHaveBeenCalled();
    expect(input.isOpen()).toBe(false);
    expect(field.value).toBe("");
  });

  it("should close and throw the draft away on Esc", () => {
    const { input, field, send } = opened();
    field.value = "never mind";

    input.keyDown("Escape", false);

    expect(send).not.toHaveBeenCalled();
    expect(field.value).toBe("");
    expect(input.isOpen()).toBe(false);
  });

  it("should leave Enter to the input method while it is composing, so picking a character never sends", () => {
    const { input, field, send } = opened();
    field.value = "你好";

    input.keyDown("Enter", true);

    expect(send).not.toHaveBeenCalled();
    expect(input.isOpen()).toBe(true);
    expect(field.value).toBe("你好");
  });

  it("should send an @ line as plain text in this slice", () => {
    const { input, field, send } = opened();
    field.value = "@Kaelen hi";

    input.keyDown("Enter", false);

    expect(send).toHaveBeenCalledWith({ channel: "area", text: "@Kaelen hi" });
  });

  it("should ignore every other key", () => {
    const { input, field, send } = opened();
    field.value = "abc";

    input.keyDown("w", false);
    input.keyDown("e", false);

    expect(send).not.toHaveBeenCalled();
    expect(input.isOpen()).toBe(true);
  });
});

describe("ChatInput keeping the keyboard as it found it (C27, edge state: run ends while typing)", () => {
  it("should put the keyboard back disabled if it was disabled when the input opened", () => {
    const { input, field, keyboard } = rig();
    keyboard.enabled = false;

    input.requestOpen();
    input.focused();
    field.value = "x";
    input.keyDown("Escape", false);

    expect(keyboard.enabled).toBe(false);
  });

  it("should close and drop the draft when the scene cancels it, so the overlay can take the keys", () => {
    const { input, field, keyboard, send } = rig();
    input.requestOpen();
    input.focused();
    field.value = "half a thought";

    input.cancel();

    expect(input.isOpen()).toBe(false);
    expect(field.value).toBe("");
    expect(field.focused).toBe(false);
    expect(keyboard.enabled).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("clampChatText (C26: 200 code points, as the server counts)", () => {
  it("should keep 200 and cut the 201st", () => {
    expect(Array.from(clampChatText("a".repeat(201)))).toHaveLength(
      CHAT_TEXT_MAX,
    );
    expect(clampChatText("a".repeat(200))).toBe("a".repeat(200));
  });

  it("should count a CJK character and an emoji as one each", () => {
    expect(clampChatText("字".repeat(200))).toBe("字".repeat(200));
    const emoji = "😀".repeat(201);
    expect(Array.from(clampChatText(emoji))).toHaveLength(200);
    expect(clampChatText(emoji)).toBe("😀".repeat(200));
  });
});

describe("ChatInput typing (C26)", () => {
  it("should cut the draft to 200 code points once the input method has committed", () => {
    const { input, field } = rig();
    input.requestOpen();
    input.focused();

    field.value = "a".repeat(205);
    input.typed(true);
    expect(field.value).toHaveLength(205);

    input.typed(false);
    expect(field.value).toHaveLength(200);
  });
});

// ── The channel picker and prefixes (I-WJGFJ-6; FS-WJGFJ Amendment 2026-10-31, R28 replaced) ──

function openOn(...open: ChatChannel[]) {
  const r = rig(() => true, ["area", ...open]);
  r.input.requestOpen();
  r.input.focused();
  return r;
}

describe("ChatInput channel picker", () => {
  it("should write an open channel's prefix at the start of the draft when it is picked", () => {
    const { input, field } = openOn("world");
    field.value = "hello";

    input.pick("world");

    expect(field.channel).toBe("world");
    expect(field.value).toBe("#hello");
  });

  it("should swap one prefix for another, and drop it when Area is picked", () => {
    const { input, field } = openOn("world", "trade");
    field.value = "#hello";

    input.pick("trade");
    expect(field.value).toBe("$hello");

    input.pick("area");
    expect(field.value).toBe("hello");
    expect(field.channel).toBe("area");
  });

  it("should not pick a channel the server does not relay yet", () => {
    const { input, field } = openOn();
    field.value = "hello";

    input.pick("world");

    expect(field.channel).toBe("area");
    expect(field.value).toBe("hello");
  });
});

describe("ChatInput prefixes typed", () => {
  it("should pick an open channel when its prefix is typed at the start", () => {
    const { input, field } = openOn("world");

    field.value = "#hi";
    input.typed(false);

    expect(field.channel).toBe("world");
  });

  it("should go back to Area when the prefix is deleted", () => {
    const { input, field } = openOn("world");
    field.value = "#hi";
    input.typed(false);

    field.value = "hi";
    input.typed(false);

    expect(field.channel).toBe("area");
  });

  it("should leave a closed channel's prefix as plain text on Area", () => {
    const { input, field, send } = openOn();

    field.value = "#hi";
    input.typed(false);
    expect(field.channel).toBe("area");

    input.keyDown("Enter", false);
    expect(send).toHaveBeenCalledWith({ channel: "area", text: "#hi" });
  });
});

describe("ChatInput sending on a picked channel", () => {
  it("should send the picked channel and the text without its prefix", () => {
    const { input, field, send } = openOn("world");
    input.pick("world");
    field.value = "# hello everyone";
    input.typed(false);

    input.keyDown("Enter", false);

    expect(send).toHaveBeenCalledWith({
      channel: "world",
      text: "hello everyone",
    });
  });

  it("should keep the picked channel and its prefix ready after sending", () => {
    const { input, field } = openOn("world");
    input.pick("world");
    field.value = "#hi";

    input.keyDown("Enter", false);

    expect(field.channel).toBe("world");
    expect(field.value).toBe("#");
  });

  it("should send nothing when only the prefix is there", () => {
    const { input, field, send } = openOn("world");
    input.pick("world");
    expect(field.value).toBe("#");

    input.keyDown("Enter", false);

    expect(send).not.toHaveBeenCalled();
    expect(input.isOpen()).toBe(false);
  });
});

// ── Recalling sent lines with the arrow keys, as a terminal does (asked 2026-10-31) ──────────

describe("ChatInput history", () => {
  function speak(r: ReturnType<typeof openOn>, ...lines: string[]) {
    for (const line of lines) {
      r.field.value = line;
      r.input.typed(false);
      r.input.keyDown("Enter", false);
    }
  }

  it("should remember each sent line as it was typed", () => {
    const r = openOn();
    speak(r, "one", "  two  ");
    expect(r.sent).toEqual(["one", "two"]);
  });

  it("should walk back through sent lines with ArrowUp and forward with ArrowDown", () => {
    const r = openOn();
    speak(r, "one", "two", "three");

    r.input.keyDown("ArrowUp", false);
    expect(r.field.value).toBe("three");
    r.input.keyDown("ArrowUp", false);
    expect(r.field.value).toBe("two");
    r.input.keyDown("ArrowDown", false);
    expect(r.field.value).toBe("three");
  });

  it("should stay on the oldest line when ArrowUp has nowhere further to go", () => {
    const r = openOn();
    speak(r, "only");
    r.input.keyDown("ArrowUp", false);
    r.input.keyDown("ArrowUp", false);
    expect(r.field.value).toBe("only");
  });

  it("should give back the half-typed draft when ArrowDown walks past the newest line", () => {
    const r = openOn();
    speak(r, "sent before");
    r.field.value = "half typ";

    r.input.keyDown("ArrowUp", false);
    expect(r.field.value).toBe("sent before");
    r.input.keyDown("ArrowDown", false);
    expect(r.field.value).toBe("half typ");
  });

  it("should do nothing on the arrows with no history", () => {
    const r = openOn();
    r.field.value = "draft";
    r.input.keyDown("ArrowUp", false);
    r.input.keyDown("ArrowDown", false);
    expect(r.field.value).toBe("draft");
  });

  it("should leave the arrows to the input method while it is composing", () => {
    const r = openOn();
    speak(r, "one");
    r.field.value = "ni";
    r.input.keyDown("ArrowUp", true);
    expect(r.field.value).toBe("ni");
  });

  it("should send a recalled line again, and start over from the newest next time", () => {
    const r = openOn();
    speak(r, "one", "two");
    r.input.keyDown("ArrowUp", false);
    r.input.keyDown("ArrowUp", false);
    r.input.keyDown("Enter", false);

    expect(r.send).toHaveBeenLastCalledWith({ channel: "area", text: "one" });
    r.input.keyDown("ArrowUp", false);
    expect(r.field.value).toBe("one");
  });

  it("should pick the channel a recalled line's prefix names", () => {
    const r = openOn("world");
    speak(r, "#hello world");
    r.input.pick("area");

    r.input.keyDown("ArrowUp", false);

    expect(r.field.value).toBe("#hello world");
    expect(r.field.channel).toBe("world");
  });
});
