import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { palette } from "./canvasPalette";
import { BARROW, BARROW_HEX } from "./theme";

// FS-PQ2TW §Change: Ash, the owner's "火的顏色有辦法擬真一點嗎" (2026-11-12): fire runs a temperature
// ramp, hottest first, around `ember`: a pale white-yellow core, orange, ember, a deep red. For fire
// effects only; amber stays the interactable channel (design guideline, "Gameplay accent").

const rgb = (hex: number) => [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

const RAMP = ["fireCore", "fireHot", "ember", "fireDeep"] as const;

describe("fire's ramp (FS-PQ2TW, ADR-0013)", () => {
  it("should be tokens, each the same colour in BARROW and BARROW_HEX", () => {
    for (const key of RAMP) expect(Number.parseInt(BARROW[key].slice(1), 16), key).toBe(BARROW_HEX[key]);
  });

  it("should run hottest first: each step darker and redder than the one before", () => {
    const cs = RAMP.map((key) => rgb(BARROW_HEX[key]));
    for (let n = 1; n < cs.length; n++) {
      expect(lum(cs[n]), RAMP[n]).toBeLessThan(lum(cs[n - 1]));
      // green to red falls: white-yellow, orange, red
      expect(cs[n][1] / cs[n][0], RAMP[n]).toBeLessThan(cs[n - 1][1] / cs[n - 1][0]);
    }
  });

  it("should stay apart from amber, the interactable channel, and from oxblood, damage", () => {
    for (const key of RAMP) {
      for (const other of ["amber", "amberBright", "oxblood"] as const)
        expect(dist(rgb(BARROW_HEX[key]), rgb(BARROW_HEX[other])), `${key} / ${other}`).toBeGreaterThan(30);
    }
  });

});

// The guideline's rule (Part I, "Fire's ramp is for fire effects only"): fire never marks an
// interactable, which stays amber. Fire effects read the ramp's tokens by name in their own typed
// records (`CARD_ASH.tint`), as every effect reads its tokens; nothing else does.
describe("fire marks no interactable (design guideline, FS-PQ2TW)", () => {
  /** The palette's interactable channel: what the player can do something with, and its markers. */
  const INTERACTABLE = [
    "interactable",
    "interactableBright",
    "switchOn",
    "escapeGlow",
    "stairsNosing",
    "markerFunction",
    "markerGate",
  ] as const;
  /** The ramp's own tokens: `ember` is older and shared, the three others are fire's alone. */
  const FIRE_ONLY = ["fireCore", "fireHot", "fireDeep"] as const;

  /** Every colour the canvas palette holds, by its path. */
  const colours = (node: unknown, path = "palette"): [string, unknown][] =>
    node !== null && typeof node === "object"
      ? Object.entries(node).flatMap(([k, v]) => colours(v, `${path}.${k}`))
      : [[path, node]];

  it("should keep the interactable channel off fire's ramp, on amber", () => {
    for (const key of INTERACTABLE) {
      expect(RAMP.map((r) => BARROW_HEX[r]), key).not.toContain(palette[key]);
      expect([BARROW_HEX.amber, BARROW_HEX.amberBright], key).toContain(palette[key]);
    }
  });

  it("should hold no fire-only colour in the canvas palette every marker draws from", () => {
    const fire: number[] = FIRE_ONLY.map((key) => BARROW_HEX[key]);
    expect(colours(palette).filter(([, v]) => fire.includes(v as number)).map(([path]) => path)).toEqual([]);
  });

  it("should name fire's tokens only in the theme and in fire effects", () => {
    const SRC = join(__dirname, "..");
    const sources = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
        const path = join(dir, d.name);
        if (d.isDirectory()) return sources(path);
        return /\.tsx?$/.test(d.name) && !/\.test\.tsx?$/.test(d.name) ? [path] : [];
      });
    const naming = sources(SRC)
      .filter((file) => new RegExp(`\\b(${FIRE_ONLY.join("|")})\\b`).test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file));
    // the fire effects: a new one is added here, by name, as a deliberate call
    expect(naming.sort()).toEqual(["render/effects/cardAsh.ts", "utils/theme.ts"]);
  });
});
