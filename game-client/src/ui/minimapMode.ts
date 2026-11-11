/**
 * The minimap's modes (FS-1SEF0 §A): normal, enlarged and the map overlay, which M steps through in
 * that order, round again, with no off step. The mode is a per-browser convenience kept in
 * `localStorage`: every read and write is guarded, and anything not a mode, an older build's "off"
 * included, reads as normal.
 */

import type { KeyValueStore } from "@/characters/roster";

/** The modes, in M's order (§A.1, §A.2). */
export const MINIMAP_MODES = ["normal", "enlarged", "overlay"] as const;
export type MinimapMode = (typeof MINIMAP_MODES)[number];

/** Where this browser keeps the mode (§A.4). */
export const MINIMAP_MODE_KEY = "barrowspire_minimap_mode";

/** The mode after `mode` on M (§A.2). */
export function nextMinimapMode(mode: MinimapMode): MinimapMode {
  return MINIMAP_MODES[(MINIMAP_MODES.indexOf(mode) + 1) % MINIMAP_MODES.length];
}

/** The store, reached lazily: reaching `window.localStorage` may itself throw, and the server render has none. */
export type MinimapModeStore = () => KeyValueStore | null;

const isMode = (value: string | null): value is MinimapMode => MINIMAP_MODES.includes(value as MinimapMode);

/** The mode this browser kept, or normal where it kept none, kept something else, or cannot be read (§A.5). */
export function readMinimapMode(store: MinimapModeStore): MinimapMode {
  try {
    const held = store()?.getItem(MINIMAP_MODE_KEY) ?? null;
    return isMode(held) ? held : "normal";
  } catch {
    return "normal";
  }
}

/** Keeps `mode` in this browser; where storage refuses, nothing is kept and nothing throws (§A.5). */
export function rememberMinimapMode(store: MinimapModeStore, mode: MinimapMode): void {
  try {
    store()?.setItem(MINIMAP_MODE_KEY, mode);
  } catch {
    // a blocked or full store keeps nothing: the mode lives for this scene only
  }
}

/** This browser's `localStorage`, or none while Next renders on the server. */
export const browserMinimapStore: MinimapModeStore = () => (typeof window === "undefined" ? null : window.localStorage);
