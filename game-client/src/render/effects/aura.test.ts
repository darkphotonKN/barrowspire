import { describe, expect, it, vi } from "vitest";
import { worldToScreen, type Point } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import { BARROW_HEX } from "@/utils/theme";
import { auraOf, Auras, GLOOM, WARD, type AuraKind } from "./aura";
import { fakeArt, fakeLights, fakeScene, type FakeObject } from "./fakeScene";
import { HEAL_LOOK, SHIMMER_GRANTED_MS, SHIMMER_LAYER, ShimmerFx } from "./shimmer";

// FS-1J1CB §E R31–R37: the ward and the gloom, against the effects' fake scene.

const AT: Point = { x: 200, y: 120 };
const CROWN = 76;
const FRAME_MS = 16;
const SPELLWARDEN = { class: "mage", specialization: "spellwarden" };
const SHADOW_RANGER = { class: "archer", specialization: "shadow_ranger" };
const WEARER: Record<AuraKind, { class: string; specialization: string }> = {
  ward: SPELLWARDEN,
  gloom: SHADOW_RANGER,
};
const CAP: Record<AuraKind, number> = { ward: WARD.max, gloom: GLOOM.max };

/** A seeded random source, so a run of frames is repeatable. */
function seeded(seed = 7): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function setup(opts: { reducedMotion?: boolean } = {}) {
  const fake = fakeScene();
  const logger = { warn: vi.fn() };
  const auras = new Auras(fake.scene, fakeArt, { random: seeded(), logger, ...opts });
  return { ...fake, auras, logger };
}

/** The objects that wink: a ward's glint containers (they hold a glint and its core) or a gloom's motes. */
function particles(made: FakeObject[], kind: AuraKind): FakeObject[] {
  return kind === "ward"
    ? made.filter((o) => o.kind === "container" && Array.isArray(o.calls.add?.[0]))
    : made.filter((o) => o.kind === "image");
}

/** Its two layers: the containers holding particles. */
function layers(made: FakeObject[]): FakeObject[] {
  return made.filter((o) => o.kind === "container" && o.calls.setDepth);
}

const alphaOf = (o: FakeObject) => (o.calls.setAlpha?.[0] as number | undefined) ?? 0;

/** Follows body `id` at `at` frame by frame from `from` for `ms`, calling `each` after every frame. */
function frames(auras: Auras, id: string, from: number, ms: number, each?: (now: number) => void, at: Point | null = AT) {
  for (let now = from; now <= from + ms; now += FRAME_MS) {
    auras.follow(id, at, CROWN, now);
    each?.(now);
  }
}

describe("auraOf (FS-1J1CB R31)", () => {
  it.each([
    [SPELLWARDEN, "ward"],
    [SHADOW_RANGER, "gloom"],
    [{ class: "Mage", specialization: "spellwarden" }, "ward"],
    [{ class: "mage", specialization: "pyromancer" }, undefined],
    [{ class: "archer", specialization: "hunter" }, undefined],
    [{ class: "warrior", specialization: "spellwarden" }, undefined],
    [{ class: "mage" }, undefined],
    [{ class: "archer", specialization: "nonsense" }, undefined],
  ])("should give %o the aura %s", (who, kind) => {
    expect(auraOf(who)).toBe(kind);
  });
});

