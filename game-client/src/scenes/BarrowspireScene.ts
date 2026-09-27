/**
 * BarrowspireScene - 簡化版遊戲場景
 * 移動邏輯 + WebSocket + 建築（進入後看不到外面）
 */

import Phaser from "phaser";
import { ActionType } from "@/assets/types/client";
import { socketManager } from "@/utils/class/SocketManager";
import { drawDelverLegs } from "@/utils/characterTextures";
import { createAtmosphere as buildAtmosphere } from "@/utils/atmosphere";
import { useGameStore } from "@/stores/gameStore";
import {
  ClientGameState,
  PlayerState,
  ContainerState,
  ItemState,
  EscapeDoorState,
  SwitchState,
  WallState,
  DoorState,
  EquippedItems,
  EquipmentState,
  ProjectileState,
} from "@/types/gameState";
import { EquipmentPanel } from "@/ui/EquipmentPanel";
import { ContainerContents, ContainerView, lootMessage } from "@/ui/ContainerView";
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
  outsideConvex,
  projectRect,
  projectedBounds,
  raise,
  screenToWorld,
  standAt,
  worldDepth,
  worldToScreen,
  type Facing8,
  type Point,
  type WorldPlane,
} from "@/render/iso";
import { artSprite, preloadArt, registerArt } from "@/render/art/phaser";
import type { ArtLibrary } from "@/render/art/library";
import { CharacterAnimator } from "@/render/art/character";
import { AMBIENT, LightMap } from "@/render/lighting";
import { MARKER_BAR, MARKER_DEPTH, markerBase } from "@/render/markers";
import {
  BAKE,
  GroundLayer,
  Occluders,
  addRoof,
  addWalls,
  footprintHitArea,
  housesFrom,
  showState,
  worldSeed,
} from "@/render/world";

/** Screen px of dark beyond the projected diamond the camera may show at the map edge. */
const CAMERA_MARGIN = 160;
/** A delver's footprint, in world px: the server's `PlayerRadius`. */
const PLAYER_FOOTPRINT_RADIUS = 20;
/**
 * Screen px above a delver's marker base (`markerBase`: a baked head, or a placeholder's frame
 * top) to their name label, and to their HP bar. Markers draw above the light-map and vignette
 * (FS-2325V §C.9).
 */
const NAME_GAP = 5;
const HP_BAR_GAP = 10;
/**
 * On a baked sheet the delver's own name clears their HP bar, which spans the 11 px over the
 * base. A placeholder keeps {@link NAME_GAP}, exactly where it always was.
 */
const NAME_OVER_BAR_GAP = HP_BAR_GAP + 2;

/** Health the server already sends, run out: a delver's death clip plays on it. */
const isDead = (player?: { current_health?: number } | null) =>
  player?.current_health !== undefined && player.current_health <= 0;

interface Building {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  doorSide: "top" | "bottom" | "left" | "right";
  wallGroup: Phaser.Physics.Arcade.StaticGroup;
  /** Baked roof pieces, or the placeholder roof: hidden together while the delver is inside. */
  roof: { setVisible(visible: boolean): unknown }[];
  doorMarker: Phaser.GameObjects.Graphics;
  // Door properties
  door: Phaser.GameObjects.Graphics;
  doorCollider: Phaser.GameObjects.Rectangle;
  isOpen: boolean;
}

/** Limited barrow palette for the wizard-delver sprite (0x ints). */
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

/** Limited barrow palette for the knight-delver sprite (0x ints). */
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

/** Limited barrow palette for the archer-delver sprite (0x ints). */
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

export class BarrowspireScene extends Phaser.Scene {
  /** The local delver's sprite, drawn at the projection of `playerPos`. */
  private player?: Phaser.Physics.Arcade.Sprite;
  /**
   * The local delver's world position as rendered (eased toward the server's).
   * Every gameplay calculation uses this, never `player.x/y`, which are screen
   * coordinates. CONTEXT.md "World position".
   */
  private playerPos?: Point;
  private otherPlayers: Map<string, Phaser.Physics.Arcade.Sprite> = new Map();
  /** Eased world positions of other delvers; their sprites sit at the projection. */
  private otherPlayersPos: Map<string, Point> = new Map();
  private otherPlayersEntityIds: Map<string, string> = new Map(); // player_id → entity_id
  private otherPlayersTargets: Map<string, { x: number; y: number }> =
    new Map();

  // leg graphics for walking animation
  private playerLegs?: Phaser.GameObjects.Graphics;
  private playerHpMpGraphics?: Phaser.GameObjects.Graphics;
  private otherPlayersHpMpGraphics: Map<string, Phaser.GameObjects.Graphics> = new Map();
  /** The warm pool the delver carries. Built once; only ever repositioned. */
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
   * Each delver's baked character sheet (FS-2325V §E.4). When a sheet is not `baked` the delver
   * keeps its placeholder texture, facing swaps and drawn legs above.
   */
  private playerAnim?: CharacterAnimator;
  private otherPlayersAnim: Map<string, CharacterAnimator> = new Map();

  // username labels
  private playerNameText?: Phaser.GameObjects.Text;
  private otherPlayersNameTexts: Map<string, Phaser.GameObjects.Text> =
    new Map();
  private hoveredPlayerId?: string; // survives game state rerenders

  // HP change tracking for damage flash
  private otherPlayersPrevHp: Map<string, number> = new Map();
  private prevLocalPlayerHp?: number;

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

  // End-of-game overlay (shown when server sends end_game action)
  private gameEndOverlay?: Phaser.GameObjects.Container;

  // Game state
  private gameStateUnsubscribe?: () => void;
  private connectionStatusUnsubscribe?: () => void;
  private targetPosition: { x: number; y: number } | null = null;

  // 地圖大小
  private mapWidth = 1440;
  private mapHeight = 960;

  // 建築
  private buildings: Building[] = [];
  private currentBuilding: Building | null = null;
  private outsideObjects: Phaser.GameObjects.GameObject[] = [];
  private indoorMask!: Phaser.GameObjects.Graphics;

  // 寶箱 (從後端同步) — `pos` is the world position; the sprite is drawn at its projection
  private chests: Map<
    string,
    { sprite: Phaser.GameObjects.Sprite; entityId: string; pos: Point }
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

  // 牆壁 (從後端同步) — baked wall pieces and posts (FS-2325V §C.2), or the
  // placeholder blocks without a manifest; either way, one-tile pieces sorted by footprint
  private walls: Map<
    string,
    { pieces: Phaser.GameObjects.GameObject[]; entityId: string }
  > = new Map();

  // 門 (從後端同步) — the baked door showing its state's frame (FS-2325V §C.4); without a
  // manifest, the placeholder slab on its own lifted plane. `pos` is the closed door's
  // centre, the point interaction is measured from
  private serverDoors: Map<
    string,
    {
      sprite?: Phaser.GameObjects.Sprite;
      slab?: { rect: Phaser.GameObjects.Rectangle; plane: WorldPlane };
      entityId: string;
      isOpen: boolean;
      pos: Point;
    }
  > = new Map();
  private serverBuildingsCreated = false;

  // 寶箱跳窗: the satchel a coffer opens into (FS-2325V §D)
  private containerView!: ContainerView;

  // 道具欄 + 裝備面板
  private equipmentPanel?: EquipmentPanel;
  private equippedItems: EquippedItems = {
    weapon: null,
    head: null,
    body: null,
    hands: null,
    feet: null,
    ring_1: null,
    ring_2: null,
    consumable_1: null,
    consumable_2: null,
    consumable_3: null,
  };
  private inventoryItems: ItemState[] = [];

  private canAttack = true;
  private canCastSkill = true;
  private projectileSprites: Map<
    string,
    { container: Phaser.GameObjects.Container; pos: Point; isArrow: boolean }
  > = new Map();
  /** The map floor, a world-coordinate plane; house floors are added to it. */
  private groundPlane?: WorldPlane;
  /** Baked art (FS-2325V §B.6); an empty library draws placeholders. */
  private art!: ArtLibrary;
  /** Baked ground, when the manifest has it; otherwise `groundPlane` is the placeholder floor. */
  private groundLayer?: GroundLayer;
  /** FS-2325V §C.7: replaces the overlay torch pool. */
  private lightMap?: LightMap;
  private occluders = new Occluders();
  /** How far above the floor a house's walls reach on screen, for the indoor mask's hole. */
  private wallTop = WALL_HEIGHT;
  private readonly PENDING_DURATION = 1000; // 1 秒內不比對剛拿的物品
  private lastGameState?: ClientGameState;

