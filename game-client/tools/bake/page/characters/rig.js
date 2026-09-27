// The shared humanoid rig (ADR-0021 §1, FS-2325V §E.1): one three.js skeleton, and the builders
// that hang smooth-skinned bodies and garments on it.
//
// Conventions. Model space is three.js with +y up; the model is built facing +z (world +y, "s")
// and the baker turns it to each facing (facing.js). The character's LEFT is +x. Lengths are
// fractions of the character's height H, multiplied out once in createRig.
//
// Bind pose: every bone at zero rotation, arms hanging straight down. All geometry is authored in
// model space in that pose; `attach` converts to bone-local for rigid pieces.
//
// Why skinned tubes: a limb is ONE continuous tube from shoulder to wrist (or hip to ankle) whose
// rings blend their bone weights across the joint, so an elbow or knee bends as one surface.
// Stacked rigid segments (the spike) show a seam at every joint; these cannot.

import * as THREE from "three";

/** Default human proportions, as fractions of height. Creatures override some. */
export const HUMAN = {
  hipY: 0.52, // hips bone (pelvis centre)
  hipW: 1, // pelvis width scale
  torsoW: 1, // chest width scale
  torsoD: 1, // chest depth scale
  shoulderW: 1, // shoulder span scale
  thigh: 0.235,
  shin: 0.225,
  spine: 0.08,
  chest: 0.12,
  neck: 0.125,
  upperArm: 0.172,
  foreArm: 0.15,
  limbR: 1, // limb thickness scale
  armR: 1,
  headR: 0.062,
  hunch: 0, // > 0 adds a hunch bone between spine and chest
  jaw: false, // adds a jaw bone under the head
};

/**
 * Builds the skeleton. Returns the rig: `root` (turned to a facing by the baker), `body` (the
 * group clips pitch and offset for falls), named `bones`, the `skeleton`, and each bone's bind
 * position in model space.
 */
export function createRig(H, overrides = {}) {
  const p = { ...HUMAN, ...overrides };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const bones = {};
  const list = [];
  const bone = (name, parent, x, y, z) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x * H, y * H, z * H);
    (parent ? bones[parent] : body).add(b);
    bones[name] = b;
    list.push(b);
    return b;
  };

  bone("hips", null, 0, p.hipY, 0);
  bone("spine", "hips", 0, 0.05, 0);
  if (p.hunch > 0) {
    bone("hunch", "spine", 0, p.spine * 0.55, -0.01);
    bone("chest", "hunch", 0, p.spine * 0.45, 0);
  } else bone("chest", "spine", 0, p.spine, 0);
  bone("neck", "chest", 0, p.neck, 0);
  bone("head", "neck", 0, 0.05, 0.008);
  if (p.jaw) bone("jaw", "head", 0, 0.012, 0.018);

  const shoulderX = 0.118 * p.shoulderW;
  for (const [side, sx] of [
    ["L", 1],
    ["R", -1],
  ]) {
    bone(`clavicle${side}`, "chest", sx * 0.02, p.neck - 0.035, 0);
    bone(`upperArm${side}`, `clavicle${side}`, sx * (shoulderX - 0.02), 0, 0);
    bone(`foreArm${side}`, `upperArm${side}`, 0, -p.upperArm, 0);
    bone(`hand${side}`, `foreArm${side}`, 0, -p.foreArm, 0);
    bone(`thigh${side}`, "hips", sx * 0.056 * p.hipW, -0.02, 0);
    bone(`shin${side}`, `thigh${side}`, 0, -p.thigh, 0);
    bone(`foot${side}`, `shin${side}`, 0, -p.shin, 0);
  }

  root.updateMatrixWorld(true);
  const bind = {};
  for (const b of list) bind[b.name] = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);

  const rig = {
    H,
    p,
    root,
    body,
    bones,
    bind,
    skeleton: null,
    springs: [],
    groundMeshes: [],
    rest: {},
    /** Adds a bone after construction (cloak chains, beards). Call before any mesh is bound. */
    addBone(name, parent, x, y, z) {
      if (rig.skeleton) throw new Error(`rig: bone ${name} added after the skeleton was bound`);
      const b = bone(name, parent, x, y, z);
      root.updateMatrixWorld(true);
      bind[name] = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
      return b;
    },
    /** Freezes the bone list; every skinned mesh binds to this one skeleton. */
    finalize() {
      if (!rig.skeleton) rig.skeleton = new THREE.Skeleton(list);
      return rig.skeleton;
    },
  };
  // shoulder spread arms slightly so they clear the torso: the rest pose clips build on
  rig.rest[`upperArmL`] = [0, 0, 0.1];
  rig.rest[`upperArmR`] = [0, 0, -0.1];
  return rig;
}

