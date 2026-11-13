/**
 * The interface sound effects (FS-WDM0X): the corner windows' open and close sounds and the
 * minimap's mode switch, the menus', dialogs' and notices' sounds (§ Change: Menu, dialog and notice
 * sounds), the one rule that says which a player action plays, the wrapper every player path runs
 * through, and the player (S23).
 *
 * The rule and the player are Phaser-free, behind {@link UiSoundStage}; {@link sceneUiSoundStage}
 * is the game they act on, as `WorldMusic` is behind `sceneMusicStage`. The UI scene makes the
 * game's one {@link UiSounds} in `create` from its `sound` and the shared store, and lends it to its
 * game's UI bridge (FS-TQZ5J R22, `src/ui/uiSceneSounds.ts`); each world scene reports its window
 * state there and runs each player input that can open or close a window through the bridge's
 * `act` (S9; FS-TQZ5J R12).
 */

import { readSfxLevel, sfxGain, type SfxSettingStore } from "./sfxSetting";

/**
 * The owner's 27 effects, named as their files: the 11 window and minimap sounds (S1), then the 16
 * of the menus, dialogs and notices (§ Change M1). `menu_tab` and `menu_dropdown_*` load now and play
 * nowhere until pass 2 (the chat).
 */
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
  "menu_hover",
  "menu_click",
  "menu_back",
  "menu_tab",
  "menu_toggle_on",
  "menu_toggle_off",
  "menu_slider_tick",
  "menu_error",
  "menu_dropdown_open",
  "menu_dropdown_close",
  "dialog_open",
  "dialog_confirm",
  "dialog_confirm_heavy",
  "dialog_cancel",
  "notify",
  "notify_important",
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

/** Queues every effect (S20; § Change M1): called once, from `PreloadScene`, so they stay resident for the game's life. */
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

/** An effect's sound, as far as the player plays it: Phaser's `play(config)` merges `config` into the sound's and applies it. */
export interface UiSound {
  play(config: { volume: number }): boolean;
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

/** The wrapper as a module that hears its own input is handed it (S9): a scene's {@link UiSounds} is one. */
export interface UiActWrapper {
  act(run: () => void): void;
}

/** The wrapper a module runs its own input through when it was handed none: the input runs as it is. */
export const PASS_THROUGH: UiActWrapper = { act: (run) => run() };

/** Every window shut: the window state of a scene with none (the main menu, § Change M14). */
export const NO_WINDOWS: Readonly<WindowState> = {
  menu: false,
  letter: false,
  party: false,
  inventory: false,
  character: false,
};

/** How long after a hover sounds the next is held back, so a quick sweep over the rows does not stack (§ Change M4). Tunable. */
export const MENU_HOVER_COOLDOWN_MS = 50;

/** One scene's effects: the player (S10–S13) and the wrapper (S9) over its window state (S8). */
export class UiSounds {
  /** How deep in `act` the scene is: an inner call joins the outer one. */
  private depth = 0;
  /** The first effect the action under way asked for: its one sound, in place of the rule's (§ Change M2). */
  private asked: UiEffect | null = null;
  /** When `menu_hover` last sounded, on `now`'s clock. */
  private hoveredAt = -Infinity;

  constructor(
    private readonly stage: UiSoundStage,
    private readonly store: SfxSettingStore,
    private readonly windows: () => WindowState,
    /** The clock the hover's cooldown reads, in ms. */
    private readonly now: () => number = () => performance.now(),
  ) {}

  /**
   * Plays `effect` once (S10–S13). Inside an action the first effect asked for becomes the action's
   * one sound, played as it ends in place of the rule's; a later one is dropped (§ Change M2).
   * Outside one it plays now, or not at all: only at a kept level above 0, read at this play (S16),
   * with the context running and the effect cached, and a hover not within the cooldown of the last
   * (M4). One sound per effect per game, restarted from the top on a repeat (S11). Nothing queues,
   * and nothing but the sound's volume is set, handed to its play: never its pitch, rate or detune,
   * never the manager's volume or mute (S10, S13).
   */
  play = (effect: UiEffect): void => {
    if (this.depth > 0) {
      this.asked ??= effect;
      return;
    }
    this.sound(effect);
  };

  /**
   * Runs a player action and plays its one sound (S8, S9; § Change M2): the first effect it asked
   * for, else the rule's effect for the change it made. A call inside another joins it, so the outer
   * action plays once; an action that throws plays nothing.
   */
  act: UiAct = (run) => {
    if (this.depth > 0) return run();
    const before = this.windows();
    this.depth++;
    let result;
    let asked: UiEffect | null;
    try {
      result = run();
    } finally {
      this.depth--;
      asked = this.asked;
      this.asked = null;
    }
    const effect = asked ?? windowSound(before, this.windows());
    if (effect) this.sound(effect);
    return result;
  };

  /** Sounds `effect` now, where it can be heard (S11–S16, M4). */
  private sound(effect: UiEffect): void {
    const level = readSfxLevel(this.store);
    const key = uiSoundKey(effect);
    if (level <= 0 || !this.stage.audible() || !this.stage.cached(key)) return;
    if (effect === "menu_hover") {
      const now = this.now();
      if (now - this.hoveredAt < MENU_HOVER_COOLDOWN_MS) return;
      this.hoveredAt = now;
    }
    const sound = this.stage.get(key) ?? this.stage.add(key);
    // the gain in the play's own config: Phaser merges it into the sound's and applies it in one step
    sound.play({ volume: sfxGain(level) });
  }
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
    // the check WorldMusic's stage makes (S12)
    audible: () => {
      const context = scene.sound.context;
      return context ? context.state === "running" : !scene.sound.locked;
    },
  };
}
