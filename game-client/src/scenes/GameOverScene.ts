import Phaser from "phaser";

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameOverScene" });
  }

  create(data: { score: number }): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Death text — grim, lore voice
    const gameOverText = this.add.text(width / 2, height / 3, "FEW RETURN WHOLE", {
      fontSize: "46px",
      color: "#6e1f1f",
      fontFamily: "Cinzel, Georgia, serif",
      fontStyle: "bold",
    });
    gameOverText.setOrigin(0.5);

    // Spoils carried out of the barrow
    const scoreText = this.add.text(
      width / 2,
      height / 2,
      `Spoils carried: ${data.score || 0}`,
      {
        fontSize: "24px",
        color: "#cdbf9a",
      },
    );
    scoreText.setOrigin(0.5);

    // Restart button
    const restartButton = this.add.text(
      width / 2,
      height * 0.65,
      "DELVE AGAIN",
      {
        fontSize: "20px",
        color: "#cdbf9a",
      },
    );
    restartButton.setOrigin(0.5);
    restartButton.setInteractive({ useHandCursor: true });

    restartButton.on("pointerover", () => restartButton.setColor("#c9a14e"));
    restartButton.on("pointerout", () => restartButton.setColor("#cdbf9a"));
    restartButton.on("pointerdown", () => this.scene.start("GameScene"));

    // Menu button
    const menuButton = this.add.text(width / 2, height * 0.75, "MAIN MENU", {
      fontSize: "20px",
      color: "#cdbf9a",
    });
    menuButton.setOrigin(0.5);
    menuButton.setInteractive({ useHandCursor: true });

    menuButton.on("pointerover", () => menuButton.setColor("#c9a14e"));
    menuButton.on("pointerout", () => menuButton.setColor("#cdbf9a"));
    menuButton.on("pointerdown", () => this.scene.start("MainMenuScene"));
  }
}
