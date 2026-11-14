import type { World } from "./uiBridge";
import type { UiCornerRow } from "./uiSceneCorner";
import { uiSceneOn } from "./uiSceneMenu.standin";

/**
 * Test-only: the UI scene's corner row for `scene`'s world (FS-TQZ5J R13), built as the UI scene
 * builds it, on `scene`'s own stage so a test finds its plates where it found the world's: its window
 * icons reach the world as requests through the game's UI bridge (R11, R14), its Menu the UI scene's
 * menu slot, drawn on the same stage (R16). Where the world's game was lent no bridge yet, lends one
 * and reports `world` as create reports it (`uiSceneOn`).
 */
export function cornerRowOn(scene: object, world: World): UiCornerRow {
  return uiSceneOn(scene, world).row!;
}
