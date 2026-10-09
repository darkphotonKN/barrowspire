import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import {
  ACTIVE_CHARACTER_KEY,
  LEGACY_SLOTS_KEY,
  type KeyValueStore,
  type ServerCharacter,
} from "@/characters/roster";
import { createGameStore, type CharacterApi } from "./gameStore";

const apiError = (status: number, code: string) =>
  new ApiError({ status, code, detail: "server prose", errors: [] });

function memoryStorage(seed: Record<string, string> = {}) {
  const data: Record<string, string> = { ...seed };
  const storage: KeyValueStore = {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
  return { storage, data };
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

/** A gateway over an in-memory list of the member's characters. */
function fakeApi(existing: ServerCharacter[] = []) {
  const calls: string[] = [];
  let failNext: Error | undefined;
  const api: CharacterApi = {
    listCharacters: async () => {
      calls.push("list");
      return [...existing];
    },
    createCharacter: async (name, className) => {
      calls.push(`create ${name}`);
      if (failNext) {
        const e = failNext;
        failNext = undefined;
        throw e;
      }
      const c = server(name, className);
      existing.push(c);
      return c;
    },
    deleteCharacter: async (id) => {
      calls.push(`delete ${id}`);
      if (failNext) {
        const e = failNext;
        failNext = undefined;
        throw e;
      }
      const i = existing.findIndex((c) => c.id === id);
      if (i === -1) throw apiError(404, "NOT_FOUND");
      existing.splice(i, 1);
    },
  };
  return { api, calls, existing, fail: (e: Error) => (failNext = e) };
}

describe("gameStore characters (FS-BDA7X req 39-40)", () => {
  it("should load the server list and pick the oldest when none is active", async () => {
    const a = server("Aldric");
    const { api } = fakeApi([a]);
    const { storage } = memoryStorage();
    const store = createGameStore({ api, storage: () => storage });

    await store.getState().loadCharacters();

    expect(store.getState().rosterStatus).toBe("ready");
    expect(store.getState().characters.map((c) => c.id)).toEqual([a.id]);
    expect(store.getState().getActiveCharacter()?.id).toBe(a.id);
  });

  it("should import once when two loads race", async () => {
    const { api, calls } = fakeApi();
    const { storage } = memoryStorage({
      [LEGACY_SLOTS_KEY]: JSON.stringify([
        {
          id: "char_a",
          name: "Aldric",
          className: "warrior",
          level: 1,
          createdAt: 1,
        },
      ]),
    });
    const store = createGameStore({ api, storage: () => storage });

    await Promise.all([
      store.getState().loadCharacters(),
      store.getState().loadCharacters(),
    ]);

    expect(calls.filter((c) => c.startsWith("create"))).toEqual([
      "create Aldric",
    ]);
    expect(store.getState().characters).toHaveLength(1);
  });

  it("should hand the import's notices to the menu once", async () => {
    const { api, fail } = fakeApi();
    fail(apiError(409, "ALREADY_EXISTS"));
    const { storage } = memoryStorage({
      [LEGACY_SLOTS_KEY]: JSON.stringify([
        {
          id: "char_a",
          name: "Aldric",
          className: "warrior",
          level: 1,
          createdAt: 1,
        },
      ]),
    });
    const store = createGameStore({ api, storage: () => storage });

    await store.getState().loadCharacters();

    expect(store.getState().takeRosterNotices()).toHaveLength(1);
    expect(store.getState().takeRosterNotices()).toEqual([]);
  });

  it("should say the roster is unreachable when the list fails, and keep no characters", async () => {
    const { api } = fakeApi();
    api.listCharacters = async () => {
      throw apiError(503, "SERVICE_UNAVAILABLE");
    };
    const { storage } = memoryStorage();
    const store = createGameStore({ api, storage: () => storage });

    await store.getState().loadCharacters();

    expect(store.getState().rosterStatus).toBe("unreachable");
    expect(store.getState().getActiveCharacter()).toBeNull();
  });

  it("should remember only the chosen character's id", async () => {
    const a = server("Aldric");
    const b = server("Brynn");
    const { api } = fakeApi([a, b]);
    const { storage, data } = memoryStorage();
    const store = createGameStore({ api, storage: () => storage });
    await store.getState().loadCharacters();

    store.getState().selectCharacter(b.id);

    expect(store.getState().getActiveCharacter()?.id).toBe(b.id);
    expect(data).toEqual({ [ACTIVE_CHARACTER_KEY]: b.id });

    // A fresh store (a reload) comes back to the same character.
    const reloaded = createGameStore({ api, storage: () => storage });
    await reloaded.getState().loadCharacters();
    expect(reloaded.getState().getActiveCharacter()?.id).toBe(b.id);
  });

  it("should ignore a selection the roster does not hold", async () => {
    const a = server("Aldric");
    const { api } = fakeApi([a]);
    const { storage } = memoryStorage();
    const store = createGameStore({ api, storage: () => storage });
    await store.getState().loadCharacters();

    store.getState().selectCharacter("char_old");

    expect(store.getState().activeCharacterId).toBe(a.id);
  });

  it("should create on the server and make the new character active", async () => {
    const { api, calls } = fakeApi([server("Aldric")]);
    const { storage, data } = memoryStorage();
    const store = createGameStore({ api, storage: () => storage });
    await store.getState().loadCharacters();

    const made = await store.getState().createCharacter("Brynn", "archer");

    expect(calls).toContain("create Brynn");
    expect(made.className).toBe("archer");
    expect(store.getState().characters.map((c) => c.name)).toEqual([
      "Aldric",
      "Brynn",
    ]);
    expect(store.getState().activeCharacterId).toBe(made.id);
    expect(data[ACTIVE_CHARACTER_KEY]).toBe(made.id);
  });

  it("should let a taken name's refusal reach the caller and change nothing", async () => {
    const { api, fail } = fakeApi();
    fail(apiError(409, "ALREADY_EXISTS"));
    const { storage } = memoryStorage();
    const store = createGameStore({ api, storage: () => storage });

    const err = await store
      .getState()
      .createCharacter("Aldric", "warrior")
      .catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(store.getState().characters).toEqual([]);
  });

  it("should delete on the server and move the active character to the oldest left", async () => {
    const a = server("Aldric");
    const b = server("Brynn");
    const { api, existing } = fakeApi([a, b]);
    const { storage, data } = memoryStorage();
    const store = createGameStore({ api, storage: () => storage });
    await store.getState().loadCharacters();
    store.getState().selectCharacter(b.id);

    await store.getState().deleteCharacter(b.id);

    expect(existing.map((c) => c.id)).toEqual([a.id]);
    expect(store.getState().characters.map((c) => c.id)).toEqual([a.id]);
    expect(data[ACTIVE_CHARACTER_KEY]).toBe(a.id);
  });

  it("should treat a delete answered 404 as already gone", async () => {
    const a = server("Aldric");
    const { api, existing } = fakeApi([a]);
    const { storage, data } = memoryStorage();
    const store = createGameStore({ api, storage: () => storage });
    await store.getState().loadCharacters();
    existing.length = 0; // deleted from another tab

    await store.getState().deleteCharacter(a.id);

    expect(store.getState().characters).toEqual([]);
    expect(data[ACTIVE_CHARACTER_KEY]).toBeUndefined();
  });

  it("should keep the character when the delete fails otherwise", async () => {
    const a = server("Aldric");
    const { api, fail } = fakeApi([a]);
    const { storage } = memoryStorage();
    const store = createGameStore({ api, storage: () => storage });
    await store.getState().loadCharacters();
    fail(apiError(503, "SERVICE_UNAVAILABLE"));

    await expect(store.getState().deleteCharacter(a.id)).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(store.getState().characters.map((c) => c.id)).toEqual([a.id]);
  });
});
