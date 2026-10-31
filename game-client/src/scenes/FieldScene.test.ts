import { afterEach, describe, expect, it, vi } from "vitest";

// Only the field's entrance trigger and its replies are under test: a Phaser stand-in with the
// scene base class and the events the scene hangs its release on.
// The chat input's text field is a real <input> in the browser; this suite runs without a DOM,
// so the field is a silent stand-in. The input's rules are tested in ui/chatInput.test.ts.
vi.mock("@/ui/chatEntryField", () => ({
  domChatEntry: () => ({ value: "", focus: () => undefined, blur: () => undefined, moveTo: () => undefined, destroy: () => undefined }),
}));

vi.mock("phaser", async () => {
  const { EventEmitter } = await import("eventemitter3");
  class Scene {
    events = new EventEmitter();
    constructor(_config: unknown) {}
  }
  const phaser = {
    Scene,
    Scenes: { Events: { SHUTDOWN: "shutdown", DESTROY: "destroy" } },
    Scale: { Events: { RESIZE: "resize" } },
    BlendModes: { NORMAL: 0, ADD: 1, MULTIPLY: 2 },
    Input: { Keyboard: { KeyCodes: {} } },
    Math: { Linear: (a: number, b: number, t: number) => a + (b - a) * t, Between: () => 0, FloatBetween: () => 0 },
  };
  return { ...phaser, default: phaser };
});

const { FieldScene } = await import("./FieldScene");
const { socketManager } = await import("@/utils/class/SocketManager");
const { ActionType } = await import("@/assets/types/client");
const { EquipmentHud } = await import("@/ui/EquipmentHud");
const { ResourceHud } = await import("@/ui/ResourceHud");
const { AbilityHud } = await import("@/ui/AbilityHud");
const { projectedBounds } = await import("@/render/iso/projection");
const { FOREST_SIZE } = await import("@/render/world/forest.fixture");

/** The road home as the Meadows' state carries it. */
const ROAD_HOME = { entity_id: "road-home", destination: "hub", position: { x: 40, y: 500 }, range: 80 };
/** Where a player arrives: just inside the road, beyond its reach. */
const ARRIVAL = { x: 180, y: 500 };

interface FieldUnderTest {
  add: unknown;
  cameras: { main: { width: number; startFollow: ReturnType<typeof vi.fn> } };
  time: { delayedCall: ReturnType<typeof vi.fn> };
  scene: { start: ReturnType<typeof vi.fn> };
  listen(): void;
  release(): void;
  renderState(state: unknown): void;
  followEntrance(pos: { x: number; y: number }, gates: unknown[]): void;
  placePlayer(...args: unknown[]): void;
  drawGround(...args: unknown[]): void;
  drawObstacles(...args: unknown[]): void;
  drawEntrance(...args: unknown[]): void;
  views: Map<string, unknown>;
}

/** The field with its listeners up, the texts it writes recorded, and the server's refusals at hand. */
function fieldOnStage() {
  const field = new FieldScene() as unknown as FieldUnderTest;
  const texts: string[] = [];
  const any: unknown = new Proxy(() => any, { get: () => any, apply: () => any });
  field.add = {
    text: (_x: number, _y: number, content: string) => {
      texts.push(content);
      return any;
    },
  };
  field.cameras = { main: { width: 800, startFollow: vi.fn() } };
  field.time = { delayedCall: vi.fn() };
  field.scene = { start: vi.fn() };
  Object.assign(field, {
    placePlayer: vi.fn(),
    drawGround: vi.fn(),
    drawObstacles: vi.fn(),
    drawEntrance: vi.fn(),
  });

  const errors = new Map<string, (info: unknown) => void>();
  vi.spyOn(socketManager, "onError").mockImplementation((action, cb) => {
    errors.set(action, cb as (info: unknown) => void);
  });
  vi.spyOn(socketManager, "offError").mockImplementation(() => {});
  const replies = new Map<string, (payload: unknown) => void>();
  vi.spyOn(socketManager, "on").mockImplementation((action, cb) => {
    replies.set(action, cb);
  });
  vi.spyOn(socketManager, "off").mockImplementation(() => {});
  const send = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
  field.listen();
  const reply = (action: string, payload: unknown) => replies.get(action)?.(payload);

  const standAt = (pos: { x: number; y: number }) => field.followEntrance(pos, [ROAD_HOME]);
  const refuse = (reason: string) =>
    errors.get(ActionType.LeaveField)?.({ action: ActionType.LeaveField, error: "x", message: "x", reason });
  return { field, texts, send, standAt, refuse, reply };
}

