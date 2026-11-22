// The mercenary's specialization looks (FS-1J1CB §A R7–R8, §B R9, R11, R14, R15, §Change: Looks v2
// R60, R61, R62, R65, R68, R69): the Duelist's and the Sellsword's cast rows, built and posed
// exactly as the bake poses them (poses.js). Each keeps its legs inside its garment and its cloak
// on every guarded pose of every clip, the parry included, with no exemption; each blade keeps clear
// of the head and the body on every pose, and the Duelist's long hilt clear of his forearm; the
// Duelist's half-cloak hangs on cloak bones, never rigid on the chest; the Sellsword keeps no
// madder. Plain materials, named by the key they were cut from, stand in for the bake page's
// painted ones: the checks read geometry and which cloth each piece is cut from.

import { describe, it, expect, vi } from "vitest";

/**
 * One plain material per key, named by it, so a figure's materials read back by the key they were
 * cut from. `names` are made up front, so a look's `tones` (spread over the set, look.js) carry them.
 */
const keyed = async (tag, names = []) => {
  const THREE = await import("three");
  const made = {};
  for (const k of names) {
    made[k] = new THREE.MeshBasicMaterial();
    made[k].name = `${tag}.${k}`;
  }
  return new Proxy(made, {
    get: (t, k) => {
      if (typeof k !== "string") return undefined;
      if (!t[k]) {
        t[k] = new THREE.MeshBasicMaterial();
        t[k].name = `${tag}.${k}`;
      }
      return t[k];
    },
  });
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
  // every key fabrics() paints, read from its source
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./fabrics.js", import.meta.url), "utf8");
  const names = [...src.matchAll(/^ {4}(\w+): (?:mat|faceMaterial|browMaterial)\(/gm), ...src.matchAll(/SET\.(\w+) = /g)].map((m) => m[1]);
  const any = await keyed("F", names);
  return { fabrics: () => any, retonedFabrics: () => any, mat: () => new THREE.MeshBasicMaterial(), paint: () => ({}), pf: () => 0, pn: () => 0 };
});

const THREE = await import("three");
const { readFileSync } = await import("node:fs");
const { CAST, mercenary } = await import("./cast.js");
const { characterPoses } = await import("./poses.js");
const { KNOWN_CLIPPING, MIRRORED_LEGACY, clearanceError, cloakClearance, cloakClearanceError, legClearance, mirroredGarment } = await import("./clearance.js");
const { OFFHAND_OF } = await import("./clips.js");
const { DUELIST_STYLE, MERCENARY_STYLE } = await import("./classStyles.js");
const gear = await import("./gear.js");
const kit = await import("./mercKit.js");
const looks = await import("./mercLooks.js");

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
const lamesOn = (rig, s, mat) => rig.bones[`upperArm${s}`].children.filter((o) => o.isMesh && o.material.name === mat);

/** The one group under the figure tagged `tag` (a weapon's `userData`), or none. */
function tagged(rig, tag) {
  const out = [];
  rig.root.traverse((o) => o.userData[tag] && out.push(o));
  return out;
}

/** The bone a group rides, up its parents. */
function boneOf(o) {
  let b = o.parent;
  while (b && !b.isBone) b = b.parent;
  return b;
}

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

  it("leaves the mercenary's own figure as it was: the quilted madder coat and sash, one spaulder, no cloak, the knuckle-bowed blade", () => {
    const { rig, style } = mercenary();
    const mats = matsOf(rig);
    expect(mats).toContain("F.coat");
    expect(mats).toContain("F.sash");
    expect(lamesOn(rig, "L", "F.darkSteelDouble")).toHaveLength(3);
    expect(lamesOn(rig, "R", "F.darkSteelDouble")).toHaveLength(0);
    expect(rig.bones.cloak0).toBeUndefined();
    for (const t of ["longBlade", "falchion", "longScabbard", "falchionScabbard"]) expect(tagged(rig, t), t).toHaveLength(0);
    expect(mats).toContain("F.steel");
    for (const k of ["F.duelistRobe", "F.duelistSlate", "F.sellBlack", "F.sellSash", "F.buffCoat"]) expect(mats).not.toContain(k);
    expect(style).toBe(MERCENARY_STYLE);
  });
});

