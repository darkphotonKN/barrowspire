import * as Phaser from "phaser";
import { palette, rgba } from "@/utils/canvasPalette";
import {
  DUST_DEPTH,
  VIGNETTE_DEPTH,
  VIGNETTE_INNER,
  VIGNETTE_OUTER,
  VIGNETTE_STOPS,
} from "@/render/lighting/vignette";
import { relayoutOn, viewport } from "@/render/viewport";

/**
 * The static layers every world keeps above its light-map: darkness pressing in
 * at the edges, and dust adrift in it.
 *
 * The warm pool the player carries is no longer drawn here: it is a light source
 * on the light-map (`src/render/lighting/`, FS-2325V §C.7), which replaced
 * FS-W6BP1's overlay pool. The vignette stays, above the light-map and below the
 * HUD (§C.10).
 *
 * Presentation only. Every layer is camera-fixed and sits below the HUD; nothing
 * here reads or writes game state, and suppressing all of it must leave a world
 * still playable.
 */

const DUST_MOTES = 18;

/**
 * Builds the vignette and the dust into a scene, over the whole logical view, and builds them
 * again for the new view each time it changes while the scene runs (FS-ZAJMH R13).
 */
export function createAtmosphere(scene: Phaser.Scene): void {
  let layers = build(scene);
  relayoutOn(scene, () => {
    scene.tweens.killTweensOf(layers);
    layers.forEach((layer) => layer.destroy());
    layers = build(scene);
  });
}

function build(scene: Phaser.Scene): Phaser.GameObjects.GameObject[] {
  return [
    addVignette(scene, viewport.width, viewport.height),
    ...addDust(scene, viewport.width, viewport.height),
  ];
}

/** The vignette's one texture: painted at the current view's size, and again when it changes. */
const VIGNETTE_TEXTURE = "atmoVignette";

/** Whether `key` holds a texture painted at `w` × `h`. */
function paintedAt(scene: Phaser.Scene, key: string, w: number, h: number): boolean {
  if (!scene.textures.exists(key)) return false;
  const source = scene.textures.get(key).getSourceImage();
  return source.width === w && source.height === h;
}

function addVignette(
  scene: Phaser.Scene,
  w: number,
  h: number,
): Phaser.GameObjects.Image {
  const key = VIGNETTE_TEXTURE;

  if (!paintedAt(scene, key, w, h)) {
    // one texture, painted again for each new size: a key per size would keep every width the
    // view ever settled at (≈3.7 MB of canvas each at 1280×720)
    if (scene.textures.exists(key)) scene.textures.remove(key);
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
  return vignette;
}

function addDust(
  scene: Phaser.Scene,
  w: number,
  h: number,
): Phaser.GameObjects.Arc[] {
  const motes: Phaser.GameObjects.Arc[] = [];
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
    motes.push(mote);
  }
  return motes;
}
