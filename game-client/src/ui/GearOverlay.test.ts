import { afterEach, describe, expect, it, vi } from "vitest";
import { viewport } from "@/render/viewport";
import { EventEmitter } from "eventemitter3";
import type { EquippedItems, ItemState } from "@/types/gameState";
import type { WorldType } from "@/assets/types/client";
import { IN_RUN_NOTE, UNSAFE_FIND_NOTE } from "@/items/itemView";
import type { ArtLibrary } from "@/render/art/library";
import { palette } from "@/utils/canvasPalette";
import {
  GEAR_HINT,
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
 * The part of Phaser's scene keyboard the overlay reads, as Phaser keeps it: a key exists only
 * once added, adding a key that exists hands back that same key, a removed key hears no more
 * presses, a press reaches a key only while the keyboard is enabled, and `resetKeys` (on blur,
 * and as the chat input opens) lets every key go without an event. SHIFT is there from the
 * start, as every scene's `createCursorKeys()` adds it before the overlay ever opens.
 */
function recordingKeyboard() {
  const keys = new Map<string, { isDown: boolean }>([
    ["SHIFT", { isDown: false }],
  ]);
  /** The keys added with capture on: their browser default would be stopped. */
  const captured: string[] = [];
  const keyboard = {
    enabled: true,
    addKey(code: string, enableCapture = true) {
      if (enableCapture) captured.push(code);
      const key = keys.get(code) ?? { isDown: false };
      keys.set(code, key);
      return key;
    },
    removeKey(key: { isDown: boolean } | string) {
      for (const [code, k] of keys)
        if (k === key || code === key) keys.delete(code);
    },
    resetKeys() {
      keys.forEach((k) => (k.isDown = false));
    },
  };
  /** A press or release of `code`, as the keyboard plugin hands it to its key. */
  const key = (code: string, down: boolean) => {
    const k = keys.get(code);
    if (k && keyboard.enabled) k.isDown = down;
  };
  return { keyboard, keys, captured, key };
}

/**
 * A scene that records what the overlay draws (text, fills, depths) and the pointer, wheel,
 * resize and frame handlers it hangs on; every other call is accepted and ignored.
 */
function recordingScene(width = 1080, height = 720, renderScale = 1) {
  // the overlay lays out in the logical view, read from the viewport (FS-ZAJMH R2)
  viewport.set({ width, height, renderScale });
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
  const keys = recordingKeyboard();
  const input = Object.assign(new EventEmitter(), {
    keyboard: keys.keyboard,
  });
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
  /** A pointer at logical (x, y): Phaser's `pointer.x/y` are backing px, so × the render scale. */
  const pointer = (x: number, y: number, button = 0) => ({
    x: x * renderScale,
    y: y * renderScale,
    button,
  });
  const move = (x: number, y: number) =>
    input.emit("pointermove", pointer(x, y));
  const press = (x: number, y: number, button: number) =>
    input.emit("pointerdown", pointer(x, y, button));
  const wheel = (x: number, y: number, dy: number) =>
    input.emit("wheel", pointer(x, y), [], 0, dy);
  /** One game step: the scene's update, after the keyboard has handed its keys their events. */
  const frame = () => events.emit("update");
  /** Shift pressed or released, then a frame. */
  const shift = (down: boolean) => {
    keys.key("SHIFT", down);
    frame();
  };
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
    frame,
    shift,
    keyboard: keys.keyboard,
    keys: keys.keys,
    captured: keys.captured,
  };
}

afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

