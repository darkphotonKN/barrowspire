// The archer's specialization looks (FS-1J1CB §A R5–R6, §B R9, R11, R14, R15, §Change: Looks v2
// R58, R59, R62, R65, R68, R69): the Hunter's and the Shadow Ranger's cast rows, built and posed
// exactly as the bake poses them (poses.js). Each keeps its legs inside the tunic and the cloak on
// every guarded pose of every clip, with no exemption, and its quiver over the cloak; each bow is
// strung live, its string following the drawing hand and an arrow on it when nocked; the Hunter's
// recurve is shorter than the longbow and her knife keeps clear of the bow hand; the Shadow
// Ranger's longbow is the longbow's length and slimmer, her quiver hooded. Plain materials, named
// by the key they were cut from, stand in for the bake page's painted ones: the checks read
// geometry and which cloth each piece is cut from.

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
const { CAST, archer } = await import("./cast.js");
const { characterPoses } = await import("./poses.js");
const { KNOWN_CLIPPING, MIRRORED_LEGACY, clearanceError, cloakClearance, cloakClearanceError, legClearance, mirroredGarment, throughCloth } = await import("./clearance.js");
const { OFFHAND_OF } = await import("./clips.js");
const { BOW_BRACE, drawGrip } = await import("./draw.js");
const { K1 } = await import("../projection.js");
const gear = await import("./gear.js");
const kit = await import("./archerKit.js");
const looks = await import("./archerLooks.js");
const { ARCHER_STYLE } = await import("./classStyles.js");

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
 * default material. The base longbow's string is its own plain material (gear.js `longbow`), not a
 * cloth; neither look strings that one.
 */
const unnamed = (rig) => {
  const out = [];
  rig.root.traverse((o) => o.isMesh && !o.material.name && o.material.type === "MeshBasicMaterial" && out.push(`${o.parent?.name} ${o.geometry.type}`));
  return out;
};

/** The quiver's case (`userData.case`: gear.js `quiver`, archerKit.js `hoodedQuiver`). */
function quiverCase(rig) {
  const out = [];
  rig.root.traverse((o) => o.isMesh && o.userData.case && out.push(o));
  expect(out).toHaveLength(1);
  return out[0];
}

/** The meshes riding the quiver's mount on the chest: the case, its rim or hood, the shafts and the fletching. */
const quiverMeshes = (rig) => quiverCase(rig).parent.children.filter((o) => o.isMesh);

/** The bow's group in the left hand (`userData.bow`: gear.js `liveString`). */
function bowOf(rig) {
  const out = [];
  rig.root.traverse((o) => o.userData.bow && out.push(o));
  expect(out).toHaveLength(1);
  return out[0];
}

/** The cloak's mesh (anatomy.js `cloak`). */
function cloakOf(rig) {
  let found;
  rig.root.traverse((o) => o.userData.cloak && (found = o));
  return found;
}

/** A box round `g`'s meshes in its own frame (H), the meshes `keep` picks. */
function ownBox(g, H, keep = () => true) {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  g.traverse((o) => {
    if (!o.isMesh || !keep(o)) return;
    box.union(new THREE.Box3().setFromObject(o).applyMatrix4(inv));
  });
  return { min: box.min.clone().divideScalar(H), max: box.max.clone().divideScalar(H) };
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

  it("leaves the archer's own figure as it was: the Nightwood cowl, the linen fletching, the longbow, no nock caps", () => {
    const { rig, style } = archer();
    const mats = matsOf(rig);
    expect(matsOf(rig, "head")).toContain("F.rangerNight");
    expect(mats).toContain("F.linen");
    expect(mats).not.toContain("F.horn");
    expect(mats).not.toContain("F.wolf");
    const bow = bowOf(rig);
    expect(bow.userData.recurve).toBeUndefined();
    expect(bow.userData.slim).toBeUndefined();
    expect(style).toBe(ARCHER_STYLE);
  });
});

describe("the archer's spec looks pass the guards on every clip (FS-1J1CB R11, §Change: Looks v2 R65)", () => {
  it.each(LOOKS)("%s keeps its legs inside the tunic, no exemption", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    expect(mirroredGarment(rig)).toBe(false);
    expect(KNOWN_CLIPPING.has(sheet)).toBe(false);
    expect(MIRRORED_LEGACY.has(sheet)).toBe(false);
    const clips = legClearance(rig, poses);
    expect(Object.keys(clips ?? {}).sort()).toEqual(expect.arrayContaining(["idle", "walk", "run", "attack", "walk_attack", "backpedal_attack"]));
    expect(clearanceError(sheet, clips, { scale: r.scale, mirrored: false, known: new Map(), legacy: new Set() }), JSON.stringify(clips)).toBeNull();
  });

  it.each(LOOKS)("%s keeps every leg and boot inside its cloak", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    const clips = cloakClearance(rig, poses);
    expect(clips).not.toBeNull();
    expect(cloakClearanceError(sheet, clips, { scale: r.scale }), JSON.stringify(clips)).toBeNull();
  });
});

