import { EventEmitter } from "eventemitter3";
import { describe, expect, it } from "vitest";
import type Phaser from "phaser";
import { createChatStore, type ChatLinePayload } from "@/stores/chatStore";
import { palette, shade, toCss } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import { ChatWindow } from "./ChatWindow";
import {
  CHAT_FOLD_W,
  CHAT_FOLD_OPEN,
  CHAT_FOLD_SHUT,
  CHAT_VISIBLE_LINES,
  chatFoldButton,
  chatScrollThumb,
  chatScrollTrack,
  chatWindowFrame,
} from "./chatWindowLayout";

// FS-WJGFJ §Requirements C17–C23, C29, C31. I-WJGFJ-3: the window as a scene draws it, on a
// recording stand-in for the Phaser scene.

interface FakeText {
  content: string;
  color: string;
  x: number;
  y: number;
  height: number;
  depth?: number;
  scroll?: number;
  alpha: number;
  originX: number;
  fontSize?: string;
  destroyed: boolean;
  /** The handler a toggle registered for pointerdown, if it is interactive. */
  onPress?: () => void;
  /** The handler a button registered for pointerup, if it acts on release. */
  onRelease?: () => void;
  /** The geometry mask the text wears, as Phaser would render it with. */
  mask?: FakeMask;
}

interface FakeMask {
  destroyed: boolean;
  destroy(): void;
}

/** `heightOf` sets a text's drawn height by its words, as a wrapped line's would be. */
function fakeScene(heightOf: (content: string) => number = () => 18) {
  const texts: FakeText[] = [];
  const maskRecords: FakeMask[] = [];
  const panels: {
    depth?: number;
    scroll?: number;
    destroyed: boolean;
    rects: number[][];
    fills: [number, number][];
  }[] = [];
  const keys = Object.assign(new EventEmitter(), {
    enabled: true,
    resetKeys: () => undefined,
  });
  const input = Object.assign(new EventEmitter(), { keyboard: keys });

  const graphics = (masks = false) => {
    const g = {
      depth: undefined as number | undefined,
      scroll: undefined as number | undefined,
      destroyed: false,
      rects: [] as number[][],
      fills: [] as [number, number][],
    };
    if (!masks) panels.push(g);
    const self: Record<string, unknown> = {
      setScrollFactor: (s: number) => ((g.scroll = s), self),
      setDepth: (d: number) => ((g.depth = d), self),
      clear: () => ((g.rects = []), (g.fills = []), self),
      fillStyle: (colour: number, alpha = 1) => (
        g.fills.push([colour, alpha]),
        self
      ),
      lineStyle: () => self,
      fillRect: (...r: number[]) => (g.rects.push(r), self),
      fillRoundedRect: (...r: number[]) => (g.rects.push(r.slice(0, 4)), self),
      strokeRect: () => self,
      strokeRoundedRect: () => self,
      lineBetween: () => self,
      fillTriangle: () => self,
      fillCircle: () => self,
      createGeometryMask: () => {
        const mask: FakeMask = {
          destroyed: false,
          destroy: () => void (mask.destroyed = true),
        };
        maskRecords.push(mask);
        return mask;
      },
      destroy: () => void (g.destroyed = true),
    };
    return self;
  };
  const text = (
    x: number,
    y: number,
    content: string,
    style: { color?: string; fontSize?: string } = {},
  ) => {
    const t: FakeText = {
      content,
      color: style.color ?? "",
      fontSize: style.fontSize,
      x,
      y,
      height: heightOf(content),
      alpha: 1,
      originX: 0,
      destroyed: false,
    };
    texts.push(t);
    const self: Record<string, unknown> = {
      setScrollFactor: (s: number) => ((t.scroll = s), self),
      setDepth: (d: number) => ((t.depth = d), self),
      setOrigin: (ox: number) => ((t.originX = ox), self),
      setAlpha: (a: number) => ((t.alpha = a), self),
      setInteractive: () => self,
      on: (event: string, cb: () => void) => {
        if (event === "pointerdown") t.onPress = cb;
        if (event === "pointerup") t.onRelease = cb;
        return self;
      },
      get width() {
        return t.content.length * 7;
      },
      setMask: (mask: FakeMask) => ((t.mask = mask), self),
      setPosition: (nx: number, ny: number) => ((t.x = nx), (t.y = ny), self),
      destroy: () => void (t.destroyed = true),
      get height() {
        return t.height;
      },
    };
    return self;
  };

  const events = new EventEmitter();
  const scene = {
    events,
    add: { graphics: () => graphics(), text },
    make: { graphics: () => graphics(true) },
    input,
  } as unknown as Phaser.Scene;

  // top to bottom, as the player reads them
  const shown = () =>
    texts.filter((t) => !t.destroyed).sort((a, b) => a.y - b.y);
  // only the message area's lines, not the filter row's or the input row's words
  const messageTexts = (bottom = BOTTOM) => {
    const m = chatWindowFrame(X, bottom).messages;
    return shown().filter((t) => t.y >= m.y && t.y < m.y + m.height);
  };
  const wheel = (x: number, y: number, dy: number) =>
    input.emit("wheel", { x, y }, [], 0, dy);
  const press = (key: string) => keys.emit(`keydown-${key}`);
  return {
    scene,
    shown,
    messageTexts,
    panels,
    maskRecords,
    input,
    keys,
    events,
    wheel,
    press,
    /** One frame: the window re-reads who owns the keys. */
    frame: () => events.emit("postupdate"),
  };
}

let minted = 0;
const stamped = (
  text: string,
  extra: Partial<ChatLinePayload> = {},
): ChatLinePayload => ({
  message_id: `id-${++minted}`,
  sender_id: "s",
  sender_name: "Wren",
  channel: "area",
  scope: "pod",
  sent_at: "2026-10-31T09:30:15.250Z",
  text,
  ...extra,
});

const BOTTOM = 700;
const X = 10;

