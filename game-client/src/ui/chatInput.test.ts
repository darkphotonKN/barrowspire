import { describe, expect, it, vi } from "vitest";
import { CHAT_CHANNELS, type ChatChannel } from "@/stores/chatStore";
import {
  CHAT_OPEN_CHANNELS,
  CHAT_SHOWN_CHANNELS,
  CHAT_TEXT_MAX,
  ChatInput,
  clampChatText,
  whisperOf,
  type ChatInputField,
  type SceneKeyboard,
} from "./chatInput";

// FS-WJGFJ §Requirements C26–C28. I-WJGFJ-4: the chat input's rules, on stand-ins for the
// text field and the scene's keyboard. The DOM field itself is a thin adapter over these.

function fakeField(): ChatInputField & { focused: boolean } {
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
  const recall = {
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
    recall,
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

  it("should send an @ line as plain text while whisper is not among the open channels", () => {
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

  it.each([
    ["world", "#"],
    ["party", "%"],
  ] as const)(
    "should cut a %s draft to 200 code points, its prefix among them",
    (channel, prefix) => {
      const { input, field } = rig(() => true, ["area", channel]);
      input.requestOpen();
      input.focused();

      field.value = prefix + "a".repeat(205);
      input.typed(false);

      expect(field.value).toBe(prefix + "a".repeat(199));
      expect(field.channel).toBe(channel);
    },
  );

  it("should cut a whisper's message to 200 code points, @Name and the space after it aside", () => {
    const { input, field, send } = rig(() => true, ["area", "whisper"]);
    input.requestOpen();
    input.focused();

    field.value = "@Kaelen  " + "😀".repeat(205);
    input.typed(false);

    expect(field.value).toBe("@Kaelen  " + "😀".repeat(200));
    expect(field.channel).toBe("whisper");
    input.keyDown("Enter", false);
    expect(send).toHaveBeenCalledWith({
      channel: "whisper",
      target: "Kaelen",
      text: "😀".repeat(200),
    });
  });

  it("should cut a whisper draft with no message yet as a whole line", () => {
    const { input, field } = rig(() => true, ["area", "whisper"]);
    input.requestOpen();
    input.focused();

    field.value = "@" + "a".repeat(205);
    input.typed(false);

    expect(field.value).toBe("@" + "a".repeat(199));
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

// ── Who owns the keys, re-read once a frame (code review 2026-10-31) ───────────────────────
// The rule "an overlay took the keys: the draft goes" belongs to the input, not the window.

describe("ChatInput sync", () => {
  it("should report the first reading, then only changes", () => {
    let allowed = true;
    const { input } = rig(() => allowed);

    expect(input.sync()).toBe(true);
    expect(input.sync()).toBeUndefined();

    allowed = false;
    expect(input.sync()).toBe(false);
    expect(input.sync()).toBeUndefined();

    allowed = true;
    expect(input.sync()).toBe(true);
  });

  it("should drop a half-typed line and close when the keys are taken mid-line", () => {
    let allowed = true;
    const { input, field, keyboard } = rig(() => allowed);
    input.sync();
    input.requestOpen();
    input.focused();
    field.value = "half";

    allowed = false;
    input.sync();

    expect(input.isOpen()).toBe(false);
    expect(field.value).toBe("");
    expect(keyboard.enabled).toBe(true);
  });
});

describe("ChatInput keys taken by a press elsewhere (the letter panel, FS-1GZGD R40)", () => {
  function keptRig() {
    let allowed = true;
    const field = fakeField();
    const keyboard: SceneKeyboard = { enabled: true, resetKeys: vi.fn() };
    const input = new ChatInput({
      field,
      keyboard: () => keyboard,
      mayOpen: () => allowed,
      keepsDraft: () => !allowed,
      send: vi.fn(),
    });
    input.sync();
    return {
      field,
      keyboard,
      input,
      take: () => {
        allowed = false;
        input.sync();
      },
      giveBack: () => {
        allowed = true;
        return input.sync();
      },
    };
  }

  it("should close mid-line but keep the draft, as any press elsewhere does", () => {
    const { input, field, keyboard, take, giveBack } = keptRig();
    input.requestOpen();
    input.focused();
    field.value = "half";

    take();
    expect(input.isOpen()).toBe(false);
    expect(field.focused).toBe(false);
    expect(keyboard.enabled).toBe(true);
    expect(field.value).toBe("half");

    expect(giveBack()).toBe(true);
    expect(field.value).toBe("half");
  });

  it("should keep a draft already let go of when the keys are taken", () => {
    const { input, field, take } = keptRig();
    input.requestOpen();
    input.focused();
    field.value = "half";
    field.blur();
    input.blurred();

    take();
    expect(field.value).toBe("half");
  });
});

// ── World chat open on the client (FS-5SH4G C14, I-5SH4G-3) ─────────────────────────────────

describe("ChatInput with the server's open channels", () => {
  function realRig() {
    const field = fakeField();
    const send = vi.fn();
    const input = new ChatInput({
      field,
      keyboard: () => ({ enabled: true, resetKeys: () => undefined }),
      mayOpen: () => true,
      send,
    });
    input.requestOpen();
    input.focused();
    return { field, send, input };
  }

  it("should hide trade from the window, as a tab and as a picker row, until it is scoped", () => {
    // the filter tabs and the canvas picker's list both draw exactly these channels
    expect(CHAT_SHOWN_CHANNELS).not.toContain("trade");
    expect(CHAT_SHOWN_CHANNELS).toEqual(["area", "world", "party", "whisper"]);
    // still a channel of the protocol: a trade line is still recognised, just never offered
    expect(CHAT_CHANNELS).toContain("trade");
  });

  it("should list world, party and whisper among the open channels, and nothing else beyond area (FS-XGW7H C18, FS-KCQ06 C11)", () => {
    expect([...CHAT_OPEN_CHANNELS].sort()).toEqual([
      "area",
      "party",
      "whisper",
      "world",
    ]);
  });

  it("should write # when World is picked, and send the line on world without it", () => {
    const { field, send, input } = realRig();
    field.value = "hello everyone";

    input.pick("world");
    expect(field.channel).toBe("world");
    expect(field.value).toBe("#hello everyone");

    input.keyDown("Enter", false);
    expect(send).toHaveBeenCalledWith({
      channel: "world",
      text: "hello everyone",
    });
  });

  it("should pick World when # is typed first, and go back to Area when it is deleted", () => {
    const { field, input } = realRig();

    field.value = "#hi";
    input.typed(false);
    expect(field.channel).toBe("world");

    field.value = "hi";
    input.typed(false);
    expect(field.channel).toBe("area");
  });

  // FS-XGW7H C18, C19: party opens; nothing on the input asks whether the player is in a party,
  // so a player in none can still pick it and the server answers with no_party
  it("should write % when Party is picked, and send the line on party without it", () => {
    const { field, send, input } = realRig();
    field.value = "on my way";

    input.pick("party");
    expect(field.channel).toBe("party");
    expect(field.value).toBe("%on my way");

    input.keyDown("Enter", false);
    expect(send).toHaveBeenCalledWith({ channel: "party", text: "on my way" });
  });

  it("should pick Party when % is typed first, and go back to Area when it is deleted", () => {
    const { field, input } = realRig();

    field.value = "%hi";
    input.typed(false);
    expect(field.channel).toBe("party");

    field.value = "hi";
    input.typed(false);
    expect(field.channel).toBe("area");
  });

  it("should keep trade closed: not pickable, its prefix plain text", () => {
    const { field, send, input } = realRig();
    input.pick("trade");
    expect(field.channel).toBe("area");

    field.value = "$WTB ember";
    input.typed(false);
    expect(field.channel).toBe("area");
    input.keyDown("Enter", false);
    expect(send).toHaveBeenCalledWith({ channel: "area", text: "$WTB ember" });
  });
});

// ── Whisper from the input (FS-KCQ06 C11–C13, I-KCQ06-3) ────────────────────────────────────

/** An open input on the server's open channels, remembering what it sends. */
function whisperRig() {
  const field = fakeField();
  const send = vi.fn();
  const sent: string[] = [];
  const input = new ChatInput({
    field,
    keyboard: () => ({ enabled: true, resetKeys: () => undefined }),
    mayOpen: () => true,
    send,
    recall: {
      lines: () => sent,
      remember: (line: string) => void sent.push(line),
    },
  });
  input.requestOpen();
  input.focused();
  return { field, send, input, sent };
}

describe("ChatInput whispering (FS-KCQ06 C11, C12)", () => {
  it("should send @Name hello as a whisper to Name", () => {
    const { field, send, input } = whisperRig();
    field.value = "@Name hello";
    input.typed(false);

    input.keyDown("Enter", false);

    expect(send).toHaveBeenCalledWith({
      channel: "whisper",
      target: "Name",
      text: "hello",
    });
  });

  it("should not send @Name alone, and keep it in the open input", () => {
    const { field, send, input } = whisperRig();
    field.value = "@Name";
    input.typed(false);

    input.keyDown("Enter", false);
    expect(send).not.toHaveBeenCalled();
    expect(input.isOpen()).toBe(true);
    expect(field.value).toBe("@Name");

    field.value = "@Name   ";
    input.keyDown("Enter", false);
    expect(send).not.toHaveBeenCalled();
    expect(field.value).toBe("@Name   ");
  });

  it.each(["@ hello", "@ Kaelen hello"])(
    "should not send %j, with no name straight after the @",
    (draft) => {
      const { field, send, input } = whisperRig();
      field.value = draft;
      input.typed(false);

      input.keyDown("Enter", false);
      expect(send).not.toHaveBeenCalled();
      expect(input.isOpen()).toBe(true);
      expect(field.value).toBe(draft);
    },
  );

  it("should never send an @ line on Area", () => {
    const { field, send, input } = whisperRig();
    for (const line of ["@Kaelen hi", "@Kaelen", "@ hi"]) {
      field.value = line;
      input.typed(false);
      expect(field.channel).toBe("whisper");
      input.keyDown("Enter", false);
    }
    expect(send.mock.calls.every(([line]) => line.channel === "whisper")).toBe(
      true,
    );
  });

  it("should send everything after the first space as the message", () => {
    const { field, send, input } = whisperRig();
    field.value = "@Kaelen  meet me at the  gate ";
    input.typed(false);

    input.keyDown("Enter", false);

    expect(send).toHaveBeenCalledWith({
      channel: "whisper",
      target: "Kaelen",
      text: "meet me at the  gate",
    });
  });
});

describe("ChatInput whisper picker and recall (FS-KCQ06 C13)", () => {
  it("should put @ at the start of the draft when Whisper is picked", () => {
    const { field, input } = whisperRig();
    field.value = "hi";

    input.pick("whisper");

    expect(field.channel).toBe("whisper");
    expect(field.value).toBe("@hi");
  });

  it("should bring back a sent whisper with its @Name and pick whisper", () => {
    const { field, input, sent } = whisperRig();
    field.value = "@Kaelen hello";
    input.typed(false);
    input.keyDown("Enter", false);
    expect(sent).toEqual(["@Kaelen hello"]);

    input.pick("area");
    input.keyDown("ArrowUp", false);

    expect(field.value).toBe("@Kaelen hello");
    expect(field.channel).toBe("whisper");
  });
});

describe("whisperOf (FS-KCQ06 R12: the name runs to the first whitespace)", () => {
  it.each([
    ["Name hello", { target: "Name", text: "hello" }],
    ["Name hello there", { target: "Name", text: "hello there" }],
    ["Name\thello", { target: "Name", text: "hello" }],
    ["Name   hello  ", { target: "Name", text: "hello" }],
    ["名字 你好", { target: "名字", text: "你好" }],
    ["Name", null],
    ["Name   ", null],
    ["", null],
    [" hello", null],
  ])("should read %j as %j", (body, parts) => {
    expect(whisperOf(body)).toEqual(parts);
  });
});

// FS-KCQ06 C15, I-KCQ06-4: a clicked name fills the input, the draft's prefix gives way to it
describe("ChatInput whisperTo (FS-KCQ06 C15)", () => {
  const open: ChatChannel[] = ["area", "world", "party", "whisper"];

  it("should fill an empty draft with @Name and one space, pick whisper and open the input", () => {
    const { field, input, changed } = rig(() => true, open);

    input.whisperTo("Kaelen");

    expect(field.value).toBe("@Kaelen ");
    expect(field.channel).toBe("whisper");
    expect(field.focused).toBe(true);
    expect(changed).toHaveBeenCalled();
  });

  it.each([
    ["an area draft", "hello there", "@Kaelen hello there"],
    ["a world draft", "#hello there", "@Kaelen hello there"],
    ["a party draft", "%regroup", "@Kaelen regroup"],
    ["a world prefix alone", "#", "@Kaelen "],
    [
      "a whisper to someone else",
      "@Wren meet me at the gate",
      "@Kaelen meet me at the gate",
    ],
    ["a half-typed whisper name", "@Wr", "@Kaelen "],
    ["a bare @", "@", "@Kaelen "],
  ])("should replace %s's prefix and keep its words", (_label, draft, want) => {
    const { field, input } = rig(() => true, open);
    field.value = draft;
    input.typed(false);

    input.whisperTo("Kaelen");

    expect(field.value).toBe(want);
    expect(field.channel).toBe("whisper");
  });

  it("should leave an open input open and its draft refilled", () => {
    const { field, input } = rig(() => true, open);
    input.requestOpen();
    input.focused();
    field.value = "hi";
    input.typed(false);

    input.whisperTo("Kaelen");

    expect(input.isOpen()).toBe(true);
    expect(field.value).toBe("@Kaelen hi");
  });

  it("should send what follows the filled name as a whisper to that name", () => {
    const { field, input, send } = rig(() => true, open);
    input.whisperTo("Kaelen");
    input.focused();

    field.value += "well met";
    input.typed(false);
    input.keyDown("Enter", false);

    expect(send).toHaveBeenCalledWith({
      channel: "whisper",
      target: "Kaelen",
      text: "well met",
    });
  });

  it("should do nothing while something else owns the keys", () => {
    const { field, input, changed } = rig(() => false, open);
    field.value = "#hello";

    input.whisperTo("Kaelen");

    expect(field.value).toBe("#hello");
    expect(field.focused).toBe(false);
    expect(changed).not.toHaveBeenCalled();
  });

  it("should do nothing while whisper is not a channel the server relays", () => {
    const { field, input } = rig(() => true, ["area"]);
    field.value = "hello";

    input.whisperTo("Kaelen");

    expect(field.value).toBe("hello");
    expect(field.focused).toBe(false);
  });

  it("should keep the filled message within the server's limit, @Name and its space aside", () => {
    const { field, input } = rig(() => true, open);
    field.value = "😀".repeat(CHAT_TEXT_MAX);
    input.typed(false);

    input.whisperTo("Kaelen");

    expect(field.value).toBe("@Kaelen " + "😀".repeat(CHAT_TEXT_MAX));
  });

  it("should cut a longer message to the server's limit after @Name", () => {
    const { field, input } = rig(() => true, open);
    field.value = "#" + "a".repeat(CHAT_TEXT_MAX + 5);

    input.whisperTo("Kaelen");

    expect(field.value).toBe("@Kaelen " + "a".repeat(CHAT_TEXT_MAX));
  });
});

// ── The canvas picker's list (FS-J267Q R3, R4, R6; I-J267Q-1) ─────────

describe("ChatInput picker list (FS-J267Q)", () => {
  const OPEN: ChatChannel[] = ["area", "world", "whisper"];

  /** A field that tells the input of its focus as a browser field does, at once. */
  function liveRig(mayOpen = () => true) {
    const r = rig(mayOpen, OPEN);
    const focus = r.field.focus.bind(r.field);
    const blur = r.field.blur.bind(r.field);
    r.field.focus = () => {
      focus();
      r.input.focused();
    };
    r.field.blur = () => {
      blur();
      r.input.blurred();
    };
    return r;
  }

  it("should open the input and the list on the current channel when the picker is pressed, and shut only the list on the next press", () => {
    const { input, field, changed } = liveRig();
    field.channel = "area";

    input.togglePicker();
    expect(field.focused).toBe(true);
    expect(input.isOpen()).toBe(true);
    expect(input.pickerOpen()).toBe(true);
    expect(input.highlighted()).toBe("area");
    expect(changed).toHaveBeenCalled();

    input.togglePicker();
    expect(input.pickerOpen()).toBe(false);
    expect(input.isOpen()).toBe(true);
    expect(field.focused).toBe(true);
  });

  it("should open neither the input nor the list while something else owns the keys", () => {
    const { input, field } = liveRig(() => false);
    input.togglePicker();
    expect(field.focused).toBe(false);
    expect(input.pickerOpen()).toBe(false);
  });

  it("should pick an open channel from the list, write its prefix, shut the list and keep the field focused", () => {
    const { input, field } = liveRig();
    input.togglePicker();
    field.value = "hi";

    input.pick("world");

    expect(field.value).toBe("#hi");
    expect(field.channel).toBe("world");
    expect(input.pickerOpen()).toBe(false);
    expect(field.focused).toBe(true);
    expect(input.isOpen()).toBe(true);
  });

  it("should leave the list open and the draft alone when a closed channel is released on", () => {
    const { input, field } = liveRig();
    input.togglePicker();
    field.value = "hi";

    input.pick("party");

    expect(field.value).toBe("hi");
    expect(field.channel).toBe("area");
    expect(input.pickerOpen()).toBe(true);
  });

  it("should highlight the open channel under the pointer and pass over a closed one", () => {
    const { input } = liveRig();
    input.togglePicker();

    input.hover("whisper");
    expect(input.highlighted()).toBe("whisper");
    input.hover("party");
    expect(input.highlighted()).toBe("whisper");
  });

  it.each<[string, (r: ReturnType<typeof liveRig>) => void]>([
    ["the input lets go (a press in the world)", (r) => r.field.blur()],
    ["Esc closes the input", (r) => r.input.keyDown("Escape", false)],
    ["the keys are taken", (r) => r.input.cancel()],
    ["the player types", (r) => ((r.field.value = "x"), r.input.typed(false))],
    ["it is told to", (r) => r.input.closePicker()],
  ])("should shut the list when %s", (_, act) => {
    const r = liveRig();
    r.input.togglePicker();
    expect(r.input.pickerOpen()).toBe(true);

    act(r);

    expect(r.input.pickerOpen()).toBe(false);
  });
});

// ── The picker's keys (FS-J267Q R5; I-J267Q-2) ─────────────────────────

describe("ChatInput picker keys (FS-J267Q R5)", () => {
  function typing(open: ChatChannel[] = ["area", "world", "party", "whisper"]) {
    const r = rig(() => true, open);
    const focus = r.field.focus.bind(r.field);
    const blur = r.field.blur.bind(r.field);
    r.field.focus = () => {
      focus();
      r.input.focused();
    };
    r.field.blur = () => {
      blur();
      r.input.blurred();
    };
    r.input.requestOpen();
    return r;
  }

  it("should pick the next open channel on Tab, in the list's order, wrapping, and write its prefix", () => {
    const { input, field } = typing();
    field.value = "hi";
    const seen: ChatChannel[] = [];
    for (let i = 0; i < 4; i++) {
      input.keyDown("Tab", false);
      seen.push(field.channel);
    }
    expect(seen).toEqual(["world", "party", "whisper", "area"]);
    expect(field.value).toBe("hi");
    expect(input.isOpen()).toBe(true);
  });

  it("should pick the previous open channel on Shift+Tab, wrapping", () => {
    const { input, field } = typing();
    input.keyDown("Tab", false, true);
    expect(field.channel).toBe("whisper");
    input.keyDown("Tab", false, true);
    expect(field.channel).toBe("party");
  });

  it("should pass over closed channels, and stay put when no other channel is open", () => {
    const { input, field } = typing(["area", "whisper"]);
    input.keyDown("Tab", false);
    expect(field.channel).toBe("whisper");

    const lone = typing(["area"]);
    lone.input.keyDown("Tab", false);
    expect(lone.field.channel).toBe("area");
  });

  it("should leave Tab to the input method while it composes", () => {
    const { input, field } = typing();
    input.keyDown("Tab", true);
    expect(field.channel).toBe("area");
  });

  it("should move the highlight over the open rows with the arrows, stopping at the ends, and pick on Enter without sending", () => {
    const { input, field, send } = typing(["area", "world", "whisper"]);
    field.value = "hi";
    input.togglePicker();
    expect(input.highlighted()).toBe("area");

    input.keyDown("ArrowUp", false);
    expect(input.highlighted()).toBe("area");
    input.keyDown("ArrowDown", false);
    expect(input.highlighted()).toBe("world");
    // party is closed: the highlight passes over it
    input.keyDown("ArrowDown", false);
    expect(input.highlighted()).toBe("whisper");
    input.keyDown("ArrowDown", false);
    expect(input.highlighted()).toBe("whisper");
    // the arrows walked the list, not the sent lines
    expect(field.value).toBe("hi");

    input.keyDown("Enter", false);
    expect(send).not.toHaveBeenCalled();
    expect(field.channel).toBe("whisper");
    expect(field.value).toBe("@hi");
    expect(input.pickerOpen()).toBe(false);
    expect(input.isOpen()).toBe(true);
  });

  it("should shut only the list on Esc, the input left open with its draft", () => {
    const { input, field, keyboard } = typing();
    field.value = "half";
    input.togglePicker();

    input.keyDown("Escape", false);

    expect(input.pickerOpen()).toBe(false);
    expect(input.isOpen()).toBe(true);
    expect(field.focused).toBe(true);
    expect(field.value).toBe("half");
    expect(keyboard.enabled).toBe(false);
  });

  it("should shut the list and pick the next channel on Tab while the list is open", () => {
    const { input, field } = typing();
    input.togglePicker();
    input.keyDown("Tab", false);
    expect(input.pickerOpen()).toBe(false);
    expect(field.channel).toBe("world");
  });
});

// FS-WDM0X § Pass 2: the chat, C2, C3, C5: the picker's list opening and shutting by the player, and the
// one refusal of chat input, played through the input's `play`; what the game shuts plays nothing
describe("ChatInput sounds (FS-WDM0X § Pass 2: the chat)", () => {
  function heard(open: ChatChannel[] = ["area", "world", "party", "whisper"], mayOpen = () => true) {
    const played: string[] = [];
    const field = fakeField();
    const send = vi.fn();
    const input = new ChatInput({
      field,
      keyboard: () => ({ enabled: true, resetKeys: vi.fn() }),
      mayOpen,
      send,
      open: new Set(open),
      play: (effect) => void played.push(effect),
    });
    const typing = () => {
      input.requestOpen();
      input.focused();
    };
    return { input, field, send, played, typing };
  }

  it("should play menu_dropdown_open as the picker opens its list, and menu_dropdown_close as it shuts it (C2, C3)", () => {
    const { input, played } = heard();
    input.togglePicker();
    expect(input.pickerOpen()).toBe(true);
    input.togglePicker();
    expect(played).toEqual(["menu_dropdown_open", "menu_dropdown_close"]);
  });

  it("should play nothing for a picker press refused while something else owns the keys", () => {
    const { input, played } = heard(undefined, () => false);
    input.togglePicker();
    expect(input.pickerOpen()).toBe(false);
    expect(played).toEqual([]);
  });

  it.each([
    ["Esc in the list", (s: ReturnType<typeof heard>) => s.input.keyDown("Escape", false)],
    ["Enter in the list, picking its row", (s: ReturnType<typeof heard>) => s.input.keyDown("Enter", false)],
    ["a row picked", (s: ReturnType<typeof heard>) => s.input.pick("world")],
    ["a press outside it", (s: ReturnType<typeof heard>) => s.input.closePicker(true)],
  ])("should play menu_dropdown_close once for %s (C3)", (_, shut) => {
    const s = heard();
    s.typing();
    s.input.togglePicker();
    s.played.length = 0;
    shut(s);
    expect(s.input.pickerOpen()).toBe(false);
    expect(s.played).toEqual(["menu_dropdown_close"]);
  });

  it.each([
    ["Tab", (s: ReturnType<typeof heard>) => s.input.keyDown("Tab", false)],
    ["a typed character", (s: ReturnType<typeof heard>) => ((s.field.value = "h"), s.input.typed(false))],
    ["the game shutting it (a resize)", (s: ReturnType<typeof heard>) => s.input.closePicker()],
    ["the keys taken", (s: ReturnType<typeof heard>) => s.input.cancel()],
    ["the field let go", (s: ReturnType<typeof heard>) => s.input.blurred()],
  ])("should shut the list silently for %s (C3)", (_, shut) => {
    const s = heard();
    s.typing();
    s.input.togglePicker();
    s.played.length = 0;
    shut(s);
    expect(s.input.pickerOpen()).toBe(false);
    expect(s.played).toEqual([]);
  });

  it("should play nothing for a pick with the list shut, nor for a closed channel's row", () => {
    const s = heard(["area"]);
    s.typing();
    s.input.pick("area");
    s.input.togglePicker();
    s.played.length = 0;
    s.input.pick("world");
    expect(s.input.pickerOpen()).toBe(true);
    expect(s.played).toEqual([]);
  });

  it.each([["@Wenna"], ["@Wenna   "], ["@ hello"]])(
    "should play menu_error on Enter refused for the whisper draft %j, send nothing and keep it (C5)",
    (draft) => {
      const s = heard();
      s.typing();
      s.field.value = draft;
      s.field.channel = "whisper";
      s.input.keyDown("Enter", false);
      expect(s.played).toEqual(["menu_error"]);
      expect(s.send).not.toHaveBeenCalled();
      expect(s.field.value).toBe(draft);
    },
  );

  it("should play nothing on Enter that sends, nor on Enter on nothing", () => {
    const s = heard();
    s.typing();
    s.field.value = "@Wenna hi";
    s.field.channel = "whisper";
    s.input.keyDown("Enter", false);
    s.field.value = "";
    s.field.channel = "area";
    s.input.keyDown("Enter", false);
    expect(s.send).toHaveBeenCalledTimes(1);
    expect(s.played).toEqual([]);
  });
});
