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
    const lever = { id: "lever", at: { x: 1100, y: 1000 }, kind: "lever" } as const;
    expect(pageReticle("far_hand", scene(lever.at, { interactables: [lever] }))).toMatchObject({ valid: true, targetId: "lever" });
  });

  // I-X2CMM-15: each interactable page picks only the kinds it names (PAGE_COPY targets), within its range
  it("should snap Far Hand under the lever, chest, door or trap nearest the pointer, valid within 6 cells", () => {
    for (const kind of ["lever", "chest", "door", "trap"] as const) {
      const near = { id: kind, at: { x: 1000 + 5 * CELL, y: 1000 }, kind };
      expect(pageReticle("far_hand", scene(near.at, { interactables: [near] }))).toMatchObject({
        kind: "interactable",
        at: near.at,
        radius: 0.6 * CELL,
        valid: true,
        targetId: kind,
      });
    }
    const far = { id: "far", at: { x: 1000 + 6 * CELL + 1, y: 1000 }, kind: "lever" } as const;
    expect(pageReticle("far_hand", scene(far.at, { interactables: [far] }))).toMatchObject({ valid: false, targetId: "far" });
  });

  it("should pass over an interactable a page does not name: Far Hand no stone block, Heave no lever", () => {
    const block = { id: "block", at: { x: 1050, y: 1000 }, kind: "stone_block" } as const;
    const lever = { id: "lever", at: { x: 1060, y: 1000 }, kind: "lever" } as const;
    const untagged = { id: "untagged", at: { x: 1055, y: 1000 } };
    const interactables = [block, lever, untagged];
    expect(pageReticle("far_hand", scene(block.at, { interactables }))).toMatchObject({ valid: true, targetId: "lever" });
    expect(pageReticle("heave", scene(lever.at, { interactables }))).toMatchObject({ valid: true, targetId: "block" });
  });

  it("should judge Heave's stone block within 1.5 cells of the player", () => {
    const beside = { id: "near", at: { x: 1000 + 1.5 * CELL, y: 1000 }, kind: "stone_block" } as const;
    const beyond = { id: "beyond", at: { x: 1000 + 1.5 * CELL + 1, y: 1000 }, kind: "stone_block" } as const;
    expect(pageReticle("heave", scene(beside.at, { interactables: [beside] })).valid).toBe(true);
    expect(pageReticle("heave", scene(beyond.at, { interactables: [beyond] })).valid).toBe(false);
  });

  it("should pick nothing for a page that does not name the kind: Pick the Lock takes no lever", () => {
    const lever = { id: "lever", at: { x: 1050, y: 1000 }, kind: "lever" } as const;
    expect(pageReticle("pick_the_lock", scene(lever.at, { interactables: [lever] })).valid).toBe(false);
  });

  // I-X2CMM-19: Pick the Lock names a shut cage only (the sealed floors built no locked doors or chests),
  // within 1.5 cells of the player (FS-X2CMM §J R55, §B R12)
  it("should pick Pick the Lock's cage within 1.5 cells, and no chest or door beside it", () => {
    const cage = { id: "cage", at: { x: 1000 + 1.5 * CELL, y: 1000 }, kind: "cage" } as const;
    const chest = { id: "chest", at: { x: 1000 + 1.5 * CELL - 5, y: 1000 }, kind: "chest" } as const;
    const door = { id: "door", at: { x: 1000 + 1.5 * CELL + 5, y: 1000 }, kind: "door" } as const;
    expect(pageReticle("pick_the_lock", scene(cage.at, { interactables: [chest, door, cage] }))).toMatchObject({
      valid: true,
      targetId: "cage",
    });
    const beyond = { id: "beyond", at: { x: 1000 + 1.5 * CELL + 1, y: 1000 }, kind: "cage" } as const;
    expect(pageReticle("pick_the_lock", scene(beyond.at, { interactables: [beyond] })).valid).toBe(false);
    expect(pageReticle("far_hand", scene(cage.at, { interactables: [cage] })).valid).toBe(false);
  });
});

// I-X2CMM-20: Strike a Deal names a willing Cutthroat within 4 cells (FS-X2CMM §J R56, §B R11)
describe("Strike a Deal's reticle (FS-X2CMM R41, R56)", () => {
  it("should pick a willing Cutthroat within 4 cells, never one beyond, nor a cage", () => {
    const near = { id: "near", at: { x: 1000 + 4 * CELL, y: 1000 }, kind: "willing_cutthroat" } as const;
    const cage = { id: "cage", at: { x: 1000 + 4 * CELL - 5, y: 1000 }, kind: "cage" } as const;
    expect(pageReticle("strike_a_deal", scene(near.at, { interactables: [cage, near] }))).toMatchObject({
      valid: true,
      targetId: "near",
    });
    const beyond = { id: "beyond", at: { x: 1000 + 4 * CELL + 1, y: 1000 }, kind: "willing_cutthroat" } as const;
    expect(pageReticle("strike_a_deal", scene(beyond.at, { interactables: [beyond] })).valid).toBe(false);
    expect(pageReticle("pick_the_lock", scene(near.at, { interactables: [near] })).valid).toBe(false);
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
