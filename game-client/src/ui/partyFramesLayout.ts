/**
 * The party frames' pure half (FS-R82NV R34, R35; FS-NCC9J R25, R26): which rows the left edge
 * shows, what fills each member's bar slot, and where every part sits. The scene-side
 * `PartyFrames` draws what these return.
 */

import type { WorldType } from "@/assets/types/client";
import {
  memberAway,
  reservedSlots,
  type PartyMember,
  type PartyUpdatePayload,
} from "@/stores/partyStore";
import type { PlayerState } from "@/types/gameState";
import { characterSheet } from "@/render/art/animationSelect";
import type { FrameQuery } from "@/render/art/library";
import { directionIndex } from "@/render/art/manifest";
import type { Rect } from "./partyPanelLayout";
import {
  HUD_COLUMN_W,
  RESOURCE_HUD_AT,
  resourceHudHeight,
} from "./ResourceHud";
import { fillOf, resourceBar, type HudBar } from "./resources";

/**
 * What a member frame's bar slot holds: the member's health (and resource, when it is on the
 * wire) as this world's state carries them (FS-CH21F), or nothing where it does not: the missing
 * bars are the "not here" signal (FS-NCC9J R25).
 */
export type PartyFrameSlot =
  | { kind: "bars"; health: number; resource?: HudBar }
  | { kind: "none" };

/** One member's frame. */
export interface PartyMemberFrameRow {
  kind: "member";
  player_id: string;
  name: string;
  class: string;
  leader: boolean;
  /** Away or offline: the frame is drawn greyed (FS-NCC9J R25). Never the player's own. */
  away: boolean;
  slot: PartyFrameSlot;
  /**
   * "Lv N" after the name (FS-CH21F R10, amended 2026-11-02): on the player's own row, their own
   * state's level (`current_player.level`) whenever the state carries it, in every world; on a
   * teammate's, their broadcast level only while their slot holds bars (this world's state lists
   * them). Never on a teammate elsewhere (R11).
   */
  level?: number;
}

/**
 * An open invite's row (FS-NCC9J R26): the invitee's name, a grey pulse where the bust and bars
 * go, no countdown.
 */
export interface PartySkeletonRow {
  kind: "skeleton";
  name: string;
}

export type PartyFrameRow = PartyMemberFrameRow | PartySkeletonRow;

/** The slice of a broadcast player the frames read. */
export type SeenPlayer = Pick<
  PlayerState,
  "id" | "current_health" | "max_health" | "resource" | "level"
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
 * A teammate's bar slot (FS-NCC9J R25; FS-CH21F R8, R12): bars when this world's state lists the
 * member with their health, in every world, the hub included; otherwise nothing. Decided from the
 * state alone, never from the party's `where` or `pod_id`: a field of the same name on another
 * pod is not this world.
 */
function slotOf(seen: SeenPlayer | undefined): PartyFrameSlot {
  if (seen?.current_health !== undefined && seen.max_health !== undefined) {
    return barsOf(fillOf(seen.current_health, seen.max_health), seen.resource);
  }
  return { kind: "none" };
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
 * party lists them), the leader's row flagged, an away teammate's marked. The player's row fills
 * from `current_player` (bars and level), a teammate's from `other_players` by member id, the
 * same in every world (FS-CH21F R8, R10, R12): the state alone decides, so the world is not asked.
 * Then one skeleton row per open invite (FS-NCC9J R26), skipping a name already among the
 * members; never more rows than the party's size. No party, no rows.
 */
export function partyFrameRows(
  party: PartyUpdatePayload | null,
  selfId: string | undefined,
  seen: SeenState = {},
): PartyFrameRow[] {
  if (!party) return [];
  const byId = new Map((seen.other_players ?? []).map((p) => [p.id, p]));
  const row = (
    m: PartyMember,
    away: boolean,
    slot: PartyFrameSlot,
    level?: number,
  ): PartyMemberFrameRow => ({
    kind: "member",
    player_id: m.player_id,
    name: m.name,
    class: m.class,
    leader: m.player_id === party.leader_id,
    away,
    slot,
    ...(level !== undefined && { level }),
  });
  const teammate = (m: PartyMember): PartyMemberFrameRow => {
    const mate = byId.get(m.player_id);
    const slot = slotOf(mate);
    return row(
      m,
      memberAway(m),
      slot,
      slot.kind === "bars" ? mate?.level : undefined,
    );
  };
  const self = party.members.filter((m) => m.player_id === selfId);
  const others = party.members.filter((m) => m.player_id !== selfId);
  const names = new Set(party.members.map((m) => m.name));
  const skeletons = reservedSlots(party)
    .filter((r) => !names.has(r.name))
    .map((r): PartySkeletonRow => ({ kind: "skeleton", name: r.name }));
  const members = [
    ...self.map((m) =>
      row(
        m,
        false,
        selfSlotOf(seen.current_player),
        seen.current_player?.level,
      ),
    ),
    ...others.map(teammate),
  ];
  return [
    ...members,
    ...skeletons.slice(0, Math.max(0, party.size - members.length)),
  ];
}

