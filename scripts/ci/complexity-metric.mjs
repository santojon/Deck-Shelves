#!/usr/bin/env node
// Measures cyclomatic-complexity DEBT for the CI reports. Distinct from the
// eslint-suppressions chart (which counts how many problems are suppressed):
// this reports the MAGNITUDE of complexity — the sum of the scores of every
// function over the limit — so the trend rises when code gets structurally
// deeper even if the number of offenders stays flat.
//
// Usage: node complexity-metric.mjs [srcDir]
//   srcDir defaults to ./src ; pass an archived tree for historical backfill.
// Emits one JSON line: { level, count, max, avg, top: [{file,line,fn,score}] }
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const srcDir = process.argv[2] || join(root, 'src');
const config = join(here, 'complexity.eslint.config.mjs');

function run() {
  let out = '';
  try {
    out = execFileSync(
      'npx',
      ['eslint', '--no-config-lookup', '-c', config, '--no-warn-ignored',
       '--format', 'json', `${srcDir}/**/*.{ts,tsx}`],
      { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch (e) {
    // eslint exits non-zero only on errors; complexity is a warning here, so a
    // non-zero exit means a real failure — but stdout may still hold JSON.
    out = e.stdout ? String(e.stdout) : '';
  }
  if (!out.trim()) return null;
  let files;
  try { files = JSON.parse(out); } catch { return null; }

  const RE = /complexity of (\d+)/;
  const rows = [];
  for (const f of files) {
    for (const m of f.messages || []) {
      if (m.ruleId !== 'complexity') continue;
      const mm = RE.exec(m.message || '');
      if (!mm) continue;
      const score = parseInt(mm[1], 10);
      const nm = /(Function|Arrow function|Method)\s+'?([^']*)'?\s+has/.exec(m.message || '');
      rows.push({ file: relative(root, f.filePath), line: m.line, fn: (nm && nm[2]) || '(anonymous)', score });
    }
  }
  if (!rows.length) return { level: 0, count: 0, max: 0, avg: 0, top: [] };
  rows.sort((a, b) => b.score - a.score);
  const level = rows.reduce((s, r) => s + r.score, 0);
  const count = rows.length;
  return {
    level,
    count,
    max: rows[0].score,
    avg: Math.round((level / count) * 10) / 10,
    top: rows.slice(0, 10),
  };
}

const res = run();
process.stdout.write(JSON.stringify(res));
