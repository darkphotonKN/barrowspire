/**
 * Which baked art each scene holds (FS-C4JWH §A, ADR-0059).
 *
 * The manifest's atlas pages fall into **atlas groups**, a page's key without its page number
 * (`boss-0`, `boss-1` → `boss`). A group is either **resident**, loaded at boot by PreloadScene
 * and kept for the game, or **scene-scoped**, loaded by the scenes that draw it and evicted once
 * the next scene has loaded without it. The table below is the one place that says which
 * scene-scoped groups each scene holds; every group it does not name is resident, so a group the
 * bake adds later costs memory, never draws as a placeholder by omission (§A R3).
 *
 * Pure, so it is tested against the real manifest without a canvas. The loading itself is
 * `preloadArt` / `registerArt` (`phaser.ts`).
 */

import type { FieldId } from "@/assets/types/client";
import type { ArtManifest } from "./manifest";

/** The scene-scoped groups a scene holds beyond the resident ones. */
export type SceneGroups = readonly string[];

/** The resident art only, and no scene-scoped group: boot, and any scene the table does not name. */
export const RESIDENT_ART: SceneGroups = [];

/**
 * FS-C4JWH §A R4 (D3: what each scene draws today). The menus draw only class sheets; the hub
 * its townsfolk (`folkLook`); a field its wildlife or its dead, the run its creatures and the boss
 * on every floor (`MONSTER_LOOKS`, §B R9). The coverage test (`sceneArt.test.ts`) walks every
 * scene's sheets against it.
 */
export const SCENE_ART = {
  MainMenuScene: [],
  CharacterCreationScene: [],
  HubScene: ["folk"],
  FieldScene: {
    gentle_meadows: ["wildlife"],
    forlorn_forest: ["fodder"],
  },
  BarrowspireScene: ["creatures", "boss"],
} as const satisfies {
  MainMenuScene: SceneGroups;
  CharacterCreationScene: SceneGroups;
  HubScene: SceneGroups;
  FieldScene: Record<FieldId, SceneGroups>;
  BarrowspireScene: SceneGroups;
};

/** Every group the table names: the scene-scoped groups (§A R2). */
export const SCENE_SCOPED_GROUPS: ReadonlySet<string> = new Set(
  [
    SCENE_ART.MainMenuScene,
    SCENE_ART.CharacterCreationScene,
    SCENE_ART.HubScene,
    ...Object.values(SCENE_ART.FieldScene),
    SCENE_ART.BarrowspireScene,
  ].flat(),
);

/** The group an atlas page belongs to: its key without the page number (§A R1). */
export const atlasGroup = (atlas: string): string => atlas.replace(/-\d+$/, "");

/** A field's groups; a field the table does not know takes gentle_meadows', as its look does (§A R5). */
export function fieldArt(field: string | undefined): SceneGroups {
  const fields: Record<string, SceneGroups> = SCENE_ART.FieldScene;
  return field !== undefined && Object.hasOwn(fields, field)
    ? fields[field]
    : SCENE_ART.FieldScene.gentle_meadows;
}

/** The manifest's atlas pages a scene holding `groups` has: every resident page, and its own. */
export function sceneAtlases(
  manifest: Pick<ArtManifest, "atlases">,
  groups: SceneGroups,
): string[] {
  return Object.keys(manifest.atlases).filter((atlas) => {
    const group = atlasGroup(atlas);
    return !SCENE_SCOPED_GROUPS.has(group) || groups.includes(group);
  });
}
