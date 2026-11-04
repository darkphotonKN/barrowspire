/**
 * Tearing the game down when its page unmounts. Phaser-free, so the order is tested on its own.
 *
 * Phaser captures the keys scenes register (W A S D E I B 1 2 3 Enter Esc) with a keydown listener on
 * window that calls preventDefault. `game.destroy()` only runs on the next frame, and it tears the
 * scenes down before the input: a scene that throws while torn down stops it there, and the listener
 * outlives the game, eating those keys on every other page until a full reload. So the keyboard is
 * handed back here, synchronously, before the destroy is even asked for.
 */

/** The parts of a Phaser game the teardown touches. */
export interface ReleasableGame {
  input?: {
    keyboard?: { clearCaptures(): void; stopListeners(): void } | null;
  } | null;
  destroy(removeCanvas: boolean): void;
}

/** The socket's per-action listener registry. */
export interface ActionListeners {
  off(action: string): void;
}

export function releaseGame(
  game: ReleasableGame,
  socket: ActionListeners,
): void {
  const keyboard = game.input?.keyboard;
  keyboard?.clearCaptures();
  keyboard?.stopListeners();
  // the world_entered handler closes over this game: no later message may reach it
  socket.off("world_entered");
  game.destroy(true);
}
