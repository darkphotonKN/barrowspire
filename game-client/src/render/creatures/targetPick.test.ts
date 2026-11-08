import { describe, expect, it } from "vitest";
import { PlayerCombat } from "@/render/combat/playerCombat";
import type { MonsterState } from "@/types/gameState";
import {
  BOSS_AGGRO_PX,
  BOSS_LEASH_PX,
  BossEngagement,
  HIT_WINDOW_MS,
  LAST_HIT_HOLD_MS,
  LastHitTracker,
  castTarget,
  engages,
  pickTarget,
  type PartyMember,
} from "./targetPick";

// FS-48CTQ §C.5–7 (I-48CTQ-1): which monster the target frame names, and how long the last-hit
// monster holds it, a ranged cast over a hovered monster included (review S1). §D.10–11
// (I-48CTQ-2): when the boss is engaged and holds it, latched (review S2).

const monster = (
  entity_id: string,
  fields: Partial<MonsterState> = {},
): MonsterState => ({
  entity_id,
  archetype: "ghoul",
  name: "Ghoul",
  level: 3,
  elite: false,
  boss: false,
  position: { x: 100, y: 100 },
  facing: { x: 1, y: 0 },
  action: "idle",
  current_health: 20,
  max_health: 20,
  ...fields,
});

describe("pickTarget (FS-48CTQ §C.5: hovered, else an engaged boss, else the last-hit monster)", () => {
  const a = monster("a");
  const b = monster("b");
  const boss = monster("boss", { archetype: "demon", boss: true });
  const shown = [a, b, boss];

  it("should name nothing with nothing hovered, engaged or last hit", () => {
    expect(pickTarget({ shown })).toBeNull();
  });

  it.each([
    ["hovered over last-hit", { hovered: "a", lastHit: "b" }, "a"],
    [
      "hovered over an engaged boss",
      { hovered: "a", engagedBoss: "boss" },
      "a",
    ],
    [
      "an engaged boss over last-hit",
      { engagedBoss: "boss", lastHit: "b" },
      "boss",
    ],
    [
      "all three: hovered",
      { hovered: "b", engagedBoss: "boss", lastHit: "a" },
      "b",
    ],
    ["last-hit alone", { lastHit: "b" }, "b"],
  ])("should rank %s", (_, slots, want) => {
    expect(pickTarget({ shown, ...slots })?.entity_id).toBe(want);
  });

  it("should name the monster as the latest broadcast has it", () => {
    const hurt = monster("a", { current_health: 5 });
    expect(pickTarget({ shown: [hurt], hovered: "a" })).toBe(hurt);
  });

  // §C.7: the frame never names a monster that is not a living, shown one
  it.each([
    ["dead", [monster("a", { action: "dead", current_health: 0 }), b]],
    ["hidden (not among the shown)", [b]],
  ])("should pass over a %s monster to the next slot", (_, list) => {
    expect(
      pickTarget({ shown: list, hovered: "a", lastHit: "b" })?.entity_id,
    ).toBe("b");
  });

  it("should hide when the only monster it could name is gone", () => {
    expect(pickTarget({ shown: [b], lastHit: "a" })).toBeNull();
  });

  it("should never name an id that is not a monster (a party member's)", () => {
    expect(
      pickTarget({ shown, hovered: "e_ally", lastHit: "e_me" }),
    ).toBeNull();
  });
});

