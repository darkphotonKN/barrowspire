import { EventEmitter } from "eventemitter3";
import { describe, expect, it, vi } from "vitest";
import type { LoreArea, LoreTint } from "@/render/effects/loreDust";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { enqueue, LORE_LINE, LoreLines, type LoreLine, type LoreLineScene } from "./loreLine";

// FS-XWHZP §C R11-R14. I-XWHZP-1: the queue, a pure step.

const hope = (text: string): LoreLine => ({ text, tone: "hope" });
const lore = (text: string): LoreLine => ({ text, tone: "lore" });
const dread = (text: string): LoreLine => ({ text, tone: "dread" });

describe("enqueue (FS-XWHZP §C)", () => {
  it("should wait a line behind those already waiting (R11)", () => {
    expect(enqueue([hope("a")], hope("x"), lore("b"))).toEqual([hope("a"), lore("b")]);
  });

  it("should wait a dread line ahead of every non-dread line (R12)", () => {
    expect(enqueue([hope("a"), lore("b")], hope("x"), dread("c"))).toEqual([dread("c"), hope("a"), lore("b")]);
  });

  it("should wait a dread line behind an earlier dread line (R12)", () => {
    expect(enqueue([dread("a"), hope("b")], undefined, dread("c"))).toEqual([dread("a"), dread("c"), hope("b")]);
  });

  it("should drop the oldest waiting non-dread line when a fourth would wait (R13)", () => {
    expect(enqueue([hope("a"), hope("b"), hope("c")], hope("x"), hope("d"))).toEqual([hope("b"), hope("c"), hope("d")]);
  });

  it("should drop a non-dread line, never a dread one, to make room for a dread line (R13)", () => {
    expect(enqueue([dread("a"), hope("b"), hope("c")], hope("x"), dread("d"))).toEqual([
      dread("a"),
      dread("d"),
      hope("c"),
    ]);
  });

  it("should drop the newcomer when every waiting line is dread and it is not (R13)", () => {
    const full = [dread("a"), dread("b"), dread("c")];
    expect(enqueue(full, undefined, hope("d"))).toEqual(full);
  });

  it("should drop a line equal to the one showing or one waiting (R14)", () => {
    expect(enqueue([], hope("x"), hope("x"))).toEqual([]);
    expect(enqueue([hope("a")], undefined, hope("a"))).toEqual([hope("a")]);
    // the same words in another tone are another line
    expect(enqueue([], hope("x"), lore("x"))).toEqual([lore("x")]);
  });
});

// FS-XWHZP §A R2-R7, §B R8-R10, §C R11, R15. I-XWHZP-1: the lines, on a recording stand-in for
// the slice of a scene they draw, time and tremble with, and a stand-in dust.

interface Made {
  args: unknown[];
  destroyed: boolean;
  calls: Record<string, unknown[]>;
  obj: Record<string, unknown>;
}

interface Timer {
  delay: number;
  fn: () => void;
  removed: boolean;
}

function stand(options: { reducedMotion?: boolean } = {}) {
  const texts: Made[] = [];
  const tweens: Record<string, unknown>[] = [];
  const timers: Timer[] = [];
  const shake = vi.fn();
  const events = new EventEmitter();
  const scene = {
    add: {
      text: (...args: unknown[]) => {
        const made: Made = { args, destroyed: false, calls: {}, obj: {} };
        made.obj = new Proxy(
          { width: 200, height: 26 },
          {
            get: (target, prop) => {
              if (prop === "width" || prop === "height") return target[prop];
              if (prop === "active") return !made.destroyed;
              if (prop === "destroy") return () => void (made.destroyed = true);
              return (...a: unknown[]) => ((made.calls[String(prop)] = a), made.obj);
            },
          },
        );
        texts.push(made);
        return made.obj;
      },
    },
    tweens: { add: (config: Record<string, unknown>) => (tweens.push(config), config) },
    time: {
      delayedCall: (delay: number, fn: () => void) => {
        const t = { delay, fn, removed: false };
        timers.push(t);
        return { remove: () => void (t.removed = true) };
      },
    },
    cameras: { main: { shake } },
    events,
  } as unknown as LoreLineScene;
  const dust = {
    start: vi.fn((_area: LoreArea, _tint: LoreTint, _depth: number) => true),
    burst: vi.fn((_area: LoreArea, _tint: LoreTint, _depth: number) => true),
    move: vi.fn((_area: LoreArea) => undefined),
    stop: vi.fn(),
    clear: vi.fn(),
    forget: vi.fn(),
  };
  const view = { width: 1000, height: 600, centerX: 500, centerY: 300 };
  const lines = new LoreLines(scene, dust, { view, reducedMotion: () => options.reducedMotion ?? false });
  /** Fires the earliest timer still to come; the clock is the order they were set in. */
  const live = () => timers.filter((t) => !t.removed);
  const fire = () => {
    const t = live()[0];
    t.removed = true;
    t.fn();
    return t;
  };
  const shown = () => texts.filter((t) => !t.destroyed);
  return { scene, lines, texts, tweens, timers, shake, dust, view, events, live, fire, shown };
}

