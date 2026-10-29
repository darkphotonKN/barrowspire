import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ArtManifest, ArtRgb } from "@/render/art/manifest";
import {
  AMBIENT,
  TOWER_AMBIENT,
  contrastRatio,
  groundMean,
  litEdgeGround,
  relativeLuminance,
} from "@/render/lighting/lighting";
import { FIELD_LOOKS } from "@/render/world/fieldLook";
import { VIGNETTE_DEPTH, edgeVignetteAlpha } from "@/render/lighting/vignette";
import type { WorldKind } from "@/render/world/ground";
import { palette } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import {
  FIELD_MARKER_OUTLINE,
  HUD_DEPTH,
  MARKER_BAR,
  MARKER_DEPTH,
  MARKER_INKS,
  markerBase,
} from "./markers";

/** WCAG's floor for large text and graphics, and FS-2325V §C.9's. Fixed here, never derived. */
const FLOOR = 3.0;

const baked: ArtManifest = JSON.parse(
  readFileSync(join(__dirname, "../../../public/art/manifest.json"), "utf8"),
);

/** Every baked ground the world is drawn from, by its measured mean. */
const GROUNDS: [string, ArtRgb][] = Object.entries(baked.sheets).flatMap(
  ([name, sheet]) => (sheet.mean ? [[name, sheet.mean] as [string, ArtRgb]] : []),
);

/** Canvases the game is played on: the edge vignette deepens as the canvas widens. */
const CANVASES: [number, number][] = [
  [1024, 768],
  [1080, 720],
  [1280, 720],
  [1440, 900],
  [1920, 1080],
  [2560, 1080],
  [3440, 1440],
];

const WORLDS: WorldKind[] = ["hub", "run"];

/** The lowest contrast an ink keeps against any baked ground at the edge of any canvas. */
function worstEdgeContrast(ink: number, world: WorldKind): number {
  let worst = Infinity;
  for (const [w, h] of CANVASES)
    for (const [, mean] of GROUNDS)
      worst = Math.min(
        worst,
        contrastRatio(
          ink,
          litEdgeGround(mean, AMBIENT[world], edgeVignetteAlpha(w, h)),
        ),
      );
  return worst;
}

describe("function NPC markers (FS-MRZH7 req 2, 3)", () => {
  it("should read a function NPC's name in its own marker ink, apart from the player's own", () => {
    // amber: the player can act on a function NPC, which is what amber means on the canvas
    expect(palette.markerFunction).toBe(BARROW_HEX.amber);
    expect(MARKER_INKS["function NPC name"]).toBe(palette.markerFunction);
    expect(palette.markerFunction).not.toBe(palette.markerSelf);
  });
});

describe("the readability floor (FS-2325V §C.9)", () => {
  it("is measured against every baked ground", () => {
    expect(GROUNDS.map(([n]) => n)).toEqual(
      expect.arrayContaining(["ground_dirt", "ground_cobble", "ground_grass"]),
    );
  });

  it.each(Object.entries(MARKER_INKS))(
    "should keep the %s marker at 3:1 or better against the darkest lit edge ground",
    (_, ink) => {
      for (const world of WORLDS)
        expect(worstEdgeContrast(ink, world), world).toBeGreaterThanOrEqual(
          FLOOR,
        );
    },
  );

  it("should read a gate's name in the interactable channel, amber (FS-0XMCP §Requirements 21)", () => {
    expect(MARKER_INKS["gate name"]).toBe(palette.interactable);
  });

  it("should fail an ink too dark to read, so the check has teeth", () => {
    // oxblood is a fill, never a marker: it vanishes into the barrow at the edge
    expect(worstEdgeContrast(palette.damage, "run")).toBeLessThan(FLOOR);
  });

  it("should keep the bar's health fill at 3:1 or better against its own backing", () => {
    expect(contrastRatio(MARKER_BAR.hp, MARKER_BAR.backing)).toBeGreaterThanOrEqual(
      FLOOR,
    );
  });
});

describe("the readability floor in the tower interior (FS-8RBQY §B.7)", () => {
  /** The tower's grounds: the sheets baked onto the tower atlas that carry a measured mean. */
  const TOWER_GROUNDS = Object.entries(baked.sheets).flatMap(([name, sheet]) =>
    sheet.mean && sheet.atlas.startsWith("tower")
      ? [[name, sheet.mean] as [string, ArtRgb]]
      : [],
  );
  const rgb = ({ r, g, b }: ArtRgb) => (r << 16) | (g << 8) | b;
  const [darkest, darkestMean] = [...TOWER_GROUNDS].sort(
    ([, a], [, b]) => relativeLuminance(rgb(a)) - relativeLuminance(rgb(b)),
  )[0];

  it("is measured against the darkest tower ground: the hall flags", () => {
    expect(TOWER_GROUNDS.map(([n]) => n)).toEqual(
      expect.arrayContaining(["ground_flags", "ground_planks", "ground_dressed"]),
    );
    expect(darkest).toBe("ground_flags");
  });

  it.each(Object.entries(MARKER_INKS))(
    "should keep the %s marker at 3:1 or better under the tower ambient at any canvas edge",
    (_, ink) => {
      for (const [w, h] of CANVASES)
        expect(
          contrastRatio(
            ink,
            litEdgeGround(darkestMean, TOWER_AMBIENT, edgeVignetteAlpha(w, h)),
          ),
          `${w}×${h}`,
        ).toBeGreaterThanOrEqual(FLOOR);
    },
  );
});

