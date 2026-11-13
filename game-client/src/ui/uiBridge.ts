/**
 * The UI bridge (FS-TQZ5J §B, ADR-0081 Decision 2): the one typed channel between the world scenes
 * and the UI scene. The world reports its state; the UI scene reports its own and asks the world for
 * what only the world can do. No scene imports another scene or calls its methods: each reaches the
 * bridge its game was lent, through {@link uiBridgeOf}, as it reaches the frame's fullscreen.
 *
 * One per game, made and lent by the game bridge (`PhaserGame`), let go with the game. The game's
 * bridge, and the UI scene's life the worlds' reports drive through it, are
 * `src/components/uiSceneLifecycle.ts`.
 *
 * Each slice of FS-TQZ5J adds to it what it consumes: this one carries which world is up and its
 * leaving, the UI's state and `act`. The world's player state, menu facts, blockers and open windows
 * (R9) and the UI's requests (R11) come with the corner row and the ESC menu.
 */

import type { WorldType } from "@/assets/types/client";
import type { UiActWrapper } from "@/audio/uiSounds";
import { onSceneEnd, type EndingScene } from "@/scenes/sceneEnd";
import type { GameRegistry } from "./gameFullscreen";

/** The world a world scene draws (FS-TQZ5J "Words"): the town, a field, a run, as the server names them. */
export type World = WorldType;

/** World → UI: the world's report, whole (R9). */
export interface WorldReport {
  readonly world: World;
}

/** UI → world: the UI's state (R10). */
export interface UiState {
  /** The ESC menu's slot is filled: the menu, OPTIONS or the run's Fall confirm. */
  readonly menuOpen: boolean;
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
 * Reports `world` up, now, and its leaving on the scene's stop (R3, R9). Called once per start, from
 * create. On the game's destroy it tells nothing: the UI scene goes with the game, and the scene
 * manager going down is asked nothing (R4, `SceneEnd`).
 */
export function reportWorld(scene: ReportingScene, world: World): void {
  const bridge = uiBridgeOf(scene.registry);
  if (!bridge) return;
  bridge.report({ world });
  onSceneEnd(scene, (end) => {
    if (end === "shutdown") bridge.left(world);
  });
}
