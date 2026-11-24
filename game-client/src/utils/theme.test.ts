import { describe, expect, it } from "vitest";
import { mix, palette, tint } from "./canvasPalette";
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

});

// FS-8RZ51 §Change: A lit node glows in its own colour (L4, L6; ADR-0089, ADR-0013): a lit tree
// picture wears one of ten hues by what its node gives, each a palette token named by meaning.
describe("the passive tree's hues (FS-8RZ51 L4, L6)", () => {
  /** The seven bases the tree's hues brought, each the same colour in both tables. */
  const BASES = ["copper", "steelBlue", "teal", "frost", "verdigris", "amethyst", "silver"] as const;

  it("should add its seven bases to BARROW and BARROW_HEX as one colour each", () => {
    for (const key of BASES) expect(Number.parseInt(BARROW[key].slice(1), 16), key).toBe(BARROW_HEX[key]);
  });

  it("should resolve each hue from the BARROW_HEX token L4 names", () => {
    expect(palette.treeHue).toEqual({
      health: BARROW_HEX.oxbloodText,
      power: BARROW_HEX.copper,
      fire: BARROW_HEX.ember,
      defence: BARROW_HEX.steelBlue,
      mana: BARROW_HEX.teal,
      speed: BARROW_HEX.frost,
      movement: BARROW_HEX.verdigris,
      crit: BARROW_HEX.amethyst,
      refund: mix(tint(BARROW_HEX.brassBright, 0.5), BARROW_HEX.teal, 0.2),
      steel: BARROW_HEX.silver,
    });
  });

  it("should never be amber, arcane green or one of fire's own tokens (L6)", () => {
    const forbidden = (["amber", "amberBright", "arcane", "arcaneDeep", "fireCore", "fireHot", "fireDeep"] as const).map((k) => BARROW_HEX[k]);
    for (const [hue, value] of Object.entries(palette.treeHue)) expect(forbidden, hue).not.toContain(value);
  });

  it("should give mana a tree base of its own, the mana bar keeping necrotic (the coordinator's starting values, 2026-11-23)", () => {
    expect(palette.treeHue.mana).not.toBe(BARROW_HEX.necrotic);
    expect(palette.hudMana).toBe(BARROW_HEX.necrotic);
    expect(BARROW_HEX.necrotic).toBe(0x688b8f);
  });

  it("should give each hue a colour of its own", () => {
    const values = Object.values(palette.treeHue);
    expect(new Set(values).size).toBe(values.length);
  });
});

// FS-X2CMM §I R45, ADR-0094: a class book page's picture is painted in one of four muted mineral
// pigments, with bone for its highlights, each a token read only through `palette.bookPigment`.
describe("the class book's pigments (FS-X2CMM R45, ADR-0094)", () => {
  const PIGMENTS = ["pigmentVerdigris", "pigmentOchre", "pigmentMadder", "pigmentLapis", "pigmentBone"] as const;

  /** A colour in OKLab (Björn Ottosson's matrices, from sRGB). */
  const okLab = (color: number): [number, number, number] => {
    const linear = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
    const [r, g, b] = rgb(color).map(linear);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  };
  const chroma = (color: number) => Math.hypot(okLab(color)[1], okLab(color)[2]);
  const apart = (a: number, b: number) => {
    const [p, q] = [okLab(a), okLab(b)];
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  };

  it("should add the five to BARROW and BARROW_HEX as one colour each", () => {
    for (const key of PIGMENTS) expect(Number.parseInt(BARROW[key].slice(1), 16), key).toBe(BARROW_HEX[key]);
  });

  it("should resolve palette.bookPigment from those tokens, by the pigment's name", () => {
    expect(palette.bookPigment).toEqual({
      verdigris: BARROW_HEX.pigmentVerdigris,
      ochre: BARROW_HEX.pigmentOchre,
      madder: BARROW_HEX.pigmentMadder,
      lapis: BARROW_HEX.pigmentLapis,
      bone: BARROW_HEX.pigmentBone,
      lockedGround: BARROW_HEX.pigmentLockedGround,
      rimLit: BARROW_HEX.brassBright,
    });
  });

  // ADR-0095 (I-X2CMM-24): a locked page lies on a flat warm near-ink ground, never coloured.
  it("should keep the locked ground a warm near-ink, one colour in both maps, darker than every pigment", () => {
    expect(Number.parseInt(BARROW.pigmentLockedGround.slice(1), 16)).toBe(BARROW_HEX.pigmentLockedGround);
    const [r, , b] = rgb(BARROW_HEX.pigmentLockedGround);
    expect(r).toBeGreaterThan(b);
    expect(chroma(BARROW_HEX.pigmentLockedGround)).toBeLessThan(0.03);
    for (const key of PIGMENTS) expect(lum(rgb(BARROW_HEX.pigmentLockedGround)), key).toBeLessThan(lum(rgb(BARROW_HEX[key])) - 40);
  });

  it("should saturate none past the barrow ramp's own ceiling, the tree's verdigris", () => {
    for (const key of PIGMENTS) expect(chroma(BARROW_HEX[key]), key).toBeLessThanOrEqual(chroma(BARROW_HEX.verdigris));
  });

  it("should keep ochre off amber, the interactable channel, and madder off oxblood, damage", () => {
    expect(apart(BARROW_HEX.pigmentOchre, BARROW_HEX.amber)).toBeGreaterThan(0.1);
    expect(apart(BARROW_HEX.pigmentMadder, BARROW_HEX.oxblood)).toBeGreaterThan(0.1);
  });

  it("should give each main pigment a hue far from the others, and bone the lightest", () => {
    const mains = PIGMENTS.filter((k) => k !== "pigmentBone");
    for (const a of mains) for (const b of mains) if (a < b) expect(apart(BARROW_HEX[a], BARROW_HEX[b]), `${a} / ${b}`).toBeGreaterThan(0.1);
    for (const key of mains) expect(lum(rgb(BARROW_HEX.pigmentBone)), key).toBeGreaterThan(lum(rgb(BARROW_HEX[key])) + 60);
  });
});
