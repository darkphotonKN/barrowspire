// The mercenary's specialization looks (FS-1J1CB §A R7–R8, §B R9, R11, R14, R15): the Duelist's and
// the Sellsword's cast rows, built and posed exactly as the bake poses them (poses.js). Each keeps
// its legs inside its garment and its cloak on every guarded pose of every clip, the parry
// included, with no exemption; the Duelist's half-cloak hangs on cloak bones, never rigid on the
// chest; the Sellsword keeps no madder. Plain materials, named by the key they were cut from, stand
// in for the bake page's painted ones: the checks read geometry and which cloth each piece is cut
// from.

import { describe, it, expect, vi } from "vitest";

/** One plain material per key, named by it, so a figure's materials read back by the key they were cut from. */
const keyed = async (tag) => {
  const THREE = await import("three");
  return new Proxy(
    {},
    {
      get: (t, k) => {
        if (typeof k !== "string") return undefined;
        if (!t[k]) {
          t[k] = new THREE.MeshBasicMaterial();
          t[k].name = `${tag}.${k}`;
        }
        return t[k];
      },
    },
  );
};
vi.mock("../palette.js", () => ({ cssRgb: () => "", mix: () => [0, 0, 0], shade: () => [0, 0, 0] }));
const blankCanvas = (width, height) => {
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  return { width, height, getContext: () => ctx };
};
vi.mock("../materials.js", async () => {
  const any = await keyed("M");
  return { materials: () => any, mkCanvas: blankCanvas, plain: () => any.plain, glow: () => any.glow };
});
vi.mock("./fabrics.js", async () => {
  const THREE = await import("three");
  const any = await keyed("F");
  // a look's `tones` spreads the set into a plain object (look.js `dress`), which keeps only the
  // keys a proxy has already handed out: hand out every cloth the mercenary and his looks cut from
  const cloth = ["coat", "sash", "skin", "breeches", "leather", "leatherDark", "hairDark", "darkSteel", "darkSteelDouble", "steel", "blackIron", "face", "browDark"];
  const looks = ["duelistRobe", "duelistSlate", "sellBlack", "sellSash", "buffCoat"];
  for (const k of [...cloth, ...looks]) void any[k];
  return { fabrics: () => any, retonedFabrics: () => any, mat: () => new THREE.MeshBasicMaterial(), paint: () => ({}), pf: () => 0, pn: () => 0 };
});

const { CAST, mercenary } = await import("./cast.js");
const { characterPoses } = await import("./poses.js");
const { KNOWN_CLIPPING, MIRRORED_LEGACY, clearanceError, cloakClearance, cloakClearanceError, legClearance, mirroredGarment } = await import("./clearance.js");
const { OFFHAND_OF } = await import("./clips.js");

const row = (sheet) => CAST.find((c) => c.sheet === sheet);
const base = row("char_mercenary_base");
const DUELIST = "char_mercenary_duelist";
const SELLSWORD = "char_mercenary_sellsword";
const LOOKS = [DUELIST, SELLSWORD].map((sheet) => [sheet, { ...row(sheet), name: sheet }]);

/** Every mesh's material name on `rig`, or on its bone `bone` alone. */
const matsOf = (rig, bone) => {
  const out = [];
  (bone ? rig.bones[bone] : rig.root).traverse((o) => o.isMesh && (!bone || o.parent === rig.bones[bone]) && out.push(o.material.name));
  return out;
};

/** Meshes cut from no cloth of the mock's: a key lost to a look's spread would leave three.js's default material. */
const unnamed = (rig) => {
  const out = [];
  rig.root.traverse((o) => o.isMesh && !o.material.name && o.material.type === "MeshBasicMaterial" && out.push(`${o.parent?.name} ${o.geometry.type}`));
  return out;
};

/** The bones a skinned mesh's vertices are weighted to, by name. */
function bonesOf(mesh) {
  const idx = mesh.geometry.attributes.skinIndex;
  const wt = mesh.geometry.attributes.skinWeight;
  const out = new Set();
  for (let i = 0; i < idx.count; i++) for (let k = 0; k < 4; k++) if (wt.getComponent(i, k) > 1e-4) out.add(mesh.skeleton.bones[idx.getComponent(i, k)].name);
  return out;
}

