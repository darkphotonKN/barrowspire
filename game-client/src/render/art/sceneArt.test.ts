import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { MONSTER_LOOKS, PLAYER_REFERENCE_SHEET, monsterLook } from "@/render/creatures/monsters";
import { characterSheet } from "./animationSelect";
import { DEFAULT_RESIDENT_SHEET, FUNCTION_NPC_SHEETS, folkLook } from "./hubFolk";
import { RESIDENT_ART_PAGES, shippedManifest } from "./artLoader.standin";
import { sheetAtlases, type ArtManifest } from "./manifest";
import {
  RESIDENT_ART,
  SCENE_ART,
  SCENE_SCOPED_GROUPS,
  atlasGroup,
  fieldArt,
  sceneAtlases,
} from "./sceneArt";

const manifest = shippedManifest();

const sorted = (keys: Iterable<string>) => [...keys].sort();

describe("the scene art table (FS-C4JWH §A)", () => {
  it("should hold exactly the FS's rows (R4)", () => {
    expect(SCENE_ART).toEqual({
      MainMenuScene: [],
      CharacterCreationScene: [],
      HubScene: ["folk"],
      FieldScene: { gentle_meadows: ["wildlife"], forlorn_forest: ["fodder"] },
      BarrowspireScene: ["creatures", "boss"],
    });
  });

  it("should take the scene-scoped groups from the table, and only those (R2)", () => {
    expect(sorted(SCENE_SCOPED_GROUPS)).toEqual(["boss", "creatures", "fodder", "folk", "wildlife"]);
  });

  it("should name each atlas page's group by its key without the page number (R1)", () => {
    expect(atlasGroup("boss-1")).toBe("boss");
    expect(atlasGroup("knight-0")).toBe("knight");
    expect(atlasGroup("some-long-name-12")).toBe("some-long-name");
  });

  it("should give each field its own groups, and an unknown field gentle_meadows' (R5)", () => {
    expect(fieldArt("gentle_meadows")).toEqual(["wildlife"]);
    expect(fieldArt("forlorn_forest")).toEqual(["fodder"]);
    expect(fieldArt("some_new_field")).toEqual(["wildlife"]);
    expect(fieldArt(undefined)).toEqual(["wildlife"]);
    expect(fieldArt("toString")).toEqual(["wildlife"]);
  });

  it("should name only groups the shipped manifest has", () => {
    const groups = new Set(Object.keys(manifest.atlases).map(atlasGroup));
    for (const group of SCENE_SCOPED_GROUPS) expect(groups).toContain(group);
  });
});

describe("a scene's atlas pages (FS-C4JWH §A R3, §B R6–R7)", () => {
  it("should hold the 17 resident pages and no scene-scoped one at boot", () => {
    expect(sorted(sceneAtlases(manifest, RESIDENT_ART))).toEqual([...RESIDENT_ART_PAGES]);
  });

  it.each([
    ["the hub", SCENE_ART.HubScene, ["folk-0"]],
    ["gentle_meadows", fieldArt("gentle_meadows"), ["wildlife-0", "wildlife-1"]],
    ["forlorn_forest", fieldArt("forlorn_forest"), ["fodder-0", "fodder-1"]],
    ["the run", SCENE_ART.BarrowspireScene, ["boss-0", "boss-1", "creatures-0", "creatures-1"]],
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

// ── Coverage (FS-C4JWH §E R21) ──────────────────────────────────────────────

/**
 * The archetypes each scene meets, as game-service spawns them (read, not imported: the server
 * owns the spawns, so this is where the client says what it expects; D9).
 *
 * - gentle_meadows: boar (`internal/game/meadows_map.go:29`, FS-X2F2H §H R61)
 * - forlorn_forest: zombie and ghost (`internal/game/forest_map.go:42-43`, FS-3QHQZ §C R29)
 * - the run: ghoul and troll on every floor, the demon on the top one and by chance on any
 *   other (`internal/game/monster_population.go:129,145-147`)
 */
const MET = [
  { scene: "gentle_meadows", groups: fieldArt("gentle_meadows"), archetypes: ["boar"] },
  { scene: "forlorn_forest", groups: fieldArt("forlorn_forest"), archetypes: ["zombie", "ghost"] },
  { scene: "the run", groups: SCENE_ART.BarrowspireScene, archetypes: ["ghoul", "troll", "demon"] },
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
    expect(outsideScene(manifest, groups, monsterSheets(archetypes))).toEqual([]);
  });

  it("should have every MONSTER_LOOKS archetype met by some scene", () => {
    expect(unmet(MONSTER_LOOKS)).toEqual([]);
  });

  it("should keep the class sheets and the monster sizing reference on resident groups", () => {
    const sheets = ["mage", "archer", "mercenary", "warrior", undefined].map(characterSheet);
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
    expect(MET.map((s) => s.scene)).toEqual(["gentle_meadows", "forlorn_forest", "the run"]);
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

    it("should report an archetype with a look that no scene meets", () => {
      expect(unmet({ ...MONSTER_LOOKS, wraith: MONSTER_LOOKS.ghost })).toEqual(["wraith"]);
    });
  });
});