function overlayOnStage(
  bag: ItemState[] = [],
  gear: EquippedItems = worn(),
  world?: WorldType,
  renderScale = 1,
) {
  const s = recordingScene(1080, 720, renderScale);
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

  it.each([1, 1.5, 2])(
    "should land a right-click on the item under the cursor at render scale %s (FS-ZAJMH R15)",
    (rs) => {
      const { move, press, cell, onEquip } = overlayOnStage(
        [axe, helm],
        worn({ weapon: sword }),
        undefined,
        rs,
      );
      move(...cell(1));
      press(...cell(1), 2);
      expect(onEquip).toHaveBeenCalledWith(helm, "head");
    },
  );

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
    const { overlay, scale } = overlayOnStage();
    viewport.set({ width: 1600, height: 900, renderScale: 1 });
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
      (t) =>
        !t.destroyed && t.x <= left.x + left.w && t.content !== "CHARACTER",
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

describe("GearOverlay compare (FS-NV54P)", () => {
  /** The "Worn" captions drawn now (upper-cased as the badge is, R14). */
  const captions = (shown: () => string[]) =>
    shown().filter((t) => t === "WORN");

  it("should show the worn weapon's tip captioned Worn while Shift is held over a bag weapon, and take it away on release (R1–2, R14)", () => {
    const { move, cell, shift, shown } = overlayOnStage(
      [sword],
      worn({ weapon: axe }),
    );
    move(...cell(0));
    expect(shown()).toContain("sword");
    expect(shown()).not.toContain("axe");

    shift(true);
    expect(shown()).toEqual(expect.arrayContaining(["sword", "axe", "WORN"]));
    expect(captions(shown)).toHaveLength(1);

    shift(false);
    expect(shown()).toContain("sword");
    expect(shown()).not.toContain("axe");
    expect(captions(shown)).toHaveLength(0);
  });

  it.each([
    ["head", "head"],
    ["chest", "body"],
    ["gloves", "hands"],
    ["legs", "feet"],
  ] as const)(
    "should compare a bag %s piece with what is worn in %s, and add nothing with it empty (R8, R10)",
    (armorSlot, slot) => {
      const piece = item("new-piece", { armor_slot: armorSlot });
      const old = item("old-piece", { armor_slot: armorSlot });
      const wearing = overlayOnStage([piece], worn({ [slot]: old }));
      wearing.move(...wearing.cell(0));
      wearing.shift(true);
      expect(wearing.shown()).toContain("old-piece");
      expect(captions(wearing.shown)).toHaveLength(1);

      const bare = overlayOnStage([piece]);
      bare.move(...bare.cell(0));
      bare.shift(true);
      expect(bare.shown()).toContain("new-piece");
      expect(captions(bare.shown)).toHaveLength(0);
    },
  );

  it("should compare when Shift is already held as the pointer reaches the item (R3)", () => {
    const { move, cell, shift, shown } = overlayOnStage(
      [sword],
      worn({ weapon: axe }),
    );
    shift(true);
    expect(captions(shown)).toHaveLength(0);
    move(...cell(0));
    expect(shown()).toEqual(expect.arrayContaining(["sword", "axe", "WORN"]));
  });

  it.each([
    ["a consumable", item("draught", { healing_amount: 20 })],
    ["armour with no slot", item("plate", { defense_rating: 4 })],
    ["an item of unknown kind", item("relic", { item_type: "relic" })],
  ])("should never compare %s (R9)", (_name, bagItem) => {
    const { move, cell, shift, shown } = overlayOnStage(
      [bagItem],
      worn({
        weapon: axe,
        head: helm,
        consumable_1: item("old-draught", { healing_amount: 10 }),
      }),
    );
    move(...cell(0));
    shift(true);
    expect(shown()).toContain(bagItem.name);
    expect(captions(shown)).toHaveLength(0);
  });

  it("should add nothing under Shift over a worn slot, an empty cell or outside the cells (R7)", () => {
    const { move, cell, slot, shift, shown, camera } = overlayOnStage(
      [sword],
      worn({ weapon: axe }),
    );
    shift(true);
    move(...slot("weapon"));
    expect(shown()).toContain("axe");
    expect(captions(shown)).toHaveLength(0);
    move(...cell(1));
    expect(captions(shown)).toHaveLength(0);
    move(camera.width / 2, camera.height / 2);
    expect(captions(shown)).toHaveLength(0);
  });

  it("should read Shift only while open, leave the scene's own Shift key working after closing, and never capture it (R4–5, R23)", () => {
    const s = recordingScene();
    const overlay = new GearOverlay(s.scene, s.art);
    overlay.updateInventory([sword]);
    overlay.updateEquipment(worn({ weapon: axe }));
    const scenesShift = s.keys.get("SHIFT");
    expect(s.events.listenerCount("update")).toBe(0);

    overlay.show();
    expect(s.events.listenerCount("update")).toBe(1);
    overlay.hide();
    expect(s.events.listenerCount("update")).toBe(0);
    // the key is the scene's (its cursor keys' shift), not the overlay's to take off
    expect(s.keys.get("SHIFT")).toBe(scenesShift);

    s.shift(true);
    expect(scenesShift?.isDown).toBe(true);
    expect(s.shown()).toHaveLength(0);
    s.shift(false);
    expect(scenesShift?.isDown).toBe(false);
    expect(s.captured).toEqual([]);
  });

  it("should compare when the overlay opens under a Shift already held, on the first open and on a reopen (R3)", () => {
    const s = recordingScene();
    const overlay = new GearOverlay(s.scene, s.art);
    overlay.updateInventory([sword]);
    overlay.updateEquipment(worn({ weapon: axe }));
    const { right } = overlayLayout(s.camera.width, s.camera.height);
    const r = gearPanelLayout(right, 1).cells[0].rect;
    const overBag = () => s.move(r.x + r.w / 2, r.y + r.h / 2);

    s.shift(true);
    overlay.show();
    s.frame();
    overBag();
    expect(captions(s.shown)).toHaveLength(1);

    // closed and opened again, Shift never let go
    overlay.hide();
    s.frame();
    overlay.show();
    s.frame();
    overBag();
    expect(captions(s.shown)).toHaveLength(1);
  });

  it("should let go of the worn tips when the keyboard lets go of its keys: on blur, and as the chat input opens (R6)", () => {
    const { move, cell, shift, frame, keyboard, shown } = overlayOnStage(
      [sword],
      worn({ weapon: axe }),
    );
    move(...cell(0));
    shift(true);
    expect(captions(shown)).toHaveLength(1);

    // Phaser's blur reset
    keyboard.resetKeys();
    frame();
    expect(captions(shown)).toHaveLength(0);
    expect(shown()).toContain("sword");

    // the chat input opening: keys let go, the keyboard off, so Shift typed in chat never compares
    shift(true);
    keyboard.resetKeys();
    keyboard.enabled = false;
    frame();
    expect(captions(shown)).toHaveLength(0);
    shift(true);
    expect(captions(shown)).toHaveLength(0);
  });

  it("should compare a bag item in stash mode, and never a stash item (R7, R11)", () => {
    const s = recordingScene();
    const overlay = new GearOverlay(s.scene, s.art);
    overlay.openStash();
    overlay.updateInventory([sword]);
    overlay.updateEquipment(worn({ weapon: axe }));
    overlay.updateStash([item("spare", { weapon_type: "sword" })]);
    const { left, right } = overlayLayout(s.camera.width, s.camera.height);
    const centre = (r: { x: number; y: number; w: number; h: number }) =>
      [r.x + r.w / 2, r.y + r.h / 2] as const;

    s.shift(true);
    s.move(...centre(gearPanelLayout(right, 1).cells[0].rect));
    expect(s.shown()).toEqual(expect.arrayContaining(["sword", "axe", "WORN"]));

    s.move(...centre(stashPanelLayout(left, 1).cells[0].rect));
    expect(s.shown()).toContain("spare");
    expect(captions(s.shown)).toHaveLength(0);
  });

  it("should build the worn tip from the same view as the worn item's own tip, only the caption added, no delta drawn (R13–16)", () => {
    const find = item("charm-blade", {
      weapon_type: "sword",
      attack_power: 9,
      rarity: "rare",
      unsafe: true,
      required_level: 9,
    });
    const s = overlayOnStage([sword], worn({ weapon: find }), "run");
    s.overlay.setCharacterLevel(3);
    /** The tip texts drawn now: everything shown less the panels' own words. */
    const panels = s.shown();
    const tipTexts = () => {
      const left = [...panels];
      return s.shown().filter((t) => {
        const i = left.indexOf(t);
        if (i < 0) return true;
        left.splice(i, 1);
        return false;
      });
    };

    s.move(...s.slot("weapon"));
    const ownTip = tipTexts();
    expect(ownTip).toContain(UNSAFE_FIND_NOTE);

    s.move(...s.cell(0));
    const itemTip = tipTexts();
    expect(itemTip).not.toContain("WORN");

    s.shift(true);
    expect(tipTexts().sort()).toEqual([...itemTip, "WORN", ...ownTip].sort());
    expect(s.fills).toContain(palette.rarity.rare);
  });

  it("should take the worn tips away on moving to another cell, closing and the scene shutting down (R21)", () => {
    const { overlay, move, cell, shift, shown, events } = overlayOnStage(
      [sword, item("trinket")],
      worn({ weapon: axe }),
    );
    shift(true);
    move(...cell(0));
    expect(captions(shown)).toHaveLength(1);
    move(...cell(1));
    expect(shown()).not.toContain("axe");
    expect(captions(shown)).toHaveLength(0);

    move(...cell(0));
    overlay.hide();
    expect(captions(shown)).toHaveLength(0);
    expect(shown()).toHaveLength(0);

    overlay.show();
    shift(true);
    move(...cell(0));
    expect(captions(shown)).toHaveLength(1);
    events.emit("shutdown");
    expect(shown()).toHaveLength(0);
  });

  it("should rebuild the worn tips from what is worn now on a redraw: a state, a resize, an equip with Shift held (R21–22)", () => {
    const { overlay, move, press, cell, shift, shown, scale, onEquip } =
      overlayOnStage([sword], worn({ weapon: axe }));
    move(...cell(0));
    shift(true);
    expect(shown()).toContain("axe");

    const blade = item("blade", { weapon_type: "sword" });
    overlay.updateEquipment(worn({ weapon: blade }));
    expect(shown()).not.toContain("axe");
    expect(shown()).toContain("blade");
    expect(captions(shown)).toHaveLength(1);

    scale.emit("resize");
    expect(captions(shown)).toHaveLength(1);

    // the sword is worn now and the blade back in the bag, under the pointer: it compares with the sword
    press(...cell(0), 2);
    expect(onEquip).toHaveBeenCalledWith(sword, "weapon");
    expect(shown()).toEqual(expect.arrayContaining(["blade", "sword", "WORN"]));
    expect(captions(shown)).toHaveLength(1);
  });

  it.each([
    ["above the character's level", { required_level: 12 }, undefined],
    ["not available", { status: "LISTED" }, undefined],
    ["under a status line", {}, "Changing your gear..."],
  ] as const)(
    "should still compare a bag item %s (R12)",
    (_name, extra, status) => {
      const s = overlayOnStage(
        [item("great-sword", { weapon_type: "sword", ...extra })],
        worn({ weapon: axe }),
        "hub",
      );
      s.overlay.setCharacterLevel(3);
      if (status) s.overlay.setStatus(status);
      s.move(...s.cell(0));
      s.shift(true);
      expect(s.shown()).toEqual(expect.arrayContaining(["great-sword", "axe"]));
      expect(captions(s.shown)).toHaveLength(1);
    },
  );

  describe("a bag ring (R8, R10, R14, R17)", () => {
    const band = item("band", { item_type: "ring" });
    const leftRing = item("left-ring", { item_type: "ring" });
    const rightRing = item("right-ring", { item_type: "ring" });
    const RING_1 = "WORN · RING 1";
    const RING_2 = "WORN · RING 2";
    /** The ring captions and worn rings drawn now, in the order their tips stand in the row. */
    const ringTexts = (shown: () => string[]) =>
      shown().filter((t) =>
        [RING_1, RING_2, "left-ring", "right-ring", "WORN"].includes(t),
      );

    it.each([
      {
        name: "both rings worn: Ring 1's tip, then Ring 2's",
        gear: { ring_1: leftRing, ring_2: rightRing },
        want: [RING_1, "left-ring", RING_2, "right-ring"],
      },
      {
        name: "only ring_1 worn: its tip alone, its own caption",
        gear: { ring_1: leftRing },
        want: [RING_1, "left-ring"],
      },
      {
        name: "only ring_2 worn: its tip alone, its own caption",
        gear: { ring_2: rightRing },
        want: [RING_2, "right-ring"],
      },
      {
        name: "no ring worn: the hovered ring's tip alone",
        gear: {},
        want: [],
      },
    ])("should compare with what is worn: $name", ({ gear, want }) => {
      const { move, cell, shift, shown } = overlayOnStage(
        [band],
        worn({ weapon: axe, ...gear }),
      );
      move(...cell(0));
      shift(true);
      expect(shown()[shown().indexOf("band") - 1]).not.toMatch(/^WORN/);
      expect(shown().indexOf("band")).toBeLessThan(
        Math.min(...want.map((t) => shown().indexOf(t))),
      );
      expect(ringTexts(shown)).toEqual(want);
      expect(shown()).not.toContain("axe");
    });

    it("should keep the plain Worn caption for a weapon or armour", () => {
      const { move, cell, shift, shown } = overlayOnStage(
        [sword],
        worn({ weapon: axe, ring_1: leftRing, ring_2: rightRing }),
      );
      move(...cell(0));
      shift(true);
      expect(ringTexts(shown)).toEqual(["WORN"]);
    });

    it.each(["ring_1", "ring_2"] as const)(
      "should add nothing under Shift over the worn %s slot (R7)",
      (ringSlot) => {
        const { move, slot, shift, shown } = overlayOnStage(
          [band],
          worn({ ring_1: leftRing, ring_2: rightRing }),
        );
        shift(true);
        move(...slot(ringSlot));
        expect(shown().filter((t) => t.startsWith("WORN"))).toEqual([]);
      },
    );
  });

  it("should hint at Shift: compare between the gesture and the close part (R24)", () => {
    expect(GEAR_HINT).toBe(
      "Right-click or E: wear or take off  //  Shift: compare  //  I, B or Esc: close",
    );
    expect(STASH_HINT).toBe(
      "Right-click or E: move between bag and stash, or take off  //  Shift: compare  //  I, B or Esc: close",
    );
    expect(overlayOnStage().shown()).toContain(GEAR_HINT);
  });
});

describe("GearOverlay purse line (FS-7TGZ3 §A, §B)", () => {
  const TIP = "Available 1,300 · Held in bids 200";

  /** An overlay with the art's resolve recorded, so which icon the line asks for is seen. */
  function purseOnStage(bag: ItemState[] = []) {
    const s = recordingScene(1080, 720);
    const resolve = vi.spyOn(s.art, "resolve");
    const overlay = new GearOverlay(s.scene, s.art);
    const onEquip = vi.fn();
    const onUnequip = vi.fn();
    overlay.onEquip = onEquip;
    overlay.onUnequip = onUnequip;
    overlay.updateInventory(bag);
    const g = gearPanelLayout(overlayLayout(1080, 720).right, bag.length);
    const line = [g.purse.x + 30, g.purse.y + g.purse.h / 2] as const;
    return { ...s, overlay, resolve, onEquip, onUnequip, g, line };
  }

  it("should show the dash under the bag before any purse is known (R10, R12)", () => {
    const { overlay, shown } = purseOnStage();
    overlay.show();
    expect(shown()).toContain("—");
  });

  it("should draw the total beside the coins icon, under the bag grid (R1–3)", () => {
    const { overlay, shown, resolve, texts, sprites, g } = purseOnStage();
    overlay.setPurse({ amount: "1,500", tip: TIP });
    overlay.show();
    expect(shown()).toContain("1,500");
    expect(resolve.mock.calls.map((c) => c[0])).toContain("icon_coins");
    const amount = texts.find((t) => t.content === "1,500" && !t.destroyed)!;
    expect(amount.y).toBeGreaterThanOrEqual(g.purse.y);
    expect(amount.y).toBeLessThanOrEqual(g.purse.y + g.purse.h);
    expect(amount.size).toBe(12);
    const coin = sprites.find(
      (sp) => sp.y >= g.purse.y && sp.y <= g.purse.y + g.purse.h,
    );
    expect(coin).toBeDefined();
    expect(coin!.x).toBeLessThan(amount.x);
  });

  it("should draw a purse set while open at once, and keep it across closing", () => {
    const { overlay, shown } = purseOnStage();
    overlay.show();
    overlay.setPurse({ amount: "42", tip: "Available 42 · Held in bids 0" });
    expect(shown()).toContain("42");
    expect(shown()).not.toContain("—");
    overlay.hide();
    overlay.show();
    expect(shown()).toContain("42");
  });

  it("should show the split on hover and hide it as the pointer leaves (R5–6)", () => {
    const { overlay, shown, move, line } = purseOnStage();
    overlay.setPurse({ amount: "1,500", tip: TIP });
    overlay.show();
    move(...line);
    expect(shown()).toContain(TIP);
    move(540, 360);
    expect(shown()).not.toContain(TIP);
  });

  it("should show no tip over the dash (R7)", () => {
    const { overlay, shown, move, line, texts } = purseOnStage();
    overlay.show();
    const before = texts.length;
    move(...line);
    expect(texts.length).toBe(before);
    expect(shown()).toContain("—");
  });

  it("should take no right-click and no E over the line (R6)", () => {
    const { overlay, move, press, line, onEquip, onUnequip } = purseOnStage([
      sword,
    ]);
    overlay.setPurse({ amount: "1,500", tip: TIP });
    overlay.show();
    move(...line);
    press(...line, 2);
    overlay.handleEquipKey();
    expect(onEquip).not.toHaveBeenCalled();
    expect(onUnequip).not.toHaveBeenCalled();
  });

  it("should show the line in stash mode too (R4)", () => {
    const { overlay, shown } = purseOnStage();
    overlay.setPurse({ amount: "7", tip: "Available 7 · Held in bids 0" });
    overlay.openStash();
    expect(shown()).toEqual(expect.arrayContaining(["STASH", "7"]));
  });
});
