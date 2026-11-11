import { EventEmitter } from "eventemitter3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { viewport } from "@/render/viewport";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import type { CardInk } from "@/render/effects/cardDust";
import { ARRIVAL_CARD, ArrivalCard, CARD_LAYOUT, type ArrivalCardScene, type CardDustPlayer } from "./arrivalCard";

// FS-PQ2TW §B R10, R12, R14–R17; §E R37, R38; ADR-0073 Decisions 3, 6. I-PQ2TW-1: the arrival
// card as one piece no scene owns, on a recording stand-in for the slice of a scene it draws with.
// FS-PQ2TW §D R24, R29–R31, R35, R36. I-PQ2TW-5: the card leaves as dust, through a stand-in dust.

interface Part {
  kind: "rectangle" | "text" | "graphics";
  args: unknown[];
  destroyed: boolean;
  /** Every call made on it, in order: the method and its arguments. */
  calls: [string, unknown[]][];
  /** The object the piece holds: what its tweens target. */
  obj: object;
}

interface Timer {
  delay: number;
  fn: () => void;
  removed: boolean;
}

/** A stand-in for the dust: whether it plays, and what it was asked. */
function fakeDust(plays = true) {
  const asked: { ink: CardInk; depth: number; gone: () => void }[] = [];
  const dust = {
    play: vi.fn((ink: CardInk, depth: number, gone: () => void): boolean => {
      asked.push({ ink, depth, gone });
      return plays;
    }),
    stop: vi.fn(),
    forget: vi.fn(),
  } satisfies CardDustPlayer;
  return { dust, asked };
}

interface Tween {
  targets: unknown;
  alpha: number;
  duration: number;
  delay?: number;
  onComplete?: () => void;
}

function fakeScene() {
  const parts: Part[] = [];
  const tweens: Tween[] = [];
  const timers: Timer[] = [];
  const clock = { now: 0 };
  const make = (kind: Part["kind"]) => (...args: unknown[]) => {
    const part: Part = { kind, args, destroyed: false, calls: [], obj: {} };
    part.obj = new Proxy(
      {},
      {
        get: (_, prop) => {
          if (prop === "active") return !part.destroyed;
          if (prop === "destroy") return () => void (part.destroyed = true);
          return (...callArgs: unknown[]) => {
            part.calls.push([String(prop), callArgs]);
            return part.obj;
          };
        },
      },
    );
    parts.push(part);
    return part.obj;
  };
  const events = new EventEmitter();
  const scene = {
    add: { rectangle: make("rectangle"), text: make("text"), graphics: make("graphics") },
    tweens: { add: (config: Tween) => (tweens.push(config), config) },
    time: {
      get now() {
        return clock.now;
      },
      delayedCall: (delay: number, fn: () => void) => {
        const timer = { delay, fn, removed: false };
        timers.push(timer);
        return { remove: () => void (timer.removed = true) };
      },
    },
    events,
  } as unknown as ArrivalCardScene;
  const last = (part: Part, method: string) => part.calls.filter(([m]) => m === method).at(-1)?.[1];
  /** The parts of the card now up, in the order the piece makes them. */
  const standing = () => parts.filter((p) => !p.destroyed);
  const fades = (part: Part | undefined) => tweens.filter((t) => t.targets === part?.obj && t.alpha === 0);
  /** The tweens on the three card parts together, by the alpha they go to. */
  const cardTweens = (card: Part[], alpha: number) =>
    tweens.filter(
      (t) => Array.isArray(t.targets) && t.alpha === alpha && card.every((p, i) => (t.targets as object[])[i] === p.obj),
    );
  /** The card's leave, timed from the lift: still to come, in the order set. */
  const leaves = () => timers.filter((t) => !t.removed);
  return { scene, parts, tweens, timers, clock, events, last, standing, fades, cardTweens, leaves };
}

/** A card on a fresh stand-in, its dust declining unless told: the fade as today. */
function cardOnStage(plays = false) {
  const stage = fakeScene();
  const { dust, asked } = fakeDust(plays);
  const card = new ArrivalCard(stage.scene, dust);
  return { ...stage, card, dust, asked };
}

