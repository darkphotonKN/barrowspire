/**
 * The run's controls panel, built on the UI scene (FS-TQZ5J § Change: Phase 3, R50, R51, R59, R61): drawn
 * as the run drew it at the view's centre, the active character's ability named (the game store's
 * active character, app state the piece reads itself, ADR-0082 D3), with a ground over its rect at its
 * depth; back to the centre on a new view, its text rasterised again. `uiSceneRecord.ts` holds the
 * slot that opens and closes it; `controlsPanel.ts` its drawing; this is the building.
 */

import type Phaser from "phaser";
import { crispen, viewport } from "@/render/viewport";
import { useGameStore } from "@/stores/gameStore";
import { CONTROLS_PANEL_DEPTH, controlRows, controlsPanelRect, drawControlsPanel } from "./controlsPanel";
import { uiGround } from "./uiGround";
import type { ControlsPiece } from "./uiSceneRecord";

/** The controls panel on `scene`, at the view's centre, with its ground. */
export function mountControlsPiece(scene: Phaser.Scene): ControlsPiece {
  const className = (useGameStore.getState().getActiveCharacter()?.className || "warrior").toLowerCase();
  const centre = () => ({ x: viewport.centerX, y: viewport.centerY });
  const panel = drawControlsPanel(scene, centre(), className);
  const rows = controlRows(className).length;
  const ground = uiGround(scene, CONTROLS_PANEL_DEPTH);
  let hit = ground(controlsPanelRect(centre(), rows));
  return {
    relayout: () => {
      panel.setPosition(viewport.centerX, viewport.centerY);
      crispen([panel]);
      hit.destroy();
      hit = ground(controlsPanelRect(centre(), rows));
    },
    destroy: () => {
      panel.destroy();
      hit.destroy();
    },
  };
}
