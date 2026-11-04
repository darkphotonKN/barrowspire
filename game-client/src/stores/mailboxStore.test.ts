import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/utils/apiError";
import type { KeyValueStore } from "@/characters/roster";
import type { Letter, MailboxSummary } from "@/mailbox/mailbox";
import { LETTER_CRUMBLED } from "@/mailbox/mailbox";
import {
  createMailboxStore,
  lastSeenKey,
  type MailboxApi,
} from "./mailboxStore";

// FS-1GZGD §Requirements R34, R35, R38, R40, R44; A4 (no timer). I-1GZGD-6: what fetches the
// summary, when the envelope pulses, and reading letters, against a faked gateway.

const ME = "member-1";
const T1 = "2026-11-04T10:00:00Z";
const T2 = "2026-11-04T11:00:00Z";

const summary = (over: Partial<MailboxSummary> = {}): MailboxSummary => ({
  unreadCount: 0,
  unclaimedCount: 0,
  waitingCount: 0,
  ...over,
});

const letter = (over: Partial<Letter> = {}): Letter => ({
  id: "l-1",
  title: "A word",
  body: "Rest well.",
  sender: "official",
  sentAt: T2,
  expiresAt: "2026-12-04T11:00:00Z",
  read: false,
  claimState: "none",
  enclosures: [],
  ...over,
});

function memoryStorage(
  initial: Record<string, string> = {},
): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
}

const brokenStorage: KeyValueStore = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

function fakeApi(start: MailboxSummary = summary(), letters: Letter[] = []) {
  const state = { summary: start, letters };
  const api = {
    summary: vi.fn(async () => state.summary),
    letters: vi.fn(async () => state.letters),
    markRead: vi.fn(async (_id: string) => undefined),
  } satisfies MailboxApi;
  return { api, state };
}

function setup(
  opts: {
    start?: MailboxSummary;
    letters?: Letter[];
    storage?: KeyValueStore | null;
  } = {},
) {
  const { api, state } = fakeApi(opts.start, opts.letters);
  const storage = opts.storage === undefined ? memoryStorage() : opts.storage;
  const store = createMailboxStore({
    api,
    storage: () => storage,
    memberId: () => ME,
  });
  return { store, api, state, storage };
}

