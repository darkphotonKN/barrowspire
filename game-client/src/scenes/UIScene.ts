import * as Phaser from "phaser";
import { UI_SCENE } from "@/components/uiSceneLifecycle";
import { browserSfxStore } from "@/audio/sfxSetting";
import { letGoOfGameField } from "@/components/gameFocus";
import { sceneUiSoundStage } from "@/audio/uiSounds";
import { relayoutOn } from "@/render/viewport";
import { HudCorner } from "@/ui/HudCorner";
import { uiBridgeOf, type UiBridge } from "@/ui/uiBridge";
import { UiCornerRow } from "@/ui/uiSceneCorner";
import { UiScenePointer } from "@/ui/uiScenePointer";
import { mountInterfaceSounds } from "@/ui/uiSceneSounds";
import { onSceneEnd } from "./sceneEnd";

/**
 * The UI scene (FS-TQZ5J §A, ADR-0081): the one scene drawn over every world scene and under the
 * disconnect notice, holding the interface the worlds share. In the game's scene list after the
 * world scenes, so it is drawn over them and Phaser hands it a press first (R1, R7). Its life is the
 * worlds' reports through the UI bridge (`uiSceneLifecycle.ts`): launched on the first world entry,
 * never restarted by a switch, asleep outside the worlds, held under the notice (R2–R5). The game's
 * ViewportFit fits its camera and `fitGame` re-fits it, as every scene's (R6).
 *
 * The interface moves in piece by piece (FS-TQZ5J § Phases). It holds the game's interface sounds
 * (R22) and the corner row, built for each world as it reports itself (R13). Its pointer stands beside
 * the worlds' as Amendment A1 says, for every piece it holds: a world's press stays the world's, a
 * press on a piece lets go of the game's text field, and every move reaches the world (R25–R27).
 *
 * A RESUME is not always a return to play. Return to menu under the disconnect notice resumes this
 * scene only to sleep it, Phaser's sleep taking a running scene only (`driveUiScene`'s hide), so it
 * hears RESUME then SLEEP back to back with no world up. A RESUME listener must not take it for the
 * world coming back: WAKE, with the next world's report, is that.
 */
export class UIScene extends Phaser.Scene {
  private corner?: UiCornerRow;
  private pointer?: UiScenePointer<Phaser.Input.Pointer>;

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
    if (!bridge) return;
    mountInterfaceSounds(bridge, sceneUiSoundStage(this), browserSfxStore);
    this.mountCorner(bridge);
    this.mountPointer(bridge);
  }

  /**
   * Each frame while it runs: the row held while the world reports its own ESC menu open (I-TQZ5J-3),
   * and a world's press whose release it never heard let go of (A1 R25).
   */
  update(): void {
    this.corner?.sync();
    this.pointer?.frame();
  }

  /**
   * Its pointer beside the worlds' (A1 R25–R27), told its own scene-wide events as Phaser emits them
   * here, before any world hears the event: the world reported is handed a move Phaser stopped here,
   * and the game's text field is let go of inside the canvas's holder. Phaser drops a scene's input
   * listeners as it shuts down.
   */
  private mountPointer(bridge: UiBridge): void {
    const input = this.input;
    if (!input) return;
    const pointer = new UiScenePointer<Phaser.Input.Pointer>({
      cameras: () => this.cameras.cameras,
      anyDown: () => input.manager.pointers.some((p) => p.isDown),
      world: bridge,
      letGo: () => letGoOfGameField(this.game.canvas?.parentElement, document),
    });
    this.pointer = pointer;
    input.on("pointerdown", (_p: Phaser.Input.Pointer, over: unknown[]) => pointer.pressed(over));
    input.on("pointerup", () => pointer.released());
    input.on("pointerupoutside", () => pointer.released());
    input.on("pointermove", (p: Phaser.Input.Pointer, over: unknown[]) => pointer.moved(p, over));
    input.on("pointerout", (p: Phaser.Input.Pointer) => pointer.left(p));
  }

  /**
   * The corner row (R13): the row of the world reported as this scene is created (the first world's,
   * whose report launched it), and each later world's on its report; taken down as a world leaves and
   * with the game, when it stops hearing the worlds (R4). Its knockouts follow the render scale
   * themselves; a new logical view stands it in the new corner.
   */
  private mountCorner(bridge: UiBridge): void {
    const corner = new UiCornerRow(bridge, (icons) => new HudCorner(this, { icons }));
    this.corner = corner;
    corner.show(bridge.world);
    const stop = bridge.onWorld((report) => corner.show(report));
    relayoutOn(this, () => corner.relayout());
    onSceneEnd(this, () => {
      stop();
      corner.destroy();
      this.corner = undefined;
    });
  }
}
