#!/usr/bin/env node
// Cross-platform reports helper. Replaces the sh-only
// `open || xdg-open` + `python3 -m http.server` one-liners so `pnpm run reports`
// and `pnpm run reports:serve` work natively on Windows, macOS, and Linux.
//
//   node serve-reports.mjs         → serve ./site on :8765 and open /reports/
//   node serve-reports.mjs --open  → just open ./site/reports/index.html
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const siteDir = join(root, "site");
const PORT = 8765;

function openBrowser(target) {
  // Never spawn a shell (cmd/sh) — pass the target as a direct argv entry to a
  // non-shell opener so the path can't be interpreted as a command.
  const [cmd, args] =
    process.platform === "win32"
      ? ["explorer.exe", [target]]
      : process.platform === "darwin"
        ? ["open", [target]]
        : ["xdg-open", [target]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    /* best-effort: the URL/path is printed below anyway */
  }
}

if (process.argv.includes("--open")) {
  const file = join(siteDir, "reports", "index.html");
  console.log(`Opening ${file}`);
  openBrowser(file);
  process.exit(0);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const filePath = normalize(join(siteDir, urlPath));
    if (!filePath.startsWith(siteDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const info = await stat(filePath);
    if (info.isDirectory()) {
      // Redirect target derived from the validated filePath (guaranteed inside
      // siteDir), never the raw request — avoids open redirection via `//host`.
      const rel = relative(siteDir, filePath).split(sep).join("/");
      res.writeHead(302, { Location: rel ? `/${rel}/` : "/" });
      res.end();
      return;
    }
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": TYPES[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/reports/`;
  console.log(`Serving site/ at ${url} (Ctrl-C to stop)`);
  openBrowser(url);
});
