import Phaser from "phaser";
import { palette } from "@/utils/canvasPalette";

export type Facing = "up" | "down" | "left" | "right";

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

interface VillagerPalette {
  hair: number;
  hairShade: number;
  skin: number;
  skinShade: number;
  eye: number;
  cloth: number;
  clothShade: number;
  clothLight: number;
  trim: number;
  ink: number;
}

/**
 * The hub's residents: four of them, so four palettes.
 *
 * Muted and earthy on purpose. The canvas uses colour as a readability channel —
 * amber means interactable, brass means a frame — so villagers wear the greens,
 * browns and faded blues that signal nothing at all. A resident who caught the
 * eye would be lying about being worth crossing the hub for.
 */
const VILLAGER_PALETTES: Record<string, VillagerPalette> = {
  green: {
    hair: 0x4a3826, hairShade: 0x33261a, skin: 0xb08968, skinShade: 0x8a6a50,
    eye: 0x1c1712, cloth: 0x5a6b42, clothShade: 0x404d2f, clothLight: 0x6e8052,
    trim: 0x7a6440, ink: 0x1c1712,
  },
  rust: {
    hair: 0x6b4a2a, hairShade: 0x4c341d, skin: 0xc09a78, skinShade: 0x94745a,
    eye: 0x1c1712, cloth: 0x7a4a33, clothShade: 0x5a3524, clothLight: 0x8f5b40,
    trim: 0x5a4632, ink: 0x1c1712,
  },
  slate: {
    hair: 0x2e2a26, hairShade: 0x1f1c19, skin: 0xa87f5f, skinShade: 0x82624a,
    eye: 0x1c1712, cloth: 0x4a5560, clothShade: 0x343d46, clothLight: 0x5c6a76,
    trim: 0x6b6349, ink: 0x1c1712,
  },
  flax: {
    hair: 0x8a7442, hairShade: 0x64542f, skin: 0xc2a180, skinShade: 0x977c60,
    eye: 0x1c1712, cloth: 0x8a7a52, clothShade: 0x665a3c, clothLight: 0x9e8c62,
    trim: 0x5a4632, ink: 0x1c1712,
  },
};

/**
 * Draws one of the hub's residents.
 *
 * Ordinary folk: no helm, no staff, no bow. `skirt` widens the garment from the
 * waist down instead of splitting it into legs, which at this scale is the whole
 * of the difference — twenty-six pixels tall leaves no room for anything subtler.
 */
