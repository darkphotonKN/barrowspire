import { describe, expect, it } from "vitest";
import { BARROW_HEX } from "@/utils/theme";
import {
  EFFECTS,
  type EffectEntry,
  type FxTexture,
  type Range,
  type Token,
} from "./table";

/** §B.3: Linear, Sine, Quad and Cubic only. */
const EASINGS = /^(Linear|(Sine|Quad|Cubic)\.ease(In|Out|InOut))$/;

const entries = Object.entries(EFFECTS) as [string, EffectEntry][];
const oneShots = entries.filter(([, e]) => e.timing.kind === "oneShot");

describe("effects table (FS-KYPQ9 §B.2)", () => {
  it("should carry one entry per effect named in §B.2", () => {
    expect(Object.keys(EFFECTS).sort()).toEqual(
      [
        "slash",
        "chargeDust",
        "chargeTrail",
        "fireballCast",
        "castLight",
        "impactFlare",
        "lightDecay",
        "fallingEmbers",
        "scorch",
        "fireballTrail",
        "arrowRelease",
        "arrowTrail",
        "arrowImpact",
        "hit",
        "deathDust",
        "escape",
        "entranceBreath",
        "chimneySmoke",
      ].sort(),
    );
  });

  it("should give each one-shot the §B.2 duration", () => {
    const want: Record<string, number> = {
      slash: 220,
      chargeDust: 450,
      fireballCast: 160,
      castLight: 200,
      impactFlare: 120,
      lightDecay: 500,
      fallingEmbers: 600,
      scorch: 1200,
      arrowRelease: 140,
      arrowImpact: 300,
      hit: 220,
      deathDust: 600,
      escape: 1000,
    };
    const got = Object.fromEntries(
      oneShots.map(([name, e]) => [
        name,
        e.timing.kind === "oneShot" ? e.timing.durationMs : -1,
      ]),
    );
    expect(got).toEqual(want);
  });

  it("should keep every one-shot at a fixed duration of at most 1200 ms", () => {
    expect(oneShots.length).toBeGreaterThan(0);
    for (const [name, e] of oneShots) {
      if (e.timing.kind !== "oneShot") continue;
      expect(Number.isInteger(e.timing.durationMs), name).toBe(true);
      expect(e.timing.durationMs, name).toBeGreaterThan(0);
      expect(e.timing.durationMs, name).toBeLessThanOrEqual(1200);
    }
  });

  it("should use only the allowlisted easings (§B.3)", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const [name, e] of entries) expect(e.ease, name).toMatch(EASINGS);
  });
});

/** The tokens an entry draws with, across every channel. */
function colorsOf(e: EffectEntry): Token[] {
  return [
    ...new Set<Token>([
      ...(e.sprite?.tint ?? []),
      ...(e.particles?.tint ?? []),
      ...Object.values(e.particles?.looks ?? {}).flatMap((l) => l.tint),
      ...(e.light ? [e.light.color] : []),
      ...(e.tint ? [e.tint.color] : []),
    ]),
  ];
}

/** True when any key named `scaleX`/`scaleY` appears anywhere in the entry. */
function hasAxisScale(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([k, v]) => k === "scaleX" || k === "scaleY" || hasAxisScale(v),
  );
}

/** §B.4: scale grows only for dust and smoke dispersing. */
const GROWS: readonly FxTexture[] = ["fx_dust", "fx_smoke"];

/** Each sheet an entry draws, with the scale range it is drawn at. */
function scalesOf(e: EffectEntry): [FxTexture, Range][] {
  const out: [FxTexture, Range][] = [];
  if (e.sprite) out.push([e.sprite.texture, e.sprite.scale]);
  const p = e.particles;
  if (p)
    for (const sheet of p.texture)
      out.push([sheet, p.looks?.[sheet]?.scale ?? p.scale]);
  return out;
}

