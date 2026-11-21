import { describe, expect, it } from "vitest";
import type { Point } from "@/render/iso/projection";
import { BARROW_HEX } from "@/utils/theme";
import type { PlayOptions } from "./runtime";
import { EARTHBREAKER, EARTHBREAKER_EFFECTS, playEarthbreaker } from "./earthbreaker";
import { SMEAR_REACH } from "./slash";
import { Staged } from "./staged";
import { EFFECTS, type EffectName } from "./table";

// FS-04EEA §H R43 (I-04EEA-9): a ground slam around the warrior, a shock ring out to 90 world px with
// cracks and dust, in the iso projection; every piece a table entry (R48).

/** A clock whose due steps run on `advance`, skipping removed ones. */
function clock() {
  let now = 0;
  const due: { at: number; fn: () => void; removed: boolean }[] = [];
  return {
    time: {
      delayedCall: (delay: number, fn: () => void) => {
        const t = { at: now + delay, fn, removed: false };
        due.push(t);
        return { remove: () => void (t.removed = true) };
      },
    },
    now: () => now,
    advance(ms: number) {
      const until = now + ms;
      for (;;) {
        const next = due.filter((t) => !t.removed && t.at <= until).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        next.removed = true;
        now = next.at;
        next.fn();
      }
      now = until;
    },
  };
}

function onStage() {
  const clk = clock();
  const played: { t: number; owner: string; name: EffectName; at: Point; opts?: PlayOptions }[] = [];
  const fx = {
    play: (owner: string, name: EffectName, at: Point, opts?: PlayOptions) => {
      played.push({ t: clk.now(), owner, name, at, opts });
      return null;
    },
  };
  const steps = new Staged(clk.time as never);
  return { clk, played, fx, steps };
}

const feet = { x: 400, y: 300 };
const TAU = Math.PI * 2;
const dist = (p: Point) => Math.hypot(p.x - feet.x, p.y - feet.y);

describe("Earthbreaker slam (FS-04EEA §H R43)", () => {
  it("should slam at the warrior's feet at once, its dark cracked ground and its first band", () => {
    const { fx, steps, played } = onStage();
    playEarthbreaker(fx, steps, "self", feet);
    const now = played.filter((p) => p.t === 0);
    expect(now.find((p) => p.name === "earthbreakerSlam")?.at).toEqual(feet);
    expect(now.find((p) => p.name === "earthbreakerRing")?.at).toEqual(feet);
  });

  it("should open its shock ring out ring by ring, each closed by four quarter-bands, the last at 90 world px", () => {
    const { fx, steps, played, clk } = onStage();
    playEarthbreaker(fx, steps, "self", feet);
    clk.advance(2000);
    const bands = ["earthbreakerBandNear", "earthbreakerBandMid", "earthbreakerBandFar"] as const;
    // the smear is an arc round its pivot: its reach at the entry's scale is the ring's radius
    const radii = bands.map((b) => Math.round(SMEAR_REACH * EFFECTS[b].sprite.scale.to));
    for (const [i, r] of radii.entries()) expect(Math.abs(r - EARTHBREAKER.rings[i])).toBeLessThanOrEqual(2);
    expect(EARTHBREAKER.rings[EARTHBREAKER.rings.length - 1]).toBe(90);
    const firstAt = bands.map((b) => Math.min(...played.filter((p) => p.name === b).map((p) => p.t)));
    expect(firstAt).toEqual([...firstAt].sort((a, b) => a - b));
    expect(new Set(firstAt).size).toBe(3);
    for (const b of bands) {
      const ring = played.filter((p) => p.name === b);
      expect(ring).toHaveLength(EARTHBREAKER.bandsPerRing);
      for (const p of ring) expect(p.at).toEqual(feet);
      const quadrants = new Set(ring.map((p) => Math.floor(((((p.opts?.rotation as number) % TAU) + TAU) % TAU) / (TAU / 4))));
      expect(quadrants.size).toBe(4);
    }
  });

  it("should kick its dust outward where the shock dies out at 90 world px", () => {
    const { fx, steps, played, clk } = onStage();
    playEarthbreaker(fx, steps, "self", feet);
    clk.advance(2000);
    const shock = played.filter((p) => p.name === "earthbreakerShock");
    expect(shock.length).toBe(EARTHBREAKER.dustPoints);
    for (const p of shock) {
      expect(dist(p.at)).toBeCloseTo(90);
      // its heading points back in to the feet, so it streams out behind it
      const d = p.opts?.direction as Point;
      expect(d.x * (p.at.x - feet.x) + d.y * (p.at.y - feet.y)).toBeLessThan(0);
    }
  });

  it("should draw its cracks along lines out from the feet, never past 90 world px", () => {
    const { fx, steps, played, clk } = onStage();
    playEarthbreaker(fx, steps, "self", feet);
    clk.advance(2000);
    const cracks = played.filter((p) => p.name === "earthbreakerCrack");
    expect(cracks.length).toBe(EARTHBREAKER.cracks * EARTHBREAKER.crackLengths.length);
    for (const c of cracks) expect(dist(c.at)).toBeLessThanOrEqual(90);
  });

  it("should play nothing more once its steps are cancelled (a floor change, a teardown)", () => {
    const { fx, steps, played, clk } = onStage();
    playEarthbreaker(fx, steps, "self", feet);
    const atOnce = played.length;
    steps.cancel();
    clk.advance(2000);
    expect(played).toHaveLength(atOnce);
  });

  it("should play everything under the caster's owner", () => {
    const { fx, steps, played, clk } = onStage();
    playEarthbreaker(fx, steps, "self", feet);
    clk.advance(2000);
    expect(new Set(played.map((p) => p.owner))).toEqual(new Set(["self"]));
    expect(new Set(played.map((p) => p.name))).toEqual(new Set(EARTHBREAKER_EFFECTS));
  });
});

describe("Earthbreaker entries (FS-04EEA §H R48)", () => {
  it("should lay the slam, the bands and the cracks flat on the ground, in BARROW tokens", () => {
    for (const name of [
      "earthbreakerSlam",
      "earthbreakerRing",
      "earthbreakerBandNear",
      "earthbreakerBandMid",
      "earthbreakerBandFar",
      "earthbreakerCrack",
    ] as const) {
      expect(EFFECTS[name].sprite.ground, name).toBe(true);
      for (const c of EFFECTS[name].sprite.tint) expect(c in BARROW_HEX).toBe(true);
    }
  });

  it("should kick its shock in pale dust that reads on the brown ground", () => {
    const p = EFFECTS.earthbreakerShock.particles;
    expect(p.texture).toEqual(["fx_dust"]);
    for (const c of p.tint) expect(["barrowBrown", "barrowDeep", "slate", "pitch"]).not.toContain(c);
  });
});
