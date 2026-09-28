import Phaser from "phaser";
import { palette, toCss, CANVAS_FONT } from "@/utils/canvasPalette";
import { CLASS_LORE, ClassKey } from "@/data/classLore";
import { useGameStore } from "@/stores/gameStore";
import { registerArt } from "@/render/art/phaser";
import type { ArtLibrary } from "@/render/art/library";
import { MenuFigure, preloadMenuArt } from "@/render/art/menuFigure";
import {
  buttonTextColor,
  drawBackdrop,
  drawButton,
  drawPanel,
  sharpenText,
  type ButtonState,
} from "@/ui/menuChrome";

/** The class on the plinth, of the baked frame: as large as §F.3 allows. */
const PREVIEW_SCALE = 1.5;

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

  private art?: ArtLibrary;
  private previewFigure?: MenuFigure;

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

  preload(): void {
    preloadMenuArt(this);
  }

  create(): void {
    sharpenText(this);
    this.art = registerArt(this);
    const width = this.cameras.main.width;

    // Charcoal with drifting dust and embers.
    drawBackdrop(this, 90);

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

    // Initial Refresh: the default class stands ready; only a pick plays the attack.
    this.updateClassSelection(this.selectedClassKey, false);
  }

  private getRandomNameForClass(key: ClassKey): string {
    const names = CLASS_LORE[key].randomNames;
    return names[Math.floor(Math.random() * names.length)];
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
        color: toCss(palette.hudText),
        letterSpacing: 2,
      });

      const subText = this.add.text(18, 48, lore.englishTitle, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "11px",
        color: toCss(palette.hudLabel),
      });

      const hitArea = this.add.rectangle(btnW / 2, btnH / 2, btnW, btnH, palette.inkDeep, 0);
      hitArea.setInteractive({ useHandCursor: true });

      container.add([titleText, subText, hitArea]);

      hitArea.on("pointerdown", () => {
        this.updateClassSelection(key);
      });

      hitArea.on("pointerover", () => {
        if (this.selectedClassKey !== key) {
          bg.clear();
          drawPanel(bg, 0, 0, btnW, btnH, { raised: true, alpha: 0.8 });
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
    drawPanel(bg, 0, 0, w, h, { raised: isSelected, alpha: isSelected ? 0.95 : 0.6 });
    if (isSelected) {
      // The chosen class is marked in the interactable channel: a thin amber inlay.
      bg.lineStyle(1, palette.interactable, 0.8);
      bg.lineBetween(8, h - 8.5, w - 8, h - 8.5);
    }
  }

  private createCharacterPreviewArea(): void {
    // The class's own baked sheet on a lit plinth, turning: exactly what will walk in the run
    // (FS-2325V §F.1-F.3). Feet stand where the old pedestal sat.
    const centerX = 460;
    const feetY = 350;
    if (!this.art) return;
    this.previewFigure = new MenuFigure(this, this.art, centerX, feetY, this.selectedClassKey, {
      scale: PREVIEW_SCALE,
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
      color: toCss(palette.hudText),
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

  /** `picked` is a delver's click: the class then plays its attack once (FS-2325V §F.2). */
  private updateClassSelection(key: ClassKey, picked = true): void {
    const changed = key !== this.selectedClassKey;
    this.selectedClassKey = key;

    // Update Class Selector Buttons visual state
    this.classButtonsMap.forEach((item, k) => {
      this.renderClassButtonBg(item.bg, 210, 95, k === key);
    });

    // The plinth shows the picked class's baked sheet.
    if (picked && changed) this.previewFigure?.setClass(key);
    else if (picked) this.previewFigure?.flourish();

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
      // HP and MP in the HUD's own bar colours; the rest are measures, in brass.
      { label: "HP", val: stats.hp, max: 200, color: palette.markerHp },
      { label: "MP", val: stats.mp, max: 200, color: palette.markerMp },
      { label: "ATK", val: stats.atk, max: 20, color: palette.frame },
      { label: "DEF", val: stats.def, max: 15, color: palette.frame },
      { label: "RNG", val: stats.range, max: 10, color: palette.frame },
      { label: "SPD", val: stats.speed, max: 250, color: palette.frame },
    ];

    statRows.forEach((row, i) => {
      const y = contentY + i * rowH;

      const lbl = this.add.text(contentX, y - 2, row.label, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "11px",
        color: toCss(palette.hudLabel),
      });
      this.statTexts.push(lbl);

      // A carved well with a brass hairline; the fill rounded to match.
      g.fillStyle(palette.inkDeep, 0.7);
      g.fillRoundedRect(contentX + 55, y, barW, barH, 3);
      const fillW = Math.min(barW, (row.val / row.max) * barW);
      if (fillW >= 2) {
        g.fillStyle(row.color, 0.85);
        g.fillRoundedRect(contentX + 55, y, fillW, barH, Math.min(3, fillW / 2));
      }
      g.lineStyle(1, palette.frame, 0.3);
      g.strokeRoundedRect(contentX + 55.5, y + 0.5, barW - 1, barH - 1, 3);

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
    drawPanel(this.nameInputBg, boxX, boxY, boxW, boxH, { raised: true });

    // Displayed Name Text
    this.nameText = this.add
      .text(width / 2 - 40, boxY + boxH / 2, this.characterName, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "18px",
        color: toCss(palette.hudText),
      })
      .setOrigin(0.5);

    // Make Box Clickable for Prompt Input
    const hitArea = this.add
      .rectangle(boxX + boxW / 2, boxY + boxH / 2, boxW, boxH, palette.inkDeep, 0)
      .setInteractive({ useHandCursor: true });

    hitArea.on("pointerdown", () => {
      const input = prompt("Enter your Hero Name:", this.characterName);
      if (input !== null && input.trim().length > 0) {
        this.characterName = input.trim().substring(0, 16);
        this.nameText?.setText(this.characterName);
      }
    });

    // Randomize Name Button: a word, not an emoji.
    const diceBtnX = boxX + boxW - 42;
    const diceBtnY = boxY + boxH / 2;
    const diceText = this.add
      .text(diceBtnX, diceBtnY, "REROLL", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "11px",
        color: toCss(palette.interactable),
        letterSpacing: 2,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    diceText.on("pointerover", () => diceText.setColor(toCss(palette.interactableBright)));
    diceText.on("pointerout", () => diceText.setColor(toCss(palette.interactable)));

    diceText.on("pointerdown", () => {
      this.characterName = this.getRandomNameForClass(this.selectedClassKey);
      this.nameText?.setText(this.characterName);
    });
  }

  private createActionButtons(): void {
    const width = this.cameras.main.width;
    const y = 620;

    // Confirm Button: amber, it commits the hero.
    const confirmW = 240;
    const confirmH = 50;
    const confirmX = width / 2 - confirmW / 2 + 100;
    this.stoneButton(confirmX, y, confirmW, confirmH, "CONFIRM CREATION", "primary", 15, () =>
      this.handleConfirmCreation(),
    );

    // Back Button: arcane green, it backs out.
    const backW = 160;
    const backH = 50;
    const backX = width / 2 - confirmW / 2 - 130;
    this.stoneButton(backX, y, backW, backH, "CANCEL", "cancel", 14, () =>
      this.scene.start("MainMenuScene"),
    );
  }

  /** A beveled stone button with its label and hover glow (menu chrome, FS-2325V §F.4). */
  private stoneButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    tone: "primary" | "cancel",
    fontSize: number,
    onPress: () => void,
  ): void {
    const bg = this.add.graphics();
    const text = this.add
      .text(x + w / 2, y + h / 2, label, {
        fontFamily: CANVAS_FONT.body,
        fontSize: `${fontSize}px`,
        letterSpacing: 2,
      })
      .setOrigin(0.5);
    const draw = (state: ButtonState) => {
      drawButton(bg, x, y, w, h, tone, state);
      text.setColor(toCss(buttonTextColor(tone, state)));
    };
    draw("idle");

    const hit = this.add
      .rectangle(x + w / 2, y + h / 2, w, h, palette.inkDeep, 0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerdown", onPress);
    hit.on("pointerover", () => draw("hover"));
    hit.on("pointerout", () => draw("idle"));
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
}
