#!/usr/bin/env node
// The build-time bake (ADR-0020 §5, FS-2325V §B): renders the 3D models in tools/bake/page/
// through the isometric camera and writes public/art/<group>-<n>.png atlases + manifest.json.
//
//   npm run bake              bake and write public/art/, plus the character review contact
//                             sheets in tools/bake/review/ (gitignored; lib/contact.mjs)
//   npm run bake -- --check   bake, write nothing, exit 1 if the output would change
//
// Characters and creatures (FS-2325V §E, ADR-0021) are authored in page/characters/: one
// skinned rig, hand-keyed clips, baked in the 8 facings of page/facing.js, whose order the
// manifest records as `facings`.
//
// Determinism. A re-bake with unchanged inputs must produce no git diff (FS-2325V §B.3):
//  - all randomness is seeded (page/noise.js); nothing calls Math.random();
//  - WebGL runs on SwiftShader (software), never the GPU, whose output varies by driver; the
//    bake refuses to run on anything else;
//  - frames are box-filtered and PNGs encoded here, with no metadata chunks (lib/png.mjs);
//  - each atlas records the sha256 of its raw pixels, and an atlas whose pixels are unchanged
//    keeps its existing PNG, so a different zlib build cannot churn files either.
// Pixels can still differ across Chrome versions (SwiftShader changes); re-bake and review.
//
// Browser: the installed Google Chrome (playwright-core `channel: "chrome"`), else a Playwright
// Chromium if one is installed (`npx playwright-core install chromium`). BAKE_BROWSER=<path>
// overrides both.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { encodePng } from "./lib/png.mjs";
import { meanColour } from "./lib/mean.mjs";
import { crownHeight } from "./lib/crown.mjs";
import { packAtlases } from "./lib/pack.mjs";
import { startServer } from "./lib/server.mjs";
import { CLIENT_ROOT, loadManifestValidator, loadTheme } from "./lib/source.mjs";
import { labelTexts, writeReview } from "./lib/contact.mjs";

const OUT_DIR = join(CLIENT_ROOT, "public", "art");
const MANIFEST = join(OUT_DIR, "manifest.json");
const CHECK = process.argv.includes("--check");
const GL_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

async function launch() {
  const attempts = process.env.BAKE_BROWSER
    ? [{ executablePath: process.env.BAKE_BROWSER }]
    : [{ channel: "chrome" }, {}];
  const failures = [];
  for (const opts of attempts) {
    try {
      return await chromium.launch({ ...opts, headless: true, args: GL_ARGS });
    } catch (err) {
      failures.push(err.message.split("\n")[0]);
    }
  }
  throw new Error(
    `bake: no browser. Install Google Chrome, or run \`npx playwright-core install chromium\`, or set BAKE_BROWSER.\n  ${failures.join("\n  ")}`,
  );
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

async function bakeAll() {
  const server = await startServer();
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(server.url);
    await page.waitForFunction(() => window.bakeReady === true, null, { timeout: 30000 }).catch(() => {
      throw new Error(`bake: page failed to start\n  ${errors.join("\n  ")}`);
    });
    const init = await page.evaluate(() => window.bakeInit());
    if (!/swiftshader/i.test(init.renderer))
      throw new Error(`bake: WebGL is on "${init.renderer}", not SwiftShader; output would not be deterministic`);
    console.log(`bake: ${browser.version()} · ${init.renderer}`);

    const sheets = [];
    for (const { name } of init.sheets) {
      const t0 = Date.now();
      const sheet = await page.evaluate((n) => window.bakeSheet(n), name);
      const frames = Object.values(sheet.animations).reduce((n, a) => n + a.frames.flat().length, 0);
      console.log(`  ${name.padEnd(28)} ${String(frames).padStart(2)} × ${sheet.frameWidth}×${sheet.frameHeight}  ${Date.now() - t0}ms`);
      sheets.push(sheet);
    }
    if (errors.length) throw new Error(`bake: page errors\n  ${errors.join("\n  ")}`);
    // review labels for the contact sheet, rendered while the page is up
    const cast = sheets.filter((x) => x.directions === 8);
    const labels = new Map();
    if (!CHECK && cast.length)
      for (const l of await page.evaluate((t) => window.bakeLabels(t), labelTexts(cast, init.facings)))
        labels.set(l.text, { w: l.w, h: l.h, px: Buffer.from(l.rgba, "base64") });
    return { tile: init.tile, facings: init.facings, sheets, labels };
  } finally {
    await browser.close();
    server.close();
  }
}

