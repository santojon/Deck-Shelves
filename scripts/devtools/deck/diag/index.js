#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const child = require('child_process');

const DIAG_DIR = path.join(__dirname);

function list() {
  const files = fs.readdirSync(DIAG_DIR).filter(f => f.startsWith('diag_'));
  files.forEach(f => console.log(f));
}

function run(name, args=[]) {
  const files = fs.readdirSync(DIAG_DIR).filter(f => f.startsWith('diag_') && f.includes(name));
  if (!files.length) {
    console.error('No diag found for', name); process.exitCode = 2; return;
  }
  const file = path.join(DIAG_DIR, files[0]);
  if (file.endsWith('.py')) {
    const p = child.spawnSync('python3', [file, ...args], { stdio: 'inherit' });
    process.exitCode = p.status;
  } else {
    const p = child.spawnSync('node', [file, ...args], { stdio: 'inherit' });
    process.exitCode = p.status;
  }
}

if (require.main === module) {
  const [,,cmd, name, ...rest] = process.argv;
  if (!cmd || cmd === 'list') return list();
  if (cmd === 'run' && name) return run(name, rest);
  console.log('Usage: node index.js list | run <name> [args]');
}
