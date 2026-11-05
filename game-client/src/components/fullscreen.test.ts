import { describe, expect, it, vi } from "vitest";
import {
  fullscreenLabel,
  handBackFocus,
  keepFromGame,
  fullscreenOf,
  type FullscreenDocument,
  type FullscreenFrame,
} from "./fullscreen";

type Listener = () => void;

/** A document whose fullscreen state the test drives, as the browser would. */
function fakeDocument(
  api: Partial<FullscreenDocument> = { fullscreenEnabled: true },
) {
  const listeners = new Map<string, Set<Listener>>();
  const doc: FullscreenDocument = {
    fullscreenElement: null,
    ...api,
    addEventListener(type: string, fn: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: Listener) {
      listeners.get(type)?.delete(fn);
    },
  };
  /** The browser changes state (the button, Esc, its own UI) and says so. */
  const become = (element: unknown, event = "fullscreenchange") => {
    if ("webkitFullscreenEnabled" in api && !("fullscreenEnabled" in api))
      doc.webkitFullscreenElement = element;
    else doc.fullscreenElement = element;
    for (const fn of [...(listeners.get(event) ?? [])]) fn();
  };
  const listening = () =>
    [...listeners.values()].reduce((n, set) => n + set.size, 0);
  return { doc, become, listening };
}

const FRAME = { id: "game-frame" };

// FS-ZAJMH §E R23: where the Fullscreen API is unavailable (iPhone Safari) there is no button.
describe("fullscreenOf: is there a fullscreen to offer", () => {
  it.each([
    ["no API at all", {}],
    [
      "the API, switched off (a permission policy, an iframe)",
      { fullscreenEnabled: false },
    ],
    ["only the webkit API, switched off", { webkitFullscreenEnabled: false }],
  ])("should offer none with %s", (_, api) => {
    expect(fullscreenOf(fakeDocument(api).doc)).toBeNull();
  });

  it.each([
    ["the standard API", { fullscreenEnabled: true }],
    [
      "only the webkit-prefixed API (older Safari, iPad)",
      { webkitFullscreenEnabled: true },
    ],
  ])("should offer one with %s", (_, api) => {
    expect(fullscreenOf(fakeDocument(api).doc)).not.toBeNull();
  });
});

// R20: the button's state follows the document's real fullscreen state, not a local toggle.
describe("fullscreen state", () => {
  it("should read windowed until something is fullscreen, then fullscreen", () => {
    const { doc, become } = fakeDocument();
    const fs = fullscreenOf(doc)!;
    expect(fs.active()).toBe(false);
    become(FRAME);
    expect(fs.active()).toBe(true);
    become(null);
    expect(fs.active()).toBe(false);
  });

  it("should read the webkit-prefixed state where that is all there is", () => {
    const { doc, become } = fakeDocument({ webkitFullscreenEnabled: true });
    const fs = fullscreenOf(doc)!;
    become(FRAME, "webkitfullscreenchange");
    expect(fs.active()).toBe(true);
  });

  it.each(["fullscreenchange", "webkitfullscreenchange"])(
    "should tell the watcher on %s, by whatever route fullscreen was left",
    (event) => {
      const { doc, become } = fakeDocument();
      const fs = fullscreenOf(doc)!;
      let heard = 0;
      fs.watch(() => heard++);
      become(FRAME, event);
      become(null, event); // Esc, the browser's own UI, or the button: one event all the same
      expect(heard).toBe(2);
    },
  );

  it("should stop telling the watcher once stopped", () => {
    const { doc, become, listening } = fakeDocument();
    const fs = fullscreenOf(doc)!;
    let heard = 0;
    const stop = fs.watch(() => heard++);
    stop();
    become(FRAME);
    expect(heard).toBe(0);
    expect(listening()).toBe(0);
  });
});

// R18: in windowed it reads 全螢幕; in fullscreen the same control reads 縮小 / exit fullscreen.
describe("fullscreenLabel", () => {
  it("should flip with the state, with a name for each", () => {
    expect(fullscreenLabel(false)).toEqual({
      name: "全螢幕 / enter fullscreen",
    });
    expect(fullscreenLabel(true)).toEqual({
      name: "縮小 / exit fullscreen",
    });
  });
});

/** A frame that records what was asked of it; `refuse` makes the browser say no. */
function fakeFrame(refuse = false) {
  const asked: string[] = [];
  const frame: FullscreenFrame = {
    requestFullscreen: () => {
      asked.push("request");
      return refuse
        ? Promise.reject(new TypeError("Permissions check failed"))
        : Promise.resolve();
    },
  };
  return { frame, asked };
}

