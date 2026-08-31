import Phaser from "phaser";
import { palette, toCss, CANVAS_FONT } from "@/utils/canvasPalette";
import { CLASS_LORE, ClassKey } from "@/data/classLore";
import { useGameStore } from "@/stores/gameStore";

// --- Class Color Palettes matching BarrowspireScene ---
interface KnightPalette {
  helm: number;
  helmShade: number;
  helmLight: number;
  plate: number;
  plateShade: number;
  plateLight: number;
  surcoat: number;
  surcoatShade: number;
  visor: number;
  visorGlow: number;
  sword: number;
  swordHilt: number;
  shield: number;
  shieldTrim: number;
  ink: number;
}

interface WizardPalette {
  hat: number;
  hatShade: number;
  band: number;
  face: number;
  eye: number;
  robe: number;
  robeShade: number;
  robeLight: number;
  staff: number;
  orb: number;
  orbGlow: number;
  ink: number;
}

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

const KNIGHT_PALETTE: KnightPalette = {
  helm: 0x5a5e65,
  helmShade: 0x3d4248,
  helmLight: 0x8a929a,
  plate: 0x3d4248,
  plateShade: 0x272a2e,
  plateLight: 0x5a5e65,
  surcoat: palette.hoodShadow,
  surcoatShade: palette.inkDeep,
  visor: palette.ember,
  visorGlow: palette.torchCore,
  sword: palette.hudLabel,
  swordHilt: palette.frame,
  shield: palette.ground,
  shieldTrim: palette.frame,
  ink: palette.ink,
};

const WIZARD_PALETTE: WizardPalette = {
  hat: palette.delverCloak,
  hatShade: palette.delverCloakShade,
  band: palette.frame,
  face: 0xdcbd9d,
  eye: palette.delverGlow,
  robe: palette.delverCloak,
  robeShade: palette.delverCloakShade,
  robeLight: palette.interactable,
  staff: palette.containerLid,
  orb: palette.escapeGlow,
  orbGlow: palette.escapeGlow,
  ink: palette.ink,
};

const ARCHER_PALETTE: ArcherPalette = {
  hood: 0x3c5a36,
  hoodShade: 0x243b20,
  leather: 0x6e4e37,
  leatherShade: 0x4a3322,
  trim: 0xd4a373,
  face: 0xdcbd9d,
  eye: 0xe8a14d,
  bow: 0x8c6239,
  string: 0xf2ebd9,
  ink: 0x0d0b0a,
};

export class CharacterCreationScene extends Phaser.Scene {
  private selectedClassKey: ClassKey = "warrior";
  private characterName: string = "";

  // UI Components
  private classButtonsMap: Map<
    ClassKey,
    {
      container: Phaser.GameObjects.Container;
      bg: Phaser.GameObjects.Graphics;
      titleText: Phaser.GameObjects.Text;
      subText: Phaser.GameObjects.Text;
      hitArea: Phaser.GameObjects.Rectangle;
    }
  > = new Map();

  private previewContainer?: Phaser.GameObjects.Container;
  private previewSprite?: Phaser.GameObjects.Sprite;
  private pedestalGlow?: Phaser.GameObjects.Graphics;
  private shadowGraphics?: Phaser.GameObjects.Graphics;

  private loreTitleText?: Phaser.GameObjects.Text;
  private loreDescText?: Phaser.GameObjects.Text;
  private loreWeaponText?: Phaser.GameObjects.Text;

  private statTitleText?: Phaser.GameObjects.Text;
  private statBarGraphics?: Phaser.GameObjects.Graphics;
  private statTexts: Phaser.GameObjects.Text[] = [];

  private nameText?: Phaser.GameObjects.Text;
  private nameInputBg?: Phaser.GameObjects.Graphics;
  private targetSlotIndex: number = 0;
  private panelContentX: number = 582;
  private panelContentY: number = 125;

  constructor() {
    super({ key: "CharacterCreationScene" });
  }