describe("the mercenary's spec looks pass the guards on every clip (FS-1J1CB R11, §Change: Looks v2 R65)", () => {
  it.each(LOOKS)("%s keeps its legs inside its skirts on every clip, the run and the parry included, no exemption", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    expect(mirroredGarment(rig)).toBe(false);
    expect(KNOWN_CLIPPING.has(sheet)).toBe(false);
    expect(MIRRORED_LEGACY.has(sheet)).toBe(false);
    const clips = legClearance(rig, poses);
    expect(Object.keys(clips ?? {}).sort()).toEqual(["attack", "backpedal_attack", "idle", "parry", "run", "walk", "walk_attack"]);
    expect(clearanceError(sheet, clips, { scale: r.scale, mirrored: false, known: new Map(), legacy: new Set() }), JSON.stringify(clips)).toBeNull();
  });

  it("keeps every leg and boot of the Duelist inside his half-cloak on every clip", () => {
    const r = LOOKS[0][1];
    const { rig, poses } = characterPoses(r);
    const clips = cloakClearance(rig, poses);
    expect(clips).not.toBeNull();
    expect(Object.keys(clips)).toContain("parry");
    expect(cloakClearanceError(DUELIST, clips, { scale: r.scale }), JSON.stringify(clips)).toBeNull();
  });
});

describe("each look's blade keeps clear of the head and the body on every pose, and the Duelist's hilt of his forearm (FS-1J1CB §Change: Looks v2 R60, R61, R62)", () => {
  const rc = new THREE.Raycaster();
  /** Whether the segment a→b crosses any of `meshes`' surfaces. */
  const crosses = (a, b, meshes) => {
    const d = b.clone().sub(a);
    rc.set(a, d.clone().normalize());
    rc.near = 0;
    rc.far = d.length();
    return rc.intersectObjects(meshes, false).length > 0;
  };
  /** The distance from `p` to the segment a→b. */
  const toSegment = (p, a, b) => {
    const ab = b.clone().sub(a);
    const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
    return p.distanceTo(a.clone().addScaledVector(ab, t));
  };

  describe.each(LOOKS)("%s", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    const H = rig.H;
    const [blade] = tagged(rig, sheet === DUELIST ? "longBlade" : "falchion");
    const both = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    // what the head bone carries (the head, the face, the hair, the beard), and the body: the torso
    // and what is cut on its profile over it (the robe's wrapped body, the buff coat)
    const heads = [];
    rig.bones.head.traverse((o) => o.isMesh && heads.push(o));
    const body = [];
    rig.root.traverse((o) => o.isSkinnedMesh && ["hips", "spine", "chest", "neck"].every((b) => bonesOf(o).has(b)) && body.push(o));
    for (const m of [...heads, ...body]) m.material = both;
    const pt = ([y, z]) => new THREE.Vector3(0, y * H, z * H);
    const axis = blade.userData.axis.map(pt);
    const outline = blade.userData.outline.map(pt);

    it("is tagged and has a head and a body to keep out of", () => {
      expect(heads.length).toBeGreaterThanOrEqual(3);
      expect(body.length).toBeGreaterThanOrEqual(2);
    });

    it.each(poses.map((p) => [`${p.anim} @${p.i}`, p]))("%s", (_, p) => {
      p.apply();
      rig.root.updateMatrixWorld(true);
      for (const m of body) {
        m.skeleton.update();
        m.boundingSphere = null;
        m.boundingBox = null;
      }
      const w = (v) => v.clone().applyMatrix4(blade.matrixWorld);
      const ax = axis.map(w);
      const ol = outline.map(w);
      // down its length, and along each of its two edges and across it, root to point
      const segs = [...ax.slice(1).map((b, i) => [ax[i], b]), ...ol.slice(2).map((b, i) => [ol[i], b]), ...ol.filter((_, i) => i % 2 === 0).map((a, i) => [a, ol[i * 2 + 1]])];
      for (const [a, b] of segs) {
        expect(crosses(a, b, heads), "the blade through the head").toBe(false);
        if (p.anim !== "death") expect(crosses(a, b, body), "the blade through the body").toBe(false);
      }
      if (sheet === DUELIST) {
        // the butt and the grip's end behind the fist, clear of the forearm (the vambrace's 0.04 H and the butt cap's 0.012 H)
        const elbow = new THREE.Vector3().setFromMatrixPosition(rig.bones.foreArmR.matrixWorld);
        const wrist = new THREE.Vector3().setFromMatrixPosition(rig.bones.handR.matrixWorld);
        for (const q of ax.slice(0, 2)) expect(toSegment(q, elbow, wrist) / H, "the butt into the forearm").toBeGreaterThan(0.052);
      }
    });
  });
});

