/**
 * The UI scene's life in the game (FS-TQZ5J §A R2–R5, ADR-0084 Decision 1), driven by the worlds'
 * own reports, heard as a listener on the game's UI bridge: the first world's report launches the UI
 * scene, a world switch never restarts it, it sleeps while no world is reported (the main menu,
 * character creation, Return to menu) and wakes with the next world. Phaser-free: it drives the
 * game's scene manager through the slice of it this needs, so the rules are tested on their own.
 * Under the disconnect notice it is held with the worlds (`DisconnectNotice.holdWorlds`); the game's
 * destroy takes it.
 *
 * The world's report, not `switchWorld`, wakes and sleeps it: Change character and Return to menu
 * leave a world without a switch (R3). The bridge itself (`src/ui/uiBridge.ts`) is the channel only.
 */

import { PAUSED, RUNNING, SHUTDOWN, SLEEPING, START } from "@/scenes/sceneStatus";
import type { SceneStatusReader } from "./bootGate";
import type { WorldListener } from "@/ui/uiBridge";

/** The UI scene: after the world scenes in the game's scene list, before the disconnect notice (R1). */
export const UI_SCENE = "UIScene";

/** The scene manager's slice the UI scene's life uses. Phaser's `SceneManager` is one. */
export interface UiScenes extends SceneStatusReader {
  start(key: string): unknown;
  sleep(key: string): unknown;
  wake(key: string): unknown;
  resume(key: string): unknown;
}

/** Where the worlds' reports are heard. The game's `GameUiBridge` is one. */
export interface WorldReports {
  onWorld(listener: WorldListener): () => void;
}

/**
 * Shows the UI scene with each world reported and hides it as the world leaves (R2, R3), for the
 * game's life. Returns the stop.
 */
export function driveUiScene(reports: WorldReports, scenes: UiScenes): () => void {
  const status = () => scenes.getScene(UI_SCENE)?.sys.settings.status;

  /**
   * Launched once, woken after a sleep (R2, R3). Starting or running, it stands; paused, the notice
   * holds it. Phaser's `run` is not used: it restarts a running scene.
   */
  const show = () => {
    const now = status();
    if (now === undefined) return;
    if (now === SLEEPING) scenes.wake(UI_SCENE);
    else if (now < START || now === SHUTDOWN) scenes.start(UI_SCENE);
  };

  /**
   * Asleep: not drawn, not updated, no pointer, no keys (R3). Phaser's sleep takes only a running
   * scene, and a paused one is still drawn, so one the notice held (Return to menu, R5) is let go of
   * first: the UI scene then hears RESUME and SLEEP back to back, its RESUME no return to play
   * (see `UIScene`).
   */
  const hide = () => {
    const now = status();
    if (now === PAUSED) scenes.resume(UI_SCENE);
    if (now === RUNNING || now === PAUSED) scenes.sleep(UI_SCENE);
  };

  return reports.onWorld((report) => (report ? show() : hide()));
}