describe("LastHitTracker (FS-48CTQ §C.6: the local player's own aimed hits hold it 3 s)", () => {
  it("should hold for 3 s and let go within 1 s", () => {
    expect(LAST_HIT_HOLD_MS).toBe(3000);
    expect(HIT_WINDOW_MS).toBe(1000);
  });

  it("should name the monster the moment the attack intent is sent", () => {
    const t = new LastHitTracker();
    t.aimed(monster("a"), 1000);
    expect(t.current(1000)).toBe("a");
  });

  it("should let go 3 s after the intent when no hit lands", () => {
    const t = new LastHitTracker();
    t.aimed(monster("a"), 1000);
    expect(t.current(3999)).toBe("a");
    expect(t.current(4000)).toBeUndefined();
  });

  it("should restart the 3 s on a health drop within 1 s of the intent, and let go 3 s after it", () => {
    const t = new LastHitTracker();
    t.aimed(monster("a"), 1000);
    t.observe([monster("a", { current_health: 14 })], 1800);
    expect(t.current(4500)).toBe("a");
    expect(t.current(4799)).toBe("a");
    expect(t.current(4800)).toBeUndefined();
  });

  it("should restart again on each own hit while the player keeps striking", () => {
    const t = new LastHitTracker();
    t.aimed(monster("a"), 0);
    t.observe([monster("a", { current_health: 16 })], 400);
    t.aimed(monster("a", { current_health: 16 }), 2500);
    t.observe([monster("a", { current_health: 12 })], 2900);
    expect(t.current(5800)).toBe("a");
    expect(t.current(5900)).toBeUndefined();
  });

  it("should not restart on a drop more than 1 s after the intent (a teammate's hit)", () => {
    const t = new LastHitTracker();
    t.aimed(monster("a"), 1000);
    t.observe([monster("a", { current_health: 14 })], 2001);
    expect(t.current(4000)).toBeUndefined();
  });

  it("should not count a drop that arrives with no new intent after the first was used", () => {
    const t = new LastHitTracker();
    t.aimed(monster("a"), 0);
    t.observe([monster("a", { current_health: 16 })], 300);
    // a teammate hits it 1.5 s after the player's last intent
    t.observe([monster("a", { current_health: 10 })], 1500);
    expect(t.current(3300)).toBeUndefined();
  });

  it("should not count a health rise or an unchanged health as a hit", () => {
    const t = new LastHitTracker();
    t.aimed(monster("a", { current_health: 10 }), 0);
    t.observe([monster("a", { current_health: 10 })], 200);
    t.observe([monster("a", { current_health: 12 })], 400);
    expect(t.current(3000)).toBeUndefined();
  });

  it("should move to the monster named by the latest intent (two attacks within 1 s)", () => {
    const t = new LastHitTracker();
    t.aimed(monster("a"), 0);
    t.aimed(monster("b"), 500);
    // the first monster's drop no longer holds anything
    t.observe([monster("a", { current_health: 1 }), monster("b")], 700);
    expect(t.current(700)).toBe("b");
    expect(t.current(3500)).toBeUndefined();
  });

  it.each([
    ["dies", [monster("a", { action: "dead", current_health: 0 })]],
    ["leaves the broadcast", []],
  ])("should let go at once when its monster %s", (_, monsters) => {
    const t = new LastHitTracker();
    t.aimed(monster("a"), 0);
    t.observe(monsters, 100);
    expect(t.current(100)).toBeUndefined();
    // and does not come back if it reappears
    t.observe([monster("a")], 200);
    expect(t.current(200)).toBeUndefined();
  });

  it("should keep holding a monster that is merely hidden: hiding is the picker's to apply", () => {
    const t = new LastHitTracker();
    t.aimed(monster("a"), 0);
    t.observe([monster("a")], 100);
    expect(t.current(100)).toBe("a");
  });

  it("should forget everything on clear (a new floor, a new run)", () => {
    const t = new LastHitTracker();
    t.aimed(monster("a"), 0);
    t.clear();
    expect(t.current(0)).toBeUndefined();
  });
});

describe("castTarget (FS-48CTQ §C.6: a cast sent over a monster names it)", () => {
  const a = monster("a");

  it("should name the hovered monster, living and shown, as the latest broadcast has it", () => {
    expect(castTarget("a", [a, monster("b")])).toBe(a);
  });

  it.each([
    ["nothing is hovered", undefined, [a]],
    [
      "the hovered one has died",
      "a",
      [monster("a", { action: "dead", current_health: 0 })],
    ],
    ["the hovered one is not shown (fog, the dark, gone)", "a", [monster("b")]],
    ["the hovered id is not a monster (a party member's)", "e_ally", [a]],
  ] as const)("should name nothing when %s", (_, hovered, shown) => {
    expect(castTarget(hovered, shown)).toBeUndefined();
  });
});

/**
 * The scene's wiring, Phaser-free: a PlayerCombat whose port names the hovered monster to the
 * tracker the moment a cast that can strike is sent, as `BarrowspireScene` does.
 */
function castingStage() {
  let now = 0;
  const stage = {
    hovered: undefined as string | undefined,
    shown: [] as MonsterState[],
    tracker: new LastHitTracker(),
  };
  const combat = new PlayerCombat(
    {
      sendMessage: () => undefined,
      later: () => undefined,
      now: () => now,
      castSent: () => {
        const named = castTarget(stage.hovered, stage.shown);
        if (named) stage.tracker.aimed(named, now);
      },
    },
    {
      slash: () => undefined,
      dash: () => undefined,
      arrow: () => undefined,
      fireball: () => undefined,
      cut: () => undefined,
      riposte: () => undefined,
      parry: () => undefined,
      shadowShot: () => undefined,
      aim: () => undefined,
      endAim: () => undefined,
      attackClip: () => undefined,
    },
  );
  return { stage, combat, at: (ms: number) => (now = ms) };
}