/**
 * A field ready for create(): every Phaser surface it draws on answers anything, numbers as 0, and
 * the socket subscriptions are stubbed.
 */
function fieldToCreate<T>() {
  const field = new FieldScene() as unknown as T & { create(data?: { field?: string }): void };
  const stub: unknown = new Proxy(function () {}, {
    get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : stub),
    apply: () => stub,
    construct: () => stub as object,
  });
  Object.assign(field, {
    add: stub,
    make: stub,
    textures: stub,
    cache: stub,
    scale: stub,
    tweens: stub,
    time: stub,
    sys: stub,
    input: stub,
    cameras: { main: stub },
    bindInput: vi.fn(),
    createPiles: vi.fn(),
  });
  vi.spyOn(socketManager, "onGameStateUpdate").mockReturnValue(() => {});
  vi.spyOn(socketManager, "onError").mockImplementation(() => {});
  vi.spyOn(socketManager, "on").mockImplementation(() => {});
  return { field, stub };
}

describe("FieldScene the road home (FS-X2F2H §Requirements 14, 57, 60)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should send leave_field once on walking into the entrance gate, and not on arriving beside it", () => {
    const { send, standAt } = fieldOnStage();

    standAt(ARRIVAL);
    expect(send).not.toHaveBeenCalled();

    standAt(ROAD_HOME.position);
    standAt({ x: 30, y: 510 });

    expect(send.mock.calls).toEqual([[ActionType.LeaveField, {}]]);
  });

  it("should send nothing more while the first is unanswered", () => {
    const { send, standAt } = fieldOnStage();

    standAt(ARRIVAL);
    standAt(ROAD_HOME.position);
    standAt(ARRIVAL);
    standAt(ROAD_HOME.position);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("should say why in its own words on a refusal, and let the next step in ask again", () => {
    const { texts, send, standAt, refuse } = fieldOnStage();
    standAt(ARRIVAL);
    standAt(ROAD_HOME.position);

    refuse("fallen");

    expect(texts).toContain("You have fallen. You will rise at the road home.");
    expect(texts).not.toContain("fallen");

    standAt(ARRIVAL);
    standAt(ROAD_HOME.position);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("should leave the scene switch to world_entered", () => {
    const { field, standAt } = fieldOnStage();

    standAt(ARRIVAL);
    standAt(ROAD_HOME.position);

    expect(field.scene.start).not.toHaveBeenCalled();
  });

  it("should forget an unanswered leave and the gate stood in on release", () => {
    const { field, send, standAt } = fieldOnStage();
    standAt(ARRIVAL);
    standAt(ROAD_HOME.position);

    field.release();
    field.listen();
    standAt(ROAD_HOME.position);

    expect(send).toHaveBeenCalledTimes(2);
  });

  it("should read the gate from the player's server-reported position in a field's state only", () => {
    const { field, send } = fieldOnStage();
    const state = (world_type: string, position: { x: number; y: number }) => ({
      world_type,
      current_player: { entity_id: "me", position },
      other_players: [],
      walls: [],
      gates: [ROAD_HOME],
    });

    field.renderState(state("hub", ROAD_HOME.position));
    expect(send).not.toHaveBeenCalled();

    field.renderState(state("field", ARRIVAL));
    field.renderState(state("field", ROAD_HOME.position));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("should lay the ground from a field's state, with the server's gates for the road home (§Requirements 54)", () => {
    const { field } = fieldOnStage();
    const state = (world_type: string) => ({
      world_type,
      current_player: { entity_id: "me", position: ARRIVAL },
      other_players: [],
      walls: [],
      gates: [ROAD_HOME],
    });

    field.renderState(state("hub"));
    expect(field.drawGround).not.toHaveBeenCalled();

    field.renderState(state("field"));
    // and the walls, for a forest's litter under its stands (FS-3QHQZ §Requirements 25)
    expect(field.drawGround).toHaveBeenCalledWith([ROAD_HOME], []);
  });
});

describe("FieldScene monsters and the fight (FS-X2F2H §Requirements 56)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const boarState = (world_type: string) => ({
    world_type,
    current_player: { entity_id: "me", position: ARRIVAL, current_health: 100 },
    other_players: [],
    walls: [],
    gates: [ROAD_HOME],
    monsters: [{ entity_id: "b1", archetype: "boar", position: { x: 600, y: 420 }, action: "idle" }],
    projectiles: [],
  });

  it("should hand a field's state to the shared fight, and no other world's", () => {
    const { field } = fieldOnStage();
    const fight = { sync: vi.fn(), update: vi.fn(), release: vi.fn() };
    Object.assign(field, { fight });

    field.renderState(boarState("run"));
    expect(fight.sync).not.toHaveBeenCalled();

    const state = boarState("field");
    field.renderState(state);
    expect(fight.sync).toHaveBeenCalledWith(state);
  });

  it("should draw no run-only surface: no result card, escape, floor, die-by-choice or leave-run", () => {
    const { field, texts, send } = fieldOnStage();
    Object.assign(field, { fight: { sync: vi.fn(), update: vi.fn(), release: vi.fn() } });

    field.renderState(boarState("field"));

    expect(texts.filter((t) => /escape|floor|victory|fallen|leave the barrow|yield/i.test(t))).toEqual([]);
    expect(send).not.toHaveBeenCalledWith(ActionType.LeaveRun, expect.anything());
    expect(send).not.toHaveBeenCalledWith(ActionType.ForfeitRun, expect.anything());
  });

  it("should let the fight go on release, so the next visit starts empty", () => {
    const { field } = fieldOnStage();
    const fight = { sync: vi.fn(), update: vi.fn(), release: vi.fn() };
    Object.assign(field, { fight });

    field.release();

    expect(fight.release).toHaveBeenCalledTimes(1);
    expect((field as unknown as { fight?: unknown }).fight).toBeUndefined();
  });
});

describe("FieldScene drop piles (FS-X2F2H §Requirements 33, 56, 59, 60)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const pileState = (world_type: string) => ({
    world_type,
    current_player: { id: "member-me", entity_id: "me", position: ARRIVAL, current_health: 100, level: 3 },
    other_players: [],
    walls: [],
    gates: [ROAD_HOME],
    containers: [
      {
        container_id: "c1",
        entity_id: "p1",
        kind: "drop_pile",
        position: ARRIVAL,
        is_open: true,
        items: [{ entity_id: "i1" }],
        reserved_for: "member-killer",
      },
    ],
  });

  const fakePiles = () => ({ sync: vi.fn(), follow: vi.fn(), refused: vi.fn(), release: vi.fn() });

  it("should hand a field's piles to the shared pile drawing with my member id, and no other world's", () => {
    const { field } = fieldOnStage();
    const piles = fakePiles();
    Object.assign(field, { piles });

    field.renderState(pileState("run"));
    expect(piles.sync).not.toHaveBeenCalled();

    const state = pileState("field");
    field.renderState(state);
    expect(piles.sync).toHaveBeenCalledWith(state.containers, "member-me");
    expect(piles.follow).toHaveBeenCalledWith(ARRIVAL);
  });

  it("should hand a refused pickup's reason to the piles, and ignore a pickup that went through", () => {
    const { field, reply } = fieldOnStage();
    const piles = fakePiles();
    Object.assign(field, { piles });

    reply(ActionType.Interact, { success: false, message: "x", reason: "loot_reserved" });
    reply(ActionType.Interact, { success: true });

    expect(piles.refused).toHaveBeenCalledTimes(1);
    expect(piles.refused).toHaveBeenCalledWith("loot_reserved");
  });

  it("should let the piles and the interact replies go on release", () => {
    const { field } = fieldOnStage();
    const piles = fakePiles();
    Object.assign(field, { piles });

    field.release();

    expect(piles.release).toHaveBeenCalledTimes(1);
    expect(socketManager.off).toHaveBeenCalledWith(ActionType.Interact);
  });
});

