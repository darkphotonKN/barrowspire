import * as Phaser from "phaser";
import { UI_SCENE } from "@/components/uiSceneLifecycle";

/**
 * The UI scene (FS-TQZ5J §A, ADR-0081): the one scene drawn over every world scene and under the
 * disconnect notice, holding the interface the worlds share. In the game's scene list after the
 * world scenes, so it is drawn over them and Phaser hands it a press first (R1, R7). Its life is the
 * worlds' reports through the UI bridge (`uiSceneLifecycle.ts`): launched on the first world entry,
 * never restarted by a switch, asleep outside the worlds, held under the notice (R2–R5). The game's
 * ViewportFit fits its camera and `fitGame` re-fits it, as every scene's (R6).
 *
 * It stands empty until the interface moves in, piece by piece (FS-TQZ5J § Phases).
 */
export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: UI_SCENE });
  }
}
