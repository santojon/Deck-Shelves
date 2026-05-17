"""
Lightweight test runner for the UI suite. Each test is a function that
takes a `Context` (CDP session + helpers) and returns either `None` (pass)
or raises `AssertionError` (fail). Suites group tests by feature.

Designed to read like a thin pytest-flavored harness without pulling in
pytest itself — tests run against a real Steam Deck over CDP, so the
suite never goes through CI; bare-bones is preferred over a heavy
framework dependency.
"""
from __future__ import annotations

import time
import traceback
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from ...screenshots.lib.cdp import Session, open_session
from ...screenshots.lib import nav, capture


@dataclass
class Context:
    sjc: Session       # SharedJSContext — navigation, router, localStorage
    bp: Session        # Big Picture — DOM queries (DS shelves, cards, native recents)
    host: str
    port: int
    out_dir: Path

    def eval(self, expr: str, return_by_value: bool = True, timeout: float = 8.0) -> Any:
        """Evaluate in Big Picture where DS shelves render."""
        return self.bp.evaluate(expr, return_by_value=return_by_value, timeout=timeout)

    def eval_sjc(self, expr: str, return_by_value: bool = True, timeout: float = 8.0) -> Any:
        """Evaluate in SharedJSContext (Router, appStore, settings)."""
        return self.sjc.evaluate(expr, return_by_value=return_by_value, timeout=timeout)

    def query(self, selector: str) -> Any:
        return self.eval(f"!!document.querySelector({selector!r})")

    def text_of(self, selector: str) -> Optional[str]:
        return self.eval(
            f"(function(){{ const el = document.querySelector({selector!r}); return el ? (el.textContent || '').trim() : null; }})()"
        )

    def click(self, selector: str, settle_ms: int = 400) -> bool:
        ok = self.eval(
            f"(function(){{ const el = document.querySelector({selector!r}); if (!el) return false; el.click(); return true; }})()"
        ) is True
        time.sleep(settle_ms / 1000.0)
        return ok

    def open_qam(self, settle_ms: int = 1500) -> None:
        nav.open_qam(self.sjc, settle_ms=settle_ms)

    def close_qam(self, settle_ms: int = 600) -> None:
        nav.close_qam(self.sjc, settle_ms=settle_ms)

    def navigate(self, route: str, settle_ms: int = 1500) -> None:
        nav.navigate(self.sjc, route, settle_ms=settle_ms)

    def screenshot_bp(self, name: str) -> Optional[Path]:
        return capture.capture_bigpicture(self.host, self.port, self.out_dir / name)

    def screenshot_qam(self, name: str) -> Optional[Path]:
        return capture.capture_qam(self.host, self.port, self.out_dir / name)


@dataclass
class TestResult:
    suite: str
    name: str
    status: str  # "pass" | "fail" | "skip"
    duration_ms: int
    error: Optional[str] = None


@dataclass
class Suite:
    name: str
    tests: List[Tuple[str, Callable[[Context], None]]] = field(default_factory=list)

    def test(self, name: str):
        """Decorator: register a test function under the given name."""
        def deco(fn: Callable[[Context], None]) -> Callable[[Context], None]:
            self.tests.append((name, fn))
            return fn
        return deco


SUITES: Dict[str, Suite] = {}


def suite(name: str) -> Suite:
    """Get or create a Suite by name. Imports register tests via decorators."""
    s = SUITES.get(name)
    if s is None:
        s = Suite(name=name)
        SUITES[name] = s
    return s


class SkipTest(Exception):
    """Raise inside a test to mark it as skipped (environment not ready)."""


def run(host: str, port: int, out_dir: Path, only: Optional[List[str]] = None) -> List[TestResult]:
    sjc = open_session(host, port, "SharedJSContext")
    bp  = open_session(host, port, "Big Picture")
    ctx = Context(sjc=sjc, bp=bp, host=host, port=port, out_dir=out_dir)
    results: List[TestResult] = []
    try:
        for s in SUITES.values():
            for tname, fn in s.tests:
                full = f"{s.name}.{tname}"
                if only and not any(full.startswith(o) or s.name == o for o in only):
                    continue
                t0 = time.time()
                try:
                    fn(ctx)
                    results.append(TestResult(s.name, tname, "pass", int((time.time() - t0) * 1000)))
                    print(f"PASS {full}")
                except SkipTest as e:
                    results.append(TestResult(s.name, tname, "skip", int((time.time() - t0) * 1000), str(e)))
                    print(f"SKIP {full} :: {e}")
                except AssertionError as e:
                    results.append(TestResult(s.name, tname, "fail", int((time.time() - t0) * 1000), str(e)))
                    print(f"FAIL {full} :: {e}")
                except Exception as e:
                    tb = traceback.format_exc(limit=3)
                    results.append(TestResult(s.name, tname, "fail", int((time.time() - t0) * 1000), tb))
                    print(f"ERROR {full} :: {e}")
    finally:
        sjc.close()
        bp.close()
    return results
