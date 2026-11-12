// The hub folk's legs stay under their clothes (FS-HF0WW § Change: The folk's legs stay under their
// clothes): each folk sheet, built by folk.js and posed exactly as the bake poses it (poses.js),
// passes the leg-clearance guard (clearance.js) with no exemption.
//
// The bake page dresses the folk in canvas-painted fabrics; here every fabric and material is a
// plain one, which the guard does not look at: it measures geometry only.

import { describe, it, expect, vi } from "vitest";

vi.mock("../materials.js", async () => {
  const THREE = await import("three");
  const any = new Proxy({}, { get: (t, k) => (t[k] ??= new THREE.MeshBasicMaterial()) });
  return { materials: () => any, mkCanvas: () => { throw new Error("no canvas in Node"); } };
});
vi.mock("./fabrics.js", async () => {
  const THREE = await import("three");
  const any = new Proxy({}, { get: (t, k) => (t[k] ??= new THREE.MeshBasicMaterial()) });
  return { fabrics: () => any, folkFabrics: () => any };
});
// the theme (BARROW) is served to the bake page only; gear.js paints with it on a canvas alone
vi.mock("../palette.js", () => ({ cssRgb: () => "", mix: () => [0, 0, 0], shade: () => [0, 0, 0] }));

const { FOLK } = await import("./folk.js");
const { characterPoses } = await import("./poses.js");
const { KNOWN_CLIPPING, MIRRORED_LEGACY, clearanceError, clearanceLimit, legClearance, mirroredGarment } = await import("./clearance.js");

/** The furthest any clip of a sheet shows a leg outside its clothes (1x px), and where. */
const worst = (clips) => Object.entries(clips ?? {}).reduce((w, [anim, c]) => (c.px > w.px ? { anim, ...c } : w), { anim: null, px: 0, frame: 0 });

describe("the hub folk's legs stay under their clothes (FS-HF0WW § Change: The folk's legs stay under their clothes)", () => {
  it("bakes the four folk sheets", () => {
    expect(FOLK.map((f) => f.sheet)).toEqual(["folk_resident_trousers", "folk_resident_skirt", "folk_spirewarden", "folk_quartermaster"]);
  });

  it.each(FOLK.map((f) => [f.sheet, f]))("%s wears its clothes on the garment weighting the classes use, not the old mirrored one", (sheet, f) => {
    const { rig } = characterPoses(f);
    expect(mirroredGarment(rig)).toBe(false);
    expect(MIRRORED_LEGACY.has(sheet)).toBe(false);
  });

  it.each(FOLK.map((f) => [f.sheet, f]))("%s keeps its legs inside its clothes through idle and walk, every palette, to one baked px at 1x", (sheet, f) => {
    const { rig, poses } = characterPoses(f);
    const clips = legClearance(rig, poses);
    const w = worst(clips);
    expect(w.px, `${sheet} ${w.anim} frame ${w.frame}`).toBeLessThanOrEqual(clearanceLimit(1));
    // the guard's verdict with no exemption: off both legacy lists
    expect(KNOWN_CLIPPING.has(sheet)).toBe(false);
    expect(clearanceError(sheet, clips, { mirrored: mirroredGarment(rig), known: new Map(), legacy: new Set() })).toBeNull();
    expect(clearanceError(sheet, clips, { mirrored: mirroredGarment(rig) })).toBeNull();
  });

  it("leaves only the monsters on the legacy lists", () => {
    expect([...KNOWN_CLIPPING.keys()]).toEqual(["creature_troll_base", "creature_zombie_base", "creature_ghost_base"]);
    expect([...MIRRORED_LEGACY].sort()).toEqual(["creature_demon_base", "creature_ghost_base", "creature_ghoul_base", "creature_troll_base", "creature_zombie_base"]);
  });
});
