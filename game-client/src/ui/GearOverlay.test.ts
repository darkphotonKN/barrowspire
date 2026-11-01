import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "eventemitter3";
import type { EquippedItems, ItemState } from "@/types/gameState";
import type { WorldType } from "@/assets/types/client";
import { IN_RUN_NOTE, UNSAFE_FIND_NOTE } from "@/items/itemView";
import type { ArtLibrary } from "@/render/art/library";
import { palette } from "@/utils/canvasPalette";
import {
  GEAR_OVERLAY_DEPTH,
  GearOverlay,
  STASH_HINT,
  UNAVAILABLE_ALPHA,
} from "./GearOverlay";
import { BAG_CAPACITY } from "./bag";
import { STASH_CAPACITY } from "./stash";
import {
  gearPanelLayout,
  overlayLayout,
  stashPanelLayout,
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
  /** Every line colour drawn (borders, edges). */
  const strokes = new Set<number>();
  /** Every icon sprite drawn, with the alpha it was given (1 unless dimmed). */
  const sprites: { x: number; y: number; alpha: number }[] = [];
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
      lineStyle: (_w: number, c: number) => (strokes.add(c), g),
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
    add: {
      graphics,
      text,
      container,
      sprite: (x: number, y: number) => {
        const s = { x, y, alpha: 1 };
        sprites.push(s);
        const self: Record<string, unknown> = chain({
          setAlpha: (a: number) => ((s.alpha = a), self),
        });
        return self;
      },
    },
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
    strokes,
    sprites,
    depths,
    move,
    press,
    wheel,
  };
}

