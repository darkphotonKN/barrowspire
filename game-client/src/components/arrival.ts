/**
 * Whether a `world_entered` is an arrival or a return (FS-PQ2TW §A R5–R8, ADR-0073 Decisions 2, 4).
 *
 * The server sends the same `world_entered` on entering a world and on a reconnect or a refresh
 * into it, with no flag (FS-PQ2TW Facts 3, 4), so the client keeps the last place it was in: world
 * type, session id, and field id for a field. A `world_entered` naming that place is a return; any
 * other is an arrival. The place is kept in memory and, so it survives a page refresh, in the tab's
 * session storage. Storage that is missing or throws leaves memory alone to tell a reconnect; a
 * refresh then reads as an arrival (FS-PQ2TW Edge States).
 *
 * Asked once, at the world switch (`switchWorld`), never by a scene. `gameStore`'s world cannot
 * stand in for the kept place: `SocketManager` overwrites it before the switch runs.
 */

import type { WorldEnteredPayload } from "@/assets/types/client";

/** The slice of the tab's session storage the kept place lives in. `Storage` is one. */
export interface PlaceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Where the kept place lives in the tab's session storage. */
const PLACE_KEY = "barrowspire.arrival.place";

export interface KeptPlace {
  /** True unless the payload names the kept place; keeps the payload's place either way. */
  isArrival(payload: WorldEnteredPayload): boolean;
  /** Forgets the kept place, so the next world entered is an arrival (FS-PQ2TW R7). */
  forget(): void;
}

/** The place a payload names, as it is kept: its world type, session, and field for a field. */
const placeOf = (p: WorldEnteredPayload): string =>
  JSON.stringify([p.world_type, p.session_id, p.world_type === "field" ? (p.field ?? null) : null]);

/**
 * A kept place over the storage `store` hands out, read when first asked. `store` is a getter
 * because reaching the storage can itself throw (a browser that blocks site data).
 */
export function keptPlaces(store: () => PlaceStore | null | undefined): KeptPlace {
  /** The kept place; `undefined` until the storage has been read. */
  let kept: string | null | undefined;

  const withStore = <T>(act: (s: PlaceStore) => T): T | undefined => {
    try {
      const s = store();
      return s ? act(s) : undefined;
    } catch {
      return undefined;
    }
  };

  return {
    isArrival(payload) {
      if (kept === undefined) kept = withStore((s) => s.getItem(PLACE_KEY)) ?? null;
      const place = placeOf(payload);
      const arrival = place !== kept;
      kept = place;
      withStore((s) => s.setItem(PLACE_KEY, place));
      return arrival;
    },
    forget() {
      kept = null;
      withStore((s) => s.removeItem(PLACE_KEY));
    },
  };
}

/** The tab's session storage; none while Next renders on the server. */
const tabStorage = (): PlaceStore | undefined =>
  typeof window === "undefined" ? undefined : window.sessionStorage;

/** The page's kept place, asked by the world switch alone. */
export const arrivals = keptPlaces(tabStorage);

/** The main menu's one use of the kept place: "ENTER THE TOWN" forgets it (FS-PQ2TW R7). */
export function forgetPlace(): void {
  arrivals.forget();
}
