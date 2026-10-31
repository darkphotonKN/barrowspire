import { createStore, type StoreApi } from "zustand";
import type { WorldType } from "@/assets/types/client";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore } from "@/stores/chatStore";
import { partyNoticeText } from "@/ui/partyNotice";

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
  online: boolean;
}

/**
 * The party as it now stands (R21), sent to every member on every change. `size` is the
 * party's cap, not its count: the count is `members.length` (I-R82NV-1 notes).
 */
export interface PartyUpdatePayload {
  party_id: string;
  leader_id: string;
  members: PartyMember[];
  size: number;
  reason: string;
  subject_id: string;
}

/** A refusal or status about this player's party, by code; the client owns the words (R36). */
export interface PartyNoticePayload {
  code: string;
  /** The player it concerns, when there is one. */
  name?: string;
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

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

function isPartyMember(v: unknown): v is PartyMember {
  return (
    isObject(v) &&
    typeof v.player_id === "string" &&
    typeof v.name === "string" &&
    typeof v.class === "string" &&
    typeof v.where === "string" &&
    typeof v.online === "boolean"
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
    payload.members.every(isPartyMember)
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
    (payload.name === undefined || typeof payload.name === "string")
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
 * server refuses kick, transfer and leave as `locked` there (R19, R20).
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
  /** The invite field: only in the hub, by a leader or a player in no party, with room left. */
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
  const inHub = world === "hub";
  if (!party) {
    return { inParty: false, locked, invite: inHub, leave: false, members: [] };
  }
  const leads = isLeader(party, selfId);
  const room = party.members.length < party.size;
  return {
    inParty: true,
    locked,
    invite: inHub && leads && room,
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
        away: m.where === "away" || !m.online,
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
  /**
   * A `party_update` from the server. The update that removes this player (kicked, left, the
   * party dissolved) is their last one: it no longer lists them, and the party is let go (R21).
   */
  apply: (update: PartyUpdatePayload) => void;
  /** A `party_notice`: its words (R36) said as a system line in the chat window (R31). */
  receiveNotice: (notice: PartyNoticePayload) => void;
  togglePanel: () => void;
}

export interface PartyStoreDeps {
  /** This player's id, as the server keys party members (the member id the socket carries). */
  selfId: () => string | undefined;
  /** Epoch ms: the invite prompt's countdown runs on this clock (R14). */
  now?: () => number;
  /** Where a notice's words are said: the chat window's system lines. */
  say?: (line: { code: string; text: string }) => void;
}

export function createPartyStore({
  selfId,
  now = Date.now,
  say = (line) => useChatStore.getState().notice(line),
}: PartyStoreDeps): StoreApi<PartyState> {
  return createStore<PartyState>()((set) => ({
    party: null,
    panelOpen: false,
    invites: [],
    apply: (update) => {
      const me = selfId();
      const stillIn =
        update.reason !== "dissolved" &&
        update.members.some((m) => m.player_id === me);
      // a member answers no more invites: joining one party closes every prompt (R32)
      if (stillIn) set({ party: update, invites: [] });
      else set({ party: null });
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
    receiveNotice: (notice) => {
      // a code with no copy says nothing
      const text = partyNoticeText(notice);
      if (text !== null) say({ code: notice.code, text });
    },
    togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
  }));
}

/** The app's party. The socket writes it; the panel reads it. */
export const usePartyStore = createPartyStore({
  selfId: () => useAuthStore.getState().memberInfo?.id,
});
