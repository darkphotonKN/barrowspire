import { describe, expect, it } from "vitest";
import {
  createPartyStore,
  inviteSecondsLeft,
  isLeader,
  isPartyInvite,
  isPartyNotice,
  isPartyReadyCheck,
  isPartyUpdate,
  readyCheckSecondsLeft,
  memberAway,
  partyActions,
  partyLocked,
  reservedSlots,
  type PartyInvitePayload,
  type PartyReadyCheckPayload,
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

  // FS-NCC9J R23: the leader invites from the town and a field; in a run the lock holds the
  // invite as well as leave, as the server refuses it there
  it.each([
    ["leader in the hub", ME, "hub", { invite: true, leave: true }],
    ["member in the hub", ALLY, "hub", { invite: false, leave: true }],
    ["leader afield", ME, "field", { invite: true, leave: true }],
    ["member afield", ALLY, "field", { invite: false, leave: true }],
    ["leader in a run (locked)", ME, "run", { invite: false, leave: false }],
    ["member in a run (locked)", ALLY, "run", { invite: false, leave: false }],
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

  it.each(["field", null] as const)(
    "should offer a player in no party Create party and the invite in %s too (FS-NCC9J R23)",
    (world) => {
      const actions = partyActions(null, ME, world);
      expect({ create: actions.create, invite: actions.invite }).toEqual({
        create: true,
        invite: true,
      });
    },
  );

  it("should grey Create party and the invite for a player in no party in a run (FS-NCC9J R23)", () => {
    const actions = partyActions(null, ME, "run");
    expect({
      locked: actions.locked,
      create: actions.create,
      invite: actions.invite,
    }).toEqual({ locked: true, create: false, invite: false });
  });

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

  it("should take a member's pod_id, and reject one that is not a string (FS-NCC9J R21)", () => {
    const at = (pod_id: unknown) => ({
      ...update(),
      members: [{ ...member(ME, "Aldric"), pod_id }],
    });
    expect(isPartyUpdate(at("pod-a"))).toBe(true);
    expect(isPartyUpdate(at(""))).toBe(true);
    expect(isPartyUpdate(at(7))).toBe(false);
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

  // FS-B3NDZ §Requirements 6. I-B3NDZ-1: the invite's bar drains over its own window.
  it("should give an invite's fraction over its own window, by the store's own clock", () => {
    const clock = { now: 1_000 };
    const store = createPartyStore({ selfId: () => ME, now: () => clock.now });
    store.getState().receiveInvite(invite("a"));
    const [pending] = store.getState().invites;

    expect(store.getState().inviteFraction(pending)).toBe(1);
    clock.now = 31_000;
    expect(store.getState().inviteFraction(pending)).toBe(0.5);
    clock.now = 61_000;
    expect(store.getState().inviteFraction(pending)).toBe(0);
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

// FS-NCC9J §Requirements R21, R25–R27. I-NCC9J-7: open invites as reserved slots, each member's
// online, the `sync` update, and the leader's expiry line.

describe("party_update across pods (FS-NCC9J R21)", () => {
  const withoutOnline = () => {
    const { online: _online, ...rest } = member(ALLY, "Wren");
    return rest;
  };

  it("should accept an update with reserved slots, and one without (none reserved)", () => {
    const reserved = [{ name: "Kaelen", expires_at: "2026-11-01T05:01:00Z" }];
    expect(isPartyUpdate(update({ reserved }))).toBe(true);
    expect(reservedSlots(update({ reserved }))).toEqual(reserved);
    expect(isPartyUpdate(update())).toBe(true);
    expect(reservedSlots(update())).toEqual([]);
  });

  it("should reject a malformed reserved list", () => {
    expect(isPartyUpdate({ ...update(), reserved: "nope" })).toBe(false);
    expect(isPartyUpdate({ ...update(), reserved: [{ name: "Kaelen" }] })).toBe(
      false,
    );
    expect(
      isPartyUpdate({ ...update(), reserved: [{ name: 3, expires_at: "x" }] }),
    ).toBe(false);
  });

  it("should accept a member without online and read them as online", () => {
    const u = { ...update(), members: [member(ME, "Aldric"), withoutOnline()] };
    expect(isPartyUpdate(u)).toBe(true);
    expect(memberAway(withoutOnline())).toBe(false);
    expect(partyActions(u, ME, "hub").members[1].away).toBe(false);
  });

  it("should reject a member whose online is not a boolean", () => {
    expect(
      isPartyUpdate({
        ...update(),
        members: [{ ...member(ALLY, "Wren"), online: "yes" }],
      }),
    ).toBe(false);
  });

  it("should read a member as away when offline or where says away", () => {
    expect(memberAway(member(ALLY, "Wren", { online: false }))).toBe(true);
    expect(memberAway(member(ALLY, "Wren", { where: "away" }))).toBe(true);
    expect(memberAway(member(ALLY, "Wren"))).toBe(false);
  });

  it("should say nothing about a sync update's open invites that are still live", () => {
    const said: unknown[] = [];
    const s = createPartyStore({
      selfId: () => ME,
      now: () => Date.parse("2026-11-01T05:00:30Z"),
      say: (l) => said.push(l),
    });
    s.getState().apply(
      update({
        reason: "sync",
        reserved: [{ name: "Kaelen", expires_at: "2026-11-01T05:01:00Z" }],
      }),
    );
    s.getState().expireReserved();
    expect(said).toEqual([]);
  });

  it("should hold a sync update like any other, and close the prompts", () => {
    const s = createPartyStore({ selfId: () => ALLY });
    s.getState().receiveInvite(invite("a"));
    s.getState().apply(update({ reason: "sync", subject_id: ALLY }));
    expect(s.getState().party?.reason).toBe("sync");
    expect(s.getState().invites).toEqual([]);
  });
});

describe("partyStore expiry line (FS-NCC9J R27: the leader's client says an invite lapsed)", () => {
  const EXPIRES = "2026-11-01T05:01:00Z";
  const AT = Date.parse(EXPIRES);
  const kaelen = { name: "Kaelen", expires_at: EXPIRES };

  function setup(self = ME) {
    const clock = { now: AT - 10_000 };
    const said: { code: string; text: string }[] = [];
    const s = createPartyStore({
      selfId: () => self,
      now: () => clock.now,
      say: (line) => said.push(line),
    });
    // the leader is ME; ALLY is a member
    s.getState().apply(update({ reason: "sent", reserved: [kaelen] }));
    return { s, clock, said };
  }
  const NO_ANSWER = { code: "no_answer", text: "No answer from Kaelen." };

  it("should write the line on the leader's client once expires_at passes, and only once", () => {
    const { s, clock, said } = setup();
    s.getState().expireReserved();
    expect(said).toEqual([]);

    clock.now = AT;
    s.getState().expireReserved();
    s.getState().expireReserved();
    expect(said).toEqual([NO_ANSWER]);
  });

  it("should write nothing on a member's client", () => {
    const { s, clock, said } = setup(ALLY);
    clock.now = AT + 1;
    s.getState().expireReserved();
    s.getState().apply(update({ reason: "expired", reserved: [] }));
    expect(said).toEqual([]);
  });

  it("should write nothing when the invitee joins before expires_at", () => {
    const { s, clock, said } = setup();
    s.getState().apply(
      update({
        members: [
          member(ME, "Aldric"),
          member(ALLY, "Wren"),
          member(THIRD, "Kaelen"),
        ],
        reserved: [],
      }),
    );
    clock.now = AT + 1;
    s.getState().expireReserved();
    expect(said).toEqual([]);
  });

  it("should write nothing when the invite is declined before expires_at", () => {
    const { s, clock, said } = setup();
    s.getState().apply(update({ reason: "declined", reserved: [] }));
    clock.now = AT + 1;
    s.getState().expireReserved();
    expect(said).toEqual([]);
  });

  it("should write the line when the server drops the slot after expires_at before the client's own tick saw it", () => {
    const { s, clock, said } = setup();
    clock.now = AT + 50;
    s.getState().apply(update({ reason: "expired", reserved: [] }));
    s.getState().expireReserved();
    expect(said).toEqual([NO_ANSWER]);
  });

  it("should not write the line twice when the client's tick saw it before the server dropped the slot", () => {
    const { s, clock, said } = setup();
    clock.now = AT;
    s.getState().expireReserved();
    s.getState().apply(update({ reason: "expired", reserved: [] }));
    expect(said).toEqual([NO_ANSWER]);
  });

  it("should write the line on the client of whoever leads when it lapses", () => {
    const { s, clock, said } = setup(ALLY);
    s.getState().apply(
      update({ reason: "leader", leader_id: ALLY, reserved: [kaelen] }),
    );
    clock.now = AT;
    s.getState().expireReserved();
    expect(said).toEqual([NO_ANSWER]);
  });

  it("should write the line again for a fresh invite to the same name", () => {
    const { s, clock, said } = setup();
    clock.now = AT;
    s.getState().expireReserved();
    const later = "2026-11-01T05:03:00Z";
    s.getState().apply(
      update({
        reason: "sent",
        reserved: [{ name: "Kaelen", expires_at: later }],
      }),
    );
    clock.now = Date.parse(later);
    s.getState().expireReserved();
    expect(said).toEqual([NO_ANSWER, NO_ANSWER]);
  });
});

// FS-BJNYC §Requirements R23–R26. I-BJNYC-5: the ready check the popup draws from.

const CHECK = "44444444-4444-4444-8444-444444444444";
const OTHER_CHECK = "55555555-5555-4555-8555-555555555555";

const readyCheck = (
  extra: Partial<PartyReadyCheckPayload> = {},
): PartyReadyCheckPayload => ({
  check_id: CHECK,
  leader_id: ME,
  expires_in_ms: 30_000,
  members: [
    { player_id: ME, name: "Aldric", state: "accepted" },
    { player_id: ALLY, name: "Wren", state: "waiting" },
  ],
  outcome: "open",
  ...extra,
});

describe("isPartyReadyCheck (FS-BJNYC R8: a bad frame raises no popup)", () => {
  it("should take a whole party_ready_check, open or closed", () => {
    expect(isPartyReadyCheck(readyCheck())).toBe(true);
    expect(
      isPartyReadyCheck(
        readyCheck({ outcome: "cancelled", reason: "timeout", names: ["Wren"] }),
      ),
    ).toBe(true);
  });

  it.each([
    ["no check id", { check_id: undefined }],
    ["a countdown that is not a number", { expires_in_ms: "30000" }],
    ["an outcome it does not know", { outcome: "maybe" }],
    ["a member state it does not know", { members: [{ player_id: ME, name: "Aldric", state: "ready" }] }],
    ["members that are not a list", { members: {} }],
    ["names that are not names", { outcome: "cancelled", reason: "left", names: [7] }],
    ["a reason that is not a word", { outcome: "cancelled", reason: 3 }],
  ])("should refuse a frame with %s", (_, extra) => {
    expect(isPartyReadyCheck({ ...readyCheck(), ...extra })).toBe(false);
  });
});

describe("the party store's ready check (FS-BJNYC R23, R25, R26)", () => {
  const setup = () => {
    const clock = { now: 1_000 };
    const said: { code: string; text: string }[] = [];
    const s = createPartyStore({
      selfId: () => ALLY,
      now: () => clock.now,
      say: (line) => said.push(line),
    });
    return { s, clock, said };
  };

  it("should hold an open check, stamped with when this client heard it", () => {
    const { s } = setup();
    s.getState().receiveReadyCheck(readyCheck());
    expect(s.getState().readyCheck).toMatchObject({
      check_id: CHECK,
      received_at: 1_000,
      answer: null,
    });
  });

  it("should keep only the newest message for the same check, its countdown from the newest expires_in_ms", () => {
    const { s, clock } = setup();
    s.getState().receiveReadyCheck(readyCheck());
    clock.now = 6_000;
    s.getState().receiveReadyCheck(
      readyCheck({
        expires_in_ms: 24_000,
        members: [
          { player_id: ME, name: "Aldric", state: "accepted" },
          { player_id: ALLY, name: "Wren", state: "accepted" },
        ],
      }),
    );
    const held = s.getState().readyCheck!;
    expect(held.members[1].state).toBe("accepted");
    expect(s.getState().readySecondsLeft(held)).toBe(24);
  });

  it("should replace the popup's check with one for another check id", () => {
    const { s } = setup();
    s.getState().receiveReadyCheck(readyCheck());
    s.getState().answerReadyCheck(CHECK, true);
    s.getState().receiveReadyCheck(readyCheck({ check_id: OTHER_CHECK }));
    expect(s.getState().readyCheck).toMatchObject({
      check_id: OTHER_CHECK,
      answer: null,
    });
  });

  it("should remember this player's answer to the check, until a newer check comes", () => {
    const { s } = setup();
    s.getState().receiveReadyCheck(readyCheck());
    s.getState().answerReadyCheck(CHECK, true);
    expect(s.getState().readyCheck?.answer).toBe("accepted");
    s.getState().receiveReadyCheck(readyCheck({ expires_in_ms: 20_000 }));
    expect(s.getState().readyCheck?.answer).toBe("accepted");
    s.getState().answerReadyCheck(OTHER_CHECK, false);
    expect(s.getState().readyCheck?.check_id).toBe(CHECK);
  });

  it("should let go of the check when it starts, saying nothing", () => {
    const { s, said } = setup();
    s.getState().receiveReadyCheck(readyCheck());
    s.getState().receiveReadyCheck(readyCheck({ outcome: "started" }));
    expect(s.getState().readyCheck).toBeNull();
    expect(said).toEqual([]);
  });

  it("should let go of the check when it is cancelled, and say why with the names", () => {
    const { s, said } = setup();
    s.getState().receiveReadyCheck(readyCheck());
    s.getState().receiveReadyCheck(
      readyCheck({ outcome: "cancelled", reason: "timeout", names: ["Wren", "Mira"] }),
    );
    expect(s.getState().readyCheck).toBeNull();
    expect(said).toEqual([
      { code: "ready_timeout", text: "Wren and Mira did not answer. The party stays." },
    ]);
  });

  it("should say a cancellation it never saw open (a party of one whose run failed)", () => {
    const { s, said } = setup();
    s.getState().receiveReadyCheck(
      readyCheck({ outcome: "cancelled", reason: "failed", names: [] }),
    );
    expect(s.getState().readyCheck).toBeNull();
    expect(said.map((l) => l.text)).toEqual(["The way is shut for now. Ask again."]);
  });

  // FS-B3NDZ §Requirements 6. I-B3NDZ-1: the bar's fraction, over the window the check began with.
  it("should keep the check's first window as its total across later messages for it", () => {
    const { s, clock } = setup();
    s.getState().receiveReadyCheck(readyCheck({ expires_in_ms: 30_000 }));
    expect(s.getState().readyCheck?.total_ms).toBe(30_000);
    expect(s.getState().readyFraction(s.getState().readyCheck!)).toBe(1);

    clock.now = 7_000;
    s.getState().receiveReadyCheck(readyCheck({ expires_in_ms: 24_000 }));
    expect(s.getState().readyCheck?.total_ms).toBe(30_000);
    expect(s.getState().readyFraction(s.getState().readyCheck!)).toBe(0.8);

    clock.now = 19_000;
    expect(s.getState().readyFraction(s.getState().readyCheck!)).toBe(0.4);
    clock.now = 40_000;
    expect(s.getState().readyFraction(s.getState().readyCheck!)).toBe(0);
  });

  it("should take a new check's own first window as its total", () => {
    const { s } = setup();
    s.getState().receiveReadyCheck(readyCheck({ expires_in_ms: 30_000 }));
    s.getState().receiveReadyCheck(
      readyCheck({ check_id: OTHER_CHECK, expires_in_ms: 20_000 }),
    );
    expect(s.getState().readyCheck?.total_ms).toBe(20_000);
    expect(s.getState().readyFraction(s.getState().readyCheck!)).toBe(1);
  });

  it("should never read a later, larger window as more than full", () => {
    const { s } = setup();
    s.getState().receiveReadyCheck(readyCheck({ expires_in_ms: 10_000 }));
    s.getState().receiveReadyCheck(readyCheck({ expires_in_ms: 12_000 }));
    expect(s.getState().readyFraction(s.getState().readyCheck!)).toBe(1);
  });

  it("should count whole seconds down from expires_in_ms, 0 once it has run out", () => {
    const check = {
      ...readyCheck(),
      received_at: 1_000,
      total_ms: 30_000,
      answer: null,
    };
    expect(readyCheckSecondsLeft(check, 1_000)).toBe(30);
    expect(readyCheckSecondsLeft(check, 1_001)).toBe(30);
    expect(readyCheckSecondsLeft(check, 2_000)).toBe(29);
    expect(readyCheckSecondsLeft(check, 30_999)).toBe(1);
    expect(readyCheckSecondsLeft(check, 31_000)).toBe(0);
    expect(readyCheckSecondsLeft(check, 90_000)).toBe(0);
  });
});
