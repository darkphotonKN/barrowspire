/**
 * How loud the town's music plays (FS-28DDG § Change: Music volume in an Options panel, C9, C15):
 * a level from 0 (silence) to 5, kept per browser in `localStorage`, never sent to the server.
 * Every read and write is guarded, as `ui/minimapMode.ts` does. The on/off row's old values
 * migrate on read: "off" is 0, and "on" or anything absent, unknown or unreadable is the default.
 */

import type { KeyValueStore } from "@/characters/roster";

/** Where this browser keeps it (R17, C15). */
export const MUSIC_SETTING_KEY = "barrowspire_music";
/**
 * The loudest level's gain, 0.3 of the file's loudness (C9; owner: the village track is mastered
 * loud; retuned from 0.5 on 2026-11-13's listening check, I-28DDG-6). Temporary: it stands until
 * the track is remastered or the owner retunes it.
 */
export const MUSIC_MAX_GAIN = 0.3;
/** The top level; 0 is silence. */
export const MUSIC_TOP_LEVEL = 5;
/** The level a browser plays at until it picks one (C9, C15): gain 0.18. */
export const MUSIC_DEFAULT_LEVEL = 3;

/** The music's gain at `level`: linear from silence to the cap (C9). */
export function musicGain(level: number, cap: number = MUSIC_MAX_GAIN): number {
  return (cap * level) / MUSIC_TOP_LEVEL;
}

/** `level` kept to the whole levels 0 to the top. */
export function clampMusicLevel(level: number): number {
  return Math.min(MUSIC_TOP_LEVEL, Math.max(0, Math.round(level)));
}

/** The store, reached lazily: reaching `window.localStorage` may itself throw, and the server render has none. */
export type MusicSettingStore = () => KeyValueStore | null;

/** The digits a level is kept as. */
const LEVEL = /^[0-5]$/;

/** What this browser kept, migrated from the on/off row's values; the default where it cannot say (C15). */
export function readMusicLevel(store: MusicSettingStore): number {
  try {
    const held = store()?.getItem(MUSIC_SETTING_KEY);
    if (held === "off") return 0;
    return held && LEVEL.test(held) ? Number(held) : MUSIC_DEFAULT_LEVEL;
  } catch {
    return MUSIC_DEFAULT_LEVEL;
  }
}

/** Keeps `level` in this browser; where storage refuses, nothing is kept and nothing throws (C15). */
export function rememberMusicLevel(store: MusicSettingStore, level: number): void {
  try {
    store()?.setItem(MUSIC_SETTING_KEY, String(level));
  } catch {
    // a blocked or full store keeps nothing: the change still holds for this visit
  }
}

/**
 * The level alone, for a world with no music (C13, C14): read from the store as it is made (each
 * time the Options panel opens), each change written and held for this visit.
 */
export function storedMusicLevel(store: MusicSettingStore): { level(): number; setLevel(level: number): void } {
  let current = readMusicLevel(store);
  return {
    level: () => current,
    setLevel: (level) => {
      const next = clampMusicLevel(level);
      if (next === current) return;
      current = next;
      rememberMusicLevel(store, next);
    },
  };
}

/** This browser's `localStorage`, or none while Next renders on the server. */
export const browserMusicStore: MusicSettingStore = () => (typeof window === "undefined" ? null : window.localStorage);
