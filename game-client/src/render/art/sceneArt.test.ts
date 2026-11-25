import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { MONSTER_LOOKS, PLAYER_REFERENCE_SHEET, monsterLook } from "@/render/creatures/monsters";
import { palette } from "@/utils/canvasPalette";
import { characterSheet } from "./animationSelect";
import { DEFAULT_RESIDENT_SHEET, FUNCTION_NPC_SHEETS, folkLook } from "./hubFolk";
import { RESIDENT_ART_PAGES, shippedManifest } from "./artLoader.standin";
import { sheetAtlases, type ArtManifest } from "./manifest";
import {
  ENCOUNTER_ART,
  FLOOR_SCOPED_GROUPS,
  NPC_ART,
  ON_DEMAND_ART,
  RESIDENT_ART,
  VARIANT_ART,
  SCENE_ART,
  SCENE_SCOPED_GROUPS,
  SPEC_LOOK_ART,
  atlasGroup,
  encounterLook,
  fieldArt,
  npcArtFor,
  onDemandFor,
  poolGroups,
  sceneAtlases,
  specLookFor,
  type OnDemandGroup,
} from "./sceneArt";

const manifest = shippedManifest();

const sorted = (keys: Iterable<string>) => [...keys].sort();

/** FS-C8VM7 §G R41: the Spire variants' groups, each named by its variant id. */
const VARIANT_GROUPS = [
  "ghast", "ravener", "ashen_archer", "wight_archer", "cave_troll", "blood_troll", "plague_thrall",
  "blightborn", "shade", "phantom", "banshee", "goblin", "goblin_cutthroat", "goblin_reaver",
  "goblin_warchief", "ogre", "ogre_mauler", "ogre_tyrant", "dark_warrior", "dark_reaper",
];

/** FS-1J1CB R15: the eight spec looks' groups, `<stem>_<spec>`. */
const SPEC_LOOK_GROUPS = [
  "knight_guardian", "knight_berserker", "wizard_spellwarden", "wizard_pyromancer", "archer_hunter",
  "archer_shadow_ranger", "mercenary_duelist", "mercenary_sellsword",
];

/** Groups the shipped manifest has pages on. */
const bakedGroups = (m: ArtManifest) => new Set(Object.keys(m.atlases).map(atlasGroup));

describe("the scene art table (FS-C4JWH §A)", () => {
  it("should hold exactly the FS's rows (R4)", () => {
    expect(SCENE_ART).toEqual({
      MainMenuScene: [],
      CharacterCreationScene: [],
      HubScene: ["folk"],
      FieldScene: {
        gentle_meadows: ["wildlife"],
        forlorn_forest: ["fodder"],
        dev_test_room: ["creatures", "boss"],
      },
      BarrowspireScene: ["creatures", "boss"],
    });
  });

  it("should take the scene-scoped groups from the table, and only those (R2)", () => {
    expect(sorted(SCENE_SCOPED_GROUPS)).toEqual(
      sorted(["blood_demon", "boss", "creatures", "encounter", "fodder", "folk", "merchant", "wildlife", ...VARIANT_GROUPS, ...SPEC_LOOK_GROUPS]),
    );
  });

  it("should name each atlas page's group by its key without the page number (R1)", () => {
    expect(atlasGroup("boss-1")).toBe("boss");
    expect(atlasGroup("knight-0")).toBe("knight");
    expect(atlasGroup("some-long-name-12")).toBe("some-long-name");
  });

  it("should give each field its own groups, and an unknown field gentle_meadows' (R5)", () => {
    expect(fieldArt("gentle_meadows")).toEqual(["wildlife"]);
    expect(fieldArt("forlorn_forest")).toEqual(["fodder"]);
    expect(fieldArt("dev_test_room")).toEqual(["creatures", "boss"]);
    expect(fieldArt("some_new_field")).toEqual(["wildlife"]);
    expect(fieldArt(undefined)).toEqual(["wildlife"]);
    expect(fieldArt("toString")).toEqual(["wildlife"]);
  });

  // a spec look not yet baked is skipped, not an error (FS-1J1CB R26)
  it("should name only groups the shipped manifest has, every variant group among them (FS-C8VM7 §H)", () => {
    const groups = bakedGroups(manifest);
    for (const group of SCENE_SCOPED_GROUPS)
      if (!SPEC_LOOK_GROUPS.includes(group)) expect(groups, group).toContain(group);
    for (const group of VARIANT_GROUPS) expect(groups, group).toContain(group);
  });
});

