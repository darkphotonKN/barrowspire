import type { WorldEnteredPayload, WorldType } from "@/assets/types/client";

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
export interface WorldSwitcher {
  isActive(key: string): boolean;
  stop(key: string): unknown;
  start(key: string, data?: object): unknown;
}

/**
 * THE transition (FS-29KSH §Requirements 15, 36): every other world scene stops, then the
 * world's own starts with the payload's session and field. `scene.start()` from the manager does
 * not stop what is already running, unlike the same call from inside a scene, so the previous
 * world would stay live underneath.
 */
export function switchWorld(
  scenes: WorldSwitcher,
  payload: WorldEnteredPayload,
): void {
  const target = sceneFor(payload.world_type);
  for (const key of WORLD_SCENES) {
    if (key !== target && scenes.isActive(key)) scenes.stop(key);
  }
  scenes.start(target, {
    sessionID: payload.session_id,
    field: payload.field,
  });
}