describe("the mercenary kit (FS-1J1CB §Change: Looks v2 R68, R69)", () => {
  it("builds the spec-only gear in the kit (mercKit.js, split from mercLooks.js past 400 lines): the long-hilted blade and the falchion, each with its scabbard; the base's blade and scabbard stay in gear.js", () => {
    for (const k of ["longBlade", "longScabbard", "falchion", "falchionScabbard", "binding", "cuffBand", "studdedBelt", "WEAR", "LONG_BLADE", "FALCHION"]) expect(kit[k], k).toBeDefined();
    expect(gear.curvedSword).toBeDefined();
    expect(gear.scabbard).toBeDefined();
  });

  it("composes the two looks as look objects (look.js); the Sellsword in the mercenary's own style, the Duelist's run re-keyed in a style of his own, never MERCENARY_STYLE (R62)", () => {
    for (const look of [looks.duelist, looks.sellsword]) for (const key of Object.keys(look)) expect(["tones", "mats", "opts", "omit", "swap", "bones", "add", "style"]).toContain(key);
    expect(looks.sellsword.style).toBeUndefined();
    expect(row(SELLSWORD).build().style).toBe(MERCENARY_STYLE);
    expect(looks.duelist.style).toBe(DUELIST_STYLE);
    expect(row(DUELIST).build().style).toBe(DUELIST_STYLE);
    // the cut, the carry, the walk and the parry are the mercenary's own; only the run's wrist differs
    for (const k of ["attack", "speed", "hold", "walk", "guard"]) expect(DUELIST_STYLE[k], k).toBe(MERCENARY_STYLE[k]);
    expect({ ...DUELIST_STYLE.run, wrist: MERCENARY_STYLE.run.wrist }).toEqual(MERCENARY_STYLE.run);
    expect(DUELIST_STYLE.run.wrist[1]).toBeLessThan(MERCENARY_STYLE.run.wrist[1]);
  });

  it("uses no raw colour: every tone is a fabric or a material (R64)", () => {
    for (const f of ["./mercKit.js", "./mercLooks.js"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|0x[0-9a-fA-F]{6}|setRGB|setHex|new THREE\.Color\(|MeshStandardMaterial|MeshBasicMaterial/);
    }
  });
});

describe("the Duelist (FS-1J1CB R7, §Change: Looks v2 R60, R63)", () => {
  const { rig } = row(DUELIST).build();
  const mats = matsOf(rig);
  let cloakMesh;
  rig.root.traverse((o) => o.userData.cloak && (cloakMesh = o));

  it("cuts every piece from a named cloth (the mock hands each out, so none is lost to the spread)", () => {
    expect(unnamed(rig)).toEqual([]);
  });

  it("holds the long-hilted curved blade in his right hand, no knuckle-bowed blade: a grip about two fists long, a round guard, a blade longer than the dueling sword's", () => {
    const blades = tagged(rig, "longBlade");
    expect(blades).toHaveLength(1);
    expect(boneOf(blades[0]).name).toBe("handR");
    const held = rig.bones.handR.children.filter((o) => o.isGroup).flatMap((g) => g.children);
    expect(held).toEqual([blades[0]]);
    const { grip, guard, blade, curve } = blades[0].userData.longBlade;
    expect(grip[1] - grip[0]).toBeGreaterThanOrEqual(0.11);
    expect(guard.r).toBeGreaterThan(0.02);
    // the dueling sword's blade is 0.46 H
    expect(blade[1] - blade[0]).toBeGreaterThan(0.48);
    // an even, shallow curve: its point under a tenth of its length off straight
    expect(curve / (blade[1] - blade[0])).toBeLessThan(0.1);
    expect(mats).not.toContain("F.steel");
  });

  it("carries the scabbard re-cut to the blade at the left hip, longer than the base's", () => {
    const [s] = tagged(rig, "longScabbard");
    expect(boneOf(s).name).toBe("hips");
    expect(s.userData.longScabbard.length).toBeGreaterThan(0.3);
    expect(s.children.some((o) => o.material?.name === "F.duelistSaya")).toBe(true);
  });

  it("swings the scabbard down through the sash as he falls, so it never stands up out of him, on any pose", () => {
    const r = { ...row(DUELIST), name: DUELIST };
    const { rig: posed, poses } = characterPoses(r);
    const [s] = tagged(posed, "longScabbard");
    const seat = s.rotation.x;
    const dir = new THREE.Vector3();
    let moved = 0;
    for (const p of poses) {
      p.apply();
      posed.root.updateMatrixWorld(true);
      dir.set(0, 0, 1).transformDirection(s.matrixWorld);
      expect(dir.y, `${p.anim} @${p.i}`).toBeLessThanOrEqual(kit.SCABBARD_RISE + 1e-9);
      if (Math.abs(s.rotation.x - seat) > 1e-6) moved++;
    }
    // standing, it keeps its seat; only the death's fall swings it
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(7);
  });

  it("hangs the half-cloak on cloak bones, skinned like the knight's cloak, never rigid on the chest", () => {
    expect(cloakMesh?.isSkinnedMesh).toBe(true);
    expect(cloakMesh.material.name).toBe("F.duelistSlate");
    expect(rig.bones.chest.children).not.toContain(cloakMesh);
    const bones = bonesOf(cloakMesh);
    for (const b of ["cloak0", "cloak1", "cloak2", "cloak3"]) expect(bones.has(b), b).toBe(true);
    expect(rig.springs.map((s) => s.bone)).toEqual(expect.arrayContaining(["cloak0", "cloak1", "cloak2", "cloak3"]));
  });

  it("slings the half-cloak from the off (left) shoulder, in place of the left spaulder, let down past the hip", () => {
    cloakMesh.geometry.computeBoundingBox();
    const { min, max } = cloakMesh.geometry.boundingBox;
    // over the left shoulder and wide of the left arm, short of the right one
    expect(max.x).toBeGreaterThan(-min.x * 2);
    const x = rig.bind.upperArmL.x;
    expect(max.x).toBeGreaterThan(x + 0.06 * rig.H);
    expect(min.y).toBeLessThan(rig.bind.hips.y);
    // hung from the shoulders, never carried by an arm
    expect(bonesOf(cloakMesh).has("upperArmL")).toBe(false);
    expect(bonesOf(cloakMesh).has("upperArmR")).toBe(false);
    expect(lamesOn(rig, "L", "F.darkSteelDouble")).toHaveLength(0);
    expect(lamesOn(rig, "R", "F.darkSteelDouble")).toHaveLength(0);
  });

  it("wears a robe in faded madder in place of the quilted coat: open at the front, let down near to the ankle and flared", () => {
    expect(mats).not.toContain("F.coat");
    const skirts = [];
    rig.root.traverse((o) => o.userData.garment && skirts.push(o));
    expect(skirts).toHaveLength(1);
    for (const s of skirts) expect(s.material.name).toBe("F.duelistRobe");
    // under the calf, over the foot
    for (const s of skirts) {
      s.geometry.computeBoundingBox();
      expect(s.geometry.boundingBox.min.y).toBeLessThan(0.12 * rig.H);
      expect(s.geometry.boundingBox.min.y).toBeGreaterThan(rig.bind.footL.y + 0.02 * rig.H);
      expect(s.geometry.boundingBox.max.x).toBeGreaterThan(0.18 * rig.H);
    }
    // the wrapped body and the bell sleeves over the arms are robe too
    expect(mats.filter((m) => m === "F.duelistRobe").length).toBeGreaterThanOrEqual(6);
  });

  it("binds the robe's collar and the sleeves' mouths in slate, and ties the half-cloak with a cord", () => {
    expect(matsOf(rig, "chest").filter((m) => m === "F.duelistSlate").length).toBeGreaterThanOrEqual(1);
    for (const s of ["L", "R"]) expect(matsOf(rig, `foreArm${s}`)).toContain("F.duelistSlate");
    expect(matsOf(rig, "chest")).toContain("F.duelistCord");
  });

  it("girds the robe with a wide slate-black sash wound twice, and keeps the vambrace, hair and beard", () => {
    expect(mats).not.toContain("F.sash");
    expect(matsOf(rig, "hips").filter((m) => m === "F.duelistSlate").length).toBeGreaterThanOrEqual(3);
    expect(matsOf(rig, "foreArmR")).toContain("F.darkSteel");
    expect(matsOf(rig, "head").filter((m) => m === "F.hairDark").length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the shared face under the mercenary's own hair (R14)", () => {
    expect(new Set(matsOf(rig, "head"))).toEqual(new Set(["F.skin", "F.face", "F.browDark", "F.hairDark"]));
  });
});

describe("the Sellsword (FS-1J1CB R8, §Change: Looks v2 R61, R63)", () => {
  const { rig } = row(SELLSWORD).build();
  const mats = matsOf(rig);

  it("cuts every piece from a named cloth", () => {
    expect(unnamed(rig)).toEqual([]);
  });

  it("dyes the madder base black: the arming coat carries no madder tone, and its skirts flare wider than the base's", () => {
    expect(mats).not.toContain("F.coat");
    expect(mats).not.toContain("F.sash");
    expect(mats).toContain("F.sellBlack");
    const coats = [];
    rig.root.traverse((o) => o.userData.garment && coats.push(o));
    const black = coats.filter((o) => o.material.name === "F.sellBlack");
    expect(black).toHaveLength(1);
    let baseCoat;
    mercenary().rig.root.traverse((o) => o.userData.garment && (baseCoat = o));
    const wide = (m) => (m.geometry.computeBoundingBox(), m.geometry.boundingBox.max.x - m.geometry.boundingBox.min.x);
    expect(wide(black[0]) / wide(baseCoat)).toBeGreaterThan(1.25);
  });

  it("holds a broad falchion in his right hand: its blade over three times the dueling sword's width, its grip longer, a plain cross", () => {
    const blades = tagged(rig, "falchion");
    expect(blades).toHaveLength(1);
    expect(boneOf(blades[0]).name).toBe("handR");
    const held = rig.bones.handR.children.filter((o) => o.isGroup).flatMap((g) => g.children);
    expect(held).toEqual([blades[0]]);
    const f = blades[0].userData.falchion;
    // the dueling sword's blade is 0.019 H wide, its grip 0.08 H
    expect(f.width).toBeGreaterThan(0.019 * 3);
    expect(f.grip[1] - f.grip[0]).toBeGreaterThan(0.11);
    expect(f.width).toBeGreaterThan(f.root * 1.8);
  });

  it("carries the falchion's scabbard re-cut to it at the left hip", () => {
    const [s] = tagged(rig, "falchionScabbard");
    expect(boneOf(s).name).toBe("hips");
    expect(s.children.some((o) => o.material?.name === "F.sellLeather")).toBe(true);
  });

  it("wears the buff-leather coat buckled and studded in brass, its own skirts over the black, a high buff collar and flared buff cuffs", () => {
    expect(mats).toContain("F.buffCoat");
    expect(matsOf(rig, "chest").filter((m) => m === "F.sellBrass").length).toBeGreaterThanOrEqual(5);
    const coats = [];
    rig.root.traverse((o) => o.userData.garment && coats.push(o));
    expect(coats.filter((o) => o.material.name === "F.buffCoat")).toHaveLength(4);
    for (const s of ["L", "R"]) expect(matsOf(rig, `foreArm${s}`)).toContain("F.buffCoat");
  });

  it("wears a big spaulder on each shoulder, four lames each, a studded sword belt with the purse on it, bucket-topped boots and a bedroll across his back", () => {
    expect(lamesOn(rig, "L", "F.sellPlateDouble")).toHaveLength(4);
    expect(lamesOn(rig, "R", "F.sellPlateDouble")).toHaveLength(4);
    expect(matsOf(rig, "hips").filter((m) => m === "F.sellBrass").length).toBeGreaterThanOrEqual(5);
    const purse = rig.bones.hips.children.find((g) => g.isGroup && g.children.some((o) => o.material?.name === "F.sellBrass"));
    expect(purse).toBeDefined();
    for (const s of ["L", "R"]) expect(matsOf(rig, `shin${s}`)).toContain("F.sellLeather");
    expect(matsOf(rig, "chest")).toContain("F.sellRoll");
    expect(rig.bones.cloak0).toBeUndefined();
  });

  it("crops his hair, no tail, and keeps the shared face under it, the beard grown full (R14)", () => {
    expect(new Set(matsOf(rig, "head"))).toEqual(new Set(["F.skin", "F.face", "F.browDark", "F.hairDark"]));
    const hair = rig.bones.head.children.filter((o) => o.isMesh && o.material.name === "F.hairDark");
    const baseHair = mercenary().rig.bones.head.children.filter((o) => o.isMesh && o.material.name === "F.hairDark");
    expect(hair.length).toBe(baseHair.length - 1);
  });
});
