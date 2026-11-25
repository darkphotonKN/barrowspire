/**
 * Which baked sheet a hub NPC is drawn from (FS-2325V §G): a resident's `appearance` or a
 * function NPC's `function`, as the server sends them, in; a sheet and palette variant out.
 *
 * Residents come in builds ("trousers", "skirt"), one sheet each, and an appearance is
 * `"<palette>_<build>"` (authored in the hub's map data). A build's sheet carries its first
 * palette as the plain `idle` / `walk` clips and every other palette in use as a variant,
 * `idle_<palette>` / `walk_<palette>` ({@link folkClip}), so one authored body serves every
 * resident of that build. A few residents are their own character instead, and their appearance
 * names a bespoke sheet ({@link BESPOKE_FOLK_SHEETS}; FS-R4MYX R18). Whatever does not resolve
 * falls back to the default villager, never to pixel art. Function NPCs are their own characters, whose role reads from the silhouette.
 *
 * Pure, so it is tested without a canvas; the scene plays the result through
 * `CharacterAnimator`, as it does a player.
 */

import type { NPCState } from "@/types/gameState";
import { variantClip, type CharacterLook } from "./character";

/** The fallback: an ordinary villager in the trousers build's first palette. */
export const DEFAULT_RESIDENT_SHEET = "folk_resident_trousers";

/** Each function NPC's own character. The Elder, the storyteller, is an ordinary townsman. */
export const FUNCTION_NPC_SHEETS: Record<
  Exclude<NPCState["function"], "">,
  string
> = {
  storyteller: DEFAULT_RESIDENT_SHEET,
  storekeeper: "folk_quartermaster",
};

/**
 * The residents drawn from a sheet of their own rather than a build: their `appearance` names the
 * look (FS-R4MYX R18, amending FS-2325V §G.2). Until the sheet is baked they are the default
 * villager.
 */
export const BESPOKE_FOLK_SHEETS: Readonly<Record<string, string>> = {
  confessor: "folk_confessor",
};

/** The clips a resident plays: they idle and walk, and never fight or fall. */
const FOLK_CLIPS = ["idle", "walk"] as const;

/** The slice of the art library {@link folkLook} reads. */
export interface FolkSheets {
  sheet(name: string): { animations: Record<string, unknown> } | undefined;
}

/** A clip's manifest animation name under a palette variant: `walk` → `walk_slate`. */
export function folkClip(clip: string, variant: string | undefined): string {
  return variantClip(clip, variant);
}

/** The sheet and variant an NPC is drawn from. */
export function folkLook(
  npc: Pick<NPCState, "function" | "appearance">,
  art: FolkSheets,
): CharacterLook {
  const fallback = { sheet: DEFAULT_RESIDENT_SHEET, variant: undefined };
  if (npc.function !== "") {
    return Object.hasOwn(FUNCTION_NPC_SHEETS, npc.function)
      ? { sheet: FUNCTION_NPC_SHEETS[npc.function], variant: undefined }
      : fallback;
  }

  const appearance = npc.appearance ?? "";
  if (Object.hasOwn(BESPOKE_FOLK_SHEETS, appearance)) {
    const bespoke = BESPOKE_FOLK_SHEETS[appearance];
    return art.sheet(bespoke) ? { sheet: bespoke, variant: undefined } : fallback;
  }

  const [palette, build] = appearance.split("_");
  const sheet = build ? art.sheet(`folk_resident_${build}`) : undefined;
  if (!sheet) return fallback;

  const carries = FOLK_CLIPS.every(
    (clip) => folkClip(clip, palette) in sheet.animations,
  );
  return {
    sheet: `folk_resident_${build}`,
    variant: carries ? palette : undefined,
  };
}
