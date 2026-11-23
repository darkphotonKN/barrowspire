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
const { KNOWN_CLIPPING, MIRRORED_LEGACY, clearanceError, cloakClearance, cloakClearanceError, legClearance, mirroredGarment, seenThroughCloth } = await import("./clearance.js");
const { OFFHAND_OF } = await import("./clips.js");
const { BERSERKER_STYLE, KNIGHT_STYLE, SPRINT_RUN } = await import("./classStyles.js");

const row = (sheet) => CAST.find((c) => c.sheet === sheet);
const base = row("char_knight_base");
const LOOKS = ["char_knight_guardian", "char_knight_berserker"].map((sheet) => [sheet, { ...row(sheet), name: sheet }]);
/** The knight's three figures as the bake poses them: his own and the two looks. */
const FIGURES = [["char_knight_base", { ...base, name: "char_knight_base" }], ...LOOKS];
/**
 * The clips the camera check reads: at rest and every moving clip. His sheets carry no attack on
 * the move (FS-JS7C8 § Change: The knight's sprint, and the attack-on-the-move clips retired R149),
 * and the Berserker's `attack_offhand` stands as `attack` does.
 */
const MOVING = ["idle", "run", "walk"];

describe("the warrior's spec looks in the cast (FS-1J1CB R9, R15)", () => {
  it.each(LOOKS)("bakes %s alone in its own group, at the knight's 1.5x, trimmed, with every knight clip", (sheet, r) => {
    expect(r.group).toBe(sheet.replace(/^char_/, ""));
    expect(CAST.filter((c) => c.group === r.group)).toHaveLength(1);
    expect(r).toMatchObject({ scale: 1.5, trim: true, module: "warriorLooks" });
    for (const [anim, spec] of Object.entries(base.animations)) expect(r.animations[anim], `${sheet} ${anim}`).toEqual(spec);
  });

  // FS-JS7C8 § Change: The knight's sprint, and the attack-on-the-move clips retired R138: the
  // Guardian takes his sprint through the knight's style, the Berserker through his own
  it("runs the Guardian on the knight's style and the Berserker on his own, each sheet's run the sprint's clip by reference", () => {
    expect(row("char_knight_guardian").build().style).toBe(KNIGHT_STYLE);
    expect(row("char_knight_berserker").build().style).toBe(BERSERKER_STYLE);
    for (const sheet of ["char_knight_base", "char_knight_guardian", "char_knight_berserker"]) expect(row(sheet).animations.run, sheet).toBe(SPRINT_RUN);
  });

  // his one attack is `attack`, so its one twin is `attack_offhand`: no walk_attack_offhand, no
  // backpedal_attack_offhand (FS-JS7C8 § Change: The knight's sprint, and the attack-on-the-move
  // clips retired R149; FS-1J1CB R9, R28)
  it("gives the off-hand attack, attack_offhand alone, to the Berserker's sheet alone", () => {
    expect(Object.keys(row("char_knight_berserker").animations)).toEqual([...Object.keys(base.animations), "attack_offhand"]);
    for (const c of CAST)
      for (const t of Object.values(OFFHAND_OF))
        if (c.sheet !== "char_knight_berserker" || t !== "attack_offhand") expect(c.animations?.[t], `${c.sheet} ${t}`).toBeUndefined();
  });
});

describe("the warrior's figures pass the guards on every clip (FS-1J1CB R11; FS-JS7C8 § Change: The knight's sprint, and the attack-on-the-move clips retired R142)", () => {
  it.each(FIGURES)("%s keeps its legs inside the hauberk and its surcoat, no exemption", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    expect(mirroredGarment(rig)).toBe(false);
    expect(KNOWN_CLIPPING.has(sheet)).toBe(false);
    expect(MIRRORED_LEGACY.has(sheet)).toBe(false);
    const clips = legClearance(rig, poses);
    expect(Object.keys(clips ?? {}).sort()).toEqual(expect.arrayContaining(["idle", "walk", "run", "attack"]));
    expect(clearanceError(sheet, clips, { scale: r.scale, mirrored: false, known: new Map(), legacy: new Set() })).toBeNull();
  });

  it.each(FIGURES)("%s keeps every leg and boot inside its cloak", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    const clips = cloakClearance(rig, poses);
    expect(clips).not.toBeNull();
    expect(cloakClearanceError(sheet, clips, { scale: r.scale })).toBeNull();
  });

  // FS-JS7C8 § Change: The knight's sprint, and the attack-on-the-move clips retired R142: the
  // camera sees no hip, thigh or knee through the hauberk, the surcoat or the waist on his own
  // figure and each look, as the bake poses them, at rest and on every moving clip the sheet
  // carries (clearance.test.mjs reads the same on a rebuilt base)
  it.each(FIGURES)("%s shows no hip, thigh or knee through the cloth in any facing, at rest and on every moving clip", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    const anims = MOVING.filter((anim) => anim in r.animations);
    expect(anims).toEqual(MOVING);
    for (const anim of ["walk_attack", "backpedal_attack"]) expect(r.animations, `${sheet} ${anim}`).not.toHaveProperty(anim);
    const seen = seenThroughCloth(rig, poses.filter((p) => anims.includes(p.anim)));
    expect(seen.length).toBeGreaterThan(0);
    const worst = seen.reduce((m, f) => (f.seen > m.seen ? f : m), { seen: 0 });
    expect(worst.seen, `${sheet} ${worst.anim} frame ${worst.i}`).toBe(0);
  });
});
