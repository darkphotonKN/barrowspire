/**
 * The run's controls panel, built on the UI scene (FS-TQZ5J § Change: Phase 3, R50, R51, R59, R61): drawn
 * as the run drew it at the view's centre, the active character's ability named (the game store's
 * active character, app state the piece reads itself, ADR-0082 D3), with a ground over its rect at its
 * depth; back to the centre on a new view, its text rasterised again. `uiSceneRecord.ts` holds the
 * slot that opens and closes it; `controlsPanel.ts` its drawing; this is the building.
 *
 * Its × (FS-84N1G R14): a hit over the × box, made after the ground at the same depth so Phaser hands
 * it the press there, lit under the pointer and closing on the release, as the party panel's × does
 * (on the press the panel still claims it, FS-R82NV R28). Hit areas stand outside the container, as
 * the settlement record's do; no cursor of its own.
 */

import type Phaser from "phaser";
import { crispen, viewport } from "@/render/viewport";
import { useGameStore } from "@/stores/gameStore";
import { CONTROLS_PANEL_DEPTH, controlRows, controlsPanelRect, drawControlsPanel } from "./controlsPanel";
import { lightClose } from "./panelFrame";
import { uiGround } from "./uiGround";
import type { ControlsPiece } from "./uiSceneRecord";

/** The controls panel on `scene`, at the view's centre, with its ground and its ×, which calls `onClose`. */
export function mountControlsPiece(scene: Phaser.Scene, onClose: () => void): ControlsPiece {
  const className = (useGameStore.getState().getActiveCharacter()?.className || "warrior").toLowerCase();
  const centre = () => ({ x: viewport.centerX, y: viewport.centerY });
  const { container, close, glyph } = drawControlsPanel(scene, centre(), className);
  const rows = controlRows(className).length;
  const ground = uiGround(scene, CONTROLS_PANEL_DEPTH);
  /** The ground, then the × over it: at an equal depth Phaser hands a press to the later object. */
  const stand = () => {
    const at = centre();
    const under = ground(controlsPanelRect(at, rows));
    const hit = scene.add
      .zone(at.x + close.x, at.y + close.y, close.width, close.height)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(CONTROLS_PANEL_DEPTH)
      .setInteractive()
      .on("pointerover", () => lightClose(glyph, true))
      .on("pointerout", () => lightClose(glyph, false))
      .on("pointerup", () => onClose());
    return { under, hit };
  };
  let stood = stand();
  const takeDown = () => {
    stood.under.destroy();
    stood.hit.destroy();
  };
  return {
    relayout: () => {
      container.setPosition(viewport.centerX, viewport.centerY);
      crispen([container]);
      takeDown();
      stood = stand();
    },
    destroy: () => {
      container.destroy();
      takeDown();
    },
  };
}
