import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only the field's entrance trigger and its replies are under test: a Phaser stand-in with the
// scene base class and the events the scene hangs its release on.
// The chat input's text field is a real <input> in the browser; this suite runs without a DOM,
// so the field is a silent stand-in. The input's rules are tested in ui/chatInput.test.ts.
vi.mock("@/ui/chatInputField", () => ({
  domChatInputField: () => ({
    value: "",
    channel: "area",
    focus: () => undefined,
    blur: () => undefined,
    show: () => undefined,
    hide: () => undefined,
    moveTo: () => undefined,
    destroy: () => undefined,
  }),
}));

// The party panel's invite field is the same kind of real <input>: a silent stand-in too.
vi.mock("@/ui/partyInviteField", () => ({
  domPartyInviteField: () => ({
    value: "",
    setEnabled: () => undefined,
    blur: () => undefined,
    show: () => undefined,
    hide: () => undefined,
    moveTo: () => undefined,
    destroy: () => undefined,
  }),
}));

// The vignette paints into a real <canvas>: no DOM here either, and the atmosphere has its own
// suite (utils/atmosphere.test.ts).
vi.mock("@/utils/atmosphere", () => ({ createAtmosphere: () => undefined }));

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
    Math: {
      Linear: (a: number, b: number, t: number) => a + (b - a) * t,
      Between: () => 0,
      FloatBetween: () => 0,
    },
  };
  return { ...phaser, default: phaser };
});

const { FieldScene } = await import("./FieldScene");
const { socketManager } = await import("@/utils/class/SocketManager");
const { ActionType } = await import("@/assets/types/client");
const { EquipmentHud } = await import("@/ui/EquipmentHud");
const { ResourceHud } = await import("@/ui/ResourceHud");
const { AbilityHud } = await import("@/ui/AbilityHud");
const { palette } = await import("@/utils/canvasPalette");
const { FALLEN_LINE, fallenFrame } = await import("./fieldFallen");
const { viewport } = await import("@/render/viewport");
const { sceneSystems } = await import("./sceneEnd.standin");
const { projectedBounds } = await import("@/render/iso/projection");
const { MEADOWS_LOOK } = await import("@/render/world/fieldLook");
const { FOREST_SIZE } = await import("@/render/world/forest.fixture");

/** The road home as the Meadows' state carries it. */
const ROAD_HOME = {
  entity_id: "road-home",
  destination: "hub",
  position: { x: 40, y: 500 },
  range: 80,
};
/** Where a player arrives: just inside the road, beyond its reach. */
const ARRIVAL = { x: 180, y: 500 };

interface FieldUnderTest {
  add: unknown;
  cameras: { main: { width: number; startFollow: ReturnType<typeof vi.fn> } };
  time: { delayedCall: ReturnType<typeof vi.fn> };
  scene: { start: ReturnType<typeof vi.fn> };
  listen(): void;
  release(end: "shutdown" | "destroy"): void;
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
  const any: unknown = new Proxy(() => any, {
    get: () => any,
    apply: () => any,
  });
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
    // the cursor is handed back on release
    input: { setDefaultCursor: vi.fn() },
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
  const send = vi
    .spyOn(socketManager, "sendMessage")
    .mockImplementation(() => {});
  field.listen();
  const reply = (action: string, payload: unknown) =>
    replies.get(action)?.(payload);

  const standAt = (pos: { x: number; y: number }) =>
    field.followEntrance(pos, [ROAD_HOME]);
  const refuse = (reason: string) =>
    errors.get(ActionType.LeaveField)?.({
      action: ActionType.LeaveField,
      error: "x",
      message: "x",
      reason,
    });
  return { field, texts, send, standAt, refuse, reply };
}

/**
 * A field ready for create(): every Phaser surface it draws on answers anything, numbers as 0, and
 * the socket subscriptions are stubbed.
 */
