#!/usr/bin/env python3
"""Helper: evaluate an expression in the SharedJSContext using cdp_probe's helper.

Usage:
  python3 cdp_eval.py "<js expression>"
"""
import runpy
import sys
import json

if len(sys.argv) < 2:
    print(json.dumps({"error": "missing-expression"}))
    sys.exit(2)

expr = sys.argv[1]

# Load cdp_probe.py and extract eval_in_shared
g = runpy.run_path('scripts/devtools/deck/tools/cdp_probe.py')
eval_in_shared = g.get('eval_in_shared')
if not eval_in_shared:
    print(json.dumps({"error": "eval_in_shared not available"}))
    sys.exit(2)

try:
    res = eval_in_shared(expr)
    print(json.dumps({"result": res}, ensure_ascii=False))
    sys.exit(0)
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(2)
