/**
 * Whether the town's music plays (FS-28DDG R17): a per-browser choice kept in `localStorage`, never
 * sent to the server. Every read and write is guarded, as `ui/minimapMode.ts` does, and anything
 * absent, unknown or unreadable reads as on.
 */

import type { KeyValueStore } from "@/characters/roster";

/** On or off, as the ESC menu's row switches it (R15, R16). */
export type MusicSetting = "on" | "off";

/** Where this browser keeps it (R17). */
export const MUSIC_SETTING_KEY = "barrowspire_music";

/** The store, reached lazily: reaching `window.localStorage` may itself throw, and the server render has none. */
export type MusicSettingStore = () => KeyValueStore | null;

/** What this browser kept, or on where it kept nothing, kept something else, or cannot be read (R17). */
export function readMusicSetting(store: MusicSettingStore): MusicSetting {
  try {
    return store()?.getItem(MUSIC_SETTING_KEY) === "off" ? "off" : "on";
  } catch {
    return "on";
  }
}

/** Keeps `setting` in this browser; where storage refuses, nothing is kept and nothing throws (R17). */
export function rememberMusicSetting(store: MusicSettingStore, setting: MusicSetting): void {
  try {
    store()?.setItem(MUSIC_SETTING_KEY, setting);
  } catch {
    // a blocked or full store keeps nothing: the press still switches the music for this visit
  }
}

/** This browser's `localStorage`, or none while Next renders on the server. */
export const browserMusicStore: MusicSettingStore = () => (typeof window === "undefined" ? null : window.localStorage);
