import { createStore, type StoreApi } from "zustand";
import type { WorldType } from "@/assets/types/client";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore } from "@/stores/chatStore";
import { countdownFraction } from "@/utils/countdown";
import { partyNoticeText, readyCheckCancelText } from "@/ui/partyNotice";

/**
 * The party this player stands in, as the last `party_update` left it (FS-R82NV R21), and
 * whether the T panel is open (R28). It lives outside any scene, so walking from the village
 * into a field or the Spire never forgets the party; the server is its only writer. The panel,
 * and later the invite prompt and the party frames, read it through `getState()` and `subscribe`.
 */

/** Where a member stands, as the party pod tracks it (R21, R23). */
export type PartyWhere = "hub" | "run" | "away" | `field:${string}`;

/** One member on a `party_update` (R21). */
export interface PartyMember {
  player_id: string;
  name: string;
  class: string;
  /** UTC, RFC 3339. */
  joined_at: string;
  where: PartyWhere | string;
  /** False while the member is away (FS-NCC9J R21); a server that leaves it out means online. */
  online?: boolean;
  /**
   * The pod holding the member, empty when none does (FS-NCC9J R21): who stands on the leader's
   * pod, for the Travel button (R28). A server that leaves it out names no pod.
   */
  pod_id?: string;
}

/**
 * An open invite holding a place in the party (FS-NCC9J R21): the client draws it as a skeleton
 * row. `expires_at` is UTC, RFC 3339, on the server's clock.
 */
export interface ReservedSlot {
  name: string;
  expires_at: string;
}

/**
 * The party as it now stands (R21), sent to every member on every change. `size` is the
 * party's cap, not its count: the count is members plus open invites (FS-NCC9J R10). `reason`
 * names the change; `sync` is the whole party sent to a player as they are seated on a pod, and
 * reads like any other update.
 */
export interface PartyUpdatePayload {
  party_id: string;
  leader_id: string;
  members: PartyMember[];
  /** One per open invite (FS-NCC9J R21); a server that leaves it out means none. */
  reserved?: ReservedSlot[];
  size: number;
  reason: string;
  subject_id: string;
}

/** The party's open invites, none when the update carries no list. */
export function reservedSlots(party: PartyUpdatePayload): ReservedSlot[] {
  return party.reserved ?? [];
}

/**
 * The line the leader's client writes when an open invite lapses unanswered (FS-NCC9J R27). The
 * server sends no notice for it (R12); the accepter's `expired` notice is a different line.
 */
function noAnswerLine(name: string): { code: string; text: string } {
  return { code: "no_answer", text: `No answer from ${name}.` };
}

/**
 * The line every member's client writes when someone joins (FS-R82NV R31a): "<name> joined the
 * party." for a teammate, "You joined the party." for the joiner. Nothing for a party of one just
 * created, and nothing again for a join this client already saw (the subject was already a member).
 */
function joinLine(
  update: PartyUpdatePayload,
  prev: PartyUpdatePayload | null,
  selfId: string | undefined,
): { code: string; text: string } | null {
  if (update.reason !== "joined") return null;
  const joiner = update.members.find((m) => m.player_id === update.subject_id);
  if (!joiner) return null;
  if (prev?.members.some((m) => m.player_id === joiner.player_id)) return null;
  if (joiner.player_id === selfId)
    return update.members.length > 1
      ? { code: "joined", text: "You joined the party." }
      : null;
  return { code: "joined", text: `${joiner.name} joined the party.` };
}

/**
 * The line every member's client writes when someone leaves (FS-R82NV R31a): left and kicked read
 * the same (Nick), "<name> left the party." for a teammate, "You left the party." for the one who
 * went. The name comes from the party as this client last held it, since the update no longer
 * lists them; a leave this client already saw (the subject was not a member) says nothing.
 */
function leaveLine(
  update: PartyUpdatePayload,
  prev: PartyUpdatePayload | null,
  selfId: string | undefined,
): { code: string; text: string } | null {
  if (update.reason !== "left" && update.reason !== "kicked") return null;
  const leaver = prev?.members.find((m) => m.player_id === update.subject_id);
  if (!leaver) return null;
  if (update.members.some((m) => m.player_id === leaver.player_id)) return null;
  return leaver.player_id === selfId
    ? { code: "left", text: "You left the party." }
    : { code: "left", text: `${leaver.name} left the party.` };
}