function fieldToCreate<T>() {
  const field = new FieldScene() as unknown as T & {
    init(data?: { field?: string }): void;
    create(data?: { field?: string }): void;
  };
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

    field.release("shutdown");
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
    monsters: [
      {
        entity_id: "b1",
        archetype: "boar",
        position: { x: 600, y: 420 },
        action: "idle",
      },
    ],
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
    Object.assign(field, {
      fight: { sync: vi.fn(), update: vi.fn(), release: vi.fn() },
    });

    field.renderState(boarState("field"));

    expect(
      texts.filter((t) =>
        /escape|floor|victory|fallen|leave the barrow|yield/i.test(t),
      ),
    ).toEqual([]);
    expect(send).not.toHaveBeenCalledWith(
      ActionType.LeaveRun,
      expect.anything(),
    );
    expect(send).not.toHaveBeenCalledWith(
      ActionType.ForfeitRun,
      expect.anything(),
    );
  });

  it("should let the fight go on release, so the next visit starts empty", () => {
    const { field } = fieldOnStage();
    const fight = { sync: vi.fn(), update: vi.fn(), release: vi.fn() };
    Object.assign(field, { fight });

    field.release("shutdown");

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
    current_player: {
      id: "member-me",
      entity_id: "me",
      position: ARRIVAL,
      current_health: 100,
      level: 3,
    },
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

  const fakePiles = () => ({
    sync: vi.fn(),
    follow: vi.fn(),
    refused: vi.fn(),
    release: vi.fn(),
  });

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

    reply(ActionType.Interact, {
      success: false,
      message: "x",
      reason: "loot_reserved",
    });
    reply(ActionType.Interact, { success: true });

    expect(piles.refused).toHaveBeenCalledTimes(1);
    expect(piles.refused).toHaveBeenCalledWith("loot_reserved");
  });

  it("should let the piles and the interact replies go on release", () => {
    const { field } = fieldOnStage();
    const piles = fakePiles();
    Object.assign(field, { piles });

    field.release("shutdown");

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

  type Fallen = Omit<FieldUnderTest, "time" | "cameras"> & {
    time: { delayedCall: ReturnType<typeof vi.fn>; now: number };
    cameras: { main: { width: number; height: number } };
    fallenView?: unknown;
    cursors?: unknown;
    wasd?: unknown;
    update(time: number, delta: number): void;
  };

  /** A plain rectangle a stand-in graphics filled, in the colour it was filled with. */
  interface Fill {
    colour: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }

  /**
   * The field with a clock the test sets, keys the test holds down, and a canvas whose texts keep
   * what they say and whose graphics keep what they fill (FS-B3NDZ R12).
   */
  function fallenOnStage() {
    const stage = fieldOnStage();
    const field = stage.field as unknown as Fallen;
    field.time = { delayedCall: vi.fn(), now: 0 };
    field.cameras = { main: { width: 1080, height: 720 } };
    const shown: { content: string; fontSize?: string; destroyed: boolean }[] =
      [];
    const drawn: { fills: Fill[]; destroyed: boolean }[] = [];
    const any: unknown = new Proxy(() => any, {
      get: () => any,
      apply: () => any,
    });
    field.add = {
      text: (
        _x: number,
        _y: number,
        content: string,
        style?: { fontSize?: string },
      ) => {
        stage.texts.push(content);
        const t = { content, fontSize: style?.fontSize, destroyed: false };
        shown.push(t);
        const self: Record<string, unknown> = new Proxy(
          {
            setText: (c: string) => ((t.content = c), self),
            destroy: () => void (t.destroyed = true),
          },
          {
            get: (target, key) =>
              key in target
                ? (target as Record<string | symbol, unknown>)[key]
                : () => self,
          },
        );
        return self;
      },
      graphics: () => {
        const rec = { fills: [] as Fill[], destroyed: false };
        drawn.push(rec);
        let colour = 0;
        const self: Record<string, unknown> = new Proxy(
          {
            fillStyle: (c: number) => ((colour = c), self),
            fillRect: (x: number, y: number, width: number, height: number) => (
              rec.fills.push({ colour, x, y, width, height }), self
            ),
            clear: () => ((rec.fills = []), self),
            destroy: () => void (rec.destroyed = true),
          },
          {
            get: (target, key) =>
              key in target
                ? (target as Record<string | symbol, unknown>)[key]
                : () => self,
          },
        );
        return self;
      },
      existing: any,
    };
    const liveText = (content: string) =>
      shown.find((t) => !t.destroyed && t.content === content);
    const barFills = () =>
      drawn
        .filter((g) => !g.destroyed)
        .flatMap((g) => g.fills)
        .filter((f) => f.colour === palette.xpFill);
    Object.assign(field, {
      fight: { sync: vi.fn(), update: vi.fn(), release: vi.fn() },
    });
    const idle = { isDown: false };
    const right = { isDown: false };
    field.cursors = { left: idle, right, up: idle, down: idle };
    field.wasd = { left: idle, right: idle, up: idle, down: idle };
    const holdRight = (down: boolean) => (right.isDown = down);
    const frame = (now: number) => {
      field.time.now = now;
      field.update(now, 16);
    };
    return { ...stage, field, holdRight, frame, liveText, barFills };
  }

  it("should show the fallen state counting 3-2-1, with no result card or loss copy", () => {
    const { field, texts, liveText } = fallenOnStage();

    field.time.now = 1000;
    field.renderState(stateAt(0, { x: 900, y: 420 }));

    expect(texts).toContain(FALLEN_LINE);
    expect(liveText("3s")).toBeDefined();
    expect(field.fallenView).toBeDefined();
    expect(
      texts.filter((t) => /lost|defeat|victory|escape|result/i.test(t)),
    ).toEqual([]);
  });

  // FS-B3NDZ §Requirements 8, 9, 12. I-B3NDZ-2: the fallen wait as the shared countdown.
  it("should show the seconds at 18 px and a full bar along the panel's foot on the fall", () => {
    const { field, liveText, barFills } = fallenOnStage();

    field.time.now = 1000;
    field.renderState(stateAt(0, { x: 900, y: 420 }));

    expect(liveText("3s")?.fontSize).toBe("18px");
    const { bar } = fallenFrame(1080, 720);
    expect(barFills()).toEqual([{ colour: palette.xpFill, ...bar }]);
  });

  it("should count the number down and drain the bar from the right each frame", () => {
    const { field, frame, liveText, barFills } = fallenOnStage();
    field.time.now = 1000;
    field.renderState(stateAt(0, { x: 900, y: 420 }));
    const { bar } = fallenFrame(1080, 720);

    frame(2500);

    expect(liveText("2s")).toBeDefined();
    const [fill] = barFills();
    expect(fill.x).toBe(bar.x);
    expect(fill.width).toBeCloseTo(bar.width / 2);
  });

  it.each([1, 2])(
    "should stand the fallen panel and its bar at the centre of a wider view, at render scale %s (FS-ZAJMH R12, R13)",
    (renderScale) => {
      const { field, liveText, barFills } = fallenOnStage();
      Object.assign(field, { satchel: undefined, invitePrompt: undefined, abilityHud: undefined });
      viewport.set({ width: 1080, height: 720, renderScale });
      field.time.now = 1000;
      field.renderState(stateAt(0, { x: 900, y: 420 }));

      viewport.set({ width: 1280, height: 720, renderScale });
      (field as unknown as { relayoutHud(): void }).relayoutHud();
      expect(barFills()).toEqual([{ colour: palette.xpFill, ...fallenFrame(1280, 720).bar }]);
      expect(liveText("3s")).toBeDefined();
      expect(liveText(FALLEN_LINE)).toBeDefined();
      viewport.set({ width: 1080, height: 720, renderScale: 1 });
    },
  );

  it("should take the panel, the number and the bar down on rising", () => {
    const { field, liveText, barFills } = fallenOnStage();
    field.time.now = 1000;
    field.renderState(stateAt(0, { x: 900, y: 420 }));

    field.time.now = 4000;
    field.renderState(stateAt(150));

    expect(liveText(FALLEN_LINE)).toBeUndefined();
    expect(liveText("3s")).toBeUndefined();
    expect(barFills()).toEqual([]);
  });

  it("should take the fallen state down once the player stands at the entrance again", () => {
    const { field } = fallenOnStage();
    field.time.now = 1000;
    field.renderState(stateAt(0, { x: 900, y: 420 }));

    field.time.now = 4000;
    field.renderState(stateAt(150));

    expect(field.fallenView).toBeUndefined();
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

    field.release("shutdown");

    expect(field.fallenView).toBeUndefined();
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
    current_player: {
      id: "member-me",
      entity_id: "me",
      position: ARRIVAL,
      level: 4,
      inventory: [sword],
      equipment: worn,
    },
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
      onUnequip: undefined as
        | undefined
        | ((item: unknown, slot: string) => void),
      mayUnequip: undefined as undefined | (() => boolean),
      // the panels stand right of x 500; the clear band is left of it
      covers: (x: number) => x > 500,
      toggle: vi.fn(() => void (visible = !visible)),
      hide: vi.fn(() => void (visible = false)),
      isVisible: () => visible,
      // the pointer over the first inventory row, or over the worn helm
      handleEquipKey: vi.fn((): void =>
        hovered === "inventory"
          ? panel.onEquip?.(sword, "weapon")
          : panel.onUnequip?.(helm, "head"),
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
    field.input = {
      keyboard: { on: (event: string, cb: () => void) => keys.set(event, cb) },
      on: vi.fn(),
      setDefaultCursor: vi.fn(),
    };
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
    expect(panel.updateEquipment).toHaveBeenLastCalledWith(
      expect.objectContaining({ head: helm }),
    );
    expect(panel.setCharacterLevel).toHaveBeenLastCalledWith(4);
  });

  it("should hand the field's own player to the stats panel on every state (FS-HRH2J R24, R30)", () => {
    const { field, panel } = hudOnStage();
    field.renderState(carrying);

    expect(panel.updateCharacter).toHaveBeenLastCalledWith(
      carrying.current_player,
    );
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
    const full = Array.from({ length: 30 }, (_, i) => ({
      entity_id: `i${i}`,
      name: `i${i}`,
    }));
    field.renderState({
      ...carrying,
      current_player: { ...carrying.current_player, inventory: full },
    });

    expect(field.bagHasRoom()).toBe(false);
    expect(panel.mayUnequip?.()).toBe(false);
    expect(notices).toEqual(["Your bag is full.", "Your bag is full."]);
    expect(send).not.toHaveBeenCalled();
  });

  it("should count a pending take, so two quick takes at 29 allow one (FS-HRH2J edge state: Pending pickups)", () => {
    const { field } = hudOnStage();
    const almost = Array.from({ length: 29 }, (_, i) => ({
      entity_id: `i${i}`,
      name: `i${i}`,
    }));
    field.renderState({
      ...carrying,
      current_player: { ...carrying.current_player, inventory: almost },
    });

    expect(field.bagHasRoom()).toBe(true);
    field.lootFromSatchel({ entity_id: "coin" });
    expect(field.bagHasRoom()).toBe(false);
  });

  it("should hold an item taken from a pile in the inventory while its loot is pending, as the run does", () => {
    const { field, piles } = hudOnStage();
    field.renderState({
      ...carrying,
      current_player: { ...carrying.current_player, inventory: [] },
    });

    field.lootFromSatchel({ entity_id: "coin" });

    expect(piles.loot).toHaveBeenCalledWith({ entity_id: "coin" });
    expect(field.equipment?.inventory.map((i) => i.entity_id)).toEqual([
      "coin",
    ]);
  });

  it("should hold nothing when the pile is someone else's and the loot is not sent", () => {
    const { field, piles } = hudOnStage();
    piles.loot.mockReturnValue(false);

    field.lootFromSatchel({ entity_id: "coin" });

    expect(field.equipment?.inventory).toEqual([]);
  });

  it("should let the HUD go on release, so the next visit starts empty", () => {
    const { field } = hudOnStage();

    field.release("shutdown");

    expect(field.equipment).toBeUndefined();
  });

  it("should release the HUD on release, so a purse read in flight draws nothing (FS-7TGZ3)", () => {
    const { field } = hudOnStage();
    const release = vi.spyOn(field.equipment!, "release");

    field.release("shutdown");

    expect(release).toHaveBeenCalledTimes(1);
  });

  it("should compose the run's equip HUD and bind its keys when the field is created", () => {
    // the keys the keyboard is asked to answer; the rest of the input answers anything
    const keys = new Map<string, () => void>();
    const keyboard = {
      on: (event: string, cb: () => void) => keys.set(event, cb),
    };
    const { field, stub } = fieldToCreate<Hud>();
    field.input = new Proxy(
      {},
      { get: (_target, key) => (key === "keyboard" ? keyboard : stub) },
    );

    field.init({ field: "gentle_meadows" });
    field.create({ field: "gentle_meadows" });

    expect(field.equipment).toBeInstanceOf(EquipmentHud);
    expect([...keys.keys()]).toEqual(
      expect.arrayContaining([
        "keydown-I",
        "keydown-B",
        "keydown-E",
        "keydown-Q",
        "keydown-ESC",
        "keydown-F",
      ]),
    );
  });
});

// Leaving /game mid-field destroys the game: Phaser emits the scene's DESTROY only, after every
// plugin has destroyed itself (sceneEnd.standin.ts). The field must still let go of what outlives
// the game and ask the dead plugins nothing; on a stop it hands the cursor back (asked 2026-11-06).
describe("FieldScene ending (game destroy on leaving /game)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A field made by its create(), its scene events and input those of Phaser's stand-in. */
  function createdField() {
    const { field } = fieldToCreate<{ input: unknown; events: unknown }>();
    // the plugins boot before the scene's create runs, so they hear DESTROY first
    const systems = sceneSystems();
    field.events = systems.scene.events;
    field.init({ field: "gentle_meadows" });
    field.create({ field: "gentle_meadows" });
    field.input = systems.scene.input;
    const off = vi.spyOn(socketManager, "off");
    const offError = vi.spyOn(socketManager, "offError");
    return { field, systems, off, offError };
  }

  it("should let the visit go on a game destroy without asking the destroyed plugins anything", () => {
    const { systems, off, offError } = createdField();

    expect(() => systems.destroy()).not.toThrow();
    expect(systems.touched).toEqual([]);
    expect(off).toHaveBeenCalledWith(ActionType.Interact);
    expect(offError).toHaveBeenCalledWith(ActionType.LeaveField);
  });

  it("should hand the cursor back to the page on a stop", () => {
    const { systems } = createdField();
    systems.input.manager!.defaultCursor = "url(hand) 0 0, default";

    systems.shutdown();

    expect(systems.input.manager?.defaultCursor).toBe("");
  });

  // Phaser's stop destroys the field's keys and keeps their captures, the game's (sceneEnd.ts).
  it("should hand back the captures its keys made on a stop", () => {
    const { field, systems } = createdField();
    // the rig stubs bindInput; the real one binds on the stand-in's keyboard
    (FieldScene.prototype as unknown as { bindInput(): void }).bindInput.call(field);
    expect(systems.input.manager?.captures.length).toBeGreaterThan(0);

    systems.shutdown();

    expect(systems.input.manager?.captures).toEqual([]);
  });
});

