import { createStore, type StoreApi } from "zustand";
import type { KeyValueStore } from "@/characters/roster";
import {
  LETTER_CRUMBLED,
  afterRead,
  afterTake,
  initialLetter,
  isNewerLetter,
  takeOutcome,
  untaken,
  withoutLetter,
  type ClaimedLetter,
  type Letter,
  type MailboxSummary,
} from "@/mailbox/mailbox";
import { useAuthStore } from "@/stores/authStore";
import { apiClient } from "@/utils/api";
import { ApiError } from "@/utils/apiError";

/**
 * The mailbox the town's envelope and letter panel draw from (FS-1GZGD R34–R40; A4, ADR-0045).
 *
 * The summary is fetched on exactly three occasions: entering the town, a `mail_arrived` while in
 * the town (the socket hands it here), and opening the panel. Never on a timer, never outside the
 * town: a `mail_arrived` there is dropped, and the next town entry makes up for it (R44). The
 * summary is the truth; the push is only a hint to look.
 *
 * The pulse (R35) compares the newest letter's time with the last one this player saw, kept per
 * player in browser storage. Every storage access is guarded: without storage the value lives
 * for the session only, and the first summary records it without pulsing.
 */

/** What the store needs from the gateway's mailbox routes (API surface). */
export interface MailboxApi {
  summary(): Promise<MailboxSummary>;
  letters(): Promise<Letter[]>;
  markRead(letterId: string): Promise<void>;
  /** Takes every enclosure of the letter at once (R39); refused with a problem `code`. */
  claim(letterId: string): Promise<ClaimedLetter>;
}

export interface MailboxStoreDeps {
  api: MailboxApi;
  /** Read lazily and may throw (a private window, blocked site data); null when there is none. */
  storage: () => KeyValueStore | null;
  /** Whose mailbox this is: the last-seen value is kept per player. */
  memberId: () => string | undefined;
}

/** Where the letters stand: not read yet, being read, read, or unreadable. */
export type LettersStatus = "idle" | "loading" | "ready" | "unreachable";

export interface MailboxState {
  /** The player stands in the town: only then does a `mail_arrived` fetch anything. */
  inTown: boolean;
  /** The last summary fetched, adjusted at once as letters are read; null before the first. */
  summary: MailboxSummary | null;
  /** Bumped once for each pulse the envelope should play (R35). */
  pulses: number;

  panelOpen: boolean;
  /** The mailbox as the last opening read it, newest first, adjusted as letters are read. */
  letters: Letter[];
  lettersStatus: LettersStatus;
  selectedId: string | null;
  /** A line shown in place of the open letter: the crumbled letter's (R39). */
  notice: string | null;
  /** The letter whose Take is in flight: its button says "Taking…" and nothing else is sent. */
  taking: string | null;
  /** The last refused Take's warning line, on the letter it was refused for (R39). */
  takeWarning: { letterId: string; text: string } | null;

  /** The town was entered (or entered again, from a delve or a field): fetch the summary. */
  enterTown: () => Promise<void>;
  /** The town was left: the panel closes with it, and `mail_arrived` is dropped from now on. */
  leaveTown: () => void;
  /** A `mail_arrived` from the game server: fetch the summary if the player is in the town. */
  arrived: () => Promise<void>;
  /** Opens the panel: fetches the summary and the letters, and opens the first unread (R38). */
  openPanel: () => Promise<void>;
  closePanel: () => void;
  /** Opens one letter, marking it read (R38). */
  select: (letterId: string) => Promise<void>;
  /** The Take button: claims every enclosure of the letter at once, one claim at a time (R39). */
  take: (letterId: string) => Promise<void>;
}

/** Where the newest letter time this player last saw is kept (R35). */
export function lastSeenKey(memberId: string): string {
  return `barrowspire:mailbox:last-seen:${memberId}`;
}

