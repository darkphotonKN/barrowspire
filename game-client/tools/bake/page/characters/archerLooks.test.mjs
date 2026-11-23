// The archer's specialization looks (FS-1J1CB §A R5–R6, §B R9, R11, R14, R15): the Hunter's and the
// Shadow Ranger's cast rows, built and posed exactly as the bake poses them (poses.js). Each keeps
// its legs inside the tunic and the cloak on every guarded pose of every clip, with no exemption,
// and its quiver over the cloak; the Hunter wears no cowl and nothing of the Nightwood green, her
// head the shared face under brown hair; the Shadow Ranger is dyed through to soot. Plain
// materials, named by the key they were cut from, stand in for the bake page's painted ones: the
// checks read geometry and which cloth each piece is cut from. The run's two-handed low-ready bow
// (FS-JS7C8 § Change: The archer's sprint and low-ready bow R72–R77) is checked here too, on all
// three figures with the longbow on her hand as cast.js hangs it.

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
const { KNOWN_CLIPPING, MIRRORED_LEGACY, clearanceError, cloakClearance, cloakClearanceError, legClearance, mirroredGarment, outside, throughCloth, tubeNow } = await import("./clearance.js");
const { OFFHAND_OF, applyPose, clipsFor, groundPose, sample } = await import("./clips.js");
const { BOW_BRACE, BOW_GRIP, drawGrip } = await import("./draw.js");
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
    // her clips, no attack on the move (FS-JS7C8 § Change: The archer's sprint and low-ready bow R79)
    expect(Object.keys(clips ?? {}).sort()).toEqual(["attack", "idle", "run", "walk"]);
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