/** One open invite, told apart from a later invite to the same name by its expiry. */
const slotKey = (slot: ReservedSlot) => `${slot.name}\u0000${slot.expires_at}`;

/** Away or offline: drawn greyed in the panel and the frames (FS-NCC9J R25). */
export function memberAway(m: PartyMember): boolean {
  return m.where === "away" || m.online === false;
}

/** A refusal or status about this player's party, by code; the client owns the words (R36). */
export interface PartyNoticePayload {
  code: string;
  /** The player it concerns, when there is one. */
  name?: string;
  /** The players it concerns, when there are several to name (FS-BJNYC `not_in_town`), in join order. */
  names?: string[];
}

/**
 * An invite to another player's party, delivered to this player (R13). `size` is that party's
 * cap and `member_count` its members now, so the prompt reads "(2/4)". Answered with
 * `party_accept` / `party_decline` and the `invite_id`.
 */
export interface PartyInvitePayload {
  invite_id: string;
  party_id: string;
  party_pod_addr: string;
  leader_name: string;
  member_count: number;
  size: number;
  /** UTC, RFC 3339, on the server's clock: the prompt keeps its own (R14). */
  expires_at: string;
}

/** An invite as the prompt holds it: stamped with when this client heard it, on its own clock. */
export interface PendingInvite extends PartyInvitePayload {
  /** Epoch ms on this client's clock. */
  received_at: number;
}

/** How long a prompt waits for an answer (R14): the party pod drops the invite then too. */
export const INVITE_TTL_MS = 60_000;

/** Whole seconds the prompt still shows (60 down to 1), 0 once it has run out. */
export function inviteSecondsLeft(invite: PendingInvite, now: number): number {
  return Math.max(
    0,
    Math.ceil((invite.received_at + INVITE_TTL_MS - now) / 1000),
  );
}

/** How full the prompt's countdown bar is: what is left of the invite's own window (FS-B3NDZ R6). */
export function inviteFraction(invite: PendingInvite, now: number): number {
  return countdownFraction(
    invite.received_at + INVITE_TTL_MS - now,
    INVITE_TTL_MS,
  );
}

/** One member's answer on a ready check (FS-BJNYC R8). */
export type ReadyCheckState = "waiting" | "accepted" | "declined";

/** Where a ready check stands (FS-BJNYC R8). */
export type ReadyCheckOutcome = "open" | "started" | "cancelled";

/** One member's row on a `party_ready_check`, in join order (FS-BJNYC R8). */
export interface ReadyCheckMember {
  player_id: string;
  name: string;
  state: ReadyCheckState;
}

/**
 * A ready check as it now stands, sent to every member of it, the leader included (FS-BJNYC R8):
 * when it opens, after every answer, and once when it starts or is cancelled. `expires_in_ms` is
 * the time left on the server's clock, so the countdown does not depend on clock skew. A
 * cancelled check carries its `reason` and the `names` it concerns. Answered with `party_ready`.
 */
export interface PartyReadyCheckPayload {
  check_id: string;
  leader_id: string;
  expires_in_ms: number;
  members: ReadyCheckMember[];
  outcome: ReadyCheckOutcome;
  reason?: string;
  names?: string[];
}

/** The open check as the popup holds it: stamped on this client's clock, with this player's answer. */
export interface OpenReadyCheck extends PartyReadyCheckPayload {
  /** Epoch ms on this client's clock, when the newest message for this check came. */
  received_at: number;
  /**
   * The window the check began with: the first `expires_in_ms` this client held for this
   * `check_id`, kept across its later messages. The countdown bar drains over it (FS-B3NDZ R6).
   */
  total_ms: number;
  /** The answer this player sent, null before: the buttons give way before the server's next message. */
  answer: Exclude<ReadyCheckState, "waiting"> | null;
}

/** Whole seconds the popup still shows, from the newest `expires_in_ms`; 0 once it has run out. */
export function readyCheckSecondsLeft(
  check: OpenReadyCheck,
  now: number,
): number {
  return Math.max(
    0,
    Math.ceil((check.received_at + check.expires_in_ms - now) / 1000),
  );
}