/** A bone's bind position in H units: [x, y, z]. */
export function jointAt(rig, name) {
  const b = rig.bind[name];
  return [b.x / rig.H, b.y / rig.H, b.z / rig.H];
}

/** A UV sphere scaled to radii (rx, ry, rz), for heads, hands and knobs. */
export function ellipsoid(rx, ry, rz, seg = 16) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(8, Math.round(seg * 0.7)));
  g.scale(rx, ry, rz);
  return g;
}

/** Bind-pose point (in H units) → model-space Vector3. */
const V = (H, p) => new THREE.Vector3(p[0] * H, p[1] * H, p[2] * H);

/** Catmull-Rom on scalars. */
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

const smooth = (t) => t * t * (3 - 2 * t);

function blendWeights(a, b, t) {
  const out = {};
  for (const [k, v] of Object.entries(a)) out[k] = (out[k] ?? 0) + v * (1 - t);
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v * t;
  return out;
}

/** Top four influences, normalised, as bone indices. */
function packWeights(rig, map) {
  const bones = rig.skeleton.bones;
  const entries = Object.entries(map)
    .filter(([, w]) => w > 1e-4)
    .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
    .slice(0, 4);
  const sum = entries.reduce((n, [, w]) => n + w, 0) || 1;
  const idx = [0, 0, 0, 0];
  const wt = [0, 0, 0, 0];
  entries.forEach(([name, w], i) => {
    const k = bones.findIndex((b) => b.name === name);
    if (k < 0) throw new Error(`rig: no bone "${name}"`);
    idx[i] = k;
    wt[i] = w / sum;
  });
  return { idx, wt };
}

/**
 * A skinned tube through control points. Each control point: `p` [x,y,z] (H units, bind pose),
 * `r` radius or [lateral, depth] (H units), `w` bone weights ({ bone: weight }), optional `n`
 * superellipse exponent (2 = ellipse, higher = boxier).
 *
 * Options: `segs` around, `steps` rings between control points, `front` reference [x,y,z] for
 * the ring frame (default +z), `arc` [a0, a1] for an open sheet (cloaks, tabards), `caps`,
 * `uv` texels per H along and around, `weight(t, a, pos, base)` to override a vertex's weights
 * (garments that follow the legs), `shape(t, a) → scale` to cut a ragged hem or a face opening.
 */
export function skinTube(rig, cps, material, o = {}) {
  rig.finalize();
  const geo = tubeGeometry(rig.H, cps, o, (w) => packWeights(rig, w));
  return skinned(rig, geo, material, o);
}

/**
 * A rigid tube (boots, greaves, a bow limb): the same builder with no skin. Control points need
 * no `w`. Geometry is in model space; pass it to `attach` with `at` = [0, 0, 0].
 */
export function rigidTube(H, cps, o = {}) {
  return tubeGeometry(H, cps.map((c) => ({ w: {}, ...c })), o, null);
}

