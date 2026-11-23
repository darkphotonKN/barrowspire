import { describe, expect, it } from "vitest";
import { classNodes } from "@/data/passiveTree";
import { viewport } from "@/render/viewport";
import { palette, toCss } from "@/utils/canvasPalette";
import { GREYED, TREE_INK, treeLitInk } from "@/ui/knockout";
import { TREE_HALO, TREE_LOOK, drawNodePlate, haloDiscAlpha } from "@/ui/PassiveTreeOverlay";
import { PLATE_SIZE } from "@/ui/passiveTreeLayout";
import { SHEET_CLASSES, SHEET_STATES, colourOf, inState, sheetEntries, sheetLayout, withHue } from "./treeColours";

// FS-8RZ51 §Change: A lit node glows in its own colour, L13 (I-8RZ51-23): the Tree colours review page's
// content: every class's nodes in their three states, on their real plates, drawn by the overlay's code.

/** A recording stand-in for the plate graphics: the line inks and each filled circle's fill. */
function pen() {
  const rec = { inks: [] as number[], circles: [] as { r: number; fill: [number, number] }[], fill: [0, 1] as [number, number] };
  const g: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === "lineStyle") return (_w: number, ink: number) => (rec.inks.push(ink), g);
        if (prop === "fillStyle") return (ink: number, alpha = 1) => ((rec.fill = [ink, alpha]), g);
        if (prop === "fillCircle") return (_x: number, _y: number, r: number) => (rec.circles.push({ r, fill: rec.fill }), g);
        return () => g;
      },
    },
  );
  return { g, rec };
}

/** One node drawn in `state` on a scene that makes no textures, so its picture is in lines on the pen. */
function drawn(cls: string, index: number, state: (typeof SHEET_STATES)[number], look = TREE_LOOK) {
  const entry = sheetEntries(cls)[index];
  const { g, rec } = pen();
  drawNodePlate({} as never, g as never, inState(entry.node, state), entry.plate, look);
  return { entry, rec };
}

describe("the Tree colours review page (FS-8RZ51 L13)", () => {
  it("should show all four classes", () => {
    expect([...SHEET_CLASSES].sort()).toEqual(["archer", "mage", "mercenary", "warrior"]);
  });

  it("should stand every node of every class on the sheet, each look once, the traversal four first", () => {
    for (const cls of SHEET_CLASSES) {
      const entries = sheetEntries(cls);
      expect(entries.flatMap((e) => e.ids).sort(), cls).toEqual(classNodes(cls).map((n) => n.id).sort());
      expect(entries.slice(0, 4).map((e) => e.node.name), cls).toEqual(["Vitality", "Might", "Haste", "Fleetness"]);
      // the rest one node each: two kickers, the ability, two kickers, two specializations
      expect(entries.slice(4).map((e) => e.node.kind), cls).toEqual(["kicker", "kicker", "ability", "kicker", "kicker", "specialization", "specialization"]);
      for (const e of entries) {
        expect(e.node.hue, e.node.id).toBeDefined();
        expect(e.plate.rect.width, e.node.id).toBe(PLATE_SIZE[e.node.kind]);
        expect(e.plate.round, e.node.id).toBe(e.node.kind === "traversal");
      }
    }
  });

  it("should lay its plates the same whatever view the page is in", () => {
    const page = viewport.current();
    try {
      const plates = () => SHEET_CLASSES.map((cls) => sheetEntries(cls).map((e) => e.plate));
      viewport.set({ width: 1080, height: 720, renderScale: 1 });
      const tall = plates();
      viewport.set({ width: 1280, height: 400, renderScale: 2 });
      expect(plates()).toEqual(tall);
    } finally {
      viewport.set(page);
    }
  });

  it("should set each node in the tree's three states: closed, open with a point, held (max where it has one rank)", () => {
    const [vitality] = sheetEntries("mage");
    const kicker = sheetEntries("mage")[4];
    expect(inState(vitality.node, "greyed")).toMatchObject({ state: "closed", rank: 0, spendable: false });
    expect(inState(vitality.node, "open")).toMatchObject({ state: "available", rank: 0, spendable: true });
    expect(inState(vitality.node, "lit")).toMatchObject({ state: "max", rank: 1 });
    expect(inState(kicker.node, "lit")).toMatchObject({ state: "held", rank: 1 });
  });

  it("should ink each state as the tree does: greyed, the near-white, the hue's lit ink with its halo", () => {
    const greyed = drawn("mage", 0, "greyed").rec;
    expect(greyed.inks).toContain(GREYED.idle.tint);
    const open = drawn("mage", 0, "open").rec;
    expect(open.inks).toContain(TREE_INK.idle.tint);
    for (const r of [greyed, open]) expect(r.circles.some((c) => c.fill[1] === haloDiscAlpha())).toBe(false);
    const lit = drawn("mage", 0, "lit").rec;
    expect(lit.inks).toContain(treeLitInk(palette.treeHue.health).idle.tint);
    expect(lit.circles.filter((c) => c.fill[0] === palette.treeHue.health && c.fill[1] === haloDiscAlpha())).toHaveLength(TREE_HALO.discs);
  });

  it("should recolour only the previewed hue's nodes", () => {
    const preview = withHue(TREE_LOOK, "health", palette.treeHue.crit);
    expect(preview.hues).toEqual({ ...palette.treeHue, health: palette.treeHue.crit });
    expect(TREE_LOOK.hues.health).toBe(palette.treeHue.health);
    for (const cls of SHEET_CLASSES) {
      sheetEntries(cls).forEach((entry, i) => {
        const { rec } = drawn(cls, i, "lit", preview);
        const want = entry.node.hue === "health" ? palette.treeHue.crit : palette.treeHue[entry.node.hue!];
        expect(rec.inks, entry.node.id).toContain(treeLitInk(want).idle.tint);
      });
    }
  });

  it("should read a colour input's value, and nothing else", () => {
    const css = toCss(palette.treeHue.mana);
    expect(colourOf(css)).toBe(palette.treeHue.mana);
    expect(colourOf(css.toUpperCase())).toBe(palette.treeHue.mana);
    expect(colourOf(css.slice(1))).toBeUndefined();
    expect(colourOf(css.slice(0, 4))).toBeUndefined();
  });

  it("should lay each class's block with a column per look and its three plates down it, inside the sheet", () => {
    const layout = sheetLayout();
    expect(layout.blocks.map((b) => b.cls)).toEqual([...SHEET_CLASSES]);
    for (const block of layout.blocks) {
      expect(block.columns).toHaveLength(sheetEntries(block.cls).length);
      expect(block.labels.map((l) => l.state)).toEqual([...SHEET_STATES]);
      for (const col of block.columns) {
        expect(col.cells.map((c) => c.state)).toEqual([...SHEET_STATES]);
        for (const { plate } of col.cells) {
          const { rect } = plate;
          expect(rect.x + rect.width / 2).toBe(col.x);
          expect(rect.width).toBe(col.entry.plate.rect.width);
          expect(rect.x).toBeGreaterThanOrEqual(block.panel.x);
          expect(rect.x + rect.width).toBeLessThanOrEqual(block.panel.x + block.panel.width);
          expect(rect.y).toBeGreaterThan(col.nameY);
          expect(rect.y + rect.height).toBeLessThan(col.hueY);
        }
      }
      expect(block.panel.y + block.panel.height).toBeLessThanOrEqual(layout.height);
      expect(block.panel.x + block.panel.width).toBeLessThanOrEqual(layout.width);
    }
  });
});
