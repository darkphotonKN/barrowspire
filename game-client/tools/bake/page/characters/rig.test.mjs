import { describe, it, expect } from "vitest";
import { createRig, skinMembrane } from "./rig.js";
import * as THREE from "three";

const names = (rig) => Object.keys(rig.bones);
const parentOf = (rig, name) => rig.bones[name].parent.name;

describe("createRig creature variants (FS-Q14EV §B.2)", () => {
  it("adds no bones by default, so every existing build keeps its skeleton", () => {
    const rig = createRig(2);
    expect(names(rig).filter((n) => /metatarsal|wing|tail/.test(n))).toEqual([]);
    expect(parentOf(rig, "footL")).toBe("shinL");
  });

  it("puts a metatarsal between shin and foot for digitigrade legs, lengthening the leg", () => {
    const human = createRig(2);
    const rig = createRig(2, { digitigrade: 0.12 });
    for (const s of ["L", "R"]) {
      expect(parentOf(rig, `metatarsal${s}`)).toBe(`shin${s}`);
      expect(parentOf(rig, `foot${s}`)).toBe(`metatarsal${s}`);
      expect(rig.bones[`foot${s}`].position.y).toBeCloseTo(-0.12 * 2);
    }
    expect(rig.bind.footL.y).toBeCloseTo(human.bind.footL.y - 0.12 * 2);
  });

  it("hangs a wing chain off each side of the chest: upper arm, forearm, a finger and its tip per entry", () => {
    const wings = { root: [0.08, 0.05, -0.09], arm: [0.1, 0.1, -0.05], fore: [0.2, 0, 0], fingers: [[0.3, 0, 0], [0.2, -0.2, 0], [0, -0.3, 0]], split: 0.5 };
    const rig = createRig(2, { wings });
    for (const [s, sx] of [["L", 1], ["R", -1]]) {
      expect(parentOf(rig, `wingArm${s}`)).toBe("chest");
      expect(parentOf(rig, `wingFore${s}`)).toBe(`wingArm${s}`);
      for (let i = 0; i < 3; i++) {
        expect(parentOf(rig, `wingFinger${s}${i}`)).toBe(`wingFore${s}`);
        expect(parentOf(rig, `wingTip${s}${i}`)).toBe(`wingFinger${s}${i}`);
      }
      // the right wing mirrors the left
      expect(Math.sign(rig.bind[`wingFore${s}`].x)).toBe(sx);
    }
    expect(rig.bind.wingFingerL0.x).toBeCloseTo(-rig.bind.wingFingerR0.x);
    // the tip sits `split` of the way along its finger
    expect(rig.bones.wingTipL0.position.x).toBeCloseTo(0.3 * 0.5 * 2);
  });

  it("chains a tail off the hips, hanging down in bind", () => {
    const rig = createRig(2, { tail: { root: [-0.03, -0.07], segments: 4, length: 0.4 } });
    expect(parentOf(rig, "tail0")).toBe("hips");
    for (let i = 1; i < 4; i++) {
      expect(parentOf(rig, `tail${i}`)).toBe(`tail${i - 1}`);
      expect(rig.bones[`tail${i}`].position.toArray()).toEqual([0, -0.2, 0]);
    }
    expect(rig.bones.tail4).toBeUndefined();
  });
});