describe("FieldScene the Forest's bounds (FS-KSD6K §Requirements 17)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should frame the whole 3120 x 2000 Forest the server builds, so no player walks out of view", () => {
    const setBounds = vi.fn();
    const { field, stub } = fieldToCreate<{ cameras: unknown }>();
    field.cameras = {
      main: new Proxy(
        {},
        { get: (_target, key) => (key === "setBounds" ? setBounds : stub) },
      ),
    };

    field.init({ field: "forlorn_forest" });
    field.create({ field: "forlorn_forest" });

    // constants.ForestMapWidth/Height, and the golden layout the fixture copies
    expect(FOREST_SIZE).toEqual({ width: 3120, height: 2000 });
    const [x, y, width, height] = setBounds.mock.calls[0];
    const bare = projectedBounds(FOREST_SIZE.width, FOREST_SIZE.height);
    const margin = bare.x - x;
    expect({ x, y, width, height }).toEqual(
      projectedBounds(FOREST_SIZE.width, FOREST_SIZE.height, margin),
    );
  });
});

describe("FieldScene the dev test room (FS-BDRTJ §Requirements 6)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should frame the 900 x 600 room the server builds, in the Meadows' look", () => {
    const setBounds = vi.fn();
    const { field, stub } = fieldToCreate<{ cameras: unknown; look: unknown }>();
    field.cameras = {
      main: new Proxy(
        {},
        { get: (_target, key) => (key === "setBounds" ? setBounds : stub) },
      ),
    };

    field.init({ field: "dev_test_room" });
    field.create({ field: "dev_test_room" });

    const [x, y, width, height] = setBounds.mock.calls[0];
    const margin = projectedBounds(900, 600).x - x;
    expect({ x, y, width, height }).toEqual(projectedBounds(900, 600, margin));
    expect(field.look).toBe(MEADOWS_LOOK);
  });
});

