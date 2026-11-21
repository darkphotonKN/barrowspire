import { describe, expect, it } from "vitest";
import { ARROW_RAIN_RADIUS, ARROW_RAIN_REACH, ArrowRainAim, arrowRainCentre } from "./arrowRainAim";

describe("arrowRainCentre (FS-04EEA R38, §E.23)", () => {
  it("should pull a cursor 500 px away in to 300 px from the archer along the line", () => {
    expect(arrowRainCentre({ x: 0, y: 0 }, { x: 500, y: 0 })).toEqual({ x: 300, y: 0 });
  });

  it("should keep the line's direction when it pulls a far cursor in", () => {
    const c = arrowRainCentre({ x: 100, y: 100 }, { x: 400, y: 500 });
    expect(Math.hypot(c.x - 100, c.y - 100)).toBeCloseTo(ARROW_RAIN_REACH);
    expect(c.x).toBeCloseTo(100 + 0.6 * ARROW_RAIN_REACH);
    expect(c.y).toBeCloseTo(100 + 0.8 * ARROW_RAIN_REACH);
  });

  it("should leave a cursor within reach where it is", () => {
    expect(arrowRainCentre({ x: 0, y: 0 }, { x: 120, y: -90 })).toEqual({ x: 120, y: -90 });
    expect(arrowRainCentre({ x: 0, y: 0 }, { x: 300, y: 0 })).toEqual({ x: 300, y: 0 });
  });

  it("should centre on the archer for a cursor on the archer", () => {
    expect(arrowRainCentre({ x: 40, y: 60 }, { x: 40, y: 60 })).toEqual({ x: 40, y: 60 });
  });

  it("should be the server's circle: 70 px across 300 px of reach (§E)", () => {
    expect(ARROW_RAIN_RADIUS).toBe(70);
    expect(ARROW_RAIN_REACH).toBe(300);
  });
});

describe("ArrowRainAim (FS-04EEA R38)", () => {
  it("should start an aim on the press, and answer no second press while one runs", () => {
    const aim = new ArrowRainAim();
    expect(aim.aiming).toBe(false);
    expect(aim.press()).toBe(true);
    expect(aim.aiming).toBe(true);
    expect(aim.press()).toBe(false);
  });

  it("should answer a release with a cast when the gates hold, with no minimum hold", () => {
    const aim = new ArrowRainAim();
    aim.press();
    expect(aim.release(true)).toBe("cast");
    expect(aim.aiming).toBe(false);
  });

  it("should answer a release with a cancel when the gates no longer hold", () => {
    const aim = new ArrowRainAim();
    aim.press();
    expect(aim.release(false)).toBe("cancel");
    expect(aim.aiming).toBe(false);
  });

  it("should answer a release with nothing when no aim runs", () => {
    expect(new ArrowRainAim().release(true)).toBeNull();
  });

  it("should end an aim on a cancel (a blur, a floor change), with nothing to cast after", () => {
    const aim = new ArrowRainAim();
    aim.press();
    expect(aim.cancel()).toBe(true);
    expect(aim.aiming).toBe(false);
    expect(aim.release(true)).toBeNull();
    expect(aim.cancel()).toBe(false);
  });
});