describe("a scene's atlas pages (FS-C4JWH §A R3, §B R6–R7)", () => {
  it("should hold the 22 resident pages and no scene-scoped one at boot", () => {
    expect(RESIDENT_ART_PAGES).toHaveLength(22);
    expect(sorted(sceneAtlases(manifest, RESIDENT_ART))).toEqual([...RESIDENT_ART_PAGES]);
  });

  it("should keep the tome and altar's group resident, and no variant group (FS-3103M §I, ADR-0081)", () => {
    const boot = sceneAtlases(manifest, RESIDENT_ART).map(atlasGroup);
    expect(boot).toContain("summoning");
    expect(SCENE_SCOPED_GROUPS.has("summoning")).toBe(false);
    for (const group of VARIANT_GROUPS) expect(boot).not.toContain(group);
  });

  it("should keep the sealed floor's props resident, so the run draws them on any floor (FS-5FZ4J §K R57)", () => {
    expect(sceneAtlases(manifest, RESIDENT_ART).map(atlasGroup)).toContain("sealed");
    expect(SCENE_SCOPED_GROUPS.has("sealed")).toBe(false);
  });

  it.each([
    ["the hub", SCENE_ART.HubScene, ["folk-0"]],
    ["gentle_meadows", fieldArt("gentle_meadows"), ["wildlife-0", "wildlife-1"]],
    ["forlorn_forest", fieldArt("forlorn_forest"), ["fodder-0", "fodder-1"]],
    ["the run", SCENE_ART.BarrowspireScene, ["boss-0", "boss-1", "boss-2", "creatures-0", "creatures-1", "creatures-2", "creatures-3", "creatures-4"]],
    ["the main menu", SCENE_ART.MainMenuScene, []],
    ["character creation", SCENE_ART.CharacterCreationScene, []],
  ])("should hold the resident pages plus %s's own", (_scene, groups, own) => {
    expect(sorted(sceneAtlases(manifest, groups))).toEqual(sorted([...RESIDENT_ART_PAGES, ...own]));
  });

  it("should keep a group the table does not name resident", () => {
    const grown = structuredClone(manifest);
    grown.atlases["newgroup-0"] = { ...manifest.atlases["props-0"], image: "newgroup-0.png" };
    expect(sceneAtlases(grown, RESIDENT_ART)).toContain("newgroup-0");
    expect(sceneAtlases(grown, SCENE_ART.HubScene)).toContain("newgroup-0");
  });
});

describe("the on-demand groups (FS-VHGE7 §F, ADR-0071)", () => {
  /** Every group a scene's preload may queue. */
  const preloaded = [
    SCENE_ART.MainMenuScene,
    SCENE_ART.CharacterCreationScene,
    SCENE_ART.HubScene,
    ...Object.values(SCENE_ART.FieldScene),
    SCENE_ART.BarrowspireScene,
  ].flat() as string[];

  it("should name the blood demon's group, what fetches it and what it draws meanwhile (R43, R46)", () => {
    expect(ON_DEMAND_ART.filter((entry) => entry.group === "blood_demon")).toEqual([
      {
        group: "blood_demon",
        archetype: "blood_demon",
        standIn: { archetype: "demon", tint: palette.bloodDemonStandIn },
      },
      {
        group: "blood_demon",
        archetype: "daagon",
        standIn: { archetype: "demon", tint: palette.bloodDemonStandIn },
      },
    ]);
    expect(onDemandFor("blood_demon")?.group).toBe("blood_demon");
    expect(onDemandFor("demon")).toBeUndefined();
  });

  it("should put Daa'gon on the blood demon's group, with the blood demon's stand-in (FS-M8CSE §H R41)", () => {
    expect(onDemandFor("daagon")?.group).toBe("blood_demon");
    expect(onDemandFor("daagon")?.standIn).toEqual(onDemandFor("blood_demon")?.standIn);
  });

  it("should count a group with two archetypes once, so its pages are fetched and evicted as one (FS-M8CSE §H R41)", () => {
    expect(new Set(ON_DEMAND_ART.map((entry) => entry.group))).toEqual(new Set(["blood_demon", ...VARIANT_GROUPS]));
    expect(sorted(SCENE_SCOPED_GROUPS).filter((group) => group === "blood_demon")).toEqual(["blood_demon"]);
    const pages = sceneAtlases(manifest, ["blood_demon"]);
    expect(pages.length).toBe(new Set(pages).size);
  });

  it("should count each among the scene-scoped groups, and in no scene's preload set (R43, R52)", () => {
    for (const { group } of ON_DEMAND_ART) {
      expect(SCENE_SCOPED_GROUPS).toContain(group);
      expect(preloaded).not.toContain(group);
    }
  });

  it("should leave dev_test_room's preload list as it was (R51)", () => {
    expect(fieldArt("dev_test_room")).toEqual(["creatures", "boss"]);
  });

  it("should leave boot and the run without the group's pages (R43)", () => {
    const blood = Object.keys(manifest.atlases).filter((a) => atlasGroup(a) === "blood_demon");
    expect(blood.length).toBeGreaterThan(0);
    for (const groups of [RESIDENT_ART, SCENE_ART.BarrowspireScene])
      for (const page of blood) expect(sceneAtlases(manifest, groups)).not.toContain(page);
  });

  it("should find the sheet on the group's pages, and only the green demon on boss's (R42)", () => {
    expect(sheetAtlases(manifest.sheets.creature_blood_demon_base).map(atlasGroup)).toEqual(
      expect.arrayContaining(["blood_demon"]),
    );
    expect(new Set(sheetAtlases(manifest.sheets.creature_blood_demon_base).map(atlasGroup))).toEqual(
      new Set(["blood_demon"]),
    );
    const onBoss = Object.entries(manifest.sheets)
      .filter(([, sheet]) => sheetAtlases(sheet).some((a) => atlasGroup(a) === "boss"))
      .map(([name]) => name);
    expect(onBoss).toEqual(["creature_demon_base"]);
    expect(manifest.sheets.creature_demon_base.animations.claw).toBeDefined();
  });
});

