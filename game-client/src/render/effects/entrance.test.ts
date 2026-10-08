import { beforeEach, describe, expect, it } from "vitest";
import { worldDepth } from "@/render/iso/shapes";
import { BARROW_HEX } from "@/utils/theme";
import { fakeArt, fakeLights, fakeScene } from "./fakeScene";
import { EntranceMarker } from "./entrance";
import { EffectsRuntime } from "./runtime";
import { EFFECTS } from "./table";

describe("entrance marker (FS-KYPQ9 §H.1)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let fx: EffectsRuntime;
  const threshold = { x: 640, y: 905 };

  beforeEach(() => {
    fake = fakeScene();
    fx = new EffectsRuntime(fake.scene, fakeArt, fakeLights().lights, {
      warn: () => {},
    });
  });

  it("should lay a soft amber glow on a world plane at the threshold", () => {
    new EntranceMarker(fx, "entrance:b0", threshold);
    const glow = fake.made.find((m) => m.kind === "image")!;
    expect(glow.args[3]).toBe("fx_glow/idle/0/0");
    expect(glow.calls.setTint).toEqual(Array(4).fill(BARROW_HEX.amber));
    expect(glow.calls.setPosition).toEqual([threshold.x, threshold.y]);
    const planes = fake.made.filter((m) => m.kind === "container");
    expect(planes).toHaveLength(2);
    expect(
      planes.some(
        (p) => p.calls.setDepth?.[0] === worldDepth(threshold.x, threshold.y),
      ),
    ).toBe(true);
  });

  it("should breathe alpha 0.55 to 0.85 on a 2400 ms Sine.easeInOut period, alpha only", () => {
    new EntranceMarker(fx, "entrance:b0", threshold);
    expect(fake.tweens).toHaveLength(1);
    const [tween] = fake.tweens;
    expect(tween.config).toMatchObject({
      alpha: { from: 0.55, to: 0.85 },
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
    // a yoyo runs out and back: one breath is two of its legs
    expect((tween.config.duration as number) * 2).toBe(2400);
    expect(EFFECTS.entranceBreath.timing).toEqual({
      kind: "loop",
      periodMs: 2400,
    });
    expect(tween.config).not.toHaveProperty("scale");
    expect(tween.config).not.toHaveProperty("scaleX");
    expect(fake.timers).toEqual([]);
  });

  it("should take the glow away on hide and bring it back on show", () => {
    const marker = new EntranceMarker(fx, "entrance:b0", threshold);
    marker.setVisible(false);
    expect(fake.live()).toEqual([]);
    expect(fake.tweens[0].stopped).toBe(true);
    marker.setVisible(false);
    expect(fx.playing("entrance:b0")).toBe(0);

    marker.setVisible(true);
    expect(fx.playing("entrance:b0")).toBe(1);
    marker.setVisible(true); // exitBuilding shows every marker: no second glow
    expect(fx.playing("entrance:b0")).toBe(1);
    expect(fake.live().filter((m) => m.kind === "image")).toHaveLength(1);
  });

  it("should go with the runtime's clearAll", () => {
    new EntranceMarker(fx, "entrance:b0", threshold);
    fx.clearAll();
    expect(fake.live()).toEqual([]);
  });
});
