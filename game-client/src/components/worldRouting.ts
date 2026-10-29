import type { WorldType } from "@/assets/types/client";

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

/**
 * Everything a world transition replaces. LoadoutScene is here because it is a screen the player
 * opens while standing in the hub: a match found with it open would otherwise leave it sitting on
 * top of the run.
 */
export const WORLD_SCENES = [
  "MainMenuScene",
  "HubScene",
  "LoadoutScene",
  "BarrowspireScene",
  "FieldScene",
];
