// The archer's specialization looks (FS-1J1CB §A R5–R6, §B R9, R11, R14, R15, §Change: Looks v2
// R58, R59, R62, R65, R68, R69): the Hunter's and the Shadow Ranger's cast rows, built and posed
// exactly as the bake poses them (poses.js). Each keeps its legs inside the tunic and the cloak on
// every guarded pose of every clip, with no exemption, and its quiver over the cloak; each bow is
// strung live, its string following the drawing hand and an arrow on it when nocked; the Hunter's
// recurve is shorter than the longbow and her knife keeps clear of the bow hand; the Shadow
// Ranger's longbow is the longbow's length and slimmer, her quiver hooded. Plain materials, named
// by the key they were cut from, stand in for the bake page's painted ones: the checks read
// geometry and which cloth each piece is cut from. The run's two-handed low-ready bow (FS-JS7C8
// § Change: The archer's sprint and low-ready bow R72–R77, and the owner change of 2026-11-23,
// R87–R90: canted left-high across the front, an arrow nocked) is checked here too, on all three
// figures with each one's own bow on her hand as cast.js hangs it (the base's longbow, the Hunter's
// recurve, the Shadow Ranger's slim longbow; integrated with Looks v2 2026-11-23).

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
const { KNOWN_CLIPPING, MIRRORED_LEGACY, clearanceError, cloakClearance, cloakClearanceError, legClearance, mirroredGarment, throughCloth, tubeNow } = await import("./clearance.js");
const { along, boneOf, cloakOf, crossings, leastOutside, legSolids, segmentsOf, shown, trianglesOf } = await import("./edgeGuards.mjs");
const { OFFHAND_OF, applyPose, clipsFor, groundPose, sample } = await import("./clips.js");
const { BOW_BRACE, BOW_GRIP, drawGrip } = await import("./draw.js");
const { AZIMUTH, ELEVATION, K1 } = await import("../projection.js");
const { FACINGS, yawFor } = await import("../facing.js");
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
    // her clips, no attack on the move (FS-JS7C8 § Change: The archer's sprint and low-ready bow R79)
    expect(Object.keys(clips ?? {}).sort()).toEqual(["attack", "idle", "run", "walk"]);
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
    for (const p of poses.filter((q) => q.anim === "attack")) {
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
    // the shot draws on several keys of its one clip (no attack on the move since FS-JS7C8 R79;
    // three keys, measured, where the three clips drew six or more), and nocks an arrow
    expect(drawn).toBeGreaterThanOrEqual(3);
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

describe("the archer's two-handed low-ready bow in the run (FS-JS7C8 § Change: The archer's sprint and low-ready bow R72–R77, R87–R90)", () => {
  const FIGURES = [["char_archer_base", base], ...LOOKS];
  /** 32 samples over the 8-key cycle, as the FS measures her run. */
  const SAMPLES = Array.from({ length: 32 }, (_, k) => k / 4);
  const at = (rig, b) => new THREE.Vector3().setFromMatrixPosition(rig.bones[b].matrixWorld);
  /**
   * The group each figure's own bow hangs in on the left hand's grip (cast.js `bowInHand`): the
   * one gear.js `liveString` strings (`userData.bow`), the longbow, the Hunter's recurve or the
   * Shadow Ranger's slim longbow (Looks v2 R58, R59; integrated 2026-11-23).
   */
  const bowFrame = (rig) => {
    let g;
    rig.bones.handL.traverse((o) => o.userData.bow && (g = o));
    return g;
  };
  /** Every drawn point of the bow (the stave, its grip, the Hunter's nock caps, the string), model space. */
  const bowPoints = (bow) => {
    const out = [];
    bow.traverse((o) => {
      if (!o.isMesh || !shown(o)) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
    });
    return out;
  };
  /** The cloak (anatomy.js `cloak` tags it) and the quiver's meshes, which the bow must not cross. */
  const backMeshes = (rig) => ({ cloak: cloakOf(rig), quiver: quiverMeshes(rig) });
  /** The bow's arrow (gear.js `liveString`). */
  const arrowOf = (bow) => bow.userData.bow.arrow ?? null;
  /** The top of the meshes the head bone carries (the cowl, or the Hunter's hair). */
  const crown = (rig) => {
    let top = -Infinity;
    rig.bones.head.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) top = Math.max(top, new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).y);
    });
    return top;
  };

  /**
   * The figure's run, sample by sample, posed and grounded as the bake poses it and its hooks run
   * (the bow's string redrawn): per sample, in rig heights, each hand (the hand bone, as the run's
   * other hand checks read it) in the model and in the chest bone's frame, the chest, hips and
   * shoulders, the bow's grip and its string's middle (draw.js `BOW_GRIP`, `BOW_BRACE`), its two
   * tips, its highest drawn point and the crown, and the right hand's grip point.
   */
  function runSamples(r) {
    const { rig, style } = r.build();
    const run = clipsFor(style, r.animations).run;
    const bow = bowFrame(rig);
    const H = rig.H;
    const local = drawGrip(rig);
    return {
      rig,
      run,
      samples: SAMPLES.map((f) => {
        const p = sample(run, f, true);
        applyPose(rig, p);
        groundPose(rig);
        for (const hook of rig.hooks ?? []) hook(rig, p);
        rig.root.updateMatrixWorld(true);
        const toChest = rig.bones.chest.matrixWorld.clone().invert();
        const onBow = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(bow.matrixWorld).divideScalar(H);
        // the string's two tips, where each bow's string runs from (the longbow's ends at ±0.4 H, the recurve's bridges)
        const tips = bow.userData.bow.tips.map((t) => t.clone().applyMatrix4(bow.matrixWorld).divideScalar(H)).sort((a, b) => b.y - a.y);
        const hand = (s) => at(rig, `hand${s}`).divideScalar(H);
        return {
          f,
          L: hand("L"),
          R: hand("R"),
          inChest: ["L", "R"].map((s) => at(rig, `hand${s}`).applyMatrix4(toChest).divideScalar(H)),
          chest: at(rig, "chest").divideScalar(H),
          hips: at(rig, "hips").divideScalar(H),
          shoulders: [at(rig, "upperArmR").x / H, at(rig, "upperArmL").x / H],
          grip: onBow(0, -BOW_GRIP * H, 0),
          nock: onBow(0, BOW_BRACE * H, 0),
          arrowShown: arrowOf(bow) !== null && shown(arrowOf(bow)),
          upper: tips[0],
          lower: tips[1],
          top: Math.max(...bowPoints(bow).map((v) => v.y)) / H,
          crown: crown(rig) / H,
          pull: local.clone().applyMatrix4(rig.bones.handR.matrixWorld).divideScalar(H),
        };
      }),
    };
  }
  const RUNS = Object.fromEntries(FIGURES.map(([sheet, r]) => [sheet, runSamples(r)]));

  it.each(FIGURES)("%s: every run key nocks an arrow on the undrawn string, and it shows on every sample (R87)", (sheet) => {
    for (const [i, p] of RUNS[sheet].run.entries()) {
      expect(p.fx.arrow ?? 0, `key ${i} arrow`).toBe(1);
      expect(p.fx.draw ?? 0, `key ${i} draw`).toBe(0);
      expect(p.fx.ik ?? 0, `key ${i} ik`).toBe(0);
    }
    for (const s of RUNS[sheet].samples) expect(s.arrowShown, `@${s.f}`).toBe(true);
  });

  it.each(FIGURES)("%s: both hands in front of the trunk, inside the shoulders, from the belly to the lower chest, under 0.70 H (R72, R73)", (sheet) => {
    const { rig, samples } = RUNS[sheet];
    // the torso's half depth (clips.test.mjs measures the back by it)
    const half = 0.094 * rig.p.torsoD;
    for (const s of samples)
      for (const [side, h] of [
        ["left", s.L],
        ["right", s.R],
      ]) {
        const who = `${side} hand @${s.f}`;
        expect(h.z - s.chest.z, `${who} ahead of the chest`).toBeGreaterThan(half);
        expect(h.x, `${who} inside the right shoulder`).toBeGreaterThan(s.shoulders[0]);
        expect(h.x, `${who} inside the left shoulder`).toBeLessThan(s.shoulders[1]);
        expect(h.y - s.hips.y, `${who} over the hips`).toBeGreaterThanOrEqual(0.05);
        expect(h.y, `${who} no higher than the chest bone`).toBeLessThanOrEqual(s.chest.y);
        expect(h.y, `${who} under the old pump's peak`).toBeLessThan(0.7);
      }
  });

  it.each(FIGURES)("%s: the right hand lightly at the arrow's nock, on the braced string's middle (R87)", (sheet) => {
    for (const s of RUNS[sheet].samples) expect(s.pull.distanceTo(s.nock), `@${s.f}`).toBeLessThanOrEqual(0.02);
  });

  it.each(FIGURES)("%s: the arms do not pump: each hand stays within 0.02 H in the chest's frame (R77)", (sheet) => {
    const { samples } = RUNS[sheet];
    for (const side of [0, 1]) {
      const pts = samples.map((s) => s.inChest[side]);
      const most = Math.max(...pts.flatMap((a) => pts.map((b) => a.distanceTo(b))));
      expect(most, side ? "right hand" : "left hand").toBeLessThanOrEqual(0.02);
    }
  });

  it.each(FIGURES)("%s: the bow canted left-high across the front, about 68° off vertical, the arrow forward and 20–40° down (R88)", (sheet) => {
    const offs = [];
    for (const s of RUNS[sheet].samples) {
      // her own left is the model's +x in every facing (the bake turns the whole model)
      expect(s.upper.x, `@${s.f} upper tip on her left of the grip`).toBeGreaterThan(s.grip.x);
      expect(s.upper.y, `@${s.f} upper tip above the grip`).toBeGreaterThan(s.grip.y);
      expect(s.lower.x, `@${s.f} lower tip on her right of the grip`).toBeLessThan(s.grip.x);
      expect(s.lower.y, `@${s.f} lower tip below the grip`).toBeLessThan(s.grip.y);
      const d = s.upper.clone().sub(s.lower);
      const off = (Math.acos(d.y / d.length()) * 180) / Math.PI;
      offs.push(off);
      expect(off, `@${s.f} off vertical`).toBeGreaterThanOrEqual(58);
      expect(off, `@${s.f} off vertical`).toBeLessThanOrEqual(76);
      // the arrow runs from the nock through the grip (gear.js longbow)
      const a = s.grip.clone().sub(s.nock).normalize();
      const down = (-Math.asin(a.y) * 180) / Math.PI;
      expect(down, `@${s.f} arrow below level`).toBeGreaterThanOrEqual(20);
      expect(down, `@${s.f} arrow below level`).toBeLessThanOrEqual(40);
      // the facing she runs along is the model's +z (cast.js builds her facing it)
      const heading = (Math.atan2(a.x, a.z) * 180) / Math.PI;
      expect(Math.abs(heading), `@${s.f} arrow heading off the facing`).toBeLessThanOrEqual(15);
    }
    const mean = offs.reduce((t, v) => t + v, 0) / offs.length;
    expect(mean).toBeGreaterThanOrEqual(62);
    expect(mean).toBeLessThanOrEqual(72);
  });

  /**
   * How far under the head the bow and its arrow draw on screen, per facing, over the baked run
   * frames (rig heights; negative when a point of them draws above the head): every drawn point
   * against the highest of the meshes the head bone carries, along the camera's up (projection.js),
   * the model turned to each facing as the bake turns it.
   */
  function screenMargins(r) {
    const { rig, poses } = characterPoses(r);
    const bow = bowFrame(rig);
    const up = new THREE.Vector3(-Math.sin(ELEVATION) * Math.sin(AZIMUTH), Math.cos(ELEVATION), -Math.sin(ELEVATION) * Math.cos(AZIMUTH));
    const out = Object.fromEntries(FACINGS.map((f) => [f, Infinity]));
    for (const p of poses.filter((q) => q.anim === "run")) {
      p.apply();
      rig.root.updateMatrixWorld(true);
      const bowPts = bowPoints(bow);
      const headPts = [];
      rig.bones.head.traverse((o) => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) headPts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
      });
      for (const f of FACINGS) {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawFor(f));
        const top = (pts) => Math.max(...pts.map((v) => v.clone().applyQuaternion(q).dot(up)));
        out[f] = Math.min(out[f], (top(headPts) - top(bowPts)) / rig.H);
      }
    }
    return out;
  }

  // Integrated with Looks v2 (2026-11-23): the Hunter's shorter recurve (Looks v2 R58) clears her
  // hair in every facing (n 0.056 H, ne 0.082 H under it), so R90's escalation for her is moot. The
  // Shadow Ranger's deeper cowl (Looks v2 R49's liripipe) stands lower than the ranger's cowl, and
  // the slim longbow, the longbow's length, draws its tip over it in n (by 0.013 H) and ne (by
  // 0.030 H); the base's own margin there is 0.003 and 0.007 H. Clearing it would cant her bow past
  // R88's band or lower her hands under R73's, or raise Looks v2's cowl: the owner's call
  it.each(FIGURES.filter(([sheet]) => sheet !== SHADOW))("%s: the tip never draws above the head on screen, in any facing (R90)", (sheet, r) => {
    for (const [f, m] of Object.entries(screenMargins(r))) expect(m, `${f}: under the head on screen (H)`).toBeGreaterThanOrEqual(0);
  });

  it("the Shadow Ranger: her tip draws over her cowl in n and ne only, by no more than 0.035 H, until the owner chooses (R90, escalated)", () => {
    for (const [f, m] of Object.entries(screenMargins(row(SHADOW)))) expect(m, `${f}: under the head on screen (H)`).toBeGreaterThanOrEqual(f === "n" || f === "ne" ? -0.035 : 0);
  });

  it.each(FIGURES)("%s: no point of the bow, its string or its arrow passes through a leg, a boot or the tunic on any baked run frame (R76)", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    const solid = legSolids(rig);
    expect(solid.length).toBeGreaterThanOrEqual(7);
    const bow = bowFrame(rig);
    const frames = poses.filter((p) => p.anim === "run");
    expect(frames).toHaveLength(8);
    // sampled along every edge, at most 0.005 H apart: the string's long stretches included
    const step = 0.005 * rig.H;
    for (const p of frames) {
      p.apply();
      rig.root.updateMatrixWorld(true);
      const pts = along(segmentsOf(bow), step);
      const least = leastOutside(solid, pts);
      // the measure ran: the bow comes level with at least one of them on every frame
      expect(least.some((w) => w !== null), `frame ${p.i}: no leg, boot or tunic measured`).toBe(true);
      for (const [k, w] of least.entries()) if (w !== null) expect(w, `frame ${p.i}: the bow inside ${boneOf(solid[k]) || "the tunic or a leg"}`).toBeGreaterThan(0);
    }
  });

  it("finds a bow pushed into a leg: the same sampled points, moved so the grip sits on the right thigh's axis, read inside it", () => {
    const { rig, poses } = characterPoses(base);
    const solid = legSolids(rig);
    const bow = bowFrame(rig);
    poses.find((p) => p.anim === "run" && p.i === 0).apply();
    rig.root.updateMatrixWorld(true);
    const thigh = solid.find((m) => m.isSkinnedMesh && m.userData.leg && tubeNow(m).mids.some((c) => c.x < 0));
    const { mids } = tubeNow(thigh);
    const into = mids[Math.floor(mids.length / 4)].clone().sub(new THREE.Vector3(0, -BOW_GRIP * rig.H, 0).applyMatrix4(bow.matrixWorld));
    const pts = along(segmentsOf(bow), 0.005 * rig.H).map((v) => v.add(into));
    expect(Math.min(...leastOutside(solid, pts).filter((w) => w !== null))).toBeLessThan(0);
  });

  it.each(FIGURES)("%s: the bow, its string and its arrow cross neither the cloak nor the quiver on any baked run frame", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    const { cloak, quiver } = backMeshes(rig);
    expect(cloak).toBeTruthy();
    expect(quiver.length).toBeGreaterThanOrEqual(3);
    const bow = bowFrame(rig);
    const frames = poses.filter((p) => p.anim === "run");
    expect(frames).toHaveLength(8);
    for (const p of frames) {
      p.apply();
      rig.root.updateMatrixWorld(true);
      const segments = segmentsOf(bow);
      expect(crossings(segments, trianglesOf(cloak)), `frame ${p.i}: edges through the cloak`).toBe(0);
      expect(crossings(segments, quiver.flatMap(trianglesOf)), `frame ${p.i}: edges through the quiver`).toBe(0);
    }
  });

  it("finds a bow pushed into the cloak and the quiver: the same edges, moved onto the cloak's back and onto the quiver's case, cross them", () => {
    const { rig, poses } = characterPoses(base);
    const { cloak, quiver } = backMeshes(rig);
    const bow = bowFrame(rig);
    poses.find((p) => p.anim === "run" && p.i === 0).apply();
    rig.root.updateMatrixWorld(true);
    const segments = segmentsOf(bow);
    const grip = new THREE.Vector3(0, -BOW_GRIP * rig.H, 0).applyMatrix4(bow.matrixWorld);
    const moved = (to) => {
      const d = to.clone().sub(grip);
      return segments.map(([a, b]) => [a.clone().add(d), b.clone().add(d)]);
    };
    const cloakTris = trianglesOf(cloak);
    const onCloak = cloakTris[Math.floor(cloakTris.length / 2)];
    expect(crossings(moved(onCloak[0].clone().add(onCloak[1]).add(onCloak[2]).divideScalar(3)), cloakTris)).toBeGreaterThan(0);
    const caseMesh = quiver.find((o) => o.material.name === "F.leatherDouble");
    const centre = new THREE.Vector3().setFromMatrixPosition(caseMesh.matrixWorld);
    expect(crossings(moved(centre), quiver.flatMap(trianglesOf))).toBeGreaterThan(0);
  });
});
