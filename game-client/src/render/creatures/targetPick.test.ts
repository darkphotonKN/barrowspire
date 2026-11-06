import { describe, expect, it } from "vitest";
import type { MonsterState } from "@/types/gameState";
import {
  BOSS_LEASH_PX,
  HIT_WINDOW_MS,
  LAST_HIT_HOLD_MS,
  LastHitTracker,
  engaged,
  engagedBoss,
  pickTarget,
  type PartyMember,
} from "./targetPick";

// FS-48CTQ §C.5–7 (I-48CTQ-1): which monster the target frame names, and how long the last-hit
// monster holds it. §D.10–11 (I-48CTQ-2): when the boss is engaged and holds it.

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

describe("engaged (FS-48CTQ §D.10: damaged, or within its 700 px leash of a living member while moving or attacking)", () => {
  it("should read the demon's leash, 700 px (monster_tuning.go)", () => {
    expect(BOSS_LEASH_PX).toBe(700);
  });

  it.each([
    [699, true],
    [700, true],
    [701, false],
  ])(
    "a full-health boss moving with a member %i px away: engaged %s",
    (x, want) => {
      expect(engaged(demon(), [member(x)])).toBe(want);
    },
  );

  it("should measure the distance on both axes", () => {
    // 3-4-5: 420 east and 560 south is 700 px
    const at = (dy: number) =>
      member(420, { position: { x: 520, y: 100 + dy } });
    expect(engaged(demon(), [at(560)])).toBe(true);
    expect(engaged(demon(), [at(561)])).toBe(false);
  });

  it.each([
    ["moving", "move", true],
    ["attacking", "attack", true],
    ["idle", "idle", false],
  ] as const)(
    "a full-health boss %s beside a member: engaged %s",
    (_, action, want) => {
      expect(engaged(demon({ action }), [member(100)])).toBe(want);
    },
  );

  it.each([
    ["dead", { current_health: 0 }],
    ["escaped", { escape: true }],
  ])("should not count a %s member", (_, fields) => {
    expect(engaged(demon(), [member(100, fields)])).toBe(false);
  });

  it("should count a member with no health sent as living", () => {
    expect(engaged(demon(), [member(100, { current_health: undefined })])).toBe(
      true,
    );
  });

  it("should be engaged by any one living member in range", () => {
    expect(
      engaged(demon(), [member(100, { current_health: 0 }), member(650)]),
    ).toBe(true);
  });

  it.each([
    ["idle, with no one near", "idle", []],
    ["idle, far from everyone", "idle", [member(5000)]],
    ["moving, far from everyone", "move", [member(5000)]],
  ] as const)(
    "a damaged boss %s: still engaged until it dies",
    (_, action, members) => {
      expect(engaged(demon({ action, current_health: 1199 }), members)).toBe(
        true,
      );
    },
  );

  it("a full-health boss beyond 700 px of the party (it ran past): not engaged", () => {
    expect(engaged(demon(), [member(701), member(-900)])).toBe(false);
  });

  it.each([
    ["above its maximum", { current_health: 1300 }],
    ["with no maximum", { max_health: 0 }],
  ])("should not read a boss %s as damaged", (_, fields) => {
    expect(engaged(demon({ action: "idle", ...fields }), [])).toBe(false);
  });

  it("should never engage a dead boss", () => {
    expect(
      engaged(demon({ action: "dead", current_health: 0 }), [member(10)]),
    ).toBe(false);
  });
});

describe("engagedBoss (FS-48CTQ §D.9–11: the engaged boss among the shown)", () => {
  it("should name an engaged boss among the shown", () => {
    expect(engagedBoss([monster("a"), demon()], [member(100)])).toBe("boss");
  });

  it("should name nothing when the boss is not engaged", () => {
    expect(engagedBoss([demon()], [member(701)])).toBeUndefined();
  });

  it("should never name a common or elite monster, however close or hurt", () => {
    const close = [member(10)];
    expect(
      engagedBoss(
        [
          monster("a", { action: "attack", current_health: 1 }),
          monster("e", { elite: true, action: "move", current_health: 1 }),
        ],
        close,
      ),
    ).toBeUndefined();
  });

  it("should name nothing when the boss is not shown (fog, the dark, gone)", () => {
    expect(engagedBoss([monster("a")], [member(10)])).toBeUndefined();
  });

  it("should hold the frame ahead of the last-hit monster, a hovered one still winning", () => {
    const shown = [monster("a"), monster("b"), demon({ current_health: 900 })];
    const boss = engagedBoss(shown, []);
    expect(
      pickTarget({ shown, engagedBoss: boss, lastHit: "b" })?.entity_id,
    ).toBe("boss");
    expect(
      pickTarget({ shown, hovered: "a", engagedBoss: boss, lastHit: "b" })
        ?.entity_id,
    ).toBe("a");
  });
});
