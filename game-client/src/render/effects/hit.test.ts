import { beforeEach, describe, expect, it } from "vitest";
import { BARROW_HEX } from "@/utils/theme";
import { fakeScene } from "./fakeScene";
import { HitFeedback, UNTINTED, tintToward, type Tintable } from "./hit";
import { EFFECTS } from "./table";

const channels = (c: number) => [
  Math.floor(c / 65536) % 256,
  Math.floor(c / 256) % 256,
  c % 256,
];

/** How far each channel of `c` sits from untinted toward `toward`, 0..1. */
function shareToward(c: number, toward: number): number[] {
  const [r, g, b] = channels(c);
  const [tr, tg, tb] = channels(toward);
  return [
    [r, tr],
    [g, tg],
    [b, tb],
  ].map(([v, t]) => (255 - v) / (255 - t));
}

function fakeCharacter() {
  const tints: (number | "clear")[] = [];
  const listeners = new Map<string, () => void>();
  const sprite = {
    active: true,
    x: 120,
    y: 80,
    setTint: (c: number) => tints.push(c),
    clearTint: () => tints.push("clear"),
    once: (event: string, fn: () => void) => listeners.set(event, fn),
    off: (event: string) => listeners.delete(event),
  };
  return {
    sprite: sprite as Tintable & typeof sprite,
    tints,
    listeners,
    destroy() {
      sprite.active = false;
      listeners.get("destroy")?.();
    },
  };
}

describe("hit feedback (FS-KYPQ9 §G.1)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let hits: HitFeedback;

  beforeEach(() => {
    fake = fakeScene();
    hits = new HitFeedback(fake.scene);
  });

  it("should build the untinted identity as white without a hex literal", () => {
    expect(UNTINTED).toBe(255 * 65536 + 255 * 256 + 255);
    expect(tintToward(BARROW_HEX.oxblood, 0)).toBe(UNTINTED);
    expect(tintToward(BARROW_HEX.oxblood, 1)).toBe(BARROW_HEX.oxblood);
  });

  it("should tint at most half way toward oxblood at the peak", () => {
    const c = fakeCharacter();
    hits.play(c.sprite);
    const peak = c.tints[0] as number;
    for (const share of shareToward(peak, BARROW_HEX.oxblood)) {
      expect(share).toBeGreaterThan(0.45);
      expect(share).toBeLessThanOrEqual(0.5 + 1e-2);
    }
  });

  it("should ease back to untinted over the table's 220 ms Quad.easeOut", () => {
    const c = fakeCharacter();
    hits.play(c.sprite);
    const [tween] = fake.tweens;
    expect(tween.config).toMatchObject({
      from: EFFECTS.hit.tint.peak,
      to: 0,
      duration: 220,
      ease: "Quad.easeOut",
    });
    expect(EFFECTS.hit.timing).toEqual({ kind: "oneShot", durationMs: 220 });

    tween.advance(0.5);
    const mid = c.tints.at(-1) as number;
    for (const share of shareToward(mid, BARROW_HEX.oxblood))
      expect(share).toBeCloseTo(0.25, 1);

    tween.complete();
    expect(c.tints.at(-1)).toBe("clear");
    expect(hits.playing()).toBe(0);
    // no destroy listener left on a sprite hit a hundred times
    expect(c.listeners.has("destroy")).toBe(false);
  });

  it("should restart, not stack, when struck again mid-tint", () => {
    const c = fakeCharacter();
    hits.play(c.sprite);
    hits.play(c.sprite);
    expect(fake.tweens[0].stopped).toBe(true);
    expect(hits.playing()).toBe(1);
  });

  it("should die with the sprite and never touch it again", () => {
    const c = fakeCharacter();
    hits.play(c.sprite);
    const before = c.tints.length;
    c.destroy();
    expect(fake.tweens[0].stopped).toBe(true);
    expect(hits.playing()).toBe(0);
    fake.tweens[0].advance(0.7);
    expect(c.tints.length).toBe(before);
  });

  it("should stop every tint and leave the characters untinted on clearAll()", () => {
    const a = fakeCharacter();
    const b = fakeCharacter();
    hits.play(a.sprite);
    hits.play(b.sprite);
    hits.clearAll();
    expect(fake.tweens.every((t) => t.stopped)).toBe(true);
    expect(a.tints.at(-1)).toBe("clear");
    expect(b.tints.at(-1)).toBe("clear");
    expect(hits.playing()).toBe(0);
  });

  it("should move nothing: only the tint is set", () => {
    const c = fakeCharacter();
    hits.play(c.sprite);
    fake.tweens[0].complete();
    expect(c.sprite.x).toBe(120);
    expect(c.sprite.y).toBe(80);
    expect(fake.made).toEqual([]);
  });
});