describe("a ranged cast at a hovered monster holds the frame (FS-48CTQ §C.6, review S1)", () => {
  const me = { x: 100, y: 100 };
  // 250 px east: far beyond the 60 px a melee strike reaches
  const far = monster("far", { position: { x: 350, y: 100 } });

  it.each(["archer", "mage"])(
    "an %s's primary at a monster 250 px away, hit within 1 s, should hold it 3 s after the pointer leaves",
    (cls) => {
      const { stage, combat, at } = castingStage();
      stage.shown = [far];
      stage.hovered = "far";
      // out of strike reach, so no `attack` names it: only the cast can
      expect(combat.strike(me, "far", far.position)).toBe(false);
      at(1000);
      expect(combat.cast("primary", cls, me, far.position)).toBe(true);

      // the pointer leaves; the arrow or fireball lands 600 ms later
      stage.hovered = undefined;
      const hurt = monster("far", {
        position: far.position,
        current_health: 12,
      });
      stage.tracker.observe([hurt], 1600);
      const frame = (ms: number) =>
        pickTarget({ shown: [hurt], lastHit: stage.tracker.current(ms) })
          ?.entity_id;
      expect(frame(4599)).toBe("far");
      expect(frame(4600)).toBeUndefined();
    },
  );

  it("should hold nothing for a cast with nothing hovered, though a monster's health drops", () => {
    const { stage, combat, at } = castingStage();
    stage.shown = [far];
    at(1000);
    combat.cast("primary", "archer", me, far.position);
    const hurt = monster("far", { position: far.position, current_health: 12 });
    stage.tracker.observe([hurt], 1500);
    expect(
      pickTarget({ shown: [hurt], lastHit: stage.tracker.current(1500) }),
    ).toBeNull();
  });

  it("should name nothing for a cast the cooldown holds back", () => {
    const { stage, combat, at } = castingStage();
    stage.shown = [far];
    at(0);
    combat.cast("primary", "mage", me, far.position);
    stage.hovered = "far";
    // inside the primary cooldown: nothing is sent, so nothing is named
    at(10);
    expect(combat.cast("primary", "mage", me, far.position)).toBe(false);
    expect(stage.tracker.current(10)).toBeUndefined();
  });
});

/** A run's player at `x` px east of the boss at (100, 100). */
const member = (x: number, fields: Partial<PartyMember> = {}): PartyMember => ({
  position: { x: 100 + x, y: 100 },
  escape: false,
  current_health: 50,
  ...fields,
});

const demon = (fields: Partial<MonsterState> = {}) =>
  monster("boss", {
    archetype: "demon",
    name: "Demon",
    boss: true,
    current_health: 1200,
    max_health: 1200,
    action: "move",
    ...fields,
  });