describe("FieldScene class kits, the run's own (FS-X2F2H §Requirements 56; FS-8AY7S; FS-JTNPR)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  type Kitted = Omit<FieldUnderTest, "time" | "cameras"> & {
    time: { delayedCall: ReturnType<typeof vi.fn>; now: number };
    cameras: {
      main: {
        width: number;
        height: number;
        startFollow: ReturnType<typeof vi.fn>;
      };
    };
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
    Object.assign(field, {
      fight: Object.assign(fight, {
        sync: vi.fn(),
        update: vi.fn(),
        release: vi.fn(),
      }),
    });
    const idle = { isDown: false };
    const right = { isDown: true };
    field.cursors = { left: idle, right, up: idle, down: idle };
    field.wasd = { left: idle, right: idle, up: idle, down: idle };
    return { ...stage, field };
  }

  it("should draw the run's Health and stamina bars and the archer's ability card in a field", () => {
    const bars = vi
      .spyOn(ResourceHud.prototype, "show")
      .mockImplementation(() => {});
    const card = vi
      .spyOn(AbilityHud.prototype, "show")
      .mockImplementation(() => {});
    const { field } = kitOnStage({ lockedOut: false });

    field.renderState(archerState);

    expect(bars.mock.calls.at(-1)?.[0].map((bar) => bar.label)).toEqual([
      "Health:",
      "Stamina:",
    ]);
    expect(card.mock.calls.at(-1)?.[0]).toMatchObject({
      name: "Shadow Shot",
      greyed: false,
    });
  });

  it("should grey the card while the ability lockout runs", () => {
    vi.spyOn(ResourceHud.prototype, "show").mockImplementation(() => {});
    const card = vi
      .spyOn(AbilityHud.prototype, "show")
      .mockImplementation(() => {});
    const { field } = kitOnStage({ lockedOut: true });

    field.renderState(archerState);

    expect(card.mock.calls.at(-1)?.[0]).toMatchObject({ greyed: true });
  });

  it("should keep walking with the gear overlay open (FS-HRH2J R7)", () => {
    const { field, send } = kitOnStage({ aiming: false });
    Object.assign(field, {
      equipment: { isOpen: () => true, covers: () => true },
    });

    field.update(16, 16);
    expect(send).toHaveBeenCalledWith(ActionType.Move, { vx: 1, vy: 0 });
  });

  // FS-JS7C8 §D R22, §E R47: every figure faces its drawn movement; nothing turns one from
  // outside its own motion, a `facing` on a state entry is never read, and no `face` is sent
  describe("facing from movement, nothing on the wire (FS-JS7C8 §D R22, §E R47)", () => {
    /** A view whose baked animator is stepped and shown, as on main: nothing else turns it. */
    const view = (x: number) => ({
      sprite: { setPosition: vi.fn(), setDepth: vi.fn(), getByName: () => ({ displayHeight: 60, getBounds: () => ({ x: 0, y: 0, width: 40, height: 60 }) }) },
      name: { setPosition: vi.fn() },
      pos: { x, y: 0 },
      target: { x, y: 0 },
      facing: "se",
      anim: { baked: true, facing: "se", step: vi.fn(), show: vi.fn() },
      fallen: false,
    });

    it("should step the own body and every other from where it is drawn, and send no face", () => {
      const { field, send } = kitOnStage({ aiming: false });
      const me = view(100);
      const them = view(300);
      Object.assign(field, {
        views: new Map([
          ["me", me],
          ["them", them],
        ]),
        selfEntityID: "me",
      });

      field.update(16, 16);
      field.update(300, 16);

      expect(me.anim.step).toHaveBeenCalledWith(me.pos, 300, 16, false);
      expect(them.anim.step).toHaveBeenCalledWith(them.pos, 300, 16, false);
      expect(send.mock.calls.filter(([action]) => (action as string) === "face")).toEqual([]);
    });

    it("should keep no facing from a state entry, the own echo or another's", () => {
      const { field } = kitOnStage({});
      const me = view(100);
      const them = view(300);
      Object.assign(field, {
        views: new Map([
          ["me", me],
          ["them", them],
        ]),
      });
      const place = (FieldScene.prototype as unknown as { placePlayer: (...a: unknown[]) => void }).placePlayer;
      const entry = (entity_id: string) => ({
        entity_id,
        position: { x: 1, y: 2 },
        direction: { vx: 0, vy: 0, speed: 0 },
        current_health: 100,
        facing: "ne",
      });

      place.call(field, entry("me"), true);
      place.call(field, entry("them"), false);

      expect(Object.keys(me)).not.toContain("wireFacing");
      expect(Object.keys(them)).not.toContain("wireFacing");
    });
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

  // Reported 2026-11-12 (the town's twin, HubScene "the first frame of a visit"): the server routes
  // a move by the player's record, which the world left moves here before the client hears of it,
  // so that world's last move may walk the field body. The field sent only on a change from what
  // it last sent, "still" at a start, so with no key held it never stopped it.
  describe("the first frame of a visit", () => {
    function visit(held: boolean) {
      const stage = kitOnStage({ aiming: false });
      const field = stage.field as unknown as Kitted & {
        init(data?: { field?: string; arrival?: boolean }): void;
        release(end: "shutdown" | "destroy"): void;
        cursors: { right: { isDown: boolean } };
      };
      field.cursors.right.isDown = held;
      const moves = () => stage.send.mock.calls.filter(([action]) => action === ActionType.Move);
      /** What the field body walks: the last move on the wire, whichever world sent it. */
      const body = () => moves().at(-1)?.[1];
      /** The world left's last stride, landing on the field body after the switch. */
      const strideBefore = () => socketManager.sendMessage(ActionType.Move, { vx: 0, vy: -1 });
      return { ...stage, field, moves, body, strideBefore };
    }

    it("should stop the body on its first frame with no key held, after a stride the world left sent", () => {
      const { field, body, strideBefore } = visit(false);
      strideBefore();

      field.init({ field: "gentle_meadows", arrival: false });
      field.update(16, 16);

      expect(body()).toEqual({ vx: 0, vy: 0 });
    });

    it("should stop it on a return too, though the visit before ended standing still", () => {
      const { field, body, strideBefore } = visit(false);
      field.update(16, 16);
      field.release("shutdown");
      strideBefore();

      field.init({ field: "gentle_meadows", arrival: false });
      field.update(32, 16);

      expect(body()).toEqual({ vx: 0, vy: 0 });
    });

    it("should send that stop once, and nothing more while no key is held", () => {
      const { field, moves, strideBefore } = visit(false);
      strideBefore();

      field.init({ field: "gentle_meadows", arrival: false });
      field.update(16, 16);
      field.update(32, 16);

      expect(moves().slice(1)).toEqual([[ActionType.Move, { vx: 0, vy: 0 }]]);
    });

    it("should send a key held into the visit as its first move, once", () => {
      const { field, moves, strideBefore } = visit(true);
      strideBefore();

      field.init({ field: "gentle_meadows", arrival: false });
      field.update(16, 16);
      field.update(32, 16);

      expect(moves().slice(1)).toEqual([[ActionType.Move, { vx: 1, vy: 0 }]]);
    });
  });
});

