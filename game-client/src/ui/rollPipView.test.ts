import { describe, expect, it } from "vitest";
import type { ClientGameState, PlayerState } from "@/types/gameState";
import { ABILITY_SQUARE_GAP, abilityBarFrame } from "./abilityBarLayout";
import { ROLL_PIP_SIZE, rollPipFrame, rollPipView } from "./rollPipView";

// FS-7P736 §B R16: the roll pip's view as the run hands it, and its place beside the ability bar

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

const run = (player: PlayerState | null): Pick<ClientGameState, "world_type" | "current_player"> => ({
  world_type: "run",
  current_player: player,
});

describe("rollPipView (FS-7P736 R16)", () => {
  it("should be lit and unswept, labelled Space, with no roll cooldown on the wire", () => {
    expect(rollPipView(run(me()))).toEqual({ label: "Space", ready: true, cooldown: null });
  });

  it("should carry the wire's roll cooldown for the sweep, and not be lit, while it runs", () => {
    expect(rollPipView(run(me({ roll_cooldown: { remaining: 1.5, total: 3 } })))).toEqual({
      label: "Space",
      ready: false,
      cooldown: { remaining: 1.5, total: 3 },
    });
  });

  it("should stand unlit and unswept once the player is out of the delve", () => {
    const dead = me({ current_health: 0, roll_cooldown: { remaining: 1, total: 3 } });
    expect(rollPipView(run(dead))).toEqual({ label: "Space", ready: false, cooldown: null });
  });

  it("should be none before the first state and in the hub", () => {
    expect(rollPipView(run(null))).toBeNull();
    expect(rollPipView({ world_type: "hub", current_player: me() })).toBeNull();
  });
});

describe("rollPipFrame (FS-7P736 R16)", () => {
  it.each([
    [1280, 720],
    [800, 600],
  ])("should stand one gap right of the ability bar's last square at %d x %d, foot on its foot, label on its cost line", (width, height) => {
    const view = { width, height };
    const tree = abilityBarFrame(view).squares.tree;
    const f = rollPipFrame(view);
    expect(f.well.x).toBe(tree.well.x + tree.well.width + ABILITY_SQUARE_GAP);
    expect(f.well.y + f.well.height).toBe(tree.well.y + tree.well.height);
    expect(f.well.width).toBe(ROLL_PIP_SIZE);
    expect(f.well.height).toBe(ROLL_PIP_SIZE);
    expect(f.label.y).toBe(tree.cost.y);
    expect(f.label.x + f.label.width / 2).toBe(f.well.x + f.well.width / 2);
  });
});
