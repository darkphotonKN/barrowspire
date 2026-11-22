import { describe, expect, it } from "vitest";
import type { PassiveNodeDef } from "@/data/passiveTree";
import { CORNER_ICONS, CORNER_ROW_CLEARANCE, cornerIconFrame } from "./hudCornerLayout";
import { PANEL_TITLE_BAND } from "./panelFrame";
import { PLATE_SIZE, TREE_COLUMN_W, TREE_ROW_H, nodeAt, treeLayout, type PlateLayout, type TreeLayout } from "./passiveTreeLayout";
import { treeView, type TreeSource } from "./passiveTreeModel";
import { xpBarFrame } from "./xpBarLayout";

// FS-8RZ51 §Change: Tree v2 V23 (the graph's placement from the node data), V24 (links plate edge to
// plate edge), R38 and V27 (the ask in the footer band), I-8RZ51-17.

const CLASSES = ["warrior", "mage", "archer", "mercenary"];
const source = (cls: string): TreeSource => ({ class: cls, level: 10, passive_ranks: {}, passive_points: 3 });
const layoutOf = (cls = "warrior", view = { width: 1280, height: 720 }, nodes?: readonly PassiveNodeDef[]) => {
  const tree = treeView(source(cls), nodes);
  return treeLayout(view, tree.nodes, tree.links);
};
const plate = (layout: TreeLayout, id: string): PlateLayout => {
  const found = layout.plates.find((p) => p.id === id);
  if (!found) throw new Error(`no plate ${id}`);
  return found;
};
const centre = (p: PlateLayout) => ({ x: p.rect.x + p.rect.width / 2, y: p.rect.y + p.rect.height / 2 });
const overlaps = (a: PlateLayout["rect"], b: PlateLayout["rect"]) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Whether the segment a→b crosses the rect (Liang–Barsky clipping). */
function crosses(a: { x: number; y: number }, b: { x: number; y: number }, r: PlateLayout["rect"]): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-dx, a.x - r.x],
    [dx, r.x + r.width - a.x],
    [-dy, a.y - r.y],
    [dy, r.y + r.height - a.y],
  ]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