describe.each(["ward", "gloom"] as const)("the %s (FS-1J1CB R32–R35)", (kind) => {
  it("should stay within its alive cap and make nothing after its pool across 10 s of frames, with no tween, timer or light", () => {
    const { auras, made, tweens, timers } = setup();
    const { lights, added } = fakeLights();
    void lights; // an aura is never handed a light-map: it has nowhere to add one (R32–R34)
    auras.see("a", WEARER[kind]);
    auras.follow("a", AT, CROWN, 0);
    const pool = made.length;
    expect(pool).toBeGreaterThan(0);
    let most = 0;
    frames(auras, "a", FRAME_MS, 10_000, () => {
      most = Math.max(most, particles(made, kind).filter((o) => alphaOf(o) > 0).length);
    });
    expect(made.length).toBe(pool);
    expect(particles(made, kind)).toHaveLength(CAP[kind]);
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(CAP[kind]);
    expect(auras.alive("a")).toBeLessThanOrEqual(CAP[kind]);
    expect(tweens).toHaveLength(0);
    expect(timers).toHaveLength(0);
    expect(added).toHaveLength(0);
    expect(made.every((o) => !o.destroyed)).toBe(true);
  });

  it("should build nothing until the body is first drawn alive", () => {
    const { auras, made } = setup();
    auras.see("a", WEARER[kind]);
    auras.follow("a", null, CROWN, 0);
    expect(made).toHaveLength(0);
    auras.follow("a", AT, CROWN, FRAME_MS);
    expect(made.length).toBeGreaterThan(0);
  });

  it("should stand at the body's feet, one layer in front of it and one behind, as the shimmer sorts", () => {
    const { auras, made } = setup();
    auras.see("a", WEARER[kind]);
    auras.follow("a", AT, CROWN, 0);
    const s = worldToScreen(AT.x, AT.y);
    const depths = layers(made).map((l) => l.calls.setDepth[0]);
    expect(depths.sort()).toEqual(
      [worldDepth(AT.x, AT.y, SHIMMER_LAYER.behind), worldDepth(AT.x, AT.y, SHIMMER_LAYER.front)].sort(),
    );
    for (const l of layers(made)) expect(l.calls.setPosition).toEqual([s.x, s.y]);
    // it moves with the feet
    auras.follow("a", { x: AT.x + 40, y: AT.y }, CROWN, FRAME_MS);
    const moved = worldToScreen(AT.x + 40, AT.y);
    for (const l of layers(made)) expect(l.calls.setPosition).toEqual([moved.x, moved.y]);
  });

  it("should hide with its body, and wink again once it is drawn alive (a fog, a death, a respawn)", () => {
    const { auras, made } = setup();
    auras.see("a", WEARER[kind]);
    frames(auras, "a", 0, 3000);
    expect(auras.alive("a")).toBeGreaterThan(0);
    // hidden or dead: the layers go and nothing winks on under them
    frames(auras, "a", 3000 + FRAME_MS, 3000, undefined, null);
    for (const l of layers(made)) expect(l.calls.setVisible).toEqual([false]);
    expect(auras.alive("a")).toBe(0);
    expect(particles(made, kind).every((o) => alphaOf(o) === 0)).toBe(true);
    // risen: back, with no new pool
    const pool = made.length;
    frames(auras, "a", 6000 + FRAME_MS, 3000);
    for (const l of layers(made)) expect(l.calls.setVisible).toEqual([true]);
    expect(auras.alive("a")).toBeGreaterThan(0);
    expect(made.length).toBe(pool);
  });

  it("should hold a few still particles at a lower alpha under reduced motion (R36)", () => {
    const { auras, made } = setup({ reducedMotion: true });
    auras.see("a", WEARER[kind]);
    auras.follow("a", AT, CROWN, 0);
    const still = kind === "ward" ? WARD.still : GLOOM.still;
    const shown = particles(made, kind);
    expect(shown).toHaveLength(still.count);
    const before = shown.map((o) => [alphaOf(o), o.calls.setPosition, o.calls.setScale]);
    for (const o of shown) expect(alphaOf(o)).toBe(still.alpha);
    expect(still.alpha).toBeLessThan(kind === "ward" ? WARD.alpha : GLOOM.alpha);
    frames(auras, "a", FRAME_MS, 5000);
    expect(shown.map((o) => [alphaOf(o), o.calls.setPosition, o.calls.setScale])).toEqual(before);
    expect(made).toHaveLength(made.length);
  });

  it("should go with its body: forget destroys everything it made", () => {
    const { auras, made } = setup();
    auras.see("a", WEARER[kind]);
    frames(auras, "a", 0, 1000);
    auras.forget("a");
    expect(made.every((o) => o.destroyed)).toBe(true);
    // a late follow draws nothing for a body gone
    auras.follow("a", AT, CROWN, 2000);
    expect(made.filter((o) => !o.destroyed)).toHaveLength(0);
  });
});

