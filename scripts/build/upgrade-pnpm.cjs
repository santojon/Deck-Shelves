#!/usr/bin/env node
/* Upgrade pnpm without relying on Corepack being on PATH AND without
 * fighting an existing Homebrew / system-package pnpm install.
 *
 * Order of preference:
 *   1. pnpm already installed → `pnpm self-update` (works whether it
 *      came from Homebrew, asdf, npm, manual download — pnpm rewrites
 *      itself in place without touching the bin symlink, so no EEXIST
 *      from npm trying to relink over `/opt/homebrew/bin/pnpm`).
 *   2. Corepack on PATH or bundled with Node → `corepack prepare`.
 *   3. Homebrew available → `brew upgrade pnpm` (or `brew install pnpm`
 *      if missing).
 *   4. `npm install -g pnpm@latest --force` as last resort.
 *
 * Run via `pnpm run upgrade` / `pnpm run upgrade:api`.
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function tryRun(cmd, args, opts = {}) {
  try {
    const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
    return r.status === 0;
  } catch {
    return false;
  }
}

function which(bin) {
  const out = spawnSync(process.platform === 'win32' ? 'where' : 'which',
    [bin], { stdio: 'pipe' });
  if (out.status === 0) {
    const first = out.stdout.toString().trim().split(/\r?\n/)[0];
    if (first) return first;
  }
  return null;
}

function resolveCorepackBin() {
  const onPath = which('corepack');
  if (onPath) return onPath;
  try {
    const corepackPkg = require.resolve('corepack/package.json', {
      paths: [path.dirname(process.execPath)],
    });
    const corepackDir = path.dirname(corepackPkg);
    const cli = path.join(corepackDir, 'dist', 'corepack.js');
    if (fs.existsSync(cli)) return cli;
  } catch {}
  const sibling = path.join(path.dirname(process.execPath), 'corepack');
  if (fs.existsSync(sibling)) return sibling;
  return null;
}

function main() {
  // ── 1. pnpm self-update if pnpm is already on PATH ─────────────────
  const existingPnpm = which('pnpm');
  if (existingPnpm) {
    console.log(`[upgrade-pnpm] pnpm already installed at ${existingPnpm} — running self-update`);
    if (tryRun(existingPnpm, ['self-update'])) {
      console.log('[upgrade-pnpm] self-update OK');
      return;
    }
    console.log('[upgrade-pnpm] self-update failed; falling through');
  }

  // ── 2. Corepack (PATH or Node-bundled) ─────────────────────────────
  const corepack = resolveCorepackBin();
  if (corepack) {
    const isJs = corepack.endsWith('.js');
    console.log(`[upgrade-pnpm] using corepack at ${corepack}`);
    const ran = isJs
      ? tryRun(process.execPath, [corepack, 'prepare', 'pnpm@latest', '--activate'])
      : tryRun(corepack, ['prepare', 'pnpm@latest', '--activate']);
    if (ran) {
      const pnpmAfter = which('pnpm');
      if (pnpmAfter) tryRun(pnpmAfter, ['self-update']);
      return;
    }
    console.log('[upgrade-pnpm] corepack prepare failed; falling through');
  }

  // ── 3. Homebrew, when available ─────────────────────────────────────
  if (which('brew')) {
    console.log('[upgrade-pnpm] trying brew upgrade pnpm');
    if (tryRun('brew', ['upgrade', 'pnpm'])) return;
    if (tryRun('brew', ['install', 'pnpm'])) return;
    console.log('[upgrade-pnpm] brew upgrade/install failed; falling through');
  }

  // ── 4. npm install -g (--force to handle EEXIST when a previous bin exists) ─
  console.log('[upgrade-pnpm] falling back to npm install -g pnpm@latest --force');
  if (tryRun('npm', ['install', '-g', 'pnpm@latest', '--force'])) return;

  console.error('[upgrade-pnpm] failed to upgrade pnpm.');
  console.error('  → Manual fix: `brew upgrade pnpm` (macOS) or `npm install -g pnpm@latest --force`.');
  process.exit(1);
}

main();
