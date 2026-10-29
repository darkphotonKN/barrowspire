import { describe, expect, it, vi } from "vitest";

// The placeholder drawers reach Phaser only through the graphics they are handed.
vi.mock("phaser", () => ({ default: {} }));

const {
  drawArcher,
  drawKnight,
  drawMercenary,
  ensureCharacterTextures,
  placeholderTexture,
} = await import("./characterTextures");

type Facing = "up" | "down" | "left" | "right";
const FACINGS: Facing[] = ["down", "up", "left", "right"];

/** Every pixel a drawer laid, as "x,y=colour", so two figures can be told apart. */
function pixels(
  draw: (g: never, facing: Facing) => void,
  facing: Facing,
): string[] {
  const out: string[] = [];
  let colour = 0;
  const g = {
    fillStyle: (c: number) => {
      colour = c;
      return g;
    },
    fillRect: (x: number, y: number) => {
      out.push(`${x},${y}=${colour}`);
      return g;
    },
  };
  draw(g as never, facing);
  return out.sort();
}

describe("the Mercenary's placeholder (FS-MAMHR §G.31)", () => {
  it.each(FACINGS)("should draw a figure facing %s", (facing) => {
    expect(pixels(drawMercenary, facing).length).toBeGreaterThan(100);
  });

  it.each(FACINGS)(
    "should not read as the knight or the archer facing %s",
    (facing) => {
      const merc = pixels(drawMercenary, facing).join("|");
      expect(merc).not.toBe(pixels(drawKnight, facing).join("|"));
      expect(merc).not.toBe(pixels(drawArcher, facing).join("|"));
    },
  );

  it("should turn: each facing is its own drawing, but for the two mirrored sides", () => {
    const [down, up] = [
      pixels(drawMercenary, "down"),
      pixels(drawMercenary, "up"),
    ];
    expect(down.join("|")).not.toBe(up.join("|"));
    expect(pixels(drawMercenary, "left").join("|")).not.toBe(
      pixels(drawMercenary, "right").join("|"),
    );
  });
});

describe("ensureCharacterTextures (FS-MAMHR §G.31)", () => {
  it("should make a placeholder texture for every class and facing, the Mercenary's among them", () => {
    const made: string[] = [];
    const scene = {
      textures: { exists: () => false },
      make: {
        graphics: () => {
          const g = {
            fillStyle: () => g,
            fillRect: () => g,
            generateTexture: (key: string) => made.push(key),
            destroy: () => {},
          };
          return g;
        },
      },
    };
    ensureCharacterTextures(scene as never);
    for (const cls of ["warrior", "mage", "archer", "mercenary"])
      for (const facing of FACINGS)
        expect(made).toContain(`preview_${cls}_${facing}`);
  });
});

describe("placeholderTexture (FS-MAMHR §G.31: a merc never draws as the fallback warrior)", () => {
  it.each([
    ["mercenary", "preview_mercenary_down"],
    ["Mercenary", "preview_mercenary_down"],
    ["archer", "preview_archer_down"],
    ["necromancer", "preview_warrior_down"],
    ["constructor", "preview_warrior_down"],
    [undefined, "preview_warrior_down"],
  ] as const)("should draw class %s as %s", (cls, key) => {
    expect(placeholderTexture(cls, "down")).toBe(key);
  });
});