describe("the archer's spec looks keep the quiver over the cloak (FS-HF0WW; FS-1J1CB R5, §Change: Looks v2 R59)", () => {
  it.each(LOOKS)("%s never sinks the quiver's case into the cloak, on any frame of any clip", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    const cloakMesh = cloakOf(rig);
    const body = quiverCase(rig);
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

describe("each look's bow keeps the live string and the draw (FS-1J1CB §Change: Looks v2 R58, R59)", () => {
  /** Where a strand's free end (the nock) sits, in the bow's frame: its middle doubled back from its tip. */
  const nockOf = (strand, tip) => strand.position.clone().multiplyScalar(2).sub(tip);

  it.each(LOOKS)("%s: while a clip draws, the string runs to the right hand, an arrow on it when nocked; at rest it is straight at the brace", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    const bow = bowOf(rig);
    const { tips, strands, arrow } = bow.userData.bow;
    const grip = drawGrip(rig);
    const rest = new THREE.Vector3(0, BOW_BRACE * rig.H, 0);
    let drawn = 0;
    for (const p of poses.filter((q) => ["attack", "walk_attack", "backpedal_attack"].includes(q.anim))) {
      p.apply();
      rig.root.updateMatrixWorld(true);
      const nocks = strands.map((s, i) => nockOf(s, tips[i]));
      // both strands meet at one nock point
      expect(nocks[0].distanceTo(nocks[1]) / rig.H, `${sheet} ${p.anim} ${p.i}`).toBeLessThan(1e-6);
      const hand = grip.clone().applyMatrix4(rig.bones.handR.matrixWorld).applyMatrix4(bow.matrixWorld.clone().invert());
      if (nocks[0].distanceTo(rest) / rig.H > 1e-6) {
        drawn++;
        expect(nocks[0].distanceTo(hand) / rig.H, `${sheet} ${p.anim} ${p.i}: the string on the hand`).toBeLessThan(1e-4);
      }
      if (arrow.visible) expect(arrow.position.distanceTo(nocks[0]) / rig.H, `${sheet} ${p.anim} ${p.i}: the arrow on the string`).toBeLessThan(1e-6);
    }
    // the shot draws on several keys of each of its three clips, and nocks an arrow
    expect(drawn).toBeGreaterThanOrEqual(6);
    expect(poses.some((p) => (p.apply(), arrow.visible))).toBe(true);
  });

  it("strings each look's own bow, not the longbow: the Hunter's recurve, the Shadow Ranger's slim longbow", () => {
    expect(bowOf(row(HUNTER).build().rig).userData.recurve).toBeDefined();
    expect(bowOf(row(SHADOW).build().rig).userData.slim).toBeDefined();
  });
});

describe("the archer kit (FS-1J1CB §Change: Looks v2 R68, R69)", () => {
  it("builds the spec-only gear in the kit: the recurve, the slim longbow, the knife and the hooded quiver; the base's longbow and quiver stay in gear.js", () => {
    for (const k of ["recurve", "slimLongbow", "skinningKnife", "hoodedQuiver", "baldric", "lacedBracer", "legWraps", "WEAR", "RECURVE", "SLIM"]) expect(kit[k], k).toBeDefined();
    expect(gear.longbow).toBeDefined();
    expect(gear.quiver).toBeDefined();
    expect(gear.liveString).toBeDefined();
  });

  it("composes the two looks as look objects (look.js), in the archer's own style: no re-key was needed", () => {
    for (const look of [looks.hunter, looks.shadowRanger]) {
      for (const key of Object.keys(look)) expect(["tones", "mats", "opts", "omit", "swap", "bones", "add", "style"]).toContain(key);
      expect(look.style).toBeUndefined();
    }
  });

  it("uses no raw colour: every tone is a fabric or a material (R64)", () => {
    for (const f of ["./archerKit.js", "./archerLooks.js"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|0x[0-9a-fA-F]{6}|setRGB|setHex|new THREE\.Color\(|MeshStandardMaterial|MeshBasicMaterial/);
    }
  });
});

describe("the Hunter (FS-1J1CB R5, §Change: Looks v2 R58, R63)", () => {
  const { rig } = row(HUNTER).build();
  const mats = matsOf(rig);

  it("cuts every piece from a named cloth (the mock hands each out, so none is lost to the spread)", () => {
    expect(unnamed(rig)).toEqual([]);
  });

  it("wears no cowl: her head is the shared face under brown hair, unbearded, goose feathers tied in (R14)", () => {
    const head = matsOf(rig, "head");
    expect(head).toContain("F.face");
    expect(head).toContain("F.hairBrown");
    expect(new Set(head)).toEqual(new Set(["F.skin", "F.face", "F.browDark", "F.hairBrown", "F.goose"]));
  });

  it("keeps nothing of the Nightwood green: the cape, capelet and sleeves in undyed grey-brown wool", () => {
    expect(mats).not.toContain("F.rangerNight");
    expect(mats).not.toContain("F.rangerNightDark");
    expect(cloakOf(rig).material.name).toBe("F.hunterWool");
    expect(matsOf(rig, "chest")).toContain("F.hunterWool");
  });

  it("cuts the cloak short to a hunting cape over the hips, the ranger's to the calf", () => {
    const low = (m) => {
      m.geometry.computeBoundingBox();
      return m.geometry.boundingBox.min.y / rig.H;
    };
    const baseCloak = cloakOf(archer().rig);
    expect(low(cloakOf(rig))).toBeGreaterThan(0.4);
    expect(low(baseCloak)).toBeLessThan(0.3);
  });

  it("wears the wolf pelt out past her shoulder points, the laced jerkin bound at the hem, the baldric, and fur wrapped round both shins", () => {
    const pelt = rig.bones.chest.children.filter((o) => o.isMesh && o.material.name === "F.wolf");
    expect(pelt.length).toBeGreaterThanOrEqual(3);
    const wide = Math.max(...pelt.map((o) => (o.geometry.computeBoundingBox(), o.geometry.boundingBox.max.x / rig.H)));
    expect(wide).toBeGreaterThan(0.17);
    expect(mats).toContain("F.jerkinHide");
    expect(matsOf(rig, "hips")).toContain("F.hunterLeather");
    for (const s of ["L", "R"]) expect(matsOf(rig, `shin${s}`)).toContain("F.wolf");
    // the buff tunic still carries the figure under them
    expect(mats).toContain("F.buff");
  });

  it("carries long goose fletching standing high out of the quiver", () => {
    const fletch = quiverMeshes(rig).filter((o) => o.material.name === "F.goose");
    expect(fletch).toHaveLength(6);
    const plain = quiverMeshes(archer().rig).filter((o) => o.material.name === "F.linen");
    const tall = (o) => (o.geometry.computeBoundingBox(), o.geometry.boundingBox.max.y - o.geometry.boundingBox.min.y);
    expect(tall(fletch[0]) / tall(plain[0])).toBeGreaterThanOrEqual(2);
    expect(Math.min(...fletch.map((o) => o.position.y))).toBeGreaterThan(Math.min(...plain.map((o) => o.position.y)));
    expect(mats).not.toContain("F.linen");
  });

  it("carries a heavy recurve shorter than the longbow, its limbs thicker, its tips horn-capped and curled away from her (R58)", () => {
    const H = rig.H;
    const bow = bowOf(rig);
    const longbow = bowOf(archer().rig);
    const span = (g) => {
      const b = ownBox(g, H, (o) => !o.userData.arrow && o.parent === g && o.geometry.type === "TubeGeometry");
      return b.max.z - b.min.z;
    };
    expect(span(bow) / span(longbow)).toBeLessThan(0.75);
    expect(kit.RECURVE.r).toBeGreaterThan(0.0085);
    // the tips lie on the far side of the string's line from her: curled away, past the bridges
    expect(kit.RECURVE.tip[0]).toBeLessThan(kit.RECURVE.bridge[0]);
    expect(kit.RECURVE.tip[1]).toBeGreaterThan(kit.RECURVE.bridge[1]);
    expect(bow.children.filter((o) => o.isMesh && o.material.name === "F.horn").length).toBeGreaterThanOrEqual(4);
    expect(bow.children.some((o) => o.isMesh && o.material.name === "F.rawhide")).toBe(true);
  });

  it("rides a skinning knife in its sheath on the belt, clear of the bow hand and the drawing hand on every pose (R58)", () => {
    const r = { ...row(HUNTER), name: HUNTER };
    const { rig: posed, poses } = characterPoses(r);
    let knife;
    posed.root.traverse((o) => o.userData.knife && (knife = o));
    expect(knife.parent.name).toBe("hips");
    const H = posed.H;
    const v = new THREE.Vector3();
    const near = { L: Infinity, R: Infinity };
    for (const p of poses) {
      if (p.anim.startsWith("death")) continue;
      p.apply();
      posed.root.updateMatrixWorld(true);
      for (const s of ["L", "R"]) {
        const hand = new THREE.Vector3().setFromMatrixPosition(posed.bones[`hand${s}`].matrixWorld);
        knife.traverse((o) => {
          if (!o.isMesh) return;
          const pos = o.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) near[s] = Math.min(near[s], v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).distanceTo(hand) / H);
        });
      }
    }
    // a fist is about 0.035 H across its knuckles from the wrist joint
    expect(near.L, "the bow hand").toBeGreaterThan(0.06);
    expect(near.R, "the drawing hand").toBeGreaterThan(0.05);
  });
});

describe("the Shadow Ranger (FS-1J1CB R6, §Change: Looks v2 R59, R63)", () => {
  const { rig } = row(SHADOW).build();
  const mats = matsOf(rig);

  it("cuts every piece from a named cloth", () => {
    expect(unnamed(rig)).toEqual([]);
  });

  it("dyes the Nightwood through to soot on the cowl, mantle and cloak, the sleeves darker", () => {
    expect(mats).not.toContain("F.rangerNight");
    expect(mats).not.toContain("F.rangerNightDark");
    expect(matsOf(rig, "head")).toContain("F.shadow");
    expect(cloakOf(rig).material.name).toBe("F.shadow");
    expect(mats).toContain("F.shadowDark");
  });

  it("lets the cloak down past the ranger's, and draws the cowl's point out into a liripipe down her back", () => {
    const low = (m) => (m.geometry.computeBoundingBox(), m.geometry.boundingBox.min.y / rig.H);
    expect(low(cloakOf(rig))).toBeLessThan(low(cloakOf(archer().rig)) - 0.03);
    const lowestOnHead = (r) => Math.min(...r.bones.head.children.filter((o) => o.isMesh && ["F.shadow", "F.rangerNight"].includes(o.material.name)).map((o) => (new THREE.Box3().setFromObject(o).min.y) / r.H));
    const baseRig = archer().rig;
    baseRig.root.updateMatrixWorld(true);
    rig.root.updateMatrixWorld(true);
    expect(lowestOnHead(rig)).toBeLessThan(lowestOnHead(baseRig) - 0.05);
  });

  it("blackens the buff leather to a cold grey, and the bracers, boots and baldric to black, riveted in iron", () => {
    expect(mats).not.toContain("F.buff");
    expect(mats).toContain("F.shadowLeather");
    for (const s of ["L", "R"]) {
      expect(matsOf(rig, `foreArm${s}`)).toContain("F.shadowBlack");
      expect(matsOf(rig, `foreArm${s}`)).toContain("F.shadowIron");
    }
    expect(mats).not.toContain("F.leather");
    expect(mats).not.toContain("F.linen");
    expect(matsOf(rig, "chest")).toContain("F.shadowBlack");
  });

  it("carries a slim blackened longbow at the longbow's length, its string darker than the base's (R59)", () => {
    const H = rig.H;
    const bow = bowOf(rig);
    const longbow = bowOf(archer().rig);
    const staveOf = (g) => g.children.find((o) => o.isMesh && o.geometry.type === "TubeGeometry");
    const span = (g) => ownBox(g, H, (o) => o === staveOf(g));
    expect(span(bow).max.z - span(bow).min.z).toBeCloseTo(span(longbow).max.z - span(longbow).min.z, 2);
    expect(kit.SLIM.r).toBeLessThan(0.0085 * 0.8);
    expect(staveOf(bow).material.name).toBe("F.shadowBow");
    expect(bow.userData.bow.strands.map((s) => s.material.name)).toEqual(["F.shadowString", "F.shadowString"]);
  });

  it("hoods her quiver: the fletching sits under the hood's crown, lower than the ranger's, a dark edge only (R59)", () => {
    const meshes = quiverMeshes(rig);
    const fletch = meshes.filter((o) => o.material.name === "F.shadowFletch");
    expect(fletch).toHaveLength(6);
    const hood = meshes.filter((o) => o.material.name === "F.shadowQuiver" && !o.userData.case);
    expect(hood).toHaveLength(1);
    const top = (o) => (o.geometry.computeBoundingBox(), o.position.y + o.geometry.boundingBox.max.y);
    expect(Math.max(...fletch.map(top))).toBeLessThan(top(hood[0]));
    const plain = quiverMeshes(archer().rig).filter((o) => o.material.name === "F.linen");
    expect(Math.max(...fletch.map(top))).toBeLessThan(Math.max(...plain.map(top)));
  });

  it("bakes no gloom: nothing lit on the figure (the gloom is a runtime aura, §E)", () => {
    expect(mats.filter((m) => /^M\.(glow|arcane)/.test(m))).toEqual([]);
  });
});
