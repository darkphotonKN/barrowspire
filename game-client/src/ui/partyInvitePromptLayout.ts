/**
 * The invite prompt's pure half (FS-R82NV R32, FS-NCC9J R24): its words, whether Accept is live
 * in this world, and where each prompt sits. The scene-side `PartyInvitePrompt` draws what these
 * return.
 */

import type { WorldType } from "@/assets/types/client";
import { partyLocked, type PartyInvitePayload } from "@/stores/partyStore";
import { NO_NAME, PARTY_NOTICE_COPY } from "./partyNotice";
import { PARTY_PANEL_W, PARTY_PANEL_X, type Rect } from "./partyPanelLayout";

/** R32's line: the leader (a blank name reads "Someone"), and the party's members over its cap ("(2/4)"). */
export function invitePromptText(
  invite: Pick<PartyInvitePayload, "leader_name" | "member_count" | "size">,
): string {
  const leader = invite.leader_name.trim() || NO_NAME;
  return `${leader} invites you to their party (${invite.member_count}/${invite.size})`;
}

export const INVITE_LABEL = { accept: "Accept", decline: "Decline" } as const;

/** Whether the prompt's Accept may be pressed, and the line that says why not. */
export interface InviteAcceptState {
  live: boolean;
  note?: string;
}

/**
 * Accept in every world but a run (FS-NCC9J R24): inside an instance the roster is fixed
 * (ADR-0035), so the server would refuse it `locked`. Greyed there with that refusal's words,
 * until FS-BJNYC gives every run a party.
 */
export function inviteAcceptState(world: WorldType | null): InviteAcceptState {
  return partyLocked(world)
    ? { live: false, note: PARTY_NOTICE_COPY.locked }
    : { live: true };
}

/** The countdown as the prompt shows it. */
export function inviteCountdownText(seconds: number): string {
  return `${seconds}s`;
}

/**
 * The first prompt's top edge. Under the queue panel's line (y 20) and clear of the hub's
 * passing-notice band (centred on y 72), so a notice never lands on a prompt.
 */
export const INVITE_PROMPT_Y = 92;
export const INVITE_PROMPT_W = 300;
const PAD = 10;
/** Two lines of words: a long leader name wraps rather than spilling past the frame. */
const TEXT_H = 36;
const BUTTON_H = 20;
const BUTTON_W = 64;
const BUTTON_GAP = 6;
const COUNTDOWN_W = 40;
export const INVITE_PROMPT_H = PAD + TEXT_H + 4 + BUTTON_H + PAD;
/** The note's row under the buttons, when Accept is greyed (FS-NCC9J R24). */
const NOTE_H = 16;
/**
 * The most prompts shown at once: four stacked stay clear of the chat window on the canvas bottom
 * (the town's); where it sits higher, the floor shows fewer. A fifth waits its turn in the store
 * (its countdown running) until one above it closes.
 */
export const INVITE_PROMPT_MAX = 4;
/** Between two stacked prompts. */
const STACK_GAP = 6;
/** Between the open party panel's right edge and a prompt stepped aside for it. */
const PANEL_GAP = 12;

export interface InvitePromptFrame {
  panel: Rect;
  text: Rect;
  countdown: Rect;
  accept: Rect;
  decline: Rect;
  /** Why Accept is greyed, under the buttons; only when the placement asks for a note. */
  note?: Rect;
}

export interface InvitePromptPlacement {
  canvasWidth: number;
  /**
   * Whether the party panel is open. It stands at x 208–508 from y 56 down, across the top
   * centre, so while it is open the prompts step right of it rather than under it.
   */
  panelOpen: boolean;
  /** Whether each prompt carries a note row under its buttons (Accept greyed, FS-NCC9J R24). */
  note?: boolean;
  /**
   * The screen y the stack stays above: the chat window's top edge, which climbs onto the
   * ResourceHud in a field or a run (FS-WJGFJ R18). A prompt that would reach it waits its turn,
   * as a fifth does; the oldest always shows.
   */
  floor?: number;
}

/**
 * Each prompt's place, oldest at the top, the rest stacked below it: `INVITE_PROMPT_MAX` at most,
 * fewer when the floor comes first.
 */
export function invitePromptFrames(
  count: number,
  { canvasWidth, panelOpen, note = false, floor }: InvitePromptPlacement,
): InvitePromptFrame[] {
  const height = INVITE_PROMPT_H + (note ? NOTE_H : 0);
  const centred = Math.round((canvasWidth - INVITE_PROMPT_W) / 2);
  const x = panelOpen
    ? Math.max(centred, PARTY_PANEL_X + PARTY_PANEL_W + PANEL_GAP)
    : centred;
  const inner = { x: x + PAD, width: INVITE_PROMPT_W - PAD * 2 };
  // the nth prompt, with the gap under it, ends at INVITE_PROMPT_Y + n * (height + STACK_GAP)
  const fits =
    floor === undefined
      ? INVITE_PROMPT_MAX
      : Math.max(
          1,
          Math.floor((floor - INVITE_PROMPT_Y) / (height + STACK_GAP)),
        );

  return Array.from(
    { length: Math.min(count, INVITE_PROMPT_MAX, fits) },
    (_, i): InvitePromptFrame => {
      const y = INVITE_PROMPT_Y + i * (height + STACK_GAP);
      const by = y + PAD + TEXT_H + 4;
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
        panel: { x, y, width: INVITE_PROMPT_W, height },
        text: { ...inner, y: y + PAD, height: TEXT_H },
        countdown: { x: inner.x, y: by, width: COUNTDOWN_W, height: BUTTON_H },
        accept,
        decline,
        ...(note
          ? { note: { ...inner, y: by + BUTTON_H, height: NOTE_H } }
          : {}),
      };
    },
  );
}
