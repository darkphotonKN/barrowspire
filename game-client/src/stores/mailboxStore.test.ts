import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/utils/apiError";
import type { KeyValueStore } from "@/characters/roster";
import type { ItemSnapshot, Letter, MailboxSummary } from "@/mailbox/mailbox";
import {
  LETTER_CRUMBLED,
  SEAL_WOULD_NOT_BREAK,
  type ClaimedLetter,
} from "@/mailbox/mailbox";
import {
  createMailboxStore,
  lastSeenKey,
  type MailboxApi,
} from "./mailboxStore";

// FS-1GZGD §Requirements R34, R35, R38, R39, R40, R44; A4 (no timer), A5. I-1GZGD-6 and -7: what fetches the
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

const snapshot = (templateId: string, name: string): ItemSnapshot => ({
  templateId,
  name,
  itemType: "consumable",
  rarity: "normal",
  itemLevel: 1,
  requiredLevel: 1,
  affixes: [],
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

/** What a summary counts (S6), as the server counts its letters. */
function counted(letters: readonly Letter[]): MailboxSummary {
  const untaken = (l: Letter) =>
    l.claimState === "unclaimed" || l.claimState === "claiming";
  return {
    unreadCount: letters.filter((l) => !l.read).length,
    unclaimedCount: letters.filter(untaken).length,
    waitingCount: letters.filter((l) => !l.read || untaken(l)).length,
  };
}

/**
 * A faked gateway over a faked mailbox: reading and taking change the server's letters, and the
 * summary counts them, unless a test pins the summary itself (`start`).
 */
function fakeApi(start?: MailboxSummary, letters: Letter[] = []) {
  const state: { summary?: MailboxSummary; letters: Letter[] } = {
    summary: start,
    letters: letters.map((l) => ({ ...l })),
  };
  const server = (id: string) => state.letters.find((l) => l.id === id);
  const api = {
    summary: vi.fn(async () => state.summary ?? counted(state.letters)),
    letters: vi.fn(async () => state.letters.map((l) => ({ ...l }))),
    markRead: vi.fn(async (id: string) => {
      const l = server(id);
      if (l) l.read = true;
    }),
    claim: vi.fn(async (letterId: string): Promise<ClaimedLetter> => {
      const l = server(letterId);
      if (l) Object.assign(l, { read: true, claimState: "claimed" });
      return { letterId, claimState: "claimed", itemIds: [], gold: 0 };
    }),
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
    const { store, api } = setup({ letters: [read, unread] });
    await store.getState().enterTown();
    api.summary.mockClear();
    const opening = store.getState().openPanel();
    expect(api.summary).toHaveBeenCalledTimes(1);
    await opening;

    expect(api.letters).toHaveBeenCalledTimes(1);
    expect(store.getState().panelOpen).toBe(true);
    expect(store.getState().lettersStatus).toBe("ready");
    expect(store.getState().selectedId).toBe("unread");
  });

  it("marks the selected letter read: its row dims and the seal lowers at once, before the server answers", async () => {
    const { store, api, state } = setup({ letters: [read, unread] });
    await store.getState().enterTown();
    let answer!: () => void;
    api.markRead.mockImplementationOnce(
      (id) =>
        new Promise<undefined>(
          (resolve) =>
            (answer = () => {
              state.letters.find((l) => l.id === id)!.read = true;
              resolve(undefined);
            }),
        ),
    );
    const opening = store.getState().openPanel();
    await vi.waitFor(() => expect(api.markRead).toHaveBeenCalledWith("unread"));

    expect(store.getState().letters.find((l) => l.id === "unread")?.read).toBe(
      true,
    );
    expect(store.getState().summary).toEqual(summary());
    answer();
    await opening;
    await settle();
    expect(store.getState().summary).toEqual(summary());
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
      letters: [letter({ id: "first" }), other],
    });
    await store.getState().openPanel();
    await store.getState().select("other");
    expect(api.markRead).toHaveBeenLastCalledWith("other");
    expect(store.getState().selectedId).toBe("other");
    expect(store.getState().summary).toEqual(summary());
  });

  it("a letter that expired says it crumbled and leaves the list (LETTER_EXPIRED)", async () => {
    const { store, api, state } = setup({
      letters: [
        letter({
          id: "dust",
          claimState: "unclaimed",
          enclosures: [{ kind: "gold", gold: 5 }],
        }),
      ],
    });
    // it expires on the server as the panel opens: listed, then gone
    api.letters.mockImplementationOnce(async () => {
      const listed = state.letters.map((l) => ({ ...l }));
      state.letters = [];
      return listed;
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

describe("mailbox store: Take (R39, A5)", () => {
  const refusal = (code: string, status = 400) =>
    new ApiError({ code, status, detail: code, errors: [] });

  const held = letter({
    id: "held",
    read: false,
    claimState: "unclaimed",
    enclosures: [
      { kind: "item", quantity: 1, item: snapshot("t", "Blade") },
      { kind: "item", quantity: 3, item: snapshot("p", "Draught") },
      { kind: "gold", gold: 50 },
    ],
  });

  async function opened() {
    const ctx = setup({ letters: [held] });
    await ctx.store.getState().openPanel();
    return ctx;
  }

  it("claims the letter: Taking… while in flight, then taken, read and out of the counts", async () => {
    const { store, api } = await opened();
    let answer!: (v: ClaimedLetter) => void;
    api.claim.mockImplementationOnce(
      () => new Promise<ClaimedLetter>((resolve) => (answer = resolve)),
    );

    const taking = store.getState().take("held");
    expect(store.getState().taking).toBe("held");
    answer({
      letterId: "held",
      claimState: "claimed",
      itemIds: ["i"],
      gold: 50,
    });
    await taking;

    expect(api.claim).toHaveBeenCalledTimes(1);
    expect(api.claim).toHaveBeenCalledWith("held");
    expect(store.getState().taking).toBeNull();
    expect(store.getState().letters[0]).toMatchObject({
      read: true,
      claimState: "claimed",
    });
    expect(store.getState().summary).toEqual(summary());
    expect(store.getState().takeWarning).toBeNull();
  });

  it("never sends twice from one panel: a second press while in flight does nothing", async () => {
    const { store, api } = await opened();
    const first = store.getState().take("held");
    await store.getState().take("held");
    await first;
    expect(api.claim).toHaveBeenCalledTimes(1);
  });

  it("does not claim a letter with nothing left to take", async () => {
    const { store, api } = setup({
      letters: [letter({ id: "plain", read: true })],
    });
    await store.getState().openPanel();
    await store.getState().take("plain");
    expect(api.claim).not.toHaveBeenCalled();
  });

  it("a full stash warns with the letter's slot count and keeps the letter untaken", async () => {
    const { store, api } = await opened();
    api.claim.mockRejectedValueOnce(refusal("STASH_FULL"));
    await store.getState().take("held");

    expect(store.getState().takeWarning).toEqual({
      letterId: "held",
      text: "Your stash needs 4 free slots",
    });
    expect(store.getState().letters[0].claimState).toBe("unclaimed");
    expect(store.getState().taking).toBeNull();
    expect(store.getState().summary).toEqual(
      summary({ unclaimedCount: 1, waitingCount: 1 }),
    );
  });

  it("a letter that expired crumbles and leaves the list (LETTER_EXPIRED)", async () => {
    const { store, api, state } = await opened();
    state.letters = [];
    api.claim.mockRejectedValueOnce(refusal("LETTER_EXPIRED"));
    await store.getState().take("held");

    expect(store.getState().letters).toEqual([]);
    expect(store.getState().notice).toBe(LETTER_CRUMBLED);
    expect(store.getState().summary).toEqual(summary());
    expect(store.getState().taking).toBeNull();
  });

  it("a letter already taken elsewhere is shown taken (LETTER_ALREADY_CLAIMED)", async () => {
    const { store, api, state } = await opened();
    Object.assign(state.letters[0], { read: true, claimState: "claimed" });
    api.claim.mockRejectedValueOnce(refusal("LETTER_ALREADY_CLAIMED"));
    await store.getState().take("held");

    expect(store.getState().letters[0].claimState).toBe("claimed");
    expect(store.getState().summary).toEqual(summary());
    expect(store.getState().takeWarning).toBeNull();
  });

  it.each([
    ["a claim already running", refusal("LETTER_CLAIM_IN_PROGRESS")],
    ["items or wallet down", refusal("SERVICE_UNAVAILABLE", 503)],
    ["not found", refusal("NOT_FOUND", 404)],
    ["the network", new TypeError("Failed to fetch")],
  ])(
    "any other failure (%s) says the seal would not break and keeps the button",
    async (_why, err) => {
      const { store, api } = await opened();
      api.claim.mockRejectedValueOnce(err);
      await store.getState().take("held");

      expect(store.getState().takeWarning).toEqual({
        letterId: "held",
        text: SEAL_WOULD_NOT_BREAK,
      });
      expect(store.getState().letters[0].claimState).toBe("unclaimed");
      expect(store.getState().taking).toBeNull();
    },
  );

  it("a new press clears the last warning, and so does opening another letter", async () => {
    const other = letter({ id: "other", read: true, sentAt: T1 });
    const { store, api } = setup({ letters: [held, other] });
    await store.getState().openPanel();
    api.claim.mockRejectedValueOnce(refusal("STASH_FULL"));
    await store.getState().take("held");

    const again = store.getState().take("held");
    expect(store.getState().takeWarning).toBeNull();
    await again;

    api.claim.mockRejectedValueOnce(refusal("STASH_FULL"));
    store.setState({
      letters: store
        .getState()
        .letters.map((l) =>
          l.id === "held" ? { ...l, claimState: "unclaimed" } : l,
        ),
    });
    await store.getState().take("held");
    await store.getState().select("other");
    expect(store.getState().takeWarning).toBeNull();
  });
});

describe("mailbox store: the seal and the list converge on the server (D12)", () => {
  const refusal = (code: string) =>
    new ApiError({ code, status: 400, detail: code, errors: [] });
  const gold = (over: Partial<Letter> = {}) =>
    letter({
      read: true,
      claimState: "unclaimed",
      enclosures: [{ kind: "gold", gold: 5 }],
      ...over,
    });

  /** The next summary fetch waits until the test answers it, with what the server held then. */
  function holdNextSummary(
    api: ReturnType<typeof fakeApi>["api"],
    state: ReturnType<typeof fakeApi>["state"],
  ) {
    let answer!: (s: MailboxSummary) => void;
    api.summary.mockImplementationOnce(
      () => new Promise<MailboxSummary>((resolve) => (answer = resolve)),
    );
    const then = counted(state.letters);
    return () => answer(then);
  }

  it("a summary already in flight when a letter is read does not undo the read", async () => {
    const { store, api, state } = setup({
      letters: [
        letter({ id: "a", sentAt: T2 }),
        letter({ id: "b", sentAt: T1 }),
      ],
    });
    await store.getState().enterTown();
    await store.getState().openPanel();
    await settle();

    const late = holdNextSummary(api, state);
    const arrival = store.getState().arrived();
    await store.getState().select("b");
    late();
    await arrival;
    await settle();

    expect(store.getState().summary).toEqual(counted(state.letters));
    expect(store.getState().summary?.waitingCount).toBe(0);
  });

  it("a summary already in flight when a letter is taken does not undo the take", async () => {
    const { store, api, state } = setup({ letters: [gold({ id: "held" })] });
    await store.getState().enterTown();
    await store.getState().openPanel();

    const late = holdNextSummary(api, state);
    const arrival = store.getState().arrived();
    await store.getState().take("held");
    late();
    await arrival;
    await settle();

    expect(store.getState().summary).toEqual(counted(state.letters));
    expect(store.getState().summary?.waitingCount).toBe(0);
  });

  it("a summary already in flight when a letter crumbles does not count it again", async () => {
    const { store, api, state } = setup({
      letters: [
        letter({ id: "a", sentAt: T2 }),
        letter({ id: "dust", sentAt: T1 }),
      ],
    });
    await store.getState().enterTown();
    await store.getState().openPanel();
    await settle();

    const late = holdNextSummary(api, state);
    const arrival = store.getState().arrived();
    state.letters = state.letters.filter((l) => l.id !== "dust");
    api.markRead.mockRejectedValueOnce(refusal("LETTER_EXPIRED"));
    await store.getState().select("dust");
    late();
    await arrival;
    await settle();

    expect(store.getState().letters.map((l) => l.id)).toEqual(["a"]);
    expect(store.getState().summary).toEqual(counted(state.letters));
  });

  it("taking a letter another tab already took leaves the seal lit for the letter still waiting", async () => {
    const { store, state } = setup({
      letters: [
        gold({ id: "held", sentAt: T2 }),
        gold({ id: "other", sentAt: T1 }),
      ],
    });
    await store.getState().enterTown();
    await store.getState().openPanel();
    // the other tab takes it, and this tab's next summary already counts that
    Object.assign(state.letters[0], { claimState: "claimed" });
    await store.getState().arrived();
    expect(store.getState().summary?.waitingCount).toBe(1);

    await store.getState().take("held");
    await settle();

    expect(store.getState().letters[0].claimState).toBe("claimed");
    expect(store.getState().summary).toEqual(counted(state.letters));
    expect(store.getState().summary?.waitingCount).toBe(1);
  });

  it("reading a letter another tab already read leaves the seal lit for the letter still waiting", async () => {
    const { store, state } = setup({
      letters: [
        letter({ id: "a", sentAt: T2 }),
        letter({ id: "b", sentAt: T1 }),
        letter({ id: "c", sentAt: T1 }),
      ],
    });
    await store.getState().enterTown();
    await store.getState().openPanel();
    await settle();
    state.letters[1].read = true;
    await store.getState().arrived();
    expect(store.getState().summary?.waitingCount).toBe(1);

    await store.getState().select("b");
    await settle();

    expect(store.getState().summary).toEqual(counted(state.letters));
    expect(store.getState().summary?.waitingCount).toBe(1);
  });

  it("a read the server refused is put right by the server's count", async () => {
    const { store, api, state } = setup({ letters: [letter({ id: "a" })] });
    api.markRead.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await store.getState().enterTown();
    await store.getState().openPanel();
    await settle();

    expect(store.getState().summary).toEqual(counted(state.letters));
    expect(store.getState().summary?.waitingCount).toBe(1);
  });

  it("only the latest of two openings applies its letters and opens a letter, on a slow network", async () => {
    const { store, api, state } = setup({ letters: [letter({ id: "a" })] });
    await store.getState().enterTown();
    let answerFirst!: () => void;
    api.letters.mockImplementationOnce(() => {
      const stale = state.letters.map((l) => ({ ...l }));
      return new Promise<Letter[]>(
        (resolve) => (answerFirst = () => resolve(stale)),
      );
    });

    const first = store.getState().openPanel();
    store.getState().closePanel();
    await store.getState().openPanel();
    await settle();
    expect(api.markRead).toHaveBeenCalledTimes(1);

    answerFirst();
    await first;
    await settle();

    expect(api.markRead).toHaveBeenCalledTimes(1);
    expect(store.getState().letters[0].read).toBe(true);
    expect(store.getState().selectedId).toBe("a");
    expect(store.getState().summary).toEqual(counted(state.letters));
  });

  it("an opening the player closed applies nothing once its letters arrive", async () => {
    const { store, api, state } = setup({ letters: [letter({ id: "a" })] });
    let answer!: () => void;
    api.letters.mockImplementationOnce(() => {
      const listed = state.letters.map((l) => ({ ...l }));
      return new Promise<Letter[]>(
        (resolve) => (answer = () => resolve(listed)),
      );
    });
    const opening = store.getState().openPanel();
    store.getState().closePanel();
    answer();
    await opening;

    expect(store.getState().letters).toEqual([]);
    expect(api.markRead).not.toHaveBeenCalled();
  });

  it("says a letter crumbled only when it is the one open", async () => {
    const { store, api, state } = setup({
      letters: [
        gold({ id: "held", sentAt: T2 }),
        letter({ id: "other", read: true, sentAt: T1 }),
      ],
    });
    await store.getState().openPanel();
    let refuse!: () => void;
    api.claim.mockImplementationOnce(
      () =>
        new Promise<ClaimedLetter>(
          (_resolve, reject) =>
            (refuse = () => reject(refusal("LETTER_EXPIRED"))),
        ),
    );
    const taking = store.getState().take("held");
    await store.getState().select("other");
    state.letters = state.letters.filter((l) => l.id !== "held");
    refuse();
    await taking;

    expect(store.getState().letters.map((l) => l.id)).toEqual(["other"]);
    expect(store.getState().selectedId).toBe("other");
    expect(store.getState().notice).toBeNull();
  });
});

describe("mailbox store: leaving the town forgets the mailbox (R44)", () => {
  it("drops a summary still in flight: it neither records last-seen nor shows", async () => {
    const storage = memoryStorage({ [lastSeenKey(ME)]: T1 });
    const { store, api } = setup({
      start: summary({ waitingCount: 1, newestLetterAt: T2 }),
      storage,
    });
    let answer!: (s: MailboxSummary) => void;
    api.summary.mockImplementationOnce(
      () => new Promise<MailboxSummary>((resolve) => (answer = resolve)),
    );
    const entry = store.getState().enterTown();
    store.getState().leaveTown();
    answer(summary({ waitingCount: 1, newestLetterAt: T2 }));
    await entry;

    expect(store.getState().summary).toBeNull();
    expect(storage.getItem(lastSeenKey(ME))).toBe(T1);
    expect(store.getState().pulses).toBe(0);

    // the next entry still pulses for the letter
    await store.getState().enterTown();
    expect(store.getState().pulses).toBe(1);
  });

  it("forgets the summary and the letters, so the next account never sees this one's", async () => {
    const { store } = setup({ letters: [letter({ id: "a" })] });
    await store.getState().enterTown();
    await store.getState().openPanel();
    expect(store.getState().summary).not.toBeNull();

    store.getState().leaveTown();
    expect(store.getState().summary).toBeNull();
    expect(store.getState().letters).toEqual([]);
    expect(store.getState().selectedId).toBeNull();
  });
});

describe("mailbox store: last seen when storage reads but will not write (R35)", () => {
  it("goes by the later of the stored value and the session's own, so one letter pulses once", async () => {
    const data: Record<string, string> = { [lastSeenKey(ME)]: T1 };
    const readOnly: KeyValueStore = {
      getItem: (k) => data[k] ?? null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    const { store } = setup({
      start: summary({ waitingCount: 1, newestLetterAt: T2 }),
      storage: readOnly,
    });
    await store.getState().enterTown();
    expect(store.getState().pulses).toBe(1);
    await store.getState().arrived();
    expect(store.getState().pulses).toBe(1);
  });
});
