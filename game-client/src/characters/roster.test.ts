import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import {
  ACTIVE_CHARACTER_KEY,
  LEGACY_ACTIVE_SLOT_KEY,
  LEGACY_SLOTS_KEY,
  loadRoster,
  type KeyValueStore,
  type RosterApi,
  type ServerCharacter,
} from "./roster";

const apiError = (status: number, code: string) =>
  new ApiError({ status, code, detail: "server prose", errors: [] });

function memoryStorage(seed: Record<string, string> = {}): KeyValueStore & {
  data: Record<string, string>;
} {
  const data = { ...seed };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

let minted = 0;
const server = (name: string, cls = "warrior"): ServerCharacter => ({
  id: `00000000-0000-4000-8000-${String(++minted).padStart(12, "0")}`,
  name,
  class: cls,
  level: 1,
  experience: 0,
  levelFloor: 0,
  nextLevelAt: 100,
  createdAt: "2026-10-08T12:00:00Z",
});

const local = (name: string, className = "warrior") => ({
  id: `char_${name.toLowerCase()}`,
  name,
  className,
  level: 1,
  createdAt: 1,
});

/** An api over a server-side list; `create` answers from a script, defaulting to success. */
function fakeApi(
  existing: ServerCharacter[] = [],
  answers: (Error | undefined)[] = [],
) {
  const created: { name: string; className: string }[] = [];
  const api: RosterApi = {
    listCharacters: async () => [...existing],
    createCharacter: async (name, className) => {
      created.push({ name, className });
      const answer = answers.shift();
      if (answer) throw answer;
      const c = server(name, className);
      existing.push(c);
      return c;
    },
  };
  return { api, created };
}

describe("loadRoster import (FS-BDA7X req 40)", () => {
  it("should create a client-minted character once and swap in the server record", async () => {
    const storage = memoryStorage({
      [LEGACY_SLOTS_KEY]: JSON.stringify([local("Kaelen", "mage"), null, null]),
    });
    const { api, created } = fakeApi();

    const roster = await loadRoster(api, storage);

    expect(created).toEqual([{ name: "Kaelen", className: "mage" }]);
    expect(roster.characters).toHaveLength(1);
    expect(roster.characters[0].name).toBe("Kaelen");
    expect(roster.characters[0].id).not.toMatch(/^char_/);
    expect(storage.getItem(LEGACY_SLOTS_KEY)).toBeNull();

    // A second load finds nothing left to import.
    await loadRoster(api, storage);
    expect(created).toHaveLength(1);
  });

  it("should import in slot order and drop a taken name with a notice", async () => {
    const storage = memoryStorage({
      [LEGACY_SLOTS_KEY]: JSON.stringify([
        local("Aldric"),
        local("Brynn", "archer"),
        local("Cale"),
      ]),
    });
    const { api, created } = fakeApi(
      [],
      [undefined, apiError(409, "ALREADY_EXISTS")],
    );

    const roster = await loadRoster(api, storage);

    expect(created.map((c) => c.name)).toEqual(["Aldric", "Brynn", "Cale"]);
    expect(roster.characters.map((c) => c.name)).toEqual(["Aldric", "Cale"]);
    expect(roster.notices).toHaveLength(1);
    expect(roster.notices[0]).toContain("Brynn");
    expect(storage.getItem(LEGACY_SLOTS_KEY)).toBeNull();
  });

  it.each([
    ["the gateway is down (503)", apiError(503, "SERVICE_UNAVAILABLE")],
    ["the network fails", new TypeError("Failed to fetch")],
  ])(
    "should keep the entries and retry next load when %s",
    async (_label, failure) => {
      const storage = memoryStorage({
        [LEGACY_SLOTS_KEY]: JSON.stringify([
          local("Aldric"),
          local("Brynn"),
          local("Cale"),
        ]),
      });
      const { api, created } = fakeApi([], [undefined, failure]);

      const first = await loadRoster(api, storage);

      // Brynn failed, so Cale waits too: the import keeps slot order.
      expect(created.map((c) => c.name)).toEqual(["Aldric", "Brynn"]);
      expect(first.characters.map((c) => c.name)).toEqual(["Aldric"]);
      expect(first.notices).toEqual([]);

      const second = await loadRoster(api, storage);

      expect(created.map((c) => c.name)).toEqual([
        "Aldric",
        "Brynn",
        "Brynn",
        "Cale",
      ]);
      expect(second.characters.map((c) => c.name)).toEqual([
        "Aldric",
        "Brynn",
        "Cale",
      ]);
      expect(storage.getItem(LEGACY_SLOTS_KEY)).toBeNull();
    },
  );

  it("should not recreate a local character the server already has by name, in any case", async () => {
    // A create that landed but whose answer was lost: the next load finds it listed.
    const kept = server("kaelen");
    const storage = memoryStorage({
      [LEGACY_SLOTS_KEY]: JSON.stringify([local("Kaelen")]),
    });
    const { api, created } = fakeApi([kept]);

    const roster = await loadRoster(api, storage);

    expect(created).toEqual([]);
    expect(roster.characters.map((c) => c.id)).toEqual([kept.id]);
    expect(roster.notices).toEqual([]);
    expect(storage.getItem(LEGACY_SLOTS_KEY)).toBeNull();
  });
});

describe("loadRoster active character (FS-BDA7X req 39)", () => {
  it("should keep the remembered active character when the server still lists it", async () => {
    const a = server("Aldric");
    const b = server("Brynn");
    const storage = memoryStorage({ [ACTIVE_CHARACTER_KEY]: b.id });

    const roster = await loadRoster(fakeApi([a, b]).api, storage);

    expect(roster.activeId).toBe(b.id);
  });

  it.each([
    ["a deleted or foreign id", "00000000-0000-4000-8000-999999999999"],
    ["a client-minted id", "char_old"],
  ])(
    "should fall back to the oldest character for %s, and remember it",
    async (_l, stale) => {
      const a = server("Aldric");
      const storage = memoryStorage({ [ACTIVE_CHARACTER_KEY]: stale });

      const roster = await loadRoster(
        fakeApi([a, server("Brynn")]).api,
        storage,
      );

      expect(roster.activeId).toBe(a.id);
      expect(storage.getItem(ACTIVE_CHARACTER_KEY)).toBe(a.id);
    },
  );

  it("should have no active character, and remember none, when the member has none", async () => {
    const storage = memoryStorage({ [ACTIVE_CHARACTER_KEY]: "char_old" });

    const roster = await loadRoster(fakeApi([]).api, storage);

    expect(roster).toEqual({ characters: [], activeId: null, notices: [] });
    expect(storage.getItem(ACTIVE_CHARACTER_KEY)).toBeNull();
  });

  it("should make the imported legacy active slot the active character", async () => {
    const storage = memoryStorage({
      [LEGACY_SLOTS_KEY]: JSON.stringify([
        local("Aldric"),
        null,
        local("Cale"),
      ]),
      [LEGACY_ACTIVE_SLOT_KEY]: "2",
    });

    const roster = await loadRoster(fakeApi([]).api, storage);

    const cale = roster.characters.find((c) => c.name === "Cale");
    expect(roster.activeId).toBe(cale?.id);
    expect(storage.getItem(ACTIVE_CHARACTER_KEY)).toBe(cale?.id);
    expect(storage.getItem(LEGACY_ACTIVE_SLOT_KEY)).toBeNull();
  });
});
