import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REFIT_DEBOUNCE_MS,
  fitGame,
  mountViewport,
  watchDensity,
  watchFrame,
  type ViewGame,
} from "./game";
import { Viewport } from "./viewport";

/** A window whose ratio can be changed, as dragging it to another monitor does. */
function fakeWindow(ratio: number) {
  const queries: { media: string; listeners: Set<() => void> }[] = [];
  const win = {
    devicePixelRatio: ratio,
    matchMedia(media: string) {
      const q = { media, listeners: new Set<() => void>() };
      queries.push(q);
      return {
        addEventListener: (_: "change", fn: () => void) => q.listeners.add(fn),
        removeEventListener: (_: "change", fn: () => void) =>
          q.listeners.delete(fn),
      };
    },
  };
  /** The monitor changes: the query for the old ratio stops matching. */
  const moveTo = (next: number) => {
    const old = queries.filter((q) =>
      q.media.includes(`${win.devicePixelRatio}dppx`),
    );
    win.devicePixelRatio = next;
    for (const q of old) for (const fn of [...q.listeners]) fn();
  };
  const listening = () => queries.reduce((n, q) => n + q.listeners.size, 0);
  return { win, moveTo, listening };
}

describe("watchDensity (FS-ZAJMH R10: a devicePixelRatio change, window moved to another monitor)", () => {
  it("should hear each change of ratio, however many there are", () => {
    const { win, moveTo } = fakeWindow(1);
    const heard: number[] = [];
    watchDensity(win, (dpr) => heard.push(dpr));
    moveTo(2);
    moveTo(1.5);
    expect(heard).toEqual([2, 1.5]);
  });

  it("should listen to one query at a time, and to none once stopped", () => {
    const { win, moveTo, listening } = fakeWindow(1);
    const stop = watchDensity(win, () => {});
    moveTo(2);
    expect(listening()).toBe(1);
    stop();
    expect(listening()).toBe(0);
  });
});

/** A game that records how its scale was set and which cameras were fitted. */
function fakeGame() {
  const calls: string[] = [];
  const camera = (name: string) => ({
    width: 0,
    height: 0,
    zoomX: 1,
    displayWidth: 1080,
    displayHeight: 720,
    scrollX: 0,
    scrollY: 0,
    roundPixels: true,
    renderRoundPixels: true,
    useBounds: false,
    setSize: (w: number, h: number) => calls.push(`${name} size ${w}x${h}`),
    setZoom: (z: number) => calls.push(`${name} zoom ${z}`),
    setOrigin: () => undefined,
    setBounds: () => undefined,
    setScroll: () => undefined,
    setFollowOffset: () => undefined,
    startFollow: () => undefined,
    clampX: (x: number) => x,
    clampY: (y: number) => y,
    preRender: () => undefined,
    getViewMatrix: () => ({ translate: () => undefined }),
    matrixCombined: { translate: () => undefined },
  });
  const game: ViewGame = {
    scale: {
      resize: (w: number, h: number) => void calls.push(`resize ${w}x${h}`),
      setZoom: (z: number) => void calls.push(`css zoom ${z}`),
    },
    scene: {
      getScenes: () => [
        { cameras: { main: camera("hub") } },
        { cameras: { main: undefined } },
      ],
    },
  };
  return { game, calls };
}

describe("fitGame (FS-ZAJMH R10: the render scale re-applied without a reload)", () => {
  it("should resize the backing store, keep the CSS size, then re-fit every started scene's camera", () => {
    const { game, calls } = fakeGame();
    const v = new Viewport();
    fitGame(game, v);
    v.set({ width: 1080, height: 720, renderScale: 2 });
    expect(calls).toEqual([
      "resize 2160x1440",
      "css zoom 0.5",
      "hub size 2160x1440",
      "hub zoom 2",
    ]);
  });

  it("should show the canvas at the frame's CSS size and re-fit cameras to a wider view (R7, R9)", () => {
    const { game, calls } = fakeGame();
    const v = new Viewport();
    fitGame(game, v);
    v.set({ width: 1280, height: 720, renderScale: 2, cssScale: 1.5 });
    expect(calls).toEqual([
      "resize 2560x1440",
      "css zoom 0.75",
      "hub size 2560x1440",
      "hub zoom 2",
    ]);
  });

  it("should stop following the viewport once unbound", () => {
    const { game, calls } = fakeGame();
    const v = new Viewport();
    fitGame(game, v)();
    v.set({ width: 1080, height: 720, renderScale: 2 });
    expect(calls).toEqual([]);
  });
});

