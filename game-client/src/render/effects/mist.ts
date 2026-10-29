/**
 * A forest's low mist (FS-3QHQZ §Requirements 27): slow banks of haze drifting over the ground. A
 * camera-relative presentation overlay: one screen-sized tiling layer whose texture is scrolled
 * with the camera, so the banks lie on the ground, and drifted by the clock. It sits just above
 * the ground and below everything standing on it, so it never veils a monster, a player or a
 * marker; it is lit by the light-map like the ground it lies on. Under `prefers-reduced-motion`
 * it holds still: a static haze.
 *
 * Never coupled to game state. The banks are a hash of a seed, never `Math.random`; the Phaser
 * side is `addMist`, and needs only the scene it is given.
 */

import type Phaser from "phaser";
import type { Point } from "@/render/iso/projection";
import { rgba } from "@/utils/canvasPalette";
import { tileHash } from "@/render/world/ground";

/** How a field's mist looks. */
export interface MistLook {
  /** The haze's colour, from a `BARROW_HEX` token. */
  color: number;
  /** The whole layer's opacity, 0..1; each bank is fainter at its rim. */
  alpha: number;
  /** How fast the banks drift, screen px per second. */
  drift: Point;
}

/** Just above the ground (`GROUND_DEPTH`, -1) and below the world band every standing thing sorts in. */
export const MIST_DEPTH = -0.5;
/** The banks lie on the ground: they scroll with it. */
export const MIST_PARALLAX = 1;
/** The texture's tile, screen px: wider than tall, as the ground is in projection. */
export const MIST_TILE = { width: 768, height: 384 } as const;

/** One bank of haze in the tile: an ellipse, densest at its centre. */
export interface MistPuff {
  x: number;
  y: number;
  rx: number;
  ry: number;
  alpha: number;
}

const BANKS = 14;

/** The tile's banks: low, wide ellipses, the same on every client for a seed. */
export function planMist(seed: number): MistPuff[] {
  return [...Array(BANKS).keys()].map((i) => {
    const h = tileHash(i, 0x4d49, seed);
    const k = tileHash(i, 0x5354, seed);
    const unit = (bits: number) => (bits & 0xff) / 0x100;
    return {
      x: unit(h) * MIST_TILE.width,
      y: unit(h >>> 8) * MIST_TILE.height,
      rx: 110 + unit(h >>> 16) * 150,
      ry: 26 + unit(h >>> 24) * 40,
      alpha: 0.35 + unit(k) * 0.55,
    };
  });
}

/** Where the tile is scrolled to: with the camera, and drifting on the clock unless held still. */
export function mistOffset(
  look: MistLook,
  scroll: Point,
  timeMs: number,
  reduced: boolean,
): Point {
  const t = reduced ? 0 : timeMs / 1000;
  return {
    x: scroll.x * MIST_PARALLAX - look.drift.x * t,
    y: scroll.y * MIST_PARALLAX - look.drift.y * t,
  };
}

/** Whether the player asked for less motion; without a media query, motion is allowed. */
export function prefersReducedMotion(
  query: ((q: string) => MediaQueryList) | undefined = typeof window !==
  "undefined"
    ? window.matchMedia?.bind(window)
    : undefined,
): boolean {
  return query?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Paints the tile's banks, each repeated across the tile's seams so the texture wraps. */
function paintMist(look: MistLook, seed: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = MIST_TILE.width;
  canvas.height = MIST_TILE.height;
  const g = canvas.getContext("2d")!;
  for (const p of planMist(seed))
    for (const dx of [-MIST_TILE.width, 0, MIST_TILE.width])
      for (const dy of [-MIST_TILE.height, 0, MIST_TILE.height]) {
        g.save();
        g.translate(p.x + dx, p.y + dy);
        g.scale(1, p.ry / p.rx);
        const bank = g.createRadialGradient(0, 0, 0, 0, 0, p.rx);
        bank.addColorStop(0, rgba(look.color, p.alpha));
        bank.addColorStop(0.55, rgba(look.color, p.alpha * 0.45));
        bank.addColorStop(1, rgba(look.color, 0));
        g.fillStyle = bank;
        g.fillRect(-p.rx, -p.rx, 2 * p.rx, 2 * p.rx);
        g.restore();
      }
  return canvas;
}

/**
 * The mist over a scene's ground, following its main camera. Taken away with the scene: its
 * update listener is dropped on shutdown.
 */
export function addMist(
  scene: Phaser.Scene,
  look: MistLook,
  seed: number,
): Phaser.GameObjects.TileSprite {
  const key = `mist_${seed}_${look.color}`;
  if (!scene.textures.exists(key))
    scene.textures.addCanvas(key, paintMist(look, seed));
  const cam = scene.cameras.main;
  const layer = scene.add
    .tileSprite(0, 0, cam.width, cam.height, key)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(MIST_DEPTH)
    .setAlpha(look.alpha);
  const reduced = prefersReducedMotion();
  const follow = (time: number) => {
    const at = mistOffset(
      look,
      { x: cam.scrollX, y: cam.scrollY },
      time,
      reduced,
    );
    layer.setTilePosition(at.x, at.y);
  };
  scene.events.on("update", follow);
  scene.events.once("shutdown", () => scene.events.off("update", follow));
  return layer;
}
