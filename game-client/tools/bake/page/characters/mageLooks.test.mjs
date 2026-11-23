// The mage's specialization looks (FS-1J1CB §A R3–R4, §B R9, R11, R15): the Spellwarden's and the
// Pyromancer's cast rows, built and posed exactly as the bake poses them (poses.js). Each keeps her
// legs inside the gown and scapular on every guarded pose of every clip, with no exemption; the
// Pyromancer's embers are in her gown's hem, never meshes on a body bone; and each focus is about
// 1.5x the sceptre and never passes through her head or the ground. Plain materials, named by the
// key they were cut from, stand in for the bake page's painted ones: the checks read geometry and
// which cloth each piece is cut from.

import { describe, it, expect, vi } from "vitest";

/** One plain material per key, named by it, so a figure's materials read back by the key they were cut from. */
const keyed = async (tag, special = {}) => {
  const THREE = await import("three");
  return new Proxy(
    {},
    {
      get: (t, k) => {
        if (typeof k !== "string") return undefined;
        if (!t[k]) {
          t[k] = special[k]?.(THREE) ?? new THREE.MeshBasicMaterial();
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
  // the ember gown as fabrics.js cuts it: the robe's cloth with an emissive map painted on a band
  // EMBER_BAND H tall
  const embers = (T) => {
    const map = new T.Texture();
    map.userData.band = 0.07;
    return new T.MeshStandardMaterial({ emissiveMap: map });
  };
  const any = await keyed("F", { robeEmbers: embers });
  return { fabrics: () => any, retonedFabrics: () => any, mat: () => new THREE.MeshBasicMaterial(), paint: () => ({}), pf: () => 0, pn: () => 0 };
});

const THREE = await import("three");
const { CAST, wizard } = await import("./cast.js");
const { characterPoses } = await import("./poses.js");
const { KNOWN_CLIPPING, MIRRORED_LEGACY, clearanceError, cloakClearance, cloakClearanceError, legClearance, mirroredGarment, seenThroughCloth } = await import("./clearance.js");
const { OFFHAND_OF } = await import("./clips.js");
const { createRig } = await import("./rig.js");
const { along, edgesOf, leastOutside, shown } = await import("./edgeGuards.mjs");
const { fireFocus, sceptre, wardFocus } = await import("./gear.js");
const { materials } = await import("../materials.js");
const { fabrics } = await import("./fabrics.js");
const { WIZARD_BUILD } = await import("./classStyles.js");

const row = (sheet) => CAST.find((c) => c.sheet === sheet);
const base = row("char_wizard_base");
const LOOKS = ["char_wizard_spellwarden", "char_wizard_pyromancer"].map((sheet) => [sheet, { ...row(sheet), name: sheet }]);
/** The wizard's three figures as the bake poses them: her own and the two looks. */
const FIGURES = [["char_wizard_base", { ...row("char_wizard_base"), name: "char_wizard_base" }], ...LOOKS];

/** The meshes riding the right hand's mount: the sceptre, or a look's focus. */
function focusMeshes(rig) {
  const out = [];
  for (const g of rig.bones.handR.children) if (!g.isBone) g.traverse((o) => o.isMesh && out.push(o));
  return out;
}

/** Does `o` ride the right hand? */
const inRightHand = (o) => {
  for (let p = o.parent; p; p = p.parent) if (p.name === "handR") return true;
  return false;
};

/**
 * The skull as an ellipsoid on the head bone (its local frame): the head mesh's box at bind, its
 * centre and half extents (world units). The head bone is unturned at bind, so the box is square to it.
 */
function skull(rig) {
  rig.root.updateMatrixWorld(true);
  const bone = rig.bones.head;
  const head = bone.children.filter((o) => o.isMesh && o.material.name === "F.skin").sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count)[0];
  const box = new THREE.Box3().setFromObject(head);
  return { centre: bone.worldToLocal(box.getCenter(new THREE.Vector3())), half: box.getSize(new THREE.Vector3()).multiplyScalar(0.5) };
}

/** How far out of the skull `v` (head-bone local) lies, in skull radii: 1 on its surface, under 1 inside. */
const outOfSkull = (head, v) => Math.hypot((v.x - head.centre.x) / head.half.x, (v.y - head.centre.y) / head.half.y, (v.z - head.centre.z) / head.half.z);

describe("the mage's spec looks in the cast (FS-1J1CB R9, R15)", () => {
  it.each(LOOKS)("bakes %s alone in its own group, at the wizard's 1.5x, trimmed, with every wizard clip", (sheet, r) => {
    expect(r.group).toBe(sheet.replace(/^char_/, ""));
    expect(CAST.filter((c) => c.group === r.group)).toHaveLength(1);
    expect(r).toMatchObject({ scale: 1.5, trim: true, module: "mageLooks" });
    expect(Object.keys(r.animations)).toEqual(Object.keys(base.animations));
    for (const [anim, spec] of Object.entries(base.animations)) expect(r.animations[anim], `${sheet} ${anim}`).toEqual(spec);
    for (const t of Object.values(OFFHAND_OF)) expect(r.animations[t]).toBeUndefined();
  });

  it("leaves the wizard's own figure as it was: the sceptre, the teal scapular, the plain gown", () => {
    const { rig } = wizard();
    const mats = [];
    rig.root.traverse((o) => o.isMesh && mats.push(o.material.name));
    expect(mats).toContain("F.scapular");
    expect(mats).not.toContain("F.robeEmbers");
    expect(mats).not.toContain("F.soot");
    expect(mats).not.toContain("F.blackIronDouble");
  });
});

describe("the mage's spec looks pass the guards on every clip (FS-1J1CB R11)", () => {
  it.each(FIGURES)("%s keeps her legs inside the gown and the scapular, no exemption", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    expect(mirroredGarment(rig)).toBe(false);
    expect(KNOWN_CLIPPING.has(sheet)).toBe(false);
    expect(MIRRORED_LEGACY.has(sheet)).toBe(false);
    const clips = legClearance(rig, poses);
    expect(Object.keys(clips ?? {}).sort()).toEqual(expect.arrayContaining(["idle", "walk", "run", "attack"]));
    expect(clearanceError(sheet, clips, { scale: r.scale, mirrored: false, known: new Map(), legacy: new Set() })).toBeNull();
  });

  // FS-JS7C8 § Change: The wizard's sprint and pointed cast R120: the camera sees no hip, thigh or
  // knee through her gown on her own figure and each look, as the bake poses them, at rest and on
  // every moving clip the sheet carries (clearance.test.mjs reads the same on a rebuilt base)
  it.each(FIGURES)("%s shows no hip, thigh or knee through the cloth in any facing, at rest and on every moving clip", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    const anims = ["idle", "run", "walk", "walk_attack", "backpedal_attack"].filter((anim) => anim in r.animations);
    expect(anims).toEqual(expect.arrayContaining(["idle", "run", "walk"]));
    const seen = seenThroughCloth(rig, poses.filter((p) => anims.includes(p.anim)));
    expect(seen.length).toBeGreaterThan(0);
    const worst = seen.reduce((m, f) => (f.seen > m.seen ? f : m), { seen: 0 });
    expect(worst.seen, `${sheet} ${worst.anim} frame ${worst.i}`).toBe(0);
  });

  it.each(LOOKS)("%s passes the cloak guard (she wears no cloak, so nothing to show through)", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    expect(cloakClearanceError(sheet, cloakClearance(rig, poses), { scale: r.scale })).toBeNull();
  });
});

