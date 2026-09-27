import Phaser from "phaser";
import { palette, rgba } from "@/utils/canvasPalette";
import {
  DUST_DEPTH,
  VIGNETTE_DEPTH,
  VIGNETTE_INNER,
  VIGNETTE_OUTER,
  VIGNETTE_STOPS,
} from "@/render/lighting/vignette";

/**
 * The static layers every world keeps above its light-map: darkness pressing in
 * at the edges, and dust adrift in it.
 *
 * The warm pool the delver carries is no longer drawn here: it is a light source
 * on the light-map (`src/render/lighting/`, FS-2325V §C.7), which replaced
 * FS-W6BP1's overlay pool. The vignette stays, above the light-map and below the
 * HUD (§C.10).
 *
 * Presentation only. Every layer is camera-fixed and sits below the HUD; nothing
 * here reads or writes game state, and suppressing all of it must leave a world
 * still playable.
 */

const DUST_MOTES = 18;

/** Builds the vignette and the dust into a scene. */
export function createAtmosphere(scene: Phaser.Scene): void {
  const cam = scene.cameras.main;
  addVignette(scene, cam.width, cam.height);
  addDust(scene, cam.width, cam.height);
}

function addVignette(scene: Phaser.Scene, w: number, h: number): void {
  const key = `atmoVignette_${w}x${h}`;

  if (!scene.textures.exists(key)) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d")!;
    const grad = g.createRadialGradient(
      w / 2, h / 2, Math.min(w, h) * VIGNETTE_INNER,
      w / 2, h / 2, Math.max(w, h) * VIGNETTE_OUTER,
    );
    // Readability floor (FS-2325V §C.9): hostile markers draw above this layer and
    // are tested against the ground it leaves at the canvas edge, so the edge may
    // stay dark. If play shows the vignette hiding anyone, THESE numbers yield.
    for (const [at, alpha] of VIGNETTE_STOPS) grad.addColorStop(at, rgba(palette.inkDeep, alpha));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    scene.textures.addCanvas(key, canvas);
  }

  const vignette = scene.add.image(w / 2, h / 2, key);
  vignette.setScrollFactor(0);
  vignette.setDepth(VIGNETTE_DEPTH);
}

function addDust(scene: Phaser.Scene, w: number, h: number): void {
  for (let i = 0; i < DUST_MOTES; i++) {
    const mote = scene.add.circle(
      Phaser.Math.Between(0, w),
      Phaser.Math.Between(0, h),
      Math.random() < 0.2 ? 2 : 1,
      palette.hudLabel,
      Phaser.Math.FloatBetween(0.05, 0.16),
    );
    mote.setScrollFactor(0);
    mote.setDepth(DUST_DEPTH);

    scene.tweens.add({
      targets: mote,
      y: mote.y - Phaser.Math.Between(20, 60),
      x: mote.x + Phaser.Math.Between(-15, 15),
      alpha: 0,
      duration: Phaser.Math.Between(4000, 9000),
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }
}
