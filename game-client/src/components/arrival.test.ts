import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { WorldEnteredPayload } from "@/assets/types/client";
import { keptPlaces, type PlaceStore } from "./arrival";

// FS-PQ2TW §A R5–R8; Facts 3, 4; Edge States (session storage unavailable, a refresh that lands on
// another server, a redirect back to the holding pod, two tabs). ADR-0075 Decisions 2, 4.
// I-PQ2TW-2: an arrival is told from a return, once, at the world switch.

const hub = (session = "hub-a"): WorldEnteredPayload => ({ world_type: "hub", session_id: session });
const run = (session = "run-a"): WorldEnteredPayload => ({ world_type: "run", session_id: session });
const field = (id: "gentle_meadows" | "forlorn_forest", session = "field-a"): WorldEnteredPayload => ({
  world_type: "field",
  session_id: session,
  field: id,
});

/** A tab's session storage: a plain map, as `Storage` keeps strings. */
function tabStorage(): PlaceStore & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

describe("an arrival told from a return (FS-PQ2TW R5, R6)", () => {
  it.each([
    { name: "the first world_entered of a page, nothing kept", seq: [hub()], want: [true] },
    { name: "a socket reconnect into the same town", seq: [hub(), hub()], want: [true, false] },
    { name: "a socket reconnect into the same run", seq: [run(), run()], want: [true, false] },
    {
      name: "a socket reconnect into the same field",
      seq: [field("gentle_meadows"), field("gentle_meadows")],
      want: [true, false],
    },
    { name: "town, field, town", seq: [hub(), field("gentle_meadows"), hub()], want: [true, true, true] },
    { name: "town, run, town", seq: [hub(), run(), hub()], want: [true, true, true] },
    { name: "travel to a leader's town: another hub session", seq: [hub("hub-a"), hub("hub-b")], want: [true, true] },
    {
      name: "the same field id on another session",
      seq: [field("gentle_meadows", "field-a"), field("gentle_meadows", "field-b")],
      want: [true, true],
    },
    {
      name: "another field on the same session",
      seq: [field("gentle_meadows", "field-a"), field("forlorn_forest", "field-a")],
      want: [true, true],
    },
    { name: "another world type on the same session", seq: [hub("s"), run("s")], want: [true, true] },
  ])("should read $name as $want", ({ seq, want }) => {
    const places = keptPlaces(() => tabStorage());

    expect(seq.map((payload) => places.isArrival(payload))).toEqual(want);
  });

  it("should tell a page refresh into the same place: the module rebuilt over the same storage", () => {
    const storage = tabStorage();
    keptPlaces(() => storage).isArrival(run());

    const afterRefresh = keptPlaces(() => storage);

    expect(afterRefresh.isArrival(run())).toBe(false);
  });

  it("should read a refresh that lands on another server as an arrival: its session differs", () => {
    const storage = tabStorage();
    keptPlaces(() => storage).isArrival(hub("hub-a"));

    expect(keptPlaces(() => storage).isArrival(hub("hub-b"))).toBe(true);
  });

  it("should read whatever the storage holds that is not a place as nothing kept", () => {
    const storage = tabStorage();
    keptPlaces(() => storage).isArrival(hub());
    for (const key of storage.items.keys()) storage.items.set(key, "{not a place");

    expect(keptPlaces(() => storage).isArrival(hub())).toBe(true);
  });

  it("should keep each tab's place to itself", () => {
    const tabA = keptPlaces(() => tabStorage());
    const tabB = keptPlaces(() => tabStorage());
    tabA.isArrival(hub());

    expect(tabB.isArrival(hub())).toBe(true);
    expect(tabA.isArrival(hub())).toBe(false);
  });
});

describe("the menu forgets the kept place (FS-PQ2TW R7)", () => {
  it("should read the same town after the forget as an arrival", () => {
    const places = keptPlaces(() => tabStorage());
    places.isArrival(hub());

    places.forget();

    expect(places.isArrival(hub())).toBe(true);
  });

  it("should read the same town as an arrival after a forget and a refresh", () => {
    const storage = tabStorage();
    const before = keptPlaces(() => storage);
    before.isArrival(hub());
    before.forget();

    expect(keptPlaces(() => storage).isArrival(hub())).toBe(true);
  });

  it("should forget before anything was asked, and still read the first place as an arrival", () => {
    const storage = tabStorage();
    keptPlaces(() => storage).isArrival(hub());
    const afterRefresh = keptPlaces(() => storage);

    afterRefresh.forget();

    expect(afterRefresh.isArrival(hub())).toBe(true);
  });
});

describe("session storage unavailable or throwing (FS-PQ2TW Edge States)", () => {
  const throwing = (on: "getItem" | "setItem" | "removeItem" | "access") => (): PlaceStore => {
    if (on === "access") throw new Error("SecurityError: storage is disabled");
    const storage = tabStorage();
    storage[on] = () => {
      throw new Error("QuotaExceededError");
    };
    return storage;
  };

  it.each(["getItem", "setItem", "removeItem", "access"] as const)(
    "should let no error escape when %s throws, and still tell a socket reconnect from memory",
    (on) => {
      const places = keptPlaces(throwing(on));

      expect(places.isArrival(hub())).toBe(true);
      expect(places.isArrival(hub())).toBe(false);
      expect(() => places.forget()).not.toThrow();
      expect(places.isArrival(hub())).toBe(true);
    },
  );

  it("should read the first place as an arrival with no storage at all, and tell a reconnect from memory", () => {
    const places = keptPlaces(() => undefined);

    expect(places.isArrival(run())).toBe(true);
    expect(places.isArrival(run())).toBe(false);
  });
});

describe("no world scene reads the kept place (FS-PQ2TW R8; ADR-0075 Decision 4)", () => {
  const scenes = join(process.cwd(), "src", "scenes");
  const sources = readdirSync(scenes)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".standin.ts"))
    .map((f) => ({ file: f, text: readFileSync(join(scenes, f), "utf8") }));

  it("should be imported by no scene but the main menu, and by the menu for the forget alone", () => {
    const importers = sources
      .map(({ file, text }) => ({ file, imports: text.match(/import\s*\{([^}]*)\}\s*from\s*"[^"]*components\/arrival"/) }))
      .filter(({ imports }) => imports)
      .map(({ file, imports }) => ({ file, names: imports![1].split(",").map((n) => n.trim()).filter(Boolean) }));

    expect(importers).toEqual([{ file: "MainMenuScene.ts", names: ["forgetPlace"] }]);
  });
});
