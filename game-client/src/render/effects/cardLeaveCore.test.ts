import { describe, expect, it, vi } from "vitest";
import type { InkText } from "./cardDust";
import { LeaveCore, seedZone } from "./cardLeaveCore";
import { fakeArt } from "./fakeScene";
import type { FxArt } from "./runtime";

// FS-PQ2TW §D R35, §Change: Smoke R50, §Change: Ash R60. I-PQ2TW-5: what the card's three leaves
// do alike, in one piece: the sheet they draw from, the ink they read once, the fade they fall
// back to, logged once, the start points they hand out, and the end that takes them away.

/** A text's canvas, its ink from `rows` ('#' is ink), counting the reads of it. */
function stubText(rows: string[], { x = 100, y = 50 } = {}) {
  const width = rows[0].length;
  const height = rows.length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, py) => [...row].forEach((c, px) => c === "#" && (data[(py * width + px) * 4 + 3] = 255)));
  const getImageData = vi.fn(() => ({ data, width, height }) as ImageData);
  const text: InkText = {
    canvas: { width, height },
    context: { getImageData },
    style: { resolution: 1 },
    x,
    y,
    displayOriginX: 0,
    displayOriginY: 0,
    scaleX: 1,
    scaleY: 1,
  };
  return { text, getImageData, data };
}

const rule = { x1: 10, x2: 13, y: 80 };

function core() {
  const logger = { warn: vi.fn() };
  return { logger, core: new LeaveCore("card test", { logger, reducedMotion: () => false, random: () => 0.5 }) };
}

