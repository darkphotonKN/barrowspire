import { ActionType } from "@/assets/types/client";
import { socketManager, ConnectionStatus } from "@/utils/class/SocketManager";
import { useGameStore } from "@/stores/gameStore";
import Phaser from "phaser";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";

export class MainMenuScene extends Phaser.Scene {
  private unsubscribeConnectionStatus?: () => void;
  private buttonBg?: Phaser.GameObjects.Graphics;
  private buttonGlow?: Phaser.GameObjects.Graphics;
  private startButtonText?: Phaser.GameObjects.Text;
  private connectionStatusText?: Phaser.GameObjects.Text;
  private isConnected: boolean = false;
  private dotAnimation?: Phaser.Time.TimerEvent;
  private dotCount: number = 0;
  private scanlineGraphics?: Phaser.GameObjects.Graphics;
  private glowTween?: Phaser.Tweens.Tween;
  private loadoutBtnBg?: Phaser.GameObjects.Graphics;
  private queuePopupActive: boolean = false;
  private queueTitle?: Phaser.GameObjects.Text;
  private queuePeopleText?: Phaser.GameObjects.Text;
  private queueOverlay?: Phaser.GameObjects.Rectangle;
  private queuePopupContainer?: Phaser.GameObjects.Container;
  private classButtons: {
    key: string;
    bg: Phaser.GameObjects.Graphics;
    text: Phaser.GameObjects.Text;
    descText: Phaser.GameObjects.Text;
    hitArea: Phaser.GameObjects.Rectangle;
  }[] = [];

  constructor() {
    super({ key: "MainMenuScene" });
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Barrow-dark background
    this.cameras.main.setBackgroundColor(toCss(palette.ink));

    // The Spire — a black silhouette rising behind the title
    const spire = this.add.graphics();
    const sx = width / 2;
    const baseY = height + 20;
    const spireTopY = height * 0.12;
    const halfBase = 70;
    const halfMid = 26;
    // body of the spire
    spire.fillStyle(palette.hoodShadow, 1);
    spire.beginPath();
    spire.moveTo(sx - halfBase, baseY);
    spire.lineTo(sx - halfMid, height * 0.42);
    spire.lineTo(sx, spireTopY);
    spire.lineTo(sx + halfMid, height * 0.42);
    spire.lineTo(sx + halfBase, baseY);
    spire.closePath();
    spire.fillPath();
    // faint cold rim-light down the left edge
    spire.lineStyle(2, palette.wallTop, 0.18);
    spire.beginPath();
    spire.moveTo(sx, spireTopY);
    spire.lineTo(sx - halfMid, height * 0.42);
    spire.lineTo(sx - halfBase, baseY);
    spire.strokePath();
    // a single torch ember partway up the Spire
    spire.fillStyle(palette.ember, 0.5);
    spire.fillCircle(sx + 6, height * 0.5, 2);

    // Drifting dust & embers in the dark
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
    this.scanlineGraphics.fillStyle(palette.inkDeep, 0.03);
    for (let y = 0; y < height; y += 4) {
      this.scanlineGraphics.fillRect(0, y, width, 2);
    }
    this.scanlineGraphics.setDepth(100);

    // Horizontal accent line under title area
    const accentLine = this.add.graphics();
    accentLine.lineStyle(1, palette.frame, 0.3);
    accentLine.lineBetween(
      width * 0.2,
      height / 4 + 85,
      width * 0.8,
      height / 4 + 85,
    );

    // Title — the one canvas surface blackletter is permitted on, at 48px,
    // well above the 28px floor. See design-guideline.md "The blackletter bound".
    // No fontStyle: bold — Pirata One ships a single weight and a synthesised
    // bold wrecks blackletter letterforms.
    const title = this.add.text(
      width / 2,
      height / 4,
      "THE AGE OF BARROWSPIRE",
      {
        fontFamily: CANVAS_FONT.display,
        fontSize: "48px",
        color: toCss(palette.frameBright),
        letterSpacing: 6,
      },
    );
    title.setOrigin(0.5);
    // Subtitle
    const subtitle = this.add.text(
      width / 2,
      height / 4 + 55,
      "DELVE THE BARROW-DEEP // FEW RETURN WHOLE",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "14px",
        color: toCss(palette.safe),
        letterSpacing: 6,
      },
    );
    subtitle.setOrigin(0.5);