const { artLoaderStandin, shippedManifest, RESIDENT_ART_PAGES } = await import("@/render/art/artLoader.standin");
const { atlasTextureKey } = await import("@/render/art/library");

// Each field loads its own wildlife or dead from its preload, its id read in init, before preload
// runs: Phaser hands the start data to init and create only (FS-C4JWH §B R7–R8, §A R5).
describe("FieldScene art loading (FS-C4JWH §B R7–R8)", () => {

  it.each([
    ["gentle_meadows", ["wildlife-0", "wildlife-1"]],
    ["forlorn_forest", ["fodder-0", "fodder-1"]],
    ["a field the client does not know", ["wildlife-0", "wildlife-1"]],
  ])("should queue %s's own group and nothing else, the resident art being loaded", (id, own) => {
    const art = artLoaderStandin({
      manifest: shippedManifest(),
      cachedManifest: true,
      textures: RESIDENT_ART_PAGES.map(atlasTextureKey),
    });
    const field = Object.assign(new FieldScene(), art.scene) as unknown as {
      init(data?: { field?: string }): void;
      preload(): void;
    };

    field.init({ field: id });
    field.preload();

    expect(art.queued.sort()).toEqual(own.map(atlasTextureKey));
  });

  it("should show the torch bar over its creatures still downloading at 300 ms, and none once they are in; the field fades in each time (FS-C4JWH §D R17, A1)", () => {
    vi.useFakeTimers();
    const art = artLoaderStandin({
      manifest: shippedManifest(),
      cachedManifest: true,
      textures: RESIDENT_ART_PAGES.map(atlasTextureKey),
    });
    const field = Object.assign(new FieldScene(), art.scene) as unknown as {
      init(data?: { field?: string }): void;
      preload(): void;
    };

    art.boot({ init: (d) => field.init(d as { field?: string }), preload: () => field.preload() }, { field: "forlorn_forest" }, { hold: true });
    vi.advanceTimersByTime(300);
    art.finish();
    vi.runAllTimers();
    const first = art.drawn.length;
    expect(first).toBeGreaterThan(0);
    expect(art.drawn.every((d) => d.destroyed)).toBe(true);
    art.camera.fades.length = 0;

    art.boot({ init: (d) => field.init(d as { field?: string }), preload: () => field.preload() }, { field: "forlorn_forest" });
    vi.runAllTimers();
    vi.useRealTimers();

    expect(art.drawn.length).toBe(first);
    expect(art.camera.fades).toEqual(["fadeIn(200, 18, 18, 18)", "reset"]);
  });
});

// FS-PQ2TW R8; ADR-0075 Decision 4. I-PQ2TW-2: the switch's verdict reaches the field with its start.
describe("FieldScene arrival from its start (FS-PQ2TW R5–R8)", () => {
  it.each([true, false])("should keep the arrival %s its start was handed, beside its field", (arrival) => {
    const field = new FieldScene() as unknown as {
      init(data?: { field?: string; arrival?: boolean }): void;
      arrival: boolean;
      field: string;
    };

    field.init({ field: "forlorn_forest", arrival });

    expect(field.arrival).toBe(arrival);
    expect(field.field).toBe("forlorn_forest");
  });

  it("should read a start with no verdict as no arrival, and not keep the last start's", () => {
    const field = new FieldScene() as unknown as { init(data?: { arrival?: boolean }): void; arrival: boolean };

    field.init({ arrival: true });
    field.init();

    expect(field.arrival).toBe(false);
  });
});

const { ArrivalCard, ARRIVAL_CARD } = await import("@/ui/arrivalCard");

