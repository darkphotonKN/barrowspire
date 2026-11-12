import * as Phaser from "phaser";
import { createAtmosphere } from "@/utils/atmosphere";
import { ActionType, WorldType } from "@/assets/types/client";
import { useGameStore } from "@/stores/gameStore";
import { isLeader, usePartyStore, type PartyNoticePayload, type PartyUpdatePayload } from "@/stores/partyStore";
import { useAuthStore } from "@/stores/authStore";
import { CANVAS_FONT, palette, rgba, shade, toCss } from "@/utils/canvasPalette";
import { socketManager } from "@/utils/class/SocketManager";
import {
  ClientGameState,
  GateState,
  NPCState,
  PublicPlayerState,
  Position,
  WallState,
} from "@/types/gameState";
import { fieldRefusalCopy, spireRefusalCopy } from "./fieldRefusals";
import {
  FIELD_IDS,
  FIELD_NAMES,
  fieldOf,
  gateAt,
  gateEdges,
  gatesInThisBuild,
  signpostOf,
  type FieldDestination,
} from "./hubGates";
import { BARROW_HEX } from "@/utils/theme";
import { PROGRESS_HUD_AT, ProgressHud } from "@/ui/ProgressHud";
import { ChatWindow, mountChatWindow } from "@/ui/ChatWindow";
import { PartyPanel, mountPartyPanel } from "@/ui/PartyPanel";
import { escapeStep } from "@/ui/escapeOrder";
import { HudCorner } from "@/ui/HudCorner";
import { PartyFrames, mountPartyFrames } from "@/ui/PartyFrames";
import { PartyInvitePrompt, mountPartyInvitePrompt } from "@/ui/PartyInvitePrompt";
import { PartyReadyCheck, mountPartyReadyCheck } from "@/ui/PartyReadyCheck";
import { MailboxHud, mountMailbox } from "@/ui/mailboxHud";
import { PARTY_ENTER_REFUSALS, partyEnterDoorText } from "@/ui/partyNotice";
import { GearOverlay } from "@/ui/GearOverlay";
import { HubGear, gearAsCharacter } from "@/ui/HubGear";
import { PurseReader } from "@/ui/purse";
import { useMailboxStore } from "@/stores/mailboxStore";
import { apiClient } from "@/utils/api";
import { showDialogueCard } from "@/ui/npcDialogue";
import { showMenuPanel, type MenuKeys, type MenuTones } from "@/ui/menuPanel";
import { progressOf } from "@/ui/progress";
import {
  ensureCharacterTextures,
  ensureVillagerTexture,
  placeholderTexture,
  drawPlayerLegs,
} from "@/utils/characterTextures";
import {
  WALL_HEIGHT,
  addUprightBlock,
  addWorldPlane,
  facingFrom,
  nearestScreenFacing,
  projectedBounds,
  standAt,
  worldDepth,
  worldToScreen,
  type Facing8,
  type Point,
} from "@/render/iso";
import { preloadArt, registerArt } from "@/render/art/phaser";
import { SCENE_ART } from "@/render/art/sceneArt";
import { drawTorchBar } from "@/ui/torchBar";
import type { ArtLibrary } from "@/render/art/library";
import { CharacterAnimator } from "@/render/art/character";
import { folkLook } from "@/render/art/hubFolk";
import { AMBIENT, LightMap, type LightSource } from "@/render/lighting";
import { cursorCss, cursorSource } from "@/render/cursors";
// the effects module has no barrel: its runtime and smoke are imported by path
import { EffectsRuntime } from "@/render/effects/runtime";
import { ChimneySmoke } from "@/render/effects/smoke";
import { townLines, type TownLines } from "./townLines";
import {
  MARKER_DEPTH,
  NPC_NAME_PX,
  isFunctionNPC,
  markerBase,
  sigilPoints,
} from "@/render/markers";
import {
  BAKE,
  BuildingView,
  GroundLayer,
  Occluders,
  PLACEHOLDER_STONE,
  addBuildings,
  addGables,
  addProp,
  addRoof,
  addWalls,
  coverOf,
  doorGaps,
  hasWallArt,
  showState,
  housesFrom,
  insideHouse,
  slabCover,
  tileHash,
  worldSeed,
  type BuiltBuilding,
  type BuiltWalls,
  type Cover,
  type Figure,
  type Occupant,
  type Stamp,
  type Visible,
  type House,
  type Scenery,
} from "@/render/world";
import {
  HUB_APRONS,
  HUB_BEYOND_EDGE,
  HUB_BEYOND_EDGE_FENCES,
  HUB_CAMERA_MARGIN,
  HUB_CARTS,
  HUB_CRATES,
  HUB_DRESSING,
  HUB_FENCES,
  HUB_GATE_DRESSING,
  HUB_HEARTH,
  HUB_PATHS,
  HUB_SPIRE_FACADE,
  HUB_STALLS,
  HUB_WASHING_LINE,
  HUB_WELL,
  fenceSegments,
  type PropSpot,
} from "@/render/world/hubKeepOut";
import {
  HUB_INDOOR_DRESSING,
  furnishingOf,
  partitionInside,
  placeholderWarning,
  residentFacing,
  splitFurnishings,
  townHouseLook,
} from "@/render/world/hubInteriors";
import { OUTDOOR_GROUND, type GroundLook } from "@/render/world/ground";
import { planChimney } from "@/render/world/roofs";
import { CHEST, chestFrame, paintChest, type ChestFrame } from "@/render/world/chest";
import {
  HUB_STASH_CHEST,
  STASH_CHEST_TINT,
  STASH_NAME,
  paintStashPlate,
  stashPlate,
} from "@/render/world/hubStash";
import { nearestInReach } from "./hubReach";
import { onSceneEnd, releaseCaptures, type SceneEnd } from "./sceneEnd";
import { holdOneShots, type HeldMessages, type OneShotHandlers } from "./heldMessages";

/**
 * What the server sends the hub once, unasked: the queue's progress and handoff, the ready check
 * and the party's notices (game-service party.go, party_entry.go). Replies to the hub's own asks
 * cannot come before create, which sends them.
 */
const HUB_ONE_SHOTS = ["queue_status", "world_handoff", "world_handoff_failed", "party_ready_check", "party_notice"];
import {
  INTERIOR_PARTITION,
  MASONRY_WALLS,
  trimCrop,
  type WallSheets,
} from "@/render/world/walls";
import { buildingWallShadows, shadowsWithin, type GroundShadows } from "@/render/world/wallShadows";
import { boundCamera, crispen, followWith, relayoutOn, viewport } from "@/render/viewport";
import { ArrivalCard, cardLeaves } from "@/ui/arrivalCard";
import { placeCard } from "@/ui/placeCard";

/** Moves a world position a step toward its target. */
function easeToward(pos: Point, target: Point): void {
  pos.x = Phaser.Math.Linear(pos.x, target.x, POSITION_LERP);
  pos.y = Phaser.Math.Linear(pos.y, target.y, POSITION_LERP);
}

const HUB_WIDTH = 2000;
const HUB_HEIGHT = 1000;
/** Screen px of dark beyond the projected diamond the camera may show at the map edge. */
const CAMERA_MARGIN = HUB_CAMERA_MARGIN;
/**
 * Screen px from a player's marker base (`markerBase`: a baked head, or the preview's frame top)
 * to the middle of their name label: a 60 px preview centred on the footprint keeps its label at
 * -34, where it always was.
 */
const NAME_GAP = 4;
/** Screen px between a function NPC's sigil and the top of its name (FS-MRZH7 req 4). */
const SIGIL_GAP = 3;
/**
 * Screen px from the stash chest's footprint to the middle of its nameplate: just over the baked
 * chest's lid (FS-VPD8Y R33).
 */
const STASH_NAME_LIFT = 58;
/**
 * What lies flat on a floor (a rug, the stash chest's plate): over the ground and its trails, under
 * the world band, so nothing standing on it is drawn under it.
 */
const FLOOR_DECAL_DEPTH = 1;
/** The stash chest's plate sits on the floor. */
const STASH_PLATE_DEPTH = FLOOR_DECAL_DEPTH;
/** World px tall: a furnishing's placeholder block, low enough to read as furniture, not a wall. */
const FURNISHING_PLACEHOLDER_HEIGHT = 8;
/**
 * World px tall: the Inn's partition's placeholder block without art, low like the baked masonry
 * it stands for, so the camera sees over it into either hall; taller than furniture.
 */
const PARTITION_PLACEHOLDER_HEIGHT = 12;
/** How hard sprites chase the server's position each frame. Matches the run scene. */
const POSITION_LERP = 0.3;
/** Stride advance per server tick, matching the run scene. */
const WALK_STEP = 0.3;
/**
 * Scenery, at fixed points like everything else in the hub. None of it blocks —
 * see drawScenery — so it lives here rather than in the world.
 */
const HEARTH = HUB_HEARTH;
/** How far a roof overhangs the walls it rests on. */
const ROOF_EAVE = 10;
/** A chimney over the roof piece it stands on (layer 2), on the same footprint. */
const CHIMNEY_LAYER = 3;
/** A town wall's placeholder block without art: dark timber, as the pre-art town was drawn. */
const TIMBER_PLACEHOLDER = {
  top: BARROW_HEX.barrowDeep,
  south: shade(BARROW_HEX.barrowDeep, 0.3),
  east: shade(BARROW_HEX.barrowDeep, 0.5),
  edge: { width: 2, color: BARROW_HEX.barrowBrown, alpha: 0.8 },
};
/*
 * The well, market stalls, carts, crates, fences and the new dressing stand at the fixed spots in
 * render/world/hubKeepOut.ts, every one clear of the walking ground (FS-KYPQ9 §A.3–§A.5).
 */
/**
 * Lamp posts along the paths: the hub's lit places after dusk (FS-2325V §C.7). The last moved off
 * the east road's drop (FS-0XMCP R19), from (1390, 650).
 */
const LAMP_POSTS: [number, number][] = [
  [930, 490],
  [1090, 490],
  [690, 650],
  [1420, 640],
];
/** Trodden ground, joining the spawn to the people worth walking to, and on to the gates. */
const PATHS = HUB_PATHS;
/**
 * Trees and bushes. Off the gates' approaches (FS-0XMCP R19, K8): trees moved from (500, 360) and
 * (1500, 330), bushes from (640, 700), (1320, 560) and (1000, 300).
 */
const TREES: [number, number][] = [
  [430, 300], [470, 330], [1420, 260], [1500, 280], [1470, 205],
  [180, 820], [260, 880], [1900, 600], [1900, 780], [560, 900],
  [700, 760], [1180, 880],
];
const GRASS: [number, number][] = [
  [560, 520], [640, 740], [820, 480], [880, 820], [1120, 500],
  [1240, 700], [1310, 565], [760, 600], [980, 880], [1400, 780],
  [160, 600], [1880, 480], [520, 780], [1160, 420], [900, 660],
];
/**
 * Daylight over the road east (FS-0XMCP R18): the ground beyond the Meadows gate is lighter, a
 * pale steady pool on the light-map where the road leaves the hub. Not amber: nothing to act on.
 */
const MEADOWS_DAYLIGHT = { at: { x: 2120, y: 365 }, radius: 320, intensity: 0.5 } as const;
/**
 * Trees past the edge darken toward pitch with depth (FS-0XMCP R18, "into the dark"): the tint
 * reaches its darkest, `most`, `over` world px past the edge.
 */
const EDGE_DUSK = { over: 330, most: 0.75 } as const;

/** The baked trees the hub's tree spots choose between, by a hash of the spot. */
const TREE_SHEETS = ["tree_oak", "tree_pine", "tree_oak_autumn"];
/** Seeds the hub's scenery variant picks, so every client plants the same trees. */
const SCENERY_SEED = 0x5343_4e31;

/** How close a player stands to talk. Matches the server's NPCInteractRange. */
const NPC_TALK_RANGE = 80;

/** Screen px between the queue panel and its Leave button. */
const LEAVE_GAP = 8;
/** A passing notice: where it sits (screen px from the top, under the progress bar) and for how long. */
const NOTICE_Y = 72;
/** The queue panel's top edge: centred at the top, above the notice band (moved off the chat window). */
const QUEUE_Y = 20;
const NOTICE_MS = 3200;

/**
 * One line of HUD chrome on a charcoal ground: the queue panel, its Leave button and a passing
 * notice are all this shape, so they stand the same height side by side. The colour is the
 * channel (docs/design-guideline.md, Gameplay accent): vellum to read, amber to press.
 */
function hudLine(colour: number): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: CANVAS_FONT.body,
    fontSize: "14px",
    color: toCss(colour),
    backgroundColor: toCss(BARROW_HEX.charcoal),
    padding: { x: 12, y: 8 },
  };
}

/**
 * The queue panel's words: the HUD's type with no ground of its own, an outline in the darkest
 * ramp token keeping them legible over the town (moved to the top centre 2026-10-31).
 */
function queueLine(colour: number): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: CANVAS_FONT.body,
    fontSize: "14px",
    color: toCss(colour),
    stroke: toCss(BARROW_HEX.pitch),
    strokeThickness: 3,
  };
}

/** One line of the hub's ESC menu (FS-G4VMQ §Requirements 3). */
export interface HubMenuChoice {
  id: "change" | "leave" | "back";
  label: string;
  /** Amber for a thing the player can do, the cancel register for going back. */
  register: "actionable" | "cancel";
}

/**
 * What the ESC menu offers, from the scene's state at the moment it opens: the way to the main
 * menu and the way back into the hub always; leaving the queue only while there is a queue to
 * leave. The menu never names the hub ("hub" has no lore name), so it names what changes, the
 * character, not where the player goes.
 */
export function hubMenuChoices(state: { queued: boolean }): HubMenuChoice[] {
  const choices: HubMenuChoice[] = [
    { id: "change", label: "Change character", register: "actionable" },
  ];
  if (state.queued) choices.push({ id: "leave", label: "Leave the queue", register: "actionable" });
  choices.push({ id: "back", label: "Back  [Esc]", register: "cancel" });
  return choices;
}

/** What the hub knows that a dialogue reads: at opening, and live while it is up. */
interface HubState {
  queued: boolean;
  /** Where the player stands in a party (FS-BJNYC R20, R21); a party of just its leader is led. */
  party: PartyStanding;
}

/** In no party, a member who does not lead it, or its leader. */
type PartyStanding = "none" | "member" | "leader";

/** Where this player stands in `party`, as the server keys its members (the socket's member id). */
function partyStanding(party: PartyUpdatePayload | null): PartyStanding {
  if (party === null) return "none";
  return isLeader(party, useAuthStore.getState().memberInfo?.id) ? "leader" : "member";
}

/** The replies a dialogue's choices wait on, read live each time a choice is drawn or pressed. */
interface Pending {
  /** A start_solo is awaiting its answer (FS-NSV3D §Requirements 2). */
  soloPending: boolean;
  /** A party_enter is awaiting its answer (FS-BJNYC R21). */
  enterPending: boolean;
  /** A find_game is awaiting its answer (FS-BJNYC R21). */
  queuePending: boolean;
}

/** One choice in an NPC's dialogue (FS-NSV3D §Requirements 3). */
export interface DialogueChoice {
  id: string;
  label: string;
  /** Amber for a thing the player can do, the cancel register for closing the box. */
  register: "actionable" | "cancel";
  /** What picking it does; without one, picking it only closes the dialogue. */
  act?: (scene: HubScene) => void;
  /** The dialogue stays up after the pick: a reply is being waited for. */
  stays?: boolean;
  /** Whether it can be picked now, read live each time it is drawn or pressed; omitted means always. */
  enabled?: (pending: Pending) => boolean;
  /** Picking it turns the page: the same speaker goes on with this, instead of the box closing. */
  next?: () => Dialogue;
}

/** What an NPC says and offers: a line and its choices, any number of them. */
export interface Dialogue {
  /** Who they are, under their name on the card. Residents have none. */
  role?: string;
  line: string;
  choices: DialogueChoice[];
}

/** Who speaks when the player steps up to the Spire gate: the place, not a keeper. */
const SPIRE_DOOR = "The Spire's door";

/** The door's opening line, the same for everyone whatever their party (FS-BJNYC R20). */
const DOOR_LINE = "The Spire's door stands open. Few return whole,\nand fewer return twice.";

