import { describe, expect, it } from "vitest";
import { DRAWN_ROLL_MS, RollBodies, RollTumble, tumbleMiddle, tumblePose, tumbleSpin } from "./rollDraw";
import { ROLL_DURATION_MS } from "./rollPrediction";

const west = { dir_x: -1, dir_y: 0 };
const east = { dir_x: 1, dir_y: 0 };

describe("RollBodies: who is drawn rolling (FS-7P736 R15)", () => {
  it("should draw a roll over the roll's own time, from its start", () => {
    expect(DRAWN_ROLL_MS).toBe(ROLL_DURATION_MS);
    const rolls = new RollBodies();
    rolls.start("self", { x: 1, y: 0 }, 1000);
    expect(rolls.at("self", 1000)).toEqual({ dir: { x: 1, y: 0 }, t: 0 });
    expect(rolls.at("self", 1200)).toEqual({ dir: { x: 1, y: 0 }, t: 0.5 });
    expect(rolls.at("self", 1000 + DRAWN_ROLL_MS)).toBeNull();
    expect(rolls.at("other", 1000)).toBeNull();
  });

  it("should start another delver's roll on the first state that shows it rolling, its way", () => {
    const rolls = new RollBodies();
    expect(rolls.sync([["p2", undefined]], 0)).toEqual([]);
    expect(rolls.sync([["p2", west]], 100)).toEqual([{ id: "p2", dir: { x: -1, y: 0 } }]);
    expect(rolls.at("p2", 300)).toEqual({ dir: { x: -1, y: 0 }, t: 0.5 });
  });

  it("should never restart a roll the states keep showing, even once its drawing is done", () => {
    const rolls = new RollBodies();
    rolls.sync([["p2", west]], 0);
    expect(rolls.sync([["p2", west]], 50)).toEqual([]);
    // the server's roll outlives the drawn one by the latency: still the same roll
    expect(rolls.sync([["p2", west]], 450)).toEqual([]);
    expect(rolls.at("p2", 450)).toBeNull();
  });

  it("should draw the next roll once a state has shown the last one over", () => {
    const rolls = new RollBodies();
    rolls.sync([["p2", west]], 0);
    rolls.sync([["p2", undefined]], 450);
    expect(rolls.sync([["p2", east]], 3500)).toEqual([{ id: "p2", dir: { x: 1, y: 0 } }]);
    expect(rolls.at("p2", 3500)?.dir).toEqual({ x: 1, y: 0 });
  });

  it("should not restart the own predicted roll when the server's answer shows it rolling", () => {
    const rolls = new RollBodies();
    expect(rolls.start("self", { x: 0, y: 1 }, 0)).toBe(true);
    expect(rolls.sync([["self", { dir_x: 0, dir_y: 1 }]], 60)).toEqual([]);
    expect(rolls.at("self", 200)).toEqual({ dir: { x: 0, y: 1 }, t: 0.5 });
  });

  it("should draw the own roll from the server's state when no press predicted it (a reconnect mid-roll)", () => {
    const rolls = new RollBodies();
    expect(rolls.sync([["self", east]], 0)).toEqual([{ id: "self", dir: { x: 1, y: 0 } }]);
  });

  it("should not start a press's roll over one still drawn", () => {
    const rolls = new RollBodies();
    rolls.start("self", { x: 1, y: 0 }, 0);
    expect(rolls.start("self", { x: -1, y: 0 }, 100)).toBe(false);
    expect(rolls.at("self", 100)?.dir).toEqual({ x: 1, y: 0 });
  });

  it("should normalise a roll's way off the wire", () => {
    const rolls = new RollBodies();
    rolls.sync([["p2", { dir_x: 3, dir_y: 4 }]], 0);
    expect(rolls.at("p2", 0)?.dir).toEqual({ x: 0.6, y: 0.8 });
  });

  it("should forget a delver gone from the state, and everything at a clear", () => {
    const rolls = new RollBodies();
    rolls.sync([["p2", west], ["p3", east]], 0);
    rolls.sync([["p3", east]], 50);
    expect(rolls.at("p2", 60)).toBeNull();
    expect(rolls.at("p3", 60)).not.toBeNull();
    rolls.clear();
    expect(rolls.at("p3", 70)).toBeNull();
    // a clear forgets what the states showed too: a roll still shown after it is drawn afresh
    expect(rolls.sync([["p3", east]], 80)).toHaveLength(1);
  });
});

