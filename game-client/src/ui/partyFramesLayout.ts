/**
 * The party frames' pure half (FS-R82NV R34, R35): which rows the left edge shows, what fills each
 * row's bar slot, and where every part sits. The scene-side `PartyFrames` draws what these return.
 */

import type { WorldType } from "@/assets/types/client";
import type { PartyMember, PartyUpdatePayload } from "@/stores/partyStore";
import type { PlayerState } from "@/types/gameState";
import { characterSheet } from "@/render/art/animationSelect";
import type { FrameQuery } from "@/render/art/library";
import { directionIndex } from "@/render/art/manifest";
import { partyWhereLabel, type Rect } from "./partyPanelLayout";
import { PROGRESS_HUD_AT, PROGRESS_HUD_H, PROGRESS_HUD_W } from "./ProgressHud";
import { fillOf, resourceBar, type HudBar } from "./resources";

/**
 * What a frame's bar slot holds: the member's health (and resource, when it is on the wire) as
 * the state broadcast carries them (FS-CH21F), or a short state word where it does not (R34).
 */
export type PartyFrameSlot =
  | { kind: "bars"; health: number; resource?: HudBar }
  | { kind: "word"; word: string };

/** One member's frame. */
export interface PartyFrameRow {
  player_id: string;
  name: string;
  class: string;
  leader: boolean;
  slot: PartyFrameSlot;
}

/** The slice of a broadcast player the frames read. */
export type SeenPlayer = Pick<
  PlayerState,
  "id" | "current_health" | "max_health" | "resource"
>;

/** What this state shows of the players: the player's own, and the others' broadcast. */
export interface SeenState {
  current_player?: SeenPlayer | null;
  other_players?: readonly SeenPlayer[];
}

/**
 * The player's own bar slot (R34): always both bars, from their own state, in every world. The
 * resource is left out only while the state does not carry it (the frames draw its bar empty),
 * and the bars stand empty before the first state.
 */
function selfSlotOf(me: SeenPlayer | null | undefined): PartyFrameSlot {
  const health =
    me?.current_health !== undefined && me.max_health !== undefined
      ? fillOf(me.current_health, me.max_health)
      : 0;
  return barsOf(health, me?.resource);
}

/**
 * A teammate's bar slot (R34): a disconnected member is "away" whatever a stale state says; bars
 * when this world's broadcast lists the member with their health, never in the hub (no bars
 * there, FS-CH21F, FS-8AY7S R28); otherwise the word for where the party pod says they stand.
 */
function slotOf(
  m: PartyMember,
  world: WorldType | null,
  seen: SeenPlayer | undefined,
): PartyFrameSlot {
  if (m.where === "away" || !m.online) return { kind: "word", word: "away" };
  if (
    world !== "hub" &&
    seen?.current_health !== undefined &&
    seen.max_health !== undefined
  ) {
    return barsOf(fillOf(seen.current_health, seen.max_health), seen.resource);
  }
  return { kind: "word", word: partyWhereLabel(m.where) };
}

/** A bar slot: the health fill, and the resource when the state carries one. */
function barsOf(
  health: number,
  resource: SeenPlayer["resource"],
): PartyFrameSlot {
  return resource
    ? { kind: "bars", health, resource: resourceBar(resource) }
    : { kind: "bars", health };
}

/**
 * One row per member (R34): the player's own first, then the others in join order (the order the
 * party pod lists them), the leader's row flagged. The player's row fills from `current_player`,
 * a teammate's from `other_players` by member id. No party, no rows.
 */
export function partyFrameRows(
  party: PartyUpdatePayload | null,
  selfId: string | undefined,
  world: WorldType | null,
  seen: SeenState = {},
): PartyFrameRow[] {
  if (!party) return [];
  const byId = new Map((seen.other_players ?? []).map((p) => [p.id, p]));
  const row = (m: PartyMember, slot: PartyFrameSlot): PartyFrameRow => ({
    player_id: m.player_id,
    name: m.name,
    class: m.class,
    leader: m.player_id === party.leader_id,
    slot,
  });
  const self = party.members.filter((m) => m.player_id === selfId);
  const others = party.members.filter((m) => m.player_id !== selfId);
  return [
    ...self.map((m) => row(m, selfSlotOf(seen.current_player))),
    ...others.map((m) => row(m, slotOf(m, world, byId.get(m.player_id)))),
  ];
}