/**
 * The Travel button on the leader's frame (FS-NCC9J R28): hidden with no party, for the leader,
 * for a member already on the leader's pod (the same `pod_id`), and whenever either pod is unknown
 * (a missing or empty `pod_id`: the leader on no pod is offline, and nothing is offered that may
 * go nowhere; I-NCC9J-8, Nick); greyed outside the player's own town (a field, a run) and while the
 * leader is away; live otherwise. Pure, so every rule is tested without a canvas.
 */
export type TravelButton = "hidden" | "greyed" | "live";

export function travelButton(
  party: PartyUpdatePayload | null,
  selfId: string | undefined,
  world: WorldType | null,
): TravelButton {
  if (!party || selfId === undefined || party.leader_id === selfId)
    return "hidden";
  const self = party.members.find((m) => m.player_id === selfId);
  const leader = party.members.find((m) => m.player_id === party.leader_id);
  if (!self || !leader) return "hidden";
  if (!self.pod_id || !leader.pod_id || self.pod_id === leader.pod_id)
    return "hidden";
  if (world !== "hub" || memberAway(leader)) return "greyed";
  return "live";
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
}

/**
 * A frame's width (R34): the left-edge column's (FS-77DVN §E.19), the resource bars' too, so the
 * left edge of the HUD reads as one column in every world. It ends left of the T panel, centred
 * across the view (FS-R82NV § Change C3: x 390 at its narrowest).
 */
const FRAME_W = HUD_COLUMN_W;
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
/** Where the name and the bars sit below a frame's top edge. */
const NAME_Y = 3;
const HEALTH_Y = 22;
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
    };
  });
}

const TRAVEL_W = 46;
const TRAVEL_H = 16;
/** Room kept between the Travel button and the frame's right edge. */
const TRAVEL_RIGHT_PAD = 4;

/**
 * Where the Travel button sits (FS-NCC9J R28): inside the leader's frame, on the name line at its
 * right end, above the bars. Inside, not past the frame's edge, so the left edge of the HUD stays
 * one column.
 */
export function partyTravelButtonRect(frame: PartyFrameRect): Rect {
  return {
    x: frame.row.x + frame.row.width - TRAVEL_RIGHT_PAD - TRAVEL_W,
    y: frame.row.y + NAME_Y,
    width: TRAVEL_W,
    height: TRAVEL_H,
  };
}

/** Room kept between a name's end and what follows it: the frame's edge or the Travel button. */
const NAME_END_GAP = 6;
/**
 * Room kept between a teammate's name and the "Lv N" after it (FS-CH21F R10). The level is
 * measured on the canvas, so the name's room less the level and this gap is what the name keeps.
 */
export const PARTY_LEVEL_GAP = 5;

/**
 * How wide a frame's name may run (R34; FS-NCC9J R28): from where it starts, after the leader's
 * crown, to the frame's edge, or to the Travel button when the leader's frame carries one. A name
 * longer than this is shortened (character names run to 32 characters).
 */
export function partyNameRoom(
  frame: PartyFrameRect,
  leader: boolean,
  travel: boolean,
): number {
  const start = frame.name.x + (leader ? PARTY_LEADER_MARK_W : 0);
  const end = travel
    ? partyTravelButtonRect(frame).x
    : frame.row.x + frame.row.width - BAR_RIGHT_PAD;
  return end - NAME_END_GAP - start;
}

/** The clear gap kept under the resource bars, so a frame never reads as a copy of them. */
const UNDER_RESOURCE_BARS = 24;
/** Health and a class resource: the tallest the resource bars get. */
const RESOURCE_BAR_ROWS = 2;

/** The hub's inset from the top-left corner, where it has no resource bars (FS-77DVN §E.18). */
const HUB_INSET = 16;

/**
 * Where the frames stand in each world (R34): on the left edge, under the resource bars where a
 * world has them (`RESOURCE_HUD_AT`, a run and a field), in the hub's top-left corner otherwise.
 * A fixed top per world, measured from the bars at their tallest, so the frames stay put when the
 * bars come down (fallen, resolved). All clear of the chat window bottom-left; the layout test
 * pins the clearance.
 */
export const PARTY_FRAMES_PLACEMENT: Readonly<
  Record<WorldType, { x: number; top: number }>
> = {
  hub: { x: HUB_INSET, top: HUB_INSET },
  run: underResourceBars(RESOURCE_HUD_AT.run),
  field: underResourceBars(RESOURCE_HUD_AT.field),
};

function underResourceBars(at: { x: number; y: number }): {
  x: number;
  top: number;
} {
  return {
    x: at.x,
    top: at.y + resourceHudHeight(RESOURCE_BAR_ROWS) + UNDER_RESOURCE_BARS,
  };
}
