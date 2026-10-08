/**
 * The member's characters are server records (FS-BDA7X req 39). This module reads them and,
 * once, carries any characters the client minted on its own before that into the server
 * (req 40). The api and storage are injected so the import's order and outcomes are testable
 * without a browser or a gateway.
 *
 * localStorage keeps only the active character id, a convenience; the list itself always
 * comes from the server.
 */

import type { components } from "@/api/generated/schema";
import type { ClassKey } from "@/data/classLore";
import { ApiError } from "@/utils/apiError";

export type ServerCharacter = components["schemas"]["Character"];

/** A character as the menus show it. `id` is always a server id (a uuid), never `char_…`. */
export interface Character {
  id: string;
  name: string;
  className: ClassKey;
  level: number;
  experience: number;
  levelFloor: number;
  /** Absent at the level cap. */
  nextLevelAt?: number;
  createdAt: string;
}

export interface RosterApi {
  listCharacters(): Promise<ServerCharacter[]>;
  createCharacter(name: string, className: string): Promise<ServerCharacter>;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The one thing kept locally: which of the member's characters was last chosen. */
export const ACTIVE_CHARACTER_KEY = "barrowspire_active_character_id";
/** Where the client used to keep whole characters; read only by the one-time import. */
export const LEGACY_SLOTS_KEY = "barrowspire_character_slots";
export const LEGACY_ACTIVE_SLOT_KEY = "barrowspire_active_slot";

export interface Roster {
  characters: Character[];
  activeId: string | null;
  /** Things the delver must be told, e.g. a local character whose name was taken. */
  notices: string[];
}

export function fromServer(c: ServerCharacter): Character {
  return {
    id: c.id,
    name: c.name,
    className: c.class as ClassKey,
    level: c.level,
    experience: c.experience,
    levelFloor: c.levelFloor,
    nextLevelAt: c.nextLevelAt,
    createdAt: c.createdAt,
  };
}

interface LocalCharacter {
  id: string;
  name: string;
  className: string;
}

function readLegacySlots(storage: KeyValueStore): (LocalCharacter | null)[] {
  try {
    const raw = storage.getItem(LEGACY_SLOTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // A malformed entry has nothing to carry over; it becomes a hole like an imported one.
    return parsed.map((e: Partial<LocalCharacter> | null) =>
      e && typeof e.name === "string" && typeof e.className === "string"
        ? (e as LocalCharacter)
        : null,
    );
  } catch {
    return [];
  }
}

/** Reads the member's characters, importing any local-only ones first. */
export async function loadRoster(
  api: RosterApi,
  storage: KeyValueStore,
): Promise<Roster> {
  const characters = (await api.listCharacters()).map(fromServer);
  const slots = readLegacySlots(storage);
  const legacyActive = Number(storage.getItem(LEGACY_ACTIVE_SLOT_KEY) ?? 0);
  const notices: string[] = [];
  let importedActiveId: string | undefined;

  for (let i = 0; i < slots.length; i++) {
    const entry = slots[i];
    if (!entry) continue;
    // Already on the server: a create that landed but whose answer never came back.
    let landed = characters.find((c) => sameName(c.name, entry.name));
    if (!landed) {
      try {
        landed = fromServer(
          await api.createCharacter(entry.name, entry.className),
        );
        characters.push(landed);
      } catch (err) {
        const notice = importRefusal(err, entry.name);
        // Unreachable: keep this entry and every later one, so the next load imports them in
        // the same order.
        if (notice === undefined) break;
        notices.push(notice);
      }
    }
    if (landed && i === legacyActive) importedActiveId = landed.id;
    slots[i] = null;
  }

  writeLegacySlots(storage, slots);

  const remembered = importedActiveId ?? storage.getItem(ACTIVE_CHARACTER_KEY);
  const activeId = characters.some((c) => c.id === remembered)
    ? (remembered as string)
    : (characters[0]?.id ?? null);
  rememberActive(storage, activeId);

  return { characters, activeId, notices };
}

/** Keeps the active character id, the one thing localStorage still holds (req 39). */
export function rememberActive(
  storage: KeyValueStore,
  id: string | null,
): void {
  if (id === null) storage.removeItem(ACTIVE_CHARACTER_KEY);
  else storage.setItem(ACTIVE_CHARACTER_KEY, id);
}

/** Names are unique case-insensitively (FS-BDA7X req 3). */
const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The notice for a local character the server will never take, or undefined when the failure
 * is worth retrying (the gateway or network is down, or the server faltered).
 */
function importRefusal(err: unknown, name: string): string | undefined {
  if (!(err instanceof ApiError)) return undefined;
  if (err.status === 409) return nameTakenOnImport(name);
  if (err.status === 400 || err.status === 422) return refusedOnImport(name);
  return undefined;
}

function writeLegacySlots(
  storage: KeyValueStore,
  slots: (LocalCharacter | null)[],
): void {
  if (slots.every((s) => s === null)) {
    storage.removeItem(LEGACY_SLOTS_KEY);
    storage.removeItem(LEGACY_ACTIVE_SLOT_KEY);
    return;
  }
  // Imported entries become holes, so the legacy active slot index still points where it did.
  storage.setItem(LEGACY_SLOTS_KEY, JSON.stringify(slots));
}

const nameTakenOnImport = (name: string) =>
  `Another delver already bears the name ${name}. Raise them anew under another.`;

const refusedOnImport = (name: string) =>
  `The ledger would not take ${name}. Raise them anew.`;