  // 狀態追蹤：避免重複通知（每秒 33 幀會重複收到相同狀態）
  private previousEscapeDoorOpened: boolean | null = null;
  private previousSwitchActivated: boolean | null = null;
  private escapedPlayers: Set<string> = new Set();
  private escapedCountText?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "BarrowspireScene" });
  }

  /**
   * Phaser reuses this instance when the scene restarts (a reconnect mid-run is a
   * `world_entered` for the run the delver is already in), so everything a run
   * builds is forgotten when it stops, and the next start rebuilds it through the
   * same code path (FS-2325V "Edge States": reconnect mid-run).
   */
  init(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.resetRun, this);
  }

  /**
   * Drops every subscription and every reference to the stopped run's world. Phaser
   * has already destroyed the game objects; what is left here are the maps and flags
   * that would otherwise make the next start skip building walls, roofs and delvers,
   * or touch sprites that no longer exist.
   */
  private resetRun(): void {
    this.gameStateUnsubscribe?.();
    this.gameStateUnsubscribe = undefined;
    this.connectionStatusUnsubscribe?.();
    this.connectionStatusUnsubscribe = undefined;
    socketManager.off("exit_door_unlocked");
    socketManager.off("interact");
    socketManager.off("end_game");

    this.player = undefined;
    this.playerPos = undefined;
    this.playerLegs = undefined;
    this.playerHpMpGraphics = undefined;
    this.playerNameText = undefined;
    this.playerAnim = undefined;
    this.playerFacing = "se";
    this.walkPhase = 0;
    this.prevLocalPlayerHp = undefined;
    this.targetPosition = null;

    this.otherPlayers.clear();
    this.otherPlayersPos.clear();
    this.otherPlayersEntityIds.clear();
    this.otherPlayersTargets.clear();
    this.otherPlayersHpMpGraphics.clear();
    this.otherPlayersLegs.clear();
    this.otherPlayersFacing.clear();
    this.otherPlayersWalkPhase.clear();
    this.otherPlayersClass.clear();
    this.otherPlayersAnim.clear();
    this.otherPlayersNameTexts.clear();
    this.otherPlayersPrevHp.clear();
    this.hoveredPlayerId = undefined;

    this.buildings = [];
    this.currentBuilding = null;
    this.outsideObjects = [];
    this.chests.clear();
    this.escapeDoors.clear();
    this.switches.clear();
    this.walls.clear();
    this.serverDoors.clear();
    this.serverBuildingsCreated = false;
    this.projectileSprites.clear();
    this.groundPlane = undefined;
    this.groundLayer = undefined;
    this.lightMap = undefined;
    this.wallTop = WALL_HEIGHT;

    this.controlsPanel = undefined;
    this.gameEndOverlay = undefined;
    this.equipmentPanel = undefined;
    this.escapedCountText = undefined;
    this.equippedItems = Object.fromEntries(
      Object.keys(this.equippedItems).map((slot) => [slot, null]),
    ) as unknown as EquippedItems;
    this.inventoryItems = [];
    this.canAttack = true;
    this.canCastSkill = true;
    this.lastGameState = undefined;
    this.previousEscapeDoorOpened = null;
    this.previousSwitchActivated = null;
    this.escapedPlayers.clear();
  }

  private toggleControlsPanel(): void {
    if (this.controlsPanel) {
      this.controlsPanel.destroy();
      this.controlsPanel = undefined;
      return;
    }

    const cam = this.cameras.main;
    const panelW = 260;
    const panelH = 220;
    const x = cam.width / 2;
    const y = cam.height / 2;

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
      ["I", "Equipment"],
      ["Q", "Close Panel"],
      ["LEFT CLICK", "Melee Attack"],
      ["RIGHT CLICK", "Fireball (Skill)"],
      ["ESC", "Main Menu"],
      ["H", "Toggle Controls"],
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

  private showGameEndOverlay(position: number, result?: string): void {
    if (this.gameEndOverlay) return; // already shown

    const cam = this.cameras.main;

    // full-screen backdrop — eats pointer input from anything beneath
    const backdrop = this.add.rectangle(
      cam.width / 2,
      cam.height / 2,
      cam.width,
      cam.height,
      palette.ink,
      0.85,
    );
    // centered card
    const cardW = 460;
    const cardH = 280;
    const card = this.add.graphics();
    card.fillStyle(palette.ink, 0.95);
    card.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 10);
    card.lineStyle(1, palette.frame, 0.5);
    card.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 10);

    let titleStr: string;
    let subtitleStr: string;

    switch (result) {
      case "escaped":
        titleStr = "ESCAPED!";
        subtitleStr = "YOU CARRIED IT OUT OF THE BARROW";
        break;
      case "survived":
        titleStr = "YOU LIVE";
        subtitleStr = "LAST DELVER STANDING";
        break;
      default: // "eliminated"
        titleStr = `YOU FELL #${position}`;
        subtitleStr = "THE BARROW KEEPS ITS DEAD";
        break;
    }

    const title = this.add.text(0, -60, titleStr, {
      fontFamily: CANVAS_FONT.body,
      fontSize: "44px",
      color: toCss(palette.frameBright),
      fontStyle: "bold",
      letterSpacing: 6,
    });
    title.setOrigin(0.5);

    const subtitle = this.add.text(0, 0, subtitleStr, {
      fontFamily: CANVAS_FONT.body,
      fontSize: "13px",
      color: toCss(palette.hudLabel),
      letterSpacing: 3,
    });
    subtitle.setOrigin(0.5);

    // --- action buttons ---
    const btnW = 180;
    const btnH = 38;
    const btnY = 70;
    const btnGap = 16;

    // RE-DEPLOY button (re-queue) — cyan fill
    const redeployBtn = this.add.graphics();
    redeployBtn.fillStyle(palette.interactable, 1);
    redeployBtn.fillRoundedRect(
      -btnW / 2 - btnW / 2 - btnGap / 2,
      btnY - btnH / 2,
      btnW,
      btnH,
      6,
    );
    const redeployText = this.add.text(
      -btnW / 2 - btnGap / 2,
      btnY,
      "DELVE AGAIN",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "14px",
        color: toCss(palette.ink),
        fontStyle: "bold",
        letterSpacing: 3,
      },
    );
    redeployText.setOrigin(0.5);
    // hit areas live outside containers so pointer events work reliably
    const cx = cam.width / 2;
    const cy = cam.height / 2;
    const redeployHit = this.add
      .rectangle(
        cx - btnW / 2 - btnGap / 2,
        cy + btnY,
        btnW,
        btnH,
        palette.inkDeep,
        0,
      )
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(2001);
    redeployHit.on("pointerover", () => {
      redeployBtn.clear();
      redeployBtn.fillStyle(palette.interactableBright, 1);
      redeployBtn.fillRoundedRect(
        -btnW / 2 - btnW / 2 - btnGap / 2,
        btnY - btnH / 2,
        btnW,
        btnH,
        6,
      );
    });
    redeployHit.on("pointerout", () => {
      redeployBtn.clear();
      redeployBtn.fillStyle(palette.interactable, 1);
      redeployBtn.fillRoundedRect(
        -btnW / 2 - btnW / 2 - btnGap / 2,
        btnY - btnH / 2,
        btnW,
        btnH,
        6,
      );
    });
    redeployHit.on("pointerdown", () => {
      const activeChar = useGameStore.getState().getActiveCharacter();
      const chosenClass = (activeChar?.className || useGameStore.getState().selectedClass || "warrior").toLowerCase();
      const chosenName = activeChar?.name || useGameStore.getState().selectedCharacterName || "Hero";

      socketManager.sendMessage(ActionType.Find_Game, {
        playerId: "1",
        class: chosenClass,
        className: chosenClass,
        characterName: chosenName,
        username: chosenName,
      });
      this.scene.start("MainMenuScene");
    });

    // RETURN TO BASE button — outlined
    const returnBtn = this.add.graphics();
    returnBtn.lineStyle(1, palette.interactable, 0.6);
    returnBtn.strokeRoundedRect(btnGap / 2, btnY - btnH / 2, btnW, btnH, 6);
    const returnText = this.add.text(btnGap / 2 + btnW / 2, btnY, "WITHDRAW", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "13px",
      color: toCss(palette.frameBright),
      letterSpacing: 2,
    });
    returnText.setOrigin(0.5);
    const returnHit = this.add
      .rectangle(
        cx + btnGap / 2 + btnW / 2,
        cy + btnY,
        btnW,
        btnH,
        palette.inkDeep,
        0,
      )
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(2001);
    returnHit.on("pointerover", () => {
      returnBtn.clear();
      returnBtn.fillStyle(palette.interactable, 0.1);
      returnBtn.fillRoundedRect(btnGap / 2, btnY - btnH / 2, btnW, btnH, 6);
      returnBtn.lineStyle(1, palette.interactableBright, 0.8);
      returnBtn.strokeRoundedRect(btnGap / 2, btnY - btnH / 2, btnW, btnH, 6);
    });
    returnHit.on("pointerout", () => {
      returnBtn.clear();
      returnBtn.lineStyle(1, palette.interactable, 0.6);
      returnBtn.strokeRoundedRect(btnGap / 2, btnY - btnH / 2, btnW, btnH, 6);
    });
    returnHit.on("pointerdown", () => {
      this.scene.start("MainMenuScene");
    });

    const cardContainer = this.add.container(cam.width / 2, cam.height / 2, [
      card,
      title,
      subtitle,
      redeployBtn,
      redeployText,
      returnBtn,
      returnText,
    ]);

    this.gameEndOverlay = this.add.container(0, 0, [backdrop, cardContainer]);
    this.gameEndOverlay.setDepth(2000);
    this.gameEndOverlay.setScrollFactor(0);

    // disable game input — keyboard movement, hover, clicks
    if (this.input.keyboard) {
      this.input.keyboard.enabled = false;
    }
  }

  preload(): void {
    // 1. Wizard (Mage) Palettes
    const playerPalette: WizardPalette = {
      hat: palette.delverCloak,
      hatShade: shade(palette.delverCloak, 0.45),
      band: palette.frame,
      robe: tint(palette.delverCloak, 0.06),
      robeShade: palette.delverCloakShade,
      robeLight: tint(palette.delverCloak, 0.16),
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

    // Other players class sprites
    this.createKnightTextures("other_warrior", rivalKnightPalette);
    this.createSoldierTextures("other_mage", rivalPalette);
    this.createArcherTextures("other_archer", rivalArcherPalette);

    this.createChestTextures();
    this.createEscapeDoorTextures();
    this.createSwitchTextures();
    this.createMetalFloorTexture();
    this.createEscapeParticleTexture();

    // baked world and prop art (FS-2325V §B.6); the textures above stay as placeholders
    preloadArt(this);
  }

  private createMetalFloorTexture(): void {
    // textures belong to the game, not the scene: a restarted run already has it
    if (this.textures.exists("metalFloor")) return;
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    // Cracked flagstone floor: cold dark flags in deep mortar, bevelled so the
    // torch catches the upper-left edge, with faint moss and dust. A 4×4 grid
    // tiles seamlessly at 128. Texture key kept as "metalFloor".
    const tile = 32;
    ctx.fillStyle = toCss(palette.inkDeep); // mortar / gaps
    ctx.fillRect(0, 0, size, size);

    for (let gy = 0; gy < size; gy += tile) {
      for (let gx = 0; gx < size; gx += tile) {
        const v = 40 + Math.floor(Math.random() * 10);
        ctx.fillStyle = `rgb(${v}, ${v + 1}, ${v + 4})`;
        ctx.fillRect(gx + 1, gy + 1, tile - 2, tile - 2);

        // bevel: lit top-left, shadowed bottom-right
        ctx.fillStyle = "rgba(96, 98, 106, 0.16)";
        ctx.fillRect(gx + 1, gy + 1, tile - 2, 2);
        ctx.fillRect(gx + 1, gy + 1, 2, tile - 2);
        ctx.fillStyle = "rgba(6, 5, 4, 0.4)";
        ctx.fillRect(gx + 1, gy + tile - 3, tile - 2, 2);
        ctx.fillRect(gx + tile - 3, gy + 1, 2, tile - 2);

        // dithered grain
        for (let i = 0; i < 60; i++) {
          const px = gx + 2 + Math.floor(Math.random() * (tile - 4));
          const py = gy + 2 + Math.floor(Math.random() * (tile - 4));
          ctx.fillStyle =
            Math.random() < 0.5
              ? "rgba(8, 7, 6, 0.22)"
              : "rgba(110, 112, 120, 0.06)";
          ctx.fillRect(px, py, 1, 1);
        }

        // faint moss tucked in a corner
        if (Math.random() < 0.22) {
          ctx.fillStyle = "rgba(60, 90, 54, 0.3)";
          ctx.fillRect(gx + 2, gy + tile - 6, 5, 4);
        }
        // short crack kept inside the flag so tiling stays seamless
        if (Math.random() < 0.3) {
          ctx.strokeStyle = "rgba(6, 5, 4, 0.5)";
          ctx.lineWidth = 1;
          let cxp = gx + 6 + Math.random() * (tile - 12);
          let cyp = gy + 6 + Math.random() * (tile - 12);
          ctx.beginPath();
          ctx.moveTo(cxp, cyp);
          for (let s = 0; s < 3; s++) {
            cxp += (Math.random() - 0.5) * 8;
            cyp += (Math.random() - 0.5) * 8;
            ctx.lineTo(cxp, cyp);
          }
          ctx.stroke();
        }
      }
    }

    this.textures.addCanvas("metalFloor", canvas);
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
   * The player/rival sprite: a hooded wizard-delver — pointed wide-brim hat,
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
   * The knight-delver sprite: battered medieval plate, a great helm with a narrow
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

  private playAttackEffect(enemySprite: Phaser.Physics.Arcade.Sprite): void {
    if (!this.player) return;

    // --- 揮擊弧線 ---
    const slash = this.add.graphics();
    slash.setDepth(150);

    const px = this.player.x;
    const py = this.player.y;
    const angle = Phaser.Math.Angle.Between(
      px,
      py,
      enemySprite.x,
      enemySprite.y,
    );
    const radius = 35;

    slash.lineStyle(3, palette.hudText, 1);
    slash.beginPath();
    slash.arc(px, py, radius, angle - 0.8, angle + 0.8, false);
    slash.strokePath();

    // 弧線淡出
    this.tweens.add({
      targets: slash,
      alpha: 0,
      duration: 300,
      ease: "Power2",
      onComplete: () => slash.destroy(),
    });

    // --- 敵人閃紅 ---
    enemySprite.setTint(palette.damage);
    this.time.delayedCall(200, () => {
      enemySprite.clearTint();
    });
  }

  /**
   * Legs under a delver drawn at screen `(x, y)`. The placeholder rig has four
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
    drawDelverLegs(graphics, x, y, nearestScreenFacing(facing), walkPhase, isMoving, darkColor);
  }

  /** The texture key for a class prefix and an 8-way facing (nearest placeholder facing). */
  private facingTexture(prefix: string, facing: Facing8): string {
    return this.facingTextureKey(prefix, nearestScreenFacing(facing));
  }

  private createChestTextures(): void {
    const width = 40;
    const height = 32;

    // 關閉的寶箱
    const closed = this.make.graphics({});
    closed.fillStyle(palette.floor, 1);
    closed.fillRect(0, 10, width, height - 10);
    closed.fillStyle(palette.ground, 1);
    closed.fillRect(0, 0, width, 12);
    closed.fillStyle(palette.frameBright, 1);
    closed.fillRect(0, 10, width, 3);
    closed.fillRect(16, 6, 8, 10);
    closed.lineStyle(2, palette.delverCloak, 1);
    closed.strokeRect(0, 0, width, height);
    closed.generateTexture("chest_closed", width, height);
    closed.destroy();

    // 打開的寶箱
    const open = this.make.graphics({});
    open.fillStyle(palette.floor, 1);
    open.fillRect(0, 16, width, height - 16);
    open.fillStyle(palette.ground, 1);
    open.fillRect(0, 0, width, 10);
    open.fillStyle(palette.hudText, 1);
    open.fillRect(4, 18, width - 8, height - 22);
    open.fillStyle(palette.frameBright, 1);
    open.fillRect(0, 16, width, 3);
    open.lineStyle(2, palette.delverCloak, 1);
    open.strokeRect(0, 0, width, height);
    open.generateTexture("chest_open", width, height);
    open.destroy();
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

  private createEscapeParticleTexture(): void {
    const g = this.add.graphics();
    g.fillStyle(palette.escapeGlow, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture("escape_particle", 8, 8);
    g.destroy();
  }

  /** Burst at a world position. */
  private playEscapeParticles(x: number, y: number): void {
    const at = worldToScreen(x, y);
    const emitter = this.add.particles(at.x, at.y, "escape_particle", {
      speed: { min: 60, max: 180 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 800,
      quantity: 30,
      emitting: false,
      tint: [palette.torch, palette.safe, palette.frameBright],
    });
    emitter.setDepth(1000);
    emitter.explode(30);

    // clean up after animation
    this.time.delayedCall(1000, () => emitter.destroy());
  }

  private updateContainers(containers: ContainerState[]): void {
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
      if (!chest) {
        // 新增寶箱
        const sprite = this.add.sprite(0, 0, "chest_closed");
        this.showContainerFrame(sprite, container.is_open);
        chest = { sprite, entityId: container.entity_id, pos };
        this.chests.set(container.entity_id, chest);
      } else {
        // 更新寶箱狀態
        this.showContainerFrame(chest.sprite, container.is_open);
        chest.pos = pos;
      }
      standAt(chest.sprite, pos);

      // 如果是打開的寶箱，更新跳窗內容
      if (
        container.is_open &&
        this.containerView.entityId === container.entity_id
      ) {
        this.containerView.setItems(container.items);
      }
    });
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
      // a tall arch: it fades while it stands over the delver (FS-2325V §C.5)
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
      } else {
        switchObj.pos = pos;
      }
      // 更新開關狀態
      const state = switchState.is_activated ? "active" : "inactive";
      showState(switchObj.sprite, this.art, "switch", state, `switch_${state}`);
      standAt(switchObj.sprite, switchObj.pos);
    });
  }

  /** A coffer's baked frame for its server state, or the placeholder texture. */
  private showContainerFrame(sprite: Phaser.GameObjects.Sprite, isOpen: boolean): void {
    const state = isOpen ? "open" : "closed";
    showState(sprite, this.art, "chest", state, `chest_${state}`);
  }

  private updateWalls(walls: WallState[]): void {
    const activeEntityIds = new Set(walls.map((w) => w.entity_id));

    // 移除不存在的牆壁
    this.walls.forEach((wall, entityId) => {
      if (!activeEntityIds.has(entityId)) {
        wall.pieces.forEach((piece) => piece.destroy());
        this.walls.delete(entityId);
      }
    });

    // 新增或更新牆壁 — baked pieces when the art is there (FS-2325V §C.2)
    const fresh = walls.filter((w) => !this.walls.has(w.entity_id));
    const baked = fresh.length > 0 ? addWalls(this, this.art, fresh, worldSeed("run")) : null;
    if (baked) {
      this.wallTop = BAKE.WALL_BACK * BAKE.VPX;
      this.occluders.add(baked.tall);
      // a back wall's sconce or window lights the ground either way, but its flame
      // is only in sight while its house's roof is off (the delver is inside)
      const houseOf = new Map(housesFrom(walls).map((h) => [h.id, h]));
      const wallHouse = new Map(walls.map((w) => [w.entity_id, w.house_id]));
      baked.lights.forEach(({ source, wallId, underRoof }) => {
        const house = houseOf.get(wallHouse.get(wallId) ?? "");
        this.lightMap?.add(
          source,
          underRoof && house
            ? () => this.currentBuilding?.x === house.x && this.currentBuilding?.y === house.y
            : undefined,
        );
      });
    }
    fresh.forEach((wallState) => {
      const pieces: Phaser.GameObjects.GameObject[] =
        baked?.byWall.get(wallState.entity_id) ??
        (baked
          ? []
          : addUprightBlock(
              this,
              wallState.position.x,
              wallState.position.y,
              wallState.width,
              wallState.height,
              {
                top: palette.wall,
                south: palette.wallShade,
                east: shade(palette.wall, 0.5),
                edge: { width: 1, color: palette.wallLight, alpha: 0.6 },
              },
            ));
      this.walls.set(wallState.entity_id, { pieces, entityId: wallState.entity_id });
    });

    // 從牆壁反推建築範圍，按 house_id 分組建立屋頂 + 地板（只做一次）
    if (!this.serverBuildingsCreated && walls.length > 0) {
      this.serverBuildingsCreated = true;

      const houses = housesFrom(walls);
      // flagstone under each house, painted into the baked ground (FS-2325V §C.1)
      this.groundLayer?.paint(houses);

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
        }

        // 屋頂 — baked slope and ridge pieces, each sorted by its own footprint
        // (FS-2325V §C.3); without art, the placeholder roof on a lifted plane
        const roof = addRoof(this, this.art, house) ?? [this.placeholderRoof(house)];
        this.occluders.add(
          roof.filter((r): r is Phaser.GameObjects.Sprite => r instanceof Phaser.GameObjects.Sprite),
        );

        // 入口標示（門在下方）— a screen-space marker at the entrance's projection
        const doorMarker = this.add.graphics();
        doorMarker.setDepth(250);
        const entrance = worldToScreen(minX + bw / 2, maxY + 5);
        const doorX = entrance.x;
        const doorY = entrance.y;
        const arrowSize = 10;
        doorMarker.fillStyle(palette.torch, 1);
        doorMarker.fillTriangle(
          doorX,
          doorY - arrowSize,
          doorX - arrowSize,
          doorY + arrowSize,
          doorX + arrowSize,
          doorY + arrowSize,
        );
        doorMarker.lineStyle(3, palette.torch, 0.8);
        doorMarker.strokeCircle(doorX, doorY, 18);
        this.tweens.add({
          targets: doorMarker,
          alpha: 0.4,
          duration: 800,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });

        const wallGroup = this.physics.add.staticGroup();
        const door = this.add.graphics();
        door.setDepth(51);
        const doorCollider = this.add.rectangle(0, 0, 0, 0);
        doorCollider.setVisible(false);

        const building: Building = {
          id: `server_building_${buildingIndex}`,
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
    }
  }

  /** The pre-art roof: a flat slab on a plane lifted to the wall tops. */
  private placeholderRoof(house: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): Phaser.GameObjects.Container {
    const { x, y, width, height } = house;
    // sorted by the house's centre: over a delver behind the house, under one in front
    const roofPlane = addWorldPlane(this, WALL_HEIGHT);
    roofPlane.root.setDepth(worldDepth(x + width / 2, y + height / 2));
    const roof = this.add.graphics();
    roof.fillStyle(palette.wallShade, 0.97);
    roof.fillRect(x - 5, y - 5, width + 10, height + 10);
    roof.lineStyle(2, palette.wall, 1);
    roof.strokeRect(x - 5, y - 5, width + 10, height + 10);
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
        door = { entityId: doorState.entity_id, isOpen: doorState.is_open, pos };
        if (this.art.available) {
          const at = worldToScreen(pos.x, pos.y);
          door.sprite = artSprite(this, this.art, at.x, at.y, sheet, { animation: frame });
          // sorted like the wall it stands in: by the back corner of its footprint
          door.sprite.setDepth(worldDepth(doorState.position.x, doorState.position.y, 1));
          this.occluders.add([door.sprite]);
        } else {
          door.slab = this.placeholderDoor(doorState, pos);
        }
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

    // world positions: the delver's and the closed door's centre
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

    // 如果是關閉跳窗
    if (this.containerView.entityId === entityId) {
      this.containerView.close();
    } else {
      // 開啟跳窗
      this.containerView.open(entityId);

      // If container already has items from server state, populate immediately
      const gameState = this.lastGameState;
      if (gameState) {
        const container = gameState.containers?.find(
          (c) => c.entity_id === entityId,
        );
        if (container && container.is_open && container.items?.length > 0) {
          this.containerView.setItems(container.items);
        }
      }
    }
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
    const openFor = this.containerView.entityId;
    if (!this.player || !me || !openFor) return;

    // the coffer vanished from the server's state: nothing left to show
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

  private toggleInventory(): void {
    if (!this.equipmentPanel) return;
    this.equipmentPanel.toggle();
    if (this.equipmentPanel.isVisible()) {
      this.equipmentPanel.updateInventory(this.inventoryItems);
      this.equipmentPanel.updateEquipment(this.equippedItems);
    }
  }

  private syncInventory(serverInventory: ItemState[]): void {
    const now = Date.now();

    // 建立後端物品 Map (by entity_id)
    const serverItemMap = new Map<string, ItemState>();
    for (const item of serverInventory) {
      serverItemMap.set(item.entity_id, item);
    }

    // 過濾本地物品：保留後端有的 + pending 中的
    const newInventory: ItemState[] = [];

    for (const localItem of this.inventoryItems) {
      const isPending =
        localItem.lootedAt && now - localItem.lootedAt < this.PENDING_DURATION;

      if (serverItemMap.has(localItem.entity_id)) {
        // 後端有，使用後端資料（清除 pending 狀態）
        const serverItem = serverItemMap.get(localItem.entity_id)!;
        newInventory.push({
          ...serverItem,
          lootedAt: undefined, // 後端確認後清除 pending
        });
        serverItemMap.delete(localItem.entity_id);
      } else if (isPending) {
        // 後端沒有，但還在 pending 中，保留本地的
        newInventory.push(localItem);
      }
      // 後端沒有且不是 pending → 不保留（被移除了）
    }

    // 加入後端有但本地沒有的（其他來源的物品）
    for (const item of serverItemMap.values()) {
      newInventory.push(item);
    }

    this.inventoryItems = newInventory;

    // 更新裝備面板
    if (this.equipmentPanel?.isVisible()) {
      this.equipmentPanel.updateInventory(this.inventoryItems);
    }
  }

  // Map backend EquipmentState (chest/gloves/legs) → local EquippedItems (body/hands/feet).
  private syncEquipment(serverEquipment: EquipmentState): void {
    this.equippedItems = {
      weapon: serverEquipment.weapon,
      head: serverEquipment.head,
      body: serverEquipment.chest,
      hands: serverEquipment.gloves,
      feet: serverEquipment.legs,
      ring_1: serverEquipment.ring_1,
      ring_2: serverEquipment.ring_2,
      consumable_1: serverEquipment.consumable_1,
      consumable_2: serverEquipment.consumable_2,
      consumable_3: serverEquipment.consumable_3,
    };

    if (this.equipmentPanel?.isVisible()) {
      this.equipmentPanel.updateEquipment(this.equippedItems);
    }
  }

  /**
   * An item taken from the open satchel (icon click or F): the view has already hidden it and
   * marked its loot pending; tell the server, and hold it in the inventory optimistically.
   */
  private lootChestItem(item: ItemState): void {
    const { action, payload } = lootMessage(item);
    socketManager.sendMessage(action, payload);

    this.inventoryItems.push({
      ...item,
      lootedAt: Date.now(),
    });

    if (this.equipmentPanel?.isVisible()) {
      this.equipmentPanel.updateInventory(this.inventoryItems);
    }
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
    const effectiveClass = (activeChar?.className || className || useGameStore.getState().selectedClass || "warrior").toLowerCase();
    const displayName = activeChar?.name || username || useGameStore.getState().selectedCharacterName || "Hero";

    this.playerTexturePrefix = "player_" + effectiveClass;
    this.playerPos = { x, y };
    this.playerFacing = "se";
    this.walkPhase = 0;
    this.player = this.physics.add.sprite(0, 0, this.facingTexture(this.playerTexturePrefix, this.playerFacing));
    // No world-bounds clamp: the sprite lives in screen space (the projection),
    // and the server is authoritative for where a delver may stand.
    standAt(this.player, this.playerPos, 1);
    const at = worldToScreen(x, y);

    // The class's baked sheet, stood on its footprint by the sheet's anchor
    // (FS-2325V §E.5); the placeholder texture only when the sheet is missing.
    this.playerAnim = new CharacterAnimator(this.art, effectiveClass, this.playerFacing);
    if (this.playerAnim.baked) this.playerAnim.dress(this.player);
    // set circular physics body to match backend collision (radius 20), offset for 60x60 texture
    else this.player.body?.setCircle(20, 10, 10);

    // create legs overlay that will follow player; a baked sheet walks on its own legs
    this.playerLegs = this.add.graphics();
    this.playerLegs.setDepth(worldDepth(x, y, 2));
    if (!this.playerAnim.baked)
      this.drawLegs(this.playerLegs, at.x, at.y, this.playerFacing, 0, false, palette.hudLabel);

    // username label above player
    const base = markerBase(this.player, this.playerAnim.crown, false) ?? at.y;
    this.playerNameText = this.add.text(at.x, base - this.ownNameGap(), displayName, {
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
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
  }

  private defaultCursorCSS = "";
  private crosshairCursorCSS = "";

  private setupCustomCursor(): void {
    // Pixel-art cursors, barrow palette. See docs/design-guideline.md: clean pixel
    // art, nearest-neighbour (no smoothing), in-palette, dark-outlined so the
    // art reads against the dark dungeon. No neon, no anti-aliased strokes.
    const INK = toCss(palette.ink); // outline
    const GLOVE = toCss(palette.hudText); // vellum leather, lit side
    const GLOVE_SHADE = toCss(palette.hudLabel); // darkened vellum, shadow side
    const BRASS = toCss(palette.frame); // wrist cuff band
    const BRASS_HI = toCss(palette.frameBright); // cuff studs / highlight
    const OXBLOOD = toCss(palette.damage); // the kill-mark
    const AMBER = toCss(palette.frameBright); // torch-lit sights
    const CELL = 2; // logical pixel = 2 screen px → chunky, readable pixels

    // --- Default cursor: medieval gloved pointing hand ---
    // 16×16 silhouette ('#' = solid glove). The dark outline and the shaded
    // side are derived from the silhouette so authoring stays simple.
    const HAND = [
      "...##...........",
      "...##...........",
      "...##...........",
      "...##...........",
      "...##...........",
      "...##...........",
      "...###.##.##....",
      "...##########...",
      ".############...",
      ".#############..",
      ".#############..",
      "..############..",
      "..############..",
      "..############..",
      "..############..",
      "..############..",
    ];
    const hGrid = HAND.length;
    const dc = document.createElement("canvas");
    dc.width = hGrid * CELL;
    dc.height = hGrid * CELL;
    const dCtx = dc.getContext("2d")!;
    dCtx.imageSmoothingEnabled = false;
    const solid = (c: number, r: number) =>
      r >= 0 && r < hGrid && c >= 0 && c < hGrid && HAND[r][c] === "#";
    const hPx = (c: number, r: number, color: string) => {
      dCtx.fillStyle = color;
      dCtx.fillRect(c * CELL, r * CELL, CELL, CELL);
    };
    for (let r = 0; r < hGrid; r++) {
      let maxC = -1; // rightmost solid cell → shadow side
      for (let c = 0; c < hGrid; c++) if (solid(c, r)) maxC = c;
      for (let c = 0; c < hGrid; c++) {
        if (solid(c, r)) {
          if (r >= 14)
            hPx(c, r, c % 2 === 0 ? BRASS : BRASS_HI); // wrist cuff
          else if (c === maxC) hPx(c, r, GLOVE_SHADE);
          else hPx(c, r, GLOVE);
        } else if (
          solid(c - 1, r) ||
          solid(c + 1, r) ||
          solid(c, r - 1) ||
          solid(c, r + 1)
        ) {
          hPx(c, r, INK); // auto-outline
        }
      }
    }
    // hotspot = index fingertip (cols 3-4, top row)
    this.defaultCursorCSS = `url(${dc.toDataURL()}) 7 0, default`;
    this.input.setDefaultCursor(this.defaultCursorCSS);

    // --- Targeting cursor: medieval strike-mark (hovering an attackable rival) ---
    // Oxblood centre pip + broken ring = the kill-mark; amber sight-ticks.
    const RG = 15; // odd grid → a true centre cell at 7
    const rc = document.createElement("canvas");
    rc.width = RG * CELL;
    rc.height = RG * CELL;
    const cCtx = rc.getContext("2d")!;
    cCtx.imageSmoothingEnabled = false;
    const marks: Record<string, string> = {};
    const mark = (cells: number[][], color: string) =>
      cells.forEach(([c, r]) => (marks[`${c},${r}`] = color));
    mark(
      [
        [7, 1],
        [7, 2],
        [7, 12],
        [7, 13],
        [1, 7],
        [2, 7],
        [12, 7],
        [13, 7],
      ],
      AMBER,
    );
    mark(
      [
        [7, 7],
        [2, 2],
        [12, 2],
        [2, 12],
        [12, 12],
      ],
      OXBLOOD,
    );
    const isMark = (c: number, r: number) => marks[`${c},${r}`] !== undefined;
    for (let r = 0; r < RG; r++) {
      for (let c = 0; c < RG; c++) {
        if (isMark(c, r)) {
          cCtx.fillStyle = marks[`${c},${r}`];
          cCtx.fillRect(c * CELL, r * CELL, CELL, CELL);
        } else if (
          isMark(c - 1, r) ||
          isMark(c + 1, r) ||
          isMark(c, r - 1) ||
          isMark(c, r + 1)
        ) {
          cCtx.fillStyle = INK; // auto-outline for contrast on any background
          cCtx.fillRect(c * CELL, r * CELL, CELL, CELL);
        }
      }
    }
    const rMid = (RG * CELL) / 2;
    this.crosshairCursorCSS = `url(${rc.toDataURL()}) ${rMid} ${rMid}, crosshair`;
  }

  create(): void {
    // custom crosshair cursor
    this.setupCustomCursor();

    // Connect via SocketManager
    this.connectToServer();

    // The camera and the (vestigial, collision-free) physics world live in
    // projected space: the map is a diamond, clamped by its bounding box plus a
    // margin of dark. FS-2325V §A.3, §A.7.
    const bounds = projectedBounds(this.mapWidth, this.mapHeight, CAMERA_MARGIN);
    this.physics.world.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    this.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    this.cameras.main.setBackgroundColor(palette.mapEdge);

    // Baked art, or placeholders for whatever is missing (FS-2325V "Edge States").
    this.art = registerArt(this);
    this.occluders = new Occluders();
    this.containerView = new ContainerView(
      this,
      this.art,
      { onLoot: (item) => this.lootChestItem(item) },
      new ContainerContents(this.PENDING_DURATION),
    );

    // the map floor, as a diamond on the projection: baked ground tiles when the
    // manifest has them, the placeholder floor otherwise (FS-2325V §C.1)
    this.groundLayer = GroundLayer.available(this.art, "run")
      ? new GroundLayer(this, this.art, {
          width: this.mapWidth,
          height: this.mapHeight,
          kind: "run",
        })
      : undefined;
    if (!this.groundLayer) this.createMapBackground();

    // buildings are now created from server wall data in updateWalls()

    // 寶箱由後端同步，不在這裡創建

    // 輸入控制
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // ESC 返回主選單
    this.input.keyboard?.on("keydown-ESC", () => {
      this.scene.start("MainMenuScene");
    });

    // E 鍵互動（門、寶箱、開關、逃脫門）
    this.input.keyboard?.on("keydown-E", () => {
      // When the equipment panel is open, E equips/unequips the hovered item.
      if (this.equipmentPanel?.isVisible()) {
        this.equipmentPanel.handleEquipKey();
        return;
      }

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
      // 檢查寶箱
      const nearbyChest = this.getNearbyChest();
      if (nearbyChest) {
        this.toggleChest(nearbyChest.entityId);
      }
    });

    // I 鍵開啟/關閉道具欄
    this.input.keyboard?.on("keydown-I", () => {
      this.toggleInventory();
    });

    // F 鍵從寶箱取得道具
    this.input.keyboard?.on("keydown-F", () => {
      this.containerView.lootFirst();
    });

    // Q 鍵關閉任何打開的彈窗
    this.input.keyboard?.on("keydown-Q", () => {
      if (this.equipmentPanel?.isVisible()) {
        this.equipmentPanel.hide();
        return;
      }
      this.containerView.close();
    });

    // H 鍵顯示/隱藏操作說明
    this.input.keyboard?.on("keydown-H", () => {
      this.toggleControlsPanel();
    });

    // Scene-level pointer tracking for satchel hover (bypasses broken Phaser scrollFactor input)
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.containerView.pointerMove(pointer.x, pointer.y);
    });

    // Disable browser right-click menu for equipment panel context menus

    // 技能攻擊控制 (Left-Click Primary Attack 0 MP // Right-Click Special Skill 10 MP)
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      // a click on the open satchel is a loot, never an attack (FS-2325V §D.2)
      if (this.containerView.pointerDown(pointer.x, pointer.y, pointer.button === 0)) return;
      if (!this.player || !this.playerPos || !this.canCastSkill) return;
      if (this.equipmentPanel?.isVisible()) return;

      const activeChar = useGameStore.getState().getActiveCharacter();
      const currentClass = (activeChar?.className || useGameStore.getState().selectedClass || "warrior").toLowerCase();

      // The pointer is over the projection; the server wants the world point under
      // it. `target` and `me` are world positions (FS-2325V §0.2, §A.5).
      const target = screenToWorld(pointer.worldX, pointer.worldY);
      const me = this.playerPos;

      // 左鍵發射一般攻擊 (0 MP)
      if (pointer.leftButtonDown() || pointer.button === 0) {
        if (currentClass === "warrior") {
          // 不管滑鼠在哪裡，通通觸發揮劍劈斬動畫！
          this.playWarriorSlashEffect(me.x, me.y, target.x, target.y);

          // 計算角度與將打擊目標限制在距離 50px 以內
          const dist = Phaser.Math.Distance.Between(
            me.x,
            me.y,
            target.x,
            target.y
          );
          const angle = Phaser.Math.Angle.Between(me.x, me.y, target.x, target.y);
          const effectiveDist = Math.min(dist, 50);
          const hitX = me.x + Math.cos(angle) * effectiveDist;
          const hitY = me.y + Math.sin(angle) * effectiveDist;

          socketManager.sendMessage(ActionType.CastSkill, {
            skill_id: "slash",
            target_x: hitX,
            target_y: hitY,
          });
        } else if (currentClass === "archer") {
          socketManager.sendMessage(ActionType.CastSkill, {
            skill_id: "arrow",
            target_x: target.x,
            target_y: target.y,
          });
          this.playArrowShootEffect(me.x, me.y, target.x, target.y);
        } else {
          socketManager.sendMessage(ActionType.CastSkill, {
            skill_id: "fireball",
            target_x: target.x,
            target_y: target.y,
          });
          this.playFireballCastEffect(me.x, me.y, target.x, target.y);
        }
        // the class attack clip rides the same trigger as the effect (FS-2325V §E.4)
        this.playerAnim?.attack(this.time.now, { x: target.x - me.x, y: target.y - me.y });

        this.canCastSkill = false;
        this.time.delayedCall(250, () => {
          this.canCastSkill = true;
        });
      }
      // 右鍵觸發職業專屬 10 MP 技能
      else if (pointer.rightButtonDown() || pointer.button === 2) {
        if (currentClass === "warrior") {
          socketManager.sendMessage(ActionType.CastSkill, {
            skill_id: "dash",
            target_x: target.x,
            target_y: target.y,
          });
          this.playWarriorDashEffect(me.x, me.y, target.x, target.y);
        } else if (currentClass === "mage") {
          socketManager.sendMessage(ActionType.CastSkill, {
            skill_id: "triple_fireball",
            target_x: target.x,
            target_y: target.y,
          });
          this.playFireballCastEffect(me.x, me.y, target.x, target.y);
        } else if (currentClass === "archer") {
          socketManager.sendMessage(ActionType.CastSkill, {
            skill_id: "triple_arrow",
            target_x: target.x,
            target_y: target.y,
          });
          this.playArrowShootEffect(me.x, me.y, target.x, target.y);
        }
        this.playerAnim?.attack(this.time.now, { x: target.x - me.x, y: target.y - me.y });

        this.canCastSkill = false;
        this.time.delayedCall(400, () => {
          this.canCastSkill = true;
        });
      }
    });

    // Initialize equipment panel
    this.equipmentPanel = new EquipmentPanel(this);
    this.equipmentPanel.onEquip = (item, slot) => {
      // Send to backend
      socketManager.sendMessage(ActionType.Equip, {
        item_entity_id: item.entity_id,
      });
      // Optimistic update
      this.equippedItems[slot] = item;
      this.inventoryItems = this.inventoryItems.filter(
        (i) => i.entity_id !== item.entity_id,
      );
    };
    this.equipmentPanel.onUnequip = (item, slot) => {
      // Send to backend
      socketManager.sendMessage(ActionType.Unequip, {
        item_entity_id: item.entity_id,
      });
      // Optimistic update
      this.equippedItems[slot] = null;
      this.inventoryItems.push(item);
    };

    // 創建室內遮罩（用於遮住建築外面）
    this.indoorMask = this.add.graphics();
    this.indoorMask.setDepth(500);
    this.indoorMask.setVisible(false);

    // 顯示座標 UI
    this.createUI();

    // torch-lit barrow atmosphere — pure decoration, no game state
    this.createAtmosphere();

    // 放開移動鍵時停止
    this.input.keyboard?.on("keyup", (event: KeyboardEvent) => {
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

  private connectToServer(): void {
    // Connect if not already connected
    if (!socketManager.isConnected()) {
      socketManager.connect("ws://localhost:5668/game/ws");
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

    // Listen for exit door unlocked message
    socketManager.on("exit_door_unlocked", (payload: { message: string }) => {
      console.log("Exit door unlocked!", payload);
      this.showNotification(payload.message, toCss(palette.safe));
    });

    // Listen for interact responses (success/error messages)
    socketManager.on(
      "interact",
      (payload: { success: boolean; message: string }) => {
        console.log("Interact response:", payload);
        if (payload.message) {
          const color = payload.success
            ? toCss(palette.safe)
            : toCss(palette.damageBright);
          this.showNotification(payload.message, color);
        }
      },
    );

    // Listen for end_game — show final position overlay and lock interaction
    socketManager.on(
      "end_game",
      (payload: { player_id: string; position: number; result: string }) => {
        console.log("Game ended, final position:", payload);
        this.showGameEndOverlay(payload.position, payload.result);
      },
    );

    // Reset the logger for new session
    GameStateLogger.reset();
  }

  private handleGameStateUpdate(state: ClientGameState): void {
    this.lastGameState = state;

    // Update current player position from server
    if (state.current_player) {
      const pos = state.current_player.position;

      // 第一次收到位置，建立玩家
      if (!this.player) {
        this.createPlayer(pos.x, pos.y, state.current_player.class, state.current_player.username);
      }

      // 設定目標位置，在 update() 中平滑移動
      this.targetPosition = { x: pos.x, y: pos.y };

      // 同步玩家背包
      if (state.current_player.inventory) {
        this.syncInventory(state.current_player.inventory);
      }
      // 同步玩家裝備
      if (state.current_player.equipment) {
        this.syncEquipment(state.current_player.equipment);
      }

      // 同步玩家頭頂 HP/MP 狀態條
      if (!this.playerHpMpGraphics) {
        this.playerHpMpGraphics = this.add.graphics();
        this.playerHpMpGraphics.setDepth(MARKER_DEPTH.bar);
      }
      const curHp = state.current_player.current_health ?? (state.current_player.class === "warrior" ? 150 : 100);
      const maxHp = state.current_player.max_health ?? (state.current_player.class === "warrior" ? 150 : 100);
      const curMp = state.current_player.current_mana ?? 100;
      const maxMp = state.current_player.max_mana ?? 100;
      // 本身受傷變紅閃爍提示
      if (this.prevLocalPlayerHp !== undefined && curHp < this.prevLocalPlayerHp) {
        if (this.player) {
          this.player.setTint(palette.damage);
          this.time.delayedCall(200, () => {
            if (this.player && this.player.active) {
              this.player.clearTint();
            }
          });
        }
      }
      this.prevLocalPlayerHp = curHp;

      if (this.player && this.playerHpMpGraphics) {
        this.drawOverheadHpMpBar(this.playerHpMpGraphics, this.player.x, this.ownMarkerBase(), curHp, maxHp, curMp, maxMp);
      }
    } else {
      // current_player is null — player has escaped
      if (this.player && this.playerPos && this.player.visible) {
        this.playEscapeParticles(this.playerPos.x, this.playerPos.y);
        this.player.setVisible(false);
        this.playerLegs?.setVisible(false);
        this.playerNameText?.setVisible(false);
      }
    }

    // Update other players on screen
    this.updateOtherPlayers(state.other_players || []);

    // Update walls from server
    this.updateWalls(state.walls || []);

    // Update doors from server
    this.updateDoors(state.doors || []);

    // Update containers from server
    this.updateContainers(state.containers || []);

    // Update escape doors from server
    this.updateEscapeDoors(state.escape_doors || []);

    // Update switches from server
    this.updateSwitches(state.switches || []);

    // Update projectiles from server (fireballs)
    this.updateProjectiles(state.projectiles || []);

    // 檢測狀態變化並顯示通知（避免重複）
    this.checkEscapeDoorStateChanges(state);
    this.checkPlayerEscapedState(state);

    // Update escaped count HUD
    if (this.escapedCountText) {
      const count = state.escaped_count ?? 0;
      this.escapedCountText.setText(`Escaped: ${count}`);
    }
  }

  private updateProjectiles(projectiles: ProjectileState[]): void {
    const activeIds = new Set<string>();

    for (const p of projectiles) {
      activeIds.add(p.entity_id);
      const pos = { x: p.position.x, y: p.position.y };
      let entry = this.projectileSprites.get(p.entity_id);

      if (!entry) {
        const container = this.add.container(0, 0);
        const isArrow = p.projectile_type === "arrow";

        if (isArrow) {
          // Arrow pixel graphics: wood shaft, metallic arrowhead, cream fletching
          const arrowG = this.add.graphics();
          arrowG.fillStyle(0x8c6239, 1); // Shaft
          arrowG.fillRect(-10, -1.5, 18, 3);
          arrowG.fillStyle(0xd4d7dc, 1); // Metallic Tip
          arrowG.fillTriangle(8, -4, 18, 0, 8, 4);
          arrowG.fillStyle(0xf2ebd9, 1); // Feather Fletching
          arrowG.fillTriangle(-10, -3.5, -4, 0, -10, 3.5);

          container.add(arrowG);
        } else {
          // Fireball visual layers: outer glow, core, inner highlight
          const outerGlow = this.add.circle(0, 0, 14, 0xff4500, 0.45);
          const innerCore = this.add.circle(0, 0, 8, 0xffa500, 0.9);
          const centerBright = this.add.circle(0, 0, 4, 0xffffff, 1.0);

          container.add([outerGlow, innerCore, centerBright]);

          // Pulsing animation for fireball core
          this.tweens.add({
            targets: innerCore,
            scale: 1.25,
            duration: 150,
            yoyo: true,
            repeat: -1,
          });
        }

        entry = { container, pos, isArrow };
        this.projectileSprites.set(p.entity_id, entry);
      }
      entry.pos = pos;
      // flying at chest height, over whatever stands on the same footprint
      standAt(entry.container, pos, 5);

      // Rotate arrow to velocity angle — the velocity as drawn on the projection
      if (p.velocity && (p.velocity.vx !== 0 || p.velocity.vy !== 0)) {
        const heading = worldToScreen(p.velocity.vx, p.velocity.vy);
        entry.container.setRotation(Math.atan2(heading.y, heading.x));
      }
    }

    // Remove inactive projectiles (hit target or max range)
    for (const [id, entry] of this.projectileSprites.entries()) {
      if (!activeIds.has(id)) {
        if (entry.isArrow) {
          this.playArrowHitEffect(entry.pos.x, entry.pos.y);
        } else {
          this.playFireballExplosion(entry.pos.x, entry.pos.y);
        }
        entry.container.destroy();
        this.projectileSprites.delete(id);
      }
    }
  }

  private playFireballCastEffect(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
  ): void {
    // world positions in; the effect is drawn on the projection
    const start = worldToScreen(startX, startY);
    const aim = worldToScreen(targetX, targetY);
    const angle = Phaser.Math.Angle.Between(start.x, start.y, aim.x, aim.y);
    const flash = this.add.circle(
      start.x + Math.cos(angle) * 15,
      start.y + Math.sin(angle) * 15,
      12,
      0xffa500,
      0.8,
    );
    flash.setDepth(160);
    this.tweens.add({
      targets: flash,
      scale: 1.8,
      alpha: 0,
      duration: 180,
      onComplete: () => flash.destroy(),
    });
  }

  private playFireballExplosion(worldX: number, worldY: number): void {
    const { x, y } = worldToScreen(worldX, worldY);
    const burst = this.add.circle(x, y, 16, 0xff4500, 0.8);
    burst.setDepth(160);
    this.tweens.add({
      targets: burst,
      scale: 2.2,
      alpha: 0,
      duration: 250,
      onComplete: () => burst.destroy(),
    });
  }

  private playArrowShootEffect(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
  ): void {
    // world positions in; the effect is drawn on the projection
    const start = worldToScreen(startX, startY);
    const aim = worldToScreen(targetX, targetY);
    const angle = Phaser.Math.Angle.Between(start.x, start.y, aim.x, aim.y);
    const muzzleX = start.x + Math.cos(angle) * 16;
    const muzzleY = start.y + Math.sin(angle) * 16;

    // Bow string release puff
    const puff = this.add.circle(muzzleX, muzzleY, 6, 0xd4a373, 0.7);
    puff.setDepth(160);
    this.tweens.add({
      targets: puff,
      scale: 1.6,
      alpha: 0,
      duration: 140,
      onComplete: () => puff.destroy(),
    });

    // Arrow streak spark
    const streak = this.add.graphics();
    streak.lineStyle(2, 0xffffff, 0.8);
    streak.lineBetween(
      muzzleX,
      muzzleY,
      muzzleX + Math.cos(angle) * 20,
      muzzleY + Math.sin(angle) * 20,
    );
    streak.setDepth(160);
    this.tweens.add({
      targets: streak,
      alpha: 0,
      duration: 100,
      onComplete: () => streak.destroy(),
    });
  }

  private playArrowHitEffect(worldX: number, worldY: number): void {
    const { x, y } = worldToScreen(worldX, worldY);
    // Wood & metal chip spark particles
    for (let i = 0; i < 4; i++) {
      const chip = this.add.rectangle(
        x + Phaser.Math.Between(-4, 4),
        y + Phaser.Math.Between(-4, 4),
        3,
        3,
        i % 2 === 0 ? 0xd4a373 : 0xffffff,
        0.9,
      );
      chip.setDepth(160);

      const vx = Phaser.Math.FloatBetween(-40, 40);
      const vy = Phaser.Math.FloatBetween(-40, 40);

      this.tweens.add({
        targets: chip,
        x: chip.x + vx,
        y: chip.y + vy,
        alpha: 0,
        duration: 160,
        onComplete: () => chip.destroy(),
      });
    }
  }

  private playWarriorDashEffect(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
  ): void {
    // world positions in; the effect is drawn on the projection
    const start = worldToScreen(startX, startY);
    const aim = worldToScreen(targetX, targetY);
    const angle = Phaser.Math.Angle.Between(start.x, start.y, aim.x, aim.y);

    // Dust cloud at origin
    for (let i = 0; i < 5; i++) {
      const p = this.add.circle(
        start.x + Phaser.Math.Between(-8, 8),
        start.y + Phaser.Math.Between(-8, 8),
        Phaser.Math.Between(4, 8),
        0x8a929a,
        0.6
      );
      p.setDepth(140);
      this.tweens.add({
        targets: p,
        scale: 1.8,
        alpha: 0,
        duration: 250,
        onComplete: () => p.destroy(),
      });
    }

    // Afterimage streak lines along dash path
    const streakGraphics = this.add.graphics();
    streakGraphics.lineStyle(4, palette.torchCore, 0.7);
    streakGraphics.lineBetween(
      start.x,
      start.y,
      start.x + Math.cos(angle) * 160,
      start.y + Math.sin(angle) * 160
    );
    streakGraphics.setDepth(145);
    this.tweens.add({
      targets: streakGraphics,
      alpha: 0,
      duration: 200,
      onComplete: () => streakGraphics.destroy(),
    });
  }

  private playWarriorSlashEffect(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number
  ): void {
    // world positions in; the effect is drawn on the projection
    const start = worldToScreen(startX, startY);
    const aim = worldToScreen(targetX, targetY);
    const slash = this.add.graphics();
    slash.setDepth(150);

    const angle = Phaser.Math.Angle.Between(start.x, start.y, aim.x, aim.y);
    const radius = 35;

    slash.lineStyle(3, palette.hudText, 1);
    slash.beginPath();
    slash.arc(start.x, start.y, radius, angle - 0.8, angle + 0.8, false);
    slash.strokePath();

    this.tweens.add({
      targets: slash,
      alpha: 0,
      duration: 300,
      ease: "Power2",
      onComplete: () => slash.destroy(),
    });
  }

  /**
   * Where the delver's own markers stack from this frame ({@link markerBase}), or null over
   * their baked corpse.
   */
  private ownMarkerBase(): number | null {
    if (!this.player) return null;
    return markerBase(this.player, this.playerAnim?.crown, isDead(this.lastGameState?.current_player));
  }

  /** How far over the marker base the delver's own name sits: clear of the HP bar when baked. */
  private ownNameGap(): number {
    return this.playerAnim?.crown === undefined ? NAME_GAP : NAME_OVER_BAR_GAP;
  }

  /** `top` is the delver's marker base ({@link markerBase}); the bar sits above it. Null: none. */
  private drawOverheadHpMpBar(
    g: Phaser.GameObjects.Graphics,
    x: number,
    top: number | null,
    curHp: number,
    maxHp: number,
    curMp: number,
    maxMp: number
  ): void {
    g.clear();
    if (top === null) return;

    const barW = 38;
    const hpH = 4;
    const mpH = 3;
    const startX = Math.round(x - barW / 2);
    const startY = Math.round(top - HP_BAR_GAP);

    // Pitch backing with a barrow rim
    g.fillStyle(MARKER_BAR.backing, 0.9);
    g.fillRect(startX - 1, startY - 1, barW + 2, hpH + mpH + 3);
    g.lineStyle(1, MARKER_BAR.rim, 0.9);
    g.strokeRect(startX - 1, startY - 1, barW + 2, hpH + mpH + 3);

    // HP fill: oxblood's lifted tone, which holds 3:1 at the canvas edge (FS-2325V §C.9)
    const hpRatio = Math.max(0, Math.min(1, curHp / Math.max(1, maxHp)));
    const hpFillW = Math.round(barW * hpRatio);
    g.fillStyle(MARKER_BAR.hp, 1);
    g.fillRect(startX, startY, hpFillW, hpH);

    // MP fill: necrotic blue-green
    const mpRatio = Math.max(0, Math.min(1, curMp / Math.max(1, maxMp)));
    const mpFillW = Math.round(barW * mpRatio);
    g.fillStyle(MARKER_BAR.mp, 1);
    g.fillRect(startX, startY + hpH + 1, mpFillW, mpH);
  }

  private updateOtherPlayers(
    otherPlayersData: PlayerState[],
  ): void {
    // Track which players are still in the game
    const activePlayerIds = new Set(otherPlayersData.map((p) => p.id));

    // Remove players who left
    this.otherPlayers.forEach((sprite, playerId) => {
      if (!activePlayerIds.has(playerId)) {
        const leftFrom = this.otherPlayersPos.get(playerId);
        if (leftFrom) this.playEscapeParticles(leftFrom.x, leftFrom.y);
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
        // remove hp/mp bar
        const hpMpG = this.otherPlayersHpMpGraphics.get(playerId);
        if (hpMpG) {
          hpMpG.destroy();
          this.otherPlayersHpMpGraphics.delete(playerId);
        }
        if (this.hoveredPlayerId === playerId) {
          this.hoveredPlayerId = undefined;
        }
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
        if (anim.baked) anim.dress(sprite);
        else if (sprite.body) {
          (sprite.body as Phaser.Physics.Arcade.Body).setCircle(20, 10, 10);
        }

        // 點擊攻擊 — hit-tested on the ground they stand on, not their sprite's
        // bounds (FS-2325V §C.6): the server's collision radius around their
        // world position
        sprite.setInteractive({
          hitArea: {},
          hitAreaCallback: footprintHitArea(
            () => this.otherPlayersPos.get(playerData.id) ?? pos,
            PLAYER_FOOTPRINT_RADIUS,
          ),
        });
        sprite.on("pointerdown", () => {
          const me = this.playerPos;
          const them = this.otherPlayersPos.get(playerData.id);
          if (!this.canAttack || !this.player || !me || !them) return;
          // world positions, never the sprites' screen positions
          const distance = Phaser.Math.Distance.Between(me.x, me.y, them.x, them.y);
          if (distance > 60) return;
          const entityId = this.otherPlayersEntityIds.get(playerData.id);
          if (entityId) {
            socketManager.sendMessage(ActionType.Attack, {
              enemy_entity_id: entityId,
            });
            this.playAttackEffect(sprite!);
            this.playerAnim?.attack(this.time.now, { x: them.x - me.x, y: them.y - me.y });
            this.canAttack = false;
            this.time.delayedCall(500, () => {
              this.canAttack = true;
            });
          }
        });

        this.otherPlayers.set(playerData.id, sprite);
        this.otherPlayersEntityIds.set(playerData.id, playerData.entity_id);

        // create legs for this other player
        const legs = this.add.graphics();
        legs.setDepth(worldDepth(pos.x, pos.y, 2));
        this.otherPlayersLegs.set(playerData.id, legs);
        this.otherPlayersFacing.set(playerData.id, "se");
        this.otherPlayersWalkPhase.set(playerData.id, 0);
        if (!anim.baked) this.drawLegs(legs, sprite.x, sprite.y, "se", 0, false, palette.hudLabel);

        // create name text (hidden until hover)
        const nameText = this.add.text(
          sprite.x,
          (markerBase(sprite, anim.crown, false) ?? sprite.y) - NAME_GAP,
          playerData.username || "Unknown",
          {
            fontSize: "11px",
            fontFamily: CANVAS_FONT.body,
            color: toCss(palette.markerRival),
            stroke: toCss(palette.markerStroke),
            strokeThickness: 3,
            align: "center",
          },
        );
        nameText.setOrigin(0.5, 1);
        nameText.setDepth(MARKER_DEPTH.name);
        nameText.setVisible(false);
        this.otherPlayersNameTexts.set(playerData.id, nameText);

        // hover to show name + crosshair cursor
        const pid = playerData.id;
        sprite.on("pointerover", () => {
          this.hoveredPlayerId = pid;
          this.input.setDefaultCursor(this.crosshairCursorCSS);
        });
        sprite.on("pointerout", () => {
          if (this.hoveredPlayerId === pid) {
            this.hoveredPlayerId = undefined;
          }
          this.input.setDefaultCursor(this.defaultCursorCSS);
        });
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
        sprite.setTint(palette.damage);
        this.time.delayedCall(200, () => {
          if (sprite && sprite.active) {
            sprite.clearTint();
          }
        });
      }
      if (curHp !== undefined) {
        this.otherPlayersPrevHp.set(playerData.id, curHp);
      }

      // 其他玩家不顯示頭頂 HP/MP 狀態條（僅個人可見）
      let hpMpG = this.otherPlayersHpMpGraphics.get(playerData.id);
      if (hpMpG) {
        hpMpG.clear();
      }
    });
  }

  /**
   * The map floor. The map is a diamond on the projection: its floor keeps its
   * world-coordinate drawing on a plane that carries the projection, and the
   * corners beyond the diamond are the camera's dark background (FS-2325V §A.7).
   * The old out-of-map hull decoration is gone with the corners it filled.
   */
  private createMapBackground(): void {
    const graphics = this.add.graphics();

    // spaceship floor - tiled metal texture
    const floorTile = this.add.tileSprite(
      0,
      0,
      this.mapWidth,
      this.mapHeight,
      "metalFloor",
    );
    floorTile.setOrigin(0, 0);

    // viewport windows - see space outside
    const windowPositions = [
      { x: 100, y: 0, w: 120, h: 8 },
      { x: 350, y: 0, w: 120, h: 8 },
      { x: 600, y: 0, w: 120, h: 8 },
      { x: 850, y: 0, w: 120, h: 8 },
      { x: 100, y: this.mapHeight - 8, w: 120, h: 8 },
      { x: 350, y: this.mapHeight - 8, w: 120, h: 8 },
      { x: 600, y: this.mapHeight - 8, w: 120, h: 8 },
      { x: 850, y: this.mapHeight - 8, w: 120, h: 8 },
    ];

    const windowGraphics = this.add.graphics();
    windowPositions.forEach((win) => {
      // space visible through window
      windowGraphics.fillStyle(palette.mapEdge, 1);
      windowGraphics.fillRect(win.x, win.y, win.w, win.h);
      // window frame
      windowGraphics.lineStyle(2, palette.wallLight, 0.8);
      windowGraphics.strokeRect(win.x, win.y, win.w, win.h);
      // stars through window
      for (let i = 0; i < 5; i++) {
        const sx = Phaser.Math.Between(win.x + 5, win.x + win.w - 5);
        const sy = Phaser.Math.Between(win.y + 2, win.y + win.h - 2);
        windowGraphics.fillStyle(
          palette.hudText,
          Phaser.Math.FloatBetween(0.4, 1),
        );
        windowGraphics.fillCircle(sx, sy, 1);
      }
    });

    // ambient hull lights along edges
    const lightGraphics = this.add.graphics();
    for (let x = 40; x < this.mapWidth; x += 200) {
      // top edge lights
      lightGraphics.fillStyle(palette.torch, 0.15);
      lightGraphics.fillCircle(x, 15, 30);
      lightGraphics.fillStyle(palette.torch, 0.4);
      lightGraphics.fillCircle(x, 15, 3);
      // bottom edge lights
      lightGraphics.fillStyle(palette.torch, 0.15);
      lightGraphics.fillCircle(x, this.mapHeight - 15, 30);
      lightGraphics.fillStyle(palette.torch, 0.4);
      lightGraphics.fillCircle(x, this.mapHeight - 15, 3);
    }

    // pulsing light animation
    this.tweens.add({
      targets: lightGraphics,
      alpha: 0.5,
      duration: 2000,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    // hull boundary - industrial metal frame
    graphics.lineStyle(6, palette.floorShade, 1);
    graphics.strokeRect(0, 0, this.mapWidth, this.mapHeight);
    graphics.lineStyle(2, palette.floorShade, 1);
    graphics.strokeRect(3, 3, this.mapWidth - 6, this.mapHeight - 6);
    // inner warn trim
    graphics.lineStyle(1, palette.torch, 0.15);
    graphics.strokeRect(6, 6, this.mapWidth - 12, this.mapHeight - 12);

    const plane = addWorldPlane(this);
    plane.root.setDepth(-1);
    plane.surface.add([floorTile, windowGraphics, lightGraphics, graphics]);
    this.groundPlane = plane;

    // save as outdoor objects
    this.outsideObjects.push(graphics);
    this.outsideObjects.push(floorTile);
    this.outsideObjects.push(windowGraphics);
    this.outsideObjects.push(lightGraphics);
  }

  private isPlayerInsideBuilding(building: Building): boolean {
    const me = this.playerPos;
    if (!this.player || !me) return false;
    // the same inside test as ever, on the world position (FS-2325V edge states)
    return (
      me.x >= building.x &&
      me.x <= building.x + building.width &&
      me.y >= building.y &&
      me.y <= building.y + building.height
    );
  }

  private checkBuildingStatus(): void {
    let insideBuilding: Building | null = null;

    for (const building of this.buildings) {
      if (this.isPlayerInsideBuilding(building)) {
        insideBuilding = building;
        break;
      }
    }

    // 狀態改變時更新視覺
    if (insideBuilding !== this.currentBuilding) {
      if (insideBuilding) {
        // 進入建築：隱藏室外物件，顯示當前建築內部
        this.enterBuilding(insideBuilding);
      } else {
        // 離開建築：顯示室外物件
        this.exitBuilding();
      }
      this.currentBuilding = insideBuilding;
    }
  }

  private enterBuilding(building: Building): void {
    // 隱藏當前建築屋頂和入口標示
    building.roof.forEach((part) => part.setVisible(false));
    building.doorMarker.setVisible(false);

    // 隱藏所有入口標示
    this.buildings.forEach((b) => {
      b.doorMarker.setVisible(false);
    });

    // 顯示室內遮罩，遮住建築外面的一切
    this.indoorMask.setVisible(true);
    this.updateIndoorMask(building);
  }

  private exitBuilding(): void {
    // 顯示所有屋頂和入口標示
    this.buildings.forEach((b) => {
      b.roof.forEach((part) => part.setVisible(true));
      b.doorMarker.setVisible(true);
    });

    // 隱藏室內遮罩
    this.indoorMask.setVisible(false);
  }

  private updateIndoorMask(building: Building): void {
    this.indoorMask.clear();

    // 用黑色填充整個地圖，但挖空建築內部區域 — on the projection the house is its
    // floor diamond plus its walls standing `wallTop` above it, so the hole is
    // that hexagon and everything outside it is filled.
    const padding = 5;
    const floor = projectRect(
      building.x - padding,
      building.y - padding,
      building.width + padding * 2,
      building.height + padding * 2,
    );
    const [, right, bottom, left] = floor;
    const [topUp, rightUp, , leftUp] = raise(floor, this.wallTop);
    const house = [topUp, rightUp, right, bottom, left, leftUp];

    // far enough to cover the whole camera range around any house on the map
    const reach = (this.mapWidth + this.mapHeight) * 2;

    this.indoorMask.fillStyle(palette.inkDeep, 1);
    for (const quad of outsideConvex(house, reach)) {
      this.indoorMask.fillPoints(quad, true);
    }
  }

  private createUI(): void {
    const posText = this.add.text(10, 10, "", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "14px",
      color: toCss(palette.hudText),
      backgroundColor: toCss(palette.hudPanel),
      padding: { x: 10, y: 5 },
    });
    posText.setScrollFactor(0);
    posText.setDepth(1000);

    // Escaped players count (top-right)
    this.escapedCountText = this.add.text(
      this.cameras.main.width - 10,
      10,
      "Escaped: 0",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "14px",
        color: toCss(palette.frameBright),
        backgroundColor: toCss(palette.hudPanel),
        padding: { x: 10, y: 5 },
      },
    );
    this.escapedCountText.setOrigin(1, 0); // right-aligned
    this.escapedCountText.setScrollFactor(0);
    this.escapedCountText.setDepth(1000);

    // 每幀更新座標 — scene events outlive a shutdown, so the listener goes with it
    const showPosition = () => {
      if (!this.player) {
        posText.setText("Awaiting the deep...");
        return;
      }
      const status = this.currentBuilding ? `Indoor` : `Outdoor`;
      const pos = this.playerPos ?? { x: 0, y: 0 };
      posText.setText(`X: ${Math.round(pos.x)} Y: ${Math.round(pos.y)} | ${status}`);
    };
    this.events.on("update", showPosition);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off("update", showPosition));
  }

  /**
   * The run's lighting (FS-2325V §C.7–§C.10): the light-map, lit by the barrow's
   * dark ambient, every declared light source in view and the delver's torch; the
   * static vignette and dust above it. Presentation only: it reads and writes no
   * game state, and removing it changes nothing about how the game plays.
   */
  private createAtmosphere(): void {
    this.lightMap = new LightMap(this, AMBIENT.run);
    buildAtmosphere(this);
  }

  private showNotification(message: string, color: string): void {
    // Create notification text at top center of screen
    const notification = this.add.text(
      this.cameras.main.centerX,
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
   * Restamp the light-map and ease the occluders, once per frame. The delver's
   * torch rides on the delver's drawn position; once they have escaped or died
   * there is no light to carry, and the pool fades out.
   */
  private updateLighting(time: number, delta: number): void {
    const self = this.player?.visible ? this.player : undefined;
    this.lightMap?.carry(self ? { x: self.x, y: self.y } : null);
    this.lightMap?.update(time);
    this.occluders.update(self ? { bounds: self.getBounds(), depth: self.depth } : null, delta);
  }

  update(time: number, delta: number): void {
    this.updateLighting(time, delta);

    // skip all input/movement if player has escaped
    if (this.player && !this.player.visible) {
      // still update other players smoothly
      this.updateOtherPlayersSmooth(time, delta);
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

    // update player facing and legs: the placeholder rig (a baked sheet plays below)
    if (this.player && this.playerLegs && !this.playerAnim?.baked) {
      const isMoving = vx !== 0 || vy !== 0;
      if (isMoving) {
        // 8-way facing from the world velocity the delver is asking for; the
        // input itself is sent unchanged below (ADR-0020 §4)
        const newFacing = facingFrom(vx, vy, this.playerFacing);
        if (newFacing !== this.playerFacing) {
          this.playerFacing = newFacing;
          this.player.setTexture(this.facingTexture(this.playerTexturePrefix, newFacing));
        }
        this.walkPhase += 0.3;
      }
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

    // update player name position and overhead HP/MP bar; none over a baked corpse
    const ownBase = this.ownMarkerBase();
    if (this.player && this.playerNameText) {
      if (ownBase !== null) this.playerNameText.setPosition(this.player.x, ownBase - this.ownNameGap());
      this.playerNameText.setVisible(this.player.visible && ownBase !== null);
    }
    if (this.player && this.playerHpMpGraphics && this.lastGameState?.current_player) {
      const p = this.lastGameState.current_player;
      const curHp = p.current_health ?? (p.class === "warrior" ? 150 : 100);
      const maxHp = p.max_health ?? (p.class === "warrior" ? 150 : 100);
      const curMp = p.current_mana ?? 100;
      const maxMp = p.max_mana ?? 100;
      this.drawOverheadHpMpBar(this.playerHpMpGraphics, this.player.x, ownBase, curHp, maxHp, curMp, maxMp);
    }

    // send websocket message for movement
    if (vx !== 0 || vy !== 0) {
      socketManager.sendMessage(ActionType.Move, {
        vx: vx,
        vy: vy,
      });
    }

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
    }

    // the baked sheet plays what the delver is doing, read off the position just drawn
    if (this.player && this.playerPos && this.playerAnim?.baked) {
      const dead = isDead(this.lastGameState?.current_player);
      this.playerAnim.show(this.player, this.playerAnim.step(this.playerPos, time, delta, dead));
    }

    this.updateOtherPlayersSmooth(time, delta);

    // 檢查是否進入/離開建築
    this.checkBuildingStatus();

    // 檢查寶箱距離，太遠自動關閉（只有跳窗開啟時才檢查）
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

        // update name text position and hover visibility; none over a baked corpse
        const nameText = this.otherPlayersNameTexts.get(playerId);
        if (nameText) {
          const base = markerBase(sprite, anim?.crown, dead);
          if (base !== null) nameText.setPosition(sprite.x, base - NAME_GAP);
          nameText.setVisible(this.hoveredPlayerId === playerId && base !== null);
        }

        // update overhead HP/MP bar position (clear for other players)
        const hpMpG = this.otherPlayersHpMpGraphics.get(playerId);
        if (hpMpG) {
          hpMpG.clear();
        }
      }
    });
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