function tubeGeometry(H, cps, o, pack) {
  const segs = o.segs ?? 18;
  const steps = o.steps ?? 4;
  const [a0, a1] = o.arc ?? [0, Math.PI * 2];
  const closed = !o.arc;
  const front = new THREE.Vector3(...(o.front ?? [0, 0, 1]));
  const n = cps.length;
  const get = (i) => cps[Math.max(0, Math.min(n - 1, i))];
  const rad = (c) => (Array.isArray(c.r) ? c.r : [c.r, c.r]);

  // Sample the centre line, radii, exponent and weights.
  const rings = [];
  for (let i = 0; i < n - 1; i++) {
    const last = i === n - 2;
    for (let s = 0; s < steps + (last ? 1 : 0); s++) {
      const t = s / steps;
      const [c0, c1, c2, c3] = [get(i - 1), get(i), get(i + 1), get(i + 2)];
      const pos = [0, 1, 2].map((k) => cr(c0.p[k], c1.p[k], c2.p[k], c3.p[k], t));
      const r = [0, 1].map((k) => Math.max(0.001, cr(rad(c0)[k], rad(c1)[k], rad(c2)[k], rad(c3)[k], t)));
      const ex = (c1.n ?? 2) + ((c2.n ?? 2) - (c1.n ?? 2)) * t;
      const w = blendWeights(c1.w, c2.w, smooth(t));
      rings.push({ pos: V(H, pos), r: [r[0] * H, r[1] * H], ex, w, t: (i + t) / (n - 1) });
    }
  }

  // Ring frames from tangents and the front reference.
  const R = rings.length;
  for (let i = 0; i < R; i++) {
    const a = rings[Math.max(0, i - 1)].pos;
    const b = rings[Math.min(R - 1, i + 1)].pos;
    const T = new THREE.Vector3().subVectors(b, a).normalize();
    let side = new THREE.Vector3().crossVectors(T, front);
    if (side.lengthSq() < 1e-6) side = new THREE.Vector3(1, 0, 0);
    side.normalize();
    const F = new THREE.Vector3().crossVectors(side, T).normalize();
    Object.assign(rings[i], { T, side, F });
  }

  const cols = segs + 1;
  const pos = [];
  const uv = [];
  const skinIndex = [];
  const skinWeight = [];
  let along = 0;
  const circ = Math.PI * (rings.reduce((m, r) => m + r.r[0] + r.r[1], 0) / R);
  const uvScale = o.uv ?? 4;
  for (let i = 0; i < R; i++) {
    const g = rings[i];
    if (i > 0) along += g.pos.distanceTo(rings[i - 1].pos);
    for (let j = 0; j < cols; j++) {
      const a = a0 + ((a1 - a0) * j) / segs;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const e = 2 / g.ex;
      const cx = Math.sign(c) * Math.abs(c) ** e;
      const sz = Math.sign(s) * Math.abs(s) ** e;
      const k = o.shape ? o.shape(g.t, a) : 1;
      const p = g.pos
        .clone()
        .addScaledVector(g.side, cx * g.r[0] * k)
        .addScaledVector(g.F, sz * g.r[1] * k);
      if (o.drop) p.y -= o.drop(g.t, a) * H;
      pos.push(p.x, p.y, p.z);
      uv.push(((j / segs) * circ * (closed ? 1 : (a1 - a0) / (Math.PI * 2)) * uvScale) / H, (along * uvScale) / H);
      if (pack) {
        const { idx, wt } = pack(o.weight ? o.weight(g.t, a, p, g.w) : g.w);
        skinIndex.push(...idx);
        skinWeight.push(...wt);
      }
    }
  }

  const index = [];
  for (let i = 0; i < R - 1; i++)
    for (let j = 0; j < segs; j++) {
      const a = i * cols + j;
      const b = (i + 1) * cols + j;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }

  const addCap = (ring, start) => {
    const g = rings[ring];
    const c = pos.length / 3;
    const cp = g.pos.clone().addScaledVector(g.T, (start ? -1 : 1) * Math.min(g.r[0], g.r[1]) * 0.35);
    pos.push(cp.x, cp.y, cp.z);
    uv.push(0, 0);
    if (pack) {
      const { idx, wt } = pack(g.w);
      skinIndex.push(...idx);
      skinWeight.push(...wt);
    }
    for (let j = 0; j < segs; j++) {
      const v0 = ring * cols + j;
      if (start) index.push(c, v0, v0 + 1);
      else index.push(c, v0 + 1, v0);
    }
  };
  if (closed && o.caps !== false) {
    addCap(0, true);
    addCap(R - 1, false);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (pack) {
    geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
    geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
  }
  geo.setIndex(index);
  geo.computeVertexNormals();
  if (closed) weldSeam(geo, R, cols);
  return geo;
}

/** Averages the normals of a closed tube's first and last columns so the UV seam is invisible. */
function weldSeam(geo, rows, cols) {
  const nrm = geo.attributes.normal;
  const v = new THREE.Vector3();
  const u = new THREE.Vector3();
  for (let i = 0; i < rows; i++) {
    const a = i * cols;
    const b = i * cols + cols - 1;
    v.fromBufferAttribute(nrm, a).add(u.fromBufferAttribute(nrm, b)).normalize();
    nrm.setXYZ(a, v.x, v.y, v.z);
    nrm.setXYZ(b, v.x, v.y, v.z);
  }
}

function skinned(rig, geo, material, o) {
  const skeleton = rig.skeleton;
  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.frustumCulled = false;
  rig.body.add(mesh);
  rig.root.updateMatrixWorld(true);
  mesh.bind(skeleton, new THREE.Matrix4());
  if (o.ground !== false) rig.groundMeshes.push(mesh);
  if (o.noShadow) mesh.userData.noShadow = true;
  return mesh;
}

/**
 * A rigid piece that rides one bone: `geo` authored around the origin, placed at model-space
 * `at` (H units, bind pose) with optional rotation/scale. Returns the mesh.
 */
export function attach(rig, boneName, geo, material, at = [0, 0, 0], o = {}) {
  const b = rig.bones[boneName];
  if (!b) throw new Error(`rig: no bone "${boneName}"`);
  const H = rig.H;
  const mesh = new THREE.Mesh(geo, material);
  const origin = rig.bind[boneName];
  mesh.position.set(at[0] * H - origin.x, at[1] * H - origin.y, at[2] * H - origin.z);
  mesh.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, o.order ?? "XYZ");
  mesh.scale.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
  b.add(mesh);
  if (o.ground) rig.groundMeshes.push(mesh);
  if (o.noShadow) mesh.userData.noShadow = true;
  return mesh;
}

