/**
 * The satchel's leather, painted once into two canvas textures (FS-2325V §D.6): the body, and
 * the flap that lifts off it. The bake has no satchel sheet, so it is drawn here, procedurally,
 * with every colour from the canvas palette (ADR-0013). The approved style spike is the
 * reference: grained hide, burnt edges, vellum stitching, brass rivets and buckle.
 *
 * Geometry is in texture px. The body is drawn centred on the view's origin, and the flap hangs
 * from its hinge (`FLAP_HINGE_Y`), so a negative scaleY swings it up and over.
 */

import type Phaser from "phaser";
import { palette, rgba, shade, tint } from "@/utils/canvasPalette";
import { grain, paint, roundedPoly } from "./paintKit";

export const SATCHEL_BODY_KEY = "ui:satchel-body";
export const SATCHEL_FLAP_KEY = "ui:satchel-flap";

export const BODY_W = 360;
export const BODY_H = 324;
export const FLAP_W = 360;
export const FLAP_H = 252;
/** Where the flap hangs from, in panel-local px (origin at the body's centre). */
export const FLAP_HINGE_Y = 52 - BODY_H / 2;

/** Paints both textures unless a previous scene already did. */
export function ensureSatchelTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(SATCHEL_BODY_KEY))
    paint(scene, SATCHEL_BODY_KEY, BODY_W, BODY_H, paintBody);
  if (!scene.textures.exists(SATCHEL_FLAP_KEY))
    paint(scene, SATCHEL_FLAP_KEY, FLAP_W, FLAP_H, paintFlap);
}

function paintBody(b: CanvasRenderingContext2D, W: number, H: number) {
  // side loops the strap would run through
  for (const x of [5, W - 36]) {
    const loop = roundedPoly(
      [
        [x, 126],
        [x + 31, 126],
        [x + 31, 236],
        [x, 236],
      ],
      13,
    );
    b.fillStyle = rgba(palette.satchelStrap, 1);
    b.fill(loop);
    b.strokeStyle = rgba(palette.inkDeep, 0.5);
    b.lineWidth = 2;
    b.stroke(loop);
  }

  const body = roundedPoly(
    [
      [43, 52],
      [317, 52],
      [335, 310],
      [25, 310],
    ],
    34,
  );
  b.fillStyle = rgba(palette.satchel, 1);
  b.fill(body);
  grain(b, W, H, 51, 0.45);
  burnEdge(b, body, 26);
  stitch(b, body, W / 2, 180, 0.93);

  const lip = roundedPoly(
    [
      [36, 43],
      [324, 43],
      [324, 72],
      [36, 72],
    ],
    13,
  );
  const fold = b.createLinearGradient(0, 43, 0, 72);
  fold.addColorStop(0, rgba(tint(palette.satchelLip, 0.12), 1));
  fold.addColorStop(0.5, rgba(palette.satchelLip, 1));
  fold.addColorStop(1, rgba(shade(palette.satchelLip, 0.45), 1));
  b.fillStyle = fold;
  b.fill(lip);
  stitch(b, lip, W / 2, 58, 0.9);

  for (const x of [5, W - 36]) {
    rivet(b, x + 15, 144);
    rivet(b, x + 15, 218);
  }
  // the brass diamond at the foot
  b.save();
  b.translate(W / 2, 292);
  b.rotate(Math.PI / 4);
  b.fillStyle = rgba(shade(palette.satchelRivet, 0.4), 1);
  b.fillRect(-12, -12, 24, 24);
  b.strokeStyle = rgba(palette.satchelRivet, 1);
  b.lineWidth = 3;
  b.strokeRect(-8, -8, 16, 16);
  b.restore();
}

function paintFlap(b: CanvasRenderingContext2D, W: number, H: number) {
  const flap = roundedPoly(
    [
      [40, 0],
      [320, 0],
      [320, 176],
      [W / 2, 241],
      [40, 176],
    ],
    30,
  );
  b.fillStyle = rgba(palette.satchelFlap, 1);
  b.fill(flap);
  grain(b, W, H, 77, 0.5);
  burnEdge(b, flap, 22);
  stitch(b, flap, W / 2, 117, 0.92);

  for (const x of [115, 245]) {
    const len = 191 - Math.abs(x - W / 2) * 0.3;
    b.fillStyle = rgba(palette.satchelStrap, 1);
    b.fillRect(x - 14, 0, 28, len);
    b.strokeStyle = rgba(palette.satchelStitch, 0.35);
    b.setLineDash([5, 5]);
    b.lineWidth = 1.5;
    b.strokeRect(x - 10, 0, 20, len - 6);
    b.setLineDash([]);
    rivet(b, x, 22, 5);
    rivet(b, x, 135, 5);
  }
  // buckle frame and tongue
  b.strokeStyle = rgba(palette.satchelRivet, 1);
  b.lineWidth = 5;
  b.strokeRect(164, 193, 32, 25);
  b.fillStyle = rgba(shade(palette.satchelRivet, 0.45), 1);
  b.fillRect(176, 184, 8, 40);
}

// ── Leatherwork ──────────────────────────────────────────────────────────

/** Darkened, scorched edges inside the shape. */
function burnEdge(ctx: CanvasRenderingContext2D, path: Path2D, blur: number) {
  ctx.save();
  ctx.clip(path);
  ctx.shadowColor = rgba(palette.satchelBurn, 0.95);
  ctx.shadowBlur = blur;
  ctx.lineWidth = 24;
  ctx.strokeStyle = rgba(palette.satchelBurn, 0.9);
  ctx.stroke(path);
  ctx.restore();
}

/** A dashed line of thread just inside the shape's edge. */
function stitch(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  cx: number,
  cy: number,
  s: number,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.translate(-cx, -cy);
  ctx.setLineDash([7, 6]);
  ctx.strokeStyle = rgba(palette.satchelStitch, 0.55);
  ctx.lineWidth = 2 / s;
  ctx.stroke(path);
  ctx.restore();
}

function rivet(ctx: CanvasRenderingContext2D, x: number, y: number, r = 6) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
  g.addColorStop(0, rgba(tint(palette.satchelRivet, 0.45), 1));
  g.addColorStop(0.5, rgba(palette.frame, 1));
  g.addColorStop(1, rgba(shade(palette.frame, 0.7), 1));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