describe("FieldScene fallen (FS-X2F2H §Requirements 58)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const stateAt = (current_health: number, position = ARRIVAL) => ({
    world_type: "field",
    current_player: { entity_id: "me", position, current_health },
    other_players: [],
    walls: [],
    gates: [ROAD_HOME],
  });

  type Fallen = Omit<FieldUnderTest, "time"> & {
    time: { delayedCall: ReturnType<typeof vi.fn>; now: number };
    fallenLine?: unknown;
    cursors?: unknown;
    wasd?: unknown;
    update(time: number, delta: number): void;
  };

  /** The field with a clock the test sets, and keys the test holds down. */
  function fallenOnStage() {
    const stage = fieldOnStage();
    const field = stage.field as unknown as Fallen;
    field.time = { delayedCall: vi.fn(), now: 0 };
    Object.assign(field, { fight: { sync: vi.fn(), update: vi.fn(), release: vi.fn() } });
    const idle = { isDown: false };
    const right = { isDown: false };
    field.cursors = { left: idle, right, up: idle, down: idle };
    field.wasd = { left: idle, right: idle, up: idle, down: idle };
    const holdRight = (down: boolean) => (right.isDown = down);
    const frame = (now: number) => {
      field.time.now = now;
      field.update(now, 16);
    };
    return { ...stage, field, holdRight, frame };
  }

  it("should show the fallen state counting 3-2-1, with no result card or loss copy", () => {
    const { field, texts } = fallenOnStage();

    field.time.now = 1000;
    field.renderState(stateAt(0, { x: 900, y: 420 }));

    expect(texts).toContain("You have fallen. You rise at the road home in 3.");
    expect(field.fallenLine).toBeDefined();
    expect(texts.filter((t) => /lost|defeat|victory|escape|result/i.test(t))).toEqual([]);
  });

  it("should take the fallen state down once the player stands at the entrance again", () => {
    const { field } = fallenOnStage();
    field.time.now = 1000;
    field.renderState(stateAt(0, { x: 900, y: 420 }));

    field.time.now = 4000;
    field.renderState(stateAt(150));

    expect(field.fallenLine).toBeUndefined();
  });

  it("should send no move while fallen, and move again on rising with the key still held", () => {
    const { field, send, holdRight, frame } = fallenOnStage();
    field.renderState(stateAt(0, { x: 900, y: 420 }));

    holdRight(true);
    frame(500);
    expect(send).not.toHaveBeenCalledWith(ActionType.Move, expect.anything());

    field.time.now = 3000;
    field.renderState(stateAt(150));
    frame(3016);
    expect(send).toHaveBeenCalledWith(ActionType.Move, { vx: 1, vy: 0 });
  });

  it("should forget a fall on release, so the next visit starts standing", () => {
    const { field } = fallenOnStage();
    field.renderState(stateAt(0, { x: 900, y: 420 }));

    field.release();

    expect(field.fallenLine).toBeUndefined();
  });
});