describe("the readability floor in daylit fields (FS-X2F2H §Requirements 54, guideline 'Daylit fields keep the floor')", () => {
  /** The outdoor ground family every field lays, by its measured mean. */
  const OUTDOOR_GROUNDS = Object.entries(baked.sheets).flatMap(([name, sheet]) =>
    sheet.mean && sheet.atlas.startsWith("ground")
      ? [[name, sheet.mean] as [string, ArtRgb]]
      : [],
  );

  /** From the canvas centre, where the daylight is brightest, out to each canvas's edge. */
  const VIGNETTES = [0, ...CANVASES.map(([w, h]) => edgeVignetteAlpha(w, h))];
  const outline = FIELD_MARKER_OUTLINE.color;

  it("is measured against the outdoor ground family", () => {
    expect(OUTDOOR_GROUNDS.map(([n]) => n)).toEqual(
      expect.arrayContaining(["ground_grass", "ground_dirt", "ground_grass_dirt"]),
    );
  });

  it.each(Object.entries(MARKER_INKS))(
    "should keep the %s marker at 3:1 or better against the field outline around it",
    (_, ink) => {
      expect(contrastRatio(ink, outline)).toBeGreaterThanOrEqual(FLOOR);
    },
  );

  it("should draw the outline thick enough to stand between ink and ground", () => {
    expect(FIELD_MARKER_OUTLINE.thickness).toBeGreaterThanOrEqual(2);
  });

  it("should fail an outline too light to carry the ink, so the check has teeth", () => {
    expect(contrastRatio(MARKER_INKS["hub name"], palette.markerSelf)).toBeLessThan(FLOOR);
  });

  // every field's own look: a field added to the table is held to the rule by being added
  describe.each(Object.entries(FIELD_LOOKS))("%s", (_, look) => {
    it.each(Object.entries(MARKER_INKS))(
      "should read the %s marker at 3:1 or better on the field's own lit ground, directly or through its outline",
      (_, ink) => {
        for (const [name, mean] of OUTDOOR_GROUNDS)
          for (const v of VIGNETTES) {
            const ground = litEdgeGround(groundMean(mean, look.ground), look.ambient, v);
            expect(
              Math.max(contrastRatio(ink, ground), contrastRatio(ink, outline)),
              `${name} vignette ${v.toFixed(2)}`,
            ).toBeGreaterThanOrEqual(FLOOR);
          }
      },
    );
  });
});

describe("marker depth", () => {
  it("should draw markers above the light-map and vignette, so darkness never dims them", () => {
    expect(MARKER_DEPTH.name).toBeGreaterThan(VIGNETTE_DEPTH);
    expect(MARKER_DEPTH.bar).toBeGreaterThan(VIGNETTE_DEPTH);
  });

  it("should draw markers below the HUD and the container view", () => {
    expect(MARKER_DEPTH.name).toBeLessThan(HUD_DEPTH);
    expect(MARKER_DEPTH.bar).toBeLessThan(HUD_DEPTH);
  });

  it("should draw a bar over its name, as before", () => {
    expect(MARKER_DEPTH.bar).toBeGreaterThan(MARKER_DEPTH.name);
  });
});

describe("markerBase", () => {
  // a 60 px placeholder centred on its footprint, and a baked sheet stood on its anchor
  const placeholder = { y: 300, displayOriginY: 30, scaleY: 1 };
  const sheet = { y: 300, displayOriginY: 108, scaleY: 1 };

  it("should keep a placeholder's markers exactly where they were: on the frame's top", () => {
    expect(markerBase(placeholder, undefined, false)).toBe(270);
    // a placeholder has no corpse pose: dead or not, it keeps them
    expect(markerBase(placeholder, undefined, true)).toBe(270);
  });

  it("should seat a baked character's markers a small gap over its head, not its padded frame", () => {
    const base = markerBase(sheet, 76, false)!;
    expect(base).toBeLessThan(300 - 76);
    expect(base).toBeGreaterThanOrEqual(300 - 76 - 6);
    expect(base).toBeGreaterThan(300 - 108);
  });

  it("should scale the head height with the sprite", () => {
    const big = markerBase({ ...sheet, scaleY: 2 }, 76, false)!;
    expect(300 - big).toBe(2 * (300 - markerBase(sheet, 76, false)!));
  });

  it("should show no markers over a baked corpse", () => {
    expect(markerBase(sheet, 76, true)).toBeNull();
  });
});