function overlayOnStage(
  bag: ItemState[] = [],
  gear: EquippedItems = worn(),
  world?: WorldType,
) {
  const s = recordingScene();
  const overlay = new GearOverlay(s.scene, s.art, world);
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

describe("GearOverlay stash mode (FS-VPD8Y §F R35–37)", () => {
  const ignis = { username: "Ignis", class: "mage", level: 3 };

  /** The overlay opened at the stash chest, the bag, gear and stash then loaded into it. */
  function stashOnStage(
    stash: ItemState[] = [],
    bag: ItemState[] = [],
    gear: EquippedItems = worn(),
  ) {
    const s = recordingScene();
    const overlay = new GearOverlay(s.scene, s.art);
    const onEquip = vi.fn();
    const onUnequip = vi.fn();
    const onMove = vi.fn();
    overlay.onEquip = onEquip;
    overlay.onUnequip = onUnequip;
    overlay.onMove = onMove;
    overlay.updateCharacter(ignis);
    overlay.openStash();
    overlay.updateInventory(bag);
    overlay.updateEquipment(gear);
    overlay.updateStash(stash);
    const { left, right } = overlayLayout(s.camera.width, s.camera.height);
    const centre = (r: { x: number; y: number; w: number; h: number }) =>
      [r.x + r.w / 2, r.y + r.h / 2] as const;
    const stashCell = (index: number, scroll = 0) =>
      centre(
        stashPanelLayout(left, stash.length, scroll).cells.find(
          (c) => c.index === index,
        )!.rect,
      );
    const bagCell = (index: number, count = bag.length) =>
      centre(gearPanelLayout(right, count).cells[index].rect);
    const slot = (name: keyof EquippedItems) =>
      centre(gearPanelLayout(right, bag.length).slots[name]);
    return {
      ...s,
      overlay,
      onEquip,
      onUnequip,
      onMove,
      left,
      stashCell,
      bagCell,
      slot,
    };
  }

  it("should open with the stash grid in the left panel instead of the stats, the gear and bag unchanged (R35)", () => {
    const { overlay, shown } = stashOnStage([axe], [sword]);
    expect(overlay.isVisible()).toBe(true);
    expect(overlay.isStashOpen()).toBe(true);
    expect(shown()).toEqual(
      expect.arrayContaining(["STASH", "1 / 60", "GEAR", "BAG", "1 / 30"]),
    );
    expect(shown()).not.toContain("CHARACTER");
    expect(shown()).not.toContain("Ignis");
  });

  it("should count an empty stash 0 / 60 (edge state: Empty stash)", () => {
    const { shown } = stashOnStage();
    expect(shown()).toContain("0 / 60");
  });

  it("should keep the stats panel away while the player's state updates in stash mode", () => {
    const { overlay, shown } = stashOnStage();
    overlay.updateCharacter({ ...ignis, level: 4 });
    expect(shown()).not.toContain("Ignis");
    expect(shown()).toContain("STASH");
  });

  it("should show a hovered stash item's tip (R35)", () => {
    const { move, stashCell, shown } = stashOnStage([axe]);
    move(...stashCell(0));
    expect(shown()).toContain("axe");
  });

  it("should read a stash over 60 as over, its extra rows tinted and every item reachable by the wheel (R36)", () => {
    const stash = Array.from({ length: STASH_CAPACITY + 4 }, (_, i) =>
      item(`s${i}`),
    );
    const { shown, fills, wheel, move, stashCell, left } = stashOnStage(stash);
    expect(shown()).toContain("64 / 60");
    const first = stashPanelLayout(left, stash.length);
    expect(first.visibleRows).toBeLessThan(first.rows);

    for (let i = 0; i < 5; i++) wheel(...stashCell(0), 1);
    expect(fills).toContain(palette.damage);
    move(...stashCell(63, first.rows));
    expect(shown()).toContain("s63");
  });

  it("should move a hovered bag item to the end of the stash on right-click or E (R38, R41)", () => {
    const { overlay, move, press, bagCell, stashCell, onMove, onEquip, shown } =
      stashOnStage([helm], [sword, axe]);
    move(...bagCell(0));
    press(...bagCell(0), 2);
    expect(onMove).toHaveBeenCalledWith(sword, "stash");
    expect(shown()).toEqual(expect.arrayContaining(["1 / 30", "2 / 60"]));
    // the stash is now [helm, sword]
    move(...stashCell(1));
    expect(shown()).toContain("sword");

    move(...bagCell(0, 1));
    overlay.handleEquipKey();
    expect(onMove).toHaveBeenLastCalledWith(axe, "stash");
    expect(shown()).toEqual(expect.arrayContaining(["0 / 30", "3 / 60"]));
    expect(onEquip).not.toHaveBeenCalled();
  });

  it("should move a hovered stash item to the end of the bag on right-click or E (R38, R41)", () => {
    const { overlay, move, press, stashCell, bagCell, onMove, shown } =
      stashOnStage([axe, helm], [sword]);
    move(...stashCell(0));
    press(...stashCell(0), 2);
    expect(onMove).toHaveBeenCalledWith(axe, "bag");
    expect(shown()).toEqual(expect.arrayContaining(["2 / 30", "1 / 60"]));
    move(...bagCell(1, 2));
    expect(shown()).toContain("axe");

    move(...stashCell(0));
    overlay.handleEquipKey();
    expect(onMove).toHaveBeenLastCalledWith(helm, "bag");
    expect(shown()).toEqual(expect.arrayContaining(["3 / 30", "0 / 60"]));
  });

  it("should leave an item where it is when the move is not allowed (R39)", () => {
    const { overlay, move, bagCell, onMove, shown } = stashOnStage([], [sword]);
    const mayMove = vi.fn(() => false);
    overlay.mayMove = mayMove;
    move(...bagCell(0));
    overlay.handleEquipKey();
    expect(mayMove).toHaveBeenCalledWith(sword, "stash");
    expect(onMove).not.toHaveBeenCalled();
    expect(shown()).toEqual(expect.arrayContaining(["1 / 30", "0 / 60"]));
  });

  it("should take no move while a status is set (R41: one request at a time)", () => {
    const { overlay, move, press, bagCell, onMove } = stashOnStage([], [sword]);
    overlay.setStatus("Changing your gear...");
    move(...bagCell(0));
    press(...bagCell(0), 2);
    overlay.handleEquipKey();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("should do nothing on a left-click in stash mode (R38)", () => {
    const { move, press, bagCell, stashCell, onMove } = stashOnStage(
      [axe],
      [sword],
    );
    move(...bagCell(0));
    press(...bagCell(0), 0);
    move(...stashCell(0));
    press(...stashCell(0), 0);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("should dim an item that is not AVAILABLE in the bag and the stash (R40)", () => {
    const listed = item("listed", { status: "LISTED" });
    const settling = item("settling", { status: "PENDING_SETTLEMENT" });
    const free = item("free", { status: "AVAILABLE" });
    const { sprites, stashCell, bagCell } = stashOnStage(
      [listed, free],
      [settling],
    );
    const alphaAt = ([x, y]: readonly [number, number]) =>
      sprites.filter((s) => s.x === x && s.y === y).at(-1)?.alpha;
    expect(alphaAt(stashCell(0))).toBe(UNAVAILABLE_ALPHA);
    expect(alphaAt(stashCell(1))).toBe(1);
    expect(alphaAt(bagCell(0))).toBe(UNAVAILABLE_ALPHA);
    expect(UNAVAILABLE_ALPHA).toBeLessThan(1);
  });

  it("should hint at moving between bag and stash (R38)", () => {
    const { shown } = stashOnStage();
    expect(shown()).toContain(STASH_HINT);
    expect(STASH_HINT).toMatch(/stash/i);
  });

  it("should never wear a bag or stash item in stash mode (R37/R38: equip is not offered)", () => {
    const { overlay, move, press, stashCell, bagCell, onEquip } = stashOnStage(
      [axe],
      [sword],
    );
    move(...bagCell(0));
    press(...bagCell(0), 2);
    overlay.handleEquipKey();
    move(...stashCell(0));
    press(...stashCell(0), 2);
    overlay.handleEquipKey();
    expect(onEquip).not.toHaveBeenCalled();
  });

  it("should still take off a worn item to the bag in stash mode (R38)", () => {
    const { overlay, move, slot, onUnequip, shown } = stashOnStage(
      [],
      [],
      worn({ head: helm }),
    );
    move(...slot("head"));
    overlay.handleEquipKey();
    expect(onUnequip).toHaveBeenCalledWith(helm, "head");
    expect(shown()).toContain("1 / 30");
  });

  it("should show a status line over the stash as well as the bag (edge state: REST load fails in stash mode)", () => {
    const { overlay, shown } = stashOnStage();
    overlay.setStatus("Could not fetch your gear.");
    expect(
      shown().filter((t) => t === "Could not fetch your gear."),
    ).toHaveLength(2);
  });

  it("should end stash mode on closing, the next open showing the stats (R37)", () => {
    const { overlay, shown } = stashOnStage([axe]);
    overlay.hide();
    expect(overlay.isStashOpen()).toBe(false);
    overlay.show();
    expect(shown()).toContain("CHARACTER");
    expect(shown()).toContain("Ignis");
    expect(shown()).not.toContain("STASH");
    expect(shown()).not.toContain("1 / 60");
  });

  it("should end stash mode when its scene shuts down (edge state: World switch while the stash is open)", () => {
    const { overlay, events } = stashOnStage();
    events.emit("shutdown");
    expect(overlay.isStashOpen()).toBe(false);
  });

  it("should not turn an open overlay into stash mode", () => {
    const s = recordingScene();
    const overlay = new GearOverlay(s.scene, s.art);
    overlay.show();
    overlay.openStash();
    expect(overlay.isStashOpen()).toBe(false);
    expect(s.shown()).toContain("CHARACTER");
  });
});

describe("GearOverlay item standing (FS-18Z5F §H)", () => {
  const charm = item("charm", { rarity: "rare", unsafe: true });
  const ringFind = item("band", { rarity: "rare", unsafe: true });
  const oldRing = item("old-band", { rarity: "rare" });

  it("should edge an unsafe find in oxblood in a bag cell and a worn slot in a run, the rarity edge kept (R36)", () => {
    const inBag = overlayOnStage([charm], worn(), "run");
    expect(inBag.strokes).toContain(palette.unsafeFind);
    expect(inBag.fills).toContain(palette.rarity.rare);

    const wornFind = overlayOnStage([], worn({ ring_1: ringFind }), "run");
    expect(wornFind.strokes).toContain(palette.unsafeFind);
    expect(wornFind.fills).toContain(palette.rarity.rare);
  });

  it("should not edge a safe item in a run (R36)", () => {
    const { strokes, fills } = overlayOnStage(
      [oldRing],
      worn({ ring_1: oldRing }),
      "run",
    );
    expect(strokes).not.toContain(palette.unsafeFind);
    expect(fills).toContain(palette.rarity.rare);
  });

  it("should add the unsafe note to an unsafe find's tip in a run (R36)", () => {
    const { move, cell, slot, shown } = overlayOnStage(
      [charm],
      worn({ ring_1: ringFind }),
      "run",
    );
    move(...cell(0));
    expect(shown()).toContain(UNSAFE_FIND_NOTE);
    move(...slot("ring_1"));
    expect(shown()).toContain(UNSAFE_FIND_NOTE);
  });

  it.each([["field" as const], ["hub" as const]])(
    "should mark nothing on an unsafe find in a %s world (R37)",
    (world) => {
      const { strokes, move, cell, shown } = overlayOnStage(
        [charm],
        worn({ ring_1: ringFind }),
        world,
      );
      expect(strokes).not.toContain(palette.unsafeFind);
      move(...cell(0));
      expect(shown()).not.toContain(UNSAFE_FIND_NOTE);
    },
  );

  it("should dim an IN_RUN item worn or in the bag in the hub, its tip saying it is still in a delve (R38)", () => {
    const helmInRun = item("helm-in-run", {
      armor_slot: "head",
      status: "IN_RUN",
    });
    const bagInRun = item("bag-in-run", { status: "IN_RUN" });
    const { sprites, move, cell, slot, shown } = overlayOnStage(
      [bagInRun],
      worn({ head: helmInRun }),
      "hub",
    );
    const alphaAt = ([x, y]: readonly [number, number]) =>
      sprites.filter((sp) => sp.x === x && sp.y === y).at(-1)?.alpha;
    expect(alphaAt(cell(0))).toBe(UNAVAILABLE_ALPHA);
    expect(alphaAt(slot("head"))).toBe(UNAVAILABLE_ALPHA);
    move(...cell(0));
    expect(shown()).toContain(IN_RUN_NOTE);
    move(...slot("head"));
    expect(shown()).toContain(IN_RUN_NOTE);
  });

  it("should ask before an equip is drawn, leaving everything where it was when refused", () => {
    const { overlay, move, press, cell, onEquip, shown } = overlayOnStage(
      [axe],
      worn({ weapon: sword }),
      "hub",
    );
    const mayEquip = vi.fn(() => false);
    overlay.mayEquip = mayEquip;
    move(...cell(0));
    press(...cell(0), 2);
    expect(mayEquip).toHaveBeenCalledWith(axe, "weapon");
    expect(onEquip).not.toHaveBeenCalled();
    expect(shown()).toContain("1 / 30");
  });

  it("should ask about the very item before an unequip", () => {
    const { overlay, move, slot, onUnequip } = overlayOnStage(
      [],
      worn({ head: helm }),
      "hub",
    );
    const mayUnequip = vi.fn(() => false);
    overlay.mayUnequip = mayUnequip;
    move(...slot("head"));
    overlay.handleEquipKey();
    expect(mayUnequip).toHaveBeenCalledWith(helm);
    expect(onUnequip).not.toHaveBeenCalled();
  });
});
