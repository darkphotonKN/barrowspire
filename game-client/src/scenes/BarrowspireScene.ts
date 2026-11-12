/**
 * BarrowspireScene - 簡化版遊戲場景
 * 移動邏輯 + WebSocket + 建築（進入後看不到外面）
 */

import * as Phaser from "phaser";
import { ActionType, WorldType, type SettlementPayload } from "@/assets/types/client";
import { socketManager } from "@/utils/class/SocketManager";
import { drawPlayerLegs, drawMercenary } from "@/utils/characterTextures";
import { createAtmosphere as buildAtmosphere } from "@/utils/atmosphere";
import { useGameStore } from "@/stores/gameStore";
import { FloorMapWait } from "./floorMapWait";
import {
  ClientGameState,
  PlayerState,
  ContainerState,
  TimedOpenState,
  type ContainerKind,
  placedKind,
  ItemState,
  EscapeDoorState,
  SwitchState,
  WallState,
  type FloorMap,
  DoorState,
  ProjectileState,
} from "@/types/gameState";
import { ABILITY_COPY } from "@/ui/abilityCopy";
import { ArrivalCard, cardLeaves } from "@/ui/arrivalCard";
import { GearOverlay } from "@/ui/GearOverlay";
import { EquipmentHud } from "@/ui/EquipmentHud";
import { PurseReader } from "@/ui/purse";
import { apiClient } from "@/utils/api";
import { ContainerContents, ContainerView, lootMessage } from "@/ui/ContainerView";
import {
  climbed,
  floorLabel,
  interactNotice,
  isTopFloor,
  type InteractReply,
  type NoticeTone,
} from "@/ui/floor";
import { placeCard } from "@/ui/placeCard";
import {
  FALL_CONFIRM,
  nextWatched,
  resolved,
  resolvedView,
  runMenuChoices,
  watchable,
  type ResolvedKind,
  type ResolvedView,
  type RunMenuChoice,
} from "@/ui/party";
import { showMenuPanel, type MenuKeys, type MenuTones } from "@/ui/menuPanel";
import { PROGRESS_HUD_AT, ProgressHud } from "@/ui/ProgressHud";
import { ChatWindow, mountChatWindow } from "@/ui/ChatWindow";
import { RESOURCE_HUD_AT, RESOURCE_HUD_W, ResourceHud } from "@/ui/ResourceHud";
import { PotionHud } from "@/ui/PotionHud";
import { POTION_CELL_GAP, healthPotionCount, potionCell } from "@/ui/potions";
import { PotionDrinkWatcher } from "@/ui/potionDrink";
import { RUN_ACTIONS } from "./runActions";
import { onSceneEnd, releaseCaptures, type SceneEnd } from "./sceneEnd";
import { holdOneShots, type HeldMessages, type OneShotHandlers } from "./heldMessages";
import { reachAfter, reachMade, type ReachSeen } from "./chestReach";
import { type HealthSeen, costHealth, healthIn } from "./ownHealth";

/**
 * What the server sends a run once, unasked: the exit unlocking, the run's end and this player's
 * settlement. The replies to the run's own asks (interact, equip, leave, fall) cannot come before
 * create, which sends them.
 */
const RUN_ONE_SHOTS = ["exit_door_unlocked", "end_game", "settlement"];
import { PartyPanel, mountPartyPanel } from "@/ui/PartyPanel";
import { PartyFrames, mountPartyFrames } from "@/ui/PartyFrames";
import { PartyInvitePrompt, mountPartyInvitePrompt } from "@/ui/PartyInvitePrompt";
import { AbilityHud } from "@/ui/AbilityHud";
import { abilityCard } from "@/ui/abilityCard";
import { hudBars, teammateHealthFill } from "@/ui/resources";
import { equipRefusal, progressOf, type EquipReply } from "@/ui/progress";
import { POSITION_READOUT, positionReadoutPlace, showsPositionReadout } from "@/ui/positionReadout";
import { ResultHold } from "@/components/resultHold";
import { SettlementRecord } from "@/ui/SettlementRecord";
import { settlementRecord } from "@/ui/settlement";
import { recordHoldsTown } from "@/ui/recordHold";
import { resolvedRow, rowSlotX, type RowButton } from "@/ui/resolvedRow";
import { GameStateLogger } from "@/utils/gameStateLogger";
import {
  CANVAS_FONT,
  palette,
  shade,
  tint,
  toCss,
} from "@/utils/canvasPalette";
import {
  WALL_HEIGHT,
  addUprightBlock,
  addWorldPlane,
  facingFrom,
  nearestScreenFacing,
  projectedBounds,
  screenToWorld,
  standAt,
  WORLD_PX_PER_TILE,
  worldDepth,
  worldToScreen,
  type Facing8,
  type Point,
  type WorldPlane,
} from "@/render/iso";
import { artSprite, onDemandArt, preloadArt, registerArt } from "@/render/art/phaser";
import { SCENE_ART } from "@/render/art/sceneArt";
import { drawTorchBar } from "@/ui/torchBar";
import { drawOpenBar, openBarFraction } from "@/ui/openBar";
import type { ArtLibrary } from "@/render/art/library";
import { CharacterAnimator } from "@/render/art/character";
import { HALO_DEPTH, LightMap, type LightSource } from "@/render/lighting";
import { cursorCss, cursorSource } from "@/render/cursors";
import { EffectsRuntime } from "@/render/effects/runtime";
import { HitFeedback } from "@/render/effects/hit";
import { HEAL_LOOK, ShimmerFx } from "@/render/effects/shimmer";
import { playSlash } from "@/render/effects/slash";
import { CHARGE_MS, playCharge, type Charge } from "@/render/effects/charge";
import { DeathDust } from "@/render/effects/death";
import { playEscape } from "@/render/effects/escape";
import { EntranceMarker } from "@/render/effects/entrance";
import { ProjectileFlights } from "@/render/effects/projectile";
import { projectileFlightOf } from "@/render/effects/flights";
import { playFireballCast } from "@/render/effects/fireball";
import { playArrowRelease } from "@/render/effects/arrow";
import { playShadowShotRelease } from "@/render/effects/shadowShot";
import { playDemonClaw } from "@/render/effects/demonClaw";
import { MARKER_BAR, MARKER_DEPTH, markerBase } from "@/render/markers";
import {
  MonsterRoster,
  phaserMonsterStage,
  type MonsterEffects,
  type MonsterTargeting,
} from "@/render/creatures";
import { markerMode, type MarkerMode } from "@/render/creatures/markerMode";
import { BossEngagement, LastHitTracker, castTarget, pickTarget } from "@/render/creatures/targetPick";
import { TargetFrame } from "@/ui/targetFrame";
import { Minimap, type MinimapFixture } from "@/ui/minimap";
import { MinimapModeIcon } from "@/ui/minimapModeIcon";
import {
  browserMinimapStore,
  nextMinimapMode,
  readMinimapMode,
  rememberMinimapMode,
  type MinimapMode,
  type MinimapModeStore,
} from "@/ui/minimapMode";
import { TOP_RIGHT_HUD, TOP_RIGHT_LINE, cornerMinimap, topRightColumn } from "@/ui/topRightColumn";
import { canvasImage } from "@/ui/paintKit";
import { PlayerCombat } from "@/render/combat/playerCombat";
import { ClassKitFx } from "@/render/combat/classKitFx";
import {
  BAKE,
  BuildingView,
  DROP_PILE,
  FIXED_LIGHT_CAP,
  GroundLayer,
  Occluders,
  PLACEHOLDER_STONE,
  RUN_WORLD_THEME,
  WORLD_THEMES,
  addBuildings,
  addDressing,
  addPerimeter,
  addProp,
  addRoof,
  addWallPieces,
  addWalls,
  budgetLights,
  buildingAt,
  coverOf,
  dressingStatics,
  floorLook,
  interactablePool,
  planDressing,
  tileHash,
  footprintHitArea,
  hasWallArt,
  housesFrom,
  insideHouse,
  paintDropPile,
  showState,
  slabCover,
  StairsSet,
  TRAIL_BED_DEPTH,
  TrailSet,
  type BuildingPart,
  type BuiltBuilding,
  type Cover,
  type Figure,
  type Occupant,
  type Scenery,
  type Stamp,
  type FixedLight,
  type FixedLightKind,
  type FloorLook,
  type WorldThemeLook,
} from "@/render/world";
import { CHEST, chestFrame, paintChest } from "@/render/world/chest";
import { CHUNK_MAX, ChunkGrid, ChunkVisibility, DUNGEON_CHUNK } from "@/render/world/chunks";
import { RegionGrid, dressingRooms, dungeonWalls, isDungeon, wallPlan } from "@/render/world/dungeon";
import { buildingWallShadows, dungeonShadows } from "@/render/world/wallShadows";
import { Exploration, partyPositions, regionAt } from "@/render/world/exploration";
import { nearLights } from "@/render/world/floorLights";
import { Fog, wallLayout } from "@/render/world/fog";
import { dressingStandsBy, planRoomDressing, type DressingPiece } from "@/render/world/runDressing";
import { GROUND_MARGIN } from "@/render/world/scene";
import { SACK, paintSack, sackFrame } from "@/render/world/sack";
import { thicknessPx, type WallHeight } from "@/render/world/walls";
import {
  afterFrameSetUp,
  anchorAt,
  boundCamera,
  crispen,
  followWith,
  fullscreenButtonPlace,
  relayoutOn,
  viewRect,
  viewport,
  type FullscreenButtonPlace,
} from "@/render/viewport";

/** World px the placeholder roof overhangs its house's walls by. */
const ROOF_EAVE = 5;
/** A world rect grown by `by` on every side. */
const grown = (r: { x: number; y: number; width: number; height: number }, by: number) => ({
  x: r.x - by,
  y: r.y - by,
  width: r.width + by * 2,
  height: r.height + by * 2,
});
/** Px each way of the arcade body a 1x sheet's player sprite has: the 60x60 placeholder's. */
const PLAYER_BODY_PX = 60;
/**
 * A sheet baked at 2x is drawn at half scale (FS-HF0WW). The arcade body is sized off the
 * sprite's scale, so it is sized here from the fixed 1x size to keep the size a 1x sheet's body
 * has; calling it again leaves it as it is.
 */
export function keepBodySize(
  sprite: Pick<Phaser.Physics.Arcade.Sprite, "body">,
  artScale: number,
): void {
  const body = sprite.body as Phaser.Physics.Arcade.Body | null | undefined;
  if (!body || artScale === 1) return;
  body.setSize(PLAYER_BODY_PX / artScale, PLAYER_BODY_PX / artScale, false);
}
/** Screen px of dark beyond the projected diamond the camera may show at the map edge. */
const CAMERA_MARGIN = 160;
/**
 * How strongly the stairs' pool adds at its centre: a touch above a prop light's 0.7, so the
 * stair's foot and lowest treads sit in warm light under the tower's dark ambient (FS-8RBQY §E.3).
 * The manifest names the pool's radius and colour; it has no intensity of its own.
 */
const STAIRS_POOL_INTENSITY = 0.85;
/** A player's footprint, in world px: the server's `PlayerRadius`. */
const PLAYER_FOOTPRINT_RADIUS = 20;
/**
 * The resolved player's card (FS-QPDKN req 1–6): over the HUD (1000), under the passing notices
 * (2000), which still have the last word while it is up.
 */
const RESOLVED_CARD_DEPTH = 1500;
/**
 * Screen y of the spectate HUD (req 9): top centre, between the top-left stack (the XP bar from
 * y 16) and the top-right column (the minimap, the floor indicator, the escaped count, in that
 * order, FS-56CKV §B); the dev position readout left the top edge for the minimap's corner (§C).
 */
const SPECTATE_HUD_Y = 10;
/**
 * The dead spectator's leave button (FS-QPDKN req 10): bottom-right, in the HUD band (1000) with
 * the counters, and away from the watched player at the centre and the HUD along the top edge.
 */
const LEAVE_BUTTON_DEPTH = 1000;
const LEAVE_BUTTON_MARGIN = 16;
/**
 * The resolved player's bottom-centre row, Watch the delve and Settlement (FS-QPDKN req 3, amended
 * 2026-11-02; FS-GV8WN R21): in the same HUD band and on the same bottom margin as the dead
 * spectator's corner button.
 */
const RESOLVED_ROW_DEPTH = LEAVE_BUTTON_DEPTH;
const RESOLVED_ROW_MARGIN = LEAVE_BUTTON_MARGIN;
/** How far the row stands above that bottom margin (asked 2026-11-02, Nick: about 200 px). */
const RESOLVED_ROW_LIFT = 200;
/** The settlement record's bottom edge stands this far over the row's buttons. */
const RECORD_ROW_GAP = 12;
/** A button over the world: what it says, the name its hit area answers to, what a press does. */
interface ButtonSpec {
  name: string;
  label: string;
  onPress: () => void;
}
/** A button as drawn: its face and label, its hit area, and how it is dimmed or taken down. */
interface WorldButton {
  parts: (Phaser.GameObjects.Graphics | Phaser.GameObjects.Text)[];
  hit: Phaser.GameObjects.Rectangle;
  setEnabled(on: boolean): void;
  destroy(): void;
}
const BUTTON_W = 200;
const BUTTON_H = 38;
const BUTTON_GAP = 16;
/**
 * Where the level and experience bar sit (FS-BDA7X req 42): top-left, at the top of the stack
 * since the dev position readout left it (FS-56CKV §D.20), and clear of the notice band (100–150)
 * across the middle of the screen (`PROGRESS_HUD_AT`, which the resource bars and the party
 * frames stand under).
 */
const PROGRESS_HUD_X = PROGRESS_HUD_AT.run.x;
const PROGRESS_HUD_Y = PROGRESS_HUD_AT.run.y;
/**
 * Where the Health and class resource bars sit (FS-8AY7S req 20): top-left, under the progress bar
 * on its left edge (`RESOURCE_HUD_AT`), with the party frames under them.
 */
const RESOURCE_HUD_X = RESOURCE_HUD_AT.run.x;
const RESOURCE_HUD_Y = RESOURCE_HUD_AT.run.y;
/** The potion cell (FS-P9G8R R24): just right of the resource bars, top-aligned with them. */
const POTION_HUD_X = RESOURCE_HUD_X + RESOURCE_HUD_W + POTION_CELL_GAP;
/**
 * The ability card (FS-8AY7S req 29, 32): bottom-right, on the leave button's margins. The two
 * share the corner and are never up together: the card is down whenever the button is up.
 */
const ABILITY_CARD_MARGIN = LEAVE_BUTTON_MARGIN;
/** The top-right column's corner, now shared with the town and the fields (FS-P0HSP §G.35). */
export { TOP_RIGHT_HUD };
/**
 * Screen px above a player's marker base (`markerBase`: a baked head, or a placeholder's frame
 * top) to their name label. Markers draw above the light-map and vignette (FS-2325V §C.9). The
 * player has no bar over their own head (FS-8AY7S req 26), so their name sits there too.
 */
const NAME_GAP = 5;
/**
 * A teammate's overhead health bar (FS-8AY7S req 27): the monsters' bar, health only, sat
 * `gap` px over the marker base. Their name lifts clear of it. Drawn only while the scene's
 * `showTeammateBars` switch is on, which it is not for now (FS-CH21F R14).
 */
const TEAMMATE_BAR = { width: 38, height: 4, gap: 2 } as const;
const NAME_OVER_BAR_GAP = 2;

/** A teammate's overhead health bar, and how full it is (null: none drawn). */
interface TeammateBar {
  graphics: Phaser.GameObjects.Graphics;
  fill: number | null;
}

/**
 * The backing a HUD notice is drawn on, by tone: a success in arcane green, a refusal in lifted
 * oxblood (both as before), and the stairs waiting for the party on the neutral HUD panel.
 */
const NOTICE_BACKING: Record<NoticeTone, number> = {
  done: palette.safe,
  refused: palette.damageBright,
  waiting: palette.hudPanel,
};

/**
 * The run's ESC menu (FS-9K8EZ req 1): the shared menu chrome, camera-fixed in the popup band
 * over the dead player's card (1500), which it never hides for long
 * (req 6). The pressable area of a menu choice, in screen px around its label, and the run's
 * tokens for the chrome: amber to press, arcane to go back, the HUD's label tone while dimmed.
 */
const MENU_CHOICE_HIT = { width: 220, height: 34 };
const MENU_TONES: MenuTones = {
  panel: palette.ink,
  frame: palette.frame,
  text: palette.hudText,
  dim: palette.hudLabel,
  actionable: palette.interactable,
  cancel: palette.safe,
};
/** What the player's state was when the menu was built: its rows are right for this and no other. */
interface MenuState {
  resolved: boolean;
}

/** Health the server already sends, run out: a player's death clip plays on it. */
const isDead = (player?: { current_health?: number } | null) =>
  player?.current_health !== undefined && player.current_health <= 0;

/** A room or house, drawn: the `housesFrom` rect, its id the walls' `house_id`, and its parts. */
interface Building {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  doorSide: "top" | "bottom" | "left" | "right";
  wallGroup: Phaser.Physics.Arcade.StaticGroup;
  /** Baked roof pieces, or the placeholder roof: hidden together while the player is inside. */
  roof: { setVisible(visible: boolean): unknown; destroy(): void }[];
  /** The entrance glow (FS-KYPQ9 §H.1); absent only if walls came before the effects runtime. */
  doorMarker?: EntranceMarker;
  // Door properties
  door: Phaser.GameObjects.Graphics;
  doorCollider: Phaser.GameObjects.Rectangle;
  isOpen: boolean;
}

/**
 * Where a fixed light stands, for its building's gate (FS-9PN7X §D.6): the building whose wall it
 * hangs on, or the world point it stands on. With neither (a perimeter slit), it stands outside
 * every room.
 */
interface LightRoom {
  room?: string;
  at?: Point;
}

/**
 * A dungeon floor as drawn (FS-KE075 §H.44–§H.47): its cells, what stands in each ground chunk,
 * and its fixed lights by chunk, of which only those near the camera are on the light-map; and its
 * fog of war (FS-SRA9J): what the party has explored, and the fog drawn over the rest.
 */
interface DungeonFloor {
  floor: number;
  grid: RegionGrid;
  chunks: ChunkVisibility;
  /** Each with the region it lights (FS-SRA9J §C.12), 0 for none. */
  lights: (FixedLight<{ source: LightSource } & LightRoom> & { chunk: number; region: number })[];
  /** The lights on the light-map now. */
  lit: Set<LightSource>;
  /** The party's exploration of this floor, from nothing (FS-SRA9J §B.6). */
  seen: Exploration;
  /** The fog over it, once its walls stand. */
  fog?: Fog;
  /** Its minimap (FS-SRA9J §E), built with the fog and gone with the floor. */
  minimap?: Minimap;
  /** Its minimap's map mode icon, built and gone with it (FS-56CKV §Change: Map mode icon, D4). */
  modeIcon?: MinimapModeIcon;
  /** Its run dressing, piece by piece, for a container that turns out to stand by one (§H.47). */
  dressed: DressedPiece[];
}

/** A dressing piece on a dungeon floor: its sprites and flame, and whether it has given way. */
interface DressedPiece {
  piece: DressingPiece;
  sprites: Phaser.GameObjects.Sprite[];
  lights: LightSource[];
  gone: boolean;
}

/** Limited barrow palette for the wizard-player sprite (0x ints). */
interface WizardPalette {
  hat: number;
  hatShade: number;
  band: number;
  robe: number;
  robeShade: number;
  robeLight: number;
  face: number;
  eye: number;
  staff: number;
  orb: number;
  orbGlow: number;
  ink: number;
}

/** Limited barrow palette for the knight-player sprite (0x ints). */
interface KnightPalette {
  helm: number;
  helmShade: number;
  helmLight: number;
  plate: number;
  plateShade: number;
  plateLight: number;
  surcoat: number;
  surcoatShade: number;
  visor: number; // bright slit
  visorGlow: number; // soft halo (rendered semi-transparent)
  sword: number;
  swordHilt: number;
  shield: number;
  shieldTrim: number;
  ink: number;
}

/** Limited barrow palette for the archer-player sprite (0x ints). */
interface ArcherPalette {
  hood: number;
  hoodShade: number;
  leather: number;
  leatherShade: number;
  trim: number;
  face: number;
  eye: number;
  bow: number;
  string: number;
  ink: number;
}

/** How a projectile is drawn in flight, shared with the field scene (FS-JTNPR req 20, 23). */
export { projectileFlightOf };

export class BarrowspireScene extends Phaser.Scene {
  /** The local player's sprite, drawn at the projection of `playerPos`. */
  private player?: Phaser.Physics.Arcade.Sprite;
  /**
   * The local player's world position as rendered (eased toward the server's).
   * Every gameplay calculation uses this, never `player.x/y`, which are screen
   * coordinates. CONTEXT.md "World position".
   */
  private playerPos?: Point;
  private otherPlayers: Map<string, Phaser.Physics.Arcade.Sprite> = new Map();
  /** Eased world positions of other players; their sprites sit at the projection. */
  private otherPlayersPos: Map<string, Point> = new Map();
  private otherPlayersTargets: Map<string, { x: number; y: number }> =
    new Map();

  // leg graphics for walking animation
  private playerLegs?: Phaser.GameObjects.Graphics;
  /** The health bar over each teammate's head, by player id (FS-8AY7S req 27). */
  private teammateHealthBars: Map<string, TeammateBar> = new Map();
  /**
   * Whether those bars are drawn at all. Off for now: teammates' health lives in the party
   * frames, and FS-CH21F R14 supersedes FS-8AY7S req 27 with no overhead bars over players.
   */
  private showTeammateBars = false;
  /** The warm pool the player carries. Built once; only ever repositioned. */
  private otherPlayersLegs: Map<string, Phaser.GameObjects.Graphics> =
    new Map();
  /** One of eight world directions (FS-2325V §A.6); "se" faces the viewer. */
  private playerFacing: Facing8 = "se";
  private walkPhase = 0;
  private otherPlayersFacing: Map<string, Facing8> = new Map();
  private otherPlayersWalkPhase: Map<string, number> = new Map();
  private playerTexturePrefix: string = "player_warrior";
  private otherPlayersClass: Map<string, string> = new Map();
  /**
   * Each player's baked character sheet (FS-2325V §E.4). When a sheet is not `baked` the player
   * keeps its placeholder texture, facing swaps and drawn legs above.
   */
  private playerAnim?: CharacterAnimator;
  private otherPlayersAnim: Map<string, CharacterAnimator> = new Map();

  // username labels
  private playerNameText?: Phaser.GameObjects.Text;
  private otherPlayersNameTexts: Map<string, Phaser.GameObjects.Text> =
    new Map();

  // HP change tracking for damage flash
  private otherPlayersPrevHp: Map<string, number> = new Map();
  /**
   * The local player's health in the last state that had it: the hurt flash and the container
   * view's close on a hit both read it. Unset until a start's first state, so that one is no hit.
   */
  private ownHealth?: HealthSeen;

