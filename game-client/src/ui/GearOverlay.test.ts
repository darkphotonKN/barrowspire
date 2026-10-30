import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "eventemitter3";
import type { EquippedItems, ItemState } from "@/types/gameState";
import type { ArtLibrary } from "@/render/art/library";
import { palette } from "@/utils/canvasPalette";
import { GEAR_OVERLAY_DEPTH, GearOverlay } from "./GearOverlay";
import { BAG_CAPACITY } from "./bag";
import {
  gearPanelLayout,
  overlayLayout,
  statsPanelArea,
} from "./gearOverlayLayout";

const item = (id: string, extra: Partial<ItemState> = {}) =>
  ({ entity_id: id, name: id, ...extra }) as ItemState;
const sword = item("sword", { weapon_type: "sword", attack_power: 10 });
const axe = item("axe", { weapon_type: "sword", attack_power: 12 });
const helm = item("helm", { armor_slot: "head", defense_rating: 3 });

function worn(over: Partial<EquippedItems> = {}): EquippedItems {
  return {
    weapon: null,
    head: null,
    body: null,
    hands: null,
    feet: null,
    ring_1: null,
    ring_2: null,
    consumable_1: null,
    consumable_2: null,
    consumable_3: null,
    ...over,
  };
}

/**
 * A scene that records what the overlay draws (text, fills, depths) and the pointer, wheel and
 * resize handlers it hangs on; every other call is accepted and ignored.
 */
function recordingScene(width = 1080, height = 720) {
  const texts: {
    content: string;
    destroyed: boolean;
    x: number;
    y: number;
    size: number;
  }[] = [];
  const fills = new Set<number>();
  const depths = new Set<number>();
  const input = new EventEmitter();
  const scale = new EventEmitter();
  const events = new EventEmitter();
  const camera = { width, height };

  const chain = (
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> => {
    const self: Record<string, unknown> = new Proxy(extra, {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        if (prop === "frame") return { width: 64, height: 64 };
        if (prop === "width" || prop === "height") return 10;
        return () => self;
      },
    });
    return self;
  };
  const graphics = () => {
    const g: Record<string, unknown> = chain({
      fillStyle: (c: number) => (fills.add(c), g),
    });
    return g;
  };
  const text = (
    x: number,
    y: number,
    content: string,
    style: { fontSize?: string } = {},
  ) => {
    const t = {
      content,
      destroyed: false,
      x,
      y,
      size: parseInt(style.fontSize ?? "0", 10),
    };
    texts.push(t);
    const self: Record<string, unknown> = chain({
      destroy: () => void (t.destroyed = true),
    });
    return self;
  };
  // as Phaser's, a container's destroy destroys what it holds
  const container = (
    _x = 0,
    _y = 0,
    children: { destroy?: () => void }[] = [],
  ) => {
    const self: Record<string, unknown> = chain({
      setDepth: (d: number) => (depths.add(d), self),
      destroy: () => children.forEach((c) => c.destroy?.()),
    });
    return self;
  };

  const scene = {
    add: { graphics, text, container, sprite: () => chain() },
    cameras: { main: camera },
    input,
    scale,
    events,
    time: { delayedCall: () => undefined },
  } as unknown as Phaser.Scene;
  const art = {
    resolve: () => ({
      placeholder: true,
      texture: "icon",
      anchor: { x: 0.5, y: 0.5 },
    }),
  } as unknown as ArtLibrary;

  const shown = () => texts.filter((t) => !t.destroyed).map((t) => t.content);
  const pointer = (x: number, y: number, button = 0) => ({ x, y, button });
  const move = (x: number, y: number) =>
    input.emit("pointermove", pointer(x, y));
  const press = (x: number, y: number, button: number) =>
    input.emit("pointerdown", pointer(x, y, button));
  const wheel = (x: number, y: number, dy: number) =>
    input.emit("wheel", pointer(x, y), [], 0, dy);
  return {
    scene,
    art,
    camera,
    input,
    scale,
    events,
    texts,
    shown,
    fills,
    depths,
    move,
    press,
    wheel,
  };
}

