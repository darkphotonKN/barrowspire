// The human face (FS-67QQY): the eyes, sockets, nostrils and mouth painted once per bake, the same
// drawing on every human, for the shell `head` lays over the face (anatomy.js); and the brows, one
// drawing coloured per material, so they can take each character's hair tone (R9–R11).
//
// The drawings are in head coordinates, fractions of H (x across, y up from the head joint), on
// the canvas frame `FACE_CANVAS`, so one canvas serves every head whatever its rig.

import * as THREE from "three";
import { FACE_CANVAS } from "./anatomy.js";
import { mkCanvas } from "../materials.js";
import { color, cssRgb, grey, mix, shade } from "../palette.js";

const { left: LEFT, below: BELOW, span: SPAN } = FACE_CANVAS;
const S = 512;

// --- the paint -----------------------------------------------------------------------------

// canvas px from head coordinates (x across, y up from hy)
const X = (x) => ((x - LEFT) / SPAN) * S;
const Y = (y) => S - ((y - BELOW) / SPAN) * S;
const L = (v) => (v / SPAN) * S;

const EYE = { y: 0.054, x: 0.022, w: 0.0105, h: 0.0045 };
const SIDES = [1, -1];

/** The almond of the eye on side `sx`: corner to corner over the lid, back under it. */
function almond(ctx, sx) {
  const cx = X(sx * EYE.x);
  const cy = Y(EYE.y);
  const w = L(EYE.w);
  const h = L(EYE.h);
  ctx.beginPath();
  ctx.moveTo(cx - w, cy);
  ctx.quadraticCurveTo(cx, cy - 2 * h, cx + w, cy);
  ctx.quadraticCurveTo(cx, cy + 1.6 * h, cx - w, cy);
  ctx.closePath();
}

/** A soft elliptical spot of `rgb` at `alpha`, fading to nothing at its rim. */
function spot(ctx, x, y, rx, ry, rgb, alpha) {
  ctx.save();
  ctx.translate(X(x), Y(y));
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, L(rx));
  g.addColorStop(0, cssRgb(rgb, alpha));
  g.addColorStop(0.55, cssRgb(rgb, alpha * 0.6));
  g.addColorStop(1, cssRgb(rgb, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-L(rx), -L(rx), 2 * L(rx), 2 * L(rx));
  ctx.restore();
}

function texture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * The one face drawing (R7, the owner's "B2"): almond eyes with whites, a dark iris toward the
 * nose and an upper lid line; deep-set shading round each eye, a darker hollow under the brow and
 * a crease over the lid; two soft nostrils; the mouth, a lip tint with a dark parting.
 */
function paintFace() {
  const c = mkCanvas(S, S);
  const ctx = c.getContext("2d");
  const dark = mix("pitch", "barrowDeep", 0.4);
  const hollow = mix("barrowDeep", "oxblood", 0.25);
  for (const sx of SIDES) {
    // the socket and the hollow under the brow, then the crease over the lid
    spot(ctx, sx * EYE.x, EYE.y + 0.001, 0.018, 0.011, hollow, 0.34);
    spot(ctx, sx * (EYE.x + 0.001), EYE.y + 0.0068, 0.016, 0.0042, hollow, 0.32);
    ctx.strokeStyle = cssRgb(dark, 0.42);
    ctx.lineWidth = L(0.0009);
    ctx.beginPath();
    ctx.moveTo(X(sx * (EYE.x - EYE.w * 0.85)), Y(EYE.y + 0.0042));
    ctx.quadraticCurveTo(X(sx * EYE.x), Y(EYE.y + 0.0098), X(sx * (EYE.x + EYE.w * 0.95)), Y(EYE.y + 0.0035));
    ctx.stroke();
    // the white, and the iris inside it, offset toward the nose
    almond(ctx, sx);
    ctx.fillStyle = cssRgb(mix("vellum", "barrowBrown", 0.18));
    ctx.fill();
    ctx.save();
    almond(ctx, sx);
    ctx.clip();
    ctx.fillStyle = cssRgb(dark);
    ctx.beginPath();
    ctx.arc(X(sx * (EYE.x - 0.001)), Y(EYE.y), L(0.0052), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // the upper lid line, along the almond's top
    const cx = X(sx * EYE.x);
    const cy = Y(EYE.y);
    ctx.strokeStyle = cssRgb(dark, 0.9);
    ctx.lineWidth = L(0.0016);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - L(EYE.w), cy);
    ctx.quadraticCurveTo(cx, cy - 2 * L(EYE.h), cx + L(EYE.w), cy);
    ctx.stroke();
    // a nostril
    spot(ctx, sx * 0.007, 0.034, 0.0026, 0.0018, dark, 0.7);
  }
  // the mouth: the lips as a tint over the skin, then the parting
  spot(ctx, 0, 0.0245, 0.012, 0.0042, mix("oxblood", "oxbloodText", 0.35), 0.5);
  ctx.strokeStyle = cssRgb(dark, 0.85);
  ctx.lineWidth = L(0.0012);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(X(-0.0105), Y(0.0248));
  ctx.quadraticCurveTo(X(0), Y(0.0235), X(0.0105), Y(0.0248));
  ctx.stroke();
  return c;
}

/** The brows (R9): arched strokes, thick at the inner end, in white, for a material to colour. */
function paintBrows() {
  const c = mkCanvas(S, S);
  const ctx = c.getContext("2d");
  ctx.fillStyle = cssRgb(grey(255));
  for (const sx of SIDES) {
    // the centre line a quadratic from inner end to outer, its half-thickness tapering along it
    const a = [0.009, 0.0635];
    const m = [0.024, 0.0705];
    const b = [0.034, 0.0645];
    const at = (t) => [0, 1].map((k) => (1 - t) * (1 - t) * a[k] + 2 * (1 - t) * t * m[k] + t * t * b[k]);
    const top = [];
    const under = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const [x, y] = at(t);
      const w = 0.0017 * (1 - t) + 0.0008 * t;
      top.push([x, y + w]);
      under.push([x, y - w]);
    }
    ctx.beginPath();
    for (const [i, [x, y]] of [...top, ...under.reverse()].entries()) (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(sx * x), Y(y));
    ctx.closePath();
    ctx.fill();
  }
  return c;
}

const shellMat = (map, offset) =>
  new THREE.MeshStandardMaterial({
    map,
    roughness: 0.6,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset,
  });

let FACE = null;
let BROWS = null;

/**
 * The face's material: lit like the skin under it and never emissive, so a human's eyes take the
 * scene's light (glowing eyes are the hostile channel, R8). Painted once per bake.
 */
export function faceMaterial() {
  return (FACE ??= shellMat(texture(paintFace()), -2));
}

/** A brow material in `tone`, darkened ~0.7 so the brows read on skin at 1 to 2 px (R10). */
export function browMaterial(tone) {
  const m = shellMat((BROWS ??= texture(paintBrows())), -3);
  m.color = color(shade(tone, 0.7));
  m.roughness = 0.9;
  return m;
}
