/**
 * The UI bridge (FS-TQZ5J §B, ADR-0081 Decision 2): the one typed channel between the world scenes
 * and the UI scene. The world reports its state; the UI scene reports its own and asks the world for
 * what only the world can do. No scene imports another scene or calls its methods: each reaches the
 * bridge its game was lent, through {@link uiBridgeOf}, as it reaches the frame's fullscreen.
 *
 * One per game ({@link GameUiBridge}), made and lent by the game bridge (`PhaserGame`), let go with
 * the game. It is the channel only: the UI scene's life listens to its world reports
 * (`src/components/uiSceneLifecycle.ts`).
 *
 * Each slice of FS-TQZ5J adds to it what it consumes: so far which world is up and its leaving, its
 * open windows, the UI's state, and the interface sounds the world's player actions and its
 * minimap's step reach through it (R12, R22). The world's player state, menu facts and blockers (R9)
 * and the UI's requests (R11) come with the corner row and the ESC menu.
 */

import type { WorldType } from "@/assets/types/client";
import type { UiAct, UiActWrapper, UiEffect, WindowState } from "@/audio/uiSounds";
import { onSceneEnd, type EndingScene } from "@/scenes/sceneEnd";
import type { GameRegistry } from "./gameFullscreen";

/** The world a world scene draws (FS-TQZ5J "Words"): the town, a field, a run, as the server names them. */
export type World = WorldType;

/**
 * Which of the world's own windows are open (R9): the letter panel, Party, Inventory, Character, and
 * the ESC menu's slot, the world's until the menu moves into the UI scene (I-TQZ5J-4). The interface
 * sounds' rule reads it (FS-WDM0X S8).
 */
export type WorldWindows = Readonly<WindowState>;

/** World → UI: the world's report, whole (R9). */
export interface WorldReport {
  readonly world: World;
  /**
   * Its windows as they are now, read rather than told: they change behind the world's back (a
   * module's own ×, a server message), and they are read only around a player action (R12).
   */
  readonly windows: () => WorldWindows;
}

/** UI → world: the UI's state (R10). */
export interface UiState {
  /** The ESC menu's slot is filled: the menu, OPTIONS or the run's Fall confirm. */
  readonly menuOpen: boolean;
}

/** The UI scene's interface sounds as the bridge reaches them: the game's one `UiSounds` is one (R22). */
export interface UiSoundPlayer {
  act: UiAct;
  play(effect: UiEffect): void;
}

/**
 * The bridge as the scenes see it. Every call is synchronous: when it returns, the other side has
 * heard it. Its `act` is the wrapper a world runs each player action that can open or close a
 * window through (R12).
 */
export interface UiBridge extends UiActWrapper {
  /** The world's report: as its create runs, and again on any change (R9). */
  report(report: WorldReport): void;
  /** The world has shut down (R9). */
  left(world: World): void;
  /** The world's last report; none outside the worlds. What the UI scene reads. */
  readonly world: WorldReport | null;
  /** The UI scene's report of its own state (R10). */
  reportUi(state: UiState): void;
  /** The UI's last state. What the world's guards read. */
  readonly ui: UiState;
  /**
   * A world's player action, run through the UI scene's interface sounds: the world's windows read
   * before and after, once, and the rule's one effect played; one inside another joins it (R12,
   * R22). Before the UI scene lends its sounds it runs as it is.
   */
  act: UiAct;
  /** An effect the world's own input plays: its minimap's mode step (FS-WDM0X S7). */
  play(effect: UiEffect): void;
  /** The UI scene lends the game's one player, as it is created (R22). */
  lendSounds(sounds: UiSoundPlayer): void;
}

/** What of the bridge a world scene's player actions and its minimap's step reach (R12). */
export type WorldUi = Pick<UiBridge, "act" | "play">;

/** A world's UI in a game lent no bridge: each action runs as it is, and nothing plays. */
export const NO_UI: WorldUi = { act: (run) => run(), play: () => {} };

/** Told each world report, and none (null) as the world reported leaves. */
export type WorldListener = (report: WorldReport | null) => void;

/**
 * The game's UI bridge (R8): what the scenes said, held for the other side to read, and each world
 * report told to whoever listens (the UI scene's life). It knows nothing of the game's scenes.
 */
export class GameUiBridge implements UiBridge {
  private reported: WorldReport | null = null;
  private uiState: UiState = { menuOpen: false };
  private readonly listeners = new Set<WorldListener>();
  private sounds: UiSoundPlayer | null = null;

  get world(): WorldReport | null {
    return this.reported;
  }

  get ui(): UiState {
    return this.uiState;
  }

  report(report: WorldReport): void {
    this.reported = report;
    this.tell(report);
  }

  /** A left from a world no longer the one reported changes nothing, and tells nothing. */
  left(world: World): void {
    if (this.reported?.world !== world) return;
    this.reported = null;
    this.tell(null);
  }

  reportUi(state: UiState): void {
    this.uiState = state;
  }

  act: UiAct = (run) => (this.sounds ? this.sounds.act(run) : run());

  play(effect: UiEffect): void {
    this.sounds?.play(effect);
  }

  lendSounds(sounds: UiSoundPlayer): void {
    this.sounds = sounds;
  }

  /** Hears each world report from now on, and none as a world leaves. Returns the stop. */
  onWorld(listener: WorldListener): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private tell(report: WorldReport | null): void {
    for (const listener of [...this.listeners]) listener(report);
  }
}

const UI_BRIDGE_KEY = "uiBridge";

/** Lends the game its UI bridge (R8). */
export function lendUiBridge(registry: Pick<GameRegistry, "set">, bridge: UiBridge): void {
  registry.set(UI_BRIDGE_KEY, bridge);
}

/** The UI bridge this scene's game was lent, or none: none lent, no game. */
export function uiBridgeOf(registry: Pick<GameRegistry, "get"> | undefined): UiBridge | null {
  return (registry?.get(UI_BRIDGE_KEY) as UiBridge | undefined) ?? null;
}

/** A world scene, as far as it reports its world: its game's registry and its end. A `Phaser.Scene` is one. */
export interface ReportingScene extends EndingScene {
  registry?: Pick<GameRegistry, "get">;
}

/**
 * Reports `world` up, now, with its windows, and its leaving on the scene's stop (R3, R9). Called
 * once per start, from create, before anything that hears a player. On the game's destroy it tells
 * nothing: the UI scene goes with the game, and the scene manager going down is asked nothing (R4,
 * `SceneEnd`). Returns what the world's player actions and its minimap's step run through (R12):
 * its game's bridge, or {@link NO_UI} where none was lent.
 */
export function reportWorld(
  scene: ReportingScene,
  world: World,
  windows: () => WorldWindows,
): WorldUi {
  const bridge = uiBridgeOf(scene.registry);
  if (!bridge) return NO_UI;
  bridge.report({ world, windows });
  onSceneEnd(scene, (end) => {
    if (end === "shutdown") bridge.left(world);
  });
  return bridge;
}
