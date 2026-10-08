// Atlas packing. Each sheet is kept together as one block (a grid of its frames), and blocks
// are shelf-packed per group, tallest first, ties by name, so the layout depends only on the
// catalogue, never on timing. A group that overflows MAX_SIZE spills onto a second page. A
// block too tall for a page at PAGE_WIDTH is laid out wider instead.
//
// A sheet too big for one page even at full width (a winged boss: FS-Q14EV §B.7) is split into
// one block per animation instead, each animation's frames kept together on one page; the
// sheet's animations may then sit on several pages of its group. Such a sheet comes back in
// each page's `parts` rather than its `placements`. An animation too big for a page on its own
// is still an error: trim the frame box or the frame count.

export const MAX_SIZE = 4096;
const PAGE_WIDTH = 2048;
const PAD = 2;

const roundUp4 = (n) => Math.ceil(n / 4) * 4;

/**
 * @param sheets [{ name, group, frameWidth, frameHeight, frameCount, animations? }], where
 *   `animations` lists [{ name, frameCount }] in frame order (needed only to split a sheet)
 * @returns [{ key, group, width, height, placements: { [sheet]: [{ x, y }] },
 *   parts: { [sheet]: { [animation]: [{ x, y }] } } }]
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

/**
 * A grid block of `count` frames, or null when it cannot fit one page even at full width. A
 * `wide` block (an animation of a split sheet) takes the full page width, so the animations
 * stack as bands and share pages.
 */
function grid(s, count, wide = false) {
  const sx = s.frameWidth + PAD;
  const sy = s.frameHeight + PAD;
  const width = wide ? MAX_SIZE : Math.max(PAGE_WIDTH, s.frameWidth + 2 * PAD);
  let cols = Math.max(1, Math.min(count, Math.floor((width - PAD) / sx)));
  // a sheet too tall for a page at the default width (a character's 200-odd frames) widens,
  // up to MAX_SIZE, rather than fail
  const maxRows = Math.floor((MAX_SIZE - PAD) / sy);
  if (Math.ceil(count / cols) > maxRows) cols = Math.min(Math.floor((MAX_SIZE - PAD) / sx), Math.ceil(count / maxRows));
  const rows = Math.ceil(count / cols);
  if (rows * sy + PAD > MAX_SIZE) return null;
  return { cols, w: cols * sx, h: rows * sy, sx, sy, count };
}

function packGroup(group, sheets) {
  const blocks = sheets.flatMap((s) => {
    if (s.frameWidth + 2 * PAD > MAX_SIZE || s.frameHeight + 2 * PAD > MAX_SIZE)
      throw new Error(`pack: ${s.name} frame ${s.frameWidth}x${s.frameHeight} exceeds ${MAX_SIZE}`);
    const whole = grid(s, s.frameCount);
    if (whole) return [{ sheet: s, key: s.name, ...whole }];
    if (!s.animations) throw new Error(`pack: ${s.name} (${s.frameCount} frames) cannot fit one ${MAX_SIZE}² page`);
    // oversized: one block per animation, each of which must fit a page by itself
    return s.animations.map((a) => {
      const part = grid(s, a.frameCount, true);
      if (!part) throw new Error(`pack: ${s.name} animation ${a.name} (${a.frameCount} frames) cannot fit one ${MAX_SIZE}² page`);
      return { sheet: s, anim: a.name, key: `${s.name}/${a.name}`, ...part };
    });
  });
  blocks.sort((a, b) => b.h - a.h || (a.key < b.key ? -1 : 1));

  const pageWidth = Math.min(MAX_SIZE, Math.max(PAGE_WIDTH, ...blocks.map((b) => b.w + PAD)));
  const pages = [];
  const open = () => {
    const st = { page: { key: `${group}-${pages.length}`, group, width: 0, height: 0, placements: {}, parts: {} }, x: PAD, y: PAD, shelf: 0 };
    pages.push(st);
    return st;
  };
  /** Places `b` on the page's current shelf, or a new shelf below it; false if it does not fit. */
  const place = (st, b) => {
    let { x, y, shelf } = st;
    if (x + b.w > pageWidth) {
      x = PAD;
      y += shelf;
      shelf = 0;
    }
    if (y + b.h > MAX_SIZE) return false;
    const spots = Array.from({ length: b.count }, (_, i) => ({
      x: x + (i % b.cols) * b.sx,
      y: y + Math.floor(i / b.cols) * b.sy,
    }));
    const page = st.page;
    if (b.anim) (page.parts[b.sheet.name] ??= {})[b.anim] = spots;
    else page.placements[b.sheet.name] = spots;
    x += b.w;
    shelf = Math.max(shelf, b.h);
    page.width = Math.max(page.width, roundUp4(x + PAD));
    page.height = Math.max(page.height, roundUp4(y + shelf + PAD));
    Object.assign(st, { x, y, shelf });
    return true;
  };
  // A group holding a split sheet fills any of its pages that has room (first fit), so the
  // animations share pages instead of opening one each. Every other group keeps filling only its
  // newest page, the layout its committed atlases were packed with.
  const firstFit = blocks.some((b) => b.anim);
  open();
  for (const b of blocks) {
    const candidates = firstFit ? pages : [pages[pages.length - 1]];
    if (candidates.some((st) => place(st, b))) continue;
    if (!place(open(), b)) throw new Error(`pack: ${b.key} does not fit a page`);
  }
  return pages.map((st) => st.page);
}
