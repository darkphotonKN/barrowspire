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

/** A baked figure's frame: 96 px square, its feet (the origin) low in the middle. */
const FRAME = 96;
const FEET = { x: 0.5, y: 0.9 };
/** Where the scene stood it, screen px. */
const STOOD = { x: 100, y: 200 };

/**
 * The slice of a Phaser sprite the tumble drives, stood at {@link STOOD} on {@link FEET}: Phaser's origin
 * a share of the frame, its display origin that share of the frame's own px.
 */
function fakeSprite(scale = 2 / 3, origin = FEET) {
  return {
    ...STOOD,
    rotation: 0,
    scaleX: scale,
    scaleY: scale,
    originX: origin.x,
    originY: origin.y,
    width: FRAME,
    height: FRAME,
    get displayOriginX(): number {
      return this.originX * this.width;
    },
    get displayOriginY(): number {
      return this.originY * this.height;
    },
    setRotation(r: number) {
      this.rotation = r;
      return this;
    },
    setScale(x: number, y?: number) {
      this.scaleX = x;
      this.scaleY = y ?? x;
      return this;
    },
    setOrigin(x: number, y?: number) {
      this.originX = x;
      this.originY = y ?? x;
      return this;
    },
  };
}
type FakeSprite = ReturnType<typeof fakeSprite>;

/** Where the frame's point (`fx`, `fy`) is drawn on screen, as Phaser draws it: about the origin at x, y. */
function drawnAt(s: FakeSprite, fx: number, fy: number) {
  const [lx, ly] = [(fx - s.displayOriginX) * s.scaleX, (fy - s.displayOriginY) * s.scaleY];
  const [c, n] = [Math.cos(s.rotation), Math.sin(s.rotation)];
  return { x: s.x + lx * c - ly * n, y: s.y + lx * n + ly * c };
}

/** Where a sprite carried by the pose's (dx, dy) on its stood origin would draw it: the tumble's look. */
function carriedAt(scale: number, t: number, middle: number, fx: number, fy: number) {
  const p = tumblePose(t, 1, middle);
  const carried = { ...fakeSprite(scale), x: STOOD.x + p.dx, y: STOOD.y + p.dy, rotation: p.rotation };
  carried.scaleX = scale * p.scaleX;
  carried.scaleY = scale * p.scaleY;
  return drawnAt(carried, fx, fy);
}

const EAST = { x: 1, y: 0 };
/** Moments through the turn itself, past the squash and short of the getting up. */
const MID_ROLL = [0.2, 0.35, 0.5, 0.65, 0.8];

describe("RollTumble: the tumble drawn over a sprite (FS-7P736 R15)", () => {
  it("should never move the sprite: mid-tumble its x and y are where it stands, so the camera following it holds still", () => {
    const tumble = new RollTumble();
    const sprite = fakeSprite();
    // the camera reads its follow target's x and y in preRender, after the frame's update drew the tumble
    const camera = { follow: sprite as { x: number; y: number } };
    for (const t of MID_ROLL) {
      tumble.apply(sprite, { dir: EAST, t }, 40);
      expect(sprite.rotation).not.toBe(0);
      expect([sprite.x, sprite.y]).toEqual([STOOD.x, STOOD.y]);
      expect([camera.follow.x, camera.follow.y]).toEqual([STOOD.x, STOOD.y]);
    }
  });

  it("should still turn the drawing about the body's middle, every point where carrying the sprite would put it", () => {
    const tumble = new RollTumble();
    const sprite = fakeSprite();
    // the middle: 40 screen px over the feet at the sheet's 2/3 scale, so 60 of the frame's px
    const middle = { x: FEET.x * FRAME, y: FEET.y * FRAME - 40 / (2 / 3) };
    const points = [[0, 0], [FRAME, 0], [0, FRAME], [FRAME, FRAME], [FEET.x * FRAME, FEET.y * FRAME], [middle.x, middle.y]];
    for (const t of MID_ROLL) {
      // the scene stands it again each frame before the tumble: its place, never its origin or scale
      Object.assign(sprite, STOOD);
      tumble.apply(sprite, { dir: EAST, t }, 40);
      for (const [fx, fy] of points) {
        const got = drawnAt(sprite, fx, fy);
        const want = carriedAt(2 / 3, t, 40, fx, fy);
        expect(got.x).toBeCloseTo(want.x, 6);
        expect(got.y).toBeCloseTo(want.y, 6);
      }
      // the middle holds still over the feet, as low as the squash takes it
      const held = drawnAt(sprite, middle.x, middle.y);
      expect(held.x).toBeCloseTo(STOOD.x, 6);
      expect(held.y).toBeCloseTo(STOOD.y - 40 * tumblePose(t, 1, 40).scaleY, 6);
    }
  });

  it("should draw the tumble on the sprite's own scale and origin, and give both back once the roll ends", () => {
    const tumble = new RollTumble();
    const sprite = fakeSprite();
    tumble.apply(sprite, { dir: EAST, t: 0.5 }, 40);
    const want = tumblePose(0.5, 1, 40);
    expect(sprite.rotation).toBeCloseTo(want.rotation);
    expect(sprite.scaleY).toBeCloseTo((2 / 3) * want.scaleY);
    expect(sprite.originY).not.toBeCloseTo(FEET.y);
    // the next frame goes on from its own scale and origin, not the ones the tumble last gave it
    tumble.apply(sprite, { dir: EAST, t: 0.6 }, 40);
    expect(sprite.scaleY).toBeCloseTo((2 / 3) * tumblePose(0.6, 1, 40).scaleY);
    expect(drawnAt(sprite, 0, 0).x).toBeCloseTo(carriedAt(2 / 3, 0.6, 40, 0, 0).x, 6);
    tumble.apply(sprite, null, 40);
    expect([sprite.rotation, sprite.scaleX, sprite.scaleY, sprite.originX, sprite.originY]).toEqual([0, 2 / 3, 2 / 3, FEET.x, FEET.y]);
    expect([sprite.x, sprite.y]).toEqual([STOOD.x, STOOD.y]);
  });

  it("should only turn the placeholder, whose origin is its own middle", () => {
    const tumble = new RollTumble();
    const sprite = fakeSprite(1, { x: 0.5, y: 0.5 });
    tumble.apply(sprite, { dir: EAST, t: 0.5 }, 0);
    expect(sprite.rotation).toBeCloseTo(Math.PI, 1);
    expect([sprite.originX, sprite.originY]).toEqual([0.5, 0.5]);
  });

  it("should give what stands over a tumbling sprite its stood place, origin and scale, so names and bars hold still", () => {
    const tumble = new RollTumble();
    const sprite = fakeSprite();
    expect(tumble.standing(sprite)).toBe(sprite);
    tumble.apply(sprite, { dir: EAST, t: 0.5 }, 40);
    expect(sprite.displayOriginY).not.toBeCloseTo(FEET.y * FRAME);
    const stood = tumble.standing(sprite);
    expect([stood.x, stood.y, stood.scaleY, stood.displayOriginY]).toEqual([STOOD.x, STOOD.y, 2 / 3, FEET.y * FRAME]);
    tumble.apply(sprite, null, 40);
    expect(tumble.standing(sprite)).toBe(sprite);
  });

  it("should leave a sprite it never tumbled alone", () => {
    const tumble = new RollTumble();
    const sprite = fakeSprite(1.5);
    sprite.rotation = 0.2;
    tumble.apply(sprite, null, 40);
    expect([sprite.rotation, sprite.scaleX, sprite.originY]).toEqual([0.2, 1.5, FEET.y]);
  });
});
