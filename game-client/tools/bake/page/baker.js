// The baker: one three.js scene, lit once, with an orthographic camera matched exactly to the
// client's 2:1 isometric projection (FS-2325V §B.1). Models are framed, rendered at SS×,
// read back, and box-filtered down to 1× in premultiplied alpha.
//
// Settled look (from the owner-approved spike): ACES tone mapping, PMREM RoomEnvironment so
// metals are not black (envMapIntensity 1.0 for metals, 0.3 otherwise), a warm key light from
// screen-left so shadows fall screen-right, a cool hemisphere fill and rim, and a
// ShadowMaterial catcher so each sprite carries its own soft ground shadow.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { K1, SS, VIEW_DIR } from "./projection.js";
import { color, mix, normalized } from "./palette.js";

/** Key light direction (toward the light): from screen-left and above. */
const LIGHT_DIR = new THREE.Vector3(-1, 2.83, 1).normalize();

export function createBaker() {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setClearColor(new THREE.Color(0, 0, 0), 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
  camera.position.set(VIEW_DIR[0], VIEW_DIR[1], VIEW_DIR[2]).multiplyScalar(80);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const sun = new THREE.DirectionalLight(color(normalized(mix("vellum", "amberBright", 0.1))), 2.7);
  sun.position.copy(LIGHT_DIR).multiplyScalar(40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  scene.add(
    new THREE.HemisphereLight(
      color(normalized(mix("necrotic", "vellum", 0.45))),
      color(mix("barrowDeep", "barrowBrown", 0.3)),
      0.8,
    ),
  );
  const rim = new THREE.DirectionalLight(color(normalized(mix("necrotic", "slateLight", 0.4))), 1.0);
  rim.position.set(3, 3, -4);
  scene.add(rim);

  const catcher = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.ShadowMaterial({ opacity: 0.5 }),
  );
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = 0.002;
  catcher.receiveShadow = true;
  scene.add(catcher);

  const v = new THREE.Vector3();
  const toView = (p) => {
    v.set(p[0], p[1], p[2]).applyMatrix4(camera.matrixWorldInverse);
    return [v.x, v.y];
  };
  const shadowOf = (p) => {
    const t = Math.max(0, p[1]) / LIGHT_DIR.y;
    return [p[0] - LIGHT_DIR.x * t, 0, p[2] - LIGHT_DIR.z * t];
  };

  function prep(obj) {
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.userData.noShadow !== true;
      o.receiveShadow = true;
      for (const m of [].concat(o.material)) m.envMapIntensity = m.metalness > 0.5 ? 1.0 : 0.3;
    });
    obj.updateMatrixWorld(true);
  }

  /**
   * View-space bounds of an object, from its actual vertices (an axis-aligned box overstates
   * anything lying diagonally), plus where each vertex's shadow falls when `shadow`.
   */
  function boundsOf(obj, shadow) {
    const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, reach: 1 };
    const add = (p) => {
      const [vx, vy] = toView(p);
      b.minX = Math.min(b.minX, vx);
      b.maxX = Math.max(b.maxX, vx);
      b.minY = Math.min(b.minY, vy);
      b.maxY = Math.max(b.maxY, vy);
    };
    const w = new THREE.Vector3();
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        w.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        const p = [w.x, Math.max(0, w.y), w.z];
        add(p);
        if (shadow) add(shadowOf(p));
      }
    });
    const box = new THREE.Box3().setFromObject(obj);
    b.reach = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) + box.max.y + 1;
    return b;
  }

  const union = (a, b) => ({
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
    reach: Math.max(a.reach, b.reach),
  });

  function setShadowBox(r) {
    const c = sun.shadow.camera;
    c.left = -r;
    c.right = r;
    c.top = r;
    c.bottom = -r;
    c.near = 1;
    c.far = 120;
    c.updateProjectionMatrix();
  }

  /** Renders the current scene into a w1 × h1 frame and returns straight-alpha RGBA at 1×. */
  function capture(w1, h1) {
    const W = w1 * SS;
    const H = h1 * SS;
    renderer.setSize(W, H, false);
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const src = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, src);
    return downsample(src, W, H, w1, h1);
  }

  /**
   * Frames a set of models so they share one frame size and one anchor, the model origin (the
   * footprint centre) landing on a whole pixel, then renders each. Pixels per world unit is
   * always K1, so every sprite is at the grid's scale.
   */
  function bakeProps(builders, { shadow = true, pad = 0.12 } = {}) {
    let b = null;
    const models = builders.map((build) => {
      const obj = build();
      prep(obj);
      const ob = boundsOf(obj, shadow);
      b = b ? union(b, ob) : ob;
      return obj;
    });
    const ax = Math.ceil((-b.minX + pad) * K1);
    const ay = Math.ceil((b.maxY + pad) * K1);
    const w1 = ax + Math.ceil((b.maxX + pad) * K1);
    const h1 = ay + Math.ceil((-b.minY + pad) * K1);
    camera.left = -ax / K1;
    camera.right = camera.left + w1 / K1;
    camera.top = ay / K1;
    camera.bottom = camera.top - h1 / K1;
    camera.updateProjectionMatrix();
    setShadowBox(b.reach);
    catcher.visible = shadow;

    const frames = models.map((obj) => {
      scene.add(obj);
      const px = capture(w1, h1);
      scene.remove(obj);
      disposeGeometry(obj);
      return px;
    });
    return { frames, frameWidth: w1, frameHeight: h1, anchorPx: [ax, ay] };
  }

  /** Screen-px offset of a model-space point from the model origin, at 1×. */
  function screenOffset(p) {
    const [x, y] = toView(p);
    return { x: Math.round(x * K1), y: Math.round(-y * K1) };
  }

  /**
   * Frames a model centred in a fixed square, scaled to fit: the container view's item icons
   * share one slot size, whatever the item.
   */
  function bakeIcon(build, size, { margin = 5 } = {}) {
    const obj = build();
    prep(obj);
    const b = boundsOf(obj, true);
    const scale = Math.min((size - 2 * margin) / (b.maxX - b.minX), (size - 2 * margin) / (b.maxY - b.minY));
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const half = size / 2 / scale;
    camera.left = cx - half;
    camera.right = cx + half;
    camera.top = cy + half;
    camera.bottom = cy - half;
    camera.updateProjectionMatrix();
    setShadowBox(b.reach);
    catcher.visible = true;
    scene.add(obj);
    const px = capture(size, size);
    scene.remove(obj);
    disposeGeometry(obj);
    return px;
  }

  /**
   * Bakes one posed model from several facings (FS-2325V §E): `poses` are functions that pose the
   * model in place, `yaws` the y rotations that turn it to each facing. Every frame shares one
   * frame size and anchor (the footprint origin), so a sheet swaps frames without jitter.
   * Returns frames[pose][yaw].
   */
  function bakeCharacter(root, poses, yaws, { pad = 0.06 } = {}) {
    prep(root);
    scene.add(root);
    // pass 1: bounds over every pose and facing, from the skinned vertices themselves
    const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    let reach = 1;
    const w = new THREE.Vector3();
    for (const apply of poses) {
      root.rotation.y = 0;
      apply();
      root.updateMatrixWorld(true);
      const pts = [];
      root.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 2) {
          if (o.isSkinnedMesh) o.getVertexPosition(i, w);
          else w.fromBufferAttribute(pos, i);
          w.applyMatrix4(o.matrixWorld);
          pts.push(w.x, Math.max(0, w.y), w.z);
        }
      });
      for (const yaw of yaws) {
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        for (let i = 0; i < pts.length; i += 3) {
          const p = [pts[i] * c + pts[i + 2] * s, pts[i + 1], -pts[i] * s + pts[i + 2] * c];
          reach = Math.max(reach, Math.hypot(p[0], p[2]) * 2 + p[1] + 1);
          for (const q of [p, shadowOf(p)]) {
            const [vx, vy] = toView(q);
            if (vx < b.minX) b.minX = vx;
            if (vx > b.maxX) b.maxX = vx;
            if (vy < b.minY) b.minY = vy;
            if (vy > b.maxY) b.maxY = vy;
          }
        }
      }
    }
    const ax = Math.ceil((-b.minX + pad) * K1);
    const ay = Math.ceil((b.maxY + pad) * K1);
    const w1 = ax + Math.ceil((b.maxX + pad) * K1);
    const h1 = ay + Math.ceil((-b.minY + pad) * K1);
    camera.left = -ax / K1;
    camera.right = camera.left + w1 / K1;
    camera.top = ay / K1;
    camera.bottom = camera.top - h1 / K1;
    camera.updateProjectionMatrix();
    setShadowBox(reach);
    catcher.visible = true;

    // pass 2: render every pose from every facing
    const frames = poses.map((apply) => {
      root.rotation.y = 0;
      apply();
      // a pose may dress the rig in another palette (a hub resident's variant): light it alike
      prep(root);
      return yaws.map((yaw) => {
        root.rotation.y = yaw;
        root.updateMatrixWorld(true);
        return capture(w1, h1);
      });
    });
    scene.remove(root);
    disposeGeometry(root);
    return { frames, frameWidth: w1, frameHeight: h1, anchorPx: [ax, ay] };
  }

  function info() {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  }

  return { bakeProps, bakeIcon, bakeCharacter, screenOffset, info };
}

function disposeGeometry(obj) {
  obj.traverse((o) => {
    if (o.isMesh) o.geometry.dispose();
  });
}

/**
 * 2×2 box filter from the SS× framebuffer (bottom-up rows, premultiplied alpha) to top-down,
 * straight-alpha RGBA at 1×. Integer arithmetic only, so it is exact and repeatable.
 */
export function downsample(src, W, H, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  const n = SS * SS;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        const row = H - 1 - (y * SS + sy);
        for (let sx = 0; sx < SS; sx++) {
          const i = (row * W + x * SS + sx) * 4;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          a += src[i + 3];
        }
      }
      const o = (y * w + x) * 4;
      if (a === 0) continue;
      // Unpremultiply: straight = premultiplied_sum / alpha_sum (the n's cancel).
      out[o] = Math.round((r * 255) / a);
      out[o + 1] = Math.round((g * 255) / a);
      out[o + 2] = Math.round((b * 255) / a);
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}
