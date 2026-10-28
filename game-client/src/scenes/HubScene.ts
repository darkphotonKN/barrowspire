import * as Phaser from "phaser";
import { createAtmosphere } from "@/utils/atmosphere";
import { ActionType } from "@/assets/types/client";
import { useGameStore } from "@/stores/gameStore";
import { CANVAS_FONT, palette, shade, toCss } from "@/utils/canvasPalette";
import { socketManager } from "@/utils/class/SocketManager";
import {
  ClientGameState,
  NPCState,
  PlayerState,
  WallState,
} from "@/types/gameState";
import { BARROW_HEX } from "@/utils/theme";
import { ProgressHud } from "@/ui/ProgressHud";
import { MENU_DEPTH, menuOption, showMenuPanel, type MenuKeys, type MenuTones } from "@/ui/menuPanel";
import { progressOf } from "@/ui/progress";
import {
  ensureCharacterTextures,
  ensureVillagerTexture,
  drawDelverLegs,
  type Facing,
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
import type { ArtLibrary } from "@/render/art/library";
import { CharacterAnimator } from "@/render/art/character";
import { folkLook } from "@/render/art/hubFolk";
import { AMBIENT, LightMap } from "@/render/lighting";
import { cursorCss, cursorSource } from "@/render/cursors";
// the effects module has no barrel: its runtime and smoke are imported by path
import { EffectsRuntime } from "@/render/effects/runtime";
import { ChimneySmoke } from "@/render/effects/smoke";
import { MARKER_DEPTH, markerBase } from "@/render/markers";
import {
  GroundLayer,
  Occluders,
  addProp,
  addRoof,
  addWalls,
  housesFrom,
  insideHouse,
  tileHash,
  worldSeed,
  type House,
} from "@/render/world";
import {
  HUB_CARTS,
  HUB_CRATES,
  HUB_DRESSING,
  HUB_FENCES,
  HUB_HEARTH,
  HUB_PATHS,
  HUB_STALLS,
  HUB_WASHING_LINE,
  HUB_WELL,
  fenceSegments,
  type PropSpot,
} from "@/render/world/hubKeepOut";
import { planChimney } from "@/render/world/roofs";
import { trimCrop } from "@/render/world/walls";

/** Falls back to the warrior when a class is missing or unrecognised. */
function textureFor(playerClass: string | undefined, facing: Facing): string {
  const known = ["warrior", "mage", "archer"];
  const cls = (playerClass ?? "").toLowerCase();

  return `preview_${known.includes(cls) ? cls : "warrior"}_${facing}`;
}

/** Moves a world position a step toward its target. */
function easeToward(pos: Point, target: Point): void {
  pos.x = Phaser.Math.Linear(pos.x, target.x, POSITION_LERP);
  pos.y = Phaser.Math.Linear(pos.y, target.y, POSITION_LERP);
}

const HUB_WIDTH = 2000;
const HUB_HEIGHT = 1000;
/** Screen px of dark beyond the projected diamond the camera may show at the map edge. */
const CAMERA_MARGIN = 64;
/**
 * Screen px from a delver's marker base (`markerBase`: a baked head, or the preview's frame top)
 * to the middle of their name label: a 60 px preview centred on the footprint keeps its label at
 * -34, where it always was.
 */
const NAME_GAP = 4;
/** How hard sprites chase the server's position each frame. Matches the run scene. */
const POSITION_LERP = 0.3;
/** Screen px from the top-left corner to the level and experience bar. */
const HUD_INSET = 16;
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
/*
 * The well, market stalls, carts, crates, fences and the new dressing stand at the fixed spots in
 * render/world/hubKeepOut.ts, every one clear of the walking ground (FS-KYPQ9 §A.3–§A.5).
 */
/** Lamp posts along the paths: the hub's lit places after dusk (FS-2325V §C.7). */
const LAMP_POSTS: [number, number][] = [
  [930, 490],
  [1090, 490],
  [690, 650],
  [1390, 650],
];
/** Trodden ground, joining the spawn to the people worth walking to. */
const PATHS = HUB_PATHS;
const TREES: [number, number][] = [
  [430, 300], [500, 360], [1420, 260], [1500, 330], [1470, 205],
  [180, 820], [260, 880], [1900, 600], [1900, 780], [560, 900],
  [700, 760], [1180, 880],
];
const GRASS: [number, number][] = [
  [560, 520], [640, 700], [820, 480], [880, 820], [1120, 500],
  [1240, 700], [1320, 560], [760, 600], [980, 880], [1400, 780],
  [160, 600], [1880, 480], [520, 780], [1000, 300], [900, 660],
];

/** The baked trees the hub's tree spots choose between, by a hash of the spot. */
const TREE_SHEETS = ["tree_oak", "tree_pine", "tree_oak_autumn"];
/** Seeds the hub's scenery variant picks, so every client plants the same trees. */
const SCENERY_SEED = 0x5343_4e31;

/** How close a delver stands to talk. Matches the server's NPCInteractRange. */
const NPC_TALK_RANGE = 80;

/** Screen px between the queue panel and its Leave button. */
const LEAVE_GAP = 8;
/** A passing notice: where it sits (screen px from the top, under the progress bar) and for how long. */
const NOTICE_Y = 72;
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

/** One line of the hub's ESC menu (FS-G4VMQ §Requirements 3). */
export interface HubMenuChoice {
  id: "change" | "leave" | "back";
  label: string;
  /** Amber for a thing the delver can do, the cancel register for going back. */
  register: "actionable" | "cancel";
}

/**
 * What the ESC menu offers, from the scene's state at the moment it opens: the way to the main
 * menu and the way back into the hub always; leaving the queue only while there is a queue to
 * leave. The menu never names the hub ("hub" has no lore name), so it says who, not where.
 */
export function hubMenuChoices(state: { queued: boolean }): HubMenuChoice[] {
  const choices: HubMenuChoice[] = [
    { id: "change", label: "Change who you are", register: "actionable" },
  ];
  if (state.queued) choices.push({ id: "leave", label: "Leave the queue", register: "actionable" });
  choices.push({ id: "back", label: "Back  [Esc]", register: "cancel" });
  return choices;
}

/** What the hub knows that a dialogue reads: at opening, and live while it is up. */
interface HubState {
  queued: boolean;
}

/** One choice in an NPC's dialogue (FS-NSV3D §Requirements 3). */
export interface DialogueChoice {
  id: string;
  label: string;
  /** Amber for a thing the delver can do, the cancel register for closing the box. */
  register: "actionable" | "cancel";
  /** What picking it does; without one, picking it only closes the dialogue. */
  act?: (scene: HubScene) => void;
  /** The dialogue stays up after the pick: a reply is being waited for. */
  stays?: boolean;
  /** Whether it can be picked now, read live each time it is drawn or pressed; omitted means always. */
  enabled?: (state: { soloPending: boolean }) => boolean;
}

/** What an NPC says and offers: a line and its choices, any number of them. */
export interface Dialogue {
  line: string;
  choices: DialogueChoice[];
}

/**
 * What the keeper of the way offers, from the hub's state as the dialogue opens (FS-NSV3D
 * §Requirements 1, 2, 4): alone, with company, or not yet. While the delver is already queued
 * there is nothing to offer but the fact, so the dialogue says so and closes; the panel carries
 * the count. The one warning is the keeper's line: descending alone takes no second asking.
 */
export function delveChoices(state: HubState): Dialogue {
  if (state.queued) {
    return {
      line: "The delve is gathering. Wait, or leave the queue.",
      choices: [{ id: "dismiss", label: "I'll wait", register: "cancel" }],
    };
  }
  return {
    line: "I keep the way into the Spire. Few return whole,\nand fewer return twice. Still set on descending?",
    choices: [
      {
        id: "solo",
        label: "Descend alone",
        register: "actionable",
        act: (scene) => scene.startSolo(),
        stays: true,
        enabled: ({ soloPending }) => !soloPending,
      },
      { id: "queue", label: "Wait for company", register: "actionable", act: (scene) => scene.joinQueue() },
      { id: "dismiss", label: "Not yet", register: "cancel" },
    ],
  };
}

/**
 * What a resident says when spoken to. They open nothing — the point is that a
 * delver never has to wonder whether an NPC is broken.
 */
const RESIDENT_LINES = [
  "The Spire took my brother's whole company.\nWe do not speak of it.",
  "Torches burn shorter down there. Mind that.",
  "You have the look of one who is going anyway.",
  "Quiet season. Fewer coming back to spend.",
];

/**
 * What each function NPC says and offers, from the hub's state as they are spoken to.
 *
 * The dialogue itself is one shape — a line and a row of choices — so adding an NPC, or a
 * choice, is adding to this table, not another branch in the scene. An NPC missing from
 * it is an ambient resident, who has a line and nothing to offer.
 */
const NPC_DIALOGUE: Record<string, (state: HubState) => Dialogue> = {
  delve: delveChoices,
  storekeeper: () => ({
    line: "Steel rusts, and the barrow keeps what it takes.\nSee to your gear before you go down.",
    choices: [
      { id: "pack", label: "Open pack", register: "actionable", act: (scene) => scene.openLoadout() },
      { id: "later", label: "Later", register: "cancel" },
    ],
  }),
};

/** Screen px between the centres of neighbouring dialogue choices. */
const CHOICE_SPACING = 180;

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
 * One delver as the scene sees them.
 *
 * The pieces are kept together because they live and die together: a delver who
 * leaves takes their sprite, their legs and their stride with them, and keeping
 * that as one entry means removal cannot half-happen.
 */
interface DelverView {
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
  target: Point;
  /** Eased world position, as for delvers. */
  pos: Point;
  facing: Facing8;
  /**
   * Their baked sheet (FS-2325V §G), played like a delver's. When it is not `baked`, the
   * placeholder textures below stand in.
   */
  anim: CharacterAnimator;
  /** The placeholder villager texture, which turns by swapping facings; unset otherwise. */
  texture?: string;
}

/**
 * The hub: the shared world delvers occupy between runs.
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

  /** Everything the scene knows about one delver, keyed by entity id. */
  private views = new Map<string, DelverView>();
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
   * treatment delvers get. Function NPCs never move, so their target simply
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
  };
  /** 1, 2, 3: one per actionable choice when a dialogue offers more than one. */
  private choiceKeys: Phaser.Input.Keyboard.Key[] = [];
  private confirmKey?: Phaser.Input.Keyboard.Key;
  private dismissKey?: Phaser.Input.Keyboard.Key;
  private interactKey?: Phaser.Input.Keyboard.Key;
  /** The ESC menu while it is open (FS-G4VMQ §Requirements 1–5). It owns the keyboard. */
  private menu?: Phaser.GameObjects.Container;
  /** The open menu's choices by key: the n-th actionable one, and the first on Enter. */
  private menuChoices?: MenuKeys;
  /** Shown while queued, wherever the delver walks. */
  private queuePanel?: Phaser.GameObjects.Text;
  /** Beside the panel while queued: the way out of the queue (FS-G4VMQ §Requirements 15). */
  private leaveButton?: Phaser.GameObjects.Text;
  /**
   * Whether this client is in the queue (FS-G4VMQ §Requirements 11): set by a find_game reply or
   * any queue_status, cleared when the server says the delver is out or the join failed.
   */
  private queued = false;
  /** A leave_queue has been sent and its reply has not come (§Requirements 12). */
  private leavePending = false;
  /** A start_solo has been sent and its reply has not come (FS-NSV3D §Requirements 2). */
  private soloPending = false;
  /**
   * The delver's level and experience bar (FS-BDA7X req 42), top-left, clear of the queue panel
   * at the bottom. Made with the first state that carries a level.
   */
  private progressHud?: ProgressHud;
  /** Baked art (FS-2325V §B.6); an empty library draws placeholders. */
  private art!: ArtLibrary;
  /** Baked ground, when the manifest has it; otherwise the placeholder floor. */
  private groundLayer?: GroundLayer;
  /** FS-2325V §C.7: carries the delver's torch, replacing the overlay pool. */
  private lightMap?: LightMap;
  /** World effects over the baked fx sheets (FS-KYPQ9 §B): the chimneys' smoke. */
  private fx?: EffectsRuntime;
  private occluders = new Occluders();
  /**
   * Each house's roof, hidden while the delver stands inside it (FS-2325V §C.3). `baked` is
   * false for the placeholder roof drawn without roof art, which carries no chimney.
   */
  private roofs: {
    house: House;
    baked: boolean;
    parts: { setVisible(visible: boolean): unknown }[];
  }[] = [];
  private insideRoof?: House;
  private unsubscribeQueue?: () => void;

  private unsubscribeState?: () => void;
  private lastSent = { vx: 0, vy: 0 };

  constructor() {
    super({ key: "HubScene" });
  }

  preload(): void {
    // baked world and prop art (FS-2325V §B.6)
    preloadArt(this);
  }

  create(): void {
    // Clamped in projected space: the camera sees the diamond, and the dark beyond
    // its corners is the background colour. FS-2325V §A.3, §A.7.
    const bounds = projectedBounds(HUB_WIDTH, HUB_HEIGHT, CAMERA_MARGIN);
    this.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    this.cameras.main.setBackgroundColor(BARROW_HEX.pitch);

    ensureCharacterTextures(this);
    this.art = registerArt(this);
    this.occluders = new Occluders();
    // The run's gauntlet, so hub and run share one pointer (FS-KYPQ9 §H.3); the browser's
    // `default` without its sheet. Nothing hostile here, so no strike-mark.
    this.input.setDefaultCursor(
      cursorCss("cursor_gauntlet", "default", cursorSource(this.art, this.textures)),
    );

    // Baked ground with dirt paths when the manifest has it (FS-2325V §C.1).
    this.groundLayer = GroundLayer.available(this.art, "hub")
      ? new GroundLayer(this, this.art, {
          width: HUB_WIDTH,
          height: HUB_HEIGHT,
          kind: "hub",
          paths: PATHS.map(([x, y, width, height]) => ({ x, y, width, height })),
        })
      : undefined;
    if (!this.groundLayer) this.drawGround();
    this.bindInput();

    // Lit like a run, in warm dusk rather than barrow dark (FS-2325V §C.8): the
    // light-map with the delver's torch, then the vignette and dust above it.
    const lightMap = new LightMap(this, AMBIENT.hub);
    this.lightMap = lightMap;
    createAtmosphere(this);
    // under the light-map like everything in the world (FS-KYPQ9 §A.6, §B.8)
    this.fx = new EffectsRuntime(this, this.art, lightMap);

    this.unsubscribeState = socketManager.onGameStateUpdate((state) =>
      this.renderState(state),
    );

    this.listenForQueue();

    // DESTROY too: tearing the game down while in the hub (the page unmounts) skips SHUTDOWN.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.release, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.release, this);
  }

  /**
   * What the queue tells this client, from asking in to being moved out, and what it is told
   * back. Released as one in release(), so no visit's listener outlives it.
   */
  private listenForQueue(): void {
    // Queue progress follows the delver rather than pinning them to a popup:
    // they keep walking while they wait, so the panel has to be visible from
    // anywhere. FS-29KSH §Requirements 25, 27.
    socketManager.on("queue_status", (payload: { current?: number; total?: number }) =>
      this.showQueueProgress(payload?.current ?? 0, payload?.total ?? 0),
    );
    // The reply to joinQueue's find_game: a refusal goes to the global handler, so hearing it
    // here at all means the server took the entry (FS-G4VMQ §Requirements 11).
    socketManager.on(ActionType.Find_Game, () => {
      this.queued = true;
    });
    // A match on another server: the move happens behind this panel, and the
    // host's world_entered switches the scene. A refused move leaves the delver
    // here, so say so. FS-K2HKP §Requirements 29, 31.
    socketManager.on("world_handoff", () => {
      this.showQueueProgressText("Joining the delve…");
      // too late to leave: the delver is being moved (FS-G4VMQ §Requirements 16)
      this.leaveButton?.setVisible(false);
    });
    socketManager.on("world_handoff_failed", () => {
      // the seat is released and the entry is gone (FS-K2HKP §Requirements 25)
      this.leftQueue();
      this.showQueueProgressText("The delve could not be joined.");
    });
    // The reply is the truth: the server answers only once the entry is removed (FS-K2HKP
    // §Requirements 7), so the panel comes down on its word and never on the press. A refusal
    // keeps everything and says why, so the delver can ask again. FS-G4VMQ §Requirements 13, 14, 17.
    // A reply after the handoff already failed finds nothing to leave and changes nothing.
    socketManager.on(ActionType.LeaveQueue, () => {
      if (!this.queued) return;
      this.leftQueue();
      this.queuePanel?.destroy();
      this.queuePanel = undefined;
      this.closeMenu();
    });
    socketManager.onError(ActionType.LeaveQueue, (info) => {
      if (!this.leavePending) return;
      this.leavePending = false;
      this.notice(info.message ?? "Could not leave the queue, please try again.");
    });
    // A solo start the server would not give: the choice comes back, the dialogue stays where it
    // was, and the reason passes by in the hub (FS-NSV3D §Requirements 5). Success needs no
    // listener: it is the world_entered that switches the scene (§Requirements 6).
    socketManager.onError(ActionType.StartSolo, (info) => {
      if (!this.soloPending) return;
      this.soloPending = false;
      this.dialogueChoices?.retone();
      this.notice(info.message ?? "The way is shut for now. Ask again.");
    });
    this.unsubscribeQueue = () => {
      socketManager.off("queue_status");
      socketManager.off(ActionType.Find_Game);
      socketManager.off("world_handoff");
      socketManager.off("world_handoff_failed");
      socketManager.off(ActionType.LeaveQueue);
      socketManager.offError(ActionType.LeaveQueue);
      socketManager.offError(ActionType.StartSolo);
    };
  }

  /**
   * Everything one visit made is let go here. Phaser reuses the scene instance for the next
   * visit, and a reference to something the last visit's display list destroyed draws nothing
   * (commit 0a35e36): forget it, and make it again only while it is `.active`.
   */
  private release(): void {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.release, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.release, this);
    this.unsubscribeState?.();
    this.unsubscribeQueue?.();
    this.views.clear();
    this.npcs.clear();
    this.closeDialogue();
    this.closeMenu();
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
    this.queuePanel = undefined;
    this.leaveButton = undefined;
    this.queued = false;
    // the next visit rebuilds every sprite; the camera must latch onto the new body
    // whatever its entity id, so neither survives the visit
    this.selfEntityID = null;
    this.followedSprite = undefined;
    this.leavePending = false;
    this.soloPending = false;
    this.roofs = [];
    this.insideRoof = undefined;
    // the gauntlet is the hub's and the run's; the menus the hub hands over to keep the browser's
    this.input.setDefaultCursor("");
  }

  update(time: number, delta: number): void {
    // who owns the keyboard is settled before the keys are read for walking
    this.offerMenu();
    this.sendMovementIntent();
    this.easeTowardServerPositions(time, delta);
    this.offerConversation();
    this.hideRoofOverhead();
    this.carryTheTorch(time, delta);
  }

  /**
   * Restamps the light-map with the delver's torch on the delver's drawn
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
   * The roof of the house the delver stands in hides, and returns when they
   * leave: the run's inside test, on world positions (FS-2325V §C.3). The hub's
   * houses have no door today, so this waits for one that does.
   */
  private hideRoofOverhead(): void {
    const self = this.selfEntityID ? this.views.get(this.selfEntityID) : undefined;
    const inside = self ? this.roofs.find((r) => insideHouse(self.pos, r.house)) : undefined;
    if (inside?.house === this.insideRoof) return;
    this.roofs.forEach((r) => r.parts.forEach((p) => p.setVisible(r !== inside)));
    this.insideRoof = inside?.house;
  }

  /**
   * Opens a dialogue when the delver is standing close enough and presses to
   * talk. Walking past never does anything: joining the queue takes a choice,
   * not a collision. FS-29KSH §Requirements 24.
   */
  private offerConversation(): void {
    if (!this.interactKey) return;

    // The menu owns the keyboard while it is open (FS-G4VMQ §Requirements 5): a press to talk
    // is read and dropped, so it does not open a dialogue the moment the menu closes.
    if (this.menu) {
      Phaser.Input.Keyboard.JustDown(this.interactKey);
      return;
    }

    // While a dialogue is open the same key answers it, so a delver never has to
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

    const self = this.selfEntityID ? this.views.get(this.selfEntityID) : undefined;
    if (!self) return;

    // World positions, never sprite positions: the sprites sit on the projection.
    for (const { state, pos } of this.npcs.values()) {
      const distance = Phaser.Math.Distance.Between(self.pos.x, self.pos.y, pos.x, pos.y);

      if (distance <= NPC_TALK_RANGE) {
        this.openDialogue(state);
        return;
      }
    }
  }

  /**
   * The server ticks at 30Hz and the screen redraws at 60. Applying broadcast
   * positions directly makes every delver — including your own — teleport twice
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
      this.placeMarker(npc.sprite, npc.name, npc.anim.crown);
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
      drawDelverLegs(
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
   * All client-side and none of it blocks: anything a delver can walk into is a
   * building, and buildings are server entities so that collision and shape come
   * from one source. Scenery has no such obligation, so it costs the broadcast
   * nothing.
   *
   * The fire is ember, not amber. On the canvas amber means *interactable*, and
   * a delver cannot do anything with this one — an amber thing you cannot act on
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
    // sliced by the eave. The guard clears what a building *looks* like.
    const blocked = (x: number, y: number, radius: number) =>
      walls.some(
        (wall) =>
          x + radius >= wall.position.x - ROOF_EAVE &&
          x - radius <= wall.position.x + wall.width + ROOF_EAVE &&
          y + radius >= wall.position.y - ROOF_EAVE &&
          y - radius <= wall.position.y + wall.height + ROOF_EAVE,
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
    /** A baked prop on a footprint; tall ones fade over the delver, lit ones light. */
    const place = (
      sheet: string,
      at: Point,
      index: number,
      tall: boolean,
      query: { animation?: string; layer?: number } = {},
    ) => {
      const { sprite, light } = addProp(this, this.art, sheet, at, { index, ...query });
      if (tall) this.occluders.add([sprite]);
      if (light) this.lightMap?.add(light);
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

    for (const run of HUB_FENCES) {
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
      fence.setDepth(
        worldDepth(horizontal ? x + length / 2 : x, horizontal ? y : y + length / 2),
      );
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
  }

  /**
   * One chimney on each house's roof, with its smoke (FS-KYPQ9 §A.6). A chimney is part of the
   * drawn roof, not a ground prop, so it is the one placement that skips `blocked()` and the
   * keep-out rule: it stands on the roof at the house's `planChimney` spot, sorts with that
   * roof's pieces, fades with them over the delver and joins the roof's parts, so it hides
   * whenever the roof does, its smoke with it. Without the `chimney` sheet there is neither
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
      this.occluders.add([sprite]);
      const parts: { setVisible(visible: boolean): unknown }[] = [sprite];
      if (this.fx)
        parts.push(new ChimneySmoke(this.fx, `chimney:${roof.house.id}`, spot.at, spot.top));
      // a roof already hidden over the delver keeps its new parts hidden too
      if (roof.house === this.insideRoof) parts.forEach((p) => p.setVisible(false));
      roof.parts.push(...parts);
    }
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
   * Sends velocity only when it changes, rather than every frame. While the menu is open the
   * keys are its (FS-G4VMQ §Requirements 5): they read as released, so a stride the menu
   * interrupted is stopped once and nothing more is sent until it closes.
   */
  private sendMovementIntent(): void {
    if (!this.cursors || !this.wasd) return;

    const held = (k: Phaser.Input.Keyboard.Key) => !this.menu && k.isDown;
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

    const present = new Set<string>();

    if (state.current_player) {
      this.placeDelver(state.current_player, true);
      present.add(state.current_player.entity_id);

      const progress = progressOf(state.current_player);
      if (progress) {
        this.progressHud ??= new ProgressHud(this, HUD_INSET, HUD_INSET);
        this.progressHud.show(progress);
      }

      this.selfEntityID = state.current_player.entity_id;
      const self = this.views.get(this.selfEntityID);
      if (self) this.keepCameraOn(self.sprite);
    }

    this.renderStructures(state.walls ?? []);
    // Scenery waits for the buildings so it can refuse to stand inside one.
    this.drawScenery(state.walls ?? []);
    this.renderNPCs(state.npcs ?? []);

    for (const other of state.other_players ?? []) {
      this.placeDelver(other, false);
      present.add(other.entity_id);
    }

    // anyone who left the hub since the last tick
    for (const [entityID, view] of this.views) {
      if (present.has(entityID)) continue;

      view.sprite.destroy();
      view.name.destroy();
      view.legs.destroy();
      this.views.delete(entityID);
    }
  }

  /**
   * Turns a delver to face where they are going, and advances their stride.
   *
   * The character textures have no walk frames — one static image per class per
   * facing — so the stride is animated by drawing legs, the same as in a run.
   */
  private updateAppearance(view: DelverView, player: PlayerState): void {
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
    body?.setTexture(textureFor(player.class, nearestScreenFacing(facing)));
  }

  private showQueueProgress(current: number, total: number): void {
    // queue_status only ever reaches a queued player (FS-G4VMQ §Requirements 11)
    this.queued = true;
    this.showQueueProgressText(`Gathering the delve  ${current}/${total}`);
    this.showLeaveButton();
  }

  /**
   * The *Leave* button beside the queue panel (FS-G4VMQ §Requirements 15): the panel's twin in
   * amber, since it is the one thing on the panel the delver can act on. Same lifecycle as the
   * panel: made beside it, reused only while it is still on screen, down when the queue is left.
   */
  private showLeaveButton(): void {
    const panel = this.queuePanel;
    if (!panel) return;
    const x = panel.x + panel.width + LEAVE_GAP;

    if (this.leaveButton?.active) {
      this.leaveButton.setPosition(x, panel.y).setVisible(true);
      return;
    }

    // amber: the one thing on the panel the delver can act on
    const button = this.add
      .text(x, panel.y, "Leave", hudLine(BARROW_HEX.amber))
      .setScrollFactor(0)
      .setDepth(1000)
      .setInteractive();
    button.on("pointerup", () => this.leaveQueue());
    // the gauntlet stays; brightening to vellum is the hover cue, as on a dialogue option
    button.on("pointerover", () => button.setColor(toCss(BARROW_HEX.vellum)));
    button.on("pointerout", () => button.setColor(toCss(BARROW_HEX.amber)));
    this.leaveButton = button;
  }

  /** The queue is behind the delver: no entry, nothing pending, no way out to offer. */
  private leftQueue(): void {
    this.queued = false;
    this.leavePending = false;
    this.leaveButton?.destroy();
    this.leaveButton = undefined;
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
   * A line the hub says in passing, in the neutral HUD register: the delver cannot act on it,
   * and it goes on its own.
   */
  private notice(text: string): void {
    const { width } = this.cameras.main;
    const line = this.add
      .text(width / 2, NOTICE_Y, text, hudLine(BARROW_HEX.vellum))
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

    // vellum, not amber: the delver cannot act on it (FS-KYPQ9 §I)
    this.queuePanel = this.add
      .text(24, this.cameras.main.height - 44, text, hudLine(BARROW_HEX.vellum))
      .setScrollFactor(0)
      .setDepth(1000);
  }

  /**
   * Draws the hub's buildings.
   *
   * They are server entities, so the collision a delver feels and the shape they
   * see come from one source — an invisible wall is worse than no wall. Fixed,
   * so this runs once rather than every tick.
   */
  private renderStructures(walls: WallState[]): void {
    if (this.structuresDrawn || walls.length === 0) return;

    // Baked wall pieces and corner posts (FS-2325V §C.2); without a manifest,
    // placeholder upright blocks, one-tile pieces each sorted by footprint.
    const houses = housesFrom(walls);
    const baked = addWalls(this, this.art, walls, worldSeed("hub"));
    if (baked) {
      this.occluders.add(baked.tall);
      // a back wall's flame is in sight only while its house's roof is off
      const houseOf = new Map(walls.map((w) => [w.entity_id, houses.find((h) => h.id === w.house_id)]));
      baked.lights.forEach(({ source, wallId, underRoof }) => {
        const house = houseOf.get(wallId);
        this.lightMap?.add(source, underRoof && house ? () => this.insideRoof === house : undefined);
      });
    } else {
      for (const wall of walls) {
        addUprightBlock(this, wall.position.x, wall.position.y, wall.width, wall.height, {
          top: BARROW_HEX.barrowDeep,
          south: shade(BARROW_HEX.barrowDeep, 0.3),
          east: shade(BARROW_HEX.barrowDeep, 0.5),
          edge: { width: 2, color: BARROW_HEX.barrowBrown, alpha: 0.8 },
        });
      }
    }

    // Walls carry the building they belong to, so the footprints can be
    // reassembled here rather than being a second list to keep in step with the
    // server's. Flagstone goes under each, and a roof on top: baked slope and
    // ridge pieces sorted by their own footprints (FS-2325V §C.3), or without art
    // a placeholder roof on a plane lifted to the wall tops.
    this.groundLayer?.paint(houses);
    for (const house of houses) {
      const roof = addRoof(this, this.art, house);
      if (roof) this.occluders.add(roof);
      this.roofs.push({ house, baked: !!roof, parts: roof ?? [this.placeholderRoof(house)] });
    }

    // One flag covers both: the walls and their roofs are drawn together.
    this.structuresDrawn = true;
  }

  /** The pre-art roof: two shaded slopes on a plane lifted to the wall tops. */
  private placeholderRoof(house: House): Phaser.GameObjects.Container {
    const roofPlane = addWorldPlane(this, WALL_HEIGHT);
    // sorted by the centre of its footprint: over a delver behind the house, under one in front
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

      // Everyone is a baked character on the delvers' rig (FS-2325V §G): residents in their
      // build and palette, function NPCs as themselves, whose role reads from the silhouette.
      // Only with no sheet at all do the placeholders stand in: a villager texture, or the
      // delver silhouette tinted brass.
      const isFunction = npc.function !== "";
      const tone = isFunction ? BARROW_HEX.brassBright : palette.markerHub;
      const anim = new CharacterAnimator(this.art, folkLook(npc, this.art));
      const texture =
        anim.baked || isFunction
          ? undefined
          : ensureVillagerTexture(this, npc.appearance ?? "green_trousers");

      const body = texture
        ? this.add.sprite(0, 0, `${texture}_down`)
        : this.add.sprite(0, 0, textureFor("warrior", "down"));
      if (anim.baked) anim.dress(body);
      else if (isFunction) body.setTint(tone);
      body.setName("body");

      // brass for the two worth crossing the hub for, vellum for the folk
      const name = this.add
        .text(0, 0, npc.name, {
          fontFamily: CANVAS_FONT.body,
          fontSize: "12px",
          color: toCss(tone),
        })
        .setOrigin(0.5)
        .setDepth(MARKER_DEPTH.name);

      const pos = { x: npc.position.x, y: npc.position.y };
      const sprite = this.add.container(0, 0, [body]);
      standAt(sprite, pos, 1);
      this.placeMarker(sprite, name, anim.crown);

      this.npcs.set(npc.entity_id, {
        state: npc,
        sprite,
        name,
        target: { ...pos },
        pos,
        // faces the viewer, which the "down" texture shows
        facing: "se",
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
    const { line, choices } = NPC_DIALOGUE[npc.function]?.({ queued: this.queued }) ?? {
      line: RESIDENT_LINES[
        // stable per resident, so they do not change their mind each time
        [...npc.entity_id].reduce((sum, c) => sum + c.charCodeAt(0), 0) %
          RESIDENT_LINES.length
      ],
      // A resident has nothing to offer, so they offer no choice. Two options
      // that both close the box is a decision the delver does not have.
      choices: [{ id: "leave", label: "Leave", register: "actionable" }],
    };

    const { width, height } = this.cameras.main;
    const panel = this.add.graphics();
    panel.fillStyle(BARROW_HEX.charcoal, 0.96);
    panel.fillRect(-300, -90, 600, 180);
    panel.lineStyle(1, BARROW_HEX.brass, 0.5);
    panel.strokeRect(-300, -90, 600, 180);

    const speaker = this.add
      .text(0, -60, npc.name, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "16px",
        color: toCss(BARROW_HEX.brassBright),
      })
      .setOrigin(0.5);

    const said = this.add
      .text(0, -18, line, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "14px",
        color: toCss(BARROW_HEX.vellum),
        align: "center",
        lineSpacing: 6,
      })
      .setOrigin(0.5);

    const enabled = (choice: DialogueChoice) =>
      choice.enabled?.({ soloPending: this.soloPending }) ?? true;
    const pick = (choice: DialogueChoice) => {
      if (!enabled(choice)) return;
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
    // Each choice is the shared menu row: its hit area is a separate camera-fixed rectangle
    // that goes down with the label's container (menuPanel.ts says why).
    const origin = { x: width / 2, y: height / 2 };
    const options = choices.map((choice, i) =>
      menuOption(this, {
        x: (i - (choices.length - 1) / 2) * CHOICE_SPACING,
        y: 48,
        label: `${choice.label}${hint(choice)}`,
        colour: choice.register === "actionable" ? MENU_TONES.actionable : MENU_TONES.cancel,
        onPick: () => pick(choice),
        name: `choice-${choice.id}`,
        origin,
        enabled: () => enabled(choice),
        hit: CHOICE_HIT,
        tones: MENU_TONES,
      }),
    );
    const retone = () => options.forEach((o) => o.retone());

    this.dialogueChoices = { confirm, dismiss, pick: pickNumbered, retone };
    this.dialogue = this.add
      .container(width / 2, height / 2, [panel, speaker, said, ...options])
      .setScrollFactor(0)
      .setDepth(MENU_DEPTH);
  }

  private closeDialogue(): void {
    this.dialogue?.destroy();
    this.dialogue = undefined;
    this.dialogueChoices = undefined;
  }

  /**
   * ESC, read once a frame on the one ESC key the hub binds (FS-G4VMQ §Requirements 1, 2, 20).
   * While a dialogue is open the key is the dialogue's, read in offerConversation, so this does
   * not touch it; otherwise ESC opens the menu, and pressed again closes it.
   */
  private offerMenu(): void {
    if (this.dialogue || !this.dismissKey) return;
    const esc = Phaser.Input.Keyboard.JustDown(this.dismissKey);

    if (!this.menu) {
      if (esc) this.openMenu();
      return;
    }

    // open: Esc closes, Enter is the first choice, a number is that choice. Every key is
    // read each frame, so a press never lingers to answer the next one.
    const confirm = this.confirmKey && Phaser.Input.Keyboard.JustDown(this.confirmKey);
    const numbered = this.choiceKeys.map((k) => Phaser.Input.Keyboard.JustDown(k)).indexOf(true);
    if (esc) this.closeMenu();
    else if (confirm) this.menuChoices?.confirm();
    else if (numbered >= 0) this.menuChoices?.pick(numbered);
  }

  /**
   * The hub's ESC menu: a way to the main menu, a way back (FS-G4VMQ §Requirements 3, 4). Built
   * from the scene's state as it opens, so what it offers is hubMenuChoices' rule, not the
   * chrome's. Camera-fixed in the popup band with the dialogue; the world runs on behind it.
   */
  private openMenu(): void {
    const { width, height } = this.cameras.main;
    const actions: Record<HubMenuChoice["id"], () => void> = {
      change: () => this.changeCharacter(),
      leave: () => this.leaveQueue(),
      back: () => this.closeMenu(),
    };
    const { container, keys } = showMenuPanel(this, {
      choices: hubMenuChoices({ queued: this.queued }),
      actions,
      close: () => this.closeMenu(),
      origin: { x: width / 2, y: height / 2 },
      hit: CHOICE_HIT,
      tones: MENU_TONES,
    });
    this.menuChoices = keys;
    this.menu = container;
  }

  /**
   * The camera on the delver's own body. Latched by sprite, not by entity id: a scene restart
   * (back from the loadout, re-entering the hub) rebuilds every sprite under the same id, and
   * startFollow snaps the camera each time it is called, so it is called once per sprite.
   */
  private keepCameraOn(sprite: Phaser.GameObjects.Container): void {
    if (sprite === this.followedSprite) return;
    this.cameras.main.startFollow(sprite, true, 0.1, 0.1);
    this.followedSprite = sprite;
  }

  private closeMenu(): void {
    this.menu?.destroy();
    this.menu = undefined;
    this.menuChoices = undefined;
  }

  /**
   * Back to the main menu, whose roster and DELVE re-enter the hub as whoever is picked
   * (FS-G4VMQ §Requirements 6–9). Nothing is sent: the body stays here until then, as the run's
   * ESC leaves it (§Requirements 21).
   */
  private changeCharacter(): void {
    this.scene.start("MainMenuScene");
  }

  /** The loadout is a screen, not a world: the delver stays in the hub while it
   * is open, standing where they were. */
  openLoadout(): void {
    this.scene.start("LoadoutScene");
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

  /** Joining is the delver's decision; the queue itself is unchanged. */
  joinQueue(): void {
    const character = useGameStore.getState().getActiveCharacter();
    const chosenClass = (character?.className ?? "warrior").toLowerCase();

    socketManager.sendMessage(ActionType.Find_Game, {
      class: chosenClass,
      className: chosenClass,
      characterName: character?.name ?? "",
      username: character?.name ?? "",
    });
  }

  /** A delver's name plate over their head ({@link markerBase}); the hub has no corpses. */
  private placeName(view: DelverView): void {
    this.placeMarker(view.sprite, view.name, view.anim.crown);
  }

  /** A name plate over whoever stands in `sprite`: a baked head (`crown`), or the frame's top. */
  private placeMarker(
    sprite: Phaser.GameObjects.Container,
    name: Phaser.GameObjects.Text,
    crown: number | undefined,
  ): void {
    const body = sprite.getByName("body") as Phaser.GameObjects.Sprite | null;
    if (!body) return;
    const base = markerBase(
      {
        y: sprite.y + body.y,
        displayOriginY: body.displayOriginY,
        scaleY: body.scaleY,
      },
      crown,
      false,
    );
    name.setPosition(sprite.x + body.x, (base ?? sprite.y) - NAME_GAP);
  }

  private placeDelver(player: PlayerState, isSelf: boolean): void {
    const existing = this.views.get(player.entity_id);

    // Existing delvers ease toward the target in update(); only a delver seen
    // for the first time is placed outright, so it does not slide in from the
    // origin.
    if (existing) {
      existing.target = { x: player.position.x, y: player.position.y };
      this.updateAppearance(existing, player);
      return;
    }

    // The same sprites the character-select screen previews, so the delver a
    // player picked is the delver they see.
    const body = this.add.sprite(0, 0, textureFor(player.class, "down"));
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

    const view: DelverView = {
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
