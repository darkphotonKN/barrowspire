// The archer's specialization looks (FS-1J1CB §A R5–R6, §B R9, R11, R14, R15): the Hunter's and the
// Shadow Ranger's cast rows, built and posed exactly as the bake poses them (poses.js). Each keeps
// its legs inside the tunic and the cloak on every guarded pose of every clip, with no exemption,
// and its quiver over the cloak; the Hunter wears no cowl and nothing of the Nightwood green, her
// head the shared face under brown hair; the Shadow Ranger is dyed through to soot. Plain
// materials, named by the key they were cut from, stand in for the bake page's painted ones: the
// checks read geometry and which cloth each piece is cut from.

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
  // keys a proxy has already handed out: hand out every cloth the archer and her looks cut from
  const cloth = ["buff", "skin", "rangerNight", "rangerNightDark", "rangerHose", "leather", "leatherDark", "leatherDouble", "linen", "steel", "face", "browDark"];
  const looks = ["hunterWool", "hunterWoolDark", "goose", "horn", "wolf", "jerkinHide", "hairBrown", "shadow", "shadowDark", "shadowLeather", "shadowBlack", "shadowFletch"];
  for (const k of [...cloth, ...looks]) void any[k];
  return { fabrics: () => any, retonedFabrics: () => any, mat: () => new THREE.MeshBasicMaterial(), paint: () => ({}), pf: () => 0, pn: () => 0 };
});

const THREE = await import("three");
const { CAST, archer } = await import("./cast.js");
const { characterPoses } = await import("./poses.js");
const { KNOWN_CLIPPING, MIRRORED_LEGACY, clearanceError, cloakClearance, cloakClearanceError, legClearance, mirroredGarment, throughCloth } = await import("./clearance.js");
const { OFFHAND_OF } = await import("./clips.js");
const { K1 } = await import("../projection.js");

const row = (sheet) => CAST.find((c) => c.sheet === sheet);
const base = row("char_archer_base");
const HUNTER = "char_archer_hunter";
const SHADOW = "char_archer_shadow_ranger";
const LOOKS = [HUNTER, SHADOW].map((sheet) => [sheet, { ...row(sheet), name: sheet }]);

/** Every mesh's material name on `rig`, or on its bone `bone` alone. */
const matsOf = (rig, bone) => {
  const out = [];
  (bone ? rig.bones[bone] : rig.root).traverse((o) => o.isMesh && (!bone || o.parent === rig.bones[bone]) && out.push(o.material.name));
  return out;
};

/**
 * Meshes cut from no cloth of the mock's: a key lost to a look's spread would leave three.js's
 * default material. The bow's string is its own plain material (gear.js `longbow`), not a cloth.
 */
const unnamed = (rig) => {
  const out = [];
  rig.root.traverse((o) => o.isMesh && !o.material.name && o.material.type === "MeshBasicMaterial" && out.push(`${o.parent?.name} ${o.geometry.type}`));
  return out;
};

/** The meshes riding the quiver's mount on the chest: the case, its rim, the shafts and the fletching. */
function quiverMeshes(rig) {
  const out = [];
  for (const g of rig.bones.chest.children) if (g.isGroup && g.children.some((o) => o.isMesh && o.material.name === "F.leatherDouble")) out.push(...g.children.filter((o) => o.isMesh));
  return out;
}

describe("the archer's spec looks in the cast (FS-1J1CB R9, R15)", () => {
  it.each(LOOKS)("bakes %s alone in its own group, at the archer's 1.5x, trimmed, with every archer clip", (sheet, r) => {
    expect(r.group).toBe(sheet.replace(/^char_/, ""));
    expect(CAST.filter((c) => c.group === r.group)).toHaveLength(1);
    expect(r).toMatchObject({ scale: 1.5, trim: true, module: "archerLooks" });
    expect(Object.keys(r.animations)).toEqual(Object.keys(base.animations));
    for (const [anim, spec] of Object.entries(base.animations)) expect(r.animations[anim], `${sheet} ${anim}`).toEqual(spec);
    for (const t of Object.values(OFFHAND_OF)) expect(r.animations[t]).toBeUndefined();
  });

  it("leaves the archer's own figure as it was: the Nightwood cowl, the linen fletching, no nock caps", () => {
    const { rig } = archer();
    const mats = matsOf(rig);
    expect(matsOf(rig, "head")).toContain("F.rangerNight");
    expect(mats).toContain("F.linen");
    expect(mats).not.toContain("F.horn");
    expect(mats).not.toContain("F.wolf");
  });
});

describe("the archer's spec looks pass the guards on every clip (FS-1J1CB R11)", () => {
  it.each(LOOKS)("%s keeps its legs inside the tunic, no exemption", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    expect(mirroredGarment(rig)).toBe(false);
    expect(KNOWN_CLIPPING.has(sheet)).toBe(false);
    expect(MIRRORED_LEGACY.has(sheet)).toBe(false);
    const clips = legClearance(rig, poses);
    expect(Object.keys(clips ?? {}).sort()).toEqual(expect.arrayContaining(["idle", "walk", "run", "attack", "walk_attack", "backpedal_attack"]));
    expect(clearanceError(sheet, clips, { scale: r.scale, mirrored: false, known: new Map(), legacy: new Set() })).toBeNull();
  });

  it.each(LOOKS)("%s keeps every leg and boot inside its cloak", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    const clips = cloakClearance(rig, poses);
    expect(clips).not.toBeNull();
    expect(cloakClearanceError(sheet, clips, { scale: r.scale })).toBeNull();
  });
});

