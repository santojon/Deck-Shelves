#!/usr/bin/env python3
import sys
import os
import json
import argparse
import urllib.request
import urllib.error

PLUGIN_PATH = '/home/deck/homebrew/plugins/deck-shelves'

parser = argparse.ArgumentParser()
parser.add_argument('--mode', choices=['mount','rows','smoke'], required=True)
args = parser.parse_args()

def check_mount():
    ok = os.path.isdir(PLUGIN_PATH)
    files = []
    try:
        files = os.listdir(PLUGIN_PATH) if ok else []
    except Exception:
        files = []
    res = {'ok': ok, 'path': PLUGIN_PATH, 'files': files}
    print(json.dumps(res))
    return res

def probe_cdp():
    # Query local inspector list
    url = 'http://127.0.0.1:9222/json'
    try:
        with urllib.request.urlopen(url, timeout=3) as r:
            data = json.load(r)
            # map titles and urls
            tabs = [{'id': t.get('id'), 'title': t.get('title'), 'url': t.get('url')} for t in data]
            res = {'ok': True, 'targets': tabs}
            print(json.dumps(res))
            return res
    except urllib.error.URLError as e:
        res = {'ok': False, 'error': str(e)}
        print(json.dumps(res))
        return res
    except Exception as e:
        res = {'ok': False, 'error': str(e)}
        print(json.dumps(res))
        return res

if args.mode == 'mount':
    check_mount()
elif args.mode == 'rows':
    probe_cdp()
elif args.mode == 'smoke':
    m = check_mount()
    r = probe_cdp()
    ok = m.get('ok') and r.get('ok')
    summary = {'ok': ok, 'mount': m, 'cdp': r}
    print(json.dumps(summary))
else:
    print(json.dumps({'ok': False, 'error': 'unknown mode'}))
    sys.exit(1)