describe("the wandering merchant's group (FS-9JV5K §G R26, ADR-0071 Decision 6)", () => {
  const preloaded = [
    SCENE_ART.MainMenuScene,
    SCENE_ART.CharacterCreationScene,
    SCENE_ART.HubScene,
    ...Object.values(SCENE_ART.FieldScene),
    SCENE_ART.BarrowspireScene,
  ].flat() as string[];
  const merchantPages = () => Object.keys(manifest.atlases).filter((a) => atlasGroup(a) === "merchant");

  it("should name his group, the state key that fetches it, his sheet and what he draws meanwhile", () => {
    expect(NPC_ART).toEqual([
      {
        group: "merchant",
        stateKey: "merchant",
        sheet: "npc_merchant",
        standIn: { sheet: "char_mercenary_base", tint: palette.merchantStandIn },
      },
    ]);
    expect(npcArtFor("merchant")?.group).toBe("merchant");
    expect(npcArtFor("npcs")).toBeUndefined();
  });

  it("should bake his sheet idle only, in eight facings, on his group's pages alone", () => {
    const sheet = manifest.sheets.npc_merchant;
    expect(sheet.directions).toBe(8);
    expect(Object.keys(sheet.animations)).toEqual(["idle"]);
    expect(new Set(sheetAtlases(sheet).map(atlasGroup))).toEqual(new Set(["merchant"]));
    expect(merchantPages().length).toBeGreaterThan(0);
  });

  it("should keep his group scene-scoped, in no scene's preload set, out of boot and the run's preload", () => {
    expect(SCENE_SCOPED_GROUPS.has("merchant")).toBe(true);
    expect(preloaded).not.toContain("merchant");
    for (const groups of [RESIDENT_ART, SCENE_ART.BarrowspireScene])
      for (const page of merchantPages()) expect(sceneAtlases(manifest, groups)).not.toContain(page);
  });

  it("should draw a stand-in on a resident group meanwhile, so the run holds it on any floor", () => {
    for (const { standIn } of NPC_ART) {
      expect(manifest.sheets[standIn.sheet]).toBeDefined();
      expect(outsideScene(manifest, RESIDENT_ART, [standIn.sheet])).toEqual([]);
    }
  });
});

