/**
 * The party panel's pure half (FS-R82NV R28–R30): when T may toggle it, the words it shows and
 * where each part sits. The scene-side `PartyPanel` draws what these return.
 */

import type { PartyActions, PartyUpdatePayload } from "@/stores/partyStore";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a focused element is, as far as the T rule cares. */
export interface FocusedElement {
  tagName: string;
  type?: string;
  isContentEditable?: boolean;
}

/** Input types a player types words into; a checkbox or a button focused is not typing. */
const TEXT_INPUT_TYPES = new Set([
  "",
  "text",
  "search",
  "email",
  "password",
  "url",
  "tel",
  "number",
]);

/** Whether the focused element takes typed keys: the chat field, the invite field, any other. */
export function isTextEntry(el: FocusedElement | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  return TEXT_INPUT_TYPES.has((el.type ?? "").toLowerCase());
}

/**
 * Whether T toggles the panel now (R28): not while a text input has focus (a T typed in chat is
 * a letter), and not while an overlay, a dialogue or a menu owns the keys.
 */
export function mayTogglePartyPanel(state: {
  blocked: boolean;
  active: FocusedElement | null | undefined;
}): boolean {
  return !state.blocked && !isTextEntry(state.active);
}

/** R30's one line for a player in no party. */
export const PARTY_HINT = "Create a party, or invite someone by name.";
/** The invite field's placeholder: a name or an id both find the player (R12). */
export const PARTY_INVITE_HINT = "Invite by name";
export const PARTY_LABEL = {
  kick: "Kick",
  transfer: "Transfer",
  leave: "Leave party",
  invite: "Invite",
  create: "Create party",
} as const;

/** Where a member stands, in the words the party frames use for it (R34). */
export function partyWhereLabel(where: string): string {
  if (where === "hub") return "village";
  if (where === "run") return "delving";
  if (where === "away") return "away";
  if (where.startsWith("field:")) return "afield";
  return where;
}

/** A class key in title case: "mage" → "Mage". */
export function partyClassLabel(cls: string): string {
  return cls ? cls[0].toUpperCase() + cls.slice(1) : "";
}

/** The panel's title: the count over the cap in a party (R21: `size` is the cap), else plain. */
export function partyPanelTitle(party: PartyUpdatePayload | null): string {
  return party ? `Party (${party.members.length}/${party.size})` : "Party";
}

/**
 * Right of the party frames (R28): those sit on the left edge under the XP bar, so the panel
 * starts past their width, below the XP bar's band.
 */
export const PARTY_PANEL_X = 208;
export const PARTY_PANEL_Y = 56;
export const PARTY_PANEL_W = 300;
const PAD = 12;
const TITLE_H = 24;
/** A member row: the name over the class and where, two lines. */
export const PARTY_ROW_H = 38;
const BUTTON_H = 20;
const KICK_W = 44;
const TRANSFER_W = 60;
const BUTTON_GAP = 6;
const LOOT_H = 22;
const HINT_H = 22;
const CREATE_H = 24;
const CREATE_W = 104;
const INVITE_H = 26;
const INVITE_BUTTON_W = 56;
const LEAVE_H = 24;
const LEAVE_W = 96;
const GAP = 8;

export interface PartyRowFrame {
  row: Rect;
  transfer: Rect;
  kick: Rect;
}

export interface PartyPanelFrame {
  panel: Rect;
  title: Rect;
  rows: PartyRowFrame[];
  /** The loot-rule selector's reserved slot (FS-V780R), in a party only. */
  loot?: Rect;
  /** R30's line, with no party only. */
  hint?: Rect;
  /** The Create party button (R30), with no party only. */
  create?: Rect;
  /** The invite row: the DOM field at the left, its Invite button beside it (R29). */
  invite: Rect;
  inviteField: Rect;
  inviteButton: Rect;
  leave?: Rect;
}

/** Every part's place, from the actions the viewer has now (which decide the panel's shape). */
export function partyPanelFrame(
  actions: PartyActions,
  x = PARTY_PANEL_X,
  y = PARTY_PANEL_Y,
): PartyPanelFrame {
  const inner = { x: x + PAD, width: PARTY_PANEL_W - PAD * 2 };
  let at = y + PAD;
  const title: Rect = { ...inner, y: at, height: TITLE_H };
  at += TITLE_H;

  const rows = actions.members.map((): PartyRowFrame => {
    const row: Rect = { ...inner, y: at, height: PARTY_ROW_H };
    const by = at + (PARTY_ROW_H - BUTTON_H) / 2;
    const kick: Rect = {
      x: inner.x + inner.width - KICK_W,
      y: by,
      width: KICK_W,
      height: BUTTON_H,
    };
    const transfer: Rect = {
      x: kick.x - BUTTON_GAP - TRANSFER_W,
      y: by,
      width: TRANSFER_W,
      height: BUTTON_H,
    };
    at += PARTY_ROW_H;
    return { row, transfer, kick };
  });

  let loot: Rect | undefined;
  let hint: Rect | undefined;
  let create: Rect | undefined;
  if (actions.inParty) {
    loot = { ...inner, y: at, height: LOOT_H };
    at += LOOT_H;
  } else {
    hint = { ...inner, y: at, height: HINT_H };
    at += HINT_H + GAP / 2;
    create = { x: inner.x, y: at, width: CREATE_W, height: CREATE_H };
    at += CREATE_H;
  }

  at += GAP / 2;
  const invite: Rect = { ...inner, y: at, height: INVITE_H };
  const inviteButton: Rect = {
    x: inner.x + inner.width - INVITE_BUTTON_W,
    y: at + (INVITE_H - BUTTON_H) / 2,
    width: INVITE_BUTTON_W,
    height: BUTTON_H,
  };
  const inviteField: Rect = {
    x: inner.x,
    y: at,
    width: inner.width - INVITE_BUTTON_W - BUTTON_GAP,
    height: INVITE_H,
  };
  at += INVITE_H;

  let leave: Rect | undefined;
  if (actions.inParty) {
    at += GAP;
    leave = {
      x: inner.x + inner.width - LEAVE_W,
      y: at,
      width: LEAVE_W,
      height: LEAVE_H,
    };
    at += LEAVE_H;
  }

  const panel: Rect = { x, y, width: PARTY_PANEL_W, height: at + PAD - y };
  return {
    panel,
    title,
    rows,
    loot,
    hint,
    create,
    invite,
    inviteField,
    inviteButton,
    leave,
  };
}
