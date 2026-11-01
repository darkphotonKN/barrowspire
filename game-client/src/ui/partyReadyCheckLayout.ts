/**
 * The ready-check popup's pure half (FS-BJNYC R23, R24, §Copy): its question, each member's row,
 * whether this player may answer, and where it sits. The scene-side `PartyReadyCheck` draws what
 * these return.
 */

import type { OpenReadyCheck, ReadyCheckState } from "@/stores/partyStore";
import { NO_NAME } from "./partyNotice";
import { PARTY_PANEL_W, PARTY_PANEL_X, type Rect } from "./partyPanelLayout";
import { INVITE_PROMPT_Y } from "./partyInvitePromptLayout";

export const READY_LABEL = { accept: "Accept", decline: "Decline" } as const;

/** Each state's word on a member's row. */
export const READY_STATE_LABEL: Readonly<Record<ReadyCheckState, string>> = {
  waiting: "Waiting",
  accepted: "Ready",
  declined: "Declined",
};

/** The words in the buttons' place, once there is nothing for this player to press. */
const STATUS = {
  leader: "Waiting on your party.",
  accepted: "You are ready.",
  declined: "You declined.",
} as const;

/** One member's row as the popup draws it. */
export interface ReadyRow {
  player_id: string;
  name: string;
  state: ReadyCheckState;
  leader: boolean;
}

export interface ReadyCheckView {
  /** §Copy's question, in the leader's name. */
  question: string;
  /** Every member, in join order. */
  rows: ReadyRow[];
  /** Accept and Decline: only for a member still waiting who has not pressed one (R24). */
  buttons: boolean;
  /** The words in the buttons' place when there are none. */
  status?: string;
}

/**
 * What this player sees on the check (R23, R24). The leader's press was their answer (R7), so their
 * row reads accepted from the moment the popup opens, and their popup is status only. A member's
 * own row takes the answer they pressed before the server's next message says it.
 */
export function readyCheckView(
  check: OpenReadyCheck,
  selfId: string | undefined,
): ReadyCheckView {
  const rows = check.members.map((m): ReadyRow => {
    const leader = m.player_id === check.leader_id;
    let state = m.state;
    if (leader) state = "accepted";
    else if (m.player_id === selfId && state === "waiting" && check.answer)
      state = check.answer;
    return { player_id: m.player_id, name: m.name, state, leader };
  });
  const leaderName = rows.find((r) => r.leader)?.name.trim() || NO_NAME;
  const question = `${leaderName} would enter the Spire. Are you ready?`;
  if (selfId === check.leader_id)
    return { question, rows, buttons: false, status: STATUS.leader };
  const self = rows.find((r) => r.player_id === selfId);
  if (!self) return { question, rows, buttons: false };
  if (self.state === "waiting") return { question, rows, buttons: true };
  return { question, rows, buttons: false, status: STATUS[self.state] };
}

/** The countdown as the popup shows it. */
export function readyCountdownText(seconds: number): string {
  return `${seconds}s`;
}

/**
 * The popup's top edge: where the invite prompt sits, under the queue panel's line and clear of
 * the hub's passing-notice band. A party member has no invites waiting (joining closes them all),
 * so the two never share the spot.
 */
export const READY_CHECK_Y = INVITE_PROMPT_Y;
export const READY_CHECK_W = 300;
const PAD = 10;
/** Two lines: a long leader name wraps rather than spilling past the frame. */
const QUESTION_H = 36;
const ROW_H = 18;
const GAP = 4;
const BUTTON_H = 20;
const BUTTON_W = 64;
const BUTTON_GAP = 6;
const COUNTDOWN_W = 40;
/** Between the open party panel's right edge and the popup stepped aside for it. */
const PANEL_GAP = 12;

export interface ReadyCheckFrame {
  panel: Rect;
  question: Rect;
  /** One per member, in join order. */
  rows: Rect[];
  countdown: Rect;
  accept: Rect;
  decline: Rect;
  /** Where the status words stand when there are no buttons: right of the countdown. */
  status: Rect;
}

export interface ReadyCheckPlacement {
  canvasWidth: number;
  /** The party panel stands across the top centre while open: the popup steps right of it. */
  panelOpen: boolean;
}

/** The popup's place: top centre, the question, a row per member, then countdown and buttons. */
export function readyCheckFrame(
  rowCount: number,
  { canvasWidth, panelOpen }: ReadyCheckPlacement,
): ReadyCheckFrame {
  const centred = Math.round((canvasWidth - READY_CHECK_W) / 2);
  const x = panelOpen
    ? Math.max(centred, PARTY_PANEL_X + PARTY_PANEL_W + PANEL_GAP)
    : centred;
  const y = READY_CHECK_Y;
  const inner = { x: x + PAD, width: READY_CHECK_W - PAD * 2 };
  const rowsY = y + PAD + QUESTION_H + GAP;
  const rows = Array.from(
    { length: rowCount },
    (_, i): Rect => ({ ...inner, y: rowsY + i * ROW_H, height: ROW_H }),
  );
  const by = rowsY + rowCount * ROW_H + GAP;
  const accept: Rect = {
    x: inner.x + inner.width - BUTTON_W,
    y: by,
    width: BUTTON_W,
    height: BUTTON_H,
  };
  const decline: Rect = {
    x: accept.x - BUTTON_GAP - BUTTON_W,
    y: by,
    width: BUTTON_W,
    height: BUTTON_H,
  };
  return {
    panel: {
      x,
      y,
      width: READY_CHECK_W,
      height: by + BUTTON_H + PAD - y,
    },
    question: { ...inner, y: y + PAD, height: QUESTION_H },
    rows,
    countdown: { x: inner.x, y: by, width: COUNTDOWN_W, height: BUTTON_H },
    accept,
    decline,
    status: {
      x: inner.x + COUNTDOWN_W,
      y: by,
      width: inner.width - COUNTDOWN_W,
      height: BUTTON_H,
    },
  };
}
