// The archer's wolf (FS-X2CMM §Change: The archer's wolf W1): `hound.js` builds a timber wolf on the
// quadruped rig, measured here in its bind pose with plain materials (the bake page paints with
// canvases): heavy in the chest against its hips, pricked ears standing over the skull, a long
// muzzle, a full brush carried low, and a grey-brown coat from BARROW alone. In code it stays the
// hound: the same export, the same clips.

import { describe, it, expect, vi } from "vitest";
import { BARROW } from "../../../../src/utils/theme";

const rgb = (c) => {
  if (typeof c !== "string") return c;
  const n = parseInt(BARROW[c].slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a, b, t) => rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t);
const shade = (c, v) => rgb(c).map((x) => x * v);

vi.mock("../palette.js", () => ({ cssRgb: () => "", mix, shade }));
vi.mock("../materials.js", async () => {
  const THREE = await import("three");
  const any = new Proxy({}, { get: (t, k) => (t[k] ??= new THREE.MeshBasicMaterial()) });
  return { materials: () => any, mkCanvas: () => { throw new Error("no canvas in Node"); } };
});
// each painted material carries the colour its painter gives at a plain point of the texture
vi.mock("./fabrics.js", async () => {
  const THREE = await import("three");
  return {
    paint: (fn) => ({ tone: fn(0.5, 0.5).c }),
    mat: (tex) => Object.assign(new THREE.MeshBasicMaterial(), { userData: { tone: tex.tone } }),
    pf: () => 0.5,
    pn: () => 0.5,
  };
});

const THREE = await import("three");
const { HOUND_ANIMATIONS, hound } = await import("./hound.js");

/** Every skinned part of the built wolf, its vertices in world space in the bind pose, in H. */
function skinnedParts(rig) {
  rig.root.updateMatrixWorld(true);
  const out = [];
  rig.root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.skeleton.update();
    const v = new THREE.Vector3();
    const at = [];
    for (let i = 0; i < o.geometry.attributes.position.count; i++) {
      o.getVertexPosition(i, v);
      at.push(v.clone().applyMatrix4(o.matrixWorld).divideScalar(rig.H));
    }
    out.push({ mesh: o, at });
  });
  return out;
}

/** Every vertex of every part, skinned or rigid, in world space in the bind pose, in H, with its mesh. */
function allVertices(rig) {
  const out = [];
  rig.root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.isSkinnedMesh) o.skeleton.update();
    const v = new THREE.Vector3();
    for (let i = 0; i < o.geometry.attributes.position.count; i++) {
      o.getVertexPosition(i, v);
      out.push({ p: v.clone().applyMatrix4(o.matrixWorld).divideScalar(rig.H), mesh: o });
    }
  });
  return out;
}

const built = hound();
const { rig } = built;
const joint = (name) => new THREE.Vector3().setFromMatrixPosition(rig.bones[name].matrixWorld).divideScalar(rig.H);
const parts = skinnedParts(rig);
const span = ({ at }) => Math.max(...at.map((p) => p.z)) - Math.min(...at.map((p) => p.z));
const breadth = (at) => Math.max(...at.map((p) => Math.abs(p.x)));
/** A part weighted to the bone `name` (its skin index names the bone in its own skeleton). */
const weightedTo = (name) =>
  parts.find(({ mesh }) => {
    const k = mesh.skeleton.bones.indexOf(rig.bones[name]);
    const idx = mesh.geometry.attributes.skinIndex;
    const w = mesh.geometry.attributes.skinWeight;
    for (let i = 0; i < idx.count; i++) for (let c = 0; c < 4; c++) if (idx.getComponent(i, c) === k && w.getComponent(i, c) > 0.5) return true;
    return false;
  });
// the barrel runs the length of the body; the neck reaches furthest forward of the skinned parts
const barrel = parts.reduce((a, b) => (span(b) > span(a) ? b : a));
const neck = parts.reduce((a, b) => (Math.max(...b.at.map((p) => p.z)) > Math.max(...a.at.map((p) => p.z)) ? b : a));

// R47's lean hound, as it was built before this change (30c509da), in H: the
// barrel 0.071 across the hips and 0.084 across the brisket, the neck 0.070, the tail 0.016.
describe("the archer's wolf (FS-X2CMM §Change: The archer's wolf W1)", () => {
  it("stays the hound in code: the same export and the same clips as R47's", () => {
    expect(Object.keys(HOUND_ANIMATIONS)).toEqual(["idle", "walk", "attack", "death"]);
    expect(Object.keys(built.style.clips)).toEqual(["idle", "walk", "attack", "death"]);
  });

  it("is heavy in front: the brisket broader against the hips than R47's hound's, under a thick ruffed neck", () => {
    const at = (z) => barrel.at.filter((p) => Math.abs(p.z - z) <= 0.05);
    expect(breadth(at(joint("chest").z))).toBeGreaterThan(1.22 * breadth(at(joint("hips").z)));
    expect(breadth(neck.at)).toBeGreaterThan(0.09);
  });

  it("pricks its ears: their tips are the highest of it, well over the crown", () => {
    const top = allVertices(rig).reduce((t, v) => (v.p.y > t.p.y ? v : t));
    expect(top.mesh.geometry.type).toBe("ConeGeometry");
    expect(top.p.y - joint("head").y).toBeGreaterThan(0.1);
  });

  it("has a long muzzle, the nose well out in front of the skull", () => {
    const nose = Math.max(...allVertices(rig).map((v) => v.p.z));
    expect(nose - joint("head").z).toBeGreaterThan(0.14);
  });

  it("carries a full brush low, its tip hanging well under the hips, never a thin hound's whip", () => {
    expect(joint("tail3").y).toBeLessThan(joint("hips").y - 0.15);
    const brush = weightedTo("tail2");
    expect(brush).toBeDefined();
    expect(breadth(brush.at)).toBeGreaterThan(0.04);
  });

  it("wears a grey-brown coat from BARROW: the body a warmed grey, the legs and muzzle tawny, never the hostile ember", () => {
    const tone = (part) => part.mesh.material.userData.tone;
    const warmth = ([r, , b]) => r - b;
    const slate = rgb("slate");
    // the body: warmer than slate, still a grey (no channel far from the others)
    const coat = tone(barrel);
    expect(warmth(coat)).toBeGreaterThan(warmth(slate));
    expect(Math.max(...coat) - Math.min(...coat)).toBeLessThan(20);
    // the legs: tawny, a brown well warmer than the coat, short of barrow brown
    const leg = tone(weightedTo("foreArmL"));
    expect(warmth(leg)).toBeGreaterThan(15);
    expect(warmth(leg)).toBeLessThan(warmth(rgb("barrowBrown")));
    const ember = rgb("ember");
    for (const t of [coat, leg]) expect(Math.hypot(...t.map((v, i) => v - ember[i]))).toBeGreaterThan(80);
  });
});
