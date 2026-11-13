/**
 * How loud the interface sound effects play (FS-WDM0X S14–S16): a level from 0 (silence) to 5,
 * kept per browser in `localStorage` apart from the music's, never sent to the server. Shaped as
 * `musicSetting.ts`: every read and write is guarded, and the gain per level derives from the cap.
 */

import type { KeyValueStore } from "@/characters/roster";

/** Where this browser keeps it (S15), apart from the music's `barrowspire_music`. */
export const SFX_SETTING_KEY = "barrowspire_sfx";
/** The top level's gain: the files' own loudness, since they are not mastered loud (S14); tunable. */
export const SFX_MAX_GAIN = 1.0;
/** The top level; 0 is silence. */
export const SFX_TOP_LEVEL = 5;
/** The level a browser plays at until it picks one (S14); tunable. Gain 0.6. */
export const SFX_DEFAULT_LEVEL = 3;

/** The effects' gain at `level`: linear from silence to the cap (S14). */
export function sfxGain(level: number, cap: number = SFX_MAX_GAIN): number {
  return (cap * level) / SFX_TOP_LEVEL;
}

/** `level` kept to the whole levels 0 to the top. */
export function clampSfxLevel(level: number): number {
  return Math.min(SFX_TOP_LEVEL, Math.max(0, Math.round(level)));
}

/** The store, reached lazily: reaching `window.localStorage` may itself throw, and the server render has none. */
export type SfxSettingStore = () => KeyValueStore | null;

/** The digits a level is kept as. */
const LEVEL = /^[0-5]$/;

/** What this browser kept; the default where it cannot say (S15). */
export function readSfxLevel(store: SfxSettingStore): number {
  try {
    const held = store()?.getItem(SFX_SETTING_KEY);
    return held && LEVEL.test(held) ? Number(held) : SFX_DEFAULT_LEVEL;
  } catch {
    return SFX_DEFAULT_LEVEL;
  }
}

/** Keeps `level` in this browser; where storage refuses, nothing is kept and nothing throws (S15). */
export function rememberSfxLevel(store: SfxSettingStore, level: number): void {
  try {
    store()?.setItem(SFX_SETTING_KEY, String(level));
  } catch {
    // a blocked or full store keeps nothing: `heldForVisit` holds the change for this visit
  }
}

/**
 * `store`, with a write the browser refuses (blocked, full or absent) held in memory and read back
 * for the rest of this visit (S15). Each play reads the level again (S16), so without this a
 * refused change would hold only while the OPTIONS panel shows it. While the browser keeps the
 * writes, every read goes through to it, so another tab's change is heard.
 */
export function heldForVisit(store: SfxSettingStore): SfxSettingStore {
  return holdIn(new Map(), store);
}

/** {@link heldForVisit} over a given `held`, so the browser's can be reached by {@link resetHeldForTests}. */
function holdIn(held: Map<string, string>, store: SfxSettingStore): SfxSettingStore {
  const kept: KeyValueStore = {
    getItem: (key) => held.get(key) ?? store()?.getItem(key) ?? null,
    setItem: (key, value) => {
      try {
        const browser = store();
        if (!browser) throw new Error("no store");
        browser.setItem(key, value);
        held.delete(key);
      } catch {
        held.set(key, value);
      }
    },
    removeItem: (key) => {
      held.delete(key);
      try {
        store()?.removeItem(key);
      } catch {
        // nothing kept to remove
      }
    },
  };
  return () => kept;
}

/**
 * The level alone (S19): read from the store as it is made (each time the OPTIONS panel opens),
 * each change written and held for this visit.
 */
export function storedSfxLevel(store: SfxSettingStore): { level(): number; setLevel(level: number): void } {
  let current = readSfxLevel(store);
  return {
    level: () => current,
    setLevel: (level) => {
      const next = clampSfxLevel(level);
      if (next === current) return;
      current = next;
      rememberSfxLevel(store, next);
    },
  };
}

/** What {@link browserSfxStore} holds for this visit: the module's life, so every test in a node run shares it. */
const browserHeld = new Map<string, string>();

/** This browser's `localStorage`, or none while Next renders on the server, a refused change held for the visit. */
export const browserSfxStore: SfxSettingStore = holdIn(browserHeld, () =>
  typeof window === "undefined" ? null : window.localStorage,
);

/**
 * Tests only: forgets every change {@link browserSfxStore} holds, as a new visit would. In node
 * there is no window, so each level a test sets is held, and would carry into the next test.
 */
export function resetHeldForTests(): void {
  browserHeld.clear();
}