/** A Phaser Text as far as the re-fit reads it: its style's resolution and how it is changed. */
const label = (resolution: number) => {
  const style = { resolution };
  return {
    style,
    setResolution: vi.fn((r: number): void => {
      style.resolution = r;
    }),
  };
};

/** A game whose scenes hold text: two running (one in a container), one stopped. */
function gameWithText() {
  const hud = label(1);
  const panelLine = label(1);
  const menuTitle = label(1);
  const stale = label(1);
  const scene = (running: boolean, list: object[]) => ({
    running,
    children: { list },
  });
  const scenes = [
    scene(true, [hud, { list: [{ list: [panelLine] }] }]),
    scene(true, [menuTitle]),
    scene(false, [stale]),
  ];
  const game: ViewGame = {
    scale: { resize: () => undefined, setZoom: () => undefined },
    scene: {
      getScenes: (isActive: boolean) =>
        scenes.filter((s) => !isActive || s.running),
    },
  };
  return { game, hud, panelLine, menuTitle, stale };
}

describe("fitGame (FS-ZAJMH R5, R10, US9: text rasterised again when the render scale changes)", () => {
  it("should rasterise every running scene's text at the new render scale, inside containers too", () => {
    const { game, hud, panelLine, menuTitle } = gameWithText();
    const v = new Viewport();
    fitGame(game, v);
    v.set({ width: 1280, height: 720, renderScale: 1.5, cssScale: 1.5 });
    for (const t of [hud, panelLine, menuTitle])
      expect(t.setResolution).toHaveBeenCalledWith(1.5);
  });

  it("should leave text alone when only the CSS size or the view's width changed", () => {
    const { game, hud, menuTitle } = gameWithText();
    const v = new Viewport();
    v.set({ width: 1080, height: 720, renderScale: 1.5 });
    fitGame(game, v);
    v.set({ width: 1280, height: 720, renderScale: 1.5, cssScale: 1.2 });
    expect(hud.setResolution).not.toHaveBeenCalled();
    expect(menuTitle.setResolution).not.toHaveBeenCalled();
  });

  it("should pass over a stopped scene", () => {
    const { game, stale } = gameWithText();
    const v = new Viewport();
    fitGame(game, v);
    v.set({ width: 1080, height: 720, renderScale: 2 });
    expect(stale.setResolution).not.toHaveBeenCalled();
  });
});

/** A frame whose size the test changes, and the resize observer watching it. */
function fakeFrame() {
  const frame = { clientWidth: 1080, clientHeight: 720 };
  const observers: { notify: () => void; watching: boolean }[] = [];
  class Observer {
    private readonly entry: { notify: () => void; watching: boolean };
    constructor(notify: () => void) {
      this.entry = { notify, watching: false };
      observers.push(this.entry);
    }
    observe() {
      this.entry.watching = true;
    }
    disconnect() {
      this.entry.watching = false;
    }
  }
  const resize = (width: number, height: number) => {
    frame.clientWidth = width;
    frame.clientHeight = height;
    for (const o of observers) if (o.watching) o.notify();
  };
  const watching = () => observers.some((o) => o.watching);
  return { frame, Observer, resize, watching };
}

describe("watchFrame (FS-ZAJMH R10: re-fit on a resize, debounced)", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("should hear a drag-resize once, at its last size, one debounce interval after it stops", () => {
    const { frame, Observer, resize } = fakeFrame();
    const heard: { width: number; height: number }[] = [];
    watchFrame(frame, (size) => heard.push(size), Observer);
    resize(1200, 700);
    vi.advanceTimersByTime(REFIT_DEBOUNCE_MS - 1);
    resize(1300, 720);
    resize(1400, 760);
    vi.advanceTimersByTime(REFIT_DEBOUNCE_MS - 1);
    expect(heard).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(heard).toEqual([{ width: 1400, height: 760 }]);
  });

  it("should stop watching, a pending re-fit included, once stopped", () => {
    const { frame, Observer, resize, watching } = fakeFrame();
    const heard: unknown[] = [];
    const stop = watchFrame(frame, (size) => heard.push(size), Observer);
    resize(1200, 700);
    stop();
    vi.advanceTimersByTime(REFIT_DEBOUNCE_MS);
    expect(heard).toEqual([]);
    expect(watching()).toBe(false);
  });
});