// FS-PQ2TW §A R2, R5; §B R11, R12, R15; §C R19. I-PQ2TW-4: coming into a field plays that field's
// card through the shared piece; a return plays nothing.
describe("FieldScene arrival card (FS-PQ2TW; I-PQ2TW-4)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  type ArrivingField = {
    add: unknown;
    tweens: unknown;
    renderState(state: unknown): void;
    relayoutHud(): void;
  };

  /** What the field made, in order: its kind, its arguments and its depth. */
  interface Made {
    kind: string;
    args: unknown[];
    depth?: number;
    self: unknown;
  }

  /** A field created by a world switch into `field` that told it an arrival, or a return. */
  function createdAs(arrival: boolean, fieldId = "gentle_meadows") {
    const { field, stub } = fieldToCreate<ArrivingField>();
    const made: Made[] = [];
    field.add = new Proxy(
      {},
      {
        get: (_target, kind) =>
          (...args: unknown[]) => {
            const record: Made = { kind: String(kind), args, self: undefined };
            const self: unknown = new Proxy(function () {}, {
              get: (_t, key) => {
                if (key === Symbol.toPrimitive) return () => 0;
                if (key === "then") return undefined;
                if (key === "setDepth")
                  return (depth: number) => {
                    record.depth = depth;
                    return self;
                  };
                return self;
              },
              apply: () => self,
            });
            record.self = self;
            made.push(record);
            return self;
          },
      },
    );
    const tweens = { add: vi.fn((_tween: { targets?: unknown; alpha?: number }) => stub) };
    field.tweens = tweens;
    Object.assign(field, { placePlayer: vi.fn(), drawGround: vi.fn(), drawObstacles: vi.fn(), drawEntrance: vi.fn() });

    (field.init as (data?: { field?: string; arrival?: boolean }) => void)({ field: fieldId, arrival });
    field.create({ field: fieldId });
    // the field's minimap paints a canvas texture the stub cannot hold; it has its own suite (FS-P0HSP)
    Object.assign(field, { minimapStage: undefined });

    const veil = made.find((m) => m.kind === "rectangle" && m.depth === ARRIVAL_CARD.depth);
    const words = () => made.filter((m) => m.kind === "text").map((m) => String(m.args[2]));
    const lifts = () =>
      tweens.add.mock.calls.filter(([t]) => veil !== undefined && t.targets === veil.self && t.alpha === 0).length;
    const render = (worldType = "field") => field.renderState({ world_type: worldType, other_players: [] });
    return { field, made, veil, words, lifts, render };
  }

  it.each([
    ["gentle_meadows", "Gentle Meadows", "The grass is soft, and the Spire is far."],
    ["forlorn_forest", "The Forlorn Forest", "The dead have not left these trees."],
    ["dev_test_room", "Dev Test Room", "Nothing here is kept."],
  ])("should put the dark up first thing at create on an arrival into %s, with its card (R11, R19)", (id, title, line) => {
    const { made, words } = createdAs(true, id);

    expect(made[0].kind).toBe("rectangle");
    expect(made[0].args).toEqual([0, 0, viewport.width, viewport.height, palette.inkDeep, 1]);
    expect(made[0].depth).toBe(ARRIVAL_CARD.depth);
    expect(words().slice(0, 2)).toEqual([title, line]);
  });

  it("should put nothing up at create on a return (R5)", () => {
    const { veil, words } = createdAs(false, "forlorn_forest");

    expect(veil).toBeUndefined();
    expect(words()).not.toContain("The Forlorn Forest");
  });

  it("should hold the dark until the field's first state is drawn, then lift it once (R12)", () => {
    const { lifts, render } = createdAs(true);
    expect(lifts()).toBe(0);

    render("hub");
    expect(lifts()).toBe(0);

    render();
    render();
    expect(lifts()).toBe(1);
  });

  it("should re-cover the view with the dark when the view changes (R16)", () => {
    const relayout = vi.spyOn(ArrivalCard.prototype, "relayout");
    const { field } = createdAs(true);

    field.relayoutHud();

    expect(relayout).toHaveBeenCalled();
  });
});

const { MINIMAP: FIELD_MINIMAP, WorldMinimap } = await import("@/ui/minimap");
const { FULLSCREEN_BUTTON } = await import("@/render/viewport");
const { FullscreenButtonPlace } = await import("@/render/viewport/fullscreenButton");
const { FIELD_CHART } = await import("@/ui/fieldChart");
const { usePartyStore } = await import("@/stores/partyStore");
const { FOREST_GATE, FOREST_WALLS } = await import("@/render/world/forest.fixture");

