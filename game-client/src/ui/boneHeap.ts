/**
 * The bone heap: the container view's face for a slain monster's drop pile (FS-1D6BX
 * §Requirements 15). A low heap of long bones, ribs and skulls with grave rags caught among
 * them, in the drop pile's own bone, rag and earth (`dropPile*`). The items lie on top of it.
 * It is drawn here in code, as the satchel is (ADR-0020/0021, D10), and laid out from a fixed
 * seed, so every client paints the same heap.
 *
 * It fills the satchel's footprint (`BODY_W` × `BODY_H`, D8), so the satchel's slots rest on the
 * heap. Nothing opens: there is one texture.
 */

import type Phaser from "phaser";
import { mix, palette, rgba, shade, tint } from "@/utils/canvasPalette";
import { grain, hash, paint, type Pt } from "./paintKit";
import { BODY_H, BODY_W } from "./satchel";

export const BONE_HEAP_KEY = "ui:bone-heap";

/** Paints the heap unless a previous scene already did. */
export function ensureBoneHeapTexture(scene: Phaser.Scene): void {
  if (!scene.textures.exists(BONE_HEAP_KEY))
    paint(scene, BONE_HEAP_KEY, BODY_W, BODY_H, paintHeap);
}

const SEED = 61;
const BASE_Y = 304;
const PEAK_Y = 74;
const HALF_W = 172;

/** The heap's top edge at x: a broad, lumpy mound, `half` px either side of the middle. */
function crest(x: number, half = HALF_W): number {
  const u = Math.min(1, Math.abs(x - BODY_W / 2) / half);
  const lump = (hash(Math.floor(x / 23), 0, SEED) - 0.5) * 14;
  return (
    BASE_Y - (BASE_Y - PEAK_Y) * Math.pow(1 - u * u, 0.42) + lump * (1 - u)
  );
}

/** The soot under the bones: the mound drawn in, so only the bones make the heap's edge. */
const SOOT_HALF = HALF_W - 26;

type Piece =
  | {
      kind: "long";
      x: number;
      y: number;
      len: number;
      thick: number;
      angle: number;
      depth: number;
    }
  | {
      kind: "rib";
      x: number;
      y: number;
      r: number;
      angle: number;
      depth: number;
    }
  | {
      kind: "vertebra";
      x: number;
      y: number;
      s: number;
      angle: number;
      depth: number;
    }
  | {
      kind: "skull";
      x: number;
      y: number;
      s: number;
      angle: number;
      depth: number;
    }
  | {
      kind: "rag";
      x: number;
      y: number;
      s: number;
      angle: number;
      depth: number;
    };

/** Where the skulls sit: round the edges, where the plunder on top leaves them seen. */
const SKULLS: [number, number, number][] = [
  [56, 262, 1.05],
  [306, 258, 1.0],
  [268, 132, 0.8],
  [92, 152, 0.82],
  [200, 286, 0.9],
  [160, 100, 0.7],
];

function layout(): Piece[] {
  const rand = seeded(SEED);
  const pieces: Piece[] = [];
  for (let n = 0; pieces.length < 125 && n < 6000; n++) {
    const x = 8 + rand() * (BODY_W - 16);
    const y = PEAK_Y + rand() * (BASE_Y - PEAK_Y);
    if (y < crest(x) + 6) continue;
    const depth = (y - PEAK_Y) / (BASE_Y - PEAK_Y); // 0 far up the heap, 1 at its foot
    const s = 0.8 + 0.45 * depth;
    const angle = (rand() - 0.5) * 1.1 + (rand() < 0.12 ? Math.PI / 2 : 0);
    const roll = rand();
    const piece: Piece =
      roll < 0.62
        ? {
            kind: "long",
            x,
            y,
            len: (48 + rand() * 44) * s,
            thick: (9 + rand() * 5) * s,
            angle,
            depth,
          }
        : roll < 0.8
          ? {
              kind: "rib",
              x,
              y,
              r: (20 + rand() * 12) * s,
              angle: (rand() - 0.5) * 1.6,
              depth,
            }
          : roll < 0.93
            ? { kind: "vertebra", x, y, s, angle, depth }
            : { kind: "rag", x, y, s, angle: rand() * Math.PI, depth };
    if (inside(piece)) pieces.push(piece);
  }
  for (const [x, y, s] of SKULLS)
    pieces.push({
      kind: "skull",
      x,
      y,
      s,
      angle: (hash(x, y, SEED) - 0.5) * 0.6,
      depth: (y - PEAK_Y) / (BASE_Y - PEAK_Y),
    });
  // back to front: the heap's far slope first, its foot last
  return pieces.sort((a, b) => a.y - b.y);
}

/** Whether a piece lies wholly on the texture, so none is cut off at its edge. */
function inside(piece: Piece): boolean {
  const reach =
    piece.kind === "long"
      ? piece.len / 2 + piece.thick
      : piece.kind === "rib"
        ? piece.r
        : 24 * piece.s;
  const across =
    piece.kind === "long"
      ? (Math.abs(Math.cos(piece.angle)) * piece.len) / 2 + piece.thick
      : reach;
  const down =
    piece.kind === "long"
      ? (Math.abs(Math.sin(piece.angle)) * piece.len) / 2 + piece.thick
      : reach;
  return (
    piece.x - across >= 4 &&
    piece.x + across <= BODY_W - 4 &&
    piece.y + down <= BODY_H - 10
  );
}