export function drawVillager(
  g: Phaser.GameObjects.Graphics,
  facing: Facing,
  pal: VillagerPalette,
  skirt: boolean,
): void {
  const P = 2;
  const W = 24;
  const H = 26;
  const ox = (60 - W * P) / 2;
  const oy = (60 - H * P) / 2;

  const grid: (number | null)[][] = Array.from({ length: H }, () =>
    Array<number | null>(W).fill(null),
  );
  const set = (x: number, y: number, c: number) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    grid[y][x] = c;
  };
  const bar = (y: number, x0: number, x1: number, c: number) => {
    for (let x = x0; x <= x1; x++) set(x, y, c);
  };

  const back = facing === "up";
  const left = facing === "left";
  const right = facing === "right";
  const side = left || right;
  const lean = left ? -1 : right ? 1 : 0;
  const cx = 11 + lean;

  // hair, and the head under it
  bar(2, cx - 3, cx + 3, pal.hair);
  bar(3, cx - 4, cx + 4, pal.hair);
  for (let y = 4; y <= 6; y++) bar(y, cx - 4, cx + 4, pal.skin);
  bar(4, cx - 4, cx + 4, pal.hair);
  if (skirt) {
    // longer hair falls past the jaw
    for (let y = 5; y <= 8; y++) {
      set(cx - 4, y, pal.hair);
      set(cx + 4, y, pal.hair);
    }
  }
  bar(7, cx - 3, cx + 3, pal.skin);
  for (let y = 4; y <= 7; y++) set(cx + 4, y, pal.skinShade);

  if (!back) {
    if (side) {
      set(cx + (right ? 2 : -2), 5, pal.eye);
    } else {
      set(cx - 2, 5, pal.eye);
      set(cx + 2, 5, pal.eye);
    }
  }

  // shoulders and body
  bar(8, cx - 4, cx + 4, pal.cloth);
  for (let y = 9; y <= 14; y++) {
    bar(y, cx - 4, cx + 4, pal.cloth);
    set(cx + 4, y, pal.clothShade);
    set(cx - 4, y, pal.clothLight);
  }

  // a belt, or an apron tie
  bar(13, cx - 4, cx + 4, pal.trim);

  // arms
  for (let y = 9; y <= 13; y++) {
    set(cx - 5, y, pal.cloth);
    set(cx + 5, y, pal.clothShade);
  }
  set(cx - 5, 14, pal.skin);
  set(cx + 5, 14, pal.skinShade);

  if (skirt) {
    // the garment widens to the hem
    for (let y = 15; y <= 22; y++) {
      const w = 4 + Math.floor((y - 14) / 2);
      bar(y, cx - w, cx + w, pal.cloth);
      for (let x = cx + 1; x <= cx + w; x++) set(x, y, pal.clothShade);
      set(cx - w, y, pal.clothLight);
    }
    bar(23, cx - 7, cx + 7, pal.clothShade);
    // feet peep out
    set(cx - 3, 24, pal.hairShade);
    set(cx + 2, 24, pal.hairShade);
  } else {
    for (let y = 15; y <= 18; y++) bar(y, cx - 4, cx + 4, pal.cloth);
    // trousers
    for (let y = 19; y <= 23; y++) {
      bar(y, cx - 4, cx - 1, pal.trim);
      bar(y, cx + 1, cx + 4, pal.trim);
    }
    bar(24, cx - 4, cx - 1, pal.hairShade);
    bar(24, cx + 1, cx + 4, pal.hairShade);
  }

  // outline
  const ink: Array<[number, number]> = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (grid[y][x] !== null) continue;
      const near =
        grid[y][x - 1] != null ||
        grid[y][x + 1] != null ||
        grid[y - 1]?.[x] != null ||
        grid[y + 1]?.[x] != null;
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

/**
 * An appearance is "<palette>_<build>", e.g. "green_skirt" — authored in the
 * hub's map data so a resident looks the same to everyone and after a restart,
 * rather than being hashed out of an entity id that changes.
 */
export function ensureVillagerTexture(scene: Phaser.Scene, appearance: string): string {
  const [tone, build] = appearance.split("_");
  const pal = VILLAGER_PALETTES[tone] ?? VILLAGER_PALETTES.green;
  const skirt = build === "skirt";

  const facings: Facing[] = ["down", "up", "left", "right"];
  for (const facing of facings) {
    const key = `villager_${tone}_${build}_${facing}`;
    if (scene.textures.exists(key) && scene.textures.get(key).key !== "__MISSING") continue;

    const g = scene.make.graphics({});
    drawVillager(g, facing, pal, skirt);
    g.generateTexture(key, 60, 60);
    g.destroy();
  }

  return `villager_${tone}_${build}`;
}

