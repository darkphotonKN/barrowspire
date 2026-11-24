// The class book's page roundels contact sheet (FS-X2CMM §I R46; §Change: Illuminated pages C2,
// ADR-0095), rendered headless through the real Phaser scene the dev gallery's "Page roundels" card
// mounts (`src/dev/gallery/pageRoundelsSheet.ts`), so what is approved is what ships.
//
//   npm run contact:pages            -> ../docs/art/class-book-pages-contact-sheet.png
//   npm run contact:pages -- out.png -> out.png
//
// The scene is bundled with esbuild (already in node_modules, through vitest), opened in headless
// Chromium (playwright-core) on SwiftShader WebGL, and its canvas shot at render scales 1, 1.5 and
// 2. The three shots are stacked top to bottom on the sheet's own pitch and written with the bake's
// deterministic PNG encoder. Nothing is downloaded and nothing but the PNG is written in the repo:
// the bundle lives in a temp folder, removed after.
//
// Browser: the installed Google Chrome (`channel: "chrome"`), else a Playwright Chromium if one is
// installed (`npx playwright-core install chromium`). CONTACT_BROWSER=<path> overrides both.
// Pixels can differ across Chrome versions (SwiftShader changes); re-render and look again.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { encodePng } from "../bake/lib/png.mjs";

const CLIENT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(process.argv[2] ?? join(CLIENT_ROOT, "..", "docs", "art", "class-book-pages-contact-sheet.png"));
/** The render scales the art gate checks (R46). */
const SCALES = [1, 1.5, 2];
/** The pitch between the stacked shots, in px. */
const GAP = 12;
const GL_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

/** The page's script: the gallery's sheet, mounted alone, with a hook to change its render scale. */
const ENTRY = `
import * as Phaser from "phaser";
import { roundEveryObject, viewport } from "@/render/viewport";
import { PAGE_SHEET, mountPageRoundels } from "@/dev/gallery/pageRoundelsSheet";
roundEveryObject(Phaser.GameObjects);
mountPageRoundels(document.getElementById("host"));
window.setScale = (s) => viewport.set({ ...PAGE_SHEET, renderScale: s, cssScale: s });
`;

async function launch() {
  const attempts = process.env.CONTACT_BROWSER ? [{ executablePath: process.env.CONTACT_BROWSER }] : [{ channel: "chrome" }, {}];
  const failures = [];
  for (const opts of attempts) {
    try {
      return await chromium.launch({ ...opts, headless: true, args: GL_ARGS });
    } catch (err) {
      failures.push(err.message.split("\n")[0]);
    }
  }
  throw new Error(`contact: no browser. Install Google Chrome, or run \`npx playwright-core install chromium\`, or set CONTACT_BROWSER.\n  ${failures.join("\n  ")}`);
}

/** Bundles the sheet into `dir` beside a page that runs it. */
async function bundle(dir) {
  await build({
    stdin: { contents: ENTRY, resolveDir: CLIENT_ROOT, loader: "ts", sourcefile: "pageRoundelsContact.ts" },
    bundle: true,
    outfile: join(dir, "bundle.js"),
    format: "iife",
    tsconfig: join(CLIENT_ROOT, "tsconfig.json"),
    alias: { "@": join(CLIENT_ROOT, "src") },
    define: { "process.env.NODE_ENV": '"development"' },
    logLevel: "warning",
  });
  writeFileSync(
    join(dir, "index.html"),
    '<!doctype html><html><body style="margin:0;background:#000"><div id="host" style="width:fit-content"></div><script src="bundle.js"></script></body></html>',
  );
}

/** Two frames, then a settle: the roundels rebuild on a render-scale change, on the next draw. */
const settle = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 400)))));

/** A screenshot's RGBA, read back through the page's own image decoder (Chrome's PNG is not always 8-bit RGBA). */
async function pixels(page, png) {
  const { width, height, data } = await page.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const ctx = Object.assign(document.createElement("canvas"), { width: bitmap.width, height: bitmap.height }).getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    let bin = "";
    for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
    return { width: bitmap.width, height: bitmap.height, data: btoa(bin) };
  }, png.toString("base64"));
  return { width, height, rgba: Buffer.from(data, "base64") };
}

async function shoot(dir) {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 3200, height: 1800 }, deviceScaleFactor: 1 });
    const problems = [];
    page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && problems.push(m.text()));
    page.on("pageerror", (e) => problems.push(e.message));
    await page.goto("file://" + join(dir, "index.html"));
    await page.waitForSelector("canvas");
    await settle(page);
    const shots = [];
    for (const s of SCALES) {
      await page.evaluate((scale) => window.setScale(scale), s);
      await settle(page);
      shots.push(await pixels(page, await page.locator("canvas").screenshot()));
    }
    // SwiftShader's note on reading the canvas back is noise
    for (const p of problems.filter((p) => !p.includes("GPU stall due to ReadPixels"))) console.warn("page:", p);
    return shots;
  } finally {
    await browser.close();
  }
}

/** The shots stacked top to bottom, left-aligned, on the first shot's top-left pixel (the sheet's pitch). */
function stack(shots) {
  const width = Math.max(...shots.map((s) => s.width));
  const height = shots.reduce((h, s) => h + s.height, 0) + GAP * (shots.length - 1);
  const out = Buffer.alloc(width * height * 4);
  const pitch = shots[0].rgba.subarray(0, 4);
  for (let i = 0; i < width * height; i++) pitch.copy(out, i * 4);
  let top = 0;
  for (const { width: w, height: h, rgba } of shots) {
    for (let y = 0; y < h; y++) rgba.copy(out, ((top + y) * width) * 4, y * w * 4, (y + 1) * w * 4);
    top += h + GAP;
  }
  return { width, height, rgba: out };
}

const dir = mkdtempSync(join(tmpdir(), "page-roundels-"));
try {
  await bundle(dir);
  const sheet = stack(await shoot(dir));
  writeFileSync(OUT, encodePng(sheet.width, sheet.height, sheet.rgba));
  console.log(`contact: wrote ${OUT} (${sheet.width}x${sheet.height})`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
