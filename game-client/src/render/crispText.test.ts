import { describe, expect, it, vi } from "vitest";

// the module touches Phaser only inside installCrispText: the factory registry and the Text it makes
const registered = new Map<string, (...a: unknown[]) => unknown>();
vi.mock("phaser", () => ({
  GameObjects: {
    GameObjectFactory: {
      remove: (key: string) => registered.delete(key),
      register: (key: string, fn: (...a: unknown[]) => unknown) =>
        registered.set(key, fn),
    },
    Text: class {
      constructor(
        public scene: unknown,
        public x: number,
        public y: number,
        public text: string,
        public style: { resolution?: number },
      ) {}
    },
  },
}));

const { withCrispResolution, installCrispText } = await import("./crispText");
const { viewport } = await import("@/render/viewport/viewport");

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

describe("installCrispText (FS-ZAJMH R5: text rasterises at the render scale)", () => {
  /** `scene.add.text` as the installed factory makes it. */
  const addText = (style?: { resolution?: number }) => {
    const factory = registered.get("text")!;
    const self = { scene: {}, displayList: { add: <T>(o: T) => o } };
    return factory.call(self, 0, 0, "Delve", style) as {
      style: { resolution?: number };
    };
  };

  it("should rasterise each new text at the render scale of the moment it is made, not the bare device ratio", () => {
    installCrispText();
    viewport.set({ width: 1080, height: 720, renderScale: 1.5 });
    expect(addText({}).style.resolution).toBe(1.5);
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    expect(addText().style.resolution).toBe(2);
    expect(addText({ resolution: 3 }).style.resolution).toBe(3);
  });
});
