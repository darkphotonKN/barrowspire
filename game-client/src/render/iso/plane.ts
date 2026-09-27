import Phaser from "phaser";
import { PLANE_TRANSFORM } from "./projection";

/**
 * A flat layer that draws in world coordinates and shows up on the isometric
 * diamond: two nested containers carrying `PLANE_TRANSFORM` (rotate, then squash).
 *
 * For things that lie in a plane (ground, floors, roofs seen from above, a door
 * slab), so their existing world-coordinate drawing code needs no per-point
 * projection. Upright things (characters, props) are not planes: they are placed
 * at `worldToScreen` of their footprint instead and stay unskewed.
 *
 * `root` is what the scene sorts and hides (depth, visibility); `surface` is where
 * children go. `lift` raises the plane that many screen px off the ground.
 */
export interface WorldPlane {
  root: Phaser.GameObjects.Container;
  surface: Phaser.GameObjects.Container;
}

export function addWorldPlane(scene: Phaser.Scene, lift = 0): WorldPlane {
  const surface = scene.add.container(0, 0);
  surface.setRotation(PLANE_TRANSFORM.rotation);

  const root = scene.add.container(0, -lift, [surface]);
  root.setScale(PLANE_TRANSFORM.scaleX, PLANE_TRANSFORM.scaleY);

  return { root, surface };
}
