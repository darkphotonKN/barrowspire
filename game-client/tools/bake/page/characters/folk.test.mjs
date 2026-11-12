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
const { KNOWN_CLIPPING, MIRRORED_LEGACY, clearanceError, clearanceLimit, legClearance, mirroredGarment, seenThroughCloth, throughCloth } = await import("./clearance.js");
const { fabrics } = await import("./fabrics.js");
const { K1 } = await import("../projection.js");
const THREE = await import("three");

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

  // round 2 (2026-11-12, the owner: "NPC 腿部重繪 還是有一點破圖 尤其是npc quartermaster"): the guard
  // passed the quartermaster at 0.66 px, while from behind the camera saw his breeches' thigh roots
  // come up through his shirt at the hips, round the pale seat of the shirt below the belt, and in
  // the walk his leading thigh through the apron's side edge
  it.each(FOLK.map((f) => [f.sheet, f]))("the camera sees no hip, thigh or knee of %s through its clothes in any facing, through idle and walk in every palette", (sheet, f) => {
    const { rig, poses } = characterPoses(f);
    const seen = seenThroughCloth(rig, poses);
    if (sheet === "folk_resident_skirt") {
      // no legs under her kirtle, only boots: nothing to see through it
      expect(seen).toBeNull();
      return;
    }
    const worst = seen.reduce((m, p) => (p.seen > m.seen ? p : m), { seen: 0 });
    expect(worst.seen, `${sheet} ${worst.anim} frame ${worst.i}`).toBe(0);
  });

  it("the quartermaster's breeches seat never comes out through his apron, where it tucks under the apron's side edges, through idle and walk", () => {
    const f = FOLK.find((x) => x.sheet === "folk_quartermaster");
    const { rig, poses } = characterPoses(f);
    const F = fabrics();
    const worn = [];
    rig.root.traverse((o) => o.isSkinnedMesh && o.userData.garment && worn.push(o));
    const seat = worn.find((m) => m.material === F.breeches);
    const apron = worn.find((m) => m.material === F.apron);
    expect(seat).toBeDefined();
    expect(apron).toBeDefined();
    const world = (m) => Array.from({ length: m.geometry.attributes.position.count }, (_, i) => m.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(m.matrixWorld));
    let most = -Infinity;
    let under = 0;
    for (const p of poses) {
      p.apply();
      rig.root.updateMatrixWorld(true);
      const axis = new THREE.Vector3().setFromMatrixPosition(rig.bones.hips.matrixWorld);
      const { rows, cols } = apron.geometry.userData.tube;
      const A = world(apron);
      const cover = [{ rings: Array.from({ length: rows }, (_, r) => A.slice(r * cols, (r + 1) * cols)) }];
      for (const v of world(seat)) {
        // null where the apron is not round it (the back, above the apron's top)
        const o = throughCloth(cover, axis, v);
        if (o === null) continue;
        under++;
        most = Math.max(most, o * K1);
      }
    }
    // the seat does run under the apron's edges, and stays under them
    expect(under).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(0);
  });

  it("leaves only the monsters on the legacy lists", () => {
    expect([...KNOWN_CLIPPING.keys()]).toEqual(["creature_troll_base", "creature_zombie_base", "creature_ghost_base"]);
    expect([...MIRRORED_LEGACY].sort()).toEqual(["creature_demon_base", "creature_ghost_base", "creature_ghoul_base", "creature_troll_base", "creature_zombie_base"]);
  });
});
