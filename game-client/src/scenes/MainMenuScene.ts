import { ActionType } from "@/assets/types/client";
import { socketManager, ConnectionStatus } from "@/utils/class/SocketManager";
import { useGameStore } from "@/stores/gameStore";
import { enterHubPayload, LEDGER_UNREACHABLE } from "@/characters/entry";
import Phaser from "phaser";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { CLASS_LORE } from "@/data/classLore";
import { registerArt } from "@/render/art/phaser";
import type { ArtLibrary } from "@/render/art/library";
import { MenuFigure, preloadMenuArt } from "@/render/art/menuFigure";
import {
  buttonTextColor,
  drawBackdrop,
  drawButton,
  drawPanel,
  drawRule,
  addTorchPool,
  sharpenText,
  type ButtonState,
} from "@/ui/menuChrome";
import { drawXpBar } from "@/ui/ProgressHud";
import { atCap, characterProgress, xpFraction } from "@/ui/progress";

/** The hero on the main-menu plinth, of the baked frame (FS-2325V §F.3). */
const HERO_SCALE = 1.3;
/**
 * A roster card's experience bar (FS-BDA7X req 44): under the class line, from the text column to
 * the card's right edge less a margin, in card-local px.
 */
const CARD_XP_BAR = { left: 64, y: 56, rightMargin: 12, height: 4 };
/** A roster card's head-and-shoulders window. */
const PORTRAIT = { width: 44, height: 56 };

export class MainMenuScene extends Phaser.Scene {
  private unsubscribeConnectionStatus?: () => void;
  private buttonBg?: Phaser.GameObjects.Graphics;
  private startButtonText?: Phaser.GameObjects.Text;
  private connectionStatusText?: Phaser.GameObjects.Text;
  private isConnected: boolean = false;
  private art?: ArtLibrary;
  private centerFigure?: MenuFigure;
  private centerFigureClass?: string;
  private refusalText?: Phaser.GameObjects.Text;
  private queuePopupActive: boolean = false;
  private queueTitle?: Phaser.GameObjects.Text;
  private queuePeopleText?: Phaser.GameObjects.Text;
  private queueOverlay?: Phaser.GameObjects.Rectangle;
  private queuePopupContainer?: Phaser.GameObjects.Container;

  private heroSidebarCards: {
    index: number;
    characterId: string;
    bg: Phaser.GameObjects.Graphics;
    avatar?: MenuFigure;
    avatarClass?: string;
    glow?: Phaser.GameObjects.Image;
    nameText: Phaser.GameObjects.Text;
    classText: Phaser.GameObjects.Text;
    hitArea: Phaser.GameObjects.Rectangle;
    deleteBtn?: Phaser.GameObjects.Text;
    deleteHit?: Phaser.GameObjects.Rectangle;
  }[] = [];

  private centerHeroContainer?: Phaser.GameObjects.Container;
  private sidebarContainer?: Phaser.GameObjects.Container;
  private sidebarCardsContainer?: Phaser.GameObjects.Container;
  private sidebarScrollY: number = 0;
  private sidebarScrollbarGraphics?: Phaser.GameObjects.Graphics;
  private onSidebarWheel?: (pointer: Phaser.Input.Pointer, gameObjects: any, deltaX: number, deltaY: number) => void;
  private onSidebarDrag?: (pointer: Phaser.Input.Pointer) => void;
  private onSidebarPointerDown?: (pointer: Phaser.Input.Pointer) => void;

  constructor() {
    super({ key: "MainMenuScene" });
  }

  preload(): void {
    preloadMenuArt(this);
  }