describe("engages (FS-48CTQ §D.10: what first engages a boss)", () => {
  it("should read the bosses' shared aggro and leash radii, 320 and 700 px (monster_tuning.go)", () => {
    expect(BOSS_AGGRO_PX).toBe(320);
    expect(BOSS_LEASH_PX).toBe(700);
  });

  it.each([
    [319, true],
    [320, true],
    [321, false],
    [699, false],
  ])(
    "a full-health boss moving with a member %i px away (its aggro radius 320): engages %s",
    (x, want) => {
      expect(engages(demon(), [member(x)])).toBe(want);
    },
  );

  it.each([
    [699, true],
    [700, true],
    [701, false],
  ])(
    "a full-health boss attacking with a member %i px away (its leash 700): engages %s",
    (x, want) => {
      expect(engages(demon({ action: "attack" }), [member(x)])).toBe(want);
    },
  );

  // FS-VHGE7 §D R34 (I-VHGE7-4): a demon's fire claw engages it as its slam (`attack`) does
  it.each([
    [699, true],
    [700, true],
    [701, false],
  ])(
    "a full-health boss clawing with a member %i px away (its leash 700): engages %s",
    (x, want) => {
      expect(engages(demon({ action: "claw" }), [member(x)])).toBe(want);
      expect(
        engages(demon({ archetype: "blood_demon", action: "claw" }), [
          member(x),
        ]),
      ).toBe(want);
    },
  );

  it("a boss clawing only a fallen or escaped member: does not engage", () => {
    expect(
      engages(demon({ action: "claw" }), [
        member(40, { current_health: 0 }),
        member(40, { escape: true }),
      ]),
    ).toBe(false);
  });

  it("should measure the distance on both axes", () => {
    // 3-4-5: 192 east and 256 south is 320 px
    const at = (dy: number) =>
      member(192, { position: { x: 292, y: 100 + dy } });
    expect(engages(demon(), [at(256)])).toBe(true);
    expect(engages(demon(), [at(257)])).toBe(false);
  });

  it("a full-health idle boss beside a member: does not engage", () => {
    expect(engages(demon({ action: "idle" }), [member(10)])).toBe(false);
  });

  it.each([
    ["dead", { current_health: 0 }],
    ["escaped", { escape: true }],
  ])("should not count a %s member", (_, fields) => {
    expect(engages(demon(), [member(100, fields)])).toBe(false);
  });

  it("should count a member with no health sent as living", () => {
    expect(engages(demon(), [member(100, { current_health: undefined })])).toBe(
      true,
    );
  });

  it("should be engaged by any one living member in range", () => {
    expect(
      engages(demon(), [member(100, { current_health: 0 }), member(300)]),
    ).toBe(true);
  });

  it.each([
    ["idle, with no one near", "idle", []],
    ["moving, far from everyone", "move", [member(5000)]],
  ] as const)("a damaged boss %s: engages", (_, action, members) => {
    expect(engages(demon({ action, current_health: 1199 }), members)).toBe(
      true,
    );
  });

  it.each([
    ["above its maximum", { current_health: 1300 }],
    ["with no maximum", { max_health: 0 }],
  ])("should not read a boss %s as damaged", (_, fields) => {
    expect(engages(demon({ action: "idle", ...fields }), [])).toBe(false);
  });

  it("should never engage a dead boss", () => {
    expect(
      engages(demon({ action: "dead", current_health: 0 }), [member(10)]),
    ).toBe(false);
  });
});

