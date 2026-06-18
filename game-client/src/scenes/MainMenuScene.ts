import { ActionType } from "@/assets/types/client";
import { socketManager, ConnectionStatus } from "@/utils/class/SocketManager";
import Phaser from "phaser";

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

  constructor() {
    super({ key: "MainMenuScene" });
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Barrow-dark background
    this.cameras.main.setBackgroundColor("#0d0b0a");

    // The Spire — a black silhouette rising behind the title
    const spire = this.add.graphics();
    const sx = width / 2;
    const baseY = height + 20;
    const spireTopY = height * 0.12;
    const halfBase = 70;
    const halfMid = 26;
    // body of the spire
    spire.fillStyle(0x080605, 1);
    spire.beginPath();
    spire.moveTo(sx - halfBase, baseY);
    spire.lineTo(sx - halfMid, height * 0.42);
    spire.lineTo(sx, spireTopY);
    spire.lineTo(sx + halfMid, height * 0.42);
    spire.lineTo(sx + halfBase, baseY);
    spire.closePath();
    spire.fillPath();
    // faint cold rim-light down the left edge
    spire.lineStyle(2, 0x52555c, 0.18);
    spire.beginPath();
    spire.moveTo(sx, spireTopY);
    spire.lineTo(sx - halfMid, height * 0.42);
    spire.lineTo(sx - halfBase, baseY);
    spire.strokePath();
    // a single torch ember partway up the Spire
    spire.fillStyle(0xc2611f, 0.5);
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
      const color = ember ? 0xc2611f : Math.random() < 0.5 ? 0x8a7d5c : 0x52555c;
      stars.fillStyle(color, alpha);
      stars.fillRect(x, y, size, size);
    }

    // Faint masonry grid overlay
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x5a4632, 0.05);
    for (let x = 0; x <= width; x += 40) {
      grid.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y <= height; y += 40) {
      grid.lineBetween(0, y, width, y);
    }

    // Scanline effect
    this.scanlineGraphics = this.add.graphics();
    this.scanlineGraphics.fillStyle(0x000000, 0.03);
    for (let y = 0; y < height; y += 4) {
      this.scanlineGraphics.fillRect(0, y, width, 2);
    }
    this.scanlineGraphics.setDepth(100);

    // Horizontal accent line under title area
    const accentLine = this.add.graphics();
    accentLine.lineStyle(1, 0xe8a14d, 0.3);
    accentLine.lineBetween(width * 0.2, height / 4 + 85, width * 0.8, height / 4 + 85);

    // Title
    const title = this.add.text(width / 2, height / 4, "THE ERA OF BARROWSPIRE", {
      fontSize: "48px",
      color: "#e8a14d",
      fontStyle: "bold",
      letterSpacing: 12,
    });
    title.setOrigin(0.5);
    // Subtitle
    const subtitle = this.add.text(
      width / 2,
      height / 4 + 55,
      "DELVE THE BARROW-DEEP // FEW RETURN WHOLE",
      {
        fontSize: "14px",
        color: "#6f8f4a",
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
        fontSize: "15px",
        color: "#8a7d5c",
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
    const btnY = height / 2 + 50;
    const btnW = 220;
    const btnH = 50;

    this.buttonBg = this.add.graphics();
    this.drawButton(0x2a231b, 0x8a7d5c);

    // Invisible hit area for interaction
    const hitArea = this.add.rectangle(btnX, btnY, btnW, btnH, 0x000000, 0);
    hitArea.setInteractive({ useHandCursor: true });

    // Store ref immediately — setupButtonInteraction needs it when
    // onConnectionStatusChange fires synchronously with "connected"
    (this as Record<string, unknown>)._hitArea = hitArea;

    this.startButtonText = this.add.text(
      btnX,
      btnY,
      "OPENING THE WAY...",
      {
        fontSize: "18px",
        color: "#0d0b0a",
        fontStyle: "bold",
        letterSpacing: 3,
      },
    );
    this.startButtonText.setOrigin(0.5);

    // Connection status text — near bottom of screen
    this.connectionStatusText = this.add.text(
      width / 2,
      height - 40,
      "Lighting the torch...",
      {
        fontSize: "12px",
        color: "#c2611f",
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
    socketManager.on("reconnected", (payload: { session_id: string; username: string; message: string }) => {
      console.log("Reconnected!", payload);
      if (this.connectionStatusText) {
        this.connectionStatusText.setText(`Torch relit // ${payload.username}`);
        this.connectionStatusText.setColor("#e8a14d");
      }
    });

    // Game found listener
    socketManager.on("game_found", (payload: { session_id?: string; sessionID?: string }) => {
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
    });

    // Manage Loadout button
    const loadoutBtnX = width / 2;
    const loadoutBtnY = height / 2 + 115;
    const loadoutBtnW = 180;
    const loadoutBtnH = 36;

    this.loadoutBtnBg = this.add.graphics();
    this.loadoutBtnBg.fillStyle(0x14110c, 0.8);
    this.loadoutBtnBg.fillRoundedRect(loadoutBtnX - loadoutBtnW / 2, loadoutBtnY - loadoutBtnH / 2, loadoutBtnW, loadoutBtnH, 4);
    this.loadoutBtnBg.lineStyle(1, 0xe8a14d, 0.3);
    this.loadoutBtnBg.strokeRoundedRect(loadoutBtnX - loadoutBtnW / 2, loadoutBtnY - loadoutBtnH / 2, loadoutBtnW, loadoutBtnH, 4);

    const loadoutText = this.add.text(loadoutBtnX, loadoutBtnY, 'PREPARE YOUR KIT', {
      fontSize: '12px',
      color: '#e8a14d',
      letterSpacing: 3,
    });
    loadoutText.setOrigin(0.5);

    const loadoutHit = this.add.rectangle(loadoutBtnX, loadoutBtnY, loadoutBtnW, loadoutBtnH, 0x000000, 0);
    loadoutHit.setInteractive({ useHandCursor: true });

    loadoutHit.on('pointerover', () => {
      if (!this.loadoutBtnBg) return;
      this.loadoutBtnBg.clear();
      this.loadoutBtnBg.fillStyle(0x241c14, 0.9);
      this.loadoutBtnBg.fillRoundedRect(loadoutBtnX - loadoutBtnW / 2, loadoutBtnY - loadoutBtnH / 2, loadoutBtnW, loadoutBtnH, 4);
      this.loadoutBtnBg.lineStyle(1, 0xe8a14d, 0.6);
      this.loadoutBtnBg.strokeRoundedRect(loadoutBtnX - loadoutBtnW / 2, loadoutBtnY - loadoutBtnH / 2, loadoutBtnW, loadoutBtnH, 4);
    });

    loadoutHit.on('pointerout', () => {
      if (!this.loadoutBtnBg) return;
      this.loadoutBtnBg.clear();
      this.loadoutBtnBg.fillStyle(0x14110c, 0.8);
      this.loadoutBtnBg.fillRoundedRect(loadoutBtnX - loadoutBtnW / 2, loadoutBtnY - loadoutBtnH / 2, loadoutBtnW, loadoutBtnH, 4);
      this.loadoutBtnBg.lineStyle(1, 0xe8a14d, 0.3);
      this.loadoutBtnBg.strokeRoundedRect(loadoutBtnX - loadoutBtnW / 2, loadoutBtnY - loadoutBtnH / 2, loadoutBtnW, loadoutBtnH, 4);
    });

    loadoutHit.on('pointerdown', () => {
      this.scene.start('LoadoutScene');
    });

    // Controls info
    const controlsText = this.add.text(
      width / 2,
      height - 60,
      "WASD Move  //  SPACE Strike  //  E Interact  //  F Plunder  //  I Pack",
      {
        fontSize: "11px",
        color: "#5a5238",
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
        fontSize: "9px",
        color: "#1c1712",
        letterSpacing: 1,
      },
    );
    versionText.setOrigin(0.5);
  }

  private drawButton(fill: number, stroke: number, glowColor?: number): void {
    const width = this.cameras.main.width;
    const btnX = width / 2 - 110;
    const btnY = this.cameras.main.height / 2 + 50 - 25;
    const btnW = 220;
    const btnH = 50;

    if (this.buttonGlow && glowColor) {
      this.buttonGlow.clear();
      this.buttonGlow.fillStyle(glowColor, 0.15);
      this.buttonGlow.fillRoundedRect(btnX - 4, btnY - 4, btnW + 8, btnH + 8, 10);
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
    if (!this.buttonBg || !this.startButtonText || !this.connectionStatusText) {
      return;
    }

    const hitArea = (this as Record<string, unknown>)._hitArea as Phaser.GameObjects.Rectangle | undefined;

    switch (status) {
      case "connected":
        this.isConnected = true;
        if (this.dotAnimation) {
          this.dotAnimation.destroy();
        }
        this.drawButton(0xe8a14d, 0xe8a14d, 0xe8a14d);
        this.startButtonText.setText("DELVE");
        this.startButtonText.setColor("#0d0b0a");
        this.connectionStatusText.setText("The way is open");
        this.connectionStatusText.setColor("#e8a14d");
        this.setupButtonInteraction();
        break;

      case "connecting":
        this.isConnected = false;
        this.drawButton(0x2a231b, 0x8a7d5c);
        if (hitArea) hitArea.disableInteractive();
        this.startButtonText.setText("OPENING THE WAY...");
        this.startButtonText.setColor("#8a7d5c");
        this.connectionStatusText.setColor("#c2611f");
        break;

      case "error":
        this.isConnected = false;
        if (this.dotAnimation) {
          this.dotAnimation.destroy();
        }
        this.drawButton(0x2e1414, 0x6e1f1f, 0x6e1f1f);
        if (hitArea) hitArea.disableInteractive();
        this.startButtonText.setText("SEALED");
        this.startButtonText.setColor("#6e1f1f");
        this.connectionStatusText.setText("The way is sealed // Refresh to retry");
        this.connectionStatusText.setColor("#6e1f1f");
        break;

      case "disconnected":
        this.isConnected = false;
        if (this.dotAnimation) {
          this.dotAnimation.destroy();
        }
        this.drawButton(0x1c1712, 0x8a7d5c);
        if (hitArea) hitArea.disableInteractive();
        this.startButtonText.setText("LOST");
        this.startButtonText.setColor("#8a7d5c");
        this.connectionStatusText.setText("The torch gutters // Refresh to retry");
        this.connectionStatusText.setColor("#c2611f");
        break;
    }
  }

  private setupButtonInteraction(): void {
    const hitArea = (this as Record<string, unknown>)._hitArea as Phaser.GameObjects.Rectangle | undefined;
    if (!hitArea) return;

    hitArea.setInteractive({ useHandCursor: true });

    hitArea.on("pointerover", () => {
      if (this.isConnected) {
        this.drawButton(0xf2b866, 0xe8a14d, 0xe8a14d);
      }
    });

    hitArea.on("pointerout", () => {
      if (this.isConnected) {
        this.drawButton(0xe8a14d, 0xe8a14d, 0xe8a14d);
      }
    });

    hitArea.on("pointerdown", () => {
      if (this.isConnected) {
        socketManager.sendMessage(ActionType.Find_Game, { playerId: "1" });
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
      0x000000,
      0.8,
    );

    this.queuePopupContainer = this.add.container(width / 2, height / 2);

    // Popup background
    const popupW = 320;
    const popupH = 200;
    const bg = this.add.graphics();
    bg.fillStyle(0x0d0b0a, 1);
    bg.fillRoundedRect(-popupW / 2, -popupH / 2, popupW, popupH, 8);
    bg.lineStyle(1, 0xe8a14d, 0.4);
    bg.strokeRoundedRect(-popupW / 2, -popupH / 2, popupW, popupH, 8);

    this.queueTitle = this.add
      .text(0, -60, "GATHERING THE DELVE", {
        fontSize: "18px",
        color: "#e8a14d",
        letterSpacing: 4,
      })
      .setOrigin(0.5);

    this.queuePeopleText = this.add
      .text(0, -15, "Delvers gathered: 0 / 2", {
        fontSize: "14px",
        color: "#8a7d5c",
      })
      .setOrigin(0.5);

    // Cancel button
    const cancelBg = this.add.graphics();
    cancelBg.fillStyle(0x1c1210, 1);
    cancelBg.fillRoundedRect(-60, 35, 120, 36, 4);
    cancelBg.lineStyle(1, 0x6f8f4a, 0.5);
    cancelBg.strokeRoundedRect(-60, 35, 120, 36, 4);

    const cancelText = this.add
      .text(0, 53, "CANCEL", {
        fontSize: "13px",
        color: "#6f8f4a",
        letterSpacing: 3,
      })
      .setOrigin(0.5);

    const cancelHit = this.add.rectangle(0, 53, 120, 36, 0x000000, 0);
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

    this.queuePopupContainer.add([bg, this.queueTitle, this.queuePeopleText, cancelBg, cancelText, cancelHit]);
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