// R18, R19: the button enters fullscreen on the whole game frame, and in fullscreen leaves it.
describe("fullscreen toggle", () => {
  it("should ask for fullscreen on the game frame while windowed", async () => {
    const { doc } = fakeDocument();
    const { frame, asked } = fakeFrame();
    await fullscreenOf(doc)!.toggle(frame);
    expect(asked).toEqual(["request"]);
  });

  it("should leave fullscreen while fullscreen, without asking the frame again", async () => {
    const exits: string[] = [];
    const { doc, become } = fakeDocument({
      fullscreenEnabled: true,
      exitFullscreen: () => {
        exits.push("exit");
        return Promise.resolve();
      },
    });
    const { frame, asked } = fakeFrame();
    become(FRAME);
    await fullscreenOf(doc)!.toggle(frame);
    expect(exits).toEqual(["exit"]);
    expect(asked).toEqual([]);
  });

  it("should use the webkit-prefixed calls where those are all there are", async () => {
    const calls: string[] = [];
    const { doc, become } = fakeDocument({
      webkitFullscreenEnabled: true,
      webkitExitFullscreen: () => void calls.push("webkitExit"),
    });
    const frame: FullscreenFrame = {
      webkitRequestFullscreen: () => void calls.push("webkitRequest"),
    };
    const fs = fullscreenOf(doc)!;
    await fs.toggle(frame);
    become(FRAME, "webkitfullscreenchange");
    await fs.toggle(frame);
    expect(calls).toEqual(["webkitRequest", "webkitExit"]);
  });

  // R23: a refused request leaves the page windowed, and nothing is thrown at the player.
  it("should stay windowed and throw nothing when the browser refuses", async () => {
    const { doc } = fakeDocument();
    const { frame } = fakeFrame(true);
    const fs = fullscreenOf(doc)!;
    await expect(fs.toggle(frame)).resolves.toBeUndefined();
    expect(fs.active()).toBe(false);
  });

  it("should do nothing without a frame to put on screen", async () => {
    const { doc } = fakeDocument();
    await expect(fullscreenOf(doc)!.toggle(null)).resolves.toBeUndefined();
  });
});

/** An element that records its listeners, and an event that records whether it was stopped. */
function fakeElement() {
  const listeners = new Map<string, Set<(e: never) => void>>();
  const el = {
    addEventListener(type: string, fn: (e: never) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: (e: never) => void) {
      listeners.get(type)?.delete(fn);
    },
  };
  /** Fires `type` at the element; true when the event was kept from bubbling on to the game. */
  const fire = (type: string, key?: string) => {
    let stopped = false;
    const event = { type, key, stopPropagation: () => (stopped = true) };
    for (const fn of [...(listeners.get(type) ?? [])]) fn(event as never);
    return stopped;
  };
  const listening = () =>
    [...listeners.values()].reduce((n, set) => n + set.size, 0);
  return { el, fire, listening };
}

// R22: Phaser hears the mouse and touch on window as well as the canvas (a press that ends off
// the canvas is still a pointer-up), and the keyboard on window. A press on the button stops at it.
describe("keepFromGame", () => {
  it.each([
    "pointerdown",
    "pointerup",
    "mousedown",
    "mouseup",
    "touchstart",
    "touchend",
  ])("should keep the button's %s from the game", (type) => {
    const { el, fire } = fakeElement();
    keepFromGame(el);
    expect(fire(type)).toBe(true);
  });

  it.each(["Enter", " "])(
    "should keep the key that presses the button (%j) from the game",
    (key) => {
      const { el, fire } = fakeElement();
      keepFromGame(el);
      expect(fire("keydown", key)).toBe(true);
      expect(fire("keyup", key)).toBe(true);
    },
  );

  it("should let every other key through to the game, focused or not", () => {
    const { el, fire } = fakeElement();
    keepFromGame(el);
    expect(fire("keydown", "w")).toBe(false);
    expect(fire("keydown", "Escape")).toBe(false);
  });

  // React hears the click at the root: stopping it would stop the button itself
  it("should leave the click alone", () => {
    const { el, fire } = fakeElement();
    keepFromGame(el);
    expect(fire("click")).toBe(false);
  });

  it("should stop keeping once released", () => {
    const { el, listening } = fakeElement();
    const release = keepFromGame(el);
    release();
    expect(listening()).toBe(0);
  });
});

describe("handBackFocus (FS-ZAJMH R18, R22: keyboard-focusable, and no stolen game keys)", () => {
  const click = (detail: number) => {
    const blur = vi.fn();
    handBackFocus({ detail, currentTarget: { blur } });
    return blur;
  };

  it("should give focus back to the page after a mouse or touch press, so the game's keys are its own again", () => {
    expect(click(1)).toHaveBeenCalledTimes(1);
    expect(click(2)).toHaveBeenCalledTimes(1);
  });

  it("should keep focus on the button after Enter or Space, so a keyboard player is not lost", () => {
    expect(click(0)).not.toHaveBeenCalled();
  });
});
