import { ActionType } from "@/assets/types/client";
import { socketManager, ConnectionStatus } from "@/utils/class/SocketManager";
import { useGameStore, CharacterSave } from "@/stores/gameStore";
import Phaser from "phaser";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { CLASS_LORE } from "@/data/classLore";
import { ensureCharacterTextures } from "@/utils/characterTextures";

export class MainMenuScene extends Phaser.Scene {
  private unsubscribeConnectionStatus?: () => void;
  private buttonBg?: Phaser.GameObjects.Graphics;
  private buttonGlow?: Phaser.GameObjects.Graphics;
  private startButtonText?: Phaser.GameObjects.Text;
  private connectionStatusText?: Phaser.GameObjects.Text;
  private isConnected: boolean = false;
  private scanlineGraphics?: Phaser.GameObjects.Graphics;
  private loadoutBtnBg?: Phaser.GameObjects.Graphics;
  private queuePopupActive: boolean = false;
  private queueTitle?: Phaser.GameObjects.Text;
  private queuePeopleText?: Phaser.GameObjects.Text;
  private queueOverlay?: Phaser.GameObjects.Rectangle;
  private queuePopupContainer?: Phaser.GameObjects.Container;

  private heroSidebarCards: {
    index: number;
    slotIndex: number;
    bg: Phaser.GameObjects.Graphics;
    avatarSprite?: Phaser.GameObjects.Sprite;
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

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Barrow-dark background
    this.cameras.main.setBackgroundColor(toCss(palette.ink));

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

    spire.lineStyle(2, palette.wallTop, 0.18);
    spire.beginPath();
    spire.moveTo(sx, spireTopY);
    spire.lineTo(sx - halfMid, height * 0.42);
    spire.lineTo(sx - halfBase, baseY);
    spire.strokePath();

    spire.fillStyle(palette.ember, 0.5);
    spire.fillCircle(sx + 6, height * 0.5, 2);

    // Drifting dust & embers
    const stars = this.add.graphics();
    for (let i = 0; i < 120; i++) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
      const ember = Math.random() < 0.12;
      const size = ember ? 2 : 1;
      const alpha = ember
        ? Phaser.Math.FloatBetween(0.25, 0.55)
        : Phaser.Math.FloatBetween(0.06, 0.22);
      const color = ember
        ? palette.ember
        : Math.random() < 0.5
          ? palette.hudLabel
          : palette.wallTop;
      stars.fillStyle(color, alpha);
      stars.fillRect(x, y, size, size);
    }

    // Faint masonry grid overlay
    const grid = this.add.graphics();
    grid.lineStyle(1, palette.floor, 0.05);
    for (let x = 0; x <= width; x += 40) {
      grid.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y <= height; y += 40) {
      grid.lineBetween(0, y, width, y);
    }

    // Scanline effect
    this.scanlineGraphics = this.add.graphics();
    this.scanlineGraphics.fillStyle(0x000000, 0.04);
    for (let y = 0; y < height; y += 4) {
      this.scanlineGraphics.fillRect(0, y, width, 2);
    }

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

    // Primary Start Game Button (body font)
    this.buttonGlow = this.add.graphics();
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

    const hitArea = this.add.rectangle(titleX, btnY + btnH / 2, btnW, btnH, 0x000000, 0);

    hitArea.on("pointerover", () => {
      if (this.isConnected) {
        this.drawButton(0x2e241c, palette.interactableBright, palette.torchCore);
        if (this.startButtonText) {
          this.startButtonText.setColor(toCss(palette.frameBright));
        }
      }
    });

    hitArea.on("pointerout", () => {
      if (this.isConnected) {
        this.drawButton(0x1c1712, palette.frame, palette.ember);
        if (this.startButtonText) {
          this.startButtonText.setColor(toCss(palette.frame));
        }
      }
    });

    hitArea.on("pointerdown", () => {
      if (this.isConnected) {
        this.handleStartGame();
      }
    });

    this.drawButton(0x141210, 0x2a231b);

    // Manage Loadout button (body font)
    const loadoutBtnX = titleX;
    const loadoutBtnY = height / 2 + 130;
    const loadoutBtnW = 180;
    const loadoutBtnH = 36;

    this.loadoutBtnBg = this.add.graphics();
    this.loadoutBtnBg.fillStyle(palette.hudPanelDeep, 0.8);
    this.loadoutBtnBg.fillRoundedRect(
      loadoutBtnX - loadoutBtnW / 2,
      loadoutBtnY - loadoutBtnH / 2,
      loadoutBtnW,
      loadoutBtnH,
      4,
    );
    this.loadoutBtnBg.lineStyle(1, palette.interactable, 0.3);
    this.loadoutBtnBg.strokeRoundedRect(
      loadoutBtnX - loadoutBtnW / 2,
      loadoutBtnY - loadoutBtnH / 2,
      loadoutBtnW,
      loadoutBtnH,
      4,
    );

