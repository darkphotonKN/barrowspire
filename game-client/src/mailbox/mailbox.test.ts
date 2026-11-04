import { describe, expect, it } from "vitest";
import { itemView } from "@/items/itemView";
import {
  EMPTY_MAILBOX,
  LETTER_CRUMBLED,
  afterRead,
  daysLeft,
  expiryLine,
  initialLetter,
  isNewerLetter,
  letterDetail,
  letterRow,
  relativeTime,
  sealState,
  senderName,
  sentDate,
  withoutLetter,
  type ItemSnapshot,
  type Letter,
  type MailboxSummary,
} from "./mailbox";

// FS-1GZGD §Requirements R35–R38, R40; D12, D14; S8. I-1GZGD-6: the mailbox presenter, apart from
// any canvas.

const NOW = Date.parse("2026-11-04T12:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(ms).toISOString();

const summary = (over: Partial<MailboxSummary> = {}): MailboxSummary => ({
  unreadCount: 0,
  unclaimedCount: 0,
  waitingCount: 0,
  ...over,
});

const sword: ItemSnapshot = {
  templateId: "t-sword",
  name: "Barrow Blade",
  itemType: "weapon",
  weaponType: "sword",
  rarity: "normal",
  attackPower: 12,
  itemLevel: 10,
  requiredLevel: 8,
  affixes: [],
};

const unique: ItemSnapshot = {
  templateId: "t-ring",
  name: "Signet of the Drowned King",
  itemType: "ring",
  rarity: "fabled",
  itemLevel: 40,
  requiredLevel: 30,
  affixes: [
    { stat: "strength", tier: 0, value: 7 },
    { stat: "max_health", tier: 0, value: 25 },
  ],
  uniqueEffectText: "Water parts before you.",
};

const letter = (over: Partial<Letter> = {}): Letter => ({
  id: "l-1",
  title: "A word from the Wardens",
  body: "Rest well.",
  sender: "official",
  sentAt: at(NOW - HOUR),
  expiresAt: at(NOW + 20 * DAY),
  read: false,
  claimState: "none",
  enclosures: [],
  ...over,
});

describe("sealState (R35, D12)", () => {
  it.each([
    ["no summary yet", null, { lit: false, count: 0 }],
    ["nothing waiting", summary(), { lit: false, count: 0 }],
    [
      "two waiting",
      summary({ waitingCount: 2, unreadCount: 1, unclaimedCount: 1 }),
      { lit: true, count: 2 },
    ],
  ])("%s", (_name, given, want) => {
    expect(sealState(given)).toEqual(want);
  });
});

describe("isNewerLetter: the pulse rule (R35)", () => {
  const seen = at(NOW - DAY);
  it.each([
    ["a newer letter pulses", at(NOW), seen, true],
    ["the same letter does not", seen, seen, false],
    ["an older one does not", at(NOW - 2 * DAY), seen, false],
    ["an empty mailbox does not", undefined, seen, false],
    ["nothing seen before records without pulsing", at(NOW), null, false],
    [
      "an unreadable last-seen value records without pulsing",
      at(NOW),
      "not a time",
      false,
    ],
  ])("%s", (_name, newest, lastSeen, want) => {
    expect(isNewerLetter(newest, lastSeen)).toBe(want);
  });

  it("compares instants, not strings", () => {
    expect(
      isNewerLetter("2026-11-04T12:00:00.5Z", "2026-11-04T12:00:00Z"),
    ).toBe(true);
    expect(
      isNewerLetter("2026-11-04T13:00:00+01:00", "2026-11-04T12:00:00Z"),
    ).toBe(false);
  });
});

describe("initialLetter (R38)", () => {
  it("selects the first unread letter", () => {
    const letters = [
      letter({ id: "newest", read: true }),
      letter({ id: "unread", read: false }),
      letter({ id: "older-unread", read: false }),
    ];
    expect(initialLetter(letters)).toBe("unread");
  });

  it("selects the newest when all are read", () => {
    expect(
      initialLetter([
        letter({ id: "a", read: true }),
        letter({ id: "b", read: true }),
      ]),
    ).toBe("a");
  });

  it("selects nothing in an empty mailbox", () => {
    expect(initialLetter([])).toBeNull();
  });
});

describe("afterRead: the seal lowers at once (R38)", () => {
  it("drops the unread and waiting counts for a letter with nothing to take", () => {
    const before = summary({ unreadCount: 2, waitingCount: 2 });
    expect(afterRead(before, letter())).toEqual(
      summary({ unreadCount: 1, waitingCount: 1 }),
    );
  });

  it("keeps a letter with untaken enclosures waiting", () => {
    const before = summary({
      unreadCount: 1,
      unclaimedCount: 1,
      waitingCount: 1,
    });
    const held = letter({
      claimState: "unclaimed",
      enclosures: [{ kind: "gold", gold: 50 }],
    });
    expect(afterRead(before, held)).toEqual(
      summary({ unreadCount: 0, unclaimedCount: 1, waitingCount: 1 }),
    );
  });

  it("changes nothing for a letter already read, and never goes below zero", () => {
    const before = summary({ unreadCount: 0, waitingCount: 0 });
    expect(afterRead(before, letter({ read: true }))).toEqual(before);
    expect(afterRead(before, letter())).toEqual(before);
  });
});

describe("withoutLetter: a letter that crumbled leaves the counts", () => {
  it("drops every count the letter was in", () => {
    const before = summary({
      unreadCount: 1,
      unclaimedCount: 1,
      waitingCount: 1,
    });
    const gone = letter({
      read: false,
      claimState: "claiming",
      enclosures: [{ kind: "gold", gold: 5 }],
    });
    expect(withoutLetter(before, gone)).toEqual(summary());
  });
});

describe("the copy (R36, R40)", () => {
  it("names the senders", () => {
    expect(senderName("official")).toBe("The Barrowspire Wardens");
    expect(senderName("system")).toBe("The Spire");
  });

  it("says the empty mailbox and the crumbled letter in the game's words", () => {
    expect(EMPTY_MAILBOX).toBe("No letters wait for you.");
    expect(LETTER_CRUMBLED).toBe("This letter has crumbled to dust.");
  });

  it.each([
    [NOW - 20 * 1000, "just now"],
    [NOW - 5 * 60 * 1000, "5m ago"],
    [NOW - 3 * HOUR, "3h ago"],
    [NOW - 2 * DAY, "2d ago"],
    [NOW + 60 * 1000, "just now"],
  ])("relative time of %s", (sent, want) => {
    expect(relativeTime(at(sent), NOW)).toBe(want);
  });

  it("writes the sent date as day, month and year", () => {
    const sent = new Date(2026, 10, 4, 9, 30).toISOString();
    expect(sentDate(sent)).toBe("4 Nov 2026");
  });

  it.each([
    [20 * DAY, 20, "20 days left", false],
    [4 * DAY, 4, "4 days left", false],
    [3 * DAY, 3, "3 days left", true],
    [DAY + HOUR, 2, "2 days left", true],
    [HOUR, 1, "1 day left", true],
  ])("days until expiry for %s ms", (left, days, text, warning) => {
    expect(daysLeft(at(NOW + left), NOW)).toBe(days);
    expect(expiryLine(days)).toEqual({ text, warning });
  });
});

describe("letterRow (R36)", () => {
  it("draws an unread letter bright with its seal dot, and its glyph lit while untaken", () => {
    const row = letterRow(
      letter({
        claimState: "unclaimed",
        enclosures: [{ kind: "gold", gold: 10 }],
      }),
      NOW,
    );
    expect(row).toMatchObject({
      id: "l-1",
      title: "A word from the Wardens",
      time: "1h ago",
      unread: true,
      glyph: "lit",
    });
  });

  it("draws a read letter dim, its glyph dim once taken and absent without enclosures", () => {
    const taken = letterRow(
      letter({
        read: true,
        claimState: "claimed",
        enclosures: [{ kind: "gold", gold: 10 }],
      }),
      NOW,
    );
    expect(taken).toMatchObject({ unread: false, glyph: "dim" });
    expect(letterRow(letter({ read: true }), NOW).glyph).toBe("none");
  });

  it("treats a claim in progress as untaken", () => {
    const row = letterRow(
      letter({
        claimState: "claiming",
        enclosures: [{ kind: "gold", gold: 1 }],
      }),
      NOW,
    );
    expect(row.glyph).toBe("lit");
  });
});

describe("letterDetail (R36, R37, S8)", () => {
  it("shows the title, sender, sent date, days left and body", () => {
    const detail = letterDetail(
      letter({ sender: "system", expiresAt: at(NOW + 2 * DAY) }),
      NOW,
    );
    expect(detail.title).toBe("A word from the Wardens");
    expect(detail.sender).toBe("The Spire");
    expect(detail.sent).toBe(sentDate(at(NOW - HOUR)));
    expect(detail.expiry).toEqual({ text: "2 days left", warning: true });
    expect(detail.body).toBe("Rest well.");
  });

  it("has no Enclosed row on a letter without enclosures", () => {
    expect(letterDetail(letter(), NOW).enclosed).toEqual([]);
  });

  it("draws an item from its stored snapshot with the bag's icon, and x3 for a quantity above 1", () => {
    const detail = letterDetail(
      letter({
        claimState: "unclaimed",
        enclosures: [
          { kind: "item", quantity: 3, item: sword },
          { kind: "item", quantity: 1, item: unique },
        ],
      }),
      NOW,
    );
    const [blades, ring] = detail.enclosed;
    expect(blades).toMatchObject({
      kind: "item",
      icon: "sword",
      quantity: "x3",
    });
    expect(ring).toMatchObject({ kind: "item", icon: "ring", quantity: "" });
  });

  it("builds the item tip from the snapshot, a copied unique's affixes and effect included", () => {
    const [ring] = letterDetail(
      letter({
        claimState: "unclaimed",
        enclosures: [{ kind: "item", quantity: 1, item: unique }],
      }),
      NOW,
    ).enclosed;
    if (ring.kind !== "item") throw new Error("not an item");
    const view = itemView(ring.item);
    expect(view.name).toBe("Signet of the Drowned King");
    expect(view.rarity?.label).toMatch(/fabled/i);
    expect(view.lines.affixes).toHaveLength(2);
    expect(view.lines.uniqueEffect).toBe("Water parts before you.");
    expect(view.lines.itemLevel).toMatch(/40/);
  });

  it("draws gold as a coins slot with its amount under it", () => {
    const [gold] = letterDetail(
      letter({
        claimState: "unclaimed",
        enclosures: [{ kind: "gold", gold: 1500 }],
      }),
      NOW,
    ).enclosed;
    expect(gold).toEqual({ kind: "gold", icon: "coins", amount: "1,500" });
  });

  it("marks whether the enclosures are still to be taken, the seam the Take button reads", () => {
    const held = { kind: "gold" as const, gold: 1 };
    expect(
      letterDetail(letter({ claimState: "unclaimed", enclosures: [held] }), NOW)
        .untaken,
    ).toBe(true);
    expect(
      letterDetail(letter({ claimState: "claiming", enclosures: [held] }), NOW)
        .untaken,
    ).toBe(true);
    expect(
      letterDetail(letter({ claimState: "claimed", enclosures: [held] }), NOW)
        .untaken,
    ).toBe(false);
    expect(letterDetail(letter(), NOW).untaken).toBe(false);
  });
});