/** How full the popup's countdown bar is: what is left over the window the check began with (FS-B3NDZ R6). */
export function readyCheckFraction(check: OpenReadyCheck, now: number): number {
  return countdownFraction(
    check.received_at + check.expires_in_ms - now,
    check.total_ms,
  );
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const READY_STATES: ReadonlySet<unknown> = new Set([
  "waiting",
  "accepted",
  "declined",
]);
const READY_OUTCOMES: ReadonlySet<unknown> = new Set([
  "open",
  "started",
  "cancelled",
]);

const isStringList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((n) => typeof n === "string");

function isReadyCheckMember(v: unknown): v is ReadyCheckMember {
  return (
    isObject(v) &&
    typeof v.player_id === "string" &&
    typeof v.name === "string" &&
    READY_STATES.has(v.state)
  );
}

/** Whether a frame off the wire is a whole `party_ready_check`: a bad frame raises no popup. */
export function isPartyReadyCheck(
  payload: unknown,
): payload is PartyReadyCheckPayload {
  return (
    isObject(payload) &&
    typeof payload.check_id === "string" &&
    typeof payload.leader_id === "string" &&
    typeof payload.expires_in_ms === "number" &&
    READY_OUTCOMES.has(payload.outcome) &&
    Array.isArray(payload.members) &&
    payload.members.every(isReadyCheckMember) &&
    (payload.reason === undefined || typeof payload.reason === "string") &&
    (payload.names === undefined || isStringList(payload.names))
  );
}

function isPartyMember(v: unknown): v is PartyMember {
  return (
    isObject(v) &&
    typeof v.player_id === "string" &&
    typeof v.name === "string" &&
    typeof v.class === "string" &&
    typeof v.where === "string" &&
    (v.online === undefined || typeof v.online === "boolean") &&
    (v.pod_id === undefined || typeof v.pod_id === "string")
  );
}

function isReservedSlot(v: unknown): v is ReservedSlot {
  return (
    isObject(v) &&
    typeof v.name === "string" &&
    typeof v.expires_at === "string"
  );
}

/** Whether a frame off the wire is a whole `party_update`: a bad frame is not drawn. */
export function isPartyUpdate(payload: unknown): payload is PartyUpdatePayload {
  return (
    isObject(payload) &&
    typeof payload.party_id === "string" &&
    typeof payload.leader_id === "string" &&
    typeof payload.size === "number" &&
    typeof payload.reason === "string" &&
    Array.isArray(payload.members) &&
    payload.members.every(isPartyMember) &&
    (payload.reserved === undefined ||
      (Array.isArray(payload.reserved) &&
        payload.reserved.every(isReservedSlot)))
  );
}

/** Whether a frame off the wire is a whole `party_invite`: a bad frame raises no prompt. */
export function isPartyInvite(payload: unknown): payload is PartyInvitePayload {
  return (
    isObject(payload) &&
    typeof payload.invite_id === "string" &&
    typeof payload.party_id === "string" &&
    typeof payload.party_pod_addr === "string" &&
    typeof payload.leader_name === "string" &&
    typeof payload.member_count === "number" &&
    typeof payload.size === "number" &&
    typeof payload.expires_at === "string"
  );
}

export function isPartyNotice(payload: unknown): payload is PartyNoticePayload {
  return (
    isObject(payload) &&
    typeof payload.code === "string" &&
    (payload.name === undefined || typeof payload.name === "string") &&
    (payload.names === undefined || isStringList(payload.names))
  );
}

/** Whether this player leads the party. */
export function isLeader(
  party: PartyUpdatePayload | null,
  selfId: string | undefined,
): boolean {
  return party !== null && selfId !== undefined && party.leader_id === selfId;
}

/**
 * Whether party actions are locked: inside an instance the roster is fixed (ADR-0035), so the
 * server refuses kick, transfer and leave as `locked` there (R19, R20), and invite and create as
 * well (FS-NCC9J R9, R15).
 */
export function partyLocked(world: WorldType | null): boolean {
  return world === "run";
}

/** One member row as the panel draws it, with the actions the viewer may take on it. */
export interface PartyMemberRow {
  player_id: string;
  name: string;
  class: string;
  where: string;
  leader: boolean;
  self: boolean;
  /** Away or offline: drawn greyed (R29). */
  away: boolean;
  kick: boolean;
  transfer: boolean;
}

/** What the viewer may do from the panel now (R29, R30). */
export interface PartyActions {
  inParty: boolean;
  locked: boolean;
  /** The Create party button (R30): in the town or a field, by a player in no party; greyed in a run (FS-NCC9J R23). */
  create: boolean;
  /** The invite field: in the town or a field, by a leader or a player in no party, with room left; greyed in a run (FS-NCC9J R23). */
  invite: boolean;
  leave: boolean;
  members: PartyMemberRow[];
}

/**
 * The panel's rows and which actions are live, greyed by role (leader, member, no party) and by
 * lock (R29). Pure, so every greying rule is tested without a canvas.
 */
export function partyActions(
  party: PartyUpdatePayload | null,
  selfId: string | undefined,
  world: WorldType | null,
): PartyActions {
  const locked = partyLocked(world);
  // Invite and Create work in the town and a field; in a run the lock holds them with the roster,
  // as the server refuses them there (FS-NCC9J R23)
  if (!party) {
    return {
      inParty: false,
      locked,
      create: !locked,
      invite: !locked,
      leave: false,
      members: [],
    };
  }
  const leads = isLeader(party, selfId);
  const room = party.members.length < party.size;
  return {
    inParty: true,
    locked,
    create: false,
    invite: leads && room && !locked,
    leave: !locked,
    members: party.members.map((m) => {
      const self = m.player_id === selfId;
      const onOther = leads && !self && !locked;
      return {
        player_id: m.player_id,
        name: m.name,
        class: m.class,
        where: m.where,
        leader: m.player_id === party.leader_id,
        self,
        away: memberAway(m),
        kick: onOther,
        transfer: onOther,
      };
    }),
  };
}

export interface PartyState {
  /** The party this player is in, or null. */
  party: PartyUpdatePayload | null;
  panelOpen: boolean;
  /** Invites waiting on this player's answer, oldest first: one prompt each, stacked (R32). */
  invites: PendingInvite[];
  /** A `party_invite` delivered to this player. */
  receiveInvite: (invite: PartyInvitePayload) => void;
  /** Closes one prompt: the player answered it. */
  dismissInvite: (inviteId: string) => void;
  /** Lets go of every invite whose countdown has run out. */
  expireInvites: () => void;
  /** Whole seconds left on an invite's countdown, by the store's own clock: the one clock (R14). */
  secondsLeft: (invite: PendingInvite) => number;
  /** How full an invite's countdown bar is now, 1 to 0, by the store's own clock (FS-B3NDZ R6). */
  inviteFraction: (invite: PendingInvite) => number;
  /**
   * On the leader's client, says "No answer from <name>." once for each open invite whose
   * `expires_at` has passed on the store's clock (FS-NCC9J R27). Called every frame.
   */
  expireReserved: () => void;
  /**
   * A `party_update` from the server. The update that removes this player (kicked, left, the
   * party dissolved) is their last one: it no longer lists them, and the party is let go (R21).
   */
  apply: (update: PartyUpdatePayload) => void;
  /** A `party_notice`: its words (R36) said as a system line in the chat window (R31). */
  receiveNotice: (notice: PartyNoticePayload) => void;
  /** The ready check the popup shows, or null (FS-BJNYC R23): only ever the newest one. */
  readyCheck: OpenReadyCheck | null;
  /**
   * A `party_ready_check` (FS-BJNYC R23, R25, R26). `open` holds it, replacing whatever was held:
   * the same check redrawn, its countdown from the newest `expires_in_ms`, or another check in
   * its place. `started` lets it go; `cancelled` lets it go and says why, as a party notice is
   * said.
   */
  receiveReadyCheck: (check: PartyReadyCheckPayload) => void;
  /** This player answered the held check: its buttons give way (FS-BJNYC R24). */
  answerReadyCheck: (checkId: string, accept: boolean) => void;
  /** Whole seconds left on the held check's countdown, by the store's own clock. */
  readySecondsLeft: (check: OpenReadyCheck) => number;
  /** How full the held check's countdown bar is now, 1 to 0, by the store's own clock (FS-B3NDZ R6). */
  readyFraction: (check: OpenReadyCheck) => number;
  togglePanel: () => void;
}

export interface PartyStoreDeps {
  /** This player's id, as the server keys party members (the member id the socket carries). */
  selfId: () => string | undefined;
  /**
   * Epoch ms: the invite prompt's countdown runs on this clock (R14), and the leader's expiry
   * line reads a reserved slot's `expires_at` against it (FS-NCC9J R27).
   */
  now?: () => number;
  /** Where a notice's words are said: the chat window's system lines. */
  say?: (line: { code: string; text: string }) => void;
}

export function createPartyStore({
  selfId,
  now = Date.now,
  say = (line) => useChatStore.getState().notice(line),
}: PartyStoreDeps): StoreApi<PartyState> {
  /** The open invites whose expiry line has been said, so each is said once. */
  let announced = new Set<string>();
  /** Says the line for each slot that has lapsed, when this player leads `party` (R27). */
  const announce = (slots: ReservedSlot[], party: PartyUpdatePayload) => {
    if (!isLeader(party, selfId())) return;
    const at = now();
    for (const slot of slots) {
      const key = slotKey(slot);
      if (announced.has(key) || !(Date.parse(slot.expires_at) <= at)) continue;
      announced.add(key);
      say(noAnswerLine(slot.name));
    }
  };

  return createStore<PartyState>()((set, get) => ({
    party: null,
    panelOpen: false,
    invites: [],
    apply: (update) => {
      const me = selfId();
      const prev = get().party;
      const leaving = leaveLine(update, prev, me);
      if (leaving) say(leaving);
      const stillIn =
        update.reason !== "dissolved" &&
        update.members.some((m) => m.player_id === me);
      if (!stillIn) {
        announced = new Set();
        set({ party: null });
        return;
      }
      // a slot the server dropped after its expiry, with no one of that name joining, lapsed:
      // said here when the update outran this client's own tick (R27)
      const kept = new Set(reservedSlots(update).map(slotKey));
      const joined = new Set(update.members.map((m) => m.name));
      const dropped = prev
        ? reservedSlots(prev).filter(
            (s) => !kept.has(slotKey(s)) && !joined.has(s.name),
          )
        : [];
      announce(dropped, update);
      announced = new Set([...announced].filter((k) => kept.has(k)));
      const line = joinLine(update, prev, me);
      if (line) say(line);
      // a member answers no more invites: joining one party closes every prompt (R32)
      set({ party: update, invites: [] });
    },
    expireReserved: () => {
      const { party } = get();
      if (party) announce(reservedSlots(party), party);
    },
    receiveInvite: (invite) =>
      set((state) =>
        state.invites.some((i) => i.invite_id === invite.invite_id)
          ? state
          : { invites: [...state.invites, { ...invite, received_at: now() }] },
      ),
    dismissInvite: (inviteId) =>
      set((state) => ({
        invites: state.invites.filter((i) => i.invite_id !== inviteId),
      })),
    expireInvites: () =>
      set((state) => {
        const at = now();
        const live = state.invites.filter((i) => inviteSecondsLeft(i, at) > 0);
        return live.length === state.invites.length ? state : { invites: live };
      }),
    secondsLeft: (invite) => inviteSecondsLeft(invite, now()),
    inviteFraction: (invite) => inviteFraction(invite, now()),
    receiveNotice: (notice) => {
      // a code with no copy says nothing
      const text = partyNoticeText(notice);
      if (text !== null) say({ code: notice.code, text });
    },
    readyCheck: null,
    receiveReadyCheck: (check) => {
      if (check.outcome === "open") {
        const held = get().readyCheck;
        const same = held?.check_id === check.check_id;
        // the bar drains over the window the check began with, not each message's (FS-B3NDZ R6)
        set({
          readyCheck: {
            ...check,
            received_at: now(),
            total_ms: same ? held.total_ms : check.expires_in_ms,
            answer: same ? held.answer : null,
          },
        });
        return;
      }
      // a party holds one check at a time (R12): any close is the end of the one held
      set({ readyCheck: null });
      if (check.outcome !== "cancelled") return;
      const text = readyCheckCancelText(check.reason, check.names ?? []);
      if (text !== null) say({ code: `ready_${check.reason}`, text });
    },
    answerReadyCheck: (checkId, accept) =>
      set((state) =>
        state.readyCheck?.check_id === checkId
          ? {
              readyCheck: {
                ...state.readyCheck,
                answer: accept ? "accepted" : "declined",
              },
            }
          : state,
      ),
    readySecondsLeft: (check) => readyCheckSecondsLeft(check, now()),
    readyFraction: (check) => readyCheckFraction(check, now()),
    togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
  }));
}

/** The app's party. The socket writes it; the panel reads it. */
export const usePartyStore = createPartyStore({
  selfId: () => useAuthStore.getState().memberInfo?.id,
});
