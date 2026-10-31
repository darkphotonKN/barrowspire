import { describe, expect, it } from "vitest";
import {
  createPartyStore,
  inviteSecondsLeft,
  isLeader,
  isPartyInvite,
  isPartyNotice,
  isPartyUpdate,
  partyActions,
  partyLocked,
  type PartyInvitePayload,
  type PartyUpdatePayload,
} from "./partyStore";

// FS-R82NV §Requirements R21, R28–R31. I-R82NV-6: the party the panel draws from.

const ME = "11111111-1111-4111-8111-111111111111";
const ALLY = "22222222-2222-4222-8222-222222222222";
const THIRD = "33333333-3333-4333-8333-333333333333";

const member = (player_id: string, name: string, extra = {}) => ({
  player_id,
  name,
  class: "warrior",
  joined_at: "2026-11-01T05:00:00Z",
  where: "hub",
  online: true,
  ...extra,
});

const update = (
  extra: Partial<PartyUpdatePayload> = {},
): PartyUpdatePayload => ({
  party_id: "99999999-9999-4999-8999-999999999999",
  leader_id: ME,
  members: [member(ME, "Aldric"), member(ALLY, "Wren")],
  size: 4,
  reason: "joined",
  subject_id: ALLY,
  ...extra,
});

describe("partyActions (FS-R82NV R29: greyed by role and by lock)", () => {
  it("should let the leader kick and transfer every other member, and a member neither", () => {
    const party = update();

    const asLeader = partyActions(party, ME, "hub");
    expect(asLeader.members.map((m) => [m.name, m.kick, m.transfer])).toEqual([
      ["Aldric", false, false],
      ["Wren", true, true],
    ]);

    const asMember = partyActions(party, ALLY, "hub");
    expect(asMember.members.map((m) => [m.name, m.kick, m.transfer])).toEqual([
      ["Aldric", false, false],
      ["Wren", false, false],
    ]);
  });

  it.each([
    ["leader in the hub", ME, "hub", { invite: true, leave: true }],
    ["member in the hub", ALLY, "hub", { invite: false, leave: true }],
    ["leader afield", ME, "field", { invite: false, leave: true }],
    ["leader delving (locked)", ME, "run", { invite: false, leave: false }],
    ["member delving (locked)", ALLY, "run", { invite: false, leave: false }],
  ] as const)("%s", (_case, self, world, want) => {
    const actions = partyActions(update(), self, world);
    expect({ invite: actions.invite, leave: actions.leave }).toEqual(want);
  });

  it("should grey kick and transfer for the leader inside an instance", () => {
    const actions = partyActions(update(), ME, "run");
    expect(actions.locked).toBe(true);
    expect(actions.members.some((m) => m.kick || m.transfer)).toBe(false);
  });

  it("should offer a player in no party Create party and the invite, in the hub (R30)", () => {
    expect(partyActions(null, ME, "hub")).toEqual({
      inParty: false,
      locked: false,
      create: true,
      invite: true,
      leave: false,
      members: [],
    });
  });

  it.each(["field", "run", null] as const)(
    "should grey Create party and the invite for a player in no party in %s (R30)",
    (world) => {
      const actions = partyActions(null, ME, world);
      expect({ create: actions.create, invite: actions.invite }).toEqual({
        create: false,
        invite: false,
      });
    },
  );

  it("should not offer Create party to anyone already in a party", () => {
    expect(partyActions(update(), ME, "hub").create).toBe(false);
    expect(partyActions(update(), ALLY, "hub").create).toBe(false);
  });

  it("should not let a full party's leader invite", () => {
    const full = update({
      size: 2,
    });
    expect(partyActions(full, ME, "hub").invite).toBe(false);
  });

  it("should mark the leader, and grey a member who is away or offline", () => {
    const party = update({
      members: [
        member(ME, "Aldric"),
        member(ALLY, "Wren", { where: "away" }),
        member(THIRD, "Osric", { online: false }),
      ],
    });
    const rows = partyActions(party, ALLY, "hub").members;
    expect(rows.map((r) => [r.name, r.leader, r.away, r.self])).toEqual([
      ["Aldric", true, false, false],
      ["Wren", false, true, true],
      ["Osric", false, true, false],
    ]);
  });
});

