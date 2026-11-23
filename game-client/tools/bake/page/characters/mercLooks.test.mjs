// The mercenary's specialization looks (FS-1J1CB §A R7–R8, §B R9, R11, R14, R15, §Change: Looks v2
// R60, R61, R62, R65, R68, R69): the Duelist's and the Sellsword's cast rows, built and posed
// exactly as the bake poses them (poses.js). Each keeps its legs inside its garment and its cloak
// on every guarded pose of every clip, the parry included, with no exemption; each blade keeps clear
// of the head and the body on every pose, and the Duelist's long hilt clear of his forearm; the
// Duelist's half-cloak hangs on cloak bones, never rigid on the chest; the Sellsword keeps no
// madder. Plain materials, named by the key they were cut from, stand in for the bake page's
// painted ones: the checks read geometry and which cloth each piece is cut from. The run's sword
// and sword arm are guarded here too (FS-JS7C8 § Change: The mercenary's sprint and trailing sword
// R104–R106): sampled along their meshes' edges against the legs, the boots, the skirts, the
// Duelist's half-cloak and the body on every baked frame of the run, on all three figures, each
// check with a fixture that must fail; each figure's own blade (the base's curved sword, the
// Duelist's long-hilted blade, the Sellsword's broad falchion; integrated with Looks v2 2026-11-23).

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
const { KNOWN_CLIPPING, MIRRORED_LEGACY, clearanceError, cloakClearance, cloakClearanceError, legClearance, mirroredGarment, outside, tubeNow } = await import("./clearance.js");
const { OFFHAND_OF, pose, simulateSprings } = await import("./clips.js");
const { createRig } = await import("./rig.js");
const { cloakBones, skirtBones } = await import("./anatomy.js");
// edgeGuards' `boneOf` (the bone's name) as `boneName`: this file's own `boneOf` returns the bone
const { along, boneOf: boneName, cloakOf, crossings, edgesOf, leastOutside, legSolids, moved, segmentsOf, shown, trianglesOf } = await import("./edgeGuards.mjs");
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
    // his six, the parry kept, no attack on the move (FS-JS7C8 § Change: The mercenary's sprint and trailing sword R107)
    expect(Object.keys(r.animations)).toEqual(["idle", "walk", "attack", "death", "parry", "run"]);
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

describe("the skirt's springs: the Duelist's back panel alone carried out further (FS-JS7C8 § Change: The mercenary's sprint and trailing sword R114)", () => {
  /** The shared skirt spring (anatomy.js `skirtBones`): how far it drags with speed and may swing. */
  const SHARED = { drag: 0.2, limit: 0.8 };
  const PANELS = ["skirtF", "skirtB", "skirtL", "skirtR"];
  const springOf = (rig, bone) => rig.springs.find((s) => s.bone === bone);

  it("takes one panel's own spring over the shared one (skirtBones' per-bone seam), the other panels on the shared", () => {
    const rig = createRig(1.98);
    skirtBones(rig, { stiffness: 55, skirtB: { drag: 0.4, limit: 1.1 } });
    expect(springOf(rig, "skirtB")).toMatchObject({ stiffness: 55, drag: 0.4, limit: 1.1 });
    for (const b of ["skirtF", "skirtL", "skirtR"]) expect(springOf(rig, b), b).toMatchObject({ stiffness: 55, ...SHARED });
  });

  it("drags the Duelist's back panel 0.4 and lets it swing 1.1 rad; his front and side panels keep the shared spring", () => {
    const { rig } = row(DUELIST).build();
    expect(springOf(rig, "skirtB")).toMatchObject({ drag: 0.4, limit: 1.1 });
    for (const b of ["skirtF", "skirtL", "skirtR"]) expect(springOf(rig, b), b).toMatchObject(SHARED);
  });

  it.each([
    ["char_mercenary_base", base],
    ["char_mercenary_sellsword", row(SELLSWORD)],
  ])("keeps every panel of %s on the shared spring", (sheet, r) => {
    const { rig } = r.build();
    for (const b of PANELS) expect(springOf(rig, b), `${sheet} ${b}`).toMatchObject(SHARED);
  });
});

