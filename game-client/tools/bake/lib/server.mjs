// A loopback-only static server for the bake page: the page itself, three.js straight from
// node_modules (no CDN, no bundler), and BARROW transpiled from src/utils/theme.ts.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { CLIENT_ROOT, themeModule } from "./source.mjs";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };

const ROOTS = {
  "/page/": join(CLIENT_ROOT, "tools", "bake", "page"),
  "/three/": join(CLIENT_ROOT, "node_modules", "three"),
};

async function resolve(url) {
  if (url === "/" || url === "/index.html") return { file: join(ROOTS["/page/"], "index.html") };
  if (url === "/theme.js") return { body: themeModule(), type: TYPES[".js"] };
  for (const [prefix, root] of Object.entries(ROOTS)) {
    if (!url.startsWith(prefix)) continue;
    const file = normalize(join(root, url.slice(prefix.length)));
    if (file !== root && !file.startsWith(root + sep)) return null;
    return { file };
  }
  return null;
}

export function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      const hit = await resolve(url);
      if (!hit) throw Object.assign(new Error("not found"), { code: "ENOENT" });
      const body = hit.body ?? (await readFile(hit.file));
      res.writeHead(200, { "content-type": hit.type ?? TYPES[extname(hit.file)] ?? "application/octet-stream" });
      res.end(body);
    } catch (err) {
      res.writeHead(err.code === "ENOENT" ? 404 : 500);
      res.end(String(err.message));
    }
  });
  return new Promise((ok) =>
    server.listen(0, "127.0.0.1", () => ok({ url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() })),
  );
}
