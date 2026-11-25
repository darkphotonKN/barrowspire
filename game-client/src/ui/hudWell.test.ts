import { describe, expect, it } from "vitest";
import { palette } from "@/utils/canvasPalette";
import { CARVE_INSET, drawWellGround, drawWellRim, type WellGraphics } from "./hudWell";

// FS-Q18Q3 §C R13, R17 and FS-7P736 R16: the one well the ability bar's squares and the roll pip wear

function recorder() {
  const ops: { m: string; args: unknown[] }[] = [];
  const rec = (m: string) => (...args: unknown[]) => void ops.push({ m, args });
  const g = { fillStyle: rec("fillStyle"), fillRect: rec("fillRect"), lineStyle: rec("lineStyle"), strokeRect: rec("strokeRect") };
  return { g: g as unknown as WellGraphics, ops };
}

const WELL = { x: 10, y: 20, width: 44, height: 44 };

describe("hudWell: the HUD's well", () => {
  it("should lay the HUD panel at 0.85 and carve its line 3 px inside, the bar's look", () => {
    const { g, ops } = recorder();
    drawWellGround(g, WELL);
    expect(CARVE_INSET).toBe(3);
    expect(ops).toEqual([
      { m: "fillStyle", args: [palette.hudPanel, 0.85] },
      { m: "fillRect", args: [10, 20, 44, 44] },
      { m: "lineStyle", args: [1, palette.hudPanelDeep, 0.5] },
      { m: "strokeRect", args: [13, 23, 38, 38] },
    ]);
  });

  it("should rim it 2 px bright brass lit, else in the faint 1 px frame", () => {
    const lit = recorder();
    drawWellRim(lit.g, WELL, true);
    expect(lit.ops).toEqual([
      { m: "lineStyle", args: [2, palette.frameBright, 1] },
      { m: "strokeRect", args: [10, 20, 44, 44] },
    ]);
    const unlit = recorder();
    drawWellRim(unlit.g, WELL, false);
    expect(unlit.ops).toEqual([
      { m: "lineStyle", args: [1, palette.frame, 0.6] },
      { m: "strokeRect", args: [10, 20, 44, 44] },
    ]);
  });
});