function paintHeap(b: CanvasRenderingContext2D, W: number, H: number) {
  // the ground it lies on, and the soot in the gaps between bones, both feathered
  const ground = new Path2D();
  ground.ellipse(W / 2, BASE_Y - 2, HALF_W - 10, 12, 0, 0, Math.PI * 2);
  feathered(b, ground, rgba(palette.inkDeep, 0.6), 10);
  const mound = new Path2D();
  const from = W / 2 - SOOT_HALF;
  mound.moveTo(from, BASE_Y - 10);
  for (let x = from; x <= W / 2 + SOOT_HALF; x += 4)
    mound.lineTo(x, crest(x, SOOT_HALF) + 18);
  mound.quadraticCurveTo(W / 2, BASE_Y, from, BASE_Y - 10);
  feathered(b, mound, rgba(palette.boneHeapSoot, 1), 14);

  for (const piece of layout()) {
    const bone = boneTone(piece.depth);
    b.save();
    b.translate(piece.x, piece.y);
    b.rotate(piece.angle);
    // each piece casts onto what lies under it
    b.shadowColor = rgba(palette.inkDeep, 0.7);
    b.shadowBlur = 6;
    b.shadowOffsetY = 2;
    switch (piece.kind) {
      case "long":
        longBone(b, piece.len, piece.thick, bone);
        break;
      case "rib":
        rib(b, piece.r, piece.r * 0.3, bone);
        break;
      case "vertebra":
        vertebra(b, piece.s, bone);
        break;
      case "skull":
        skull(b, piece.s * 1.15, bone);
        break;
      case "rag":
        rag(b, piece.s);
        break;
    }
    b.restore();
  }

  // weathering, then the heap darkening into its own hollows and toward its foot, and the hollow
  // in its crown where the plunder has settled, so what lies there reads against the bone
  grain(b, W, H, SEED + 2, 0.3);
  b.save();
  b.globalCompositeOperation = "source-atop";
  const hollow = b.createRadialGradient(W / 2, 186, 20, W / 2, 186, 150);
  hollow.addColorStop(0, rgba(palette.inkDeep, 0.5));
  hollow.addColorStop(1, rgba(palette.inkDeep, 0));
  b.fillStyle = hollow;
  b.fillRect(0, 0, W, H);
  const dusk = b.createRadialGradient(W / 2, 130, 40, W / 2, 170, 230);
  dusk.addColorStop(0, rgba(palette.inkDeep, 0));
  dusk.addColorStop(1, rgba(palette.inkDeep, 0.6));
  b.fillStyle = dusk;
  b.fillRect(0, 0, W, H);
  b.restore();
}

/**
 * Fills a shape as a soft-edged mass: only its blurred shadow lands on the texture, the shape
 * itself drawn well off it. `shadowBlur` is honoured by every canvas, where `filter` is not.
 */
function feathered(
  b: CanvasRenderingContext2D,
  path: Path2D,
  color: string,
  blur: number,
) {
  const away = 2000;
  b.save();
  b.shadowColor = color;
  b.shadowBlur = blur;
  b.shadowOffsetX = away;
  b.translate(-away, 0);
  b.fillStyle = color;
  b.fill(path);
  b.restore();
}

/** Bone further up the heap sits deeper in the gloom. */
function boneTone(depth: number): number {
  return mix(
    palette.dropPileBoneShade,
    palette.dropPileBone,
    0.35 + 0.65 * depth,
  );
}

/** Fills a piece lit from above: bright on its upper edge, shaded below, inked round. */
function lit(
  b: CanvasRenderingContext2D,
  path: Path2D,
  tone: number,
  half: number,
) {
  const g = b.createLinearGradient(0, -half, 0, half);
  g.addColorStop(0, rgba(tint(tone, 0.28), 1));
  g.addColorStop(0.45, rgba(tone, 1));
  g.addColorStop(1, rgba(shade(tone, 0.45), 1));
  b.fillStyle = g;
  b.fill(path);
  b.shadowColor = "transparent";
  b.lineWidth = 1.5;
  b.strokeStyle = rgba(palette.inkDeep, 0.75);
  b.stroke(path);
}