// FS-P0HSP §B, §C.16, §D, §E, §F, §G (I-P0HSP-4): a field's minimap, charted as the player walks.
describe("FieldScene the field's minimap (FS-P0HSP; I-P0HSP-4)", () => {
  type Layer = { x: number; y: number; depth: number; destroyed: boolean; calls: string[] };
  function layer(into: Layer[]) {
    const l: Layer = { x: 0, y: 0, depth: 0, destroyed: false, calls: [] };
    into.push(l);
    const self: Record<string, unknown> = new Proxy(l as unknown as Record<string, unknown>, {
      get: (t, key) => {
        if (key in t) return t[key as string];
        if (key === "setPosition") return (x: number, y: number) => ((l.x = x), (l.y = y), self);
        if (key === "setDepth") return (d: number) => ((l.depth = d), self);
        if (key === "destroy") return () => void (l.destroyed = true);
        return () => (l.calls.push(String(key)), self);
      },
    });
    return self;
  }
  const WALLS = FOREST_WALLS.map((r, i) => ({ entity_id: `s${i}`, house_id: `s${i}`, position: { x: r.x, y: r.y }, width: r.width, height: r.height }));
  const GATE = { entity_id: "road", destination: "hub", position: FOREST_GATE, range: 80 };

  function forestWithMap() {
    const stage = fieldOnStage();
    const field = stage.field as unknown as FieldUnderTest & Record<string, unknown>;
    const layers: Layer[] = [];
    const clock = { now: 0 };
    Object.assign(field, {
      field: "forlorn_forest",
      size: FOREST_SIZE,
      time: { delayedCall: vi.fn(), get now() { return clock.now; } },
      minimapStage: { graphics: () => layer(layers), canvasImage: () => layer(layers) },
      showClassHud: vi.fn(),
    });
    const store = { held: null as string | null, writes: [] as string[] };
    field.minimapStore = () => ({ getItem: () => store.held, setItem: (_k: string, v: string) => void store.writes.push(v), removeItem: () => {} });
    const button = new FullscreenButtonPlace();
    field.fullscreenButton = button;
    const keys: Record<string, (event?: Partial<KeyboardEvent>) => void> = {};
    field.input = { setDefaultCursor: vi.fn(), keyboard: { on: (name: string, fn: () => void) => void (keys[name] = fn) } };
    (field as unknown as { bindMinimapKey(): void }).bindMinimapKey();
    const pressM = (event: Partial<KeyboardEvent> = {}) => keys["keydown-M"]?.(event);
    const render = (position: { x: number; y: number }, others: unknown[] = []) =>
      field.renderState({
        world_type: "field",
        current_player: { id: "self", entity_id: "me", position },
        other_players: others,
        walls: WALLS,
        gates: [GATE],
      });
    const map = () => (field.minimap as { map: InstanceType<typeof WorldMinimap> } | undefined)?.map;
    const chart = () => (field.charting as { chart: { charted(cx: number, cy: number): boolean; cols: number; rows: number } }).chart;
    /** A frame: the clock on, and the scene's update for the map alone. */
    const frame = (ms: number) => {
      clock.now += ms;
      (field as unknown as { drawFieldMap(): void }).drawFieldMap();
    };
    return { ...stage, field, layers, clock, store, pressM, render, map, chart, frame, button };
  }
  const chartedCount = (c: { charted(cx: number, cy: number): boolean; cols: number; rows: number }) => {
    let n = 0;
    for (let cy = 0; cy < c.rows; cy++) for (let cx = 0; cx < c.cols; cx++) if (c.charted(cx, cy)) n++;
    return n;
  };

  beforeEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));
  afterEach(() => {
    viewport.set({ width: 800, height: 600, renderScale: 1 });
    usePartyStore.setState({ party: null });
    vi.restoreAllMocks();
  });

  it("should build the map with the field's first state, at the column's top, the arrival charted at once (§G.35; Edge States)", () => {
    const { render, map, layers } = forestWithMap();
    expect(map()).toBeUndefined();
    render({ x: 2900, y: 1480 });
    expect(map()).toBeInstanceOf(WorldMinimap);
    expect(layers).toHaveLength(5);
    for (const l of layers) expect([l.x, l.y]).toEqual([1070 - FIELD_MINIMAP.width, 10]);
    expect(map()!.redraws).toBe(1);
  });

  // FS-56CKV §Change: Minimap at the top, fullscreen button beside it, C1–C5 (owner 2026-11-12:
  // "地圖移動到最上面 全螢幕按鈕移動到地圖左側 地圖變2倍蛇才移動到右上角", "其他文字也要跟著往上移動"):
  // nothing stands under a field's map (FS-P0HSP §G.36), so only the map and the button move
  it.each([1080, 1280])(
    "should stand the normal map at the very top, y 10, with the fullscreen button 6 px to its left, and move the button on M, at logical width %i (FS-56CKV §Change C1–C4)",
    (width) => {
      viewport.set({ width, height: 720, renderScale: 1 });
      const { render, layers, pressM, button } = forestWithMap();
      const corner = { top: FULLSCREEN_BUTTON.inset, right: FULLSCREEN_BUTTON.inset };
      // before the first state there is no map: the button keeps the corner
      expect(button.current).toEqual(corner);
      render({ x: 2900, y: 1480 });
      for (const l of layers) expect([l.x, l.y]).toEqual([width - 10 - FIELD_MINIMAP.width, 10]);
      expect(button.current).toEqual({ top: 10, right: 10 + FIELD_MINIMAP.width + FIELD_MINIMAP.gap });
      pressM();
      expect(button.current).toEqual(corner);
      expect([layers[0].x, layers[0].y]).toEqual([width - 10 - 324, 44]);
      pressM();
      expect(button.current).toEqual(corner);
      pressM();
      expect(button.current).toEqual({ top: 10, right: 232 });
    },
  );

  it("should chart round the player only, never round a party member (§D.24)", () => {
    usePartyStore.setState({
      party: {
        party_id: "p1",
        leader_id: "self",
        members: [
          { player_id: "self", name: "Aldric", class: "warrior", joined_at: "", where: "field" },
          { player_id: "wren", name: "Wren", class: "archer", joined_at: "", where: "field" },
        ],
        size: 4,
        reason: "joined",
        subject_id: "wren",
      } as never,
    });
    const { render, chart } = forestWithMap();
    render({ x: 600, y: 600 }, [{ id: "wren", entity_id: "e-wren", position: { x: 2500, y: 1500 } }]);
    const { cell } = FIELD_CHART;
    expect(chart().charted(Math.floor(600 / cell), Math.floor(600 / cell))).toBe(true);
    expect(chart().charted(Math.floor(2500 / cell), Math.floor(1500 / cell))).toBe(false);
  });

  it("should redraw at most 4 times a second walking uncharted Forest at full speed, and draw what was left once stopped (§D.28)", () => {
    const { render, map, frame, chart } = forestWithMap();
    let x = 200;
    render({ x, y: 1000 });
    // 3 s at 400 world px a second, a state every 33 ms, a frame every 16 ms
    for (let t = 0; t < 3000; t += 33) {
      x += (400 * 33) / 1000;
      frame(16);
      frame(17);
      render({ x, y: 1000 });
    }
    expect(map()!.redraws).toBeLessThanOrEqual(1 + 3 * 4);
    expect(map()!.redraws).toBeGreaterThan(4);
    const shown = map()!.redraws;
    frame(300);
    frame(300);
    // the last ground charted is drawn, then nothing more while nothing is new
    expect(map()!.redraws).toBeLessThanOrEqual(shown + 1);
    const settled = map()!.redraws;
    frame(1000);
    expect(map()!.redraws).toBe(settled);
    expect(chartedCount(chart())).toBeGreaterThan(0);
  });

  it("should add nothing to the world for charting: its five layers, in the HUD band, and nothing more (§A.2, §D.23)", () => {
    const { render, layers, frame } = forestWithMap();
    for (let i = 0; i < 40; i++) {
      render({ x: 200 + i * 40, y: 1000 });
      frame(300);
    }
    expect(layers).toHaveLength(5);
    for (const l of layers) expect(l.depth).toBe(FIELD_MINIMAP.depth);
  });

  it("should step M through the run's three modes on the stored key, and not on a repeat, while chat types, or before the map (§F.31–§F.33)", () => {
    const { field, render, map, pressM, store } = forestWithMap();
    pressM();
    expect(store.writes).toEqual([]);
    render({ x: 600, y: 600 });
    pressM({ repeat: true });
    field.chatWindow = { isTyping: () => true };
    pressM();
    expect(store.writes).toEqual([]);
    field.chatWindow = undefined;
    pressM();
    pressM();
    pressM();
    expect(store.writes).toEqual(["enlarged", "overlay", "normal"]);
    expect(map()!.mode).toBe("normal");
  });

  it("should build the map in the mode this browser kept (§F.32)", () => {
    const { render, map, store } = forestWithMap();
    store.held = "overlay";
    render({ x: 600, y: 600 });
    expect(map()!.mode).toBe("overlay");
    expect(map()!.panel).toBeNull();
  });

  it("should go with the visit", () => {
    const { field, render, layers, map } = forestWithMap();
    render({ x: 600, y: 600 });
    field.release("destroy");
    expect(layers.every((l) => l.destroyed)).toBe(true);
    expect(map()).toBeUndefined();
  });
});

