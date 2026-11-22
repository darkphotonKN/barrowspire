/**
 * The HUD pieces on the UI scene (FS-TQZ5J § Change: Batch 5, R67–R73): the real `AbilityBar` (FS-Q18Q3
 * R41), `ResourceHud` and `ProgressHud`, built on the scene they are handed; and the UI scene's HUD slot
 * mounted over its game's bridge, hearing the worlds' reports and their `hud` data, relaid out with the
 * scene's view and taken down with the scene.
 */

import type Phaser from "phaser";
import { relayoutOn } from "@/render/viewport";
import { onSceneEnd } from "@/scenes/sceneEnd";
import { AbilityBar } from "./AbilityBar";
import { ProgressHud } from "./ProgressHud";
import { ResourceHud } from "./ResourceHud";
import type { UiBridge } from "./uiBridge";
import { UiHudSlot, hearHud, type HudBuild } from "./uiSceneHud";

/** The pieces on `scene`. */
export function hudPieces(scene: Phaser.Scene): HudBuild {
  return {
    bar: () => new AbilityBar(scene),
    bars: (at) => new ResourceHud(scene, at.x, at.y),
    progress: () => new ProgressHud(scene),
  };
}

/**
 * The HUD slot on the UI scene (R67): its pieces from `build` (the UI scene's `hudPieces` on itself), for the
 * world reported now and each one after, fed what each hands through the bridge (`hearHud`), back to its
 * anchors on a new logical view, taken down with the scene (§ Change: Batch 6, R138).
 */
export function mountHud(scene: Phaser.Scene, bridge: UiBridge, build: HudBuild): UiHudSlot {
  const slot = new UiHudSlot(bridge, build);
  const stop = hearHud(slot, bridge);
  relayoutOn(scene, () => slot.relayout());
  onSceneEnd(scene, () => {
    stop();
    slot.destroy();
  });
  return slot;
}
