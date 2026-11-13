import type { WorldEnteredPayload, WorldType } from "@/assets/types/client";
import { RUNNING } from "@/scenes/sceneStatus";
import { inFlight, type SceneStatusReader } from "./bootGate";

/**
 * Which scene draws each kind of world (FS-29KSH §Requirements 15). A field never routes to the
 * run scene or the hub scene (FS-X2F2H §Requirements 55).
 */
const WORLD_SCENE: Record<WorldType, string> = {
  hub: "HubScene",
  run: "BarrowspireScene",
  field: "FieldScene",
};

export function sceneFor(worldType: WorldType): string {
  return WORLD_SCENE[worldType];
}

/** Everything a world transition replaces. */
export const WORLD_SCENES = [
  "MainMenuScene",
  "HubScene",
  "BarrowspireScene",
  "FieldScene",
];

/** The scene manager's slice a world switch uses. Phaser's `SceneManager` is one. */
export interface WorldSwitcher extends SceneStatusReader {
  stop(key: string): unknown;
  start(key: string, data?: object): unknown;
}

/**
 * Whether a `world_entered` is an arrival or a return (FS-PQ2TW R6). The page's kept place
 * (`arrivals`, ./arrival.ts) is one.
 */
export interface ArrivalJudge {
  isArrival(payload: WorldEnteredPayload): boolean;
}

/**
 * THE transition (FS-29KSH §Requirements 15, 36): every other world scene stops, then the
 * world's own starts with the payload's session and field, and whether it is an arrival: asked
 * here once, so no scene works it out for itself (FS-PQ2TW R8, ADR-0075 Decision 4).
 * `scene.start()` from the manager does not stop what is already running, unlike the same call
 * from inside a scene, so the previous world would stay live underneath.
 *
 * "Running" here is any scene starting or running (`inFlight`), not `isActive`: a world scene sits
 * LOADING while its art downloads (FS-C4JWH), and Phaser 4.2.1 counts only RUNNING as active. A
 * loading scene left alone keeps downloading, and its load completing would evict the next world's
 * art under its sprites. The target itself is stopped first while it is still loading: Phaser's
 * `start` lets a scene START..CREATING carry on and drops the new data (`SceneManager.start`), so a
 * field still loading for one field would come up as that field. A running target is restarted by
 * `start` itself.
 */
export function switchWorld(
  scenes: WorldSwitcher,
  payload: WorldEnteredPayload,
  arrivals: ArrivalJudge,
): void {
  const target = sceneFor(payload.world_type);
  for (const key of WORLD_SCENES) {
    if (!inFlight(scenes, key)) continue;
    const loading = (scenes.getScene(key)?.sys.settings.status ?? 0) < RUNNING;
    if (key !== target || loading) scenes.stop(key);
  }
  scenes.start(target, {
    sessionID: payload.session_id,
    field: payload.field,
    arrival: arrivals.isArrival(payload),
  });
}