    // Description
    const desc = this.add.text(
      width / 2,
      height / 2 - 40,
      "Delve. Plunder. Escape.\nFew return whole.",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "15px",
        color: toCss(palette.hudLabel),
        align: "center",
        lineSpacing: 6,
      },
    );
    desc.setOrigin(0.5);

    // Button glow layer (behind button)
    this.buttonGlow = this.add.graphics();
    this.buttonGlow.setAlpha(0);

    // Button background (rounded rect via graphics)
    const btnX = width / 2;
    const btnY = height / 2 + 115;
    const btnW = 220;
    const btnH = 50;

    this.buttonBg = this.add.graphics();
    this.drawButton(palette.hudPanel, palette.hudLabel);

    // Invisible hit area for interaction
    const hitArea = this.add.rectangle(
      btnX,
      btnY,
      btnW,
      btnH,
      palette.inkDeep,
      0,
    );
    hitArea.setInteractive({ useHandCursor: true });

    // Store ref immediately — setupButtonInteraction needs it when
    // onConnectionStatusChange fires synchronously with "connected"
    (this as Record<string, unknown>)._hitArea = hitArea;

    this.startButtonText = this.add.text(btnX, btnY, "OPENING THE WAY...", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "18px",
      color: toCss(palette.ink),
      fontStyle: "bold",
      letterSpacing: 3,
    });
    this.startButtonText.setOrigin(0.5);

    // Connection status text — near bottom of screen
    this.connectionStatusText = this.add.text(
      width / 2,
      height - 40,
      "Lighting the torch...",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "12px",
        color: toCss(palette.ember),
        letterSpacing: 2,
      },
    );
    this.connectionStatusText.setOrigin(0.5);

    // Connecting dot animation
    this.dotAnimation = this.time.addEvent({
      delay: 500,
      callback: () => {
        if (!this.isConnected && this.connectionStatusText) {
          this.dotCount = (this.dotCount + 1) % 4;
          const dots = ".".repeat(this.dotCount);
          this.connectionStatusText.setText(`Lighting the torch${dots}`);
        }
      },
      loop: true,
    });

    // Connection status listener
    this.unsubscribeConnectionStatus = socketManager.onConnectionStatusChange(
      (status: ConnectionStatus) => {
        this.handleConnectionStatusChange(status);
      },
    );

    // Reconnection listener
    socketManager.on(
      "reconnected",
      (payload: { session_id: string; username: string; message: string }) => {
        console.log("Reconnected!", payload);
        if (this.connectionStatusText) {
          this.connectionStatusText.setText(
            `Torch relit // ${payload.username}`,
          );
          this.connectionStatusText.setColor(toCss(palette.frameBright));
        }
      },
    );

    // Game found listener
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

    // Manage Loadout button
    const loadoutBtnX = width / 2;
    const loadoutBtnY = height / 2 + 175;
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

    loadoutHit.on("pointerover", () => {
      if (!this.loadoutBtnBg) return;
      this.loadoutBtnBg.clear();
      this.loadoutBtnBg.fillStyle(palette.delverCloak, 0.9);
      this.loadoutBtnBg.fillRoundedRect(
        loadoutBtnX - loadoutBtnW / 2,
        loadoutBtnY - loadoutBtnH / 2,
        loadoutBtnW,
        loadoutBtnH,
        4,
      );
      this.loadoutBtnBg.lineStyle(1, palette.interactableBright, 0.6);
      this.loadoutBtnBg.strokeRoundedRect(
        loadoutBtnX - loadoutBtnW / 2,
        loadoutBtnY - loadoutBtnH / 2,
        loadoutBtnW,
        loadoutBtnH,
        4,
      );
    });

    loadoutHit.on("pointerout", () => {
      if (!this.loadoutBtnBg) return;
      this.loadoutBtnBg.clear();
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
    });

    loadoutHit.on("pointerdown", () => {
      this.scene.start("LoadoutScene");
    });

    // Controls info
    const controlsText = this.add.text(
      width / 2,
      height - 60,
      "WASD Move  //  SPACE Strike  //  E Interact  //  F Plunder  //  I Pack",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "11px",
        color: toCss(palette.hudFaint),
        letterSpacing: 2,
      },
    );
    controlsText.setOrigin(0.5);

    // Version / flavor text
    const versionText = this.add.text(
      width / 2,
      height - 35,
      "v0.1 // THE BARROW-DEEP // FEW RETURN WHOLE",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "9px",
        color: toCss(palette.ink),
        letterSpacing: 1,
      },
    );
    versionText.setOrigin(0.5);

    // Create the Class Selector UI
    this.createClassSelector();

    // Register scene shutdown listener to clear socket callbacks
    this.events.once("shutdown", () => {
      this.shutdown();
    });
  }

  private createClassSelector(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Label "SELECT YOUR CLASS"
    const labelY = height / 2 - 15;
    const label = this.add.text(width / 2, labelY, "SELECT YOUR CLASS", {
      fontSize: "12px",
      color: "#8a7d5c",
      letterSpacing: 4,
    });
    label.setOrigin(0.5);

    const classes = [
      { key: "warrior", label: "WARRIOR", desc: "High Health & Defense" },
      { key: "mage", label: "MAGE", desc: "High Mana & Range" },
      { key: "archer", label: "ARCHER", desc: "High Speed & Range" },
    ];

    const btnW = 150;
    const btnH = 50;
    const spacing = 16;
    const totalW = (btnW * classes.length) + (spacing * (classes.length - 1));
    const startX = (width - totalW) / 2 + (btnW / 2);
    const buttonsY = labelY + 45;

    classes.forEach((cls, idx) => {
      const x = startX + idx * (btnW + spacing);

      // Create graphics for button background/border
      const bg = this.add.graphics();

      // Create text for class name
      const text = this.add.text(x, buttonsY - 10, cls.label, {
        fontSize: "13px",
        color: "#e8a14d",
        fontStyle: "bold",
        letterSpacing: 2,
      });
      text.setOrigin(0.5);

      // Create subtext/description
      const descText = this.add.text(x, buttonsY + 12, cls.desc, {
        fontSize: "8px",
        color: "#52555c",
        letterSpacing: 1,
      });
      descText.setOrigin(0.5);

      // Invisible hit area for clicks
      const hitArea = this.add.rectangle(x, buttonsY, btnW, btnH, 0x000000, 0);
      hitArea.setInteractive({ useHandCursor: true });

      const btnObj = { key: cls.key, bg, text, descText, hitArea };
      this.classButtons.push(btnObj);

      // Hover / Out events
      hitArea.on("pointerover", () => {
        this.drawClassButton(btnObj, true);
      });

      hitArea.on("pointerout", () => {
        this.drawClassButton(btnObj, false);
      });

      hitArea.on("pointerdown", () => {
        useGameStore.getState().setSelectedClass(cls.key);
        this.updateClassSelection();
      });
    });

    // Draw initial state
    this.updateClassSelection();
  }

  private drawClassButton(
    btn: {
      key: string;
      bg: Phaser.GameObjects.Graphics;
      text: Phaser.GameObjects.Text;
      descText: Phaser.GameObjects.Text;
      hitArea: Phaser.GameObjects.Rectangle;
    },
    isHovered: boolean
  ): void {
    const isSelected = useGameStore.getState().selectedClass === btn.key;
    const bg = btn.bg;
    const x = btn.hitArea.x;
    const y = btn.hitArea.y;
    const w = btn.hitArea.width;
    const h = btn.hitArea.height;

    bg.clear();

    // Determine colors
    let fillColor = 0x141210;
    let strokeColor = 0x2a231b;
    let strokeAlpha = 0.6;
    let textColor = "#8a7d5c";
    let descColor = "#52555c";

    if (isSelected) {
      fillColor = 0x241d17;
      strokeColor = 0xe8a14d;
      strokeAlpha = 0.9;
      textColor = "#e8a14d";
      descColor = "#8a7d5c";
    } else if (isHovered) {
      fillColor = 0x1c1712;
      strokeColor = 0x8a7d5c;
      strokeAlpha = 0.8;
      textColor = "#e8a14d";
      descColor = "#8a7d5c";
    }

    bg.fillStyle(fillColor, 1);
    bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, 4);
    bg.lineStyle(1, strokeColor, strokeAlpha);
    bg.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 4);

    btn.text.setColor(textColor);
    btn.descText.setColor(descColor);
  }

  private updateClassSelection(): void {
    this.classButtons.forEach((btn) => {
      this.drawClassButton(btn, false);
    });
  }

  private drawButton(fill: number, stroke: number, glowColor?: number): void {
    if (!this.cameras || !this.cameras.main) return;
    const width = this.cameras.main.width;
    const btnX = width / 2 - 110;
    const btnY = this.cameras.main.height / 2 + 115 - 25;
    const btnW = 220;
    const btnH = 50;

    if (this.buttonGlow && glowColor) {
      this.buttonGlow.clear();
      this.buttonGlow.fillStyle(glowColor, 0.15);
      this.buttonGlow.fillRoundedRect(
        btnX - 4,
        btnY - 4,
        btnW + 8,
        btnH + 8,
        10,
      );
      this.buttonGlow.setAlpha(1);
    }

    if (this.buttonBg) {
      this.buttonBg.clear();
      this.buttonBg.fillStyle(fill, 1);
      this.buttonBg.fillRoundedRect(btnX, btnY, btnW, btnH, 6);
      this.buttonBg.lineStyle(1, stroke, 0.8);
      this.buttonBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 6);
    }
  }

  private handleConnectionStatusChange(status: ConnectionStatus): void {
    if (
      !this.sys ||
      !this.sys.settings ||
      !this.sys.settings.active ||
      !this.buttonBg ||
      !this.startButtonText ||
      !this.connectionStatusText
    ) {
      return;
    }

    const hitArea = (this as Record<string, unknown>)._hitArea as
      | Phaser.GameObjects.Rectangle
      | undefined;
    const safeDisableInteractive = (area?: Phaser.GameObjects.Rectangle) => {
      if (area && area.scene && area.scene.sys && area.input) {
        area.disableInteractive();
      }
    };

    switch (status) {
      case "connected":
        this.isConnected = true;
        if (this.dotAnimation) {
          this.dotAnimation.destroy();
        }
        this.drawButton(
          palette.interactable,
          palette.interactable,
          palette.interactable,
        );
        this.startButtonText.setText("DELVE");
        this.startButtonText.setColor(toCss(palette.ink));
        this.connectionStatusText.setText("The way is open");
        this.connectionStatusText.setColor(toCss(palette.frameBright));
        this.setupButtonInteraction();
        break;

      case "connecting":
        this.isConnected = false;
        this.drawButton(palette.hudPanel, palette.hudLabel);
        if (hitArea) hitArea.disableInteractive();
        safeDisableInteractive(hitArea);
        this.startButtonText.setText("OPENING THE WAY...");
        this.startButtonText.setColor(toCss(palette.hudLabel));
        this.connectionStatusText.setColor(toCss(palette.ember));
        break;

      case "error":
        this.isConnected = false;
        if (this.dotAnimation) {
          this.dotAnimation.destroy();
        }
        this.drawButton(palette.damage, palette.damage, palette.damage);
        if (hitArea) hitArea.disableInteractive();
        safeDisableInteractive(hitArea);
        this.startButtonText.setText("SEALED");
        this.startButtonText.setColor(toCss(palette.damage));
        this.connectionStatusText.setText(
          "The way is sealed // Refresh to retry",
        );
        this.connectionStatusText.setColor(toCss(palette.damage));
        break;

      case "disconnected":
        this.isConnected = false;
        if (this.dotAnimation) {
          this.dotAnimation.destroy();
        }
        this.drawButton(palette.ink, palette.hudLabel);
        if (hitArea) hitArea.disableInteractive();
        safeDisableInteractive(hitArea);
        this.startButtonText.setText("LOST");
        this.startButtonText.setColor(toCss(palette.hudLabel));
        this.connectionStatusText.setText(
          "The torch gutters // Refresh to retry",
        );
        this.connectionStatusText.setColor(toCss(palette.ember));
        break;
    }
  }

  private setupButtonInteraction(): void {
    const hitArea = (this as Record<string, unknown>)._hitArea as
      | Phaser.GameObjects.Rectangle
      | undefined;
    if (!hitArea) return;

    hitArea.setInteractive({ useHandCursor: true });

    hitArea.on("pointerover", () => {
      if (this.isConnected) {
        this.drawButton(
          palette.interactableBright,
          palette.interactable,
          palette.interactable,
        );
      }
    });

    hitArea.on("pointerout", () => {
      if (this.isConnected) {
        this.drawButton(
          palette.interactable,
          palette.interactable,
          palette.interactable,
        );
      }
    });

    hitArea.on("pointerdown", () => {
      if (this.isConnected) {
        const selectedClass = useGameStore.getState().selectedClass;
        socketManager.sendMessage(ActionType.Find_Game, { playerId: "1", class: selectedClass });
        this.queuePopup();
      }
    });
  }

  shutdown(): void {
    if (this.unsubscribeConnectionStatus) {
      this.unsubscribeConnectionStatus();
    }
    if (this.dotAnimation) {
      this.dotAnimation.destroy();
    }
    if (this.glowTween) {
      this.glowTween.destroy();
    }
    this.classButtons = [];
  }

  queuePopup() {
    const { width, height } = this.scale;

    this.queuePopupActive = true;

    // Dark overlay
    this.queueOverlay = this.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      palette.inkDeep,
      0.8,
    );

    this.queuePopupContainer = this.add.container(width / 2, height / 2);

    // Popup background
    const popupW = 320;
    const popupH = 200;
    const bg = this.add.graphics();
    bg.fillStyle(palette.ink, 1);
    bg.fillRoundedRect(-popupW / 2, -popupH / 2, popupW, popupH, 8);
    bg.lineStyle(1, palette.frame, 0.4);
    bg.strokeRoundedRect(-popupW / 2, -popupH / 2, popupW, popupH, 8);

    this.queueTitle = this.add
      .text(0, -60, "GATHERING THE DELVE", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "18px",
        color: toCss(palette.frameBright),
        letterSpacing: 4,
      })
      .setOrigin(0.5);

    this.queuePeopleText = this.add
      .text(0, -15, "Delvers gathered: 0 / 2", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "14px",
        color: toCss(palette.hudLabel),
      })
      .setOrigin(0.5);

    // Cancel button
    const cancelBg = this.add.graphics();
    cancelBg.fillStyle(palette.ink, 1);
    cancelBg.fillRoundedRect(-60, 35, 120, 36, 4);
    cancelBg.lineStyle(1, palette.safe, 0.5);
    cancelBg.strokeRoundedRect(-60, 35, 120, 36, 4);

    const cancelText = this.add
      .text(0, 53, "CANCEL", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "13px",
        color: toCss(palette.safe),
        letterSpacing: 3,
      })
      .setOrigin(0.5);

    const cancelHit = this.add.rectangle(0, 53, 120, 36, palette.inkDeep, 0);
    cancelHit.setInteractive({ useHandCursor: true });

    // Queue status listener
    socketManager.on(
      "queue_status",
      (payload: { current: number; total: number }) => {
        console.log("Queue status payload:", payload);
        if (!payload || !this.queuePeopleText) return;
        this.queuePeopleText.setText(
          `Delvers gathered: ${payload.current} / ${payload.total}`,
        );
      },
    );

    cancelHit.on("pointerdown", () => {
      this.closeQueuePopup();
      // TODO: send leave queue message to backend
    });

    this.queuePopupContainer.add([
      bg,
      this.queueTitle,
      this.queuePeopleText,
      cancelBg,
      cancelText,
      cancelHit,
    ]);
  }

  private closeQueuePopup() {
    this.queuePopupActive = false;

    socketManager.off("queue_status");

    if (this.queueOverlay) {
      this.queueOverlay.destroy();
      this.queueOverlay = undefined;
    }
    if (this.queuePopupContainer) {
      this.queuePopupContainer.destroy();
      this.queuePopupContainer = undefined;
    }

    this.queueTitle = undefined;
    this.queuePeopleText = undefined;
  }
}
