import { beforeEach, describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { BARROW_HEX } from "@/utils/theme";
import { CLAW_LIFT, CLAW_REACH, playDemonClaw } from "./demonClaw";
import { fakeArt, fakeLights, fakeScene } from "./fakeScene";
import { alongAim } from "./projectile";
import { EffectsRuntime } from "./runtime";
import { EFFECTS, type Token } from "./table";

// FS-VHGE7 §D R32 (I-VHGE7-4): a demon's fire claw, a flame swept along the swipe in its facing
// and one brief ember flash, from the torch-warmth ember family only, never amber.

/** The torch-warmth ember family a hostile's attack effect is drawn from (FS-VHGE7 §D R32). */
const EMBER_FAMILY: readonly Token[] = ["ember"];

describe("demon fire claw (FS-VHGE7 §D R32)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let lights: ReturnType<typeof fakeLights>;
  let fx: EffectsRuntime;
  const demon = { x: 300, y: 300 };
  const east = { x: 1, y: 0 };

  beforeEach(() => {
    fake = fakeScene();
    lights = fakeLights();
    fx = new EffectsRuntime(fake.scene, fakeArt, lights.lights, {
      warn: () => {},
    });
  });

  const flame = () => fake.made.find((m) => m.kind === "image")!;
  const embers = () => fake.made.find((m) => m.kind === "particles")!;

  it("should be one table entry: a one-shot of at most 250 ms, eased by an allowlisted curve", () => {
    const e = EFFECTS.demonClaw;
    expect(e.timing.kind).toBe("oneShot");
    expect(e.timing.durationMs).toBeLessThanOrEqual(250);
    expect(e.ease).toBe("Quad.easeOut");
  });

  it("should draw from the baked fire core and embers, tinted ember only, never amber or oxblood", () => {
    const e = EFFECTS.demonClaw;
    expect(e.sprite.texture).toBe("fx_fire_core");
    expect(e.particles.texture).toEqual(["fx_ember"]);
    const colours = [...e.sprite.tint, ...e.particles.tint, e.light.color];
    for (const c of colours) expect(EMBER_FAMILY, c).toContain(c);
    expect(colours).not.toContain("amber");
    expect(colours).not.toContain("amberBright");
    expect(colours).not.toContain("oxblood");
    expect(colours).not.toContain("oxbloodText");
  });

  it("should lay the flame at the demon's reach along its facing, raised to its claw", () => {
    playDemonClaw(fx, "boss", demon, east);
    const at = alongAim(demon, { x: demon.x + 1, y: demon.y }, CLAW_REACH);
    const s = worldToScreen(at.x, at.y);
    expect(flame().args[3]).toBe("fx_fire_core/idle/0/0");
    const [x, y] = flame().calls.setPosition as [number, number];
    expect(x).toBeCloseTo(s.x);
    expect(y).toBeCloseTo(s.y - CLAW_LIFT);
    expect(flame().calls.setTint).toEqual([
      BARROW_HEX.ember,
      BARROW_HEX.ember,
      BARROW_HEX.ember,
      BARROW_HEX.ember,
    ]);
  });

  it("should sweep the flame through the swipe, centred on the facing as drawn on screen", () => {
    const facing = { x: 1, y: 1 };
    playDemonClaw(fx, "boss", demon, facing);
    const h = worldToScreen(facing.x, facing.y);
    const aim = Math.atan2(h.y, h.x);
    const [tween] = fake.tweens;
    const rotation = tween.config.rotation as { from: number; to: number };
    expect((rotation.from + rotation.to) / 2).toBeCloseTo(aim);
    expect(rotation.to).toBeGreaterThan(rotation.from);
    expect(tween.config).toMatchObject({
      duration: EFFECTS.demonClaw.timing.durationMs,
      ease: "Quad.easeOut",
      alpha: { to: 0 },
    });
  });

  it("should fling its embers forward along the facing, not behind it, at most 12", () => {
    playDemonClaw(fx, "boss", demon, east);
    const config = embers().args[3] as { angle: { min: number; max: number } };
    // on screen, east in the world points down-right: the embers fan about that heading
    const h = worldToScreen(east.x, east.y);
    const forward = (Math.atan2(h.y, h.x) * 180) / Math.PI;
    const mid = (config.angle.min + config.angle.max) / 2;
    expect(((mid - forward) % 360 + 360) % 360).toBeCloseTo(0);
    const [count] = embers().calls.emitParticle as [number];
    expect(count).toBeLessThanOrEqual(12);
  });

  it("should flash one brief ember light that fades out, and shake nothing", () => {
    playDemonClaw(fx, "boss", demon, east);
    expect(lights.added).toHaveLength(1);
    expect(lights.added[0].spec.color).toBe(BARROW_HEX.ember);
    const fade = fake.tweens.find((t) => "intensity" in t.config)!;
    expect(fade.config.intensity).toMatchObject({ to: 0 });
  });

  it("should leave nothing once it ends", () => {
    playDemonClaw(fx, "boss", demon, east);
    expect(fake.timers.map((t) => t.delay)).toEqual([
      EFFECTS.demonClaw.timing.durationMs,
    ]);
    fake.timers[0].fire();
    expect(fake.live()).toEqual([]);
    expect(lights.alive()).toEqual([]);
  });

  it("should be hidden with the demon by the hide rule, light and all", () => {
    playDemonClaw(fx, "boss", demon, east);
    fx.hideWhere(() => true);
    expect(flame().calls.setVisible).toEqual([false]);
    expect(lights.added[0].light.hidden).toBe(true);
  });

  it("should play at the demon itself with no facing to swipe along", () => {
    playDemonClaw(fx, "boss", demon, { x: 0, y: 0 });
    const s = worldToScreen(demon.x, demon.y);
    expect(flame().calls.setPosition).toEqual([s.x, s.y - CLAW_LIFT]);
  });
});