/** The rigid meshes riding a shoulder: the spaulders' lames. */
const lamesOn = (rig, s) => rig.bones[`upperArm${s}`].children.filter((o) => o.isMesh && o.material.name === "F.darkSteelDouble");

describe("the mercenary's spec looks in the cast (FS-1J1CB R9, R15)", () => {
  it.each(LOOKS)("bakes %s alone in its own group, at the mercenary's 1.5x, trimmed, with every mercenary clip and the parry", (sheet, r) => {
    expect(r.group).toBe(sheet.replace(/^char_/, ""));
    expect(CAST.filter((c) => c.group === r.group)).toHaveLength(1);
    expect(r).toMatchObject({ scale: 1.5, trim: true, module: "mercLooks" });
    expect(Object.keys(r.animations)).toEqual(Object.keys(base.animations));
    expect(Object.keys(r.animations)).toContain("parry");
    for (const [anim, spec] of Object.entries(base.animations)) expect(r.animations[anim], `${sheet} ${anim}`).toEqual(spec);
    for (const t of Object.values(OFFHAND_OF)) expect(r.animations[t]).toBeUndefined();
  });

  it("leaves the mercenary's own figure as it was: the quilted madder coat and sash, one spaulder, no cloak", () => {
    const { rig } = mercenary();
    const mats = matsOf(rig);
    expect(mats).toContain("F.coat");
    expect(mats).toContain("F.sash");
    expect(lamesOn(rig, "L")).toHaveLength(3);
    expect(lamesOn(rig, "R")).toHaveLength(0);
    expect(rig.bones.cloak0).toBeUndefined();
    for (const k of ["F.duelistRobe", "F.duelistSlate", "F.sellBlack", "F.sellSash", "F.buffCoat"]) expect(mats).not.toContain(k);
  });
});

describe("the mercenary's spec looks pass the guards on every clip (FS-1J1CB R11)", () => {
  it.each(LOOKS)("%s keeps its legs inside its skirts on every clip, the run and the parry included, no exemption", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    expect(mirroredGarment(rig)).toBe(false);
    expect(KNOWN_CLIPPING.has(sheet)).toBe(false);
    expect(MIRRORED_LEGACY.has(sheet)).toBe(false);
    const clips = legClearance(rig, poses);
    expect(Object.keys(clips ?? {}).sort()).toEqual(["attack", "backpedal_attack", "idle", "parry", "run", "walk", "walk_attack"]);
    expect(clearanceError(sheet, clips, { scale: r.scale, mirrored: false, known: new Map(), legacy: new Set() })).toBeNull();
  });

  it("keeps every leg and boot of the Duelist inside his half-cloak on every clip", () => {
    const r = LOOKS[0][1];
    const { rig, poses } = characterPoses(r);
    const clips = cloakClearance(rig, poses);
    expect(clips).not.toBeNull();
    expect(Object.keys(clips)).toContain("parry");
    expect(cloakClearanceError(DUELIST, clips, { scale: r.scale })).toBeNull();
  });
});

