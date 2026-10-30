import { describe, expect, it } from "vitest";
import type * as Phaser from "phaser";
import { PARRY_TELL_GRACE_MS } from "@/render/effects/parry";
import { ClassKitFx } from "./classKitFx";

/** A scene with just what the parry draws with: graphics that record nothing, tweens that never run. */
function scene(): Phaser.Scene {
  const g = new Proxy({}, { get: (_t, key) => (key === "destroy" ? () => {} : () => g) });
  return { add: { graphics: () => g }, tweens: { add: () => {} } } as unknown as Phaser.Scene;
}

const merc = (parry_open: boolean) => ({ parry_open, parries: 0 }) as never;

describe("ClassKitFx guarding (FS-MAMHR §G.35)", () => {
  it("should not guard before a parry was ever raised, or for another class", () => {
    const kit = new ClassKitFx(scene());
    expect(kit.guarding).toBe(false);
    kit.sync({ class: "warrior" } as never, 0);
    expect(kit.guarding).toBe(false);
  });

  it("should guard from the click, hold while the server reports the stance open, and drop when it closes", () => {
    const kit = new ClassKitFx(scene());
    kit.raiseParry(1000);
    expect(kit.guarding).toBe(true);
    kit.sync(merc(true), 1050);
    kit.follow({ x: 0, y: 0 }, 1500);
    expect(kit.guarding).toBe(true);
    kit.sync(merc(false), 1300);
    expect(kit.guarding).toBe(false);
  });

  it("should drop the guard after the click's grace when the server never opened the stance", () => {
    const kit = new ClassKitFx(scene());
    kit.raiseParry(1000);
    kit.follow({ x: 0, y: 0 }, 1000 + PARRY_TELL_GRACE_MS);
    expect(kit.guarding).toBe(false);
  });

  it("should drop the guard with the world", () => {
    const kit = new ClassKitFx(scene());
    kit.raiseParry(1000);
    kit.forget();
    expect(kit.guarding).toBe(false);
  });
});
