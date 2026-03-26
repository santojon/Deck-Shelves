
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const args = [viteBin, "build", "--config", "vite.plugin.config.ts"];

if (process.argv.includes("--watch")) args.push("--watch");

const modeIdx = process.argv.indexOf("--mode");
if (modeIdx !== -1 && process.argv[modeIdx + 1]) {
  args.push("--mode", process.argv[modeIdx + 1]);
}

const child = spawn(process.execPath, args, {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

