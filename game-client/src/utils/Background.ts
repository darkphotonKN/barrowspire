import Phaser from "phaser";

/**
 * Barrow dust. Replaces the old starfield — faint motes of dust and stray
 * embers drifting in the torch-dark, drawn at low opacity for depth.
 * Presentation only; same signature so callers are unaffected.
 */
export function createStarfield(
  scene: Phaser.Scene,
  starCount: number = 200,
): void {
  const width = scene.cameras.main.width;
  const height = scene.cameras.main.height;

  // dust mote palette — cold ash with the occasional warm ember
  const motes = [0x8a7d5c, 0x52555c, 0x5a4632];

  for (let i = 0; i < starCount; i++) {
    const x = Phaser.Math.Between(0, width);
    const y = Phaser.Math.Between(0, height);
    const size = Phaser.Math.Between(1, 2);
    const ember = Math.random() < 0.08;
    const color = ember ? 0xc2611f : motes[Phaser.Math.Between(0, motes.length - 1)];
    const alpha = ember
      ? Phaser.Math.FloatBetween(0.25, 0.5)
      : Phaser.Math.FloatBetween(0.05, 0.2);
    const mote = scene.add.circle(x, y, size, color, alpha);
    mote.setDepth(10);
  }
}