describe("the ward's look (FS-1J1CB R32)", () => {
  it("should wink necrotic glints round vellum centres, at most half the heal glint's alpha", () => {
    const { auras, made } = setup();
    auras.see("a", SPELLWARDEN);
    let peak = 0;
    frames(auras, "a", 0, 10_000, () => {
      for (const o of particles(made, "ward")) peak = Math.max(peak, alphaOf(o));
    });
    expect(WARD.alpha).toBeLessThanOrEqual(0.5);
    expect(peak).toBeLessThanOrEqual(WARD.alpha);
    const images = made.filter((o) => o.kind === "image");
    const tints = new Set(images.map((o) => o.calls.setTint[0]));
    expect(tints).toEqual(new Set([BARROW_HEX.necrotic, BARROW_HEX.vellum]));
    for (const o of images) expect(o.calls.setBlendMode).toEqual(["ADD"]);
  });

  it("should trace a shell: every glint on the ellipse a little wider than the shoulders, shins to over the crown", () => {
    const { auras, made } = setup();
    auras.see("a", SPELLWARDEN);
    const top = CROWN + WARD.overCrown;
    const bottom = CROWN * WARD.shins;
    const mid = (top + bottom) / 2;
    const ry = (top - bottom) / 2;
    frames(auras, "a", 0, 4000, () => {
      for (const o of particles(made, "ward")) {
        if (alphaOf(o) === 0) continue;
        const [x, y] = o.calls.setPosition as [number, number];
        // as it rises a little off its point on the shell
        const h = -y;
        const onShell = (x / WARD.halfWidth) ** 2 + ((h - mid) / ry) ** 2;
        expect(onShell).toBeGreaterThan(0.6);
        expect(onShell).toBeLessThan(1.6);
      }
    });
  });

  it("should wink one on every 400 to 700 ms", () => {
    const { auras, made } = setup();
    auras.see("a", SPELLWARDEN);
    const born: number[] = [];
    const seen = new Set<FakeObject>();
    frames(auras, "a", 0, 10_000, (now) => {
      for (const o of particles(made, "ward")) {
        const lit = alphaOf(o) > 0;
        if (lit && !seen.has(o)) born.push(now);
        if (lit) seen.add(o);
        else seen.delete(o);
      }
    });
    const gaps = born.slice(1).map((t, i) => t - born[i]);
    expect(gaps.length).toBeGreaterThan(8);
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(WARD.gapMs.from - FRAME_MS);
      expect(gap).toBeLessThanOrEqual(WARD.gapMs.to + 2 * FRAME_MS);
    }
  });
});

describe("the gloom's look (FS-1J1CB R33)", () => {
  it("should draw bare umbra motes, no centre, no glow and never burning additively", () => {
    const { auras, made } = setup();
    auras.see("a", SHADOW_RANGER);
    frames(auras, "a", 0, 2000);
    const images = made.filter((o) => o.kind === "image");
    expect(new Set(images.map((o) => o.calls.setTint[0]))).toEqual(new Set([BARROW_HEX.umbra]));
    for (const o of images) expect(o.args[3]).toBe("fx_mote/idle/0/0");
    for (const o of images) expect(o.calls.setBlendMode).toBeUndefined();
    expect(made.filter((o) => o.kind === "container")).toHaveLength(2);
  });

  it("should rise a little off the figure and sink back as it fades", () => {
    const { auras, made } = setup();
    auras.see("a", SHADOW_RANGER);
    const track = new Map<FakeObject, { y: number; alpha: number }[]>();
    frames(auras, "a", 0, 6000, () => {
      for (const o of particles(made, "gloom")) {
        const alpha = alphaOf(o);
        if (alpha === 0) continue;
        const list = track.get(o) ?? [];
        list.push({ y: (o.calls.setPosition as number[])[1], alpha });
        track.set(o, list);
      }
    });
    const one = [...track.values()].find((l) => l.length > 40)!;
    expect(one).toBeDefined();
    const ys = one.map((p) => p.y);
    const highest = ys.indexOf(Math.min(...ys));
    // up (screen y falls), then back down
    expect(highest).toBeGreaterThan(0);
    expect(highest).toBeLessThan(ys.length - 1);
    expect(ys[0] - ys[highest]).toBeLessThanOrEqual(GLOOM.rise.to + 0.01);
    // fading as it sinks
    expect(one[one.length - 1].alpha).toBeLessThan(one[highest].alpha);
    for (const p of one) expect(p.alpha).toBeLessThanOrEqual(GLOOM.alpha);
  });
});

