import type Phaser from "phaser";
import { HudCorner } from "./HudCorner";
import { GameUiBridge, lendUiBridge, uiBridgeOf, type World, type WorldSide } from "./uiBridge";
import { UiCornerRow } from "./uiSceneCorner";

/** A world scene as the corner row's tests reach it: its game's registry and what it reports. */
interface RowWorld {
  registry?: { get(key: string): unknown; set(key: string, value: unknown): void };
  worldSide(): WorldSide;
}

/**
 * Test-only: the UI scene's corner row for `scene`'s world (FS-TQZ5J R13), built as the UI scene
 * builds it, on `scene`'s own stage so a test finds its plates where it found the world's: its presses
 * reach the world as requests through the game's UI bridge (R11, R14). Where the world's game was
 * lent no bridge yet (no `hearWorld`), lends one and reports `world` with the world's own side, as
 * create reports it.
 */
export function cornerRowOn(scene: object, world: World): UiCornerRow {
  const s = scene as RowWorld;
  let bridge = uiBridgeOf(s.registry);
  if (!bridge) {
    const held = new Map<string, unknown>();
    s.registry ??= { get: (key) => held.get(key), set: (key, value) => void held.set(key, value) };
    const lent = new GameUiBridge();
    lendUiBridge(s.registry, lent);
    lent.report({ world, ...s.worldSide() });
    bridge = lent;
  }
  const row = new UiCornerRow(bridge, (icons) => new HudCorner(scene as Phaser.Scene, { icons }));
  row.show(bridge.world);
  return row;
}