describe("LoreLines (FS-XWHZP §A-§C)", () => {
  it("should draw the line in the italic body serif at its place, camera-fixed, over the HUD (R2, R3, R5)", () => {
    const { lines, texts } = stand();
    lines.say(hope("The way out stands open."));

    expect(texts).toHaveLength(1);
    const [x, y, words, style] = texts[0].args as [number, number, string, Record<string, unknown>];
    // 20% of the height above the middle of a 1000 × 600 view
    expect([x, y]).toEqual([500, 180]);
    expect(words).toBe("The way out stands open.");
    expect(style.fontFamily).toBe(CANVAS_FONT.body);
    expect(style.fontStyle).toBe("italic");
    expect(style.fontSize).toBe("22px");
    expect(style.align).toBe("center");
    expect(style.backgroundColor).toBeUndefined();
    expect(texts[0].calls.setOrigin).toEqual([0.5]);
    expect(texts[0].calls.setScrollFactor).toEqual([0]);
    expect(texts[0].calls.setDepth).toEqual([1990]);
    expect(LORE_LINE.depth).toBeGreaterThan(1000);
    expect(LORE_LINE.depth).toBeLessThan(2000);
    expect(texts[0].calls.setShadow?.[2]).toBe(toCss(palette.loreShadow));
  });

  it.each([
    ["lore", palette.loreText],
    ["dread", palette.loreDread],
    ["hope", palette.loreHope],
  ] as const)("should colour a %s line by its palette name (R8)", (tone, color) => {
    const { lines, texts } = stand();
    lines.say({ text: "x", tone });
    expect((texts[0].args[3] as { color: string }).color).toBe(toCss(color));
  });

  it("should fade in over 900 ms, hold 2600, fade out over 1100, and go (R4)", () => {
    const { lines, tweens, texts, fire, dust } = stand();
    lines.say(lore("It will not open."));

    expect(tweens[0].targets).toBe(texts[0].obj);
    expect(tweens[0]).toMatchObject({ alpha: 1, duration: 900 });
    expect(texts[0].calls.setAlpha).toEqual([0]);
    expect(fire().delay).toBe(3500);
    expect(dust.stop).toHaveBeenCalledTimes(1);
    expect(tweens[1].targets).toBe(texts[0].obj);
    expect(tweens[1]).toMatchObject({ alpha: 0, duration: 1100 });
    expect(fire().delay).toBe(4600);
    expect(texts[0].destroyed).toBe(true);
    expect(lines.current).toBeUndefined();
  });

  it("should show one line at a time, the next 250 ms after the last has gone (R4, R11)", () => {
    const { lines, fire, shown } = stand();
    lines.say(hope("a"));
    lines.say(hope("b"));

    expect(shown()).toHaveLength(1);
    expect(lines.queued).toEqual([hope("b")]);
    fire();
    fire();
    expect(shown()).toHaveLength(0);
    expect(fire().delay).toBe(250);
    expect(shown()).toHaveLength(1);
    expect(lines.current).toEqual(hope("b"));
  });

  it("should wait a line that arrives in the gap, and show it after the one the gap was for", () => {
    const { lines, fire } = stand();
    lines.say(hope("a"));
    lines.say(hope("b"));
    fire();
    fire();
    lines.say(hope("c"));
    expect(lines.current).toBeUndefined();
    expect(lines.queued).toEqual([hope("b"), hope("c")]);
    fire();
    expect(lines.current).toEqual(hope("b"));
  });

  it("should show a line at once when the last has gone and none waits", () => {
    const { lines, fire } = stand();
    lines.say(hope("a"));
    fire();
    fire();
    lines.say(hope("b"));
    expect(lines.current).toEqual(hope("b"));
  });

  it("should raise fine dust off the line's box in its tone (R6)", () => {
    const { lines, dust } = stand();
    lines.say(hope("a"));
    // a 200 × 26 text centred on (500, 180)
    expect(dust.start).toHaveBeenCalledWith(
      { x: 400, y: 167, width: 200, height: 26 },
      { from: palette.loreHope, to: palette.loreFade },
      1990,
    );
    expect(dust.burst).not.toHaveBeenCalled();
  });

  it("should start a dread line with its embers and one slight tremor (R9, R10)", () => {
    const { lines, dust, shake } = stand();
    lines.say(dread("You hear a sound from hell"));

    expect(dust.burst).toHaveBeenCalledTimes(1);
    expect(dust.burst.mock.calls[0][1]).toEqual({ from: palette.loreEmber, to: palette.loreEmberDeep });
    expect(shake).toHaveBeenCalledTimes(1);
    expect(shake).toHaveBeenCalledWith(220, 0.002);
  });

  it.each(["lore", "hope"] as const)("should neither burst nor tremble on a %s line (R10)", (tone) => {
    const { lines, dust, shake } = stand();
    lines.say({ text: "x", tone });
    expect(dust.burst).not.toHaveBeenCalled();
    expect(shake).not.toHaveBeenCalled();
  });

  it("should not tremble under reduced motion, and still fade in, hold and out (R7)", () => {
    const { lines, shake, tweens, fire } = stand({ reducedMotion: true });
    lines.say(dread("x"));
    expect(shake).not.toHaveBeenCalled();
    fire();
    expect(tweens.map((t) => t.alpha)).toEqual([1, 0]);
  });

  it("should keep the line at its place when the view changes", () => {
    const { lines, texts, view } = stand();
    lines.say(hope("a"));
    Object.assign(view, { width: 800, height: 400, centerX: 400, centerY: 200 });
    lines.relayout();
    expect(texts[0].calls.setPosition).toEqual([400, 120]);
  });

  it("should move the dust with the line when the view changes, so new motes rise from its new place (R6)", () => {
    const { lines, dust, view } = stand();
    lines.say(hope("a"));
    Object.assign(view, { width: 800, height: 400, centerX: 400, centerY: 200 });
    lines.relayout();
    // the 200 × 26 text now centred on (400, 120)
    expect(dust.move).toHaveBeenCalledWith({ x: 300, y: 107, width: 200, height: 26 });
  });

  it("should take every line down and empty the queue on clear (R15)", () => {
    const { lines, shown, dust, live } = stand();
    lines.say(hope("a"));
    lines.say(hope("b"));
    lines.clear();

    expect(shown()).toHaveLength(0);
    expect(lines.current).toBeUndefined();
    expect(lines.queued).toEqual([]);
    expect(live()).toHaveLength(0);
    expect(dust.clear).toHaveBeenCalledTimes(1);
    // and it speaks again
    lines.say(hope("c"));
    expect(lines.current).toEqual(hope("c"));
  });

  it("should let go without touching anything at the scene's end", () => {
    const { lines, texts, events, dust } = stand();
    lines.say(hope("a"));
    lines.say(hope("b"));
    events.emit("shutdown");

    expect(texts[0].destroyed).toBe(false);
    expect(lines.current).toBeUndefined();
    expect(lines.queued).toEqual([]);
    expect(dust.forget).toHaveBeenCalled();
    expect(dust.clear).not.toHaveBeenCalled();
  });
});
