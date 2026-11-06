/**
 * A world scene's one-shot server messages, held from `init` until its `create` is done
 * (FS-C4JWH Edge States). A world scene now downloads its own art between `init` and `create`,
 * and the listeners that act on what the server sends once (a queue's progress, a handoff, a
 * party notice, a run's end) are made in `create`: a message sent meanwhile would find no listener
 * and be lost. The game state needs none of this: it is a full snapshot every tick.
 *
 *   init()   { this.held = holdOneShots(this, socketManager, ["end_game", "settlement"]); }
 *   create() { ...; socketManager.on("end_game", endGame); ...; this.held?.replay({ end_game: endGame }); }
 *
 * What is held is handed over in arrival order, across actions. Both ends of the scene let go of
 * the actions and of anything still held (`onSceneEnd`), so a scene stopped before its create
 * leaves no listener behind.
 */

import { onSceneEnd, type EndingScene } from "./sceneEnd";

/** The socket as a scene subscribes to it: one listener per action. `SocketManager` is one. */
export interface OneShotSocket {
  // each action's own payload type, handed over as `any`, as SocketManager.on does
  on(action: string, callback: (payload: any) => void): void;
  off(action: string): void;
}

export type OneShotHandlers = Readonly<Record<string, (payload: any) => void>>;

export interface HeldMessages {
  /** Hands what was held to `handlers`, in arrival order, and passes later messages straight on. */
  replay(handlers: OneShotHandlers): void;
}

export function holdOneShots(
  scene: EndingScene,
  socket: OneShotSocket,
  actions: readonly string[],
): HeldMessages {
  const held: [action: string, payload: unknown][] = [];
  let handlers: OneShotHandlers | undefined;
  let ended = false;

  for (const action of actions)
    socket.on(action, (payload: unknown) => {
      if (handlers) handlers[action]?.(payload);
      else held.push([action, payload]);
    });

  onSceneEnd(scene, () => {
    ended = true;
    held.length = 0;
    for (const action of actions) socket.off(action);
  });

  return {
    replay(next) {
      if (ended) return;
      handlers = next;
      for (const [action, payload] of held.splice(0)) next[action]?.(payload);
    },
  };
}