describe("the Pyromancer's embers are in her gown's hem (FS-1J1CB R4)", () => {
  const { rig } = row("char_wizard_pyromancer").build();

  it("hangs no lit mesh on a body bone: everything that glows rides the focus in her hand", () => {
    const lit = [];
    rig.root.traverse((o) => o.isMesh && /^M\.(glow|arcane)/.test(o.material.name) && lit.push(o));
    expect(lit.length).toBeGreaterThan(0);
    for (const o of lit) expect(inRightHand(o), `a lit mesh on ${o.parent?.name}`).toBe(true);
    for (const o of rig.bones.hips.children) expect(!!o.isMesh && /glow/.test(o.material.name)).toBe(false);
  });

  it("cuts the gown from the ember cloth, skinned as the gown is, its hem singed ragged", () => {
    const gowns = [];
    rig.root.traverse((o) => o.isMesh && o.material.name === "F.robeEmbers" && gowns.push(o));
    expect(gowns).toHaveLength(1);
    expect(gowns[0].isSkinnedMesh).toBe(true);
    expect(gowns[0].userData.garment).toBe(true);
  });

  it("lays the ember band on the hem: the hem ring on the map's top row, the band's top EMBER_BAND H up the cloth", () => {
    let gown;
    rig.root.traverse((o) => o.isMesh && o.material.name === "F.robeEmbers" && (gown = o));
    const map = gown.material.emissiveMap;
    const uv = gown.geometry.attributes.uv;
    let vMax = 0;
    let uMax = 0;
    for (let i = 0; i < uv.count; i++) {
      vMax = Math.max(vMax, uv.getY(i));
      uMax = Math.max(uMax, uv.getX(i));
    }
    const v = (y) => y * map.repeat.y + map.offset.y;
    expect(v(vMax)).toBeCloseTo(1, 6);
    // a skirt's UVs run 4 a H down the cloth (anatomy.js `skirt`)
    expect(v(vMax - 0.07 * 4)).toBeCloseTo(0, 6);
    // a whole number of tiles round the gown
    const tiles = uMax * map.repeat.x;
    expect(Math.abs(tiles - Math.round(tiles))).toBeLessThan(1e-9);
  });

  it("re-dyes the scapular, its collar and its bust in the scorched oxblood", () => {
    const mats = [];
    rig.root.traverse((o) => o.isMesh && mats.push(o.material.name));
    expect(mats).not.toContain("F.scapular");
    expect(mats.filter((m) => m === "F.soot").length).toBeGreaterThanOrEqual(4);
  });
});