function overlayOnStage(bag: ItemState[] = [], gear: EquippedItems = worn()) {
  const s = recordingScene();
  const overlay = new GearOverlay(s.scene, s.art);
  const onEquip = vi.fn();
  const onUnequip = vi.fn();
  overlay.onEquip = onEquip;
  overlay.onUnequip = onUnequip;
  overlay.updateInventory(bag);
  overlay.updateEquipment(gear);
  overlay.show();
  const right = overlayLayout(s.camera.width, s.camera.height).right;
  const layout = (count: number) => gearPanelLayout(right, count);
  const centre = (r: { x: number; y: number; w: number; h: number }) =>
    [r.x + r.w / 2, r.y + r.h / 2] as const;
  const cell = (index: number) => centre(layout(bag.length).cells[index].rect);
  const slot = (name: keyof EquippedItems) =>
    centre(layout(bag.length).slots[name]);
  return { ...s, overlay, onEquip, onUnequip, cell, slot };
}

describe("GearOverlay (FS-HRH2J §A, §B)", () => {
  it("should cover the two panels while open, and nothing in the middle band or while closed (R8)", () => {
    const { overlay, camera } = overlayOnStage();
    const { left, right, band } = overlayLayout(camera.width, camera.height);
    expect(overlay.covers(left.x + 10, left.y + 10)).toBe(true);
    expect(overlay.covers(right.x + 10, right.y + 10)).toBe(true);
    expect(overlay.covers(band.x + band.w / 2, camera.height / 2)).toBe(false);

    overlay.hide();
    expect(overlay.covers(right.x + 10, right.y + 10)).toBe(false);
  });

  it("should draw the stats panel on the left and the gear and bag on the right, above the HUD", () => {
    const { shown, depths } = overlayOnStage([sword]);
    expect(shown()).toEqual(
      expect.arrayContaining(["CHARACTER", "GEAR", "BAG", "1 / 30"]),
    );
    expect(Math.min(...depths)).toBeGreaterThanOrEqual(GEAR_OVERLAY_DEPTH);
    expect(GEAR_OVERLAY_DEPTH).toBeGreaterThan(1000);
  });

  it("should name every empty gear slot, and count an empty bag 0 / 30 (edge state: Empty bag)", () => {
    const { shown } = overlayOnStage();
    expect(shown()).toEqual(
      expect.arrayContaining([
        "WEAPON",
        "HEAD",
        "BODY",
        "HANDS",
        "FEET",
        "RING 1",
        "RING 2",
        "CONS 1",
        "CONS 2",
        "CONS 3",
        "0 / 30",
      ]),
    );
  });

  it("should draw in the game palette, never the menus' Bone & Soot (R3)", () => {
    const { fills } = overlayOnStage([sword], worn({ head: helm }));
    const menu = Object.values(palette.menu);
    for (const c of fills) expect(menu).not.toContain(c);
    expect(fills).toContain(palette.ink);
  });

  it("should show the item tip on hover (R15)", () => {
    const { move, cell, shown } = overlayOnStage([sword]);
    move(...cell(0));
    expect(shown()).toContain("sword");
  });

  it("should wear a hovered bag item on right-click, the worn one going to the end of the bag (R16)", () => {
    const { overlay, move, press, cell, onEquip, shown } = overlayOnStage(
      [axe, helm],
      worn({ weapon: sword }),
    );
    move(...cell(0));
    press(...cell(0), 2);
    expect(onEquip).toHaveBeenCalledWith(axe, "weapon");
    expect(shown()).toContain("2 / 30");
    // the bag is now [helm, sword]: E over the second cell wears the sword again
    move(...cell(1));
    overlay.handleEquipKey();
    expect(onEquip).toHaveBeenLastCalledWith(sword, "weapon");
  });

  it("should do nothing on a left-click (R18), nor on E with nothing hovered (R10)", () => {
    const { overlay, move, press, cell, onEquip, onUnequip, camera } =
      overlayOnStage([axe]);
    move(...cell(0));
    press(...cell(0), 0);
    move(camera.width / 2, camera.height / 2);
    overlay.handleEquipKey();
    expect(onEquip).not.toHaveBeenCalled();
    expect(onUnequip).not.toHaveBeenCalled();
  });

  it("should take off a hovered worn item on E or right-click to the end of the bag (R17)", () => {
    const { overlay, move, press, slot, onUnequip, shown } = overlayOnStage(
      [sword],
      worn({ head: helm }),
    );
    move(...slot("head"));
    overlay.handleEquipKey();
    expect(onUnequip).toHaveBeenCalledWith(helm, "head");
    expect(shown()).toContain("2 / 30");
    press(...slot("head"), 2);
    expect(onUnequip).toHaveBeenCalledTimes(1);
  });

  it("should leave a worn item worn when the bag has no room (R20)", () => {
    const { overlay, move, slot, onUnequip, shown } = overlayOnStage(
      [],
      worn({ head: helm }),
    );
    overlay.mayUnequip = () => false;
    move(...slot("head"));
    overlay.handleEquipKey();
    expect(onUnequip).not.toHaveBeenCalled();
    expect(shown()).toContain("0 / 30");
  });

  it("should show a status line and take no change while it is set (FS-HRH2J R42–43)", () => {
    const { overlay, move, press, cell, slot, onEquip, onUnequip, shown } =
      overlayOnStage([axe], worn({ head: helm }));
    overlay.setStatus("Changing your gear...");
    expect(shown()).toContain("Changing your gear...");

    move(...cell(0));
    press(...cell(0), 2);
    move(...slot("head"));
    overlay.handleEquipKey();
    expect(onEquip).not.toHaveBeenCalled();
    expect(onUnequip).not.toHaveBeenCalled();
    // the tip still reads while locked
    expect(shown()).toContain("helm");

    overlay.setStatus(undefined);
    expect(shown()).not.toContain("Changing your gear...");
    overlay.handleEquipKey();
    expect(onUnequip).toHaveBeenCalledWith(helm, "head");
  });

  it("should keep a status set while closed for the next open", () => {
    const { overlay, shown } = overlayOnStage();
    overlay.hide();
    overlay.setStatus("Fetching your gear...");
    overlay.show();
    expect(shown()).toContain("Fetching your gear...");
  });

  it("should read an over-capacity bag as over, every item kept (R23)", () => {
    const bag = Array.from({ length: BAG_CAPACITY + 4 }, (_, i) =>
      item(`i${i}`),
    );
    const { shown } = overlayOnStage(bag);
    expect(shown()).toContain("34 / 30");
  });

  it("should lay itself out again when the canvas is resized while open (R2)", () => {
    const { overlay, scale, camera } = overlayOnStage();
    camera.width = 1600;
    camera.height = 900;
    scale.emit("resize");
    const { right } = overlayLayout(1600, 900);
    expect(overlay.covers(right.x + 2, right.y + 2)).toBe(true);
    expect(overlay.covers(1600 / 2, 450)).toBe(false);
  });

  it("should close and let go of its handlers when its scene shuts down (edge state: World switch while open)", () => {
    const { overlay, events, input, scale } = overlayOnStage();
    events.emit("shutdown");
    expect(overlay.isVisible()).toBe(false);
    expect(input.listenerCount("pointerdown")).toBe(0);
    expect(scale.listenerCount("resize")).toBe(0);
  });
});