describe("the archer's spec looks keep the quiver over the cloak (FS-HF0WW; FS-1J1CB R5)", () => {
  it.each(LOOKS)("%s never sinks the quiver's case into the cloak, on any frame of any clip", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    let cloakMesh;
    rig.root.traverse((o) => o.userData.cloak && (cloakMesh = o));
    const cases = quiverMeshes(rig).filter((o) => o.material.name === "F.leatherDouble");
    expect(cases).toHaveLength(1);
    const [body] = cases;
    const axis = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (const p of poses) {
      if (p.anim === "death") continue;
      p.apply();
      rig.root.updateMatrixWorld(true);
      const { rows, cols } = cloakMesh.geometry.userData.tube;
      const at = (i) => cloakMesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(cloakMesh.matrixWorld);
      const cover = [{ rings: Array.from({ length: rows }, (_, k) => Array.from({ length: cols }, (_, j) => at(k * cols + j))) }];
      axis.setFromMatrixPosition(rig.bones.hips.matrixWorld);
      const pos = body.geometry.attributes.position;
      let deepest = 0;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld);
        deepest = Math.max(deepest, -(throughCloth(cover, axis, v) ?? 0));
      }
      expect(deepest * K1, `${sheet} ${p.anim} frame ${p.i}: the case into the cloak (1x px)`).toBe(0);
    }
  });
});

describe("the Hunter (FS-1J1CB R5)", () => {
  const { rig } = row(HUNTER).build();
  const mats = matsOf(rig);

  it("cuts every piece from a named cloth (the mock hands each out, so none is lost to the spread)", () => {
    expect(unnamed(rig)).toEqual([]);
  });

  it("wears no cowl: her head is the shared face under brown hair, unbearded (R14)", () => {
    const head = matsOf(rig, "head");
    expect(head).toContain("F.face");
    expect(head).toContain("F.hairBrown");
    expect(new Set(head)).toEqual(new Set(["F.skin", "F.face", "F.browDark", "F.hairBrown"]));
  });

  it("keeps nothing of the Nightwood green: the cloak, capelet and sleeves in undyed grey-brown wool", () => {
    expect(mats).not.toContain("F.rangerNight");
    expect(mats).not.toContain("F.rangerNightDark");
    let cloakMesh;
    rig.root.traverse((o) => o.userData.cloak && (cloakMesh = o));
    expect(cloakMesh.material.name).toBe("F.hunterWool");
    expect(matsOf(rig, "chest")).toContain("F.hunterWool");
  });

  it("wears the wolf pelt over the shoulders and the laced hide jerkin over the buff", () => {
    expect(matsOf(rig, "chest")).toContain("F.wolf");
    expect(mats).toContain("F.jerkinHide");
    // the buff tunic and the buff leather still carry the figure under them
    expect(mats).toContain("F.buff");
  });

  it("carries long goose fletching standing high out of the quiver, and horn caps on the bow's nocks", () => {
    const fletch = quiverMeshes(rig).filter((o) => o.material.name === "F.goose");
    expect(fletch).toHaveLength(6);
    const plain = quiverMeshes(archer().rig).filter((o) => o.material.name === "F.linen");
    const tall = (o) => (o.geometry.computeBoundingBox(), o.geometry.boundingBox.max.y - o.geometry.boundingBox.min.y);
    expect(tall(fletch[0]) / tall(plain[0])).toBeGreaterThanOrEqual(1.7);
    expect(Math.min(...fletch.map((o) => o.position.y))).toBeGreaterThan(Math.min(...plain.map((o) => o.position.y)));
    expect(mats.filter((m) => m === "F.horn")).toHaveLength(2);
    expect(mats).not.toContain("F.linen");
  });
});

describe("the Shadow Ranger (FS-1J1CB R6)", () => {
  const { rig } = row(SHADOW).build();
  const mats = matsOf(rig);

  it("cuts every piece from a named cloth", () => {
    expect(unnamed(rig)).toEqual([]);
  });

  it("dyes the Nightwood through to soot on the cowl, capelet and cloak, the sleeves darker", () => {
    expect(mats).not.toContain("F.rangerNight");
    expect(mats).not.toContain("F.rangerNightDark");
    expect(matsOf(rig, "head")).toContain("F.shadow");
    let cloakMesh;
    rig.root.traverse((o) => o.userData.cloak && (cloakMesh = o));
    expect(cloakMesh.material.name).toBe("F.shadow");
    expect(mats).toContain("F.shadowDark");
  });

  it("blackens the buff leather to a cold grey, and the bracers, boots and fletching to black", () => {
    expect(mats).not.toContain("F.buff");
    expect(mats).toContain("F.shadowLeather");
    for (const s of ["L", "R"]) expect(matsOf(rig, `foreArm${s}`)).toContain("F.shadowBlack");
    expect(mats).not.toContain("F.leather");
    expect(mats).not.toContain("F.linen");
    expect(quiverMeshes(rig).filter((o) => o.material.name === "F.shadowFletch")).toHaveLength(6);
  });

  it("bakes no gloom: nothing lit on the figure (the gloom is a runtime aura, §E)", () => {
    expect(mats.filter((m) => /^M\.(glow|arcane)/.test(m))).toEqual([]);
  });
});
