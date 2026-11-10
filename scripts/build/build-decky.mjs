import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const args = [viteBin, "build", "--config", "vite.plugin.config.ts"];
const watch = process.argv.includes("--watch");
if (watch) args.push("--watch");

const modeIdx = process.argv.indexOf("--mode");
const mode = modeIdx !== -1 ? process.argv[modeIdx + 1] : "production";
args.push("--mode", mode);

// The store packs only dist/, py_modules/, defaults/ (unpacked at the plugin root) and the root files.
function prepareStoreLayout() {
  for (const dir of ["py_modules", "defaults"]) rmSync(path.join(root, dir), { recursive: true, force: true });
  mkdirSync(path.join(root, "py_modules"));
  for (const f of readdirSync(path.join(root, "src", "backend"))) {
    if (f.endsWith(".py")) copyFileSync(path.join(root, "src", "backend", f), path.join(root, "py_modules", f));
  }
  mkdirSync(path.join(root, "defaults", "assets"), { recursive: true });
  copyFileSync(path.join(root, "assets", "tab-icon.svg"), path.join(root, "defaults", "assets", "tab-icon.svg"));
  copyFileSync(path.join(root, "NOTICE.md"), path.join(root, "defaults", "NOTICE.md"));
}

const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit", env: process.env });

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  if (code === 0 && mode === "production" && !watch) prepareStoreLayout();
  process.exit(code ?? 0);
});
