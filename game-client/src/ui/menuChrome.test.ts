import { describe, expect, it } from "vitest";
import { BARROW, BARROW_HEX } from "@/utils/theme";
import { palette, toCss } from "@/utils/canvasPalette";
import { buttonTextColor } from "./menuChrome";

/**
 * The canvas-menu tokens. They held the web's :root values until ADR-0087 moved the web to
 * Barrow Vellum; the menus kept Bone & Soot as their own, so they no longer mirror :root.
 */
const MENU_TOKENS = [
  "menuBone",
  "menuBoneBright",
  "menuAsh",
  "menuDangerText",
  "menuSoot",
  "menuSootDeep",
  "menuStone",
  "menuStoneRaised",
  "menuIron",
  "menuIronBright",
  "menuText",
  "menuTextDim",
  "menuTextMuted",
  "menuTextFaint",
] as const;

describe("canvas menu palette", () => {
  it.each(MENU_TOKENS)("%s agrees between BARROW and BARROW_HEX", (token) => {
    expect(toCss(BARROW_HEX[token])).toBe(BARROW[token]);
  });

  it("covers every menu token in BARROW", () => {
    const menuKeys = Object.keys(BARROW).filter((k) => k.startsWith("menu"));
    expect(menuKeys.sort()).toEqual([...MENU_TOKENS].sort());
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