describe("FieldScene equip HUD, the run's own (FS-X2F2H §Requirements 56, Edge States)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sword = { entity_id: "sword", name: "Sword" };
  const helm = { entity_id: "helm", name: "Helm" };
  const worn = {
    weapon: null,
    head: helm,
    chest: null,
    gloves: null,
    legs: null,
    ring_1: null,
    ring_2: null,
    consumable_1: null,
    consumable_2: null,
    consumable_3: null,
  };
  const carrying = {
    world_type: "field",
    current_player: { id: "member-me", entity_id: "me", position: ARRIVAL, level: 4, inventory: [sword], equipment: worn },
    other_players: [],
    walls: [],
    gates: [ROAD_HOME],
  };

  type Hud = FieldUnderTest & {
    input: unknown;
    equipment?: InstanceType<typeof EquipmentHud>;
    piles?: unknown;
    bindHudKeys(): void;
    takesPointer(x: number, y: number, primary: boolean): boolean;
    lootFromSatchel(item: unknown): void;
    bagHasRoom(): boolean;
    satchel?: unknown;
  };

  /** The field with the run's HUD on a recording panel, its keys bound to a fake keyboard. */
  function hudOnStage() {
    const stage = fieldOnStage();
    const field = stage.field as Hud;
    let visible = false;
    let hovered: "inventory" | "head" = "inventory";
    const panel = {
      onEquip: undefined as undefined | ((item: unknown, slot: string) => void),
      onUnequip: undefined as undefined | ((item: unknown, slot: string) => void),
      mayUnequip: undefined as undefined | (() => boolean),
      // the panels stand right of x 500; the clear band is left of it
      covers: (x: number) => x > 500,
      toggle: vi.fn(() => void (visible = !visible)),
      hide: vi.fn(() => void (visible = false)),
      isVisible: () => visible,
      // the pointer over the first inventory row, or over the worn helm
      handleEquipKey: vi.fn((): void =>
        hovered === "inventory" ? panel.onEquip?.(sword, "weapon") : panel.onUnequip?.(helm, "head"),
      ),
      updateInventory: vi.fn(),
      updateEquipment: vi.fn(),
      setCharacterLevel: vi.fn(),
      updateCharacter: vi.fn(),
    };
    const notices: string[] = [];
    field.equipment = new EquipmentHud(panel as never, {
      send: (action, payload) => socketManager.sendMessage(action, payload),
      notice: (text) => notices.push(text),
    });
    const piles = {
      sync: vi.fn(),
      follow: vi.fn(),
      refused: vi.fn(),
      release: vi.fn(),
      interact: vi.fn(),
      loot: vi.fn(() => true),
    };
    field.piles = piles;
    const keys = new Map<string, () => void>();
    field.input = { keyboard: { on: (event: string, cb: () => void) => keys.set(event, cb) }, on: vi.fn() };
    field.bindHudKeys();
    const press = (key: string) => keys.get(`keydown-${key}`)?.();
    const hover = (over: "inventory" | "head") => (hovered = over);
    return { ...stage, field, panel, piles, press, hover, notices };
  }

  it("should open the run's equipment panel on I with what the field's state says I carry and wear", () => {
    const { field, panel, press } = hudOnStage();
    field.renderState(carrying);

    press("I");

    expect(panel.toggle).toHaveBeenCalledTimes(1);
    expect(panel.updateInventory).toHaveBeenLastCalledWith([sword]);
    expect(panel.updateEquipment).toHaveBeenLastCalledWith(expect.objectContaining({ head: helm }));
    expect(panel.setCharacterLevel).toHaveBeenLastCalledWith(4);
  });

  it("should hand the field's own player to the stats panel on every state (FS-HRH2J R24, R30)", () => {
    const { field, panel } = hudOnStage();
    field.renderState(carrying);

    expect(panel.updateCharacter).toHaveBeenLastCalledWith(carrying.current_player);
  });

  it("should send the run's equip and unequip on E over the open panel, and reach for no pile", () => {
    const { field, send, piles, press, hover } = hudOnStage();
    field.renderState(carrying);
    press("I");

    press("E");
    hover("head");
    press("E");

    expect(send.mock.calls).toEqual([
      [ActionType.Equip, { item_entity_id: "sword" }],
      [ActionType.Unequip, { item_entity_id: "helm" }],
    ]);
    expect(piles.interact).not.toHaveBeenCalled();
  });

  it("should reach for a pile on E while the panel is closed", () => {
    const { field, piles, press } = hudOnStage();
    field.renderState(carrying);

    press("E");

    expect(piles.interact).toHaveBeenCalledWith(ARRIVAL);
  });

  it("should close the panel on Q, and take a click over its panels, not in the clear band, as no attack (FS-HRH2J R8)", () => {
    const { field, panel, press } = hudOnStage();
    expect(field.takesPointer(600, 10, true)).toBe(false);

    press("I");
    expect(field.takesPointer(600, 10, true)).toBe(true);
    expect(field.takesPointer(600, 10, false)).toBe(true);
    expect(field.takesPointer(300, 10, true)).toBe(false);

    press("Q");
    expect(panel.hide).toHaveBeenCalledTimes(1);
    expect(field.takesPointer(600, 10, true)).toBe(false);
  });

  it("should toggle the overlay on I and on B, and close it on ESC (FS-HRH2J R4)", () => {
    const { field, press } = hudOnStage();
    press("B");
    expect(field.equipment?.isOpen()).toBe(true);
    press("I");
    expect(field.equipment?.isOpen()).toBe(false);
    press("I");
    press("ESC");
    expect(field.equipment?.isOpen()).toBe(false);
  });

  it("should still loot through the open satchel when the press is not over the overlay", () => {
    const { field } = hudOnStage();
    field.satchel = { pointerDown: vi.fn(() => true) };
    field.equipment?.toggle();
    expect(field.takesPointer(300, 10, true)).toBe(true);
  });

  it("should refuse a pile take and an unequip into a full bag with the field's notice (FS-HRH2J R20–22)", () => {
    const { field, panel, send, notices } = hudOnStage();
    const full = Array.from({ length: 30 }, (_, i) => ({ entity_id: `i${i}`, name: `i${i}` }));
    field.renderState({ ...carrying, current_player: { ...carrying.current_player, inventory: full } });

    expect(field.bagHasRoom()).toBe(false);
    expect(panel.mayUnequip?.()).toBe(false);
    expect(notices).toEqual(["Your bag is full.", "Your bag is full."]);
    expect(send).not.toHaveBeenCalled();
  });

  it("should count a pending take, so two quick takes at 29 allow one (FS-HRH2J edge state: Pending pickups)", () => {
    const { field } = hudOnStage();
    const almost = Array.from({ length: 29 }, (_, i) => ({ entity_id: `i${i}`, name: `i${i}` }));
    field.renderState({ ...carrying, current_player: { ...carrying.current_player, inventory: almost } });

    expect(field.bagHasRoom()).toBe(true);
    field.lootFromSatchel({ entity_id: "coin" });
    expect(field.bagHasRoom()).toBe(false);
  });

  it("should hold an item taken from a pile in the inventory while its loot is pending, as the run does", () => {
    const { field, piles } = hudOnStage();
    field.renderState({ ...carrying, current_player: { ...carrying.current_player, inventory: [] } });

    field.lootFromSatchel({ entity_id: "coin" });

    expect(piles.loot).toHaveBeenCalledWith({ entity_id: "coin" });
    expect(field.equipment?.inventory.map((i) => i.entity_id)).toEqual(["coin"]);
  });

  it("should hold nothing when the pile is someone else's and the loot is not sent", () => {
    const { field, piles } = hudOnStage();
    piles.loot.mockReturnValue(false);

    field.lootFromSatchel({ entity_id: "coin" });

    expect(field.equipment?.inventory).toEqual([]);
  });

  it("should let the HUD go on release, so the next visit starts empty", () => {
    const { field } = hudOnStage();

    field.release();

    expect(field.equipment).toBeUndefined();
  });

  it("should compose the run's equip HUD and bind its keys when the field is created", () => {
    // the keys the keyboard is asked to answer; the rest of the input answers anything
    const keys = new Map<string, () => void>();
    const keyboard = { on: (event: string, cb: () => void) => keys.set(event, cb) };
    const { field, stub } = fieldToCreate<Hud>();
    field.input = new Proxy({}, { get: (_target, key) => (key === "keyboard" ? keyboard : stub) });

    field.create({ field: "gentle_meadows" });

    expect(field.equipment).toBeInstanceOf(EquipmentHud);
    expect([...keys.keys()]).toEqual(
      expect.arrayContaining(["keydown-I", "keydown-B", "keydown-E", "keydown-Q", "keydown-ESC", "keydown-F"]),
    );
  });
});