  create(): void {
    sharpenText(this);
    this.art = registerArt(this);
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // The Spire — a black silhouette rising behind the title (Perfectly Centered)
    const spire = this.add.graphics();
    const sx = width / 2;
    const baseY = height + 20;
    const spireTopY = height * 0.12;
    const halfBase = 70;
    const halfMid = 26;
    spire.fillStyle(palette.hoodShadow, 1);
    spire.beginPath();
    spire.moveTo(sx - halfBase, baseY);
    spire.lineTo(sx - halfMid, height * 0.42);
    spire.lineTo(sx, spireTopY);
    spire.lineTo(sx + halfMid, height * 0.42);
    spire.lineTo(sx + halfBase, baseY);
    spire.closePath();
    spire.fillPath();

    spire.lineStyle(1, palette.wallTop, 0.22);
    spire.beginPath();
    spire.moveTo(sx, spireTopY);
    spire.lineTo(sx - halfMid, height * 0.42);
    spire.lineTo(sx - halfBase, baseY);
    spire.strokePath();

    spire.fillStyle(palette.ember, 0.5);
    spire.fillCircle(sx + 6, height * 0.555, 2);

    // Drifting dust and embers: soft motes on the charcoal, no pixel grid or scanlines.
    drawBackdrop(this, 120);

    // Main Title (Blackletter display font >= 28px)
    const titleX = width / 2;
    const titleY = height * 0.16;
    const titleText = this.add.text(titleX, titleY, "BARROWSPIRE", {
      fontFamily: CANVAS_FONT.display,
      fontSize: "44px",
      color: toCss(palette.frameBright),
      letterSpacing: 10,
    });
    titleText.setOrigin(0.5);

    // Subtitle (body font)
    const subText = this.add.text(
      titleX,
      titleY + 44,
      "AN EXTRACTION DELVE INTO THE COLD DARK",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "10px",
        color: toCss(palette.hudLabel),
        letterSpacing: 6,
      },
    );
    subText.setOrigin(0.5);

    // Primary Start Game Button (body font): beveled stone, amber because it can be pressed.
    this.buttonBg = this.add.graphics();

    const btnY = height / 2 + 55;
    const btnW = 220;
    const btnH = 50;