function rig() {
  const store = createChatStore();
  const s = fakeScene();
  const window = new ChatWindow(s.scene, store, X, BOTTOM);
  const say = (text: string, extra: Partial<ChatLinePayload> = {}) =>
    store.getState().receive(stamped(text, extra));
  const contents = () =>
    s.messageTexts().map((t) => t.content.replace(/^Wren: /, ""));
  return { ...s, store, window, say, contents };
}

describe("ChatWindow (C17, C19: a camera-fixed panel at HUD depth)", () => {
  it("should draw a camera-fixed panel at depth 1000 whose bottom edge is where it was placed", () => {
    const { panels } = rig();

    const panel = panels[0];
    expect(panel.scroll).toBe(0);
    expect(panel.depth).toBe(1000);
    const frame = chatWindowFrame(X, BOTTOM);
    // the carved panel's shadow comes first; its ground is the panel's own rect
    expect(panel.rects).toContainEqual([
      frame.panel.x,
      frame.panel.y,
      frame.panel.width,
      frame.panel.height,
    ]);
  });
});

describe("ChatWindow (C20, C22, C29: the stream drawn)", () => {
  it("should draw lines already in the store, newest at the bottom", () => {
    const store = createChatStore();
    store.getState().receive(stamped("first"));
    store.getState().receive(stamped("second"));
    const s = fakeScene();
    new ChatWindow(s.scene, store, X, BOTTOM);

    const shown = s.messageTexts();
    expect(
      shown.map(
        (t) => t.content.endsWith("first") || t.content.endsWith("second"),
      ),
    ).toEqual([true, true]);
    const [first, second] = shown;
    expect(first.y).toBeLessThan(second.y);
  });

  it("should draw a line the moment the store gets it, in its channel's colour, camera-fixed at HUD depth", () => {
    const { say, messageTexts } = rig();

    say("hello");

    const [t] = messageTexts();
    expect(t.content).toBe("Wren: hello");
    expect(t.color).toBe(toCss(palette.chatArea));
    expect(t.scroll).toBe(0);
    expect(t.depth).toBe(1000);
  });

  it("should draw a notice as a dash and its words in the system colour", () => {
    const { store, messageTexts } = rig();

    store.getState().notice({
      code: "channel_closed",
      text: "That channel is not open yet.",
    });

    const [t] = messageTexts();
    expect(t.content).toBe("— That channel is not open yet.");
    expect(t.color).toBe(toCss(palette.chatSystem));
  });

  // FS-XGW7H C20, C21: a party line is drawn like a world line, whatever the party store holds
  // (the window never reads it), and a no_party notice shows the server's words as sent
  it("should draw a party line in the party colour, and hide it with the Party tab", () => {
    const s = rig();
    s.say("on my way", {
      channel: "party",
      scope: "22222222-2222-4222-8222-222222222222",
    });

    const [t] = s.messageTexts();
    expect(t.content).toBe("Wren: on my way");
    expect(t.color).toBe(toCss(palette.chatParty));

    toggleOf(s, "Party").onPress!();
    expect(s.contents()).toEqual([]);
    toggleOf(s, "Party").onPress!();
    expect(s.contents()).toEqual(["on my way"]);
  });

  it("should draw a no_party notice as a system line with the server's text", () => {
    const { store, messageTexts } = rig();

    store.getState().notice({
      code: "no_party",
      text: "You are not in a party.",
    });

    const [t] = messageTexts();
    expect(t.content).toBe("— You are not in a party.");
    expect(t.color).toBe(toCss(palette.chatSystem));
  });

  // FS-KCQ06 C14, C16: a whisper reads From or To by who sent it, in the whisper colour, under the
  // Whisper tab; its notices are system lines with the server's words
  it("should draw a received whisper as From Name and the echo as To Name, both in the whisper colour", () => {
    const store = createChatStore();
    const s = fakeScene();
    new ChatWindow(s.scene, store, X, BOTTOM, { selfId: () => "p-wren" });
    const whisper = {
      channel: "whisper" as const,
      scope: "p-kaelen",
      target_id: "p-kaelen",
      target_name: "Kaelen",
    };
    store
      .getState()
      .receive(stamped("ho there", { ...whisper, sender_id: "p-wren" }));
    store.getState().receive(
      stamped("well met", {
        ...whisper,
        sender_id: "p-kaelen",
        sender_name: "Kaelen",
        scope: "p-wren",
        target_id: "p-wren",
        target_name: "Wren",
      }),
    );

    const [echo, received] = s.messageTexts();
    expect(echo.content).toBe("To Kaelen: ho there");
    expect(received.content).toBe("From Kaelen: well met");
    expect(echo.color).toBe(toCss(palette.chatWhisper));
    expect(received.color).toBe(toCss(palette.chatWhisper));

    toggleOf(s, "Whisper").onPress!();
    expect(s.messageTexts()).toEqual([]);
    toggleOf(s, "Whisper").onPress!();
    expect(s.messageTexts()).toHaveLength(2);
  });

  it.each([
    ["not_online", "That player is not online."],
    ["whisper_self", "You can't whisper yourself."],
  ])(
    "should draw a %s notice as a system line with the server's text",
    (code, text) => {
      const { store, messageTexts } = rig();

      store.getState().notice({ code, text });

      const [t] = messageTexts();
      expect(t.content).toBe(`— ${text}`);
      expect(t.color).toBe(toCss(palette.chatSystem));
    },
  );

  it("should show only the newest eight lines while following", () => {
    const { say, contents } = rig();

    for (let i = 1; i <= 12; i++) say(`l${i}`);

    expect(contents()).toEqual([
      "l5",
      "l6",
      "l7",
      "l8",
      "l9",
      "l10",
      "l11",
      "l12",
    ]);
    expect(contents()).toHaveLength(CHAT_VISIBLE_LINES);
  });
});

