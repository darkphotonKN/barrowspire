import { describe, expect, it } from "vitest";
import type { Point } from "@/render/iso/projection";
import { BARROW_HEX } from "@/utils/theme";
import type { PlayOptions } from "./runtime";
import { FLURRY, flurryWeight, playSettleTheDebt, SETTLE_THE_DEBT_EFFECTS } from "./settleTheDebt";
import { SMEAR_REACH } from "./slash";
import { Staged } from "./staged";
import { EFFECTS, type EffectName } from "./table";

// FS-04EEA §H R46 (I-04EEA-9): a flurry of slashes all round the mercenary to 90 world px, heavier the
// more parry charges were spent; 1, 3 and 5 must each read distinctly.

function onStage() {
  let now = 0;
  const due: { at: number; fn: () => void; removed: boolean }[] = [];
  const time = {
    delayedCall: (delay: number, fn: () => void) => {
      const t = { at: now + delay, fn, removed: false };
      due.push(t);
      return { remove: () => void (t.removed = true) };
    },
  };
  const advance = (ms: number) => {
    const until = now + ms;
    for (;;) {
      const next = due.filter((t) => !t.removed && t.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      next.removed = true;
      now = next.at;
      next.fn();
    }
    now = until;
  };
  const played: { t: number; owner: string; name: EffectName; at: Point; opts?: PlayOptions }[] = [];
  const fx = {
    play: (owner: string, name: EffectName, at: Point, opts?: PlayOptions) => {
      played.push({ t: now, owner, name, at, opts });
      return null;
    },
  };
  return { fx, steps: new Staged(time as never), played, advance };
}

const merc = { x: 200, y: 200 };

/** What a flurry of `charges` drew, once it has all played. */
function flurry(charges: number) {
  const { fx, steps, played, advance } = onStage();
  playSettleTheDebt(fx, steps, "self", merc, charges);
  advance(5000);
  const count = (name: EffectName) => played.filter((p) => p.name === name).length;
  return { played, slashes: played.filter((p) => p.name === "flurrySlash"), count };
}

describe("Settle the Debt flurry (FS-04EEA §H R46)", () => {
  it("should weigh 1, 3 and 5 parry charges each distinctly, heavier with each", () => {
    const [one, three, five] = [1, 3, 5].map(flurryWeight);
    expect(one.slashes).toBeLessThan(three.slashes);
    expect(three.slashes).toBeLessThan(five.slashes);
    expect([one.dust, three.dust, five.dust]).toEqual([false, true, true]);
    expect([one.flare, three.flare, five.flare]).toEqual([false, false, true]);
  });

  it.each([1, 3, 5])("should play its weight's slashes, dust and flare at %i charges", (n) => {
    const w = flurryWeight(n);
    const { count } = flurry(n);
    expect(count("flurrySlash")).toBe(w.slashes);
    expect(count("flurryDust")).toBe(w.dust ? 1 : 0);
    expect(count("flurryFlare")).toBe(w.flare ? 1 : 0);
  });

  it("should cut all round the mercenary, not along one aim", () => {
    const { slashes } = flurry(1);
    const quadrants = new Set(
      slashes.map((s) => {
        const a = (((s.opts?.rotation as number) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        return Math.floor(a / (Math.PI / 2));
      }),
    );
    expect(quadrants.size).toBe(4);
  });

  it("should lay each slash at the mercenary's feet, reaching 90 world px", () => {
    const { slashes } = flurry(3);
    for (const s of slashes) expect(s.at).toEqual(merc);
    expect(SMEAR_REACH * EFFECTS.flurrySlash.sprite.scale.to).toBeGreaterThanOrEqual(FLURRY.reach * 0.9);
    expect(SMEAR_REACH * EFFECTS.flurrySlash.sprite.scale.to).toBeLessThanOrEqual(FLURRY.reach * 1.1);
  });

  it.each([1, 3, 5])("should strike its slashes one after another over the same span at %i charges", (n) => {
    const { slashes } = flurry(n);
    const times = slashes.map((s) => s.t);
    expect(new Set(times).size).toBe(slashes.length);
    expect(Math.min(...times)).toBe(0);
    expect(Math.max(...times)).toBeCloseTo(FLURRY.spanMs);
  });

  it("should draw a flurry of 1 for a count the client cannot have spent, and no more than 5's", () => {
    expect(flurryWeight(0)).toEqual(flurryWeight(1));
    expect(flurryWeight(9)).toEqual(flurryWeight(5));
  });

  it("should play nothing more once its steps are cancelled", () => {
    const { fx, steps, played, advance } = onStage();
    playSettleTheDebt(fx, steps, "self", merc, 5);
    const atOnce = played.length;
    steps.cancel();
    advance(5000);
    expect(played).toHaveLength(atOnce);
  });

  it("should play only its own entries, under the caster's owner", () => {
    const { played } = flurry(5);
    expect(new Set(played.map((p) => p.owner))).toEqual(new Set(["self"]));
    expect(new Set(played.map((p) => p.name))).toEqual(new Set(SETTLE_THE_DEBT_EFFECTS));
  });
});

describe("Settle the Debt entries (FS-04EEA §H R48)", () => {
  it("should draw the slashes in steel and vellum on the ground, the flare in brass, never oxblood", () => {
    expect(EFFECTS.flurrySlash.sprite.texture).toBe("fx_slash");
    expect(EFFECTS.flurrySlash.sprite.ground).toBe(true);
    for (const name of ["flurrySlash", "flurryDust", "flurryFlare"] as const) {
      const e = EFFECTS[name] as { sprite?: { tint: readonly string[] }; particles?: { tint: readonly string[] } };
      for (const c of [...(e.sprite?.tint ?? []), ...(e.particles?.tint ?? [])]) {
        expect(c in BARROW_HEX).toBe(true);
        expect(c).not.toBe("oxblood");
      }
    }
    expect(EFFECTS.flurryFlare.light.color).toBe("brassBright");
  });
});
