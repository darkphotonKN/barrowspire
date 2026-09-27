import * as THREE from "three";

/** A mesh with position/scale/rotation from a flat options object. */
export function part(geo, material, o = {}) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  mesh.scale.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
  mesh.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
  return mesh;
}

/** A pivot group attached to `parent` at (x, y, z). */
export function joint(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/** A tapered cylinder from point a to point b. */
export function rod(a, b, r0, r1, material, segments = 8) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, segments), material);
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return mesh;
}

/** Wraps `g` in a group scaled uniformly, so the wrapper's origin stays the footprint centre. */
export function scaled(g, s) {
  g.scale.setScalar(s);
  const w = new THREE.Group();
  w.add(g);
  return w;
}

export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
