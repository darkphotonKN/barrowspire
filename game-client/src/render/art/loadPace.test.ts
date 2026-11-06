import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOAD_PACE, paceLoad, type PaceClock } from "./loadPace";

/** The scene's clock, on vitest's fake timers. */
const clock: PaceClock = {
  after: (ms, step) => {
    const id = setTimeout(step, ms);
    return () => clearTimeout(id);
  },
};

/** A paced load recording, in `log`, what happens and when (ms since it started). */
function paced(opts: { fadeIn?: boolean } = {}) {
  const log: string[] = [];
  const at = (what: string) => log.push(`${Date.now()} ${what}`);
  const progress: number[] = [];
  const pace = paceLoad({
    clock,
    curtain: {
      fadeIn: (ms) => at(`fade in ${ms}`),
      fadeOut: (ms) => at(`fade out ${ms}`),
    },
    bar: () => {
      at("bar shown");
      return { progress: (v) => progress.push(v), destroy: () => at("bar destroyed") };
    },
    enter: () => at("create"),
    fadeIn: opts.fadeIn ?? true,
  });
  return { pace, log, progress };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("LOAD_PACE (FS-C4JWH A1.7: the durations in one place)", () => {
  it("should name the show delay, the minimum visible time, the bar's fade and the world's fade", () => {
    expect(LOAD_PACE).toEqual({ showDelay: 300, minVisible: 600, barFade: 150, worldFade: 200 });
  });
});

describe("paceLoad: a load done within the show delay (FS-C4JWH A1.1, A1.4)", () => {
  it("should show no bar, fade the world in and enter on the load's completion", () => {
    const { pace, log } = paced();

    vi.advanceTimersByTime(299);
    pace.loaded();
    vi.runAllTimers();

    expect(log).toEqual(["299 fade in 200", "299 create"]);
  });

  it("should not fade a menu in when no bar showed", () => {
    const { pace, log } = paced({ fadeIn: false });

    vi.advanceTimersByTime(120);
    pace.loaded();
    vi.runAllTimers();

    expect(log).toEqual(["120 create"]);
  });
});

describe("paceLoad: a load still running at the show delay (FS-C4JWH A1.1–A1.4)", () => {
  it("should show the bar at 300 ms, fading in, filled to the progress so far", () => {
    const { pace, log, progress } = paced();

    pace.progress(0);
    pace.progress(0.5);
    vi.advanceTimersByTime(300);
    pace.progress(0.75);

    expect(log).toEqual(["300 bar shown", "300 fade in 150"]);
    expect(progress).toEqual([0.5, 0.75]);
  });

  it("should keep a bar over a load that ends just past the delay its 600 ms, fade it out, then enter", () => {
    const { pace, log } = paced();

    vi.advanceTimersByTime(310);
    pace.loaded();
    vi.runAllTimers();

    expect(log).toEqual([
      "300 bar shown",
      "300 fade in 150",
      "900 fade out 150",
      "1050 bar destroyed",
      "1050 fade in 200",
      "1050 create",
    ]);
  });

  it("should keep the bar as long as the load runs, then fade it out at once", () => {
    const { pace, log } = paced();

    vi.advanceTimersByTime(1500);
    pace.loaded();
    vi.runAllTimers();

    expect(log).toEqual([
      "300 bar shown",
      "300 fade in 150",
      "1500 fade out 150",
      "1650 bar destroyed",
      "1650 fade in 200",
      "1650 create",
    ]);
  });

  it("should bring a menu up out of the bar's fade too", () => {
    const { pace, log } = paced({ fadeIn: false });

    vi.advanceTimersByTime(1000);
    pace.loaded();
    vi.runAllTimers();

    expect(log.slice(-3)).toEqual(["1150 bar destroyed", "1150 fade in 200", "1150 create"]);
  });

  it("should enter once, however often the load says it is done", () => {
    const { pace, log } = paced();

    vi.advanceTimersByTime(400);
    pace.loaded();
    pace.loaded();
    vi.runAllTimers();

    expect(log.filter((l) => l.endsWith("create"))).toHaveLength(1);
  });
});

describe("paceLoad: a stop cancels every step (FS-C4JWH A1.8)", () => {
  it.each([
    ["during the delay", 100, false],
    ["while the bar is up and the load runs", 500, false],
    ["while the bar waits out its 600 ms", 500, true],
    ["during the bar's fade-out", 950, true],
  ])("should leave nothing pending and never enter when the scene stops %s", (_when, stopAt, loadedFirst) => {
    const { pace, log } = paced();
    if (loadedFirst) {
      vi.advanceTimersByTime(400);
      pace.loaded();
    }
    vi.advanceTimersByTime(stopAt - Date.now());
    const before = [...log];

    pace.end("shutdown");
    pace.loaded();
    vi.runAllTimers();

    expect(log).toEqual(before);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("should ask the clock nothing on a game destroy, and never enter", () => {
    const cancels: string[] = [];
    const entered = vi.fn();
    const pace = paceLoad({
      clock: { after: () => () => cancels.push("cancelled") },
      curtain: { fadeIn: vi.fn(), fadeOut: vi.fn() },
      bar: () => ({ progress: vi.fn(), destroy: vi.fn() }),
      enter: entered,
      fadeIn: true,
    });

    pace.end("destroy");
    pace.loaded();

    expect(cancels).toEqual([]);
    expect(entered).not.toHaveBeenCalled();
  });
});
