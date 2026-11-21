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
const { KNOWN_CLIPPING, MIRRORED_LEGACY, clearanceError, cloakClearance, cloakClearanceError, legClearance, mirroredGarment } = await import("./clearance.js");
const { OFFHAND_OF } = await import("./clips.js");
const { createRig } = await import("./rig.js");
const { fireFocus, sceptre, wardFocus } = await import("./gear.js");
const { materials } = await import("../materials.js");
const { fabrics } = await import("./fabrics.js");
const { WIZARD_BUILD } = await import("./classStyles.js");

const row = (sheet) => CAST.find((c) => c.sheet === sheet);
const base = row("char_wizard_base");
const LOOKS = ["char_wizard_spellwarden", "char_wizard_pyromancer"].map((sheet) => [sheet, { ...row(sheet), name: sheet }]);

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
  it.each(LOOKS)("%s keeps her legs inside the gown and the scapular, no exemption", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    expect(mirroredGarment(rig)).toBe(false);
    expect(KNOWN_CLIPPING.has(sheet)).toBe(false);
    expect(MIRRORED_LEGACY.has(sheet)).toBe(false);
    const clips = legClearance(rig, poses);
    expect(Object.keys(clips ?? {}).sort()).toEqual(expect.arrayContaining(["idle", "walk", "run", "attack"]));
    expect(clearanceError(sheet, clips, { scale: r.scale, mirrored: false, known: new Map(), legacy: new Set() })).toBeNull();
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

describe("each focus clears her head and the ground in every clip (FS-1J1CB R3, R4)", () => {
  it.each(LOOKS)("%s never passes the focus through her head or under the ground", (sheet, r) => {
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
          if (v.y < worst.ground) [worst.ground, at.ground] = [v.y, `${p.anim} @${p.i}`];
        }
      }
    }
    // clear of the skull by its hair, as the sceptre is (about 1.5 skull radii from its centre at
    // the nearest, in the run)
    expect(worst.head, `nearest the head at ${at.head}`).toBeGreaterThanOrEqual(1.3);
    expect(worst.ground / rig.H, `lowest at ${at.ground}`).toBeGreaterThanOrEqual(0);
  });
});