describe("tumblePose: the in-code tumble from the walk sheet (FS-7P736 R15)", () => {
  const TURN = Math.PI * 2;

  it("should stand upright and unsquashed at the very start and end", () => {
    for (const t of [0, 1]) {
      const p = tumblePose(t, 1, 40);
      expect(p.scaleX).toBeCloseTo(1);
      expect(p.scaleY).toBeCloseTo(1);
      expect(Math.cos(p.rotation)).toBeCloseTo(1);
      expect([p.dx, p.dy].map((v) => Math.abs(v))).toEqual([expect.closeTo(0), expect.closeTo(0)]);
    }
  });

  it("should squash first, low and wide, before it turns", () => {
    const p = tumblePose(0.12, 1, 40);
    expect(p.scaleY).toBeLessThan(0.85);
    expect(p.scaleX).toBeGreaterThan(1.05);
    expect(p.rotation).toBe(0);
  });

  it("should tumble one whole turn the way it spins, never turning back", () => {
    let last = -Infinity;
    for (let t = 0; t <= 1; t += 0.02) {
      const r = tumblePose(t, 1, 40).rotation;
      expect(r).toBeGreaterThanOrEqual(last - 1e-9);
      last = r;
    }
    expect(last).toBeCloseTo(TURN);
    expect(tumblePose(0.5, -1, 40).rotation).toBeCloseTo(-tumblePose(0.5, 1, 40).rotation);
  });

  it("should turn about the body's middle, so the tumble stays over its feet", () => {
    // half way through, upside down: the sprite stands on its head about the middle, not its feet
    const p = tumblePose(0.5, 1, 40);
    expect(Math.cos(p.rotation)).toBeCloseTo(-1);
    const a = 40 * p.scaleY;
    // the middle, a above the feet: rotated about the feet and moved by (dx, dy), it stays put
    const middle = { x: a * Math.sin(p.rotation) + p.dx, y: -a * Math.cos(p.rotation) + p.dy };
    expect(middle.x).toBeCloseTo(0);
    expect(middle.y).toBeCloseTo(-a);
  });

  it("should turn a baked figure about half its height, and the placeholder about its own middle", () => {
    expect(tumbleMiddle(true, 83)).toBe(41.5);
    expect(tumbleMiddle(true, undefined)).toBe(40);
    expect(tumbleMiddle(false, undefined)).toBe(0);
    // no middle to move about: the placeholder only turns
    const p = tumblePose(0.5, 1, 0);
    expect([p.dx, p.dy].map(Math.abs)).toEqual([0, 0]);
  });

  it("should spin the way the roll goes across the screen, clockwise to the right", () => {
    expect(tumbleSpin({ x: 1, y: 0 })).toBe(1); // world east projects right and down
    expect(tumbleSpin({ x: 0, y: -1 })).toBe(1); // world north projects right and up
    expect(tumbleSpin({ x: -1, y: 0 })).toBe(-1);
    expect(tumbleSpin({ x: 0, y: 1 })).toBe(-1);
    // straight down the screen: one way, never none
    expect(Math.abs(tumbleSpin({ x: 1, y: 1 }))).toBe(1);
  });
});

/** The slice of a sprite the tumble drives. */
function fakeSprite(scale = 2 / 3) {
  return {
    x: 100,
    y: 200,
    rotation: 0,
    scaleX: scale,
    scaleY: scale,
    setRotation(r: number) {
      this.rotation = r;
      return this;
    },
    setScale(x: number, y?: number) {
      this.scaleX = x;
      this.scaleY = y ?? x;
      return this;
    },
  };
}

describe("RollTumble: the tumble drawn over a sprite (FS-7P736 R15)", () => {
  it("should draw the tumble on the sprite's own scale and give it back once the roll ends", () => {
    const tumble = new RollTumble();
    const sprite = fakeSprite();
    tumble.apply(sprite, { dir: { x: 1, y: 0 }, t: 0.5 }, 40);
    // the middle is screen px over the feet, whatever the sheet's scale
    const want = tumblePose(0.5, 1, 40);
    expect(sprite.rotation).toBeCloseTo(want.rotation);
    expect(sprite.scaleY).toBeCloseTo((2 / 3) * want.scaleY);
    expect(sprite.x).toBeCloseTo(100 + want.dx);
    // the next frame the scene stands the sprite again, then the tumble goes on from its own scale
    sprite.x = 100;
    tumble.apply(sprite, { dir: { x: 1, y: 0 }, t: 0.6 }, 40);
    expect(sprite.scaleY).toBeCloseTo((2 / 3) * tumblePose(0.6, 1, 40).scaleY);
    tumble.apply(sprite, null, 40);
    expect([sprite.rotation, sprite.scaleX, sprite.scaleY]).toEqual([0, 2 / 3, 2 / 3]);
  });

  it("should give what stands over a tumbling sprite its stood place and scale, so names and bars hold still", () => {
    const tumble = new RollTumble();
    const sprite = { ...fakeSprite(), displayOriginY: 90 };
    expect(tumble.standing(sprite)).toBe(sprite);
    tumble.apply(sprite, { dir: { x: 1, y: 0 }, t: 0.5 }, 40);
    expect(sprite.y).not.toBeCloseTo(200);
    const stood = tumble.standing(sprite);
    expect([stood.x, stood.y, stood.scaleY, stood.displayOriginY]).toEqual([
      expect.closeTo(100),
      expect.closeTo(200),
      2 / 3,
      90,
    ]);
    tumble.apply(sprite, null, 40);
    expect(tumble.standing(sprite)).toBe(sprite);
  });

  it("should leave a sprite it never tumbled alone", () => {
    const tumble = new RollTumble();
    const sprite = fakeSprite(1.5);
    sprite.rotation = 0.2;
    tumble.apply(sprite, null, 40);
    expect([sprite.rotation, sprite.scaleX]).toEqual([0.2, 1.5]);
  });
});