describe("the half-cloak's springs: carried off the shoulder and out in the run alone (FS-JS7C8 § Change: The mercenary's sprint and trailing sword R159)", () => {
  const LINKS = ["cloak0", "cloak1", "cloak2", "cloak3"];
  const springOf = (rig, bone) => rig.springs.find((s) => s.bone === bone);
  /** A bare rig with a chest, a neck and a hips bone moving forward, for the cloak chain to hang on. */
  const walking = (o) => {
    const rig = createRig(1.98);
    cloakBones(rig, o);
    return rig;
  };

  it("gives a clip its own springs over the chain's (cloakBones' per-clip seam): the link's drag, fling, stiffness and hang worked out the same way from the clip's options", () => {
    const rig = walking({ length: 0.27, drag: 0.34, strap: [0.5, 1, 1, 1], clips: { run: { strap: [1, 1, 1, 1], tilt: [0.4, 0.2] } } });
    const top = springOf(rig, "cloak0");
    expect(top).toMatchObject({ stiffness: 140, drag: 0.085, inertia: 0.4, rest: [0, 0, 0] });
    expect(top.clips.run).toMatchObject({ stiffness: 70, drag: 0.17, inertia: 0.8, rest: [0, 0, 0.4] });
    expect(springOf(rig, "cloak1").clips.run.rest).toEqual([0, 0, 0.2]);
    for (const b of ["cloak2", "cloak3"]) expect(springOf(rig, b).clips.run.rest, b).toEqual([0, 0, 0]);
    expect(Object.keys(top.clips)).toEqual(["run"]);
  });

  it("leaves a chain with no clip options as it was: no per-clip springs", () => {
    const rig = walking({ length: 0.62, drag: 0.32 });
    for (const b of LINKS) expect(springOf(rig, b).clips, b).toBeUndefined();
  });

  it("simulates a clip on its own springs and every other clip on the chain's", () => {
    const frames = [pose({ chest: [0, 0, 0] }), pose({ chest: [0.3, 0, 0.2] })];
    const spec = { fps: 8, loop: true, speed: 2.5 };
    const plain = walking({ length: 0.27, drag: 0.34, strap: [0.5, 1, 1, 1] });
    const carried = walking({ length: 0.27, drag: 0.34, strap: [0.5, 1, 1, 1], clips: { run: { strap: [1, 1, 1, 1], tilt: [0.4, 0.2] } } });
    expect(simulateSprings(carried, frames, { ...spec, clip: "walk" })).toEqual(simulateSprings(plain, frames, { ...spec, clip: "walk" }));
    expect(simulateSprings(carried, frames, spec)).toEqual(simulateSprings(plain, frames, spec));
    const run = simulateSprings(carried, frames, { ...spec, clip: "run" });
    expect(run).not.toEqual(simulateSprings(plain, frames, { ...spec, clip: "run" }));
    // hung out to his left at the top
    expect(run[0].cloak0[2]).toBeGreaterThan(0.2);
  });

  // integrated with Looks v2 (2026-11-23): his chain's drag is Looks v2's 0.26 (was 0.34); in the
  // run it drags at 0.4 and its top hangs 0.3 out (mercLooks.js HALF_CLOAK_RUN)
  it("carries the Duelist's half-cloak so in the run alone: its top let swing free and the top two links hung out to his left; every other clip on the chain as it was", () => {
    const { rig } = row(DUELIST).build();
    const held = [0.5, 1, 1, 1];
    LINKS.forEach((b, i) => {
      const s = springOf(rig, b);
      expect(s, b).toMatchObject({ drag: 0.26 * (0.5 + i * 0.35) * held[i], limit: 1, rest: [0, 0, 0] });
      expect(Object.keys(s.clips), b).toEqual(["run"]);
      expect(s.clips.run, b).toMatchObject({ drag: 0.4 * (0.5 + i * 0.35), inertia: 0.8 + i * 0.25, rest: [0, 0, [0.3, 0.2, 0, 0][i]] });
    });
  });
});

