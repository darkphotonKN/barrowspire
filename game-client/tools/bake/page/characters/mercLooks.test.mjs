// The mercenary's specialization looks (FS-1J1CB §A R7–R8, §B R9, R11, R14, R15): the Duelist's and
// the Sellsword's cast rows, built and posed exactly as the bake poses them (poses.js). Each keeps
// its legs inside its garment and its cloak on every guarded pose of every clip, the parry
// included, with no exemption; the Duelist's half-cloak hangs on cloak bones, never rigid on the
// chest; the Sellsword keeps no madder. Plain materials, named by the key they were cut from, stand
// in for the bake page's painted ones: the checks read geometry and which cloth each piece is cut
// from. The run's sword and sword arm are guarded here too (FS-JS7C8 § Change: The mercenary's
// sprint and trailing sword R104–R106): sampled along their meshes' edges against the legs, the
// boots, the skirts, the Duelist's half-cloak and the body on every baked frame of the run, on all
// three figures, each check with a fixture that must fail.

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

const THREE = await import("three");
const { CAST, mercenary } = await import("./cast.js");
const { characterPoses } = await import("./poses.js");
const { KNOWN_CLIPPING, MIRRORED_LEGACY, clearanceError, cloakClearance, cloakClearanceError, legClearance, mirroredGarment, outside, tubeNow } = await import("./clearance.js");
const { OFFHAND_OF } = await import("./clips.js");
const { createRig } = await import("./rig.js");
const { skirtBones } = await import("./anatomy.js");
const { along, boneOf, cloakOf, crossings, edgesOf, leastOutside, legSolids, moved, segmentsOf, shown, trianglesOf } = await import("./edgeGuards.mjs");

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
    // his six, the parry kept, no attack on the move (FS-JS7C8 § Change: The mercenary's sprint and trailing sword R107)
    expect(Object.keys(r.animations)).toEqual(["idle", "walk", "attack", "death", "parry", "run"]);
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

describe("the mercenary's spec looks pass the guards on every clip (FS-1J1CB R11)", () => {
  it.each(LOOKS)("%s keeps its legs inside its skirts on every clip, the run and the parry included, no exemption", (sheet, r) => {
    const { rig, poses } = characterPoses(r);
    expect(mirroredGarment(rig)).toBe(false);
    expect(KNOWN_CLIPPING.has(sheet)).toBe(false);
    expect(MIRRORED_LEGACY.has(sheet)).toBe(false);
    const clips = legClearance(rig, poses);
    // his clips, no attack on the move (FS-JS7C8 § Change: The mercenary's sprint and trailing sword R107)
    expect(Object.keys(clips ?? {}).sort()).toEqual(["attack", "idle", "parry", "run", "walk"]);
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

  /** The curved sword's group on the right hand's grip (gear.js `curvedSword`): the blade's parent. */
  const swordOf = (rig) => {
    let g;
    rig.bones.handR.traverse((o) => o.isMesh && o.material.name === "F.steel" && o.geometry.type === "ExtrudeGeometry" && (g = o.parent));
    return g;
  };
  /** The blade alone (the steel extrusion), for the fixtures to place by its middle. */
  const bladeOf = (rig) => swordOf(rig).children.find((o) => o.isMesh && o.material.name === "F.steel");
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
      } else if (PAST_ELBOW.has(boneOf(o))) out.push(...segmentsOf(o));
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
    rig.root.traverse((o) => o.isMesh && !o.isSkinnedMesh && shown(o) && boneOf(o) === "hips" && out.push(o));
    return out;
  };
  /** The head: the rigid pieces the head and the jaw carry (the skull, the face, the hair, the beard). */
  const headOf = (rig) => {
    const out = [];
    rig.root.traverse((o) => o.isMesh && !o.isSkinnedMesh && shown(o) && ["head", "jaw"].includes(boneOf(o)) && out.push(o));
    return out;
  };
  /** The right spaulder's lames as edges (the Sellsword's alone): they ride the upper arm and turn with its twist (R98). */
  const spaulderSegments = (rig) => lamesOn(rig, "R").flatMap((m) => edgesOf(m));
  /** A solid's name in a failure: the leg, the boot's bone, or the skirt. */
  const nameOf = (m) => (m.userData.leg ? `the ${m.userData.leg} leg` : m.userData.garment ? `the skirt (${m.material.name})` : `the boot on ${boneOf(m)}`);

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
  const lameSegments = (rig, s) => lamesOn(rig, s).flatMap((m) => edgesOf(m));
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
   * the Duelist's wrapped robe or the Sellsword's buff coat over it; at the hips the sash's band,
   * knot and tail (the Duelist's second turn too), the scabbard's two leathers and three iron
   * fittings, and the Sellsword's purse, two leathers and its brass. The right spaulder is the
   * Sellsword's alone, three lames.
   */
  const SCABBARD = ["F.blackIron", "F.blackIron", "F.blackIron", "F.leatherDark", "F.leatherDark"];
  const PIECES = {
    char_mercenary_base: { body: ["F.coat"], hips: [...SCABBARD, "F.sash", "F.sash", "F.sash"], spaulder: 0 },
    [DUELIST]: { body: ["F.breeches", "F.duelistRobe"], hips: [...SCABBARD, "F.duelistSlate", "F.duelistSlate", "F.duelistSlate", "F.duelistSlate"], spaulder: 0 },
    [SELLSWORD]: { body: ["F.buffCoat", "F.sellBlack"], hips: [...SCABBARD, "F.leatherDark", "F.leatherDark", "F.sellSash", "F.sellSash", "F.sellSash", "M.brass"], spaulder: 3 },
  };
  it.each(FIGURES)("%s: the body is its torso and what is worn over it, the pieces at the hips and the right spaulder are all there", (sheet, r) => {
    const { rig } = r.build();
    const names = (ms) => ms.map((m) => m.material.name).sort();
    expect(names(bodyOf(rig))).toEqual([...PIECES[sheet].body].sort());
    expect(names(hipPiecesOf(rig))).toEqual([...PIECES[sheet].hips].sort());
    expect(lamesOn(rig, "R")).toHaveLength(PIECES[sheet].spaulder);
    for (const s of ["L", "R"]) expect(lamesOn(rig, s), `${s} spaulder`).toHaveLength(SPAULDERS[sheet].includes(s) ? 3 : 0);
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
  // least 0.05 H outside every leg, boot and skirt of the Duelist and 0.086 H of the base's and the
  // Sellsword's, no edge of it across the half-cloak.
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
    const purse = rig.bones.hips.children.find((g) => g.isGroup && g.children.some((o) => o.material?.name === "M.brass"));
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
    const lame = middle(lamesOn(rig, "R")[0]);
    const head = new THREE.Vector3().setFromMatrixPosition(rig.bones.head.matrixWorld);
    expect(spaulderMeasure(rig, moved(segs, head.sub(lame))).head).toBeGreaterThan(0);
  });

  it.each([
    ["char_mercenary_base", "L", base],
    [SELLSWORD, "R", row(SELLSWORD)],
  ])("finds the %s %s spaulder pushed into the chest: its lames moved onto the chest bone sink deeper than the attack sinks it", (sheet, s, r) => {
    const rig = posedOn(r);
    const lame = middle(lamesOn(rig, s)[0]);
    const chest = new THREE.Vector3().setFromMatrixPosition(rig.bones.chest.matrixWorld);
    expect(spaulderSunk(rig, moved(lameSegments(rig, s), chest.sub(lame)))).toBeGreaterThan(Math.max(...sunkOn(sheet, r, "attack", s)));
  });
});
