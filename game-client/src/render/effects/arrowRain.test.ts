import { beforeEach, describe, expect, it } from "vitest";
import { ARROW_RAIN_RADIUS } from "@/scenes/arrowRainAim";
import { BARROW_HEX } from "@/utils/theme";
import { fakeArt, fakeLights, fakeScene } from "./fakeScene";
import { EffectsRuntime } from "./runtime";
import { ARROW_RAIN, ArrowRain } from "./arrowRain";
import { EFFECTS } from "./table";

// FS-04EEA §H R45 (I-04EEA-9): from the release, 5 volleys of falling `fx_arrow` arrows into the
// circle, the first 0.3 s after the send and every 0.3 s after it, each landing with an impact; a
// floor change, teardown or the archer resolving stops it.

/** A clock that runs what falls due as time is moved on, skipping what was removed. */
function clock() {
  let now = 0;
  const due: { at: number; fn: () => void; removed: boolean }[] = [];
  return {
    time: {
      delayedCall: (delay: number, fn: () => void) => {
        const t = { at: now + delay, fn, removed: false };
        due.push(t);
        return {
          remove: () => {
            t.removed = true;
          },
        };
      },
    },
    now: () => now,
    advance(ms: number) {
      const until = now + ms;
      for (;;) {
        const next = due
          .filter((t) => !t.removed && t.at <= until)
          .sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        next.removed = true;
        now = next.at;
        next.fn();
      }
      now = until;
    },
  };
}

describe("Arrow Rain volleys (FS-04EEA §H R45)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let clk: ReturnType<typeof clock>;
  let fx: EffectsRuntime;
  let rain: ArrowRain;
  let impacts: { at: number; x: number; y: number }[];

  beforeEach(() => {
    fake = fakeScene();
    clk = clock();
    fx = new EffectsRuntime(fake.scene, fakeArt, fakeLights().lights, { warn: () => {} });
    impacts = [];
    const play = fx.play.bind(fx);
    fx.play = (owner, name, at, opts) => {
      if (name === "arrowRainImpact") impacts.push({ at: clk.now(), x: at.x, y: at.y });
      return play(owner, name, at, opts);
    };
    const scene = { ...fake.scene, time: clk.time } as typeof fake.scene;
    rain = new ArrowRain(scene, fakeArt, fx, { random: () => 0.5 });
  });

  const volleyTimes = () => [...new Set(impacts.map((i) => i.at))];

  it("should land 5 volleys at 300, 600, 900, 1200 and 1500 ms after the send", () => {
    rain.start({ x: 0, y: 0 }, { x: 200, y: 0 });
    clk.advance(3000);
    expect(volleyTimes()).toEqual([300, 600, 900, 1200, 1500]);
    expect(impacts).toHaveLength(5 * ARROW_RAIN.arrows);
  });

  it("should land nothing after a teardown at 700 ms", () => {
    rain.start({ x: 0, y: 0 }, { x: 200, y: 0 });
    clk.advance(700);
    rain.stop();
    clk.advance(3000);
    expect(volleyTimes()).toEqual([300, 600]);
    expect(rain.raining).toBe(false);
  });

  it("should land every arrow inside the circle", () => {
    let i = 0;
    const spread = [0, 0.99, 0.25, 0.75, 0.5, 0.1, 0.9, 0.33];
    const scene = { ...fake.scene, time: clk.time } as typeof fake.scene;
    rain = new ArrowRain(scene, fakeArt, fx, { random: () => spread[i++ % spread.length] });
    const centre = { x: 400, y: 300 };
    rain.start({ x: 0, y: 0 }, centre);
    clk.advance(3000);
    expect(impacts.length).toBeGreaterThan(0);
    for (const hit of impacts)
      expect(Math.hypot(hit.x - centre.x, hit.y - centre.y)).toBeLessThanOrEqual(ARROW_RAIN_RADIUS);
  });

  it("should drop each volley's baked arrows from above, leave them stuck where they land a moment, then take them", () => {
    rain.start({ x: 0, y: 0 }, { x: 200, y: 0 });
    const arrows = () => fake.live().filter((m) => m.kind === "image" && m.args[3] === "fx_arrow/idle/0/0");
    clk.advance(300 - ARROW_RAIN.fallMs - 1);
    expect(arrows()).toHaveLength(0);
    clk.advance(1);
    const first = arrows();
    expect(first).toHaveLength(ARROW_RAIN.arrows);
    // dropped from above their landing point onto it
    const body = first[first.length - 1];
    const fall = fake.tweens.at(-1);
    fall?.advance(0);
    const [, top] = body.calls.setPosition as [number, number];
    fall?.advance(1);
    const [, bottom] = body.calls.setPosition as [number, number];
    expect(top).toBeLessThan(bottom);
    expect(bottom - top).toBeCloseTo(ARROW_RAIN.drop);
    clk.advance(ARROW_RAIN.fallMs);
    expect(first.every((m) => !m.destroyed)).toBe(true);
    expect(fake.tweens.at(-1)?.config.alpha).toEqual({ from: 1, to: 0 });
    clk.advance(ARROW_RAIN.stuckMs);
    expect(first.every((m) => m.destroyed)).toBe(true);
  });

  it("should take every falling or stuck arrow and impact away on a stop", () => {
    rain.start({ x: 0, y: 0 }, { x: 200, y: 0 });
    clk.advance(300 + ARROW_RAIN.intervalMs - ARROW_RAIN.fallMs);
    rain.stop();
    expect(fake.live()).toEqual([]);
    expect(fx.playing()).toBe(0);
  });

  it("should be raining from the start until its last volley lands", () => {
    expect(rain.raining).toBe(false);
    rain.start({ x: 0, y: 0 }, { x: 200, y: 0 });
    expect(rain.raining).toBe(true);
    clk.advance(1500);
    expect(rain.raining).toBe(false);
  });
});

describe("Arrow Rain impact entry (FS-04EEA §H R45, R48)", () => {
  it("should be a dust one-shot in BARROW tokens, with no light", () => {
    const e = EFFECTS.arrowRainImpact;
    expect(e.timing.kind).toBe("oneShot");
    expect(e.particles.texture).toEqual(["fx_dust"]);
    for (const c of e.particles.tint) expect(c in BARROW_HEX).toBe(true);
    expect("light" in e).toBe(false);
  });
});
