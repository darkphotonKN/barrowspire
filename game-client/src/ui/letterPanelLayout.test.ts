import { describe, expect, it } from "vitest";
import {
  ENVELOPE_MARGIN,
  envelopeFrame,
  letterPanelFrame,
  listWindow,
  scrolledList,
  type Rect,
} from "./letterPanelLayout";

// FS-1GZGD R33, R36, R37, R39 (D11, D14). I-1GZGD-6 and -7: where the envelope and the letter panel's parts sit.

const SCREEN = { width: 1080, height: 720 };

const inside = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

describe("envelopeFrame (R33, D11)", () => {
  it("sits at the bottom-right of the screen", () => {
    const env = envelopeFrame(SCREEN);
    expect(env.x + env.width).toBe(SCREEN.width - ENVELOPE_MARGIN);
    expect(env.y + env.height).toBe(SCREEN.height - ENVELOPE_MARGIN);
    expect(inside(env, { x: 0, y: 0, ...SCREEN })).toBe(true);
  });
});

describe("letterPanelFrame (R36, R37)", () => {
  it("centres the panel, with the list left and the letter right, apart", () => {
    const f = letterPanelFrame(SCREEN, 0);
    expect(f.panel.x + f.panel.width / 2).toBe(SCREEN.width / 2);
    expect(f.panel.y + f.panel.height / 2).toBe(SCREEN.height / 2);
    for (const part of [f.close, f.list, f.detail, f.body])
      expect(inside(part, f.panel)).toBe(true);
    expect(f.list.x + f.list.width).toBeLessThan(f.detail.x);
    expect(overlaps(f.close, f.detail)).toBe(false);
  });

  it("has no Enclosed row without enclosures, and the body runs to the bottom", () => {
    const f = letterPanelFrame(SCREEN, 0);
    expect(f.enclosed).toBeNull();
    expect(f.body.y + f.body.height).toBe(f.detail.y + f.detail.height);
  });

  it("puts the Enclosed row under the body, a slot per enclosure, clear of the Take button's place", () => {
    const f = letterPanelFrame(SCREEN, 3);
    const enclosed = f.enclosed!;
    expect(enclosed.slots).toHaveLength(3);
    expect(f.body.y + f.body.height).toBeLessThanOrEqual(enclosed.caption.y);
    for (const slot of enclosed.slots) {
      expect(inside(slot, f.detail)).toBe(true);
      expect(overlaps(slot, enclosed.take)).toBe(false);
    }
    expect(inside(enclosed.take, f.detail)).toBe(true);
  });

  it("wraps ten enclosures onto a second row without overlap, every slot inside the letter", () => {
    const f = letterPanelFrame(SCREEN, 10);
    const slots = f.enclosed!.slots;
    expect(new Set(slots.map((s) => s.y)).size).toBe(2);
    slots.forEach((a, i) =>
      slots.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)),
    );
    for (const slot of slots) expect(inside(slot, f.detail)).toBe(true);
    expect(f.body.height).toBeGreaterThan(60);
  });

  it("puts a refused Take's warning line over the Take button, right-aligned with it and clear of the caption", () => {
    const enclosed = letterPanelFrame(SCREEN, 3).enclosed!;
    const { warning, take, caption } = enclosed;
    expect(warning.x + warning.width).toBe(take.x + take.width);
    expect(warning.y + warning.height).toBeLessThanOrEqual(take.y);
    expect(warning.y).toBe(caption.y);
    expect(warning.x).toBeGreaterThan(caption.x + 80);
  });

  it.each([1, 3, 10])(
    "centres the Taken stamp over the slots of %i enclosures",
    (n) => {
      const { slots, stamp } = letterPanelFrame(SCREEN, n).enclosed!;
      const left = Math.min(...slots.map((s) => s.x));
      const right = Math.max(...slots.map((s) => s.x + s.width));
      const top = Math.min(...slots.map((s) => s.y));
      const bottom = Math.max(...slots.map((s) => s.y + s.height));
      expect(stamp.x).toBe((left + right) / 2);
      expect(stamp.y).toBe((top + bottom) / 2);
      expect(stamp.radius).toBeGreaterThan(0);
    },
  );

  it("stacks list rows down the list, as many as fit", () => {
    const f = letterPanelFrame(SCREEN, 0);
    const rows = f.rows;
    expect(rows.length).toBeGreaterThan(5);
    for (const row of rows) expect(inside(row, f.list)).toBe(true);
    expect(rows[1].y).toBe(rows[0].y + rows[0].height);
  });
});

describe("the list window", () => {
  it.each([
    [3, 0, 8, { first: 0, count: 3 }],
    [20, 0, 8, { first: 0, count: 8 }],
    [20, 15, 8, { first: 12, count: 8 }],
    [20, -4, 8, { first: 0, count: 8 }],
  ])("%i letters from %i, %i visible", (letters, offset, visible, want) => {
    expect(listWindow(letters, offset, visible)).toEqual(want);
  });

  it("scrolls a row a wheel step, never past either end", () => {
    expect(scrolledList(0, 1, 20, 8)).toBe(1);
    expect(scrolledList(0, -1, 20, 8)).toBe(0);
    expect(scrolledList(12, 1, 20, 8)).toBe(12);
    expect(scrolledList(5, 1, 3, 8)).toBe(0);
  });
});
