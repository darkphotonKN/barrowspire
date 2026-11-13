/**
 * The interface sound effects (FS-WDM0X): the corner windows' open and close sounds and the
 * minimap's mode switch, the one rule that says which a player action plays, the wrapper every
 * player path runs through, and the player (S23).
 *
 * The rule and the player are Phaser-free, behind {@link UiSoundStage}; {@link sceneUiSoundStage}
 * is the game they act on, as `HubMusic` is behind `sceneMusicStage`. Each scene makes its
 * {@link UiSounds} in `create` from its own `sound` and the shared store, reports its window
 * state, and runs each player input that can open or close a window through `act` (S9).
 */

import { readSfxLevel, sfxGain, type SfxSettingStore } from "./sfxSetting";

/** The owner's 11 effects (S1), named as their files. */
export const UI_EFFECTS = [
  "inventory_open",
  "inventory_close",
  "character_open",
  "character_close",
  "party_open",
  "party_close",
  "mailbox_open",
  "mailbox_close",
  "settings_open",
  "settings_close",
  "map_mode_switch",
] as const;

export type UiEffect = (typeof UI_EFFECTS)[number];

/** An effect's key in the game's audio cache. */
export function uiSoundKey(effect: UiEffect): string {
  return `sfx:${effect}`;
}

/**
 * An effect's URLs, m4a first (S21, order set by the integrator 2026-11-13): Phaser 4.2.1 takes
 * the first URL whose type `canPlayType` accepts and never falls back on a decode failure
 * (`AudioFile.getAudioURL`), and Safari's Ogg decode is unreliable. Chrome, Safari and most
 * Firefox builds take the m4a; a Firefox without AAC falls to the ogg.
 */
export function uiSoundUrls(effect: UiEffect): string[] {
  return [`/audio/sfx/${effect}.m4a`, `/audio/sfx/${effect}.ogg`];
}

/** A Phaser scene's loader, as far as the effects reach it. */
export interface UiSoundLoader {
  load: { audio(key: string, urls: string[]): unknown };
}

/** Queues all 11 effects (S20): called once, from `PreloadScene`, so they stay resident for the game's life. */
export function preloadUiSounds(scene: UiSoundLoader): void {
  for (const effect of UI_EFFECTS) scene.load.audio(uiSoundKey(effect), uiSoundUrls(effect));
}

/** Which of a scene's windows are open (S8): the ESC menu means its slot is occupied, by the menu, OPTIONS or the run's Fall confirm. */
export interface WindowState {
  menu: boolean;
  letter: boolean;
  party: boolean;
  inventory: boolean;
  character: boolean;
}

/** The windows in the S3 order, each with its open and close sound: the first to change names the sound. */
const WINDOW_ORDER: readonly { window: keyof WindowState; open: UiEffect; close: UiEffect }[] = [
  { window: "menu", open: "settings_open", close: "settings_close" },
  { window: "letter", open: "mailbox_open", close: "mailbox_close" },
  { window: "party", open: "party_open", close: "party_close" },
  { window: "inventory", open: "inventory_open", close: "inventory_close" },
  { window: "character", open: "character_open", close: "character_close" },
];

/**
 * The one rule (S8): the open sound of the first window that opened, else the close sound of the
 * first that closed, else none. An opening that pushes others closed plays only its open (S3); a
 * menu ↔ OPTIONS swap leaves the slot occupied and plays nothing (S5); no change plays nothing (S6).
 */
export function windowSound(before: WindowState, after: WindowState): UiEffect | null {
  const opened = WINDOW_ORDER.find(({ window }) => !before[window] && after[window]);
  if (opened) return opened.open;
  const closed = WINDOW_ORDER.find(({ window }) => before[window] && !after[window]);
  return closed ? closed.close : null;
}

/** An effect's sound, as far as the player plays it. */
export interface UiSound {
  volume: number;
  play(): boolean;
}

/** What the player asks of the game. */
export interface UiSoundStage {
  /** The effect is decoded and in the audio cache: one that failed to load or decode is not (S22). */
  cached(key: string): boolean;
  /** The game's one sound for `key`, if one was added (S11). */
  get(key: string): UiSound | null;
  /** A sound for `key`, added to the game's sound manager. */
  add(key: string): UiSound;
  /** The effects can be heard: the audio context runs (S12). */
  audible(): boolean;
}

/** The wrapper's shape, for a module that hears its own input (S9). */
export type UiAct = <T>(run: () => T) => T;

/** One scene's effects: the player (S10–S13) and the wrapper (S9) over its window state (S8). */
export class UiSounds {
  /** How deep in `act` the scene is: an inner call joins the outer one. */
  private depth = 0;

  constructor(
    private readonly stage: UiSoundStage,
    private readonly store: SfxSettingStore,
    private readonly windows: () => WindowState,
  ) {}

  /**
   * Plays `effect` once, now, or not at all (S10–S13): only at a kept level above 0, read at this
   * play (S16), with the context running and the effect cached. One sound per effect per game,
   * restarted from the top on a repeat (S11). Nothing queues, and nothing but the sound's volume is
   * written: never its pitch, rate or detune, never the manager's volume or mute (S10, S13).
   */
  play = (effect: UiEffect): void => {
    const level = readSfxLevel(this.store);
    const key = uiSoundKey(effect);
    if (level <= 0 || !this.stage.audible() || !this.stage.cached(key)) return;
    const sound = this.stage.get(key) ?? this.stage.add(key);
    sound.play();
    // after the play: Phaser's play re-applies the sound's config volume (BaseSound.play → applyConfig)
    sound.volume = sfxGain(level);
  };

  /**
   * Runs a player action and plays the rule's effect for the change it made (S8, S9). A call
   * inside another joins it, so the outer action plays once; an action that throws plays nothing.
   */
  act: UiAct = (run) => {
    if (this.depth > 0) return run();
    const before = this.windows();
    this.depth++;
    let result;
    try {
      result = run();
    } finally {
      this.depth--;
    }
    const effect = windowSound(before, this.windows());
    if (effect) this.play(effect);
    return result;
  };
}

/** A Phaser scene, as far as the effects' stage reaches into its game. A `Phaser.Scene` is one. */
export interface UiSoundScene {
  cache: { audio: { exists(key: string): boolean } };
  sound: {
    /** Phaser types it generically over its own sounds, which say nothing of a volume. */
    get(key: string): unknown;
    add(key: string): UiSound;
    /** Phaser's own unlock: false once a gesture inside this game resumed its context. */
    locked: boolean;
    /** Web Audio's; Phaser's HTML5 audio fallback has none. */
    context?: { state: string };
  };
}

/** The effects' stage on a scene: the game's audio cache and sound manager, shared by every scene. */
export function sceneUiSoundStage(scene: UiSoundScene): UiSoundStage {
  return {
    cached: (key) => scene.cache.audio.exists(key),
    // the only sound under an effect's key is one this stage added
    get: (key) => (scene.sound.get(key) as UiSound | null) ?? null,
    add: (key) => scene.sound.add(key),
    // the check HubMusic's stage makes (S12)
    audible: () => {
      const context = scene.sound.context;
      return context ? context.state === "running" : !scene.sound.locked;
    },
  };
}