const WORDS = { title: "The Second Floor", line: "The dead walk heavier here." };

afterEach(() => {
  viewport.set({ width: 800, height: 600, renderScale: 1 });
});

describe("ArrivalCard (FS-PQ2TW §B, §E)", () => {
  it("should name the climb's five timings and its depth, as they are today (R10, R15)", () => {
    expect(ARRIVAL_CARD).toEqual({
      depth: 950,
      darkHoldMs: 250,
      cardFadeMs: 300,
      viewReturnMs: 900,
      cardHoldMs: 1400,
      cardLeaveMs: 600,
    });
  });

  it("should put the dark over the whole view, over the world and under the HUD (R15)", () => {
    viewport.set({ width: 800, height: 600, renderScale: 1 });
    const { card, parts, last } = cardOnStage();
    card.play(WORDS, { built: true });

    const veil = parts[0];
    expect(veil.kind).toBe("rectangle");
    expect(veil.args).toEqual([0, 0, 800, 600, palette.inkDeep, 1]);
    expect(last(veil, "setOrigin")).toEqual([0, 0]);
    expect(last(veil, "setScrollFactor")).toEqual([0]);
    expect(last(veil, "setDepth")).toEqual([ARRIVAL_CARD.depth]);
    expect(ARRIVAL_CARD.depth).toBeGreaterThan(900);
    expect(ARRIVAL_CARD.depth + 1).toBeLessThan(1000);
  });

  it("should name the card's place and type sizes as the owner tuned them (R10, Tunes 2026-11-12)", () => {
    expect(CARD_LAYOUT).toEqual({ rise: 0.3, headingPx: 34, linePx: 19 });
  });

  it("should draw the heading, the rule and the line as the climb's card is drawn (R10, R17)", () => {
    viewport.set({ width: 800, height: 600, renderScale: 1 });
    const { card, parts, last } = cardOnStage();
    card.play(WORDS, { built: true });

    // the card's centre 30% of the height above the middle: y 120 of 600
    const [, heading, rule, subtitle] = parts;
    expect(heading.args).toEqual([
      400,
      102,
      "The Second Floor",
      { fontFamily: CANVAS_FONT.body, fontSize: "34px", color: toCss(palette.hudText), letterSpacing: 4 },
    ]);
    expect(subtitle.args).toEqual([
      400,
      153,
      "The dead walk heavier here.",
      { fontFamily: CANVAS_FONT.body, fontSize: "19px", fontStyle: "italic", color: toCss(palette.hudLabel) },
    ]);
    expect(rule.kind).toBe("graphics");
    expect(last(rule, "lineStyle")).toEqual([1, palette.frame, 0.6]);
    expect(last(rule, "lineBetween")).toEqual([-90, 0, 90, 0]);
    expect(last(rule, "setPosition")).toEqual([400, 130]);
    for (const text of [heading, subtitle]) expect(last(text, "setOrigin")).toEqual([0.5]);
    for (const part of [heading, rule, subtitle]) {
      expect(last(part, "setScrollFactor")).toEqual([0]);
      expect(last(part, "setDepth")).toEqual([ARRIVAL_CARD.depth + 1]);
      expect(last(part, "setAlpha")).toEqual([0]);
    }
  });

  it("should fade the card in after the dark hold (R10)", () => {
    const { card, parts, cardTweens } = cardOnStage();
    card.play(WORDS, { built: false });

    const [rise] = cardTweens(parts.slice(1), 1);
    expect(rise).toMatchObject({ duration: 300, delay: 250 });
  });

  it("should bring the view back on schedule over a place already built (R12)", () => {
    const { card, parts, fades, leaves } = cardOnStage();
    card.play(WORDS, { built: true });

    expect(fades(parts[0])).toEqual([expect.objectContaining({ duration: 900, delay: 550 })]);
    expect(leaves().map((t) => t.delay)).toEqual([550 + 1400]);
  });

  it("should hold the dark until told the place is built, then lift less the time waited (R12)", () => {
    const { card, parts, clock, fades, leaves } = cardOnStage();
    clock.now = 1000;
    card.play(WORDS, { built: false });
    clock.now = 1100;
    expect(fades(parts[0])).toHaveLength(0);
    expect(leaves()).toHaveLength(0);

    card.built();

    expect(fades(parts[0])).toEqual([expect.objectContaining({ duration: 900, delay: 450 })]);
    expect(leaves().map((t) => t.delay)).toEqual([450 + 1400]);
  });

  it("should lift at once, the card's hold still whole, when the place was slow to build (R12)", () => {
    const { card, parts, clock, fades, leaves } = cardOnStage();
    card.play(WORDS, { built: false });
    clock.now = 4000;

    card.built();

    expect(fades(parts[0])).toEqual([expect.objectContaining({ delay: 0 })]);
    expect(leaves().map((t) => t.delay)).toEqual([1400]);
  });

  it("should lift once, however often the place says it is built", () => {
    const { card, parts, tweens, fades, leaves } = cardOnStage();
    card.built();
    expect(tweens).toHaveLength(0);

    card.play(WORDS, { built: false });
    card.built();
    card.built();

    expect(fades(parts[0])).toHaveLength(1);
    expect(leaves()).toHaveLength(1);
  });

  it("should be up from the play until the card has left, then leave nothing (R10)", () => {
    const { card, parts, standing, cardTweens, leaves, events } = cardOnStage();
    expect(card.up).toBe(false);

    card.play(WORDS, { built: true });
    expect(card.up).toBe(true);
    expect(standing()).toHaveLength(4);

    leaves()[0].fn();
    expect(card.up).toBe(true);
    cardTweens(parts.slice(1), 0)[0].onComplete!();
    expect(card.up).toBe(false);
    expect(standing()).toHaveLength(0);
    expect(events.listenerCount("shutdown") + events.listenerCount("destroy")).toBe(0);
  });

  it("should re-cover the view and re-centre the card on a view change (R16)", () => {
    viewport.set({ width: 800, height: 600, renderScale: 1 });
    const { card, parts, last } = cardOnStage();
    card.relayout();
    card.play(WORDS, { built: false });

    viewport.set({ width: 1000, height: 700, renderScale: 2 });
    card.relayout();

    const [veil, heading, rule, subtitle] = parts;
    expect(last(veil, "setSize")).toEqual([1000, 700]);
    // the card's centre at 20% of 700 from the top: 140
    expect(last(heading, "setPosition")).toEqual([500, 122]);
    expect(last(rule, "setPosition")).toEqual([500, 150]);
    expect(last(subtitle, "setPosition")).toEqual([500, 173]);
    for (const text of [heading, subtitle]) expect(last(text, "setResolution")).toEqual([2]);
  });

  it.each([
    [800, 600],
    [1080, 720],
    [1280, 720],
    [720, 360],
  ])("should stand the card's centre 20%% of a %sx%s view's height from the top, on a play and on a resize (R10, R16)", (width, height) => {
    viewport.set({ width: 1000, height: 500, renderScale: 1 });
    const { card, parts, last } = cardOnStage();
    card.play(WORDS, { built: true });
    const [, heading, rule, subtitle] = parts;
    // the card's centre is the rule's height less the rule's offset below it
    const centre = () => (last(rule, "setPosition") as [number, number])[1] - 10;
    expect(centre()).toBeCloseTo(0.2 * 500);

    viewport.set({ width, height, renderScale: 1 });
    card.relayout();

    expect(centre()).toBeCloseTo(0.2 * height);
    expect(last(heading, "setPosition")).toEqual([width / 2, 0.2 * height - 18]);
    expect(last(subtitle, "setPosition")).toEqual([width / 2, 0.2 * height + 33]);
  });

  it("should remove the card that is up when a new one starts", () => {
    const { card, parts, standing, timers } = cardOnStage();
    card.play(WORDS, { built: true });
    const first = parts.slice(0, 4);
    const [firstLeave] = timers;

    card.play({ title: "The Third Floor", line: "No stair climbs higher. Only the way out remains." }, { built: false });

    expect(first.every((p) => p.destroyed)).toBe(true);
    expect(standing()).toHaveLength(4);
    expect(standing()[1].args[2]).toBe("The Third Floor");
    // the first card's leaving is called off with it
    expect(firstLeave.removed).toBe(true);
    expect(card.up).toBe(true);
  });

  it("should let a replaced card's fade, ending late, take nothing of the new one", () => {
    const { card, parts, standing, cardTweens, leaves } = cardOnStage();
    card.play(WORDS, { built: true });
    leaves()[0].fn();
    const first = parts.slice(0, 4);

    card.play(WORDS, { built: false });
    cardTweens(first.slice(1), 0)[0].onComplete!();

    expect(standing()).toHaveLength(4);
    expect(card.up).toBe(true);
  });

  it("should not let a replaced card's wait lift the new one", () => {
    const { card, parts, fades } = cardOnStage();
    card.play(WORDS, { built: false });
    card.play(WORDS, { built: false });

    card.built();

    expect(fades(parts[0])).toHaveLength(0);
    expect(fades(parts[4])).toHaveLength(1);
  });

  it.each(["shutdown", "destroy"] as const)("should let the card go with its scene on a %s", (end) => {
    const { card, tweens, timers, events, dust } = cardOnStage(true);
    card.play(WORDS, { built: true });
    timers[0].fn();
    const before = tweens.length;

    events.emit(end);

    expect(card.up).toBe(false);
    // the dust went with the scene: let go of, never asked to stop
    expect(dust.forget).toHaveBeenCalled();
    expect(dust.stop).not.toHaveBeenCalled();
    card.built();
    card.relayout();
    expect(tweens).toHaveLength(before);
    expect(events.listenerCount("shutdown") + events.listenerCount("destroy")).toBe(0);
  });

  it("should count a replaced card's dark from the new card, as today", () => {
    const { card, parts, clock, cardTweens } = cardOnStage();
    card.play(WORDS, { built: true });
    clock.now = 1000;

    card.play(WORDS, { built: false });

    expect(cardTweens(parts.slice(5), 1)).toEqual([expect.objectContaining({ delay: 250 })]);
  });

  it("should take no input (R14)", () => {
    const { card, parts } = cardOnStage();
    card.play(WORDS, { built: true });

    const called = parts.flatMap((p) => p.calls.map(([method]) => method));
    expect(called.filter((m) => /interactive|^on$|^once$/i.test(m))).toEqual([]);
  });
});

