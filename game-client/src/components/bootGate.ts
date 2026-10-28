/** The scene manager's read the gate needs: a scene's lifecycle status by key. */
export interface SceneStatusReader {
  getScene(key: string): { sys: { settings: { status: number } } } | null;
}

// Phaser.Scenes status constants: a scene between these is starting or running
const INIT = 1;
const RUNNING = 5;

function inFlight(scenes: SceneStatusReader, key: string): boolean {
  const status = scenes.getScene(key)?.sys.settings.status;
  return status !== undefined && status >= INIT && status <= RUNNING;
}

/**
 * Whether the boot chain (BootScene, then PreloadScene) is still standing the
 * game up. A world announced meanwhile must wait for the menu: switching would
 * start the world scene under the preload, before the baked art is in.
 *
 * Not `isActive`: Phaser counts only a RUNNING scene as active, and the preload
 * spends nearly all its life LOADING.
 */
export function bootInProgress(scenes: SceneStatusReader): boolean {
  return inFlight(scenes, "BootScene") || inFlight(scenes, "PreloadScene");
}