describe("the archer's two-handed low-ready bow in the run (FS-JS7C8 § Change: The archer's sprint and low-ready bow R72–R77)", () => {
  const FIGURES = [["char_archer_base", base], ...LOOKS];
  /** 32 samples over the 8-key cycle, as the FS measures her run. */
  const SAMPLES = Array.from({ length: 32 }, (_, k) => k / 4);
  const at = (rig, b) => new THREE.Vector3().setFromMatrixPosition(rig.bones[b].matrixWorld);
  /** Whether `o` and every parent of it is drawn (the bow's arrow hides while nothing is nocked). */
  const shown = (o) => {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  };
  /** The group the longbow hangs in on the left hand's grip (cast.js `bowInHand`): the stave's parent. */
  const bowFrame = (rig) => {
    let g;
    rig.bones.handL.traverse((o) => o.isMesh && o.material.name === "M.woodDark" && (g = o.parent));
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
  /**
   * Every edge of every drawn mesh of the bow (the stave, its grip, the Hunter's nock caps, the
   * string's two strands and, when one is nocked, the arrow), as model-space segments. The string's
   * strands are 4-sided cylinders with vertices only at the tips and the nock (gear.js `longbow`),
   * so their long stretches are only seen along their edges.
   */
  const bowSegments = (bow) => {
    const out = [];
    bow.traverse((o) => {
      if (!o.isMesh || !shown(o)) return;
      const pos = o.geometry.attributes.position;
      const vs = Array.from({ length: pos.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
      const index = o.geometry.index;
      const tri = (k) => (index ? index.getX(k) : k);
      const seen = new Set();
      const count = index ? index.count : pos.count;
      for (let k = 0; k + 2 < count; k += 3)
        for (const [a, b] of [
          [tri(k), tri(k + 1)],
          [tri(k + 1), tri(k + 2)],
          [tri(k + 2), tri(k)],
        ]) {
          const key = a < b ? `${a},${b}` : `${b},${a}`;
          if (seen.has(key) || vs[a].distanceToSquared(vs[b]) < 1e-12) continue;
          seen.add(key);
          out.push([vs[a], vs[b]]);
        }
    });
    return out;
  };
  /** Points along every segment, no further apart than `step` (model units), both ends included. */
  const along = (segments, step) =>
    segments.flatMap(([a, b]) => {
      const n = Math.max(1, Math.ceil(a.distanceTo(b) / step));
      return Array.from({ length: n + 1 }, (_, k) => a.clone().lerp(b, k / n));
    });
  /**
   * The least distance any of `pts` lies outside each of the `solid` tubes (clearance.js
   * `outside`), per mesh; null for a mesh no point reaches along its length.
   */
  const leastOutside = (solid, pts) =>
    solid.map((m) => {
      const { rings, mids } = tubeNow(m);
      let worst = null;
      for (const v of pts) {
        const o = outside(rings, mids, v);
        if (o !== null && (worst === null || o < worst)) worst = o;
      }
      return worst;
    });
  /** Whether segment a–b crosses triangle p–q–r (Möller–Trumbore, the segment's ends included). */
  const crosses = (a, b, p, q, r) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const e1 = new THREE.Vector3().subVectors(q, p);
    const e2 = new THREE.Vector3().subVectors(r, p);
    const h = new THREE.Vector3().crossVectors(d, e2);
    const det = e1.dot(h);
    if (Math.abs(det) < 1e-12) return false;
    const s = new THREE.Vector3().subVectors(a, p);
    const u = s.dot(h) / det;
    if (u < 0 || u > 1) return false;
    const qv = new THREE.Vector3().crossVectors(s, e1);
    const v = d.dot(qv) / det;
    if (v < 0 || u + v > 1) return false;
    const t = e2.dot(qv) / det;
    return t >= 0 && t <= 1;
  };
  /** A mesh's triangles as posed (a skinned one through its bones), model space. */
  const trianglesOf = (m) => {
    const pos = m.geometry.attributes.position;
    const vs = Array.from({ length: pos.count }, (_, i) => (m.isSkinnedMesh ? m.getVertexPosition(i, new THREE.Vector3()) : new THREE.Vector3().fromBufferAttribute(pos, i)).applyMatrix4(m.matrixWorld));
    const index = m.geometry.index;
    const count = index ? index.count : pos.count;
    const tri = (k) => vs[index ? index.getX(k) : k];
    return Array.from({ length: Math.floor(count / 3) }, (_, k) => [tri(3 * k), tri(3 * k + 1), tri(3 * k + 2)]);
  };
  /** How many of `segments` cross any of `triangles` (boxes first, so most pairs are skipped). */
  const crossings = (segments, triangles) => {
    const box = new THREE.Box3();
    for (const t of triangles) for (const v of t) box.expandByPoint(v);
    const tbox = triangles.map((t) => new THREE.Box3().setFromPoints(t));
    const sbox = new THREE.Box3();
    let n = 0;
    for (const [a, b] of segments) {
      sbox.makeEmpty().expandByPoint(a).expandByPoint(b);
      if (!sbox.intersectsBox(box)) continue;
      if (triangles.some((t, k) => sbox.intersectsBox(tbox[k]) && crosses(a, b, ...t))) n++;
    }
    return n;
  };
  /** The cloak (anatomy.js `cloak` tags it) and the quiver's meshes, which the bow must not cross. */
  const backMeshes = (rig) => {
    let cloakMesh;
    rig.root.traverse((o) => o.userData.cloak && (cloakMesh = o));
    return { cloak: cloakMesh, quiver: quiverMeshes(rig) };
  };
  /** The legs and the tunic (skinned), and the boots' feet and shafts riding the foot and shin bones. */
  const legSolids = (rig) => {
    const solid = [];
    rig.root.traverse((o) => {
      if (!o.isMesh || !o.geometry.userData.tube) return;
      if (o.isSkinnedMesh ? o.userData.leg || o.userData.garment : /^(shin|foot)[LR]$/.test(boneOf(o))) solid.push(o);
    });
    return solid;
  };
  const boneOf = (o) => {
    for (let p = o.parent; p; p = p.parent) if (p.isBone) return p.name;
    return "";
  };
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
    const L = 0.4 * H;
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
        const tips = [onBow(0, BOW_BRACE * H, L), onBow(0, BOW_BRACE * H, -L)].sort((a, b) => b.y - a.y);
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

  it.each(FIGURES)("%s: no run key draws the string or nocks an arrow (R74)", (sheet) => {
    for (const [i, p] of RUNS[sheet].run.entries()) {
      expect(p.fx.draw ?? 0, `key ${i} draw`).toBe(0);
      expect(p.fx.arrow ?? 0, `key ${i} arrow`).toBe(0);
      expect(p.fx.ik ?? 0, `key ${i} ik`).toBe(0);
    }
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

  it.each(FIGURES)("%s: the right hand holds the braced string at its middle (R74)", (sheet) => {
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

  it.each(FIGURES)("%s: the bow about 45° off vertical, the upper limb forward and up under the crown, the lower limb back and down (R75)", (sheet) => {
    for (const s of RUNS[sheet].samples) {
      const d = s.upper.clone().sub(s.lower);
      const off = (Math.acos(d.y / d.length()) * 180) / Math.PI;
      expect(off, `@${s.f} off vertical`).toBeGreaterThanOrEqual(35);
      expect(off, `@${s.f} off vertical`).toBeLessThanOrEqual(55);
      expect(s.upper.y, `@${s.f} upper tip above the grip`).toBeGreaterThan(s.grip.y);
      expect(s.upper.z, `@${s.f} upper tip ahead of the grip`).toBeGreaterThan(s.grip.z);
      // every drawn point of the bow, the Hunter's horn caps included
      expect(s.top, `@${s.f} the bow under the crown`).toBeLessThan(s.crown);
      expect(s.lower.y, `@${s.f} lower tip below the grip`).toBeLessThan(s.grip.y);
      expect(s.lower.z, `@${s.f} lower tip behind the grip`).toBeLessThan(s.grip.z);
    }
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
      const pts = along(bowSegments(bow), step);
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
    const pts = along(bowSegments(bow), 0.005 * rig.H).map((v) => v.add(into));
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
      const segments = bowSegments(bow);
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
    const segments = bowSegments(bow);
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
