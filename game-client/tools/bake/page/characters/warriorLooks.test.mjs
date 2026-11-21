// The warrior's specialization looks (FS-1J1CB §A R1–R2, §B R9, R11, R15): the Guardian's and the
// Berserker's cast rows, built and posed exactly as the bake poses them (poses.js), keep every leg
// and boot inside the hauberk, the surcoat and the cloak on every guarded pose of every clip, with
// no exemption. Plain materials stand in for the bake page's painted ones: the guards measure
// geometry only.

import { describe, it, expect, vi } from "vitest";

vi.mock("../palette.js", () => ({ cssRgb: () => "", mix: () => [0, 0, 0], shade: () => [0, 0, 0] }));
const blankCanvas = (width, height) => {
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  return { width, height, getContext: () => ctx };
};
vi.mock("../materials.js", async () => {
  const THREE = await import("three");
  const any = new Proxy({}, { get: (t, k) => (typeof k === "string" ? (t[k] ??= new THREE.MeshBasicMaterial()) : undefined) });
  return { materials: () => any, mkCanvas: blankCanvas, plain: () => any.plain, glow: () => any.glow };
});
vi.mock("./fabrics.js", async () => {
  const THREE = await import("three");
  const any = new Proxy({}, { get: (t, k) => (typeof k === "string" ? (t[k] ??= new THREE.MeshBasicMaterial()) : undefined) });
  return { fabrics: () => any, retonedFabrics: () => any, mat: () => new THREE.MeshBasicMaterial(), paint: () => ({}), pf: () => 0, pn: () => 0 };
});

const { CAST } = await import("./cast.js");
const { characterPoses } = await import("./poses.js");
const { KNOWN_CLIPPING, MIRRORED_LEGACY, clearanceError, cloakClearance, cloakClearanceError, legClearance, mirroredGarment } = await import("./clearance.js");
const { OFFHAND_OF } = await import("./clips.js");

const row = (sheet) => CAST.find((c) => c.sheet === sheet);
const base = row("char_knight_base");
const LOOKS = ["char_knight_guardian", "char_knight_berserker"].map((sheet) => [sheet, { ...row(sheet), name: sheet }]);

describe("the warrior's spec looks in the cast (FS-1J1CB R9, R15)", () => {
  it.each(LOOKS)("bakes %s alone in its own group, at the knight's 1.5x, trimmed, with every knight clip", (sheet, r) => {
    expect(r.group).toBe(sheet.replace(/^char_/, ""));
    expect(CAST.filter((c) => c.group === r.group)).toHaveLength(1);
    expect(r).toMatchObject({ scale: 1.5, trim: true, module: "warriorLooks" });
    for (const [anim, spec] of Object.entries(base.animations)) expect(r.animations[anim], `${sheet} ${anim}`).toEqual(spec);
  });

  it("gives the off-hand clips to the Berserker's sheet alone", () => {
    const twins = Object.values(OFFHAND_OF);
    expect(Object.keys(row("char_knight_berserker").animations)).toEqual([...Object.keys(base.animations), ...twins]);
    for (const c of CAST) if (c.sheet !== "char_knight_berserker") for (const t of twins) expect(c.animations?.[t], `${c.sheet} ${t}`).toBeUndefined();
  });
});

describe("the warrior's spec looks pass the guards on every clip (FS-1J1CB R11)", () => {
  it.each(LOOKS)("%s keeps its legs inside the hauberk and its surcoat, no exemption", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    expect(mirroredGarment(rig)).toBe(false);
    expect(KNOWN_CLIPPING.has(sheet)).toBe(false);
    expect(MIRRORED_LEGACY.has(sheet)).toBe(false);
    const clips = legClearance(rig, poses);
    expect(Object.keys(clips ?? {}).sort()).toEqual(expect.arrayContaining(["idle", "walk", "run", "attack"]));
    expect(clearanceError(sheet, clips, { scale: r.scale, mirrored: false, known: new Map(), legacy: new Set() })).toBeNull();
  });

  it.each(LOOKS)("%s keeps every leg and boot inside its cloak", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    const clips = cloakClearance(rig, poses);
    expect(clips).not.toBeNull();
    expect(cloakClearanceError(sheet, clips, { scale: r.scale })).toBeNull();
  });
});
