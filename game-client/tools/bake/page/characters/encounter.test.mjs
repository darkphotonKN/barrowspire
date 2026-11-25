// The dungeon encounters' cast (FS-4EC7Z §H R36): each sheet built by encounter.js and posed exactly
// as the bake poses it (poses.js), with plain materials (the bake page paints with canvases): the
// sheets and their clips, the variants each re-dressing one rig, the captive's rope and cudgel,
// and the legs kept inside the clothes through every clip, with no exemption.

import { describe, it, expect, vi } from "vitest";

vi.mock("../materials.js", async () => {
  const THREE = await import("three");
  const any = new Proxy({}, { get: (t, k) => (t[k] ??= new THREE.MeshBasicMaterial()) });
  return { materials: () => any, mkCanvas: () => { throw new Error("no canvas in Node"); } };
});
vi.mock("./fabrics.js", async () => {
  const THREE = await import("three");
  const proxy = () => new Proxy({}, { get: (t, k) => (t[k] ??= new THREE.MeshBasicMaterial()) });
  const any = proxy();
  const sets = {};
  // each variant its own materials, so a test can see which one a mesh wears
  return { fabrics: () => any, encounterFabrics: () => any, encounterVariant: (kind, letter) => (sets[`${kind}_${letter}`] ??= proxy()) };
});
// the theme (BARROW) is served to the bake page only; gear.js paints with it on a canvas alone
vi.mock("../palette.js", () => ({ cssRgb: () => "", mix: () => [0, 0, 0], shade: () => [0, 0, 0] }));

const { ENCOUNTER, ENCOUNTER_ANIMATIONS } = await import("./encounter.js");
const { encounterVariant } = await import("./fabrics.js");
const { characterPoses } = await import("./poses.js");
const { KNOWN_CLIPPING, MIRRORED_LEGACY, clearanceError, clearanceLimit, legClearance, mirroredGarment } = await import("./clearance.js");

const row = (sheet) => ENCOUNTER.find((c) => c.sheet === sheet);
const worst = (clips) => Object.entries(clips ?? {}).reduce((w, [anim, c]) => (c.px > w.px ? { anim, ...c } : w), { anim: null, px: 0, frame: 0 });
/** The meshes of a posed rig, by whether they are shown. */
const shown = (rig) => {
  const out = [];
  rig.root.traverse((o) => o.isMesh && out.push(o));
  return out;
};

describe("the encounter cast (FS-4EC7Z §H R36)", () => {
  it("bakes the pilgrim, the captive, the cutthroat and the mark's two looks on one group", () => {
    expect(ENCOUNTER.map((c) => c.sheet)).toEqual(["npc_pilgrim", "npc_captive", "npc_cutthroat", "npc_hooded_duelist", "npc_debtor_knight"]);
    for (const c of ENCOUNTER) expect(c.group, c.sheet).toBe("encounter");
  });

  it("gives every sheet idle, walk, attack and death, the pilgrim cower and the captive bound", () => {
    for (const c of ENCOUNTER) expect(Object.keys(c.animations).slice(0, 4), c.sheet).toEqual(["idle", "walk", "attack", "death"]);
    expect(Object.keys(row("npc_pilgrim").animations)).toEqual(["idle", "walk", "attack", "death", "cower"]);
    expect(Object.keys(row("npc_captive").animations)).toEqual(["idle", "walk", "attack", "death", "bound"]);
    // the attack at the classes' 7 keys and 12 fps, so a blow lands where a player's does
    expect(ENCOUNTER_ANIMATIONS.attack).toMatchObject({ frames: 7, fps: 12, loop: false });
    expect(row("npc_pilgrim").animations.cower.loop).toBe(true);
    expect(row("npc_captive").animations.bound.loop).toBe(true);
  });

  it.each(ENCOUNTER.map((c) => [c.sheet, c]))("%s carries each variant as <anim>_<letter> after the plain clips", (sheet, c) => {
    const { animations } = characterPoses(c);
    const clips = Object.keys(c.animations);
    expect(Object.keys(animations)).toEqual([...clips, ...c.letters.slice(1).flatMap((l) => clips.map((a) => `${a}_${l}`))]);
  });

  it("re-dresses the pilgrim's habit in each variant's cloth, and bears the beard on a and c only", () => {
    const { rig, poses } = characterPoses(row("npc_pilgrim"));
    for (const letter of ["a", "b", "c"]) {
      const p = poses.find((x) => x.anim === (letter === "a" ? "idle" : `idle_${letter}`));
      p.apply();
      const robe = encounterVariant("pilgrim", letter).robe;
      expect(shown(rig).some((m) => m.material === robe), letter).toBe(true);
      for (const other of ["a", "b", "c"].filter((l) => l !== letter)) expect(shown(rig).some((m) => m.material === encounterVariant("pilgrim", other).robe)).toBe(false);
    }
    const beardOn = (anim) => {
      poses.find((x) => x.anim === anim).apply();
      return shown(rig).filter((m) => m.material === encounterVariant("pilgrim", anim === "idle" ? "a" : anim.slice(-1)).hair && m.visible).length;
    };
    expect(beardOn("idle")).toBeGreaterThan(0);
    expect(beardOn("idle_b")).toBe(0);
    expect(beardOn("idle_c")).toBeGreaterThan(0);
  });

  it("ropes the captive's wrists and empties his hand while he is bound, and frees both otherwise", () => {
    const { rig, poses } = characterPoses(row("npc_captive"));
    const rope = () => shown(rig).filter((m) => m.geometry.type === "TorusGeometry");
    const club = () => {
      let on = false;
      rig.root.traverse((o) => o.isMesh && o.geometry.type === "CylinderGeometry" && o.parent?.parent?.visible === false && (on = true));
      return !on;
    };
    for (const anim of ["bound", "bound_b"]) {
      poses.find((x) => x.anim === anim).apply();
      expect(rope().every((m) => m.visible), anim).toBe(true);
      expect(club(), anim).toBe(false);
    }
    for (const anim of ["idle", "walk", "attack", "death", "idle_b"]) {
      poses.find((x) => x.anim === anim).apply();
      expect(rope().every((m) => !m.visible), anim).toBe(true);
      expect(club(), anim).toBe(true);
    }
  });

  it.each(ENCOUNTER.map((c) => [c.sheet, c]))("%s keeps its legs inside its clothes through every clip, to one baked px at 1x, with no exemption", (sheet, c) => {
    const { rig, poses } = characterPoses(c);
    expect(mirroredGarment(rig)).toBe(false);
    expect(MIRRORED_LEGACY.has(sheet)).toBe(false);
    expect(KNOWN_CLIPPING.has(sheet)).toBe(false);
    const clips = legClearance(rig, poses);
    const w = worst(clips);
    expect(w.px, `${sheet} ${w.anim} frame ${w.frame}`).toBeLessThanOrEqual(clearanceLimit(1));
    expect(clearanceError(sheet, clips, { mirrored: false, known: new Map(), legacy: new Set() })).toBeNull();
  });
});
