// Atlas packing. Each sheet is kept together as one block (a grid of its frames), and blocks
// are shelf-packed per group, tallest first, ties by name, so the layout depends only on the
// catalogue, never on timing. A group that overflows MAX_SIZE spills onto a second page.

export const MAX_SIZE = 4096;
const PAGE_WIDTH = 2048;
const PAD = 2;

const roundUp4 = (n) => Math.ceil(n / 4) * 4;

/**
 * @param sheets [{ name, group, frameWidth, frameHeight, frameCount }]
 * @returns [{ key, group, width, height, placements: { [sheet]: [{ x, y }] } }]
 */
export function packAtlases(sheets) {
  const groups = new Map();
  for (const s of sheets) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group).push(s);
  }
  const pages = [];
  for (const group of [...groups.keys()].sort()) pages.push(...packGroup(group, groups.get(group)));
  return pages;
}

function packGroup(group, sheets) {
  const blocks = sheets.map((s) => {
    const sx = s.frameWidth + PAD;
    const sy = s.frameHeight + PAD;
    if (s.frameWidth + 2 * PAD > MAX_SIZE || s.frameHeight + 2 * PAD > MAX_SIZE)
      throw new Error(`pack: ${s.name} frame ${s.frameWidth}x${s.frameHeight} exceeds ${MAX_SIZE}`);
    const width = Math.max(PAGE_WIDTH, s.frameWidth + 2 * PAD);
    const cols = Math.max(1, Math.min(s.frameCount, Math.floor((width - PAD) / sx)));
    const rows = Math.ceil(s.frameCount / cols);
    return { sheet: s, cols, w: cols * sx, h: rows * sy, sx, sy };
  });
  blocks.sort((a, b) => b.h - a.h || (a.sheet.name < b.sheet.name ? -1 : 1));

  const pageWidth = Math.min(MAX_SIZE, Math.max(PAGE_WIDTH, ...blocks.map((b) => b.w + PAD)));
  const pages = [];
  let page = null;
  let x = 0;
  let y = 0;
  let shelf = 0;
  const open = () => {
    page = { key: `${group}-${pages.length}`, group, width: 0, height: 0, placements: {} };
    pages.push(page);
    x = PAD;
    y = PAD;
    shelf = 0;
  };
  open();
  for (const b of blocks) {
    if (x + b.w > pageWidth) {
      x = PAD;
      y += shelf;
      shelf = 0;
    }
    if (y + b.h > MAX_SIZE) {
      if (Object.keys(page.placements).length === 0) throw new Error(`pack: ${b.sheet.name} does not fit a page`);
      open();
    }
    page.placements[b.sheet.name] = Array.from({ length: b.sheet.frameCount }, (_, i) => ({
      x: x + (i % b.cols) * b.sx,
      y: y + Math.floor(i / b.cols) * b.sy,
    }));
    x += b.w;
    shelf = Math.max(shelf, b.h);
    page.width = Math.max(page.width, roundUp4(x + PAD));
    page.height = Math.max(page.height, roundUp4(y + shelf + PAD));
  }
  return pages;
}