/** Every §B.4/§B.6/§B.7 rule an entry breaks, as readable lines. */
function violations(table: Record<string, EffectEntry>): string[] {
  const out: string[] = [];
  for (const [name, e] of Object.entries(table)) {
    if (!EASINGS.test(e.ease)) out.push(`${name}: easing ${e.ease}`);
    if (hasAxisScale(e)) out.push(`${name}: per-axis scale`);
    for (const [sheet, scale] of scalesOf(e)) {
      if (scale.to < scale.from) out.push(`${name}: scale shrinks`);
      if (scale.to > 1.6) out.push(`${name}: end scale > 1.6`);
      if (scale.to > scale.from && !GROWS.includes(sheet))
        out.push(`${name}: ${sheet} grows`);
    }
    const yoyo = (e.sprite as { yoyo?: unknown } | undefined)?.yoyo;
    if (yoyo !== undefined && yoyo !== "alpha")
      out.push(`${name}: yoyo on ${String(yoyo)}`);
    if (yoyo !== undefined && name !== "entranceBreath")
      out.push(`${name}: yoyo outside the entrance marker`);
    if (e.sprite?.repeat !== undefined && yoyo !== "alpha")
      out.push(`${name}: repeat without an alpha yoyo`);

    const colors = colorsOf(e);
    for (const c of colors)
      if (!(c in BARROW_HEX)) out.push(`${name}: ${c} is not a BARROW key`);
    if (colors.length > 3) out.push(`${name}: ${colors.length} colours`);
    if (colors.includes("amber") && name !== "entranceBreath")
      out.push(`${name}: amber outside the entrance marker`);
    if (colors.includes("oxblood") && name !== "hit")
      out.push(`${name}: oxblood outside the hit`);

    if (e.timing.kind === "oneShot" && (e.particles?.count ?? 0) > 12)
      out.push(`${name}: one-shot emits more than 12`);
    if (e.timing.kind === "stream" && e.timing.intervalMs < 40)
      out.push(`${name}: trail emits faster than one per 40 ms`);
  }
  return out;
}