  // Controls
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };

  // In-game controls panel
  private controlsPanel?: Phaser.GameObjects.Container;

  /**
   * `end_game` has arrived: the run is over, and nothing in it answers any more. No card goes up
   * (FS-GV8WN R24); the settlement record, if open, holds the return to the town (R23).
   */
  private runEnded = false;
  /**
   * Holds the hub `world_entered` while the settlement record is open, until it is closed
   * (FS-GV8WN R23). Read by the `world_entered` handler in `PhaserGame.tsx`.
   */
  readonly resultHold = new ResultHold();
  /**
   * The settlement record (FS-GV8WN R21): made by the first `settlement`, opened by it, then
   * closed and reopened by the player until the scene stops (R22).
   */
  private settlementRecord?: SettlementRecord;
  /** The resolved player's card (FS-QPDKN req 1): up until Watch is pressed or `end_game`. */
  private resolvedCard?: Phaser.GameObjects.Container;
  /** What the card shows, to build it again at the centre when the logical view changes. */
  private resolvedCardView?: Extract<ResolvedView, { kind: "dead" }>;
  /** An escaped player with a teammate still in play, not yet watching: Watch stands in the row. */
  private canWatch = false;
  /**
   * This player has been seen escaped in this run, watching or not: Leave stands in the row
   * (FS-GV8WN R25). Sticky until the run resets, so a state that drops their own (the broadcast no
   * longer sending an escaped player) keeps it, and one that merely lacks it never raises it.
   */
  private canLeave = false;
  /**
   * The bottom-centre row as drawn: which buttons, by name, the buttons themselves, and its Leave
   * when it holds one, so a pending leave dims it as it dims the dead player's.
   */
  private row: { names: string; buttons: WorldButton[]; leave?: WorldButton } = { names: "", buttons: [] };
  /** The teammate this resolved player watches through (req 7); set only while spectating. */
  private watchedPlayerId?: string;
  /** The sprite the camera was last latched onto while spectating, so it is latched once. */
  private followedSprite?: unknown;
  /**
   * The run `world_entered` put us in. The server may still broadcast another world this
   * member has a body in (a stale run, the hub); drawing those frames here would snap the
   * player between two positions every tick.
   */
  private sessionID?: string;
  /**
   * Whether this start is an arrival (FS-PQ2TW R5–R8): decided once, at the world switch, and
   * handed over in the start data. A start with no verdict is no arrival. An arrival is dark from
   * `create` and plays its floor's card at the first broadcast; a return plays nothing. A climb
   * is not a world switch (ADR-0015): the run detects it itself.
   */
  private arrival = false;
  /** Whose eyes, and how to switch (req 9); up while spectating. */
  private spectateHud?: { watching: Phaser.GameObjects.Text; hint: Phaser.GameObjects.Text };
  /** How this player is out of the delve, while the card or the spectate view is up (req 2, 10). */
  private resolvedKind?: ResolvedKind;
  /**
   * The dead player's way out (req 2, 13): on the card, or in its corner while they spectate. The
   * escaped player's is the row's (`row.leave`).
   */
  private leaveButton?: WorldButton;
  /** A `leave_run` is on its way and unanswered: further presses send nothing (req 13). */
  private leavePending = false;
  /** The server's one-shots, held from init until create is done (FS-C4JWH Edge States). */
  private held?: HeldMessages;
  private oneShots?: OneShotHandlers;
  /** The ESC menu, or its confirm, while open (FS-9K8EZ req 1–6). It owns the keyboard and pointer. */
  private menu?: Phaser.GameObjects.Container;
  /** The open menu's choices by key: the n-th actionable one, the first on Enter, back on Esc. */
  private menuChoices?: MenuKeys;
  /** The open menu, its hit areas with it, to a new centre: the logical view changed (FS-ZAJMH R13). */
  private moveMenu?: (origin: { x: number; y: number }) => void;
  /** The state the open menu's rows were built for; a state that differs takes it down (req 6). */
  private menuFor?: MenuState;
  /** A `forfeit_run` is on its way and unanswered: Fall is dimmed until a reply or the death (req 3). */
  private fallPending = false;
  /** Whether the last frame sent a stride, so the menu that interrupts it can stop it once (req 5). */
  private striding = false;
  /** The menu's keys (req 1), polled each frame as the hub's are: ESC, Enter, and one per row. */
  private dismissKey?: Phaser.Input.Keyboard.Key;
  private confirmKey?: Phaser.Input.Keyboard.Key;
  private choiceKeys: Phaser.Input.Keyboard.Key[] = [];
  private readonly watchSpec: ButtonSpec = {
    name: "watch-the-delve",
    label: "WATCH THE DELVE",
    onPress: () => this.startWatching(),
  };
  private readonly leaveSpec: ButtonSpec = {
    name: "leave-the-barrow",
    label: "LEAVE THE BARROW",
    onPress: () => this.leaveTheBarrow(),
  };
  private readonly settlementSpec: ButtonSpec = {
    name: "settlement",
    label: "SETTLEMENT",
    onPress: () => this.toggleRecord(),
  };
  /** Tab, the next player to watch (req 8); made with the run, removed with it. */
  private tabKey?: Phaser.Input.Keyboard.Key;
  /** This player's level and experience bar (FS-BDA7X req 42), made with the first state that has them. */
  private progressHud?: ProgressHud;
  /** The Health and class resource bars, top-left (FS-8AY7S req 20). */
  private resourceHud?: ResourceHud;
  /** The chat window (FS-WJGFJ §C): built with the scene, taken down with it. */
  private chatWindow?: ChatWindow;
  /** The health potions carried and the drink key, beside the bars (FS-P9G8R R24). */
  private potionHud?: PotionHud;
  private partyPanel?: PartyPanel;
  /** The teammates' frames on the left edge, under the XP bar (FS-R82NV R34). */
  private partyFrames?: PartyFrames;
  /** Invites waiting on an answer, top centre, Accept greyed while delving (FS-NCC9J R24). */
  private invitePrompt?: PartyInvitePrompt;
  /** The class ability card, bottom right (FS-8AY7S req 29–32). */
  private abilityHud?: AbilityHud;
  /**
   * The player's own class kit drawn (FS-MAMHR §G.32–§G.36, FS-JTNPR req 11), shared with the
   * field scene: the merc's cut, riposte, stance and parry flash, and the archer's aim line.
   */
  private readonly kit = new ClassKitFx(this);
  /** This player's level, for the "Requires level N" hints (req 45); unknown until the server sends it. */
  private characterLevel?: number;

  // Game state
  private gameStateUnsubscribe?: () => void;
  private connectionStatusUnsubscribe?: () => void;
  private targetPosition: { x: number; y: number } | null = null;

  // 地圖大小: the floor's own, from its floor map (FS-KE075 §H.42); none until a map sizes it
  private mapWidth = 0;
  private mapHeight = 0;
  /**
   * The size the camera, physics and ground were fitted to, the dungeon cells the ground was
   * painted under (none on a floor of buildings), and the floor it was last fitted for; none before
   * the first map.
   */
  private fittedTo?: { width: number; height: number; cells?: RegionGrid; floor: number };
  /** The dungeon floor being drawn (FS-KE075 §H.44–§H.47); none on a floor of buildings. */
  private dungeon?: DungeonFloor;
  /** The floor whose map is built (FS-KE075 §H.43): none until one is, and none after a teardown. */
  private builtFloor?: number;
  /** The built floor's walls, as its map gave them: what the dressing keeps clear of. */
  private floorWalls: WallState[] = [];
  /** Asks for a floor's map while a snapshot's floor has none (FS-KE075 §H.41). */
  private readonly mapWait = new FloorMapWait();
  private floorMapUnsubscribe?: () => void;

  // 建築
  private buildings: Building[] = [];
  private outsideObjects: Phaser.GameObjects.GameObject[] = [];
  /**
   * The rooms as the player sees them from where they stand (ADR-0036, FS-9PN7X): each drawn in
   * both its looks, what covers the player, their silhouette and the indoor blackout. Made with
   * the first floor's walls, cleared at each floor's teardown, gone with the run.
   */
  private view?: BuildingView;
  /**
   * The fixed lights standing in a building, with their own intensity: lit only while the player
   * is in it (FS-9PN7X §D.6). `hung` marks a light on the room's own walls, which goes when the
   * room is redrawn. Stamped with the floor, forgotten with it.
   */
  private roomLights: { room: string; source: LightSource; intensity: number; hung: boolean }[] = [];
  /**
   * Every other fixed light (hall sconces, braziers, the stairs and interactable pools in the
   * halls, the perimeter's slits), with its own intensity and where it stands: out, pool and halo,
   * while the player is in a room it is not in (the owner's addition 1). Forgotten with the floor.
   */
  private hallLights: { source: LightSource; intensity: number; at?: Point }[] = [];
  /** An exterior house's roof as cover, baked pieces or the placeholder slab (§E.1). */
  private roofCover: Cover[] = [];

  // 寶箱 (從後端同步) — `pos` is the world position; the sprite is drawn at its projection.
  // Drop piles with loot left in them are held here too: they open and loot like a chest, but the
  // fog shows them by the monster rule (FS-SRA9J §D.16)
  private chests: Map<
    string,
    { sprite: Phaser.GameObjects.Sprite; entityId: string; pos: Point; pile: boolean }
  > = new Map();

  // 逃脫門 (從後端同步)
  private escapeDoors: Map<
    string,
    { sprite: Phaser.GameObjects.Sprite; entityId: string; pos: Point }
  > = new Map();

  // 開關/按鈕 (從後端同步)
  private switches: Map<
    string,
    { sprite: Phaser.GameObjects.Sprite; entityId: string; pos: Point }
  > = new Map();

  /** Stairs up to the next floor, from state (FS-F6F88 req 30); none on the top floor. */
  private stairs = new StairsSet<Phaser.GameObjects.Sprite>({
    add: (at) => this.addStairs(at),
    stand: (sprite, at) => standAt(sprite, at),
  });

  /**
   * Burning trails, from state (FS-4R9M9 req 56, 61): a ground bed and an additive glow each,
   * named for the trail they burn for.
   */
  private trails = new TrailSet<Phaser.GameObjects.Graphics>({
    bed: (id) => this.add.graphics().setDepth(TRAIL_BED_DEPTH).setName(`trail:${id}:bed`),
    glow: (id) =>
      this.add
        .graphics()
        .setDepth(HALO_DEPTH)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setName(`trail:${id}:glow`),
    // the glow sorts above the roofs: like a sconce's halo, it is only in sight while no roof the
    // player is outside of stands over either end of the trail
    glowShown: (trail) => !this.underRoof(trail.from) && !this.underRoof(trail.to),
  });

  // 牆壁 (從後端同步) — baked wall pieces and posts (FS-2325V §C.2), or the
  // placeholder blocks without a manifest; either way, one-tile pieces sorted by footprint.
  // A room's walls are drawn with their room (`rooms`), so they hold no pieces here: only the
  // room they belong to. A wall of no room keeps its pieces and its footprint's centre, which the
  // hide rule reads (FS-9PN7X §C.1)
  private walls: Map<
    string,
    { pieces: BuildingPart[]; entityId: string; houseId?: string; pos?: Point }
  > = new Map();

  // 門 (從後端同步) — the baked door showing its state's frame (FS-2325V §C.4); without a
  // manifest, the placeholder slab on its own lifted plane. `pos` is the closed door's
  // centre, the point interaction is measured from
  private serverDoors: Map<
    string,
    {
      sprite?: Phaser.GameObjects.Sprite;
      slab?: { rect: Phaser.GameObjects.Rectangle; plane: WorldPlane };
      /** In a room's wall: part of the room, so it covers the player from outside (§E.1). */
      inRoom: boolean;
      entityId: string;
      isOpen: boolean;
      pos: Point;
    }
  > = new Map();
  private serverBuildingsCreated = false;
  /** The placeholder floor drawn under each house when there is no baked ground to paint it on. */
  private houseFloors: Phaser.GameObjects.GameObject[] = [];

  // 寶箱跳窗: the satchel a coffer opens into (FS-2325V §D)
  private containerView!: ContainerView;
  /**
   * The shut container the player reached for, until the server answers: its coffer opens on the
   * state that shows it open, never before, so a refused reach shows no coffer (FS-KE075 §J R60).
   */
  private reaching?: string;
  /**
   * What the states have shown of that reach: once one shows the player's timed open on it, the
   * reach is given up when their position changes from that state's, and when the timed open is
   * gone with the container still shut (FS-MQYEX R26).
   */
  private reachSeen: ReachSeen = reachMade();
  /**
   * The player's own timed open as the last state carried it, when that state arrived, and the
   * open bar drawn for it over the container (FS-MQYEX R22). Unset while no state carries one:
   * the bar only shows what the server counts, and never opens anything.
   */
  private timedOpen?: { open: TimedOpenState; seenAt: number; bar: Phaser.GameObjects.Graphics };

  // 道具欄 + 裝備面板: the equip HUD, shared with the field scene (FS-X2F2H §Requirements 56)
  private equipment?: EquipmentHud;

  /** The player's strike and casts, shared with the field scene (FS-X2F2H §Requirements 56). */
  private readonly combat = new PlayerCombat(
    {
      sendMessage: (action, payload) => socketManager.sendMessage(action, payload),
      later: (ms, fn) => this.time.delayedCall(ms, fn),
      now: () => this.time.now,
      // a cast sent over a living, shown monster names it the last-hit one (FS-48CTQ §C.6)
      castSent: () => {
        const named = castTarget(this.monsters?.hoveredId, this.monsters?.targetable() ?? []);
        if (named) this.lastHit.aimed(named, this.time.now);
      },
    },
    {
      slash: (from, to) => this.playWarriorSlashEffect(from.x, from.y, to.x, to.y),
      dash: (from, to) => this.playWarriorDashEffect(from.x, from.y, to.x, to.y),
      arrow: (from, to) => {
        if (this.fx) playArrowRelease(this.fx, "self", from, to);
      },
      fireball: (from, to) => {
        if (this.fx) playFireballCast(this.fx, "self", from, to);
      },
      cut: (from, to) => this.kit.playCut(from, to),
      riposte: (from, to) => this.kit.playRiposte(from, to),
      parry: () => this.kit.raiseParry(this.time.now),
      shadowShot: (from, to) => {
        if (this.fx) playShadowShotRelease(this.fx, "self", from, to);
      },
      aim: (from, ready) => this.drawAim(from, ready),
      endAim: () => this.endAimDrawing(),
      // a charge only when one carries the player (FS-3V7GC R6): every other clip is the plain attack
      attackClip: (aim, swing) =>
        swing === undefined
          ? this.playerAnim?.attack(this.time.now, aim)
          : this.playerAnim?.attack(this.time.now, aim, swing),
      lockout: () => this.showAbilityCard(),
    },
    () => this.lastGameState?.current_player,
  );
  /** Projectiles in flight: baked body, trail, riding light, impact (FS-KYPQ9 §E.2–§F.4). */
  private projectiles?: ProjectileFlights;
  /** The map floor, a world-coordinate plane; house floors are added to it. */
  private groundPlane?: WorldPlane;
  /** Baked art (FS-2325V §B.6); an empty library draws placeholders. */
  private art!: ArtLibrary;
  /** Baked ground, when the manifest has it; otherwise `groundPlane` is the placeholder floor. */
  private groundLayer?: GroundLayer;
  /** How this run is drawn: its world theme's look (FS-8RBQY §A). */
  private worldLook: WorldThemeLook = WORLD_THEMES[RUN_WORLD_THEME];
  /** The tower's outer wall around this floor (FS-8RBQY §B.5); rebuilt for each floor. */
  private perimeter?: Phaser.GameObjects.Sprite[];
  /**
   * What this floor is drawn with: its band's ground, walls and dressing, and its seed
   * (FS-8RBQY §C.1–§C.3). Resolved from the floor's first broadcast, forgotten at `leaveFloor`.
   */
  private floorLook?: FloorLook;
  /** This floor's run dressing (FS-8RBQY §C.4); built once its static entities are known. */
  private dressing?: Phaser.GameObjects.Sprite[];
  /** The same dressing, each piece with where it stands, for the hide rule (FS-9PN7X §C.2). */
  private dressingAt: { sprite: Phaser.GameObjects.Sprite; pos: Point }[] = [];
  /** Fixed lights built this broadcast, waiting on the floor's light budget (FS-8RBQY §C.6). */
  private pendingLights: FixedLight<{ source: LightSource } & LightRoom>[] = [];
  /** How many fixed lights this floor has stamped so far. */
  private stampedLights = 0;
  /**
   * The containers whose pool this floor has queued, by entity id: on a dungeon floor a container
   * leaves the snapshot and comes back (FS-KE075 §H.48), and keeps the one pool it has.
   */
  private pooledContainers = new Set<string>();
  /** FS-2325V §C.7: replaces the overlay torch pool. */
  private lightMap?: LightMap;
  /** Every world effect's sprites, emitters, tweens and lights, by owner (FS-KYPQ9 §B.9). */
  private fx?: EffectsRuntime;
  /** The warrior's charge kicking dust at their drawn feet while the server carries it (§D.2). */
  private charge?: Charge;
  /** The struck-character tint (FS-KYPQ9 §G.1). */
  private hits?: HitFeedback;
  /** The local player's shimmers: the heal shimmer on a drink (FS-KZC92 §G). */
  private shimmers?: ShimmerFx;
  /** Reads a drink off `current_player` alone; never a teammate's (FS-KZC92 R33–R35). */
  private readonly drinks = new PotionDrinkWatcher();
  /** Which characters have settled their death dust this death (FS-KYPQ9 §G.2). */
  private readonly deathDust = new DeathDust();
  /** The run's monsters and corpses, from state (FS-77AB6 req 34–39). */
  private monsters?: MonsterRoster;
  /**
   * What a living monster under the pointer does (FS-77AB6 req 39): strike-mark, and a strike. A
   * strike sent names its monster the last-hit one (FS-48CTQ §C.6).
   */
  private readonly monsterTargeting: MonsterTargeting = {
    strike: (monster) => {
      if (this.strike(monster.entity_id, monster.position)) this.lastHit.aimed(monster, this.time.now);
    },
    hover: (monster) =>
      this.input.setDefaultCursor(monster ? this.crosshairCursorCSS : this.defaultCursorCSS),
  };
  /** What a monster's actions play on the world (FS-VHGE7 §D R32–33): a demon's fire claw. */
  private readonly monsterEffects: MonsterEffects = {
    claw: (monster, at) => {
      if (this.fx) playDemonClaw(this.fx, monster.entity_id, at, monster.facing);
    },
  };
  /** The floor's marker mode (FS-48CTQ §A.1): overhead plates, or the target frame. */
  private markers: MarkerMode = "overhead";
  /** The top-centre frame naming one monster on a `frame` floor (FS-48CTQ §C). */
  private targetFrame?: TargetFrame;
  /** How the minimap is shown (FS-1SEF0 §A): this browser's choice, read as the run's HUD is made; M steps it. */
  private minimapMode: MinimapMode = "normal";
  /** Where this browser keeps the minimap's mode (FS-1SEF0 §A.4). */
  private readonly minimapStore: MinimapModeStore = browserMinimapStore;
  /** Where the fullscreen button is stood, beside the minimap or in its corner (FS-56CKV §Change: Minimap at the top, fullscreen button beside it). */
  private readonly fullscreenButton: FullscreenButtonPlace = fullscreenButtonPlace;
  /** The monster the local player last hit, held 3 s from their last own hit (FS-48CTQ §C.6). */
  private readonly lastHit = new LastHitTracker();
  /** The boss engaged with the party, latched across broadcasts (FS-48CTQ §D.10). */
  private readonly bosses = new BossEngagement();
  private occluders = new Occluders();
  /** How far above the floor a house's walls reach on screen, for the blackout's hole. */
  private wallTop = WALL_HEIGHT;
  private readonly PENDING_DURATION = 1000; // 1 秒內不比對剛拿的物品
  private lastGameState?: ClientGameState;

  // 狀態追蹤：避免重複通知（每秒 33 幀會重複收到相同狀態）
  private previousEscapeDoorOpened: boolean | null = null;
  private previousSwitchActivated: boolean | null = null;
  private escapedPlayers: Set<string> = new Set();
  private escapedCountText?: Phaser.GameObjects.Text;
  /** The dev position readout (FS-56CKV §C); none in a production build. */
  private positionReadout?: Phaser.GameObjects.Text;
  /** "Floor N" (FS-M8CSE R7), hidden where the broadcast carries no floor. */
  private floorText?: Phaser.GameObjects.Text;
  private shownFloorLabel: string | null = null;
  /**
   * The floor the last broadcast stood on (FS-F6F88 req 28). Undefined until the first broadcast
   * of a start, so a reconnect builds the party's floor directly with no transition (req 32).
   */
  private lastFloor?: number;
  /**
   * The arrival card a climb comes back up through (FS-PQ2TW R37): the shared piece's, told when
   * the new floor is built from its map (FS-KE075 §H.41), and leaves as the card's one switch says,
   * ash (FS-PQ2TW §Change: Ash R53). It lets its own card go at a scene end.
   */
  private readonly arrivalCard = new ArrivalCard(this, cardLeaves(this, () => this.art));

  constructor() {
    super({ key: "BarrowspireScene" });
  }

  /**
   * Phaser reuses this instance when the scene restarts (a reconnect mid-run is a
   * `world_entered` for the run the player is already in), so everything a run
   * builds is forgotten when it stops, and the next start rebuilds it through the
   * same code path (FS-2325V "Edge States": reconnect mid-run).
   */
  init(data?: { sessionID?: string; arrival?: boolean }): void {
    // the run this scene was started for; state from any other world is not ours to draw
    this.sessionID = data?.sessionID;
    // whether the switch that started it was an arrival (FS-PQ2TW R8); a reconnect is a return
    this.arrival = data?.arrival ?? false;
    // a Leave the last run left pending (one pressed while it still loaded) is not this run's
    this.leavePending = false;
    // a stop, or the game's destroy mid-run (the page unmounts), which skips SHUTDOWN
    onSceneEnd(this, (end) => this.resetRun(end));
    // the run's creatures may download before create subscribes: a refresh into a run whose art the
    // menu evicted (FS-C4JWH Edge States); handed over at the end of create
    this.held = holdOneShots(this, socketManager, RUN_ONE_SHOTS, (action, payload) => {
      // A run that ends while it still downloads: its own settlement will open the record once
      // create hands it over, so the hub that comes with the end waits behind it, as it does once
      // the run has loaded (FS-GV8WN R23). Another run's settlement opens nothing, and holds nothing.
      if (action === "settlement" && this.ownSettlement(payload as SettlementPayload)) this.resultHold.raise();
    });
  }

  /**
   * Drops every subscription and every reference to the stopped run's world. Phaser
   * has already destroyed the game objects; what is left here are the maps and flags
   * that would otherwise make the next start skip building walls, roofs and players,
   * or touch sprites that no longer exist. On the game's destroy the scene's plugins are already
   * gone and are asked nothing (`SceneEnd`).
   */
  private resetRun(end: SceneEnd): void {
    // the corner back to the fullscreen button, unless a later scene has stood it (FS-56CKV §Change C6)
    this.fullscreenButton.takeBack(this);
    this.gameStateUnsubscribe?.();
    this.gameStateUnsubscribe = undefined;
    this.floorMapUnsubscribe?.();
    this.floorMapUnsubscribe = undefined;
    this.connectionStatusUnsubscribe?.();
    this.connectionStatusUnsubscribe = undefined;
    socketManager.off("exit_door_unlocked");
    socketManager.off("interact");
    socketManager.off("equip");
    socketManager.off("end_game");
    socketManager.off("settlement");
    socketManager.off("leave_run");
    socketManager.offError("leave_run");
    socketManager.offError("forfeit_run");

    this.player = undefined;
    this.playerPos = undefined;
    this.playerLegs = undefined;
    this.playerNameText = undefined;
    this.playerAnim = undefined;
    this.playerFacing = "se";
    this.walkPhase = 0;
    this.ownHealth = undefined;
    this.targetPosition = null;

    this.otherPlayers.clear();
    this.otherPlayersPos.clear();
    this.otherPlayersTargets.clear();
    this.teammateHealthBars.clear();
    this.otherPlayersLegs.clear();
    this.otherPlayersFacing.clear();
    this.otherPlayersWalkPhase.clear();
    this.otherPlayersClass.clear();
    this.otherPlayersAnim.clear();
    this.otherPlayersNameTexts.clear();
    this.otherPlayersPrevHp.clear();

    this.buildings = [];
    // Phaser has destroyed the rooms and the blackout's Graphics already, which destroying again
    // leaves be; the next run makes its own with its first floor's walls
    this.view?.destroy();
    this.view = undefined;
    this.roomLights = [];
    this.hallLights = [];
    this.roofCover = [];
    this.outsideObjects = [];
    this.chests.clear();
    // the bar went down with the scene's objects
    this.timedOpen = undefined;
    this.escapeDoors.clear();
    this.switches.clear();
    this.stairs.forget();
    this.trails.forget();
    this.walls.clear();
    this.serverDoors.clear();
    this.serverBuildingsCreated = false;
    // projectiles cleared by a reset land nowhere: no impact, no body, trail or light left (§B.9)
    this.projectiles?.clear();
    this.projectiles = undefined;
    // every effect's sprites, emitters, tweens, timers and short-lived lights (FS-KYPQ9 §B.9, §C.4)
    this.fx?.clearAll();
    this.fx = undefined;
    this.charge = undefined;
    this.hits?.clearAll();
    this.hits = undefined;
    // every live shimmer and its light, and the next run's first state is a baseline (FS-KZC92 R26)
    this.shimmers?.forget();
    this.shimmers = undefined;
    this.drinks.forget();
    this.lightMap?.clearTransient();
    this.houseFloors = [];
    this.groundPlane = undefined;
    this.groundLayer = undefined;
    this.perimeter = undefined;
    this.floorLook = undefined;
    this.dressing = undefined;
    this.dressingAt = [];
    this.pendingLights = [];
    this.stampedLights = 0;
    this.pooledContainers = new Set();
    this.lightMap = undefined;
    this.monsters = undefined;
    this.wallTop = WALL_HEIGHT;

    this.controlsPanel = undefined;
    this.runEnded = false;
    // a hub held behind the record must not switch the next run away (FS-GV8WN R23), and the
    // record is this run's alone: entering any other world clears it (R22). Its objects went
    // down with the scene's.
    this.resultHold.clear();
    this.settlementRecord = undefined;
    this.resolvedCard = undefined;
    this.canWatch = false;
    this.canLeave = false;
    this.row = { names: "", buttons: [] };
    this.watchedPlayerId = undefined;
    this.followedSprite = undefined;
    this.spectateHud = undefined;
    this.resolvedKind = undefined;
    this.leaveButton = undefined;
    this.leavePending = false;
    // the menu went down with the scene's objects; its keys are rebound by the next create
    this.menu = undefined;
    this.menuChoices = undefined;
    this.menuFor = undefined;
    this.fallPending = false;
    this.striding = false;
    // on a stop the keyboard is handed back, by the keys still held here; either way the next
    // run's create binds its keys afresh
    if (end === "shutdown") this.handBackKeyboard();
    this.dismissKey = undefined;
    this.confirmKey = undefined;
    this.choiceKeys = [];
    this.tabKey = undefined;
    this.progressHud = undefined;
    this.resourceHud = undefined;
    this.chatWindow?.destroy();
    this.chatWindow = undefined;
    this.potionHud = undefined;
    this.partyPanel?.destroy();
    this.partyPanel = undefined;
    this.invitePrompt?.destroy();
    this.invitePrompt = undefined;
    this.partyFrames?.destroy();
    this.partyFrames = undefined;
    this.abilityHud = undefined;
    // the kit's tells, slices and aim line go with the run, and the next first state is a fresh
    // baseline: a reconnect flashes nothing (FS-MAMHR §G.36)
    this.kit.forget();
    // a hold dies with its run: nothing is sent, nothing queued for later (FS-JTNPR req 15); the
    // combat's reset below drops the hold and the lockout
    this.game?.events.off(Phaser.Core.Events.BLUR, this.cancelAim, this);
    this.game?.events.off(Phaser.Core.Events.HIDDEN, this.cancelAim, this);
    this.characterLevel = undefined;
    this.equipment?.release();
    this.equipment = undefined;
    this.escapedCountText = undefined;
    this.floorText = undefined;
    this.positionReadout = undefined;
    // the frame went down with the scene's objects; the next run's first state sets its floor's mode
    this.targetFrame = undefined;
    this.lastHit.clear();
    this.bosses.clear();
    this.markers = "overhead";
    this.shownFloorLabel = null;
    this.lastFloor = undefined;
    // the next run is sized and built from its own map
    this.mapWidth = 0;
    this.mapHeight = 0;
    this.fittedTo = undefined;
    this.dungeon = undefined;
    this.builtFloor = undefined;
    this.floorWalls = [];
    this.mapWait.reset();
    this.combat.reset();
    this.lastGameState = undefined;
    this.sessionID = undefined;
    this.previousEscapeDoorOpened = null;
    this.previousSwitchActivated = null;
    this.escapedPlayers.clear();
  }

  /**
   * What the run left on the scene's keyboard, which Phaser keeps across restarts. Only on a stop:
   * a destroyed game took its keyboard, keys and captures with it (`SceneEnd`).
   */
  private handBackKeyboard(): void {
    const keyboard = this.input?.keyboard;
    if (!keyboard) return;
    // the run's end locks the keyboard, so the next run would start unable to move
    keyboard.enabled = true;
    // Phaser's stop destroyed the run's keys already and kept their captures: Tab's would stop
    // focus moving in the hub and its DOM overlays
    releaseCaptures(keyboard, [
      ...Object.values(this.cursors ?? {}),
      ...Object.values(this.wasd ?? {}),
      this.tabKey,
      this.dismissKey,
      this.confirmKey,
      ...this.choiceKeys,
    ]);
  }

  /** The run's keys, polled each frame or answered on press. Each captures its key (`SceneEnd`). */
  private bindKeys(): void {
    // 輸入控制
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // Tab: the next player to watch (FS-QPDKN req 8). Captured, so the browser does not move
    // focus off the canvas; nothing happens unless this player is spectating.
    this.tabKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TAB, true);
    this.tabKey.on("down", () => this.cycleWatched());

    // The run's ESC menu (FS-9K8EZ req 1): ESC opens and closes it, a number picks a row, Enter
    // the first. Polled each frame in update, as the hub's are. Nothing here leaves the run: the
    // server keeps the body in the world whoever is looking at it (FS-QPDKN req 13).
    this.dismissKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.confirmKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.choiceKeys = [Phaser.Input.Keyboard.KeyCodes.ONE, Phaser.Input.Keyboard.KeyCodes.TWO].map(
      (code) => this.input.keyboard!.addKey(code),
    );
  }

  private toggleControlsPanel(): void {
    if (this.controlsPanel) {
      this.controlsPanel.destroy();
      this.controlsPanel = undefined;
      return;
    }

    const panelW = 260;
    const panelH = 300;
    const x = viewport.width / 2;
    const y = viewport.height / 2;

    const children: Phaser.GameObjects.GameObject[] = [];

    const bg = this.add.graphics();
    bg.fillStyle(palette.ink, 0.92);
    bg.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 8);
    bg.lineStyle(1, palette.frame, 0.5);
    bg.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 8);
    children.push(bg);

    const title = this.add.text(0, -panelH / 2 + 16, "CONTROLS", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "16px",
      color: toCss(palette.frameBright),
      letterSpacing: 5,
    });
    title.setOrigin(0.5);
    children.push(title);

    const controls = [
      ["WASD", "Move"],
      ["E", "Interact"],
      ["F", "Take Item"],
      ["I / B", "Gear and bag"],
      ["T", "Party"],
      ["ENTER", "Chat"],
      ["Q", "Close Panel"],
      ["LEFT CLICK", "Attack"],
      // the class's own ability, named as its HUD card names it (FS-8AY7S req 30)
      ["RIGHT CLICK", ABILITY_COPY[this.ownClass()]?.name ?? "Class ability"],
      [RUN_ACTIONS.drinkPotion.label, "Drink potion"],
      ["H", "Toggle Controls"],
      ["ESC", "Menu"],
    ];

    let curY = -panelH / 2 + 44;
    for (const [key, action] of controls) {
      const keyText = this.add.text(-panelW / 2 + 20, curY, key, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "11px",
        color: toCss(palette.frameBright),
        letterSpacing: 2,
      });
      const actionText = this.add.text(panelW / 2 - 20, curY, action, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "11px",
        color: toCss(palette.hudLabel),
      });
      actionText.setOrigin(1, 0);
      children.push(keyText, actionText);
      curY += 20;
    }

    const hint = this.add.text(0, panelH / 2 - 16, "H to close", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "10px",
      color: toCss(palette.hudFaint),
    });
    hint.setOrigin(0.5);
    children.push(hint);

    this.controlsPanel = this.add.container(x, y, children);
    this.controlsPanel.setDepth(1200);
    this.controlsPanel.setScrollFactor(0);
  }

  /**
   * `end_game`: the run is over. No card goes up (FS-GV8WN R24): the resolved view comes down,
   * the menu and an aim with it, and the keys are locked. The hub `world_entered` that comes with
   * it waits only on an open settlement record (R23, `resultHold`); otherwise it applies at once.
   */
  private endRun(): void {
    if (this.runEnded) return;
    this.runEnded = true;
    // the run's end carries the last word; the menu never covers it (FS-9K8EZ req 6)
    this.takeDownResolvedView();
    this.closeMenu();
    // the run is over: a Shadow Shot hold ends with nothing sent (FS-JTNPR req 15)
    this.cancelAim();
    // a half-typed line goes, and the input hands the keyboard back before it is switched off
    // here, so nothing turns it on again (FS-WJGFJ R27)
    this.chatWindow?.cancelInput();
    if (this.input.keyboard) {
      this.input.keyboard.enabled = false;
    }
  }

  /**
   * `settlement` (FS-GV8WN R19–R21): the first opens the record at once; every one replaces its
   * content, so a confirmed copy moves only the status line. A record the player closed stays
   * closed: the Settlement button brings it back.
   */
  private showSettlement(payload: SettlementPayload): void {
    // a late confirmation of an earlier run, landing in this one, is not its record (R20)
    if (!this.ownSettlement(payload)) return;
    const first = !this.settlementRecord;
    this.settlementRecord ??= new SettlementRecord(this, this.recordAnchor(), () => this.closeRecord());
    this.settlementRecord.set(settlementRecord(payload));
    if (first) this.openRecord();
    this.syncRow();
  }

  /** Whether a settlement is this run's record: one for another run is a late confirmation (R20). */
  private ownSettlement(payload: SettlementPayload): boolean {
    return payload?.run_id === undefined || this.sessionID === undefined || payload.run_id === this.sessionID;
  }

  /** The record up, and the return to the town held behind it unless a Leave is on its way (R23). */
  private openRecord(): void {
    if (!this.settlementRecord) return;
    this.settlementRecord.open();
    this.holdBehindRecord();
  }

  /** Holds the return to the town behind the record when {@link recordHoldsTown} says so (R23). */
  private holdBehindRecord(): void {
    const state = {
      recordOpen: this.settlementRecord?.isOpen() ?? false,
      leavePending: this.leavePending,
    };
    if (recordHoldsTown(state)) this.resultHold.raise();
  }

  /** The record down, and a hub held behind it applied (R23). Client-only: nothing is sent. */
  private closeRecord(): void {
    this.settlementRecord?.close();
    this.resultHold.release();
  }

  /** The Settlement button: the record up if it is down, down if it is up (R21). */
  private toggleRecord(): void {
    if (this.settlementRecord?.isOpen()) this.closeRecord();
    else this.openRecord();
  }

  /** The record's place: centred across, standing just over the bottom-centre row. */
  private recordAnchor(): { x: number; bottom: number } {
    return { x: viewport.centerX, bottom: this.rowY() - BUTTON_H / 2 - RECORD_ROW_GAP };
  }

  /** The bottom-centre row's line: the buttons' centre y. */
  private rowY(): number {
    return viewport.height - RESOLVED_ROW_MARGIN - RESOLVED_ROW_LIFT - BUTTON_H / 2;
  }

  /**
   * The bottom-centre row (FS-QPDKN req 3, amended; FS-GV8WN R21, R25): Watch the delve for an
   * escaped player who can, Leave the barrow for an escaped player, and Settlement once a record
   * has come, spread about the centre. Redrawn only when the buttons it holds change; none once
   * the run has ended. A Leave drawn while a leave is pending comes up dimmed.
   */
  private syncRow(): void {
    const names: RowButton[] = this.runEnded
      ? []
      : resolvedRow({
          canWatch: this.canWatch,
          canLeave: this.canLeave,
          hasRecord: this.settlementRecord?.hasContent() ?? false,
        });
    const key = names.join(",");
    if (key === this.row.names) return;
    this.row.buttons.forEach((button) => button.destroy());
    const specs: Record<RowButton, ButtonSpec> = {
      watch: this.watchSpec,
      leave: this.leaveSpec,
      settlement: this.settlementSpec,
    };
    const y = this.rowY();
    const buttons = names.map((name, i) =>
      this.hudButton(
        specs[name],
        { x: rowSlotX(i, names.length, viewport.centerX, BUTTON_W, BUTTON_GAP), y },
        RESOLVED_ROW_DEPTH,
      ),
    );
    const leaveAt = names.indexOf("leave");
    this.row = { names: key, buttons, leave: leaveAt < 0 ? undefined : buttons[leaveAt] };
    this.row.leave?.setEnabled(!this.leavePending);
  }

  preload(): void {
    // 1. Wizard (Mage) Palettes
    const playerPalette: WizardPalette = {
      hat: palette.playerCloak,
      hatShade: shade(palette.playerCloak, 0.45),
      band: palette.frame,
      robe: tint(palette.playerCloak, 0.06),
      robeShade: palette.playerCloakShade,
      robeLight: tint(palette.playerCloak, 0.16),
      face: palette.hoodShadow,
      eye: palette.torch,
      staff: palette.floor,
      orb: palette.torchCore,
      orbGlow: palette.torch,
      ink: palette.ink,
    };
    const rivalPalette: WizardPalette = {
      hat: tint(palette.rivalCloak, 0.02),
      hatShade: shade(palette.rivalCloak, 0.45),
      band: palette.hostile,
      robe: tint(palette.rivalCloak, 0.04),
      robeShade: shade(palette.rivalCloak, 0.35),
      robeLight: tint(palette.rivalCloak, 0.14),
      face: palette.inkDeep,
      eye: palette.safe,
      staff: palette.wall,
      orb: palette.safe,
      orbGlow: palette.safe,
      ink: palette.inkDeep,
    };

    // 2. Knight (Warrior) Palettes
    const knightPalette: KnightPalette = {
      helm: palette.wallTop,
      helmShade: palette.wall,
      helmLight: tint(palette.wallTop, 0.16),
      plate: tint(palette.wall, 0.1),
      plateShade: shade(palette.wall, 0.2),
      plateLight: tint(palette.wallTop, 0.12),
      surcoat: tint(palette.ground, 0.08),
      surcoatShade: shade(palette.ground, 0.2),
      visor: palette.torchCore,
      visorGlow: palette.torch,
      sword: tint(palette.wallTop, 0.3),
      swordHilt: palette.frame,
      shield: palette.ground,
      shieldTrim: palette.frame,
      ink: palette.ink,
    };
    const rivalKnightPalette: KnightPalette = {
      helm: 0x3e4248,
      helmShade: 0x292c30,
      helmLight: 0x54585f,
      plate: 0x2d3136,
      plateShade: 0x1c1f23,
      plateLight: 0x3d4248,
      surcoat: 0x2b1c2b,
      surcoatShade: 0x1b1c20,
      visor: 0x5294e2,
      visorGlow: 0x4ecca3,
      sword: 0x5a5e65,
      swordHilt: 0x4a4e55,
      shield: 0x1b141c,
      shieldTrim: 0x52555c,
      ink: 0x0d0b0a,
    };

    // 3. Archer Palettes
    const archerPalette: ArcherPalette = {
      hood: 0x3c5a36,        // forest green
      hoodShade: 0x243b20,   // darker forest green
      leather: 0x6e4e37,     // brown leather jerkin
      leatherShade: 0x4a3322,// dark brown leather
      trim: 0xd4a373,        // brass/gold buckles
      face: 0xdcbd9d,        // skin tone
      eye: 0xe8a14d,         // eye highlight
      bow: 0x8c6239,         // wood bow
      string: 0xf2ebd9,      // cream bowstring
      ink: 0x0d0b0a,
    };
    const rivalArcherPalette: ArcherPalette = {
      hood: 0x252e27,        // dark forest green-black
      hoodShade: 0x151c16,   // necrotic dark green
      leather: 0x35312e,     // dark charcoal leather
      leatherShade: 0x1a1918,// black leather
      trim: 0x7d6b58,        // dull bronze
      face: 0x323a30,        // necrotic skin tone
      eye: 0x6f8f4a,         // glowing green eye
      bow: 0x423830,         // dark wood
      string: 0x8a929a,      // cold gray string
      ink: 0x15171a,
    };

    // --- Build Fallbacks ---
    this.createKnightTextures("player", knightPalette);
    this.createSoldierTextures("otherPlayer", rivalPalette);

    // --- Build Class Sprites ---
    // Local player class sprites
    this.createKnightTextures("player_warrior", knightPalette);
    this.createSoldierTextures("player_mage", playerPalette);
    this.createArcherTextures("player_archer", archerPalette);
    // the Mercenary's own placeholder: his fallback when the art is missing, as every class has
    this.createMercenaryTextures("player_mercenary");

    // Other players class sprites
    this.createKnightTextures("other_warrior", rivalKnightPalette);
    this.createSoldierTextures("other_mage", rivalPalette);
    this.createArcherTextures("other_archer", rivalArcherPalette);
    this.createMercenaryTextures("other_mercenary");

    this.createChestTextures();
    this.createSackTextures();
    this.createEscapeDoorTextures();
    this.createSwitchTextures();
    this.createStairsTexture();
    this.createDropPileTexture();

    // baked world and prop art (FS-2325V §B.6); the textures above stay as placeholders. The
    // creatures and the boss load with the run, for every floor: a climb loads nothing, and the
    // demon is never drawn before its art is in (FS-C4JWH §B R9)
    preloadArt(this, SCENE_ART.BarrowspireScene, {
      bar: () => drawTorchBar(this),
      fadeIn: true,
    });
  }

  private createSoldierTextures(prefix: string, pal: WizardPalette): void {
    const facings: Array<"down" | "up" | "left" | "right"> = [
      "down",
      "up",
      "left",
      "right",
    ];
    for (const facing of facings) {
      const g = this.make.graphics({});
      this.drawWizard(g, facing, pal);
      g.generateTexture(this.facingTextureKey(prefix, facing), 60, 60);
      g.destroy();
    }
  }

  /**
   * The player/rival sprite: a hooded wizard-player — pointed wide-brim hat,
   * flowing robe, and a staff with a glowing orb. Hand-placed pixel blocks on a
   * 24×26 logical grid (2px cells), dark-outlined so the figure reads against
   * the barrow dark. Same 60×60 frame and 4-facing rig as before — only the
   * drawing changed. See docs/design-guideline.md.
   */
  private drawWizard(
    g: Phaser.GameObjects.Graphics,
    facing: "up" | "down" | "left" | "right",
    pal: WizardPalette,
  ): void {
    const P = 2; // device px per logical pixel — chunky, readable
    const W = 24;
    const H = 26;
    const ox = (60 - W * P) / 2; // centre the figure in the 60×60 frame
    const oy = (60 - H * P) / 2;

    const grid: (number | null)[][] = Array.from({ length: H }, () =>
      Array<number | null>(W).fill(null),
    );
    const soft: boolean[][] = Array.from({ length: H }, () =>
      Array<boolean>(W).fill(false),
    );
    const set = (x: number, y: number, c: number, isSoft = false) => {
      if (x < 0 || x >= W || y < 0 || y >= H) return;
      grid[y][x] = c;
      soft[y][x] = isSoft;
    };
    const bar = (y: number, x0: number, x1: number, c: number) => {
      for (let x = x0; x <= x1; x++) set(x, y, c);
    };

    const back = facing === "up";
    const left = facing === "left";
    const right = facing === "right";
    const side = left || right;
    const lean = left ? -1 : right ? 1 : 0; // hat-tip lean on profiles

    // staff + glowing orb (orb halo is soft → excluded from the hard outline)
    const staffCol = left ? 3 : 20;
    for (let y = 5; y <= 24; y++) set(staffCol, y, pal.staff);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        set(staffCol + dx, 3 + dy, pal.orbGlow, true);
    set(staffCol, 3, pal.orb, true);

    // pointed hat cone
    const cone: Array<[number, number]> = [
      [12, 12],
      [12, 13],
      [11, 13],
      [11, 14],
      [10, 15],
      [10, 15],
      [9, 16],
    ];
    cone.forEach(([a, b], i) => {
      bar(i, a + lean, b + lean, pal.hat);
      const mid = Math.ceil((a + b) / 2) + lean;
      for (let x = mid + 1; x <= b + lean; x++) set(x, i, pal.hatShade);
    });
    bar(7, 8, 17, pal.band); // hat band
    bar(8, 6, 19, pal.hat); // wide brim
    bar(9, 5, 20, pal.hat);
    for (let x = 12; x <= 20; x++) set(x, 9, pal.hatShade); // brim underside

    // head / face under the brim
    if (back) {
      bar(10, 9, 14, pal.hat);
      bar(11, 9, 14, pal.hatShade);
      bar(12, 10, 13, pal.hat);
    } else {
      bar(10, 9, 14, pal.face);
      bar(11, 9, 14, pal.face);
      bar(12, 10, 13, pal.face);
      if (side) {
        set(left ? 9 : 14, 11, pal.eye, true); // single eye toward facing
      } else {
        set(10, 11, pal.eye, true);
        set(13, 11, pal.eye, true);
      }
    }

    // robe: shoulders → hem (narrower in profile)
    const robe: Array<[number, number]> = [
      [8, 15],
      [8, 16],
      [7, 16],
      [7, 17],
      [6, 17],
      [6, 18],
      [6, 18],
      [5, 18],
      [5, 19],
      [5, 19],
      [4, 19],
      [4, 19],
      [4, 19],
    ];
    robe.forEach(([a, b], i) => {
      const y = 13 + i;
      const lo = side ? a + 2 : a;
      const hi = side ? b - 2 : b;
      bar(y, lo, hi, pal.robe);
      const sh = Math.floor((lo + hi) / 2) + 1;
      for (let x = sh; x <= hi; x++) set(x, y, pal.robeShade); // shadow side
      if (i > 0 && i < 10) set(lo + 1, y, pal.robeLight); // lit seam
    });

    // derive a dark outline (soft/glow cells are not outline sources)
    const ink: Array<[number, number]> = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (grid[y][x] !== null) continue;
        const near =
          (grid[y][x - 1] != null && !soft[y][x - 1]) ||
          (grid[y][x + 1] != null && !soft[y][x + 1]) ||
          (grid[y - 1]?.[x] != null && !soft[y - 1][x]) ||
          (grid[y + 1]?.[x] != null && !soft[y + 1][x]);
        if (near) ink.push([x, y]);
      }
    }
    ink.forEach(([x, y]) => set(x, y, pal.ink));

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = grid[y][x];
        if (c === null) continue;
        g.fillStyle(c, soft[y][x] && c === pal.orbGlow ? 0.45 : 1);
        g.fillRect(ox + x * P, oy + y * P, P, P);
      }
    }
  }

  /** The Mercenary's placeholder at the four facings, drawn as the hub draws it. */
  private createMercenaryTextures(prefix: string): void {
    for (const facing of ["down", "up", "left", "right"] as const) {
      const g = this.make.graphics({});
      drawMercenary(g, facing);
      g.generateTexture(this.facingTextureKey(prefix, facing), 60, 60);
      g.destroy();
    }
  }

  private createArcherTextures(prefix: string, pal: ArcherPalette): void {
    const facings: Array<"down" | "up" | "left" | "right"> = [
      "down",
      "up",
      "left",
      "right",
    ];
    for (const facing of facings) {
      const g = this.make.graphics({});
      this.drawArcher(g, facing, pal);
      g.generateTexture(this.facingTextureKey(prefix, facing), 60, 60);
      g.destroy();
    }
  }

  private drawArcher(
    g: Phaser.GameObjects.Graphics,
    facing: "up" | "down" | "left" | "right",
    pal: ArcherPalette,
  ): void {
    const P = 2; // device px per logical pixel
    const W = 24;
    const H = 26;
    const ox = (60 - W * P) / 2;
    const oy = (60 - H * P) / 2;

    const grid: (number | null)[][] = Array.from({ length: H }, () =>
      Array<number | null>(W).fill(null),
    );
    const soft: boolean[][] = Array.from({ length: H }, () =>
      Array<boolean>(W).fill(false),
    );
    const set = (x: number, y: number, c: number, isSoft = false) => {
      if (x < 0 || x >= W || y < 0 || y >= H) return;
      grid[y][x] = c;
      soft[y][x] = isSoft;
    };
    const bar = (y: number, x0: number, x1: number, c: number) => {
      for (let x = x0; x <= x1; x++) set(x, y, c);
    };

    const back = facing === "up";
    const left = facing === "left";
    const right = facing === "right";
    const side = left || right;

    // --- Draw Bow ---
    if (left) {
      // Arc
      set(5, 7, pal.bow);
      set(4, 8, pal.bow);
      set(3, 9, pal.bow);
      set(3, 10, pal.bow);
      set(2, 11, pal.bow);
      set(2, 12, pal.bow);
      set(2, 13, pal.bow);
      set(2, 14, pal.bow);
      set(3, 15, pal.bow);
      set(3, 16, pal.bow);
      set(4, 17, pal.bow);
      set(5, 18, pal.bow);
      set(6, 19, pal.bow);
      // Bowstring
      for (let y = 7; y <= 19; y++) set(6, y, pal.string, true);
    } else if (right) {
      // Arc
      set(18, 7, pal.bow);
      set(19, 8, pal.bow);
      set(20, 9, pal.bow);
      set(20, 10, pal.bow);
      set(21, 11, pal.bow);
      set(21, 12, pal.bow);
      set(21, 13, pal.bow);
      set(21, 14, pal.bow);
      set(20, 15, pal.bow);
      set(20, 16, pal.bow);
      set(19, 17, pal.bow);
      set(18, 18, pal.bow);
      set(17, 19, pal.bow);
      // Bowstring
      for (let y = 7; y <= 19; y++) set(17, y, pal.string, true);
    } else if (facing === "down") {
      // Held on left side
      set(5, 8, pal.bow);
      set(4, 9, pal.bow);
      set(4, 10, pal.bow);
      set(4, 11, pal.bow);
      set(3, 12, pal.bow);
      set(3, 13, pal.bow);
      set(3, 14, pal.bow);
      set(4, 15, pal.bow);
      set(4, 16, pal.bow);
      set(4, 17, pal.bow);
      set(5, 18, pal.bow);
      // Bowstring
      for (let y = 8; y <= 18; y++) set(6, y, pal.string, true);
    } else if (back) {
      // Slung on back
      for (let i = 0; i < 11; i++) {
        set(7 + i, 8 + i, pal.bow);
        set(8 + i, 7 + i, pal.string, true);
      }
    }

    // --- Draw Hood (Head) ---
    // Rounded hood cap y = 5 to 9
    bar(5, 10, 13, pal.hood);
    bar(6, 9, 14, pal.hood);
    bar(7, 9, 14, pal.hood);
    bar(8, 8, 15, pal.hood);
    bar(9, 8, 15, pal.hood);
    
    // Add hood shadows/shading on right half
    for (let y = 5; y <= 9; y++) {
      const startX = 12;
      const endX = y === 5 ? 13 : y === 6 ? 14 : y === 7 ? 14 : 15;
      for (let x = startX; x <= endX; x++) set(x, y, pal.hoodShade);
    }

    // Face / Hood Opening (y = 10 to 12)
    if (back) {
      bar(10, 8, 15, pal.hoodShade);
      bar(11, 9, 14, pal.hoodShade);
      bar(12, 10, 13, pal.hoodShade);
    } else if (left) {
      // Face facing left
      bar(10, 8, 10, pal.face);
      bar(11, 8, 10, pal.face);
      bar(12, 9, 10, pal.face);
      set(8, 11, pal.eye, true); // Eye
      // Hood backing
      bar(10, 11, 14, pal.hood);
      bar(11, 11, 13, pal.hoodShade);
      bar(12, 11, 12, pal.hoodShade);
    } else if (right) {
      // Face facing right
      bar(10, 13, 15, pal.face);
      bar(11, 13, 15, pal.face);
      bar(12, 13, 14, pal.face);
      set(15, 11, pal.eye, true); // Eye
      // Hood backing
      bar(10, 9, 12, pal.hood);
      bar(11, 10, 12, pal.hoodShade);
      bar(12, 11, 12, pal.hoodShade);
    } else {
      // Facing down (front)
      bar(10, 10, 13, pal.face);
      bar(11, 10, 13, pal.face);
      bar(12, 10, 13, pal.face);
      set(10, 11, pal.eye, true);
      set(13, 11, pal.eye, true);
      // Hood wrap sides
      bar(10, 8, 9, pal.hood);
      bar(10, 14, 15, pal.hoodShade);
      bar(11, 8, 9, pal.hood);
      bar(11, 14, 14, pal.hoodShade);
      bar(12, 9, 9, pal.hood);
      bar(12, 14, 14, pal.hoodShade);
    }

    // --- Body / Leather Jerkin (y = 13 to 21) ---
    const bodyWidths: Array<[number, number]> = [
      [8, 15], // 13
      [8, 15], // 14
      [7, 16], // 15
      [7, 16], // 16
      [7, 16], // 17 (belt line)
      [6, 17], // 18
      [6, 17], // 19
      [6, 17], // 20
      [6, 17], // 21
    ];

    bodyWidths.forEach(([a, b], idx) => {
      const y = 13 + idx;
      const lo = side ? a + 1 : a;
      const hi = side ? b - 1 : b;
      
      // Draw leather base
      bar(y, lo, hi, pal.leather);
      
      // Shading on the right
      const mid = Math.floor((lo + hi) / 2) + 1;
      for (let x = mid; x <= hi; x++) set(x, y, pal.leatherShade);
      
      // Belt at y = 17
      if (y === 17) {
        bar(y, lo, hi, 0x14110c); // dark belt
        set(Math.floor((lo + hi) / 2), y, pal.trim); // buckle
      }
    });

    // --- Legs / Pants & Boots (y = 22 to 25) ---
    // Pants (y = 22, 23)
    bar(22, 8, 10, pal.hood);
    bar(22, 13, 15, pal.hoodShade);
    bar(23, 8, 9, pal.hood);
    bar(23, 14, 15, pal.hoodShade);
    // Boots (y = 24, 25)
    bar(24, 8, 9, pal.leatherShade);
    bar(24, 14, 15, pal.leatherShade);
    bar(25, 7, 9, pal.leatherShade);
    bar(25, 14, 16, pal.leatherShade);

    // --- Dark Outline ---
    const ink: Array<[number, number]> = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (grid[y][x] !== null) continue;
        const near =
          (grid[y][x - 1] != null && !soft[y][x - 1]) ||
          (grid[y][x + 1] != null && !soft[y][x + 1]) ||
          (grid[y - 1]?.[x] != null && !soft[y - 1][x]) ||
          (grid[y + 1]?.[x] != null && !soft[y + 1][x]);
        if (near) ink.push([x, y]);
      }
    }
    ink.forEach(([x, y]) => set(x, y, pal.ink));

    // Render grid to Phaser graphics object
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = grid[y][x];
        if (c === null) continue;
        g.fillStyle(c, 1);
        g.fillRect(ox + x * P, oy + y * P, P, P);
      }
    }
  }

  private createKnightTextures(prefix: string, pal: KnightPalette): void {
    const facings: Array<"down" | "up" | "left" | "right"> = [
      "down",
      "up",
      "left",
      "right",
    ];
    for (const facing of facings) {
      const g = this.make.graphics({});
      this.drawKnight(g, facing, pal);
      g.generateTexture(this.facingTextureKey(prefix, facing), 60, 60);
      g.destroy();
    }
  }

  /**
   * The knight-player sprite: battered medieval plate, a great helm with a narrow
   * glowing visor slit (the readable accent in the dark), a muted barrow-tone
   * surcoat, a sword and a kite shield. Hand-placed pixel blocks on the SAME
   * 24×26 logical grid (2px cells) and SAME 60×60 frame / 4-facing rig as the
   * wizard — only the drawing differs, so no animation/config changes. Dark
   * outline is derived so the figure reads against the barrow dark. See
   * docs/design-guideline.md.
   */
  private drawKnight(
    g: Phaser.GameObjects.Graphics,
    facing: "up" | "down" | "left" | "right",
    pal: KnightPalette,
  ): void {
    const P = 2; // device px per logical pixel — chunky, readable
    const W = 24;
    const H = 26;
    const ox = (60 - W * P) / 2; // centre the figure in the 60×60 frame
    const oy = (60 - H * P) / 2;

    const grid: (number | null)[][] = Array.from({ length: H }, () =>
      Array<number | null>(W).fill(null),
    );
    const soft: boolean[][] = Array.from({ length: H }, () =>
      Array<boolean>(W).fill(false),
    );
    const set = (x: number, y: number, c: number, isSoft = false) => {
      if (x < 0 || x >= W || y < 0 || y >= H) return;
      grid[y][x] = c;
      soft[y][x] = isSoft;
    };
    const bar = (y: number, x0: number, x1: number, c: number) => {
      for (let x = x0; x <= x1; x++) set(x, y, c);
    };

    const back = facing === "up";
    const left = facing === "left";
    const right = facing === "right";
    const side = left || right;
    const lean = left ? -1 : right ? 1 : 0; // slight profile lean

    // sword: a vertical blade on one side (mirrors the wizard's staff column).
    const swordCol = left ? 3 : 20;
    for (let y = 4; y <= 17; y++) set(swordCol, y, pal.sword);
    set(swordCol, 3, pal.sword); // tip
    set(swordCol + 1, 10, pal.swordHilt); // crossguard
    set(swordCol - 1, 18, pal.swordHilt);
    set(swordCol, 18, pal.swordHilt);
    set(swordCol + 1, 18, pal.swordHilt);
    set(swordCol, 19, pal.swordHilt); // grip
    set(swordCol, 20, pal.swordHilt); // pommel

    // great helm — bucket over the head (lean shifts it on profiles)
    bar(5, 9 + lean, 14 + lean, pal.helm);
    bar(6, 8 + lean, 15 + lean, pal.helm);
    for (let y = 7; y <= 13; y++) bar(y, 8 + lean, 15 + lean, pal.helm);
    // shaded right side + lit left edge for plate form
    for (let y = 5; y <= 13; y++) {
      for (let x = 12 + lean; x <= 15 + lean; x++)
        if (grid[y]?.[x] != null) set(x, y, pal.helmShade);
      set(8 + lean, y, pal.helmLight);
    }
    // small brass crest knob on top
    if (!back) {
      set(11 + lean, 3, pal.swordHilt);
      set(12 + lean, 3, pal.swordHilt);
      set(11 + lean, 4, pal.swordHilt);
      set(12 + lean, 4, pal.swordHilt);
    }

    // visor slit — the readable glowing accent (soft so it stays out of the ink)
    if (back) {
      bar(10, 9, 14, pal.helmShade); // back of helm: shaded band, no slit
      set(10, 8, pal.helmLight);
      set(13, 8, pal.helmLight);
    } else if (side) {
      const sx = left ? 8 : 13;
      set(sx + lean, 10, pal.visor, true);
      set(sx + 1 + lean, 10, pal.visor, true);
      set(sx + lean, 11, pal.visorGlow, true);
    } else {
      for (let x = 9; x <= 14; x++) set(x, 10, pal.visor, true);
      set(9, 11, pal.visorGlow, true);
      set(14, 11, pal.visorGlow, true);
    }

    // body: pauldrons → cuirass → faulds (narrower in profile)
    const body: Array<[number, number, number]> = [
      [13, 6, 17], // pauldrons
      [14, 6, 17],
      [15, 7, 16],
      [16, 7, 16],
      [17, 8, 15], // cuirass
      [18, 8, 15],
      [19, 8, 15],
      [20, 8, 15], // faulds
      [21, 9, 14],
    ];
    body.forEach(([y, a, b]) => {
      const lo = side ? a + 2 : a;
      const hi = side ? b - 2 : b;
      bar(y, lo, hi, pal.plate);
      const sh = Math.floor((lo + hi) / 2) + 1;
      for (let x = sh; x <= hi; x++) set(x, y, pal.plateShade); // shadow side
      set(lo, y, pal.plateLight); // lit edge
    });

    // surcoat / tabard down the front (front + profile), with a brass seam
    if (!back) {
      const cx0 = side ? (left ? 9 : 11) : 10;
      const cx1 = side ? (left ? 12 : 14) : 13;
      for (let y = 15; y <= 23; y++) {
        bar(y, cx0, cx1, pal.surcoat);
        for (let x = Math.floor((cx0 + cx1) / 2) + 1; x <= cx1; x++)
          set(x, y, pal.surcoatShade);
      }
      const seam = side ? (left ? 10 : 12) : 11;
      for (let y = 15; y <= 22; y++) set(seam, y, pal.swordHilt);
    }

    // greaves / boots flanking the surcoat
    for (let y = 22; y <= 25; y++) {
      set(side ? 10 : 9, y, pal.plate);
      set(side ? 11 : 10, y, pal.plateShade);
      if (!side) {
        set(13, y, pal.plate);
        set(14, y, pal.plateShade);
      }
    }

    // kite shield held on the off-hand (front/back only; omitted in profile for
    // a cleaner sword-forward silhouette)
    if (!side) {
      const kite: Array<[number, number]> = [
        [11, 3],
        [12, 3],
        [13, 3],
        [14, 3],
        [15, 4],
        [16, 4],
        [17, 4],
        [18, 4],
        [19, 5],
      ];
      kite.forEach(([y, a]) => {
        const b = y <= 14 ? 6 : y <= 17 ? 6 : 5;
        bar(y, a, b, pal.shield);
        set(a, y, pal.shieldTrim); // brass edge
      });
      set(6, 11, pal.shieldTrim);
      set(5, 14, pal.visor, true); // faint amber boss
      set(4, 14, pal.visorGlow, true);
    }

    // derive a dark outline (soft/glow cells are not outline sources)
    const ink: Array<[number, number]> = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (grid[y][x] !== null) continue;
        const near =
          (grid[y][x - 1] != null && !soft[y][x - 1]) ||
          (grid[y][x + 1] != null && !soft[y][x + 1]) ||
          (grid[y - 1]?.[x] != null && !soft[y - 1][x]) ||
          (grid[y + 1]?.[x] != null && !soft[y + 1][x]);
        if (near) ink.push([x, y]);
      }
    }
    ink.forEach(([x, y]) => set(x, y, pal.ink));

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = grid[y][x];
        if (c === null) continue;
        g.fillStyle(c, soft[y][x] && c === pal.visorGlow ? 0.45 : 1);
        g.fillRect(ox + x * P, oy + y * P, P, P);
      }
    }
  }

  private facingTextureKey(prefix: string, facing: string): string {
    return `${prefix}${facing.charAt(0).toUpperCase()}${facing.slice(1)}`;
  }

  /**
   * A targeted `attack` on the entity standing at world point `them` (FS-77AB6 req 39): only a
   * monster is ever one, players being allies (req 40). Sent only from a player still in the
   * delve, off cooldown and within reach, as the server would refuse anything else. Whether it
   * was sent.
   */
  private strike(entityId: string, them: Point): boolean {
    const me = this.playerPos;
    if (!this.player || !me || this.runEnded) return false;
    if (resolved(this.lastGameState?.current_player)) return false;
    // the pointer is the menu's while it is open (FS-9K8EZ req 5)
    if (this.menu) return false;

    // an archer's right button is the Shadow Shot hold, never a strike (FS-JTNPR req 8, 16)
    return this.combat.strike(me, entityId, them, this.ownClass(), this.input.activePointer?.button);
  }

  /**
   * Legs under a player drawn at screen `(x, y)`. The placeholder rig has four
   * facings, so an 8-way facing shows as the nearest of them until §E sheets land.
   */
  private drawLegs(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    facing: Facing8,
    walkPhase: number,
    isMoving: boolean,
    darkColor: number,
  ): void {
    drawPlayerLegs(graphics, x, y, nearestScreenFacing(facing), walkPhase, isMoving, darkColor);
  }

  /** The texture key for a class prefix and an 8-way facing (nearest placeholder facing). */
  private facingTexture(prefix: string, facing: Facing8): string {
    return this.facingTextureKey(prefix, nearestScreenFacing(facing));
  }

  /** 寶箱: the chest's placeholder frames, shared with the field's chests (render/world/chest). */
  private createChestTextures(): void {
    for (const frame of ["closed", "open"] as const) {
      const g = this.make.graphics({});
      paintChest(g, frame);
      g.generateTexture(CHEST.placeholder[frame], CHEST.width, CHEST.height);
      g.destroy();
    }
  }

  /**
   * The sack's placeholder frames (FS-1D6BX R17), shared with the field's sacks
   * (render/world/sack), until its baked sheet lands.
   */
  private createSackTextures(): void {
    for (const frame of ["closed", "open"] as const) {
      const g = this.make.graphics({});
      paintSack(g, frame);
      g.generateTexture(SACK.placeholder[frame], SACK.width, SACK.height);
      g.destroy();
    }
  }

  private createEscapeDoorTextures(): void {
    const size = 80;
    const centerX = size / 2;
    const centerY = size / 2;

    // ⚫ 鎖定的逃脫門 - 灰色魔法陣 (未啟動)
    const locked = this.make.graphics({});

    // 外圈 - 灰色
    locked.lineStyle(3, palette.wallTop, 0.8);
    locked.strokeCircle(centerX, centerY, 35);
    locked.strokeCircle(centerX, centerY, 30);

    // 內圈 - 灰色
    locked.lineStyle(2, palette.wallLight, 0.7);
    locked.strokeCircle(centerX, centerY, 20);

    // 魔法陣符文 (6個點)
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const radius = 28;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      locked.fillStyle(palette.wallTop, 0.8);
      locked.fillCircle(x, y, 3);
    }

    // 六芒星 (灰色)
    locked.lineStyle(2, palette.wallTop, 0.6);
    for (let i = 0; i < 6; i++) {
      const angle1 = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const angle2 = ((i + 2) / 6) * Math.PI * 2 - Math.PI / 2;
      const radius = 25;
      const x1 = centerX + Math.cos(angle1) * radius;
      const y1 = centerY + Math.sin(angle1) * radius;
      const x2 = centerX + Math.cos(angle2) * radius;
      const y2 = centerY + Math.sin(angle2) * radius;
      locked.beginPath();
      locked.moveTo(x1, y1);
      locked.lineTo(x2, y2);
      locked.strokePath();
    }

    // 中心鎖圖示 (灰色)
    locked.fillStyle(palette.floor, 1);
    locked.fillCircle(centerX, centerY, 8);
    locked.fillStyle(palette.hudPanel, 1);
    locked.fillCircle(centerX, centerY, 5);
    locked.fillCircle(centerX, centerY + 2, 2);

    locked.generateTexture("escape_door_locked", size, size);
    locked.destroy();

    // 🟢 解鎖的逃脫門 - 綠色魔法陣 (已解鎖但未啟動)
    const unlocked = this.make.graphics({});

    // 外圈 - 綠色發光
    unlocked.lineStyle(3, palette.safe, 0.9);
    unlocked.strokeCircle(centerX, centerY, 35);
    unlocked.lineStyle(2, palette.safe, 0.7);
    unlocked.strokeCircle(centerX, centerY, 30);

    // 內圈 - 亮綠色
    unlocked.lineStyle(2, palette.safe, 0.8);
    unlocked.strokeCircle(centerX, centerY, 20);

    // 發光光暈
    unlocked.fillStyle(palette.safe, 0.15);
    unlocked.fillCircle(centerX, centerY, 35);

    // 魔法陣符文 (6個發光點)
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const radius = 28;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      // 發光效果
      unlocked.fillStyle(palette.safe, 0.3);
      unlocked.fillCircle(x, y, 5);
      unlocked.fillStyle(palette.safe, 1);
      unlocked.fillCircle(x, y, 3);
    }

    // 六芒星 (綠色發光)
    unlocked.lineStyle(2, palette.safe, 0.7);
    for (let i = 0; i < 6; i++) {
      const angle1 = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const angle2 = ((i + 2) / 6) * Math.PI * 2 - Math.PI / 2;
      const radius = 25;
      const x1 = centerX + Math.cos(angle1) * radius;
      const y1 = centerY + Math.sin(angle1) * radius;
      const x2 = centerX + Math.cos(angle2) * radius;
      const y2 = centerY + Math.sin(angle2) * radius;
      unlocked.beginPath();
      unlocked.moveTo(x1, y1);
      unlocked.lineTo(x2, y2);
      unlocked.strokePath();
    }

    // 中心圖示 - 解鎖符號 (亮綠色)
    unlocked.fillStyle(palette.safe, 1);
    unlocked.fillCircle(centerX, centerY, 8);
    unlocked.fillStyle(palette.safe, 1);
    unlocked.fillCircle(centerX, centerY, 6);
    // 向上箭頭
    unlocked.fillStyle(palette.hudText, 1);
    unlocked.fillTriangle(
      centerX,
      centerY - 4,
      centerX - 3,
      centerY + 2,
      centerX + 3,
      centerY + 2,
    );

    unlocked.generateTexture("escape_door_unlocked", size, size);
    unlocked.destroy();

    // ✨ 打開的逃脫門 - 激活的綠色魔法陣 (透明發光)
    const open = this.make.graphics({});

    // 最外層發光
    for (let i = 0; i < 4; i++) {
      const alpha = 0.2 - i * 0.04;
      const radius = 38 + i * 3;
      open.fillStyle(palette.safe, alpha);
      open.fillCircle(centerX, centerY, radius);
    }

    // 外圈 - 強烈綠光
    open.lineStyle(4, palette.safe, 1);
    open.strokeCircle(centerX, centerY, 35);
    open.lineStyle(3, palette.safe, 0.8);
    open.strokeCircle(centerX, centerY, 30);

    // 內圈 - 亮綠色
    open.lineStyle(3, palette.safe, 0.9);
    open.strokeCircle(centerX, centerY, 20);

    // 傳送門中心 - 綠色帶透明
    open.fillStyle(palette.safe, 0.4);
    open.fillCircle(centerX, centerY, 30);
    open.fillStyle(palette.safe, 0.3);
    open.fillCircle(centerX, centerY, 20);

    // 魔法陣符文 (6個強烈發光點)
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const radius = 28;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      // 強烈發光
      open.fillStyle(palette.safe, 0.5);
      open.fillCircle(x, y, 6);
      open.fillStyle(palette.hudText, 1);
      open.fillCircle(x, y, 3);
    }

    // 旋轉的六芒星 (強烈綠光)
    open.lineStyle(3, palette.safe, 0.9);
    for (let i = 0; i < 6; i++) {
      const angle1 = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const angle2 = ((i + 2) / 6) * Math.PI * 2 - Math.PI / 2;
      const radius = 25;
      const x1 = centerX + Math.cos(angle1) * radius;
      const y1 = centerY + Math.sin(angle1) * radius;
      const x2 = centerX + Math.cos(angle2) * radius;
      const y2 = centerY + Math.sin(angle2) * radius;
      open.beginPath();
      open.moveTo(x1, y1);
      open.lineTo(x2, y2);
      open.strokePath();
    }

    // 中心強烈發光
    open.fillStyle(palette.hudText, 0.9);
    open.fillCircle(centerX, centerY, 10);
    open.fillStyle(palette.safe, 0.7);
    open.fillCircle(centerX, centerY, 15);
    open.fillStyle(palette.safe, 0.4);
    open.fillCircle(centerX, centerY, 20);

    // 粒子效果 (8個旋轉的光點)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = 18;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      open.fillStyle(palette.hudText, 0.9);
      open.fillCircle(x, y, 2);
    }

    open.generateTexture("escape_door_open", size, size);
    open.destroy();
  }

  private createSwitchTextures(): void {
    const size = 30;

    // dormant rune-stone
    const inactive = this.make.graphics({});
    inactive.fillStyle(palette.hudPanel, 1); // stone base
    inactive.fillRect(0, 0, size, size);
    inactive.fillStyle(palette.wall, 1); // sunken disc
    inactive.fillCircle(size / 2, size / 2, size / 3);
    inactive.lineStyle(2, palette.frame, 0.6); // brass ring
    inactive.strokeCircle(size / 2, size / 2, size / 3);
    inactive.fillStyle(palette.hostile, 0.5); // dim necrotic rune
    inactive.fillCircle(size / 2, size / 2, size / 6);
    inactive.lineStyle(2, palette.inkDeep, 1);
    inactive.strokeRect(0, 0, size, size);
    inactive.generateTexture("switch_inactive", size, size);
    inactive.destroy();

    // lit rune-stone (arcane glow)
    const active = this.make.graphics({});
    active.fillStyle(palette.hudPanel, 1);
    active.fillRect(0, 0, size, size);
    active.fillStyle(palette.safe, 0.35); // arcane glow halo
    active.fillCircle(size / 2, size / 2, size / 2.4);
    active.fillStyle(palette.wall, 1); // disc
    active.fillCircle(size / 2, size / 2, size / 3);
    active.lineStyle(2, palette.frameBright, 0.9); // brass ring
    active.strokeCircle(size / 2, size / 2, size / 3);
    active.fillStyle(palette.safe, 1); // lit rune
    active.fillCircle(size / 2, size / 2, size / 6);
    active.fillStyle(palette.switchOn, 1); // amber core
    active.fillCircle(size / 2, size / 2, size / 12);
    active.lineStyle(2, palette.inkDeep, 1);
    active.strokeRect(0, 0, size, size);
    active.generateTexture("switch_active", size, size);
    active.destroy();
  }

  /**
   * Placeholder stairs up (FS-F6F88 req 30), kept as the no-art fallback for the baked
   * `stairs_spiral` (FS-8RBQY §E.5): stone treads
   * climbing away from the viewer, each with an amber nosing. Amber because the player can act
   * on them (guideline "Gameplay accent").
   */
  private createStairsTexture(): void {
    const size = 36;
    const steps = 4;
    const g = this.make.graphics({});
    g.fillStyle(palette.hudPanel, 1); // stone footing
    g.fillRect(0, 0, size, size);
    const rise = size / steps;
    for (let i = 0; i < steps; i++) {
      // the nearest tread is widest; each one up is narrower and lit a touch more
      const inset = 3 + i * 3;
      const y = size - (i + 1) * rise;
      g.fillStyle(palette.stairsRiser, 1);
      g.fillRect(inset, y, size - inset * 2, rise);
      g.fillStyle(tint(palette.stairsTread, i * 0.06), 1);
      g.fillRect(inset, y, size - inset * 2, rise - 3);
      g.lineStyle(2, palette.stairsNosing, 0.85);
      g.lineBetween(inset, y + 1, size - inset, y + 1);
    }
    g.lineStyle(2, palette.inkDeep, 1);
    g.strokeRect(0, 0, size, size);
    g.generateTexture("stairs_up", size, size);
    g.destroy();
  }

  /** Placeholder drop pile (FS-4R9M9 req 61), built in code until a baked prop exists. */
  private createDropPileTexture(): void {
    const g = this.make.graphics({});
    paintDropPile(g);
    g.generateTexture(DROP_PILE.texture, DROP_PILE.width, DROP_PILE.height);
    g.destroy();
  }

  private updateContainers(state: ContainerState[]): void {
    // an emptied drop pile stays in state, but there is nothing left to draw or take (FS-4R9M9 R46)
    // a chest or sack stays drawn, open, once emptied (FS-1D6BX D3); an unknown kind is a chest (D2)
    const containers = state.filter((c) => placedKind(c) !== "drop_pile" || c.items.length > 0);
    const activeEntityIds = new Set(containers.map((c) => c.entity_id));

    // 移除不存在的寶箱
    this.chests.forEach((chest, entityId) => {
      if (!activeEntityIds.has(entityId)) {
        chest.sprite.destroy();
        this.chests.delete(entityId);
      }
    });

    // 新增或更新寶箱
    containers.forEach((container) => {
      let chest = this.chests.get(container.entity_id);

      const pos = { x: container.position.x, y: container.position.y };
      const kind = placedKind(container);
      if (!chest) {
        // 新增寶箱 or sack — or the heap a slain monster's loot lies in, always open (FS-4R9M9 R61)
        const sprite =
          kind === "drop_pile"
            ? this.add
                .sprite(0, 0, DROP_PILE.texture)
                .setOrigin(DROP_PILE.origin.x, DROP_PILE.origin.y)
            : this.add.sprite(0, 0, (kind === "sack" ? SACK : CHEST).placeholder.closed);
        chest = { sprite, entityId: container.entity_id, pos, pile: kind === "drop_pile" };
        this.chests.set(container.entity_id, chest);
        // one coming back into the snapshot is drawn as it now is, open or shut, in the pool it
        // already has (FS-KE075 §H.48)
        if (kind !== "drop_pile" && !this.pooledContainers.has(container.entity_id)) {
          this.pooledContainers.add(container.entity_id);
          this.poolInteractable(pos);
        }
        // a dungeon floor's dressing makes room for it (FS-KE075 §H.47)
        if (kind !== "drop_pile") this.giveWay(pos);
      } else {
        chest.pos = pos;
      }
      // 更新寶箱狀態
      if (kind !== "drop_pile") this.showContainerFrame(chest.sprite, kind, container.is_open);
      standAt(chest.sprite, pos);

      // 如果是打開的寶箱，更新跳窗內容
      if (container.is_open && this.reaching === container.entity_id) {
        // the server opened what the player reached for: now its coffer shows (FS-KE075 §J R60)
        this.reaching = undefined;
        this.containerView.open(container.entity_id, placedKind(container));
      }
      if (
        container.is_open &&
        this.containerView.entityId === container.entity_id
      ) {
        this.containerView.setItems(container.items);
      }
    });
  }

  /**
   * A reach still pending once the state's open containers are read is kept or given up by what
   * the state shows of the player (FS-MQYEX R26): given up, no view opens for it later.
   */
  private settleReach(state: ClientGameState): void {
    if (!this.reaching) return;
    const seen = reachAfter(this.reaching, this.reachSeen, state);
    if (seen) this.reachSeen = seen;
    else this.reaching = undefined;
  }

  /**
   * The open bar follows the state (FS-MQYEX R22, R23, R25): up while the player's own
   * `timed_open` names a shut container drawn here, gone with no notice on a state that carries
   * none, whether the container opened or the timed open was cancelled. Only `current_player` is
   * read, never another player's entry, and nothing is drawn while spectating.
   */
  private showTimedOpen(state: ClientGameState): void {
    const open = this.watchedPlayerId === undefined ? state.current_player?.timed_open : undefined;
    const shut =
      open &&
      this.chests.has(open.entity_id) &&
      state.containers?.some((c) => c.entity_id === open.entity_id && !c.is_open);
    if (!open || !shut) {
      this.timedOpen?.bar.destroy();
      this.timedOpen = undefined;
      return;
    }
    const bar = this.timedOpen?.bar ?? this.add.graphics().setDepth(MARKER_DEPTH.bar).setName("open-bar");
    this.timedOpen = { open, seenAt: this.time.now, bar };
    this.drawTimedOpen();
  }

  /**
   * Draws the open bar as it stands this frame: the state's fill, run on by the real time since
   * that state so it reads smooth, never past full (R22). Hidden with its container's sprite.
   */
  private drawTimedOpen(): void {
    if (!this.timedOpen) return;
    const { open, seenAt, bar } = this.timedOpen;
    const sprite = this.chests.get(open.entity_id)?.sprite;
    bar.setVisible(!!sprite?.visible);
    if (!sprite?.visible) return;
    bar.clear();
    drawOpenBar(bar, sprite.getBounds(), openBarFraction(open, this.time.now - seenAt));
  }

  private updateEscapeDoors(escapeDoors: EscapeDoorState[]): void {
    const activeEntityIds = new Set(escapeDoors.map((d) => d.entity_id));

    // 移除不存在的逃脫門
    this.escapeDoors.forEach((door, entityId) => {
      if (!activeEntityIds.has(entityId)) {
        door.sprite.destroy();
        this.escapeDoors.delete(entityId);
      }
    });

    // 新增或更新逃脫門 — the baked frame for its state (FS-2325V §C.4)
    escapeDoors.forEach((door) => {
      let escapeDoor = this.escapeDoors.get(door.entity_id);
      const created = !escapeDoor;
      const pos = { x: door.position.x, y: door.position.y };

      if (!escapeDoor) {
        // 新增逃脫門
        const sprite = this.add.sprite(0, 0, "escape_door_locked");
        escapeDoor = { sprite, entityId: door.entity_id, pos };
        this.escapeDoors.set(door.entity_id, escapeDoor);
      } else {
        escapeDoor.pos = pos;
      }
      // 更新逃脫門狀態: locked, unlocked, open, as the server says
      const state = door.is_open ? "open" : door.is_locked ? "locked" : "unlocked";
      showState(escapeDoor.sprite, this.art, "escape_door_x", state, `escape_door_${state}`);
      standAt(escapeDoor.sprite, escapeDoor.pos);
      // a tall arch: it fades while it stands over the player (FS-2325V §C.5)
      if (created) this.occluders.add([escapeDoor.sprite]);
    });
  }

  private updateSwitches(switches: SwitchState[]): void {
    const activeEntityIds = new Set(switches.map((s) => s.entity_id));

    // 移除不存在的開關
    this.switches.forEach((switchObj, entityId) => {
      if (!activeEntityIds.has(entityId)) {
        switchObj.sprite.destroy();
        this.switches.delete(entityId);
      }
    });

    // 新增或更新開關 — the baked frame for its state (FS-2325V §C.4)
    switches.forEach((switchState) => {
      let switchObj = this.switches.get(switchState.entity_id);
      const pos = { x: switchState.position.x, y: switchState.position.y };

      if (!switchObj) {
        // 新增開關
        const sprite = this.add.sprite(0, 0, "switch_inactive");
        switchObj = { sprite, entityId: switchState.entity_id, pos };
        this.switches.set(switchState.entity_id, switchObj);
        this.poolInteractable(pos);
      } else {
        switchObj.pos = pos;
      }
      // 更新開關狀態
      const state = switchState.is_activated ? "active" : "inactive";
      showState(switchObj.sprite, this.art, "switch", state, `switch_${state}`);
      standAt(switchObj.sprite, switchObj.pos);
    });
  }

  /** A chest's or sack's baked frame for its server state, or its placeholder texture. */
  private showContainerFrame(
    sprite: Phaser.GameObjects.Sprite,
    kind: Exclude<ContainerKind, "drop_pile">,
    isOpen: boolean,
  ): void {
    if (kind === "sack") {
      const frame = sackFrame(isOpen);
      showState(sprite, this.art, SACK.sheet, frame, SACK.placeholder[frame]);
      return;
    }
    const frame = chestFrame(isOpen);
    showState(sprite, this.art, CHEST.sheet, frame, CHEST.placeholder[frame]);
  }

  private updateWalls(walls: WallState[]): void {
    const activeEntityIds = new Set(walls.map((w) => w.entity_id));
    // rooms whose walls came or went: each is redrawn whole
    const changed = new Set<string>();

    // 移除不存在的牆壁
    this.walls.forEach((wall, entityId) => {
      if (!activeEntityIds.has(entityId)) {
        wall.pieces.forEach((piece) => piece.destroy());
        if (wall.houseId) changed.add(wall.houseId);
        else this.view?.invalidate();
        this.walls.delete(entityId);
      }
    });

    // 新增或更新牆壁 — baked pieces when the art is there (FS-2325V §C.2)
    const fresh = walls.filter((w) => !this.walls.has(w.entity_id));
    const look = this.currentFloorLook();
    if (this.art.has(`${look.walls.prefix}wall_back_plain_x`)) this.wallTop = BAKE.WALL_BACK * BAKE.VPX;
    fresh.forEach((w) => {
      if (!w.house_id) return;
      changed.add(w.house_id);
      this.walls.set(w.entity_id, { pieces: [], entityId: w.entity_id, houseId: w.house_id });
    });
    // a wall of no room is no building: it keeps the cut-away rules, its fade and its light
    const loose = fresh.filter((w) => !w.house_id);
    const baked =
      loose.length > 0
        ? addWalls(this, this.art, loose, look.seed, look.walls)
        : null;
    // where a wall stands, for the hide rule (FS-9PN7X §C.1) and its sconces' (owner's addition 1)
    const centreOf = (w: WallState) => ({ x: w.position.x + w.width / 2, y: w.position.y + w.height / 2 });
    if (baked) {
      this.occluders.add(baked.tall);
      const byId = new Map(loose.map((w) => [w.entity_id, w]));
      baked.lights.forEach(({ source, wallId }) => {
        const wall = byId.get(wallId);
        this.queueLight("sconce", source, wall ? { at: centreOf(wall) } : {});
      });
    }
    loose.forEach((wallState) => {
      const pieces: BuildingPart[] =
        baked?.byWall.get(wallState.entity_id) ??
        (baked
          ? []
          : addUprightBlock(
              this,
              wallState.position.x,
              wallState.position.y,
              wallState.width,
              wallState.height,
              PLACEHOLDER_STONE,
            ));
      this.walls.set(wallState.entity_id, { pieces, entityId: wallState.entity_id, pos: centreOf(wallState) });
    });
    // a hall wall drawn while the player is in a room takes the hide rule on the next frame
    if (loose.length > 0) this.view?.invalidate();
    const rooms = this.drawRooms(walls, changed);

    // 從牆壁反推建築範圍，按 house_id 分組建立屋頂 + 地板（只做一次）
    if (!this.serverBuildingsCreated && walls.length > 0) {
      this.serverBuildingsCreated = true;

      const houses = housesFrom(walls);
      // flagstone (or planks) under each house, painted into this floor's baked ground
      // (FS-2325V §C.1, FS-8RBQY §C.3), and the walls' shadows over it in the same step: those of
      // the walls known now, as the floors are, cast from the rooms and halls' walls just drawn
      // (FS-V8FT3 §F R29, Edge States)
      this.groundLayer?.paint(houses, { look: look.ground, seed: look.seed });
      if (hasWallArt(this.art, look.walls))
        this.groundLayer?.shade({ shapes: buildingWallShadows(rooms, baked), cuts: [] });

      houses.forEach((house, buildingIndex) => {
        const { x: minX, y: minY, width: bw, height: bh } = house;
        const maxY = minY + bh;

        // 地板 — only the placeholder floor needs one; baked ground has flagstone
        if (!this.groundLayer) {
          const floor = this.add.graphics();
          floor.fillStyle(palette.wallShade, 1);
          floor.fillRect(minX, minY, bw, bh);
          floor.lineStyle(1, palette.wallShade, 0.4);
          for (let tx = minX; tx < minX + bw; tx += 40) {
            floor.lineBetween(tx, minY, tx, maxY);
          }
          for (let ty = minY; ty < maxY; ty += 40) {
            floor.lineBetween(minX, ty, minX + bw, ty);
          }
          this.groundPlane?.surface.add(floor);
          this.houseFloors.push(floor);
        }

        // 屋頂 — baked slope and ridge pieces, each sorted by its own footprint
        // (FS-2325V §C.3); without art, the placeholder roof on a lifted plane. A world
        // theme without roofs (the tower's rooms) draws neither (FS-8RBQY §B.3, R1)
        // A roof never fades: the player behind it shows as a silhouette (FS-9PN7X §E.4)
        const baked = this.worldLook.roofs ? addRoof(this, this.art, house) : null;
        const roof = baked ?? (this.worldLook.roofs ? [this.placeholderRoof(house)] : []);
        if (baked) this.roofCover.push(...baked.map(coverOf));
        else if (roof.length > 0) this.roofCover.push(slabCover(roof[0] as BuildingPart, grown(house, ROOF_EAVE), WALL_HEIGHT));

        // 入口標示（門在下方）— a soft amber glow on the ground at the threshold (FS-KYPQ9 §H.1)
        const doorMarker =
          this.fx &&
          new EntranceMarker(this.fx, `entrance:server_building_${buildingIndex}`, {
            x: minX + bw / 2,
            y: maxY + 5,
          });

        const wallGroup = this.physics.add.staticGroup();
        const door = this.add.graphics();
        door.setDepth(51);
        const doorCollider = this.add.rectangle(0, 0, 0, 0);
        doorCollider.setVisible(false);

        const building: Building = {
          id: house.id,
          x: minX,
          y: minY,
          width: bw,
          height: bh,
          doorSide: "bottom",
          wallGroup,
          roof,
          doorMarker,
          door,
          doorCollider,
          isOpen: true,
        };
        this.buildings.push(building);
      });
      // the roofs hide and cover with the rooms (FS-9PN7X §C.1, §E.1)
      this.buildingView().invalidate();
    }
  }

  /**
   * The rooms' view, made with the first floor's walls and kept for the run (FS-9PN7X): the
   * blackout as tall as the walls drawn (§D.2), read on each change, so walls baked after it still
   * count; the doors and roofs as cover beside the rooms' own; the halls' scenery hidden by
   * footprint; and the lights following the player's room.
   */
  private buildingView(): BuildingView {
    this.view ??= new BuildingView(this, {
      blackout: { wallTop: () => this.wallTop, reach: (this.mapWidth + this.mapHeight) * 2 },
      cover: () => this.coverBesideRooms(),
      scenery: () => this.sceneryByFootprint(),
      occupants: () => this.occupants(),
      onShow: () => this.showLights(),
    });
    return this.view;
  }

  /**
   * Draws each room whose walls came or went in both its looks (ADR-0036, FS-9PN7X §B.2–§B.3), in
   * the floor's wall sheets: masonry exterior fronts and back posts, the stone cap of a type that
   * has one (a roofed theme keeps its roof instead), placeholders without art (§B.7). A room's
   * parts are torn down whole and redrawn from its walls as they stand now; none of them fades
   * (§E.4). Its walls' lights are the room's own, lit only from inside (§D.6). A room's gap holds
   * its server door (`updateDoors`), so it draws no door of its own, only the head over it.
   * Returns the rooms drawn.
   */
  private drawRooms(walls: readonly WallState[], changed: ReadonlySet<string>): BuiltBuilding[] {
    const drawn: BuiltBuilding[] = [];
    if (changed.size === 0) return drawn;
    const look = this.currentFloorLook();
    const view = this.buildingView();
    for (const id of changed) {
      this.forgetRoomLights(id);
      const own = walls.filter((w) => w.house_id === id);
      if (own.length === 0) {
        view.remove(id);
        continue;
      }
      const [built] = addBuildings(this, this.art, own, look.seed, { sheets: look.walls });
      built.lights.forEach(({ source }) => this.queueLight("sconce", source, { room: id }));
      view.set(built);
      drawn.push(built);
    }
    return drawn;
  }

  /**
   * A redrawn room's wall lights go with its old walls (FS-9PN7X §D.6): off the light-map, out of
   * the room's lights and the floor's stamped count, and out of the queue, so the new walls' lights
   * are counted once against `FIXED_LIGHT_CAP`. Lights merely standing in the room stay.
   */
  private forgetRoomLights(room: string): void {
    const gone = this.roomLights.filter((l) => l.room === room && l.hung);
    for (const { source } of gone) this.lightMap?.remove(source);
    this.roomLights = this.roomLights.filter((l) => !gone.includes(l));
    this.stampedLights -= gone.length;
    this.pendingLights = this.pendingLights.filter((l) => l.light.room !== room);
  }

  /** The pre-art roof: a flat slab on a plane lifted to the wall tops. */
  private placeholderRoof(house: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): Phaser.GameObjects.Container {
    const { x, y, width, height } = house;
    // sorted by the house's centre: over a player behind the house, under one in front
    const roofPlane = addWorldPlane(this, WALL_HEIGHT);
    roofPlane.root.setDepth(worldDepth(x + width / 2, y + height / 2));
    const roof = this.add.graphics();
    roof.fillStyle(palette.wallShade, 0.97);
    const eave = grown(house, ROOF_EAVE);
    roof.fillRect(eave.x, eave.y, eave.width, eave.height);
    roof.lineStyle(2, palette.wall, 1);
    roof.strokeRect(eave.x, eave.y, eave.width, eave.height);
    roofPlane.surface.add(roof);
    return roofPlane.root;
  }

  private updateDoors(doors: DoorState[]): void {
    const activeEntityIds = new Set(doors.map((d) => d.entity_id));

    // 移除不存在的門
    this.serverDoors.forEach((door, entityId) => {
      if (!activeEntityIds.has(entityId)) {
        door.sprite?.destroy();
        door.slab?.plane.root.destroy();
        this.serverDoors.delete(entityId);
        this.view?.invalidate();
      }
    });

    // 新增或更新門
    doors.forEach((doorState) => {
      let door = this.serverDoors.get(doorState.entity_id);
      // DoorState carries only is_open, so a shut door shows its unlocked frame: the
      // baked "locked" frame has no server state to drive it (FS-2325V §0, §C.4).
      const sheet = doorState.width >= doorState.height ? "door_x" : "door_y";
      const frame = doorState.is_open ? "open" : "unlocked";

      if (!door) {
        const pos = {
          x: doorState.position.x + doorState.width / 2,
          y: doorState.position.y + doorState.height / 2,
        };
        // a door in a room's wall is part of the room: it takes the silhouette, not the fade, and
        // from outside it shows its own state, open or shut (FS-9PN7X §B.5 amended 2026-11-03, §E.4)
        const inRoom = this.buildings.some((b) => insideHouse(pos, b));
        door = { entityId: doorState.entity_id, isOpen: doorState.is_open, pos, inRoom };
        if (this.art.available) {
          const at = worldToScreen(pos.x, pos.y);
          door.sprite = artSprite(this, this.art, at.x, at.y, sheet, { animation: frame });
          // sorted like the wall it stands in: by the back corner of its footprint
          door.sprite.setDepth(worldDepth(doorState.position.x, doorState.position.y, 1));
          if (!inRoom) this.occluders.add([door.sprite]);
        } else {
          door.slab = this.placeholderDoor(doorState, pos);
        }
        if (inRoom) this.view?.invalidate();
        this.serverDoors.set(doorState.entity_id, door);
      } else if (door.isOpen !== doorState.is_open) {
        door.isOpen = doorState.is_open;
        if (door.sprite) showState(door.sprite, this.art, sheet, frame);
        if (door.slab)
          this.tweens.add({
            targets: door.slab.rect,
            rotation: doorState.is_open ? Math.PI / 2 : 0,
            duration: 300,
            ease: "Power2",
          });
      }
    });
  }

  /**
   * The pre-art door: a slab keeping its world-coordinate rectangle and hinge
   * rotation, on a plane (lifted to the wall tops) that carries the projection.
   */
  private placeholderDoor(
    doorState: DoorState,
    pos: Point,
  ): { rect: Phaser.GameObjects.Rectangle; plane: WorldPlane } {
    const plane = addWorldPlane(this, WALL_HEIGHT);
    plane.root.setDepth(worldDepth(pos.x, pos.y));
    const rect = this.add.rectangle(
      doorState.position.x,
      doorState.position.y + doorState.height / 2,
      doorState.width,
      doorState.height,
      palette.wallLight,
    );
    rect.setOrigin(0, 0.5);
    rect.setStrokeStyle(2, palette.wallLight);
    if (doorState.is_open) rect.setRotation(Math.PI / 2);
    plane.surface.add(rect);
    return { rect, plane };
  }

  private getNearbyDoor(): { entityId: string } | null {
    const me = this.playerPos;
    if (!this.player || !me) return null;
    const interactDistance = 60;

    // world positions: the player's and the closed door's centre
    for (const [entityId, door] of this.serverDoors) {
      const distance = Phaser.Math.Distance.Between(me.x, me.y, door.pos.x, door.pos.y);
      if (distance < interactDistance) {
        return { entityId };
      }
    }
    return null;
  }

  private toggleChest(entityId: string): void {
    // 發送互動請求到後端
    socketManager.sendMessage(ActionType.Interact, {
      entity_id: entityId,
    });

    this.reaching = undefined;
    // 如果是關閉跳窗
    if (this.containerView.entityId === entityId) {
      this.containerView.close();
      return;
    }
    const container = this.lastGameState?.containers?.find(
      (c) => c.entity_id === entityId,
    );
    // a shut container may yet be refused (a guarded chest): its coffer waits for the state that
    // shows it open, so nothing opens only to close again (FS-KE075 §J R60)
    if (!container?.is_open) {
      this.reaching = entityId;
      this.reachSeen = reachMade();
      return;
    }
    // 開啟跳窗, wearing the face for its kind (FS-1D6BX §Requirements 15)
    this.containerView.open(entityId, placedKind(container));
    if (container.items?.length > 0) this.containerView.setItems(container.items);
  }

  /** The server refused the reach (guarded, or out of reach): no coffer will open for it. */
  private chestRefused(): void {
    this.reaching = undefined;
  }

  private interactWithSwitch(entityId: string): void {
    console.log("Interacting with switch:", entityId);
    // 發送互動請求到後端
    socketManager.sendMessage(ActionType.Interact, {
      entity_id: entityId,
    });
  }

  private interactWithEscapeDoor(entityId: string): void {
    console.log("Interacting with escape door:", entityId);
    // 發送互動請求到後端
    socketManager.sendMessage(ActionType.Interact, {
      entity_id: entityId,
    });
  }

  private checkChestDistance(): void {
    const me = this.playerPos;
    if (!this.player || !me) return;
    const openFor = this.containerView.entityId;
    if (!openFor) return;

    // the coffer vanished from the server's state, or the pile was emptied: nothing left to show
    const chest = this.chests.get(openFor);
    if (!chest) {
      this.containerView.close();
      return;
    }

    const distance = Phaser.Math.Distance.Between(me.x, me.y, chest.pos.x, chest.pos.y);

    const interactDistance = 60;
    if (distance > interactDistance) {
      // Just close popup locally, let backend state control chest visual
      this.containerView.close();
    }
  }

  // === 道具欄功能 ===

  /**
   * I or B opens and closes the gear and bag overlay (FS-HRH2J R4); opening it ends a Shadow Shot
   * hold (FS-JTNPR req 15).
   */
  private toggleInventory(): void {
    this.equipment?.toggle();
    if (this.equipment?.isOpen()) this.cancelAim();
  }

  /**
   * An item taken from the open satchel (icon click or F): the view has already hidden it and
   * marked its loot pending; tell the server, and hold it in the inventory optimistically.
   */
  private lootChestItem(item: ItemState): void {
    const { action, payload } = lootMessage(item);
    socketManager.sendMessage(action, payload);
    this.equipment?.taken(item);
  }

  private getNearbyChest(): { entityId: string } | null {
    const me = this.playerPos;
    if (!this.player || !me) return null;
    const interactDistance = 60;

    for (const [entityId, chest] of this.chests) {
      const distance = Phaser.Math.Distance.Between(me.x, me.y, chest.pos.x, chest.pos.y);
      if (distance < interactDistance) {
        return { entityId };
      }
    }
    return null;
  }

  private getNearbySwitch(): { entityId: string } | null {
    const me = this.playerPos;
    if (!this.player || !me) return null;
    const interactDistance = 60;

    for (const [entityId, switchObj] of this.switches) {
      const distance = Phaser.Math.Distance.Between(me.x, me.y, switchObj.pos.x, switchObj.pos.y);
      if (distance < interactDistance) {
        return { entityId };
      }
    }
    return null;
  }

  private getNearbyEscapeDoor(): { entityId: string } | null {
    const me = this.playerPos;
    if (!this.player || !me) return null;
    const interactDistance = 60;

    for (const [entityId, escapeDoor] of this.escapeDoors) {
      const distance = Phaser.Math.Distance.Between(me.x, me.y, escapeDoor.pos.x, escapeDoor.pos.y);
      if (distance < interactDistance) {
        return { entityId };
      }
    }
    return null;
  }

  private createPlayer(x: number, y: number, className?: string, username?: string): void {
    const activeChar = useGameStore.getState().getActiveCharacter();
    const effectiveClass = (activeChar?.className || className || "warrior").toLowerCase();
    const displayName = activeChar?.name || username || "Hero";

    this.playerTexturePrefix = "player_" + effectiveClass;
    this.playerPos = { x, y };
    this.playerFacing = "se";
    this.walkPhase = 0;
    this.player = this.physics.add.sprite(0, 0, this.facingTexture(this.playerTexturePrefix, this.playerFacing));
    // No world-bounds clamp: the sprite lives in screen space (the projection),
    // and the server is authoritative for where a player may stand.
    standAt(this.player, this.playerPos, 1);
    const at = worldToScreen(x, y);

    // The class's baked sheet, stood on its footprint by the sheet's anchor
    // (FS-2325V §E.5); the placeholder texture only when the sheet is missing.
    this.playerAnim = new CharacterAnimator(this.art, effectiveClass, this.playerFacing);
    if (this.playerAnim.baked) {
      this.playerAnim.dress(this.player);
      keepBodySize(this.player, this.playerAnim.artScale);
    }
    // set circular physics body to match backend collision (radius 20), offset for 60x60 texture
    else this.player.body?.setCircle(20, 10, 10);
    this.settleDustOnDeath(this.player, "self", () => this.playerPos);

    // create legs overlay that will follow player; a baked sheet walks on its own legs
    this.playerLegs = this.add.graphics();
    this.playerLegs.setDepth(worldDepth(x, y, 2));
    if (!this.playerAnim.baked)
      this.drawLegs(this.playerLegs, at.x, at.y, this.playerFacing, 0, false, palette.hudLabel);

    // username label above player
    const base = markerBase(this.player, this.playerAnim.crown, false, this.playerAnim.artScale) ?? at.y;
    this.playerNameText = this.add.text(at.x, base - NAME_GAP, displayName, {
      fontSize: "11px",
      fontFamily: CANVAS_FONT.body,
      color: toCss(palette.markerSelf),
      stroke: toCss(palette.markerStroke),
      strokeThickness: 3,
      align: "center",
    });
    this.playerNameText.setOrigin(0.5, 1);
    this.playerNameText.setDepth(MARKER_DEPTH.name);

    // 玩家與所有建築牆壁/門碰撞
    this.buildings.forEach((building) => {
      this.physics.add.collider(this.player!, building.wallGroup);
      this.physics.add.collider(this.player!, building.doorCollider);
    });

    // 相機跟隨玩家
    followWith(this.cameras.main, this.player);
  }

  private defaultCursorCSS = "";
  private crosshairCursorCSS = "";

  /**
   * The baked cursors (FS-KYPQ9 §H.2): the bone hand by default, the strike-mark over a rival.
   * Each hotspot is its manifest anchor scaled with the image, so the click point is unchanged;
   * with no manifest or sheet the browser's `default`/`crosshair` applies, as before.
   */
  private setupCustomCursor(): void {
    const source = cursorSource(this.art, this.textures);
    this.defaultCursorCSS = cursorCss("cursor_hand", "default", source);
    this.crosshairCursorCSS = cursorCss("cursor_strike", "crosshair", source);
    this.input.setDefaultCursor(this.defaultCursorCSS);
  }

  create(): void {
    // an arrival is dark before anything of the floor is made: the world's fade-in opens on the
    // dark, and the card comes with the first broadcast's floor (FS-PQ2TW R11, R13)
    if (this.arrival) this.arrivalCard.dark();
    // Connect via SocketManager
    this.connectToServer();
    // the chat stream outlives the run; the window is the run's (FS-WJGFJ §C)
    // the menu reads Enter and Esc, and the run's end takes the keys; the gear overlay and an open chest are up
    this.chatWindow = mountChatWindow(this, () => !this.menu && !this.runEnded && !this.equipment?.isOpen() && !this.containerView?.isOpen);
    // T: the party panel, under the same key owners as the chat input (FS-R82NV R28)
    this.partyPanel = mountPartyPanel(this, () => !!this.menu || this.runEnded || !!this.equipment?.isOpen() || !!this.containerView?.isOpen);
    // party invites, hidden only once the run has ended, stacked clear of the chat window (FS-NCC9J R24)
    this.invitePrompt = mountPartyInvitePrompt(this, () => this.runEnded, () => this.chatWindow?.topEdge());

    this.cameras.main.setBackgroundColor(palette.mapEdge);

    // Baked art, or placeholders for whatever is missing (FS-2325V "Edge States").
    this.art = registerArt(this, SCENE_ART.BarrowspireScene);
    // the baked cursors, cropped from the atlas just registered
    this.setupCustomCursor();
    this.occluders = new Occluders();
    this.monsters = new MonsterRoster(
      phaserMonsterStage(this),
      this.art,
      this.monsterTargeting,
      this.monsterEffects,
      onDemandArt(this, this.art),
    );
    // the party frames cut their busts from the class sheets just registered (FS-R82NV R34)
    this.partyFrames = mountPartyFrames(this, this.art);
    this.containerView = new ContainerView(
      this,
      this.art,
      {
        onLoot: (item) => this.lootChestItem(item),
        characterLevel: () => this.characterLevel,
        mayTake: () => this.bagHasRoom(),
      },
      new ContainerContents(this.PENDING_DURATION),
    );

    // the floor is sized by its map (FS-KE075 §H.42): one held already sizes it here, as the
    // run always was; otherwise the map, when it comes
    const held = this.heldFloorMap();
    if (held) this.fitFloor(held);

    // buildings are now created from server wall data in updateWalls()

    // 寶箱由後端同步，不在這裡創建

    this.bindKeys();

    this.bindRunInput();

    this.equipment = this.composeEquipment();

    // 顯示座標 UI
    this.createUI();

    // torch-lit barrow atmosphere — pure decoration, no game state
    this.createAtmosphere();

    // the HUD back to its anchors whenever the logical view changes (FS-ZAJMH R12, R13)
    relayoutOn(this, () => this.relayoutHud());

    this.openHeldMessages();
  }

  /** What the server sent while the run loaded, to the listeners create has made, in order. */
  private openHeldMessages(): void {
    this.held?.replay(this.oneShots ?? {});
  }

  /**
   * The logical view changed (FS-ZAJMH R13): every widget that keeps to the right or the centre
   * goes back to its anchor, the open ones included, their state untouched. The bars, the level
   * bar, the chat window and the party frames and panel keep to the left and the bottom, which a
   * width change does not move; the gear overlay follows Phaser's resize itself; a passing notice
   * is gone in moments and stays where it was said.
   */
  private relayoutHud(): void {
    this.placeTopRightColumn();
    this.spectateHud?.watching.setX(viewport.centerX);
    this.spectateHud?.hint.setX(viewport.centerX);
    this.controlsPanel?.setPosition(viewport.centerX, viewport.centerY);
    this.moveMenu?.({ x: viewport.centerX, y: viewport.centerY });
    this.abilityHud?.relayout();
    this.invitePrompt?.relayout();
    this.containerView?.relayout();
    this.settlementRecord?.relayout(this.recordAnchor());
    this.arrivalCard.relayout();
    this.targetFrame?.relayout();
    // the text moved above, rasterised at the render scale of now (FS-ZAJMH R5)
    crispen([
      ...(this.targetFrame?.texts() ?? []),
      this.escapedCountText,
      this.floorText,
      this.positionReadout,
      this.spectateHud?.watching,
      this.spectateHud?.hint,
      this.controlsPanel,
    ]);
    // the bottom-centre row, built again about the new centre
    this.row.names = "";
    this.syncRow();
    if (this.resolvedCard && this.resolvedCardView) {
      const view = this.resolvedCardView;
      this.resolvedCard.destroy();
      this.resolvedCard = undefined;
      this.leaveButton = undefined;
      this.showResolvedCard(view);
    } else if (this.leaveButton) {
      // the dead spectator's corner button
      this.leaveButton.destroy();
      this.leaveButton = undefined;
      this.placeLeaveInCorner();
    }
  }

  /**
   * The gear and bag overlay over the live run (FS-HRH2J), its equip / unequip sends applied at
   * once, and its full-bag refusals in the run's refused notice (R22). A run marks unsafe finds
   * (FS-18Z5F R36). Each open reads the purse line's gold from the wallet (FS-7TGZ3 R8).
   */
  private composeEquipment(): EquipmentHud {
    const overlay = new GearOverlay(this, this.art, WorldType.Run);
    return new EquipmentHud(
      overlay,
      {
        send: (action, payload) => socketManager.sendMessage(action, payload),
        notice: (text) => this.showNotification(text, toCss(NOTICE_BACKING.refused)),
      },
      Date.now,
      new PurseReader(apiClient, overlay),
    );
  }

  /** Whether the bag can take one more pickup (FS-HRH2J R21); when it cannot, the notice says so. */
  private bagHasRoom(): boolean {
    return this.equipment?.roomForOne() ?? true;
  }

  /**
   * The run's keys and pointer, bound once per create. Every binding checks the menu first: while
   * it is open the keyboard and the pointer are its (FS-9K8EZ req 5), and closing it resumes them.
   */
  private bindRunInput(): void {
    // E 鍵互動（門、寶箱、開關、逃脫門）
    this.input.keyboard?.on("keydown-E", () => {
      if (this.menu) return;
      // When the equipment panel is open, E equips/unequips the hovered item.
      if (this.equipment?.equipKey()) return;

      // 檢查後端門
      const nearbyDoor = this.getNearbyDoor();
      if (nearbyDoor) {
        socketManager.sendMessage(ActionType.Interact, {
          entity_id: nearbyDoor.entityId,
        });
        return;
      }
      // 檢查開關
      const nearbySwitch = this.getNearbySwitch();
      if (nearbySwitch) {
        this.interactWithSwitch(nearbySwitch.entityId);
        return;
      }
      // 檢查逃脫門
      const nearbyEscapeDoor = this.getNearbyEscapeDoor();
      if (nearbyEscapeDoor) {
        this.interactWithEscapeDoor(nearbyEscapeDoor.entityId);
        return;
      }
      // Stairs up: the server decides whether the party has gathered (FS-F6F88 req 17–18)
      const nearbyStairs = this.player && this.playerPos ? this.stairs.nearby(this.playerPos) : null;
      if (nearbyStairs) {
        socketManager.sendMessage(ActionType.Interact, { entity_id: nearbyStairs });
        return;
      }
      // 檢查寶箱
      const nearbyChest = this.getNearbyChest();
      if (nearbyChest) {
        this.toggleChest(nearbyChest.entityId);
      }
    });

    // I or B opens and closes the gear and bag overlay (FS-HRH2J R4); not while the menu is open (R6)
    for (const key of ["keydown-I", "keydown-B"]) {
      this.input.keyboard?.on(key, () => {
        if (this.menu) return;
        this.toggleInventory();
      });
    }

    // F 鍵從寶箱取得道具
    this.input.keyboard?.on("keydown-F", () => {
      if (this.menu) return;
      this.containerView.lootFirst();
    });

    // Q 鍵關閉任何打開的彈窗
    this.input.keyboard?.on("keydown-Q", () => {
      if (this.menu) return;
      if (this.equipment?.hide()) return;
      this.containerView.close();
    });

    // H 鍵顯示/隱藏操作說明
    this.input.keyboard?.on("keydown-H", () => {
      if (this.menu) return;
      this.toggleControlsPanel();
    });

    // M steps the minimap through its modes (FS-1SEF0 §A.2; FS-SRA9J §E.19's key). An event, never
    // an added key: nothing is captured, so the letter types in any field and a stop has nothing
    // of it to hand back (`handBackKeyboard`). While chat has focus the field stops every key
    // before Phaser's window listener and the keyboard is off; the check stands in case either moves.
    this.input.keyboard?.on("keydown-M", (event?: KeyboardEvent) => {
      if (this.menu || event?.repeat || this.chatWindow?.isTyping()) return;
      this.cycleMinimap();
    });

    // 1 drinks a health potion (FS-P9G8R R27, R28). An event, never a JustDown poll: the menu polls
    // the same key each frame for its rows, and a second poll would steal its press.
    this.input.keyboard?.on(`keydown-${RUN_ACTIONS.drinkPotion.key}`, (event?: KeyboardEvent) => {
      if (this.menu || event?.repeat) return;
      this.drinkPotion();
    });

    // Scene-level pointer tracking for satchel hover (bypasses broken Phaser scrollFactor input)
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const at = viewport.toLogical(pointer);
      this.containerView.pointerMove(at.x, at.y);
      // the map mode icon lit under the pointer, unless a panel lies over it (FS-56CKV §Change: Map mode icon, D7)
      if (this.panelTakes(at.x, at.y)) this.dungeon?.modeIcon?.pointerOut();
      else this.dungeon?.modeIcon?.pointerMove(at.x, at.y);
    });
    this.input.on("gameout", () => this.dungeon?.modeIcon?.pointerOut());

    // Disable browser right-click menu for equipment panel context menus

    // 技能攻擊控制 (Left-Click Primary Attack // Right-Click Class Ability, priced by the server)
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      // the menu's hit areas take their own clicks; nothing else answers one (FS-9K8EZ req 5)
      if (this.menu) return;
      // an archer drawing a Shadow Shot answers no other click (FS-JTNPR req 16)
      if (this.combat.aiming) return;
      // the HUD is laid out in logical units; Phaser's pointer.x/y are backing px (FS-ZAJMH R15)
      const at = viewport.toLogical(pointer);
      if (this.panelTakes(at.x, at.y)) return;
      // a press on the map mode icon is M's, never an attack or a cast (FS-56CKV §Change: Map mode icon, D6)
      if (this.dungeon?.modeIcon?.pointerDown(at.x, at.y, pointer.button === 0)) return;
      // a click on the open satchel is a loot, never an attack (FS-2325V §D.2)
      if (this.containerView.pointerDown(at.x, at.y, pointer.button === 0)) return;
      if (!this.player || !this.playerPos) return;
      // out of the delve: the server refuses it anyway (FS-77AB6 req 17)
      if (resolved(this.lastGameState?.current_player)) return;

      const currentClass = this.ownClass();
      const leftButton = pointer.leftButtonDown() || pointer.button === 0;
      const rightButton = pointer.rightButtonDown() || pointer.button === 2;

      // The pointer is over the projection; the server wants the world point under
      // it. `target` and `me` are world positions (FS-2325V §0.2, §A.5).
      const target = screenToWorld(pointer.worldX, pointer.worldY);

      // 左鍵發射一般攻擊 // 右鍵觸發職業專屬技能: the archer's right-press starts the Shadow Shot
      // hold and the merc's sends parry, inside PlayerCombat (FS-JTNPR req 8, FS-MAMHR §G.35)
      if (leftButton) {
        this.combat.cast("primary", currentClass, this.playerPos, target);
      } else if (rightButton) {
        this.combat.cast("special", currentClass, this.playerPos, target);
      }
    });

    // Shadow Shot (FS-JTNPR req 14, 15): letting go of the right button fires or cancels the hold;
    // a release off the canvas, or the window losing focus, never fires
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 2) this.releaseAim(pointer);
    });
    this.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 2) this.cancelAim();
    });
    this.game?.events.on(Phaser.Core.Events.BLUR, this.cancelAim, this);
    this.game?.events.on(Phaser.Core.Events.HIDDEN, this.cancelAim, this);

    // 放開移動鍵時停止
    this.input.keyboard?.on("keyup", (event: KeyboardEvent) => {
      // the stride was stopped as the menu opened, or a hold began; the keys are theirs until they end
      if (this.menu || this.combat.aiming) return;
      const movementKeys = [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ];

      if (movementKeys.includes(event.code)) {
        const anyMovementKeyDown =
          this.wasd.up.isDown ||
          this.wasd.down.isDown ||
          this.wasd.left.isDown ||
          this.wasd.right.isDown;

        if (!anyMovementKeyDown) {
          socketManager.sendMessage("move", { vx: 0, vy: 0 });
        }
      }
    });
  }

  /**
   * Whether a press at (x, y), logical units, is a HUD panel's: no attack, no cast, no hold, and
   * nothing under it takes it.
   */
  private panelTakes(x: number, y: number): boolean {
    // a press over the overlay's panels is the overlay's: no attack, no cast, no hold; one in the
    // clear middle band answers as with the overlay closed (FS-HRH2J R8)
    if (this.equipment?.covers(x, y)) return true;
    // a press on the chat window is the window's: a toggle, the input, or nothing (FS-WJGFJ R31)
    if (this.chatWindow?.covers(x, y)) return true;
    // and one on the open party panel is the panel's (FS-R82NV R28)
    if (this.partyPanel?.covers(x, y)) return true;
    // and one on an invite prompt is the prompt's (FS-NCC9J R24)
    return this.invitePrompt?.covers(x, y) ?? false;
  }

  /** The class this player's clicks answer for, lower-cased; a warrior when none is chosen. */
  private ownClass(): string {
    const activeChar = useGameStore.getState().getActiveCharacter();
    return (activeChar?.className || "warrior").toLowerCase();
  }

  /** The Shadow Shot hold, drawn once a frame from where the archer is drawn (FS-JTNPR req 10, 11). */
  private aimFrame(): void {
    if (!this.combat.aiming || !this.playerPos) return;
    this.combat.aimFrame(this.playerPos);
  }

  /**
   * The hold as drawn: the archer's idle clip turned to the cursor, and the line from the bow
   * toward it, faint until a release would fire. Local only (ADR-0030).
   */
  private drawAim(from: Point, ready: boolean): void {
    const toward = this.cursorWorld();
    this.playerAnim?.holdAim({ x: toward.x - from.x, y: toward.y - from.y });
    this.kit.aim(from, toward, ready);
  }

  /** The world point under the cursor now, wherever the camera has moved since it last moved. */
  private cursorWorld(): { x: number; y: number } {
    // Phaser types the result as `Vector2 | object`; with no output given it is a Vector2
    const screen = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    return screenToWorld(screen.x, screen.y);
  }

  /**
   * The right button let go (FS-JTNPR req 13, 14, 18): a ready, affordable hold fires one
   * `shadow_shot` at the world point under the pointer; any other release ends it with nothing.
   */
  private releaseAim(pointer: Phaser.Input.Pointer): void {
    // a hold never outlives the run: once the run has ended, letting go only cancels
    if (this.runEnded) {
      this.cancelAim();
      return;
    }
    this.combat.releaseAim(this.playerPos, screenToWorld(pointer.worldX, pointer.worldY));
  }

  /**
   * Ends a hold with nothing sent and no cooldown started (FS-JTNPR req 15): death, a floor
   * change, the menu or equipment panel, a release off the canvas, the window losing focus.
   */
  private cancelAim(): void {
    this.combat.cancelAim();
  }

  /** No line left behind, and the archer's facing let go to its idle (FS-JTNPR req 15). */
  private endAimDrawing(): void {
    this.kit.endAim();
    this.playerAnim?.holdAim(undefined);
  }

  private connectToServer(): void {
    // Connect if not already connected
    if (!socketManager.isConnected()) {
      // back to whichever server this player is on: after a handoff that is the
      // run's host, not the one they started on (FS-K2HKP §Requirements 29)
      socketManager.reconnect();
      GameStateLogger.logConnectionStatus(
        "Connecting to game server...",
        toCss(palette.torchCore),
      );
    } else {
      GameStateLogger.logConnectionStatus(
        "Already connected to server",
        toCss(palette.safe),
      );
    }

    // Subscribe to connection status changes
    this.connectionStatusUnsubscribe = socketManager.onConnectionStatusChange((status) => {
      switch (status) {
        case "connected":
          GameStateLogger.logConnectionStatus(
            "Connected successfully!",
            toCss(palette.safe),
          );
          break;
        case "connecting":
          break;
        case "disconnected":
          GameStateLogger.logConnectionStatus(
            "Disconnected from server",
            toCss(palette.damageBright),
          );
          break;
        case "error":
          GameStateLogger.logError("WebSocket connection error");
          break;
      }
    });

    // Subscribe to game state updates
    this.gameStateUnsubscribe = socketManager.onGameStateUpdate(
      (state: ClientGameState) => {
        this.handleGameStateUpdate(state);
      },
    );
    this.subscribeFloorMap();

    // Listen for exit door unlocked message
    const doorUnlocked = (payload: { message: string }) => {
      console.log("Exit door unlocked!", payload);
      this.showNotification(payload.message, toCss(palette.safe));
    };
    socketManager.on("exit_door_unlocked", doorUnlocked);

    // Listen for interact responses (success/error messages)
    // A climb that goes through sends no reply: the next broadcast's floor says so (FS-F6F88 req 28)
    socketManager.on("interact", (payload: InteractReply) => {
      console.log("Interact response:", payload);
      // a refused reach opens no coffer (FS-KE075 §J R60); the empty frame after a reply refuses nothing
      if (!payload.success && (payload.reason || payload.message)) this.chestRefused();
      const notice = interactNotice(payload);
      if (notice) this.showNotification(notice.text, toCss(NOTICE_BACKING[notice.tone]));
    });

    // A refused equip (FS-BDA7X req 32, 45): the server's words, as a refusal. The next state puts
    // the item back where the server holds it.
    socketManager.on("equip", (reply: EquipReply) => {
      const refusal = equipRefusal(reply);
      if (refusal) this.showNotification(refusal, toCss(NOTICE_BACKING.refused));
    });

    // end_game: the run is over. No card (FS-GV8WN R24); interaction locks
    const endGame = () => this.endRun();
    socketManager.on("end_game", endGame);

    // settlement: this player settled (FS-GV8WN R19, R20); the record shows it
    const settlement = (payload: SettlementPayload) => this.showSettlement(payload);
    socketManager.on("settlement", settlement);
    // the server's one-shots, held while the run loaded (FS-C4JWH Edge States)
    this.oneShots = { exit_door_unlocked: doorUnlocked, end_game: endGame, settlement };

    // A refused leave_run (FS-QPDKN req 14, edge state "Leaving"): the button can be pressed
    // again. The server's refusals come in two shapes; both land here.
    socketManager.onError("leave_run", () => this.leaveRefused());
    // A refused forfeit_run (FS-9K8EZ req 4): Fall can be pressed again, and the server's words pass by.
    socketManager.onError("forfeit_run", (info) => this.fallRefused(info));
    socketManager.on("leave_run", (reply: { success?: boolean }) => {
      if (reply?.success === false) this.leaveRefused();
    });

    // Reset the logger for new session
    GameStateLogger.reset();
  }

  /** Whether a broadcast is this run's to draw: started without a session, everything is. */
  private acceptsFrame(state: Pick<ClientGameState, "session_id">): boolean {
    return this.sessionID === undefined || state.session_id === this.sessionID;
  }

  /**
   * The player is out of the barrow: their sprite, legs and name go, once, with the escape
   * played where they stood when `withEscape` (a body that was seen in play).
   */
  private hideOwnBody(withEscape: boolean): void {
    if (!this.player || !this.playerPos || !this.player.visible) return;
    if (withEscape && this.fx) playEscape(this.fx, "self", { x: this.playerPos.x, y: this.playerPos.y });
    this.player.setVisible(false);
    this.playerLegs?.setVisible(false);
    this.playerNameText?.setVisible(false);
  }

  private handleGameStateUpdate(state: ClientGameState): void {
    if (!this.acceptsFrame(state)) return;
    const held = this.heldFloorMap(state.session_id);
    // a late frame from the floor the party has climbed from (FS-KE075 §H.41)
    if (held && state.floor !== undefined && state.floor < held.floor) return;
    this.lastGameState = state;

    // The party climbed (FS-F6F88 req 28, 32): the old floor goes before this broadcast builds
    // the new one, so nothing waits on the transition, which only plays over the result.
    const climb = climbed(this.lastFloor, state.floor);
    // an arrival's first floor, at the first broadcast that names one (FS-PQ2TW R2, R13)
    const arrived = this.arrival && this.lastFloor === undefined && state.floor !== undefined;
    if (state.floor !== undefined) this.lastFloor = state.floor;
    if (climb) this.leaveFloor();
    // the floor's band and seed, from its first broadcast: a reconnect builds it directly
    this.floorLook ??= floorLook(this.worldLook, state.floor);
    // the floor is built from its map alone; without one its entities apply and it waits, asking
    // after a second (FS-KE075 §H.41, §H.43)
    const floorMap = held?.floor === state.floor ? held : undefined;
    if (this.mapWait.due(state.floor, !!floorMap, this.time.now)) socketManager.sendMessage("request_floor_map", {});

    // Update current player position from server
    if (state.current_player) {
      const pos = state.current_player.position;

      // 第一次收到位置，建立玩家
      const firstSeen = !this.player;
      if (firstSeen) {
        this.createPlayer(pos.x, pos.y, state.current_player.class, state.current_player.username);
      }
      // escaped, and still sent their own state until the run ends (FS-QPDKN req 24): the body
      // stays hidden; the escape plays only for a body seen in play, not on a reconnect's rebuild
      if (state.current_player.escape === true) this.hideOwnBody(!firstSeen);

      // 設定目標位置，在 update() 中平滑移動
      this.targetPosition = { x: pos.x, y: pos.y };

      this.showProgress(state.current_player);

      // 同步玩家背包與裝備
      this.equipment?.sync(state.current_player);
      // the overlay's stats panel, from this state (FS-HRH2J R24, R30)
      this.equipment?.updateCharacter(state.current_player);

      // 本身受傷變紅閃爍提示
      const health = healthIn(state.current_player);
      if (health) {
        // part of the way toward oxblood and back (FS-KYPQ9 §G.1)
        if (this.ownHealth && health.current < this.ownHealth.current && this.player) this.hits?.play(this.player);
        // a hit closes the container view, and only that: judged before this state's containers
        // are read, so a view this state opens for a reach stays (FS-1D6BX R19, R24, E4)
        if (costHealth(this.ownHealth, health) && this.containerView?.isOpen) this.containerView.close();
        this.ownHealth = health;
      }
    } else {
      // current_player is null — player has escaped
      this.hideOwnBody(true);
    }

    // a potion drunk: fewer worn and more health in this one state (FS-KZC92 R34)
    if (this.drinks.see(state.current_player)) this.shimmers?.playGranted(HEAL_LOOK, this.playerAnim?.crown);

    // the merc's own stance, parries and armed riposte: never a teammate's (FS-MAMHR §G.34–§G.38)
    this.kit.sync(state.current_player, this.time.now);

    // Update other players on screen
    this.updateOtherPlayers(state.other_players || [], state.world_type);

    // Monsters and corpses: the broadcast is the whole truth (FS-77AB6 req 32, 36), plated or not
    // as the floor's marker mode says (FS-48CTQ §A.1); a drop in the last-hit monster's health may
    // be the player's own hit (§C.6)
    this.markers = markerMode("run", state.floor);
    this.monsters?.setMarkerMode(this.markers);
    this.monsters?.sync(state.monsters ?? []);
    this.lastHit.observe(state.monsters ?? [], this.time.now);

    // The floor itself, from its map, once (FS-KE075 §H.43): the tower's outer wall, which stands on
    // no server state (FS-8RBQY §B.5), then the walls
    const building = !!floorMap && this.builtFloor !== floorMap.floor;
    if (floorMap) this.standFloor(floorMap);

    // Update doors from server
    this.updateDoors(state.doors || []);

    // Update containers from server
    this.updateContainers(state.containers || []);
    // an open container has opened its view: what is still reached for is kept or given up
    // (FS-MQYEX R26). Walking out of reach ends a reach the server never answered (FS-KE075 §J R60)
    this.settleReach(state);
    // the player's own timed open, over the containers just drawn (FS-MQYEX R22)
    this.showTimedOpen(state);

    // Update escape doors from server
    this.updateEscapeDoors(state.escape_doors || []);

    // Update switches from server
    this.updateSwitches(state.switches || []);

    // Stairs up: the broadcast is the whole truth, empty on the top floor (FS-F6F88 req 27)
    this.stairs.sync(state.stairs ?? []);
    this.updateFloorIndicator(state);

    // Run dressing, once the floor's static entities are known (FS-8RBQY §C.4–§C.5); then every
    // fixed light built this broadcast goes through the floor's budget, once (§C.6)
    if (floorMap) this.buildDressing(state);
    this.stampLights(state.floor);
    // what the party has explored of a dungeon floor, from this broadcast (FS-SRA9J §B)
    this.explore(state);

    // Update projectiles from server (fireballs)
    this.updateProjectiles(state.projectiles || []);

    // Burning trails: the whole truth each tick, the key absent when none burn (FS-4R9M9 R56)
    this.trails.sync(state.trails ?? []);

    // 檢測狀態變化並顯示通知（避免重複）
    this.checkEscapeDoorStateChanges(state);
    this.checkPlayerEscapedState(state);

    this.yieldMenu(state);
    // out of the delve, a hold ends the moment the client sees it (FS-JTNPR req 15)
    if (this.menuState(state).resolved) this.cancelAim();
    this.syncResolvedView(state);
    this.showResourceBars(state);
    this.showAbilityCard();
    this.partyFrames?.show(state);

    // Update escaped count HUD
    if (this.escapedCountText) {
      const count = state.escaped_count ?? 0;
      this.escapedCountText.setText(`Escaped: ${count}`);
    }

    if (climb) this.settlePlayers();
    if (climb || arrived) this.playFloorCard(state);
    if (building) this.arrivalCard.built();
  }

  /** This run's floor map as the store holds it, or none: another run's is not ours to build. */
  private heldFloorMap(sessionId = this.sessionID): FloorMap | undefined {
    const map = useGameStore.getState().floorMap;
    if (!map) return undefined;
    return sessionId === undefined || map.session_id === sessionId ? map : undefined;
  }

  /** Builds the floor the moment its map comes, if its snapshot came first (FS-KE075 §H.41). */
  private subscribeFloorMap(): void {
    this.floorMapUnsubscribe?.();
    this.floorMapUnsubscribe = useGameStore.subscribe((now, before) => {
      if (now.floorMap !== before.floorMap) this.onFloorMap();
    });
  }

  /**
   * A map that came after its floor's snapshot: the floor is built from it with the last
   * snapshot's entities, as a first snapshot would have built it, and a climb's veil lifts.
   */
  private onFloorMap(): void {
    const state = this.lastGameState;
    if (!state) return;
    const map = this.heldFloorMap(state.session_id);
    if (!map || map.floor !== state.floor || this.builtFloor === map.floor) return;
    this.standFloor(map);
    this.buildDressing(state);
    this.stampLights(state.floor);
    this.explore(state);
    this.arrivalCard.built();
  }

  /** The floor's size, its outer wall and its walls, from its map (FS-KE075 §H.42–§H.43). */
  private standFloor(map: FloorMap): void {
    this.fitFloor(map);
    this.buildPerimeter();
    this.buildWalls(map);
  }

  /** The floor's walls, from its map, once per floor (FS-KE075 §H.43). */
  private buildWalls(map: FloorMap): void {
    if (this.builtFloor === map.floor) return;
    this.builtFloor = map.floor;
    this.floorWalls = map.walls;
    if (this.dungeon) this.buildDungeonWalls(map.walls);
    else this.updateWalls(map.walls);
  }

  /**
   * A dungeon map's floor, once per floor (FS-KE075 §H.44–§H.45): its cells, and the ground's
   * chunks that what stands on it is shown and hidden by. A floor of buildings has none.
   */
  private enterDungeon(map: FloorMap): void {
    if (this.dungeon?.floor === map.floor && isDungeon(map)) return;
    // another floor's dungeon (a reconnect that sized the scene by the store's older map) goes,
    // so a floor of buildings is never built through it
    this.dropDungeon();
    if (!isDungeon(map)) return;
    const ground = new ChunkGrid(projectedBounds(map.width, map.height, GROUND_MARGIN), DUNGEON_CHUNK);
    const grid = new RegionGrid(map);
    this.dungeon = {
      floor: map.floor,
      grid,
      chunks: new ChunkVisibility(ground),
      lights: [],
      lit: new Set(),
      seen: new Exploration(grid),
      dressed: [],
    };
  }

  /**
   * The dungeon the scene holds goes: its chunks, and the fog and minimap with their floor; the
   * next floor's exploration starts over (FS-SRA9J §B.6).
   */
  private dropDungeon(): void {
    this.dungeon?.chunks.clear();
    this.dungeon?.fog?.destroy();
    this.dungeon?.minimap?.destroy();
    this.dungeon?.modeIcon?.destroy();
    this.dungeon = undefined;
    this.placeTopRightColumn();
  }

  /**
   * A dungeon floor's walls (FS-XK2B6 §A–§D, FS-KE075 §H.47): the map's wall cells in masonry,
   * drawn on their wall edges, the sides they share with the walkable cells they face
   * (`wallPlan`), each piece at its edge's height, the full pieces and posts fading over the
   * player like any occluder; a light only on a back edge facing a room. No building is drawn, no
   * blackout and no roof: every piece stands in its ground chunk, shown only near the camera
   * (§H.45). The ground takes the floor's look and seed, and, under baked walls, the walls'
   * shadows, painted flat into it where it lies (FS-V8FT3 §E): a wall sprite fading over the
   * player leaves its shadow as it is.
   */
  private buildDungeonWalls(walls: readonly WallState[]): void {
    const dungeon = this.dungeon!;
    const look = this.currentFloorLook();
    this.groundLayer?.paint([], { look: look.ground, seed: look.seed });
    const thickness = thicknessPx(look.walls);
    const plan = wallPlan(walls, dungeon.grid, thickness);
    const planned = dungeonWalls(plan, dungeon.grid, look.seed, look.walls);
    const baked = addWallPieces(this, this.art, planned, look.seed, look.walls);
    // placeholder walls never had a shadow (FS-V8FT3 Out of Scope)
    if (baked) this.groundLayer?.shade(dungeonShadows(planned, thickness, dungeon.grid));
    // the fog of war over the floor, its walls' pieces under its gate (FS-SRA9J §C.11, §C.13), its
    // slabs and posts standing where the plan draws them (FS-XK2B6 §F)
    const back = baked ? BAKE.WALL_BACK * BAKE.VPX : WALL_HEIGHT;
    const fog = new Fog(
      this,
      dungeon.grid,
      dungeon.chunks,
      () => ({ back, front: (back * BAKE.WALL_FRONT) / BAKE.WALL_BACK }),
      wallLayout(dungeon.grid, plan),
    );
    dungeon.fog = fog;
    const stand = (part: Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics, at: Point) =>
      dungeon.chunks.add(fog.gate(part, at), worldToScreen(at.x, at.y));
    if (baked) {
      this.occluders.add(baked.tall);
      for (const { sprite, at } of baked.standing) stand(sprite, at);
      baked.lights.forEach(({ source, at }) => this.queueLight("sconce", source, { at }));
    }
    const blocks = new Map<string, BuildingPart[]>();
    if (!baked) {
      // no art: a placeholder block on each piece's and post's footprint, as thick as the material
      // and as tall as the plan makes it, sorted as the baked piece or post is (ADR-0074)
      const block = (wallId: string, at: Point, w: number, h: number, height: WallHeight, depth: number) => {
        const tall = height === "back" ? WALL_HEIGHT : (WALL_HEIGHT * BAKE.WALL_FRONT) / BAKE.WALL_BACK;
        const own = blocks.get(wallId) ?? [];
        blocks.set(wallId, own);
        for (const g of addUprightBlock(this, at.x - w / 2, at.y - h / 2, w, h, PLACEHOLDER_STONE, tall)) {
          own.push(g.setDepth(depth));
          stand(g, at);
        }
      };
      for (const p of planned.pieces) {
        const [w, h] = p.axis === "x" ? [WORLD_PX_PER_TILE, thickness] : [thickness, WORLD_PX_PER_TILE];
        block(p.wallId, p.at, w, h, p.height, worldDepth(p.depthAt.x, p.depthAt.y));
      }
      for (const post of planned.posts)
        block(post.wallId, post.at, thickness, thickness, post.height, worldDepth(post.at.x, post.at.y, 1));
    }
    for (const w of walls) {
      const own = baked?.byWall.get(w.entity_id) ?? blocks.get(w.entity_id) ?? [];
      this.walls.set(w.entity_id, { pieces: own, entityId: w.entity_id });
    }
    // every region unexplored until the party is placed in it, this same broadcast (§B.6)
    fog.show((id) => dungeon.seen.state(id));
    // the floor's minimap, drawn from the same exploration (§E.23); as the overlay, held against
    // the screen from the main camera's frames (FS-1SEF0 §C.19)
    dungeon.minimap = new Minimap(
      {
        graphics: () => this.add.graphics(),
        canvasImage: (...image) => canvasImage(this, ...image),
        frames: (listener) => afterFrameSetUp(this.cameras.main, listener),
      },
      dungeon.grid,
      () => viewport.renderScale,
    );
    dungeon.minimap.setMode(this.minimapMode);
    // its map mode icon over it: a press is M's, under M's guards (FS-56CKV §Change: Map mode icon)
    dungeon.modeIcon = new MinimapModeIcon(
      { graphics: () => this.add.graphics(), text: (words, style) => this.add.text(0, 0, words, style) },
      { press: () => this.cycleMinimap(), blocked: () => !!this.menu || !!this.chatWindow?.isTyping() },
    );
    this.placeTopRightColumn();
  }

  /**
   * The top-right column from its anchor (FS-56CKV §B, superseding FS-SRA9J §E.20 in part): the
   * minimap at the top when one is shown, the floor indicator under it, the escaped count under
   * that; where no minimap is shown, or the floor indicator has no label, the rest closes up. The
   * dev readout goes with it (§C.14, §C.18): in the minimap's top-right corner (§Change: Map mode
   * icon, D8), else under the column's last line. The minimap, normal or enlarged, stands at the very top with the fullscreen
   * button at its left; in the overlay and with no minimap the button keeps the corner and the
   * column starts under it (§Change: Minimap at the top, fullscreen button beside it, as amended
   * 2026-11-12). The map mode icon goes with the map, or beside the button with the overlay up
   * (§Change: Map mode icon).
   */
  private placeTopRightColumn(): void {
    const minimap = this.dungeon?.minimap;
    const floor = this.floorText;
    const column = topRightColumn({
      view: viewport,
      minimap: cornerMinimap(minimap),
      floorHeight: floor?.visible ? floor.height : null,
      escapedHeight: this.escapedCountText?.height ?? 0,
    });
    this.fullscreenButton.hand(this, column.button);
    if (column.minimap) minimap?.place(column.minimap);
    this.dungeon?.modeIcon?.place(column.modeIcon);
    floor?.setX(column.floor.x).setY(column.floor.y);
    this.escapedCountText?.setX(column.escaped.x).setY(column.escaped.y);
    const readout = positionReadoutPlace(column.minimap, { right: column.escaped.x, bottom: column.bottom });
    this.positionReadout?.setOrigin(readout.origin.x, readout.origin.y).setPosition(readout.x, readout.y);
  }

  /**
   * M (FS-1SEF0 §A.2, superseding FS-SRA9J §E.19 in part): the minimap's next mode, kept in this
   * browser for this floor, the next and the next run. Only where a minimap is up (§A.3): elsewhere
   * the key changes nothing it cannot show.
   */
  private cycleMinimap(): void {
    const minimap = this.dungeon?.minimap;
    if (!minimap) return;
    this.minimapMode = nextMinimapMode(this.minimapMode);
    rememberMinimapMode(this.minimapStore, this.minimapMode);
    minimap.setMode(this.minimapMode);
    this.placeTopRightColumn();
  }

  /**
   * The map overlay on the figure the camera follows (FS-1SEF0 §C.14, §C.19): the player, or the
   * teammate a resolved player watches. A move of its layers, never a redraw; each frame, after
   * the figures have moved. Its dots are the party's living, in-play members where their figures
   * were just drawn, the focus among them, so each dot lies on its figure. In a panel mode the
   * minimap only notes these.
   */
  private followMapOverlay(): void {
    const minimap = this.dungeon?.minimap;
    if (!minimap) return;
    const watched = this.watchedPlayerId === undefined ? undefined : this.otherPlayersPos.get(this.watchedPlayerId);
    const focus = watched ?? this.playerPos;
    if (!focus) return;
    const state = this.lastGameState;
    const me = state?.current_player;
    const [self] = partyPositions({ current_player: me && { ...me, position: this.playerPos ?? me.position } });
    const allies = partyPositions({
      other_players: state?.other_players?.map((m) => ({ ...m, position: this.otherPlayersPos.get(m.id) ?? m.position })),
    });
    minimap.follow({ x: focus.x, y: focus.y }, { self, allies });
  }

  /**
   * The minimap from this broadcast (FS-SRA9J §E.22–§E.24): the regions explored and visible, the
   * switch, escape door and stairs in them, and the living, in-play members' dots, this client's
   * player apart; a dead or escaped player watching keeps it, their own dot gone. Each layer
   * redraws only on a change.
   */
  private showMinimap(state: ClientGameState): void {
    const dungeon = this.dungeon;
    const minimap = dungeon?.minimap;
    if (!minimap) return;
    const fixtures: MinimapFixture[] = [
      ...[...this.switches.values()].map(({ pos }) => ({ kind: "switch" as const, at: pos })),
      ...[...this.escapeDoors.values()].map(({ pos }) => ({ kind: "escape-door" as const, at: pos })),
      ...[...this.stairs.placed()].map(({ pos }) => ({ kind: "stairs" as const, at: pos })),
    ];
    minimap.show((id) => dungeon.seen.state(id), fixtures);
    const [self] = partyPositions({ current_player: state.current_player });
    minimap.party({ self, allies: partyPositions({ other_players: state.other_players }) });
  }

  /**
   * The party's exploration of a dungeon floor from this broadcast's living positions
   * (FS-SRA9J §B), and, when a region's state changed, the fog and the floor's lights redrawn
   * for it (§C.12, §C.13); then the minimap from it (§E.23). Nothing before the floor's walls
   * stand, nor on a floor of buildings.
   */
  private explore(state: ClientGameState): void {
    const dungeon = this.dungeon;
    if (!dungeon?.fog) return;
    if (dungeon.seen.see(partyPositions(state))) {
      dungeon.fog.show((id) => dungeon.seen.state(id));
      this.lightNearChunks();
    }
    this.showMinimap(state);
  }

  /**
   * Whether the fog hides a fixed object at world point `at` (FS-SRA9J §C.14): it stands in an
   * unexplored region of a dungeon floor. Hidden, not only covered, since its markers and hover
   * would stand over the fog.
   */
  private unexplored(at: Point): boolean {
    const dungeon = this.dungeon;
    if (!dungeon?.fog) return false;
    const region = regionAt(dungeon.grid, at);
    return region !== 0 && dungeon.seen.state(region) === "unexplored";
  }

  /**
   * Whether the fog hides a monster or drop pile at world point `at` (FS-SRA9J §D.15, §D.16): on
   * a dungeon floor, it is neither in a visible region nor within 400 px of a living, in-play
   * member. Never before the floor's fog is up (§Edge "Floor map not yet in").
   */
  private fogHides(at: Point): boolean {
    const dungeon = this.dungeon;
    return !!dungeon?.fog && !dungeon.seen.shows(at);
  }

  /**
   * Shows what stands in the ground chunks near the camera and hides the rest, and puts the fixed
   * lights near it on the light-map (FS-KE075 §H.45): only when the camera crosses a chunk edge.
   * Nothing on a floor of buildings.
   */
  private showNearChunks(): void {
    if (this.dungeon?.chunks.update(viewRect(this.cameras.main))) this.lightNearChunks();
  }

  /**
   * A dungeon floor's fixed lights near the camera on the light-map, the rest off it: never more
   * than {@link FIXED_LIGHT_CAP} at once, dropped in the floor's order (FS-8RBQY §C.6). A dungeon
   * floor has no rooms to light from inside, so each is lit wherever it is in view.
   */
  private lightNearChunks(): void {
    const dungeon = this.dungeon;
    if (!dungeon) return;
    // a light in a region that is not visible is off (FS-SRA9J §C.12); one in no region stays lit
    const near = nearLights(
      dungeon.lights,
      (chunk) => dungeon.chunks.shown(chunk),
      FIXED_LIGHT_CAP,
      (l) => l.region === 0 || dungeon.seen.state(l.region) === "visible",
    );
    const kept = new Set(near.map((l) => l.light.source));
    for (const source of dungeon.lit)
      if (!kept.has(source)) {
        this.lightMap?.remove(source);
        dungeon.lit.delete(source);
      }
    for (const source of kept)
      if (!dungeon.lit.has(source)) {
        this.lightMap?.add(source);
        dungeon.lit.add(source);
      }
    this.stampedLights = dungeon.lit.size;
  }

  /**
   * Sizes the run to its floor (FS-KE075 §H.42): the camera and the (vestigial, collision-free)
   * physics world in projected space, the map a diamond clamped by its bounding box plus a margin
   * of dark (FS-2325V §A.3, §A.7), and the ground under it. Only a change of size refits; a new
   * floor of the same size keeps the ground, but not the walls' shadows of the floor left (FS-V8FT3
   * Edge States, "A new floor"), so its paint lays none of them under the new floor's.
   */
  private fitFloor(map: FloorMap): void {
    this.enterDungeon(map);
    const { width, height, floor } = map;
    const cells = this.dungeon?.grid;
    const before = this.fittedTo;
    if (before?.width === width && before.height === height && before.cells === cells) {
      if (before.floor !== floor) {
        this.groundLayer?.unshade();
        this.fittedTo = { ...before, floor };
      }
      return;
    }
    this.fittedTo = { width, height, cells, floor };
    this.mapWidth = width;
    this.mapHeight = height;
    const bounds = projectedBounds(width, height, CAMERA_MARGIN);
    this.physics.world.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    boundCamera(this.cameras.main, bounds);
    // a dungeon's void is the darkest ink: the camera's background, painted over by nothing
    // (FS-KE075 §H.44)
    if (cells || before?.cells) this.cameras.main.setBackgroundColor(cells ? palette.inkDeep : palette.mapEdge);
    if (before) this.dropGround();
    if (!this.groundLayer && !this.groundPlane) this.createGround();
  }

  /**
   * The map floor, as a diamond on the projection: the world theme's baked ground when the
   * manifest has it, the placeholder floor otherwise (FS-2325V §C.1, FS-8RBQY §B.1).
   */
  private createGround(): void {
    const look = this.worldLook.ground;
    const dungeon = this.dungeon;
    // the floor's own look and seed, once its first broadcast named them: the ground's first paint
    // is then the floor's, and the walls' build asks for nothing new (FS-KE075 §H.44)
    const own = this.floorLook && this.currentFloorLook();
    // in chunks of at most 2048 px, which a floor of buildings fits in one of; a dungeon floor's
    // smaller, and only under its walkable cells (FS-KE075 §H.44, FS-XK2B6 §E)
    this.groundLayer = GroundLayer.available(this.art, "run", look)
      ? new GroundLayer(this, this.art, {
          width: this.mapWidth,
          height: this.mapHeight,
          kind: "run",
          look,
          chunk: dungeon ? DUNGEON_CHUNK : CHUNK_MAX,
          where: dungeon && ((at) => dungeon.grid.hasGround(at)),
          floor: own ? { look: own.ground, seed: own.seed } : undefined,
        })
      : undefined;
    if (!this.groundLayer) this.createMapBackground();
    // each chunk of the ground shown only near the camera, as what stands on it is (§H.45)
    for (const chunk of this.groundLayer?.chunks ?? [])
      dungeon?.chunks.add(chunk, { x: chunk.rect.x + chunk.rect.width / 2, y: chunk.rect.y + chunk.rect.height / 2 });
  }

  /** The ground of another size goes, for the floor's own (FS-KE075 §H.42). */
  private dropGround(): void {
    this.groundLayer?.destroy();
    this.groundLayer = undefined;
    if (this.groundPlane) {
      this.outsideObjects = this.outsideObjects.filter((obj) => !this.groundPlane!.surface.exists(obj));
      this.groundPlane.root.destroy();
      this.groundPlane = undefined;
    }
  }

  /**
   * Tears down everything built for the floor the party has left (FS-F6F88 req 33): walls, roofs,
   * the perimeter wall, house floors and flagstone, entrance markers, occluders, wall lights, and every entity drawn
   * from the old floor's state. The maps are emptied as well as their objects destroyed, because a
   * cleared entity id may come back on the new floor and must be built fresh there. The one-shot
   * notice memory goes too, so the new floor's switch and escape door announce themselves.
   */
  private leaveFloor(): void {
    // a hold drawn on the old floor never fires on the new one (FS-JTNPR req 15)
    this.cancelAim();
    // the next floor is built from its own map (FS-KE075 §H.43), a dungeon's chunks and lights
    // with it (§H.45)
    this.builtFloor = undefined;
    this.dropDungeon();
    this.floorWalls = [];
    this.walls.forEach((wall) => wall.pieces.forEach((piece) => piece.destroy()));
    this.walls.clear();
    // each room in both its looks, cap and all (FS-9PN7X §B), and the blackout: the new floor
    // starts with the player outside every room until the inside test says otherwise, the dark
    // drawn afresh around the new floor's room (§D.8); the silhouette waits for its rooms
    this.view?.clear();
    // the outer wall goes with its floor; its slit lights go with the light-map's fixed sources
    this.perimeter?.forEach((piece) => piece.destroy());
    this.perimeter = undefined;
    // the band's dressing goes too; the next floor resolves its own band, seed and light budget
    this.dressing?.forEach((piece) => piece.destroy());
    this.dressing = undefined;
    this.dressingAt = [];
    this.floorLook = undefined;
    this.pendingLights = [];
    this.stampedLights = 0;
    this.pooledContainers = new Set();

    this.buildings.forEach((building) => {
      building.roof.forEach((part) => part.destroy());
      // hiding the glow releases its effect; the new floor's marker plays afresh
      building.doorMarker?.setVisible(false);
      building.door.destroy();
      building.doorCollider.destroy();
      building.wallGroup.destroy(true);
    });
    this.buildings = [];
    this.roomLights = [];
    this.hallLights = [];
    this.roofCover = [];
    this.houseFloors.forEach((floor) => floor.destroy());
    this.houseFloors = [];
    // the ground keeps the old floor's paint until the next floor's build paints its own (the veil
    // is up meanwhile, FS-F6F88 §32): painting it bare here was a third paint for nothing
    this.serverBuildingsCreated = false;

    this.serverDoors.forEach((door) => {
      door.sprite?.destroy();
      door.slab?.plane.root.destroy();
    });
    this.serverDoors.clear();
    for (const drawn of [this.chests, this.escapeDoors, this.switches]) {
      drawn.forEach(({ sprite }) => sprite.destroy());
      drawn.clear();
    }
    this.stairs.clear();
    // the old floor's projectiles land nowhere: no impact, body, trail or light (FS-KYPQ9 §B.9)
    this.projectiles?.clear();
    this.trails.clear();
    this.monsters?.sync([]);
    this.lastHit.clear();
    this.bosses.clear();

    this.occluders.clear();
    this.lightMap?.clear();
    if (this.containerView?.entityId) this.containerView.close();
    this.reaching = undefined;

    this.previousEscapeDoorOpened = null;
    this.previousSwitchActivated = null;
  }

  /**
   * Sets every player down where the server put them on the new floor, rather than easing them
   * across the map from where they stood on the old one.
   */
  private settlePlayers(): void {
    if (this.playerPos && this.targetPosition) {
      this.playerPos.x = this.targetPosition.x;
      this.playerPos.y = this.targetPosition.y;
    }
    this.otherPlayersTargets.forEach((target, playerId) => {
      const pos = this.otherPlayersPos.get(playerId);
      if (!pos) return;
      pos.x = target.x;
      pos.y = target.y;
    });
  }

  /**
   * The floor's card, on a climb (FS-F6F88 req 32) or on an arrival (FS-PQ2TW R2), played through
   * the shared arrival card: the view drops to dark over the floor, or stays in the arrival's dark,
   * and comes back up with the floor's words, held dark until the floor is built from its map
   * (FS-KE075 §H.41).
   */
  private playFloorCard(state: ClientGameState): void {
    if (state.floor === undefined) return;
    this.arrivalCard.play(placeCard({ world: "run", floor: state.floor, top: isTopFloor(state) }), {
      built: this.builtFloor === state.floor,
    });
  }

  /** "Floor N" from the broadcast, redrawn only when it changes; hidden without floors. */
  private updateFloorIndicator(state: ClientGameState): void {
    const label = floorLabel(state);
    if (!this.floorText || label === this.shownFloorLabel) return;
    this.shownFloorLabel = label;
    this.floorText.setText(label ?? "");
    this.floorText.setVisible(label !== null);
    this.placeTopRightColumn();
  }

  /**
   * Projectiles off `state.projectiles` (FS-KYPQ9 §E.2, §E.3, §F.2–§F.4): first sight launches,
   * each tick moves, an id gone from state lands (hit or max range alike). Rivals' too.
   */
  private updateProjectiles(projectiles: ProjectileState[]): void {
    this.projectiles?.sync(projectiles);
  }

  /**
   * When a character's baked death clip completes, dust settles at its feet (FS-KYPQ9 §G.2), once
   * per death: a corpse turning replays the clip. The listener lives on the sprite and goes with
   * it; a placeholder plays no clip, so no dust.
   */
  private settleDustOnDeath(
    sprite: Phaser.GameObjects.Sprite,
    owner: string,
    feet: () => Point | undefined,
  ): void {
    sprite.on(
      Phaser.Animations.Events.ANIMATION_COMPLETE,
      (animation: Phaser.Animations.Animation) => {
        const at = feet();
        if (this.fx && at)
          this.deathDust.clipComplete(this.fx, owner, sprite, animation.key, { x: at.x, y: at.y });
      },
    );
  }

  /**
   * The charge, world positions in (FS-KYPQ9 §D.2): a dust burst at the start, then dust kicked
   * at the drawn feet while the server carries the warrior over several ticks, ended after
   * {@link CHARGE_MS}. A new charge ends the last one first.
   */
  private playWarriorDashEffect(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
  ): void {
    if (!this.fx) return;
    this.charge?.end();
    const charge = playCharge(
      this.fx,
      "self",
      { x: startX, y: startY },
      { x: targetX, y: targetY },
    );
    this.charge = charge;
    this.time.delayedCall(CHARGE_MS, () => {
      charge.end();
      if (this.charge === charge) this.charge = undefined;
    });
  }

  /**
   * The slash, world positions in (FS-KYPQ9 §D.1): the warrior's `CastSkill` slash and the rival
   * click's `Attack` both play it.
   */
  private playWarriorSlashEffect(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
  ): void {
    if (this.fx) playSlash(this.fx, "self", { x: startX, y: startY }, { x: targetX, y: targetY });
  }

  /**
   * Where the player's own markers stack from this frame ({@link markerBase}), or null over
   * their baked corpse.
   */
  private ownMarkerBase(): number | null {
    if (!this.player) return null;
    return markerBase(
      this.player,
      this.playerAnim?.crown,
      isDead(this.lastGameState?.current_player),
      this.playerAnim?.artScale,
    );
  }

  private updateOtherPlayers(
    otherPlayersData: PlayerState[],
    worldType: ClientGameState["world_type"],
  ): void {
    // Track which players are still in the game
    const activePlayerIds = new Set(otherPlayersData.map((p) => p.id));

    // Remove players who left
    this.otherPlayers.forEach((sprite, playerId) => {
      if (!activePlayerIds.has(playerId)) {
        // the rival's own effects go with them; a quiet column marks where (FS-KYPQ9 §B.9, §G.3)
        const leftFrom = this.otherPlayersPos.get(playerId);
        this.fx?.release(playerId);
        if (leftFrom && this.fx) playEscape(this.fx, playerId, { x: leftFrom.x, y: leftFrom.y });
        sprite.destroy();
        this.otherPlayers.delete(playerId);
        this.otherPlayersTargets.delete(playerId);
        this.otherPlayersPos.delete(playerId);

        // remove legs too
        const legs = this.otherPlayersLegs.get(playerId);
        if (legs) {
          legs.destroy();
          this.otherPlayersLegs.delete(playerId);
        }
        this.otherPlayersFacing.delete(playerId);
        this.otherPlayersWalkPhase.delete(playerId);
        this.otherPlayersAnim.delete(playerId);

        // remove name text
        const nameText = this.otherPlayersNameTexts.get(playerId);
        if (nameText) {
          nameText.destroy();
          this.otherPlayersNameTexts.delete(playerId);
        }
        // remove their health bar
        this.teammateHealthBars.get(playerId)?.graphics.destroy();
        this.teammateHealthBars.delete(playerId);
      }
    });

    // Update or create other players
    otherPlayersData.forEach((playerData) => {
      let sprite = this.otherPlayers.get(playerData.id);
      const cls = playerData.class || "warrior";
      this.otherPlayersClass.set(playerData.id, cls);

      if (!sprite) {
        // Create new sprite for this player, at the projection of their position
        const pos = { x: playerData.position.x, y: playerData.position.y };
        this.otherPlayersPos.set(playerData.id, pos);
        sprite = this.physics.add.sprite(0, 0, this.facingTexture("other_" + cls, "se"));
        standAt(sprite, pos, 1);

        // Rivals wear their class's sheet, untinted: the name plate tells them apart
        // (FS-2325V §E.3). The placeholder rival texture only when the sheet is missing.
        const anim = new CharacterAnimator(this.art, cls);
        this.otherPlayersAnim.set(playerData.id, anim);
        if (anim.baked) {
          anim.dress(sprite);
          keepBodySize(sprite, anim.artScale);
        } else if (sprite.body) {
          (sprite.body as Phaser.Physics.Arcade.Body).setCircle(20, 10, 10);
        }
        this.settleDustOnDeath(sprite, playerData.id, () => this.otherPlayersPos.get(playerData.id));

        // Their pointer target is the ground they stand on, not their sprite's bounds
        // (FS-2325V §C.6): the server's collision radius around their world position.
        // Another player is an ally (FS-77AB6 req 40): no strike-mark, no click-to-attack.
        // Nothing listens to it now, but it stays: removing it would change which object a
        // click over them lands on.
        sprite.setInteractive({
          hitArea: {},
          hitAreaCallback: footprintHitArea(
            () => this.otherPlayersPos.get(playerData.id) ?? pos,
            PLAYER_FOOTPRINT_RADIUS,
          ),
        });

        this.otherPlayers.set(playerData.id, sprite);

        // create legs for this other player
        const legs = this.add.graphics();
        legs.setDepth(worldDepth(pos.x, pos.y, 2));
        this.otherPlayersLegs.set(playerData.id, legs);
        this.otherPlayersFacing.set(playerData.id, "se");
        this.otherPlayersWalkPhase.set(playerData.id, 0);
        if (!anim.baked) this.drawLegs(legs, sprite.x, sprite.y, "se", 0, false, palette.hudLabel);

        // their name, always over their head in the ally channel (FS-77AB6 req 40, FS-CH21F R13)
        const nameText = this.add.text(
          sprite.x,
          (markerBase(sprite, anim.crown, false, anim.artScale) ?? sprite.y) - NAME_GAP,
          playerData.username || "Unknown",
          {
            fontSize: "11px",
            fontFamily: CANVAS_FONT.body,
            color: toCss(palette.markerAlly),
            stroke: toCss(palette.markerStroke),
            strokeThickness: 3,
            align: "center",
          },
        );
        nameText.setOrigin(0.5, 1);
        nameText.setDepth(MARKER_DEPTH.name);
        this.otherPlayersNameTexts.set(playerData.id, nameText);
      }

      // 設定目標位置，在 update() 中平滑移動
      this.otherPlayersTargets.set(playerData.id, {
        x: playerData.position.x,
        y: playerData.position.y,
      });

      // 其他玩家受傷變紅閃爍提示
      const prevHp = this.otherPlayersPrevHp.get(playerData.id);
      const curHp = playerData.current_health;
      if (prevHp !== undefined && curHp !== undefined && curHp < prevHp) {
        // part of the way toward oxblood and back; the tint dies with the sprite (FS-KYPQ9 §G.1)
        this.hits?.play(sprite);
      }
      if (curHp !== undefined) {
        this.otherPlayersPrevHp.set(playerData.id, curHp);
      }

      // their overhead health bar, while switched on: none over a corpse, an escaped
      // teammate, or in the hub
      if (this.showTeammateBars) {
        let bar = this.teammateHealthBars.get(playerData.id);
        if (!bar) {
          const graphics = this.add.graphics();
          graphics.setDepth(MARKER_DEPTH.bar);
          bar = { graphics, fill: null };
          this.teammateHealthBars.set(playerData.id, bar);
        }
        bar.fill = teammateHealthFill(worldType, playerData);
      }
      this.markTeammate(playerData.id);
    });
  }

  /**
   * The tower's outer wall around the play area, with the cold light of its arrow slits stamped
   * once (FS-8RBQY §B.5–§B.6). Only for a world theme that has one, once per floor, and never
   * without its art: a missing perimeter sheet leaves the wall out (§B.8).
   */
  private buildPerimeter(): void {
    // a dungeon floor's shell walls are its edge: no outer wall (FS-KE075 §H.47)
    if (!this.worldLook.perimeter || this.perimeter || this.dungeon) return;
    const built = addPerimeter(this, this.art, this.mapWidth, this.mapHeight);
    this.perimeter = built?.sprites ?? [];
    built?.lights.forEach((light) => this.queueLight("slit", light));
    // it stands outside every room: hidden from inside one (FS-9PN7X §C.1)
    this.view?.invalidate();
  }
  /** This floor's look, or floor 1's before any broadcast has named the floor. */
  private currentFloorLook(): FloorLook {
    return (this.floorLook ??= floorLook(this.worldLook));
  }

  /**
   * The stairs up (FS-8RBQY §E): the baked spiral at the server position, sorted by its footprint
   * like any prop, fading over a player behind it, in its own warm pool. Without its sheet, the
   * code-drawn `stairs_up` placeholder, with no pool.
   */
  private addStairs(at: Point): Phaser.GameObjects.Sprite {
    if (!this.art?.has("stairs_spiral")) {
      const sprite = this.add.sprite(0, 0, "stairs_up");
      standAt(sprite, at);
      return sprite;
    }
    const { sprite, light } = addProp(this, this.art, "stairs_spiral", at);
    this.occluders.add([sprite]);
    if (light) this.queueLight("stairs", { ...light, intensity: STAIRS_POOL_INTENSITY }, { at });
    return sprite;
  }

  /**
   * Strews the floor's run dressing once (FS-8RBQY §C.4–§C.5), kept out of everything its
   * broadcast puts on the floor. Never interactive, never in physics; a brazier's flame joins the
   * floor's fixed lights. Nothing for a theme without dressing or without its art.
   */
  private buildDressing(state: ClientGameState): void {
    if (this.dressing) return;
    const look = this.currentFloorLook();
    const dungeon = this.dungeon;
    // a dungeon floor's from its map and what every snapshot carries, never its containers, which
    // interest cuts: so every member strews the same (FS-KE075 §H.47)
    const seen = dungeon ? { ...state, containers: [] } : state;
    const statics = dressingStatics({ ...seen, walls: this.floorWalls }, this.mapWidth, this.mapHeight);
    // a dungeon floor's in its rooms only, at the same density per room area (FS-KE075 §H.47)
    const plan = !look.dressing
      ? []
      : dungeon
        ? planRoomDressing(look.dressing, look.seed, statics, dressingRooms(dungeon.grid))
        : planDressing(look.dressing, look.seed, statics);
    // piece by piece, so each sprite and flame keeps where it stands (FS-9PN7X §C.2, §D.6)
    this.dressing = [];
    for (const piece of plan) {
      const built = addDressing(this, this.art, [piece]);
      this.dressing.push(...built.sprites);
      // on a dungeon floor no room hides it: it is shown by its ground chunk instead (§H.45),
      // unless it has given way to a container
      if (dungeon) {
        const dressed: DressedPiece = { piece, sprites: built.sprites, lights: built.lights, gone: false };
        dungeon.dressed.push(dressed);
        for (const sprite of built.sprites) {
          const part = {
            setVisible: (visible: boolean) => sprite.setVisible(visible && !dressed.gone),
            setTint: (tint: number) => sprite.setTint(tint),
            clearTint: () => sprite.clearTint(),
          };
          dungeon.chunks.add(dungeon.fog?.gate(part, piece.at) ?? part, worldToScreen(piece.at.x, piece.at.y));
        }
      } else this.dressingAt.push(...built.sprites.map((sprite) => ({ sprite, pos: piece.at })));
      this.occluders.add(built.tall);
      built.lights.forEach((light) => this.queueLight("brazier", light, { at: piece.at }));
    }
    for (const c of state.containers ?? []) if (placedKind(c) !== "drop_pile") this.giveWay(c.position);
  }

  /**
   * A dungeon floor's dressing gives way to a container seen standing by it (FS-KE075 §H.47): its
   * sprites hidden for the rest of the floor, its flame taken off the floor's lights. A container
   * never moves, so every member who sees it ends with the same dressing.
   */
  private giveWay(at: Point): void {
    const dungeon = this.dungeon;
    if (!dungeon) return;
    for (const dressed of dungeon.dressed) {
      if (dressed.gone || !dressingStandsBy(dressed.piece, at)) continue;
      dressed.gone = true;
      for (const sprite of dressed.sprites) sprite.setVisible(false);
      this.dressing = this.dressing?.filter((sprite) => !dressed.sprites.includes(sprite));
      const flames = new Set(dressed.lights);
      this.pendingLights = this.pendingLights.filter((l) => !flames.has(l.light.source));
      dungeon.lights = dungeon.lights.filter((l) => !flames.has(l.light.source));
      for (const source of flames)
        if (dungeon.lit.delete(source)) this.lightMap?.remove(source);
      this.stampedLights = dungeon.lit.size;
    }
  }

  /**
   * A faint amber pool under a chest, sack or switch, so it reads as itself under the tower's dark
   * ambient (FS-8RBQY §B.7), budgeted like any fixed light. Only for a theme that wants one, and
   * only over baked art: the placeholder textures carry their own amber.
   */
  private poolInteractable(at: Point): void {
    if (!this.worldLook.interactablePools || !this.art?.available) return;
    const s = worldToScreen(at.x, at.y);
    const seed = tileHash(Math.round(at.x), Math.round(at.y), 23);
    this.queueLight("interactable", interactablePool({ x: s.x, y: s.y - 12 }, seed), { at });
  }

  /**
   * Holds a fixed light for the floor's budget; nothing reaches the light-map until `stampLights`.
   * `where` names the building it belongs to, or the world point it stands on (FS-9PN7X §D.6).
   */
  private queueLight(kind: FixedLightKind, source: LightSource, where: LightRoom = {}): void {
    this.pendingLights.push({ kind, at: { x: source.x, y: source.y }, light: { source, ...where } });
  }

  /**
   * Stamps the fixed lights waiting since the last broadcast, within the floor's budget of
   * {@link FIXED_LIGHT_CAP}: slits drop first, then braziers, then sconces, and the stairs pool
   * never (FS-8RBQY §C.6). Once per floor build in practice: the light-map is never rebuilt.
   * Not before `floor` is built from its map: a light queued from a snapshot that came first (a
   * container's pool) waits for the floor's chunks and fog, or its buildings (FS-KE075 §H.41).
   */
  private stampLights(floor: number | undefined): void {
    if (this.pendingLights.length === 0 || this.builtFloor === undefined || this.builtFloor !== floor) return;
    const dungeon = this.dungeon;
    if (dungeon) {
      // a dungeon floor's every fixed light waits in its chunk; those near the camera are lit
      // within the cap (FS-KE075 §H.45)
      for (const l of this.pendingLights) {
        // the region it lights: where it stands, or the nearest walkable cell to the wall it hangs on
        const region = regionAt(dungeon.grid, l.light.at ?? screenToWorld(l.at.x, l.at.y));
        dungeon.lights.push({ ...l, chunk: dungeon.chunks.grid.indexAt(l.at), region });
      }
      this.pendingLights = [];
      this.lightNearChunks();
      return;
    }
    const kept = budgetLights(this.pendingLights, FIXED_LIGHT_CAP - this.stampedLights);
    for (const { light: { source, room, at } } of kept) {
      // a light standing in a building is that building's, by the same inside test (§A.2)
      const own = room ?? (at && buildingAt(at, this.buildings)?.id);
      if (!own) {
        this.addHallLight(source, at);
        continue;
      }
      this.roomLights.push({ room: own, source, intensity: source.intensity, hung: room !== undefined });
      // its flame's halo, like its pool, is in sight only from inside
      this.lightMap?.add(source, () => this.view?.building?.id === own);
    }
    this.stampedLights += kept.length;
    this.pendingLights = [];
    this.showLights();
  }

  /**
   * A light of the halls, at a footprint or (a perimeter slit) at none: its pool and halo go dark
   * while the player is in a room it is not in, and come back in the halls, as the hub's street
   * lights do (the owner's addition 1: inside a building, everything outside goes dark).
   */
  private addHallLight(source: LightSource, at?: Point): void {
    this.hallLights.push({ source, intensity: source.intensity, at });
    this.lightMap?.add(source, () => this.inSight(at));
  }

  /** Whether what stands at `at` (or, at none, outside every room) is in the player's sight. */
  private inSight(at?: Point): boolean {
    return at ? !this.view?.hidden(at) : !this.view?.building;
  }

  /**
   * The fixed lights for the player's room (FS-9PN7X §D.6): each building's own lights are lit only
   * while the player is inside it, as the hub's interiors are, and every light outside the player's
   * room goes dark (the owner's addition 1). The pool goes dark and the halo's gate closes.
   */
  private showLights(): void {
    const inside = this.view?.building?.id;
    for (const l of this.roomLights) l.source.intensity = l.room === inside ? l.intensity : 0;
    for (const l of this.hallLights) l.source.intensity = this.inSight(l.at) ? l.intensity : 0;
  }

  /**
   * The map floor. The map is a diamond on the projection: its floor keeps its
   * world-coordinate drawing on a plane that carries the projection, and the
   * corners beyond the diamond are the camera's dark background (FS-2325V §A.7).
   * The old out-of-map hull decoration is gone with the corners it filled.
   */
  private createMapBackground(): void {
    // neutral dark stone, flagged on the world grid: the floor without its baked art (FS-8RBQY §B.8)
    const stone = this.add.graphics();
    stone.fillStyle(palette.fallbackStone, 1);
    stone.lineStyle(1, palette.fallbackStoneJoint, 1);
    const grid = this.dungeon?.grid;
    if (grid) {
      // a dungeon floor's under its walkable cells only: a wall cell and the void stay the
      // background's darkest ink (FS-KE075 §H.44, FS-XK2B6 §E)
      const c = grid.cell;
      for (let cy = 0; cy < grid.rows; cy++)
        for (let cx = 0; cx < grid.cols; cx++) {
          if (!grid.hasGround({ x: (cx + 0.5) * c, y: (cy + 0.5) * c })) continue;
          stone.fillRect(cx * c, cy * c, c, c);
          for (let t = 0; t <= c; t += WORLD_PX_PER_TILE) {
            stone.lineBetween(cx * c + t, cy * c, cx * c + t, (cy + 1) * c);
            stone.lineBetween(cx * c, cy * c + t, (cx + 1) * c, cy * c + t);
          }
        }
    } else {
      stone.fillRect(0, 0, this.mapWidth, this.mapHeight);
      for (let x = 0; x <= this.mapWidth; x += WORLD_PX_PER_TILE) stone.lineBetween(x, 0, x, this.mapHeight);
      for (let y = 0; y <= this.mapHeight; y += WORLD_PX_PER_TILE) stone.lineBetween(0, y, this.mapWidth, y);
    }

    const plane = addWorldPlane(this);
    plane.root.setDepth(-1);
    plane.surface.add(stone);
    this.groundPlane = plane;
    this.outsideObjects.push(stone);
  }

  /**
   * Whether the player stands in the world: drawn, alive, and not watching a teammate. While they
   * do not (dead, escaped, spectating) no building is theirs (edge state: player gone).
   */
  private present(): boolean {
    return !!this.player?.visible && !this.watchedPlayerId && !isDead(this.lastGameState?.current_player);
  }

  /**
   * Where the inside test is taken (FS-9PN7X §A.2): the player's drawn position, or none before the
   * player is drawn, once they have escaped, while they lie dead, or while they watch a teammate
   * (edge state: player gone). With none, no building is the player's: the blackout is off and
   * only the hide rule's indoors half applies. The watched teammate is not followed indoors.
   */
  private eye(): Point | undefined {
    return this.present() ? this.playerPos : undefined;
  }

  /** The player to silhouette behind a room (§E.2: the player only), while they stand in the world. */
  private figure(): Figure | undefined {
    const self = this.player;
    if (!self || !this.present()) return undefined;
    return { body: self, bounds: self.getBounds(), depth: self.depth };
  }

  /** The building the player stands in, by the one inside test (FS-9PN7X §A.2); none outside. */
  private get currentBuilding(): Building | undefined {
    const id = this.view?.building?.id;
    return id === undefined ? undefined : this.buildings.find((b) => b.id === id);
  }

  /** Whether a roof still on (a house the player is not inside) stands over this world point. */
  private underRoof(at: Point): boolean {
    if (!this.worldLook.roofs) return false;
    const mine = this.currentBuilding;
    return this.buildings.some((b) => b !== mine && insideHouse(at, b));
  }

  /**
   * Which building the player stands in, and what that changes, all in the frame the inside test
   * does (FS-9PN7X §A.4): the building swaps to its interior look, the lights follow it, and
   * everything outside it goes dark (§D), in every world theme; the silhouette while a room covers
   * the player (§E). Then the doors and the one hide rule for the frame (§C).
   */
  private checkBuildingStatus(): void {
    this.view?.update(this.eye(), this.figure());
    this.showDoors();
    this.hideWhatIsElsewhere();
  }

  /**
   * What hides by footprint with the player's room (FS-9PN7X §C.1): the halls' walls, an exterior
   * house's roof (lifted over its own house, outside every other), and the outer wall, which stands
   * outside every room. Hidden, not left to the blackout, since tall pieces just outside the room
   * reach up into its hole.
   */
  private sceneryByFootprint(): Scenery[] {
    const scenery: Scenery[] = this.buildings.map(({ roof }) => ({ parts: roof }));
    this.walls.forEach(({ pieces, pos }) => {
      if (pos) scenery.push({ parts: pieces, at: pos });
    });
    if (this.perimeter) scenery.push({ parts: this.perimeter });
    return scenery;
  }

  /**
   * Whatever stands on the floor besides the rooms' walls, for the blackout's mask (FS-9PN7X §D):
   * the player and teammates, body and legs; monsters; containers and drop piles, the escape door,
   * switches, stairs and run dressing; the doors in the rooms' walls; projectiles and world
   * effects. Plates and bars stand over the dark, so none are here. A trail is a line on the
   * floor, already inside the floor's px, so it is not either.
   */
  private *occupants(): Iterable<Occupant> {
    if (this.player && this.playerPos) {
      const parts: Stamp[] = [this.player];
      if (this.playerLegs) parts.push(this.playerLegs);
      yield { parts, at: this.playerPos };
    }
    for (const [id, sprite] of this.otherPlayers) {
      const at = this.otherPlayersPos.get(id);
      const legs = this.otherPlayersLegs.get(id);
      if (at) yield { parts: legs ? [sprite, legs] : [sprite], at };
    }
    // the roster's and the runtime's objects are this scene's Phaser objects: its stage made them
    for (const m of this.monsters?.standing() ?? []) yield m as unknown as Occupant;
    for (const { sprite, pos } of [
      ...this.chests.values(),
      ...this.escapeDoors.values(),
      ...this.switches.values(),
      ...this.stairs.placed(),
      ...this.dressingAt,
    ])
      yield { parts: [sprite], at: pos };
    for (const { sprite, slab, pos } of this.serverDoors.values())
      yield { parts: [...(sprite ? [sprite] : []), ...(slab ? [slab.plane.root] : [])], at: pos };
    yield* this.projectiles?.standing() ?? [];
    for (const fx of this.fx?.standing() ?? []) yield fx as unknown as Occupant;
  }

  /**
   * What covers the player from outside beside the rooms' own pieces (FS-9PN7X §E.1): each room
   * door, open or shut, and an exterior house's roof.
   */
  private coverBesideRooms(): Cover[] {
    const cover = [...this.roofCover];
    this.serverDoors.forEach(({ sprite, inRoom }) => {
      if (inRoom && sprite) cover.push(coverOf(sprite));
    });
    return cover;
  }

  /**
   * The doors for where the player is, each frame, since a door opens and shuts on its own
   * (FS-9PN7X §B.5 amended 2026-11-03, §C.1): from the halls every door shows its own state, open
   * or shut; inside a room, its own doors show their frames (a door in a wall two rooms share is in
   * both) and every other door hides.
   */
  private showDoors(): void {
    const mine = this.view?.building;
    this.serverDoors.forEach((door) => {
      const shown = mine ? insideHouse(door.pos, mine) : true;
      door.sprite?.setVisible(shown);
      door.slab?.plane.root.setVisible(shown);
    });
  }

  /**
   * The one hide rule (FS-9PN7X §C.1): whatever stands in a building the player is not in, or out
   * of the building the player is in, is hidden, read each frame from where it is drawn. Monsters,
   * teammates (the party too, §C.4), containers and drop piles, the escape door and switch,
   * stairs, run dressing, projectiles, burning trails and world effects. The plates and bars over
   * monsters and teammates stand over the blackout, so they are hidden here, never left to it
   * (§C.2). The player is never hidden: their building is picked by the same rule (§C.3).
   *
   * On a dungeon floor the fog hides too (FS-SRA9J): monsters and drop piles by its monster rule
   * (§D.15, §D.16), a hidden monster no target (§D.17); everything else that stands in an
   * unexplored region (§C.8, §C.14). Teammates never (§D.18).
   */
  private hideWhatIsElsewhere(): void {
    const hiddenAt = (at: Point) => this.view?.hidden(at) ?? false;
    /** Out of sight: elsewhere by the blackout's rule, or in an unexplored region. */
    const unseen = (at: Point) => hiddenAt(at) || this.unexplored(at);

    this.otherPlayers.forEach((sprite, playerId) => {
      const pos = this.otherPlayersPos.get(playerId);
      if (!pos) return;
      const shown = !hiddenAt(pos);
      sprite.setVisible(shown);
      this.otherPlayersLegs.get(playerId)?.setVisible(shown);
      this.teammateHealthBars.get(playerId)?.graphics.setVisible(shown);
      // shown, the name keeps what the hover said this frame
      if (!shown) this.otherPlayersNameTexts.get(playerId)?.setVisible(false);
    });
    this.monsters?.hideWhere((at) => hiddenAt(at) || this.fogHides(at));

    for (const { sprite, pos, pile } of this.chests.values())
      sprite.setVisible(!hiddenAt(pos) && !(pile ? this.fogHides(pos) : this.unexplored(pos)));
    const placed = [
      ...this.escapeDoors.values(),
      ...this.switches.values(),
      ...this.stairs.placed(),
      ...this.dressingAt,
    ];
    for (const { sprite, pos } of placed) sprite.setVisible(!unseen(pos));
    for (const { bed, glow, trail } of this.trails.placed()) {
      // a trail is a line on the floor: hidden once neither end is in sight
      const shown = !unseen(trail.from) || !unseen(trail.to);
      bed.setVisible(shown);
      glow.setVisible(shown);
    }
    this.projectiles?.hideWhere(unseen);
    this.fx?.hideWhere(unseen);
  }

  private createUI(): void {
    // the minimap's mode this browser kept, for this run's floors (FS-1SEF0 §A.4)
    this.minimapMode = readMinimapMode(this.minimapStore);
    this.dungeon?.minimap?.setMode(this.minimapMode);
    // a developer aid, left out of production builds
    if (showsPositionReadout()) this.createPositionReadout();

    // Escaped players count (top-right), last in the column (FS-56CKV §B.9)
    const corner = anchorAt(TOP_RIGHT_HUD);
    this.escapedCountText = this.add.text(
      corner.x,
      corner.y,
      "Escaped: 0",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: TOP_RIGHT_LINE.fontSize,
        color: toCss(palette.frameBright),
        backgroundColor: toCss(palette.hudPanel),
        padding: { ...TOP_RIGHT_LINE.padding },
      },
    );
    this.escapedCountText.setOrigin(1, 0); // right-aligned
    this.escapedCountText.setScrollFactor(0);
    this.escapedCountText.setDepth(1000);

    // The party's floor (FS-F6F88 req 29): neutral HUD, under the minimap (FS-56CKV §B.9)
    this.floorText = this.add.text(
      corner.x,
      corner.y,
      "",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: TOP_RIGHT_LINE.fontSize,
        color: toCss(palette.hudText),
        backgroundColor: toCss(palette.hudPanel),
        padding: { ...TOP_RIGHT_LINE.padding },
      },
    );
    this.floorText.setOrigin(1, 0);
    this.floorText.setScrollFactor(0);
    this.floorText.setDepth(1000);
    this.floorText.setVisible(false);
    this.placeTopRightColumn();

    // The target frame (FS-48CTQ §C, §E.14): top centre, hidden until a frame floor names a monster
    this.targetFrame = new TargetFrame(
      {
        text: (content, style) => this.add.text(0, 0, content, style),
        graphics: () => this.add.graphics(),
      },
      () => viewport.centerX,
      () => viewport.renderScale,
    );
  }

  /**
   * The target frame, once a frame (FS-48CTQ §C.5): the hovered monster, else an engaged boss
   * (§D.10, read against the run's players, this client's among them), else the last-hit one, of
   * those shown and living; nothing on an `overhead` floor. Hidden while the spectate HUD or the
   * floor veil holds the top centre (§E.15–16). Run after the frame's hide rule, which says what
   * is shown.
   */
  private updateTargetFrame(deltaMs: number): void {
    if (!this.targetFrame) return;
    let target = null;
    if (this.markers === "frame" && this.monsters) {
      const shown = this.monsters.targetable();
      const { current_player, other_players = [] } = this.lastGameState ?? {};
      const members = current_player ? [current_player, ...other_players] : other_players;
      target = pickTarget({
        shown,
        hovered: this.monsters.hoveredId,
        engagedBoss: this.bosses.observe(this.lastGameState?.monsters ?? [], members, shown),
        lastHit: this.lastHit.current(this.time.now),
      });
    }
    const covered = this.spectateHud !== undefined || this.arrivalCard.up;
    this.targetFrame.update(deltaMs, target, covered);
  }

  /**
   * The dev position readout (FS-56CKV §C): the player's x/y, refreshed every frame; small and dim
   * with no backing, over the minimap's layers. `placeTopRightColumn` stands it, with the column.
   */
  private createPositionReadout(): void {
    const posText = this.add.text(0, 0, "", {
      fontFamily: CANVAS_FONT.body,
      fontSize: POSITION_READOUT.fontSize,
      color: toCss(POSITION_READOUT.colour),
    });
    posText.setAlpha(POSITION_READOUT.alpha);
    posText.setScrollFactor(0);
    posText.setDepth(POSITION_READOUT.depth);
    this.positionReadout = posText;

    // 每幀更新座標 — scene events outlive a shutdown, so the listener goes with it
    const showPosition = () => {
      if (!this.player) {
        posText.setText("Awaiting the deep...");
        return;
      }
      const pos = this.playerPos ?? { x: 0, y: 0 };
      const at = `X: ${Math.round(pos.x)} Y: ${Math.round(pos.y)}`;
      // a tower floor is all indoors, so it says neither (FS-8RBQY §B.3)
      if (!this.worldLook.indoorLabel) posText.setText(at);
      else posText.setText(`${at} | ${this.currentBuilding ? "Indoor" : "Outdoor"}`);
    };
    this.events.on("update", showPosition);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off("update", showPosition));
  }

  /**
   * The run's lighting (FS-2325V §C.7–§C.10): the light-map, lit by the barrow's
   * dark ambient, every declared light source in view and the player's torch; the
   * static vignette and dust above it. Presentation only: it reads and writes no
   * game state, and removing it changes nothing about how the game plays.
   */
  private createAtmosphere(): void {
    this.lightMap = new LightMap(this, this.worldLook.ambient);
    buildAtmosphere(this);
    // world effects over the baked fx sheets, lighting through the light-map (FS-KYPQ9 §B, §C)
    this.fx = new EffectsRuntime(this, this.art, this.lightMap);
    this.hits = new HitFeedback(this);
    this.shimmers = new ShimmerFx(this, this.art, this.lightMap);
    this.projectiles = new ProjectileFlights(this, this.art, this.fx, projectileFlightOf);
  }

  private showNotification(message: string, color: string): void {
    // Create notification text at top center of screen
    const notification = this.add.text(
      viewport.centerX,
      100,
      message,
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "20px",
        color: toCss(palette.hudText),
        backgroundColor: color,
        padding: { x: 20, y: 10 },
      },
    );
    notification.setOrigin(0.5);
    notification.setScrollFactor(0);
    notification.setDepth(2000);

    // Fade out and destroy after 3 seconds
    this.tweens.add({
      targets: notification,
      alpha: 0,
      duration: 2000,
      delay: 1000,
      onComplete: () => {
        notification.destroy();
      },
    });
  }

  /**
   * This player's level and experience bar, and the cue when the level rises (FS-BDA7X req 42,
   * 43). The level also feeds the item views' "Requires level N" hints (req 45).
   */
  private showProgress(player: PlayerState): void {
    const progress = progressOf(player);
    this.characterLevel = progress?.level;
    this.equipment?.setCharacterLevel(this.characterLevel);
    if (!progress) return;
    this.progressHud ??= new ProgressHud(this, PROGRESS_HUD_X, PROGRESS_HUD_Y);
    this.progressHud.show(progress);
  }

  /**
   * This player's Health and class resource bars (FS-8AY7S req 20–25) and the potion cell beside
   * them (FS-P9G8R R24): up while they are in the delve, down once they are out of it, and never
   * before their first state.
   */
  private showResourceBars(state: ClientGameState): void {
    this.resourceHud ??= new ResourceHud(this, RESOURCE_HUD_X, RESOURCE_HUD_Y);
    this.resourceHud.show(hudBars(state));
    // the potion cell is up exactly when the bars are (FS-P9G8R R24)
    this.potionHud ??= new PotionHud(this, this.art, POTION_HUD_X, RESOURCE_HUD_Y);
    this.potionHud.show(potionCell(state));
  }

  /**
   * This player's ability card (FS-8AY7S req 29–32), redrawn on every state and as the lockout
   * starts and ends: up while they are in the delve, grey while the ability cannot fire, down
   * whenever the dead spectator's leave button holds the bottom-right corner.
   */
  private showAbilityCard(): void {
    const state = this.lastGameState;
    if (!state) return;
    this.abilityHud ??= new AbilityHud(this, {
      anchor: "bottom-right",
      dx: -ABILITY_CARD_MARGIN,
      dy: -ABILITY_CARD_MARGIN,
    });
    this.abilityHud.show(
      abilityCard(state, {
        lockedOut: this.combat.lockedOut,
        leaveUp: this.leaveButton !== undefined,
      }),
    );
  }

  /**
   * Whether this player's movement keys send `move`: not once they are out of the delve
   * (FS-77AB6 req 17), and not while they watch through a teammate's eyes (FS-QPDKN §Edge
   * States "Spectating": the camera target is not the player).
   */
  private canSendMove(): boolean {
    return (
      !this.menu &&
      !resolved(this.lastGameState?.current_player) &&
      this.watchedPlayerId === undefined
    );
  }

  /**
   * What a resolved player sees (FS-QPDKN req 1–6, 11): the card while a teammate is still in
   * the delve and Watch has not been pressed; the watched player's view once it has. State keeps
   * rendering behind both. Once `end_game` has arrived, neither again.
   */
  private syncResolvedView(state: ClientGameState): void {
    if (this.runEnded) return;
    // an escaped player may leave the run, whether they watch or not (FS-GV8WN R25); once seen
    // escaped they stay so, even when the broadcast stops sending their own state
    if (state.current_player?.escape === true) this.canLeave = true;
    this.syncRow();
    if (this.watchedPlayerId !== undefined) {
      this.followWatched(state);
      return;
    }
    const view = resolvedView(state);
    // in play again (a reconnect's first state), or nobody left to watch: the end is coming
    if (!view) this.takeDownCard();
    else if (view.kind === "escaped") this.offerWatch();
    else if (!this.resolvedCard) this.showResolvedCard(view);
  }

  /** The dead player's card, or the escaped player's Watch button: whichever is up goes down. */
  private takeDownCard(): void {
    this.canWatch = false;
    this.syncRow();
    if (!this.resolvedCard) return;
    this.resolvedCard.destroy();
    this.resolvedCard = undefined;
    // the card's leave button went down with it
    this.leaveButton = undefined;
  }

  /**
   * The escaped player's view while a teammate is still in play (req 3, amended 2026-11-02): no
   * card, a Watch the delve button in the bottom-centre row, in the HUD band. The camera stays on
   * their own (hidden) body until it is pressed (req 4).
   */
  private offerWatch(): void {
    this.resolvedKind = "escaped";
    this.canWatch = true;
    this.syncRow();
  }

  /**
   * The card, the spectate HUD and the corner leave button go down together: `end_game`
   * (req 6, 12) carries the last word.
   */
  private takeDownResolvedView(): void {
    this.takeDownCard();
    this.spectateHud?.watching.destroy();
    this.spectateHud?.hint.destroy();
    this.spectateHud = undefined;
    this.leaveButton?.destroy();
    this.leaveButton = undefined;
    this.resolvedKind = undefined;
  }

  /**
   * The resolved player's card (req 1–5): a dark vellum panel with a brass hairline over the
   * run view, its copy by how they resolved, and the buttons under it. No backdrop: the delve
   * goes on behind it, visibly. The camera stays where it is until a button says otherwise.
   */
  private showResolvedCard(card: Extract<ResolvedView, { kind: "dead" }>): void {
    const cardW = 420;
    const cardH = 200;
    const panel = this.add.graphics();
    panel.fillStyle(palette.ink, 0.92);
    panel.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 10);
    panel.lineStyle(1, palette.frame, 0.6);
    panel.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 10);

    const title = this.add
      .text(0, -62, card.title, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "26px",
        color: toCss(palette.hudText),
        letterSpacing: 2,
      })
      .setOrigin(0.5);
    const body = this.add
      .text(0, -22, card.body, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "14px",
        color: toCss(palette.hudLabel),
        align: "center",
        wordWrap: { width: cardW - 48 },
      })
      .setOrigin(0.5);

    // one row of buttons, centred: Watch and Leave (req 2)
    const buttons: ButtonSpec[] = [this.watchSpec, this.leaveSpec];
    const made = buttons.map((button, i) => this.cardButton(button, i, buttons.length));

    this.resolvedKind = card.kind;
    this.resolvedCardView = card;
    this.resolvedCard = this.add
      .container(viewport.centerX, viewport.centerY, [panel, title, body, ...made.flatMap((b) => b.parts)])
      .setScrollFactor(0)
      .setDepth(RESOLVED_CARD_DEPTH);
    // hit areas live outside containers so pointer events work reliably; they go with the card
    const hits = made.map((b) => b.hit);
    this.resolvedCard.once("destroy", () => hits.forEach((hit) => hit.destroy()));
    const leaveAt = buttons.indexOf(this.leaveSpec);
    this.leaveButton = leaveAt < 0 ? undefined : made[leaveAt];
    this.leaveButton?.setEnabled(!this.leavePending);
  }

  /**
   * A card button: its face and label for the card's container, and its hit area for the scene.
   * Buttons sit in one row, `index` of `count`, under the card's copy.
   */
  private cardButton(
    button: ButtonSpec,
    index: number,
    count: number,
  ): WorldButton {
    const x = (index - (count - 1) / 2) * (BUTTON_W + BUTTON_GAP);
    const y = 50;
    return this.worldButton(button, { x, y }, { x: viewport.centerX, y: viewport.centerY }, RESOLVED_CARD_DEPTH + 1);
  }

  /**
   * A button in the world's amber (it can be acted on), bright on hover, dimmed while it cannot be
   * pressed: its face and label at `at`, drawn relative to `origin` (the container they will go
   * in, or the screen), and its hit area at the same place on the screen, at `hitDepth`.
   */
  private worldButton(
    button: ButtonSpec,
    at: { x: number; y: number },
    origin: { x: number; y: number },
    hitDepth: number,
  ): WorldButton {
    const face = this.add.graphics();
    let enabled = true;
    const paint = (fill: number) => {
      face.clear();
      face.fillStyle(fill, 1);
      face.fillRoundedRect(at.x - BUTTON_W / 2, at.y - BUTTON_H / 2, BUTTON_W, BUTTON_H, 6);
    };
    const rest = () => paint(enabled ? palette.interactable : palette.hudLabel);
    rest();
    const label = this.add
      .text(at.x, at.y, button.label, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "14px",
        color: toCss(palette.ink),
        fontStyle: "bold",
        letterSpacing: 3,
      })
      .setOrigin(0.5);
    const hit = this.add
      .rectangle(origin.x + at.x, origin.y + at.y, BUTTON_W, BUTTON_H, palette.inkDeep, 0)
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(hitDepth)
      .setName(button.name);
    hit.on("pointerover", () => enabled && paint(palette.interactableBright));
    hit.on("pointerout", rest);
    hit.on("pointerdown", () => enabled && button.onPress());
    return {
      parts: [face, label],
      hit,
      setEnabled: (on: boolean) => {
        enabled = on;
        if (on) hit.setInteractive({ useHandCursor: true });
        else hit.disableInteractive();
        rest();
      },
      destroy: () => {
        face.destroy();
        label.destroy();
        hit.destroy();
      },
    };
  }

  /**
   * One `drink_potion` (FS-P9G8R R27): the server picks the slot and heals, and the next state
   * shows both. Nothing is sent when there is nothing to drink or the player is out of the delve,
   * since the server would refuse it, and nothing is predicted here (R30).
   */
  private drinkPotion(): void {
    const me = this.lastGameState?.current_player;
    if (resolved(me) || healthPotionCount(me?.equipment) === 0) return;
    socketManager.sendMessage(ActionType.DrinkPotion, {});
  }

  /**
   * Leave the barrow (req 13, 14; FS-GV8WN R25 for the escaped): one `leave_run`, then nothing until
   * the server answers. The answer is a `world_entered(hub)`, applied as any other, or a refusal that
   * hands the button back.
   * The hub a Leave asks for is the player's choice, so an open settlement record does not hold it
   * (FS-GV8WN R23); once the run has ended, Leave only lets in a hub already held.
   */
  private leaveTheBarrow(): void {
    if (this.leavePending) return;
    // A held hub let in is the leave done: it goes through switchWorld, whose stop is synchronous,
    // so this scene has stopped (resetRun, runEnded false) by the time the release returns, and
    // nothing of it may be read or set after. Otherwise, once the run has ended there is nothing
    // to ask the server for.
    if (this.resultHold.release() || this.runEnded) return;
    this.leavePending = true;
    this.dimLeave();
    socketManager.sendMessage(ActionType.LeaveRun, {});
  }

  /**
   * The server refused the `leave_run` (req 14). Once the run has ended the player is already on
   * the way home: nothing to do (edge state "Leaving"). Otherwise the button comes back, and an
   * open record holds the town again.
   */
  private leaveRefused(): void {
    if (this.runEnded) return;
    this.leavePending = false;
    this.dimLeave();
    this.holdBehindRecord();
  }

  /** Whichever Leave stands, the dead player's or the row's, dimmed exactly while a leave is pending. */
  private dimLeave(): void {
    this.leaveButton?.setEnabled(!this.leavePending);
    this.row.leave?.setEnabled(!this.leavePending);
  }

  /**
   * The stride the keys ask for, sent each frame it is non-zero; none from a player out of the
   * delve (FS-77AB6 req 17). While the menu is open the keys are its (FS-9K8EZ req 5): a stride
   * it interrupts is stopped once, and nothing more goes until it closes.
   */
  private sendMovementIntent(vx: number, vy: number): void {
    // an archer drawing a Shadow Shot stands still the same way (FS-JTNPR req 9)
    if (this.menu || this.combat.aiming) {
      if (this.striding) socketManager.sendMessage(ActionType.Move, { vx: 0, vy: 0 });
      this.striding = false;
      return;
    }
    const moving = (vx !== 0 || vy !== 0) && this.canSendMove();
    if (moving) socketManager.sendMessage(ActionType.Move, { vx, vy });
    this.striding = moving;
  }

  /**
   * ESC and the menu's keys, read once a frame (FS-9K8EZ req 1). Closed, ESC opens the menu;
   * open, ESC goes back, Enter is the first row and a number is that row. Every key is read each
   * frame, so a press never lingers to answer the next one. Once the run has ended there is
   * nothing to open (edge state "Menu").
   */
  private offerMenu(): void {
    if (!this.dismissKey) return;
    const esc = Phaser.Input.Keyboard.JustDown(this.dismissKey);
    const confirm = this.confirmKey !== undefined && Phaser.Input.Keyboard.JustDown(this.confirmKey);
    const numbered = this.choiceKeys.map((k) => Phaser.Input.Keyboard.JustDown(k)).indexOf(true);
    // one ESC closes one thing: the gear and bag overlay before the menu opens (FS-HRH2J R5)
    if (esc && !this.menu && this.equipment?.hide()) return;
    if (this.runEnded) return;

    if (!this.menu) {
      if (esc) this.openMenu();
      return;
    }
    if (esc) this.menuChoices?.dismiss();
    else if (confirm) this.menuChoices?.confirm();
    else if (numbered >= 0) this.menuChoices?.pick(numbered);
  }

  /**
   * The player's state as the menu reads it (FS-9K8EZ req 2), from the last state unless one is
   * given. A player the server no longer lists is out of the delve. Dead and escaped are one
   * state here: both may leave (FS-GV8WN R16).
   */
  private menuState(state = this.lastGameState): MenuState {
    const me = state?.current_player;
    return { resolved: me === null || resolved(me) };
  }

  /**
   * The run's ESC menu (FS-9K8EZ req 2): built from the player's state as it opens, so what it
   * offers is runMenuChoices' rule, not the chrome's. Leave the barrow is the card's own path
   * (FS-QPDKN req 13), so the two entry points share one send and one pending flag.
   */
  private openMenu(): void {
    // closing the menu does not resume the hold (FS-JTNPR req 15)
    this.cancelAim();
    const state = this.menuState();
    this.showMenuPanel(undefined, runMenuChoices(state), {
      actions: {
        fall: () => this.openFallConfirm(),
        leave: () => {
          this.leaveTheBarrow();
          this.closeMenu();
        },
      },
      enabled: { leave: () => !this.leavePending },
    });
    this.menuFor = state;
  }

  /** Fall where you stand asks once (req 3): the menu's rows become the confirm, nothing sent yet. */
  private openFallConfirm(): void {
    const state = this.menuState();
    this.showMenuPanel(FALL_CONFIRM.line, FALL_CONFIRM.choices, {
      actions: { "fall-now": () => this.fallWhereYouStand() },
      enabled: { "fall-now": () => !this.fallPending },
    });
    this.menuFor = state;
  }

  /**
   * Fall (req 3, 4): one `forfeit_run`, then nothing until the server answers. The answer is the
   * next state with this player at 0 health, seen through FS-QPDKN's card as any death, or a
   * refusal that hands Fall back. The confirm stays up, Fall dimmed, until either.
   */
  private fallWhereYouStand(): void {
    if (this.fallPending || this.menuState().resolved) return;
    this.fallPending = true;
    this.menuChoices?.retone();
    socketManager.sendMessage(ActionType.ForfeitRun, {});
  }

  /** The server refused the `forfeit_run` (req 4): Fall again, and the reason in passing. */
  private fallRefused(info: { message?: string }): void {
    this.fallPending = false;
    this.menuChoices?.retone();
    if (this.runEnded) return;
    this.showNotification(info.message ?? "The barrow will not take you yet.", toCss(palette.hudPanel));
  }

  /**
   * The menu yields to what the server says (req 6): a state in which the player's rows would
   * be wrong (newly dead, newly out) takes the menu and its confirm down, so the card that
   * follows is never covered. A death seen is a `forfeit_run` answered.
   */
  private yieldMenu(state: ClientGameState): void {
    const now = this.menuState(state);
    if (now.resolved) this.fallPending = false;
    if (!this.menu || !this.menuFor) return;
    if (now.resolved !== this.menuFor.resolved) this.closeMenu();
  }

  /**
   * The menu's panel (req 1): the shared chrome at the camera's centre, built from the run's
   * tokens, with an optional line over the rows and one row per choice. Any row without an
   * action of its own closes the menu; a dimmed row neither brightens nor answers (req 8).
   */
  private showMenuPanel(
    line: string | undefined,
    choices: RunMenuChoice[],
    spec: {
      actions: Partial<Record<RunMenuChoice["id"], () => void>>;
      enabled: Partial<Record<RunMenuChoice["id"], () => boolean>>;
    },
  ): void {
    this.closeMenu();
    const { container, keys, moveTo } = showMenuPanel(this, {
      line,
      choices,
      actions: spec.actions,
      enabled: spec.enabled,
      close: () => this.closeMenu(),
      origin: { x: viewport.centerX, y: viewport.centerY },
      hit: MENU_CHOICE_HIT,
      tones: MENU_TONES,
    });
    this.menuChoices = keys;
    this.menu = container;
    this.moveMenu = moveTo;
  }

  /** The menu or its confirm goes down, hit areas with it; nothing is sent (req 1, 3). */
  private closeMenu(): void {
    this.menu?.destroy();
    this.menu = undefined;
    this.menuChoices = undefined;
    this.moveMenu = undefined;
    this.menuFor = undefined;
  }

  /**
   * The dead spectator's leave button (req 10): its own corner of the screen, in the HUD band,
   * clear of the watched player at the centre and the HUD along the top. The escaped have none.
   */
  private placeLeaveInCorner(): void {
    if (this.resolvedKind !== "dead" || this.leaveButton) return;
    const at = anchorAt({
      anchor: "bottom-right",
      dx: -LEAVE_BUTTON_MARGIN - BUTTON_W / 2,
      dy: -LEAVE_BUTTON_MARGIN - BUTTON_H / 2,
    });
    this.leaveButton = this.hudButton(this.leaveSpec, at, LEAVE_BUTTON_DEPTH);
    this.leaveButton.setEnabled(!this.leavePending);
    // the corner is the button's now (FS-8AY7S req 32)
    this.showAbilityCard();
  }

  /** A button fixed to the screen at `at`, in a HUD depth band: its hit area just over its face. */
  private hudButton(button: ButtonSpec, at: { x: number; y: number }, depth: number): WorldButton {
    const made = this.worldButton(button, at, { x: 0, y: 0 }, depth + 1);
    made.parts.forEach((part) => part.setScrollFactor(0).setDepth(depth));
    return made;
  }

  /**
   * Watch the delve (req 7): the card goes down and the camera takes a teammate still in play.
   * With nobody left there is nothing to watch; the end is on its way.
   */
  private startWatching(): void {
    if (!this.lastGameState || this.watchedPlayerId !== undefined) return;
    const first = nextWatched(watchable(this.lastGameState));
    if (first === undefined) return;
    this.takeDownCard();
    this.placeLeaveInCorner();
    this.watchedPlayerId = first;
    this.followWatched(this.lastGameState);
  }

  /** Tab (req 8): the next teammate still in play, round to the first. Nothing while the card is up. */
  private cycleWatched(): void {
    if (this.watchedPlayerId === undefined || !this.lastGameState) return;
    const next = nextWatched(watchable(this.lastGameState), this.watchedPlayerId);
    if (next === undefined) return;
    this.watchedPlayerId = next;
    this.followWatched(this.lastGameState);
  }

  /**
   * The camera on the watched player and the HUD naming them (req 9); on to another teammate
   * in play once they resolve (req 11). With nobody left the camera stays where it is: the run
   * ends on the server's next tick.
   */
  private followWatched(state: ClientGameState): void {
    const inPlay = watchable(state);
    const current = inPlay.find((w) => w.id === this.watchedPlayerId);
    const watched = current ?? inPlay.find((w) => w.id === nextWatched(inPlay, this.watchedPlayerId));
    if (!watched) return;
    this.watchedPlayerId = watched.id;
    // followWith snaps the camera onto its target each time it is called, so it is called
    // once per sprite: on a new watched player, or on theirs appearing after a tick without it
    const sprite = this.otherPlayers.get(watched.id);
    if (sprite && sprite !== this.followedSprite) {
      followWith(this.cameras.main, sprite);
      this.followedSprite = sprite;
    }
    this.showSpectateHud(watched.username);
  }

  /** "Watching <name>" and the Tab hint, neutral HUD: vellum on the HUD panel, no amber (req 9). */
  private showSpectateHud(name: string): void {
    const watching = `Watching ${name}`;
    if (this.spectateHud) {
      this.spectateHud.watching.setText(watching);
      return;
    }
    const style = {
      fontFamily: CANVAS_FONT.body,
      fontSize: "14px",
      color: toCss(palette.hudText),
      backgroundColor: toCss(palette.hudPanel),
      padding: { x: 10, y: 5 },
    };
    const x = viewport.centerX;
    const watchingText = this.add
      .text(x, SPECTATE_HUD_Y, watching, style)
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    const hint = this.add
      .text(x, SPECTATE_HUD_Y + 30, "Tab: next player", { ...style, fontSize: "12px" })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    this.spectateHud = { watching: watchingText, hint };
  }

  /**
   * 檢測逃生門和開關的狀態變化，並顯示對應通知
   * 避免重複通知：只在狀態真正改變時才顯示
   */
  private checkEscapeDoorStateChanges(state: ClientGameState): void {
    // 檢查是否有逃生門資料
    const escapeDoor = state.escape_doors?.[0];
    if (!escapeDoor) return;

    // 檢查開關是否被激活 → 逃生門解鎖
    const switchData = state.switches?.[0];
    if (switchData) {
      // 開關剛被激活（從 false/null 變成 true）
      if (
        switchData.is_activated === true &&
        this.previousSwitchActivated !== true
      ) {
        this.showNotification(
          "Exit door unlocked! Run to escape!",
          toCss(palette.safe),
        );
      }
      this.previousSwitchActivated = switchData.is_activated;
    }

    // 檢查逃生門是否被打開
    if (escapeDoor.is_open === true && this.previousEscapeDoorOpened !== true) {
      this.showNotification("Escape door opened!", toCss(palette.safe));
    }
    this.previousEscapeDoorOpened = escapeDoor.is_open;
  }

  /**
   * 檢測玩家是否逃脫成功
   * 後端會設置 player.escape = true
   */
  private checkPlayerEscapedState(state: ClientGameState): void {
    // 檢查當前玩家
    if (state.current_player?.escape === true && state.current_player.id) {
      if (!this.escapedPlayers.has(state.current_player.id)) {
        this.showNotification(
          `${state.current_player.username} escaped successfully!`,
          toCss(palette.frameBright), // 金色
        );
        this.escapedPlayers.add(state.current_player.id);
      }
    }

    // 檢查其他玩家
    state.other_players?.forEach((player) => {
      if (player.escape === true && player.id) {
        if (!this.escapedPlayers.has(player.id)) {
          this.showNotification(
            `${player.username} escaped successfully!`,
            toCss(palette.frameBright),
          );
          this.escapedPlayers.add(player.id);
        }
      }
    });
  }

  destroy(): void {
    // Clean up subscriptions when scene is destroyed
    if (this.gameStateUnsubscribe) {
      this.gameStateUnsubscribe();
      GameStateLogger.logConnectionStatus(
        "Scene shutting down",
        toCss(palette.hudLabel),
      );
    }

    // 重置狀態追蹤
    this.previousEscapeDoorOpened = null;
    this.previousSwitchActivated = null;
    this.escapedPlayers.clear();
  }

  /**
   * Restamp the light-map and ease the occluders, once per frame. The player's
   * torch rides on the player's drawn position; once they have escaped or died
   * there is no light to carry, and the pool fades out.
   */
  private updateLighting(time: number, delta: number): void {
    const self = this.player?.visible ? this.player : undefined;
    this.lightMap?.carry(self ? { x: self.x, y: self.y } : null);
    this.showNearChunks();
    this.lightMap?.update(time);
    this.occluders.update(self ? { bounds: self.getBounds(), depth: self.depth } : null, delta);
  }

  update(time: number, delta: number): void {
    this.updateLighting(time, delta);
    this.monsters?.update(delta);
    // the menu's keys, read before anything else is: it opens over every state (FS-9K8EZ req 1, 2)
    this.offerMenu();

    // skip all input/movement if player has escaped
    if (this.player && !this.player.visible) {
      // still update other players smoothly, and keep hiding what stands in the rooms
      this.updateOtherPlayersSmooth(time, delta);
      this.followMapOverlay();
      this.checkBuildingStatus();
      this.updateTargetFrame(delta);
      return;
    }

    // handle movement
    let vx = 0;
    let vy = 0;

    // calculate horizontal direction
    if (this.cursors.left.isDown || this.wasd.left.isDown) {
      vx = -1;
    } else if (this.cursors.right.isDown || this.wasd.right.isDown) {
      vx = 1;
    }

    // calculate vertical direction
    if (this.cursors.up.isDown || this.wasd.up.isDown) {
      vy = -1;
    } else if (this.cursors.down.isDown || this.wasd.down.isDown) {
      vy = 1;
    }
    // the keys are the menu's while it is open (FS-9K8EZ req 5), and read as released while an
    // archer draws a Shadow Shot (FS-JTNPR req 9)
    if (this.menu || this.combat.aiming) {
      vx = 0;
      vy = 0;
    }

    // update player facing and legs: the placeholder rig (a baked sheet plays below)
    if (this.player && this.playerLegs && !this.playerAnim?.baked) {
      const isMoving = vx !== 0 || vy !== 0;
      // an archer drawing a Shadow Shot stands turned to the cursor instead (FS-JTNPR req 10)
      const cursor = this.combat.aiming && this.playerPos ? this.cursorWorld() : undefined;
      const turn = cursor && this.playerPos
        ? { x: cursor.x - this.playerPos.x, y: cursor.y - this.playerPos.y }
        : isMoving ? { x: vx, y: vy } : undefined;
      if (turn) {
        // 8-way facing from the world velocity the player is asking for; the
        // input itself is sent unchanged below (ADR-0020 §4)
        const newFacing = facingFrom(turn.x, turn.y, this.playerFacing);
        if (newFacing !== this.playerFacing) {
          this.playerFacing = newFacing;
          this.player.setTexture(this.facingTexture(this.playerTexturePrefix, newFacing));
        }
      }
      if (isMoving) this.walkPhase += 0.3;
      this.drawLegs(
        this.playerLegs,
        this.player.x,
        this.player.y,
        this.playerFacing,
        this.walkPhase,
        isMoving,
        palette.hudLabel,
      );
    }

    // update player name position; none over a baked corpse
    const ownBase = this.ownMarkerBase();
    if (this.player && this.playerNameText) {
      if (ownBase !== null) this.playerNameText.setPosition(this.player.x, ownBase - NAME_GAP);
      this.playerNameText.setVisible(this.player.visible && ownBase !== null);
    }

    this.sendMovementIntent(vx, vy);

    // 平滑移動到目標位置 (lerp)
    const lerpFactor = 0.3; // 0-1，越大越快到達目標

    // eased in world space, then drawn at the projection
    if (this.player && this.playerPos && this.targetPosition) {
      this.playerPos.x = Phaser.Math.Linear(
        this.playerPos.x,
        this.targetPosition.x,
        lerpFactor,
      );
      this.playerPos.y = Phaser.Math.Linear(
        this.playerPos.y,
        this.targetPosition.y,
        lerpFactor,
      );
      standAt(this.player, this.playerPos, 1);
      this.playerLegs?.setDepth(worldDepth(this.playerPos.x, this.playerPos.y, 2));
      // the charge's dust is kicked where the body is drawn, never where it is predicted to land
      this.charge?.follow(this.playerPos);
      // the stance never roots the merc: the tell and the flash ride on the body (FS-MAMHR §C.13)
      this.kit.follow(this.playerPos, this.time.now);
      // the heal shimmer is carried with the body (FS-KZC92 R23)
      this.shimmers?.follow(this.playerPos);
    }

    // an archer's hold follows the body just drawn and the cursor now (FS-JTNPR req 10, 11)
    this.aimFrame();

    // the baked sheet plays what the player is doing, read off the position just drawn
    if (this.player && this.playerPos && this.playerAnim?.baked) {
      const dead = isDead(this.lastGameState?.current_player);
      if (!dead) this.deathDust.alive(this.player);
      // the merc's guard clip holds while his stance does (FS-MAMHR §G.35)
      this.playerAnim.guard(this.kit.guarding, this.time.now);
      this.playerAnim.show(this.player, this.playerAnim.step(this.playerPos, time, delta, dead));
    }

    this.updateOtherPlayersSmooth(time, delta);
    // the map overlay on the figure just drawn (FS-1SEF0 §C.14)
    this.followMapOverlay();

    // 檢查是否進入/離開建築
    this.checkBuildingStatus();
    this.updateTargetFrame(delta);

    // the open bar fills on between states (FS-MQYEX R22)
    this.drawTimedOpen();

    // 檢查寶箱距離，太遠自動關閉. A reach that waits on the server is judged by the states (FS-MQYEX R26)
    if (this.containerView.isOpen) {
      this.checkChestDistance();
    }
  }

  private updateOtherPlayersSmooth(time: number, delta: number): void {
    const lerpFactor = 0.3;
    this.otherPlayers.forEach((sprite, playerId) => {
      const target = this.otherPlayersTargets.get(playerId);
      const pos = this.otherPlayersPos.get(playerId);
      if (target && pos) {
        const prevX = pos.x;
        const prevY = pos.y;

        // eased in world space, then drawn at the projection
        pos.x = Phaser.Math.Linear(pos.x, target.x, lerpFactor);
        pos.y = Phaser.Math.Linear(pos.y, target.y, lerpFactor);
        standAt(sprite, pos, 1);

        // A rival on a baked sheet walks, idles and dies in it, off the position just
        // drawn. Their attacks are not known to this client, so they never swing.
        const anim = this.otherPlayersAnim.get(playerId);
        const dead = (this.otherPlayersPrevHp.get(playerId) ?? 1) <= 0;
        if (!dead) this.deathDust.alive(sprite);
        if (anim?.baked) anim.show(sprite, anim.step(pos, time, delta, dead));

        // update facing and legs for other players: the placeholder rig
        const legs = this.otherPlayersLegs.get(playerId);
        if (legs && !anim?.baked) {
          const deltaX = target.x - prevX;
          const deltaY = target.y - prevY;
          const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          const isMoving = length > 0.5;
          legs.setDepth(worldDepth(pos.x, pos.y, 2));

          if (isMoving) {
            const prevFacing = this.otherPlayersFacing.get(playerId) || "se";
            const newFacing = facingFrom(deltaX, deltaY, prevFacing);
            if (newFacing !== prevFacing) {
              this.otherPlayersFacing.set(playerId, newFacing);
              const cls = this.otherPlayersClass.get(playerId) || "warrior";
              sprite.setTexture(this.facingTexture("other_" + cls, newFacing));
            }
            const phase = (this.otherPlayersWalkPhase.get(playerId) || 0) + 0.3;
            this.otherPlayersWalkPhase.set(playerId, phase);
          }

          const facing = this.otherPlayersFacing.get(playerId) || "se";
          const phase = this.otherPlayersWalkPhase.get(playerId) || 0;
          this.drawLegs(
            legs,
            sprite.x,
            sprite.y,
            facing,
            phase,
            isMoving,
            palette.hudLabel,
          );
        }

        this.markTeammate(playerId);
      }
    });
  }

  /**
   * Another player's markers where their figure now stands: their name, always (FS-CH21F R13),
   * at the marker base, or over their health bar (FS-8AY7S req 27) when that is switched on.
   * Neither over a baked corpse.
   */
  private markTeammate(playerId: string): void {
    const sprite = this.otherPlayers.get(playerId);
    if (!sprite) return;
    const dead = (this.otherPlayersPrevHp.get(playerId) ?? 1) <= 0;
    const anim = this.otherPlayersAnim.get(playerId);
    const base = markerBase(sprite, anim?.crown, dead, anim?.artScale);
    // the switch alone decides, not whether a bar happens to be in the map
    const bar = this.showTeammateBars ? this.teammateHealthBars.get(playerId) : undefined;
    const barTop = bar ? this.drawTeammateBar(bar, sprite.x, base) : null;

    const nameText = this.otherPlayersNameTexts.get(playerId);
    if (nameText) {
      if (barTop !== null) nameText.setPosition(sprite.x, barTop - 1 - NAME_OVER_BAR_GAP);
      else if (base !== null) nameText.setPosition(sprite.x, base - NAME_GAP);
      nameText.setVisible(base !== null);
    }
  }

  /**
   * One teammate's health bar over `base` (their marker base), in the monsters' overhead style:
   * a pitch backing with a barrow rim, and the health fill. Returns the bar's top, or null when
   * none is drawn.
   */
  private drawTeammateBar(bar: TeammateBar, x: number, base: number | null): number | null {
    const g = bar.graphics;
    g.clear();
    if (base === null || bar.fill === null) return null;

    const { width, height, gap } = TEAMMATE_BAR;
    const top = Math.round(base - gap - height);
    const left = Math.round(x - width / 2);
    g.fillStyle(MARKER_BAR.backing, 0.9);
    g.fillRect(left - 1, top - 1, width + 2, height + 2);
    g.lineStyle(1, MARKER_BAR.rim, 0.9);
    g.strokeRect(left - 1, top - 1, width + 2, height + 2);
    g.fillStyle(MARKER_BAR.hp, 1);
    g.fillRect(left, top, Math.round(width * bar.fill), height);
    return top;
  }

  // private connectWebSocket(): void {
  //   this.socket = new WebSocket("ws://localhost:5668/game/ws");

  //   this.socket.onopen = () => {
  //     console.log("WebSocket connected");
  //     this.updateStatus("WebSocket Connected", toCss(palette.safe));
  //   };

  //   this.socket.onerror = (error) => {
  //     console.error("WebSocket error:", error);
  //     this.updateStatus("WebSocket Error", toCss(palette.damageBright));
  //   };

  //   this.socket.onclose = () => {
  //     console.log("WebSocket disconnected");
  //     this.updateStatus("WebSocket Disconnected", toCss(palette.torchCore));
  //   };

  //   this.socket.onmessage = (event) => {
  //     try {
  //       const data = JSON.parse(event.data);
  //       console.log("Received server message:", data);
  //     } catch (e) {
  //       console.error("Failed to parse message:", e);
  //     }
  //   };
  // }
  // websocket send message
  // sendMessage<T extends keyof ActionMap>(
  //   action: T,
  //   payload: ActionMap[T],
  // ): void {
  //   if (this.socket && this.socket.readyState === WebSocket.OPEN) {
  //     const message: ClientMessage<T> = {
  //       action,
  //       payload,
  //       seq: ++this.seq,
  //     };
  //     this.socket.send(JSON.stringify(message));
  //   }
  // }
}
