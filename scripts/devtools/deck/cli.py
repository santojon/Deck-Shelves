#!/usr/bin/env python3
"""Devtools CLI for Deck scripts.

Usage:
  cli.py probe [--mode smoke|rows|mount]
  cli.py screenshot [--keep-existing] [--locale LOCALE]
  cli.py diag --list
  cli.py diag run <script>

This script delegates to the existing Python helpers in this folder.
"""
import argparse
import subprocess
import sys
import os


def load_dotenv_from_repo():
    # Look for a .env at repo root (three levels up from this script)
    here = os.path.dirname(__file__)
    repo_root = os.path.abspath(os.path.join(here, '..', '..', '..'))
    env_path = os.path.join(repo_root, '.env')
    if not os.path.isfile(env_path):
        return
    try:
        with open(env_path, 'r') as f:
            for ln in f:
                ln = ln.strip()
                if not ln or ln.startswith('#'):
                    continue
                if '=' not in ln:
                    continue
                k, v = ln.split('=', 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                # do not overwrite existing env vars
                if k and k not in os.environ:
                    os.environ[k] = v
    except Exception:
        pass

# Load .env early so subcommands and subprocesses inherit values
load_dotenv_from_repo()

# Ensure DECK_CDP_HOST falls back to DECK_HOST when appropriate
if 'DECK_CDP_HOST' not in os.environ and 'DECK_HOST' in os.environ:
    os.environ['DECK_CDP_HOST'] = os.environ['DECK_HOST']

HERE = os.path.dirname(__file__)

def run_probe(args):
    mode = args.mode or "smoke"
    # probe script may be in tools/ after reorg
    candidates = [os.path.join(HERE, "tools", "cdp_probe.py"), os.path.join(HERE, "cdp_probe.py"), os.path.join(HERE, "tools", "cdp_probe.py")]
    path = next((c for c in candidates if os.path.isfile(c)), None)
    if not path:
        print('cdp_probe.py not found', file=sys.stderr); return 2
    cmd = [sys.executable, path, "--mode", mode]
    return subprocess.run(cmd)

def run_screenshot(args):
    # screenshot moved to screenshots/ after reorg
    candidates = [os.path.join(HERE, "screenshots", "screenshot.py"), os.path.join(HERE, "screenshot.py")]
    path = next((c for c in candidates if os.path.isfile(c)), None)
    if not path:
        print('screenshot.py not found', file=sys.stderr); return 2
    cmd = [sys.executable, path]
    if args.locale:
        cmd += ["--locale", args.locale]
    if args.keep_existing:
        cmd += ["--keep-existing"]
    return subprocess.run(cmd)

def list_diags(args):
    diag_dir = os.path.join(HERE, 'diag')
    if os.path.isdir(diag_dir):
        files = sorted(os.listdir(diag_dir))
        for f in files:
            print(f)
        return 0
    files = sorted([f for f in os.listdir(HERE) if f.startswith('diag_')])
    for f in files:
        print(f)
    return 0

def run_diag(args):
    name = args.script
    # Allow running by basename (search diag/ for a match)
    diag_dir = os.path.join(HERE, 'diag')
    candidates = []
    if os.path.isdir(diag_dir):
        candidates = [os.path.join(diag_dir, f) for f in os.listdir(diag_dir) if name in f]
    # fall back to exact path in HERE
    if not candidates:
        p = os.path.join(HERE, name)
        if os.path.isfile(p): candidates = [p]
    if not candidates:
        print('Script not found:', name, file=sys.stderr)
        return 2
    path = candidates[0]
    if path.endswith('.py'):
        return subprocess.run([sys.executable, path]).returncode
    return subprocess.run(['node', path]).returncode

def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest='cmd')

    p_probe = sub.add_parser('probe')
    p_probe.add_argument('--mode', choices=['mount','rows','smoke'], default='smoke')
    p_probe.set_defaults(func=run_probe)

    p_ss = sub.add_parser('screenshot')
    p_ss.add_argument('--keep-existing', action='store_true')
    p_ss.add_argument('--locale', help='Locale code, e.g. en-US')
    p_ss.set_defaults(func=run_screenshot)

    p_diag = sub.add_parser('diag')
    p_diag_sub = p_diag.add_subparsers(dest='diagcmd')
    p_diag_list = p_diag_sub.add_parser('list')
    p_diag_list.set_defaults(func=list_diags)
    p_diag_run = p_diag_sub.add_parser('run')
    p_diag_run.add_argument('script')
    p_diag_run.set_defaults(func=run_diag)

    args = p.parse_args()
    if not hasattr(args, 'func'):
        p.print_help()
        return 1
    return args.func(args)

if __name__ == '__main__':
    sys.exit(main())
