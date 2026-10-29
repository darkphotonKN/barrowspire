import { afterEach, describe, expect, it, vi } from "vitest";

// Only the field's entrance trigger and its replies are under test: a Phaser stand-in with the
// scene base class and the events the scene hangs its release on.
vi.mock("phaser", async () => {
  const { EventEmitter } = await import("eventemitter3");
  class Scene {
    events = new EventEmitter();
    constructor(_config: unknown) {}
  }
  const phaser = {
    Scene,
    Scenes: { Events: { SHUTDOWN: "shutdown", DESTROY: "destroy" } },
    BlendModes: { NORMAL: 0, ADD: 1, MULTIPLY: 2 },
    Input: { Keyboard: { KeyCodes: {} } },
    Math: { Linear: (a: number, b: number, t: number) => a + (b - a) * t },
  };
  return { ...phaser, default: phaser };
});

const { FieldScene } = await import("./FieldScene");
const { socketManager } = await import("@/utils/class/SocketManager");
const { ActionType } = await import("@/assets/types/client");

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
