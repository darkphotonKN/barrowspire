// The class book's page roundels contact sheet (FS-X2CMM §I R46; §Change: Illuminated pages C2,
// ADR-0095), rendered headless through the real Phaser scene the dev gallery's "Page roundels" card
// mounts (`src/dev/gallery/pageRoundelsSheet.ts`), so what is approved is what ships.
//
//   npm run contact:pages            -> ../docs/art/class-book-pages-contact-sheet.png
//   npm run contact:pages -- out.png -> out.png
//
// Its canvas is shot at render scales 1, 1.5 and 2, stacked top to bottom on the sheet's own pitch
// (`lib/contact.mjs` holds the headless plumbing and says what it needs).

import { join, resolve } from "node:path";
import { ART_DIR, renderSheet, settle, shootCanvas } from "./lib/contact.mjs";

/** The render scales the art gate checks (R46). */
const SCALES = [1, 1.5, 2];

/** The page's script: the gallery's sheet, mounted alone, with a hook to change its render scale. */
const ENTRY = `
import * as Phaser from "phaser";
import { roundEveryObject, viewport } from "@/render/viewport";
import { PAGE_SHEET, mountPageRoundels } from "@/dev/gallery/pageRoundelsSheet";
roundEveryObject(Phaser.GameObjects);
mountPageRoundels(document.getElementById("host"));
window.setScale = (s) => viewport.set({ ...PAGE_SHEET, renderScale: s, cssScale: s });
`;

await renderSheet({
  entry: ENTRY,
  sourcefile: "pageRoundelsContact.ts",
  out: resolve(process.argv[2] ?? join(ART_DIR, "class-book-pages-contact-sheet.png")),
  shots: async (page) => {
    const shots = [];
    for (const s of SCALES) {
      await page.evaluate((scale) => window.setScale(scale), s);
      await settle(page);
      shots.push(await shootCanvas(page));
    }
    return shots;
  },
});
