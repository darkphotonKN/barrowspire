/**
 * Which baked art each scene holds (FS-C4JWH §A, ADR-0059).
 *
 * The manifest's atlas pages fall into **atlas groups**, a page's key without its page number
 * (`boss-0`, `boss-1` → `boss`). A group is either **resident**, loaded at boot by PreloadScene
 * and kept for the game, or **scene-scoped**, loaded by the scenes that draw it and evicted once
 * the next scene has loaded without it. The table below is the one place that says which
 * scene-scoped groups each scene holds; every group it does not name is resident, so a group the
 * bake adds later costs memory, never draws as a placeholder by omission (§A R3). A scene-scoped
 * group may instead be **on demand** ({@link ON_DEMAND_ART}): in no scene's set, fetched while a
 * scene runs (FS-VHGE7 §F, ADR-0071), or a spec look's ({@link SPEC_LOOK_ART}, FS-1J1CB §C,
 * ADR-0088), fetched when the world state carries a player who wears it.
 *
 * Pure, so it is tested against the real manifest without a canvas. The loading itself is
 * `preloadArt` / `registerArt` (`phaser.ts`).
 */

import type { FieldId } from "@/assets/types/client";
import type { ClassKey } from "@/data/classLore";
import { SPECIALIZATIONS, specializationOf, type SpecializationId } from "@/data/specializations";
import type { MonsterArchetype } from "@/types/gameState";
import { palette } from "@/utils/canvasPalette";
import { characterSheet, classStem } from "./animationSelect";
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
    dev_test_room: ["creatures", "boss"],
  },
  BarrowspireScene: ["creatures", "boss"],
} as const satisfies {
  MainMenuScene: SceneGroups;
  CharacterCreationScene: SceneGroups;
  HubScene: SceneGroups;
  FieldScene: Record<FieldId, SceneGroups>;
  BarrowspireScene: SceneGroups;
};

/**
 * A scene-scoped group no scene preloads: it is fetched while a scene runs (FS-VHGE7 §F). One row
 * per archetype drawn from it; two rows on a group are still one fetch and one eviction, of the
 * group (FS-M8CSE §H R41).
 */
export interface OnDemandGroup {
  group: string;
  /** A monster archetype whose first listing in a snapshot fetches the group. */
  archetype: MonsterArchetype;
  /**
   * What that archetype draws until the group is in: another archetype's sheet, on a group its
   * scenes hold, under a multiply `tint`.
   */
  standIn: { archetype: MonsterArchetype; tint?: number };
}

/** The blood demon's group and what its archetypes draw until it is in. */
const BLOOD_DEMON_ART = {
  group: "blood_demon",
  standIn: { archetype: "demon", tint: palette.bloodDemonStandIn },
} as const;

/**
 * A Spire variant's group and stand-in (FS-C8VM7 §G R41, R44; ADR-0081 Decisions 1, 5): the group
 * is named by its variant id, and both of a goblin variant's looks are on it; until it is in, the
 * look draws `family`, a tier-1 look on `creatures`, under `tint` where one is named (the old
 * families' steps recolour their tier-1 look, so theirs is drawn as baked).
 */
const variantArt = (
  group: string,
  archetypes: readonly MonsterArchetype[],
  family: MonsterArchetype,
  tint?: number,
): OnDemandGroup[] =>
  archetypes.map((archetype) => ({
    group,
    archetype,
    standIn: tint === undefined ? { archetype: family } : { archetype: family, tint },
  }));

/** One variant per group, named by its own id, drawn as `family` meanwhile. */
const ownGroups = (variants: readonly MonsterArchetype[], family: MonsterArchetype, tint?: number) =>
  variants.flatMap((v) => variantArt(v, [v], family, tint));

/** A goblin variant's group holds its blade look and its blade-and-shield look (§A R8). */
const goblinGroups = (variants: readonly ("goblin" | "goblin_cutthroat" | "goblin_reaver" | "goblin_warchief")[]) =>
  variants.flatMap((v) => variantArt(v, [v, `${v}_shield`], "ghoul", palette.goblinStandIn));

/**
 * FS-C8VM7 §G R41: every Spire variant beyond the five tier-1 looks, each its own on-demand group
 * (ADR-0081 Decision 1), with its stand-in (R44: the goblin and the dark warrior as the ghoul, the
 * ogre as the troll, each tinted).
 */
export const VARIANT_ART: readonly OnDemandGroup[] = [
  ...ownGroups(["ghast", "ravener"], "ghoul"),
  ...ownGroups(["ashen_archer", "wight_archer"], "bone_archer"),
  ...ownGroups(["cave_troll", "blood_troll"], "troll"),
  ...ownGroups(["plague_thrall", "blightborn"], "barrow_thrall"),
  ...ownGroups(["shade", "phantom", "banshee"], "spire_wraith"),
  ...goblinGroups(["goblin", "goblin_cutthroat", "goblin_reaver", "goblin_warchief"]),
  ...ownGroups(["ogre", "ogre_mauler", "ogre_tyrant"], "troll", palette.ogreStandIn),
  ...ownGroups(["dark_warrior", "dark_reaper"], "ghoul", palette.darkWarriorStandIn),
];

