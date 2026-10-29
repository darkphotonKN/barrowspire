import { describe, expect, it } from "vitest";
import type {
  ClientGameState,
  PlayerState,
  ResourceState,
} from "@/types/gameState";
import { abilityAffordable, hudBars, PARRY_PIPS, teammateHealthFill } from "./resources";

const resource = (kind: string, current: number, max: number): ResourceState =>
  ({ kind, current, max, ability_cost: 10 }) as ResourceState;

const player = (fields: Partial<PlayerState> = {}): PlayerState =>
  ({
    id: "me",
    entity_id: "e_me",
    username: "Aldric",
    class: "mage",
    position: { x: 0, y: 0 },
    direction: { vx: 0, vy: 0, speed: 0 },
    escape: false,
    current_health: 60,
    max_health: 120,
    ...fields,
  }) as PlayerState;

const run = (
  me: PlayerState | null,
  world_type: ClientGameState["world_type"] = "run",
): Pick<ClientGameState, "world_type" | "current_player"> => ({
  world_type,
  current_player: me,
});

describe("hudBars (FS-8AY7S req 20–25)", () => {
  it("should show Health then Mana for a mage, each filled by current / max", () => {
    const bars = hudBars(run(player({ resource: resource("mana", 30, 120) })));
    expect(bars.map((b) => [b.channel, b.label, b.fill])).toEqual([
      ["health", "Health:", 0.5],
      ["mana", "Mana:", 0.25],
    ]);
  });

  it.each(["warrior", "archer"])(
    "should label a %s's resource Stamina:",
    (cls) => {
      const bars = hudBars(
        run(player({ class: cls, resource: resource("stamina", 50, 100) })),
      );
      expect(bars[1]).toMatchObject({
        channel: "stamina",
        label: "Stamina:",
        fill: 0.5,
      });
    },
  );

  it("should take the label from the resource kind, never the class", () => {
    const bars = hudBars(
      run(player({ class: "warrior", resource: resource("mana", 1, 2) })),
    );
    expect(bars[1].label).toBe("Mana:");
  });

  it.each([0, 1, 2, 3])(
    "should draw parry charges as 3 pips, %i lit, labelled Parry:",
    (held) => {
      const bars = hudBars(
        run(player({ resource: resource("parry_charges", held, 3) })),
      );
      expect(bars[1].channel).toBe("parry");
      expect(bars[1].label).toBe("Parry:");
      expect(bars[1].pips).toHaveLength(PARRY_PIPS);
      expect(bars[1].pips?.filter(Boolean)).toHaveLength(held);
      // lit from the first pip on
      expect(bars[1].pips).toEqual([0, 1, 2].map((i) => i < held));
    },
  );

  it("should never light more than 3 pips, nor fewer than none", () => {
    expect(
      hudBars(run(player({ resource: resource("parry_charges", 7, 3) })))[1]
        .pips,
    ).toEqual([true, true, true]);
    expect(
      hudBars(run(player({ resource: resource("parry_charges", -1, 3) })))[1]
        .pips,
    ).toEqual([false, false, false]);
  });

  it("should draw an unknown kind as an unlabelled bar rather than fail", () => {
    const bars = hudBars(run(player({ resource: resource("fury", 5, 10) })));
    expect(bars[1]).toMatchObject({
      channel: "unknown",
      label: null,
      fill: 0.5,
    });
    expect(bars[1].pips).toBeUndefined();
  });

  it("should show the health bar alone when the state carries no resource", () => {
    const bars = hudBars(run(player()));
    expect(bars.map((b) => b.channel)).toEqual(["health"]);
  });

  it.each([
    ["current over max", 150, 100, 1],
    ["current below zero", -5, 100, 0],
    ["max of zero", 5, 0, 0],
    ["exactly full", 100, 100, 1],
    ["empty", 0, 100, 0],
  ])("should clamp the fill to 0..1: %s", (_, current, max, fill) => {
    const bars = hudBars(
      run(player({ resource: resource("stamina", current, max) })),
    );
    expect(bars[1].fill).toBe(fill);
  });

  it("should clamp the health fill too", () => {
    expect(
      hudBars(run(player({ current_health: 200, max_health: 100 })))[0].fill,
    ).toBe(1);
  });

  it("should draw no health bar before the server has sent health: no default value", () => {
    const bars = hudBars(
      run(
        player({
          current_health: undefined,
          max_health: undefined,
          resource: resource("mana", 1, 2),
        }),
      ),
    );
    expect(bars.map((b) => b.channel)).toEqual(["mana"]);
  });

  describe("visibility (req 24, 25)", () => {
    it("should show nothing in the hub", () => {
      expect(
        hudBars(run(player({ resource: resource("mana", 1, 2) }), "hub")),
      ).toEqual([]);
    });

    it("should show nothing before the player's first state", () => {
      expect(hudBars(run(null))).toEqual([]);
    });

    it.each([
      ["dead (and so spectating)", { current_health: 0 }],
      ["escaped", { escape: true }],
      ["left behind (arrives fallen)", { current_health: -3 }],
    ])("should show nothing once the player is %s", (_, fields) => {
      expect(
        hudBars(run(player({ resource: resource("mana", 1, 2), ...fields }))),
      ).toEqual([]);
    });

    it("should show the bars in a run while the player is in the delve", () => {
      expect(
        hudBars(run(player({ resource: resource("mana", 1, 2) }))),
      ).toHaveLength(2);
    });
  });
});