describe("LeaveCore: what the card's leaves share (FS-PQ2TW R35, R50, R60)", () => {
  it("should take its options, or the game's defaults", () => {
    const random = () => 0.25;
    const given = new LeaveCore("card test", { reducedMotion: () => true, random });
    expect(given.reducedMotion()).toBe(true);
    expect(given.random).toBe(random);

    const plain = new LeaveCore("card test");
    expect(plain.random).toBe(Math.random);
    expect(typeof plain.reducedMotion()).toBe("boolean");
  });

  it("should log each reason once, under the leave's name", () => {
    const { core: c, logger } = core();

    c.warn("read", "the card's strokes could not be read; the card fades", { error: 1 });
    c.warn("read", "the card's strokes could not be read; the card fades");
    c.warn("sheet", "missing");

    expect(logger.warn.mock.calls).toEqual([
      ["card test: the card's strokes could not be read; the card fades", { error: 1 }],
      ["card test: missing", undefined],
    ]);
  });

  describe("the sheet", () => {
    it("should give the sheet's texture and its variants' frames, once each", () => {
      const { core: c } = core();
      const same: FxArt = { has: () => true, resolve: () => fakeArt.resolve("fx_dust", { index: 0 }) };

      expect(c.sheet(fakeArt, "fx_dust")).toEqual({ texture: "art:fx-0", frames: ["fx_dust/idle/0/0"] });
      expect(c.sheet(same, "fx_dust")?.frames).toHaveLength(1);
    });

    it("should give nothing, logged once, with no art, no sheet or a placeholder", () => {
      const { core: c, logger } = core();
      const placeholder: FxArt = {
        has: () => true,
        resolve: () => ({ placeholder: true, texture: "art:placeholder", anchor: { x: 0.5, y: 0.5 } }),
      };

      expect(c.sheet(undefined, "fx_smoke")).toBeUndefined();
      expect(c.sheet({ has: () => false, resolve: fakeArt.resolve }, "fx_smoke")).toBeUndefined();
      expect(c.sheet(placeholder, "fx_smoke")).toBeUndefined();

      expect(logger.warn.mock.calls).toEqual([['card test: "fx_smoke" missing; the card fades', undefined]]);
    });
  });

  describe("the ink", () => {
    it("should read each text's canvas once, giving its strokes, the rule's line and the pixels it read", () => {
      const { core: c } = core();
      const heading = stubText(["##", ".#"]);
      const line = stubText(["#"], { x: 200 });

      const read = c.read({ texts: [heading.text, line.text], rule })!;

      expect(heading.getImageData).toHaveBeenCalledOnce();
      expect(line.getImageData).toHaveBeenCalledOnce();
      expect(read.pixels).toEqual([heading.data, line.data]);
      expect(read.cells).toEqual([
        { x: 100, y: 50, w: 1, h: 1 },
        { x: 101, y: 50, w: 1, h: 1 },
        { x: 101, y: 51, w: 1, h: 1 },
        { x: 200, y: 50, w: 1, h: 1 },
        { x: 10, y: 79.5, w: 1, h: 1 },
        { x: 11, y: 79.5, w: 1, h: 1 },
        { x: 12, y: 79.5, w: 1, h: 1 },
      ]);
    });

    it("should give nothing, logged once, for a read that throws, never a box around the text", () => {
      const { core: c, logger } = core();
      const tainted = stubText(["#"]).text;
      tainted.context = {
        getImageData: () => {
          throw new Error("tainted");
        },
      };

      expect(c.read({ texts: [tainted], rule })).toBeUndefined();
      expect(c.read({ texts: [tainted], rule })).toBeUndefined();

      expect(logger.warn).toHaveBeenCalledOnce();
      expect(logger.warn.mock.calls[0][0]).toBe("card test: the card's strokes could not be read; the card fades");
    });

    it("should give nothing, logged, for texts that drew no ink, the rule's line alone included", () => {
      const { core: c, logger } = core();

      expect(c.read({ texts: [stubText(["..", ".."]).text], rule })).toBeUndefined();

      expect(logger.warn.mock.calls).toEqual([["card test: the card's texts drew no ink; the card fades", undefined]]);
    });
  });

  it("should hand out its start points in turn, from the first again once all are out", () => {
    const zone = seedZone([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
    const at = { x: 0, y: 0 };

    const seen = [0, 1, 2].map(() => (zone.source.getRandomPoint(at), { ...at }));

    expect(zone.type).toBe("random");
    expect(seen).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 1, y: 2 },
    ]);
  });

  describe("the end", () => {
    function timed() {
      const timers: { delay: number; removed: boolean; fire(): void }[] = [];
      const time = {
        delayedCall: (delay: number, fire: () => void) => {
          const t = { delay, fire, removed: false };
          timers.push(t);
          return { remove: () => void (t.removed = true) };
        },
      };
      return { timers, time };
    }

    it("should take everything held away at its end, once, then say it is gone", () => {
      const { core: c } = core();
      const { timers, time } = timed();
      const order: string[] = [];
      c.hold(() => order.push("emitter"));
      c.hold(() => order.push("tween"));

      c.endAt(time, 1800, () => order.push("gone"));
      expect(timers[0].delay).toBe(1800);
      timers[0].fire();
      c.stop();

      expect(order).toEqual(["emitter", "tween", "gone"]);
    });

    it("should take everything away at once on a stop, its end called off, and not say it is gone", () => {
      const { core: c } = core();
      const { timers, time } = timed();
      const gone = vi.fn();
      const taken = vi.fn();
      c.hold(taken);
      c.endAt(time, 1800, gone);

      c.stop();
      c.stop();

      expect(taken).toHaveBeenCalledOnce();
      expect(timers[0].removed).toBe(true);
      expect(gone).not.toHaveBeenCalled();
    });

    it("should let go of everything without touching it once the scene has ended", () => {
      const { core: c } = core();
      const { timers, time } = timed();
      const taken = vi.fn();
      c.hold(taken);
      c.endAt(time, 1800, vi.fn());

      c.forget();
      c.stop();

      expect(taken).not.toHaveBeenCalled();
      expect(timers[0].removed).toBe(false);
    });
  });
});