  init(data: { slotIndex?: number }): void {
    if (typeof data?.slotIndex === "number") {
      this.targetSlotIndex = data.slotIndex;
    } else {
      this.targetSlotIndex = useGameStore.getState().activeSlotIndex;
    }
    this.selectedClassKey = "warrior";
    this.characterName = this.getRandomNameForClass("warrior");
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Background
    this.cameras.main.setBackgroundColor(toCss(palette.ink));

    // Ambient embers
    const stars = this.add.graphics();
    for (let i = 0; i < 90; i++) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
      const ember = Math.random() < 0.15;
      const size = ember ? 2 : 1;
      const alpha = ember
        ? Phaser.Math.FloatBetween(0.25, 0.55)
        : Phaser.Math.FloatBetween(0.06, 0.2);
      const color = ember ? palette.ember : palette.wallTop;
      stars.fillStyle(color, alpha);
      stars.fillRect(x, y, size, size);
    }

    // Header Title
    this.add
      .text(width / 2, 38, "SELECT YOUR CLASS", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "24px",
        color: toCss(palette.frameBright),
        letterSpacing: 4,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 68, `SLOT #${this.targetSlotIndex + 1} — FORGE YOUR HERO`, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "12px",
        color: toCss(palette.hudLabel),
        letterSpacing: 2,
      })
      .setOrigin(0.5);

    // Generate In-Game Exact Pixel Art Sprites for Preview
    this.createCharacterTextures();

    // 1. Create Class Selector Buttons (Left Panel)
    this.createClassSelectorPanel();

    // 2. Create Character Graphics Preview (Center Area)
    this.createCharacterPreviewArea();

    // 3. Create Lore & Stats Panel (Right Panel)
    this.createLoreAndStatsPanel();

    // 4. Create Name Input Area (Bottom Panel)
    this.createNameInputArea();

    // 5. Create Footer Action Buttons (Confirm / Back)
    this.createActionButtons();

    // Initial Refresh
    this.updateClassSelection(this.selectedClassKey);
  }

  private getRandomNameForClass(key: ClassKey): string {
    const names = CLASS_LORE[key].randomNames;
    return names[Math.floor(Math.random() * names.length)];
  }

  private createCharacterTextures(): void {
    const facings = ["down", "up", "left", "right"] as const;

    // Warrior (Knight)
    for (const facing of facings) {
      const key = `preview_warrior_${facing}`;
      if (!this.textures.exists(key)) {
        const g = this.make.graphics({});
        this.drawKnight(g, facing, KNIGHT_PALETTE);
        g.generateTexture(key, 60, 60);
        g.destroy();
      }
    }

    // Mage (Wizard)
    for (const facing of facings) {
      const key = `preview_mage_${facing}`;
      if (!this.textures.exists(key)) {
        const g = this.make.graphics({});
        this.drawWizard(g, facing, WIZARD_PALETTE);
        g.generateTexture(key, 60, 60);
        g.destroy();
      }
    }

    // Archer
    for (const facing of facings) {
      const key = `preview_archer_${facing}`;
      if (!this.textures.exists(key)) {
        const g = this.make.graphics({});
        this.drawArcher(g, facing, ARCHER_PALETTE);
        g.generateTexture(key, 60, 60);
        g.destroy();
      }
    }
  }

  private createClassSelectorPanel(): void {
    const keys: ClassKey[] = ["warrior", "mage", "archer"];
    const startX = 60;
    const startY = 110;
    const btnW = 210;
    const btnH = 95;
    const gap = 16;

    keys.forEach((key, idx) => {
      const y = startY + idx * (btnH + gap);
      const container = this.add.container(startX, y);

      const bg = this.add.graphics();
      container.add(bg);

      const lore = CLASS_LORE[key];
      const titleText = this.add.text(18, 18, lore.name, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "18px",
        color: "#ffffff",
        letterSpacing: 2,
      });

      const subText = this.add.text(18, 48, lore.englishTitle, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "11px",
        color: toCss(palette.hudLabel),
      });

      const hitArea = this.add.rectangle(btnW / 2, btnH / 2, btnW, btnH, 0x000000, 0);
      hitArea.setInteractive({ useHandCursor: true });

      container.add([titleText, subText, hitArea]);

      hitArea.on("pointerdown", () => {
        this.updateClassSelection(key);
      });

      hitArea.on("pointerover", () => {
        if (this.selectedClassKey !== key) {
          bg.clear();
          bg.fillStyle(palette.wall, 0.7);
          bg.lineStyle(2, palette.torch, 0.8);
          bg.strokeRect(0, 0, btnW, btnH);
          bg.fillRect(0, 0, btnW, btnH);
        }
      });

      hitArea.on("pointerout", () => {
        if (this.selectedClassKey !== key) {
          this.renderClassButtonBg(bg, btnW, btnH, false);
        }
      });

      this.classButtonsMap.set(key, { container, bg, titleText, subText, hitArea });
    });
  }

  private renderClassButtonBg(
    bg: Phaser.GameObjects.Graphics,
    w: number,
    h: number,
    isSelected: boolean
  ): void {
    bg.clear();
    if (isSelected) {
      bg.fillStyle(0x2a221b, 0.95);
      bg.fillRect(0, 0, w, h);
      bg.lineStyle(2, palette.ember, 1);
      bg.strokeRect(0, 0, w, h);
      bg.fillStyle(palette.ember, 1);
      bg.fillRect(0, 0, 6, h);
    } else {
      bg.fillStyle(palette.ground, 0.45);
      bg.fillRect(0, 0, w, h);
      bg.lineStyle(1, palette.wallTop, 0.3);
      bg.strokeRect(0, 0, w, h);
    }
  }

  private createCharacterPreviewArea(): void {
    const centerX = 460;
    const centerY = 280;

    this.previewContainer = this.add.container(centerX, centerY);

    // Pedestal Glow
    this.pedestalGlow = this.add.graphics();
    this.pedestalGlow.fillStyle(palette.ember, 0.15);
    this.pedestalGlow.fillEllipse(0, 75, 140, 36);
    this.pedestalGlow.lineStyle(2, palette.torchCore, 0.4);
    this.pedestalGlow.strokeEllipse(0, 75, 140, 36);

    // Shadow
    this.shadowGraphics = this.add.graphics();
    this.shadowGraphics.fillStyle(0x000000, 0.5);
    this.shadowGraphics.fillEllipse(0, 68, 80, 20);

    // Character Sprite
    this.previewSprite = this.add.sprite(0, 0, "preview_warrior_down");
    this.previewSprite.setScale(3.8);

    this.previewContainer.add([this.pedestalGlow, this.shadowGraphics, this.previewSprite]);

    // Idle Bobbing Animation
    this.tweens.add({
      targets: this.previewSprite,
      y: "-=8",
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private createLoreAndStatsPanel(): void {
    this.panelContentX = 650;
    this.panelContentY = 110;
    const textWrapWidth = 370;

    // Class Lore Header Title
    this.loreTitleText = this.add.text(this.panelContentX, this.panelContentY, "", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "18px",
      color: "#ffffff",
      letterSpacing: 2,
    });

    // Weapon & Primary Stat
    this.loreWeaponText = this.add.text(this.panelContentX, this.panelContentY + 30, "", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "11px",
      color: toCss(palette.torchCore),
      letterSpacing: 1,
    });

    // Description Paragraph (Wrapped cleanly inside panel)
    this.loreDescText = this.add.text(this.panelContentX, this.panelContentY + 56, "", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "14px",
      color: toCss(palette.hudText),
      wordWrap: { width: textWrapWidth },
      lineSpacing: 5,
    });

    // Stats Section Title
    this.statTitleText = this.add.text(this.panelContentX, this.panelContentY + 140, "CLASS ATTRIBUTES", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "11px",
      color: toCss(palette.frame),
      letterSpacing: 2,
    });

    // Stats Bar Graphics & Text Elements
    this.statBarGraphics = this.add.graphics();
  }

  private updateClassSelection(key: ClassKey): void {
    this.selectedClassKey = key;

    // Update Class Selector Buttons visual state
    this.classButtonsMap.forEach((item, k) => {
      this.renderClassButtonBg(item.bg, 210, 95, k === key);
    });

    // Update Preview Sprite to the in-game sprite texture
    if (this.previewSprite) {
      this.previewSprite.setTexture(`preview_${key}_down`);
    }

    // Update Lore Text
    const lore = CLASS_LORE[key];
    if (this.loreTitleText) {
      this.loreTitleText.setText(`${lore.name} — ${lore.title}`);
      this.loreTitleText.setFontFamily(CANVAS_FONT.body);
    }
    if (this.loreWeaponText) {
      this.loreWeaponText.setText(`WEAPON: ${lore.weaponType}  |  STAT: ${lore.primaryStat}`);
      this.loreWeaponText.setFontFamily(CANVAS_FONT.body);
    }
    if (this.loreDescText) {
      this.loreDescText.setText(lore.description);
      this.loreDescText.setFontFamily(CANVAS_FONT.body);
    }

    // Dynamically position stat title & stat bars below description
    if (this.loreDescText && this.statTitleText) {
      const descBottomY = this.loreDescText.y + this.loreDescText.height;
      const statsTitleY = Math.max(this.panelContentY + 125, descBottomY + 16);
      this.statTitleText.setPosition(this.panelContentX, statsTitleY);
    }

    // Refresh Random Name for new class
    this.characterName = this.getRandomNameForClass(key);
    this.nameText?.setText(this.characterName);

    // Draw Stat Bars
    this.renderStatBars(lore.stats);
  }

  private renderStatBars(stats: {
    hp: number;
    mp: number;
    atk: number;
    def: number;
    range: number;
    speed: number;
  }): void {
    if (!this.statBarGraphics || !this.statTitleText) return;

    const g = this.statBarGraphics;
    g.clear();

    // Destroy previous stat text labels
    this.statTexts.forEach((txt) => txt.destroy());
    this.statTexts = [];

    const contentX = this.panelContentX;
    const contentY = this.statTitleText.y + 22;
    const barW = 180;
    const barH = 9;
    const rowH = 19;

    this.statBarGraphics.setPosition(0, 0);

    const statRows = [
      { label: "HP", val: stats.hp, max: 200, color: 0xe74c3c },
      { label: "MP", val: stats.mp, max: 200, color: 0x3498db },
      { label: "ATK", val: stats.atk, max: 20, color: 0xf39c12 },
      { label: "DEF", val: stats.def, max: 15, color: 0x2ecc71 },
      { label: "RNG", val: stats.range, max: 10, color: 0x9b59b6 },
      { label: "SPD", val: stats.speed, max: 250, color: 0x1abc9c },
    ];

    statRows.forEach((row, i) => {
      const y = contentY + i * rowH;

      const lbl = this.add.text(contentX, y - 2, row.label, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "11px",
        color: toCss(palette.hudLabel),
      });
      this.statTexts.push(lbl);

      g.fillStyle(palette.ground, 0.4);
      g.fillRect(contentX + 55, y, barW, barH);
      g.lineStyle(1, palette.wallTop, 0.2);
      g.strokeRect(contentX + 55, y, barW, barH);

      const fillW = Math.min(barW, (row.val / row.max) * barW);
      g.fillStyle(row.color, 0.85);
      g.fillRect(contentX + 55, y, fillW, barH);

      const valTxt = this.add.text(contentX + 55 + barW + 10, y - 2, `${row.val}`, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "11px",
        color: toCss(palette.hudText),
      });
      this.statTexts.push(valTxt);
    });
  }

  private createNameInputArea(): void {
    const width = this.cameras.main.width;
    const y = 490;

    this.add
      .text(width / 2, y, "HERO NAME", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "13px",
        color: toCss(palette.hudLabel),
        letterSpacing: 2,
      })
      .setOrigin(0.5);

    // Input Background Box
    const boxW = 340;
    const boxH = 46;
    const boxX = width / 2 - boxW / 2;
    const boxY = y + 16;

    this.nameInputBg = this.add.graphics();
    this.nameInputBg.fillStyle(palette.ground, 0.8);
    this.nameInputBg.fillRect(boxX, boxY, boxW, boxH);
    this.nameInputBg.lineStyle(2, palette.frame, 0.8);
    this.nameInputBg.strokeRect(boxX, boxY, boxW, boxH);

    // Displayed Name Text
    this.nameText = this.add
      .text(width / 2 - 40, boxY + boxH / 2, this.characterName, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "18px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    // Make Box Clickable for Prompt Input
    const hitArea = this.add
      .rectangle(boxX + boxW / 2, boxY + boxH / 2, boxW, boxH, 0x000000, 0)
      .setInteractive({ useHandCursor: true });

    hitArea.on("pointerdown", () => {
      const input = prompt("Enter your Hero Name:", this.characterName);
      if (input !== null && input.trim().length > 0) {
        this.characterName = input.trim().substring(0, 16);
        this.nameText?.setText(this.characterName);
      }
    });

    // Randomize Name Button
    const diceBtnX = boxX + boxW - 35;
    const diceBtnY = boxY + boxH / 2;
    const diceText = this.add
      .text(diceBtnX, diceBtnY, "🎲", {
        fontSize: "20px",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    diceText.on("pointerdown", () => {
      this.characterName = this.getRandomNameForClass(this.selectedClassKey);
      this.nameText?.setText(this.characterName);
    });
  }

  private createActionButtons(): void {
    const width = this.cameras.main.width;
    const y = 620;

    // Confirm Button
    const confirmW = 240;
    const confirmH = 50;
    const confirmX = width / 2 - confirmW / 2 + 100;

    const confirmBg = this.add.graphics();
    confirmBg.fillStyle(0x2d1f12, 0.95);
    confirmBg.fillRect(confirmX, y, confirmW, confirmH);
    confirmBg.lineStyle(2, palette.torchCore, 1);
    confirmBg.strokeRect(confirmX, y, confirmW, confirmH);

    this.add
      .text(confirmX + confirmW / 2, y + confirmH / 2, "CONFIRM CREATION", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "15px",
        color: "#ffffff",
        letterSpacing: 2,
      })
      .setOrigin(0.5);

    const confirmHit = this.add
      .rectangle(confirmX + confirmW / 2, y + confirmH / 2, confirmW, confirmH, 0x000000, 0)
      .setInteractive({ useHandCursor: true });

    confirmHit.on("pointerdown", () => {
      this.handleConfirmCreation();
    });

    confirmHit.on("pointerover", () => {
      confirmBg.clear();
      confirmBg.fillStyle(palette.ember, 0.95);
      confirmBg.fillRect(confirmX, y, confirmW, confirmH);
      confirmBg.lineStyle(2, 0xffffff, 1);
      confirmBg.strokeRect(confirmX, y, confirmW, confirmH);
    });

    confirmHit.on("pointerout", () => {
      confirmBg.clear();
      confirmBg.fillStyle(0x2d1f12, 0.95);
      confirmBg.fillRect(confirmX, y, confirmW, confirmH);
      confirmBg.lineStyle(2, palette.torchCore, 1);
      confirmBg.strokeRect(confirmX, y, confirmW, confirmH);
    });

    // Back Button
    const backW = 160;
    const backH = 50;
    const backX = width / 2 - confirmW / 2 - 130;

    const backBg = this.add.graphics();
    backBg.fillStyle(palette.ground, 0.6);
    backBg.fillRect(backX, y, backW, backH);
    backBg.lineStyle(1, palette.wallTop, 0.4);
    backBg.strokeRect(backX, y, backW, backH);

    this.add
      .text(backX + backW / 2, y + backH / 2, "CANCEL", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "14px",
        color: toCss(palette.hudText),
        letterSpacing: 2,
      })
      .setOrigin(0.5);

    const backHit = this.add
      .rectangle(backX + backW / 2, y + backH / 2, backW, backH, 0x000000, 0)
      .setInteractive({ useHandCursor: true });

    backHit.on("pointerdown", () => {
      this.scene.start("MainMenuScene");
    });
  }

  private handleConfirmCreation(): void {
    if (!this.characterName || this.characterName.trim().length === 0) {
      alert("Please enter a valid hero name.");
      return;
    }

    useGameStore
      .getState()
      .createCharacter(this.targetSlotIndex, this.characterName, this.selectedClassKey);

    this.scene.start("MainMenuScene");
  }

  // --- Exact In-Game Pixel Art Drawing Algorithms ---

  private drawKnight(
    g: Phaser.GameObjects.Graphics,
    facing: "up" | "down" | "left" | "right",
    pal: KnightPalette
  ): void {
    const P = 2;
    const W = 24;
    const H = 26;
    const ox = (60 - W * P) / 2;
    const oy = (60 - H * P) / 2;

    const grid: (number | null)[][] = Array.from({ length: H }, () =>
      Array<number | null>(W).fill(null)
    );
    const soft: boolean[][] = Array.from({ length: H }, () =>
      Array<boolean>(W).fill(false)
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
    const lean = left ? -1 : right ? 1 : 0;

    const swordCol = left ? 3 : 20;
    for (let y = 4; y <= 17; y++) set(swordCol, y, pal.sword);
    set(swordCol, 3, pal.sword);
    set(swordCol + 1, 10, pal.swordHilt);
    set(swordCol - 1, 18, pal.swordHilt);
    set(swordCol, 18, pal.swordHilt);
    set(swordCol + 1, 18, pal.swordHilt);
    set(swordCol, 19, pal.swordHilt);
    set(swordCol, 20, pal.swordHilt);

    bar(5, 9 + lean, 14 + lean, pal.helm);
    bar(6, 8 + lean, 15 + lean, pal.helm);
    for (let y = 7; y <= 13; y++) bar(y, 8 + lean, 15 + lean, pal.helm);
    for (let y = 5; y <= 13; y++) {
      for (let x = 12 + lean; x <= 15 + lean; x++)
        if (grid[y]?.[x] != null) set(x, y, pal.helmShade);
      set(8 + lean, y, pal.helmLight);
    }
    if (!back) {
      set(11 + lean, 3, pal.swordHilt);
      set(12 + lean, 3, pal.swordHilt);
      set(11 + lean, 4, pal.swordHilt);
      set(12 + lean, 4, pal.swordHilt);
    }

    if (back) {
      bar(10, 9, 14, pal.helmShade);
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

    const body: Array<[number, number, number]> = [
      [13, 6, 17],
      [14, 6, 17],
      [15, 7, 16],
      [16, 7, 16],
      [17, 8, 15],
      [18, 8, 15],
      [19, 8, 15],
      [20, 8, 15],
      [21, 9, 14],
    ];
    body.forEach(([y, a, b]) => {
      const lo = side ? a + 2 : a;
      const hi = side ? b - 2 : b;
      bar(y, lo, hi, pal.plate);
      const sh = Math.floor((lo + hi) / 2) + 1;
      for (let x = sh; x <= hi; x++) set(x, y, pal.plateShade);
      set(lo, y, pal.plateLight);
    });

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

    for (let y = 22; y <= 25; y++) {
      set(side ? 10 : 9, y, pal.plate);
      set(side ? 11 : 10, y, pal.plateShade);
      if (!side) {
        set(13, y, pal.plate);
        set(14, y, pal.plateShade);
      }
    }

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
        set(a, y, pal.shieldTrim);
      });
      set(6, 11, pal.shieldTrim);
      set(5, 14, pal.visor, true);
      set(4, 14, pal.visorGlow, true);
    }

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
        g.fillStyle(c, 1);
        g.fillRect(ox + x * P, oy + y * P, P, P);
      }
    }
  }

  private drawWizard(
    g: Phaser.GameObjects.Graphics,
    facing: "up" | "down" | "left" | "right",
    pal: WizardPalette
  ): void {
    const P = 2;
    const W = 24;
    const H = 26;
    const ox = (60 - W * P) / 2;
    const oy = (60 - H * P) / 2;

    const grid: (number | null)[][] = Array.from({ length: H }, () =>
      Array<number | null>(W).fill(null)
    );
    const soft: boolean[][] = Array.from({ length: H }, () =>
      Array<boolean>(W).fill(false)
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
    const lean = left ? -1 : right ? 1 : 0;

    const staffCol = left ? 3 : 20;
    for (let y = 5; y <= 24; y++) set(staffCol, y, pal.staff);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        set(staffCol + dx, 3 + dy, pal.orbGlow, true);
    set(staffCol, 3, pal.orb, true);

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
    bar(7, 8, 17, pal.band);
    bar(8, 6, 19, pal.hat);
    bar(9, 5, 20, pal.hat);
    for (let x = 12; x <= 20; x++) set(x, 9, pal.hatShade);

    if (back) {
      bar(10, 9, 14, pal.hat);
      bar(11, 9, 14, pal.hatShade);
      bar(12, 10, 13, pal.hat);
    } else {
      bar(10, 9, 14, pal.face);
      bar(11, 9, 14, pal.face);
      bar(12, 10, 13, pal.face);
      if (side) {
        set(left ? 9 : 14, 11, pal.eye, true);
      } else {
        set(10, 11, pal.eye, true);
        set(13, 11, pal.eye, true);
      }
    }

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
      for (let x = sh; x <= hi; x++) set(x, y, pal.robeShade);
      if (i > 0 && i < 10) set(lo + 1, y, pal.robeLight);
    });

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

  private drawArcher(
    g: Phaser.GameObjects.Graphics,
    facing: "up" | "down" | "left" | "right",
    pal: ArcherPalette
  ): void {
    const P = 2;
    const W = 24;
    const H = 26;
    const ox = (60 - W * P) / 2;
    const oy = (60 - H * P) / 2;

    const grid: (number | null)[][] = Array.from({ length: H }, () =>
      Array<number | null>(W).fill(null)
    );
    const soft: boolean[][] = Array.from({ length: H }, () =>
      Array<boolean>(W).fill(false)
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

    if (left) {
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
      for (let y = 7; y <= 19; y++) set(6, y, pal.string, true);
    } else if (right) {
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
      for (let y = 7; y <= 19; y++) set(17, y, pal.string, true);
    } else if (facing === "down") {
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
      for (let y = 8; y <= 18; y++) set(6, y, pal.string, true);
    } else if (back) {
      for (let i = 0; i < 11; i++) {
        set(7 + i, 8 + i, pal.bow);
        set(8 + i, 7 + i, pal.string, true);
      }
    }

    bar(5, 10, 13, pal.hood);
    bar(6, 9, 14, pal.hood);
    bar(7, 9, 14, pal.hood);
    bar(8, 8, 15, pal.hood);
    bar(9, 8, 15, pal.hood);
    for (let y = 5; y <= 9; y++) {
      const startX = 12;
      const endX = y === 5 ? 13 : y === 6 ? 14 : y === 7 ? 14 : 15;
      for (let x = startX; x <= endX; x++) set(x, y, pal.hoodShade);
    }

    if (back) {
      bar(10, 8, 15, pal.hoodShade);
      bar(11, 9, 14, pal.hoodShade);
      bar(12, 10, 13, pal.hoodShade);
    } else if (left) {
      bar(10, 8, 10, pal.face);
      bar(11, 8, 10, pal.face);
      bar(12, 9, 10, pal.face);
      set(8, 11, pal.eye, true);
      bar(10, 11, 14, pal.hood);
      bar(11, 11, 13, pal.hoodShade);
      bar(12, 11, 12, pal.hoodShade);
    } else if (right) {
      bar(10, 13, 15, pal.face);
      bar(11, 13, 15, pal.face);
      bar(12, 13, 14, pal.face);
      set(15, 11, pal.eye, true);
      bar(10, 9, 12, pal.hood);
      bar(11, 10, 12, pal.hoodShade);
      bar(12, 11, 12, pal.hoodShade);
    } else {
      bar(10, 10, 13, pal.face);
      bar(11, 10, 13, pal.face);
      bar(12, 10, 13, pal.face);
      set(10, 11, pal.eye, true);
      set(13, 11, pal.eye, true);
      bar(10, 8, 9, pal.hood);
      bar(10, 14, 15, pal.hoodShade);
      bar(11, 8, 9, pal.hood);
      bar(11, 14, 14, pal.hoodShade);
      bar(12, 9, 9, pal.hood);
      bar(12, 14, 14, pal.hoodShade);
    }

    const bodyWidths: Array<[number, number]> = [
      [8, 15],
      [8, 15],
      [7, 16],
      [7, 16],
      [7, 16],
      [6, 17],
      [6, 17],
      [6, 17],
      [6, 17],
    ];

    bodyWidths.forEach(([a, b], idx) => {
      const y = 13 + idx;
      const lo = side ? a + 1 : a;
      const hi = side ? b - 1 : b;
      bar(y, lo, hi, pal.leather);
      const mid = Math.floor((lo + hi) / 2) + 1;
      for (let x = mid; x <= hi; x++) set(x, y, pal.leatherShade);
      if (y === 17) {
        bar(y, lo, hi, 0x14110c);
        set(Math.floor((lo + hi) / 2), y, pal.trim);
      }
    });

    bar(22, 8, 10, pal.hood);
    bar(22, 13, 15, pal.hoodShade);
    bar(23, 8, 9, pal.hood);
    bar(23, 14, 15, pal.hoodShade);
    bar(24, 8, 9, pal.leatherShade);
    bar(24, 14, 15, pal.leatherShade);
    bar(25, 7, 9, pal.leatherShade);
    bar(25, 14, 16, pal.leatherShade);

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
        g.fillStyle(c, 1);
        g.fillRect(ox + x * P, oy + y * P, P, P);
      }
    }
  }
}
