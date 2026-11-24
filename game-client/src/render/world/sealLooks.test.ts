import { describe, expect, it } from "vitest";
import { shippedManifest } from "@/render/art/artLoader.standin";
import {
  GLYPHS,
  SEALED_SHEETS,
  TRAP_FAINT,
  bridgeLook,
  cracksLook,
  fountainLook,
  gateLook,
  hallowedAltarLook,
  pieceLooks,
  pitLook,
  trapLook,
} from "./sealLooks";

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

  it.each(["spike_plate", "dart_wall", "fire_jet", "tripwire", "gas_vent"] as const)("should draw a %s trap armed, sprung, from its own sheet", (kind) => {
    expect(trapLook(kind, "armed")).toEqual({ sheet: `trap_${kind}`, frame: "armed" });
    expect(trapLook(kind, "sprung")).toEqual({ sheet: `trap_${kind}`, frame: "sprung" });
    expect(SEALED_SHEETS[`trap_${kind}`]).toEqual(expect.arrayContaining(["armed", "sprung"]));
  });

  it("should puff a gas vent from its six-frame, unlooped puff (I-5FZ4J-8)", () => {
    expect(trapLook("gas_vent", "puff")).toEqual({ sheet: "trap_gas_vent", frame: "puff" });
    const puff = shippedManifest().sheets.trap_gas_vent.animations.puff;
    expect(puff.frames[0]).toHaveLength(6);
    expect(puff.loop).toBe(false);
  });

  it("should draw a listed trap faint: its armed frame at reduced alpha (R51)", () => {
    expect(TRAP_FAINT).toBeGreaterThan(0);
    expect(TRAP_FAINT).toBeLessThan(1);
  });

  it("should draw a secret door's cracks over a back wall piece by its axis, over a cut-away one by front_ and its axis", () => {
    expect(cracksLook("back", "x")).toEqual({ sheet: "secret_cracks", frame: "x" });
    expect(cracksLook("back", "y")).toEqual({ sheet: "secret_cracks", frame: "y" });
    expect(cracksLook("front", "x")).toEqual({ sheet: "secret_cracks", frame: "front_x" });
    expect(cracksLook("front", "y")).toEqual({ sheet: "secret_cracks", frame: "front_y" });
  });

  // FS-5FZ4J §J R51 (I-5FZ4J-11): the respites, each two states framed together on the sealed group
  it("should draw the healing fountain full or dry", () => {
    expect(fountainLook(false)).toEqual({ sheet: "healing_fountain", frame: "full" });
    expect(fountainLook(true)).toEqual({ sheet: "healing_fountain", frame: "dry" });
    expect(SEALED_SHEETS.healing_fountain).toEqual(["full", "dry"]);
  });

  it("should draw the hallowed altar dormant until prayed at", () => {
    expect(hallowedAltarLook(false)).toEqual({ sheet: "hallowed_altar", frame: "dormant" });
    expect(hallowedAltarLook(true)).toEqual({ sheet: "hallowed_altar", frame: "prayed" });
    expect(SEALED_SHEETS.hallowed_altar).toEqual(["dormant", "prayed"]);
  });

  it("should bake the hallowed altar's candlelight and no light for the fountain (I-5FZ4J-8)", () => {
    const { sheets } = shippedManifest();
    expect(sheets.hallowed_altar.light).toBeDefined();
    expect(sheets.healing_fountain.light).toBeUndefined();
  });
});
