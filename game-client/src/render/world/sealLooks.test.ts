import { describe, expect, it } from "vitest";
import { shippedManifest } from "@/render/art/artLoader.standin";
import { GLYPHS, SEALED_SHEETS, bridgeLook, gateLook, pieceLooks, pitLook } from "./sealLooks";

describe("the sealed floor's looks (FS-5FZ4J §J R51, §K R57)", () => {
  it("should name sheets and frames the shipped manifest bakes, on the resident sealed group", () => {
    const manifest = shippedManifest();
    for (const [sheet, frames] of Object.entries(SEALED_SHEETS)) {
      expect(manifest.sheets[sheet]?.atlas, sheet).toMatch(/^sealed-\d+$/);
      for (const frame of frames) expect(manifest.sheets[sheet].animations[frame], `${sheet}/${frame}`).toBeDefined();
    }
  });

  it("should draw a lever up or down, its glyph over it at the same spot", () => {
    expect(pieceLooks("lever", false, "crow")).toEqual([
      { sheet: "seal_lever", frame: "up" },
      { sheet: "seal_lever", frame: "glyph_crow" },
    ]);
    expect(pieceLooks("lever", true, "moon")).toEqual([
      { sheet: "seal_lever", frame: "down" },
      { sheet: "seal_lever", frame: "glyph_moon" },
    ]);
  });

  it("should draw a lever with no glyph, or one not baked, as the lever alone", () => {
    expect(pieceLooks("lever", false)).toEqual([{ sheet: "seal_lever", frame: "up" }]);
    expect(pieceLooks("lever", false, "toad")).toEqual([{ sheet: "seal_lever", frame: "up" }]);
  });

  it.each([
    ["plate", false, "pressure_plate", "up"],
    ["plate", true, "pressure_plate", "pressed"],
    ["brazier", false, "seal_brazier", "cold"],
    ["brazier", true, "seal_brazier", "lit"],
    ["bridge_lever", false, "bridge_lever", "up"],
    ["bridge_lever", true, "bridge_lever", "down"],
    ["block", false, "stone_block", "default"],
    ["stair_key", false, "stair_key", "default"],
    ["mural", false, "mural", "default"],
    ["shrine", false, "lore_shrine", "default"],
  ] as const)("should draw a %s (active %s) from %s in its %s frame", (kind, active, sheet, frame) => {
    expect(pieceLooks(kind, active)).toEqual([{ sheet, frame }]);
  });

  it("should draw the gate one piece per cell, by the way it runs, shut or open", () => {
    expect(gateLook("x", false)).toEqual({ sheet: "gate_x", frame: "shut" });
    expect(gateLook("y", true)).toEqual({ sheet: "gate_y", frame: "open" });
  });

  it("should draw a pit cell with the rock face falling from a floor edge to its north or west", () => {
    expect(pitLook({ north: false, west: false })).toEqual({ sheet: "pit_cell", frame: "open" });
    expect(pitLook({ north: true, west: false })).toEqual({ sheet: "pit_cell", frame: "n" });
    expect(pitLook({ north: false, west: true })).toEqual({ sheet: "pit_cell", frame: "w" });
    expect(pitLook({ north: true, west: true })).toEqual({ sheet: "pit_cell", frame: "nw" });
  });

  it("should draw a lowered bridge cell along its crossing", () => {
    expect(bridgeLook("x")).toEqual({ sheet: "bridge_cell", frame: "x" });
    expect(bridgeLook("y")).toEqual({ sheet: "bridge_cell", frame: "y" });
  });

  it("should know the glyphs the server's levers bear", () => {
    expect(GLYPHS).toEqual(["crow", "key", "flame", "eye", "serpent", "moon"]);
  });
});
