import { describe, expect, it } from "vitest";
import { WORLD_SCENES, sceneFor } from "./worldRouting";

describe("sceneFor (FS-29KSH §Requirements 15; FS-X2F2H §Requirements 55)", () => {
  it.each([
    { world: "hub", scene: "HubScene" },
    { world: "run", scene: "BarrowspireScene" },
    { world: "field", scene: "FieldScene" },
  ] as const)("should start $scene for a $world world", ({ world, scene }) => {
    expect(sceneFor(world)).toBe(scene);
  });

  it("should stop the field scene with the other world scenes", () => {
    expect(WORLD_SCENES).toEqual(
      expect.arrayContaining(["HubScene", "BarrowspireScene", "FieldScene", "LoadoutScene", "MainMenuScene"]),
    );
  });
});