describe("the dungeon encounters' group (FS-4EC7Z §H R36, ADR-0071 Decision 6)", () => {
  const preloaded = [
    SCENE_ART.MainMenuScene,
    SCENE_ART.CharacterCreationScene,
    SCENE_ART.HubScene,
    ...Object.values(SCENE_ART.FieldScene),
    SCENE_ART.BarrowspireScene,
  ].flat() as string[];
  const pages = () => Object.keys(manifest.atlases).filter((a) => atlasGroup(a) === "encounter");

  it("should name its group, the state key and the archetypes that fetch it, and what it draws meanwhile", () => {
    expect(ENCOUNTER_ART.group).toBe("encounter");
    expect(ENCOUNTER_ART.stateKey).toBe("encounter_npcs");
    expect(ENCOUNTER_ART.archetypes).toEqual(["cutthroat", "contract_mark"]);
    expect(ENCOUNTER_ART.standIn).toEqual({ sheet: "char_mercenary_base", tint: palette.encounterStandIn });
  });

  it("should draw each look the server sends from its sheet and its variant's clips", () => {
    expect(encounterLook("pilgrim_a")).toEqual({ sheet: "npc_pilgrim", suffix: "" });
    expect(encounterLook("pilgrim_b")).toEqual({ sheet: "npc_pilgrim", suffix: "_b" });
    expect(encounterLook("pilgrim_c")).toEqual({ sheet: "npc_pilgrim", suffix: "_c" });
    expect(encounterLook("captive_b")).toEqual({ sheet: "npc_captive", suffix: "_b" });
    expect(encounterLook("cutthroat_a")).toEqual({ sheet: "npc_cutthroat", suffix: "" });
    expect(encounterLook("hooded_duelist")).toEqual({ sheet: "npc_hooded_duelist", suffix: "" });
    expect(encounterLook("debtor_knight")).toEqual({ sheet: "npc_debtor_knight", suffix: "" });
  });

  it("should draw a variant the bake lacks as its kind's first, and a kind it lacks as nothing", () => {
    expect(encounterLook("cutthroat_c")).toEqual({ sheet: "npc_cutthroat", suffix: "" });
    expect(encounterLook("ogre_a")).toBeUndefined();
    expect(encounterLook("toString")).toBeUndefined();
    expect(encounterLook("constructor_b")).toBeUndefined();
  });

  it("should bake every look's sheet and clips on the group's pages alone", () => {
    for (const [look, { sheet, suffix }] of Object.entries(ENCOUNTER_ART.looks)) {
      const baked = manifest.sheets[sheet];
      expect(baked, look).toBeDefined();
      expect(baked.directions, look).toBe(8);
      for (const clip of ["idle", "walk", "attack", "death"]) expect(baked.animations, `${look} ${clip}${suffix}`).toHaveProperty(`${clip}${suffix}`);
      expect(new Set(sheetAtlases(baked).map(atlasGroup)), look).toEqual(new Set(["encounter"]));
    }
    expect(manifest.sheets.npc_pilgrim.animations).toHaveProperty("cower_c");
    expect(manifest.sheets.npc_captive.animations).toHaveProperty("bound_b");
    expect(pages().length).toBeGreaterThan(0);
  });

  it("should keep its group scene-scoped, in no scene's preload set, out of boot and the run's preload", () => {
    expect(SCENE_SCOPED_GROUPS.has("encounter")).toBe(true);
    expect(preloaded).not.toContain("encounter");
    for (const groups of [RESIDENT_ART, SCENE_ART.BarrowspireScene])
      for (const page of pages()) expect(sceneAtlases(manifest, groups)).not.toContain(page);
  });

  it("should draw a stand-in on a resident group meanwhile, and keep the cage and its key resident", () => {
    expect(outsideScene(manifest, RESIDENT_ART, [ENCOUNTER_ART.standIn.sheet, "cage", "cage_key"])).toEqual([]);
  });
});

// ── Coverage (FS-C4JWH §E R21) ──────────────────────────────────────────────

/**
 * The archetypes each scene meets, as game-service spawns them (read, not imported: the server
 * owns the spawns, so this is where the client says what it expects; D9).
 *
 * - gentle_meadows: boar (`internal/game/meadows_map.go:29`, FS-X2F2H §H R61)
 * - forlorn_forest: zombie and ghost (`internal/game/forest_map.go:42-43`, FS-3QHQZ §C R29)
 * - dev_test_room: troll, elite troll and demon (`internal/game/dev_test_room.go`, FS-BDRTJ R14)
 * - the run: ghoul, troll, Barrow Thrall and Spire Wraith on every floor (FS-M8CSE §D R18), the
 *   demon on the top one and by chance on any other
 *   (`internal/game/monster_population.go:129,145-147`), and the blood demon by chance on any
 *   floor (FS-VHGE7 §A, §C R30), and Daa'gon on a Master Spire's top floor (FS-M8CSE §E R24);
 *   the Bone Archer in place of some of floor 1's ghouls (FS-B4SG9 §B); every tiered variant
 *   a floor's pool can draw, and a champion of any of them on the top floor (FS-C8VM7 §C, §D)
 */