describe("ChatWindow (C21: scrolling)", () => {
  const frame = chatWindowFrame(X, BOTTOM);
  const overMessages = { x: frame.messages.x + 20, y: frame.messages.y + 20 };

  it("should scroll one line back per wheel notch over the messages, and back down to following", () => {
    const { say, wheel, contents } = rig();
    for (let i = 1; i <= 12; i++) say(`l${i}`);

    wheel(overMessages.x, overMessages.y, -100);
    expect(contents()).toEqual([
      "l4",
      "l5",
      "l6",
      "l7",
      "l8",
      "l9",
      "l10",
      "l11",
    ]);

    wheel(overMessages.x, overMessages.y, 100);
    expect(contents()).toEqual([
      "l5",
      "l6",
      "l7",
      "l8",
      "l9",
      "l10",
      "l11",
      "l12",
    ]);
  });

  it("should ignore the wheel away from the window", () => {
    const { say, wheel, contents } = rig();
    for (let i = 1; i <= 12; i++) say(`l${i}`);

    wheel(frame.panel.x + frame.panel.width + 50, overMessages.y, -100);

    expect(contents()).toEqual([
      "l5",
      "l6",
      "l7",
      "l8",
      "l9",
      "l10",
      "l11",
      "l12",
    ]);
  });

  it("should hold still while scrolled back when a new line arrives, and follow again at the bottom", () => {
    const { say, wheel, contents } = rig();
    for (let i = 1; i <= 12; i++) say(`l${i}`);
    wheel(overMessages.x, overMessages.y, -100);
    const held = contents();

    say("l13");
    expect(contents()).toEqual(held);

    wheel(overMessages.x, overMessages.y, 100);
    wheel(overMessages.x, overMessages.y, 100);
    expect(contents()).toContain("l13");
    say("l14");
    expect(contents()[contents().length - 1]).toBe("l14");
  });
});

describe("ChatWindow (C18: moving with the ResourceHud)", () => {
  it("should move its bottom edge when told to sit somewhere else", () => {
    const { window, panels, say, messageTexts } = rig();
    say("hi");

    window.setBottom(600);

    const frame = chatWindowFrame(X, 600);
    const live = panels.filter((p) => !p.destroyed)[0]!;
    // the carved panel's shadow comes first; its ground is the panel's own rect
    expect(live.rects).toContainEqual([
      frame.panel.x,
      frame.panel.y,
      frame.panel.width,
      frame.panel.height,
    ]);
    const [line] = messageTexts(600);
    expect(line.y).toBeLessThan(600);
    expect(line.y).toBeGreaterThanOrEqual(frame.messages.y);
  });

  it("should say where its top edge now is, for what stacks down to it (FS-NCC9J R24)", () => {
    const { window, store } = rig();
    expect(window.topEdge()).toBe(chatWindowFrame(X, BOTTOM).panel.y);
    window.setBottom(600);
    expect(window.topEdge()).toBe(chatWindowFrame(X, 600).panel.y);
    store.getState().toggleFolded();
    expect(window.topEdge()).toBe(chatWindowFrame(X, 600, true).panel.y);
  });
});

describe("ChatWindow (teardown)", () => {
  it("should stop listening to the store and the wheel and destroy what it drew", () => {
    const { window, say, shown, input, panels } = rig();
    say("before");

    window.destroy();
    say("after");

    expect(shown()).toHaveLength(0);
    expect(panels.every((p) => p.destroyed)).toBe(true);
    expect(input.listenerCount("wheel")).toBe(0);
  });
});

// ── The input row (I-WJGFJ-4, FS-WJGFJ R26–R28) ─────────────────────────────────────────────

interface FakeField {
  value: string;
  /** Whether the DOM row is shown; it is hidden while the player is not typing. */
  visible: boolean;
  channel: import("@/stores/chatStore").ChatChannel;
  focused: boolean;
  rect: { x: number; y: number; width: number; height: number };
  destroyed: boolean;
  events?: import("./chatInputField").ChatInputFieldEvents;
}

function inputRig(
  mayOpen = () => true,
  selfId?: () => string | undefined,
  heightOf?: (content: string) => number,
) {
  const store = createChatStore();
  const s = fakeScene(heightOf);
  const fields: FakeField[] = [];
  const sent: unknown[] = [];
  const window = new ChatWindow(s.scene, store, X, BOTTOM, {
    selfId,
    input: {
      mayOpen,
      send: (line) => sent.push(line),
      makeField: (_scene, rect, events) => {
        const f: FakeField = {
          value: "",
          // as a DOM element might start: the window must show it itself
          visible: false,
          channel: "area",
          focused: false,
          rect,
          destroyed: false,
          events,
        };
        fields.push(f);
        return {
          get value() {
            return f.value;
          },
          set value(v: string) {
            f.value = v;
          },
          get channel() {
            return f.channel;
          },
          set channel(c) {
            f.channel = c;
          },
          focus: () => {
            f.focused = true;
            events.focused();
          },
          blur: () => {
            f.focused = false;
            events.blurred();
          },
          moveTo: (r) => void (f.rect = r),
          show: () => void (f.visible = true),
          hide: () => void (f.visible = false),
          destroy: () => void (f.destroyed = true),
        };
      },
    },
  });
  const field = () => fields[0];
  return { ...s, store, window, field, sent };
}

describe("ChatWindow input (C26: Enter opens, Enter sends)", () => {
  it("should place the field in the input row", () => {
    const { field } = inputRig();
    const frame = chatWindowFrame(X, BOTTOM);
    expect(field().rect).toEqual(frame.input);
  });

  it("should open on Enter in the scene, send on Enter in the field and stay open, close on Enter again", () => {
    const { press, field, sent, keys, window } = inputRig();

    press("ENTER");
    expect(field().focused).toBe(true);
    expect(keys.enabled).toBe(false);
    expect(window.isTyping()).toBe(true);

    field().value = "hello";
    field().events!.keyDown("Enter", false);

    expect(sent).toEqual([{ channel: "area", text: "hello" }]);
    expect(field().focused).toBe(true);
    expect(keys.enabled).toBe(false);

    field().events!.keyDown("Enter", false);
    expect(field().focused).toBe(false);
    expect(keys.enabled).toBe(true);
  });

  it("should not open on Enter while something else owns the keys", () => {
    const { press, field } = inputRig(() => false);
    press("ENTER");
    expect(field().focused).toBe(false);
  });

  it("should move the field with the window", () => {
    const { window, field } = inputRig();
    window.setBottom(600);
    expect(field().rect).toEqual(chatWindowFrame(X, 600).input);
  });

  it("should drop the draft and close when cancelled", () => {
    const { press, field, window, keys } = inputRig();
    press("ENTER");
    field().value = "half";

    window.cancelInput();

    expect(field().value).toBe("");
    expect(window.isTyping()).toBe(false);
    expect(keys.enabled).toBe(true);
  });

  it("should take the field down and stop hearing Enter when destroyed", () => {
    const { window, field, keys } = inputRig();
    window.destroy();
    expect(field().destroyed).toBe(true);
    expect(keys.listenerCount("keydown-ENTER")).toBe(0);
  });
});

