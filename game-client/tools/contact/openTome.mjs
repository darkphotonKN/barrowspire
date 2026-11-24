// The class book's open tome (FS-X2CMM §Change: Illuminated pages and the open tome C3–C5), rendered
// headless through the real Phaser scene the dev gallery's "Open tome" card mounts
// (`src/dev/gallery/openTomeSheet.ts`): the real panel on a sample Spellbook, so what is approved is
// what ships.
//
//   npm run contact:tome            -> ../docs/art/class-book-open-tome.png
//   npm run contact:tome -- out.png -> out.png
//
// Three shots, stacked: the whole 1080 x 720 run view at render scale 1 with nothing hovered (the tome
// at its place, the HUD it stands clear of outlined), then the tome alone at render scale 2 with a
// recovering row hovered and with a row short of its cost hovered (`lib/contact.mjs` holds the plumbing).

import { join, resolve } from "node:path";
import { ART_DIR, renderSheet, settle, shootCanvas } from "./lib/contact.mjs";

const ENTRY = `
import * as Phaser from "phaser";
import { roundEveryObject, viewport } from "@/render/viewport";
import { bookLayout } from "@/ui/classBookLayout";
import { SAMPLE_BOOK, TOME_SHEET, mountOpenTome } from "@/dev/gallery/openTomeSheet";
roundEveryObject(Phaser.GameObjects);
const { sheet } = mountOpenTome(document.getElementById("host"));
window.setScale = (s) => viewport.set({ ...TOME_SHEET, renderScale: s, cssScale: s });
window.hover = (row) => sheet.hover(row);
window.tomeRect = () => bookLayout(viewport, SAMPLE_BOOK.book.pages.length).panel;
`;

/** The tome's rect at render scale `s`, with a margin of pitch round it, in canvas px. */
const around = (r, s, m = 12) => ({ x: (r.x - m) * s, y: (r.y - m) * s, width: (r.width + 2 * m) * s, height: (r.height + 2 * m) * s });

await renderSheet({
  entry: ENTRY,
  sourcefile: "openTomeContact.ts",
  out: resolve(process.argv[2] ?? join(ART_DIR, "class-book-open-tome.png")),
  shots: async (page) => {
    const shots = [await shootCanvas(page)];
    await page.evaluate(() => window.setScale(2));
    await settle(page);
    const rect = await page.evaluate(() => window.tomeRect());
    for (const row of [1, 2]) {
      await page.evaluate((r) => window.hover(r), row);
      await settle(page);
      shots.push(await shootCanvas(page, around(rect, 2)));
    }
    return shots;
  },
});
