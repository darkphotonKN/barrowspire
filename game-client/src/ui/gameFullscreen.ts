/**
 * The game frame's fullscreen, lent to the game (FS-T3DWX R12). The frame and the document belong
 * to the page (`PhaserGame`), the Fullscreen row to the OPTIONS panel inside the game: the page
 * puts the frame's control in its game's registry as it builds the game, and a scene reads it from
 * its own registry as it opens the panel. Per game, never a module-level holder, so a destroyed
 * game takes its control with it.
 */

import type { FullscreenControl } from "./optionsPanel";

/** A game's registry, as far as the loan goes. Phaser's `game.registry` (a `DataManager`) is one. */
export interface GameRegistry {
  get(key: string): unknown;
  set(key: string, value: unknown): unknown;
}

const FULLSCREEN_KEY = "fullscreen";

/** Lends the game `control`, or none where the page has no fullscreen to offer (FS-T3DWX R7). */
export function lendFullscreen(registry: Pick<GameRegistry, "set">, control: FullscreenControl | null): void {
  registry.set(FULLSCREEN_KEY, control);
}

/** The fullscreen the page lent this scene's game, or none: none offered, none lent, no game. */
export function lentFullscreen(registry: Pick<GameRegistry, "get"> | undefined): FullscreenControl | null {
  return (registry?.get(FULLSCREEN_KEY) as FullscreenControl | null | undefined) ?? null;
}
