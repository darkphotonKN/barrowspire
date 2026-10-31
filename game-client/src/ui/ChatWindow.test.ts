import { EventEmitter } from "eventemitter3";
import { describe, expect, it } from "vitest";
import type Phaser from "phaser";
import { createChatStore, type ChatLinePayload } from "@/stores/chatStore";
import { palette, toCss } from "@/utils/canvasPalette";
import { ChatWindow } from "./ChatWindow";
import { CHAT_VISIBLE_LINES, chatWindowFrame } from "./chatWindowLayout";

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
  destroyed: boolean;
}

function fakeScene() {
  const texts: FakeText[] = [];
  const panels: {
    depth?: number;
    scroll?: number;
    destroyed: boolean;
    rects: number[][];
  }[] = [];
  const input = new EventEmitter();

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
      destroyed: false,
    };
    texts.push(t);
    const self: Record<string, unknown> = {
      setScrollFactor: (s: number) => ((t.scroll = s), self),
      setDepth: (d: number) => ((t.depth = d), self),
      setOrigin: () => self,
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
  const wheel = (x: number, y: number, dy: number) =>
    input.emit("wheel", { x, y }, [], 0, dy);
  return { scene, shown, panels, input, wheel };
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
    s.shown().map((t) => t.content.replace(/^\d\d:\d\d {2}Wren: /, ""));
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

    const shown = s.shown();
    expect(
      shown.map(
        (t) => t.content.endsWith("first") || t.content.endsWith("second"),
      ),
    ).toEqual([true, true]);
    const [first, second] = shown;
    expect(first.y).toBeLessThan(second.y);
  });

  it("should draw a line the moment the store gets it, in its channel's colour, camera-fixed at HUD depth", () => {
    const { say, shown } = rig();

    say("hello");

    const [t] = shown();
    expect(t.content).toMatch(/^\d\d:\d\d {2}Wren: hello$/);
    expect(t.color).toBe(toCss(palette.chatArea));
    expect(t.scroll).toBe(0);
    expect(t.depth).toBe(1000);
  });

  it("should draw a notice as a dash and its words in the system colour", () => {
    const { store, shown } = rig();

    store
      .getState()
      .notice({
        code: "channel_closed",
        text: "That channel is not open yet.",
      });

    const [t] = shown();
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
    const { window, panels, say, shown } = rig();
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
    expect(shown()[0].y).toBeLessThan(600);
    expect(shown()[0].y).toBeGreaterThanOrEqual(frame.messages.y);
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
