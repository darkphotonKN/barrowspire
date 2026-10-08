import { describe, expect, it } from "vitest";
import { delveNotice, resolved } from "./party";

const delver = (
  fields: { escape?: boolean; current_health?: number } = {},
) => ({
  escape: false,
  current_health: 100,
  ...fields,
});

describe("resolved (FS-77AB6 req 17)", () => {
  it.each([
    ["escaped", delver({ escape: true }), true],
    ["fallen", delver({ current_health: 0 }), true],
    ["in play", delver(), false],
    ["in play with no health sent", { escape: false }, false],
    ["absent", null, false],
  ])("should count a delver %s as %s", (_, d, want) => {
    expect(resolved(d)).toBe(want);
  });
});

describe("delveNotice (FS-77AB6 req 42)", () => {
  const state = (
    me: ReturnType<typeof delver> | null,
    others: ReturnType<typeof delver>[],
  ) => ({ current_player: me, other_players: others });

  it("should tell an escaped delver the delve goes on while another is still in it", () => {
    const notice = delveNotice(state(delver({ escape: true }), [delver()]));
    expect(notice).toMatch(/delve/i);
    expect(notice).toMatch(/out of the barrow/i);
  });

  it("should tell a fallen delver the delve goes on while another is still in it", () => {
    const notice = delveNotice(
      state(delver({ current_health: 0 }), [
        delver({ escape: true }),
        delver(),
      ]),
    );
    expect(notice).toMatch(/delve/i);
    expect(notice).toMatch(/keeps you/i);
  });

  it("should say nothing to a delver still in play", () => {
    expect(delveNotice(state(delver(), [delver()]))).toBeNull();
  });

  it("should say nothing once no one is left in the delve: the end is coming", () => {
    expect(
      delveNotice(
        state(delver({ escape: true }), [delver({ current_health: 0 })]),
      ),
    ).toBeNull();
    expect(delveNotice(state(delver({ escape: true }), []))).toBeNull();
  });

  it("should say nothing with no delver of our own in the state", () => {
    expect(delveNotice(state(null, [delver()]))).toBeNull();
  });

  it.each([
    ["escaped", delver({ escape: true })],
    ["fallen", delver({ current_health: 0 })],
  ])(
    "should keep the hub's words for an %s delver: delve, never run",
    (_, me) => {
      expect(delveNotice(state(me, [delver()]))).not.toMatch(/\brun\b/i);
    },
  );
});
