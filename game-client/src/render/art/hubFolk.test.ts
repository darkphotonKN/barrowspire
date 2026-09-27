import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RESIDENT_SHEET,
  FUNCTION_NPC_SHEETS,
  folkClip,
  folkLook,
  type FolkSheets,
} from "./hubFolk";
import type { ArtManifest } from "./manifest";

/** A stand-in for the art library: which sheets exist and which clips each carries. */
function sheets(table: Record<string, string[]>): FolkSheets {
  return {
    sheet: (name) =>
      table[name] && {
        animations: Object.fromEntries(table[name].map((a) => [a, {}])),
      },
  };
}

const BAKED = sheets({
  folk_resident_trousers: ["idle", "walk", "idle_slate", "walk_slate"],
  folk_resident_skirt: ["idle", "walk", "idle_flax", "walk_flax"],
  folk_spirewarden: ["idle", "walk"],
  folk_quartermaster: ["idle", "walk"],
});

const resident = (appearance?: string) => ({
  function: "" as const,
  appearance,
});

describe("folkLook", () => {
  it.each([
    // the build's first palette is its plain clips; the others are variants
    ["rust_trousers", "folk_resident_trousers", undefined],
    ["slate_trousers", "folk_resident_trousers", "slate"],
    ["green_skirt", "folk_resident_skirt", undefined],
    ["flax_skirt", "folk_resident_skirt", "flax"],
  ])(
    "should draw a resident in %s from %s, variant %s",
    (appearance, sheet, variant) => {
      expect(folkLook(resident(appearance), BAKED)).toEqual({ sheet, variant });
    },
  );

  it("should give a palette the build was not baked in the build's own first palette", () => {
    expect(folkLook(resident("rust_skirt"), BAKED)).toEqual({
      sheet: "folk_resident_skirt",
      variant: undefined,
    });
  });

  it.each([["purple_cloak"], ["nonsense"], [""], [undefined]])(
    "should fall back to the default villager for %s",
    (appearance) => {
      expect(folkLook(resident(appearance), BAKED)).toEqual({
        sheet: DEFAULT_RESIDENT_SHEET,
        variant: undefined,
      });
    },
  );

  it.each([
    ["delve", "folk_spirewarden"],
    ["storekeeper", "folk_quartermaster"],
  ] as const)("should draw the %s NPC as their own character", (fn, sheet) => {
    expect(folkLook({ function: fn, appearance: "" }, BAKED)).toEqual({
      sheet,
      variant: undefined,
    });
  });

  it("should draw a function the client does not know as the default villager", () => {
    expect(
      folkLook({ function: "ferryman" as "delve", appearance: "" }, BAKED),
    ).toEqual({ sheet: DEFAULT_RESIDENT_SHEET, variant: undefined });
  });

  it("should ignore a variant whose clips are missing from the sheet", () => {
    const partial = sheets({
      folk_resident_trousers: ["idle", "walk", "idle_slate"],
    });
    expect(folkLook(resident("slate_trousers"), partial)).toEqual({
      sheet: "folk_resident_trousers",
      variant: undefined,
    });
  });
});

describe("folkClip", () => {
  it("should play the plain clip without a variant", () => {
    expect(folkClip("walk", undefined)).toBe("walk");
  });

  it("should play the variant's clip with one", () => {
    expect(folkClip("idle", "slate")).toBe("idle_slate");
  });
});

// Every appearance and function the hub sends today (read-only reference:
// game-server/game-service/internal/game/hub_map.go, hubResidents and hubNPCs).
const HUB_RESIDENTS = [
  "rust_trousers",
  "green_skirt",
  "slate_trousers",
  "flax_skirt",
];
const HUB_FUNCTIONS = ["delve", "storekeeper"] as const;

describe("the shipped hub folk (public/art/manifest.json)", () => {
  const manifest = JSON.parse(
    readFileSync(join(__dirname, "../../../public/art/manifest.json"), "utf8"),
  ) as ArtManifest;
  const art: FolkSheets = { sheet: (name) => manifest.sheets[name] };

  it.each(HUB_RESIDENTS)(
    "should resolve %s to its own baked build and palette, not the fallback",
    (appearance) => {
      const look = folkLook(resident(appearance), art);
      const [palette, build] = appearance.split("_");
      expect(look.sheet).toBe(`folk_resident_${build}`);
      const sheet = manifest.sheets[look.sheet];
      // a palette is either the build's plain clips or a variant it carries
      if (look.variant) expect(look.variant).toBe(palette);
      for (const clip of ["idle", "walk"])
        expect(
          sheet.animations[folkClip(clip, look.variant)],
          clip,
        ).toBeDefined();
    },
  );

  it("should bake each resident palette exactly once across a build's clips", () => {
    // two residents of one build must not both land on its plain clips
    const looks = HUB_RESIDENTS.map((a) => folkLook(resident(a), art));
    const keys = looks.map((l) => `${l.sheet}:${l.variant ?? ""}`);
    expect(new Set(keys).size).toBe(HUB_RESIDENTS.length);
  });

  it.each(HUB_FUNCTIONS)(
    "should give the %s NPC a baked sheet of their own",
    (fn) => {
      const look = folkLook({ function: fn, appearance: "" }, art);
      expect(look.sheet).toBe(FUNCTION_NPC_SHEETS[fn]);
      expect(manifest.sheets[look.sheet]).toBeDefined();
    },
  );

  it.each([DEFAULT_RESIDENT_SHEET, ...Object.values(FUNCTION_NPC_SHEETS)])(
    "%s is 8-way, idles and walks, looping, and records its head height",
    (name) => {
      const sheet = manifest.sheets[name];
      expect(sheet?.directions).toBe(8);
      expect(sheet.animations.idle.loop).toBe(true);
      expect(sheet.animations.walk.loop).toBe(true);
      expect(sheet.crown).toBeGreaterThan(manifest.tile.height);
      expect(sheet.source).toMatch(
        /^authored: tools\/bake\/page\/characters\//,
      );
    },
  );
});