describe("GearOverlay stats panel (FS-HRH2J §C R24–30)", () => {
  const ignis = {
    username: "Ignis",
    class: "mage",
    level: 3,
    experience: 150,
    level_floor: 100,
    next_level_at: 230,
    current_health: 72,
    max_health: 100,
    resource: {
      kind: "mana" as const,
      current: 40,
      max: 150,
      ability_cost: 20,
    },
  };

  function statsOnStage(
    gear: EquippedItems = worn({ weapon: sword }),
    width = 1080,
    height = 720,
  ) {
    const s = recordingScene(width, height);
    const overlay = new GearOverlay(s.scene, s.art);
    overlay.updateEquipment(gear);
    overlay.updateCharacter(ignis);
    overlay.show();
    return { ...s, overlay };
  }

  it("should show the class, the name, the level, experience, health, the resource, the class card and gear, with no fetch", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const { shown } = statsOnStage();

    expect(shown()).toEqual(
      expect.arrayContaining([
        "MAGE",
        "Ignis",
        "Level 3",
        "50 / 130",
        "Health",
        "72 / 100",
        "Mana",
        "40 / 150",
        "CLASS",
        "HP",
        "Range",
        "FROM GEAR",
        "Attack",
        "10",
      ]),
    );
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it("should read Max level at the cap", () => {
    const { overlay, shown } = statsOnStage();
    overlay.updateCharacter({ ...ignis, level: 20, next_level_at: undefined });
    expect(shown()).toEqual(expect.arrayContaining(["Level 20", "Max level"]));
  });

  it("should hide the rows the state does not carry (edge state: Hub with no resource or current_health)", () => {
    const { overlay, shown } = statsOnStage();
    overlay.updateCharacter({ username: "Ignis", class: "mage", level: 3 });
    expect(shown()).not.toContain("Health");
    expect(shown()).not.toContain("Mana");
    expect(shown()).toContain("Level 3");
  });

  it("should say Nothing worn when nothing is (edge state: Empty bag / nothing worn)", () => {
    const { shown } = statsOnStage(worn());
    expect(shown()).toContain("Nothing worn");
  });

  it("should update while open as health, the resource and worn gear change (R30)", () => {
    const { overlay, shown } = statsOnStage();

    overlay.updateCharacter({ ...ignis, current_health: 31 });
    expect(shown()).toContain("31 / 100");
    expect(shown()).not.toContain("72 / 100");

    overlay.updateEquipment(worn({ weapon: axe }));
    expect(shown()).toContain("12");
    expect(shown()).not.toContain("10");
  });

  it("should not draw again for a state that changes nothing it shows", () => {
    const { overlay, texts } = statsOnStage();
    const drawn = texts.length;

    overlay.updateCharacter({
      ...ignis,
      position: { x: 4, y: 9 },
    } as typeof ignis);

    expect(texts.length).toBe(drawn);
  });

  /** The stats rows drawn now (the panel's title aside), and the area they must keep inside. */
  function statsRowsShown(s: ReturnType<typeof statsOnStage>) {
    const { left } = overlayLayout(s.camera.width, s.camera.height);
    const area = statsPanelArea(left);
    const rows = s.texts.filter(
      (t) => !t.destroyed && t.x <= left.x + left.w && t.content !== "CHARACTER",
    );
    return { area, rows, left };
  }

  it("should keep every row, the header too, inside the panel on a short window (edge state: Small window)", () => {
    const s = statsOnStage(worn({ weapon: sword }), 640, 100);
    const { area, rows } = statsRowsShown(s);

    expect(rows.map((r) => r.content)).toContain("MAGE");
    for (const r of rows) {
      expect(r.y).toBeGreaterThanOrEqual(area.y);
      expect(r.y + r.size).toBeLessThanOrEqual(area.y + area.h);
    }
  });

  it("should scroll its rows with the wheel when they do not fit, every row reachable (edge state: Small window)", () => {
    const s = statsOnStage(worn({ weapon: sword }), 640, 300);
    const { area, left } = statsRowsShown(s);
    const overStats = [left.x + left.w / 2, area.y + area.h / 2] as const;
    expect(s.shown()).toContain("MAGE");
    expect(s.shown()).not.toContain("FROM GEAR");

    // the wheel in the clear middle band scrolls nothing
    s.wheel(s.camera.width / 2, area.y + 10, 1);
    expect(s.shown()).toContain("MAGE");

    for (let i = 0; i < 40; i++) s.wheel(...overStats, 1);
    expect(s.shown()).toEqual(
      expect.arrayContaining(["FROM GEAR", "Attack", "10"]),
    );
    expect(s.shown()).not.toContain("MAGE");
    for (const r of statsRowsShown(s).rows) {
      expect(r.y).toBeGreaterThanOrEqual(area.y);
      expect(r.y + r.size).toBeLessThanOrEqual(area.y + area.h);
    }

    for (let i = 0; i < 40; i++) s.wheel(...overStats, -1);
    expect(s.shown()).toContain("MAGE");
  });
});
