/**
 * BarrowspireScene - 簡化版遊戲場景
 * 移動邏輯 + WebSocket + 建築（進入後看不到外面）
 */

import Phaser from "phaser";
import { ActionType } from "@/assets/types/client";
import { socketManager } from "@/utils/class/SocketManager";
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
import { GameStateLogger } from "@/utils/gameStateLogger";
import {
  CANVAS_FONT,
  palette,
  rgba,
  shade,
  tint,
  toCss,
} from "@/utils/canvasPalette";

interface Building {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  doorSide: "top" | "bottom" | "left" | "right";
  wallGroup: Phaser.Physics.Arcade.StaticGroup;
  roof: Phaser.GameObjects.Graphics;
  floor: Phaser.GameObjects.Graphics;
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
  private player?: Phaser.Physics.Arcade.Sprite;
  private otherPlayers: Map<string, Phaser.Physics.Arcade.Sprite> = new Map();
  private otherPlayersEntityIds: Map<string, string> = new Map(); // player_id → entity_id
  private otherPlayersTargets: Map<string, { x: number; y: number }> =
    new Map();

  // leg graphics for walking animation
  private playerLegs?: Phaser.GameObjects.Graphics;
  private playerHpMpGraphics?: Phaser.GameObjects.Graphics;
  private otherPlayersHpMpGraphics: Map<string, Phaser.GameObjects.Graphics> = new Map();
  /** The warm pool the delver carries. Built once; only ever repositioned. */
  private torchPool?: Phaser.GameObjects.Image;
  private otherPlayersLegs: Map<string, Phaser.GameObjects.Graphics> =
    new Map();
  private playerFacing: "up" | "down" | "left" | "right" = "down";
  private walkPhase = 0;
  private otherPlayersFacing: Map<string, "up" | "down" | "left" | "right"> =
    new Map();
  private otherPlayersWalkPhase: Map<string, number> = new Map();
  private playerTexturePrefix: string = "player_warrior";
  private otherPlayersClass: Map<string, string> = new Map();

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
  private targetPosition: { x: number; y: number } | null = null;

  // 地圖大小
  private mapWidth = 1440;
  private mapHeight = 960;

  // 建築
  private buildings: Building[] = [];
  private currentBuilding: Building | null = null;
  private outsideObjects: Phaser.GameObjects.GameObject[] = [];
  private indoorMask!: Phaser.GameObjects.Graphics;

  // 寶箱 (從後端同步)
  private chests: Map<
    string,
    { sprite: Phaser.GameObjects.Sprite; entityId: string }
  > = new Map();

  // 逃脫門 (從後端同步)
  private escapeDoors: Map<
    string,
    { sprite: Phaser.GameObjects.Sprite; entityId: string }
  > = new Map();

  // 開關/按鈕 (從後端同步)
  private switches: Map<
    string,
    { sprite: Phaser.GameObjects.Sprite; entityId: string }
  > = new Map();

  // 牆壁 (從後端同步)
  private walls: Map<
    string,
    { graphics: Phaser.GameObjects.Graphics; entityId: string }
  > = new Map();

  // 門 (從後端同步)
  private serverDoors: Map<
    string,
    { rect: Phaser.GameObjects.Rectangle; entityId: string; isOpen: boolean }
  > = new Map();
  private serverBuildingsCreated = false;

  // 寶箱跳窗
  private chestPopup?: Phaser.GameObjects.Container;
  private isPopupOpen = false;
  private openedChestEntityId?: string;
  private popupItemsText?: Phaser.GameObjects.Text;

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

  // Item row grid system (manual hit testing — Phaser input is broken with scrollFactor 0)
  private itemRows: {
    screenRect: { x: number; y: number; w: number; h: number };
    item: ItemState;
    label: Phaser.GameObjects.Text;
    rowBg: Phaser.GameObjects.Graphics;
    source: "chest";
  }[] = [];
  private hoveredRowIndex = -1;
  private hoveredItemEntityId?: string; // Survives row rebuilds
  private lastPointerX = 0;
  private lastPointerY = 0;
  private itemTooltip?: Phaser.GameObjects.Container;
  private chestItemFingerprint = "";