/**
 * What the Spire's door offers, from the hub's state as the panel opens (FS-NSV3D §Requirements
 * 1, 2, 4; FS-0XMCP §Requirements 8, 9; FS-BJNYC R20–R22): as a party, alone, with company, or
 * not yet. While the player is already queued there is nothing to offer but the fact, so the panel
 * says so and closes; the corner panel carries the count. The door is a place, not a keeper, so
 * its card carries no role.
 *
 * Every player sees every choice, whatever their party: the server decides, and a choice that does
 * not apply is refused in words (`refusal`, said in place of the opening line). One order for
 * everyone, Enter as a party third (key 3), whatever the party (FS-BJNYC R21, amended 2026-11-02,
 * Nick); E and Enter press the first. Each of the three keeps the door up
 * until it is answered and is held back only while its own send is unanswered.
 */
export function delveChoices(state: HubState, refusal?: string): Dialogue {
  if (state.queued) {
    return {
      line: "The delve is gathering. Wait, or leave the queue.",
      choices: [{ id: "dismiss", label: "I'll wait", register: "cancel" }],
    };
  }
  const enter: DialogueChoice = {
    id: "enter",
    label: "Enter as a party",
    register: "actionable",
    act: (scene) => scene.enterAsParty(),
    stays: true,
    enabled: ({ enterPending }) => !enterPending,
  };
  const ways: DialogueChoice[] = [
    {
      id: "solo",
      label: "Descend alone",
      register: "actionable",
      act: (scene) => scene.startSolo(),
      stays: true,
      enabled: ({ soloPending }) => !soloPending,
    },
    {
      id: "queue",
      label: "Wait for company",
      register: "actionable",
      act: (scene) => scene.joinQueue(),
      stays: true,
      enabled: ({ queuePending }) => !queuePending,
    },
  ];
  const dismiss: DialogueChoice = { id: "dismiss", label: "Not yet", register: "cancel" };
  return {
    line: refusal ?? DOOR_LINE,
    // one order for everyone, Enter as a party third (FS-BJNYC R21, amended 2026-11-02, Nick)
    choices: [...ways, enter, dismiss],
  };
}

/**
 * What a resident says when spoken to. They open nothing — the point is that a
 * player never has to wonder whether an NPC is broken.
 */
const RESIDENT_LINES = [
  "The Spire took my brother's whole company.\nWe do not speak of it.",
  "Torches burn shorter down there. Mind that.",
  "You have the look of one who is going anyway.",
  "Quiet season. Fewer coming back to spend.",
];

/**
 * A wandering resident's line, stable per resident so they do not change their mind each time.
 * A resident has nothing to offer, so they offer no choice: two options that both close the box
 * is a decision the player does not have.
 */
function residentLine(npc: NPCState): Dialogue {
  const sum = [...npc.entity_id].reduce((total, c) => total + c.charCodeAt(0), 0);
  return {
    line: RESIDENT_LINES[sum % RESIDENT_LINES.length],
    choices: [{ id: "leave", label: "Leave", register: "actionable" }],
  };
}

/**
 * How the Spire came, as the Elder tells it (FS-0XMCP §Requirements 24): the morning it stood
 * there, that the town cannot learn what it is by watching, and that it needs people to go in,
 * ending at its door so a newcomer who asks him first still finds the way in.
 */
export const ELDER_TALE = [
  "One grey morning a tower stood on the old barrow field.\nIt has taken the bold and the curious since. Few came back.",
  "We are farmers and tinkers here. Watching it teaches us nothing.\nSomeone has to go in and learn what it is.",
  "The town needs heroes now, and you have the look of one.\nIts door stands at the north of town. Go when you are ready.",
];

/**
 * One passage of a telling, the Elder's way: *Go on* turns to the next, *Farewell* ends it, and
 * the last offers only *Farewell*. No memory: every telling starts at the first passage. The
 * Elder and the town folk (FS-B0H2D R27) tell theirs alike; none of them offers the queue, queued
 * or not; the Spire's door does that.
 */
function telling(lines: TownLines, passage = 0): Dialogue {
  const { role, passages } = lines;
  const farewell: DialogueChoice = { id: "farewell", label: "Farewell", register: "cancel" };
  const last = passage >= passages.length - 1;
  return {
    role,
    line: passages[Math.min(passage, passages.length - 1)],
    choices: last
      ? [farewell]
      : [
          { id: "on", label: "Go on", register: "actionable", next: () => telling(lines, passage + 1) },
          farewell,
        ],
  };
}

/**
 * What each function NPC says and offers, from the hub's state as they are spoken to.
 *
 * The dialogue itself is one shape — a line and a row of choices — so adding an NPC, or a
 * choice, is adding to this table, not another branch in the scene. An NPC missing from
 * it is an ambient resident, who has a line and nothing to offer.
 */
const NPC_DIALOGUE: Record<string, (state: HubState) => Dialogue> = {
  storyteller: () => telling({ role: "Speaker for the town", passages: ELDER_TALE }),
  // He opens nothing now: the player's gear is theirs to open anywhere (FS-HRH2J R45).
  storekeeper: () => ({
    role: "Keeper of the stores",
    line: "The stores are bare. What steel there is, you carry.\nMind it well; the barrow keeps what it takes.",
    choices: [{ id: "farewell", label: "Farewell", register: "cancel" }],
  }),
};

/** The pressable area of a dialogue or menu choice, in screen px around its label. */
const CHOICE_HIT = { width: 160, height: 34 };
/**
 * The hub's tokens for the shared menu chrome: charcoal panel, brass hairline, amber to press,
 * arcane to go back, vellumDark while dimmed, vellum under the pointer.
 */
const MENU_TONES: MenuTones = {
  panel: BARROW_HEX.charcoal,
  frame: BARROW_HEX.brass,
  text: BARROW_HEX.vellum,
  dim: BARROW_HEX.vellumDark,
  actionable: BARROW_HEX.amber,
  cancel: BARROW_HEX.arcane,
};

/**
 * One player as the scene sees them.
 *
 * The pieces are kept together because they live and die together: a player who
 * leaves takes their sprite, their legs and their stride with them, and keeping
 * that as one entry means removal cannot half-happen.
 */
interface PlayerView {
  /** The body, drawn at the projection of `pos`. */
  sprite: Phaser.GameObjects.Container;
  /**
   * Name plate: a marker, drawn above the light-map and vignette (FS-2325V §C.9), so it is
   * placed over the head each frame rather than riding in the depth-sorted container.
   */
  name: Phaser.GameObjects.Text;
  /** Drawn separately so the legs sit beneath the body. */
  legs: Phaser.GameObjects.Graphics;
  /** Where the server last said they are (world position). */
  target: Point;
  /** The eased world position the sprite is drawn at; eases toward `target`. */
  pos: Point;
  /** One of eight world directions (FS-2325V §A.6). */
  facing: Facing8;
  walkPhase: number;
  moving: boolean;
  /**
   * The class's baked sheet (FS-2325V §E.4). When it is not `baked`, the placeholder texture,
   * facing swaps and drawn legs above stand in.
   */
  anim: CharacterAnimator;
}

/** One of the hub's residents or function NPCs, as drawn. */
interface NPCView {
  state: NPCState;
  sprite: Phaser.GameObjects.Container;
  /** A marker above the lighting (FS-2325V §C.9), placed over the head each frame. */
  name: Phaser.GameObjects.Text;
  /** A function NPC's sigil over the name (FS-MRZH7 req 4); ambient NPCs carry none. */
  sigil?: Phaser.GameObjects.Graphics;
  target: Point;
  /** Eased world position, as for players. */
  pos: Point;
  facing: Facing8;
  /**
   * Their baked sheet (FS-2325V §G), played like a player's. When it is not `baked`, the
   * placeholder textures below stand in.
   */
  anim: CharacterAnimator;
  /** The placeholder villager texture, which turns by swapping facings; unset otherwise. */
  texture?: string;
}

/**
 * What stands inside one house (FS-B0H2D R19–R22), shown only while its roof is lifted: its
 * furnishings and indoor dressing, and its hearth's or forge's light with the light's own
 * intensity, restored when the roof lifts.
 */
interface Interior {
  house: House;
  parts: (Stamp & Visible)[];
  lights: { source: LightSource; intensity: number }[];
}

/**
 * The hub: the shared world players occupy between runs.
 *
 * Server-authoritative like a run — this renders broadcast state and sends
 * intents, never simulating. The map is larger than the viewport, so the camera
 * follows the player.
 *
 * Bare in this slice: buildings arrive with I-29KSH-3, NPCs with I-29KSH-6 and I-29KSH-8.
 */
