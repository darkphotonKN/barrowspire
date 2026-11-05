import * as Phaser from "phaser";
import { fitCamera } from "./camera";

/**
 * Fits every scene's main camera to the viewport as the scene starts, before its `init` and
 * `create` run (Phaser's READY follows the camera manager's START), so a scene's own bounds,
 * follow and layout already see the render scale. A scene plugin, so no scene has to remember
 * to call it. Re-fits on a render-scale change are `fitGame`'s.
 */
export class ViewportFit extends Phaser.Plugins.ScenePlugin {
  boot(): void {
    const events = this.systems!.events;
    events.on(Phaser.Scenes.Events.READY, this.fit, this);
    events.once(Phaser.Scenes.Events.DESTROY, () =>
      events.off(Phaser.Scenes.Events.READY, this.fit, this),
    );
  }

  private fit(): void {
    fitCamera(this.systems!.cameras.main);
  }
}

/** The plugin's entry in a game config's `plugins.scene`. */
export const VIEWPORT_FIT_PLUGIN = {
  key: "ViewportFit",
  plugin: ViewportFit,
  mapping: "viewportFit",
};