describe("the Spellwarden's iron (FS-1J1CB R3)", () => {
  const { rig } = row("char_wizard_spellwarden").build();

  it("wears blackened-iron spaulders on both shoulders, three lames each", () => {
    for (const s of ["L", "R"]) expect(rig.bones[`upperArm${s}`].children.filter((o) => o.isMesh && o.material.name === "F.blackIronDouble")).toHaveLength(3);
  });

  it("bakes no ward: nothing lit but the stone in her hand (the ward is a runtime aura, §E)", () => {
    rig.root.traverse((o) => o.isMesh && /^M\.(glow|arcane)/.test(o.material.name) && expect(inRightHand(o), `a lit mesh on ${o.parent?.name}`).toBe(true));
  });
});

describe("each focus is about 1.5x the sceptre (FS-1J1CB R3, R4)", () => {
  /**
   * A piece of gear's length along the grip frame's +z (H), pommel to tip, the upright flame stood
   * along the haft as it stands when the focus is held upright.
   */
  const length = (g) => {
    g.traverse((o) => o.userData.upright && o.rotation.set(Math.PI / 2, 0, 0));
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    return (box.max.z - box.min.z) / rig.H;
  };
  const rig = createRig(...WIZARD_BUILD);
  rig.hooks = [];
  const [M, F, m] = [materials(), fabrics(), new THREE.MeshBasicMaterial()];
  const was = length(sceptre(rig, M, F, m));

  it.each([
    ["the ward focus", () => wardFocus(rig, M, F, m)],
    ["the fire focus", () => fireFocus(rig, M, F, m)],
  ])("makes %s 1.4–1.6x the sceptre's length", (_, build) => {
    const ratio = length(build()) / was;
    expect(ratio).toBeGreaterThanOrEqual(1.4);
    expect(ratio).toBeLessThanOrEqual(1.6);
  });
});

/**
 * The clips whose ground each figure's mount is held over: every clip, but the base's death. Her
 * sceptre's death has no wrist (FOCUS_DEATH is the looks' alone), so as she lies down it reads
 * 0.20 H under the ground on key 6 (I-JS7C8-28, recorded, not loosened: her death keys are held by
 * digest and out of FS-JS7C8 § Change: The wizard's sprint and pointed cast, R115). Her head is held
 * on every clip.
 */
const overGround = (sheet, anim) => sheet !== "char_wizard_base" || anim !== "death";

// the base's sceptre too (FS-JS7C8 § Change: The wizard's sprint and pointed cast R128): the cast
// points it along the aim, past her head
describe("each focus clears her head and the ground in every clip (FS-1J1CB R3, R4)", () => {
  it.each(FIGURES)("%s never passes the focus through her head or under the ground", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    const head = skull(rig);
    const meshes = focusMeshes(rig);
    expect(meshes.length).toBeGreaterThan(5);
    const v = new THREE.Vector3();
    const local = new THREE.Vector3();
    const inv = new THREE.Matrix4();
    const worst = { head: Infinity, ground: Infinity };
    const at = { head: "", ground: "" };
    for (const p of poses) {
      p.apply();
      rig.root.updateMatrixWorld(true);
      inv.copy(rig.bones.head.matrixWorld).invert();
      for (const m of meshes) {
        const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          const d = outOfSkull(head, local.copy(v).applyMatrix4(inv));
          if (d < worst.head) [worst.head, at.head] = [d, `${p.anim} @${p.i}`];
          if (overGround(sheet, p.anim) && v.y < worst.ground) [worst.ground, at.ground] = [v.y, `${p.anim} @${p.i}`];
        }
      }
    }
    // clear of the skull by its hair, as the sceptre is (about 1.5 skull radii from its centre at
    // the nearest, in the run)
    expect(worst.head, `nearest the head at ${at.head}`).toBeGreaterThanOrEqual(1.3);
    expect(worst.ground / rig.H, `lowest at ${at.ground}`).toBeGreaterThanOrEqual(0);
  });
});

