import { describe, expect, it } from "vitest";
import { CORNER_ROW_CLEARANCE, cornerIconFrame } from "./hudCornerLayout";
import { PANEL_TITLE_BAND } from "./panelFrame";
import { TREE_NODE, TREE_PANEL_W, nodeAt, treeLayout } from "./passiveTreeLayout";

// FS-8RZ51 R34, R35: the overlay's panel, header, six tier rows, the tier-6 "or", the footer.

const COUNTS = [2, 2, 1, 2, 2, 2];

describe("treeLayout (FS-8RZ51 R34, R35)", () => {
  it.each([1080, 1280])("should centre the panel across a %i-wide view, clear of the corner row", (width) => {
    const view = { width, height: 720 };
    const { panel } = treeLayout(view, COUNTS);
    expect(panel.x + panel.width / 2).toBeCloseTo(width / 2, 0);
    expect(panel.width).toBe(TREE_PANEL_W);
    expect(panel.y).toBeGreaterThanOrEqual(16);
    expect(panel.y + panel.height).toBeLessThanOrEqual(720 - CORNER_ROW_CLEARANCE);
    expect(panel.y + panel.height).toBeLessThan(cornerIconFrame("menu", view).y);
  });

  it("should lay the six tiers top to bottom under the title band and the header, each inside the panel", () => {
    const { panel, rows, header } = treeLayout({ width: 1080, height: 720 }, COUNTS);
    expect(rows).toHaveLength(6);
    expect(header.y).toBeGreaterThan(panel.y + PANEL_TITLE_BAND);
    for (let i = 1; i < rows.length; i++) expect(rows[i].row.y).toBe(rows[i - 1].row.y + rows[i - 1].row.height);
    expect(rows[0].row.y).toBeGreaterThan(header.y);
    const last = rows.at(-1)!.row;
    expect(last.y + last.height).toBeLessThanOrEqual(panel.y + panel.height);
  });

  it("should centre one node, and two either side of the nodes' middle with the or between them", () => {
    const { rows } = treeLayout({ width: 1080, height: 720 }, COUNTS);
    const [one] = rows[2].nodes;
    const [a, b] = rows[5].nodes;
    expect(one.x + TREE_NODE / 2).toBeCloseTo((a.x + b.x + TREE_NODE) / 2, 0);
    expect(rows[5].between!.x).toBeGreaterThan(a.x + TREE_NODE);
    expect(rows[5].between!.x).toBeLessThan(b.x);
    expect(rows[2].between).toBeUndefined();
  });

  it("should stand every plate right of its gate's column, inside the panel", () => {
    const { panel, rows } = treeLayout({ width: 1080, height: 720 }, COUNTS);
    for (const row of rows)
      for (const p of row.nodes) {
        expect(p.x).toBeGreaterThan(row.gate.x + 100);
        expect(p.x + p.width).toBeLessThanOrEqual(panel.x + panel.width - 16);
      }
  });

  it("should stand the footer under the last row", () => {
    const { rows, footer } = treeLayout({ width: 1080, height: 720 }, COUNTS);
    const last = rows.at(-1)!.row;
    expect(footer.y).toBeGreaterThan(last.y + last.height);
  });

  it("should stand the tier-6 ask's Yes and No in the footer band at its right, the words' room left of them (R38)", () => {
    const { panel, rows, footer, answers } = treeLayout({ width: 1080, height: 720 }, COUNTS);
    const last = rows.at(-1)!.row;
    for (const box of [answers.yes, answers.no]) {
      expect(box.y).toBeGreaterThan(last.y + last.height);
      expect(box.y + box.height).toBeLessThanOrEqual(panel.y + panel.height);
      expect(box.y).toBeLessThan(footer.y);
      expect(box.y + box.height).toBeGreaterThan(footer.y);
    }
    expect(answers.yes.x + answers.yes.width).toBeLessThan(answers.no.x);
    expect(answers.no.x + answers.no.width).toBeLessThanOrEqual(panel.x + panel.width - 16);
    expect(answers.words.x).toBe(panel.x + 16);
    expect(answers.words.x + answers.words.width).toBeLessThan(answers.yes.x);
    expect(answers.words.width).toBeGreaterThanOrEqual(240);
  });

  it("should lay a tree of no tiers as a panel with one empty band, never throwing (R42)", () => {
    const layout = treeLayout({ width: 1080, height: 720 }, []);
    expect(layout.rows).toEqual([]);
    expect(layout.panel.height).toBeGreaterThan(PANEL_TITLE_BAND);
  });
});

describe("nodeAt (FS-8RZ51 R37)", () => {
  it("should find the plate under a point, and none off every plate", () => {
    const layout = treeLayout({ width: 1080, height: 720 }, COUNTS);
    const p = layout.rows[3].nodes[1];
    expect(nodeAt(layout, p.x + 2, p.y + 2)).toEqual([3, 1]);
    expect(nodeAt(layout, layout.panel.x + 2, layout.panel.y + 2)).toBeUndefined();
  });
});
