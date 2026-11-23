// The warrior's specialization looks (FS-1J1CB §A R1–R2, §B R9, R11, R15, §Change: Looks v2
// R54, R62, R65, R68, R69): the Guardian's and the Berserker's cast rows, built and posed exactly
// as the bake poses them (poses.js), keep every leg and boot inside the hauberk, the surcoat and
// the cloak on every guarded pose of every clip, with no exemption; the Guardian's flanged mace
// keeps clear of his shield and his head on every one. Plain materials stand in for the bake
// page's painted ones: the guards measure geometry only.

import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";

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
const { BERSERKER_STYLE, GUARDIAN_STYLE, KNIGHT_STYLE, SPRINT_RUN } = await import("./classStyles.js");
const gear = await import("./gear.js");
const kit = await import("./warriorKit.js");
const looks = await import("./warriorLooks.js");
const { knight } = await import("./cast.js");

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
  // Guardian takes his sprint through the knight's style, the Berserker through his own. Integrated
  // with Looks v2 (2026-11-23): the Guardian's own style (FS-1J1CB § Change: Looks v2 R54, R62)
  // re-keys only his cut's shield arm, so his carry, walk and run stay the knight's by reference
  it("runs the Guardian on the knight's run and the Berserker on his own, each sheet's run the sprint's clip by reference", () => {
    const guardian = row("char_knight_guardian").build().style;
    expect(guardian).toBe(GUARDIAN_STYLE);
    for (const k of ["hold", "walk", "run"]) expect(guardian[k], k).toBe(KNIGHT_STYLE[k]);
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
  // camera sees no hip, thigh or knee through the hauberk, the surcoat or the waist on each look,
  // as the bake poses it, at rest and on every moving clip the sheet carries. His own figure is
  // clearance.test.mjs's: its rebuilt base wears the same hauberk, legs, cloak and springs on
  // KNIGHT_STYLE and KNIGHT_SHEET, with fewer parts to hide a leg, so it reads at least as much
  it.each(LOOKS)("%s shows no hip, thigh or knee through the cloth in any facing, at rest and on every moving clip", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    const anims = MOVING.filter((anim) => anim in r.animations);
    expect(anims).toEqual(MOVING);
    const seen = seenThroughCloth(rig, poses.filter((p) => anims.includes(p.anim)));
    expect(seen.length).toBeGreaterThan(0);
    const worst = seen.reduce((m, f) => (f.seen > m.seen ? f : m), { seen: 0 });
    expect(worst.seen, `${sheet} ${worst.anim} frame ${worst.i}`).toBe(0);
  });
});

describe("the warrior kit (FS-1J1CB §Change: Looks v2 R68, R69)", () => {
  it("builds the spec-only weapons, the flanged mace and the heavy axe, in the kit (warriorKit.js, split from warriorLooks.js past 400 lines), and gear.js no longer does", () => {
    for (const k of ["flangedMace", "heavyAxe", "AXE_EDGE_TURN"]) expect(kit[k], k).toBeDefined();
    for (const k of ["beardedAxe", "AXE_EDGE_TURN"]) expect(gear[k], k).toBeUndefined();
    // the base's shield stays shared
    expect(gear.kiteShield).toBeDefined();
  });

  it("composes the two looks as look objects (look.js)", () => {
    for (const look of [looks.guardian, looks.berserker]) for (const key of Object.keys(look)) expect(["tones", "mats", "opts", "omit", "swap", "bones", "add", "style"]).toContain(key);
  });
});

/** The figure's weapon groups by tag, under the bone they ride. */
function tagged(rig, tag) {
  const out = [];
  rig.root.traverse((o) => o.userData[tag] && out.push(o));
  return out;
}