/** A group that rides one bone, positioned like `attach`, for multi-part gear (a sword, a bow). */
export function mount(rig, boneName, at = [0, 0, 0], o = {}) {
  const g = new THREE.Group();
  const H = rig.H;
  const origin = rig.bind[boneName];
  g.position.set(at[0] * H - origin.x, at[1] * H - origin.y, at[2] * H - origin.z);
  g.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, o.order ?? "XYZ");
  rig.bones[boneName].add(g);
  return g;
}

/**
 * A spring-lagged secondary bone (ADR-0021 §3): clips pose everything else, then the spring
 * integrates this bone's rotation from how its parent moved (clips.js).
 *   stiffness, damping: the spring; drag: lean back per unit of forward speed (rad·s/H);
 *   inertia: swing per unit of parent acceleration; limit: clamp in radians;
 *   gravity: 0 keeps the rest angle relative to the parent, 1 hangs straight down in the world;
 *   drape: extra angle toward the body while a corpse settles (a cloak lies on the back).
 */
export function spring(rig, boneName, o = {}) {
  rig.springs.push({
    bone: boneName,
    stiffness: o.stiffness ?? 60,
    damping: o.damping ?? 9,
    drag: o.drag ?? 0.25,
    inertia: o.inertia ?? 0.9,
    limit: o.limit ?? 1.2,
    gravity: o.gravity ?? 0.7,
    drape: o.drape ?? 0,
    rest: o.rest ?? [0, 0, 0],
    axes: o.axes ?? "xz",
  });
}