describe("FieldScene the Forest's bounds (FS-KSD6K §Requirements 17)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should frame the whole 3120 x 2000 Forest the server builds, so no player walks out of view", () => {
    const setBounds = vi.fn();
    const { field, stub } = fieldToCreate<{ cameras: unknown }>();
    field.cameras = { main: new Proxy({}, { get: (_target, key) => (key === "setBounds" ? setBounds : stub) }) };

    field.create({ field: "forlorn_forest" });

    // constants.ForestMapWidth/Height, and the golden layout the fixture copies
    expect(FOREST_SIZE).toEqual({ width: 3120, height: 2000 });
    const [x, y, width, height] = setBounds.mock.calls[0];
    const bare = projectedBounds(FOREST_SIZE.width, FOREST_SIZE.height);
    const margin = bare.x - x;
    expect({ x, y, width, height }).toEqual(projectedBounds(FOREST_SIZE.width, FOREST_SIZE.height, margin));
  });
});

describe("FieldScene class kits, the run's own (FS-X2F2H §Requirements 56; FS-8AY7S; FS-JTNPR)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  type Kitted = Omit<FieldUnderTest, "time" | "cameras"> & {
    time: { delayedCall: ReturnType<typeof vi.fn>; now: number };
    cameras: { main: { width: number; height: number; startFollow: ReturnType<typeof vi.fn> } };
    cursors?: unknown;
    wasd?: unknown;
    update(time: number, delta: number): void;
  };

  const archerState = {
    world_type: "field",
    current_player: {
      entity_id: "me",
      class: "archer",
      position: ARRIVAL,
      current_health: 80,
      max_health: 100,
      resource: { kind: "stamina", current: 50, max: 100, ability_cost: 25 },
    },
    other_players: [],
    walls: [],
    gates: [ROAD_HOME],
  };

  function kitOnStage(fight: Record<string, unknown> = {}) {
    const stage = fieldOnStage();
    const field = stage.field as unknown as Kitted;
    field.time = { delayedCall: vi.fn(), now: 0 };
    field.cameras = { main: { width: 800, height: 600, startFollow: vi.fn() } };
    // the same fight object, so a test can change what it says between frames
    Object.assign(field, { fight: Object.assign(fight, { sync: vi.fn(), update: vi.fn(), release: vi.fn() }) });
    const idle = { isDown: false };
    const right = { isDown: true };
    field.cursors = { left: idle, right, up: idle, down: idle };
    field.wasd = { left: idle, right: idle, up: idle, down: idle };
    return { ...stage, field };
  }

  it("should draw the run's Health and stamina bars and the archer's ability card in a field", () => {
    const bars = vi.spyOn(ResourceHud.prototype, "show").mockImplementation(() => {});
    const card = vi.spyOn(AbilityHud.prototype, "show").mockImplementation(() => {});
    const { field } = kitOnStage({ lockedOut: false });

    field.renderState(archerState);

    expect(bars.mock.calls.at(-1)?.[0].map((bar) => bar.label)).toEqual(["Health:", "Stamina:"]);
    expect(card.mock.calls.at(-1)?.[0]).toMatchObject({ name: "Shadow Shot", greyed: false });
  });

  it("should grey the card while the ability lockout runs", () => {
    vi.spyOn(ResourceHud.prototype, "show").mockImplementation(() => {});
    const card = vi.spyOn(AbilityHud.prototype, "show").mockImplementation(() => {});
    const { field } = kitOnStage({ lockedOut: true });

    field.renderState(archerState);

    expect(card.mock.calls.at(-1)?.[0]).toMatchObject({ greyed: true });
  });

  it("should keep walking with the gear overlay open (FS-HRH2J R7)", () => {
    const { field, send } = kitOnStage({ aiming: false });
    Object.assign(field, { equipment: { isOpen: () => true, covers: () => true } });

    field.update(16, 16);
    expect(send).toHaveBeenCalledWith(ActionType.Move, { vx: 1, vy: 0 });
  });

  it("should stand still while an archer draws a Shadow Shot, and walk on once it ends", () => {
    const fight = { aiming: true };
    const { field, send } = kitOnStage(fight);

    field.update(16, 16);
    expect(send).not.toHaveBeenCalledWith(ActionType.Move, { vx: 1, vy: 0 });

    fight.aiming = false;
    field.update(32, 16);
    expect(send).toHaveBeenCalledWith(ActionType.Move, { vx: 1, vy: 0 });
  });
});
