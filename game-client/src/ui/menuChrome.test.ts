import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BARROW, BARROW_HEX } from "@/utils/theme";
import { palette, toCss } from "@/utils/canvasPalette";
import { buttonTextColor } from "./menuChrome";

/** Each canvas-menu token and the globals.css :root variable it mirrors. */
const MIRRORS: Record<string, string> = {
  menuBone: "--color-primary",
  menuBoneBright: "--color-primary-bright",
  menuAsh: "--color-accent",
  menuDangerText: "--color-danger-text",
  menuSoot: "--color-bg-dark",
  menuSootDeep: "--color-bg-darker",
  menuStone: "--color-bg-card-opaque",
  menuStoneRaised: "--color-bg-card-2-opaque",
  menuIron: "--color-brass",
  menuIronBright: "--color-brass-bright",
  menuText: "--color-text",
  menuTextDim: "--color-text-dim",
  menuTextMuted: "--color-text-muted",
  menuTextFaint: "--color-text-placeholder",
};

const css = readFileSync(
  path.resolve(__dirname, "../app/globals.css"),
  "utf8",
);
const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));

function rootValue(variable: string): string | undefined {
  const match = root.match(new RegExp(`${variable}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  return match?.[1].toLowerCase();
}

describe("canvas menu palette", () => {
  it.each(Object.entries(MIRRORS))(
    "%s mirrors %s in globals.css :root",
    (token, variable) => {
      const key = token as keyof typeof BARROW;
      expect(rootValue(variable), variable).toBeDefined();
      expect(BARROW[key]).toBe(rootValue(variable));
      expect(toCss(BARROW_HEX[key])).toBe(rootValue(variable));
    },
  );

  it("covers every menu token in BARROW", () => {
    const menuKeys = Object.keys(BARROW).filter((k) => k.startsWith("menu"));
    expect(menuKeys.sort()).toEqual(Object.keys(MIRRORS).sort());
  });
});

describe("buttonTextColor", () => {
  it("puts soot text on the bone primary button, idle and hovered", () => {
    expect(buttonTextColor("primary", "idle")).toBe(palette.menu.ground);
    expect(buttonTextColor("primary", "hover")).toBe(palette.menu.ground);
  });

  it("uses ash grey for cancel, never the game's arcane green", () => {
    expect(buttonTextColor("cancel", "idle")).toBe(palette.menu.accent);
    expect(buttonTextColor("cancel", "idle")).not.toBe(palette.safe);
  });

  it("dims every tone when disabled", () => {
    for (const tone of ["primary", "secondary", "cancel"] as const) {
      expect(buttonTextColor(tone, "disabled")).toBe(palette.menu.faint);
    }
  });

  it("never returns the game's amber interactable colour", () => {
    for (const tone of ["primary", "secondary", "cancel"] as const) {
      for (const state of ["idle", "hover", "disabled"] as const) {
        expect(buttonTextColor(tone, state)).not.toBe(palette.interactable);
        expect(buttonTextColor(tone, state)).not.toBe(palette.interactableBright);
      }
    }
  });
});