describe("createRig quadruped variant (FS-X2F2H §H R61)", () => {
  const BOAR = { quadruped: {}, jaw: true, tail: { root: [0.02, -0.04], segments: 3, length: 0.12 } };

  it("leaves a humanoid build's skeleton exactly as it was: same bones, same order, same bind", () => {
    const plain = createRig(2);
    const off = createRig(2, { quadruped: null });
    expect(names(off)).toEqual(names(plain));
    for (const n of names(plain)) expect(off.bind[n].toArray()).toEqual(plain.bind[n].toArray());
    expect(off.rest).toEqual(plain.rest);
  });

  it("lays the spine horizontal: hips behind, chest ahead, the head out in front at about the same height", () => {
    const rig = createRig(2, BOAR);
    expect(parentOf(rig, "spine")).toBe("hips");
    expect(parentOf(rig, "chest")).toBe("spine");
    expect(parentOf(rig, "neck")).toBe("chest");
    expect(parentOf(rig, "head")).toBe("neck");
    expect(parentOf(rig, "jaw")).toBe("head");
    const { hips, chest, head } = rig.bind;
    // a body length runs along +z (the facing), not up
    expect(chest.z - hips.z).toBeGreaterThan(0.3 * 2);
    expect(Math.abs(chest.y - hips.y)).toBeLessThan(0.1 * 2);
    expect(head.z).toBeGreaterThan(chest.z);
    expect(Math.abs(head.y - chest.y)).toBeLessThan(0.1 * 2);
    expect(names(rig).filter((n) => /hunch|clavicle/.test(n))).toEqual([]);
  });

  it("stands on four legs: forelegs off the chest, hind legs off the hips, each reaching down under the body", () => {
    const rig = createRig(2, BOAR);
    for (const [s, sx] of [["L", 1], ["R", -1]]) {
      expect(parentOf(rig, `upperArm${s}`)).toBe("chest");
      expect(parentOf(rig, `foreArm${s}`)).toBe(`upperArm${s}`);
      expect(parentOf(rig, `hand${s}`)).toBe(`foreArm${s}`);
      expect(parentOf(rig, `thigh${s}`)).toBe("hips");
      expect(parentOf(rig, `shin${s}`)).toBe(`thigh${s}`);
      expect(parentOf(rig, `foot${s}`)).toBe(`shin${s}`);
      expect(Math.sign(rig.bind[`upperArm${s}`].x)).toBe(sx);
      expect(Math.sign(rig.bind[`thigh${s}`].x)).toBe(sx);
      // the lowest joints sit low, a foreleg ahead of a hind leg
      expect(rig.bind[`hand${s}`].y).toBeLessThan(0.2 * 2);
      expect(rig.bind[`foot${s}`].y).toBeLessThan(0.2 * 2);
      expect(rig.bind[`hand${s}`].z).toBeGreaterThan(rig.bind[`foot${s}`].z);
    }
    // nothing spreads the forelegs the way a humanoid's arms are spread at rest
    expect(rig.rest).toEqual({});
  });

  it("chains a tail off the rump, behind the hips", () => {
    const rig = createRig(2, BOAR);
    expect(parentOf(rig, "tail0")).toBe("hips");
    expect(rig.bind.tail0.z).toBeLessThan(rig.bind.hips.z);
    expect(parentOf(rig, "tail2")).toBe("tail1");
  });

  it("takes its proportions from overrides, in body lengths", () => {
    const long = createRig(2, { quadruped: { back: 0.5 } });
    const short = createRig(2, { quadruped: { back: 0.3 } });
    expect(long.bind.chest.z - long.bind.hips.z).toBeGreaterThan(short.bind.chest.z - short.bind.hips.z);
  });
});

describe("skinMembrane", () => {
  it("lofts one skinned panel per pair of ribs from a shared hub, scalloping the free edge", () => {
    const rig = createRig(2, { wings: { root: [0.08, 0.05, -0.09], arm: [0.1, 0.1, -0.05], fore: [0.2, 0, 0], fingers: [[0.3, 0, 0], [0, -0.3, 0]], split: 0.5 }, tail: null });
    const hub = [0.38, 0.8, -0.14];
    const rib = (tip, bone) => [
      { p: hub, w: { wingForeL: 1 } },
      { p: tip, w: { [bone]: 1 } },
    ];
    const ribs = [rib([0.68, 0.8, -0.14], "wingTipL0"), rib([0.38, 0.5, -0.14], "wingTipL1")];
    const plain = skinMembrane(rig, ribs, new THREE.MeshBasicMaterial(), { cols: 4, rows: 4 });
    const cut = skinMembrane(rig, ribs, new THREE.MeshBasicMaterial(), { cols: 4, rows: 4, scallop: [0.3] });
    expect(plain.isSkinnedMesh).toBe(true);
    expect(plain.geometry.attributes.position.count).toBe(5 * 5);
    // the free edge's middle vertex (row 2, last column) is pulled toward the hub
    const at = (mesh, i) => new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i);
    const mid = 2 * 5 + 4;
    const hubV = new THREE.Vector3(...hub).multiplyScalar(2);
    expect(at(cut, mid).distanceTo(hubV)).toBeLessThan(at(plain, mid).distanceTo(hubV));
    // the ribs themselves are not scalloped
    expect(at(cut, 4).distanceTo(at(plain, 4))).toBeCloseTo(0);
  });
});
