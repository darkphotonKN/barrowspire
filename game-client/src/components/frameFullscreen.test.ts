import { describe, expect, it } from "vitest";
import { frameFullscreen } from "./frameFullscreen";
import type { FullscreenDocument, FullscreenFrame, KeyboardLock } from "./fullscreen";

type Listener = () => void;

/** A document whose fullscreen the test drives, as the browser would, and a frame it puts on screen. */
function browser(api: Partial<FullscreenDocument> = { fullscreenEnabled: true }) {
  const listeners = new Set<Listener>();
  const calls: string[] = [];
  const doc: FullscreenDocument = {
    fullscreenElement: null,
    ...api,
    exitFullscreen: async () => {
      calls.push("exit");
      become(null);
    },
    addEventListener: (type, fn) => void (type === "fullscreenchange" && listeners.add(fn)),
    removeEventListener: (type, fn) => void (type === "fullscreenchange" && listeners.delete(fn)),
  };
  const become = (element: unknown) => {
    doc.fullscreenElement = element;
    [...listeners].forEach((fn) => fn());
  };
  const frame: FullscreenFrame = {
    requestFullscreen: async () => {
      calls.push("request");
      become(frame);
    },
  };
  const keyboard: KeyboardLock = {
    lock: async (codes) => void calls.push(`lock ${codes.join(",")}`),
    unlock: () => void calls.push("unlock"),
  };
  return { doc, frame, keyboard, calls, become, listeners };
}

/** Lets the toggle's awaited request and lock settle. */
const settle = () => new Promise((done) => setTimeout(done, 0));

// FS-T3DWX R12, R9: the game frame's fullscreen, bound to the frame, as the OPTIONS panel's row
// toggles it; what it does is fullscreen.ts's, unchanged (FS-ZAJMH R19–R23, A16)
describe("frameFullscreen", () => {
  it("should be none where there is no Fullscreen API (iPhone Safari, FS-ZAJMH R23)", () => {
    const { frame, keyboard } = browser();
    expect(frameFullscreen(frame, browser({}).doc, keyboard)).toBeNull();
  });

  it("should ask for fullscreen on the frame and then lock Escape for the game, where Keyboard Lock exists (A16)", async () => {
    const { doc, frame, keyboard, calls } = browser();
    const fullscreen = frameFullscreen(frame, doc, keyboard)!;

    expect(fullscreen.active()).toBe(false);
    fullscreen.toggle();
    await settle();

    expect(fullscreen.active()).toBe(true);
    expect(calls).toEqual(["request", "lock Escape"]);
  });

  it("should leave fullscreen while fullscreen, and let Escape go", async () => {
    const { doc, frame, keyboard, calls } = browser();
    const fullscreen = frameFullscreen(frame, doc, keyboard)!;
    fullscreen.toggle();
    await settle();

    fullscreen.toggle();
    await settle();

    expect(fullscreen.active()).toBe(false);
    expect(calls).toEqual(["request", "lock Escape", "exit", "unlock"]);
  });

  it("should enter with no lock where there is no Keyboard Lock (Safari, Firefox)", async () => {
    const { doc, frame, calls } = browser();
    const fullscreen = frameFullscreen(frame, doc, null)!;
    fullscreen.toggle();
    await settle();
    expect(calls).toEqual(["request"]);
  });

  it("should tell a watcher of every change by any route, until it stops", () => {
    const { doc, frame, keyboard, become, listeners } = browser();
    const fullscreen = frameFullscreen(frame, doc, keyboard)!;
    let heard = 0;
    const stop = fullscreen.watch(() => heard++);

    become(frame);
    become(null);
    stop();
    become(frame);

    expect(heard).toBe(2);
    expect(listeners.size).toBe(0);
  });
});