describe("effect rules (FS-KYPQ9 §B.4, §B.6, §B.7)", () => {
  it("should reject a table that breaks each rule (the check can fail)", () => {
    const steady = { from: 1, to: 1 };
    const bad = {
      squash: {
        timing: { kind: "oneShot", durationMs: 200 },
        ease: "Linear",
        sprite: {
          texture: "fx_glow",
          tint: ["vellum"],
          scale: { from: 1, to: 2 },
          alpha: steady,
          scaleX: 1.2,
          yoyo: "scale",
          repeat: -1,
        },
      },
      confetti: {
        timing: { kind: "oneShot", durationMs: 200 },
        ease: "Linear",
        particles: {
          texture: ["fx_ember"],
          tint: ["amber", "oxblood", "ember", "vellum"],
          count: 30,
          scale: steady,
          alpha: steady,
          speed: steady,
          angle: { from: 0, to: 360 },
          accel: { x: 0, y: 0 },
        },
      },
      hose: {
        timing: { kind: "stream", lifeMs: 300, intervalMs: 10 },
        ease: "Linear",
      },
      pop: {
        timing: { kind: "oneShot", durationMs: 200 },
        ease: "Back.easeOut",
        sprite: {
          texture: "fx_glow",
          tint: ["vellum"],
          scale: { from: 1.4, to: 0.6 },
          alpha: steady,
        },
      },
      flare: {
        timing: { kind: "oneShot", durationMs: 200 },
        ease: "Linear",
        particles: {
          texture: ["fx_ember", "fx_smoke"],
          tint: ["ember"],
          count: 2,
          scale: { from: 1, to: 1.3 },
          alpha: steady,
          speed: steady,
          angle: steady,
          accel: { x: 0, y: 0 },
          looks: { fx_smoke: { tint: ["oxblood"], scale: steady } },
        },
      },
      neon: {
        timing: { kind: "oneShot", durationMs: 200 },
        ease: "Linear",
        light: { color: "magenta", radius: 100, intensity: steady },
      },
    } as unknown as Record<string, EffectEntry>;

    expect(violations(bad).sort()).toEqual(
      [
        "squash: per-axis scale",
        "squash: end scale > 1.6",
        "squash: fx_glow grows",
        "squash: yoyo on scale",
        "squash: yoyo outside the entrance marker",
        "squash: repeat without an alpha yoyo",
        "confetti: 4 colours",
        "confetti: amber outside the entrance marker",
        "confetti: oxblood outside the hit",
        "confetti: one-shot emits more than 12",
        "hose: trail emits faster than one per 40 ms",
        "pop: easing Back.easeOut",
        "pop: scale shrinks",
        "neon: magenta is not a BARROW key",
        "flare: fx_ember grows",
        "flare: oxblood outside the hit",
      ].sort(),
    );
  });

  it("should find no violation in the real table", () => {
    expect(violations(EFFECTS as Record<string, EffectEntry>)).toEqual([]);
  });

  it("should yoyo only the entrance marker's alpha, 0.55 to 0.85 over a 2400 ms period", () => {
    const e = EFFECTS.entranceBreath;
    expect(e.timing).toEqual({ kind: "loop", periodMs: 2400 });
    expect(e.ease).toBe("Sine.easeInOut");
    expect(e.sprite).toMatchObject({
      yoyo: "alpha",
      alpha: { from: 0.55, to: 0.85 },
      scale: { from: 1, to: 1 },
      tint: ["amber"],
    });
  });

  it("should keep the trails' rates and alphas (§E.2, §F.2, §A.6)", () => {
    expect(EFFECTS.fireballTrail.timing).toMatchObject({ lifeMs: 300 });
    expect(EFFECTS.arrowTrail.timing).toMatchObject({ lifeMs: 180 });
    expect(EFFECTS.arrowTrail.particles.alpha.from).toBeLessThanOrEqual(0.55);
    expect(
      EFFECTS.arrowTrail.particles.count *
        Math.ceil(
          EFFECTS.arrowTrail.timing.lifeMs /
            EFFECTS.arrowTrail.timing.intervalMs,
        ),
    ).toBeLessThanOrEqual(12);
    expect("light" in EFFECTS.arrowTrail).toBe(false);
    expect(EFFECTS.chimneySmoke.timing).toMatchObject({
      lifeMs: 4000,
      maxAlive: 10,
    });
    expect(EFFECTS.chimneySmoke.particles.alpha.from).toBeLessThanOrEqual(0.35);
  });

  it("should kick the charge's dust at the feet for the gradual move, faint, and let it settle (§D.2)", () => {
    // the server carries the charge over several ticks: the dust follows the body, then fades
    expect(EFFECTS.chargeTrail.timing).toMatchObject({
      kind: "stream",
      lifeMs: 350,
      onRelease: "fade",
    });
    const t = EFFECTS.chargeTrail.timing;
    if (t.kind !== "stream") throw new Error("chargeTrail is a stream");
    // about the old one-shot's 8 motes alive at once, and faint
    expect(
      EFFECTS.chargeTrail.particles.count * Math.ceil(t.lifeMs / t.intervalMs),
    ).toBeLessThanOrEqual(10);
    expect(t.maxAlive).toBeLessThanOrEqual(10);
    expect(EFFECTS.chargeTrail.particles.alpha.from).toBeLessThanOrEqual(0.65);
    expect("light" in EFFECTS.chargeTrail).toBe(false);
  });

  it("should pair the fireball trail's embers and smoke each with its own look (§B.4, §B.7)", () => {
    const p = EFFECTS.fireballTrail.particles;
    expect(p.texture).toEqual(["fx_ember", "fx_smoke"]);
    // the embers burn steady in fire colours and never grow
    expect(p.tint).toEqual(["ember", "amberBright"]);
    expect(p.scale).toEqual({ from: 1, to: 1 });
    // the smoke is dark and may disperse
    expect(p.looks?.fx_smoke?.tint).toEqual(["barrowDeep"]);
    expect(p.looks?.fx_smoke?.scale.to).toBeGreaterThan(1);
    expect("fx_ember" in p.looks).toBe(false);
  });

  it("should let the fireball's trail burn out after impact, and cut the arrow's with the arrow (§E.3, §F.2)", () => {
    expect(EFFECTS.fireballTrail.timing).toMatchObject({ onRelease: "fade" });
    expect(EFFECTS.chimneySmoke.timing).toMatchObject({ onRelease: "fade" });
    expect(EFFECTS.arrowTrail.timing).toMatchObject({ onRelease: "cut" });
  });

  it("should draw the steel and the dust that must read on brown ground in pale tokens", () => {
    // barrowBrown and slate vanish on the barrow's brown ground at 1x
    const dark: Token[] = ["barrowBrown", "barrowDeep", "slate", "pitch"];
    for (const name of [
      "slash",
      "chargeDust",
      "chargeTrail",
      "deathDust",
    ] as const)
      for (const c of colorsOf(EFFECTS[name]))
        expect(dark, `${name}: ${c}`).not.toContain(c);
    expect(EFFECTS.slash.sprite.tint).toContain("vellum");
  });

  it("should cap the hit tint at half way to oxblood", () => {
    expect(EFFECTS.hit.tint).toEqual({ color: "oxblood", peak: 0.5 });
  });
});
