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
 * open windows, its dialogue, its player state and the facts its menu rows read (R9), the UI's state
 * and the world hearing it change (R10), the corner row's and the ESC menu's requests the world
 * answers (R11), and the interface sounds the world's player actions and its minimap's step reach
 * through it (R12, R22). A pointer move the UI scene took from the world reaches the world through it
 * (A1 R27).
 */

import type { WorldType } from "@/assets/types/client";
import type { UiAct, UiActWrapper, UiEffect, WindowState } from "@/audio/uiSounds";
import { onSceneEnd, type EndingScene } from "@/scenes/sceneEnd";
import type { GameRegistry } from "./gameFullscreen";
import { hearMove, type InputCamera, type ScenePointer, type WorldInput } from "./uiScenePointer";

/** The world a world scene draws (FS-TQZ5J "Words"): the town, a field, a run, as the server names them. */
export type World = WorldType;

/**
 * Which of the world's own windows are open (R9): the letter panel, Party, Inventory, Character. The
 * ESC menu's slot is the UI scene's own (R16). The interface sounds' rule reads both (FS-WDM0X S8).
 */
export type WorldWindows = Readonly<Omit<WindowState, "menu">>;

/** What keeps the screen in the world (R9): the town's NPC dialogue, open. */
export interface WorldBlockers {
  readonly dialogue: boolean;
}

/**
 * What the world's ESC menu rows read (R9, R16): the player's state and the menu facts, each false
 * where the world has no such thing (a field is never queued; only the run resolves, ends or falls).
 */
export interface WorldFacts {
  /** Out of the delve, dead or escaped (the run's `menuState`): the run's rows are `runMenuChoices`' for it. */
  readonly resolved: boolean;
  /** In the town's queue: the town's menu offers Leave the queue (`hubMenuChoices`). */
  readonly queued: boolean;
  /** A Change character sent and unanswered: its row is dimmed. */
  readonly leaving: boolean;
  /** The run has ended: no menu opens, and the keys are the run's end's (its keyboard is off). */
  readonly ended: boolean;
  /** A Leave the barrow sent and unanswered: its row is dimmed. */
  readonly leavePending: boolean;
  /** A Fall sent and unanswered: the Fall confirm's Fall is dimmed. */
  readonly fallPending: boolean;
}

/** A world's facts where it has none of them. */
export const NO_FACTS: WorldFacts = {
  resolved: false,
  queued: false,
  leaving: false,
  ended: false,
  leavePending: false,
  fallPending: false,
};

/** A world window the corner row's icons toggle (R11, R14). */
export type UiToggle = "inventory" | "character" | "party";

/** What one Esc step closes in the world (R11, R17): the letter panel, Party, the gear overlay, the dialogue. */
export type UiClose = "letter" | "party" | "gear" | "dialogue";

/**
 * UI → world: what the UI scene asks of the world (R11). The corner row's `toggle` of a window; an
 * Esc step's `close`; the ESC menu's rows that only the world can do (the town's and the field's
 * `leaveQueue` and `changeCharacter`, the run's `leaveRun` and `fall`); and the OPTIONS Music row's
 * `musicLevel`, which the world playing music applies at once (R19). Plain data: nothing callable.
 */
export type UiRequest =
  | { readonly kind: "toggle"; readonly window: UiToggle }
  | { readonly kind: "close"; readonly window: UiClose }
  | { readonly kind: "leaveQueue" }
  | { readonly kind: "changeCharacter" }
  | { readonly kind: "leaveRun" }
  | { readonly kind: "fall" }
  | { readonly kind: "musicLevel"; readonly level: number };

/** World → UI: the world's report, whole (R9). */
export interface WorldReport {
  readonly world: World;
  /**
   * Its windows as they are now, read rather than told: they change behind the world's back (a
   * module's own ×, a server message), and they are read only around a player action (R12).
   */
  readonly windows: () => WorldWindows;
  /** What keeps its screen now, read as its windows are. */
  readonly blockers: () => WorldBlockers;
  /** What its ESC menu's rows read now (R9, R16), read as its windows are. */
  readonly facts: () => WorldFacts;
  /**
   * Hears the UI's state change (R10): as the menu opens the world closes its windows (FS-3EBCA R17)
   * and ends an aim (FS-JTNPR req 15); its stride stops on its next frame, its guards reading the
   * state (FS-G4VMQ R5). Heard inside the act that changed it, so the sounds hear it too (R22).
   */
  readonly heardUi?: (ui: UiState) => void;
  /** Answers a request of the UI scene's at once, or ignores one it has no answer for (R11). */
  readonly answer: (request: UiRequest) => void;
  /**
   * Hears a pointer move the UI scene took (A1 R27), through its own input pass, over nothing of its
   * own while the pointer is over a UI piece (`onUi`). `reportWorld` gives each world one; a report
   * without one hears nothing.
   */
  readonly hearMove?: (pointer: ScenePointer, onUi: boolean) => void;
}