// FS-PQ2TW §B R11, R13. I-PQ2TW-3: a run's arrival is dark from create, before its floor (and so
// its words) is known; the card comes at the first broadcast.
describe("the dark before the words (FS-PQ2TW R11, R13)", () => {
  it("should cover the whole view with the dark alone, over the world and under the HUD", () => {
    viewport.set({ width: 800, height: 600, renderScale: 1 });
    const { card, parts, tweens, timers, last } = cardOnStage();

    card.dark();

    expect(parts.map((p) => p.kind)).toEqual(["rectangle"]);
    expect(parts[0].args).toEqual([0, 0, 800, 600, palette.inkDeep, 1]);
    expect(last(parts[0], "setScrollFactor")).toEqual([0]);
    expect(last(parts[0], "setDepth")).toEqual([ARRIVAL_CARD.depth]);
    expect(card.up).toBe(true);
    // it holds: nothing fades, nothing leaves
    expect(tweens).toEqual([]);
    expect(timers).toEqual([]);
  });

  it("should not lift the dark alone when told the place is built: it waits for its words", () => {
    const { card, tweens } = cardOnStage();
    card.dark();

    card.built();

    expect(tweens).toEqual([]);
    expect(card.up).toBe(true);
  });

  it("should keep the dark up when the words come, and draw the card over it", () => {
    const { card, parts, standing } = cardOnStage();
    card.dark();

    card.play(WORDS, { built: false });

    expect(standing().map((p) => p.kind)).toEqual(["rectangle", "text", "graphics", "text"]);
    expect(standing()[1].args[2]).toBe(WORDS.title);
    // the dark that stands is whole: none of it was faded on the way
    expect(parts.filter((p) => p.kind === "rectangle").every((p) => !p.calls.some(([m]) => m === "setAlpha"))).toBe(true);
  });

  it("should fade the card in at once over a dark already held long enough", () => {
    const { card, clock, standing, cardTweens, fades, leaves } = cardOnStage();
    clock.now = 1000;
    card.dark();
    clock.now = 1400;

    card.play(WORDS, { built: true });

    const [veil, ...words] = standing();
    expect(cardTweens(words, 1)).toEqual([expect.objectContaining({ duration: 300, delay: 0 })]);
    // the view comes back once the card is in
    expect(fades(veil)).toEqual([expect.objectContaining({ duration: 900, delay: 300 })]);
    expect(leaves().map((t) => t.delay)).toEqual([300 + 1400]);
  });

  it("should count the dark hold from the dark, not from the words", () => {
    const { card, clock, standing, cardTweens } = cardOnStage();
    clock.now = 1000;
    card.dark();
    clock.now = 1100;

    card.play(WORDS, { built: false });

    expect(cardTweens(standing().slice(1), 1)).toEqual([expect.objectContaining({ delay: 150 })]);
  });

  it("should hold the dark for a place still unbuilt, then lift less the time waited (R12)", () => {
    const { card, clock, standing, fades, leaves } = cardOnStage();
    card.dark();
    clock.now = 100;
    card.play(WORDS, { built: false });
    const [veil] = standing();
    clock.now = 300;
    expect(fades(veil)).toHaveLength(0);

    card.built();

    // the card is in at 100 + 150 + 300 = 550: 250 left of it at 300
    expect(fades(veil)).toEqual([expect.objectContaining({ delay: 250 })]);
    expect(leaves().map((t) => t.delay)).toEqual([250 + 1400]);
  });

  it("should re-cover the view on a view change while the dark is alone (R16)", () => {
    viewport.set({ width: 800, height: 600, renderScale: 1 });
    const { card, parts, last } = cardOnStage();
    card.dark();

    viewport.set({ width: 1000, height: 700, renderScale: 1 });
    card.relayout();

    expect(last(parts[0], "setSize")).toEqual([1000, 700]);
  });

  it.each(["shutdown", "destroy"] as const)("should let the dark go with its scene on a %s", (end) => {
    const { card, events, tweens } = cardOnStage();
    card.dark();

    events.emit(end);

    expect(card.up).toBe(false);
    expect(events.listenerCount("shutdown") + events.listenerCount("destroy")).toBe(0);
    card.relayout();
    expect(tweens).toEqual([]);
  });

  it("should leave one teardown at a time across a dark and its card", () => {
    const { card, events } = cardOnStage();
    card.dark();
    card.play(WORDS, { built: true });

    expect([events.listenerCount("shutdown"), events.listenerCount("destroy")]).toEqual([1, 1]);
  });
});

