import { describe, expect, it } from "vitest";
import type { MonsterState } from "@/types/gameState";
import {
  HIT_WINDOW_MS,
  LAST_HIT_HOLD_MS,
  LastHitTracker,
  pickTarget,
} from "./targetPick";

// FS-48CTQ §C.5–7 (I-48CTQ-1): which monster the target frame names, and how long the last-hit
// monster holds it.

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
    ["hovered over an engaged boss", { hovered: "a", engagedBoss: "boss" }, "a"],
    ["an engaged boss over last-hit", { engagedBoss: "boss", lastHit: "b" }, "boss"],
    ["all three: hovered", { hovered: "b", engagedBoss: "boss", lastHit: "a" }, "b"],
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
    expect(pickTarget({ shown: list, hovered: "a", lastHit: "b" })?.entity_id).toBe("b");
  });

  it("should hide when the only monster it could name is gone", () => {
    expect(pickTarget({ shown: [b], lastHit: "a" })).toBeNull();
  });

  it("should never name an id that is not a monster (a party member's)", () => {
    expect(pickTarget({ shown, hovered: "e_ally", lastHit: "e_me" })).toBeNull();
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