/** What a world hands with its name: everything of its report but the world and the moves `reportWorld` hears for it (R9). */
export type WorldSide = Omit<WorldReport, "world" | "hearMove">;

/** A world's answer to each request it has one for (R11): a toggle by its window, a close by what it closes. */
export type WorldAnswers = Partial<Record<UiToggle, () => void>> & {
  readonly close?: Partial<Record<UiClose, () => void>>;
  readonly leaveQueue?: () => void;
  readonly changeCharacter?: () => void;
  readonly leaveRun?: () => void;
  readonly fall?: () => void;
  readonly musicLevel?: (level: number) => void;
};

/** The world's `answer` from its answers: each request to its own, one with none ignored (R11). */
export function answering(answers: WorldAnswers): (request: UiRequest) => void {
  return (request) => {
    switch (request.kind) {
      case "toggle":
        return answers[request.window]?.();
      case "close":
        return answers.close?.[request.window]?.();
      case "musicLevel":
        return answers.musicLevel?.(request.level);
      default:
        return answers[request.kind]?.();
    }
  };
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
  /** Hears each world report from now on, and none (null) as a world leaves. Returns the stop. */
  onWorld(listener: WorldListener): () => void;
  /** The UI scene asks the world reported, which has answered when this returns; none reported, nothing (R11). */
  request(request: UiRequest): void;
  /**
   * A pointer move Phaser stopped at the UI scene, handed to the world reported, which has heard it
   * when this returns; `onUi` while the pointer is over a UI piece. None reported, nothing (A1 R27).
   */
  moved(pointer: ScenePointer, onUi: boolean): void;
  /**
   * The UI scene's report of its own state (R10): a change is heard by the world reported at once
   * (`heardUi`).
   */
  reportUi(state: UiState): void;
  /**
   * The world reported changed a part of its report (R9): its listeners hear it again at once, so the
   * UI scene reads the new facts in the same call (its menu yields, its rows retone).
   */
  changed(): void;
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

/**
 * What of the bridge a world scene reaches (R10, R12): its player actions and its minimap's step, the
 * UI's state its guards read, and its word that its report changed.
 */
export type WorldUi = Pick<UiBridge, "act" | "play" | "ui" | "changed">;

/** A world's UI in a game lent no bridge: each action runs as it is, nothing plays, no menu is open. */
export const NO_UI: WorldUi = { act: (run) => run(), play: () => {}, ui: { menuOpen: false }, changed: () => {} };

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
    if (state.menuOpen === this.uiState.menuOpen) return;
    this.uiState = state;
    this.reported?.heardUi?.(state);
  }

  changed(): void {
    if (this.reported) this.tell(this.reported);
  }

  request(request: UiRequest): void {
    this.reported?.answer(request);
  }

  moved(pointer: ScenePointer, onUi: boolean): void {
    this.reported?.hearMove?.(pointer, onUi);
  }

  act: UiAct = (run) => (this.sounds ? this.sounds.act(run) : run());

  play(effect: UiEffect): void {
    this.sounds?.play(effect);
  }

  lendSounds(sounds: UiSoundPlayer): void {
    this.sounds = sounds;
  }

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

/**
 * A world scene, as far as it reports its world: its game's registry, its end, and the input and
 * cameras a move the UI scene took runs through (A1 R27). A `Phaser.Scene` is one: its input's
 * `update` is Phaser's own pass over a DOM event, private in 4.2.1's types (pinned by test).
 */
export interface ReportingScene extends EndingScene {
  registry?: Pick<GameRegistry, "get">;
  input?: unknown;
  cameras?: { readonly cameras: readonly InputCamera[] };
}

/** The scene's input as a move runs through it, where it has one. */
function worldInput(scene: ReportingScene): WorldInput<ScenePointer> | null {
  const input = scene.input as Partial<WorldInput<ScenePointer>> | null | undefined;
  return typeof input?.update === "function" ? (input as WorldInput<ScenePointer>) : null;
}

/**
 * Reports `world` up, now, with its side (its windows, its blockers, its answers) and its ear for a
 * move the UI scene took (A1 R27), and its leaving on the scene's stop (R3, R9, R11). Called once per
 * start, from create, before anything that hears a player. On the game's destroy it tells nothing:
 * the UI scene goes with the game, and the scene manager going down is asked nothing (R4,
 * `SceneEnd`). Returns what the world's player actions and its minimap's step run through (R12): its
 * game's bridge, or {@link NO_UI} where none was lent.
 */
export function reportWorld(scene: ReportingScene, world: World, side: WorldSide): WorldUi {
  const bridge = uiBridgeOf(scene.registry);
  if (!bridge) return NO_UI;
  const input = worldInput(scene);
  const hear = (pointer: ScenePointer, onUi: boolean) => {
    if (input) hearMove(input, scene.cameras?.cameras ?? [], pointer, onUi);
  };
  bridge.report({ world, ...side, hearMove: hear });
  onSceneEnd(scene, (end) => {
    if (end === "shutdown") bridge.left(world);
  });
  return bridge;
}
