import { describe, expect, it, vi } from "vitest";

// the module touches Phaser only inside installCrispText; the pure part is under test here
vi.mock("phaser", () => ({
  GameObjects: { GameObjectFactory: {}, Text: class {} },
}));

const { withCrispResolution } = await import("./crispText");

describe("withCrispResolution (crisp canvas text, 2026-10-31)", () => {
  it("should give a style with no resolution the device's ratio", () => {
    expect(withCrispResolution({ fontSize: "14px" }, 2)).toEqual({
      fontSize: "14px",
      resolution: 2,
    });
    expect(withCrispResolution(undefined, 2)).toEqual({ resolution: 2 });
  });

  it("should leave a style that set its own resolution alone", () => {
    const style = { fontSize: "14px", resolution: 3 };
    expect(withCrispResolution(style, 2)).toBe(style);
  });

  it("should treat a resolution of 0 as unset, since Phaser forces 0 to 1", () => {
    expect(withCrispResolution({ resolution: 0 }, 2)).toEqual({
      resolution: 2,
    });
  });
});