describe("the card leaves as dust (FS-PQ2TW §D)", () => {
  it("should break heading, rule and line to dust together at the end of the hold, the text gone (R24, R25, R29)", () => {
    viewport.set({ width: 800, height: 600, renderScale: 1 });
    const { card, parts, leaves, asked, last, cardTweens } = cardOnStage(true);
    card.play(WORDS, { built: true });
    const [, heading, rule, subtitle] = parts;
    expect(asked).toEqual([]);

    leaves()[0].fn();

    expect(asked).toHaveLength(1);
    const [readHeading, readSubtitle, ...more] = asked[0].ink.texts;
    expect(readHeading).toBe(heading.obj);
    expect(readSubtitle).toBe(subtitle.obj);
    expect(more).toEqual([]);
    expect(asked[0].ink.rule).toEqual({ x1: 310, x2: 490, y: 130 });
    // over the veil, with the card, under the HUD
    expect(asked[0].depth).toBe(ARRIVAL_CARD.depth + 1);
    for (const part of [heading, rule, subtitle]) expect(last(part, "setVisible")).toEqual([false]);
    expect(cardTweens(parts.slice(1), 0)).toEqual([]);
  });

  it("should read the rule where the card stands now, after a view change", () => {
    viewport.set({ width: 800, height: 600, renderScale: 1 });
    const { card, leaves, asked } = cardOnStage(true);
    card.play(WORDS, { built: true });
    viewport.set({ width: 1000, height: 600, renderScale: 1 });
    card.relayout();

    leaves()[0].fn();

    expect(asked[0].ink.rule).toEqual({ x1: 410, x2: 590, y: 130 });
  });

  it("should take the card down once the dust has gone (R27)", () => {
    const { card, leaves, asked, standing } = cardOnStage(true);
    card.play(WORDS, { built: true });
    leaves()[0].fn();
    expect(card.up).toBe(true);

    asked[0].gone();

    expect(card.up).toBe(false);
    expect(standing()).toHaveLength(0);
  });

  it("should fade the card over 600 ms as today when the dust plays nothing (R31, R35)", () => {
    // reduced motion, a failed read, or no fx sheet: the dust declines, the card fades
    const { card, parts, leaves, asked, last, cardTweens } = cardOnStage(false);
    card.play(WORDS, { built: true });

    leaves()[0].fn();

    expect(asked).toHaveLength(1);
    expect(cardTweens(parts.slice(1), 0)).toEqual([expect.objectContaining({ duration: 600 })]);
    for (const part of parts.slice(1)) expect(last(part, "setVisible")).toBeUndefined();
  });

  it("should take the dust away when a new card starts, its end taking nothing of the new card (R9, R36)", () => {
    const { card, leaves, asked, dust, standing } = cardOnStage(true);
    card.play(WORDS, { built: true });
    leaves()[0].fn();

    card.play(WORDS, { built: false });

    expect(dust.stop).toHaveBeenCalled();
    asked[0].gone();
    expect(card.up).toBe(true);
    expect(standing()).toHaveLength(4);
  });

  it("should take the dust and the card away on a view change while the dust is in the air", () => {
    const { card, leaves, dust, standing } = cardOnStage(true);
    card.play(WORDS, { built: true });
    leaves()[0].fn();
    dust.stop.mockClear();

    card.relayout();

    expect(dust.stop).toHaveBeenCalled();
    expect(card.up).toBe(false);
    expect(standing()).toHaveLength(0);
  });

  it("should leave the dust alone on a view change before the card leaves", () => {
    const { card, dust } = cardOnStage(true);
    card.play(WORDS, { built: true });
    dust.stop.mockClear();

    card.relayout();

    expect(dust.stop).not.toHaveBeenCalled();
    expect(card.up).toBe(true);
  });
});

describe("the card belongs to no scene (FS-PQ2TW R37, R38; ADR-0073 Decision 3)", () => {
  const source = (path: string) => readFileSync(join(process.cwd(), "src", path), "utf8");

  it("should import no scene", () => {
    const imports = source("ui/arrivalCard.ts").match(/from "[^"]+"/g) ?? [];
    expect(imports.filter((i) => /Scene"$/.test(i))).toEqual([]);
  });

  it("should leave the run scene no card, veil or card-timing code of its own", () => {
    expect(source("scenes/BarrowspireScene.ts")).not.toMatch(
      /playFloorTransition|relayoutFloorVeil|floorVeil|veilRelease|FLOOR_(VEIL|DARK|CARD|VIEW)_/,
    );
  });

  it("should play the run's climb through the piece, with the table's words, leaving as dust (R30)", () => {
    const run = source("scenes/BarrowspireScene.ts");
    expect(run).toMatch(/new ArrivalCard\(this, new CardDust\(this, \(\) => this\.art\)\)/);
    expect(run).toMatch(/placeCard\(/);
    expect(run).not.toMatch(/\bfloorCard\(/);
  });
});