describe("BossEngagement (FS-48CTQ §D.10–11: engaged once, held until at full health and past the leash)", () => {
  /** Each broadcast in turn: the boss's fields and the members; what the latch named after each. */
  const run = (steps: [Partial<MonsterState>, PartyMember[]][]) => {
    const latch = new BossEngagement();
    return steps.map(([fields, members]) =>
      latch.observe([demon(fields)], members),
    );
  };

  it("a demon wandering 500 px from the party (outside its aggro radius) should never take the frame", () => {
    expect(
      run([
        [{ action: "move" }, [member(500)]],
        [{ action: "idle" }, [member(500)]],
        [{ action: "move" }, [member(480)]],
      ]),
    ).toEqual([undefined, undefined, undefined]);
  });

  it("once engaged, the wander, pause, wander sequence near the party should not flip it", () => {
    expect(
      run([
        [{ action: "move" }, [member(300)]],
        [{ action: "idle" }, [member(300)]],
        [{ action: "move" }, [member(450)]],
        [{ action: "idle" }, [member(600)]],
        [{ action: "move" }, [member(650)]],
      ]),
    ).toEqual(["boss", "boss", "boss", "boss", "boss"]);
  });

  it("the melee swing-idle cycle should not flip it", () => {
    expect(
      run([
        [{ action: "attack" }, [member(40)]],
        [{ action: "idle" }, [member(40)]],
        [{ action: "attack", current_health: 1150 }, [member(40)]],
        [{ action: "idle", current_health: 1150 }, [member(40)]],
      ]),
    ).toEqual(["boss", "boss", "boss", "boss"]);
  });

  it("should release at full health once beyond 700 px of every living member, and not before", () => {
    expect(
      run([
        [{ action: "move" }, [member(200)]],
        [{ action: "idle" }, [member(700)]],
        [
          { action: "idle" },
          [member(701), member(-650, { current_health: 0 })],
        ],
        // released: idle at 600 px does not engage it again
        [{ action: "idle" }, [member(600)]],
      ]),
    ).toEqual(["boss", "boss", undefined, undefined]);
  });

  it("a damaged boss should stay engaged however far the party runs", () => {
    expect(
      run([
        [{ action: "move" }, [member(200)]],
        [{ action: "idle", current_health: 1100 }, [member(5000)]],
        [{ action: "move", current_health: 1100 }, [member(9000)]],
      ]),
    ).toEqual(["boss", "boss", "boss"]);
  });

  it("should release once it heals to full and the party is past the leash", () => {
    expect(
      run([
        [{ current_health: 1100 }, [member(5000)]],
        [{ action: "idle" }, [member(5000)]],
      ]),
    ).toEqual(["boss", undefined]);
  });

  it("should release when it dies, and not take the frame again as a corpse", () => {
    expect(
      run([
        [{ action: "attack" }, [member(40)]],
        [{ action: "dead", current_health: 0 }, [member(40)]],
      ]),
    ).toEqual(["boss", undefined]);
  });

  it("should release when it leaves the snapshot, and not hold again on its return until re-engaged", () => {
    const latch = new BossEngagement();
    expect(latch.observe([demon({ action: "attack" })], [member(40)])).toBe(
      "boss",
    );
    expect(latch.observe([monster("a")], [member(40)])).toBeUndefined();
    expect(
      latch.observe([demon({ action: "idle" })], [member(500)]),
    ).toBeUndefined();
  });

  it("should keep the latch while the boss is merely hidden by fog: the picker passes it over", () => {
    const latch = new BossEngagement();
    const boss = demon({ action: "attack" });
    latch.observe([boss], [member(40)]);
    // the snapshot still carries it; only the shown list lacks it
    const engagedId = latch.observe([demon({ action: "idle" })], [member(500)]);
    expect(engagedId).toBe("boss");
    expect(
      pickTarget({
        shown: [monster("b")],
        engagedBoss: engagedId,
        lastHit: "b",
      })?.entity_id,
    ).toBe("b");
  });

  it("should name an engaged boss that is shown over one that is hidden, both latched", () => {
    const latch = new BossEngagement();
    const hidden = demon({ entity_id: "hidden", current_health: 900 });
    const shown = demon({ entity_id: "shown", current_health: 900 });
    expect(latch.observe([hidden, shown], [], [shown])).toBe("shown");
    // the hidden one keeps its latch, and is named once it is shown alone
    expect(latch.observe([hidden, shown], [], [hidden])).toBe("hidden");
    expect(latch.observe([hidden], [], [])).toBeUndefined();
  });

  it("should never latch a common or elite monster, however close or hurt", () => {
    const latch = new BossEngagement();
    expect(
      latch.observe(
        [
          monster("a", { action: "attack", current_health: 1 }),
          monster("e", { elite: true, action: "move", current_health: 1 }),
        ],
        [member(10)],
      ),
    ).toBeUndefined();
  });

  it("should forget everything on clear (a new floor, a new run)", () => {
    const latch = new BossEngagement();
    latch.observe([demon({ action: "attack" })], [member(40)]);
    latch.clear();
    expect(
      latch.observe([demon({ action: "idle" })], [member(500)]),
    ).toBeUndefined();
  });

  it("should hold the frame ahead of the last-hit monster, a hovered one still winning", () => {
    const shown = [monster("a"), monster("b"), demon({ current_health: 900 })];
    const boss = new BossEngagement().observe(shown, []);
    expect(
      pickTarget({ shown, engagedBoss: boss, lastHit: "b" })?.entity_id,
    ).toBe("boss");
    expect(
      pickTarget({ shown, hovered: "a", engagedBoss: boss, lastHit: "b" })
        ?.entity_id,
    ).toBe("a");
  });
});

// FS-VHGE7 §C R28–29 (I-VHGE7-3): the blood demon is a boss by `boss: true`, no archetype check,
// and with both demons engaged the existing rule picks: the hovered one, else the first engaged.
describe("two bosses at once: the green demon and the blood demon (FS-VHGE7 §C R28–29)", () => {
  const green = demon({ entity_id: "green", current_health: 900 });
  const blood = demon({
    entity_id: "blood",
    archetype: "blood_demon",
    name: "Blood Demon",
    current_health: 1500,
    max_health: 1800,
  });

  it("should engage a blood demon as it does the green one: by `boss`, not its archetype", () => {
    expect(
      new BossEngagement().observe(
        [
          demon({
            entity_id: "blood",
            archetype: "blood_demon",
            action: "attack",
          }),
        ],
        [member(40)],
      ),
    ).toBe("blood");
  });

  it.each([
    ["the green demon first", [green, blood], "green"],
    ["the blood demon first", [blood, green], "blood"],
  ])(
    "with both engaged and none hovered, should name the first engaged: %s",
    (_, shown, want) => {
      const engagedBoss = new BossEngagement().observe(shown, []);
      expect(pickTarget({ shown, engagedBoss })?.entity_id).toBe(want);
    },
  );

  it.each(["green", "blood"])(
    "should name the hovered one of the two: %s",
    (hovered) => {
      const shown = [green, blood];
      const engagedBoss = new BossEngagement().observe(shown, []);
      expect(pickTarget({ shown, hovered, engagedBoss })?.entity_id).toBe(
        hovered,
      );
    },
  );
});
