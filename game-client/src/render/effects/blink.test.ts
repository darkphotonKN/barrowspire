import { describe, expect, it, vi } from "vitest";
import { BARROW_HEX } from "@/utils/theme";
import { BLINK, BlinkLanding, playBlinkIn, playBlinkOut } from "./blink";
import { EFFECTS } from "./table";

// FS-04EEA §H R44 (I-04EEA-9): a blink-out where the mage's body stands at the send, and a blink-in where
// the body is placed when the jump arrives (R41). Both are the own mage's only.

describe("Blink out and in (FS-04EEA §H R44)", () => {
  it("should play the blink-out where the mage stands, at the body's height, over the body", () => {
    const fx = { play: vi.fn() };
    playBlinkOut(fx, "self", { x: 100, y: 50 });
    expect(fx.play).toHaveBeenCalledWith("self", "blinkOut", { x: 100, y: 50 }, { lift: BLINK.lift, layer: BLINK.layer });
  });

  it("should play the blink-in where the body is placed, at the body's height, over the body", () => {
    const fx = { play: vi.fn() };
    playBlinkIn(fx, "self", { x: 300, y: 50 });
    expect(fx.play).toHaveBeenCalledWith("self", "blinkIn", { x: 300, y: 50 }, { lift: BLINK.lift, layer: BLINK.layer });
  });
});

describe("BlinkLanding (FS-04EEA R44; Edge States: Blink at the target under the mage)", () => {
  it("should land a jump that follows a sent Blink, once", () => {
    const landing = new BlinkLanding();
    landing.arm(1000);
    expect(landing.land(1100)).toBe(true);
    expect(landing.land(1150)).toBe(false);
  });

  it("should land no jump with no Blink sent: a teammate's, a respawn's", () => {
    expect(new BlinkLanding().land(500)).toBe(false);
  });

  it("should land nothing once the wait has run out: the server refused the Blink, no blink-in follows", () => {
    const landing = new BlinkLanding();
    landing.arm(1000);
    expect(landing.land(1000 + BLINK.landWithinMs + 1)).toBe(false);
  });

  it("should land nothing after it is let go (a floor change, a teardown)", () => {
    const landing = new BlinkLanding();
    landing.arm(1000);
    landing.forget();
    expect(landing.land(1010)).toBe(false);
  });
});

describe("Blink entries (FS-04EEA §H R48)", () => {
  it("should draw the blink in the mage's necrotic and vellum, never umbra (the Shadow Shot's alone)", () => {
    for (const name of ["blinkOut", "blinkIn"] as const) {
      const e = EFFECTS[name];
      const colours = [...e.sprite.tint, ...e.particles.tint];
      for (const c of colours) expect(c in BARROW_HEX).toBe(true);
      expect(colours).toContain("necrotic");
      expect(colours).not.toContain("umbra");
      expect(e.timing.kind).toBe("oneShot");
    }
  });

  it("should gather the blink-out's motes in to the body, and throw the blink-in's out and let them settle", () => {
    expect(EFFECTS.blinkOut.particles.inward).toBeGreaterThan(0);
    expect("inward" in EFFECTS.blinkIn.particles).toBe(false);
    expect(EFFECTS.blinkIn.particles.accel.y).toBeGreaterThan(0);
  });
});