describe("treeLayout on today's shape (FS-8RZ51 V23)", () => {
  it.each(CLASSES)("should lay the %s's 31 nodes on 13 columns and 5 rows, by depth and lane", (cls) => {
    const layout = layoutOf(cls);
    expect(layout.plates).toHaveLength(31);
    expect(new Set(layout.plates.map((p) => p.column)).size).toBe(13);
    expect([...new Set(layout.plates.map((p) => p.row))].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
    const at = (slot: string) => {
      const p = plate(layout, `${cls}.${slot}`);
      return [p.column, p.row];
    };
    // the trunk on row 0, the root at the left
    for (const [slot, column] of [["r1", 0], ["r2", 1], ["m1", 3], ["m2", 4], ["t3", 5], ["m3", 6], ["m4", 8]] as const) expect(at(slot)).toEqual([column, 0]);
    // the upper sides a above and b below at depths 2–6, the lower sides two out at 7–12, the specializations at 9
    for (const [i, slot] of ["ua1", "t2a", "ua2", "ua3", "ua4"].entries()) expect(at(slot)).toEqual([2 + i, -1]);
    for (const [i, slot] of ["ub1", "t2b", "ub2", "ub3", "ub4"].entries()) expect(at(slot)).toEqual([2 + i, 1]);
    for (const [i, slot] of ["la1", "t5a", "la2", "la3", "la4", "la5"].entries()) expect(at(slot)).toEqual([7 + i, -2]);
    for (const [i, slot] of ["lb1", "t5b", "lb2", "lb3", "lb4", "lb5"].entries()) expect(at(slot)).toEqual([7 + i, 2]);
    expect(at("t6a")).toEqual([9, -1]);
    expect(at("t6b")).toEqual([9, 1]);
  });

  it("should stand the columns 64 px apart left to right and the rows 72 px apart top to bottom", () => {
    const layout = layoutOf();
    expect(TREE_COLUMN_W).toBe(64);
    expect(TREE_ROW_H).toBe(72);
    expect(centre(plate(layout, "warrior.r2")).x - centre(plate(layout, "warrior.r1")).x).toBe(64);
    expect(centre(plate(layout, "warrior.m1")).y - centre(plate(layout, "warrior.ua1")).y).toBe(72);
    expect(centre(plate(layout, "warrior.la1")).y).toBeLessThan(centre(plate(layout, "warrior.ua1")).y);
  });

  it("should size the plates by kind: traversal small and round, a kicker larger, the ability and a specialization largest", () => {
    const layout = layoutOf();
    const of = (slot: string) => plate(layout, `warrior.${slot}`);
    expect([of("r1").rect.width, of("r1").round]).toEqual([PLATE_SIZE.traversal, true]);
    expect([of("t2a").rect.width, of("t2a").round]).toEqual([PLATE_SIZE.kicker, false]);
    expect([of("t3").rect.width, of("t6a").rect.width]).toEqual([PLATE_SIZE.ability, PLATE_SIZE.specialization]);
    expect(PLATE_SIZE.traversal).toBeLessThan(PLATE_SIZE.kicker);
    expect(PLATE_SIZE.kicker).toBeLessThan(PLATE_SIZE.ability);
    expect(PLATE_SIZE.ability).toBe(PLATE_SIZE.specialization);
    for (const p of layout.plates) expect(p.rect.width).toBe(p.rect.height);
  });

  it.each(CLASSES)("should overlap no two of the %s's plates, nor pass a link through a plate but its ends (V24)", (cls) => {
    const layout = layoutOf(cls);
    for (const [i, a] of layout.plates.entries()) for (const b of layout.plates.slice(i + 1)) expect(overlaps(a.rect, b.rect), `${a.id} ${b.id}`).toBe(false);
    expect(layout.links).toHaveLength(32);
    for (const link of layout.links)
      for (const p of layout.plates) if (p.id !== link.from && p.id !== link.to) expect(crosses(link.a, link.b, p.rect), `${link.from}→${link.to} through ${p.id}`).toBe(false);
  });

  it("should run each link from plate edge to plate edge: on a round plate's rim, on a square plate's side", () => {
    const layout = layoutOf();
    const link = layout.links.find((l) => l.from === "warrior.r2" && l.to === "warrior.ua1")!;
    const from = plate(layout, "warrior.r2");
    const to = plate(layout, "warrior.ua1");
    expect(Math.hypot(link.a.x - centre(from).x, link.a.y - centre(from).y)).toBeCloseTo(from.rect.width / 2, 5);
    expect(Math.hypot(link.b.x - centre(to).x, link.b.y - centre(to).y)).toBeCloseTo(to.rect.width / 2, 5);
    const kick = layout.links.find((l) => l.from === "warrior.ua1" && l.to === "warrior.t2a")!;
    expect(kick.b.x).toBeCloseTo(plate(layout, "warrior.t2a").rect.x, 5);
  });

  it("should stand a lock mark's box on each plate's top right corner", () => {
    const p = plate(layoutOf(), "warrior.ub1");
    expect(p.lock.x + p.lock.width).toBeGreaterThan(p.rect.x + p.rect.width - 2);
    expect(p.lock.y).toBeLessThan(p.rect.y + 2);
    expect(overlaps(p.lock, p.rect)).toBe(true);
  });
});

describe("treeLayout's panel (FS-8RZ51 V23, R34)", () => {
  it.each([1080, 1280, 1920])("should centre the panel across a %i×720 view, its plates inside it, clear of the corner row and the XP bar", (width) => {
    const view = { width, height: 720 };
    for (const cls of CLASSES) {
      const { panel, plates } = layoutOf(cls, view);
      expect(panel.x + panel.width / 2).toBeCloseTo(width / 2, 0);
      expect(panel.x).toBeGreaterThanOrEqual(16);
      expect(panel.y).toBeGreaterThanOrEqual(16);
      expect(panel.y + panel.height).toBeLessThanOrEqual(720 - CORNER_ROW_CLEARANCE);
      for (const icon of CORNER_ICONS) expect(overlaps(panel, cornerIconFrame(icon, view)), icon).toBe(false);
      expect(overlaps(panel, xpBarFrame(view).piece)).toBe(false);
      for (const p of plates) {
        expect(p.rect.x).toBeGreaterThanOrEqual(panel.x + 16);
        expect(p.rect.x + p.rect.width).toBeLessThanOrEqual(panel.x + panel.width - 16);
        expect(p.rect.y).toBeGreaterThan(panel.y + PANEL_TITLE_BAND);
      }
    }
  });

  it("should stand the header under the title band, the plates and their rank under it, and the footer under them", () => {
    const { panel, header, plates, footer } = layoutOf();
    expect(header.y).toBeGreaterThan(panel.y + PANEL_TITLE_BAND);
    const top = Math.min(...plates.map((p) => p.rect.y));
    const foot = Math.max(...plates.map((p) => p.rect.y + p.rect.height));
    expect(top).toBeGreaterThan(header.y + 8);
    // the rank under the lowest plate, 12 px of text, before the footer band
    expect(footer.y - 18).toBeGreaterThan(foot + 14);
    expect(footer.y).toBeLessThan(panel.y + panel.height);
  });

  it("should stand the ask's Yes and No in the footer band at its right, the words' room left of them (R38, V27)", () => {
    const { panel, plates, footer, answers } = layoutOf();
    const foot = Math.max(...plates.map((p) => p.rect.y + p.rect.height));
    for (const box of [answers.yes, answers.no]) {
      expect(box.y).toBeGreaterThan(foot);
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

  it("should lay a tree of no nodes as a panel with one empty band, never throwing (R42)", () => {
    const layout = layoutOf("necromancer");
    expect(layout.plates).toEqual([]);
    expect(layout.links).toEqual([]);
    expect(layout.panel.height).toBeGreaterThan(PANEL_TITLE_BAND + 40);
    expect(layout.panel.width).toBeGreaterThanOrEqual(380);
  });
});

describe("treeLayout on a tree that is only data (FS-8RZ51 V11, V23)", () => {
  // the rule test's fixture (common/passivetree TestGraph_AFixtureTreeNeedsNoCode): a specialization
  // pair, a node past one, a three-sided group past that, a side two deep, and an end
  const def = (slot: string, requires: string[], exclusive?: { group: string; side: string }, kind: PassiveNodeDef["kind"] = "traversal"): PassiveNodeDef => ({
    id: `fx.${slot}`,
    class: "fx",
    slot,
    kind,
    maxRank: 1,
    requires: requires.map((r) => `fx.${r}`),
    minLevel: 0,
    exclusive,
  });
  const FIXTURE = [
    def("root", []),
    def("specA", ["root"], { group: "spec", side: "a" }, "specialization"),
    def("specB", ["root"], { group: "spec", side: "b" }, "specialization"),
    def("past", ["specA"]),
    def("x", ["past"], { group: "sub", side: "a" }),
    def("y", ["past"], { group: "sub", side: "b" }),
    def("z", ["past"], { group: "sub", side: "c" }),
    def("z2", ["z"], { group: "sub", side: "c" }),
    def("end", ["x", "y", "z2"]),
  ];

  it("should place every node with no layout code of its own: the sides alternating outward, the deepest group nearest the trunk", () => {
    const layout = layoutOf("fx", { width: 1280, height: 720 }, FIXTURE);
    const at = (slot: string) => {
      const p = plate(layout, `fx.${slot}`);
      return [p.column, p.row];
    };
    expect(at("root")).toEqual([0, 0]);
    expect(at("specA")).toEqual([1, -1]);
    expect(at("specB")).toEqual([1, 1]);
    expect(at("past")).toEqual([2, 0]);
    expect(at("x")).toEqual([3, -1]);
    expect(at("y")).toEqual([3, 1]);
    // the third side alternates back above, outside the first
    expect(at("z")).toEqual([3, -2]);
    expect(at("z2")).toEqual([4, -2]);
    expect(at("end")).toEqual([4, 0]);
    for (const [i, a] of layout.plates.entries()) for (const b of layout.plates.slice(i + 1)) expect(overlaps(a.rect, b.rect), `${a.id} ${b.id}`).toBe(false);
    expect(layout.links).toHaveLength(10);
  });

  it("should stack two nodes of one lane at one depth outward from the trunk, never on one plate", () => {
    const fork = [def("root", []), def("p", ["root"], { group: "g", side: "a" }), def("q", ["root"], { group: "g", side: "a" }), def("r", ["root"], { group: "g", side: "b" })];
    const layout = layoutOf("fx", { width: 1280, height: 720 }, fork);
    expect([plate(layout, "fx.p").row, plate(layout, "fx.q").row, plate(layout, "fx.r").row]).toEqual([-1, -2, 1]);
  });
});

describe("nodeAt (FS-8RZ51 R37)", () => {
  it("should find a square plate under a point to its corner, and none off every plate", () => {
    const layout = layoutOf();
    const p = plate(layout, "warrior.t2a").rect;
    expect(nodeAt(layout, p.x + 2, p.y + 2)).toBe("warrior.t2a");
    expect(nodeAt(layout, layout.panel.x + 2, layout.panel.y + 2)).toBeUndefined();
  });

  it("should find a round plate inside its rim, and not in its box's corner", () => {
    const layout = layoutOf();
    const p = plate(layout, "warrior.r1");
    const c = centre(p);
    expect(nodeAt(layout, c.x + 6, c.y - 6)).toBe("warrior.r1");
    expect(nodeAt(layout, p.rect.x + 1, p.rect.y + 1)).toBeUndefined();
  });
});
