/**
 * The disconnect notice's place in the game (FS-R6EYZ §B): when it is raised, what it holds still
 * while it is up, and where its one button goes. Phaser-free: it drives the game's scene manager
 * through the slice of it this needs, so the rules are tested on their own. The notice itself is
 * drawn by `DisconnectNoticeScene`; the words and the layout are `src/ui/disconnectNoticeLayout.ts`.
 */

import { PAUSED, RUNNING, START } from "@/scenes/sceneStatus";
import { inFlight, type SceneStatusReader } from "./bootGate";
import { UI_SCENE } from "./uiSceneLifecycle";
import { WORLD_SCENES } from "./worldRouting";

/** The notice's own scene: last in the game's scene list, so drawn over every other (R11). */
export const NOTICE_SCENE = "DisconnectNoticeScene";

/** The worlds a lost connection raises the notice in: the town, a field, a run (R6). */
export const PLAYING_SCENES = ["HubScene", "FieldScene", "BarrowspireScene"] as const;

const MENU_SCENE = "MainMenuScene";

/** What the notice holds still: every world scene, and the UI scene over them (FS-TQZ5J R5). */
const HELD_SCENES = [...WORLD_SCENES, UI_SCENE];

/** The scene manager's slice the notice drives. Phaser's `SceneManager` is one. */
export interface NoticeScenes extends SceneStatusReader {
  start(key: string, data?: object): unknown;
  stop(key: string): unknown;
  pause(key: string): unknown;
}

/** Where lost connections are heard. `SocketManager` is one (FS-R6EYZ R1). */
export interface LostConnections {
  onConnectionLost(listener: () => void): () => void;
}

const statusOf = (scenes: SceneStatusReader, key: string): number | undefined =>
  scenes.getScene(key)?.sys.settings.status;

/**
 * Starting or running: START through RUNNING, its art still loading included. Not INIT: a scene the
 * game booted and never started sits there.
 */
const playing = (scenes: SceneStatusReader, key: string): boolean => {
  const status = statusOf(scenes, key);
  return status !== undefined && status >= START && status <= RUNNING;
};

export class DisconnectNotice {
  private up = false;

  constructor(private readonly scenes: NoticeScenes) {}

  /**
   * A lost connection: the notice comes up if a world is starting or running and it is not up
   * already (R6, R7). The scene is handed this notice, for its frames and its button.
   */
  lost(): void {
    if (this.up) return;
    if (!PLAYING_SCENES.some((key) => playing(this.scenes, key))) return;
    this.up = true;
    this.scenes.start(NOTICE_SCENE, { notice: this });
  }

  /**
   * Pauses every world scene running under the notice, one that came up since included (R10), and
   * the UI scene with them, or Esc would open its menu under the notice (FS-TQZ5J R5): a paused
   * scene hears no keys, clicks or wheel and does not update, and is still drawn.
   */
  holdWorlds(): void {
    for (const key of HELD_SCENES)
      if (statusOf(this.scenes, key) === RUNNING) this.scenes.pause(key);
  }

  /**
   * Return to menu (R12): the notice goes, every world scene and the menu starting, running or
   * paused stops (a world switch does not stop a paused one), and the main menu starts, which
   * reconnects. No socket is closed: game-service ends a stay at once on a client's normal close.
   */
  returnToMenu(): void {
    this.up = false;
    this.scenes.stop(NOTICE_SCENE);
    for (const key of WORLD_SCENES)
      if (inFlight(this.scenes, key) || statusOf(this.scenes, key) === PAUSED)
        this.scenes.stop(key);
    this.scenes.start(MENU_SCENE);
  }
}

/**
 * Raises the notice on the socket's lost connections for one game (R6). Returns the stop, for the
 * game's teardown: a close after the player left /game reaches no notice.
 */
export function watchConnectionLoss(
  socket: LostConnections,
  scenes: NoticeScenes,
): () => void {
  const notice = new DisconnectNotice(scenes);
  return socket.onConnectionLost(() => notice.lost());
}

/** Phaser's DOM layer over the canvas, as far as the notice touches it. */
export interface DomLayer {
  style: { display: string };
  contains(node: unknown): boolean;
}

/**
 * Hides the DOM layer over the canvas (the chat input, the party invite field: a browser element
 * draws above the canvas, so the dim cannot cover it) and blurs the field in it that had focus,
 * so no typing reaches it under the notice (R10). Returns the give-back. A game with no DOM layer
 * has nothing to hide.
 */
export function hideDomLayer(
  layer: DomLayer | null | undefined,
  doc: { activeElement: unknown },
): () => void {
  if (!layer) return () => {};
  const display = layer.style.display;
  const focused = doc.activeElement as { blur?: () => void } | null;
  if (focused && layer.contains(focused)) focused.blur?.();
  layer.style.display = "none";
  return () => {
    layer.style.display = display;
  };
}