/** Packs frames into atlas pages and builds the manifest and each page's RGBA. */
function assemble({ tile, facings, sheets }) {
  // Every frame of a sheet in manifest order: animation, then direction, then frame.
  const frameList = (s) => Object.values(s.animations).flatMap((a) => a.frames.flat());
  const pages = packAtlases(
    sheets.map((s) => ({ name: s.name, group: s.group, frameWidth: s.frameWidth, frameHeight: s.frameHeight, frameCount: frameList(s).length })),
  );
  const atlasOf = {};
  const images = {};
  const atlases = {};
  for (const p of pages) {
    const rgba = Buffer.alloc(p.width * p.height * 4);
    for (const [name, spots] of Object.entries(p.placements)) {
      atlasOf[name] = { key: p.key, spots };
      const s = sheets.find((x) => x.name === name);
      frameList(s).forEach((b64, i) => {
        const px = Buffer.from(b64, "base64");
        const { x, y } = spots[i];
        for (let row = 0; row < s.frameHeight; row++)
          px.copy(rgba, ((y + row) * p.width + x) * 4, row * s.frameWidth * 4, (row + 1) * s.frameWidth * 4);
      });
    }
    images[p.key] = rgba;
    atlases[p.key] = {
      image: `${p.key}.png`,
      width: p.width,
      height: p.height,
      sha256: createHash("sha256").update(rgba).digest("hex"),
    };
  }

  const manifestSheets = {};
  for (const s of [...sheets].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const { key, spots } = atlasOf[s.name];
    let k = 0;
    const animations = {};
    for (const [anim, a] of Object.entries(s.animations))
      animations[anim] = { fps: a.fps, loop: a.loop, frames: a.frames.map((dir) => dir.map(() => spots[k++])) };
    // the ground's measured colour, which lighting's readability floor is judged against
    const mean = s.group === "ground" ? meanColour(frameList(s).map((b64) => Buffer.from(b64, "base64"))) : undefined;
    // a standing sheet's head height over every facing's idle, where name plates and HP bars sit
    const crown = s.animations.idle
      ? crownHeight(
          s.animations.idle.frames.flat().map((b64) => Buffer.from(b64, "base64")),
          s.frameWidth,
          Math.round(s.anchor.y * s.frameHeight),
        )
      : undefined;
    manifestSheets[s.name] = {
      atlas: key,
      frameWidth: s.frameWidth,
      frameHeight: s.frameHeight,
      anchor: s.anchor,
      directions: s.directions,
      animations,
      ...(s.light ? { light: s.light } : {}),
      ...(mean ? { mean } : {}),
      ...(crown ? { crown } : {}),
      source: s.source,
      licence: s.licence,
    };
  }
  return { manifest: { version: 1, tile, facings, atlases, sheets: manifestSheets }, images };
}

async function main() {
  const { validateManifest } = await loadManifestValidator();
  const t0 = Date.now();
  const baked = await bakeAll();
  const { manifest, images } = assemble(baked);

  const result = validateManifest(manifest);
  if (!result.ok) throw new Error(`bake: the manifest fails the client's validator\n  ${result.errors.join("\n  ")}`);

  const previous = readJson(MANIFEST);
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  const changed = [];
  for (const [key, atlas] of Object.entries(manifest.atlases)) {
    const file = join(OUT_DIR, atlas.image);
    if (previous?.atlases?.[key]?.sha256 === atlas.sha256 && existsSync(file)) continue;
    changed.push(atlas.image);
    if (!CHECK) {
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(file, encodePng(atlas.width, atlas.height, images[key]));
    }
  }
  const keep = new Set(["manifest.json", ...Object.values(manifest.atlases).map((a) => a.image)]);
  const stale = existsSync(OUT_DIR) ? readdirSync(OUT_DIR).filter((f) => f.endsWith(".png") && !keep.has(f)) : [];
  const manifestChanged = !existsSync(MANIFEST) || readFileSync(MANIFEST, "utf8") !== json;
  if (!CHECK) {
    for (const f of stale) rmSync(join(OUT_DIR, f));
    if (manifestChanged) writeFileSync(MANIFEST, json);
  }

  const bytes = existsSync(OUT_DIR)
    ? readdirSync(OUT_DIR).reduce((n, f) => n + readFileSync(join(OUT_DIR, f)).length, 0)
    : 0;
  console.log(
    `bake: ${Object.keys(manifest.sheets).length} sheets in ${Object.keys(manifest.atlases).length} atlases · ` +
      `public/art ${(bytes / 1024).toFixed(0)} KiB · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
  for (const a of Object.values(manifest.atlases)) console.log(`  ${a.image.padEnd(20)} ${a.width}×${a.height}  ${a.sha256.slice(0, 12)}`);

  if (!CHECK) {
    const cast = baked.sheets.filter((x) => x.directions === 8);
    if (cast.length) {
      const files = writeReview({ sheets: cast, facings: manifest.facings, labels: baked.labels, manifest, theme: (await loadTheme()).BARROW });
      console.log(`bake: review contact sheets (not committed):\n  ${files.join("\n  ")}`);
    }
  }

  const drift = [...changed, ...stale.map((f) => `${f} (stale)`), ...(manifestChanged ? ["manifest.json"] : [])];
  if (CHECK && drift.length) {
    console.error(`bake --check: output would change:\n  ${drift.join("\n  ")}`);
    process.exit(1);
  }
  console.log(drift.length ? `bake: wrote ${drift.join(", ")}` : "bake: no changes");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