describe("isLeader and partyLocked", () => {
  it("should know the leader by id", () => {
    expect(isLeader(update(), ME)).toBe(true);
    expect(isLeader(update(), ALLY)).toBe(false);
    expect(isLeader(null, ME)).toBe(false);
  });

  it("should lock only inside an instance (ADR-0035)", () => {
    expect(partyLocked("run")).toBe(true);
    expect(partyLocked("hub")).toBe(false);
    expect(partyLocked("field")).toBe(false);
    expect(partyLocked(null)).toBe(false);
  });
});

describe("partyStore (FS-R82NV R21: the party as the last party_update left it)", () => {
  const store = (self: string | undefined = ME) =>
    createPartyStore({ selfId: () => self });

  it("should start in no party, with the panel shut", () => {
    const s = store();
    expect(s.getState().party).toBeNull();
    expect(s.getState().panelOpen).toBe(false);
  });

  it("should hold the latest update while the viewer is a member", () => {
    const s = store();
    s.getState().apply(
      update({ subject_id: ME, members: [member(ME, "Aldric")] }),
    );
    s.getState().apply(update());
    expect(s.getState().party?.members.map((m) => m.name)).toEqual([
      "Aldric",
      "Wren",
    ]);
  });

  it("should drop the party when an update no longer lists the viewer (their final one)", () => {
    const s = store(ALLY);
    s.getState().apply(update());
    s.getState().apply(
      update({
        reason: "kicked",
        subject_id: ALLY,
        members: [member(ME, "Aldric")],
      }),
    );
    expect(s.getState().party).toBeNull();
  });

  it("should drop the party when it is dissolved", () => {
    const s = store();
    s.getState().apply(update());
    s.getState().apply(update({ reason: "dissolved", subject_id: ME }));
    expect(s.getState().party).toBeNull();
  });

  it("should toggle the panel", () => {
    const s = store();
    s.getState().togglePanel();
    expect(s.getState().panelOpen).toBe(true);
    s.getState().togglePanel();
    expect(s.getState().panelOpen).toBe(false);
  });
});

describe("wire guards", () => {
  it("should accept a party_update and reject a malformed one", () => {
    expect(isPartyUpdate(update())).toBe(true);
    expect(isPartyUpdate({ ...update(), members: "nope" })).toBe(false);
    expect(isPartyUpdate({ ...update(), leader_id: 7 })).toBe(false);
    expect(isPartyUpdate({ ...update(), members: [{ player_id: ME }] })).toBe(
      false,
    );
    expect(isPartyUpdate(null)).toBe(false);
  });

  it("should accept a party_invite and reject a malformed one", () => {
    expect(isPartyInvite(invite("a"))).toBe(true);
    expect(isPartyInvite({ ...invite("a"), invite_id: 1 })).toBe(false);
    expect(isPartyInvite({ ...invite("a"), leader_name: undefined })).toBe(
      false,
    );
    expect(isPartyInvite({ ...invite("a"), member_count: "2" })).toBe(false);
    expect(isPartyInvite({ ...invite("a"), size: null })).toBe(false);
    expect(isPartyInvite({ ...invite("a"), party_pod_addr: undefined })).toBe(
      false,
    );
    expect(isPartyInvite({ ...invite("a"), expires_at: 0 })).toBe(false);
    expect(isPartyInvite(null)).toBe(false);
  });

  it("should accept a party_notice with or without a name", () => {
    expect(isPartyNotice({ code: "self" })).toBe(true);
    expect(isPartyNotice({ code: "sent", name: "Wren" })).toBe(true);
    expect(isPartyNotice({ code: 3 })).toBe(false);
    expect(isPartyNotice({ code: "sent", name: 3 })).toBe(false);
  });
});

// FS-R82NV §Requirements R32, R33. I-R82NV-7: the invites waiting on this player's answer.

