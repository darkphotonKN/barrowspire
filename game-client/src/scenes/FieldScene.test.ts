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
  Object.assign(field, { placePlayer: vi.fn(), drawObstacles: vi.fn(), drawEntrance: vi.fn() });

  const errors = new Map<string, (info: unknown) => void>();
  vi.spyOn(socketManager, "onError").mockImplementation((action, cb) => {
    errors.set(action, cb as (info: unknown) => void);
  });
  vi.spyOn(socketManager, "offError").mockImplementation(() => {});
  const send = vi.spyOn(socketManager, "sendMessage").mockImplementation(() => {});
  field.listen();

  const standAt = (pos: { x: number; y: number }) => field.followEntrance(pos, [ROAD_HOME]);
  const refuse = (reason: string) =>
    errors.get(ActionType.LeaveField)?.({ action: ActionType.LeaveField, error: "x", message: "x", reason });
  return { field, texts, send, standAt, refuse };
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
});
