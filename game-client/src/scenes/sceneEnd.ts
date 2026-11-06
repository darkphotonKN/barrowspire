import * as Phaser from "phaser";

/**
 * How a scene ends, as its teardown must know it.
 *
 * - `"shutdown"`: the scene stops (a switch to another world, a restart). Its plugins have shut
 *   down and live on, and Phaser starts this same instance again on the next visit: the teardown
 *   resets what the visit left on them (the default cursor, the keyboard's lock).
 * - `"destroy"`: the game is destroyed (the page unmounts: leaving /game). Phaser 4.2.1 emits the
 *   scene's DESTROY only, never SHUTDOWN (`Systems.destroy`), and each scene plugin subscribed to
 *   DESTROY at boot, so input, keyboard, cameras, tweens, the clock and the game-object factory have
 *   destroyed themselves before the teardown runs; InputPlugin's and KeyboardPlugin's `manager` is
 *   null. The instance never starts again. The teardown lets go of what outlives the game (socket
 *   listeners, store subscriptions) and asks the plugins nothing: a throw here stops the rest of
 *   `Game.runDestroy`, and the renderer, the loop, the later scenes and the input manager's window
 *   listeners stay.
 */
export type SceneEnd = "shutdown" | "destroy";

/** What of a scene the end is heard on. A `Phaser.Scene` is one. */
export interface EndingScene {
  events: {
    once(event: string, fn: () => void): unknown;
    off(event: string, fn: () => void): unknown;
  };
}

/**
 * Runs `release` once, at whichever end comes first, saying which. Called once per start (create
 * or init), as the scene's other listeners are.
 */
export function onSceneEnd(
  scene: EndingScene,
  release: (end: SceneEnd) => void,
): void {
  const { SHUTDOWN, DESTROY } = Phaser.Scenes.Events;
  const stopped = () => end("shutdown");
  const destroyed = () => end("destroy");
  const end = (how: SceneEnd) => {
    scene.events.off(SHUTDOWN, stopped);
    scene.events.off(DESTROY, destroyed);
    release(how);
  };
  scene.events.once(SHUTDOWN, stopped);
  scene.events.once(DESTROY, destroyed);
}