export function drawKnight(
  g: Phaser.GameObjects.Graphics,
  facing: "up" | "down" | "left" | "right",
  pal: KnightPalette = KNIGHT_PALETTE
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

export function drawWizard(
  g: Phaser.GameObjects.Graphics,
  facing: "up" | "down" | "left" | "right",
  pal: WizardPalette = WIZARD_PALETTE
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
  for (let y = 3; y <= 25; y++) set(staffCol, y, pal.staff);
  set(staffCol - 1, 3, pal.orbGlow, true);
  set(staffCol, 2, pal.orb);
  set(staffCol + 1, 3, pal.orbGlow, true);
  set(staffCol, 4, pal.orbGlow, true);

  bar(1, 11 + lean, 12 + lean, pal.hat);
  bar(2, 10 + lean, 13 + lean, pal.hat);
  bar(3, 10 + lean, 13 + lean, pal.hat);
  bar(4, 9 + lean, 14 + lean, pal.hat);
  bar(5, 9 + lean, 14 + lean, pal.hat);
  bar(6, 8 + lean, 15 + lean, pal.hat);
  bar(7, 7 + lean, 16 + lean, pal.band);

  for (let y = 1; y <= 6; y++) {
    for (let x = 12 + lean; x <= 16 + lean; x++)
      if (grid[y]?.[x] != null) set(x, y, pal.hatShade);
  }

  bar(8, 5 + lean, 18 + lean, pal.hat);
  bar(9, 6 + lean, 17 + lean, pal.hatShade);

  if (!back) {
    const fx0 = side ? (left ? 7 : 11) : 9;
    const fx1 = side ? (left ? 12 : 16) : 14;
    for (let y = 9; y <= 12; y++) bar(y, fx0, fx1, pal.face);
    if (!side) {
      set(10, 10, pal.eye);
      set(13, 10, pal.eye);
    } else {
      set(left ? 8 : 15, 10, pal.eye);
    }
  }

  for (let y = 12; y <= 24; y++) {
    const w = y <= 15 ? 4 : y <= 19 ? 5 : 6;
    const cx = 11 + lean;
    bar(y, cx - w, cx + w, pal.robe);
    for (let x = cx + 1; x <= cx + w; x++) set(x, y, pal.robeShade);
    set(cx - w, y, pal.robeLight);
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

export function drawArcher(
  g: Phaser.GameObjects.Graphics,
  facing: "up" | "down" | "left" | "right",
  pal: ArcherPalette = ARCHER_PALETTE
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

  const bowCol = left ? 4 : 19;
  for (let y = 6; y <= 20; y++) set(bowCol, y, pal.bow);
  set(bowCol - 1, 5, pal.bow);
  set(bowCol + 1, 21, pal.bow);
  const stringCol = left ? 6 : 17;
  for (let y = 6; y <= 20; y++) set(stringCol, y, pal.string, true);

  bar(4, 9 + lean, 14 + lean, pal.hood);
  bar(5, 8 + lean, 15 + lean, pal.hood);
  for (let y = 6; y <= 11; y++) bar(y, 7 + lean, 16 + lean, pal.hood);
  for (let y = 4; y <= 11; y++) {
    for (let x = 12 + lean; x <= 16 + lean; x++)
      if (grid[y]?.[x] != null) set(x, y, pal.hoodShade);
  }

  if (!back) {
    const fx0 = side ? (left ? 7 : 11) : 9;
    const fx1 = side ? (left ? 12 : 16) : 14;
    for (let y = 9; y <= 11; y++) bar(y, fx0, fx1, pal.face);
    if (!side) {
      set(10, 10, pal.eye);
      set(13, 10, pal.eye);
    } else {
      set(left ? 8 : 15, 10, pal.eye);
    }
  }

  for (let y = 12; y <= 21; y++) {
    const w = y <= 15 ? 4 : 5;
    const cx = 11 + lean;
    bar(y, cx - w, cx + w, pal.leather);
    for (let x = cx + 1; x <= cx + w; x++) set(x, y, pal.leatherShade);
    set(cx - w, y, pal.trim);
  }

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

export function ensureCharacterTextures(scene: Phaser.Scene): void {
  const facings = ["down", "up", "left", "right"] as const;
  const classes = ["warrior", "mage", "archer"] as const;

  for (const cls of classes) {
    for (const facing of facings) {
      const key = `preview_${cls}_${facing}`;
      if (!scene.textures.exists(key) || scene.textures.get(key).key === "__MISSING") {
        const g = scene.make.graphics({});
        if (cls === "warrior") drawKnight(g, facing);
        else if (cls === "mage") drawWizard(g, facing);
        else if (cls === "archer") drawArcher(g, facing);

        g.generateTexture(key, 60, 60);
        g.destroy();
      }
    }
  }
}

/**
 * Draws a delver's legs beneath their sprite, swinging while they walk.
 *
 * The character textures are one static image per class per facing, so walking
 * is animated by drawing the legs rather than by cycling frames. Shared so a
 * delver strides the same way in every world.
 *
 * Clears and redraws the graphics each call; the caller owns its depth.
 */
export function drawDelverLegs(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  facing: Facing,
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
