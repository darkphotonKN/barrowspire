import { describe, expect, it, vi } from "vitest";
import {
  fullscreenOf,
  type FullscreenDocument,
  type FullscreenFrame,
  type KeyboardLock,
  keyboardLockOf,
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

/** A keyboard that records the Keyboard Lock calls; `refuse` makes `lock` reject, as a browser may. */
function fakeKeyboard(refuse = false) {
  const calls: string[] = [];
  const keyboard: KeyboardLock = {
    lock: (codes) => {
      calls.push(`lock ${codes.join(",")}`);
      return refuse
        ? Promise.reject(new DOMException("not top-level", "InvalidStateError"))
        : Promise.resolve();
    },
    unlock: () => void calls.push("unlock"),
  };
  return { keyboard, calls };
}

/** A frame the browser puts on screen when asked, as the button's own frame. */
function framedFullscreen(become: (element: unknown, event?: string) => void) {
  const frame: FullscreenFrame = {
    requestFullscreen: () => {
      become(FRAME);
      return Promise.resolve();
    },
  };
  return frame;
}

// R21 as amended 2026-11-06 (A16): in fullscreen entered by the button, Esc is the game's where
// the Keyboard Lock API exists; held Esc, the browser's own exit, still leaves.
describe("fullscreen Escape lock", () => {
  it("should lock Escape on entering fullscreen through the toggle", async () => {
    const { doc, become } = fakeDocument();
    const { keyboard, calls } = fakeKeyboard();
    const fs = fullscreenOf(doc, keyboard)!;
    await fs.toggle(framedFullscreen(become));
    expect(fs.active()).toBe(true);
    expect(calls).toEqual(["lock Escape"]);
  });

  it.each(["fullscreenchange", "webkitfullscreenchange"])(
    "should unlock once fullscreen is left by any route (%s: held Esc, the browser's UI)",
    async (event) => {
      const { doc, become, listening } = fakeDocument();
      const { keyboard, calls } = fakeKeyboard();
      const fs = fullscreenOf(doc, keyboard)!;
      await fs.toggle(framedFullscreen(become));
      become(null, event);
      expect(calls).toEqual(["lock Escape", "unlock"]);
      expect(listening()).toBe(0);
    },
  );

  it("should ask no lock when the browser refuses fullscreen", async () => {
    const { doc, listening } = fakeDocument();
    const { keyboard, calls } = fakeKeyboard();
    const fs = fullscreenOf(doc, keyboard)!;
    await fs.toggle(fakeFrame(true).frame);
    expect(fs.active()).toBe(false);
    expect(calls).toEqual([]);
    expect(listening()).toBe(0);
  });

  // A16: a rejected lock (not the top-level page, an insecure origin) leaves today's Esc
  it("should stay fullscreen, throw nothing and report nothing when the lock is refused", async () => {
    const { doc, become } = fakeDocument();
    const { keyboard } = fakeKeyboard(true);
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const warn = vi.spyOn(console, "warn");
    const error = vi.spyOn(console, "error");
    try {
      const fs = fullscreenOf(doc, keyboard)!;
      await expect(
        fs.toggle(framedFullscreen(become)),
      ).resolves.toBeUndefined();
      await new Promise((r) => setTimeout(r, 0));
      expect(fs.active()).toBe(true);
      expect(unhandled).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
      warn.mockRestore();
      error.mockRestore();
    }
  });

  // A16: Safari, Firefox: no Keyboard Lock, so the first Esc is the browser's as before
  it("should enter and leave fullscreen as before where there is no Keyboard Lock", async () => {
    const { doc, become, listening } = fakeDocument();
    const fs = fullscreenOf(doc, null)!;
    await fs.toggle(framedFullscreen(become));
    expect(fs.active()).toBe(true);
    expect(listening()).toBe(0);
    become(null);
    expect(fs.active()).toBe(false);
  });

  it("should not lock again when the toggle leaves fullscreen", async () => {
    const { doc, become } = fakeDocument({
      fullscreenEnabled: true,
      exitFullscreen: () => {
        become(null);
        return Promise.resolve();
      },
    });
    const { keyboard, calls } = fakeKeyboard();
    const fs = fullscreenOf(doc, keyboard)!;
    await fs.toggle(framedFullscreen(become));
    await fs.toggle(framedFullscreen(become));
    expect(fs.active()).toBe(false);
    expect(calls).toEqual(["lock Escape", "unlock"]);
  });

  // a lock that settles after fullscreen was already left must not stay behind it
  it("should unlock again when the lock settles after fullscreen was left", async () => {
    const { doc, become } = fakeDocument();
    let settle = () => {};
    const calls: string[] = [];
    const keyboard: KeyboardLock = {
      lock: () => {
        calls.push("lock");
        return new Promise<void>((r) => (settle = r));
      },
      unlock: () => void calls.push("unlock"),
    };
    const fs = fullscreenOf(doc, keyboard)!;
    await fs.toggle(framedFullscreen(become));
    become(null);
    settle();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toEqual(["lock", "unlock", "unlock"]);
  });
});

// A16: feature-detected as Chrome documents it, `'keyboard' in navigator && 'lock' in navigator.keyboard`
describe("keyboardLockOf", () => {
  it("should find the Keyboard Lock API where the navigator has one (Chrome, Edge)", () => {
    const keyboard = { lock: () => Promise.resolve(), unlock: () => {} };
    expect(keyboardLockOf({ keyboard })).toBe(keyboard);
  });

  it.each([
    ["no keyboard at all (Safari, Firefox)", {}],
    ["a keyboard without lock (Keyboard Map only)", { keyboard: {} }],
    ["a keyboard that is null", { keyboard: null }],
  ])("should find none with %s", (_, nav) => {
    expect(keyboardLockOf(nav)).toBeNull();
  });
});