describe("the Guardian's flanged mace and bigger shield (FS-1J1CB §Change: Looks v2 R54)", () => {
  const { rig } = knight(looks.guardian);
  const base = knight();

  it("holds a flanged mace in the right hand and no longsword", () => {
    const maces = tagged(rig, "mace");
    expect(maces).toHaveLength(1);
    let b = maces[0].parent;
    while (b && !/^hand[LR]$/.test(b.name)) b = b.parent;
    expect(b.name).toBe("handR");
    // the hand holds the mace alone, no blade beside it: every weapon mounted in the grip (gear.js `inHand`) is the mace
    const held = rig.bones.handR.children.filter((o) => o.isGroup).flatMap((g) => g.children);
    expect(held).toEqual([maces[0]]);
  });

  it("makes the mace shorter than the longsword, its flanges standing clear of the haft", () => {
    const { length, head } = tagged(rig, "mace")[0].userData.mace;
    expect(length).toBeLessThan(0.5);
    expect(head.r).toBeGreaterThan(head.haft * 2.5);
  });

  it("carries the kite shield about 1.3x the knight's", () => {
    const [own] = tagged(rig, "shield");
    const [theirs] = tagged(base.rig, "shield");
    expect(own.userData.shield.scale).toBeCloseTo(1.3, 2);
    expect(theirs.userData.shield.scale).toBe(1);
    expect(own.userData.shield.w / theirs.userData.shield.w).toBeCloseTo(1.3, 2);
  });
});

describe("the Guardian's mace keeps clear of his shield and his head on every pose (FS-1J1CB §Change: Looks v2 R62)", () => {
  const r = { ...row("char_knight_guardian"), name: "char_knight_guardian" };
  const { rig, poses } = characterPoses(r);
  const [mace] = tagged(rig, "mace");
  const [shield] = tagged(rig, "shield");
  const both = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  // what the head bone carries: the head, the coif and the great helm, double-sided so a ray from inside meets them too
  const heads = [];
  rig.bones.head.traverse((o) => o.isMesh && heads.push(o));
  for (const m of [...heads, shield]) m.material = both;
  const { pommel, head } = mace.userData.mace;
  const H = rig.H;
  // the mace in its grip frame (H): the axis pommel to crown, then the head's flange tips round it at three heights
  const axis = Array.from({ length: 9 }, (_, i) => new THREE.Vector3(0, 0, (pommel + ((head.to - pommel) * i) / 8) * H));
  const rings = [head.from, (head.from + head.to) / 2, head.to].map((z) =>
    Array.from({ length: 8 }, (_, k) => new THREE.Vector3(Math.cos((k * Math.PI) / 4) * head.r * H, Math.sin((k * Math.PI) / 4) * head.r * H, z * H)),
  );
  const rc = new THREE.Raycaster();
  const crosses = (a, b, meshes) => {
    const d = b.clone().sub(a);
    rc.set(a, d.clone().normalize());
    rc.near = 0;
    rc.far = d.length();
    return rc.intersectObjects(meshes, false).length > 0;
  };

  it.each(poses.map((p) => [`${p.anim} @${p.i}`, p]))("%s", (_, p) => {
    p.apply();
    rig.root.updateMatrixWorld(true);
    const w = (v) => v.clone().applyMatrix4(mace.matrixWorld);
    const ax = axis.map(w);
    const ring = rings.map((rr) => rr.map(w));
    const segs = [
      ...ax.slice(1).map((b, i) => [ax[i], b]),
      // round each ring and down each flange line
      ...ring.flatMap((rr) => rr.map((a, k) => [a, rr[(k + 1) % rr.length]])),
      ...ring.slice(1).flatMap((rr, j) => rr.map((a, k) => [ring[j][k], a])),
      // across the head through the axis
      ...ring.flatMap((rr) => rr.slice(0, 4).map((a, k) => [a, rr[k + 4]])),
    ];
    for (const [a, b] of segs) {
      expect(crosses(a, b, [shield]), "the mace through the shield").toBe(false);
      expect(crosses(a, b, heads), "the mace through the head").toBe(false);
    }
  });
});
