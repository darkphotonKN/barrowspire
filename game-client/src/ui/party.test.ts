import { describe, expect, it } from "vitest";
import { nextWatched, resolved, resolvedCard, watchable } from "./party";

const delver = (
  fields: {
    id?: string;
    username?: string;
    escape?: boolean;
    current_health?: number;
  } = {},
) => ({
  id: "me",
  username: "Aldric",
  escape: false,
  current_health: 100,
  ...fields,
});

const ally = (
  id: string,
  fields: { escape?: boolean; current_health?: number } = {},
) => delver({ id, username: id[0].toUpperCase() + id.slice(1), ...fields });

const state = (
  me: ReturnType<typeof delver> | null,
  others: ReturnType<typeof delver>[],
) => ({ current_player: me, other_players: others });

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

describe("resolvedCard (FS-QPDKN req 1, 3; edge state: left behind)", () => {
  it.each([
    ["dead", delver({ current_health: 0 }), [ally("wenna")], "dead"],
    ["escaped", delver({ escape: true }), [ally("wenna")], "escaped"],
    // a delver left on a lower floor (FS-F6F88) arrives dead, not escaped: the grim card
    [
      "left behind",
      delver({ current_health: 0, escape: false }),
      [ally("wenna")],
      "dead",
    ],
    [
      "dead with one ally still in among resolved ones",
      delver({ current_health: 0 }),
      [ally("wenna", { escape: true }), ally("tam")],
      "dead",
    ],
    ["in play", delver(), [ally("wenna")], null],
    [
      "dead with nobody left in play",
      delver({ current_health: 0 }),
      [ally("wenna", { current_health: 0 })],
      null,
    ],
    ["escaped alone", delver({ escape: true }), [], null],
    ["absent", null, [ally("wenna")], null],
  ])("should give a %s delver the %s card", (_, me, others, want) => {
    expect(resolvedCard(state(me, others))?.kind ?? null).toBe(want);
  });

  it("should keep the dead delver's grim line", () => {
    const card = resolvedCard(
      state(delver({ current_health: 0 }), [ally("wenna")]),
    );
    expect(`${card?.title} ${card?.body}`).toMatch(/barrow keeps you/i);
  });

  it("should tell the escaped delver they are out, grim and terse", () => {
    const card = resolvedCard(state(delver({ escape: true }), [ally("wenna")]));
    expect(`${card?.title} ${card?.body}`).toMatch(/out of the barrow/i);
    expect(`${card?.title} ${card?.body}`).not.toMatch(/!/);
  });

  it.each([
    ["dead", delver({ current_health: 0 })],
    ["escaped", delver({ escape: true })],
  ])(
    "should keep the hub's words on the %s card: delve, never run",
    (_, me) => {
      const card = resolvedCard(state(me, [ally("wenna")]));
      expect(`${card?.title} ${card?.body}`).not.toMatch(/\brun\b/i);
    },
  );
});

describe("watchable (FS-QPDKN req 7, 8)", () => {
  it("should list the teammates still in play, by id, never this delver", () => {
    const list = watchable(
      state(delver({ current_health: 0 }), [
        ally("wenna"),
        ally("tam"),
        ally("brom", { escape: true }),
      ]),
    );
    expect(list).toEqual([
      { id: "tam", username: "Tam" },
      { id: "wenna", username: "Wenna" },
    ]);
  });

  it("should leave this delver out even if the broadcast lists them among the others", () => {
    const list = watchable(state(delver(), [delver(), ally("wenna")]));
    expect(list.map((w) => w.id)).toEqual(["wenna"]);
  });

  it("should be empty with nobody else in play", () => {
    expect(
      watchable(
        state(delver({ current_health: 0 }), [
          ally("wenna", { current_health: 0 }),
        ]),
      ),
    ).toEqual([]);
    expect(watchable(state(null, []))).toEqual([]);
  });
});

describe("nextWatched (FS-QPDKN req 7, 8, 11)", () => {
  const two = [
    { id: "tam", username: "Tam" },
    { id: "wenna", username: "Wenna" },
  ];

  it.each([
    ["the first, to start", undefined, "tam"],
    ["the next after the current", "tam", "wenna"],
    ["round to the first after the last", "wenna", "tam"],
    ["the first once the current has resolved", "brom", "tam"],
  ])("should pick %s", (_, current, want) => {
    expect(nextWatched(two, current)).toBe(want);
  });

  it("should keep watching the only teammate in play", () => {
    expect(nextWatched([two[0]], "tam")).toBe("tam");
  });

  it("should pick nobody with no one in play", () => {
    expect(nextWatched([], "tam")).toBeUndefined();
  });
});