// FS-JS7C8 § Change: The wizard's sprint and pointed cast R128, R129: the sceptre or a look's focus
// stays clear of the right arm that holds it on every baked frame of the cast, on all three
// figures: no point along any edge of the meshes the right hand's mount carries lies inside her
// right arm (the skinned tube, shoulder to wrist, the gown's sleeve flaring to 2.35 times its
// width at the wrist: cast.js `sleeve`) or her right hand (the fist and the thumb), save where the
// fist closes on the haft. Each solid has a fixture that must fail.
describe("the sceptre or focus clear of her right forearm, hand and flared sleeve in the cast (FS-JS7C8 § Change: The wizard's sprint and pointed cast R128, R129)", () => {
  /** The clips the guard reads, every baked frame of each: the cast (I-JS7C8-29 re-keys it; the bake's frames are what is read). */
  const GUARDED = ["attack"];
  /** How far apart the points sampled along an edge lie, at most (H). */
  const STEP = 0.005;
  /** The fist's own grip on the haft, left out (H, along the grip frame's +z either side of the grip point): the hand's fist is 0.036 H tall about it (anatomy.js `hands`, size 0.9). */
  const GRIP = 0.035;

  /** The right hand's mount (inHand's group, the grip frame: its +z along the haft from the fist). */
  const gripOf = (rig) => rig.bones.handR.children.find((g) => !g.isBone && !g.isMesh);
  /** The bone carrying most of a skinned mesh's vertex `i`. */
  const heaviest = (m, i) => {
    const idx = m.geometry.attributes.skinIndex;
    const wt = m.geometry.attributes.skinWeight;
    let k = 0;
    for (let j = 1; j < 4; j++) if (wt.getComponent(i, j) > wt.getComponent(i, k)) k = j;
    return m.skeleton.bones[idx.getComponent(i, k)].name;
  };
  /** Her right arm: the skinned tube the right forearm carries (anatomy.js `arms`, the sleeve's flare in it). */
  const armOf = (rig) => {
    const out = [];
    rig.root.traverse((o) => {
      if (!o.isSkinnedMesh || !o.geometry.userData.tube || o.userData.garment || o.userData.leg) return;
      const n = o.geometry.attributes.position.count;
      for (let i = 0; i < n; i++) if (heaviest(o, i) === "foreArmR") return out.push(o);
    });
    return out;
  };
  /** Her right hand: the fist and the thumb (anatomy.js `hands`), the rigid meshes on the hand bone outside the mount. */
  const handOf = (rig) => {
    const grip = gripOf(rig);
    return rig.bones.handR.children.filter((o) => o.isMesh && o !== grip);
  };

  /**
   * The points along every edge of the mount's drawn meshes, at most STEP apart, model space, each
   * with how far up the haft it lies from the grip point (H, the grip frame's z).
   */
  function focusPoints(rig) {
    const grip = gripOf(rig);
    const inv = new THREE.Matrix4().copy(grip.matrixWorld).invert();
    const segs = [];
    grip.traverse((o) => o.isMesh && shown(o) && segs.push(...edgesOf(o)));
    return along(segs, STEP * rig.H).map((v) => ({ v, z: v.clone().applyMatrix4(inv).z / rig.H }));
  }

  /** How far `v` lies outside an ellipsoid mesh (a SphereGeometry scaled, posed rigid; H-free units): negative inside. */
  const outsideEllipsoid = (m, v) => {
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const half = m.geometry.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const c = m.geometry.boundingBox.getCenter(new THREE.Vector3());
    const l = v.clone().applyMatrix4(new THREE.Matrix4().copy(m.matrixWorld).invert()).sub(c);
    return (Math.hypot(l.x / half.x, l.y / half.y, l.z / half.z) - 1) * Math.min(half.x, half.y, half.z);
  };

  /**
   * What the guard reads on the pose the rig holds now, for the mount's points `pts`: the least
   * distance any point off the grip lies outside the right arm, and outside the right hand (H;
   * negative inside).
   */
  function measure(rig, pts) {
    const free = pts.filter((p) => Math.abs(p.z) > GRIP).map((p) => p.v);
    const [arm] = leastOutside(armOf(rig), free);
    const hand = Math.min(...handOf(rig).flatMap((m) => free.map((v) => outsideEllipsoid(m, v))));
    return { arm: arm === null ? Infinity : arm / rig.H, hand: hand / rig.H };
  }

  /** The figure posed on every baked frame of `anim`, the guard's measures on each. */
  const memo = new Map();
  const frames = (sheet, r, anim) => {
    const key = `${sheet} ${anim}`;
    if (!memo.has(key)) {
      const { rig, poses } = characterPoses(r);
      memo.set(
        key,
        poses
          .filter((p) => p.anim === anim)
          .map((p) => {
            p.apply();
            rig.root.updateMatrixWorld(true);
            return { i: p.i, ...measure(rig, focusPoints(rig)) };
          }),
      );
    }
    return memo.get(key);
  };
  const CASES = FIGURES.flatMap(([sheet, r]) => GUARDED.map((anim) => [sheet, anim, r]));

  it.each(FIGURES)("%s: one right arm, the fist and the thumb, and the mount's meshes are there", (sheet, r) => {
    const { rig } = r.build();
    rig.root.updateMatrixWorld(true);
    expect(armOf(rig)).toHaveLength(1);
    expect(handOf(rig)).toHaveLength(2);
    expect(focusPoints(rig).length).toBeGreaterThan(1000);
  });

  it.each(CASES)("%s %s: every frame baked, no exemption for the figure", (sheet, anim, r) => {
    expect(frames(sheet, r, anim)).toHaveLength(r.animations[anim].frames);
    expect(KNOWN_CLIPPING.has(sheet)).toBe(false);
    expect(MIRRORED_LEGACY.has(sheet)).toBe(false);
  });

  it.each(CASES)("%s %s: no point along the mount's edges inside her right arm or its flared sleeve", (sheet, anim, r) => {
    for (const f of frames(sheet, r, anim)) expect(f.arm, `${sheet} ${anim} frame ${f.i}`).toBeGreaterThan(0);
  });

  it.each(CASES)("%s %s: no point along the mount's edges off the grip inside her right hand", (sheet, anim, r) => {
    for (const f of frames(sheet, r, anim)) expect(f.hand, `${sheet} ${anim} frame ${f.i}`).toBeGreaterThan(0);
  });

  /** A figure posed on its cast's strike (key 3), for the fixtures to move the mount from. */
  const posedOn = (r) => {
    const { rig, poses } = characterPoses(r);
    poses.find((p) => p.anim === "attack" && p.i === 3).apply();
    rig.root.updateMatrixWorld(true);
    return rig;
  };
  const world = (rig, b) => new THREE.Vector3().setFromMatrixPosition(rig.bones[b].matrixWorld);
  /** `pts` turned and moved by `m`, copies. */
  const transformed = (pts, m) => pts.map((p) => ({ v: p.v.clone().applyMatrix4(m), z: p.z }));

  it.each(FIGURES)("%s: finds the focus laid along her forearm: its haft turned onto the forearm's axis, the grip at its middle, reads inside the arm", (sheet, r) => {
    const rig = posedOn(r);
    const pts = focusPoints(rig);
    const grip = gripOf(rig);
    const from = new THREE.Vector3(0, 0, 1).transformDirection(grip.matrixWorld);
    const [elbow, wrist] = [world(rig, "foreArmR"), world(rig, "handR")];
    const to = wrist.clone().sub(elbow).normalize();
    const g = new THREE.Vector3().setFromMatrixPosition(grip.matrixWorld);
    const m = new THREE.Matrix4()
      .makeTranslation(elbow.clone().lerp(wrist, 0.5))
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(from, to)))
      .multiply(new THREE.Matrix4().makeTranslation(g.negate()));
    expect(measure(rig, pts).arm, "the focus where she holds it").toBeGreaterThan(0);
    expect(measure(rig, transformed(pts, m)).arm).toBeLessThan(0);
  });

  it.each(FIGURES)("%s: finds the focus's head pushed into her fist: its head moved onto the fist reads inside the hand", (sheet, r) => {
    const rig = posedOn(r);
    const pts = focusPoints(rig);
    const fist = handOf(rig).reduce((a, b) => (b.geometry.attributes.position.count > a.geometry.attributes.position.count ? b : a));
    const head = pts.filter((p) => p.z > 0.24).reduce((s, p) => s.add(p.v), new THREE.Vector3()).divideScalar(pts.filter((p) => p.z > 0.24).length);
    const m = new THREE.Matrix4().makeTranslation(new THREE.Vector3().setFromMatrixPosition(fist.matrixWorld).sub(head));
    expect(measure(rig, transformed(pts, m)).hand).toBeLessThan(0);
  });
});