const MET = [
  { scene: "gentle_meadows", groups: fieldArt("gentle_meadows"), archetypes: ["boar"] },
  { scene: "forlorn_forest", groups: fieldArt("forlorn_forest"), archetypes: ["zombie", "ghost"] },
  { scene: "dev_test_room", groups: fieldArt("dev_test_room"), archetypes: ["troll", "demon"] },
  {
    scene: "the run",
    groups: SCENE_ART.BarrowspireScene,
    archetypes: [
      "ghoul", "troll", "bone_archer", "barrow_thrall", "spire_wraith", "demon", "blood_demon", "daagon",
      ...VARIANT_ART.map((entry) => entry.archetype),
    ],
  },
];

/** The sheets of `sheets` the scene holding `groups` would draw as a placeholder. */
function outsideScene(m: ArtManifest, groups: readonly string[], sheets: Iterable<string>): string[] {
  const held = new Set(sceneAtlases(m, groups));
  return [...new Set(sheets)].filter(
    (name) => !m.sheets[name] || !sheetAtlases(m.sheets[name]).every((atlas) => held.has(atlas)),
  );
}

/** Every sheet `folkLook` can return: each function NPC, the fallback, each build the art has. */
function folkSheets(m: ArtManifest): string[] {
  const art = { sheet: (name: string) => m.sheets[name] };
  const functions = Object.keys(FUNCTION_NPC_SHEETS) as (keyof typeof FUNCTION_NPC_SHEETS)[];
  const builds = Object.keys(m.sheets)
    .filter((name) => name.startsWith("folk_resident_"))
    .map((name) => name.slice("folk_resident_".length));
  return [
    DEFAULT_RESIDENT_SHEET,
    ...functions.map((fn) => folkLook({ function: fn, appearance: "" }, art).sheet),
    ...builds.map((build) => folkLook({ function: "", appearance: `any_${build}` }, art).sheet),
  ];
}

/** Every sheet an archetype may be drawn from: its look's own and its elite's. */
const monsterSheets = (archetypes: readonly string[]) =>
  archetypes.flatMap((archetype) => {
    const look = monsterLook(archetype);
    return look.elite ? [look.sheet, look.elite] : [look.sheet];
  });

/**
 * What each archetype draws before its art can be there (FS-VHGE7 §F R52): a sheet on an on-demand
 * group is answered by its archetype's stand-in, and stays itself, to be reported, without one. A
 * sheet the bake has not made yet is never in, so it is answered the same way (FS-C8VM7 §G R44).
 */
const entrySheets = (
  m: ArtManifest,
  archetypes: readonly string[],
  table: readonly OnDemandGroup[] = ON_DEMAND_ART,
) =>
  archetypes.flatMap((archetype) =>
    monsterSheets([archetype]).map((sheet) => {
      const own = m.sheets[sheet];
      const onDemand =
        !own || sheetAtlases(own).some((a) => table.some((entry) => entry.group === atlasGroup(a)));
      const standIn = table.find((entry) => entry.archetype === archetype)?.standIn;
      return onDemand && standIn ? monsterLook(standIn.archetype).sheet : sheet;
    }),
  );

/** The archetypes with a look that no scene in {@link MET} meets. */
const unmet = (looks: Record<string, unknown>) =>
  Object.keys(looks).filter((archetype) => !MET.some((s) => s.archetypes.includes(archetype)));