export class HubScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;

  /** Everything the scene knows about one player, keyed by entity id. */
  private views = new Map<string, PlayerView>();
  private selfEntityID: string | null = null;
  /** The sprite the camera is latched onto, so it is latched once per sprite, not per tick. */
  private followedSprite?: unknown;

  /** Drawn once: the hub's buildings are fixed and never change. */
  private structuresDrawn = false;
  /** Drawn once, after the buildings arrive so it can avoid them. */
  private scenery?: Phaser.GameObjects.Graphics;
  /** The fire's flicker, so it reads as burning rather than painted. */
  private hearth?: Phaser.GameObjects.Graphics;
  /**
   * The hub's residents and its function NPCs, keyed by entity id.
   *
   * Residents walk, so each keeps a target the sprite eases toward — the same
   * treatment players get. Function NPCs never move, so their target simply
   * never changes.
   */
  private npcs = new Map<string, NPCView>();
  /**
   * Whose dialogue is open, if any, what the keys do to it, and how to redraw its choices when
   * what can be picked changes under it (a solo start sent, or refused).
   */
  private dialogue?: Phaser.GameObjects.Container;
  private dialogueChoices?: {
    confirm: () => void;
    dismiss: () => void;
    /** The n-th actionable choice, as the number keys count them. */
    pick: (index: number) => void;
    retone: () => void;
    /** The card back to its corner: the logical view changed (FS-ZAJMH R13). */
    relayout: () => void;
  };
  /** The open dialogue is the Spire door's panel, which walking out of the gate closes. */
  private doorOpen = false;
  /**
   * The gate the player stands in, by their last server-reported position and the state's gates
   * (FS-0XMCP §Requirements 10, 22): the enter and leave edges are read against it.
   */
  private atGate?: GateState;
  /** The name of the field gate the player stands in, over its signpost (FS-0XMCP §Requirements 21). */
  private fieldSign?: Phaser.GameObjects.Text;
  private devGateLabel?: Phaser.GameObjects.Text;
  /**
   * The field-gate seam (FS-0XMCP §Requirements 21): called once each time the player steps into
   * a field gate, with the field it leads to; never while lingering, never for the Spire's gate.
   * Asks the server to walk the player into that field (FS-X2F2H §Requirements 9, 11).
   */
  onFieldGate: (destination: FieldDestination) => void = (destination) => this.enterField(destination);
  /** An enter_field has been sent and its reply has not come (FS-X2F2H §Requirements 11, 57). */
  private enteringField = false;
  /** 1, 2, 3: one per actionable choice when a dialogue offers more than one. */
  private choiceKeys: Phaser.Input.Keyboard.Key[] = [];
  private confirmKey?: Phaser.Input.Keyboard.Key;
  private dismissKey?: Phaser.Input.Keyboard.Key;
  private interactKey?: Phaser.Input.Keyboard.Key;
  /** I and B: either opens or closes the gear and bag overlay (FS-HRH2J R4). */
  private gearKeys: Phaser.Input.Keyboard.Key[] = [];
  /** The gear, bag and stats overlay, fed from REST (FS-HRH2J §E); one per visit. */
  private gear?: HubGear;
  /** The ESC menu while it is open (FS-G4VMQ §Requirements 1–5). It owns the keyboard. */
  private menu?: Phaser.GameObjects.Container;
  /** The open menu's choices by key: the n-th actionable one, and the first on Enter. */
  private menuChoices?: MenuKeys;
  /** The open menu, its hit areas with it, to a new centre: the logical view changed (FS-ZAJMH R13). */
  private moveMenu?: (origin: { x: number; y: number }) => void;
  /** Shown while queued, wherever the player walks. */
  private queuePanel?: Phaser.GameObjects.Text;
  /** Beside the panel while queued: the way out of the queue (FS-G4VMQ §Requirements 15). */
  private leaveButton?: Phaser.GameObjects.Text;
  /**
   * Whether this client is in the queue (FS-G4VMQ §Requirements 11): set by a find_game reply or
   * any queue_status, cleared when the server says the player is out or the join failed.
   */
  private queued = false;
  /** A leave_queue has been sent and its reply has not come (§Requirements 12). */
  private leavePending = false;
  /** A start_solo has been sent and its reply has not come (FS-NSV3D §Requirements 2). */
  private soloPending = false;
  /**
   * A party_enter has been sent and nothing has answered it yet: no ready check, no run, no
   * refusal (FS-BJNYC R21).
   */
  private enterPending = false;
  /**
   * A find_game has been sent from the door and nothing has answered it yet: neither the queue
   * taking the player nor a refusal (FS-BJNYC R21).
   */
  private queuePending = false;
  /** A leave_hub has been sent and its reply has not come (FS-G4VMQ §Requirements 25). */
  private leavingHub = false;
  /**
   * The player's level and experience bar (FS-BDA7X req 42), top-left, clear of the queue panel
   * at the bottom. Made with the first state that carries a level.
   */
  private progressHud?: ProgressHud;
  /** The chat window (FS-WJGFJ §C): built with the scene, taken down with it. */
  private chatWindow?: ChatWindow;
  private partyPanel?: PartyPanel;
  /** The teammates' frames on the left edge, under the XP bar (FS-R82NV R34). */
  private partyFrames?: PartyFrames;
  /** Invites waiting on an answer, top centre (FS-R82NV R32): only the hub receives them (R33). */
  private invitePrompt?: PartyInvitePrompt;
  /** The party's ready check, top centre (FS-BJNYC R23): it only happens in the town. */
  private readyCheck?: PartyReadyCheck;
  /**
   * The mailbox's envelope, bottom-right, and its letter panel (FS-1GZGD R33, R40): only the town
   * has one. While the panel is open it owns the keys, as the ESC menu does.
   */
  private mailbox?: MailboxHud;
  /**
   * The corner row (FS-3EBCA): Menu, Character and Party, the Mailbox's slot left to the
   * envelope. Each press is the key's own path: one Esc, I, T.
   */
  private corner?: HudCorner;
  /** Lets go of the mailbox's gold Takes, which read the purse again (FS-7TGZ3 R9). */
  private unsubscribeGoldTaken?: () => void;
  /** The character's level from the hub's state: the letter panel's item tip tones by it (FS-BDA7X R45). */
  private characterLevel?: number;
  /** Baked art (FS-2325V §B.6); an empty library draws placeholders. */
  private art!: ArtLibrary;
  /** Baked ground, when the manifest has it; otherwise the placeholder floor. */
  private groundLayer?: GroundLayer;
  /** FS-2325V §C.7: carries the player's torch, replacing the overlay pool. */
  private lightMap?: LightMap;
  /** World effects over the baked fx sheets (FS-KYPQ9 §B): the chimneys' smoke. */
  private fx?: EffectsRuntime;
  private occluders = new Occluders();
  /**
   * Each house's roof, hidden while the player stands inside it (FS-2325V §C.3). `baked` is
   * false for the placeholder roof drawn without roof art, which carries no chimney.
   */
  private roofs: {
    house: House;
    baked: boolean;
    parts: { setVisible(visible: boolean): unknown }[];
  }[] = [];
  /**
   * The town's buildings as the player sees them from where they stand (ADR-0036, FS-9PN7X): each
   * in both its looks, what covers the player, their silhouette and the indoor blackout. Made with
   * the houses, once per visit.
   */
  private view?: BuildingView;
  /** A building's own wall flames, lit only while the player is inside it (§D.6). */
  private buildingLights: { house: House; source: LightSource; intensity: number }[] = [];
  /** Walls of no building: drawn and faded as they always were (§E.4), hidden by footprint. */
  private looseWalls: Scenery[] = [];
  /**
   * Roof, gable and chimney pieces, and a placeholder roof, as cover: the buildings' tops, which
   * cover the player from outside like their walls (§E.1).
   */
  private roofCover: Cover[] = [];
  /**
   * The street: every scenery object with the footprint it stands on, hidden while the player is
   * in a building it is not in (§C.1, the owner's addition: by footprint, not by screen overlap).
   */
  private outdoors: Scenery[] = [];
  /** The street's lights (lamps, the brazier, the Spire's door, daylight east), dark from indoors. */
  private outdoorLights: { source: LightSource; intensity: number; at: Point }[] = [];
  /** The stash chest's plate and sigil: a function marker, shown by `markerShown` (FS-9PN7X §C.5). */
  private stashMarks: { setVisible(visible: boolean): unknown }[] = [];
  /** Each house's room, shown only under a lifted roof (FS-B0H2D R20). */
  private interiors: Interior[] = [];
  /**
   * The stash chest (FS-VPD8Y R31–33): its sprite, the frame it shows (open while this player's
   * stash is), and its marker. Drawn with the town, once per visit.
   */
  private stashChest?: { sprite: Phaser.GameObjects.Sprite; frame: ChestFrame };
  /** Says, once per rect, that a furnishing has no mirror entry and stands as a placeholder (R19). */
  private warnUnmirrored = placeholderWarning();
  private unsubscribeQueue?: () => void;

  private unsubscribeState?: () => void;
  private lastSent = { vx: 0, vy: 0 };

  /**
   * Whether this start is an arrival (FS-PQ2TW R5–R8): decided once, at the world switch, and
   * handed over in the start data. A start with no verdict is no arrival. An arrival plays the
   * town's card from `create`; a return plays nothing. Walking into a town building is no world
   * switch (ADR-0015) and so never an arrival.
   */
  private arrival = false;
  /**
   * The town's arrival card (FS-PQ2TW R37): the shared piece's, told once the town's first state
   * is drawn, and leaves as the card's one switch says, ash (FS-PQ2TW §Change: Ash R53). It lets
   * its own card go at a scene end.
   */
  private readonly arrivalCard = new ArrivalCard(this, cardLeaves(this, () => this.art));
  /** The server's one-shots, held from init until create is done (FS-C4JWH Edge States). */
  private held?: HeldMessages;
  private oneShots?: OneShotHandlers;

  constructor() {
    super({ key: "HubScene" });
  }

  /**
   * The server's one-shots are held from here: the folk may download before create subscribes to
   * them (FS-C4JWH Edge States). Handed over at the end of create ({@link openHeldMessages}).
   * The start data says whether this start is an arrival (FS-PQ2TW R8).
   */
  init(data?: { arrival?: boolean }): void {
    this.arrival = data?.arrival ?? false;
    this.held = holdOneShots(this, socketManager, HUB_ONE_SHOTS);
  }

  preload(): void {
    // baked world and prop art (FS-2325V §B.6), and the townsfolk (FS-C4JWH §A R4)
    preloadArt(this, SCENE_ART.HubScene, {
      bar: () => drawTorchBar(this),
      fadeIn: true,
    });
  }

  create(): void {
    // an arrival is dark before anything of the town is made: the world's fade-in opens on the
    // dark, and the town's name, known now, comes after its dark hold (FS-PQ2TW R11, R13)
    if (this.arrival) this.arrivalCard.play(placeCard({ world: "hub" }), { built: false });
    // Clamped in projected space: the camera sees the diamond, and the dark beyond
    // its corners is the background colour. FS-2325V §A.3, §A.7.
    const bounds = projectedBounds(HUB_WIDTH, HUB_HEIGHT, CAMERA_MARGIN);
    boundCamera(this.cameras.main, bounds);
    this.cameras.main.setBackgroundColor(BARROW_HEX.pitch);

    ensureCharacterTextures(this);
    this.art = registerArt(this, SCENE_ART.HubScene);
    this.occluders = new Occluders();
    // The run's hand, so hub and run share one pointer (FS-KYPQ9 §H.3); the browser's
    // `default` without its sheet. Nothing hostile here, so no strike-mark.
    this.input.setDefaultCursor(
      cursorCss("cursor_hand", "default", cursorSource(this.art, this.textures)),
    );

    // Baked ground with dirt paths when the manifest has it (FS-2325V §C.1), running on past
    // the edge at the gates and fading into the dark there (FS-0XMCP R18).
    this.groundLayer = GroundLayer.available(this.art, "hub")
      ? new GroundLayer(this, this.art, {
          width: HUB_WIDTH,
          height: HUB_HEIGHT,
          kind: "hub",
          paths: PATHS.map(([x, y, width, height]) => ({ x, y, width, height })),
          aprons: HUB_APRONS,
          look: this.townGround(),
        })
      : undefined;
    if (!this.groundLayer) this.drawGround();
    this.bindInput();
    this.gear = this.composeGear();

    // Lit like a run, in warm dusk rather than barrow dark (FS-2325V §C.8): the
    // light-map with the player's torch, then the vignette and dust above it.
    const lightMap = new LightMap(this, AMBIENT.hub);
    this.lightMap = lightMap;
    createAtmosphere(this);
    // under the light-map like everything in the world (FS-KYPQ9 §A.6, §B.8)
    this.fx = new EffectsRuntime(this, this.art, lightMap);

    this.unsubscribeState = socketManager.onGameStateUpdate((state) =>
      this.renderState(state),
    );

    this.listenForQueue();
    // a dialogue and the menu read Enter and Esc themselves; the gear overlay is open over the town.
    // The letter panel is opened by a press, so it keeps a half-typed line as any press elsewhere
    // does, and the wheel and presses under it are its own (FS-1GZGD R40)
    this.chatWindow = mountChatWindow(
      this,
      () => !this.dialogue && !this.menu && !this.gear?.isOpen() && !this.mailbox?.isOpen(),
      {
        keepsDraft: () => !!this.mailbox?.isOpen(),
        coveredAt: (x, y) => this.mailbox?.covers(x, y) ?? false,
      },
    );
    // T: the party panel, under the same key owners as the chat input (FS-R82NV R28)
    this.partyPanel = mountPartyPanel(
      this,
      () => !!this.dialogue || !!this.menu || !!this.gear?.isOpen() || !!this.mailbox?.isOpen(),
    );
    // party invites, hidden while the menu, the gear overlay or the letter panel covers the town
    // (FS-R82NV R32, R33)
    this.invitePrompt = mountPartyInvitePrompt(this, () => this.coversPopups());
    // the ready check, under the same covers; it closes no dialogue or shop (FS-BJNYC R23)
    this.readyCheck = mountPartyReadyCheck(this, () => this.coversPopups());
    // the teammates' frames: in the village every frame says where its member stands (FS-R82NV R34)
    this.partyFrames = mountPartyFrames(this, this.art);
    // the mailbox: mounting it is entering the town, which fetches its summary (FS-1GZGD R34); the
    // envelope opens nothing while a dialogue, the menu or the gear overlay is up
    this.mailbox = mountMailbox(
      this,
      this.art,
      () => !!this.dialogue || !!this.menu || !!this.gear?.isOpen(),
      () => this.characterLevel,
    );
    this.watchGoldTakes();
    this.corner = new HudCorner(this, {
      icons: [
        { icon: "menu", press: () => this.pressEscape() },
        { icon: "character", press: () => this.toggleGear() },
        { icon: "party", press: () => this.partyPanel?.toggle() },
      ],
      // the open gear overlay's right panel covers the row: a press there is the overlay's
      covered: (x, y) => this.gear?.covers(x, y) ?? false,
    });

    // the HUD back to its anchors whenever the logical view changes (FS-ZAJMH R12, R13)
    relayoutOn(this, () => this.relayoutHud());

    this.listenForEnd();
    this.openHeldMessages();
  }

  /** What the server sent while the hub loaded, to the listeners create has made, in order. */
  private openHeldMessages(): void {
    this.held?.replay(this.oneShots ?? {});
  }

  /** A stop, or the game's destroy while in the hub (the page unmounts), which skips SHUTDOWN. */
  private listenForEnd(): void {
    onSceneEnd(this, (end) => this.release(end));
  }

  /**
   * The logical view changed (FS-ZAJMH R13): what keeps to the right or the centre goes back to
   * its anchor, open panels included, their state untouched. The level bar, the chat window and
   * the party frames keep to the left, which a width change does not move; the gear
   * overlay follows Phaser's resize itself.
   */
  private relayoutHud(): void {
    this.arrivalCard.relayout();
    this.invitePrompt?.relayout();
    this.readyCheck?.relayout();
    this.mailbox?.relayout();
    this.corner?.relayout();
    // the party panel stands centred, so a width change moves it (FS-R82NV § Change C5)
    this.partyPanel?.relayout();
    this.dialogueChoices?.relayout();
    this.moveMenu?.({ x: viewport.centerX, y: viewport.centerY });
    if (this.queuePanel?.active) {
      this.queuePanel.setX(viewport.centerX);
      if (this.leaveButton?.visible) this.showLeaveButton();
      // moved, not made again: rasterised at the render scale of now (FS-ZAJMH R5)
      crispen([this.queuePanel, this.leaveButton]);
    }
  }

  /**
   * What the queue tells this client, from asking in to being moved out, what it is told back,
   * and the hub's answer to leaving it. Released as one in release(), so no visit's listener
   * outlives it.
   */
  private listenForQueue(): void {
    // Queue progress follows the player rather than pinning them to a popup:
    // they keep walking while they wait, so the panel has to be visible from
    // anywhere. FS-29KSH §Requirements 25, 27.
    const queueStatus = (payload: { current?: number; total?: number }) =>
      this.showQueueProgress(payload?.current ?? 0, payload?.total ?? 0);
    socketManager.on("queue_status", queueStatus);
    // The reply to joinQueue's find_game: a refusal goes to its own error listener below, so
    // hearing it here at all means the server took the entry (FS-G4VMQ §Requirements 11). The door
    // waited for it with its panel up; the queue's own panel takes over (FS-BJNYC R21).
    socketManager.on(ActionType.Find_Game, () => {
      this.queued = true;
      this.queuePending = false;
      if (this.doorOpen) this.closeDialogue();
    });
    // A match on another server: the move happens behind this panel, and the
    // host's world_entered switches the scene. A refused move leaves the player
    // here, so say so. FS-K2HKP §Requirements 29, 31.
    const handoff = () => {
      this.showQueueProgressText("Joining the delve…");
      // too late to leave: the player is being moved (FS-G4VMQ §Requirements 16)
      this.leaveButton?.setVisible(false);
    };
    socketManager.on("world_handoff", handoff);
    const handoffFailed = () => {
      // the seat is released and the entry is gone (FS-K2HKP §Requirements 25)
      this.leftQueue();
      this.showQueueProgressText("The delve could not be joined.");
    };
    socketManager.on("world_handoff_failed", handoffFailed);
    // The reply is the truth: the server answers only once the entry is removed (FS-K2HKP
    // §Requirements 7), so the panel comes down on its word and never on the press. A refusal
    // keeps everything and says why, so the player can ask again. FS-G4VMQ §Requirements 13, 14, 17.
    // A reply after the handoff already failed finds nothing to leave and changes nothing.
    socketManager.on(ActionType.LeaveQueue, () => {
      if (!this.queued) return;
      this.queueGone();
    });
    socketManager.onError(ActionType.LeaveQueue, (info) => {
      if (!this.leavePending) return;
      this.leavePending = false;
      this.notice(info.message ?? "Could not leave the queue, please try again.");
    });
    // A solo start the server would not give: the choice comes back and the door says why in its
    // own panel, or in passing once the door has closed (FS-NSV3D §Requirements 5; FS-BJNYC R22).
    // Success needs no listener: it is the world_entered that switches the scene (§Requirements 6).
    socketManager.onError(ActionType.StartSolo, (info) => {
      if (!this.soloPending) return;
      this.soloPending = false;
      this.refused(spireRefusalCopy(info.reason, info.message, "The way is shut for now. Ask again."));
    });
    // A find_game the server would not take (a party member, unreadable gear, or away from the
    // door): the player is not queued and stays where they stand, told why by the door they asked,
    // or in passing (FS-BJNYC R22). One arriving while queued is a random match called off: the
    // match already took the player out, so the queue comes down with the words (FS-988SM R8a, R24).
    socketManager.onError(ActionType.Find_Game, (info) => {
      const words = spireRefusalCopy(info.reason, info.message, "The delve will not gather for you yet. Ask again.");
      if (this.queued) {
        this.queueGone();
        return this.refused(words);
      }
      if (!this.queuePending) return this.notice(words);
      this.queuePending = false;
      this.refused(words);
    });
    // Leaving for the roster (FS-G4VMQ §Requirements 25): the body goes with the server's word,
    // not the press, so the scene switches on world_left. A refusal (queued, or no longer here)
    // gives the row back and says why in passing; the player stays where they stand.
    socketManager.on("world_left", () => {
      if (!this.leavingHub) return;
      this.leavingHub = false;
      this.scene.start("MainMenuScene");
    });
    socketManager.onError(ActionType.LeaveHub, (info) => {
      if (!this.leavingHub) return;
      this.leavingHub = false;
      this.menuChoices?.retone();
      this.notice(info.message ?? "The hub will not let you go yet. Ask again.");
    });
    // A field that would not take the player (FS-X2F2H §Requirements 10, 60): they stay where
    // they stand, told why in the client's words, and the next step into the gate asks again.
    // Success needs no listener: world_entered switches the scene.
    socketManager.onError(ActionType.EnterField, (info) => {
      if (!this.enteringField) return;
      this.enteringField = false;
      this.notice(fieldRefusalCopy(ActionType.EnterField, info.reason));
    });
    // A party_enter is answered by the ready check opening (I-BJNYC-5 draws it), by the run's
    // world_entered switching the scene, or by a refusal: the choice comes back on any of them.
    // A refusal is also said by the open door in its own words (FS-BJNYC R21, R22); the chat's line
    // for it is the party store's, as for every party notice, and is not this listener's.
    const readyCheck = () => this.enterAnswered();
    socketManager.on("party_ready_check", readyCheck);
    const partyNotice = (notice: PartyNoticePayload) => {
      if (!this.enterPending || !PARTY_ENTER_REFUSALS.has(notice?.code)) return;
      this.enterAnswered();
      const words = partyEnterDoorText(notice);
      if (words !== null && this.doorOpen) this.openDoor(words);
    };
    socketManager.on("party_notice", partyNotice);
    // the server's one-shots, held while the hub loaded (FS-C4JWH Edge States)
    this.oneShots = {
      queue_status: queueStatus,
      world_handoff: handoff,
      world_handoff_failed: handoffFailed,
      party_ready_check: readyCheck,
      party_notice: partyNotice,
    };
    // The door is drawn for the player's place in the party; a place changed while it stands open
    // (handed the lead, the lead handed on, out of the party) draws it again in the new order, on
    // its opening line: a refusal said for the old place no longer holds (FS-BJNYC R20).
    const unsubscribeParty = usePartyStore.subscribe((state, prev) => {
      if (this.doorOpen && partyStanding(state.party) !== partyStanding(prev.party)) this.openDoor();
    });
    this.unsubscribeQueue = () => {
      unsubscribeParty();
      socketManager.off("party_ready_check");
      socketManager.off("party_notice");
      socketManager.off("queue_status");
      socketManager.off(ActionType.Find_Game);
      socketManager.offError(ActionType.Find_Game);
      socketManager.off("world_handoff");
      socketManager.off("world_handoff_failed");
      socketManager.off(ActionType.LeaveQueue);
      socketManager.offError(ActionType.LeaveQueue);
      socketManager.offError(ActionType.StartSolo);
      socketManager.off("world_left");
      socketManager.offError(ActionType.LeaveHub);
      socketManager.offError(ActionType.EnterField);
    };
  }

  /**
   * Everything one visit made is let go here. Phaser reuses the scene instance for the next
   * visit, and a reference to something the last visit's display list destroyed draws nothing
   * (commit 0a35e36): forget it, and make it again only while it is `.active`. On the game's
   * destroy the scene's plugins are already gone and are asked nothing (`SceneEnd`).
   */
  private release(end: SceneEnd): void {
    this.unsubscribeState?.();
    this.unsubscribeQueue?.();
    this.held = undefined;
    this.oneShots = undefined;
    this.views.clear();
    this.npcs.clear();
    this.closeDialogue();
    this.closeMenu();
    // the overlay goes with the visit; a change still in flight finishes unheard
    this.gear?.hide();
    this.gear = undefined;
    // the chimneys' smoke, puffs still burning out too: none outlives this scene instance
    this.fx?.clearAll();
    this.fx = undefined;
    // the scene clock stops with the scene, so the flicker goes with it
    this.hearth = undefined;
    this.structuresDrawn = false;
    this.scenery = undefined;
    this.lightMap = undefined;
    this.groundLayer = undefined;
    this.progressHud = undefined;
    this.chatWindow?.destroy();
    this.chatWindow = undefined;
    this.partyPanel?.destroy();
    this.partyPanel = undefined;
    this.invitePrompt?.destroy();
    this.invitePrompt = undefined;
    this.readyCheck?.destroy();
    this.readyCheck = undefined;
    this.partyFrames?.destroy();
    this.partyFrames = undefined;
    // leaving the town closes the panel and stops mail_arrived fetching (FS-1GZGD Edge States)
    this.mailbox?.destroy();
    this.mailbox = undefined;
    this.corner?.destroy();
    this.corner = undefined;
    this.unsubscribeGoldTaken?.();
    this.unsubscribeGoldTaken = undefined;
    this.queuePanel = undefined;
    this.leaveButton = undefined;
    this.queued = false;
    // the next visit rebuilds every sprite; the camera must latch onto the new body
    // whatever its entity id, so neither survives the visit
    this.selfEntityID = null;
    this.followedSprite = undefined;
    // the next visit steps into whatever gate it starts in
    this.atGate = undefined;
    this.dropFieldSign();
    this.dropDevGateLabel();
    this.leavePending = false;
    this.soloPending = false;
    this.enterPending = false;
    this.queuePending = false;
    this.leavingHub = false;
    this.enteringField = false;
    this.roofs = [];
    // the display list destroyed its buildings and Graphics; the next visit makes its own
    this.view?.destroy();
    this.view = undefined;
    this.buildingLights = [];
    this.looseWalls = [];
    this.roofCover = [];
    this.outdoors = [];
    this.outdoorLights = [];
    this.stashMarks = [];
    this.interiors = [];
    this.stashChest = undefined;
    // a destroyed game took its input manager, the cursor and the captures with it
    if (end === "shutdown") this.handBackInput();
  }

  /** What the visit left on the game's input, which Phaser keeps across stops (`SceneEnd`). */
  private handBackInput(): void {
    // the hand is the hub's and the run's; the menus the hub hands over to keep the browser's
    this.input.setDefaultCursor("");
    releaseCaptures(this.input.keyboard, [
      ...Object.values(this.cursors ?? {}),
      ...Object.values(this.wasd ?? {}),
      this.interactKey,
      this.confirmKey,
      this.dismissKey,
      ...this.gearKeys,
      ...this.choiceKeys,
    ]);
  }

  update(time: number, delta: number): void {
    // who owns the keyboard is settled before the keys are read for walking
    this.offerMenu();
    this.offerGear();
    this.sendMovementIntent();
    this.easeTowardServerPositions(time, delta);
    this.offerConversation();
    this.updateBuildings();
    this.hideWhoIsElsewhere();
    this.showStashChest();
    this.carryTheTorch(time, delta);
  }

  /** The stash chest stands open while this player's stash is (FS-VPD8Y R32, v1 pick). */
  private showStashChest(): void {
    const chest = this.stashChest;
    if (!chest) return;
    const frame = chestFrame(this.gear?.stashOpen() ?? false);
    if (frame === chest.frame) return;
    chest.frame = frame;
    showState(chest.sprite, this.art, CHEST.sheet, frame, CHEST.placeholder[frame]);
  }

  /**
   * Restamps the light-map with the player's torch on the player's drawn
   * position, and eases whatever stands over them (FS-2325V §C.5, §C.7).
   */
  private carryTheTorch(time: number, delta: number): void {
    const self = this.selfEntityID ? this.views.get(this.selfEntityID) : undefined;
    const body = self?.sprite.getByName("body") as Phaser.GameObjects.Sprite | null | undefined;

    this.lightMap?.carry(self ? { x: self.sprite.x, y: self.sprite.y } : null);
    this.lightMap?.update(time);
    this.occluders.update(
      self && body ? { bounds: body.getBounds(), depth: self.sprite.depth } : null,
      delta,
    );
  }

  /**
   * The town's buildings for where the player stands, each frame (FS-9PN7X §A–§E): the run's
   * inside test, on world positions (FS-2325V §C.3). Stepping in snaps that house to its interior
   * look, roof lifted (§B.6), its room shown and lit (FS-B0H2D R20, R22), and everything outside
   * it goes: hidden by footprint (§C.1) and dark (§D). Out on the street every house is closed
   * again, and a house that covers the player shows them through it as a silhouette (§E).
   */
  private updateBuildings(): void {
    const self = this.selfEntityID ? this.views.get(this.selfEntityID) : undefined;
    const body = self?.sprite.getByName("body") as Phaser.GameObjects.Sprite | null | undefined;
    const figure: Figure | undefined =
      self && body ? { body, bounds: body.getBounds(), depth: self.sprite.depth } : undefined;
    this.view?.update(self?.pos, figure);
  }

  /** The house the player stands in, if any. */
  private get playerBuilding(): House | undefined {
    return this.view?.building;
  }

  /**
   * What hides by footprint with the player's house (§C.1): the roofs, only ever seen from the
   * street (their own house's is lifted, every other is outside it); walls of no house; and the
   * street's scenery, so nothing tall just outside (a lamp, a barrel, a tree) stands in front of
   * the room or above it.
   */
  private sceneryByFootprint(): Scenery[] {
    return [...this.roofs.map(({ parts }) => ({ parts })), ...this.looseWalls, ...this.outdoors];
  }

  /**
   * Whatever stands in the town besides the walls, for the blackout's mask (FS-9PN7X §D): every
   * player and NPC, body and legs, from their eased position (their plates stand over the dark),
   * and each house's furnishings, dressing and stash chest, standing in that house.
   */
  private *occupants(): Iterable<Occupant> {
    for (const view of this.views.values()) yield { parts: [view.sprite, view.legs], at: view.pos };
    for (const npc of this.npcs.values()) yield { parts: [npc.sprite], at: npc.pos };
    for (const { house, parts } of this.interiors)
      yield { parts, at: { x: house.x + house.width / 2, y: house.y + house.height / 2 } };
  }

  /**
   * The street's lights while the player is indoors (§C.1, the owner's addition): a lamp whose
   * footprint is outside their house goes dark, pool and halo. Back on the street, all are lit.
   */
  private showOutdoorLights(): void {
    for (const light of this.outdoorLights)
      light.source.intensity = this.view?.hidden(light.at) ? 0 : light.intensity;
  }

  /**
   * Each house's furnishings and indoor dressing show only while its roof is lifted, and its
   * hearth or forge lights only then (FS-B0H2D R20, R22): the pool goes dark under the roof, and
   * the flame's halo is gated by the light-map's under-roof test besides.
   */
  private showInteriors(): void {
    for (const { house, parts, lights } of this.interiors) {
      const open = house.id === this.playerBuilding?.id;
      parts.forEach((p) => p.setVisible(open));
      lights.forEach((l) => (l.source.intensity = open ? l.intensity : 0));
    }
    // the house's own wall flames too (FS-9PN7X §D.6): from outside the room is closed
    for (const l of this.buildingLights)
      l.source.intensity = l.house.id === this.playerBuilding?.id ? l.intensity : 0;
  }

  /**
   * The one hide rule (FS-9PN7X §C.1): whoever stands in a house the player is not in, or out of
   * the house the player is in, is hidden, body, legs and name plate, read each frame from their
   * eased world position. NPCs and other players alike, the party too (§C.4). The plates stand
   * over the blackout, so they are hidden here, never left to it (§C.2). A function NPC's plate
   * and sigil, and the stash chest's, stay over a closed house so the street can find the shop,
   * but go with everything else while the player is in another house (§C.5). The player is never
   * hidden (§C.3).
   */
  private hideWhoIsElsewhere(): void {
    const hidden = (at: Point) => this.view?.hidden(at) ?? false;
    const markerShown = (at: Point) => this.view?.markerShown(at) ?? true;
    for (const npc of this.npcs.values()) {
      const shown = !hidden(npc.pos);
      const marked = shown || (isFunctionNPC(npc.state) && markerShown(npc.pos));
      npc.sprite.setVisible(shown);
      npc.name.setVisible(marked);
      npc.sigil?.setVisible(marked);
    }
    // the player's own house is picked by the same rule, so the rule never hides the player
    for (const view of this.views.values()) {
      const shown = !hidden(view.pos);
      view.sprite.setVisible(shown);
      view.name.setVisible(shown);
      view.legs.setVisible(shown);
    }
    const stash = markerShown(HUB_STASH_CHEST.at);
    this.stashMarks.forEach((m) => m.setVisible(stash));
  }

  /**
   * Opens a dialogue when the player presses to talk: the Spire door's panel inside the Spire
   * gate (FS-0XMCP §Requirements 10), otherwise whoever stands close enough. Joining the queue
   * still takes a choice, never a collision. FS-29KSH §Requirements 24.
   */
  private offerConversation(): void {
    if (!this.interactKey) return;

    // The menu owns the keyboard while it is open (FS-G4VMQ §Requirements 5), and so does the
    // letter panel (FS-1GZGD R40): a press to talk is read and dropped, so it does not open a
    // dialogue the moment either closes.
    if (this.menu || this.mailbox?.isOpen()) {
      Phaser.Input.Keyboard.JustDown(this.interactKey);
      return;
    }

    // While a dialogue is open the same key answers it, so a player never has to
    // reach for the mouse to finish what the keyboard started.
    if (this.dialogue) {
      const talk = Phaser.Input.Keyboard.JustDown(this.interactKey);
      const confirm = this.confirmKey && Phaser.Input.Keyboard.JustDown(this.confirmKey);
      const dismiss = this.dismissKey && Phaser.Input.Keyboard.JustDown(this.dismissKey);
      // every key is read, so a press is never left to answer the next frame
      const numbered = this.choiceKeys.map((k) => Phaser.Input.Keyboard.JustDown(k)).indexOf(true);

      if (talk || confirm) this.dialogueChoices?.confirm();
      else if (dismiss) this.dialogueChoices?.dismiss();
      else if (numbered >= 0) this.dialogueChoices?.pick(numbered);

      return;
    }

    if (!Phaser.Input.Keyboard.JustDown(this.interactKey)) return;

    // E over the open overlay wears or takes off what is hovered, and talks to no one (FS-HRH2J R10)
    if (this.gear?.equipKey()) return;

    // E inside the gate reopens a panel dismissed there
    if (this.atGate?.destination === "spire") {
      this.openDoor();
      return;
    }

    const self = this.selfEntityID ? this.views.get(this.selfEntityID) : undefined;
    if (!self) return;

    // The nearest in range answers, so in a crowded room it is the one the player stepped up to
    // (FS-B0H2D R28); the stash chest is one of them, and a nearer NPC wins (FS-VPD8Y R34). The
    // chest is offered only from inside its store, never through the wall (FS-B0H2D R14).
    const reachable: { at: Point; who: NPCState | "stash" }[] = [
      ...[...this.npcs.values()].map(({ state, pos }) => ({ at: pos, who: state })),
      ...(this.inStashStore(self.pos) ? [{ at: HUB_STASH_CHEST.at, who: "stash" as const }] : []),
    ];
    const nearest = nearestInReach(self.pos, reachable, NPC_TALK_RANGE);
    if (nearest === "stash") this.gear?.openStash();
    else if (nearest) this.openDialogue(nearest);
  }

  /**
   * Whether `pos` stands in the house that holds the stash chest: the scene's inside test on the
   * town's drawn houses. False before the walls are drawn.
   */
  private inStashStore(pos: Point): boolean {
    const store = this.roofs.find((r) => insideHouse(HUB_STASH_CHEST.at, r.house))?.house;
    return !!store && insideHouse(pos, store);
  }

  /**
   * The server ticks at 30Hz and the screen redraws at 60. Applying broadcast
   * positions directly makes every player — including your own — teleport twice
   * per three frames, which reads as juddering, and the camera chasing a target
   * that jumps is worse still. So sprites ease toward the last known position
   * instead, the same way the run scene does.
   */
  private easeTowardServerPositions(time: number, delta: number): void {
    // Easing happens in world space; the projection is applied only to draw.
    for (const npc of this.npcs.values()) {
      easeToward(npc.pos, npc.target);
      standAt(npc.sprite, npc.pos, 1);
      // folk idle and walk on their own legs, read off the position just drawn
      const body = npc.sprite.getByName("body") as Phaser.GameObjects.Sprite | null;
      if (npc.anim.baked && body) npc.anim.show(body, npc.anim.step(npc.pos, time, delta, false));
      this.placeMarker(npc.sprite, npc.name, npc.anim, npc.sigil);
    }

    for (const view of this.views.values()) {
      const { sprite, pos, target } = view;

      easeToward(pos, target);
      standAt(sprite, pos, 1);
      this.placeName(view);

      // A baked sheet walks and idles on its own legs, read off the position just
      // drawn; the hub has no attacks and no deaths.
      if (view.anim.baked) {
        const body = sprite.getByName("body") as Phaser.GameObjects.Sprite | null;
        if (body) view.anim.show(body, view.anim.step(pos, time, delta, false));
        continue;
      }

      // Legs follow the eased sprite rather than the raw server position, and
      // sit just beneath the body on the same footprint.
      view.legs.setDepth(worldDepth(pos.x, pos.y, 0));
      drawPlayerLegs(
        view.legs,
        sprite.x,
        sprite.y,
        nearestScreenFacing(view.facing),
        view.walkPhase,
        view.moving,
        BARROW_HEX.ink,
      );
    }
  }

  /**
   * The floor and the map edge. The edge is drawn, not simulated: the server
   * clamps movement to the world's bounds, so there are no wall entities here.
   */
  private drawGround(): void {
    // Drawn in world coordinates on a plane that carries the projection, so the
    // map is the diamond and the camera background fills the corners around it.
    const plane = addWorldPlane(this);
    plane.root.setDepth(0);

    const ground = this.add.graphics();
    ground.fillStyle(BARROW_HEX.charcoal, 1);
    ground.fillRect(0, 0, HUB_WIDTH, HUB_HEIGHT);

    ground.lineStyle(4, BARROW_HEX.brass, 0.4);
    ground.strokeRect(0, 0, HUB_WIDTH, HUB_HEIGHT);
    plane.surface.add(ground);
  }

  /**
   * Trees, grass and a fire, the lamp posts that light the paths, and the town's
   * props and dressing.
   *
   * Baked props where the manifest has them (FS-2325V §C.1, §C.5, §C.7): trees,
   * bushes, a brazier on the hearth and lamp posts, the brazier and the lamps
   * declaring their light. The market stalls, carts, well, crates and fences are
   * baked too (FS-KYPQ9 §A.2) and keep their placeholder drawing only for when
   * their sheet is missing; the dressing (FS-KYPQ9 §A.5) has no placeholder. Each
   * house's roof gets its chimney and smoke here too (FS-KYPQ9 §A.6).
   *
   * All client-side and none of it blocks: anything a player can walk into is a
   * building, and buildings are server entities so that collision and shape come
   * from one source. Scenery has no such obligation, so it costs the broadcast
   * nothing.
   *
   * The fire is ember, not amber. On the canvas amber means *interactable*, and
   * a player cannot do anything with this one — an amber thing you cannot act on
   * is a defect (docs/design-guideline.md).
   */
  private drawScenery(walls: WallState[]): void {
    if (this.scenery || walls.length === 0) return;

    // Buildings are server entities and scenery is not, so the two are separate
    // lists of fixed coordinates with nothing but a person comparing them. A
    // tree grew inside a wall twice before this; now the scene simply declines
    // to draw anything standing in one.
    // Buildings are wider than their walls: the roof overhangs by ROOF_EAVE on
    // every side, and a prop clearing the wall by five pixels still ends up
    // sliced by the eave. The guard clears what a building *looks* like: its
    // whole footprint, not only its walls, since a room's floor is now open
    // ground a prop could otherwise stand on (FS-B0H2D: indoor dressing is its
    // own list, drawn with the interior).
    const footprints = [
      ...walls.map((w) => ({ x: w.position.x, y: w.position.y, width: w.width, height: w.height })),
      ...housesFrom(walls),
    ];
    const blocked = (x: number, y: number, radius: number) =>
      footprints.some(
        (f) =>
          x + radius >= f.x - ROOF_EAVE &&
          x - radius <= f.x + f.width + ROOF_EAVE &&
          y + radius >= f.y - ROOF_EAVE &&
          y - radius <= f.y + f.height + ROOF_EAVE,
      );

    // trodden paths lie on the ground, under everything else; baked ground lays
    // them as dirt tiles already
    const ground = addWorldPlane(this);
    ground.root.setDepth(2);
    const scenery = this.add.graphics();
    ground.surface.add(scenery);
    for (const [x, y, w, h] of this.groundLayer ? [] : PATHS) {
      scenery.fillStyle(BARROW_HEX.barrowBrown, 0.22);
      scenery.fillRect(x, y, w, h);
    }

    const baked = this.art.available;
    /** A baked prop on a footprint; tall ones fade over the player, lit ones light. */
    const place = (
      sheet: string,
      at: Point,
      index: number,
      tall: boolean,
      query: { animation?: string; layer?: number } = {},
    ) => {
      const { sprite, light } = addProp(this, this.art, sheet, at, { index, ...query });
      if (tall) this.occluders.add([sprite]);
      this.outdoors.push({ parts: [sprite], at });
      if (light) this.addOutdoorLight(light, at);
      return sprite;
    };
    const placeSpot = (s: PropSpot) =>
      place(s.sheet, s.at, s.index ?? 0, !!s.tall, { animation: s.animation });
    // Dressing with no placeholder draws nothing without its sheet (FS-KYPQ9 §A.9). The sheets
    // missing are gathered and said once, in one warning, after the scenery is laid.
    const unbaked: string[] = [];
    const skip = (sheet: string) => {
      if (!unbaked.includes(sheet)) unbaked.push(sheet);
    };

    for (const [x, y] of LAMP_POSTS) {
      if (baked && !blocked(x, y, 12)) place("lamp_post", { x, y }, 0, true);
    }

    for (const [x, y] of GRASS) {
      if (blocked(x, y, 22)) continue;
      if (baked) {
        place("bush", { x, y }, tileHash(x, y, SCENERY_SEED), false);
        continue;
      }

      // A tuft, not three strokes: blades of varied height leaning slightly
      // apart, with a darker back rank so it reads as depth rather than a comb.
      const blades: [number, number, number, number][] = [
        [-14, 0, 4, 11], [-8, -3, 4, 16], [-2, -5, 5, 19],
        [4, -2, 4, 15], [10, 1, 4, 10], [15, -1, 3, 12],
      ];

      const tuft = this.propAt(x, y);
      tuft.fillStyle(BARROW_HEX.arcaneDeep, 0.55);
      for (const [dx, dy, w, h] of blades) {
        tuft.fillRect(x + dx, y + dy, w, h);
      }

      // the front rank, lighter, shorter, offset
      tuft.fillStyle(BARROW_HEX.arcane, 0.4);
      for (const [dx, dy, w, h] of blades) {
        tuft.fillRect(x + dx + 2, y + dy + 4, w - 1, h - 5);
      }
    }

    for (const [x, y] of TREES) {
      if (blocked(x, y - 10, 46)) continue;
      if (baked) {
        const pick = tileHash(x, y, SCENERY_SEED);
        place(TREE_SHEETS[pick % TREE_SHEETS.length], { x, y: y + 34 }, pick >>> 4, true);
        continue;
      }
      const prop = this.propAt(x, y + 34);

      // roots flaring into the ground, so the trunk sits in the earth rather
      // than on top of it
      prop.fillStyle(BARROW_HEX.pitch, 0.35);
      prop.fillEllipse(x, y + 34, 44, 12);

      prop.fillStyle(BARROW_HEX.barrowDeep, 1);
      prop.fillRect(x - 8, y, 16, 34);
      prop.fillRect(x - 13, y + 26, 26, 8);
      // the shaded side of the bark
      prop.fillStyle(BARROW_HEX.pitch, 0.4);
      prop.fillRect(x + 2, y, 6, 34);
      // two boughs leaving the trunk
      prop.fillStyle(BARROW_HEX.barrowDeep, 1);
      prop.fillRect(x - 18, y - 2, 12, 5);
      prop.fillRect(x + 7, y - 8, 12, 5);

      // the crown, built from overlapping masses rather than one disc
      prop.fillStyle(BARROW_HEX.arcaneDeep, 1);
      prop.fillCircle(x, y - 14, 32);
      prop.fillCircle(x - 22, y - 4, 22);
      prop.fillCircle(x + 21, y - 7, 21);
      prop.fillCircle(x - 6, y - 36, 22);
      prop.fillCircle(x + 14, y - 30, 18);

      // light catching the upper left, the way the torch pool falls
      prop.fillStyle(BARROW_HEX.arcane, 0.45);
      prop.fillCircle(x - 12, y - 26, 16);
      prop.fillCircle(x - 2, y - 38, 10);
      prop.fillStyle(BARROW_HEX.arcane, 0.25);
      prop.fillCircle(x + 10, y - 18, 12);

      // a few gaps, so the mass is not solid
      prop.fillStyle(BARROW_HEX.pitch, 0.3);
      prop.fillCircle(x + 6, y - 6, 6);
      prop.fillCircle(x - 18, y - 18, 5);
    }

    // the hub's runs, then the two flanking the east road past the edge (FS-0XMCP R18)
    for (const run of [...HUB_FENCES, ...HUB_BEYOND_EDGE_FENCES]) {
      const { x, y } = run.at;
      const length = run.length;
      const horizontal = run.axis === "x";
      // Baked: one-tile post-and-rail segments cut along the run as walls are cut
      // into pieces, the last trimmed, a stouter post at each end (FS-KYPQ9 §A.2).
      // A run stands only if every segment and both end posts clear the buildings: a run
      // whose ends clear a house can still cross it in the middle.
      const { segments, posts } = fenceSegments(run);
      if ([...segments.map((s) => s.at), ...posts].some((p) => blocked(p.x, p.y, run.r))) continue;
      if (this.art.has(segments[0].sheet) && this.art.has("fence_post")) {
        for (const seg of segments) {
          const sprite = place(seg.sheet, seg.at, 0, false);
          sprite.setDepth(worldDepth(seg.depthAt.x, seg.depthAt.y));
          const sheet = this.art.sheet(seg.sheet);
          if (seg.keep < 1 && sheet) {
            const crop = trimCrop(seg.axis, seg.keep, {
              width: sheet.frameWidth,
              anchorX: sheet.anchor.x,
            });
            sprite.setCrop(crop.x, 0, crop.width, sheet.frameHeight);
          }
        }
        for (const at of posts) place("fence_post", at, 0, false, { layer: 1 });
        continue;
      }

      // A fence runs along a world axis, which is a diagonal on screen, so each
      // post is projected on its own and the rails join the projected ends.
      const end = horizontal ? worldToScreen(x + length, y) : worldToScreen(x, y + length);
      const start = worldToScreen(x, y);
      const fence = this.add.graphics();
      const mid = { x: horizontal ? x + length / 2 : x, y: horizontal ? y : y + length / 2 };
      fence.setDepth(worldDepth(mid.x, mid.y));
      this.outdoors.push({ parts: [fence], at: mid });
      fence.fillStyle(BARROW_HEX.barrowDeep, 1);

      const postCount = Math.floor(length / 36);
      for (let i = 0; i <= postCount; i++) {
        const post = worldToScreen(horizontal ? x + i * 36 : x, horizontal ? y : y + i * 36);
        fence.fillRect(post.x, post.y - 16, 5, 22);
      }

      // the rails between them
      if (horizontal) {
        fence.lineStyle(3, BARROW_HEX.barrowBrown, 1);
        fence.lineBetween(start.x, start.y - 11, end.x, end.y - 11);
        fence.lineBetween(start.x, start.y - 3, end.x, end.y - 3);
      }
    }

    // A restyled prop (FS-KYPQ9 §A.2): baked at its spot, its old drawing without the sheet,
    // nothing at all inside a building.
    const restyled = (spot: PropSpot, placeholder: () => void) => {
      if (blocked(spot.at.x, spot.at.y, spot.r)) return;
      if (this.art.has(spot.sheet)) placeSpot(spot);
      else placeholder();
    };

    for (const spot of HUB_CRATES) restyled(spot, () => {
      const { x, y } = spot.at;
      const prop = this.propAt(x, y);
      prop.fillStyle(BARROW_HEX.barrowDeep, 1);
      prop.fillRect(x - 11, y - 11, 22, 22);
      prop.lineStyle(2, BARROW_HEX.barrowBrown, 0.9);
      prop.strokeRect(x - 11, y - 11, 22, 22);
      prop.lineBetween(x - 11, y - 11, x + 11, y + 11);
    });

    for (const spot of HUB_CARTS) restyled(spot, () => {
      const { x, y } = spot.at;
      const prop = this.propAt(x, y + 11);
      prop.fillStyle(BARROW_HEX.barrowDeep, 1);
      prop.fillRect(x - 24, y - 10, 48, 20);
      prop.fillStyle(BARROW_HEX.barrowBrown, 1);
      prop.fillRect(x - 24, y - 14, 48, 5);
      // wheels
      prop.fillStyle(BARROW_HEX.pitch, 1);
      prop.fillCircle(x - 14, y + 11, 7);
      prop.fillCircle(x + 14, y + 11, 7);
      prop.fillStyle(BARROW_HEX.barrowBrown, 1);
      prop.fillCircle(x - 14, y + 11, 3);
      prop.fillCircle(x + 14, y + 11, 3);
      // the shaft
      prop.fillRect(x + 22, y - 2, 20, 4);
    });

    restyled(HUB_WELL, () => {
      const { x: wx, y: wy } = HUB_WELL.at;
      const well = this.propAt(wx, wy);
      well.fillStyle(BARROW_HEX.slate, 1);
      well.fillCircle(wx, wy, 20);
      well.fillStyle(BARROW_HEX.pitch, 1);
      well.fillCircle(wx, wy, 13);
      // posts and a roof over it
      well.fillStyle(BARROW_HEX.barrowDeep, 1);
      well.fillRect(wx - 20, wy - 34, 5, 30);
      well.fillRect(wx + 15, wy - 34, 5, 30);
      well.fillStyle(BARROW_HEX.barrowBrown, 1);
      well.fillRect(wx - 26, wy - 40, 52, 8);
    });

    // The awnings are the one place a little colour is honest — a market is
    // meant to catch the eye — so they alternate rather than all matching. The
    // baked stall carries the same three as its variants, picked by index.
    const awnings = [BARROW_HEX.oxblood, BARROW_HEX.arcaneDeep, BARROW_HEX.barrowBrown];

    HUB_STALLS.forEach((spot, i) => restyled(spot, () => {
      const { x: sx, y: sy } = spot.at;
      const stall = this.propAt(sx, sy + 8);

      stall.fillStyle(BARROW_HEX.barrowDeep, 1);
      stall.fillRect(sx - 32, sy - 6, 64, 14);
      stall.fillRect(sx - 30, sy - 30, 4, 26);
      stall.fillRect(sx + 26, sy - 30, 4, 26);

      // goods on the counter
      stall.fillStyle(BARROW_HEX.vellumFaint, 0.7);
      stall.fillRect(sx - 24, sy - 12, 9, 7);
      stall.fillRect(sx - 6, sy - 11, 7, 6);
      stall.fillRect(sx + 12, sy - 13, 10, 8);

      stall.fillStyle(awnings[i % awnings.length], 0.85);
      stall.fillRect(sx - 36, sy - 36, 72, 9);
      stall.fillStyle(BARROW_HEX.vellumFaint, 0.5);
      stall.fillRect(sx - 36, sy - 30, 72, 3);
    }));

    // New dressing (FS-KYPQ9 §A.5): baked only, decoration only. Nothing here is
    // interactive, has a hit area or a body; placement keeps it off the walking
    // ground (hubKeepOut.ts), and blocked() still has the last word.
    const dress = (spot: PropSpot): boolean => {
      if (blocked(spot.at.x, spot.at.y, spot.r)) return false;
      if (!this.art.has(spot.sheet)) {
        skip(spot.sheet);
        return false;
      }
      placeSpot(spot);
      return true;
    };
    for (const spot of HUB_DRESSING) dress(spot);

    // The washing line hangs between its two posts and sorts by the span's
    // midpoint, so it goes up only where both posts stood.
    const { posts: linePosts, line } = HUB_WASHING_LINE;
    const postsStood = linePosts.map(dress).every(Boolean);
    if (postsStood && this.art.has(line.sheet)) placeSpot(line);
    else if (postsStood) skip(line.sheet);

    this.dressTheGates(dress, skip);
    this.raiseChimneys(skip);
    if (unbaked.length > 0)
      console.warn(
        `hub: no art for ${unbaked.map((s) => `"${s}"`).join(", ")}; that dressing is not drawn`,
      );

    this.scenery = scenery;

    // The hearth: a baked brazier whose flame is a light source, or without art
    // the fire ring with a flickering ember flame.
    if (baked) {
      place("brazier", { x: HEARTH[0], y: HEARTH[1] }, 0, true);
      // scenery drawn while the player is indoors takes the rule on the next frame
      this.view?.invalidate();
      return;
    }

    // the fire ring, which does not move
    const ring = this.propAt(HEARTH[0], HEARTH[1]);
    ring.fillStyle(BARROW_HEX.slate, 1);
    ring.fillCircle(HEARTH[0], HEARTH[1], 26);
    ring.fillStyle(BARROW_HEX.pitch, 1);
    ring.fillCircle(HEARTH[0], HEARTH[1], 19);
    ring.fillStyle(BARROW_HEX.barrowDeep, 1);
    ring.fillRect(HEARTH[0] - 16, HEARTH[1] - 3, 32, 6);
    ring.fillRect(HEARTH[0] - 3, HEARTH[1] - 16, 6, 32);

    // the flame stands in the ring, drawn just above it
    this.hearth = this.propAt(HEARTH[0], HEARTH[1], 1);
    this.time.addEvent({ delay: 90, loop: true, callback: () => this.flicker() });
    this.view?.invalidate();
  }

  /**
   * The gates' dressing (FS-0XMCP R15–R18): signposts and the first trees inside the hub, the
   * forest past the west edge, the Spire's entrance past the north edge, and daylight on the road
   * east. Baked only and decoration only, like the rest of the dressing: nothing past the edge
   * needs collision, since the server's clamp keeps everyone inside the map.
   *
   * The facade sorts behind everything in the hub: it stands wholly north of the map's edge, where
   * nobody walks, so anything a player can stand by is nearer the viewer. Its door's light is the
   * amber cue on the Spire gate.
   */
  private dressTheGates(dress: (spot: PropSpot) => boolean, skip: (sheet: string) => void): void {
    for (const spot of HUB_GATE_DRESSING) dress(spot);
    // past the edge the trees go darker the deeper they stand, into the dark beyond the map
    for (const spot of HUB_BEYOND_EDGE) {
      if (!this.art.has(spot.sheet)) {
        skip(spot.sheet);
        continue;
      }
      const { sprite } = addProp(this, this.art, spot.sheet, spot.at, { index: spot.index });
      const past = Math.max(-spot.at.x, spot.at.x - HUB_WIDTH, -spot.at.y, spot.at.y - HUB_HEIGHT, 0);
      sprite.setTint(shade(BARROW_HEX.vellum, Math.min(EDGE_DUSK.most, past / EDGE_DUSK.over)));
      if (spot.tall) this.occluders.add([sprite]);
      this.outdoors.push({ parts: [sprite], at: spot.at });
    }

    const facade = HUB_SPIRE_FACADE;
    if (this.art.has(facade.sheet)) {
      const { sprite, light } = addProp(this, this.art, facade.sheet, facade.at);
      sprite.setDepth(worldDepth(-HUB_WIDTH, 0));
      this.outdoors.push({ parts: [sprite], at: facade.at });
      if (light) this.addOutdoorLight(light, facade.at);
    } else skip(facade.sheet);

    const day = worldToScreen(MEADOWS_DAYLIGHT.at.x, MEADOWS_DAYLIGHT.at.y);
    this.addOutdoorLight(
      {
        x: day.x,
        y: day.y,
        radius: MEADOWS_DAYLIGHT.radius,
        color: BARROW_HEX.vellum,
        intensity: MEADOWS_DAYLIGHT.intensity,
        flicker: 0,
        seed: 0,
      },
      MEADOWS_DAYLIGHT.at,
    );
  }

  /**
   * One chimney on each house's roof, with its smoke (FS-KYPQ9 §A.6). A chimney is part of the
   * drawn roof, not a ground prop, so it is the one placement that skips `blocked()` and the
   * keep-out rule: it stands on the roof at the house's `planChimney` spot, sorts with that
   * roof's pieces, never fades and covers the player like them (FS-9PN7X §E.4), and joins the
   * roof's parts, so it hides whenever the roof does, its smoke with it. Without the `chimney` sheet there is neither
   * chimney nor smoke; without `fx_smoke` the chimney stands and the runtime draws no smoke. A
   * house under the placeholder roof (no roof art) gets neither.
   */
  private raiseChimneys(skip: (sheet: string) => void): void {
    if (!this.art.has("chimney")) {
      skip("chimney");
      return;
    }
    for (const roof of this.roofs) {
      // the chimney stands on baked slope pieces; over a placeholder roof it would float
      if (!roof.baked) continue;
      const spot = planChimney(roof.house, SCENERY_SEED);
      const { sprite } = addProp(this, this.art, "chimney", spot.at, { layer: CHIMNEY_LAYER });
      sprite.y -= spot.lift;
      // part of the roof: it never fades, it covers the player (FS-9PN7X §E.4)
      this.roofCover.push(coverOf(sprite));
      const parts: { setVisible(visible: boolean): unknown }[] = [sprite];
      if (this.fx)
        parts.push(new ChimneySmoke(this.fx, `chimney:${roof.house.id}`, spot.at, spot.top));
      roof.parts.push(...parts);
      // the roof's new parts and cover take the player's house on the next frame
      this.view?.invalidate();
    }
  }

  /**
   * A street light at a footprint: its pool and halo go dark while the player is in a house it
   * is not in (§C.1, the owner's addition), and come back on the street.
   */
  private addOutdoorLight(source: LightSource, at: Point): void {
    this.outdoorLights.push({ source, intensity: source.intensity, at });
    this.lightMap?.add(source, () => !this.view?.hidden(at));
  }

  /**
   * A graphics for one upright prop whose art is written in absolute world-offset
   * style. The art point `(x, footY)`, where the prop meets the ground, lands on
   * that footprint's projection, and the rest of the art keeps its screen offsets
   * around it, unskewed. Sorted by the same footprint.
   */
  private propAt(x: number, footY: number, layer = 0): Phaser.GameObjects.Graphics {
    const s = worldToScreen(x, footY);
    const g = this.add.graphics();
    g.setPosition(s.x - x, s.y - footY);
    g.setDepth(worldDepth(x, footY, layer));
    this.outdoors.push({ parts: [g], at: { x, y: footY } });
    return g;
  }

  /** Redraws the flame at a slightly different size each beat. */
  private flicker(): void {
    const fire = this.hearth;
    if (!fire?.scene) return;

    const [x, y] = HEARTH;
    const sway = Math.random() * 5;

    fire.clear();
    fire.fillStyle(BARROW_HEX.ember, 0.85);
    fire.fillCircle(x, y - 6 - sway * 0.4, 11 + sway * 0.5);
    fire.fillStyle(BARROW_HEX.amberBright, 0.7);
    fire.fillCircle(x, y - 9 - sway * 0.6, 6 + sway * 0.3);
  }

  private bindInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    this.cursors = keyboard.createCursorKeys();
    this.interactKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.confirmKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.dismissKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.gearKeys = [Phaser.Input.Keyboard.KeyCodes.I, Phaser.Input.Keyboard.KeyCodes.B].map((code) =>
      keyboard.addKey(code),
    );
    this.choiceKeys = [
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
    ].map((code) => keyboard.addKey(code));
    this.wasd = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
  }

  /**
   * Sends velocity only when it changes, rather than every frame. While the menu or the letter
   * panel is open the keys are theirs (FS-G4VMQ §Requirements 5, FS-1GZGD R40): they read as
   * released, so a stride either interrupted is stopped once and nothing more is sent until it
   * closes.
   */
  private sendMovementIntent(): void {
    if (!this.cursors || !this.wasd) return;

    const owned = !!this.menu || !!this.mailbox?.isOpen();
    const held = (k: Phaser.Input.Keyboard.Key) => !owned && k.isDown;
    const left = held(this.cursors.left) || held(this.wasd.left);
    const right = held(this.cursors.right) || held(this.wasd.right);
    const up = held(this.cursors.up) || held(this.wasd.up);
    const down = held(this.cursors.down) || held(this.wasd.down);

    const vx = (right ? 1 : 0) - (left ? 1 : 0);
    const vy = (down ? 1 : 0) - (up ? 1 : 0);

    if (vx === this.lastSent.vx && vy === this.lastSent.vy) return;

    this.lastSent = { vx, vy };
    socketManager.sendMessage(ActionType.Move, { vx, vy });
  }

  private renderState(state: ClientGameState): void {
    if (state.world_type && state.world_type !== "hub") return;

    const gates = gatesInThisBuild(state.gates ?? [], process.env.NODE_ENV);
    const present = new Set<string>();

    if (state.current_player) {
      this.placePlayer(state.current_player, true);
      present.add(state.current_player.entity_id);

      // the overlay's stats panel, from the hub's own state (FS-HRH2J R24, R30)
      this.gear?.updateCharacter(state.current_player);
      this.gear?.setCharacterLevel(state.current_player.level);
      this.characterLevel = state.current_player.level;

      const progress = progressOf(state.current_player);
      if (progress) {
        this.progressHud ??= new ProgressHud(
          this,
          PROGRESS_HUD_AT.hub.x,
          PROGRESS_HUD_AT.hub.y,
        );
        this.progressHud.show(progress);
      }

      this.selfEntityID = state.current_player.entity_id;
      const self = this.views.get(this.selfEntityID);
      if (self) this.keepCameraOn(self.sprite);

      this.followGates(state.current_player.position, gates);
    }
    this.labelDevGate(gates);

    this.renderStructures(state.walls ?? []);
    // Scenery waits for the buildings so it can refuse to stand inside one.
    this.drawScenery(state.walls ?? []);
    this.renderNPCs(state.npcs ?? []);

    for (const other of state.other_players ?? []) {
      this.placePlayer(other, false);
      present.add(other.entity_id);
    }
    this.partyFrames?.show(state);

    // anyone who left the hub since the last tick
    for (const [entityID, view] of this.views) {
      if (present.has(entityID)) continue;

      view.sprite.destroy();
      view.name.destroy();
      view.legs.destroy();
      this.views.delete(entityID);
    }
    // the town is drawn: an arrival's dark lifts off it (FS-PQ2TW R12)
    this.arrivalCard.built();
  }

  /**
   * The Spire gate's trigger (FS-0XMCP §Requirements 8, 10, 22), run on each hub state with the
   * player's server-reported position and the server's gates, so the panel opens only where the
   * server agrees the player is at the door. Stepping in opens the door's panel once, unless the
   * Esc menu or another dialogue is up (that step is spent: E or stepping out and in opens it
   * after). Stepping out closes the door's panel and nothing else; a start_solo already sent is
   * still answered as before.
   *
   * A field gate (FS-0XMCP §Requirements 21) names its field over its signpost while the player
   * stands in it and raises {@link onFieldGate} once on stepping in, and that is all: no dialogue
   * and no message, so the movement clamp keeps the player at the edge.
   */
  private followGates(pos: Position, gates: readonly GateState[]): void {
    const now = gateAt(pos, gates);
    const { entered, left } = gateEdges(this.atGate, now);
    this.atGate = now;

    if (left?.destination === "spire" && this.doorOpen) this.closeDialogue();
    if (fieldOf(left)) this.dropFieldSign();

    if (entered?.destination === "spire" && !this.menu && !this.dialogue) this.openDoor();
    const field = fieldOf(entered);
    if (entered && field) {
      // the dev test room's gate has its own label, and signpostOf would pick the Forest's post
      if (field !== "dev_test_room") this.showFieldSign(entered, field);
      this.onFieldGate(field);
    }
  }

  /** The dev test room's plain label, at its gate for as long as the state has one (FS-BDRTJ R5). */
  private labelDevGate(gates: readonly GateState[]): void {
    const gate = gates.find((g) => g.destination === "dev_test_room");
    if (!gate) {
      this.dropDevGateLabel();
      return;
    }
    if (this.devGateLabel) return;
    const foot = worldToScreen(gate.position.x, gate.position.y);
    this.devGateLabel = this.gateName(foot.x, foot.y, FIELD_NAMES.dev_test_room);
  }

  private dropDevGateLabel(): void {
    this.devGateLabel?.destroy();
    this.devGateLabel = undefined;
  }

  private gateName(x: number, y: number, words: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, words, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "14px",
        color: toCss(palette.markerGate),
      })
      .setOrigin(0.5)
      .setDepth(MARKER_DEPTH.name);
  }

  /**
   * The field's name over the gate's signpost: a marker, so it draws above the light-map and
   * vignette (FS-2325V §C.9), amber for a place the player can walk into. The signpost is found
   * near the server's gate; with no baked signpost the name stands over the gate's spot.
   */
  private showFieldSign(gate: GateState, field: FieldDestination): void {
    this.dropFieldSign();
    const at = signpostOf(gate, HUB_GATE_DRESSING);
    const foot = worldToScreen(at.x, at.y);
    const sheet = this.art?.sheet("signpost");
    const rise = sheet ? sheet.frameHeight * sheet.anchor.y : 0;
    this.fieldSign = this.gateName(foot.x, foot.y - rise - NAME_GAP, FIELD_NAMES[field]);
  }

  private dropFieldSign(): void {
    this.fieldSign?.destroy();
    this.fieldSign = undefined;
  }

  /**
   * Out through a field gate (FS-X2F2H §Requirements 9, 11): one enter_field, and nothing more
   * until the server has answered it, by world_entered or a refusal. Not while the Esc menu or a
   * dialogue is up, as the Spire's door does not open over them; that step is spent, and stepping
   * out and back in asks. A gate whose field this pod does not build yet sends nothing.
   */
  private enterField(destination: FieldDestination): void {
    const field = FIELD_IDS[destination];
    if (!field || this.menu || this.dialogue || this.enteringField) return;
    this.enteringField = true;
    socketManager.sendMessage(ActionType.EnterField, { field });
  }

  /**
   * The Spire door's panel: today's delve choices, the door speaking (FS-0XMCP §Requirements 8, 9),
   * on its opening line or, drawn again over itself, saying why a choice was refused (FS-BJNYC R22).
   */
  private openDoor(refusal?: string): void {
    this.closeDialogue();
    this.showDialogue({ name: SPIRE_DOOR }, delveChoices(this.hubState(), refusal));
    this.doorOpen = true;
  }

  /**
   * A start_solo or find_game refused: said by the door the player pressed it at, every choice still
   * offered, or in passing once the door has closed (FS-BJNYC R22).
   */
  private refused(words: string): void {
    if (this.doorOpen) this.openDoor(words);
    else this.notice(words);
  }

  /** What a dialogue reads, as it stands now: the party is read afresh at each opening (FS-BJNYC R20). */
  private hubState(): HubState {
    return { queued: this.queued, party: partyStanding(usePartyStore.getState().party) };
  }

  /**
   * Turns a player to face where they are going, and advances their stride.
   *
   * The character textures have no walk frames — one static image per class per
   * facing — so the stride is animated by drawing legs, the same as in a run.
   */
  private updateAppearance(view: PlayerView, player: PublicPlayerState): void {
    // a baked sheet is turned and strided each frame instead (easeTowardServerPositions)
    if (view.anim.baked) return;
    const { vx, vy } = player.direction ?? { vx: 0, vy: 0 };

    view.moving = vx !== 0 || vy !== 0;
    view.walkPhase = view.moving ? view.walkPhase + WALK_STEP : 0;

    // Eight world directions; the placeholder textures show the nearest of their four.
    const facing = facingFrom(vx, vy, view.facing);
    if (facing === view.facing) return;

    view.facing = facing;
    const body = view.sprite.getByName("body") as Phaser.GameObjects.Sprite | null;
    body?.setTexture(placeholderTexture(player.class, nearestScreenFacing(facing)));
  }

  private showQueueProgress(current: number, total: number): void {
    // queue_status only ever reaches a queued player (FS-G4VMQ §Requirements 11)
    this.queued = true;
    this.showQueueProgressText(`Gathering the delve  ${current}/${total}`);
    this.showLeaveButton();
  }

  /**
   * The *Leave* button beside the queue panel (FS-G4VMQ §Requirements 15): the panel's twin in
   * amber, since it is the one thing on the panel the player can act on. Same lifecycle as the
   * panel: made beside it, reused only while it is still on screen, down when the queue is left.
   */
  private showLeaveButton(): void {
    const panel = this.queuePanel;
    if (!panel) return;
    // the panel is centred on x: its right edge is half its width past it
    const x = panel.x + panel.width / 2 + LEAVE_GAP;
    const y = panel.y + panel.height / 2;

    if (this.leaveButton?.active) {
      this.leaveButton.setPosition(x, y).setVisible(true);
      return;
    }

    // amber: the one thing on the panel the player can act on
    // see-through like the chat window's panel, not a solid block (asked 2026-10-31)
    const button = this.add
      .text(x, y, "Leave", { ...hudLine(BARROW_HEX.amber), backgroundColor: rgba(palette.chatPanel, 0.85) })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(1000)
      .setInteractive();
    button.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!this.overGear(pointer)) this.leaveQueue();
    });
    // the hand stays; brightening to vellum is the hover cue, as on a dialogue option
    button.on("pointerover", () => button.setColor(toCss(BARROW_HEX.vellum)));
    button.on("pointerout", () => button.setColor(toCss(BARROW_HEX.amber)));
    this.leaveButton = button;
  }

  /**
   * Whether an overlay covers the town's party popups (the invite prompt and the ready check): the
   * menu, the gear overlay or the letter panel, each drawn over them. The popups hide under it and
   * their countdowns run on (FS-R82NV R32, FS-BJNYC R23, FS-1GZGD R40).
   */
  private coversPopups(): boolean {
    return !!this.menu || !!this.gear?.isOpen() || !!this.mailbox?.isOpen();
  }

  /**
   * Whether a press lies over the open gear overlay's panels (FS-HRH2J R8): it is the overlay's,
   * and no hub object under the panel (the queue's Leave, depth 1000 under the overlay's 1100)
   * takes it. The run and the field world apply the same rule to their presses.
   */
  private overGear(pointer: Phaser.Input.Pointer): boolean {
    // the overlay is laid out in logical units; Phaser's pointer.x/y are backing px (FS-ZAJMH R15)
    const at = viewport.toLogical(pointer);
    return this.gear?.covers(at.x, at.y) ?? false;
  }

  /** The queue is behind the player: no entry, nothing pending, no way out to offer. */
  private leftQueue(): void {
    this.queued = false;
    this.leavePending = false;
    this.leaveButton?.destroy();
    this.leaveButton = undefined;
  }

  /**
   * The server says the player is out of the queue (left it, or their match was called off): the
   * panel, its Leave and the menu's way out all come down.
   */
  private queueGone(): void {
    this.leftQueue();
    this.queuePanel?.destroy();
    this.queuePanel = undefined;
    this.closeMenu();
  }

  /**
   * One path out of the queue for the menu choice and the panel button (FS-G4VMQ §Requirements
   * 12): one leave_queue, and nothing more until the server has answered it.
   */
  private leaveQueue(): void {
    if (!this.queued || this.leavePending) return;
    this.leavePending = true;
    socketManager.sendMessage(ActionType.LeaveQueue, {});
  }

  /**
   * A line the hub says in passing, in the neutral HUD register: the player cannot act on it,
   * and it goes on its own.
   */
  private notice(text: string): void {
    const line = this.add
      .text(viewport.centerX, NOTICE_Y, text, hudLine(BARROW_HEX.vellum))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000);
    this.time.delayedCall(NOTICE_MS, () => line.destroy());
  }

  private showQueueProgressText(text: string): void {
    // a panel from an earlier visit was destroyed with that visit's scene
    if (this.queuePanel?.active) {
      this.queuePanel.setText(text);
      return;
    }

    // vellum, not amber: the player cannot act on it (FS-KYPQ9 §I). Top centre, clear of the chat
    // window at the bottom left (FS-WJGFJ), and on no ground of its own.
    this.queuePanel = this.add
      .text(viewport.centerX, QUEUE_Y, text, queueLine(BARROW_HEX.vellum))
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000);
  }

  /**
   * The town's ground: the outdoor look, each house on the floor its look names (the Inn's planks),
   * flagstone under it until that sheet is baked, never bare grass.
   */
  private townGround(): GroundLook {
    const art = this.art;
    const floorFor = (house: House) => {
      const { floor } = townHouseLook(house);
      return floor && art.has(floor) ? floor : undefined;
    };
    return { ...OUTDOOR_GROUND, floorFor };
  }

  /**
   * Draws the hub's buildings.
   *
   * They are server entities, so the collision a player feels and the shape they
   * see come from one source — an invisible wall is worse than no wall. Fixed,
   * so this runs once rather than every tick. A furnishing is a wall too, but it
   * is drawn as furniture, never as wall pieces (FS-B0H2D R19); the Inn's partition is a
   * wall of its own, drawn as low interior masonry inside the building, never as one of its
   * cut-away outer walls.
   *
   * Each house is drawn in both its looks and shows its exterior (ADR-0036, FS-9PN7X §B): four
   * full-height timber walls, a drawn door in its door gap, shut from outside and open from inside
   * (the hub sends no DoorState: the door is only drawn, §B.5 amended 2026-11-03),
   * a roof and gables that never fade (§E.4); placeholder blocks without art (§B.7). A wall of no
   * house is drawn and faded as it always was.
   */
  private renderStructures(all: WallState[]): void {
    if (this.structuresDrawn || all.length === 0) return;

    const houses = housesFrom(all);
    const { building: walls, partitions, furnishings } = splitFurnishings(all);
    const seed = worldSeed("hub");
    const loose = this.drawLooseWalls(walls.filter((w) => !w.house_id), seed);

    // each house's walls in the sheets its look names (the Inn's carry no light of their own)
    const bySheets = new Map<WallSheets, WallState[]>();
    for (const house of houses) {
      const { sheets } = townHouseLook(house);
      bySheets.set(sheets, [...(bySheets.get(sheets) ?? []), ...walls.filter((w) => w.house_id === house.id)]);
    }
    const drawn = [...bySheets].map(([sheets, own]) => ({
      sheets,
      buildings: addBuildings(this, this.art, own, seed, { doors: doorGaps, style: TIMBER_PLACEHOLDER, sheets }),
    }));
    const buildings = drawn.flatMap((d) => d.buildings);
    for (const { house, lights } of buildings)
      for (const { source } of lights) {
        // a house's wall flames are its own: lit, halo and all, only from inside (§D.6)
        this.buildingLights.push({ house, source, intensity: source.intensity });
        this.lightMap?.add(source, () => this.playerBuilding?.id === house.id);
      }

    // Walls carry the building they belong to, so the footprints can be
    // reassembled here rather than being a second list to keep in step with the
    // server's. Flagstone goes under each, and a roof on top: baked slope and
    // ridge pieces sorted by their own footprints (FS-2325V §C.3) closed at both
    // ends by gables (ADR-0036), or without art a placeholder roof on a plane
    // lifted to the wall tops. Either covers the player from outside (§E.1).
    for (const house of houses) {
      const roof = addRoof(this, this.art, house);
      const own = walls.find((w) => w.house_id === house.id);
      const gables = own ? addGables(this, this.art, house, Math.min(own.width, own.height)) : [];
      const top = [...(roof ?? []), ...gables];
      this.roofCover.push(...top.map(coverOf));
      if (roof) {
        this.roofs.push({ house, baked: true, parts: top });
        continue;
      }
      const slab = this.placeholderRoof(house);
      const eave = { x: house.x - ROOF_EAVE, y: house.y - ROOF_EAVE, width: house.width + ROOF_EAVE * 2, height: house.height + ROOF_EAVE * 2 };
      this.roofCover.push(slabCover(slab, eave, WALL_HEIGHT));
      this.roofs.push({ house, baked: false, parts: [slab, ...gables] });
    }
    const interiors = new Map<House, Interior>(houses.map((house) => [house, { house, parts: [], lights: [] }]));
    const trimmed = partitions.flatMap((wall) => {
      const house = houses.find((h) => h.id === wall.house_id);
      return house ? [{ house, wall: partitionInside(wall, house) }] : [];
    });
    const partition = this.partition(trimmed, seed, interiors);
    // the houses' floors, and the walls' shadows over them in the same step, from the walls as
    // they were just drawn (FS-V8FT3 §F)
    this.groundLayer?.paint(houses);
    this.groundLayer?.shade(this.wallShadows(loose, drawn, partition, trimmed));
    this.furnish(houses, furnishings, interiors);
    // the dark outside whichever house the player stands in, as tall as the walls drawn (FS-9PN7X §D.2)
    const baked = this.art.available && this.art.has("wall_back_plain_x");
    const wallTop = baked ? BAKE.WALL_BACK * BAKE.VPX : WALL_HEIGHT;
    this.view = new BuildingView(this, {
      blackout: { wallTop: () => wallTop, reach: (HUB_WIDTH + HUB_HEIGHT) * 2 },
      cover: () => this.roofCover,
      scenery: () => this.sceneryByFootprint(),
      occupants: () => this.occupants(),
      // the rooms under the roofs, their lights and the street's lamps follow the player's house
      onShow: () => {
        this.showInteriors();
        this.showOutdoorLights();
      },
    });
    for (const building of buildings) this.view.set(building);
    // what the player's house changes, should they stand in one already
    this.updateBuildings();

    // One flag covers both: the walls and their roofs are drawn together.
    this.structuresDrawn = true;
  }

  /**
   * Walls belonging to no house, as baked pieces or placeholder blocks: they keep the occluder
   * fade (FS-9PN7X §E.4) and hide by footprint while the player is indoors (§C.1). The baked
   * pieces as drawn, or null for none or for placeholders.
   */
  private drawLooseWalls(walls: WallState[], seed: number): BuiltWalls | null {
    if (walls.length === 0) return null;
    const at = (w: WallState) => ({ x: w.position.x + w.width / 2, y: w.position.y + w.height / 2 });
    const baked = addWalls(this, this.art, walls, seed);
    if (baked) {
      this.occluders.add(baked.tall);
      baked.lights.forEach(({ source }) => this.lightMap?.add(source));
      for (const w of walls) this.looseWalls.push({ parts: baked.byWall.get(w.entity_id) ?? [], at: at(w) });
      return baked;
    }
    for (const w of walls) {
      const parts = addUprightBlock(this, w.position.x, w.position.y, w.width, w.height, TIMBER_PLACEHOLDER);
      this.looseWalls.push({ parts, at: at(w) });
    }
    return null;
  }

  /**
   * The rooms under the roofs (FS-B0H2D R19–R22): each furnishing as its baked prop on its rect,
   * or a low placeholder block on that rect when the mirror has no entry for it or its sheet is
   * missing (never invisible), then the indoor dressing, skipped where its sheet is missing. Each
   * piece joins its house's interior (a partition's already stands in it), which shows only while
   * that roof is lifted; a hearth's, candelabra's, lantern's or forge's light joins it too.
   * Decoration only: collision is the server's.
   */
  private furnish(houses: House[], furnishings: WallState[], interiors: Map<House, Interior>): void {
    const prop = (
      house: House,
      spot: { sheet: string; at: Point; index?: number; animation?: string; tall?: boolean; flat?: boolean },
    ) => {
      const room = interiors.get(house)!;
      const { sprite, light } = addProp(this, this.art, spot.sheet, spot.at, {
        index: spot.index,
        animation: spot.animation,
      });
      // a rug lies on the boards, under everyone and everything standing on it
      if (spot.flat) sprite.setDepth(FLOOR_DECAL_DEPTH);
      room.parts.push(sprite);
      if (spot.tall) this.occluders.add([sprite]);
      if (light) {
        room.lights.push({ source: light, intensity: light.intensity });
        // the flame's halo, like a back wall's flame, is in sight only under a lifted roof
        this.lightMap?.add(light, () => this.playerBuilding?.id === house.id);
      }
    };

    for (const wall of furnishings) {
      const house = houses.find((h) => h.id === wall.house_id);
      if (!house) continue;
      const look = furnishingOf(wall);
      if (look && this.art.has(look.sheet)) {
        const { x, y, width, height } = look.rect;
        prop(house, { ...look, at: { x: x + width / 2, y: y + height / 2 } });
        continue;
      }
      if (!look) this.warnUnmirrored(wall);
      const block = addUprightBlock(
        this,
        wall.position.x,
        wall.position.y,
        wall.width,
        wall.height,
        {
          top: BARROW_HEX.barrowBrown,
          south: shade(BARROW_HEX.barrowBrown, 0.3),
          east: shade(BARROW_HEX.barrowBrown, 0.5),
          edge: { width: 1, color: BARROW_HEX.barrowDeep, alpha: 0.8 },
        },
        FURNISHING_PLACEHOLDER_HEIGHT,
      );
      interiors.get(house)!.parts.push(...block);
    }

    const unbaked: string[] = [];
    for (const spot of HUB_INDOOR_DRESSING) {
      const house = houses.find((h) => insideHouse(spot.at, h));
      if (!house) continue;
      if (!this.art.has(spot.sheet)) {
        if (!unbaked.includes(spot.sheet)) unbaked.push(spot.sheet);
        continue;
      }
      prop(house, spot);
    }
    if (unbaked.length > 0 && this.art.available)
      console.warn(
        `hub: no art for ${unbaked.map((s) => `"${s}"`).join(", ")}; that indoor dressing is not drawn`,
      );

    const store = houses.find((h) => insideHouse(HUB_STASH_CHEST.at, h));
    if (store) interiors.get(store)!.parts.push(...this.placeStashChest());

    this.interiors = [...interiors.values()];
    this.showInteriors();
  }

  /**
   * The walls' shadows the hub's ground carries (FS-V8FT3 §F), cast from the walls as they were
   * drawn, of those drawn baked only: placeholder walls never had one. A wall of no house as drawn,
   * full height (R28); each house by the look each side of its outline is seen in, in its look's
   * sheets (R26, R27); a partition as drawn, low, inside its house (R25). The hub's ground lies
   * everywhere, so nothing is cut from them.
   */
  private wallShadows(
    loose: BuiltWalls | null,
    drawn: readonly { sheets: WallSheets; buildings: readonly BuiltBuilding[] }[],
    partition: BuiltWalls | null,
    partitions: readonly { house: House; wall: WallState }[],
  ): GroundShadows {
    const baked = drawn.filter(({ sheets }) => hasWallArt(this.art, sheets)).flatMap((d) => d.buildings);
    const shapes = buildingWallShadows(baked, loose);
    if (partition)
      for (const house of new Set(partitions.map((p) => p.house))) {
        const own = new Set(partitions.filter((p) => p.house === house).map((p) => p.wall.entity_id));
        const { pieces, posts } = partition.plan;
        const plan = { pieces: pieces.filter((p) => own.has(p.wallId)), posts: posts.filter((p) => own.has(p.wallId)) };
        shapes.push(...shadowsWithin(plan, partition.thickness, house));
      }
    return { shapes, cuts: [] };
  }

  /**
   * A house's partition (the Inn's, between its great hall and taproom) as interior masonry: each
   * segment trimmed to inside the walls (`partitionInside`), cut in the tower's low masonry pieces
   * with posts at both jambs of its door gap and no light, or without that art a low stone
   * placeholder block. Never a building wall: it has no exterior look, and joins its house's
   * interior, hidden under the roof. The baked pieces as drawn, or null for none or for
   * placeholders.
   */
  private partition(
    inside: readonly { house: House; wall: WallState }[],
    seed: number,
    interiors: Map<House, Interior>,
  ): BuiltWalls | null {
    if (inside.length === 0) return null;
    const baked = addWalls(this, this.art, inside.map((p) => p.wall), seed, MASONRY_WALLS, INTERIOR_PARTITION);
    for (const { house, wall } of inside) {
      const interior = interiors.get(house)!;
      if (baked) {
        interior.parts.push(...(baked.byWall.get(wall.entity_id) ?? []));
        continue;
      }
      const { x, y } = wall.position;
      interior.parts.push(...addUprightBlock(this, x, y, wall.width, wall.height, PLACEHOLDER_STONE, PARTITION_PLACEHOLDER_HEIGHT));
    }
    return baked;
  }

  /**
   * The stash chest in the Quartermaster's store (FS-VPD8Y R31–33): the run chest's sheet (its
   * placeholder without art) under a slight tint, on a trimmed plate, both shown only under the
   * store's lifted roof; and an amber "Stash" function marker, which, like the Quartermaster's
   * own (FS-B0H2D R21), stays in sight over the roof. Walk-through: nothing here collides.
   * Returns the parts that hide with the room.
   */
  private placeStashChest(): (Stamp & Visible)[] {
    const { at } = HUB_STASH_CHEST;
    if (!this.art.has(CHEST.sheet)) this.ensureChestPlaceholders();

    const plane = addWorldPlane(this);
    plane.root.setDepth(STASH_PLATE_DEPTH);
    const plate = this.add.graphics();
    plane.surface.add(plate);
    paintStashPlate(plate, stashPlate(HUB_STASH_CHEST));

    const frame = chestFrame(false);
    const sprite = this.add.sprite(0, 0, CHEST.placeholder[frame]);
    showState(sprite, this.art, CHEST.sheet, frame, CHEST.placeholder[frame]);
    standAt(sprite, at);
    sprite.setTint(STASH_CHEST_TINT);
    this.stashChest = { sprite, frame };

    const s = worldToScreen(at.x, at.y);
    const name = this.add
      .text(s.x, s.y - STASH_NAME_LIFT, STASH_NAME, {
        fontFamily: CANVAS_FONT.body,
        fontSize: `${NPC_NAME_PX.function}px`,
        color: toCss(palette.markerFunction),
      })
      .setOrigin(0.5)
      .setDepth(MARKER_DEPTH.name);
    const sigil = this.drawSigil().setPosition(name.x, name.y - name.height / 2 - SIGIL_GAP);
    this.stashMarks = [name, sigil];

    return [plane.root, sprite];
  }

  /** The run's chest placeholders, should the baked chest sheet be missing, made once. */
  private ensureChestPlaceholders(): void {
    for (const frame of ["closed", "open"] as const) {
      if (this.textures.exists(CHEST.placeholder[frame])) continue;
      const g = this.make.graphics({});
      paintChest(g, frame);
      g.generateTexture(CHEST.placeholder[frame], CHEST.width, CHEST.height);
      g.destroy();
    }
  }

  /** The pre-art roof: two shaded slopes on a plane lifted to the wall tops. */
  private placeholderRoof(house: House): Phaser.GameObjects.Container {
    const roofPlane = addWorldPlane(this, WALL_HEIGHT);
    // sorted by the centre of its footprint: over a player behind the house, under one in front
    roofPlane.root.setDepth(worldDepth(house.x + house.width / 2, house.y + house.height / 2));
    const roof = this.add.graphics();
    roofPlane.surface.add(roof);
    this.roofOver(roof, { x: house.x, y: house.y, w: house.width, h: house.height });
    return roofPlane.root;
  }

  /**
   * Puts a roof on a footprint.
   *
   * Seen from above, a pitched roof is two slopes meeting at a ridge, so it is
   * drawn as two shaded halves either side of a line — lit on the side the torch
   * pool falls from — with the eaves overhanging the walls they sit on.
   */
  private roofOver(
    g: Phaser.GameObjects.Graphics,
    { x, y, w, h }: { x: number; y: number; w: number; h: number },
  ): void {
    const eave = ROOF_EAVE;
    const left = x - eave;
    const top = y - eave;
    const width = w + eave * 2;
    const height = h + eave * 2;

    // the ridge runs along the longer side
    const alongX = width >= height;
    const ridge = alongX ? top + height / 2 : left + width / 2;

    g.fillStyle(BARROW_HEX.barrowBrown, 1);
    g.fillRect(left, top, width, height);

    // the far slope, in shadow
    g.fillStyle(BARROW_HEX.pitch, 0.28);
    if (alongX) {
      g.fillRect(left, ridge, width, height / 2);
    } else {
      g.fillRect(ridge, top, width / 2, height);
    }

    // thatch: courses running with the pitch, not across it
    g.lineStyle(1, BARROW_HEX.pitch, 0.2);
    const step = 7;
    if (alongX) {
      for (let ly = top + step; ly < top + height; ly += step) {
        g.lineBetween(left, ly, left + width, ly);
      }
    } else {
      for (let lx = left + step; lx < left + width; lx += step) {
        g.lineBetween(lx, top, lx, top + height);
      }
    }

    // the ridge beam, and the eave line all round
    g.lineStyle(3, BARROW_HEX.barrowDeep, 1);
    if (alongX) {
      g.lineBetween(left, ridge, left + width, ridge);
    } else {
      g.lineBetween(ridge, top, ridge, top + height);
    }

    g.lineStyle(2, BARROW_HEX.barrowDeep, 0.9);
    g.strokeRect(left, top, width, height);
  }

  /** Draws the hub's residents and function NPCs, once each; update() moves them after. */
  private renderNPCs(npcs: NPCState[]): void {
    for (const npc of npcs) {
      const existing = this.npcs.get(npc.entity_id);

      if (existing) {
        existing.target = { x: npc.position.x, y: npc.position.y };
        if (!existing.anim.baked) this.turnPlaceholderNPC(existing);
        continue;
      }

      // Everyone is a baked character on the players' rig (FS-2325V §G): residents in their
      // build and palette, function NPCs as themselves, whose role reads from the silhouette.
      // Only with no sheet at all do the placeholders stand in: a villager texture, or the
      // player silhouette tinted brass.
      const isFunction = isFunctionNPC(npc);
      // a fixed resident never moves, so they face their work by name (FS-B0H2D R25); everyone
      // else starts facing the viewer and turns as they walk
      const facing = residentFacing(npc.name) ?? "se";
      const anim = new CharacterAnimator(this.art, folkLook(npc, this.art), facing);
      const texture =
        anim.baked || isFunction
          ? undefined
          : ensureVillagerTexture(this, npc.appearance ?? "green_trousers");

      const body = texture
        ? this.add.sprite(0, 0, `${texture}_${nearestScreenFacing(facing)}`)
        : this.add.sprite(0, 0, placeholderTexture("warrior", "down"));
      if (anim.baked) anim.dress(body);
      // the placeholder's brass tint is the body, not a marker, so it stays (FS-MRZH7 req 6)
      else if (isFunction) body.setTint(BARROW_HEX.brassBright);
      body.setName("body");

      // amber, a step larger and under a sigil for those the player deals with for real;
      // vellum for the folk (FS-MRZH7 req 2, 5, 7)
      const name = this.add
        .text(0, 0, npc.name, {
          fontFamily: CANVAS_FONT.body,
          fontSize: `${isFunction ? NPC_NAME_PX.function : NPC_NAME_PX.ambient}px`,
          color: toCss(isFunction ? palette.markerFunction : palette.markerHub),
        })
        .setOrigin(0.5)
        .setDepth(MARKER_DEPTH.name);
      const sigil = isFunction ? this.drawSigil() : undefined;

      const pos = { x: npc.position.x, y: npc.position.y };
      const sprite = this.add.container(0, 0, [body]);
      standAt(sprite, pos, 1);
      this.placeMarker(sprite, name, anim, sigil);

      this.npcs.set(npc.entity_id, {
        state: npc,
        sprite,
        name,
        sigil,
        target: { ...pos },
        pos,
        facing,
        anim,
        texture,
      });
    }
  }

  /**
   * A placeholder villager faces the way they are walking, worked out from where the server
   * has moved them since the last tick (world positions).
   */
  private turnPlaceholderNPC(npc: NPCView): void {
    const facing = facingFrom(
      npc.target.x - npc.pos.x,
      npc.target.y - npc.pos.y,
      npc.facing,
    );
    if (facing === npc.facing || !npc.texture) return;
    npc.facing = facing;
    const body = npc.sprite.getByName("body") as Phaser.GameObjects.Sprite | null;
    body?.setTexture(`${npc.texture}_${nearestScreenFacing(facing)}`);
  }

  /**
   * A line of who they are, and a row of choices. Not a dialogue tree: no branching, no
   * memory of what was said. FS-29KSH §Requirements 24, §Out of Scope.
   *
   * Built from the hub's state as it opens and not rebuilt while it is up (FS-NSV3D §Edge
   * States): a queue that changes underneath it shows on the next open. The keys keep their
   * meaning whatever the row holds: E and Enter confirm the first actionable choice, ESC
   * dismisses; with nothing to confirm, every key dismisses.
   */
  private openDialogue(npc: NPCState): void {
    // A function NPC is themselves whatever their name; the town folk tell their own (FS-B0H2D
    // R27); anyone else has a resident's line.
    const lines = townLines(npc.name);
    const dialogue =
      NPC_DIALOGUE[npc.function]?.(this.hubState()) ??
      (lines ? telling(lines) : residentLine(npc));
    this.showDialogue({ name: npc.name, entityId: npc.entity_id }, dialogue);
  }

  /**
   * Draws a dialogue card: who speaks (with their bust when they are a figure; the Spire's door
   * is not), their line, and a row of choices. A choice with `next` turns the page: the same
   * speaker goes on in a fresh card.
   */
  private showDialogue(
    speaker: { name: string; entityId?: NPCState["entity_id"] },
    { role, line, choices }: Dialogue,
  ): void {
    const enabled = (choice: DialogueChoice) =>
      choice.enabled?.({
        soloPending: this.soloPending,
        enterPending: this.enterPending,
        queuePending: this.queuePending,
      }) ?? true;
    const pick = (choice: DialogueChoice) => {
      if (!enabled(choice)) return;
      if (choice.next) {
        this.closeDialogue();
        this.showDialogue(speaker, choice.next());
        return;
      }
      if (!choice.stays) this.closeDialogue();
      choice.act?.(this);
      // what was picked may have changed what can be picked
      if (choice.stays) this.dialogueChoices?.retone();
    };
    const dismiss = () => this.closeDialogue();
    const actionable = choices.filter((c) => c.register === "actionable");
    const first = actionable[0];
    const confirm = () => (first ? pick(first) : dismiss());
    const pickNumbered = (index: number) => {
      const choice = actionable[index];
      if (choice) pick(choice);
    };

    // The key each choice answers to, said on its label: with one thing to do it is E (the
    // key that opened the dialogue), with several each has its number so none is mouse-only;
    // E and Enter still mean the first. Esc always declines.
    const hint = (choice: DialogueChoice) => {
      if (choice.register === "cancel") return "  [Esc]";
      if (actionable.length === 1) return "  [E]";
      return `  [${actionable.indexOf(choice) + 1}]`;
    };
    // The bust is cut from whatever frame they are showing, so it is the same figure the
    // player just walked up to, baked or placeholder.
    const body = (speaker.entityId ? this.npcs.get(speaker.entityId)?.sprite?.getByName("body") : undefined) as
      | Phaser.GameObjects.Sprite
      | null
      | undefined;
    // Each choice is the shared menu row, stacked down the card: its hit area is a separate
    // camera-fixed rectangle that goes down with the card (menuPanel.ts says why).
    const card = showDialogueCard(this, {
      name: speaker.name,
      role,
      line,
      rows: choices.map((choice) => ({
        id: choice.id,
        label: `${choice.label}${hint(choice)}`,
        colour: choice.register === "actionable" ? MENU_TONES.actionable : MENU_TONES.cancel,
        onPick: () => pick(choice),
        enabled: () => enabled(choice),
      })),
      portrait: body ? { texture: body.texture.key, frame: body.frame.name } : undefined,
      tones: MENU_TONES,
    });

    this.dialogueChoices = { confirm, dismiss, pick: pickNumbered, retone: card.retone, relayout: card.relayout };
    this.dialogue = card.container;
  }

  private closeDialogue(): void {
    this.dialogue?.destroy();
    this.dialogue = undefined;
    this.dialogueChoices = undefined;
    this.doorOpen = false;
  }

  /**
   * ESC, read once a frame on the one ESC key the hub binds (FS-G4VMQ §Requirements 1, 2, 20).
   * While a dialogue is open the key is the dialogue's, read in offerConversation, so this does
   * not touch it. Otherwise one press is `pressEscape`'s; with the menu open Enter is its first
   * choice and a number that choice.
   */
  private offerMenu(): void {
    if (this.dialogue || !this.dismissKey) return;
    const esc = Phaser.Input.Keyboard.JustDown(this.dismissKey);
    if (esc || this.mailbox?.isOpen() || !this.menu) {
      if (esc) this.pressEscape();
      return;
    }

    // open: Enter is the first choice, a number is that choice. Every key is read each frame, so
    // a press never lingers to answer the next one.
    const confirm = this.confirmKey && Phaser.Input.Keyboard.JustDown(this.confirmKey);
    const numbered = this.choiceKeys.map((k) => Phaser.Input.Keyboard.JustDown(k)).indexOf(true);
    if (confirm) this.menuChoices?.confirm();
    else if (numbered >= 0) this.menuChoices?.pick(numbered);
  }

  /**
   * One Esc press (FS-R82NV § Change C2; FS-HRH2J R5; FS-1GZGD R40): the one thing on top closes,
   * the letter panel, the menu, the gear overlay, then the party panel; with nothing open the menu
   * opens (`escapeStep`). A dialogue keeps its own Esc.
   */
  private pressEscape(): void {
    if (this.dialogue) return;
    const step = escapeStep({
      letter: this.mailbox?.isOpen() ?? false,
      menu: !!this.menu,
      gear: this.gear?.isOpen() ?? false,
      party: this.partyPanel?.isOpen() ?? false,
    });
    if (step === "letter") this.mailbox?.close();
    else if (step === "close-menu") this.closeMenu();
    else if (step === "gear") this.gear?.hide();
    else if (step === "party") this.partyPanel?.close();
    else this.openMenu();
  }

  /**
   * I or B opens or closes the gear overlay over the live hub (FS-HRH2J R4, R40). While the menu,
   * a dialogue or the letter panel is open they own the keyboard (R6, FS-1GZGD R40): the press is
   * read and dropped, so it does not open the overlay the moment they close.
   */
  private offerGear(): void {
    const pressed = this.gearKeys.map((k) => Phaser.Input.Keyboard.JustDown(k)).includes(true);
    if (pressed) this.toggleGear();
  }

  /** I, B or the corner row's Character icon (FS-3EBCA R7): the overlay, under the same owners. */
  private toggleGear(): void {
    if (this.menu || this.dialogue || this.mailbox?.isOpen()) return;
    this.gear?.toggle();
  }

  /**
   * A Take that carried gold: the purse line reads the wallet again, open or closed (FS-7TGZ3 R9).
   * Let go of on release, so a later visit hears each Take once.
   */
  private watchGoldTakes(): void {
    this.unsubscribeGoldTaken = useMailboxStore.subscribe((state, prev) => {
      if (state.goldTaken !== prev.goldTaken) this.gear?.refreshPurse();
    });
  }

  /**
   * The run's gear and bag overlay, fed from the REST loadout (FS-HRH2J §E R41–43); a refused
   * change in the hub's passing notice. A change answered after this visit ended says nothing.
   * Each open reads the purse line's gold from the wallet (FS-7TGZ3 R8). Its reads and writes are
   * the active character's, read from the store at each call (FS-50MTX R37).
   */
  private composeGear(): HubGear {
    const overlay = new GearOverlay(this, this.art, WorldType.Hub);
    const gear: HubGear = new HubGear(
      overlay,
      gearAsCharacter(
        apiClient,
        () => useGameStore.getState().getActiveCharacter()?.id ?? null,
      ),
      {
        notice: (text) => {
          if (this.gear === gear) this.notice(text);
        },
      },
      new PurseReader(apiClient, overlay),
    );
    return gear;
  }

  /**
   * The hub's ESC menu: a way to the main menu, a way back (FS-G4VMQ §Requirements 3, 4). Built
   * from the scene's state as it opens, so what it offers is hubMenuChoices' rule, not the
   * chrome's. Camera-fixed in the popup band with the dialogue; the world runs on behind it.
   */
  private openMenu(): void {
    const actions: Record<HubMenuChoice["id"], () => void> = {
      change: () => this.changeCharacter(),
      leave: () => this.leaveQueue(),
      back: () => this.closeMenu(),
    };
    const { container, keys, moveTo } = showMenuPanel(this, {
      choices: hubMenuChoices({ queued: this.queued }),
      actions,
      // dimmed while the server is asked, so a second press has nothing to land on
      enabled: { change: () => !this.leavingHub },
      close: () => this.closeMenu(),
      origin: { x: viewport.centerX, y: viewport.centerY },
      hit: CHOICE_HIT,
      tones: MENU_TONES,
    });
    this.menuChoices = keys;
    this.menu = container;
    this.moveMenu = moveTo;
  }

  /**
   * The camera on the player's own body. Latched by sprite, not by entity id: a scene restart
   * (back from a run, re-entering the hub) rebuilds every sprite under the same id, and
   * followWith snaps the camera each time it is called, so it is called once per sprite.
   */
  private keepCameraOn(sprite: Phaser.GameObjects.Container): void {
    if (sprite === this.followedSprite) return;
    followWith(this.cameras.main, sprite);
    this.followedSprite = sprite;
  }

  private closeMenu(): void {
    this.menu?.destroy();
    this.menu = undefined;
    this.menuChoices = undefined;
    this.moveMenu = undefined;
  }

  /**
   * Out of the hub for the main menu, whose roster and DELVE re-enter it as whoever is picked
   * (FS-G4VMQ §Requirements 6–9, 25). One leave_hub, and nothing more until the server has
   * answered it: world_left switches the scene, a refusal keeps the player here.
   */
  private changeCharacter(): void {
    if (this.leavingHub) return;
    this.leavingHub = true;
    this.menuChoices?.retone();
    socketManager.sendMessage(ActionType.LeaveHub, {});
  }

  /**
   * Down alone, without the queue (FS-NSV3D §Requirements 2): one start_solo, and nothing more
   * until the server has answered it, by world_entered or a refusal.
   */
  startSolo(): void {
    if (this.soloPending) return;
    this.soloPending = true;
    socketManager.sendMessage(ActionType.StartSolo, {});
  }

  /**
   * The leader taking the whole party down (FS-BJNYC R21): one party_enter, and nothing more until
   * something answers it, by a ready check, the run, or a refusal.
   */
  enterAsParty(): void {
    if (this.enterPending) return;
    this.enterPending = true;
    socketManager.sendMessage(ActionType.PartyEnter, {});
  }

  /** Something answered the party_enter: the choice comes back (FS-BJNYC R21). */
  private enterAnswered(): void {
    if (!this.enterPending) return;
    this.enterPending = false;
    this.dialogueChoices?.retone();
  }

  /**
   * Joining is the player's decision; the queue itself is unchanged. One find_game, and nothing
   * more until the server has answered it, by taking the player or a refusal (FS-BJNYC R21).
   */
  joinQueue(): void {
    if (this.queuePending) return;
    this.queuePending = true;
    const character = useGameStore.getState().getActiveCharacter();
    const chosenClass = (character?.className ?? "warrior").toLowerCase();

    socketManager.sendMessage(ActionType.Find_Game, {
      class: chosenClass,
      className: chosenClass,
      characterName: character?.name ?? "",
      username: character?.name ?? "",
    });
  }

  /** A player's name plate over their head ({@link markerBase}); the hub has no corpses. */
  private placeName(view: PlayerView): void {
    this.placeMarker(view.sprite, view.name, view.anim);
  }

  /** A name plate over whoever stands in `sprite`: a baked head (`crown`), or the frame's top. */
  /**
   * A function NPC's sigil (FS-MRZH7 req 4): an amber lozenge outlined in the marker stroke,
   * drawn around its own foot so placing it is a single setPosition.
   */
  private drawSigil(): Phaser.GameObjects.Graphics {
    const points = sigilPoints(0, 0);
    return this.add
      .graphics()
      .fillStyle(palette.markerFunction, 1)
      .fillPoints(points as Phaser.Math.Vector2[], true)
      .lineStyle(1.5, palette.markerStroke, 1)
      .strokePoints(points as Phaser.Math.Vector2[], true)
      .setDepth(MARKER_DEPTH.name);
  }

  private placeMarker(
    sprite: Phaser.GameObjects.Container,
    name: Phaser.GameObjects.Text,
    figure: Pick<CharacterAnimator, "crown" | "artScale">,
    sigil?: Phaser.GameObjects.Graphics,
  ): void {
    const body = sprite.getByName("body") as Phaser.GameObjects.Sprite | null;
    if (!body) return;
    const base = markerBase(
      {
        y: sprite.y + body.y,
        displayOriginY: body.displayOriginY,
        scaleY: body.scaleY,
      },
      figure.crown,
      false,
      figure.artScale,
    );
    name.setPosition(sprite.x + body.x, (base ?? sprite.y) - NAME_GAP);
    // over the name, not the crown, so a placeholder with no measured head is marked the same
    sigil?.setPosition(name.x, name.y - name.height / 2 - SIGIL_GAP);
  }

  private placePlayer(player: PublicPlayerState, isSelf: boolean): void {
    const existing = this.views.get(player.entity_id);

    // Existing players ease toward the target in update(); only a player seen
    // for the first time is placed outright, so it does not slide in from the
    // origin.
    if (existing) {
      existing.target = { x: player.position.x, y: player.position.y };
      this.updateAppearance(existing, player);
      return;
    }

    // The same sprites the character-select screen previews, so the character a
    // player picked is the character they see.
    const body = this.add.sprite(0, 0, placeholderTexture(player.class, "down"));
    body.setName("body");

    // The class's baked sheet, stood on its footprint by the sheet's anchor
    // (FS-2325V §E.5), others untinted as rivals are in a run (§E.3); the preview
    // texture, others dimmed, only when the sheet is missing.
    const anim = new CharacterAnimator(this.art, player.class);
    if (anim.baked) anim.dress(body);
    else if (!isSelf) body.setTint(BARROW_HEX.vellumDark);

    // a marker above the lighting, placed by placeName: a 60 px preview keeps it where it
    // always was, a baked sheet puts it just over the head
    const name = this.add
      .text(0, 0, player.username, {
        fontFamily: "var(--font-body), serif",
        fontSize: "12px",
        color: toCss(palette.markerHub),
      })
      .setOrigin(0.5)
      .setDepth(MARKER_DEPTH.name);

    const pos = { x: player.position.x, y: player.position.y };
    const sprite = this.add.container(0, 0, [body]);
    standAt(sprite, pos, 1);

    // Beneath the body, so a stride reads as legs under a cloak.
    const legs = this.add.graphics();
    legs.setDepth(worldDepth(pos.x, pos.y, 0));

    const view: PlayerView = {
      sprite,
      name,
      legs,
      target: { ...pos },
      pos,
      // faces the viewer, which the "down" texture shows
      facing: "se",
      walkPhase: 0,
      moving: false,
      anim,
    };
    this.placeName(view);
    this.views.set(player.entity_id, view);
  }
}
