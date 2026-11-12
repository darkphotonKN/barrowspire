import { afterEach, describe, expect, it, vi } from "vitest";
import { contrastRatio } from "@/render/lighting/lighting";
import { mix, palette } from "@/utils/canvasPalette";
import { MINIMAP, MINIMAP_VIGNETTE } from "./minimap";
import { POSITION_READOUT, positionReadoutPlace, showsPositionReadout } from "./positionReadout";

describe("showsPositionReadout", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    { nodeEnv: "development", shown: true },
    { nodeEnv: "test", shown: true },
    { nodeEnv: "production", shown: false },
  ])("is $shown when NODE_ENV is $nodeEnv and nothing overrides it", ({ nodeEnv, shown }) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("NEXT_PUBLIC_SHOW_POSITION_READOUT", "");
    expect(showsPositionReadout()).toBe(shown);
  });

  it.each([
    { nodeEnv: "production", override: "true", shown: true },
    { nodeEnv: "production", override: "1", shown: true },
    { nodeEnv: "production", override: " TRUE ", shown: true },
    { nodeEnv: "development", override: "false", shown: false },
    { nodeEnv: "development", override: "0", shown: false },
  ])(
    "follows NEXT_PUBLIC_SHOW_POSITION_READOUT=$override over NODE_ENV=$nodeEnv",
    ({ nodeEnv, override, shown }) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      vi.stubEnv("NEXT_PUBLIC_SHOW_POSITION_READOUT", override);
      expect(showsPositionReadout()).toBe(shown);
    },
  );

  it.each(["yes", "on", "maybe"])("ignores an unrecognised override %j", (override) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SHOW_POSITION_READOUT", override);
    expect(showsPositionReadout()).toBe(false);
  });
});

describe("the position readout's look and place (FS-56CKV §C)", () => {
  it("should hold its look as named values: 10 px, no backing, a HUD text token at a partial alpha, over the minimap's depth (§C.15, §C.16)", () => {
    expect(POSITION_READOUT.fontSize).toBe("10px");
    expect(POSITION_READOUT.colour).toBe(palette.hudText);
    expect(POSITION_READOUT.alpha).toBeGreaterThan(0);
    expect(POSITION_READOUT.alpha).toBeLessThan(1);
    expect(POSITION_READOUT.depth).toBeGreaterThan(MINIMAP.depth);
    expect(POSITION_READOUT.gap).toBe(4);
  });

  it("should keep its ink at 3:1 or better over the backing however dark the vignette makes it, out to the vignette's darkest, its corner (§C.15)", () => {
    // where two of the vignette's bands meet at the rim, each at its edge alpha, it is at its darkest
    const darkest = 1 - (1 - MINIMAP_VIGNETTE.edgeAlpha) ** 2;
    for (let t = 0; t <= darkest + 1e-9; t += 0.01) {
      const backing = mix(palette.hudPanel, palette.inkDeep, Math.min(t, darkest));
      const ink = mix(backing, POSITION_READOUT.colour, POSITION_READOUT.alpha);
      expect(contrastRatio(ink, backing)).toBeGreaterThanOrEqual(3);
    }
  });

  // FS-56CKV §Change: Map name, E8: the map's top-right is the name's, so the readout stands under
  // the column in every mode, replacing D8's corner inside the map
  it("should stand 4 px under the column's last line, right-aligned on the column's x, in every mode (§C.18; §Change: Map name, E8)", () => {
    expect(positionReadoutPlace({ right: 1070, bottom: 92 })).toEqual({ x: 1070, y: 96, origin: { x: 1, y: 0 } });
    expect(positionReadoutPlace({ right: 1270, bottom: 170 })).toEqual({ x: 1270, y: 174, origin: { x: 1, y: 0 } });
  });

  it("should stand on whole logical px", () => {
    const place = positionReadoutPlace({ right: 1069.6, bottom: 91.6 });
    expect([place.x, place.y]).toEqual([1070, 96]);
  });
});