describe("the mercenary's spec looks pass the guards on every clip (FS-1J1CB R11, §Change: Looks v2 R65)", () => {
  it.each(LOOKS)("%s keeps its legs inside its skirts on every clip, the run and the parry included, no exemption", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    expect(mirroredGarment(rig)).toBe(false);
    expect(KNOWN_CLIPPING.has(sheet)).toBe(false);
    expect(MIRRORED_LEGACY.has(sheet)).toBe(false);
    const clips = legClearance(rig, poses);
    // his clips, no attack on the move (FS-JS7C8 § Change: The mercenary's sprint and trailing sword R107)
    expect(Object.keys(clips ?? {}).sort()).toEqual(["attack", "idle", "parry", "run", "walk"]);
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
    // the cut, the carry, the walk and the parry are the mercenary's own; his run is the mercenary's
    // trailing sword (the owner, 2026-11-23: 「Duelist 也改拖劍」), Looks v2's run wrist re-key for the
    // raised-blade pump dropped, the trailing arm swung further out (classStyles.js
    // DUELIST_TRAILING_TURNS) and the wrist cocked less for the long hilt (DUELIST_TRAILING_COCK)
    for (const k of ["attack", "speed", "hold", "walk", "guard"]) expect(DUELIST_STYLE[k], k).toBe(MERCENARY_STYLE[k]);
    const { hold, ...rest } = DUELIST_STYLE.run;
    const { hold: mercHold, ...mercRest } = MERCENARY_STYLE.run;
    expect(rest).toEqual(mercRest);
    expect(DUELIST_STYLE.run.wrist).toBeUndefined();
    // his own: the arm further out past the half-cloak, the wrist cocked less for the long hilt
    expect(hold.b.foreArmR).toEqual(mercHold.b.foreArmR);
    expect(hold.b.handR).toEqual([1.32, 0, 0]);
    expect(mercHold.b.handR[0]).toBeGreaterThan(hold.b.handR[0]);
    expect(hold.b.upperArmR).not.toEqual(mercHold.b.upperArmR);
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

describe("the mercenary's sword and sword arm clear of everything they pass (FS-JS7C8 § Change: The mercenary's sprint and trailing sword R104–R106)", () => {
  const FIGURES = [["char_mercenary_base", base], ...LOOKS];
  /**
   * The clips the guards read, every baked frame of each. The run's carry is the one they were
   * written for (R104); the run's keys come from the style, so a new carry is guarded unchanged.
   */
  const GUARDED = ["run"];
  /** How far apart the points sampled along an edge lie, at most (H). */
  const STEP = 0.005;
  /** The sword's lowest point over the ground, at least (H; R99, the sprint's own flight lift). */
  const GROUND = 0.06;

  /**
   * The sword's group on the right hand's grip: the base's curved sword (gear.js `curvedSword`, the
   * steel extrusion's parent), the Duelist's long-hilted blade and the Sellsword's broad falchion
   * (mercKit.js `longBlade`, `falchion`, tagged by name; Looks v2, integrated 2026-11-23).
   */
  const swordOf = (rig) => {
    const [kit] = tagged(rig, "longBlade").concat(tagged(rig, "falchion"));
    if (kit) return kit;
    let g;
    rig.bones.handR.traverse((o) => o.isMesh && o.material.name === "F.steel" && o.geometry.type === "ExtrudeGeometry" && (g = o.parent));
    return g;
  };
  /** The blade alone (its steel: `F.steel`, `F.duelistSteel`, `F.sellSteel`), for the fixtures to place by its middle. */
  const bladeOf = (rig) => swordOf(rig).children.find((o) => o.isMesh && /^F\.(steel|duelistSteel|sellSteel)$/.test(o.material.name));
  /** The spaulder's lames on side `s`: the base's dark steel, the Sellsword's own plate (Looks v2). */
  const platesOn = (rig, s) => [...lamesOn(rig, s, "F.darkSteelDouble"), ...lamesOn(rig, s, "F.sellPlateDouble")];
  /** Whether `o` lies inside `root`. */
  const within = (o, root) => {
    for (let p = o; p; p = p.parent) if (p === root) return true;
    return false;
  };
  /** The bone carrying most of a skinned mesh's vertex `i`. */
  const heaviest = (m, i) => {
    const idx = m.geometry.attributes.skinIndex;
    const wt = m.geometry.attributes.skinWeight;
    let k = 0;
    for (let j = 1; j < 4; j++) if (wt.getComponent(i, j) > wt.getComponent(i, k)) k = j;
    return m.skeleton.bones[idx.getComponent(i, k)].name;
  };
  const PAST_ELBOW = new Set(["foreArmR", "handR"]);
  /**
   * The right arm's own pieces past the elbow, the sword left out, as edges: the rigid ones riding
   * the forearm and the hand (the vambrace, the fist), and every edge of a skinned piece both of
   * whose ends the forearm or the hand carries most (the arm's skin, the Duelist's wide sleeve).
   */
  const armSegments = (rig) => {
    const sword = swordOf(rig);
    const out = [];
    rig.root.traverse((o) => {
      if (!o.isMesh || within(o, sword)) return;
      if (o.isSkinnedMesh) {
        if (!o.userData.garment && !o.userData.cloak && !o.userData.leg) out.push(...edgesOf(o, (i) => PAST_ELBOW.has(heaviest(o, i))));
      } else if (PAST_ELBOW.has(boneName(o))) out.push(...segmentsOf(o));
    });
    return out;
  };
  /**
   * The body the sword must not cross: the torso and what is worn over it (the Duelist's wrapped
   * robe, the Sellsword's buff coat), the skinned meshes carried by the trunk's bones alone.
   */
  const TRUNK = new Set(["hips", "spine", "chest", "neck"]);
  const bodyOf = (rig) => {
    const out = [];
    rig.root.traverse((o) => {
      if (!o.isSkinnedMesh || o.userData.garment || o.userData.cloak || o.userData.leg) return;
      const n = o.geometry.attributes.position.count;
      for (let i = 0; i < n; i++) if (!TRUNK.has(heaviest(o, i))) return;
      out.push(o);
    });
    return out;
  };
  /**
   * The rigid pieces the hips bone carries, which the hand passes at the hip's height behind: the
   * sash's band, knot and tail (the base's on the right hip; the Duelist's wound twice), the empty
   * scabbard on the left hip, the Sellsword's purse at the right hip.
   */
  const hipPiecesOf = (rig) => {
    const out = [];
    rig.root.traverse((o) => o.isMesh && !o.isSkinnedMesh && shown(o) && boneName(o) === "hips" && out.push(o));
    return out;
  };
  /** The head: the rigid pieces the head and the jaw carry (the skull, the face, the hair, the beard). */
  const headOf = (rig) => {
    const out = [];
    rig.root.traverse((o) => o.isMesh && !o.isSkinnedMesh && shown(o) && ["head", "jaw"].includes(boneName(o)) && out.push(o));
    return out;
  };
  /** The right spaulder's lames as edges (the Sellsword's alone): they ride the upper arm and turn with its twist (R98). */
  const spaulderSegments = (rig) => platesOn(rig, "R").flatMap((m) => edgesOf(m));
  /** A solid's name in a failure: the leg, the boot's bone, or the skirt. */
  const nameOf = (m) => (m.userData.leg ? `the ${m.userData.leg} leg` : m.userData.garment ? `the skirt (${m.material.name})` : `the boot on ${boneName(m)}`);

  /**
   * What the guards read on the pose the rig holds now, for edges `segs`: per solid (legSolids) the
   * least distance a sampled point lies outside it (H; null where none reaches it), how many edges
   * cross the half-cloak, the body and the rigid pieces at the hips, and the lowest sampled point
   * over the ground (H).
   */
  function measure(rig, segs) {
    const H = rig.H;
    const pts = along(segs, STEP * H);
    const solid = legSolids(rig);
    const cloak = cloakOf(rig);
    return {
      solid: leastOutside(solid, pts).map((w, k) => ({ name: nameOf(solid[k]), least: w === null ? null : w / H })),
      cloak: cloak ? crossings(segs, trianglesOf(cloak)) : 0,
      body: crossings(segs, bodyOf(rig).flatMap(trianglesOf)),
      hips: crossings(segs, hipPiecesOf(rig).flatMap(trianglesOf)),
      lowest: Math.min(...pts.map((v) => v.y)) / H,
    };
  }
  /** How many of the right spaulder's edges `segs` cross the head. */
  const spaulderMeasure = (rig, segs) => ({ head: crossings(segs, headOf(rig).flatMap(trianglesOf)) });

  /**
   * How deep any of `pts` lies inside the body tube `mesh` (H), on its surface: for each point the
   * tube's own reading (clearance.js `outside`) calls inside, its distance to the nearest of the
   * mesh's triangles as posed; 0 for none inside. The tube's reading alone runs square to the axis,
   * which near the shoulder, where the torso's rings close in to the neck, reads about twice as
   * deep as the surface lies (the Sellsword's right spaulder on the run, into the torso: 0.052 H
   * against about 0.023 H).
   */
  const sunkInto = (mesh, pts) => {
    const { rings, mids } = tubeNow(mesh);
    const inside = pts.filter((v) => (outside(rings, mids, v) ?? 1) < 0);
    if (!inside.length) return 0;
    const tris = trianglesOf(mesh).map((t) => new THREE.Triangle(...t));
    const balls = tris.map((t) => t.getMidpoint(new THREE.Vector3())).map((c, k) => [c, Math.max(...[tris[k].a, tris[k].b, tris[k].c].map((v) => v.distanceTo(c)))]);
    const at = new THREE.Vector3();
    let worst = 0;
    for (const v of inside) {
      let d = Infinity;
      tris.forEach((t, k) => {
        if (v.distanceTo(balls[k][0]) - balls[k][1] >= d) return;
        t.closestPointToPoint(v, at);
        d = Math.min(d, at.distanceTo(v));
      });
      worst = Math.max(worst, d);
    }
    return worst;
  };
  /** The spaulder's lames on side `s` as edges. */
  const lameSegments = (rig, s) => platesOn(rig, s).flatMap((m) => edgesOf(m));
  /** How deep the spaulder's edges `segs` sink into the body, the torso or what is worn over it, at worst (H). */
  const spaulderSunk = (rig, segs) => {
    const pts = along(segs, STEP * rig.H);
    return Math.max(...bodyOf(rig).map((m) => sunkInto(m, pts))) / rig.H;
  };
  /** The spaulders each figure wears: the base's on the off (left) shoulder, the Sellsword's on both; the Duelist's cloak in its place. */
  const SPAULDERS = { char_mercenary_base: ["L"], [DUELIST]: [], [SELLSWORD]: ["L", "R"] };
  /** How deep the spaulder on side `s` sinks on every baked frame of `anim`, the figure posed as the bake poses it. */
  const sunkMemo = new Map();
  const sunkOn = (sheet, r, anim, s) => {
    const key = `${sheet} ${anim} ${s}`;
    if (!sunkMemo.has(key)) {
      const { rig, poses } = characterPoses(r);
      sunkMemo.set(
        key,
        poses
          .filter((p) => p.anim === anim)
          .map((p) => {
            p.apply();
            rig.root.updateMatrixWorld(true);
            return spaulderSunk(rig, lameSegments(rig, s));
          }),
      );
    }
    return sunkMemo.get(key);
  };
  /** The figure posed on every baked frame of `anim`, the sword's, the arm's and the spaulder's measures on each. */
  function guarded(r, anim) {
    const { rig, poses } = characterPoses(r);
    const frames = poses.filter((p) => p.anim === anim);
    return frames.map((p) => {
      p.apply();
      rig.root.updateMatrixWorld(true);
      return { i: p.i, sword: measure(rig, segmentsOf(swordOf(rig))), arm: measure(rig, armSegments(rig)), spaulder: spaulderMeasure(rig, spaulderSegments(rig)) };
    });
  }
  const memo = new Map();
  const frames = (sheet, r, anim) => {
    const key = `${sheet} ${anim}`;
    if (!memo.has(key)) memo.set(key, guarded(r, anim));
    return memo.get(key);
  };
  const CASES = FIGURES.flatMap(([sheet, r]) => GUARDED.map((anim) => [sheet, anim, r]));

  /**
   * What each figure's body and rigid hip pieces are cut from, so neither guard reads an empty set:
   * the body is the torso (the base's in his coat's madder, the Duelist's in the breeches' wool) and
   * the Duelist's wrapped robe or the Sellsword's buff coat over it; at the hips the base's sash
   * band, knot and tail and his scabbard's two leathers and three iron fittings. Looks v2 (FS-1J1CB
   * § Change: Looks v2 R60, R61; integrated 2026-11-23) re-cut the looks': the Duelist's sash wound
   * twice (four slate pieces) and his lacquered long scabbard (the saya, two iron fittings, two
   * cords); the Sellsword's studded belt, his purse and the falchion's scabbard (thirteen brass,
   * two iron, four leather). The right spaulder is the Sellsword's alone, four lames; the base's
   * left three.
   */
  const SCABBARD = ["F.blackIron", "F.blackIron", "F.blackIron", "F.leatherDark", "F.leatherDark"];
  const PIECES = {
    char_mercenary_base: { body: ["F.coat"], hips: [...SCABBARD, "F.sash", "F.sash", "F.sash"], lames: { L: 3, R: 0 } },
    [DUELIST]: {
      body: ["F.breeches", "F.duelistRobe"],
      hips: ["F.duelistCord", "F.duelistCord", "F.duelistIron", "F.duelistIron", "F.duelistSaya", ...Array(4).fill("F.duelistSlate")],
      lames: { L: 0, R: 0 },
    },
    [SELLSWORD]: { body: ["F.buffCoat", "F.sellBlack"], hips: [...Array(13).fill("F.sellBrass"), "F.sellIron", "F.sellIron", ...Array(4).fill("F.sellLeather")], lames: { L: 4, R: 4 } },
  };
  it.each(FIGURES)("%s: the body is its torso and what is worn over it, the pieces at the hips and the right spaulder are all there", (sheet, r) => {
    const { rig } = r.build();
    const names = (ms) => ms.map((m) => m.material.name).sort();
    expect(names(bodyOf(rig))).toEqual([...PIECES[sheet].body].sort());
    expect(names(hipPiecesOf(rig))).toEqual([...PIECES[sheet].hips].sort());
    for (const s of ["L", "R"]) expect(platesOn(rig, s), `${s} spaulder`).toHaveLength(PIECES[sheet].lames[s]);
    expect(headOf(rig).length).toBeGreaterThan(0);
  });

  it.each(CASES)("%s %s: every frame baked, no exemption for the figure (R106)", (sheet, anim, r) => {
    expect(frames(sheet, r, anim)).toHaveLength(r.animations[anim].frames);
    expect(KNOWN_CLIPPING.has(sheet)).toBe(false);
    expect(MIRRORED_LEGACY.has(sheet)).toBe(false);
  });

  it.each(CASES)("%s %s: no point along the sword's edges inside a leg, a boot or a skirt (R104)", (sheet, anim, r) => {
    for (const f of frames(sheet, r, anim)) {
      // the measure ran: the sword comes level with at least one of them on every frame
      expect(f.sword.solid.some((s) => s.least !== null), `frame ${f.i}: no leg, boot or skirt measured`).toBe(true);
      for (const s of f.sword.solid) if (s.least !== null) expect(s.least, `frame ${f.i}: the sword inside ${s.name} (H)`).toBeGreaterThan(0);
    }
  });

  it.each(CASES)("%s %s: no edge of the sword crosses the half-cloak or the body (R104)", (sheet, anim, r) => {
    for (const f of frames(sheet, r, anim)) {
      expect(f.sword.cloak, `frame ${f.i}: sword edges through the half-cloak`).toBe(0);
      expect(f.sword.body, `frame ${f.i}: sword edges through the body`).toBe(0);
    }
  });

  it.each(CASES)("%s %s: the sword's lowest point at least 0.06 H over the ground (R99)", (sheet, anim, r) => {
    for (const f of frames(sheet, r, anim)) expect(f.sword.lowest, `frame ${f.i}: the sword over the ground (H)`).toBeGreaterThanOrEqual(GROUND);
  });

  // The arm past the elbow: the Duelist's right wide sleeve once lay under the robe's back panel on
  // run frames 1 and 6 (I-JS7C8-22: 0.0107 and 0.0021 H in), and the old pumping sword arm, under the
  // sprint's 20° lean, crossed his half-cloak on run frame 7 (6 edges). The trailing sword
  // (classStyles.js `MERC_TRAILING_SWORD`), out from the hip, clears both: the arm past the elbow at
  // least 0.089 H outside every leg, boot and skirt of the base's and the Sellsword's, no edge of it
  // across the half-cloak. Turned out (R158), the arm must stand at least 0.22 rad out: at 0.15 or
  // less the (pre-Looks v2) Duelist's sleeve near the elbow crossed the half-cloak's right hem on run
  // frame 7 (2–9 edges). Integrated with Looks v2 (2026-11-23; the owner: 「Duelist 也改拖劍」), the
  // Duelist trails his long blade too, the arm swung further out (classStyles.js
  // `DUELIST_TRAILING_TURNS`) past his longer half-cloak.
  it.each(CASES)("%s %s: the arm past the elbow (the fist, the vambrace, the sleeve) inside no leg, boot or skirt (R104)", (sheet, anim, r) => {
    for (const f of frames(sheet, r, anim)) {
      expect(f.arm.solid.some((s) => s.least !== null), `frame ${f.i}: no leg, boot or skirt measured`).toBe(true);
      for (const s of f.arm.solid) if (s.least !== null) expect(s.least, `frame ${f.i}: the arm inside ${s.name} (H)`).toBeGreaterThan(0);
    }
  });

  it.each(CASES)("%s %s: no edge of the arm past the elbow crosses the half-cloak (R104)", (sheet, anim, r) => {
    for (const f of frames(sheet, r, anim)) expect(f.arm.cloak, `frame ${f.i}: arm edges through the half-cloak`).toBe(0);
  });

  it.each(CASES)("%s %s: no edge of the sword or of the arm past the elbow crosses a rigid piece at the hips: the sash, its knot and tail, the scabbard, the purse (R104)", (sheet, anim, r) => {
    for (const f of frames(sheet, r, anim)) {
      expect(f.sword.hips, `frame ${f.i}: sword edges through a piece at the hips`).toBe(0);
      expect(f.arm.hips, `frame ${f.i}: arm edges through a piece at the hips`).toBe(0);
    }
  });

  it.each(CASES)("%s %s: no edge of the right spaulder, turning with the arm's twist, crosses the head (R104)", (sheet, anim, r) => {
    for (const f of frames(sheet, r, anim)) expect(f.spaulder.head, `frame ${f.i}: spaulder edges through the head`).toBe(0);
  });

  /**
   * The spaulders sink a little into the chest on clips already shipped: as the arm swings out and
   * back the top lame's inner rim tips down into the front of the upper chest. So the guarded clip
   * may sink a spaulder no deeper than the attack does, the deepest clip of the figure's approved
   * sheet, measured the same way on the surface (the base's left 0.052 H, the Sellsword's left
   * 0.061 and right 0.062 H; the death 0.040–0.048, the walk 0.002–0.010). Not the walk: it sits
   * far under the approved attack and death, so it would hold the run alone to it. Keeping the
   * spaulder out of the chest on every clip is a look change (it would follow only part of the
   * arm's swing, every clip re-baked), not this guard's.
   */
  const SPAULDER_CASES = FIGURES.flatMap(([sheet, r]) => SPAULDERS[sheet].flatMap((s) => GUARDED.map((anim) => [sheet, s, anim, r])));
  it.each(SPAULDER_CASES)("%s %s spaulder %s: sinks into the torso and what is worn over it no deeper than the attack, the deepest shipped clip, sinks it (R104)", (sheet, s, anim, r) => {
    const limit = Math.max(...sunkOn(sheet, r, "attack", s));
    sunkOn(sheet, r, anim, s).forEach((d, i) => expect(d, `frame ${i}: the ${s} spaulder into the body (H), the attack's ${limit.toFixed(4)}`).toBeLessThanOrEqual(limit));
  });

  /** A figure posed on its run's first baked frame, for the fixtures to move its pieces from. */
  const posedOn = (r) => {
    const { rig, poses } = characterPoses(r);
    poses.find((p) => p.anim === "run" && p.i === 0).apply();
    rig.root.updateMatrixWorld(true);
    return rig;
  };
  /** The middle of a mesh's drawn points, model space. */
  const middle = (m) => new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
  /** The sword's edges moved so the blade's middle sits at `to`. */
  const swordAt = (rig, to) => moved(segmentsOf(swordOf(rig)), to.clone().sub(middle(bladeOf(rig))));
  /** The arm's edges moved so the fist (the hand bone) sits at `to`. */
  const armAt = (rig, to) => moved(armSegments(rig), to.clone().sub(new THREE.Vector3().setFromMatrixPosition(rig.bones.handR.matrixWorld)));
  const solidNamed = (m, name) => m.solid.find((s) => s.name === name)?.least;
  /** A point a fraction `t` from a tube's middle ring's centre out to its wall at the back (−z). */
  const intoBack = (mesh, t) => {
    const { rings, mids } = tubeNow(mesh);
    const k = Math.floor(rings.length / 2);
    const back = rings[k].reduce((a, v) => (v.z < a.z ? v : a));
    return mids[k].clone().lerp(back, t);
  };
  const triangleMiddle = (tris, at) => {
    const t = tris[Math.floor(tris.length * at)];
    return t[0].clone().add(t[1]).add(t[2]).divideScalar(3);
  };
  /** The Duelist's half-cloak, posed, and a point on its back. */
  const cloakBack = () => {
    const rig = posedOn(LOOKS[0][1]);
    const tris = trianglesOf(cloakOf(rig));
    return { rig, tris, at: triangleMiddle(tris, 0.5) };
  };

  it("finds a sword pushed into a leg: the blade's middle moved onto the right thigh's axis reads inside it", () => {
    const rig = posedOn(base);
    const thigh = legSolids(rig).find((m) => m.userData.leg === "R");
    const { mids } = tubeNow(thigh);
    expect(solidNamed(measure(rig, swordAt(rig, mids[Math.floor(mids.length / 4)])), "the R leg")).toBeLessThan(0);
  });

  it("finds a sword pushed through the coat's back skirt: the blade's middle moved inside its back wall reads inside it", () => {
    const rig = posedOn(base);
    const coat = legSolids(rig).find((m) => m.userData.garment);
    expect(solidNamed(measure(rig, swordAt(rig, intoBack(coat, 0.8))), nameOf(coat))).toBeLessThan(0);
  });

  it("finds a sword pushed through the half-cloak's back: its edges moved onto the cloak cross it", () => {
    const { rig, at } = cloakBack();
    expect(measure(rig, swordAt(rig, at)).cloak).toBeGreaterThan(0);
  });

  it("finds a sword pushed through the torso: its edges moved onto the chest cross the body", () => {
    const rig = posedOn(base);
    expect(bodyOf(rig).length).toBeGreaterThanOrEqual(1);
    expect(measure(rig, swordAt(rig, new THREE.Vector3().setFromMatrixPosition(rig.bones.chest.matrixWorld))).body).toBeGreaterThan(0);
  });

  it("finds a sword on the ground: its edges lowered to 0.03 H read under the margin", () => {
    const rig = posedOn(base);
    const segs = segmentsOf(swordOf(rig));
    const low = measure(rig, segs).lowest;
    expect(measure(rig, moved(segs, new THREE.Vector3(0, (0.03 - low) * rig.H, 0))).lowest).toBeLessThan(GROUND);
  });

  it("finds the arm's pieces pushed into the half-cloak: the fist moved onto the cloak's back, the arm's edges cross it", () => {
    const { rig, at } = cloakBack();
    expect(armSegments(rig).length).toBeGreaterThan(0);
    expect(measure(rig, armAt(rig, at)).cloak).toBeGreaterThan(0);
  });

  it("finds the arm's pieces pushed into a leg: the fist moved onto the right thigh's axis reads inside it", () => {
    const rig = posedOn(base);
    const { mids } = tubeNow(legSolids(rig).find((m) => m.userData.leg === "R"));
    expect(solidNamed(measure(rig, armAt(rig, mids[Math.floor(mids.length / 4)])), "the R leg")).toBeLessThan(0);
  });

  it("finds a sword pushed through the Sellsword's purse: the blade's middle moved onto the purse, its edges cross a piece at the hips", () => {
    const rig = posedOn(LOOKS[1][1]);
    const purse = rig.bones.hips.children.find((g) => g.isGroup && g.children.some((o) => o.material?.name === "F.sellBrass"));
    expect(measure(rig, swordAt(rig, middle(purse))).hips).toBeGreaterThan(0);
  });

  it("finds the fist pushed onto the base's sash knot: the arm's edges cross a piece at the hips", () => {
    const rig = posedOn(base);
    const knot = hipPiecesOf(rig).find((m) => m.material.name === "F.sash" && !m.userData.cover && m.geometry.type !== "BoxGeometry");
    expect(knot).toBeDefined();
    expect(measure(rig, armAt(rig, middle(knot))).hips).toBeGreaterThan(0);
  });

  it("finds the Sellsword's right spaulder pushed into the head: its lames moved onto the head bone cross the head", () => {
    const rig = posedOn(LOOKS[1][1]);
    const segs = spaulderSegments(rig);
    const lame = middle(platesOn(rig, "R")[0]);
    const head = new THREE.Vector3().setFromMatrixPosition(rig.bones.head.matrixWorld);
    expect(spaulderMeasure(rig, moved(segs, head.sub(lame))).head).toBeGreaterThan(0);
  });

  it.each([
    ["char_mercenary_base", "L", base],
    [SELLSWORD, "R", row(SELLSWORD)],
  ])("finds the %s %s spaulder pushed into the chest: its lames moved onto the chest bone sink deeper than the attack sinks it", (sheet, s, r) => {
    const rig = posedOn(r);
    const lame = middle(platesOn(rig, s)[0]);
    const chest = new THREE.Vector3().setFromMatrixPosition(rig.bones.chest.matrixWorld);
    expect(spaulderSunk(rig, moved(lameSegments(rig, s), chest.sub(lame)))).toBeGreaterThan(Math.max(...sunkOn(sheet, r, "attack", s)));
  });
});

// The trailing blade's bands on the looks' own blades (FS-JS7C8 § Change: The mercenary's sprint and
// trailing sword R98, R158; integrated with Looks v2 2026-11-23): classMotion.test.mjs holds the
// base's sword on the rig; here each look's blade on its baked run frames, its line from the fist to
// the point (`userData.axis`, mercKit.js). Seen from above out to his right of straight back 20–35°
// (R158); below level 15–47°, R98's 45° restated to 47° for Looks v2's longer, heavier blades (the
// Sellsword's broad falchion dips to 46.3° at the bottom of the sway; the ground margin, R99, is
// unchanged).
describe("each look's trailing blade keeps R158's outward band and R98's dip (FS-JS7C8 R98, R158)", () => {
  const DEG = 180 / Math.PI;
  it.each(LOOKS)("%s: on every run frame the blade runs 20–35° out from straight back and 15–47° below level", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    const [blade] = tagged(rig, sheet === DUELIST ? "longBlade" : "falchion");
    const point = blade.userData.axis.at(-1);
    const frames = poses.filter((p) => p.anim === "run");
    expect(frames).toHaveLength(r.animations.run.frames);
    for (const p of frames) {
      p.apply();
      rig.root.updateMatrixWorld(true);
      const hand = new THREE.Vector3().setFromMatrixPosition(rig.bones.handR.matrixWorld);
      const d = new THREE.Vector3(0, point[0] * rig.H, point[1] * rig.H).applyMatrix4(blade.matrixWorld).sub(hand);
      const plan = Math.atan2(-d.x, -d.z) * DEG;
      const below = -Math.atan2(d.y, Math.hypot(d.x, d.z)) * DEG;
      expect(plan, `frame ${p.i}: out from straight back`).toBeGreaterThanOrEqual(20);
      expect(plan, `frame ${p.i}: out from straight back`).toBeLessThanOrEqual(35);
      expect(below, `frame ${p.i}: below level`).toBeGreaterThanOrEqual(15);
      expect(below, `frame ${p.i}: below level`).toBeLessThanOrEqual(47);
    }
  });
});

describe("the Duelist's left arm clear of his half-cloak in the run (FS-JS7C8 § Change: The mercenary's sprint and trailing sword R159)", () => {
  /** The bone carrying most of a skinned mesh's vertex `i`. */
  const heaviest = (m, i) => {
    const idx = m.geometry.attributes.skinIndex;
    const wt = m.geometry.attributes.skinWeight;
    let k = 0;
    for (let j = 1; j < 4; j++) if (wt.getComponent(i, j) > wt.getComponent(i, k)) k = j;
    return m.skeleton.bones[idx.getComponent(i, k)].name;
  };
  const LEFT_ARM = new Set(["upperArmL", "foreArmL", "handL"]);
  /**
   * The free (left) arm's pieces from the shoulder down, as edges: every edge of a skinned piece
   * both of whose ends the left arm's bones carry most (the arm's skin, the wide sleeve over it),
   * and the rigid ones riding them (the bracer, the fist).
   */
  const leftArmSegments = (rig) => {
    const out = [];
    rig.root.traverse((o) => {
      if (!o.isMesh) return;
      if (o.isSkinnedMesh) {
        if (!o.userData.garment && !o.userData.cloak && !o.userData.leg) out.push(...edgesOf(o, (i) => LEFT_ARM.has(heaviest(o, i))));
      } else if (LEFT_ARM.has(boneName(o))) out.push(...segmentsOf(o));
    });
    return out;
  };
  const r = LOOKS[0][1];
  /** How many of the left arm's edges cross the half-cloak on each baked frame of `anim`. */
  const crossingsOn = (anim) => {
    const { rig, poses } = characterPoses(r);
    return poses
      .filter((p) => p.anim === anim)
      .map((p) => {
        p.apply();
        rig.root.updateMatrixWorld(true);
        return crossings(leftArmSegments(rig), trianglesOf(cloakOf(rig)));
      });
  };

  // The sprint's free-arm pump drove his left upper arm, near the shoulder, out through the
  // half-cloak on the run's keys 3–7 (0, 0, 0, 20, 80, 113, 52, 37 edges), madder patches on the
  // slate cloak. In the run the cloak is carried off the shoulder and out (mercLooks.js
  // `HALF_CLOAK_RUN`), so no edge of the arm crosses it on any key.
  it("no edge of the left arm (the skin, the wide sleeve, the bracer, the fist) crosses the half-cloak on any run key", () => {
    const counts = crossingsOn("run");
    expect(counts).toHaveLength(r.animations.run.frames);
    expect(counts).toEqual(counts.map(() => 0));
  });

  it("finds the left arm pushed into the half-cloak: the fist moved onto the cloak's back, the arm's edges cross it", () => {
    const { rig, poses } = characterPoses(r);
    poses.find((p) => p.anim === "run" && p.i === 0).apply();
    rig.root.updateMatrixWorld(true);
    const tris = trianglesOf(cloakOf(rig));
    const t = tris[Math.floor(tris.length * 0.5)];
    const at = t[0].clone().add(t[1]).add(t[2]).divideScalar(3);
    const fist = new THREE.Vector3().setFromMatrixPosition(rig.bones.handL.matrixWorld);
    const segs = leftArmSegments(rig);
    expect(segs.length).toBeGreaterThan(0);
    expect(crossings(moved(segs, at.sub(fist)), tris)).toBeGreaterThan(0);
  });
});