export function createMailboxStore({
  api,
  storage,
  memberId,
}: MailboxStoreDeps): StoreApi<MailboxState> {
  /** The session's own last-seen values, per player: the fallback when storage is unavailable. */
  const seenInSession = new Map<string, string>();
  /** Only the latest summary request is applied, so an earlier answer arriving late is dropped. */
  let summaryRequest = 0;

  const readSeen = (key: string): string | null => {
    try {
      return storage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const writeSeen = (key: string, value: string) => {
    try {
      storage()?.setItem(key, value);
    } catch {
      // the session's own copy carries on
    }
  };

  return createStore<MailboxState>()((set, get) => {
    /** Pulses for a newer letter than the player last saw, and records it either way. */
    const recordNewest = (newest: string | undefined) => {
      const id = memberId();
      if (!newest || !id) return;
      const key = lastSeenKey(id);
      const seen = readSeen(key) ?? seenInSession.get(key) ?? null;
      if (isNewerLetter(newest, seen)) set({ pulses: get().pulses + 1 });
      if (
        !seen ||
        isNewerLetter(newest, seen) ||
        Number.isNaN(Date.parse(seen))
      ) {
        seenInSession.set(key, newest);
        writeSeen(key, newest);
      }
    };

    const fetchSummary = async () => {
      const request = ++summaryRequest;
      let summary: MailboxSummary;
      try {
        summary = await api.summary();
      } catch (err) {
        console.warn("mailbox summary unavailable", err);
        return;
      }
      if (request !== summaryRequest) return;
      set({ summary });
      recordNewest(summary.newestLetterAt);
    };

    /** The letter has expired: it leaves the list and the counts, and the panel says so. */
    const crumble = (letterId: string) => {
      const letter = get().letters.find((l) => l.id === letterId);
      if (!letter) return;
      const summary = get().summary;
      set({
        letters: get().letters.filter((l) => l.id !== letterId),
        summary: summary && withoutLetter(summary, letter),
        selectedId: get().selectedId === letterId ? null : get().selectedId,
        notice: LETTER_CRUMBLED,
      });
    };

    const select = async (letterId: string) => {
      const letter = get().letters.find((l) => l.id === letterId);
      if (!letter) return;
      set({ selectedId: letterId, notice: null, takeWarning: null });
      if (letter.read) return;

      const summary = get().summary;
      set({
        letters: get().letters.map((l) =>
          l.id === letterId ? { ...l, read: true } : l,
        ),
        summary: summary && afterRead(summary, letter),
      });
      try {
        await api.markRead(letterId);
      } catch (err) {
        if (err instanceof ApiError && err.code === "LETTER_EXPIRED")
          crumble(letterId);
        // anything else: the next summary fetch is the truth
        else console.warn("marking a letter read failed", err);
      }
    };

    /** The letter's enclosures are taken: it is read and claimed, and leaves the counts. */
    const taken = (letterId: string) => {
      const letter = get().letters.find((l) => l.id === letterId);
      if (!letter) return;
      const summary = get().summary;
      set({
        letters: get().letters.map((l) =>
          l.id === letterId
            ? { ...l, read: true, claimState: "claimed" as const }
            : l,
        ),
        summary: summary && afterTake(summary, letter),
      });
    };

    const take = async (letterId: string) => {
      const letter = get().letters.find((l) => l.id === letterId);
      if (!letter || !untaken(letter) || get().taking) return;
      set({ taking: letterId, takeWarning: null });
      try {
        await api.claim(letterId);
        taken(letterId);
      } catch (err) {
        const code = err instanceof ApiError ? err.code : undefined;
        const outcome = takeOutcome(code, letter);
        if (outcome.kind === "taken") taken(letterId);
        else if (outcome.kind === "crumbled") crumble(letterId);
        else {
          console.warn("taking a letter failed", err);
          set({ takeWarning: { letterId, text: outcome.warning } });
        }
      } finally {
        set({ taking: null });
      }
    };

    const loadLetters = async (): Promise<boolean> => {
      set({ lettersStatus: "loading" });
      try {
        const letters = await api.letters();
        set({ letters, lettersStatus: "ready" });
        return true;
      } catch (err) {
        console.warn("letters unavailable", err);
        set({ letters: [], lettersStatus: "unreachable" });
        return false;
      }
    };

    return {
      inTown: false,
      summary: null,
      pulses: 0,
      panelOpen: false,
      letters: [],
      lettersStatus: "idle",
      selectedId: null,
      notice: null,
      taking: null,
      takeWarning: null,

      enterTown: async () => {
        set({ inTown: true });
        await fetchSummary();
      },

      leaveTown: () =>
        set({
          inTown: false,
          panelOpen: false,
          selectedId: null,
          notice: null,
        }),

      arrived: async () => {
        if (!get().inTown) return;
        await fetchSummary();
      },

      openPanel: async () => {
        set({
          panelOpen: true,
          selectedId: null,
          notice: null,
          takeWarning: null,
        });
        // both settle before the first letter is marked read, so the summary it lowers is the
        // one this opening fetched rather than one overwritten by it
        const [, loaded] = await Promise.all([fetchSummary(), loadLetters()]);
        if (!loaded || !get().panelOpen) return;
        const first = initialLetter(get().letters);
        if (first) await select(first);
      },

      closePanel: () => set({ panelOpen: false }),

      select,
      take,
    };
  });
}

/** The app's mailbox: the real gateway, the browser's storage, the signed-in member. */
export const useMailboxStore = createMailboxStore({
  api: {
    summary: () => apiClient.getMailboxSummary(),
    letters: () => apiClient.listLetters(),
    markRead: (letterId) => apiClient.markLetterRead(letterId),
    claim: (letterId) => apiClient.claimLetter(letterId),
  },
  storage: () => (typeof window === "undefined" ? null : window.localStorage),
  memberId: () => useAuthStore.getState().memberInfo?.id,
});
