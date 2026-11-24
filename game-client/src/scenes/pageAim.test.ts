import { describe, expect, it } from "vitest";
import { ALLY_REACH_CELLS, PageAim, pageReticle, type AimScene } from "./pageAim";

// FS-X2CMM §H R40–R41 (I-X2CMM-11): a ready page clicked in the book arms (ground, ally, interactable)
// or casts at once (none, self); while armed the reticle stands at the pointer or under the body nearest
// it, and a click on a valid target hands the cast back and disarms. Client presentation only (ADR-0030).

const CELL = 80;
const me = { id: "me", at: { x: 1000, y: 1000 }, self: true };
const ally = { id: "ally", at: { x: 1200, y: 1000 } };

function scene(cursor: { x: number; y: number }, extra: Partial<AimScene> = {}): AimScene {
  return { from: me.at, cursor, cell: CELL, allies: [me, ally], ...extra };
}

describe("PageAim's press (FS-X2CMM R40)", () => {
  it("should arm a ground page and an ally page", () => {
    const aim = new PageAim();
    expect(aim.press("witchlight")).toBe("armed");
    expect(aim.armed).toBe("witchlight");
    expect(aim.press("levitate")).toBe("armed");
    expect(aim.armed).toBe("levitate");
  });

  it("should never arm a none or a self page: the press is its cast, and an armed page disarms", () => {
    const aim = new PageAim();
    aim.press("witchlight");
    expect(aim.press("recall")).toBe("cast");
    expect(aim.armed).toBeNull();
    expect(aim.press("hardened")).toBe("cast");
    expect(aim.armed).toBeNull();
  });

  it("should disarm, saying whether a page was armed", () => {
    const aim = new PageAim();
    expect(aim.disarm()).toBe(false);
    aim.press("witchlight");
    expect(aim.disarm()).toBe(true);
    expect(aim.armed).toBeNull();
  });
});

describe("pageReticle (FS-X2CMM R41)", () => {
  it("should ring a ground page's effect size at the pointer, valid within its range", () => {
    // Witchlight: a 3-cell glow, 8 cells of range
    const r = pageReticle("witchlight", scene({ x: 1000 + 5 * CELL, y: 1000 }));
    expect(r).toEqual({ page: "witchlight", kind: "ground", at: { x: 1400, y: 1000 }, radius: 3 * CELL, valid: true });
  });

  it("should be faint (invalid) beyond the page's range, and on ground that is not walkable", () => {
    expect(pageReticle("witchlight", scene({ x: 1000 + 9 * CELL, y: 1000 })).valid).toBe(false);
    const wall = scene({ x: 1100, y: 1000 }, { walkable: () => false });
    expect(pageReticle("witchlight", wall).valid).toBe(false);
  });

  it("should snap an ally page's ring under the teammate nearest the pointer within a body's reach", () => {
    const near = { x: 1200 + ALLY_REACH_CELLS * CELL * 0.5, y: 1000 };
    const r = pageReticle("levitate", scene(near));
    expect(r).toMatchObject({ kind: "ally", at: ally.at, valid: true, targetId: "ally" });
  });

  it("should take the player where the page allows self (Levitate)", () => {
    const r = pageReticle("levitate", scene({ x: 1010, y: 1000 }));
    expect(r).toMatchObject({ at: me.at, valid: true, targetId: "me" });
  });

  it("should leave a faint ring at the pointer with no body in reach, or a body beyond range", () => {
    const none = pageReticle("levitate", scene({ x: 1600, y: 1600 }));
    expect(none).toMatchObject({ at: { x: 1600, y: 1600 }, valid: false });
    expect(none.targetId).toBeUndefined();
    const far = { id: "far", at: { x: 1000 + 7 * CELL, y: 1000 } };
    const beyond = pageReticle("levitate", scene(far.at, { allies: [me, far] }));
    expect(beyond).toMatchObject({ at: far.at, valid: false, targetId: "far" });
  });

  it("should find no target for an interactable page where the scene names none (wave 2)", () => {
    expect(pageReticle("far_hand", scene(ally.at)).valid).toBe(false);
    const lever = { id: "lever", at: { x: 1100, y: 1000 } };
    expect(pageReticle("far_hand", scene(lever.at, { interactables: [lever] }))).toMatchObject({ valid: true, targetId: "lever" });
  });
});

describe("PageAim's click (FS-X2CMM R41)", () => {
  it("should hand back a valid target and disarm", () => {
    const aim = new PageAim();
    aim.press("witchlight");
    const at = { x: 1000 + 5 * CELL, y: 1000 };
    expect(aim.click(scene(at))).toMatchObject({ page: "witchlight", at, valid: true });
    expect(aim.armed).toBeNull();
  });

  it("should do nothing on no valid target and keep the page armed", () => {
    const aim = new PageAim();
    aim.press("witchlight");
    expect(aim.click(scene({ x: 1000 + 9 * CELL, y: 1000 }))).toBeNull();
    expect(aim.armed).toBe("witchlight");
  });

  it("should have no reticle and take no click while nothing is armed", () => {
    const aim = new PageAim();
    expect(aim.reticle(scene(ally.at))).toBeNull();
    expect(aim.click(scene(ally.at))).toBeNull();
  });
});
