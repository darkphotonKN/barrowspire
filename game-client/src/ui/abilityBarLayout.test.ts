import { describe, expect, it } from "vitest";
import { LOGICAL_HEIGHT, LOGICAL_MAX_WIDTH, LOGICAL_MIN_WIDTH } from "@/render/viewport";
import {
  ABILITY_BAR_SQUARES,
  ABILITY_SQUARE,
  ABILITY_SQUARE_GAP,
  abilityBarFrame,
} from "./abilityBarLayout";
import { ABILITY_ICON_SLOT } from "./abilityIcons";
import { CHAT_WINDOW_MARGIN, CHAT_WINDOW_X, chatPickerList, chatWindowFrame } from "./chatWindowLayout";
import { CORNER_ICONS, controlsBadgeFrame, cornerIconFrame, cornerLabelAt, cornerRowLeft, type Rect } from "./hudCornerLayout";
import { rectsMeet } from "./partyPanelLayout";
import { xpBarFrame } from "./xpBarLayout";

// FS-Q18Q3 §B R8, R9: three 44 px squares 10 apart, [1 potion] [right-click] [3], the row centred on
// W / 2, its lowest point (the cost slots) 6 px above the XP piece's top, clear of the chat window and
// the corner row at every width

const view = (width: number) => ({ width, height: LOGICAL_HEIGHT });
const WIDTHS = Array.from({ length: LOGICAL_MAX_WIDTH - LOGICAL_MIN_WIDTH + 1 }, (_, i) => LOGICAL_MIN_WIDTH + i);

/** Every rect the bar draws in: each square's well, plaque and cost slot. */
function parts(width: number): Rect[] {
  const { squares } = abilityBarFrame(view(width));
  return ABILITY_BAR_SQUARES.flatMap((s) => [squares[s].well, squares[s].plaque, squares[s].cost]);
}

describe("abilityBarFrame: the bar's place (FS-Q18Q3 §B)", () => {
  it("should name the squares in order, 44 px, 10 apart", () => {
    expect(ABILITY_BAR_SQUARES).toEqual(["potion", "ability", "tree"]);
    expect(ABILITY_SQUARE).toBe(44);
    expect(ABILITY_SQUARE_GAP).toBe(10);
  });

  it.each([
    [1080, 464, 616],
    [1280, 564, 716],
  ])("should span the row at %i from x %i to %i (R9)", (width, left, right) => {
    const { row, squares } = abilityBarFrame(view(width));
    expect(row.x).toBe(left);
    expect(row.x + row.width).toBe(right);
    expect(squares.potion.well.x).toBe(left);
    expect(squares.ability.well.x).toBe(left + 54);
    expect(squares.tree.well.x + squares.tree.well.width).toBe(right);
  });

  it.each(WIDTHS)("should keep the rule at %i: centred, 44 squares 10 apart, its foot 6 over the XP piece", (width) => {
    const { row, squares } = abilityBarFrame(view(width));
    const piece = xpBarFrame(view(width)).piece;
    expect(Math.abs(row.x + row.width / 2 - width / 2)).toBeLessThanOrEqual(0.5);
    expect(row.width).toBe(152);
    const wells = ABILITY_BAR_SQUARES.map((s) => squares[s].well);
    for (const w of wells) expect([w.width, w.height]).toEqual([44, 44]);
    expect(wells[1].x - (wells[0].x + 44)).toBe(10);
    expect(wells[2].x - (wells[1].x + 44)).toBe(10);
    // the lowest point is the cost slots' foot (R8)
    const foot = Math.max(...parts(width).map((p) => p.y + p.height));
    for (const s of ABILITY_BAR_SQUARES) expect(squares[s].cost.y + squares[s].cost.height).toBe(foot);
    expect(foot).toBe(piece.y - 6);
  });

  it("should set each plaque centred on its square's top edge, straddling it, and the bar's top on the plaques' (R12, R14)", () => {
    const { squares, top } = abilityBarFrame(view(1080));
    for (const s of ABILITY_BAR_SQUARES) {
      const { well, plaque } = squares[s];
      expect(plaque.x + plaque.width / 2).toBe(well.x + well.width / 2);
      expect(plaque.y).toBeLessThan(well.y);
      expect(plaque.y + plaque.height).toBeGreaterThan(well.y);
      expect(plaque.y).toBe(top);
    }
  });

  it("should centre each icon's slot in its well and each cost slot under it (R13, R15)", () => {
    const { squares } = abilityBarFrame(view(1280));
    for (const s of ABILITY_BAR_SQUARES) {
      const { well, icon, cost } = squares[s];
      expect([icon.width, icon.height]).toEqual([ABILITY_ICON_SLOT, ABILITY_ICON_SLOT]);
      expect(icon.x + icon.width / 2).toBe(well.x + well.width / 2);
      expect(icon.y + icon.height / 2).toBe(well.y + well.height / 2);
      expect(cost.x + cost.width / 2).toBe(well.x + well.width / 2);
      expect(cost.y).toBeGreaterThanOrEqual(well.y + well.height);
    }
  });

  it("should stand the count's corner inside the potion well's bottom right (R24)", () => {
    const { well, corner } = abilityBarFrame(view(1080)).squares.potion;
    expect(corner.x).toBeLessThan(well.x + well.width);
    expect(corner.x).toBeGreaterThan(well.x + well.width / 2);
    expect(corner.y).toBeLessThanOrEqual(well.y + well.height);
    expect(corner.y).toBeGreaterThan(well.y + well.height / 2);
  });

  it("should meet neither the chat window open or folded nor its picker list, the corner row or its labels, the controls badge nor the XP piece, at every width (R9)", () => {
    const bottom = LOGICAL_HEIGHT - CHAT_WINDOW_MARGIN;
    const open = chatWindowFrame(CHAT_WINDOW_X, bottom);
    const folded = chatWindowFrame(CHAT_WINDOW_X, bottom, true);
    const chat = [open.panel, chatPickerList(open).box, folded.panel, chatPickerList(folded).box];
    for (const width of WIDTHS) {
      const v = view(width);
      const plates = CORNER_ICONS.map((icon) => cornerIconFrame(icon, v));
      const labels = plates.map((plate) => {
        const at = cornerLabelAt(plate, 160, v);
        return { x: at.x - 80, y: at.bottom - 22, width: 160, height: 22 };
      });
      const { row } = abilityBarFrame(v);
      expect(row.x, `at ${width}`).toBeGreaterThan(open.panel.x + open.panel.width);
      expect(row.x + row.width, `at ${width}`).toBeLessThan(cornerRowLeft(v));
      for (const part of parts(width))
        for (const other of [...chat, ...plates, ...labels, controlsBadgeFrame(v), xpBarFrame(v).piece])
          expect(rectsMeet(part, other), `at ${width}`).toBe(false);
    }
  });
});
