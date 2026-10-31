import { EventEmitter } from "eventemitter3";
import { describe, expect, it } from "vitest";
import type Phaser from "phaser";
import { createChatStore, type ChatLinePayload } from "@/stores/chatStore";
import { palette, toCss } from "@/utils/canvasPalette";
import { ChatWindow } from "./ChatWindow";
import {
  CHAT_FOLD_OPEN,
  CHAT_FOLD_SHUT,
  CHAT_INPUT_HINT,
  CHAT_VISIBLE_LINES,
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
  destroyed: boolean;
  /** The handler a toggle registered for pointerdown, if it is interactive. */
  onPress?: () => void;
}

function fakeScene() {
  const texts: FakeText[] = [];
  const panels: {
    depth?: number;
    scroll?: number;
    destroyed: boolean;
    rects: number[][];
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
    };
    if (!masks) panels.push(g);
    const self: Record<string, unknown> = {
      setScrollFactor: (s: number) => ((g.scroll = s), self),
      setDepth: (d: number) => ((g.depth = d), self),
      clear: () => ((g.rects = []), self),
      fillStyle: () => self,
      lineStyle: () => self,
      fillRect: (...r: number[]) => (g.rects.push(r), self),
      strokeRect: () => self,
      lineBetween: () => self,
      createGeometryMask: () => ({ destroy: () => undefined }),
      destroy: () => void (g.destroyed = true),
    };
    return self;
  };
  const text = (
    x: number,
    y: number,
    content: string,
    style: { color?: string } = {},
  ) => {
    const t: FakeText = {
      content,
      color: style.color ?? "",
      x,
      y,
      height: 18,
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
        return self;
      },
      get width() {
        return t.content.length * 7;
      },
      setMask: () => self,
      setPosition: (nx: number, ny: number) => ((t.x = nx), (t.y = ny), self),
      destroy: () => void (t.destroyed = true),
      get height() {
        return t.height;
      },
    };
    return self;
  };

  const scene = {
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
  return { scene, shown, messageTexts, panels, input, keys, wheel, press };
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
    expect(panel.rects[0]).toEqual([
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
    const live = panels.filter((p) => !p.destroyed).at(-1)!;
    expect(live.rects[0]).toEqual([
      frame.panel.x,
      frame.panel.y,
      frame.panel.width,
      frame.panel.height,
    ]);
    const [line] = messageTexts(600);
    expect(line.y).toBeLessThan(600);
    expect(line.y).toBeGreaterThanOrEqual(frame.messages.y);
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
  channel: import("@/stores/chatStore").ChatChannel;
  focused: boolean;
  rect: { x: number; y: number; width: number; height: number };
  destroyed: boolean;
  events?: import("./chatEntryField").ChatEntryEvents;
}

function inputRig(mayOpen = () => true) {
  const store = createChatStore();
  const s = fakeScene();
  const fields: FakeField[] = [];
  const sent: unknown[] = [];
  const window = new ChatWindow(s.scene, store, X, BOTTOM, {
    input: {
      mayOpen,
      send: (line) => sent.push(line),
      makeField: (_scene, rect, events) => {
        const f: FakeField = {
          value: "",
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
          destroy: () => void (f.destroyed = true),
        };
      },
    },
  });
  const field = () => fields[0];
  const hint = () => s.shown().find((t) => t.content === CHAT_INPUT_HINT);
  return { ...s, store, window, field, sent, hint };
}

describe("ChatWindow input (C26: Enter opens, Enter sends)", () => {
  it("should place the field in the input row", () => {
    const { field } = inputRig();
    const frame = chatWindowFrame(X, BOTTOM);
    expect(field().rect).toEqual(frame.input);
  });

  it("should open on Enter in the scene, send the typed line on Enter in the field, and close", () => {
    const { press, field, sent, keys, window } = inputRig();

    press("ENTER");
    expect(field().focused).toBe(true);
    expect(keys.enabled).toBe(false);
    expect(window.isTyping()).toBe(true);

    field().value = "hello";
    field().events!.keyDown("Enter", false);

    expect(sent).toEqual([{ channel: "area", text: "hello" }]);
    expect(field().focused).toBe(false);
    expect(keys.enabled).toBe(true);
  });

  it("should not open on Enter while something else owns the keys", () => {
    const { press, field } = inputRig(() => false);
    press("ENTER");
    expect(field().focused).toBe(false);
  });

  it("should show the hint only while closed with nothing typed", () => {
    const { press, field, hint } = inputRig();
    expect(hint()).toBeDefined();

    press("ENTER");
    expect(hint()).toBeUndefined();

    field().value = "half";
    field().events!.typed(false);
    // a click elsewhere: the field loses focus, the draft stays
    field().focused = false;
    field().events!.blurred();
    expect(hint()).toBeUndefined();

    field().value = "";
    field().events!.typed(false);
    expect(hint()).toBeDefined();
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
  it("should draw five toggles in order in the filter row, each in its channel's colour, all on", () => {
    const { shown } = rig();
    const row = chatWindowFrame(X, BOTTOM).filterRow;

    const toggles = shown().filter(
      (t) => t.y >= row.y && t.y < row.y + row.height && t.onPress,
    );

    expect(toggles.map((t) => t.content)).toEqual([
      "Area",
      "World",
      "Party",
      "Whisper",
      "Trade",
    ]);
    expect(toggles.map((t) => t.color)).toEqual(
      [
        palette.chatArea,
        palette.chatWorld,
        palette.chatParty,
        palette.chatWhisper,
        palette.chatTrade,
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

    toggleOf(s, "Trade").onPress!();

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

describe("ChatWindow folding", () => {
  it("should fold down to the input row and stop drawing lines and tabs, then unfold", () => {
    const s = rig();
    s.say("hello");

    foldButtonOf(s).onPress!();

    expect(s.store.getState().folded).toBe(true);
    expect(s.messageTexts()).toHaveLength(0);
    expect(s.shown().some((t) => t.content === "Area")).toBe(false);
    expect(
      s.window.covers(X + 5, chatWindowFrame(X, BOTTOM).messages.y + 5),
    ).toBe(false);
    expect(
      s.window.covers(X + 5, chatWindowFrame(X, BOTTOM, true).input.y + 5),
    ).toBe(true);

    foldButtonOf(s).onPress!();
    expect(s.store.getState().folded).toBe(false);
    expect(s.contents()).toEqual(["hello"]);
  });

  it("should stay folded when a line arrives", () => {
    const s = rig();
    foldButtonOf(s).onPress!();

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
    field().events!.picked("world");
    // world is not open yet: the picker falls back to Area and the draft is untouched
    expect(field().channel).toBe("area");
    expect(field().value).toBe("hi");
  });
});