  // 當前寶箱的物品（用於 F 鍵取得）
  private currentChestItems: ItemState[] = [];
  private chestLootedAtMap = new Map<string, number>(); // entityId → loot 時間戳
  private canAttack = true;
  private canCastSkill = true;
  private projectileSprites: Map<string, Phaser.GameObjects.Container> = new Map();
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
    this.createHullTexture();
    this.createEscapeParticleTexture();
  }

  private createHullTexture(): void {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    // Dungeon stone wall: dark slate blocks set in deep mortar, torch-baked
    // top light, moss and hairline cracks. Brick courses tile seamlessly at
    // 128. Texture key kept as "hullMetal" so no scene code changes.
    const brickW = 32;
    const brickH = 16;

    ctx.fillStyle = toCss(palette.inkDeep); // mortar
    ctx.fillRect(0, 0, size, size);

    const courses = size / brickH; // 8
    for (let row = 0; row < courses; row++) {
      const y = row * brickH;
      const offset = row % 2 === 0 ? 0 : -brickW / 2; // running-bond courses
      const lit = 1 - row / (courses * 1.6); // torch "above": top courses warmer
      for (let x = offset; x < size; x += brickW) {
        const v = 52 + Math.floor(Math.random() * 10);
        const r = Math.round(v * (0.85 + 0.25 * lit));
        const gg = Math.round((v + 2) * (0.85 + 0.22 * lit));
        const b = Math.round((v + 6) * (0.82 + 0.2 * lit));
        ctx.fillStyle = `rgb(${r}, ${gg}, ${b})`;
        ctx.fillRect(x + 1, y + 1, brickW - 2, brickH - 2);

        // lit top edge, shadowed bottom edge
        ctx.fillStyle = `rgba(110, 110, 120, ${0.18 * lit + 0.05})`;
        ctx.fillRect(x + 1, y + 1, brickW - 2, 2);
        ctx.fillStyle = "rgba(8, 7, 6, 0.35)";
        ctx.fillRect(x + 1, y + brickH - 3, brickW - 2, 2);

        // dithered grain (no gradients)
        for (let i = 0; i < 26; i++) {
          const gx = x + 1 + Math.floor(Math.random() * (brickW - 2));
          const gy = y + 1 + Math.floor(Math.random() * (brickH - 2));
          ctx.fillStyle =
            Math.random() < 0.5
              ? "rgba(10, 9, 8, 0.25)"
              : `rgba(120, 122, 130, ${0.1 * lit + 0.04})`;
          ctx.fillRect(gx, gy, 1, 1);
        }

        // moss creeping along a block bottom (arcane-deep green)
        if (Math.random() < 0.18) {
          ctx.fillStyle = "rgba(60, 90, 54, 0.5)";
          const mw = 4 + Math.floor(Math.random() * 8);
          ctx.fillRect(
            x + 2 + Math.floor(Math.random() * (brickW - mw - 2)),
            y + brickH - 4,
            mw,
            2,
          );
        }
        // hairline crack within the block
        if (Math.random() < 0.15) {
          ctx.strokeStyle = "rgba(8, 7, 6, 0.5)";
          ctx.lineWidth = 1;
          const cxp = x + 4 + Math.random() * (brickW - 8);
          ctx.beginPath();
          ctx.moveTo(cxp, y + 2);
          ctx.lineTo(cxp + (Math.random() - 0.5) * 6, y + brickH - 3);
          ctx.stroke();
        }
      }
    }

    this.textures.addCanvas("hullMetal", canvas);
  }

  private createMetalFloorTexture(): void {
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

  private drawLegs(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    facing: "up" | "down" | "left" | "right",
    walkPhase: number,
    isMoving: boolean,
    darkColor: number,
  ): void {
    graphics.clear();

    const legWidth = 6;
    const legHeight = 9;
    const swing = isMoving ? Math.sin(walkPhase) * 4.5 : 0;

    graphics.fillStyle(darkColor, 1);

    if (facing === "down" || facing === "up") {
      // two legs side by side, offset vertically when walking
      graphics.fillRect(x - 7, y + 18 + swing, legWidth, legHeight);
      graphics.fillRect(x + 1, y + 18 - swing, legWidth, legHeight);
    } else {
      // side view — legs overlap, offset horizontally when walking
      graphics.fillRect(x - 3 + swing, y + 18, legWidth, legHeight);
      graphics.fillRect(x - 3 - swing, y + 18, legWidth, legHeight);
    }
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

  private playEscapeParticles(x: number, y: number): void {
    const emitter = this.add.particles(x, y, "escape_particle", {
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

      if (!chest) {
        // 新增寶箱
        const sprite = this.add.sprite(
          container.position.x,
          container.position.y,
          container.is_open ? "chest_open" : "chest_closed",
        );
        sprite.setDepth(50);
        chest = { sprite, entityId: container.entity_id };
        this.chests.set(container.entity_id, chest);
      } else {
        // 更新寶箱狀態
        chest.sprite.setTexture(
          container.is_open ? "chest_open" : "chest_closed",
        );
        chest.sprite.setPosition(container.position.x, container.position.y);
      }

      // 如果是打開的寶箱，更新跳窗內容
      if (
        container.is_open &&
        this.openedChestEntityId === container.entity_id
      ) {
        this.updatePopupItems(container.items, container.entity_id);
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

    // 新增或更新逃脫門
    escapeDoors.forEach((door) => {
      let escapeDoor = this.escapeDoors.get(door.entity_id);

      if (!escapeDoor) {
        // 根據狀態選擇 texture
        let texture = "escape_door_locked";
        if (door.is_open) {
          texture = "escape_door_open";
        } else if (!door.is_locked) {
          texture = "escape_door_unlocked";
        }

        // 新增逃脫門
        const sprite = this.add.sprite(
          door.position.x,
          door.position.y,
          texture,
        );
        sprite.setDepth(55); // 比寶箱稍高一點
        escapeDoor = { sprite, entityId: door.entity_id };
        this.escapeDoors.set(door.entity_id, escapeDoor);
      } else {
        // 更新逃脫門狀態
        let texture = "escape_door_locked";
        if (door.is_open) {
          texture = "escape_door_open";
        } else if (!door.is_locked) {
          texture = "escape_door_unlocked";
        }
        escapeDoor.sprite.setTexture(texture);
        escapeDoor.sprite.setPosition(door.position.x, door.position.y);
      }
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

    // 新增或更新開關
    switches.forEach((switchState) => {
      let switchObj = this.switches.get(switchState.entity_id);

      if (!switchObj) {
        // 新增開關
        const sprite = this.add.sprite(
          switchState.position.x,
          switchState.position.y,
          switchState.is_activated ? "switch_active" : "switch_inactive",
        );
        sprite.setDepth(50);
        switchObj = { sprite, entityId: switchState.entity_id };
        this.switches.set(switchState.entity_id, switchObj);
      } else {
        // 更新開關狀態
        switchObj.sprite.setTexture(
          switchState.is_activated ? "switch_active" : "switch_inactive",
        );
        switchObj.sprite.setPosition(
          switchState.position.x,
          switchState.position.y,
        );
      }
    });
  }

  private updateWalls(walls: WallState[]): void {
    const activeEntityIds = new Set(walls.map((w) => w.entity_id));

    // 移除不存在的牆壁
    this.walls.forEach((wall, entityId) => {
      if (!activeEntityIds.has(entityId)) {
        wall.graphics.destroy();
        this.walls.delete(entityId);
      }
    });

    // 新增或更新牆壁
    walls.forEach((wallState) => {
      let wall = this.walls.get(wallState.entity_id);

      if (!wall) {
        const graphics = this.add.graphics();
        graphics.fillStyle(palette.wall, 1);
        graphics.fillRect(
          wallState.position.x,
          wallState.position.y,
          wallState.width,
          wallState.height,
        );
        graphics.lineStyle(1, palette.wallLight, 0.6);
        graphics.strokeRect(
          wallState.position.x,
          wallState.position.y,
          wallState.width,
          wallState.height,
        );
        graphics.setDepth(50);
        wall = { graphics, entityId: wallState.entity_id };
        this.walls.set(wallState.entity_id, wall);
      }
    });

    // 從牆壁反推建築範圍，按 house_id 分組建立屋頂 + 地板（只做一次）
    if (!this.serverBuildingsCreated && walls.length > 0) {
      this.serverBuildingsCreated = true;

      // 按 house_id 分組
      const houseGroups = new Map<string, WallState[]>();
      walls.forEach((w) => {
        if (!w.house_id) return;
        const group = houseGroups.get(w.house_id) || [];
        group.push(w);
        houseGroups.set(w.house_id, group);
      });

      let buildingIndex = 0;
      houseGroups.forEach((houseWalls, _houseId) => {
        // 算出這棟房子的 bounding box
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        houseWalls.forEach((w) => {
          minX = Math.min(minX, w.position.x);
          minY = Math.min(minY, w.position.y);
          maxX = Math.max(maxX, w.position.x + w.width);
          maxY = Math.max(maxY, w.position.y + w.height);
        });

        const bw = maxX - minX;
        const bh = maxY - minY;

        // 地板
        const floor = this.add.graphics();
        floor.fillStyle(palette.wallShade, 1);
        floor.fillRect(minX, minY, bw, bh);
        floor.lineStyle(1, palette.wallShade, 0.4);
        for (let tx = minX; tx < maxX; tx += 40) {
          floor.lineBetween(tx, minY, tx, maxY);
        }
        for (let ty = minY; ty < maxY; ty += 40) {
          floor.lineBetween(minX, ty, maxX, ty);
        }
        floor.setDepth(1);

        // 屋頂
        const roof = this.add.graphics();
        roof.fillStyle(palette.wallShade, 0.97);
        roof.fillRect(minX - 5, minY - 5, bw + 10, bh + 10);
        roof.lineStyle(2, palette.wall, 1);
        roof.strokeRect(minX - 5, minY - 5, bw + 10, bh + 10);
        roof.setDepth(200);

        // 入口標示（門在下方）
        const doorMarker = this.add.graphics();
        doorMarker.setDepth(250);
        const doorX = minX + bw / 2;
        const doorY = maxY + 5;
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

        this.outsideObjects.push(roof);

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
          floor,
          doorMarker,
          door,
          doorCollider,
          isOpen: true,
        };
        this.buildings.push(building);
        buildingIndex++;
      });
    }
  }

  private updateDoors(doors: DoorState[]): void {
    const activeEntityIds = new Set(doors.map((d) => d.entity_id));

    // 移除不存在的門
    this.serverDoors.forEach((door, entityId) => {
      if (!activeEntityIds.has(entityId)) {
        door.rect.destroy();
        this.serverDoors.delete(entityId);
      }
    });

    // 新增或更新門
    doors.forEach((doorState) => {
      let door = this.serverDoors.get(doorState.entity_id);

      if (!door) {
        const rect = this.add.rectangle(
          doorState.position.x,
          doorState.position.y + doorState.height / 2,
          doorState.width,
          doorState.height,
          palette.wallLight,
        );
        rect.setOrigin(0, 0.5);
        rect.setStrokeStyle(2, palette.wallLight);
        rect.setDepth(51);

        door = { rect, entityId: doorState.entity_id, isOpen: false };
        this.serverDoors.set(doorState.entity_id, door);

        if (doorState.is_open) {
          door.isOpen = true;
          rect.setRotation(Math.PI / 2);
        }
      } else if (door.isOpen !== doorState.is_open) {
        door.isOpen = doorState.is_open;
        const targetRotation = doorState.is_open ? Math.PI / 2 : 0;

        this.tweens.add({
          targets: door.rect,
          rotation: targetRotation,
          duration: 300,
          ease: "Power2",
        });
      }
    });
  }

  private getNearbyDoor(): { entityId: string } | null {
    if (!this.player) return null;
    const interactDistance = 60;

    for (const [entityId, door] of this.serverDoors) {
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        door.rect.x + door.rect.width / 2,
        door.rect.y,
      );
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
    if (this.isPopupOpen && this.openedChestEntityId === entityId) {
      this.hideChestPopup();
      this.openedChestEntityId = undefined;
    } else {
      // 開啟跳窗
      this.openedChestEntityId = entityId;
      this.showChestPopup();

      // If container already has items from server state, populate immediately
      const gameState = this.lastGameState;
      if (gameState) {
        const container = gameState.containers?.find(
          (c) => c.entity_id === entityId,
        );
        if (container && container.is_open && container.items?.length > 0) {
          this.updatePopupItems(container.items, entityId);
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
    if (!this.player || !this.openedChestEntityId || !this.isPopupOpen) return;

    const chest = this.chests.get(this.openedChestEntityId);
    if (!chest) return;

    const distance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      chest.sprite.x,
      chest.sprite.y,
    );

    const interactDistance = 60;
    if (distance > interactDistance) {
      // Just close popup locally, let backend state control chest visual
      this.hideChestPopup();
      this.openedChestEntityId = undefined;
    }
  }

  private showChestPopup(): void {
    if (this.isPopupOpen) return;

    const centerX = this.cameras.main.width / 2;
    const centerY = this.cameras.main.height / 2;
    const popupWidth = 320;
    const popupHeight = 280;

    const bg = this.add.graphics();
    bg.fillStyle(palette.ink, 0.9);
    bg.fillRoundedRect(
      -popupWidth / 2,
      -popupHeight / 2,
      popupWidth,
      popupHeight,
      8,
    );
    bg.lineStyle(1, palette.frame, 1);
    bg.strokeRoundedRect(
      -popupWidth / 2,
      -popupHeight / 2,
      popupWidth,
      popupHeight,
      8,
    );

    const title = this.add.text(0, -popupHeight / 2 + 20, "COFFER", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "18px",
      color: toCss(palette.frameBright),
      letterSpacing: 6,
    });
    title.setOrigin(0.5);

    // Placeholder for empty/loading state
    this.popupItemsText = this.add.text(0, 0, "Rummaging...", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "14px",
      color: toCss(palette.hudLabel),
      align: "center",
    });
    this.popupItemsText.setOrigin(0.5);

    const hint = this.add.text(
      0,
      popupHeight / 2 - 25,
      "Q Close  //  F Take Item",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "12px",
        color: toCss(palette.hudFaint),
      },
    );
    hint.setOrigin(0.5);

    this.chestPopup = this.add.container(centerX, centerY, [
      bg,
      title,
      this.popupItemsText,
      hint,
    ]);
    this.chestPopup.setDepth(1000);
    this.chestPopup.setScrollFactor(0);

    this.isPopupOpen = true;
  }

  private updatePopupItems(items: ItemState[], entityId?: string): void {
    if (!this.chestPopup) return;

    const chestId = entityId || this.openedChestEntityId;
    if (!chestId) return;

    const now = Date.now();

    // Filter out items that are still pending pickup (sent interact, awaiting server confirmation)
    const displayItems = items.filter((item) => {
      const lootedAt = this.chestLootedAtMap.get(item.entity_id);
      if (lootedAt && now - lootedAt < this.PENDING_DURATION) {
        return false;
      }
      if (lootedAt) {
        this.chestLootedAtMap.delete(item.entity_id);
      }
      return true;
    });

    this.currentChestItems = displayItems.map((item) => ({ ...item }));

    // Skip rebuild if items haven't changed (prevents hover flicker from game loop)
    const fingerprint = displayItems.map((i) => i.entity_id).join(",");
    if (fingerprint === this.chestItemFingerprint) return;
    this.chestItemFingerprint = fingerprint;

    this.clearItemRows("chest");

    if (displayItems.length === 0) {
      if (this.popupItemsText) {
        this.popupItemsText.setText("(Picked clean)");
        this.popupItemsText.setVisible(true);
      }
    } else {
      if (this.popupItemsText) this.popupItemsText.setVisible(false);
      this.createItemRows(displayItems, this.chestPopup, -50, "chest");
    }
  }

  private hideChestPopup(): void {
    this.clearItemRows("chest");
    this.chestItemFingerprint = "";
    if (this.chestPopup) {
      this.chestPopup.destroy();
      this.chestPopup = undefined;
    }
    this.popupItemsText = undefined;
    this.isPopupOpen = false;
    this.currentChestItems = [];
    // 不清除 chestLootedAtMap，讓後端確認時自動清除
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

  // === Item row grid system with manual hit testing ===

  private clearItemRows(source: "chest" | "all"): void {
    this.hideItemTooltip();
    this.hoveredRowIndex = -1;
    const remaining: typeof this.itemRows = [];
    for (const row of this.itemRows) {
      if (source === "all" || row.source === source) {
        row.label.destroy();
        row.rowBg.destroy();
      } else {
        remaining.push(row);
      }
    }
    this.itemRows = remaining;
  }

  private formatItemLine(item: ItemState): string {
    const tag = this.getItemStatTag(item);
    return tag ? `${item.name}  ${tag}` : `${item.name} x${item.quantity}`;
  }

  private getItemStatTag(item: ItemState): string {
    if (item.attack_power) return `ATK ${item.attack_power}`;
    if (item.defense_rating) return `DEF ${item.defense_rating}`;
    if (item.healing_amount) return `+${item.healing_amount} HP`;
    if (item.mana_amount) return `+${item.mana_amount} MP`;
    return "";
  }

  private createItemRows(
    items: ItemState[],
    container: Phaser.GameObjects.Container,
    startY: number,
    source: "chest",
  ): void {
    const rowHeight = 28;
    const popupWidth = 320;
    const rowWidth = popupWidth - 16;
    const containerX = container.x;
    const containerY = container.y;

    items.forEach((item, i) => {
      // localY = top edge of row in container-local coords
      const rowTop = startY + i * rowHeight;
      const rowCenterY = rowTop + rowHeight / 2;

      // Row background inside container
      const rowBg = this.add.graphics();
      this.drawRowBg(rowBg, i, rowWidth, rowHeight, rowTop, false);
      container.add(rowBg);

      // Text label centered in row
      const label = this.add.text(0, rowCenterY, this.formatItemLine(item), {
        fontFamily: CANVAS_FONT.body,
        fontSize: "13px",
        color: toCss(palette.hudText),
      });
      label.setOrigin(0.5);
      container.add(label);

      // Screen-space rect for manual hit testing
      const screenRect = {
        x: containerX - rowWidth / 2,
        y: containerY + rowTop,
        w: rowWidth,
        h: rowHeight,
      };

      this.itemRows.push({ screenRect, item, label, rowBg, source });
    });

    // If we had a hovered item before rebuild, restore hover state
    if (this.hoveredItemEntityId) {
      this.restoreHoverState();
    }
  }

  /** Restore hover after rows are rebuilt (e.g. item was looted from chest, triggering rebuild) */
  private restoreHoverState(): void {
    for (let i = 0; i < this.itemRows.length; i++) {
      if (this.itemRows[i].item.entity_id === this.hoveredItemEntityId) {
        this.hoveredRowIndex = i;
        this.applyRowHover(i);
        this.showItemTooltip(
          this.itemRows[i].item,
          this.lastPointerX,
          this.lastPointerY,
        );
        return;
      }
    }
    // Item no longer exists (was looted etc.)
    this.hoveredItemEntityId = undefined;
    this.hoveredRowIndex = -1;
  }

  private drawRowBg(
    g: Phaser.GameObjects.Graphics,
    index: number,
    rowWidth: number,
    rowHeight: number,
    rowTop: number,
    hovered: boolean,
  ): void {
    g.clear();
    if (hovered) {
      g.fillStyle(palette.frame, 0.08);
      g.fillRoundedRect(-rowWidth / 2, rowTop, rowWidth, rowHeight, 4);
      g.lineStyle(1, palette.frame, 0.2);
      g.strokeRoundedRect(-rowWidth / 2, rowTop, rowWidth, rowHeight, 4);
    } else {
      const bgAlpha = index % 2 === 0 ? 0.25 : 0.15;
      g.fillStyle(palette.hudPanelDeep, bgAlpha);
      g.fillRoundedRect(-rowWidth / 2, rowTop, rowWidth, rowHeight, 4);
      g.lineStyle(1, palette.frame, 0.06);
      g.lineBetween(
        -rowWidth / 2 + 8,
        rowTop + rowHeight,
        rowWidth / 2 - 8,
        rowTop + rowHeight,
      );
    }
  }

  private getRowLocalTop(row: (typeof this.itemRows)[0]): number {
    return row.screenRect.y - (this.chestPopup?.y ?? 0);
  }

  private getRowWidth(_row: (typeof this.itemRows)[0]): number {
    return 320 - 16;
  }

  private applyRowHover(index: number): void {
    const row = this.itemRows[index];
    row.label.setColor(toCss(palette.frameBright));
    this.drawRowBg(
      row.rowBg,
      index,
      this.getRowWidth(row),
      row.screenRect.h,
      this.getRowLocalTop(row),
      true,
    );
  }

  private applyRowUnhover(index: number): void {
    const row = this.itemRows[index];
    row.label.setColor(toCss(palette.hudText));
    this.drawRowBg(
      row.rowBg,
      index,
      this.getRowWidth(row),
      row.screenRect.h,
      this.getRowLocalTop(row),
      false,
    );
  }

  private handleItemRowHover(pointerX: number, pointerY: number): void {
    this.lastPointerX = pointerX;
    this.lastPointerY = pointerY;

    let foundIndex = -1;
    for (let i = 0; i < this.itemRows.length; i++) {
      const { screenRect } = this.itemRows[i];
      if (
        pointerX >= screenRect.x &&
        pointerX <= screenRect.x + screenRect.w &&
        pointerY >= screenRect.y &&
        pointerY <= screenRect.y + screenRect.h
      ) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex === this.hoveredRowIndex) {
      // Same row — just move tooltip
      if (foundIndex !== -1) {
        this.moveItemTooltip(pointerX, pointerY);
      }
      return;
    }

    // Unhover previous
    if (
      this.hoveredRowIndex !== -1 &&
      this.hoveredRowIndex < this.itemRows.length
    ) {
      this.applyRowUnhover(this.hoveredRowIndex);
      this.hideItemTooltip();
    }

    this.hoveredRowIndex = foundIndex;
    this.hoveredItemEntityId =
      foundIndex !== -1 ? this.itemRows[foundIndex].item.entity_id : undefined;

    // Hover new
    if (foundIndex !== -1) {
      this.applyRowHover(foundIndex);
      this.showItemTooltip(this.itemRows[foundIndex].item, pointerX, pointerY);
    }
  }

  private getItemType(
    item: ItemState,
  ): "weapon" | "armor" | "consumable" | "unknown" {
    if (item.attack_power || item.weapon_type) return "weapon";
    if (item.defense_rating || item.armor_slot) return "armor";
    if (item.healing_amount || item.mana_amount) return "consumable";
    return "unknown";
  }

  private buildTooltipContent(item: ItemState): {
    lines: { label: string; value: string; color: string }[];
    typeLabel: string;
    typeColor: string;
  } {
    const type = this.getItemType(item);
    const lines: { label: string; value: string; color: string }[] = [];

    switch (type) {
      case "weapon": {
        const typeColor = toCss(palette.damageBright);
        if (item.weapon_type)
          lines.push({
            label: "TYPE",
            value: item.weapon_type.toUpperCase(),
            color: toCss(palette.hudLabel),
          });
        if (item.attack_power)
          lines.push({
            label: "ATK",
            value: `${item.attack_power}`,
            color: typeColor,
          });
        if (item.critical_rate)
          lines.push({
            label: "CRIT",
            value: `${Math.round(item.critical_rate)}%`,
            color: toCss(palette.torch),
          });
        return { lines, typeLabel: "WEAPON", typeColor };
      }
      case "armor": {
        const typeColor = toCss(palette.hostile);
        if (item.armor_slot)
          lines.push({
            label: "SLOT",
            value: item.armor_slot.toUpperCase(),
            color: toCss(palette.hudLabel),
          });
        if (item.defense_rating)
          lines.push({
            label: "DEF",
            value: `${item.defense_rating}`,
            color: typeColor,
          });
        return { lines, typeLabel: "ARMOR", typeColor };
      }
      case "consumable": {
        const typeColor = toCss(palette.safe);
        if (item.healing_amount)
          lines.push({
            label: "HEAL",
            value: `+${item.healing_amount} HP`,
            color: typeColor,
          });
        if (item.mana_amount)
          lines.push({
            label: "MANA",
            value: `+${item.mana_amount} MP`,
            color: toCss(palette.frameBright),
          });
        return { lines, typeLabel: "CONSUMABLE", typeColor };
      }
      default:
        return { lines, typeLabel: "ITEM", typeColor: toCss(palette.hudLabel) };
    }
  }

  private showItemTooltip(
    item: ItemState,
    screenX: number,
    screenY: number,
  ): void {
    this.hideItemTooltip();

    const { lines, typeLabel, typeColor } = this.buildTooltipContent(item);
    const padding = 14;
    const tooltipWidth = 220;

    const children: Phaser.GameObjects.GameObject[] = [];
    let curY = padding;

    // Item name
    const nameText = this.add.text(padding, curY, item.name, {
      fontFamily: CANVAS_FONT.body,
      fontSize: "15px",
      color: toCss(palette.frameBright),
      fontStyle: "bold",
    });
    children.push(nameText);
    curY += 22;

    // Type badge
    const typeText = this.add.text(padding, curY, typeLabel, {
      fontFamily: CANVAS_FONT.body,
      fontSize: "10px",
      color: typeColor,
      letterSpacing: 3,
    });
    children.push(typeText);
    curY += 20;

    // Separator line
    const sep = this.add.graphics();
    sep.lineStyle(1, palette.frame, 0.15);
    sep.lineBetween(padding, curY, tooltipWidth - padding, curY);
    children.push(sep);
    curY += 10;

    // Stat rows
    for (const line of lines) {
      const labelText = this.add.text(padding, curY, line.label, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "12px",
        color: toCss(palette.hudLabel),
        letterSpacing: 2,
      });
      const valueText = this.add.text(
        tooltipWidth - padding,
        curY,
        line.value,
        {
          fontFamily: CANVAS_FONT.body,
          fontSize: "13px",
          color: line.color,
        },
      );
      valueText.setOrigin(1, 0);
      children.push(labelText, valueText);
      curY += 20;
    }

    // Description
    if (item.description) {
      curY += 6;
      const descSep = this.add.graphics();
      descSep.lineStyle(1, palette.frame, 0.1);
      descSep.lineBetween(padding, curY, tooltipWidth - padding, curY);
      children.push(descSep);
      curY += 8;
      const desc = this.add.text(padding, curY, item.description, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "11px",
        color: toCss(palette.hudLabel),
        wordWrap: { width: tooltipWidth - padding * 2 },
        lineSpacing: 4,
      });
      children.push(desc);
      curY += desc.height;
    }

    // Quantity (if >1)
    if (item.quantity > 1) {
      curY += 6;
      const qtyText = this.add.text(
        tooltipWidth - padding,
        curY,
        `x${item.quantity}`,
        {
          fontFamily: CANVAS_FONT.body,
          fontSize: "11px",
          color: toCss(palette.hudLabel),
        },
      );
      qtyText.setOrigin(1, 0);
      children.push(qtyText);
      curY += 16;
    }

    const tooltipHeight = curY + padding;

    // Background (drawn first, inserted at index 0)
    const bg = this.add.graphics();
    bg.fillStyle(palette.mapEdge, 0.95);
    bg.fillRoundedRect(0, 0, tooltipWidth, tooltipHeight, 6);
    bg.lineStyle(
      1,
      typeColor === toCss(palette.hudLabel)
        ? palette.frameBright
        : parseInt(typeColor.slice(1), 16),
      0.4,
    );
    bg.strokeRoundedRect(0, 0, tooltipWidth, tooltipHeight, 6);
    children.unshift(bg);

    this.itemTooltip = this.add.container(screenX + 14, screenY - 10, children);
    this.itemTooltip.setDepth(2000);
    this.itemTooltip.setScrollFactor(0);

    // Keep tooltip on screen
    const cam = this.cameras.main;
    if (screenX + 14 + tooltipWidth > cam.width) {
      this.itemTooltip.setX(screenX - tooltipWidth - 8);
    }
    if (screenY - 10 + tooltipHeight > cam.height) {
      this.itemTooltip.setY(screenY - tooltipHeight - 8);
    }
  }

  private moveItemTooltip(screenX: number, screenY: number): void {
    if (!this.itemTooltip) return;
    this.itemTooltip.setPosition(screenX + 14, screenY - 10);
  }

  private hideItemTooltip(): void {
    if (this.itemTooltip) {
      this.itemTooltip.destroy();
      this.itemTooltip = undefined;
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

  private pickupSingleItemFromChest(): void {
    if (
      !this.isPopupOpen ||
      this.currentChestItems.length === 0 ||
      !this.openedChestEntityId
    ) {
      return;
    }

    const item = this.currentChestItems[0];

    socketManager.sendMessage(ActionType.Interact, {
      entity_id: item.entity_id,
    });

    // Optimistic update: remove from chest, add to inventory
    this.currentChestItems = this.currentChestItems.filter(
      (i) => i.entity_id !== item.entity_id,
    );

    const now = Date.now();
    this.inventoryItems.push({
      ...item,
      lootedAt: now,
    });

    this.chestLootedAtMap.set(item.entity_id, now);

    this.updatePopupItems(this.currentChestItems);

    if (this.equipmentPanel?.isVisible()) {
      this.equipmentPanel.updateInventory(this.inventoryItems);
    }
  }

  private getNearbyChest(): { entityId: string } | null {
    if (!this.player) return null;
    const interactDistance = 60;

    for (const [entityId, chest] of this.chests) {
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        chest.sprite.x,
        chest.sprite.y,
      );
      if (distance < interactDistance) {
        return { entityId };
      }
    }
    return null;
  }

  private getNearbySwitch(): { entityId: string } | null {
    if (!this.player) return null;
    const interactDistance = 60;

    for (const [entityId, switchObj] of this.switches) {
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        switchObj.sprite.x,
        switchObj.sprite.y,
      );
      if (distance < interactDistance) {
        return { entityId };
      }
    }
    return null;
  }

  private getNearbyEscapeDoor(): { entityId: string } | null {
    if (!this.player) return null;
    const interactDistance = 60;

    for (const [entityId, escapeDoor] of this.escapeDoors) {
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        escapeDoor.sprite.x,
        escapeDoor.sprite.y,
      );
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
    this.player = this.physics.add.sprite(x, y, this.facingTextureKey(this.playerTexturePrefix, "down"));
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(100);

    // set circular physics body to match backend collision (radius 20), offset for 60x60 texture
    this.player.body?.setCircle(20, 10, 10);

    // create legs overlay that will follow player
    this.playerLegs = this.add.graphics();
    this.playerLegs.setDepth(101);
    this.playerFacing = "down";
    this.walkPhase = 0;
    this.drawLegs(this.playerLegs, x, y, "down", 0, false, palette.hudLabel);

    // username label above player
    this.playerNameText = this.add.text(x, y - 35, displayName, {
      fontSize: "11px",
      fontFamily: CANVAS_FONT.body,
      color: toCss(palette.frameBright),
      stroke: toCss(palette.ink),
      strokeThickness: 3,
      align: "center",
    });
    this.playerNameText.setOrigin(0.5, 1);
    this.playerNameText.setDepth(102);

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

    // setup world boundaries
    this.physics.world.setBounds(0, 0, this.mapWidth, this.mapHeight);

    // create map background with cosmic theme
    this.createMapBackground();

    // buildings are now created from server wall data in updateWalls()

    // 寶箱由後端同步，不在這裡創建

    // 設置相機邊界（擴大讓玩家能看到船外太空）
    const outerMargin = 200;
    const spaceMargin = 150; // extra space beyond hull visible at edges
    this.cameras.main.setBounds(
      -outerMargin - spaceMargin,
      -outerMargin - spaceMargin,
      this.mapWidth + (outerMargin + spaceMargin) * 2,
      this.mapHeight + (outerMargin + spaceMargin) * 2,
    );

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
      this.pickupSingleItemFromChest();
    });

    // Q 鍵關閉任何打開的彈窗
    this.input.keyboard?.on("keydown-Q", () => {
      if (this.equipmentPanel?.isVisible()) {
        this.equipmentPanel.hide();
        return;
      }
      if (this.isPopupOpen) {
        this.hideChestPopup();
        this.openedChestEntityId = undefined;
      }
    });

    // H 鍵顯示/隱藏操作說明
    this.input.keyboard?.on("keydown-H", () => {
      this.toggleControlsPanel();
    });

    // Scene-level pointer tracking for item row hover (bypasses broken Phaser scrollFactor input)
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.handleItemRowHover(pointer.x, pointer.y);
    });

    // Disable browser right-click menu for equipment panel context menus
    this.input.mouse?.disableContextMenu();

    // 技能攻擊控制 (Left-Click Primary Attack 0 MP // Right-Click Special Skill 10 MP)
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.player || !this.canCastSkill) return;
      if (this.equipmentPanel?.isVisible()) return;

      const activeChar = useGameStore.getState().getActiveCharacter();
      const currentClass = (activeChar?.className || useGameStore.getState().selectedClass || "warrior").toLowerCase();

      // 左鍵發射一般攻擊 (0 MP)
      if (pointer.leftButtonDown() || pointer.button === 0) {
        if (currentClass === "warrior") {
          // 不管滑鼠在哪裡，通通觸發揮劍劈斬動畫！
          this.playWarriorSlashEffect(this.player.x, this.player.y, pointer.worldX, pointer.worldY);

          // 計算角度與將打擊目標限制在距離 50px 以內
          const dist = Phaser.Math.Distance.Between(
            this.player.x,
            this.player.y,
            pointer.worldX,
            pointer.worldY
          );
          const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
          const effectiveDist = Math.min(dist, 50);
          const hitX = this.player.x + Math.cos(angle) * effectiveDist;
          const hitY = this.player.y + Math.sin(angle) * effectiveDist;

          socketManager.sendMessage(ActionType.CastSkill, {
            skill_id: "slash",
            target_x: hitX,
            target_y: hitY,
          });
        } else if (currentClass === "archer") {
          socketManager.sendMessage(ActionType.CastSkill, {
            skill_id: "arrow",
            target_x: pointer.worldX,
            target_y: pointer.worldY,
          });
          this.playArrowShootEffect(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
        } else {
          socketManager.sendMessage(ActionType.CastSkill, {
            skill_id: "fireball",
            target_x: pointer.worldX,
            target_y: pointer.worldY,
          });
          this.playFireballCastEffect(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
        }

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
            target_x: pointer.worldX,
            target_y: pointer.worldY,
          });
          this.playWarriorDashEffect(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
        } else if (currentClass === "mage") {
          socketManager.sendMessage(ActionType.CastSkill, {
            skill_id: "triple_fireball",
            target_x: pointer.worldX,
            target_y: pointer.worldY,
          });
          this.playFireballCastEffect(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
        } else if (currentClass === "archer") {
          socketManager.sendMessage(ActionType.CastSkill, {
            skill_id: "triple_arrow",
            target_x: pointer.worldX,
            target_y: pointer.worldY,
          });
          this.playArrowShootEffect(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
        }

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
    socketManager.onConnectionStatusChange((status) => {
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
        this.playerHpMpGraphics.setDepth(103);
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
        this.drawOverheadHpMpBar(this.playerHpMpGraphics, this.player.x, this.player.y, curHp, maxHp, curMp, maxMp);
      }
    } else {
      // current_player is null — player has escaped
      if (this.player && this.player.visible) {
        this.playEscapeParticles(this.player.x, this.player.y);
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
      let container = this.projectileSprites.get(p.entity_id);

      if (!container) {
        container = this.add.container(p.position.x, p.position.y);
        container.setDepth(150);

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
          (container as any).isArrowType = true;
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

        this.projectileSprites.set(p.entity_id, container);
      } else {
        container.setPosition(p.position.x, p.position.y);
      }

      // Rotate arrow to velocity angle
      if (p.velocity && (p.velocity.vx !== 0 || p.velocity.vy !== 0)) {
        const angle = Math.atan2(p.velocity.vy, p.velocity.vx);
        container.setRotation(angle);
      }
    }

    // Remove inactive projectiles (hit target or max range)
    for (const [id, container] of this.projectileSprites.entries()) {
      if (!activeIds.has(id)) {
        if ((container as any).isArrowType) {
          this.playArrowHitEffect(container.x, container.y);
        } else {
          this.playFireballExplosion(container.x, container.y);
        }
        container.destroy();
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
    const angle = Phaser.Math.Angle.Between(startX, startY, targetX, targetY);
    const flash = this.add.circle(
      startX + Math.cos(angle) * 15,
      startY + Math.sin(angle) * 15,
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

  private playFireballExplosion(x: number, y: number): void {
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
    const angle = Phaser.Math.Angle.Between(startX, startY, targetX, targetY);
    const muzzleX = startX + Math.cos(angle) * 16;
    const muzzleY = startY + Math.sin(angle) * 16;

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

  private playArrowHitEffect(x: number, y: number): void {
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
    const angle = Phaser.Math.Angle.Between(startX, startY, targetX, targetY);

    // Dust cloud at origin
    for (let i = 0; i < 5; i++) {
      const p = this.add.circle(
        startX + Phaser.Math.Between(-8, 8),
        startY + Phaser.Math.Between(-8, 8),
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
      startX,
      startY,
      startX + Math.cos(angle) * 160,
      startY + Math.sin(angle) * 160
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
    const slash = this.add.graphics();
    slash.setDepth(150);

    const angle = Phaser.Math.Angle.Between(startX, startY, targetX, targetY);
    const radius = 35;

    slash.lineStyle(3, palette.hudText, 1);
    slash.beginPath();
    slash.arc(startX, startY, radius, angle - 0.8, angle + 0.8, false);
    slash.strokePath();

    this.tweens.add({
      targets: slash,
      alpha: 0,
      duration: 300,
      ease: "Power2",
      onComplete: () => slash.destroy(),
    });
  }

  private drawOverheadHpMpBar(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    curHp: number,
    maxHp: number,
    curMp: number,
    maxMp: number
  ): void {
    g.clear();

    const barW = 38;
    const hpH = 4;
    const mpH = 3;
    const startX = Math.round(x - barW / 2);
    const startY = Math.round(y - 40);

    // Charcoal Border Frame
    g.fillStyle(0x0c0a08, 0.9);
    g.fillRect(startX - 1, startY - 1, barW + 2, hpH + mpH + 3);
    g.lineStyle(1, 0x3d3126, 0.9);
    g.strokeRect(startX - 1, startY - 1, barW + 2, hpH + mpH + 3);

    // HP Bar Fill (Crimson Red)
    const hpRatio = Math.max(0, Math.min(1, curHp / Math.max(1, maxHp)));
    const hpFillW = Math.round(barW * hpRatio);
    g.fillStyle(0xd93838, 1);
    g.fillRect(startX, startY, hpFillW, hpH);

    // MP Bar Fill (Arcane Blue)
    const mpRatio = Math.max(0, Math.min(1, curMp / Math.max(1, maxMp)));
    const mpFillW = Math.round(barW * mpRatio);
    g.fillStyle(0x2980b9, 1);
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
        this.playEscapeParticles(sprite.x, sprite.y);
        sprite.destroy();
        this.otherPlayers.delete(playerId);
        this.otherPlayersTargets.delete(playerId);

        // remove legs too
        const legs = this.otherPlayersLegs.get(playerId);
        if (legs) {
          legs.destroy();
          this.otherPlayersLegs.delete(playerId);
        }
        this.otherPlayersFacing.delete(playerId);
        this.otherPlayersWalkPhase.delete(playerId);

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
        // Create new sprite for this player
        sprite = this.physics.add.sprite(
          playerData.position.x,
          playerData.position.y,
          this.facingTextureKey("other_" + cls, "down"),
        );
        sprite.setDepth(99);

        if (sprite.body) {
          (sprite.body as Phaser.Physics.Arcade.Body).setCircle(20, 10, 10);
        }

        // 點擊攻擊
        sprite.setInteractive();
        sprite.on("pointerdown", () => {
          if (!this.canAttack || !this.player) return;
          const distance = Phaser.Math.Distance.Between(
            this.player.x,
            this.player.y,
            sprite!.x,
            sprite!.y,
          );
          if (distance > 60) return;
          const entityId = this.otherPlayersEntityIds.get(playerData.id);
          if (entityId) {
            socketManager.sendMessage(ActionType.Attack, {
              enemy_entity_id: entityId,
            });
            this.playAttackEffect(sprite!);
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
        legs.setDepth(100);
        this.otherPlayersLegs.set(playerData.id, legs);
        this.otherPlayersFacing.set(playerData.id, "down");
        this.otherPlayersWalkPhase.set(playerData.id, 0);
        this.drawLegs(
          legs,
          playerData.position.x,
          playerData.position.y,
          "down",
          0,
          false,
          palette.hudLabel,
        );

        // create name text (hidden until hover)
        const nameText = this.add.text(
          playerData.position.x,
          playerData.position.y - 35,
          playerData.username || "Unknown",
          {
            fontSize: "11px",
            fontFamily: CANVAS_FONT.body,
            color: toCss(palette.safe),
            stroke: toCss(palette.ink),
            strokeThickness: 3,
            align: "center",
          },
        );
        nameText.setOrigin(0.5, 1);
        nameText.setDepth(102);
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

  private createMapBackground(): void {
    const graphics = this.add.graphics();
    const outerMargin = 200;

    // === deep space beyond the ship hull ===
    const spaceMargin = 150;
    const spaceOuter = outerMargin + spaceMargin; // camera limit

    // dark space backdrop — only the ring beyond the hull
    const spaceBg = this.add.graphics();
    spaceBg.fillStyle(palette.mapEdge, 1);
    // fill the full camera area, then the hull area will be drawn on top at depth -1
    spaceBg.fillRect(
      -spaceOuter,
      -spaceOuter,
      this.mapWidth + spaceOuter * 2,
      this.mapHeight + spaceOuter * 2,
    );
    spaceBg.setDepth(-3);

    // scatter stars only in the space region beyond the hull
    for (let i = 0; i < 150; i++) {
      const star = this.add.graphics();
      const size = Phaser.Math.FloatBetween(0.4, 2);
      const color =
        i < 90
          ? palette.hudText
          : i < 120
            ? palette.hudText
            : palette.torchCore;
      star.fillStyle(color, Phaser.Math.FloatBetween(0.4, 1));
      star.fillCircle(0, 0, size);
      star.setPosition(
        Phaser.Math.Between(-spaceOuter, this.mapWidth + spaceOuter),
        Phaser.Math.Between(-spaceOuter, this.mapHeight + spaceOuter),
      );
      star.setScrollFactor(Phaser.Math.FloatBetween(0.3, 0.5));
      star.setDepth(-2);

      if (i % 4 === 0) {
        this.tweens.add({
          targets: star,
          alpha: 0.1,
          duration: Phaser.Math.Between(1000, 3000),
          ease: "Sine.easeInOut",
          yoyo: true,
          repeat: -1,
          delay: Phaser.Math.Between(0, 2000),
        });
      }
    }

    // === outer hull structure (fills entire outer area) ===
    const hw2 = this.mapWidth;
    const hh2 = this.mapHeight;

    // hull plating with metal texture
    // top
    const hullTop = this.add.tileSprite(
      -outerMargin,
      -outerMargin,
      hw2 + outerMargin * 2,
      outerMargin,
      "hullMetal",
    );
    hullTop.setOrigin(0, 0);
    hullTop.setDepth(-1);
    // bottom
    const hullBottom = this.add.tileSprite(
      -outerMargin,
      hh2,
      hw2 + outerMargin * 2,
      outerMargin,
      "hullMetal",
    );
    hullBottom.setOrigin(0, 0);
    hullBottom.setDepth(-1);
    // left
    const hullLeft = this.add.tileSprite(
      -outerMargin,
      0,
      outerMargin,
      hh2,
      "hullMetal",
    );
    hullLeft.setOrigin(0, 0);
    hullLeft.setDepth(-1);
    // right
    const hullRight = this.add.tileSprite(
      hw2,
      0,
      outerMargin,
      hh2,
      "hullMetal",
    );
    hullRight.setOrigin(0, 0);
    hullRight.setDepth(-1);
    // corners
    const hullTopLeft = this.add.tileSprite(
      -outerMargin,
      -outerMargin,
      outerMargin,
      outerMargin,
      "hullMetal",
    );
    hullTopLeft.setOrigin(0, 0);
    hullTopLeft.setDepth(-1);
    const hullTopRight = this.add.tileSprite(
      hw2,
      -outerMargin,
      outerMargin,
      outerMargin,
      "hullMetal",
    );
    hullTopRight.setOrigin(0, 0);
    hullTopRight.setDepth(-1);
    const hullBottomLeft = this.add.tileSprite(
      -outerMargin,
      hh2,
      outerMargin,
      outerMargin,
      "hullMetal",
    );
    hullBottomLeft.setOrigin(0, 0);
    hullBottomLeft.setDepth(-1);
    const hullBottomRight = this.add.tileSprite(
      hw2,
      hh2,
      outerMargin,
      outerMargin,
      "hullMetal",
    );
    hullBottomRight.setOrigin(0, 0);
    hullBottomRight.setDepth(-1);

    // === viewports (windows to see space) ===
    const viewportGraphics = this.add.graphics();

    const viewports = [
      // top windows
      { x: 120, y: -outerMargin + 20, w: 140, h: 80 },
      { x: 450, y: -outerMargin + 15, w: 160, h: 90 },
      { x: 800, y: -outerMargin + 25, w: 130, h: 75 },
      // bottom windows
      { x: 170, y: hh2 + outerMargin - 100, w: 150, h: 80 },
      { x: 550, y: hh2 + outerMargin - 95, w: 140, h: 80 },
      { x: 900, y: hh2 + outerMargin - 105, w: 120, h: 75 },
      // left windows
      { x: -outerMargin + 20, y: 120, w: 80, h: 120 },
      { x: -outerMargin + 15, y: 420, w: 85, h: 130 },
      // right windows
      { x: hw2 + outerMargin - 100, y: 170, w: 80, h: 120 },
      { x: hw2 + outerMargin - 105, y: 500, w: 85, h: 125 },
    ];

    viewports.forEach((vp) => {
      // space visible through viewport
      viewportGraphics.fillStyle(palette.mapEdge, 1);
      viewportGraphics.fillRoundedRect(vp.x, vp.y, vp.w, vp.h, 6);
      // window frame
      viewportGraphics.lineStyle(3, palette.wallShade, 1);
      viewportGraphics.strokeRoundedRect(vp.x, vp.y, vp.w, vp.h, 6);
      viewportGraphics.lineStyle(1, palette.wall, 1);
      viewportGraphics.strokeRoundedRect(
        vp.x + 3,
        vp.y + 3,
        vp.w - 6,
        vp.h - 6,
        4,
      );
    });

    // parallax stars in viewports
    viewports.forEach((vp) => {
      for (let i = 0; i < 8; i++) {
        const star = this.add.graphics();
        const size = Phaser.Math.FloatBetween(0.5, 2);
        const color = i < 5 ? palette.hudText : palette.hudText;
        star.fillStyle(color, Phaser.Math.FloatBetween(0.6, 1));
        star.fillCircle(0, 0, size);
        const sx = Phaser.Math.Between(vp.x + 10, vp.x + vp.w - 10);
        const sy = Phaser.Math.Between(vp.y + 10, vp.y + vp.h - 10);
        star.setPosition(sx, sy);
        star.setScrollFactor(Phaser.Math.FloatBetween(0.85, 0.95));
        star.setDepth(0);

        if (i < 3) {
          this.tweens.add({
            targets: star,
            alpha: 0.1,
            duration: Phaser.Math.Between(800, 2000),
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: -1,
            delay: Phaser.Math.Between(0, 1500),
          });
        }
      }
    });

    viewportGraphics.setDepth(0);

    // === spaceship hull exterior ===
    const hullGraphics = this.add.graphics();
    const hw = this.mapWidth;
    const hh = this.mapHeight;
    const hullPad = 8;

    // outer hull shell - thick border around the ship
    hullGraphics.lineStyle(10, palette.wallShade, 1);
    hullGraphics.strokeRoundedRect(
      -hullPad,
      -hullPad,
      hw + hullPad * 2,
      hh + hullPad * 2,
      12,
    );
    hullGraphics.lineStyle(3, palette.wall, 1);
    hullGraphics.strokeRoundedRect(
      -hullPad - 5,
      -hullPad - 5,
      hw + hullPad * 2 + 10,
      hh + hullPad * 2 + 10,
      16,
    );
    hullGraphics.lineStyle(1, palette.wallLight, 1);
    hullGraphics.strokeRoundedRect(
      -hullPad - 8,
      -hullPad - 8,
      hw + hullPad * 2 + 16,
      hh + hullPad * 2 + 16,
      18,
    );

    // ventilation grilles (top)
    const ventGraphics = this.add.graphics();
    const ventPositions = [
      { x: 150, y: -60, w: 80, h: 35, horizontal: true },
      { x: 450, y: -55, w: 60, h: 30, horizontal: true },
      { x: 800, y: -65, w: 70, h: 35, horizontal: true },
      // bottom
      { x: 250, y: hh + 25, w: 80, h: 35, horizontal: true },
      { x: 650, y: hh + 30, w: 60, h: 30, horizontal: true },
      // left
      { x: -70, y: 200, w: 35, h: 60, horizontal: false },
      { x: -60, y: 500, w: 30, h: 70, horizontal: false },
      // right (away from engines)
      { x: hw + 25, y: 100, w: 35, h: 50, horizontal: false },
    ];
    ventPositions.forEach((v) => {
      // vent frame
      ventGraphics.fillStyle(palette.wallShade, 1);
      ventGraphics.fillRect(v.x, v.y, v.w, v.h);
      ventGraphics.lineStyle(1, palette.wallShade, 1);
      ventGraphics.strokeRect(v.x, v.y, v.w, v.h);
      // grille slats
      ventGraphics.lineStyle(1, palette.wallShade, 1);
      if (v.horizontal) {
        for (let ly = v.y + 5; ly < v.y + v.h - 2; ly += 5) {
          ventGraphics.lineBetween(v.x + 3, ly, v.x + v.w - 3, ly);
        }
      } else {
        for (let lx = v.x + 5; lx < v.x + v.w - 2; lx += 5) {
          ventGraphics.lineBetween(lx, v.y + 3, lx, v.y + v.h - 3);
        }
      }
    });
    ventGraphics.setDepth(0);

    // pipes / conduits along hull
    const pipeGraphics = this.add.graphics();
    // top pipes
    pipeGraphics.lineStyle(4, palette.wallShade, 1);
    pipeGraphics.lineBetween(40, -25, hw - 40, -25);
    pipeGraphics.lineStyle(2, palette.wall, 1);
    pipeGraphics.lineBetween(40, -30, hw - 40, -30);
    // bottom pipes
    pipeGraphics.lineStyle(4, palette.wallShade, 1);
    pipeGraphics.lineBetween(40, hh + 25, hw - 40, hh + 25);
    pipeGraphics.lineStyle(2, palette.wall, 1);
    pipeGraphics.lineBetween(40, hh + 30, hw - 40, hh + 30);
    // left pipes
    pipeGraphics.lineStyle(4, palette.wallShade, 1);
    pipeGraphics.lineBetween(-25, 40, -25, hh - 40);
    pipeGraphics.lineStyle(2, palette.wall, 1);
    pipeGraphics.lineBetween(-30, 40, -30, hh - 40);
    // right pipes
    pipeGraphics.lineStyle(4, palette.wallShade, 1);
    pipeGraphics.lineBetween(hw + 25, 40, hw + 25, hh - 40);
    pipeGraphics.lineStyle(2, palette.wall, 1);
    pipeGraphics.lineBetween(hw + 30, 40, hw + 30, hh - 40);
    pipeGraphics.setDepth(0);

    // engines (right side - 3 engines)
    const engineGraphics = this.add.graphics();
    const engineX = hw + outerMargin - 20;
    const enginePositions = [hh * 0.2, hh * 0.5, hh * 0.8];

    enginePositions.forEach((ey) => {
      // engine housing
      engineGraphics.fillStyle(palette.wallShade, 1);
      engineGraphics.fillRoundedRect(hw + 10, ey - 30, outerMargin - 25, 60, 6);
      engineGraphics.lineStyle(2, palette.wall, 1);
      engineGraphics.strokeRoundedRect(
        hw + 10,
        ey - 30,
        outerMargin - 25,
        60,
        6,
      );
      // inner detail
      engineGraphics.fillStyle(palette.wallShade, 1);
      engineGraphics.fillRoundedRect(hw + 20, ey - 20, outerMargin - 45, 40, 4);
      engineGraphics.lineStyle(1, palette.wallLight, 1);
      engineGraphics.strokeRoundedRect(
        hw + 20,
        ey - 20,
        outerMargin - 45,
        40,
        4,
      );
      // exhaust glow layers
      engineGraphics.fillStyle(palette.hostile, 1);
      engineGraphics.fillCircle(engineX, ey, 45);
      engineGraphics.fillStyle(palette.hostile, 1);
      engineGraphics.fillCircle(engineX, ey, 28);
      engineGraphics.fillStyle(palette.torch, 1);
      engineGraphics.fillCircle(engineX, ey, 15);
      engineGraphics.fillStyle(palette.hudText, 1);
      engineGraphics.fillCircle(engineX, ey, 6);
    });
    engineGraphics.setDepth(0);

    // engine glow pulse
    this.tweens.add({
      targets: engineGraphics,
      alpha: 0.5,
      duration: 1500,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    // corner structural beams
    const beamGraphics = this.add.graphics();
    // top-left
    beamGraphics.lineStyle(5, palette.wallShade, 1);
    beamGraphics.lineBetween(-outerMargin + 10, -outerMargin + 10, -5, -5);
    beamGraphics.lineStyle(3, palette.wall, 1);
    beamGraphics.lineBetween(-outerMargin + 15, -outerMargin + 5, 0, -10);
    // top-right
    beamGraphics.lineStyle(5, palette.wallShade, 1);
    beamGraphics.lineBetween(
      hw + outerMargin - 10,
      -outerMargin + 10,
      hw + 5,
      -5,
    );
    beamGraphics.lineStyle(3, palette.wall, 1);
    beamGraphics.lineBetween(hw + outerMargin - 15, -outerMargin + 5, hw, -10);
    // bottom-left
    beamGraphics.lineStyle(5, palette.wallShade, 1);
    beamGraphics.lineBetween(
      -outerMargin + 10,
      hh + outerMargin - 10,
      -5,
      hh + 5,
    );
    beamGraphics.lineStyle(3, palette.wall, 1);
    beamGraphics.lineBetween(
      -outerMargin + 15,
      hh + outerMargin - 5,
      0,
      hh + 10,
    );
    // bottom-right
    beamGraphics.lineStyle(5, palette.wallShade, 1);
    beamGraphics.lineBetween(
      hw + outerMargin - 10,
      hh + outerMargin - 10,
      hw + 5,
      hh + 5,
    );
    beamGraphics.lineStyle(3, palette.wall, 1);
    beamGraphics.lineBetween(
      hw + outerMargin - 15,
      hh + outerMargin - 5,
      hw,
      hh + 10,
    );
    beamGraphics.setDepth(0);

    // hull warning stripes at corners
    const stripeGraphics = this.add.graphics();
    const corners = [
      { x: -outerMargin + 15, y: -outerMargin + 15 },
      { x: hw + outerMargin - 45, y: -outerMargin + 15 },
      { x: -outerMargin + 15, y: hh + outerMargin - 45 },
      { x: hw + outerMargin - 45, y: hh + outerMargin - 45 },
    ];
    corners.forEach((c) => {
      for (let i = 0; i < 3; i++) {
        stripeGraphics.fillStyle(palette.ember, 1);
        stripeGraphics.fillRect(c.x + i * 10, c.y, 5, 30);
      }
    });
    stripeGraphics.setDepth(0);

    hullGraphics.setDepth(0);

    // spaceship floor - tiled metal texture
    const floorTile = this.add.tileSprite(
      0,
      0,
      this.mapWidth,
      this.mapHeight,
      "metalFloor",
    );
    floorTile.setOrigin(0, 0);
    floorTile.setDepth(-1);

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
    windowGraphics.setDepth(-1);

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
    lightGraphics.setDepth(-1);

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

    graphics.setDepth(-1);

    // save as outdoor objects
    this.outsideObjects.push(graphics);
    this.outsideObjects.push(floorTile);
    this.outsideObjects.push(windowGraphics);
    this.outsideObjects.push(lightGraphics);
  }

  private isPlayerInsideBuilding(building: Building): boolean {
    if (!this.player) return false;
    return (
      this.player.x >= building.x &&
      this.player.x <= building.x + building.width &&
      this.player.y >= building.y &&
      this.player.y <= building.y + building.height
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
    building.roof.setVisible(false);
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
      b.roof.setVisible(true);
      b.doorMarker.setVisible(true);
    });

    // 隱藏室內遮罩
    this.indoorMask.setVisible(false);
  }

  private updateIndoorMask(building: Building): void {
    this.indoorMask.clear();

    // 用黑色填充整個地圖，但挖空建築內部區域
    const padding = 5;
    const bx = building.x - padding;
    const by = building.y - padding;
    const bw = building.width + padding * 2;
    const bh = building.height + padding * 2;

    this.indoorMask.fillStyle(palette.inkDeep, 1);

    // 上方區域
    this.indoorMask.fillRect(-1000, -1000, this.mapWidth + 2000, by + 1000);
    // 下方區域
    this.indoorMask.fillRect(
      -1000,
      by + bh,
      this.mapWidth + 2000,
      this.mapHeight + 1000,
    );
    // 左側區域
    this.indoorMask.fillRect(-1000, by, bx + 1000, bh);
    // 右側區域
    this.indoorMask.fillRect(bx + bw, by, this.mapWidth + 1000, bh);
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

    // 每幀更新座標
    this.events.on("update", () => {
      if (!this.player) {
        posText.setText("Awaiting the deep...");
        return;
      }
      const status = this.currentBuilding ? `Indoor` : `Outdoor`;
      posText.setText(
        `X: ${Math.round(this.player.x)} Y: ${Math.round(this.player.y)} | ${status}`,
      );
    });
  }

  /**
   * Torch-lit barrow atmosphere. Camera-fixed decorative overlays only — a warm
   * torch pool, a pressing vignette, and a little drifting dust. Reads and
   * mutates no game state; sits above the world (depth ~900) but beneath the
   * HUD (depth 1000) and popups (depth 2000). Removing this method would change
   * nothing about how the game plays.
   */
  private createAtmosphere(): void {
    // Re-entering the scene on reconnect must not stack a second overlay.
    if (this.torchPool?.scene) return;

    const cam = this.cameras.main;
    const w = cam.width;
    const h = cam.height;

    // --- torch pool: warm radial glow around the (camera-centred) player ---
    const torchKey = "atmoTorch";
    if (!this.textures.exists(torchKey)) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const g = canvas.getContext("2d")!;
      const grad = g.createRadialGradient(256, 256, 0, 256, 256, 256);
      grad.addColorStop(0, rgba(palette.torch, 0.22));
      grad.addColorStop(0.45, rgba(palette.ember, 0.1));
      grad.addColorStop(1, rgba(palette.inkDeep, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, 512, 512);
      this.textures.addCanvas(torchKey, canvas);
    }
    const torch = this.add.image(w / 2, h / 2, torchKey);
    const torchSize = Math.max(w, h) * 1.5;
    torch.setDisplaySize(torchSize, torchSize);
    torch.setScrollFactor(0);
    torch.setDepth(900);
    torch.setBlendMode(Phaser.BlendModes.ADD);
    this.torchPool = torch;
    // presentation-only torch flicker
    this.tweens.add({
      targets: torch,
      alpha: { from: 0.82, to: 1 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // --- vignette: darkness pressing in at the screen edges ---
    const vigKey = `atmoVignette_${w}x${h}`;
    if (!this.textures.exists(vigKey)) {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext("2d")!;
      const grad = g.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.3,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.72,
      );
      // Readability floor: an entity at the canvas edge must stay legible, and
      // rivals are read by their eyes against dark ground. If play shows this
      // hiding them, THIS is the number that yields — not the enemy accent.
      grad.addColorStop(0, rgba(palette.inkDeep, 0));
      grad.addColorStop(0.7, rgba(palette.inkDeep, 0.5));
      grad.addColorStop(1, rgba(palette.inkDeep, 0.86));
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      this.textures.addCanvas(vigKey, canvas);
    }
    const vignette = this.add.image(w / 2, h / 2, vigKey);
    vignette.setScrollFactor(0);
    vignette.setDepth(905);

    // --- faint drifting dust ---
    for (let i = 0; i < 18; i++) {
      const dust = this.add.circle(
        Phaser.Math.Between(0, w),
        Phaser.Math.Between(0, h),
        Math.random() < 0.2 ? 2 : 1,
        palette.hudLabel,
        Phaser.Math.FloatBetween(0.05, 0.16),
      );
      dust.setScrollFactor(0);
      dust.setDepth(902);
      this.tweens.add({
        targets: dust,
        y: dust.y - Phaser.Math.Between(20, 60),
        x: dust.x + Phaser.Math.Between(-15, 15),
        alpha: 0,
        duration: Phaser.Math.Between(4000, 9000),
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
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
   * Keep the torch pool on the delver.
   *
   * The pool is camera-locked (`setScrollFactor(0)`), so it is positioned in
   * SCREEN space: the delver's world position minus the camera scroll. That
   * matters because the camera lerps at 0.1 and is clamped by `setBounds`, so
   * its centre is not the delver's position while moving or at a map edge —
   * the two cases where a torch that sits at the camera centre most obviously
   * reads as "the screen is dim" rather than "I am carrying a light".
   *
   * Reposition only. The overlay is built once in `createAtmosphere()`; this
   * runs every tick, and allocating here would mean per-frame garbage at 60Hz
   * for a layer whose shape never changes.
   */
  private updateTorchPool(): void {
    const torch = this.torchPool;
    if (!torch?.scene) return;

    // The delver has escaped or died: there is no light to carry. Fade to the
    // static vignette rather than tracking a stale position.
    if (!this.player || !this.player.visible) {
      if (torch.alpha > 0.01) torch.setAlpha(torch.alpha * 0.92);
      return;
    }

    const cam = this.cameras.main;
    torch.setPosition(this.player.x - cam.scrollX, this.player.y - cam.scrollY);
  }

  update(): void {
    this.updateTorchPool();

    // skip all input/movement if player has escaped
    if (this.player && !this.player.visible) {
      // still update other players smoothly
      this.updateOtherPlayersSmooth();
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

    // update player facing and legs
    if (this.player && this.playerLegs) {
      const isMoving = vx !== 0 || vy !== 0;
      if (isMoving) {
        // determine facing from dominant axis
        let newFacing: "up" | "down" | "left" | "right";
        if (Math.abs(vy) >= Math.abs(vx)) {
          newFacing = vy < 0 ? "up" : "down";
        } else {
          newFacing = vx < 0 ? "left" : "right";
        }
        if (newFacing !== this.playerFacing) {
          this.playerFacing = newFacing;
          this.player.setTexture(this.facingTextureKey(this.playerTexturePrefix, newFacing));
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

    // update player name position and overhead HP/MP bar
    if (this.player && this.playerNameText) {
      this.playerNameText.setPosition(this.player.x, this.player.y - 35);
    }
    if (this.player && this.playerHpMpGraphics && this.lastGameState?.current_player) {
      const p = this.lastGameState.current_player;
      const curHp = p.current_health ?? (p.class === "warrior" ? 150 : 100);
      const maxHp = p.max_health ?? (p.class === "warrior" ? 150 : 100);
      const curMp = p.current_mana ?? 100;
      const maxMp = p.max_mana ?? 100;
      this.drawOverheadHpMpBar(this.playerHpMpGraphics, this.player.x, this.player.y, curHp, maxHp, curMp, maxMp);
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

    if (this.player && this.targetPosition) {
      this.player.x = Phaser.Math.Linear(
        this.player.x,
        this.targetPosition.x,
        lerpFactor,
      );
      this.player.y = Phaser.Math.Linear(
        this.player.y,
        this.targetPosition.y,
        lerpFactor,
      );
    }

    this.updateOtherPlayersSmooth();

    // 檢查是否進入/離開建築
    this.checkBuildingStatus();

    // 檢查寶箱距離，太遠自動關閉（只有跳窗開啟時才檢查）
    if (this.isPopupOpen) {
      this.checkChestDistance();
    }
  }

  private updateOtherPlayersSmooth(): void {
    const lerpFactor = 0.3;
    this.otherPlayers.forEach((sprite, playerId) => {
      const target = this.otherPlayersTargets.get(playerId);
      if (target) {
        const prevX = sprite.x;
        const prevY = sprite.y;

        sprite.x = Phaser.Math.Linear(sprite.x, target.x, lerpFactor);
        sprite.y = Phaser.Math.Linear(sprite.y, target.y, lerpFactor);

        // update facing and legs for other players
        const legs = this.otherPlayersLegs.get(playerId);
        if (legs) {
          const deltaX = target.x - prevX;
          const deltaY = target.y - prevY;
          const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          const isMoving = length > 0.5;

          if (isMoving) {
            let newFacing: "up" | "down" | "left" | "right";
            if (Math.abs(deltaY) >= Math.abs(deltaX)) {
              newFacing = deltaY < 0 ? "up" : "down";
            } else {
              newFacing = deltaX < 0 ? "left" : "right";
            }
            const prevFacing = this.otherPlayersFacing.get(playerId) || "down";
            if (newFacing !== prevFacing) {
              this.otherPlayersFacing.set(playerId, newFacing);
              const cls = this.otherPlayersClass.get(playerId) || "warrior";
              sprite.setTexture(
                this.facingTextureKey("other_" + cls, newFacing),
              );
            }
            const phase = (this.otherPlayersWalkPhase.get(playerId) || 0) + 0.3;
            this.otherPlayersWalkPhase.set(playerId, phase);
          }

          const facing = this.otherPlayersFacing.get(playerId) || "down";
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

        // update name text position and hover visibility
        const nameText = this.otherPlayersNameTexts.get(playerId);
        if (nameText) {
          nameText.setPosition(sprite.x, sprite.y - 35);
          nameText.setVisible(this.hoveredPlayerId === playerId);
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
