import { beforeEach, describe, expect, it } from "vitest";
import { depthKey, worldToScreen } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import { BARROW_HEX } from "@/utils/theme";
import { fakeArt, fakeLights, fakeScene } from "./fakeScene";
import { EffectsRuntime } from "./runtime";
import { playSlash, SMEAR_REACH } from "./slash";

describe("warrior slash (FS-KYPQ9 §D.1)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let lights: ReturnType<typeof fakeLights>;
  let fx: EffectsRuntime;
  const me = { x: 200, y: 200 };

  beforeEach(() => {
    fake = fakeScene();
    lights = fakeLights();
    fx = new EffectsRuntime(fake.scene, fakeArt, lights.lights, {
      warn: () => {},
    });
  });

  it("should lay the steel smear on a world plane at the delver's world position, turned toward the target", () => {
    playSlash(fx, "self", me, { x: 200, y: 260 });
    const smear = fake.made.find((m) => m.kind === "image")!;
    expect(smear.args[3]).toBe("fx_slash/idle/0/0");
    // on the plane pair, at its world position (the plane carries the projection)
    expect(smear.calls.setPosition).toEqual([me.x, me.y]);
    expect(fake.made.filter((m) => m.kind === "container")).toHaveLength(2);
    // world radians: +y is a quarter turn from the arc's +x
    expect(smear.calls.setRotation).toEqual([Math.PI / 2]);
    // dull steel inside, a pale vellum cutting lip outside
    expect(smear.calls.setTint).toEqual([
      BARROW_HEX.vellumDark,
      BARROW_HEX.vellum,
      BARROW_HEX.vellumDark,
      BARROW_HEX.vellum,
    ]);
    expect(smear.calls.setAlpha).toEqual([1]);
  });

  /** The smear's sort depth: its plane root's. */
  const smearDepth = () => {
    const [root] = fake.made.filter((m) => m.kind === "container").slice(-1);
    return (root.calls.setDepth as [number])[0];
  };

  it("should draw over the delver (standAt layer 1) when the aim points away from the viewer", () => {
    playSlash(fx, "self", me, { x: me.x - 40, y: me.y - 30 });
    expect(smearDepth()).toBeGreaterThan(worldDepth(me.x, me.y, 1));
  });

  it("should draw over a target in melee reach that stands nearer the viewer", () => {
    const target = { x: me.x + 40, y: me.y + 30 };
    playSlash(fx, "self", me, target);
    expect(smearDepth()).toBeGreaterThan(worldDepth(target.x, target.y, 1));
    expect(smearDepth()).toBeGreaterThan(worldDepth(me.x, me.y, 1));
  });

  it("should sort no further forward than its reach along the aim, however far the click", () => {
    const far = { x: me.x + 600, y: me.y };
    playSlash(fx, "self", me, far);
    const reach = { x: me.x + SMEAR_REACH, y: me.y };
    expect(smearDepth()).toBeGreaterThan(worldDepth(reach.x, reach.y, 1));
    expect(smearDepth()).toBeLessThan(worldDepth(reach.x + 1, reach.y, 0));
    expect(depthKey(reach.x, reach.y)).toBeLessThan(depthKey(far.x, far.y));
  });

  it("should sweep and fade over 220 ms Quad.easeOut, centred on the aim", () => {
    const aim = Math.atan2(30, 40);
    playSlash(fx, "self", me, { x: me.x + 40, y: me.y + 30 });
    const [tween] = fake.tweens;
    expect(tween.config).toMatchObject({
      duration: 220,
      ease: "Quad.easeOut",
      alpha: { to: 0 },
    });
    const rotation = tween.config.rotation as { from: number; to: number };
    expect((rotation.from + rotation.to) / 2).toBeCloseTo(aim);
    expect(rotation.to).toBeGreaterThan(rotation.from);
    expect(fake.timers.map((t) => t.delay)).toEqual([220]);
  });

  it("should settle at most 4 dust motes at the delver's feet", () => {
    playSlash(fx, "self", me, { x: 260, y: 200 });
    const dust = fake.made.find((m) => m.kind === "particles")!;
    const [count] = dust.calls.emitParticle as [number];
    expect(count).toBeLessThanOrEqual(4);
    const s = worldToScreen(me.x, me.y);
    expect(dust.calls.setPosition).toEqual([s.x, s.y]);
    expect((dust.args[3] as { tint: number[] }).tint).toEqual([
      BARROW_HEX.vellumDark,
    ]);
  });

  it("should face +x when the target is the delver's own point", () => {
    playSlash(fx, "self", me, me);
    const smear = fake.made.find((m) => m.kind === "image")!;
    expect(smear.calls.setRotation).toEqual([0]);
  });

  it("should light nothing and leave nothing once it ends", () => {
    playSlash(fx, "self", me, { x: 260, y: 200 });
    expect(lights.added).toEqual([]);
    fake.timers[0].fire();
    expect(fake.live()).toEqual([]);
  });
});