    this.startButtonText = this.add.text(titleX, btnY + btnH / 2, "DELVE", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "16px",
      color: toCss(palette.hudFaint),
      letterSpacing: 4,
    });
    this.startButtonText.setOrigin(0.5);

    const hitArea = this.add.rectangle(titleX, btnY + btnH / 2, btnW, btnH, palette.inkDeep, 0);

    hitArea.on("pointerover", () => {
      if (this.isConnected) this.drawDelveButton("hover");
    });

    hitArea.on("pointerout", () => {
      if (this.isConnected) this.drawDelveButton("idle");
    });

    hitArea.on("pointerdown", () => {
      if (this.isConnected) {
        this.handleStartGame();
      }
    });

    this.drawDelveButton("disabled");

    // The loadout moved into the hub: the Quartermaster keeps it now, and gearing
    // up happens where the delver is rather than back in a menu.
    // FS-29KSH §Requirements 30.

    // Connection Status indicator
    this.connectionStatusText = this.add.text(
      titleX,
      height / 2 + 185,
      "Kindling torch...",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "11px",
        color: toCss(palette.hudLabel),
        letterSpacing: 1,
      },
    );
    this.connectionStatusText.setOrigin(0.5);

    // Socket Connection Status Handler
    const handleStatus = (status: ConnectionStatus) => {
      this.handleConnectionStatusChange(status, hitArea);
    };

    handleStatus(socketManager.getConnectionStatus());
    this.unsubscribeConnectionStatus = socketManager.onConnectionStatusChange(handleStatus);

    // Queue Notification Listeners
    socketManager.setOnMessageError((info) => {
      if (info.action === ActionType.EnterHub) {
        this.showRefusal(info.message ?? "The way in is barred.");
      }
    });

    socketManager.on(
      ActionType.Find_Game,
      (payload: { in_queue?: boolean; queue_length?: number; max_players?: number }) => {
        console.log("Queue status received:", payload);
        if (payload.in_queue) {
          this.showQueuePopup(payload.queue_length || 1, payload.max_players || 2);
        }
      },
    );

    // Controls info (body font)
    const controlsText = this.add.text(
      width / 2,
      height - 60,
      "WASD Move  //  L-Click Primary Attack  //  R-Click Special Skill (10 MP)  //  E Interact",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "11px",
        color: toCss(palette.hudFaint),
        letterSpacing: 2,
      },
    );
    controlsText.setOrigin(0.5);

    // Version text (body font)
    const versionText = this.add.text(
      width / 2,
      height - 35,
      "v0.2 // THE BARROW-DEEP // FEW RETURN WHOLE",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "9px",
        color: toCss(palette.ink),
        letterSpacing: 1,
      },
    );
    versionText.setOrigin(0.5);

    // Create Diablo-style Right Sidebar for Character Selection
    this.createHeroRightSidebar();
    this.refreshHeroSidebar();
    this.time.delayedCall(50, () => {
      this.refreshHeroSidebar();
    });
    this.loadRoster();

    // Register scene shutdown listener
    this.events.once("shutdown", () => {
      this.shutdown();
    });
  }

  /**
   * Reads the member's characters from the server, carrying any local-only ones over once
   * (FS-BDA7X req 39-40), then redraws the roster and tells the delver what the import dropped.
   */
  private loadRoster(): void {
    void useGameStore
      .getState()
      .loadCharacters()
      .then(() => {
        if (!this.sys?.settings?.active) return;
        const store = useGameStore.getState();
        this.createHeroRightSidebar();
        const notices = store.takeRosterNotices();
        if (notices.length > 0) this.showRefusal(notices.join("\n"));
        else if (store.rosterStatus === "unreachable") this.showRefusal(LEDGER_UNREACHABLE);
      });
  }

  private createHeroRightSidebar(): void {
    const width = this.cameras.main.width;
    const panelW = 200;
    const panelH = 440;
    const panelX = width - panelW - 24;
    const panelY = 100;

    if (this.sidebarContainer) {
      // Portraits live in the cards container and go with it (MenuFigure stops on destroy).
      this.sidebarContainer.destroy();
    }
    this.sidebarContainer = this.add.container(0, 0);

    const characters = useGameStore.getState().characters;
    const numSlots = characters.length;

    // Sidebar Background Panel
    const sidebarBg = this.add.graphics();
    drawPanel(sidebarBg, panelX, panelY, panelW, panelH);
    sidebarBg.setInteractive(new Phaser.Geom.Rectangle(panelX, panelY, panelW, panelH), Phaser.Geom.Rectangle.Contains);
    this.sidebarContainer.add(sidebarBg);

    // Sidebar Header Title
    const headerText = this.add.text(panelX + panelW / 2, panelY + 22, "HEROES", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "16px",
      color: toCss(palette.frameBright),
      letterSpacing: 4,
    });
    headerText.setOrigin(0.5);
    this.sidebarContainer.add(headerText);

    // Divider Line
    const div = this.add.graphics();
    drawRule(div, panelX + 16, panelX + panelW - 16, panelY + 40);
    this.sidebarContainer.add(div);

    // Viewport Geometry Mask for scrolling
    const maskY = panelY + 44;
    const maskH = panelH - 85;
    const maskW = panelW - 16;
    const maskX = panelX + 8;

    const maskShape = this.make.graphics({});
    maskShape.fillStyle(palette.hudText); // any opaque fill: a geometry mask reads shape, not colour
    maskShape.fillRect(maskX, maskY, maskW, maskH);
    const mask = maskShape.createGeometryMask();

    this.sidebarCardsContainer = this.add.container(0, 0);
    this.sidebarCardsContainer.setMask(mask);
    this.sidebarContainer.add(this.sidebarCardsContainer);

    this.sidebarScrollbarGraphics = this.add.graphics();
    this.sidebarContainer.add(this.sidebarScrollbarGraphics);

    const cardW = panelW - 28;
    const cardH = 68;
    const gap = 10;
    const startY = maskY + 4;

    this.heroSidebarCards = [];

    for (let i = 0; i < numSlots; i++) {
      const char = characters[i];
      const y = startY + i * (cardH + gap);
      const centerX = panelX + 14 + cardW / 2;

      const bg = this.add.graphics();

      // The class's own baked sheet, head and shoulders, set by refreshHeroSidebar.
      const cls = (char.className || "warrior").toLowerCase();
      const avatar = this.art
        ? new MenuFigure(this, this.art, panelX + 36, y + 6, cls, { portrait: PORTRAIT })
        : undefined;

      const glow = addTorchPool(this, panelX + 36, y + cardH / 2 + 4, 76, 64, 0.55);

      const nameText = this.add.text(panelX + 64, y + 14, "", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "13px",
        color: toCss(palette.hudText),
      });

      const classText = this.add.text(panelX + 64, y + 40, "", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "10px",
        color: toCss(palette.hudLabel),
      });

      const hitArea = this.add.rectangle(centerX, y + cardH / 2, cardW, cardH, palette.inkDeep, 0);
      hitArea.setInteractive({ useHandCursor: true });

      // Delete mark: a plain serif cross, not an emoji.
      const deleteText = this.add.text(panelX + panelW - 28, y + 24, "\u00d7", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "16px",
        color: toCss(palette.hudLabel),
      });
      deleteText.setOrigin(0.5);
      deleteText.setVisible(false);

      const deleteHit = this.add.rectangle(panelX + panelW - 28, y + 24, 22, 22, palette.inkDeep, 0);
      deleteHit.setVisible(false);

      const cardObj = {
        index: i,
        characterId: char.id,
        cardH,
        bg,
        avatar,
        avatarClass: cls,
        glow,
        nameText,
        classText,
        hitArea,
        deleteBtn: deleteText,
        deleteHit,
      };

      this.sidebarCardsContainer.add([bg, glow]);
      if (avatar) this.sidebarCardsContainer.add(avatar.container);
      this.sidebarCardsContainer.add([nameText, classText, hitArea, deleteText, deleteHit]);
      this.heroSidebarCards.push(cardObj);

      hitArea.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        const dist = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.upX, pointer.upY);
        if (dist < 8) {
          useGameStore.getState().selectCharacter(char.id);
          this.refreshHeroSidebar();
          // Picking a hero plays its attack once on the plinth (FS-2325V §F.2).
          this.centerFigure?.flourish();
        }
      });
    }

    const totalHeight = numSlots * (cardH + gap) + 8;

    if (this.onSidebarWheel) {
      this.input.off("pointerwheel", this.onSidebarWheel);
    }
    if (this.onSidebarDrag) {
      this.input.off("pointermove", this.onSidebarDrag);
    }
    if (this.onSidebarPointerDown) {
      this.input.off("pointerdown", this.onSidebarPointerDown);
    }

    let isDragging = false;
    let startDragY = 0;
    let startScrollY = 0;

    this.onSidebarPointerDown = (pointer: Phaser.Input.Pointer) => {
      if (pointer.x >= panelX && pointer.x <= panelX + panelW && pointer.y >= maskY && pointer.y <= maskY + maskH) {
        isDragging = true;
        startDragY = pointer.y;
        startScrollY = this.sidebarScrollY;
      }
    };
    this.input.on("pointerdown", this.onSidebarPointerDown);

    this.onSidebarWheel = (pointer: Phaser.Input.Pointer, _gameObjects: any, _deltaX: number, deltaY: number) => {
      if (pointer.x >= panelX && pointer.x <= panelX + panelW && pointer.y >= panelY && pointer.y <= panelY + panelH) {
        const currentCount = useGameStore.getState().characters.length;
        const totH = currentCount * (cardH + gap) + 8;
        const maxScr = Math.max(0, totH - maskH);
        if (maxScr <= 0) return;
        this.sidebarScrollY = Phaser.Math.Clamp(this.sidebarScrollY + (deltaY > 0 ? 35 : -35), 0, maxScr);
        this.updateSidebarScrollPosition(maskY, maskH, panelX + panelW - 6, totH);
      }
    };
    this.input.on("pointerwheel", this.onSidebarWheel);

    this.onSidebarDrag = (pointer: Phaser.Input.Pointer) => {
      if (!isDragging || !pointer.isDown) {
        isDragging = false;
        return;
      }
      const currentCount = useGameStore.getState().characters.length;
      const totH = currentCount * (cardH + gap) + 8;
      const maxScr = Math.max(0, totH - maskH);
      if (maxScr <= 0) return;

      const dy = pointer.y - startDragY;
      this.sidebarScrollY = Phaser.Math.Clamp(startScrollY - dy, 0, maxScr);
      this.updateSidebarScrollPosition(maskY, maskH, panelX + panelW - 6, totH);
    };
    this.input.on("pointermove", this.onSidebarDrag);
    this.input.on("pointerup", () => {
      isDragging = false;
    });

    // Add Create Character Button at bottom of sidebar
    const createBtnY = panelY + panelH - 32;
    const createBtnW = cardW;
    const createBtnH = 32;
    const createBtnX = panelX + panelW / 2;

    const createBtnBg = this.add.graphics();
    const createBtnText = this.add.text(createBtnX, createBtnY, "+ CREATE HERO", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "11px",
      letterSpacing: 2,
    });
    createBtnText.setOrigin(0.5);
    const drawCreateBtn = (state: ButtonState) => {
      drawButton(
        createBtnBg,
        createBtnX - createBtnW / 2,
        createBtnY - createBtnH / 2,
        createBtnW,
        createBtnH,
        "primary",
        state,
      );
      createBtnText.setColor(toCss(buttonTextColor("primary", state)));
    };
    drawCreateBtn("idle");

    const createBtnHit = this.add
      .rectangle(createBtnX, createBtnY, createBtnW, createBtnH, palette.inkDeep, 0)
      .setInteractive({ useHandCursor: true });

    createBtnHit.on("pointerdown", () => {
      this.scene.start("CharacterCreationScene");
    });

    createBtnHit.on("pointerover", () => drawCreateBtn("hover"));
    createBtnHit.on("pointerout", () => drawCreateBtn("idle"));

    this.sidebarContainer.add([createBtnBg, createBtnText, createBtnHit]);
    this.updateSidebarScrollPosition(maskY, maskH, panelX + panelW - 6, totalHeight);
    this.refreshHeroSidebar();
  }

  private updateSidebarScrollPosition(maskY: number, maskH: number, trackX: number, totalHeight: number): void {
    if (this.sidebarCardsContainer) {
      this.sidebarCardsContainer.setY(-this.sidebarScrollY);
    }

    if (this.sidebarScrollbarGraphics) {
      this.sidebarScrollbarGraphics.clear();
      const maxScroll = Math.max(0, totalHeight - maskH);

      if (maxScroll > 0) {
        // Draw Scroll Track
        this.sidebarScrollbarGraphics.fillStyle(palette.inkDeep, 0.6);
        this.sidebarScrollbarGraphics.fillRect(trackX - 2, maskY, 4, maskH);

        // Draw Scroll Thumb
        const thumbH = Math.max(24, Math.floor((maskH / totalHeight) * maskH));
        const thumbY = maskY + (this.sidebarScrollY / maxScroll) * (maskH - thumbH);

        this.sidebarScrollbarGraphics.fillStyle(palette.frame, 0.8);
        this.sidebarScrollbarGraphics.fillRoundedRect(trackX - 2, thumbY, 4, thumbH, 2);
      }
    }
  }

  private refreshCenterHeroShowcase(): void {
    const store = useGameStore.getState();
    const activeChar = store.getActiveCharacter();
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const centerX = width / 2;
    const centerY = height / 2 - 95;
    /** Where the hero's feet stand on the plinth. */
    const feetY = centerY + 26;

    if (this.centerHeroContainer) {
      this.centerHeroContainer.destroy();
      this.centerHeroContainer = undefined;
    }

    this.centerHeroContainer = this.add.container(centerX, centerY);
    this.centerHeroContainer.setDepth(15);

    if (activeChar) {
      const cls = (activeChar.className || "warrior").toLowerCase() as keyof typeof CLASS_LORE;
      const lore = CLASS_LORE[cls];

      // The hero is the class's own baked sheet on a lit plinth, turning (FS-2325V §F.1-F.3).
      // It outlives this container, so a refresh does not restart its turn.
      if (!this.centerFigure && this.art) {
        this.centerFigure = new MenuFigure(this, this.art, centerX, feetY, cls, {
          scale: HERO_SCALE,
        });
        this.centerFigure.container.setDepth(14);
      } else if (this.centerFigure && this.centerFigureClass !== cls) {
        this.centerFigure.setClass(cls, false);
      }
      this.centerFigureClass = cls;

      // Below the plinth's foot.
      const nameText = this.add.text(0, 86, activeChar.name.toUpperCase(), {
        fontFamily: CANVAS_FONT.body,
        fontSize: "16px",
        color: toCss(palette.frameBright),
        fontStyle: "bold",
        stroke: toCss(palette.inkDeep),
        strokeThickness: 3,
      });
      nameText.setOrigin(0.5);

      const classTitle = lore ? `${lore.title} • LV.${activeChar.level}` : `${cls.toUpperCase()} LV.${activeChar.level}`;
      const classText = this.add.text(0, 106, classTitle, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "11px",
        color: toCss(palette.hudLabel),
        letterSpacing: 2,
      });
      classText.setOrigin(0.5);

      this.centerHeroContainer.add([nameText, classText]);
    } else if (store.rosterStatus !== "ready") {
      this.centerFigure?.destroy();
      this.centerFigure = undefined;
      this.centerFigureClass = undefined;

      // The roster is still being read, or could not be: an empty plinth that offers nothing,
      // so a delver with heroes is never sent to make another.
      const glow = addTorchPool(this, 0, 26, 200, 100, 0.5);
      const waitText = this.add.text(
        0,
        0,
        store.rosterStatus === "unreachable" ? "THE LEDGER IS OUT OF REACH" : "READING THE LEDGER...",
        {
          fontFamily: CANVAS_FONT.body,
          fontSize: "12px",
          color: toCss(palette.hudLabel),
          letterSpacing: 2,
        },
      );
      waitText.setOrigin(0.5);
      this.centerHeroContainer.add([glow, waitText]);
    } else {
      this.centerFigure?.destroy();
      this.centerFigure = undefined;
      this.centerFigureClass = undefined;

      // An empty plinth: a pool of torchlight and a brass ring, waiting for a hero.
      const glow = addTorchPool(this, 0, 26, 200, 100, 0.8);
      const pedestal = this.add.graphics();
      pedestal.lineStyle(1, palette.frame, 0.45);
      pedestal.strokeEllipse(0, 26, 90, 45);

      const emptyText = this.add.text(0, 0, "+ CREATE HERO", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "13px",
        color: toCss(palette.interactable),
        letterSpacing: 2,
      });
      emptyText.setOrigin(0.5);

      const hit = this.add.rectangle(0, 0, 140, 80, palette.inkDeep, 0);
      hit.setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => {
        this.scene.start("CharacterCreationScene");
      });

      this.centerHeroContainer.add([glow, pedestal, emptyText, hit]);
    }
  }

  private refreshHeroSidebar(): void {
    const store = useGameStore.getState();
    const activeId = store.activeCharacterId;
    const characters = store.characters;

    this.refreshCenterHeroShowcase();

    if (
      this.heroSidebarCards.length !== characters.length ||
      this.heroSidebarCards.some((card, i) => card.characterId !== characters[i].id)
    ) {
      this.createHeroRightSidebar();
      return;
    }

    const width = this.cameras.main.width;
    const panelW = 200;
    const panelH = 440;
    const panelX = width - panelW - 24;
    const panelY = 100;
    const maskY = panelY + 44;
    const maskH = panelH - 85;
    const cardW = panelW - 28;
    const cardH = 68;
    const gap = 10;
    const startY = maskY + 4;
    const x = panelX + 14;
    const totalHeight = characters.length * (cardH + gap) + 8;

    this.heroSidebarCards.forEach((card, i) => {
      const char = characters[i];
      if (!char) return;
      const isSelected = char.id === activeId;
      const y = startY + i * (cardH + gap);

      card.hitArea.setPosition(panelX + 14 + cardW / 2, y + cardH / 2);
      card.hitArea.setSize(cardW, cardH);

      if (card.deleteBtn && card.deleteHit) {
        card.deleteBtn.setPosition(panelX + panelW - 28, y + 24);
        card.deleteHit.setPosition(panelX + panelW - 28, y + 24);
      }

      card.bg.clear();

      const cls = (char.className || "warrior").toLowerCase();
      if (card.avatar) {
        if (card.avatarClass !== cls) card.avatar.setClass(cls, false);
        card.avatarClass = cls;
        card.avatar.container.setPosition(panelX + 36, y + 6);
      }

      card.nameText.setText(char.name).setPosition(panelX + 64, y + 14).setVisible(true);
      const progress = characterProgress(char);
      const capMark = atCap(progress) ? " · CAP" : "";
      card.classText
        .setText(`${char.className.toUpperCase()} • LV.${char.level}${capMark}`)
        .setPosition(panelX + 64, y + 40)
        .setVisible(true);

      if (card.deleteBtn && card.deleteHit) {
        card.deleteBtn.setVisible(true);
        card.deleteHit.setInteractive({ useHandCursor: true }).setVisible(true);

        card.deleteHit.off("pointerdown");
        card.deleteHit.on("pointerdown", (e: Phaser.Input.Pointer) => {
          e.event.stopPropagation();
          if (confirm(`Delete character "${char.name}"?`)) {
            // Deleted on the server (FS-BDA7X req 39); the card goes once it is gone there.
            useGameStore
              .getState()
              .deleteCharacter(char.id)
              .then(() => {
                if (this.sys?.settings?.active) this.createHeroRightSidebar();
              })
              .catch(() => {
                if (this.sys?.settings?.active) this.showRefusal(LEDGER_UNREACHABLE);
              });
          }
        });
      }

      drawPanel(card.bg, x, y, cardW, cardH, {
        raised: isSelected,
        alpha: isSelected ? 0.95 : 0.6,
      });
      // Each character's level and bar, from the gateway read (FS-BDA7X req 44).
      const barX = panelX + CARD_XP_BAR.left;
      drawXpBar(
        card.bg,
        barX,
        y + CARD_XP_BAR.y,
        x + cardW - CARD_XP_BAR.rightMargin - barX,
        CARD_XP_BAR.height,
        xpFraction(progress),
      );
      // Every portrait stands in a little torchlight; the chosen hero's burns brighter.
      card.glow?.setPosition(panelX + 36, y + cardH / 2 + 4).setAlpha(isSelected ? 1 : 0.55);
    });

    this.updateSidebarScrollPosition(maskY, maskH, panelX + panelW - 6, totalHeight);
  }

  private handleStartGame(): void {
    const store = useGameStore.getState();

    // Until the roster is read, an empty one is not known to be empty.
    if (store.rosterStatus === "loading") return;
    if (store.rosterStatus !== "ready") {
      this.showRefusal(LEDGER_UNREACHABLE);
      this.loadRoster();
      return;
    }

    const activeChar = store.getActiveCharacter();
    if (!activeChar) {
      this.scene.start("CharacterCreationScene");
      return;
    }

    // Pressing start leads to the hub, not to a queue. Delving is started from
    // inside the hub by talking to an NPC (I-29KSH-6). FS-29KSH §Requirements 34.
    // The server seats by the character's id (FS-BDA7X req 41).
    socketManager.sendMessage(ActionType.EnterHub, enterHubPayload(activeChar));
  }

  private handleConnectionStatusChange(
    status: ConnectionStatus,
    hitArea: Phaser.GameObjects.Rectangle
  ): void {
    if (!this.sys?.settings?.active) return;

    this.isConnected = status === "connected";

    if (this.startButtonText && this.connectionStatusText) {
      if (status === "connected") {
        hitArea.setInteractive({ useHandCursor: true });
        this.startButtonText.setText("DELVE");
        this.connectionStatusText.setText("The way is open // Server connected");
        this.connectionStatusText.setColor(toCss(palette.hudLabel));
        this.drawDelveButton("idle");
      } else if (status === "connecting") {
        hitArea.disableInteractive();
        this.startButtonText.setText("CONNECTING...");
        this.connectionStatusText.setText("Kindling torch // Connecting to game server...");
        this.connectionStatusText.setColor(toCss(palette.torchCore));
        this.drawDelveButton("disabled");
      } else {
        hitArea.disableInteractive();
        this.startButtonText.setText("LOST");
        this.connectionStatusText.setText("The torch gutters // Connection lost");
        this.connectionStatusText.setColor(toCss(palette.damageBright));
        this.drawDelveButton("disabled");
      }
    }
  }

  private drawDelveButton(state: ButtonState): void {
    if (!this.cameras || !this.cameras.main) return;
    const width = this.cameras.main.width;
    const titleX = width / 2;
    const btnX = titleX - 110;
    const btnY = this.cameras.main.height / 2 + 55;
    const btnW = 220;
    const btnH = 50;

    if (this.buttonBg) drawButton(this.buttonBg, btnX, btnY, btnW, btnH, "primary", state);
    this.startButtonText?.setColor(toCss(buttonTextColor("primary", state)));
  }

  /**
   * Shows why the way in was refused.
   *
   * A refusal the delver cannot see is a button that does nothing: pressing
   * start and having the menu sit there is the worst reading of a full hub.
   * FS-29KSH §Requirements 32.
   */
  private showRefusal(message: string): void {
    this.refusalText?.destroy();

    const { width, height } = this.cameras.main;

    this.refusalText = this.add
      .text(width / 2, height / 2 + 150, message, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "14px",
        color: toCss(palette.damageBright),
        backgroundColor: toCss(palette.inkDeep),
        padding: { x: 16, y: 10 },
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(200);

    this.time.delayedCall(5000, () => {
      this.refusalText?.destroy();
      this.refusalText = undefined;
    });
  }

  private showQueuePopup(queueLength: number, maxPlayers: number = 2): void {
    if (this.queuePopupActive) {
      if (this.queuePeopleText) {
        this.queuePeopleText.setText(`Delvers gathered: ${queueLength}/${maxPlayers}`);
      }
      return;
    }
    this.queuePopupActive = true;

    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    this.queueOverlay = this.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      palette.inkDeep,
      0.7
    );
    this.queueOverlay.setDepth(100);

    this.queuePopupContainer = this.add.container(width / 2, height / 2);
    this.queuePopupContainer.setDepth(101);

    const boxW = 320;
    const boxH = 160;
    const boxBg = this.add.graphics();
    drawPanel(boxBg, -boxW / 2, -boxH / 2, boxW, boxH, { alpha: 0.97 });

    this.queueTitle = this.add.text(0, -40, "GATHERING THE DELVE", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "18px",
      color: toCss(palette.frameBright),
    });
    this.queueTitle.setOrigin(0.5);

    this.queuePeopleText = this.add.text(
      0,
      0,
      `Delvers gathered: ${queueLength}/${maxPlayers}`,
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "14px",
        color: toCss(palette.hudLabel),
      }
    );
    this.queuePeopleText.setOrigin(0.5);

    const cancelBtn = this.add.text(0, 45, "[ LEAVE QUEUE ]", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "12px",
      color: toCss(buttonTextColor("cancel", "idle")),
    });
    cancelBtn.setOrigin(0.5);
    cancelBtn.setInteractive({ useHandCursor: true });

    cancelBtn.on("pointerdown", () => {
      socketManager.sendMessage("leave_queue" as any, {});
      socketManager.sendMessage(ActionType.Find_Game, { cancel: true });
      this.closeQueuePopup();
    });

    this.queuePopupContainer.add([boxBg, this.queueTitle, this.queuePeopleText, cancelBtn]);
  }

  private closeQueuePopup(): void {
    if (this.queueOverlay) {
      this.queueOverlay.destroy();
      this.queueOverlay = undefined;
    }
    if (this.queuePopupContainer) {
      this.queuePopupContainer.destroy();
      this.queuePopupContainer = undefined;
    }
    this.queuePopupActive = false;
  }

  private shutdown(): void {
    if (this.unsubscribeConnectionStatus) {
      this.unsubscribeConnectionStatus();
      this.unsubscribeConnectionStatus = undefined;
    }
    if (this.centerHeroContainer) {
      this.centerHeroContainer.destroy();
      this.centerHeroContainer = undefined;
    }
    // The scene instance outlives this visit; its figures do not.
    this.centerFigure?.destroy();
    this.centerFigure = undefined;
    this.centerFigureClass = undefined;
    this.heroSidebarCards = [];
    if (this.sidebarContainer) {
      this.sidebarContainer.destroy();
      this.sidebarContainer = undefined;
    }
    this.closeQueuePopup();
  }
}
