// The bake reuses two client modules rather than copying them:
//  - src/utils/theme.ts (BARROW), so every authored colour is a palette token (ADR-0013);
//  - src/render/art/manifest.ts (validateManifest), so the bake refuses to write a manifest the
//    client would reject.
// Neither runs in Node or the browser as TypeScript, so they are transpiled on the fly with the
// project's own `typescript` into node_modules/.cache (gitignored).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

export const CLIENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function transpile(relPath, rewrite = (s) => s) {
  const source = readFileSync(join(CLIENT_ROOT, relPath), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    fileName: relPath,
  });
  return rewrite(outputText);
}

/** BARROW as a browser-loadable ES module. */
export const themeModule = () => transpile("src/utils/theme.ts");

/** Imports BARROW in Node (the review contact sheet's colours). */
export async function loadTheme() {
  const dir = join(CLIENT_ROOT, "node_modules", ".cache", "barrowspire-bake");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "theme.mjs"), themeModule());
  return import(pathToFileURL(join(dir, "theme.mjs")).href);
}

/** Imports the client's manifest validator. */
export async function loadManifestValidator() {
  const dir = join(CLIENT_ROOT, "node_modules", ".cache", "barrowspire-bake");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "theme.mjs"), themeModule());
  writeFileSync(
    join(dir, "manifest.mjs"),
    transpile("src/render/art/manifest.ts", (s) => s.replace(/["']@\/utils\/theme["']/g, '"./theme.mjs"')),
  );
  return import(pathToFileURL(join(dir, "manifest.mjs")).href);
}
