import Phaser from "phaser";
import { palette, rgba } from "@/utils/canvasPalette";

/**
 * The lighting every world is lit by: a warm pool carried with the delver,
 * darkness pressing in at the edges, and dust adrift in it.
 *
 * `docs/design-guideline.md` requires both — "Heavy vignette (darkness pressing
 * at edges) + a warm torch pool" — so this is not decoration a scene may skip.
 *
 * Presentation only. Every layer is camera-fixed and sits below the HUD; nothing
 * here reads or writes game state, and suppressing all of it must leave a world
 * still playable.
 */

/** Depths: above the world, below the HUD at 1000. */
const TORCH_DEPTH = 900;
const DUST_DEPTH = 902;
const VIGNETTE_DEPTH = 905;

const DUST_MOTES = 18;

export interface Atmosphere {
  /** The pool, kept for scenes that move it off the camera centre. */
  torch: Phaser.GameObjects.Image;
}

/**
 * Builds the layers into a scene. Returns the torch so a caller can reposition
 * it — the camera lerps and clamps at map edges, so its centre is not the
 * delver's position while moving or against a wall.
 */
export function createAtmosphere(scene: Phaser.Scene): Atmosphere {
  const cam = scene.cameras.main;
  const w = cam.width;
  const h = cam.height;

  const torch = addTorchPool(scene, w, h);
  addVignette(scene, w, h);
  addDust(scene, w, h);

  return { torch };
}

function addTorchPool(scene: Phaser.Scene, w: number, h: number): Phaser.GameObjects.Image {
  const key = "atmoTorch";

  if (!scene.textures.exists(key)) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const g = canvas.getContext("2d")!;
    const grad = g.createRadialGradient(256, 256, 0, 256, 256, 256);
    grad.addColorStop(0, rgba(palette.torch, 0.22));
    grad.addColorStop(0.45, rgba(palette.ember, 0.1));
    grad.addColorStop(1, rgba(palette.inkDeep, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    scene.textures.addCanvas(key, canvas);
  }

  const torch = scene.add.image(w / 2, h / 2, key);
  const size = Math.max(w, h) * 1.5;
  torch.setDisplaySize(size, size);
  torch.setScrollFactor(0);
  torch.setDepth(TORCH_DEPTH);
  torch.setBlendMode(Phaser.BlendModes.ADD);

  scene.tweens.add({
    targets: torch,
    alpha: { from: 0.82, to: 1 },
    duration: 1500,
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut",
  });

  return torch;
}

function addVignette(scene: Phaser.Scene, w: number, h: number): void {
  const key = `atmoVignette_${w}x${h}`;

  if (!scene.textures.exists(key)) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d")!;
    const grad = g.createRadialGradient(
      w / 2, h / 2, Math.min(w, h) * 0.3,
      w / 2, h / 2, Math.max(w, h) * 0.72,
    );
    // Readability floor: an entity at the canvas edge must stay legible. If play
    // shows this hiding anyone, THIS is the number that yields, not the accent.
    grad.addColorStop(0, rgba(palette.inkDeep, 0));
    grad.addColorStop(0.7, rgba(palette.inkDeep, 0.5));
    grad.addColorStop(1, rgba(palette.inkDeep, 0.86));
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
