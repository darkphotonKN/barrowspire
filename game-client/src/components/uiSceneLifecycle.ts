/**
 * The UI scene's life in the game (FS-TQZ5J §A R2–R5, ADR-0081 Decision 1), driven by the worlds'
 * own reports through the game's UI bridge: the first world's report launches the UI scene, a world
 * switch never restarts it, it sleeps while no world is reported (the main menu, character creation,
 * Return to menu) and wakes with the next world. Phaser-free: it drives the game's scene manager
 * through the slice of it this needs, so the rules are tested on their own. Under the disconnect
 * notice it is held with the worlds (`DisconnectNotice.holdWorlds`); the game's destroy takes it.
 *
 * The world's report, not `switchWorld`, wakes and sleeps it: Change character and Return to menu
 * leave a world without a switch (R3).
 */

import type { SceneStatusReader } from "./bootGate";
import type { UiBridge, UiState, World, WorldReport } from "@/ui/uiBridge";

/** The UI scene: after the world scenes in the game's scene list, before the disconnect notice (R1). */
export const UI_SCENE = "UIScene";

// Phaser 4.2.1's scene statuses (scene/const.js). A scene the game booted and never started is INIT.
const START = 2;
const RUNNING = 5;
const PAUSED = 6;
const SLEEPING = 7;
const SHUTDOWN = 8;

/** The scene manager's slice the UI scene's life uses. Phaser's `SceneManager` is one. */
export interface UiScenes extends SceneStatusReader {
  start(key: string): unknown;
  sleep(key: string): unknown;
  wake(key: string): unknown;
  resume(key: string): unknown;
}

/** The game's UI bridge (FS-TQZ5J R8): what the scenes say to each other, and the UI scene's life. */
export class GameUiBridge implements UiBridge {
  private reported: WorldReport | null = null;
  private uiState: UiState = { menuOpen: false };

  constructor(private readonly scenes: UiScenes) {}

  get world(): WorldReport | null {
    return this.reported;
  }

  get ui(): UiState {
    return this.uiState;
  }

  report(report: WorldReport): void {
    this.reported = report;
    this.show();
  }

  /** A left from a world no longer the one reported changes nothing. */
  left(world: World): void {
    if (this.reported?.world !== world) return;
    this.reported = null;
    this.hide();
  }

  reportUi(state: UiState): void {
    this.uiState = state;
  }

  /** The action as it is: the interface sounds that play around it come with I-TQZ5J-2 (R12, R22). */
  act(run: () => void): void {
    run();
  }

  private status(): number | undefined {
    return this.scenes.getScene(UI_SCENE)?.sys.settings.status;
  }

  /**
   * Launched once, woken after a sleep (R2, R3). Starting or running, it stands; paused, the notice
   * holds it. Phaser's `run` is not used: it restarts a running scene.
   */
  private show(): void {
    const status = this.status();
    if (status === undefined) return;
    if (status === SLEEPING) this.scenes.wake(UI_SCENE);
    else if (status < START || status === SHUTDOWN) this.scenes.start(UI_SCENE);
  }

  /**
   * Asleep: not drawn, not updated, no pointer, no keys (R3). Phaser's sleep takes only a running
   * scene, and a paused one is still drawn, so one the notice held (Return to menu, R5) is let go of
   * first.
   */
  private hide(): void {
    const status = this.status();
    if (status === PAUSED) this.scenes.resume(UI_SCENE);
    if (status === RUNNING || status === PAUSED) this.scenes.sleep(UI_SCENE);
  }
}
