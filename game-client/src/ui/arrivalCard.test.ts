import { EventEmitter } from "eventemitter3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { viewport } from "@/render/viewport";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { ARRIVAL_CARD, ArrivalCard, type ArrivalCardScene } from "./arrivalCard";

// FS-PQ2TW §B R10, R12, R14–R17; §E R37, R38; ADR-0073 Decisions 3, 6. I-PQ2TW-1: the arrival
// card as one piece no scene owns, on a recording stand-in for the slice of a scene it draws with.

interface Part {
  kind: "rectangle" | "text" | "graphics";
  args: unknown[];
  destroyed: boolean;
  /** Every call made on it, in order: the method and its arguments. */
  calls: [string, unknown[]][];
  /** The object the piece holds: what its tweens target. */
  obj: object;
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
    time: { get now() { return clock.now; } },
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
  return { scene, parts, tweens, clock, events, last, standing, fades, cardTweens };
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
    const { scene, parts, last } = fakeScene();
    new ArrivalCard(scene).play(WORDS, { built: true });

    const veil = parts[0];
    expect(veil.kind).toBe("rectangle");
    expect(veil.args).toEqual([0, 0, 800, 600, palette.inkDeep, 1]);
    expect(last(veil, "setOrigin")).toEqual([0, 0]);
    expect(last(veil, "setScrollFactor")).toEqual([0]);
    expect(last(veil, "setDepth")).toEqual([ARRIVAL_CARD.depth]);
    expect(ARRIVAL_CARD.depth).toBeGreaterThan(900);
    expect(ARRIVAL_CARD.depth + 1).toBeLessThan(1000);
  });

  it("should draw the heading, the rule and the line as the climb's card is drawn (R10, R17)", () => {
    viewport.set({ width: 800, height: 600, renderScale: 1 });
    const { scene, parts, last } = fakeScene();
    new ArrivalCard(scene).play(WORDS, { built: true });

    const [, heading, rule, subtitle] = parts;
    expect(heading.args).toEqual([
      400,
      286,
      "The Second Floor",
      { fontFamily: CANVAS_FONT.body, fontSize: "26px", color: toCss(palette.hudText), letterSpacing: 4 },
    ]);
    expect(subtitle.args).toEqual([
      400,
      326,
      "The dead walk heavier here.",
      { fontFamily: CANVAS_FONT.body, fontSize: "15px", fontStyle: "italic", color: toCss(palette.hudLabel) },
    ]);
    expect(rule.kind).toBe("graphics");
    expect(last(rule, "lineStyle")).toEqual([1, palette.frame, 0.6]);
    expect(last(rule, "lineBetween")).toEqual([-90, 308, 90, 308]);
    expect(last(rule, "setX")).toEqual([400]);
    for (const text of [heading, subtitle]) expect(last(text, "setOrigin")).toEqual([0.5]);
    for (const part of [heading, rule, subtitle]) {
      expect(last(part, "setScrollFactor")).toEqual([0]);
      expect(last(part, "setDepth")).toEqual([ARRIVAL_CARD.depth + 1]);
      expect(last(part, "setAlpha")).toEqual([0]);
    }
  });

  it("should fade the card in after the dark hold (R10)", () => {
    const { scene, parts, cardTweens } = fakeScene();
    new ArrivalCard(scene).play(WORDS, { built: false });

    const [rise] = cardTweens(parts.slice(1), 1);
    expect(rise).toMatchObject({ duration: 300, delay: 250 });
  });

  it("should bring the view back on schedule over a place already built (R12)", () => {
    const { scene, parts, fades, cardTweens } = fakeScene();
    new ArrivalCard(scene).play(WORDS, { built: true });

    expect(fades(parts[0])).toEqual([expect.objectContaining({ duration: 900, delay: 550 })]);
    expect(cardTweens(parts.slice(1), 0)).toEqual([
      expect.objectContaining({ duration: 600, delay: 550 + 1400 }),
    ]);
  });

  it("should hold the dark until told the place is built, then lift less the time waited (R12)", () => {
    const { scene, parts, clock, fades, cardTweens } = fakeScene();
    const card = new ArrivalCard(scene);
    clock.now = 1000;
    card.play(WORDS, { built: false });
    clock.now = 1100;
    expect(fades(parts[0])).toHaveLength(0);
    expect(cardTweens(parts.slice(1), 0)).toHaveLength(0);

    card.built();

    expect(fades(parts[0])).toEqual([expect.objectContaining({ duration: 900, delay: 450 })]);
    expect(cardTweens(parts.slice(1), 0)).toEqual([
      expect.objectContaining({ duration: 600, delay: 450 + 1400 }),
    ]);
  });

  it("should lift at once, the card's hold still whole, when the place was slow to build (R12)", () => {
    const { scene, parts, clock, fades, cardTweens } = fakeScene();
    const card = new ArrivalCard(scene);
    card.play(WORDS, { built: false });
    clock.now = 4000;

    card.built();

    expect(fades(parts[0])).toEqual([expect.objectContaining({ delay: 0 })]);
    expect(cardTweens(parts.slice(1), 0)).toEqual([expect.objectContaining({ delay: 1400 })]);
  });

  it("should lift once, however often the place says it is built", () => {
    const { scene, parts, tweens, fades } = fakeScene();
    const card = new ArrivalCard(scene);
    card.built();
    expect(tweens).toHaveLength(0);

    card.play(WORDS, { built: false });
    card.built();
    card.built();

    expect(fades(parts[0])).toHaveLength(1);
  });

  it("should be up from the play until the card has left, then leave nothing (R10)", () => {
    const { scene, parts, standing, cardTweens, events } = fakeScene();
    const card = new ArrivalCard(scene);
    expect(card.up).toBe(false);

    card.play(WORDS, { built: true });
    expect(card.up).toBe(true);
    expect(standing()).toHaveLength(4);

    cardTweens(parts.slice(1), 0)[0].onComplete!();
    expect(card.up).toBe(false);
    expect(standing()).toHaveLength(0);
    expect(events.listenerCount("shutdown") + events.listenerCount("destroy")).toBe(0);
  });

  it("should re-cover the view and re-centre the card on a view change (R16)", () => {
    viewport.set({ width: 800, height: 600, renderScale: 1 });
    const { scene, parts, last } = fakeScene();
    const card = new ArrivalCard(scene);
    card.relayout();
    card.play(WORDS, { built: false });

    viewport.set({ width: 1000, height: 700, renderScale: 2 });
    card.relayout();

    const [veil, heading, rule, subtitle] = parts;
    expect(last(veil, "setSize")).toEqual([1000, 700]);
    for (const part of [heading, rule, subtitle]) expect(last(part, "setX")).toEqual([500]);
    for (const text of [heading, subtitle]) expect(last(text, "setResolution")).toEqual([2]);
  });

  it("should remove the card that is up when a new one starts", () => {
    const { scene, parts, standing, cardTweens } = fakeScene();
    const card = new ArrivalCard(scene);
    card.play(WORDS, { built: true });
    const first = parts.slice(0, 4);

    card.play({ title: "The Third Floor", line: "No stair climbs higher. Only the way out remains." }, { built: false });

    expect(first.every((p) => p.destroyed)).toBe(true);
    expect(standing()).toHaveLength(4);
    expect(standing()[1].args[2]).toBe("The Third Floor");

    // the first card's leaving, ending late, takes nothing of the second
    cardTweens(first.slice(1), 0)[0].onComplete!();
    expect(standing()).toHaveLength(4);
    expect(card.up).toBe(true);
  });

  it("should not let a replaced card's wait lift the new one", () => {
    const { scene, parts, fades } = fakeScene();
    const card = new ArrivalCard(scene);
    card.play(WORDS, { built: false });
    card.play(WORDS, { built: false });

    card.built();

    expect(fades(parts[0])).toHaveLength(0);
    expect(fades(parts[4])).toHaveLength(1);
  });

  it.each(["shutdown", "destroy"] as const)("should let the card go with its scene on a %s", (end) => {
    const { scene, tweens, events } = fakeScene();
    const card = new ArrivalCard(scene);
    card.play(WORDS, { built: false });
    const before = tweens.length;

    events.emit(end);

    expect(card.up).toBe(false);
    card.built();
    card.relayout();
    expect(tweens).toHaveLength(before);
    expect(events.listenerCount("shutdown") + events.listenerCount("destroy")).toBe(0);
  });

  it("should take no input (R14)", () => {
    const { scene, parts } = fakeScene();
    const card = new ArrivalCard(scene);
    card.play(WORDS, { built: true });

    const called = parts.flatMap((p) => p.calls.map(([method]) => method));
    expect(called.filter((m) => /interactive|^on$|^once$/i.test(m))).toEqual([]);
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

  it("should play the run's climb through the piece, with the table's words", () => {
    const run = source("scenes/BarrowspireScene.ts");
    expect(run).toMatch(/new ArrivalCard\(this\)/);
    expect(run).toMatch(/placeCard\(/);
    expect(run).not.toMatch(/\bfloorCard\(/);
  });
});