const invite = (
  invite_id: string,
  extra: Partial<PartyInvitePayload> = {},
): PartyInvitePayload => ({
  invite_id,
  party_id: "99999999-9999-4999-8999-999999999999",
  party_pod_addr: "10.0.0.7:5660",
  leader_name: "Wren",
  member_count: 2,
  size: 4,
  expires_at: "2026-11-01T05:01:00Z",
  ...extra,
});

describe("partyStore invites (FS-R82NV R32: the prompts waiting on an answer)", () => {
  const store = (self = ME, clock = { now: 0 }) =>
    createPartyStore({ selfId: () => self, now: () => clock.now });

  it("should stack two invites and empty them when a party_update makes the player a member", () => {
    const s = store();
    s.getState().receiveInvite(invite("a"));
    s.getState().receiveInvite(invite("b", { leader_name: "Osric" }));
    expect(s.getState().invites.map((i) => i.invite_id)).toEqual(["a", "b"]);

    s.getState().apply(update({ leader_id: ALLY }));

    expect(s.getState().invites).toEqual([]);
  });

  it("should close a prompt on its own at 60 s, on the client's clock (R14)", () => {
    const clock = { now: 1_000 };
    const s = store(ME, clock);
    s.getState().receiveInvite(invite("a"));
    clock.now = 21_000;
    s.getState().receiveInvite(invite("b"));

    clock.now = 60_999;
    s.getState().expireInvites();
    expect(s.getState().invites.map((i) => i.invite_id)).toEqual(["a", "b"]);

    clock.now = 61_000;
    s.getState().expireInvites();
    expect(s.getState().invites.map((i) => i.invite_id)).toEqual(["b"]);
  });
});

describe("partyStore answering an invite", () => {
  const store = () => createPartyStore({ selfId: () => ME, now: () => 0 });

  it("should close only the answered prompt", () => {
    const s = store();
    s.getState().receiveInvite(invite("a"));
    s.getState().receiveInvite(invite("b"));
    s.getState().dismissInvite("a");
    expect(s.getState().invites.map((i) => i.invite_id)).toEqual(["b"]);
  });

  it("should not stack the same invite twice", () => {
    const s = store();
    s.getState().receiveInvite(invite("a"));
    s.getState().receiveInvite(invite("a"));
    expect(s.getState().invites).toHaveLength(1);
  });

  it("should keep the prompts through a party_update that does not make the player a member", () => {
    const s = store();
    s.getState().receiveInvite(invite("a"));
    s.getState().apply(update({ members: [member(ALLY, "Wren")] }));
    expect(s.getState().invites).toHaveLength(1);
  });
});

describe("inviteSecondsLeft (FS-R82NV R32: the countdown)", () => {
  const pending = { ...invite("a"), received_at: 10_000 };

  it.each([
    [10_000, 60],
    [10_001, 60],
    [11_000, 59],
    [69_001, 1],
    [70_000, 0],
    [99_000, 0],
  ])("at %i ms shows %i s", (now, want) => {
    expect(inviteSecondsLeft(pending, now)).toBe(want);
  });
});

describe("partyStore notices and the one clock (FS-R82NV R14, R31, R36)", () => {
  it("should say a notice's words as a system line, and nothing for a code with no copy", () => {
    const said: { code: string; text: string }[] = [];
    const store = createPartyStore({
      selfId: () => ME,
      say: (line) => said.push(line),
    });

    store.getState().receiveNotice({ code: "declined", name: "Kaelen" });
    store.getState().receiveNotice({ code: "no_such_code" });

    expect(said).toEqual([{ code: "declined", text: "Kaelen declines." }]);
  });

  it("should count an invite down by the store's own clock", () => {
    const clock = { now: 0 };
    const store = createPartyStore({ selfId: () => ME, now: () => clock.now });
    store.getState().receiveInvite(invite("a"));
    const [pending] = store.getState().invites;

    clock.now = 59_001;
    expect(store.getState().secondsLeft(pending)).toBe(1);
    clock.now = 60_000;
    expect(store.getState().secondsLeft(pending)).toBe(0);
  });
});
