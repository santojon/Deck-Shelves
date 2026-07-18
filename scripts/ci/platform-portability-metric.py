#!/usr/bin/env python3
"""Platform-portability DEBT for the Python backend.

The plugin's rule is that every OS touch is fail-soft — nothing may raise off its
native OS. This metric finds OS-coupled call sites (Linux `/proc`·`/sys` paths,
OS-specific tools like `bluetoothctl`/`wpctl`/`sysctl`, and platform APIs like
`ctypes`/`GetSystemMetrics`/`CGDisplay`) and checks each is GUARDED — wrapped in
`try`/`except`, gated by `shutil.which` / `os.path.exists`, or inside a
`platform.system()` / `sys.platform` branch.

`unguarded` is the trackable number (LOWER is better; target 0) — a site that
would throw on a foreign OS. `coupled` is the total OS-coupled sites and
`guarded` the fail-soft ones (informational). Comments and docstrings are masked
so only real code counts.

Usage: python3 platform-portability-metric.py [backendDir]  (defaults to repo root)
Emits one JSON line: { coupled, guarded, unguarded, top: [{file,line,spec}] }
"""
import ast
import io
import json
import re
import sys
import tokenize
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT

COUPLED = re.compile(
    r"/proc/|/sys/|/run/|/etc/os-release|bluetoothctl|wpctl|pactl|systemctl"
    r"|xrandr|\bsysctl\b|vm_stat|pmset|GetSystemMetrics|GlobalMemoryStatusEx"
    r"|GetSystemTimes|\bwindll\b|\bctypes\b|CGDisplay|CGGetActiveDisplayList|\bwin32"
)
GUARD = re.compile(
    r"\btry\b|\bexcept\b|shutil\.which|os\.path\.exists|os\.path\.isdir"
    r"|platform\.system\(\)|sys\.platform|_exists_first|_safe_"
)
# An enclosing function whose NAME is OS-specific is itself the guard — it is only
# reached from a platform.system()/sys.platform dispatch (e.g. `_cpu_windows`).
OS_FUNC = re.compile(r"windows|macos|darwin|linux|drm|monitor|fallback|via_", re.I)
# Lines that mention a coupled token but are NOT a runtime operation: a `def`
# signature default, or an ALL-CAPS module constant assignment.
NOT_A_CALL = re.compile(r"^\s*(async\s+)?def\s|^\s*[A-Z_][A-Z0-9_]*\s*(:[^=]+)?=")


def _masked_lines(src: str):
    """Source split into lines with COMMENT + docstring spans blanked, so a path
    mentioned in prose isn't counted — only real inline string / call code."""
    lines = src.split("\n")

    def blank(sr, sc, er, ec):
        for r in range(sr, er + 1):
            if r - 1 >= len(lines):
                break
            ln = lines[r - 1]
            a = sc if r == sr else 0
            b = ec if r == er else len(ln)
            lines[r - 1] = ln[:a] + " " * (b - a) + ln[b:]

    try:
        for tok in tokenize.generate_tokens(io.StringIO(src).readline):
            if tok.type == tokenize.COMMENT:
                blank(tok.start[0], tok.start[1], tok.end[0], tok.end[1])
    except Exception:
        pass
    try:
        tree = ast.parse(src)
        nodes = [tree] + [n for n in ast.walk(tree)
                          if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))]
        for n in nodes:
            body = getattr(n, "body", [])
            if body and isinstance(body[0], ast.Expr) and isinstance(getattr(body[0], "value", None), ast.Constant) \
                    and isinstance(body[0].value.value, str):
                d = body[0].value
                blank(d.lineno, d.col_offset, getattr(d, "end_lineno", d.lineno), getattr(d, "end_col_offset", 0))
    except Exception:
        pass
    return lines


def _func_spans(src: str):
    try:
        tree = ast.parse(src)
    except Exception:
        return []
    out = []
    for n in ast.walk(tree):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            out.append((n.lineno, getattr(n, "end_lineno", n.body[-1].lineno), n.name))
    return out


def scan(path: Path):
    try:
        src = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    masked = _masked_lines(src)
    funcs = _func_spans(src)
    hits = []
    for i, line in enumerate(masked, 1):
        if not COUPLED.search(line):
            continue
        if NOT_A_CALL.search(line):  # def default / module constant — not an op
            continue
        # A site is guarded if ANY enclosing function (innermost..outermost)
        # guards it — the try/except or platform branch is often on an outer
        # function while the coupled call sits in a nested helper.
        enc = [(s, e, n) for (s, e, n) in funcs if s <= i <= e]
        if enc:
            guarded = any(GUARD.search("\n".join(masked[s - 1:e])) or OS_FUNC.search(n)
                          for (s, e, n) in enc)
        else:
            guarded = bool(GUARD.search(line))  # module level — line guards itself
        try:
            rel = str(path.relative_to(ROOT))
        except ValueError:
            rel = path.name
        hits.append({"file": rel, "line": i, "guarded": guarded,
                     "spec": line.strip()[:70]})
    return hits


def main():
    hits = []
    for p in sorted(BACKEND.glob("*.py")):
        if p.name.startswith(("test_", "conftest")):
            continue
        hits.extend(scan(p))
    unguarded = [h for h in hits if not h["guarded"]]
    out = {
        "coupled": len(hits),
        "guarded": len(hits) - len(unguarded),
        "unguarded": len(unguarded),
        "top": [{"file": h["file"], "line": h["line"], "spec": h["spec"]} for h in unguarded[:25]],
    }
    sys.stdout.write(json.dumps(out))


main()