/**
 * The standing frame a member's class bust is cut from (R34): the class's own baked sheet (the one
 * that walks in the run, `characterSheet`), its idle pose facing the viewer, as the menus stand
 * it. The scene resolves it through the art library and crops it with `ui/bust.ts`.
 */
export interface PartyBustFrame extends Required<FrameQuery> {
  sheet: string;
}

export function partyBustFrame(playerClass: string): PartyBustFrame {
  return {
    sheet: characterSheet(playerClass),
    animation: "idle",
    direction: directionIndex(BUST_FACING),
    index: 0,
  };
}

/** A figure facing the viewer on the 2:1 iso camera, as `MenuFigure` stands one. */
const BUST_FACING = "se";

/** Where one frame's parts sit. */
export interface PartyFrameRect {
  /** The frame's backing panel. */
  row: Rect;
  /** The medallion: its centre and radius. */
  bust: { x: number; y: number; r: number };
  /** The name's top-left; the leader mark takes {@link PARTY_LEADER_MARK_W} of it first. */
  name: { x: number; y: number };
  health: Rect;
  resource: Rect;
  /** The state word's top-left, in the bar slot. */
  word: { x: number; y: number };
}

/**
 * A frame's width (R34): exactly the level/XP frame's outer width, so the left edge of the HUD
 * reads as one column; a field, which has no XP bar, keeps the same. It ends left of the T panel
 * (`PARTY_PANEL_X` 208, R28).
 */
const FRAME_W = PROGRESS_HUD_W;
const ROW_H = 40;
const ROW_GAP = 6;
const PAD = 4;
/** Room kept between the bars' right end and the frame's edge. */
const BAR_RIGHT_PAD = 8;
const MEDALLION_R = 16;
const TEXT_GAP = 8;
/** Half the HUD's own 8 px bar (`ResourceHud`), as R34 asks. */
const BAR_H = 4;
const BAR_GAP = 3;
/** Where the name, the bars and the state word sit below a frame's top edge. */
const NAME_Y = 3;
const HEALTH_Y = 22;
const WORD_Y = 19;
/** Room the leader's crown takes before the name. */
export const PARTY_LEADER_MARK_W = 14;

/** Each frame's place, the first at `top`, the rest stacked below it on the same left edge. */
export function partyFramesFrame(
  count: number,
  x: number,
  top: number,
): PartyFrameRect[] {
  return Array.from({ length: count }, (_, i): PartyFrameRect => {
    const y = top + i * (ROW_H + ROW_GAP);
    const bust = { x: x + PAD + MEDALLION_R, y: y + ROW_H / 2, r: MEDALLION_R };
    const textX = bust.x + MEDALLION_R + TEXT_GAP;
    const bar = {
      x: textX,
      width: x + FRAME_W - BAR_RIGHT_PAD - textX,
      height: BAR_H,
    };
    return {
      row: { x, y, width: FRAME_W, height: ROW_H },
      bust,
      name: { x: textX, y: y + NAME_Y },
      health: { ...bar, y: y + HEALTH_Y },
      resource: { ...bar, y: y + HEALTH_Y + BAR_H + BAR_GAP },
      word: { x: textX, y: y + WORD_Y },
    };
  });
}

/** The gap kept under the XP bar, as the T panel keeps under the hub's. */
const UNDER_XP_BAR = 6;

/**
 * Where the frames stand in each world (R34): on the left edge, under the level/XP bar where
 * there is one (`PROGRESS_HUD_AT`, the scenes' own corners), at the top-left corner of a field,
 * which has none. All clear of the chat window bottom-left; the layout test pins the clearance.
 */
export const PARTY_FRAMES_PLACEMENT: Readonly<
  Record<WorldType, { x: number; top: number }>
> = {
  hub: underXpBar(PROGRESS_HUD_AT.hub),
  run: underXpBar(PROGRESS_HUD_AT.run),
  field: { x: 10, top: 16 },
};

function underXpBar(at: { x: number; y: number }): { x: number; top: number } {
  return { x: at.x, top: at.y + PROGRESS_HUD_H + UNDER_XP_BAR };
}
