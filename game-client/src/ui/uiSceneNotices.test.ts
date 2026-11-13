import { afterEach, describe, expect, it } from "vitest";
import { viewport } from "@/render/viewport";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import { GameUiBridge, NO_FACTS, type Notice, type WorldReport } from "./uiBridge";
import { UiNoticeLayer, drawNotice, type NoticeStage } from "./uiSceneNotices";

// FS-TQZ5J Amendment A2 R28, R33, R34 (I-TQZ5J-8): the worlds' screen notices are the UI scene's, said
// through the bridge as plain data (its words and its look) and drawn with today's look, place, depth
// and timing on the UI scene's own clock; a world's notices go as it leaves.

/** A drawn line as the stage made it, and what was done to it since. */
interface Line {
  x: number;
  y: number;
  words: string;
  style: Record<string, unknown>;
  origin?: number;
  scrollFactor?: number;
  depth?: number;
  alpha: number;
  destroyed: boolean;
}

/** A stage over a fake clock: lines kept, timers fired and tweens run as the clock moves on. */
function aStage() {
  const lines: Line[] = [];
  let now = 0;
  const timers: { at: number; run: () => void; removed: boolean }[] = [];
  const tweens: {
    target: Line;
    from: number;
    alpha: number;
    delay: number;
    duration: number;
    done: () => void;
    removed: boolean;
    finished: boolean;
  }[] = [];
  const stage: NoticeStage = {
    add: {
      text: (x: number, y: number, words: string | string[], style: object) => {
        const line: Line = { x, y, words: String(words), style: style as Record<string, unknown>, alpha: 1, destroyed: false };
        lines.push(line);
        const self = {
          setOrigin: (o: number) => ((line.origin = o), self),
          setScrollFactor: (f: number) => ((line.scrollFactor = f), self),
          setDepth: (d: number) => ((line.depth = d), self),
          destroy: () => void (line.destroyed = true),
          line,
        };
        return self as never;
      },
    },
    time: {
      delayedCall: (delay: number, run: () => void) => {
        const timer = { at: now + delay, run, removed: false };
        timers.push(timer);
        return { remove: () => void (timer.removed = true) } as never;
      },
    },
    tweens: {
      add: (config: { targets: { line: Line }; alpha: number; delay: number; duration: number; onComplete: () => void }) => {
        const tween = {
          target: config.targets.line,
          from: config.targets.line.alpha,
          alpha: config.alpha,
          delay: config.delay,
          duration: config.duration,
          done: config.onComplete,
          removed: false,
          finished: false,
          start: now,
        };
        tweens.push(tween);
        return { remove: () => void (tween.removed = true) } as never;
      },
    },
  };
  /** The clock moved on to `ms`: timers due fire, tweens take their alpha, a finished one completes. */
  const at = (ms: number) => {
    now = ms;
    for (const t of timers) if (!t.removed && t.at <= now && t.at >= 0) ((t.at = -1), t.run());
    for (const t of tweens as (typeof tweens[number] & { start: number })[]) {
      if (t.removed || t.finished) continue;
      const p = Math.min(1, Math.max(0, (now - t.start - t.delay) / t.duration));
      t.target.alpha = t.from + (t.alpha - t.from) * p;
      if (p === 1) ((t.finished = true), t.done());
    }
  };
  const live = () => lines.filter((l) => !l.destroyed);
  return { stage, lines, live, at, timers, tweens };
}

const town = (text: string): Notice => ({ text, look: { world: "hub" } });
const field = (text: string): Notice => ({ text, look: { world: "field" } });
const run = (text: string, backing: number): Notice => ({ text, look: { world: "run", backing } });

afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