const { useGameStore } = await import("@/stores/gameStore");

// FS-P0HSP §D.25–§D.27 (I-P0HSP-5): the field scene keeps its charted ground in this browser.
describe("FieldScene charted ground kept (FS-P0HSP §D.25–§D.27; I-P0HSP-5)", () => {
  const WALLS = FOREST_WALLS.map((r, i) => ({ entity_id: `s${i}`, house_id: `s${i}`, position: { x: r.x, y: r.y }, width: r.width, height: r.height }));
  const GATE = { entity_id: "road", destination: "hub", position: FOREST_GATE, range: 80 };
  const any: unknown = new Proxy(() => any, { get: (_t, k) => (k === "then" ? undefined : any), apply: () => any });
  /** One browser's store, shared across visits. */
  function browser() {
    const held = new Map<string, string>();
    const writes: string[] = [];
    const reach = () => ({
      getItem: (k: string) => held.get(k) ?? null,
      setItem: (k: string, v: string) => void (writes.push(k), held.set(k, v)),
      removeItem: (k: string) => void held.delete(k),
    });
    return { held, writes, reach };
  }
  /** A visit to the Forest as `character`, on `store`. */
  function visit(store: ReturnType<typeof browser>, character: string | null) {
    useGameStore.setState({ activeCharacterId: character });
    const stage = fieldOnStage();
    const field = stage.field as unknown as FieldUnderTest & Record<string, unknown>;
    const clock = { now: 0 };
    Object.assign(field, {
      field: "forlorn_forest",
      size: FOREST_SIZE,
      time: { delayedCall: vi.fn(), get now() { return clock.now; } },
      minimapStage: { graphics: () => any, canvasImage: () => any },
      showClassHud: vi.fn(),
      chartStore: store.reach,
      minimapStore: () => null,
    });
    const render = (position: { x: number; y: number }) =>
      field.renderState({ world_type: "field", current_player: { id: "self", entity_id: "me", position }, other_players: [], walls: WALLS, gates: [GATE] });
    const chart = () => (field.charting as { chart: { charted(cx: number, cy: number): boolean } } | undefined)?.chart;
    const cellAt = (p: { x: number; y: number }) => chart()!.charted(Math.floor(p.x / FIELD_CHART.cell), Math.floor(p.y / FIELD_CHART.cell));
    const frame = (ms: number) => {
      clock.now += ms;
      (field as unknown as { update(t: number, d: number): void }).update(clock.now, ms);
    };
    return { field, clock, render, chart, cellAt, frame };
  }

  afterEach(() => {
    useGameStore.setState({ activeCharacterId: null });
    vi.restoreAllMocks();
  });

  it("should show a field walked before as it was left: a second visit starts with the first's ground (§D.25)", () => {
    const store = browser();
    const first = visit(store, "char-a");
    first.render({ x: 600, y: 600 });
    first.field.release("shutdown");
    const second = visit(store, "char-a");
    second.render({ x: 2900, y: 1480 });
    expect(second.cellAt({ x: 600, y: 600 })).toBe(true);
    expect(second.cellAt({ x: 2900, y: 1480 })).toBe(true);
  });

  it("should keep two characters' ground apart (§D.25)", () => {
    const store = browser();
    const a = visit(store, "char-a");
    a.render({ x: 600, y: 600 });
    a.field.release("shutdown");
    const b = visit(store, "char-b");
    b.render({ x: 2900, y: 1480 });
    expect(b.cellAt({ x: 600, y: 600 })).toBe(false);
    b.field.release("shutdown");
    const again = visit(store, "char-a");
    again.render({ x: 2900, y: 1480 });
    expect(again.cellAt({ x: 600, y: 600 })).toBe(true);
  });

  it("should write at most once every 2 s while new ground is charted, and once more as the scene ends (§D.25)", () => {
    const store = browser();
    const v = visit(store, "char-a");
    let x = 200;
    v.render({ x, y: 1000 });
    // 5 s walking at 400 px a second, a state every 33 ms, a frame every 16 / 17 ms
    for (let t = 0; t < 5000; t += 33) {
      x += (400 * 33) / 1000;
      v.frame(16);
      v.frame(17);
      v.render({ x, y: 1000 });
    }
    expect(store.writes.length).toBeGreaterThanOrEqual(2);
    expect(store.writes.length).toBeLessThanOrEqual(3);
    // standing still: nothing new, nothing written
    const written = store.writes.length;
    v.frame(3000);
    v.frame(3000);
    expect(store.writes.length).toBeLessThanOrEqual(written + 1);
    const settled = store.writes.length;
    v.frame(3000);
    expect(store.writes.length).toBe(settled);
    v.render({ x: 2900, y: 1480 });
    v.field.release("destroy");
    expect(store.writes.length).toBe(settled + 1);
  });

  it("should keep nothing with no active character, and still chart the visit (§D.26)", () => {
    const store = browser();
    const v = visit(store, null);
    v.render({ x: 600, y: 600 });
    expect(v.cellAt({ x: 600, y: 600 })).toBe(true);
    v.field.release("shutdown");
    expect(store.writes).toEqual([]);
  });
});
