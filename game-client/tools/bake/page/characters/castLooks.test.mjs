// The four class builders take a specialization look (FS-1J1CB §B R9, look.js), and the spec
// sheets are named by class and spec (R15). Built in Node with plain materials (the bake page
// paints with canvases), each figure is read back as its meshes in build order: bone, geometry and
// material, so "no look is today's figure" is checked piece by piece, not by eye.

import { describe, it, expect, vi } from "vitest";

/** One plain material per key, so a figure's materials read back by the key they were cut from. */
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
/** A canvas that takes every 2D call and draws nothing (the kite shield paints its face). */
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
  return { fabrics: () => any, retonedFabrics: () => any, mat: () => new THREE.MeshBasicMaterial(), paint: () => ({}), pf: () => 0, pn: () => 0 };
});

const cast = await import("./cast.js");
const { CAST, SPEC_LOOKS, specRow } = cast;

const CLASSES = { knight: cast.knight, wizard: cast.wizard, archer: cast.archer, mercenary: cast.mercenary };

/** A figure as its meshes in build order: the bone each hangs on, its vertices and its material. */
function figure({ rig, style }) {
  const meshes = [];
  rig.root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = [o.material].flat().map((m) => m.name || m.type);
    const pos = o.geometry.attributes.position.array;
    let sum = 0;
    for (let i = 0; i < pos.length; i++) sum += pos[i] * ((i % 7) + 1);
    meshes.push({ parent: o.parent?.name ?? "", mats, n: pos.length, sum: Math.round(sum * 1e4), at: o.position.toArray().map((v) => Math.round(v * 1e5)) });
  });
  return { meshes, bones: Object.keys(rig.bones), style };
}

describe("the class builders take a look (FS-1J1CB R9)", () => {
  it.each(Object.keys(CLASSES))("builds today's %s with no look and with {}", (name) => {
    const build = CLASSES[name];
    const today = figure(build());
    expect(today.meshes.length).toBeGreaterThan(10);
    expect(figure(build({}))).toEqual(today);
    expect(figure(build(undefined))).toEqual(today);
  });

  it("leaves off what a look omits, and nothing else", () => {
    const today = figure(cast.knight());
    const bare = figure(cast.knight({ omit: ["shield"] }));
    expect(bare.meshes.length).toBeLessThan(today.meshes.length);
    // every other mesh as it was, in order: today's figure with the shield's meshes taken out
    const key = (m) => JSON.stringify(m);
    const left = today.meshes.map(key);
    let at = 0;
    for (const m of bare.meshes.map(key)) {
      at = left.indexOf(m, at);
      expect(at).toBeGreaterThanOrEqual(0);
      at += 1;
    }
    expect(bare.bones).toEqual(today.bones);
  });

  it("re-dyes a cloth for the whole figure", () => {
    const { rig } = cast.mercenary({ tones: (F) => ({ coat: F.charcoalTest }) });
    const mats = [];
    rig.root.traverse((o) => o.isMesh && mats.push(o.material.name));
    expect(mats).not.toContain("F.coat");
    expect(mats).toContain("F.charcoalTest");
  });

  it("draws the legs in under a garment the look lengthens (R11)", () => {
    const legSum = (r) => {
      const legs = [];
      r.rig.root.traverse((o) => o.isMesh && o.userData.leg && legs.push(o.geometry.attributes.position.array.reduce((a, v) => a + Math.abs(v), 0)));
      return legs;
    };
    const today = legSum(cast.mercenary());
    const long = legSum(cast.mercenary({ opts: { coat: { bottom: 0.2 } } }));
    expect(long).not.toEqual(today);
  });

  it("swaps a piece with the builder's kit: its rig, cloth, measures and the piece's own options", () => {
    let kit;
    cast.knight({ swap: { hauberk: (rig, k) => (kit = { rig, ...k }) } });
    expect(kit.rig.bones.hips).toBeDefined();
    expect(kit.mat.name).toBe("F.mail");
    expect(kit.o.segs).toBe(30);
    expect(kit.hauberk.bottom).toBeLessThan(kit.hauberk.top);
  });

  it("gives the look's style in place of the class's", () => {
    const style = { attack: "cleave" };
    expect(cast.knight({ style }).style).toBe(style);
    expect(cast.knight().style).not.toBe(style);
  });

  it("refuses a look that names a piece the class lacks", () => {
    expect(() => cast.archer({ omit: ["shield"] })).toThrow(/shield/);
    expect(() => cast.wizard({ swap: { sword: () => {} } })).toThrow(/sword/);
  });
});

describe("a spec look's cast row (FS-1J1CB R15)", () => {
  it("names the eight specs by their class's sheet stem", () => {
    expect(SPEC_LOOKS).toEqual({
      knight: ["guardian", "berserker"],
      wizard: ["spellwarden", "pyromancer"],
      archer: ["hunter", "shadow_ranger"],
      mercenary: ["duelist", "sellsword"],
    });
  });

  it.each(Object.entries(SPEC_LOOKS).flatMap(([base, specs]) => specs.map((s) => [base, s])))(
    "makes %s's %s row: its own sheet and group, the class's sheet options, trimmed",
    (base, spec) => {
      const baseRow = CAST.find((c) => c.sheet === `char_${base}_base`);
      const look = { opts: {} };
      const row = specRow(base, spec, look, { module: `${base}Looks`, fn: spec.toUpperCase() });
      expect(row.sheet).toBe(`char_${base}_${spec}`);
      expect(row.group).toBe(`${base}_${spec}`);
      expect(row.scale).toBe(1.5);
      expect(row.trim).toBe(true);
      expect(row.animations).toBe(baseRow.animations);
      expect(row.module).toBe(`${base}Looks`);
      expect(row.fn).toBe(spec.toUpperCase());
      // the row builds the class's own figure in the look
      expect(figure(row.build())).toEqual(figure(CLASSES[base]({ opts: {} })));
    },
  );

  it("takes sheet options a look adds, the Berserker's off-hand clips", () => {
    const animations = { idle: {}, attack_offhand: {} };
    expect(specRow("knight", "berserker", {}, { animations }).animations).toBe(animations);
  });

  it("refuses a spec its class does not have, or an unknown class", () => {
    expect(() => specRow("knight", "pyromancer", {})).toThrow(/pyromancer/);
    expect(() => specRow("paladin", "guardian", {})).toThrow(/paladin/);
  });

  it("keeps the base class rows as they were: each class in its own group, at 1.5x, trimmed", () => {
    for (const base of Object.keys(SPEC_LOOKS)) {
      const row = CAST.find((c) => c.sheet === `char_${base}_base`);
      expect(row).toMatchObject({ group: base, fn: base, scale: 1.5, trim: true });
      expect(row.module).toBeUndefined();
    }
  });
});