describe("Auras across bodies (FS-1J1CB R34, R35)", () => {
  it("should draw nothing for a body with no aura's specialization", () => {
    const { auras, made } = setup();
    auras.see("a", { class: "mage", specialization: "pyromancer" });
    auras.see("b", { class: "warrior" });
    frames(auras, "a", 0, 2000);
    frames(auras, "b", 0, 2000);
    expect(made).toHaveLength(0);
  });

  it("should start when a spec appears mid-scene, and change or end with it", () => {
    const { auras, made } = setup();
    auras.see("a", { class: "mage" });
    frames(auras, "a", 0, 500);
    expect(made).toHaveLength(0);
    auras.see("a", SPELLWARDEN);
    frames(auras, "a", 500, 500);
    const ward = made.length;
    expect(ward).toBeGreaterThan(0);
    // the same state again leaves the pool be
    auras.see("a", SPELLWARDEN);
    expect(made.length).toBe(ward);
    expect(made.every((o) => !o.destroyed)).toBe(true);
    auras.see("a", { class: "mage" });
    expect(made.every((o) => o.destroyed)).toBe(true);
  });

  it("should keep one pool per body, each within its own cap, and clear them all with the scene", () => {
    const { auras, made } = setup();
    for (let i = 0; i < 5; i++) auras.see(`w${i}`, SPELLWARDEN);
    for (let now = 0; now <= 4000; now += FRAME_MS)
      for (let i = 0; i < 5; i++) auras.follow(`w${i}`, { x: AT.x + i * 30, y: AT.y }, CROWN, now);
    for (let i = 0; i < 5; i++) expect(auras.alive(`w${i}`)).toBeLessThanOrEqual(WARD.max);
    expect(particles(made, "ward")).toHaveLength(5 * WARD.max);
    auras.clear();
    expect(made.every((o) => o.destroyed)).toBe(true);
  });

  it("should play nothing when a sheet is missing, logged once (FS-KYPQ9 §B.10)", () => {
    const fake = fakeScene();
    const logger = { warn: vi.fn() };
    const art = { ...fakeArt, has: (name: string) => name !== "fx_glint" };
    const auras = new Auras(fake.scene, art, { logger });
    auras.see("a", SPELLWARDEN);
    auras.see("b", SPELLWARDEN);
    frames(auras, "a", 0, 500);
    frames(auras, "b", 0, 500);
    expect(fake.made).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain("fx_glint");
  });
});

describe("a heal shimmer over the ward (FS-1J1CB R37)", () => {
  it("should play in full on a Spellwarden, and neither cuts the other short", () => {
    const { auras, made, timers, tweens, scene } = setup();
    const { lights, alive } = fakeLights();
    auras.see("a", SPELLWARDEN);
    frames(auras, "a", 0, 1000);
    const ward = [...made];

    const shimmers = new ShimmerFx(scene, fakeArt, lights, { random: seeded(3) });
    shimmers.follow(AT);
    shimmers.playGranted(HEAL_LOOK, CROWN);
    const heal = made.filter((o) => !ward.includes(o));
    expect(heal.length).toBeGreaterThan(0);
    expect(alive()).toHaveLength(1);
    const healTweens = tweens.length;

    // the ward winds on through the whole shimmer: it touches none of the heal's objects or tweens
    frames(auras, "a", 1000 + FRAME_MS, SHIMMER_GRANTED_MS, () => shimmers.follow(AT));
    expect(heal.every((o) => !o.destroyed)).toBe(true);
    expect(tweens.filter((t) => t.stopped)).toHaveLength(0);
    expect(tweens).toHaveLength(healTweens);
    expect(auras.alive("a")).toBeGreaterThan(0);

    // the shimmer ends on its own clock, in full, and leaves the ward be
    const end = timers.find((t) => t.delay === SHIMMER_GRANTED_MS)!;
    end.fire();
    expect(heal.every((o) => o.destroyed)).toBe(true);
    expect(ward.every((o) => !o.destroyed)).toBe(true);
    frames(auras, "a", 2200, 2000);
    expect(auras.alive("a")).toBeGreaterThan(0);
  });
});