describe("the Duelist (FS-1J1CB R7)", () => {
  const { rig } = row(DUELIST).build();
  const mats = matsOf(rig);
  let cloakMesh;
  rig.root.traverse((o) => o.userData.cloak && (cloakMesh = o));

  it("cuts every piece from a named cloth (the mock hands each out, so none is lost to the spread)", () => {
    expect(unnamed(rig)).toEqual([]);
  });

  it("hangs the half-cloak on cloak bones, skinned like the knight's cloak, never rigid on the chest", () => {
    expect(cloakMesh?.isSkinnedMesh).toBe(true);
    expect(cloakMesh.material.name).toBe("F.duelistSlate");
    expect(rig.bones.chest.children).not.toContain(cloakMesh);
    const bones = bonesOf(cloakMesh);
    for (const b of ["cloak0", "cloak1", "cloak2", "cloak3"]) expect(bones.has(b), b).toBe(true);
    expect(rig.springs.map((s) => s.bone)).toEqual(expect.arrayContaining(["cloak0", "cloak1", "cloak2", "cloak3"]));
  });

  it("slings the half-cloak from the off (left) shoulder, in place of the left spaulder", () => {
    cloakMesh.geometry.computeBoundingBox();
    const { min, max } = cloakMesh.geometry.boundingBox;
    // over the left shoulder and wide of the left arm, short of the right one
    expect(max.x).toBeGreaterThan(-min.x * 2);
    const x = rig.bind.upperArmL.x;
    expect(max.x).toBeGreaterThan(x + 0.06 * rig.H);
    // hung from the shoulders, never carried by an arm
    expect(bonesOf(cloakMesh).has("upperArmL")).toBe(false);
    expect(bonesOf(cloakMesh).has("upperArmR")).toBe(false);
    expect(lamesOn(rig, "L")).toHaveLength(0);
    expect(lamesOn(rig, "R")).toHaveLength(0);
  });

  it("wears a robe in faded madder in place of the quilted coat: split at both sides, to mid-calf", () => {
    expect(mats).not.toContain("F.coat");
    const skirts = [];
    rig.root.traverse((o) => o.userData.garment && skirts.push(o));
    expect(skirts).toHaveLength(2);
    for (const s of skirts) expect(s.material.name).toBe("F.duelistRobe");
    // to mid-calf: under the knee, over the boot's foot
    const ky = rig.bind.shinL.y;
    for (const s of skirts) {
      s.geometry.computeBoundingBox();
      expect(s.geometry.boundingBox.min.y).toBeLessThan(ky - 0.04 * rig.H);
      expect(s.geometry.boundingBox.min.y).toBeGreaterThan(rig.bind.footL.y + 0.06 * rig.H);
    }
    // the wrapped body and the wide sleeves over the arms are robe too
    expect(mats.filter((m) => m === "F.duelistRobe").length).toBeGreaterThanOrEqual(6);
  });

  it("girds the robe with a wide slate-black sash wound twice, and keeps the vambrace, blade, hair and beard", () => {
    expect(mats).not.toContain("F.sash");
    expect(matsOf(rig, "hips").filter((m) => m === "F.duelistSlate").length).toBeGreaterThanOrEqual(3);
    expect(matsOf(rig, "foreArmR")).toContain("F.darkSteel");
    expect(matsOf(rig, "head").filter((m) => m === "F.hairDark").length).toBeGreaterThanOrEqual(3);
    expect(mats).toContain("F.steel");
  });

  it("keeps the shared face under the mercenary's own hair (R14)", () => {
    expect(new Set(matsOf(rig, "head"))).toEqual(new Set(["F.skin", "F.face", "F.browDark", "F.hairDark"]));
  });
});

describe("the Sellsword (FS-1J1CB R8)", () => {
  const { rig } = row(SELLSWORD).build();
  const mats = matsOf(rig);

  it("cuts every piece from a named cloth", () => {
    expect(unnamed(rig)).toEqual([]);
  });

  it("dyes the madder base black: the arming coat and the sash carry no madder tone", () => {
    expect(mats).not.toContain("F.coat");
    expect(mats).not.toContain("F.sash");
    expect(mats).toContain("F.sellBlack");
    expect(mats).toContain("F.sellSash");
    let coat;
    rig.root.traverse((o) => o.userData.garment && (coat = o));
    expect(coat.material.name).toBe("F.sellBlack");
  });

  it("wears the buff-leather coat buckled in brass, a spaulder on both shoulders and a purse at the belt", () => {
    expect(mats).toContain("F.buffCoat");
    expect(matsOf(rig, "chest").filter((m) => m === "M.brass")).toHaveLength(4);
    expect(lamesOn(rig, "L")).toHaveLength(3);
    expect(lamesOn(rig, "R")).toHaveLength(3);
    const purse = rig.bones.hips.children.find((g) => g.isGroup && g.children.some((o) => o.material?.name === "M.brass"));
    expect(purse).toBeDefined();
    expect(rig.bones.cloak0).toBeUndefined();
  });

  it("keeps the shared face under the mercenary's own hair (R14)", () => {
    expect(new Set(matsOf(rig, "head"))).toEqual(new Set(["F.skin", "F.face", "F.browDark", "F.hairDark"]));
  });
});