/** A Phaser game as the mount drives it: its scale, its DOM layer, and its boot. */
function fakeMountedGame(booted: boolean) {
  const { game, calls } = fakeGame();
  const boot = new Set<() => void>();
  const mounted = {
    ...game,
    isBooted: booted,
    domContainer: { style: { left: "12px", top: "8px" } },
    scale: { ...game.scale, updateBounds: () => void calls.push("bounds") },
    events: { once: (_: "boot", fn: () => void) => void boot.add(fn) },
  };
  const finishBoot = () => {
    mounted.isBooted = true;
    for (const fn of boot) fn();
  };
  return { game: mounted, calls, finishBoot };
}

/** The game frame: its size, its resize observer, and the CSS properties set on it. */
function fakeMountFrame() {
  const watched = fakeFrame();
  const props: Record<string, string> = {};
  const frame = Object.assign(watched.frame, {
    style: {
      setProperty: (name: string, value: string) => void (props[name] = value),
    },
  });
  return { ...watched, frame, props };
}

describe("mountViewport (FS-ZAJMH R9–R11, R16: the game fitted to its frame, and following it)", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  const mount = (booted = true, ratio = 1) => {
    const g = fakeMountedGame(booted);
    const f = fakeMountFrame();
    const w = fakeWindow(ratio);
    const v = new Viewport();
    const unmount = mountViewport(g.game, f.frame, {
      win: w.win,
      viewport: v,
      Observer: f.Observer,
    });
    return { ...g, ...f, ...w, v, unmount };
  };

  it("should pin the DOM layer to the canvas's corner, once the game has booted (R16)", () => {
    const { game, finishBoot } = mount(false);
    expect(game.domContainer.style).toEqual({ left: "12px", top: "8px" });
    finishBoot();
    expect(game.domContainer.style).toEqual({ left: "0", top: "0" });
  });

  it("should pin the DOM layer at once when the game has already booted", () => {
    const { game } = mount(true);
    expect(game.domContainer.style).toEqual({ left: "0", top: "0" });
  });

  // FS-T3DWX R1: nothing is laid over the canvas in logical units any more, so the frame carries
  // no `--game-scale` (its one reader was the fullscreen button)
  it("should set no CSS property on the frame, now or on a change", () => {
    const { props, resize } = mount();
    resize(1620, 1080);
    vi.advanceTimersByTime(REFIT_DEBOUNCE_MS);
    expect(props).toEqual({});
  });

  it("should re-fit to the frame's new size and re-read the canvas's bounds after a resize settles (R10)", () => {
    const { v, calls, resize } = mount(true, 2);
    resize(1280, 720);
    vi.advanceTimersByTime(REFIT_DEBOUNCE_MS);
    expect(v.current()).toEqual({
      width: 1280,
      height: 720,
      renderScale: 2,
      cssScale: 1,
    });
    expect(calls).toContain("resize 2560x1440");
    expect(calls.at(-1)).toBe("bounds");
  });

  it("should re-fit when the window moves to a monitor of another density (R10)", () => {
    const { v, calls, moveTo } = mount(true, 1);
    moveTo(1.5);
    expect(v.renderScale).toBe(1.5);
    expect(calls).toContain("resize 1620x1080");
    expect(calls.at(-1)).toBe("bounds");
  });

  it("should let go of the frame, the window and the viewport once unmounted", () => {
    const { v, calls, props, resize, moveTo, watching, listening, unmount } =
      mount();
    unmount();
    resize(1280, 720);
    vi.advanceTimersByTime(REFIT_DEBOUNCE_MS);
    moveTo(2);
    v.set({ width: 1200, height: 720, renderScale: 1, cssScale: 1.2 });
    expect(calls).toEqual([]);
    expect(props).toEqual({});
    expect(watching()).toBe(false);
    expect(listening()).toBe(0);
  });
});