describe("a notice drawn with today's look, place, depth and timing (FS-TQZ5J A2 R28, R33)", () => {
  it("should draw the town's line at the top centre, y 72, depth 1000, vellum on charcoal, gone at 3.2 s", () => {
    const s = aStage();

    drawNotice(s.stage, town("Could not leave the queue, please try again."), () => {});

    const [line] = s.live();
    expect([line.x, line.y, line.origin, line.scrollFactor, line.depth]).toEqual([540, 72, 0.5, 0, 1000]);
    expect(line.words).toBe("Could not leave the queue, please try again.");
    expect(line.style).toEqual({
      fontFamily: CANVAS_FONT.body,
      fontSize: "14px",
      color: toCss(BARROW_HEX.vellum),
      backgroundColor: toCss(BARROW_HEX.charcoal),
      padding: { x: 12, y: 8 },
    });
    s.at(3199);
    expect(s.live()).toHaveLength(1);
    s.at(3200);
    expect(s.live()).toEqual([]);
  });

  it("should draw the field's line as the town's: y 72, depth 1000, 3.2 s", () => {
    const s = aStage();

    drawNotice(s.stage, field("Your bag is full."), () => {});

    const [line] = s.live();
    expect([line.x, line.y, line.depth]).toEqual([540, 72, 1000]);
    expect(line.style.fontSize).toBe("14px");
    s.at(3200);
    expect(s.live()).toEqual([]);
  });

  it("should draw the run's notification at y 100, depth 2000, on its backing, full at 1 s and gone at 3 s", () => {
    const s = aStage();

    drawNotice(s.stage, run("Escape door opened!", palette.safe), () => {});

    const [line] = s.live();
    expect([line.x, line.y, line.origin, line.scrollFactor, line.depth]).toEqual([540, 100, 0.5, 0, 2000]);
    expect(line.style).toEqual({
      fontFamily: CANVAS_FONT.body,
      fontSize: "20px",
      color: toCss(palette.hudText),
      backgroundColor: toCss(palette.safe),
      padding: { x: 20, y: 10 },
    });
    s.at(1000);
    expect(line.alpha).toBe(1);
    s.at(2000);
    expect(line.alpha).toBe(0.5);
    s.at(2999);
    expect(s.live()).toHaveLength(1);
    s.at(3000);
    expect(s.live()).toEqual([]);
  });

  it("should stand where it was said: at the centre of the view then", () => {
    const s = aStage();
    viewport.set({ width: 1280, height: 720, renderScale: 1 });

    drawNotice(s.stage, town("A line."), () => {});

    expect(s.live()[0].x).toBe(640);
  });

  it("should say it has gone on its own, and take it down early with its timer or tween", () => {
    const s = aStage();
    const gone: string[] = [];
    const a = drawNotice(s.stage, town("A line."), () => void gone.push("town"));
    const b = drawNotice(s.stage, run("A notice.", palette.safe), () => void gone.push("run"));

    a.takeDown();
    b.takeDown();
    s.at(5000);

    expect(s.live()).toEqual([]);
    expect(gone).toEqual([]);
    expect(s.timers.every((t) => t.removed)).toBe(true);
    expect(s.tweens.every((t) => t.removed)).toBe(true);
  });
});

describe("the UI scene's notices, said by the world reported (FS-TQZ5J A2 R33, R34)", () => {
  /** A world as it reports itself. */
  const aWorld = (world: "hub" | "field" | "run"): WorldReport => ({
    world,
    windows: () => ({ letter: false, party: false, inventory: false, character: false }),
    blockers: () => ({ dialogue: false }),
    facts: () => NO_FACTS,
    answer: () => {},
  });

  function onBridge() {
    const bridge = new GameUiBridge();
    const s = aStage();
    const layer = new UiNoticeLayer(bridge, (notice, gone) => drawNotice(s.stage, notice, gone));
    bridge.onScreen({ notice: (notice) => layer.say(notice) });
    bridge.onWorld(() => layer.sync());
    return { bridge, layer, ...s };
  }

  it("should draw each notice the world says, several standing at once", () => {
    const t = onBridge();
    t.bridge.report(aWorld("hub"));

    t.bridge.notice(town("One."));
    t.bridge.notice(town("Two."));

    expect(t.live().map((l) => l.words)).toEqual(["One.", "Two."]);
  });

  it("should draw nothing while no world is reported", () => {
    const t = onBridge();

    t.bridge.notice(town("One."));

    expect(t.lines).toEqual([]);
  });

  it("should take a world's notices down as it leaves, a run's mid-fade too, and draw the next world's", () => {
    const t = onBridge();
    t.bridge.report(aWorld("run"));
    t.bridge.notice(run("Escape door opened!", palette.safe));
    t.at(1500);

    t.bridge.left("run");
    t.bridge.report(aWorld("hub"));
    t.bridge.notice(town("A line."));
    t.at(5000);

    expect(t.lines.map((l) => [l.words, l.destroyed])).toEqual([
      ["Escape door opened!", true],
      ["A line.", true],
    ]);
    expect(t.tweens[0].removed).toBe(true);
  });

  it("should take them down as another world reports, and keep them while the same world reports a change", () => {
    const t = onBridge();
    t.bridge.report(aWorld("hub"));
    t.bridge.notice(town("A line."));
    t.bridge.changed();
    expect(t.live()).toHaveLength(1);

    t.bridge.report(aWorld("field"));

    expect(t.live()).toEqual([]);
  });

  it("should forget a notice gone on its own, so a world leaving takes nothing down twice", () => {
    const t = onBridge();
    t.bridge.report(aWorld("hub"));
    t.bridge.notice(town("A line."));
    t.at(3200);

    t.layer.clear();

    expect(t.timers.filter((x) => x.removed)).toEqual([]);
  });
});
