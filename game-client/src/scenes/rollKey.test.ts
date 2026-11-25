import { describe, expect, it, vi } from "vitest";
import type { PlayerState } from "@/types/gameState";
import type { UiState } from "@/ui/uiBridge";
import { bindRollKey, rollAllowed, rollDirection, type RollGate } from "./rollKey";
import { RUN_ACTIONS } from "./runActions";

// FS-7P736 §B R13, R14: Space rolls the held direction, else the facing, and only when the client
// judges it allowed; the cooldown is the wire's, never the client's

const me = (fields: Partial<PlayerState> = {}): PlayerState =>
  ({
    id: "me",
    entity_id: "e_me",
    username: "Aldric",
    class: "warrior",
    position: { x: 100, y: 100 },
    direction: { vx: 0, vy: 0, speed: 0 },
    escape: false,
    current_health: 100,
    max_health: 100,
    ...fields,
  }) as PlayerState;

const CALM: UiState = { menuOpen: false };
const OPEN: RollGate = { spectating: false, predicting: false, ui: CALM };

describe("rollDirection (FS-7P736 R13)", () => {
  it("should send the held movement keys' vector, as move sends it", () => {
    expect(rollDirection({ vx: 1, vy: -1 }, "s")).toEqual({ dir_x: 1, dir_y: -1 });
    expect(rollDirection({ vx: -1, vy: 0 }, "e")).toEqual({ dir_x: -1, dir_y: 0 });
  });

  it("should send the facing with no key held, never a zero vector", () => {
    const d = rollDirection({ vx: 0, vy: 0 }, "se");
    expect(d.dir_x).toBeCloseTo(Math.SQRT1_2);
    expect(d.dir_y).toBeCloseTo(Math.SQRT1_2);
    expect(rollDirection({ vx: 0, vy: 0 }, "w")).toEqual({ dir_x: -1, dir_y: 0 });
  });
});

describe("rollAllowed (FS-7P736 R13, R14)", () => {
  it("should allow a delver in play with no roll cooldown and no roll under way", () => {
    expect(rollAllowed(me(), OPEN)).toBe(true);
  });

  it.each<[string, PlayerState | null, Partial<RollGate>]>([
    ["no player", null, {}],
    ["dead", me({ current_health: 0 }), {}],
    ["escaped", me({ escape: true }), {}],
    ["spectating", me(), { spectating: true }],
    ["chat focused", me(), { ui: { ...CALM, typing: true } }],
    ["the menu open", me(), { ui: { ...CALM, menuOpen: true } }],
    ["the roll cooldown on the wire runs", me({ roll_cooldown: { remaining: 0.01, total: 3 } }), {}],
    ["the server says it is rolling", me({ roll: { dir_x: 1, dir_y: 0 } }), {}],
    ["the predicted roll still in flight", me(), { predicting: true }],
  ])("should refuse with %s", (_name, player, gate) => {
    expect(rollAllowed(player, { ...OPEN, ...gate })).toBe(false);
  });

  it("should allow once the cooldown has cleared from the wire", () => {
    expect(rollAllowed(me({ roll_cooldown: undefined }), OPEN)).toBe(true);
  });
});

describe("bindRollKey (FS-7P736 R13)", () => {
  function bound() {
    const handlers: Record<string, (event?: KeyboardEvent) => void> = {};
    const roll = vi.fn();
    bindRollKey({ on: (event, fn) => (handlers[event] = fn) }, roll);
    return { handlers, roll };
  }

  it("should bind the keydown event RUN_ACTIONS names, Space", () => {
    const { handlers } = bound();
    expect(RUN_ACTIONS.roll).toEqual({ key: "SPACE", label: "Space" });
    expect(handlers["keydown-SPACE"]).toBeTypeOf("function");
  });

  it("should roll on a press, and nothing on the key's auto-repeat", () => {
    const { handlers, roll } = bound();
    handlers["keydown-SPACE"]?.({ repeat: false } as KeyboardEvent);
    handlers["keydown-SPACE"]?.({ repeat: true } as KeyboardEvent);
    expect(roll).toHaveBeenCalledTimes(1);
  });

  it("should take no added key, so nothing captures Space and chat still types it", () => {
    const keyboard = { on: vi.fn(), addKey: vi.fn(), addCapture: vi.fn() };
    bindRollKey(keyboard, vi.fn());
    expect(keyboard.addKey).not.toHaveBeenCalled();
    expect(keyboard.addCapture).not.toHaveBeenCalled();
  });
});