describe("every scene-scoped sheet a scene draws lies in its groups (FS-C4JWH §E R21)", () => {
  it("should hold every sheet folkLook can return in the hub", () => {
    const sheets = folkSheets(manifest);
    expect(sheets).toContain("folk_quartermaster");
    expect(sheets).toContain("folk_resident_skirt");
    expect(outsideScene(manifest, SCENE_ART.HubScene, sheets)).toEqual([]);
  });

  it.each(MET)("should hold every archetype $scene meets, its elite sheet included", ({ groups, archetypes }) => {
    expect(outsideScene(manifest, groups, entrySheets(manifest, archetypes))).toEqual([]);
  });

  it("should have every MONSTER_LOOKS archetype met by some scene", () => {
    expect(unmet(MONSTER_LOOKS)).toEqual([]);
  });

  it("should keep the class sheets and the monster sizing reference on resident groups", () => {
    const sheets = ["mage", "archer", "mercenary", "warrior", undefined].map((cls) => characterSheet(cls));
    expect(new Set(sheets).size).toBe(4);
    expect(outsideScene(manifest, RESIDENT_ART, [...sheets, PLAYER_REFERENCE_SHEET])).toEqual([]);
  });

  // What ties MET and the hub's row to the code: the client draws a folk sheet only through
  // folkLook and a creature only through a MonsterRoster, and names those sheets nowhere else.
  it("should find folk drawn only by the hub, and creatures only by the run and the fields", () => {
    const src = join(__dirname, "../..");
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !/\.(test|standin)\./.test(e.name) ? [join(dir, e.name)] : [],
      );
    const using = (pattern: RegExp) =>
      files(src)
        .filter((f) => pattern.test(readFileSync(f, "utf8")))
        .map((f) => relative(src, f))
        .sort();

    expect(using(/\bfolkLook\(/)).toEqual(["render/art/hubFolk.ts", "scenes/HubScene.ts"]);
    // fieldCombat is the field's (FieldScene's fieldCombatOnScene), for both fields in MET
    expect(using(/new MonsterRoster\(/)).toEqual(["scenes/BarrowspireScene.ts", "scenes/fieldCombat.ts"]);
    expect(using(/fieldCombatOnScene\(/)).toEqual(["scenes/FieldScene.ts", "scenes/fieldCombat.ts"]);
    expect(using(/["`](folk|creature)_/)).toEqual(["render/art/hubFolk.ts", "render/creatures/monsters.ts"]);
    expect(MET.map((s) => s.scene)).toEqual(["gentle_meadows", "forlorn_forest", "dev_test_room", "the run"]);
  });

  describe("the coverage check itself", () => {
    /** The manifest with `sheet` moved onto `atlas`. */
    const moved = (sheet: string, atlas: string) => {
      const m = structuredClone(manifest);
      m.sheets[sheet].atlas = atlas;
      for (const anim of Object.values(m.sheets[sheet].animations)) delete anim.atlas;
      return m;
    };

    it("should report a folk sheet moved to a group the hub does not hold", () => {
      const m = moved("folk_resident_skirt", "wildlife-0");
      expect(outsideScene(m, SCENE_ART.HubScene, folkSheets(m))).toEqual(["folk_resident_skirt"]);
    });

    it("should report a monster look moved to a group its scene does not hold", () => {
      const m = moved("creature_boar_elite", "fodder-0");
      expect(outsideScene(m, fieldArt("gentle_meadows"), monsterSheets(["boar"]))).toEqual([
        "creature_boar_elite",
      ]);
    });

    it("should report a look on an on-demand group with no stand-in (FS-VHGE7 §F R52)", () => {
      const noStandIn = [{ ...ON_DEMAND_ART[0], archetype: "ghoul" as const }];
      expect(
        outsideScene(manifest, SCENE_ART.BarrowspireScene, entrySheets(manifest, ["blood_demon"], noStandIn)),
      ).toEqual(["creature_blood_demon_base"]);
    });

    it("should report a stand-in on a group its scene does not hold (FS-VHGE7 §F R52)", () => {
      expect(
        outsideScene(manifest, fieldArt("forlorn_forest"), entrySheets(manifest, ["blood_demon"])),
      ).toEqual(["creature_demon_base"]);
    });

    it("should report a variant with no stand-in whose sheet is not baked (FS-C8VM7 §G R44)", () => {
      const unbaked = structuredClone(manifest);
      delete unbaked.sheets.creature_ogre_base;
      const noStandIn = VARIANT_ART.filter((entry) => entry.archetype !== "ogre");
      expect(
        outsideScene(unbaked, SCENE_ART.BarrowspireScene, entrySheets(unbaked, ["ogre", "ghast"], noStandIn)),
      ).toEqual(["creature_ogre_base"]);
    });

    it("should report a baked variant with no stand-in, its group not one the run preloads (FS-C8VM7 §G R44)", () => {
      const noStandIn = VARIANT_ART.filter((entry) => entry.archetype !== "ogre");
      expect(
        outsideScene(manifest, SCENE_ART.BarrowspireScene, entrySheets(manifest, ["ogre", "ghast"], noStandIn)),
      ).toEqual(["creature_ogre_base"]);
    });

    it("should report an archetype with a look that no scene meets", () => {
      expect(unmet({ ...MONSTER_LOOKS, wraith: MONSTER_LOOKS.ghost })).toEqual(["wraith"]);
    });
  });
});

describe("the Spire variants' groups (FS-C8VM7 §G R41, R44; ADR-0081)", () => {
  /** The five tier-1 looks, loaded with the run on `creatures` (R41). */
  const TIER_ONE = ["ghoul", "bone_archer", "troll", "barrow_thrall", "spire_wraith"];
  const creaturePages = (sheet: string) => sheetAtlases(manifest.sheets[sheet]).map(atlasGroup);

  it("should put every variant beyond the five tier-1 looks on a group named by its variant id", () => {
    expect(new Set(VARIANT_ART.map((entry) => entry.group))).toEqual(new Set(VARIANT_GROUPS));
    for (const group of VARIANT_GROUPS) expect(onDemandFor(group)?.group).toBe(group);
    for (const archetype of TIER_ONE) expect(onDemandFor(archetype)).toBeUndefined();
  });

  it("should put a goblin variant's two looks on one group (R41)", () => {
    for (const v of ["goblin", "goblin_cutthroat", "goblin_reaver", "goblin_warchief"]) {
      expect(onDemandFor(`${v}_shield`)?.group).toBe(v);
      expect(onDemandFor(`${v}_shield`)?.standIn).toEqual(onDemandFor(v)?.standIn);
    }
  });

  it("should have a look of its own for every variant row, never the troll fallback", () => {
    for (const { archetype } of VARIANT_ART)
      expect(MONSTER_LOOKS[archetype]?.sheet).toBe(`creature_${archetype}_base`);
  });

  it("should hold every variant row to a stand-in on creatures, which every Spire floor holds (R44)", () => {
    for (const { standIn } of VARIANT_ART) {
      expect(TIER_ONE).toContain(standIn.archetype);
      expect(new Set(creaturePages(monsterLook(standIn.archetype).sheet))).toEqual(new Set(["creatures"]));
    }
  });

  it("should name the new families' stand-ins and tints: the goblin and dark warrior as the ghoul, the ogre as the troll", () => {
    const standIn = (archetype: string) => onDemandFor(archetype)?.standIn;
    expect(standIn("goblin_warchief")).toEqual({ archetype: "ghoul", tint: palette.goblinStandIn });
    expect(standIn("ogre_mauler")).toEqual({ archetype: "troll", tint: palette.ogreStandIn });
    expect(standIn("dark_warrior")).toEqual({ archetype: "ghoul", tint: palette.darkWarriorStandIn });
    expect(standIn("banshee")).toEqual({ archetype: "spire_wraith" });
    expect(standIn("ashen_archer")).toEqual({ archetype: "bone_archer" });
  });

  // never `creatures` or `boss`, so a floor fetches and evicts each on its own (ADR-0081 Consequences)
  it("should find each variant sheet baked, on its own group's pages only (FS-C8VM7 §H)", () => {
    for (const { group, archetype } of VARIANT_ART) {
      const sheet = manifest.sheets[monsterLook(archetype).sheet];
      expect(sheet, archetype).toBeDefined();
      expect(new Set(sheetAtlases(sheet).map(atlasGroup)), archetype).toEqual(new Set([group]));
    }
  });
});

describe("the floor-scoped groups and a floor's pool (FS-C8VM7 §G R40-R43, ADR-0081 Decisions 2, 6)", () => {
  it("should scope exactly the variant groups to the floor, and never the blood demon's", () => {
    expect(sorted(FLOOR_SCOPED_GROUPS)).toEqual(sorted(VARIANT_GROUPS));
    expect(FLOOR_SCOPED_GROUPS.has("blood_demon")).toBe(false);
    for (const group of FLOOR_SCOPED_GROUPS) expect(SCENE_SCOPED_GROUPS).toContain(group);
  });

  it("should name the groups of a pool's archetypes, a goblin variant's two looks as one, each once", () => {
    expect(poolGroups(["ghoul", "ghast", "goblin", "goblin_shield", "goblin_reaver_shield", "ogre_tyrant"])).toEqual([
      "ghast",
      "goblin",
      "goblin_reaver",
      "ogre_tyrant",
    ]);
  });

  it("should name no group for a tier-1 look, a boss or an archetype it does not know", () => {
    expect(poolGroups(["ghoul", "troll", "bone_archer", "barrow_thrall", "spire_wraith"])).toEqual([]);
    expect(poolGroups(["blood_demon", "daagon", "demon", "wyrm"])).toEqual([]);
  });
});

// FS-1J1CB §C R18, R26; ADR-0088 Decisions 1, 7: each spec look its own on-demand group.
describe("the spec looks' groups (FS-1J1CB §C)", () => {
  /** Every group a scene's preload set names. */
  const preloaded = [
    SCENE_ART.MainMenuScene,
    SCENE_ART.CharacterCreationScene,
    SCENE_ART.HubScene,
    ...Object.values(SCENE_ART.FieldScene),
    SCENE_ART.BarrowspireScene,
  ].flat() as string[];

  /**
   * The shipped manifest with a synthetic Berserker look: its sheet alone in its own group,
   * spilling to a second page, at 1.5x (R15). A fixture for a look over two pages: the shipped
   * Berserker's has fitted one page since his re-bake without the attacks on the move (FS-JS7C8
   * R154).
   */
  const withBerserker = () => {
    const m = structuredClone(manifest);
    const page = (image: string) => ({ ...manifest.atlases["knight-0"], image });
    m.atlases["knight_berserker-0"] = page("knight_berserker-0.png");
    m.atlases["knight_berserker-1"] = page("knight_berserker-1.png");
    const look = structuredClone(manifest.sheets.char_knight_base);
    look.atlas = "knight_berserker-1";
    for (const [clip, anim] of Object.entries(look.animations))
      anim.atlas = clip === "idle" ? "knight_berserker-1" : "knight_berserker-0";
    m.sheets.char_knight_berserker = { ...look, scale: 1.5 };
    return m;
  };

  it("should hold one row per look: its group, the class and spec that fetch it, the base as stand-in (R26)", () => {
    expect(SPEC_LOOK_ART).toHaveLength(8);
    expect(SPEC_LOOK_ART.map((row) => row.group)).toEqual(SPEC_LOOK_GROUPS);
    expect(SPEC_LOOK_ART.find((row) => row.group === "knight_berserker")).toEqual({
      group: "knight_berserker",
      playerClass: "warrior",
      specialization: "berserker",
      sheet: "char_knight_berserker",
      standIn: "char_knight_base",
    });
    for (const row of SPEC_LOOK_ART) {
      expect(characterSheet(row.playerClass, row.specialization, () => true)).toBe(row.sheet);
      expect(row.standIn).toBe(characterSheet(row.playerClass));
    }
  });

  it("should find a class's look by its spec, and none for a spec of another class or an unknown one", () => {
    expect(specLookFor("mage", "spellwarden")?.group).toBe("wizard_spellwarden");
    expect(specLookFor("Archer", "shadow_ranger")?.group).toBe("archer_shadow_ranger");
    expect(specLookFor("warrior", "spellwarden")).toBeUndefined();
    expect(specLookFor("warrior", "warlock")).toBeUndefined();
    expect(specLookFor("warrior", undefined)).toBeUndefined();
  });

  it("should count each look's group scene-scoped, and in no scene's preload set nor any monster table (R18)", () => {
    for (const group of SPEC_LOOK_GROUPS) {
      expect(SCENE_SCOPED_GROUPS).toContain(group);
      expect(preloaded).not.toContain(group);
      expect(ON_DEMAND_ART.map((entry) => entry.group)).not.toContain(group);
      expect(FLOOR_SCOPED_GROUPS.has(group)).toBe(false);
    }
  });

  it("should hold every look's stand-in on a resident group, whether or not its sheet is baked (R26)", () => {
    expect(outsideScene(manifest, RESIDENT_ART, SPEC_LOOK_ART.map((row) => row.standIn))).toEqual([]);
  });

  it("should leave the boot download and every scene's pages unchanged by a baked look's two pages (R18)", () => {
    const grown = withBerserker();
    for (const groups of [RESIDENT_ART, ...preloadSets()])
      expect(sorted(sceneAtlases(grown, groups))).toEqual(sorted(sceneAtlases(manifest, groups)));
    expect(sorted(sceneAtlases(grown, RESIDENT_ART))).toEqual([...RESIDENT_ART_PAGES]);
  });

  it("should hold a look's pages only in a scene whose set names its group (ADR-0088 Decision 3)", () => {
    const grown = withBerserker();
    expect(sorted(sceneAtlases(grown, [...SCENE_ART.HubScene, "knight_berserker"]))).toEqual(
      sorted([...RESIDENT_ART_PAGES, "folk-0", "knight_berserker-0", "knight_berserker-1"]),
    );
    expect(outsideScene(grown, [...SCENE_ART.HubScene, "knight_berserker"], ["char_knight_berserker"])).toEqual([]);
    expect(outsideScene(grown, SCENE_ART.HubScene, ["char_knight_berserker"])).toEqual(["char_knight_berserker"]);
  });

  /** Each scene's preload set, each field's own. */
  function preloadSets(): (readonly string[])[] {
    return [
      SCENE_ART.MainMenuScene,
      SCENE_ART.CharacterCreationScene,
      SCENE_ART.HubScene,
      ...Object.values(SCENE_ART.FieldScene),
      SCENE_ART.BarrowspireScene,
    ];
  }
});