// ── The filter row (I-WJGFJ-5, FS-WJGFJ R24, R25) ──────────────────────────────────────────

const toggleOf = (s: ReturnType<typeof fakeScene>, label: string) => {
  const t = s.shown().find((x) => x.content === label);
  expect(t, `a toggle reading ${label}`).toBeDefined();
  return t!;
};

describe("ChatWindow filter row (R24)", () => {
  it("should draw a toggle per shown channel in order in the filter row, each in its channel's colour, all on, with no Trade", () => {
    const { shown } = rig();
    const row = chatWindowFrame(X, BOTTOM).filterRow;

    // the fold button shares the row's right end (asked 2026-10-31); it is not a channel
    const toggles = shown().filter(
      (t) =>
        t.y >= row.y - 4 &&
        t.y < row.y + row.height &&
        t.onPress &&
        t.content !== CHAT_FOLD_OPEN &&
        t.content !== CHAT_FOLD_SHUT,
    );

    // trade is hidden until it is scoped (Nick, 2026-11-03)
    expect(toggles.map((t) => t.content)).toEqual([
      "Area",
      "World",
      "Party",
      "Whisper",
    ]);
    expect(toggles.map((t) => t.color)).toEqual(
      [
        palette.chatArea,
        palette.chatWorld,
        palette.chatParty,
        palette.chatWhisper,
      ].map(toCss),
    );
    expect(toggles.every((t) => t.alpha === 1)).toBe(true);
    const xs = toggles.map((t) => t.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it("should hide a channel's lines when its toggle is pressed, dim the toggle, and bring them back on the next press", () => {
    const s = rig();
    s.say("in town");
    s.say("far away", { channel: "world" });

    toggleOf(s, "Area").onPress!();
    expect(s.contents()).toEqual(["far away"]);
    expect(toggleOf(s, "Area").alpha).toBeLessThan(1);
    expect(s.store.getState().lines).toHaveLength(2);

    toggleOf(s, "Area").onPress!();
    expect(s.contents()).toEqual(["in town", "far away"]);
    expect(toggleOf(s, "Area").alpha).toBe(1);
  });

  it("should draw the toggles as the store holds them when built", () => {
    const store = createChatStore();
    store.getState().toggleChannel("world");
    const s = fakeScene();
    new ChatWindow(s.scene, store, X, BOTTOM);

    expect(toggleOf(s, "World").alpha).toBeLessThan(1);
    expect(toggleOf(s, "Area").alpha).toBe(1);
  });

  it("should not move a scrolled-back view when a hidden channel's line arrives", () => {
    const s = rig();
    for (let i = 1; i <= 12; i++) s.say(`l${i}`);
    toggleOf(s, "World").onPress!();
    const frame = chatWindowFrame(X, BOTTOM);
    s.wheel(frame.messages.x + 20, frame.messages.y + 20, -100);
    const held = s.contents();

    s.say("ignored", { channel: "world" });

    expect(s.contents()).toEqual(held);
  });

  it("should go back to following the newest lines when a toggle is pressed", () => {
    const s = rig();
    for (let i = 1; i <= 12; i++) s.say(`l${i}`);
    const frame = chatWindowFrame(X, BOTTOM);
    s.wheel(frame.messages.x + 20, frame.messages.y + 20, -100);

    toggleOf(s, "Whisper").onPress!();

    expect(s.contents().at(-1)).toBe("l12");
  });
});

describe("ChatWindow covers (R31)", () => {
  it("should say a point inside the panel is its own and one beside it is not", () => {
    const { window } = rig();
    const panel = chatWindowFrame(X, BOTTOM).panel;

    expect(window.covers(panel.x + 5, panel.y + 5)).toBe(true);
    expect(window.covers(panel.x + panel.width + 5, panel.y + 5)).toBe(false);
    expect(window.covers(panel.x + 5, panel.y - 5)).toBe(false);
  });
});

// ── The look, the picker and folding (I-WJGFJ-6, FS-WJGFJ Amendment 2026-10-31) ─────────────

const foldButtonOf = (s: ReturnType<typeof fakeScene>) => {
  const t = s
    .shown()
    .find((x) => x.content === CHAT_FOLD_OPEN || x.content === CHAT_FOLD_SHUT);
  expect(t, "a fold button").toBeDefined();
  return t!;
};

/** A whole click on the fold button: the press, then the release over it. */
const clickFold = (s: ReturnType<typeof fakeScene>) => {
  const button = foldButtonOf(s);
  button.onPress?.();
  button.onRelease?.();
};

describe("ChatWindow folding", () => {
  // asked 2026-11-02 (Nick): folding on the press shrank the window before the scene's attack
  // handler asked whether the press was the window's, so the press at the old corner attacked.
  it("should fold on the release, so the press at the corner is still the window's", () => {
    const s = rig();
    const button = foldButtonOf(s);
    const corner = chatFoldButton(chatWindowFrame(X, BOTTOM));

    button.onPress?.();

    expect(s.store.getState().folded).toBe(false);
    expect(s.window.covers(corner.x + 2, corner.y + 2)).toBe(true);

    button.onRelease!();
    expect(s.store.getState().folded).toBe(true);
  });

  it("should fold down to the input row and stop drawing lines and tabs, then unfold", () => {
    const s = rig();
    s.say("hello");

    clickFold(s);

    expect(s.store.getState().folded).toBe(true);
    expect(s.messageTexts()).toHaveLength(0);
    expect(s.shown().some((t) => t.content === "Area")).toBe(false);
    expect(
      s.window.covers(X + 5, chatWindowFrame(X, BOTTOM).messages.y + 5),
    ).toBe(false);
    expect(
      s.window.covers(X + 5, chatWindowFrame(X, BOTTOM, true).input.y + 5),
    ).toBe(true);

    clickFold(s);
    expect(s.store.getState().folded).toBe(false);
    expect(s.contents()).toEqual(["hello"]);
  });

  it("should stay folded when a line arrives", () => {
    const s = rig();
    clickFold(s);

    s.say("while folded");

    expect(s.store.getState().folded).toBe(true);
    expect(s.messageTexts()).toHaveLength(0);
  });

  it("should open folded when the store says so", () => {
    const store = createChatStore();
    store.getState().toggleFolded();
    const s = fakeScene();
    new ChatWindow(s.scene, store, X, BOTTOM);

    expect(foldButtonOf(s).content).toBe(CHAT_FOLD_SHUT);
  });
});

describe("ChatWindow picker wiring", () => {
  it("should hand a picked channel to the input", () => {
    const { field } = inputRig();
    field().value = "hi";
    field().events!.picked("whisper");
    expect(field().channel).toBe("whisper");
    expect(field().value).toBe("@hi");

    // trade is not open yet: the picker falls back to the draft's channel and leaves it untouched
    field().events!.picked("trade");
    expect(field().channel).toBe("whisper");
    expect(field().value).toBe("@hi");
  });
});

// ── Clicking back into the game (asked 2026-10-31) ──────────────────────────────────────────
// Phaser prevents the default on a canvas mousedown, so the browser never moves focus off the
// text field by itself: the window lets go of it on any press outside the panel.

describe("ChatWindow letting go of the input on a press in the world", () => {
  it("should close the input, keep the draft and give the keyboard back on a press outside the panel", () => {
    const { press, field, keys, window, input } = inputRig();
    press("ENTER");
    field().value = "half a thought";

    const panel = chatWindowFrame(X, BOTTOM).panel;
    input.emit("pointerdown", {
      x: panel.x + panel.width + 100,
      y: panel.y - 50,
    });

    expect(field().focused).toBe(false);
    expect(window.isTyping()).toBe(false);
    expect(keys.enabled).toBe(true);
    expect(field().value).toBe("half a thought");
  });

  it("should keep typing through a press on the panel itself, such as a tab", () => {
    const { press, field, window, input } = inputRig();
    press("ENTER");

    const frame = chatWindowFrame(X, BOTTOM);
    input.emit("pointerdown", {
      x: frame.filterRow.x + 10,
      y: frame.filterRow.y + 5,
    });

    expect(field().focused).toBe(true);
    expect(window.isTyping()).toBe(true);
  });

  it("should do nothing on a press while not typing, and stop listening once destroyed", () => {
    const { field, input, window } = inputRig();
    input.emit("pointerdown", { x: 900, y: 50 });
    expect(field().focused).toBe(false);

    window.destroy();
    expect(input.listenerCount("pointerdown")).toBe(0);
  });
});

describe("ChatWindow fold button in the top-right corner (asked 2026-10-31)", () => {
  it("should sit in the tab row while unfolded and in the input row while folded", () => {
    const s = rig();
    const open = chatWindowFrame(X, BOTTOM);
    const button = foldButtonOf(s);
    expect(button.y).toBeGreaterThanOrEqual(open.filterRow.y - 4);
    expect(button.y).toBeLessThan(open.filterRow.y + open.filterRow.height);
    expect(button.x).toBeGreaterThan(open.panel.x + open.panel.width - 30);

    clickFold(s);

    const shut = chatWindowFrame(X, BOTTOM, true);
    const folded = foldButtonOf(s);
    expect(folded.y).toBeGreaterThanOrEqual(shut.input.y - 4);
    expect(folded.y).toBeLessThan(shut.input.y + shut.input.height);
  });

  it("should give the text field the whole input row while unfolded, and leave the button room while folded", () => {
    const { field, window } = inputRig();
    const open = chatWindowFrame(X, BOTTOM);
    expect(field().rect).toEqual(open.input);

    (
      window as unknown as { store: { getState(): { toggleFolded(): void } } }
    ).store
      .getState()
      .toggleFolded();

    const shut = chatWindowFrame(X, BOTTOM, true);
    expect(field().rect).toEqual({
      ...shut.input,
      width: shut.input.width - CHAT_FOLD_W,
    });
  });
});

describe("ChatWindow unfolding to type (asked 2026-10-31)", () => {
  it("should unfold when the input opens while folded, and stay unfolded after sending", () => {
    const { press, field, store } = inputRig();
    store.getState().toggleFolded();

    press("ENTER");

    expect(store.getState().folded).toBe(false);
    expect(field().focused).toBe(true);
    expect(field().rect).toEqual(chatWindowFrame(X, BOTTOM).input);

    field().value = "hi";
    field().events!.keyDown("Enter", false);
    expect(store.getState().folded).toBe(false);
  });

  it("should leave the fold alone when the input opens while unfolded", () => {
    const { press, store } = inputRig();
    press("ENTER");
    expect(store.getState().folded).toBe(false);
  });
});

describe("ChatWindow fold button size (asked 2026-10-31)", () => {
  it("should draw the fold glyph a little larger than the words, folded and unfolded", () => {
    const s = rig();
    const words = 13;
    expect(parseInt(foldButtonOf(s).fontSize ?? "0", 10)).toBeGreaterThan(
      words,
    );

    const open = parseInt(foldButtonOf(s).fontSize ?? "0", 10);

    clickFold(s);
    // folded, the up glyph draws a size larger still: it reads small in the body face
    expect(parseInt(foldButtonOf(s).fontSize ?? "0", 10)).toBeGreaterThan(open);
  });
});

// ── Opaque while typing, see-through while idle (asked 2026-10-31) ─────────────────────────

describe("ChatWindow opacity", () => {
  // the carved panel's main ground is drawn at 0.97 of the window's opacity
  const groundAlpha = (s: ReturnType<typeof inputRig>) => {
    const live = s.panels.filter((p) => !p.destroyed)[0]!;
    return live.fills.find(
      ([colour]) => colour === shade(BARROW_HEX.charcoal, 0.2),
    )![1];
  };

  it("should be see-through while open and idle, solid while the player types, and see-through again after", () => {
    const s = inputRig();
    const idle = groundAlpha(s);
    expect(idle).toBeLessThan(0.7);

    s.press("ENTER");
    expect(groundAlpha(s)).toBeCloseTo(0.97);

    s.field().focused = false;
    s.field().events!.blurred();
    expect(groundAlpha(s)).toBeCloseTo(idle);
  });

  it("should not redraw the panel on every keystroke", () => {
    const s = inputRig();
    s.press("ENTER");
    const live = s.panels.filter((p) => !p.destroyed)[0]!;
    const before = live.fills.length;

    s.field().value = "abc";
    s.field().events!.typed(false);

    expect(live.fills.length).toBe(before);
  });
});

// ── The scrollbar (asked 2026-10-31) ────────────────────────────────────────────────────────

describe("ChatWindow under a panel drawn over it (the letter panel, FS-1GZGD R40)", () => {
  const frame = chatWindowFrame(X, BOTTOM);
  const track = chatScrollTrack(frame);
  const overMessages = { x: frame.messages.x + 20, y: frame.messages.y + 20 };

  function covered() {
    const store = createChatStore();
    const s = fakeScene();
    let over = true;
    new ChatWindow(s.scene, store, X, BOTTOM, { coveredAt: () => over });
    for (let i = 1; i <= 20; i++) store.getState().receive(stamped(`l${i}`));
    const contents = () =>
      s.messageTexts().map((t) => t.content.replace(/^Wren: /, ""));
    return { ...s, contents, uncover: () => (over = false) };
  }

  it("should not scroll the lines on a wheel under the panel", () => {
    const s = covered();
    const before = s.contents();
    s.wheel(overMessages.x, overMessages.y, -100);
    expect(s.contents()).toEqual(before);

    s.uncover();
    s.wheel(overMessages.x, overMessages.y, -100);
    expect(s.contents()).not.toEqual(before);
  });

  it("should not grab the scrollbar on a press under the panel", () => {
    const s = covered();
    const before = s.contents();
    const midX = track.x + track.width / 2;
    s.input.emit("pointerdown", { x: midX, y: track.y + 1 });
    s.input.emit("pointermove", { x: midX, y: track.y + 1 });
    s.input.emit("pointerup", { x: midX, y: track.y + 1 });
    expect(s.contents()).toEqual(before);
  });
});

describe("ChatWindow keeping the draft when the letter panel takes the keys (FS-1GZGD R40)", () => {
  it("should keep the draft and give it back once the panel closes", () => {
    let panelOpen = false;
    const store = createChatStore();
    const s = fakeScene();
    const fields: { value: string; visible: boolean }[] = [];
    new ChatWindow(s.scene, store, X, BOTTOM, {
      input: {
        mayOpen: () => !panelOpen,
        keepsDraft: () => panelOpen,
        send: () => undefined,
        makeField: (_scene, _rect, events) => {
          const f = { value: "", visible: false };
          fields.push(f);
          return {
            get value() {
              return f.value;
            },
            set value(v: string) {
              f.value = v;
            },
            channel: "area",
            focus: () => events.focused(),
            blur: () => events.blurred(),
            moveTo: () => undefined,
            show: () => void (f.visible = true),
            hide: () => void (f.visible = false),
            destroy: () => undefined,
          };
        },
      },
    });
    s.press("ENTER");
    fields[0].value = "half a thought";

    panelOpen = true;
    s.frame();
    expect(fields[0].visible).toBe(false);
    expect(fields[0].value).toBe("half a thought");

    panelOpen = false;
    s.frame();
    expect(fields[0].visible).toBe(true);
    expect(fields[0].value).toBe("half a thought");
  });
});

describe("ChatWindow scrollbar", () => {
  const frame = chatWindowFrame(X, BOTTOM);
  const track = chatScrollTrack(frame);
  const midX = track.x + track.width / 2;

  function filled(n: number) {
    const s = rig();
    for (let i = 1; i <= n; i++) s.say(`l${i}`);
    return s;
  }

  it("should jump to the oldest lines on a press at the track's head", () => {
    const s = filled(20);
    s.input.emit("pointerdown", { x: midX, y: track.y + 1 });
    s.input.emit("pointerup", { x: midX, y: track.y + 1 });
    expect(s.contents()).toEqual([
      "l1",
      "l2",
      "l3",
      "l4",
      "l5",
      "l6",
      "l7",
      "l8",
    ]);
  });

  it("should follow a dragged thumb up and back down to the newest", () => {
    const s = filled(20);
    const thumb = chatScrollThumb(track, 20, 0)!;
    const grabY = thumb.y + thumb.height / 2;

    s.input.emit("pointerdown", { x: midX, y: grabY });
    s.input.emit("pointermove", { x: midX + 40, y: track.y - 100 });
    expect(s.contents()[0]).toBe("l1");

    s.input.emit("pointermove", { x: midX, y: track.y + track.height + 100 });
    expect(s.contents().at(-1)).toBe("l20");
    s.input.emit("pointerup", { x: midX, y: 0 });

    // released: moving the pointer scrolls nothing
    s.input.emit("pointermove", { x: midX, y: track.y - 100 });
    expect(s.contents().at(-1)).toBe("l20");
  });

  it("should leave the lines' wheel and the world's presses alone while nothing scrolls", () => {
    const s = filled(3);
    s.input.emit("pointerdown", { x: midX, y: track.y + 1 });
    expect(s.contents()).toEqual(["l1", "l2", "l3"]);
  });

  it("should stop listening to the pointer once destroyed", () => {
    const s = filled(20);
    s.window.destroy();
    expect(s.input.listenerCount("pointermove")).toBe(0);
    expect(s.input.listenerCount("pointerup")).toBe(0);
  });
});

// ── The mask a drawn line wears must be alive (the freeze on cmd-tab, 2026-10-31) ──────────
// Phaser's GeometryMask.destroy nulls its graphics, and the next render of any text still
// wearing it dereferences that null: the render loop throws and the whole game stops. The window
// rebuilt its mask on every panel redraw, including the opacity flip when the input lost focus,
// without re-dressing the lines already drawn.

describe("ChatWindow mask lifetime", () => {
  const liveMasks = (s: ReturnType<typeof inputRig>) =>
    s.messageTexts().every((t) => t.mask !== undefined && !t.mask.destroyed);

  it("should leave every drawn line wearing a live mask after the input gains and loses focus", () => {
    const s = inputRig();
    s.store.getState().receive(stamped("one"));
    s.store.getState().receive(stamped("two"));
    expect(liveMasks(s)).toBe(true);

    s.press("ENTER");
    expect(liveMasks(s)).toBe(true);

    // cmd-tab away: the browser blurs the field without a press anywhere
    s.field().focused = false;
    s.field().events!.blurred();
    expect(liveMasks(s)).toBe(true);
  });

  it("should leave every drawn line wearing a live mask after a toggle and a fold round trip", () => {
    const s = rig();
    for (let i = 1; i <= 12; i++) s.say(`l${i}`);

    toggleOf(s, "World").onPress!();
    expect(s.messageTexts().every((t) => t.mask && !t.mask.destroyed)).toBe(
      true,
    );

    clickFold(s);
    clickFold(s);
    expect(s.messageTexts().every((t) => t.mask && !t.mask.destroyed)).toBe(
      true,
    );
  });
});

// ── The DOM row shows only while typing (review 2026-10-31: Phaser's DOM layer always sits above
// the canvas, so a visible field would draw over the end-of-run card and the overlays) ───────

describe("ChatWindow DOM row visibility", () => {
  // the row is shown idle and typing alike (asked 2026-10-31: one look, no jump), and hidden only
  // while something else owns the keys, since the DOM layer always draws above the canvas
  it("should show the row as soon as the window is built, whatever the field started as, and keep it through typing and closing", () => {
    const { press, field, window } = inputRig();
    expect(field().visible).toBe(true);

    press("ENTER");
    expect(field().visible).toBe(true);

    field().events!.keyDown("Escape", false);
    expect(field().visible).toBe(true);
    expect(window.isTyping()).toBe(false);
  });

  it("should hide the row while an overlay owns the keys, dropping a half-typed line, and show it again after", () => {
    let overlay = false;
    const s = inputRig(() => !overlay);
    s.press("ENTER");
    s.field().value = "half";

    overlay = true;
    s.frame();
    expect(s.field().visible).toBe(false);
    expect(s.window.isTyping()).toBe(false);
    expect(s.field().value).toBe("");

    overlay = false;
    s.frame();
    expect(s.field().visible).toBe(true);
  });

  it("should stop watching the keys once destroyed", () => {
    const s = inputRig();
    s.window.destroy();
    expect(s.events.listenerCount("postupdate")).toBe(0);
  });
});

describe("ChatWindow scrolled-back offset at a full buffer (review 2026-10-31)", () => {
  it("should keep showing eight lines when lines arrive into a full channel while scrolled to the oldest", () => {
    const s = rig();
    for (let i = 1; i <= 100; i++) s.say(`l${i}`);
    const frame = chatWindowFrame(X, BOTTOM);
    for (let i = 0; i < 200; i++)
      s.wheel(frame.messages.x + 20, frame.messages.y + 20, -100);
    expect(s.contents()[0]).toBe("l1");

    for (let i = 101; i <= 110; i++) s.say(`l${i}`);

    expect(s.contents()).toHaveLength(CHAT_VISIBLE_LINES);
    expect(s.contents()[0]).toBe("l11");
  });
});

describe("ChatWindow built under an overlay (code review 2026-10-31)", () => {
  it("should never show the row, not even for a frame, when built while something else owns the keys", () => {
    const { field } = inputRig(() => false);
    expect(field().visible).toBe(false);
  });
});

describe("ChatWindow world lines (FS-5SH4G C15, I-5SH4G-3)", () => {
  it("should draw a world line in the world colour and hide it with the World tab", () => {
    const s = rig();
    s.say("hello every village", { channel: "world" });

    const [line] = s.messageTexts();
    expect(line.color).toBe(toCss(palette.chatWorld));

    toggleOf(s, "World").onPress!();
    expect(s.messageTexts()).toHaveLength(0);
    expect(s.store.getState().lines).toHaveLength(1);
  });
});

// FS-KCQ06 C15, I-KCQ06-4: a sender's name in a drawn line is a hit area as wide as the name is
// drawn; a click on it (on the release) fills `@Name ` and opens the input. The stand-in font draws
// every character 7px wide and every line 18px tall.
describe("ChatWindow clicking a name (FS-KCQ06 C15)", () => {
  const CHAR = 7;
  const whisper = {
    channel: "whisper" as const,
    scope: "p-kaelen",
    target_id: "p-kaelen",
    target_name: "Kaelen",
  };
  const click = (s: ReturnType<typeof inputRig>, x: number, y: number) => {
    s.input.emit("pointerdown", { x, y });
    s.input.emit("pointerup", { x, y });
  };
  /** The point in the middle of characters `from`..`to` of a drawn line. */
  const at = (t: FakeText, from: number, to: number) =>
    [t.x + ((from + to) / 2) * CHAR, t.y + 9] as const;

  it("should fill @Name and one space, pick whisper and focus the input when the sender's name is clicked", () => {
    const s = inputRig(
      () => true,
      () => "p-me",
    );
    s.store.getState().receive(stamped("well met"));

    const [line] = s.messageTexts();
    click(s, ...at(line, 0, "Wren".length));

    expect(s.field().value).toBe("@Wren ");
    expect(s.field().channel).toBe("whisper");
    expect(s.field().focused).toBe(true);
    expect(s.window.isTyping()).toBe(true);
  });

  it.each(["world", "party"] as const)(
    "should take a click on the sender's name in a %s line too",
    (channel) => {
      const s = inputRig(
        () => true,
        () => "p-me",
      );
      s.store.getState().receive(stamped("well met", { channel }));

      click(s, ...at(s.messageTexts()[0], 0, 4));

      expect(s.field().value).toBe("@Wren ");
    },
  );

  it("should fill the target of a To Name echo, and the sender of a From Name whisper", () => {
    const s = inputRig(
      () => true,
      () => "p-wren",
    );
    s.store
      .getState()
      .receive(stamped("ho there", { ...whisper, sender_id: "p-wren" }));
    s.store.getState().receive(
      stamped("well met", {
        ...whisper,
        sender_id: "p-orla",
        sender_name: "Orla",
        scope: "p-wren",
        target_id: "p-wren",
        target_name: "Wren",
      }),
    );
    const [echo, received] = s.messageTexts();
    expect(echo.content).toBe("To Kaelen: ho there");
    expect(received.content).toBe("From Orla: well met");

    click(s, ...at(echo, "To ".length, "To Kaelen".length));
    expect(s.field().value).toBe("@Kaelen ");

    click(s, ...at(received, "From ".length, "From Orla".length));
    expect(s.field().value).toBe("@Orla ");
  });

  it("should do nothing for a click on the line outside the name", () => {
    const s = inputRig(
      () => true,
      () => "p-me",
    );
    s.store.getState().receive(stamped("well met"));
    s.store.getState().receive(
      stamped("hi", {
        ...whisper,
        sender_id: "p-kaelen",
        sender_name: "Kaelen",
      }),
    );
    const [area, received] = s.messageTexts();

    click(s, ...at(area, "Wren: ".length, "Wren: well met".length));
    // the From before a whisper's name is the line's, not the name's
    click(s, ...at(received, 0, "From".length));

    expect(s.field().value).toBe("");
    expect(s.field().focused).toBe(false);
  });

  it("should do nothing for a click on this player's own name", () => {
    const s = inputRig(
      () => true,
      () => "s",
    );
    s.store.getState().receive(stamped("well met"));

    click(s, ...at(s.messageTexts()[0], 0, 4));

    expect(s.field().value).toBe("");
    expect(s.field().focused).toBe(false);
  });

  it("should act on the release, not the press, and only when both land on the name", () => {
    const s = inputRig(
      () => true,
      () => "p-me",
    );
    s.store.getState().receive(stamped("well met"));
    const [line] = s.messageTexts();
    const [nx, ny] = at(line, 0, 4);

    s.input.emit("pointerdown", { x: nx, y: ny });
    expect(s.field().value).toBe("");
    expect(s.field().focused).toBe(false);
    // pressed on the name, let go on the line's words
    s.input.emit("pointerup", { x: nx + 10 * CHAR, y: ny });
    expect(s.field().value).toBe("");

    // pressed on the words, let go on the name
    s.input.emit("pointerdown", { x: nx + 10 * CHAR, y: ny });
    s.input.emit("pointerup", { x: nx, y: ny });
    expect(s.field().value).toBe("");
  });

  it("should replace the draft's prefix and keep its words", () => {
    const s = inputRig(
      () => true,
      () => "p-me",
    );
    s.store.getState().receive(stamped("well met"));
    s.field().value = "#selling a blade";
    s.field().events!.typed(false);

    click(s, ...at(s.messageTexts()[0], 0, 4));

    expect(s.field().value).toBe("@Wren selling a blade");
  });

  it("should keep the player typing when they click a name while the input is open", () => {
    const s = inputRig(
      () => true,
      () => "p-me",
    );
    s.store.getState().receive(stamped("well met"));
    s.press("ENTER");
    s.field().value = "hi";
    s.field().events!.typed(false);

    click(s, ...at(s.messageTexts()[0], 0, 4));

    expect(s.window.isTyping()).toBe(true);
    expect(s.field().focused).toBe(true);
    expect(s.field().value).toBe("@Wren hi");
  });

  it("should do nothing while something else owns the keys", () => {
    const s = inputRig(
      () => false,
      () => "p-me",
    );
    s.store.getState().receive(stamped("well met"));

    click(s, ...at(s.messageTexts()[0], 0, 4));

    expect(s.field().value).toBe("");
    expect(s.field().focused).toBe(false);
  });

  it("should follow the lines as they move: a scrolled line's name is where it is drawn now", () => {
    const s = inputRig(
      () => true,
      () => "p-me",
    );
    s.store.getState().receive(stamped("first", { sender_name: "Orla" }));
    s.store.getState().receive(stamped("second"));
    const [, second] = s.messageTexts();
    const [x, y] = at(second, 0, 4);
    s.store.getState().receive(stamped("third", { sender_name: "Brann" }));

    // "second" moved up a line; what is drawn at its old place now is Brann's line
    click(s, x, y);

    expect(s.field().value).toBe("@Brann ");
  });

  it("should not take a click on a name cut off above the message area", () => {
    // the oldest line wraps so tall its first row sits under the tab row
    const tall = (content: string) => (content.startsWith("Orla:") ? 200 : 18);
    const s = inputRig(
      () => true,
      () => "p-me",
      tall,
    );
    s.store.getState().receive(stamped("a long tale", { sender_name: "Orla" }));
    s.store.getState().receive(stamped("hi"));
    const orla = s.shown().find((t) => t.content.startsWith("Orla:"))!;
    const m = chatWindowFrame(X, BOTTOM).messages;
    expect(orla.y).toBeLessThan(m.y);

    click(s, orla.x + 2 * CHAR, orla.y + 9);

    expect(s.field().value).toBe("");
  });

  it("should draw no hit areas while folded", () => {
    const s = inputRig(
      () => true,
      () => "p-me",
    );
    s.store.getState().receive(stamped("well met"));
    const [x, y] = at(s.messageTexts()[0], 0, 4);
    s.store.getState().toggleFolded();

    click(s, x, y);

    expect(s.field().value).toBe("");
  });
});