    const loadoutText = this.add.text(
      loadoutBtnX,
      loadoutBtnY,
      "PREPARE YOUR KIT",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "12px",
        color: toCss(palette.frameBright),
        letterSpacing: 3,
      },
    );
    loadoutText.setOrigin(0.5);

    const loadoutHit = this.add.rectangle(
      loadoutBtnX,
      loadoutBtnY,
      loadoutBtnW,
      loadoutBtnH,
      palette.inkDeep,
      0,
    );
    loadoutHit.setInteractive({ useHandCursor: true });

    loadoutHit.on("pointerdown", () => {
      this.scene.start("LoadoutScene");
    });

    // Connection Status indicator (positioned below PREPARE YOUR KIT button)
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
    socketManager.on(
      ActionType.Find_Game,
      (payload: { in_queue?: boolean; queue_length?: number; max_players?: number }) => {
        console.log("Queue status received:", payload);
        if (payload.in_queue) {
          this.showQueuePopup(payload.queue_length || 1, payload.max_players || 2);
        }
      },
    );

    socketManager.on(
      "game_found",
      (payload: { session_id?: string; sessionID?: string }) => {
        console.log("Game found! Payload:", payload);
        const sessionID = payload.session_id || payload.sessionID;

        if (!sessionID) {
          console.error("No session ID in game_found payload:", payload);
          return;
        }

        if (this.queuePopupActive && this.queueTitle && this.queuePeopleText) {
          this.queueTitle.setText("THE DELVE IS SET");
          this.queuePeopleText.setText("Descending...");

          this.time.delayedCall(1500, () => {
            this.closeQueuePopup();
            this.scene.start("BarrowspireScene", { sessionID });
          });
        } else {
          this.scene.start("BarrowspireScene", { sessionID });
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

    // Register scene shutdown listener
    this.events.once("shutdown", () => {
      this.shutdown();
    });
  }

  private createHeroRightSidebar(): void {
    const width = this.cameras.main.width;
    const panelW = 200;
    const panelH = 440;
    const panelX = width - panelW - 24;
    const panelY = 100;

    if (this.sidebarContainer) {
      this.sidebarContainer.destroy();
    }
    this.sidebarContainer = this.add.container(0, 0);

    const store = useGameStore.getState();
    const createdSlots = store.slots
      .map((char, index) => ({ char, index }))
      .filter((item): item is { char: CharacterSave; index: number } => item.char !== null);
    const numSlots = createdSlots.length;

    // Sidebar Background Panel
    const sidebarBg = this.add.graphics();
    sidebarBg.fillStyle(0x0e0c0a, 0.85);
    sidebarBg.fillRoundedRect(panelX, panelY, panelW, panelH, 6);
    sidebarBg.lineStyle(1, palette.wallTop, 0.4);
    sidebarBg.strokeRoundedRect(panelX, panelY, panelW, panelH, 6);
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
    div.lineStyle(1, palette.ember, 0.5);
    div.lineBetween(panelX + 16, panelY + 40, panelX + panelW - 16, panelY + 40);
    this.sidebarContainer.add(div);

    // Viewport Geometry Mask for scrolling
    const maskY = panelY + 44;
    const maskH = panelH - 85;
    const maskW = panelW - 16;
    const maskX = panelX + 8;

    const maskShape = this.make.graphics({});
    maskShape.fillStyle(0xffffff);
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

    ensureCharacterTextures(this);

    for (let i = 0; i < numSlots; i++) {
      const slotItem = createdSlots[i];
      const slotIdx = slotItem.index;
      const y = startY + i * (cardH + gap);
      const centerX = panelX + 14 + cardW / 2;

      const bg = this.add.graphics();

      const avatarSprite = this.add.sprite(panelX + 32, y + 34, "preview_warrior_down");
      avatarSprite.setScale(0.85);
      avatarSprite.setVisible(false);

      const nameText = this.add.text(panelX + 54, y + 14, "", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "13px",
        color: "#ffffff",
      });

      const classText = this.add.text(panelX + 54, y + 40, "", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "10px",
        color: toCss(palette.hudLabel),
      });

      const hitArea = this.add.rectangle(centerX, y + cardH / 2, cardW, cardH, 0x000000, 0);
      hitArea.setInteractive({ useHandCursor: true });

      // Delete icon
      const deleteText = this.add.text(panelX + panelW - 28, y + 24, "🗑️", {
        fontSize: "11px",
      });
      deleteText.setOrigin(0.5);
      deleteText.setVisible(false);

      const deleteHit = this.add.rectangle(panelX + panelW - 28, y + 24, 22, 22, 0x000000, 0);
      deleteHit.setVisible(false);

      const cardObj = {
        index: i,
        slotIndex: slotIdx,
        cardH,
        bg,
        avatarSprite,
        nameText,
        classText,
        hitArea,
        deleteBtn: deleteText,
        deleteHit,
      };

      this.sidebarCardsContainer.add([bg, avatarSprite, nameText, classText, hitArea, deleteText, deleteHit]);
      this.heroSidebarCards.push(cardObj);

      hitArea.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        const dist = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.upX, pointer.upY);
        if (dist < 8) {
          useGameStore.getState().setActiveSlotIndex(slotIdx);
          this.refreshHeroSidebar();
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
        const storeState = useGameStore.getState();
        const currentCount = storeState.slots.filter((s) => s !== null).length;
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
      const storeState = useGameStore.getState();
      const currentCount = storeState.slots.filter((s) => s !== null).length;
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
    createBtnBg.fillStyle(0x221a14, 0.95);
    createBtnBg.fillRect(createBtnX - createBtnW / 2, createBtnY - createBtnH / 2, createBtnW, createBtnH);
    createBtnBg.lineStyle(1, palette.torchCore, 0.8);
    createBtnBg.strokeRect(createBtnX - createBtnW / 2, createBtnY - createBtnH / 2, createBtnW, createBtnH);

    const createBtnText = this.add.text(createBtnX, createBtnY, "+ CREATE HERO", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "11px",
      color: toCss(palette.frameBright),
      letterSpacing: 2,
    });
    createBtnText.setOrigin(0.5);

    const createBtnHit = this.add
      .rectangle(createBtnX, createBtnY, createBtnW, createBtnH, 0x000000, 0)
      .setInteractive({ useHandCursor: true });

    createBtnHit.on("pointerdown", () => {
      const storeState = useGameStore.getState();
      const emptyIdx = storeState.slots.findIndex((s) => s === null);
      const targetSlot = emptyIdx !== -1 ? emptyIdx : storeState.slots.length;
      this.scene.start("CharacterCreationScene", { slotIndex: targetSlot });
    });

    createBtnHit.on("pointerover", () => {
      createBtnBg.clear();
      createBtnBg.fillStyle(palette.ember, 0.95);
      createBtnBg.fillRect(createBtnX - createBtnW / 2, createBtnY - createBtnH / 2, createBtnW, createBtnH);
      createBtnBg.lineStyle(1, 0xffffff, 1);
      createBtnBg.strokeRect(createBtnX - createBtnW / 2, createBtnY - createBtnH / 2, createBtnW, createBtnH);
    });

    createBtnHit.on("pointerout", () => {
      createBtnBg.clear();
      createBtnBg.fillStyle(0x221a14, 0.95);
      createBtnBg.fillRect(createBtnX - createBtnW / 2, createBtnY - createBtnH / 2, createBtnW, createBtnH);
      createBtnBg.lineStyle(1, palette.torchCore, 0.8);
      createBtnBg.strokeRect(createBtnX - createBtnW / 2, createBtnY - createBtnH / 2, createBtnW, createBtnH);
    });

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
        this.sidebarScrollbarGraphics.fillStyle(0x1a1410, 0.6);
        this.sidebarScrollbarGraphics.fillRect(trackX - 2, maskY, 4, maskH);

        // Draw Scroll Thumb
        const thumbH = Math.max(24, Math.floor((maskH / totalHeight) * maskH));
        const thumbY = maskY + (this.sidebarScrollY / maxScroll) * (maskH - thumbH);

        this.sidebarScrollbarGraphics.fillStyle(palette.torchCore, 0.9);
        this.sidebarScrollbarGraphics.fillRoundedRect(trackX - 2, thumbY, 4, thumbH, 2);
      }
    }
  }

  private refreshCenterHeroShowcase(): void {
    ensureCharacterTextures(this);
    const store = useGameStore.getState();
    const activeChar = store.getActiveCharacter();
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const centerX = width / 2;
    const centerY = height / 2 - 95;

    if (this.centerHeroContainer) {
      this.centerHeroContainer.destroy();
      this.centerHeroContainer = undefined;
    }

    this.centerHeroContainer = this.add.container(centerX, centerY);
    this.centerHeroContainer.setDepth(15);

    if (activeChar) {
      const cls = (activeChar.className || "warrior").toLowerCase() as keyof typeof CLASS_LORE;
      const lore = CLASS_LORE[cls];

      // Pedestal Platform & Torch Glow
      const pedestal = this.add.graphics();
      // Drop Shadow
      pedestal.fillStyle(0x000000, 0.45);
      pedestal.fillEllipse(0, 26, 90, 24);
      // Stone Platform
      pedestal.fillStyle(0x1c1712, 0.85);
      pedestal.fillEllipse(0, 20, 78, 18);
      // Torch Gold Rim
      pedestal.lineStyle(2, palette.torchCore, 0.85);
      pedestal.strokeEllipse(0, 20, 78, 18);

      // Pixel Art Hero Sprite
      const textureKey = `preview_${cls}_down`;
      const heroSprite = this.add.sprite(0, -10, textureKey);
      heroSprite.setScale(2.0);

      // Gentle floating animation
      this.tweens.add({
        targets: heroSprite,
        y: -16,
        duration: 1500,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });

      // Hero Name Text (moved down 20px)
      const nameText = this.add.text(0, 60, activeChar.name.toUpperCase(), {
        fontFamily: CANVAS_FONT.body,
        fontSize: "16px",
        color: toCss(palette.frameBright),
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3,
      });
      nameText.setOrigin(0.5);

      // Hero Class Badge Text (moved down 20px)
      const classTitle = lore ? `${lore.title} • LV.${activeChar.level}` : `${cls.toUpperCase()} LV.${activeChar.level}`;
      const classText = this.add.text(0, 80, classTitle, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "11px",
        color: toCss(palette.torchCore),
        letterSpacing: 2,
      });
      classText.setOrigin(0.5);

      this.centerHeroContainer.add([pedestal, heroSprite, nameText, classText]);
    } else {
      // Empty pedestal prompt
      const pedestal = this.add.graphics();
      pedestal.fillStyle(0x000000, 0.3);
      pedestal.fillEllipse(0, 26, 80, 20);
      pedestal.lineStyle(1, palette.hudLabel, 0.4);
      pedestal.strokeEllipse(0, 26, 80, 20);

      const emptyText = this.add.text(0, 0, "+ CREATE HERO", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "13px",
        color: toCss(palette.hudLabel),
        letterSpacing: 2,
      });
      emptyText.setOrigin(0.5);

      const hit = this.add.rectangle(0, 0, 140, 80, 0x000000, 0);
      hit.setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => {
        this.scene.start("CharacterCreationScene", { slotIndex: 0 });
      });

      this.centerHeroContainer.add([pedestal, emptyText, hit]);
    }
  }

  private refreshHeroSidebar(): void {
    const store = useGameStore.getState();
    const activeIdx = store.activeSlotIndex;
    const createdSlots = store.slots
      .map((char, index) => ({ char, index }))
      .filter((item): item is { char: CharacterSave; index: number } => item.char !== null);

    this.refreshCenterHeroShowcase();

    if (this.heroSidebarCards.length !== createdSlots.length) {
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
    const totalHeight = createdSlots.length * (cardH + gap) + 8;

    this.heroSidebarCards.forEach((card, i) => {
      const slotItem = createdSlots[i];
      if (!slotItem) return;
      const { char, index: slotIdx } = slotItem;
      const isSelected = slotIdx === activeIdx;
      const y = startY + i * (cardH + gap);

      card.hitArea.setPosition(panelX + 14 + cardW / 2, y + cardH / 2);
      card.hitArea.setSize(cardW, cardH);

      if (card.deleteBtn && card.deleteHit) {
        card.deleteBtn.setPosition(panelX + panelW - 28, y + 24);
        card.deleteHit.setPosition(panelX + panelW - 28, y + 24);
      }

      card.bg.clear();

      const cls = (char.className || "warrior").toLowerCase();
      const texKey = `preview_${cls}_down`;

      if (card.avatarSprite) {
        card.avatarSprite.setTexture(texKey);
        card.avatarSprite.setPosition(panelX + 32, y + 34);
        card.avatarSprite.setVisible(true);
      }

      card.nameText.setText(char.name).setPosition(panelX + 54, y + 14).setVisible(true);
      card.classText.setText(`${char.className.toUpperCase()} • LV.${char.level}`).setPosition(panelX + 54, y + 40).setVisible(true);

      if (card.deleteBtn && card.deleteHit) {
        card.deleteBtn.setVisible(true);
        card.deleteHit.setInteractive({ useHandCursor: true }).setVisible(true);

        card.deleteHit.off("pointerdown");
        card.deleteHit.on("pointerdown", (e: Phaser.Input.Pointer) => {
          e.event.stopPropagation();
          if (confirm(`Delete character "${char.name}"?`)) {
            store.deleteCharacter(slotIdx);
            this.createHeroRightSidebar();
          }
        });
      }

      if (isSelected) {
        card.bg.fillStyle(0x2a1e16, 0.95);
        card.bg.fillRect(x, y, cardW, cardH);
        card.bg.lineStyle(2, palette.torchCore, 1);
        card.bg.strokeRect(x, y, cardW, cardH);
        card.bg.fillStyle(palette.ember, 1);
        card.bg.fillRect(x, y, 4, cardH);
      } else {
        card.bg.fillStyle(palette.ground, 0.4);
        card.bg.fillRect(x, y, cardW, cardH);
        card.bg.lineStyle(1, palette.wallTop, 0.3);
        card.bg.strokeRect(x, y, cardW, cardH);
      }
    });

    this.updateSidebarScrollPosition(maskY, maskH, panelX + panelW - 6, totalHeight);
  }

  private handleStartGame(): void {
    const store = useGameStore.getState();
    const activeChar = store.getActiveCharacter();

    if (!activeChar) {
      const emptyIdx = store.slots.findIndex((s) => s === null);
      const targetSlot = emptyIdx !== -1 ? emptyIdx : 0;
      this.scene.start("CharacterCreationScene", { slotIndex: targetSlot });
      return;
    }

    // Open matchmaking queue popup modal immediately
    this.showQueuePopup(1);

    const chosenClass = (activeChar.className || "warrior").toLowerCase();
    const chosenName = activeChar.name;

    socketManager.sendMessage(ActionType.Find_Game, {
      class: chosenClass,
      className: chosenClass,
      characterName: chosenName,
      username: chosenName,
    });
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
        this.startButtonText.setColor(toCss(palette.frame));
        this.connectionStatusText.setText("The way is open // Server connected");
        this.connectionStatusText.setColor(toCss(palette.hudLabel));
        this.drawButton(0x1c1712, palette.frame, palette.ember);
      } else if (status === "connecting") {
        hitArea.disableInteractive();
        this.startButtonText.setText("CONNECTING...");
        this.startButtonText.setColor(toCss(palette.hudFaint));
        this.connectionStatusText.setText("Kindling torch // Connecting to game server...");
        this.connectionStatusText.setColor(toCss(palette.torchCore));
        this.drawButton(0x141210, palette.torchCore);
      } else {
        hitArea.disableInteractive();
        this.startButtonText.setText("LOST");
        this.startButtonText.setColor(toCss(palette.hudFaint));
        this.connectionStatusText.setText("The torch gutters // Connection lost");
        this.connectionStatusText.setColor("#e74c3c");
        this.drawButton(0x141210, 0x2a231b);
      }
    }
  }

  private drawButton(fill: number, stroke: number, glowColor?: number): void {
    if (!this.cameras || !this.cameras.main) return;
    const width = this.cameras.main.width;
    const titleX = width / 2;
    const btnX = titleX - 110;
    const btnY = this.cameras.main.height / 2 + 55;
    const btnW = 220;
    const btnH = 50;

    if (this.buttonGlow && glowColor) {
      this.buttonGlow.clear();
      this.buttonGlow.fillStyle(glowColor, 0.15);
      this.buttonGlow.fillRoundedRect(btnX - 4, btnY - 4, btnW + 8, btnH + 8, 6);
    } else if (this.buttonGlow) {
      this.buttonGlow.clear();
    }

    if (this.buttonBg) {
      this.buttonBg.clear();
      this.buttonBg.fillStyle(fill, 1);
      this.buttonBg.fillRoundedRect(btnX, btnY, btnW, btnH, 4);
      this.buttonBg.lineStyle(2, stroke, 0.9);
      this.buttonBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 4);
    }
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
      0x000000,
      0.7
    );
    this.queueOverlay.setDepth(100);

    this.queuePopupContainer = this.add.container(width / 2, height / 2);
    this.queuePopupContainer.setDepth(101);

    const boxW = 320;
    const boxH = 160;
    const boxBg = this.add.graphics();
    boxBg.fillStyle(palette.inkDeep, 0.95);
    boxBg.fillRoundedRect(-boxW / 2, -boxH / 2, boxW, boxH, 8);
    boxBg.lineStyle(2, palette.interactableBright, 0.8);
    boxBg.strokeRoundedRect(-boxW / 2, -boxH / 2, boxW, boxH, 8);

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
      color: toCss(palette.interactable),
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
    if (this.sidebarContainer) {
      this.sidebarContainer.destroy();
      this.sidebarContainer = undefined;
    }
    this.closeQueuePopup();
  }
}