describe("teammateHealthFill (FS-8AY7S req 27, 28)", () => {
  const mate = (fields: Partial<PlayerState> = {}) =>
    player({ id: "mate", current_health: 30, max_health: 120, ...fields });

  it("should fill a living teammate's bar by current / max health in a run", () => {
    expect(teammateHealthFill("run", mate())).toBe(0.25);
  });

  it("should draw it in a run whose state names no world type", () => {
    expect(teammateHealthFill(undefined, mate())).toBe(0.25);
  });

  it("should draw none in the hub", () => {
    expect(teammateHealthFill("hub", mate())).toBeNull();
  });

  it.each([
    ["dead", { current_health: 0 }],
    ["left behind (arrives fallen)", { current_health: -3 }],
    ["escaped", { escape: true }],
  ])("should draw none over a teammate who is %s", (_, fields) => {
    expect(teammateHealthFill("run", mate(fields))).toBeNull();
  });

  it("should draw none before the server has sent their health: no default value", () => {
    expect(
      teammateHealthFill("run", mate({ current_health: undefined })),
    ).toBeNull();
    expect(
      teammateHealthFill("run", mate({ max_health: undefined })),
    ).toBeNull();
  });

  it.each([
    ["current over max", 150, 100, 1],
    ["max of zero", 5, 0, 0],
    ["exactly full", 100, 100, 1],
  ])("should clamp the fill to 0..1: %s", (_, current, max, fill) => {
    expect(
      teammateHealthFill("run", mate({ current_health: current, max_health: max })),
    ).toBe(fill);
  });
});

describe("abilityAffordable (FS-8AY7S req 31; FS-JTNPR req 18)", () => {
  it.each([
    [0, false],
    [39, false],
    [40, true],
    [100, true],
  ])("should judge a pool of %i against a cost of 40: %s", (current, affordable) => {
    expect(abilityAffordable({ kind: "stamina", current, max: 100, ability_cost: 40 })).toBe(affordable);
  });

  it("should call anything affordable with no resource on the wire (an older server refuses it)", () => {
    expect(abilityAffordable(undefined)).toBe(true);
  });

  it("should call an ability that costs nothing affordable from an empty pool", () => {
    expect(abilityAffordable({ kind: "parry_charges", current: 0, max: 3, ability_cost: 0 })).toBe(true);
  });
});
