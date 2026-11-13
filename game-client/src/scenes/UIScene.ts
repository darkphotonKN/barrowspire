import * as Phaser from "phaser";
import { UI_SCENE } from "@/components/uiSceneLifecycle";
import { browserSfxStore } from "@/audio/sfxSetting";
import { sceneUiSoundStage } from "@/audio/uiSounds";
import { uiBridgeOf } from "@/ui/uiBridge";
import { mountInterfaceSounds } from "@/ui/uiSceneSounds";

/**
 * The UI scene (FS-TQZ5J §A, ADR-0081): the one scene drawn over every world scene and under the
 * disconnect notice, holding the interface the worlds share. In the game's scene list after the
 * world scenes, so it is drawn over them and Phaser hands it a press first (R1, R7). Its life is the
 * worlds' reports through the UI bridge (`uiSceneLifecycle.ts`): launched on the first world entry,
 * never restarted by a switch, asleep outside the worlds, held under the notice (R2–R5). The game's
 * ViewportFit fits its camera and `fitGame` re-fits it, as every scene's (R6).
 *
 * It draws nothing yet: the interface moves in piece by piece (FS-TQZ5J § Phases). It holds the
 * game's interface sounds (R22).
 *
 * A RESUME is not always a return to play. Return to menu under the disconnect notice resumes this
 * scene only to sleep it, Phaser's sleep taking a running scene only (`driveUiScene`'s hide), so it
 * hears RESUME then SLEEP back to back with no world up. A RESUME listener must not take it for the
 * world coming back: WAKE, with the next world's report, is that.
 */
export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: UI_SCENE });
  }

  /**
   * The game's one interface sound player, lent to its game's UI bridge (R22). The first world's
   * report launches this scene, and Phaser's start of a scene with no preload runs its create at
   * once (`SceneManager.start` → `bootScene` → `create`), so the player is lent inside that world's
   * create, before anything there hears a player. A sleep keeps it: the game's sound manager plays it.
   */
  create(): void {
    const bridge = uiBridgeOf(this.registry);
    if (bridge) mountInterfaceSounds(bridge, sceneUiSoundStage(this), browserSfxStore);
  }
}
