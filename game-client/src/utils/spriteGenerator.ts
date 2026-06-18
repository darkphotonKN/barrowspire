/**
 * sprite generator for the hooded delver character
 * creates programmatic sprites for the game since we dont have image assets.
 *
 * Reskin note: same sprite-sheet dimensions, frame layout (8 dir x 5 frames)
 * and limited walk animation as before — only the *drawing* changed from a
 * spacesuit astronaut to an inked, paper-cutout hooded delver to match the
 * barrow-dark art direction. No gameplay/animation timing was altered.
 */

export class AstronautSpriteGenerator {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private frameWidth = 36;
  private frameHeight = 36;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }

  generateSpriteSheet(): string {
    // sprite sheet layout: 8 directions x 5 frames (1 idle + 4 walk)
    const cols = 5; // frames per direction
    const rows = 8; // directions: N, NE, E, SE, S, SW, W, NW

    this.canvas.width = this.frameWidth * cols;
    this.canvas.height = this.frameHeight * rows;

    // clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // generate frames for each direction
    const directions = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'];

    directions.forEach((dir, dirIndex) => {
      // generate idle frame
      this.drawDelver(0, dirIndex, dir, 0);

      // generate 4 walking frames
      for (let frame = 1; frame <= 4; frame++) {
        this.drawDelver(frame, dirIndex, dir, frame);
      }
    });

    return this.canvas.toDataURL();
  }

  /**
   * The player delver: a cloaked, hooded figure in deep umber with a sliver of
   * warm torchlight at the hood. Inked outlines, flat fills — paper-cutout read.
   */
  private drawDelver(col: number, row: number, direction: string, animFrame: number) {
    const x = col * this.frameWidth + this.frameWidth / 2;
    const y = row * this.frameHeight + this.frameHeight / 2;

    this.drawCloakedFigure(x, y, direction, animFrame, {
      cloak: '#241c14',     // deep umber cloak
      cloakDark: '#1a130d',  // shadow side
      ink: '#0d0b0a',        // inked outline
      hoodShadow: '#080605', // black under the hood
      glow: 'rgba(232, 161, 77, 0.85)',   // torch-amber face glint
      glowSoft: 'rgba(232, 161, 77, 0.35)',
    });
  }

  generateOtherPlayerSpriteSheet(): string {
    // similar to main player but with different colors
    const cols = 5;
    const rows = 8;

    this.canvas.width = this.frameWidth * cols;
    this.canvas.height = this.frameHeight * rows;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const directions = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'];

    directions.forEach((dir, dirIndex) => {
      this.drawOtherDelver(0, dirIndex, dir, 0);
      for (let frame = 1; frame <= 4; frame++) {
        this.drawOtherDelver(frame, dirIndex, dir, frame);
      }
    });

    return this.canvas.toDataURL();
  }

  /**
   * Rival delver, drawn as a pale wight: ashen cloak, sickly necrotic-green
   * eye-glow instead of the player's warm torchlight.
   */
  private drawOtherDelver(col: number, row: number, direction: string, animFrame: number) {
    const x = col * this.frameWidth + this.frameWidth / 2;
    const y = row * this.frameHeight + this.frameHeight / 2;

    this.drawCloakedFigure(x, y, direction, animFrame, {
      cloak: '#3a3d42',     // cold ashen slate
      cloakDark: '#2a2d31',
      ink: '#15171a',
      hoodShadow: '#0b0d0e',
      glow: 'rgba(111, 143, 74, 0.9)',    // necrotic green
      glowSoft: 'rgba(74, 107, 111, 0.4)',
    });
  }

  /** Shared cloaked-figure draw. Same silhouette, only the palette differs. */
  private drawCloakedFigure(
    x: number,
    y: number,
    direction: string,
    animFrame: number,
    c: {
      cloak: string;
      cloakDark: string;
      ink: string;
      hoodShadow: string;
      glow: string;
      glowSoft: string;
    },
  ) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);

    // rotation based on direction (unchanged from original facing logic)
    let rotation = 0;
    switch (direction) {
      case 'N': rotation = -Math.PI / 2; break;
      case 'NE': rotation = -Math.PI / 4; break;
      case 'E': rotation = 0; break;
      case 'SE': rotation = Math.PI / 4; break;
      case 'S': rotation = Math.PI / 2; break;
      case 'SW': rotation = 3 * Math.PI / 4; break;
      case 'W': rotation = Math.PI; break;
      case 'NW': rotation = -3 * Math.PI / 4; break;
    }
    ctx.rotate(rotation);

    // limited walk bob (same maths as before — cheap puppet motion)
    const walkOffset = animFrame > 0 ? Math.sin(animFrame * Math.PI / 2) * 2 : 0;
    const legSwing = animFrame > 0 ? Math.sin(animFrame * Math.PI) * 4 : 0;

    // soft torch/eye glow under everything
    const glowGrad = ctx.createRadialGradient(2, -2, 0, 2, -2, 11);
    glowGrad.addColorStop(0, c.glowSoft);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(2, -2, 11, 0, Math.PI * 2);
    ctx.fill();

    // legs (cloak hem shadow), drawn first so the robe overlaps them
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-3, 9);
    ctx.lineTo(-3 + legSwing, 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(3, 9);
    ctx.lineTo(3 - legSwing, 14);
    ctx.stroke();

    // robe / cloak body — a tapered drape (wider at the hem)
    ctx.fillStyle = c.cloak;
    ctx.beginPath();
    ctx.moveTo(-9, 11 + walkOffset * 0.3);   // hem left
    ctx.quadraticCurveTo(-8, -2, -5, -6);     // up the left shoulder
    ctx.lineTo(5, -6);                        // shoulders
    ctx.quadraticCurveTo(8, -2, 9, 11 + walkOffset * 0.3); // down to hem right
    ctx.closePath();
    ctx.fill();

    // shadow side of the cloak for a little form
    ctx.fillStyle = c.cloakDark;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.quadraticCurveTo(7, -1, 9, 11 + walkOffset * 0.3);
    ctx.lineTo(2, 11 + walkOffset * 0.3);
    ctx.closePath();
    ctx.fill();

    // inked outline around the cloak
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-9, 11 + walkOffset * 0.3);
    ctx.quadraticCurveTo(-8, -2, -5, -6);
    ctx.lineTo(5, -6);
    ctx.quadraticCurveTo(8, -2, 9, 11 + walkOffset * 0.3);
    ctx.stroke();

    // hood — a rounded cowl over the head
    ctx.fillStyle = c.cloak;
    ctx.beginPath();
    ctx.arc(0, -5 + walkOffset * 0.3, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // black void of the face under the hood
    ctx.fillStyle = c.hoodShadow;
    ctx.beginPath();
    ctx.ellipse(1, -4, 4.5, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // a single warm/sickly glint where the eyes catch the light
    ctx.fillStyle = c.glow;
    ctx.beginPath();
    ctx.arc(2, -4, 1.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
