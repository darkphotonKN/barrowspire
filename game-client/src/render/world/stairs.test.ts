import { describe, expect, it } from "vitest";
import type { Point } from "@/render/iso/projection";
import type { StairsState } from "@/types/gameState";
import { INTERACT_RANGE, StairsSet, type StairsStage } from "./stairs";

/** A stage that records what the scene would have drawn. */
function fakeStage() {
  const made: { at: Point; destroyed: boolean; destroy(): void }[] = [];
  const stage: StairsStage<(typeof made)[number]> = {
    add(at) {
      const sprite = {
        at,
        destroyed: false,
        destroy() {
          sprite.destroyed = true;
        },
      };
      made.push(sprite);
      return sprite;
    },
    stand(sprite, at) {
      sprite.at = at;
    },
  };
  const live = () => made.filter((s) => !s.destroyed);
  return { stage, made, live };
}

const stairs = (entity_id: string, x: number, y: number): StairsState => ({
  entity_id,
  position: { x, y },
});

describe("StairsSet (FS-F6F88 req 30)", () => {
  it("should draw one stairs per entity in the broadcast", () => {
    const { stage, live } = fakeStage();
    const set = new StairsSet(stage);
    set.sync([stairs("s1", 100, 200)]);
    expect(live()).toHaveLength(1);
    expect(live()[0].at).toEqual({ x: 100, y: 200 });
  });

  it("should keep the same sprite across ticks rather than redraw it", () => {
    const { stage, made } = fakeStage();
    const set = new StairsSet(stage);
    set.sync([stairs("s1", 100, 200)]);
    set.sync([stairs("s1", 100, 200)]);
    set.sync([stairs("s1", 100, 200)]);
    expect(made).toHaveLength(1);
  });

  it("should remove stairs that leave the broadcast", () => {
    const { stage, made, live } = fakeStage();
    const set = new StairsSet(stage);
    set.sync([stairs("s1", 100, 200)]);
    set.sync([stairs("s2", 400, 50)]);
    expect(made[0].destroyed).toBe(true);
    expect(live().map((s) => s.at)).toEqual([{ x: 400, y: 50 }]);
  });

  it("should draw nothing on the top floor, where the stairs list is empty", () => {
    const { stage, live } = fakeStage();
    const set = new StairsSet(stage);
    set.sync([stairs("s1", 100, 200)]);
    set.sync([]);
    expect(live()).toHaveLength(0);
    expect(set.nearby({ x: 100, y: 200 })).toBeNull();
  });

  it("should follow the server if the stairs' position changes", () => {
    const { stage, live } = fakeStage();
    const set = new StairsSet(stage);
    set.sync([stairs("s1", 100, 200)]);
    set.sync([stairs("s1", 300, 200)]);
    expect(live()[0].at).toEqual({ x: 300, y: 200 });
    expect(set.nearby({ x: 300, y: 200 })).toBe("s1");
  });

  describe("nearby — what the interact key reaches", () => {
    const set = () => {
      const s = new StairsSet(fakeStage().stage);
      s.sync([stairs("s1", 100, 100)]);
      return s;
    };

    it("should reach stairs within the interact range of their centre", () => {
      expect(set().nearby({ x: 100 + INTERACT_RANGE - 1, y: 100 })).toBe("s1");
    });

    it("should not reach stairs beyond the interact range", () => {
      expect(set().nearby({ x: 100 + INTERACT_RANGE + 1, y: 100 })).toBeNull();
    });

    it("should use the same range as the switch and the escape door", () => {
      expect(INTERACT_RANGE).toBe(60);
    });
  });

  it("should destroy and forget every stairs on clear", () => {
    const { stage, live } = fakeStage();
    const set = new StairsSet(stage);
    set.sync([stairs("s1", 100, 200)]);
    set.clear();
    expect(live()).toHaveLength(0);
    expect(set.nearby({ x: 100, y: 200 })).toBeNull();
  });

  it("should let go without destroying, when the scene has already destroyed its objects", () => {
    const { stage, made } = fakeStage();
    const set = new StairsSet(stage);
    set.sync([stairs("s1", 100, 200)]);
    set.forget();
    expect(made[0].destroyed).toBe(false);
    expect(set.nearby({ x: 100, y: 200 })).toBeNull();
    set.sync([stairs("s1", 100, 200)]);
    expect(made).toHaveLength(2);
  });
});