/**
 * ADR-0071 Decision 2: the groups fetched on demand. A group here is scene-scoped, so boot skips
 * it and eviction frees it, and in no row of {@link SCENE_ART}; the coverage test
 * (`sceneArt.test.ts`) holds each to a stand-in its scenes hold.
 */
export const ON_DEMAND_ART: readonly OnDemandGroup[] = [
  { ...BLOOD_DEMON_ART, archetype: "blood_demon" },
  // ADR-0071 Decision 6, a table change: Daa'gon is drawn from the same sheet (FS-M8CSE §H R41)
  { ...BLOOD_DEMON_ART, archetype: "daagon" },
  // ADR-0081: the Spire's variants, by the same table (ADR-0071 Decision 6)
  ...VARIANT_ART,
];

/** The on-demand group an archetype's art is on, if any. */
export const onDemandFor = (archetype: string): OnDemandGroup | undefined =>
  ON_DEMAND_ART.find((entry) => entry.archetype === archetype);

/**
 * ADR-0081 Decisions 4, 6: the on-demand groups scoped to the floor, fetched with a floor whose pool
 * names them and evicted with one that does not. Only the variants' groups: the blood demon's keeps
 * its scene scope (ADR-0071).
 */
export const FLOOR_SCOPED_GROUPS: ReadonlySet<string> = new Set(VARIANT_ART.map((entry) => entry.group));

/**
 * The floor-scoped groups a floor map's `enemy_pool` names (FS-C8VM7 §G R40, R42), each once, in
 * the pool's order: a tier-1 look is on `creatures`, and an archetype on no variant group names none.
 */
export function poolGroups(pool: readonly string[]): string[] {
  const groups = pool
    .map((archetype) => onDemandFor(archetype)?.group)
    .filter((group): group is string => group !== undefined && FLOOR_SCOPED_GROUPS.has(group));
  return [...new Set(groups)];
}

/**
 * A spec look's group (FS-1J1CB R15, R26; ADR-0088 Decision 7): the look's sheet, packed alone in
 * group `<stem>_<spec>`, which a player of `playerClass` holding `specialization` fetches. Until
 * it is in, the body draws `standIn`, its class's base sheet, untinted.
 */
export interface SpecLookGroup {
  group: string;
  playerClass: ClassKey;
  specialization: SpecializationId;
  /** The look's sheet, `char_<stem>_<spec>`. */
  sheet: string;
  /** The class's base sheet, on a resident group (ADR-0059 Decision 1). */
  standIn: string;
}

/**
 * FS-1J1CB R18, R26 (ADR-0088 Decision 1): one row per spec look, each its own on-demand group,
 * scene-scoped and in no scene's set, so neither the boot download nor any scene's preload holds
 * one; a world fetches it when its state carries a player who wears it, and preloads only its own
 * player's (Decision 3). Named by the rule of R15 from FS-E1ZDG's eight, so a look the bake adds
 * is on demand by its name, and one not yet baked resolves to its base (R16).
 */
export const SPEC_LOOK_ART: readonly SpecLookGroup[] = (
  Object.entries(SPECIALIZATIONS) as [SpecializationId, (typeof SPECIALIZATIONS)[SpecializationId]][]
).map(([specialization, { class: playerClass }]) => ({
  group: `${classStem(playerClass)}_${specialization}`,
  playerClass,
  specialization,
  sheet: characterSheet(playerClass, specialization, () => true),
  standIn: characterSheet(playerClass),
}));

/**
 * The spec look a player of `playerClass` holding `specialization` wears, if any: none before the
 * pick, nor for an id the client does not know or one of another class (FS-1J1CB R16).
 */
export function specLookFor(
  playerClass: string,
  specialization: string | undefined,
): SpecLookGroup | undefined {
  const spec = specializationOf(playerClass, specialization);
  return spec && SPEC_LOOK_ART.find((row) => row.specialization === spec);
}

/** Every group the tables name: the scene-scoped groups (§A R2). */
export const SCENE_SCOPED_GROUPS: ReadonlySet<string> = new Set([
  ...[
    SCENE_ART.MainMenuScene,
    SCENE_ART.CharacterCreationScene,
    SCENE_ART.HubScene,
    ...Object.values(SCENE_ART.FieldScene),
    SCENE_ART.BarrowspireScene,
  ].flat(),
  ...ON_DEMAND_ART.map((entry) => entry.group),
  ...SPEC_LOOK_ART.map((row) => row.group),
]);

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
