import { createStore, type StoreApi } from "zustand";
import { ClassKey } from "@/data/classLore";
import { WorldType } from "@/assets/types/client";
import { apiClient } from "@/utils/api";
import { ApiError } from "@/utils/apiError";
import {
  fromServer,
  loadRoster,
  rememberActive,
  type Character,
  type KeyValueStore,
  type RosterApi,
} from "@/characters/roster";

export type { Character } from "@/characters/roster";

/** What the store needs from the gateway's character routes (FS-BDA7X req 39). */
export interface CharacterApi extends RosterApi {
  deleteCharacter(characterId: string): Promise<void>;
}

export interface GameStoreDeps {
  api: CharacterApi;
  /** Read lazily: there is no localStorage while Next renders on the server. */
  storage: () => KeyValueStore;
}

/**
 * Where the roster stands: not read yet, being read, read, or unreadable (the gateway or
 * character-service is down). Only `ready` means an empty roster is really empty.
 */
export type RosterStatus = "idle" | "loading" | "ready" | "unreachable";

interface GameState {
  /** The world the player is currently in, or null before entering one. */
  sessionId: string | null;
  worldType: WorldType | null;

  /** The member's live characters, oldest first, from the server. */
  characters: Character[];
  /** Always one of `characters`' ids, or null when there are none. */
  activeCharacterId: string | null;
  rosterStatus: RosterStatus;
  /** Notices from the last load (a local character whose name was taken), not yet shown. */
  rosterNotices: string[];

  /** Set together: the world's id is meaningless without knowing its kind. */
  setWorld: (id: string, worldType: WorldType) => void;
  /** Reads the roster from the server, importing any local-only characters first (req 40). */
  loadCharacters: () => Promise<void>;
  selectCharacter: (id: string) => void;
  /** Creates on the server and makes it active. Throws the gateway's ApiError (409: name taken). */
  createCharacter: (name: string, className: ClassKey) => Promise<Character>;
  /** Deletes on the server. Throws the gateway's ApiError, except 404 (already gone). */
  deleteCharacter: (id: string) => Promise<void>;
  /** The pending notices, handed over once. */
  takeRosterNotices: () => string[];
  getActiveCharacter: () => Character | null;
}

export function createGameStore({
  api,
  storage,
}: GameStoreDeps): StoreApi<GameState> {
  // One load at a time: two racing loads would each import the same local characters.
  let loading: Promise<void> | undefined;

  return createStore<GameState>()((set, get) => {
    /** Sets the active character and keeps its id locally. */
    const activate = (id: string | null) => {
      rememberActive(storage(), id);
      set({ activeCharacterId: id });
    };

    const load = async () => {
      set({ rosterStatus: "loading" });
      try {
        const roster = await loadRoster(api, storage());
        set({
          characters: roster.characters,
          activeCharacterId: roster.activeId,
          rosterStatus: "ready",
          rosterNotices: [...get().rosterNotices, ...roster.notices],
        });
      } catch (err) {
        console.error("Failed to load characters", err);
        set({ rosterStatus: "unreachable" });
      }
    };

    return {
      sessionId: null,
      worldType: null,
      characters: [],
      activeCharacterId: null,
      rosterStatus: "idle",
      rosterNotices: [],

      setWorld: (id, worldType) => set({ sessionId: id, worldType }),

      loadCharacters: () => {
        loading ??= load().finally(() => {
          loading = undefined;
        });
        return loading;
      },

      selectCharacter: (id) => {
        if (!get().characters.some((c) => c.id === id)) return;
        activate(id);
      },

      createCharacter: async (name, className) => {
        const made = fromServer(
          await api.createCharacter(name.trim(), className),
        );
        set({ characters: [...get().characters, made] });
        activate(made.id);
        return made;
      },

      deleteCharacter: async (id) => {
        try {
          await api.deleteCharacter(id);
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 404)) throw err;
        }
        const characters = get().characters.filter((c) => c.id !== id);
        set({ characters });
        if (get().activeCharacterId === id) activate(characters[0]?.id ?? null);
      },

      takeRosterNotices: () => {
        const notices = get().rosterNotices;
        set({ rosterNotices: [] });
        return notices;
      },

      getActiveCharacter: () => {
        const { characters, activeCharacterId } = get();
        return characters.find((c) => c.id === activeCharacterId) ?? null;
      },
    };
  });
}

const noStorage: KeyValueStore = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function browserStorage(): KeyValueStore {
  return typeof window === "undefined" ? noStorage : window.localStorage;
}

/** The app's game store. Only scenes and the socket read it, all through `getState()`. */
export const useGameStore = createGameStore({
  api: apiClient,
  storage: browserStorage,
});