/** Lets every pending promise in the store settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("mailbox store: fetching the summary (R34, A4)", () => {
  it("fetches the summary once on town entry", async () => {
    const { store, api } = setup({ start: summary({ waitingCount: 1 }) });
    await store.getState().enterTown();
    expect(api.summary).toHaveBeenCalledTimes(1);
    expect(store.getState().summary).toEqual(summary({ waitingCount: 1 }));
  });

  it("fetches once on a mail_arrived in the town", async () => {
    const { store, api } = setup();
    await store.getState().enterTown();
    api.summary.mockClear();
    await store.getState().arrived();
    expect(api.summary).toHaveBeenCalledTimes(1);
  });

  it("fetches nothing on a mail_arrived outside the town: before entering, or after leaving", async () => {
    const { store, api } = setup();
    await store.getState().arrived();
    expect(api.summary).not.toHaveBeenCalled();

    await store.getState().enterTown();
    store.getState().leaveTown();
    api.summary.mockClear();
    await store.getState().arrived();
    expect(api.summary).not.toHaveBeenCalled();
  });

  describe("no timer", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("never fetches again on its own, however long the player stands in the town", async () => {
      const { store, api } = setup();
      await store.getState().enterTown();
      await vi.advanceTimersByTimeAsync(30 * 60_000);
      expect(api.summary).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the last summary when a fetch fails", async () => {
    const { store, api } = setup({ start: summary({ waitingCount: 2 }) });
    await store.getState().enterTown();
    api.summary.mockRejectedValueOnce(new Error("down"));
    await store.getState().arrived();
    expect(store.getState().summary?.waitingCount).toBe(2);
  });

  it("applies only the latest of two overlapping fetches", async () => {
    const { store, api } = setup();
    let answerFirst!: (s: MailboxSummary) => void;
    api.summary
      .mockImplementationOnce(
        () => new Promise((resolve) => (answerFirst = resolve)),
      )
      .mockImplementationOnce(async () => summary({ waitingCount: 3 }));
    const first = store.getState().enterTown();
    await store.getState().arrived();
    answerFirst(summary({ waitingCount: 1 }));
    await first;
    expect(store.getState().summary?.waitingCount).toBe(3);
  });
});

describe("mailbox store: the pulse (R35)", () => {
  it("pulses when the newest letter is newer than the one this player last saw", async () => {
    const storage = memoryStorage({ [lastSeenKey(ME)]: T1 });
    const { store } = setup({
      start: summary({ waitingCount: 1, newestLetterAt: T2 }),
      storage,
    });
    await store.getState().enterTown();
    expect(store.getState().pulses).toBe(1);
    expect(storage.getItem(lastSeenKey(ME))).toBe(T2);
  });

  it("does not pulse again for the same letter", async () => {
    const storage = memoryStorage({ [lastSeenKey(ME)]: T2 });
    const { store } = setup({
      start: summary({ newestLetterAt: T2 }),
      storage,
    });
    await store.getState().enterTown();
    await store.getState().arrived();
    expect(store.getState().pulses).toBe(0);
  });

  it("records the first summary it ever sees without pulsing, then pulses for a newer one", async () => {
    const storage = memoryStorage();
    const { store, state } = setup({
      start: summary({ newestLetterAt: T1 }),
      storage,
    });
    await store.getState().enterTown();
    expect(store.getState().pulses).toBe(0);
    expect(storage.getItem(lastSeenKey(ME))).toBe(T1);

    state.summary = summary({ waitingCount: 1, newestLetterAt: T2 });
    await store.getState().arrived();
    expect(store.getState().pulses).toBe(1);
  });

  it("keeps the last seen value per player", () => {
    expect(lastSeenKey("a")).not.toBe(lastSeenKey("b"));
  });

  it("works on in a session whose storage throws: the first summary records, a newer one pulses", async () => {
    const { store, state } = setup({
      start: summary({ newestLetterAt: T1 }),
      storage: brokenStorage,
    });
    await expect(store.getState().enterTown()).resolves.toBeUndefined();
    expect(store.getState().pulses).toBe(0);

    state.summary = summary({ newestLetterAt: T2 });
    await store.getState().arrived();
    expect(store.getState().pulses).toBe(1);
  });

  it("works with no storage at all", async () => {
    const { store, state } = setup({
      start: summary({ newestLetterAt: T1 }),
      storage: null,
    });
    await store.getState().enterTown();
    state.summary = summary({ newestLetterAt: T2 });
    await store.getState().arrived();
    expect(store.getState().pulses).toBe(1);
  });

  it("does not pulse for an empty mailbox", async () => {
    const storage = memoryStorage({ [lastSeenKey(ME)]: T1 });
    const { store } = setup({ start: summary(), storage });
    await store.getState().enterTown();
    expect(store.getState().pulses).toBe(0);
    expect(storage.getItem(lastSeenKey(ME))).toBe(T1);
  });
});

describe("mailbox store: the letter panel (R36, R38, R40)", () => {
  const read = letter({ id: "newest", read: true, sentAt: T2 });
  const unread = letter({ id: "unread", read: false, sentAt: T1 });

  it("opening fetches the summary and the letters, and selects the first unread letter", async () => {
    const { store, api } = setup({
      start: summary({ unreadCount: 1, waitingCount: 1 }),
      letters: [read, unread],
    });
    await store.getState().enterTown();
    api.summary.mockClear();
    await store.getState().openPanel();

    expect(api.summary).toHaveBeenCalledTimes(1);
    expect(api.letters).toHaveBeenCalledTimes(1);
    expect(store.getState().panelOpen).toBe(true);
    expect(store.getState().lettersStatus).toBe("ready");
    expect(store.getState().selectedId).toBe("unread");
  });

  it("marks the selected letter read: its row dims and the seal lowers at once, without another fetch", async () => {
    const { store, api } = setup({
      start: summary({ unreadCount: 1, waitingCount: 1 }),
      letters: [read, unread],
    });
    await store.getState().enterTown();
    await store.getState().openPanel();
    const fetches = api.summary.mock.calls.length;

    expect(api.markRead).toHaveBeenCalledWith("unread");
    expect(store.getState().letters.find((l) => l.id === "unread")?.read).toBe(
      true,
    );
    expect(store.getState().summary).toEqual(
      summary({ unreadCount: 0, waitingCount: 0 }),
    );
    expect(api.summary.mock.calls.length).toBe(fetches);
  });

  it("selects the newest when every letter is read, and marks nothing", async () => {
    const { store, api } = setup({
      letters: [read, letter({ id: "old", read: true, sentAt: T1 })],
    });
    await store.getState().openPanel();
    expect(store.getState().selectedId).toBe("newest");
    expect(api.markRead).not.toHaveBeenCalled();
  });

  it("an empty mailbox selects nothing", async () => {
    const { store } = setup();
    await store.getState().openPanel();
    expect(store.getState().letters).toEqual([]);
    expect(store.getState().selectedId).toBeNull();
    expect(store.getState().lettersStatus).toBe("ready");
  });

  it("says when the letters could not be read", async () => {
    const { store, api } = setup();
    api.letters.mockRejectedValueOnce(new Error("down"));
    await store.getState().openPanel();
    expect(store.getState().lettersStatus).toBe("unreachable");
  });

  it("selecting another letter marks it read", async () => {
    const other = letter({ id: "other", read: false, sentAt: T1 });
    const { store, api } = setup({
      start: summary({ unreadCount: 2, waitingCount: 2 }),
      letters: [letter({ id: "first" }), other],
    });
    await store.getState().openPanel();
    await store.getState().select("other");
    expect(api.markRead).toHaveBeenLastCalledWith("other");
    expect(store.getState().selectedId).toBe("other");
    expect(store.getState().summary).toEqual(summary());
  });

  it("a letter that expired says it crumbled and leaves the list (LETTER_EXPIRED)", async () => {
    const { store, api } = setup({
      start: summary({ unreadCount: 1, unclaimedCount: 1, waitingCount: 1 }),
      letters: [
        letter({
          id: "dust",
          claimState: "unclaimed",
          enclosures: [{ kind: "gold", gold: 5 }],
        }),
      ],
    });
    api.markRead.mockRejectedValueOnce(
      new ApiError({
        code: "LETTER_EXPIRED",
        status: 400,
        detail: "expired",
        errors: [],
      }),
    );
    await store.getState().openPanel();
    await settle();

    expect(store.getState().letters).toEqual([]);
    expect(store.getState().notice).toBe(LETTER_CRUMBLED);
    expect(store.getState().selectedId).toBeNull();
    expect(store.getState().summary).toEqual(summary());
  });

  it("a summary fetched while a letter is open leaves the letter where it is", async () => {
    const { store } = setup({ letters: [read, unread] });
    await store.getState().enterTown();
    await store.getState().openPanel();
    await store.getState().arrived();
    expect(store.getState().selectedId).toBe("unread");
    expect(store.getState().letters).toHaveLength(2);
  });

  it("closing and leaving the town close the panel", async () => {
    const { store } = setup({ letters: [read] });
    await store.getState().enterTown();
    await store.getState().openPanel();
    store.getState().closePanel();
    expect(store.getState().panelOpen).toBe(false);

    await store.getState().openPanel();
    store.getState().leaveTown();
    expect(store.getState().panelOpen).toBe(false);
  });

  it("the next opening clears the last notice", async () => {
    const { store, api } = setup({ letters: [letter({ id: "dust" })] });
    api.markRead.mockRejectedValueOnce(
      new ApiError({
        code: "LETTER_EXPIRED",
        status: 400,
        detail: "expired",
        errors: [],
      }),
    );
    await store.getState().openPanel();
    await settle();
    store.getState().closePanel();
    await store.getState().openPanel();
    expect(store.getState().notice).toBeNull();
  });
});