/** A thigh or arm bone: a shaft with a double knuckle at each end. */
function longBone(
  b: CanvasRenderingContext2D,
  len: number,
  thick: number,
  tone: number,
) {
  const p = new Path2D();
  const h = len / 2;
  const t = thick / 2;
  p.moveTo(-h + t, -t * 0.8);
  p.quadraticCurveTo(0, -t * 0.45, h - t, -t * 0.8);
  p.arc(h - t * 0.4, -t * 0.75, t * 0.85, Math.PI, Math.PI * 2.2);
  p.arc(h - t * 0.4, t * 0.75, t * 0.85, -Math.PI * 0.2, Math.PI);
  p.lineTo(h - t, t * 0.8);
  p.quadraticCurveTo(0, t * 0.45, -h + t, t * 0.8);
  p.arc(-h + t * 0.4, t * 0.75, t * 0.85, 0, Math.PI * 1.2);
  p.arc(-h + t * 0.4, -t * 0.75, t * 0.85, Math.PI * 0.8, Math.PI * 2);
  p.closePath();
  lit(b, p, tone, t * 1.6);
  // a hairline crack along the shaft
  b.strokeStyle = rgba(palette.inkDeep, 0.35);
  b.lineWidth = 1;
  b.beginPath();
  b.moveTo(-h * 0.4, -t * 0.1);
  b.lineTo(h * 0.1, t * 0.15);
  b.stroke();
}

/** A rib: a thin curved blade of bone. */
function rib(b: CanvasRenderingContext2D, r: number, w: number, tone: number) {
  const p = new Path2D();
  p.arc(0, 0, r, Math.PI * 1.05, Math.PI * 1.85);
  p.arc(0, 0, r - w, Math.PI * 1.85, Math.PI * 1.05, true);
  p.closePath();
  b.translate(0, r * 0.6);
  lit(b, p, tone, r);
}

/** A vertebra: a round body and its spurs. */
function vertebra(b: CanvasRenderingContext2D, s: number, tone: number) {
  const p = new Path2D();
  p.ellipse(0, 0, 9 * s, 7 * s, 0, 0, Math.PI * 2);
  p.moveTo(-8 * s, -2 * s);
  p.lineTo(-17 * s, -5 * s);
  p.lineTo(-16 * s, 1 * s);
  p.lineTo(-8 * s, 2 * s);
  p.moveTo(8 * s, -2 * s);
  p.lineTo(17 * s, -5 * s);
  p.lineTo(16 * s, 1 * s);
  p.lineTo(8 * s, 2 * s);
  lit(b, p, tone, 8 * s);
  b.fillStyle = rgba(palette.inkDeep, 0.6);
  b.beginPath();
  b.arc(0, -1 * s, 2.5 * s, 0, Math.PI * 2);
  b.fill();
}

/** A skull facing out of the heap: dome, cheekbones, sockets, the nose's hollow and teeth. */
function skull(b: CanvasRenderingContext2D, s: number, tone: number) {
  const p = new Path2D();
  p.arc(0, -6 * s, 21 * s, Math.PI * 0.82, Math.PI * 2.18);
  p.lineTo(15 * s, 12 * s);
  p.quadraticCurveTo(12 * s, 22 * s, 0, 23 * s);
  p.quadraticCurveTo(-12 * s, 22 * s, -15 * s, 12 * s);
  p.closePath();
  lit(b, p, tint(tone, 0.06), 24 * s);
  const hollow = rgba(palette.boneHeapSoot, 1);
  b.fillStyle = hollow;
  for (const dir of [-1, 1]) {
    b.beginPath();
    b.ellipse(dir * 8 * s, 2 * s, 6.5 * s, 5.5 * s, dir * 0.25, 0, Math.PI * 2);
    b.fill();
  }
  b.beginPath();
  b.moveTo(0, 7 * s);
  b.lineTo(3 * s, 13 * s);
  b.lineTo(-3 * s, 13 * s);
  b.closePath();
  b.fill();
  // the upper teeth, a dark line between each
  b.strokeStyle = rgba(palette.inkDeep, 0.7);
  b.lineWidth = Math.max(1, s);
  b.beginPath();
  b.moveTo(-8 * s, 17 * s);
  b.lineTo(8 * s, 17 * s);
  for (let i = -3; i <= 3; i++) {
    b.moveTo(i * 2.4 * s, 15 * s);
    b.lineTo(i * 2.4 * s, 20 * s);
  }
  b.stroke();
  // light caught on the brow
  b.fillStyle = rgba(tint(tone, 0.5), 0.35);
  b.beginPath();
  b.ellipse(-6 * s, -17 * s, 7 * s, 3.5 * s, -0.3, 0, Math.PI * 2);
  b.fill();
}

/** A scrap of grave rag caught among the bones. */
function rag(b: CanvasRenderingContext2D, s: number) {
  const pts: Pt[] = [
    [-20, -6],
    [-4, -11],
    [14, -8],
    [22, 2],
    [10, 9],
    [-6, 7],
    [-18, 10],
  ];
  const p = new Path2D();
  p.moveTo(pts[0][0] * s, pts[0][1] * s);
  for (const [x, y] of pts.slice(1)) p.lineTo(x * s, y * s);
  p.closePath();
  b.fillStyle = rgba(shade(palette.dropPileRag, 0.25), 1);
  b.fill(p);
  b.shadowColor = "transparent";
  b.strokeStyle = rgba(palette.inkDeep, 0.6);
  b.lineWidth = 1;
  b.stroke(p);
}

/** A small seeded generator, so the heap never reshuffles between clients. */
function seeded(seed: number): () => number {
  let i = 0;
  return () => hash(i++, 7, seed);
}
