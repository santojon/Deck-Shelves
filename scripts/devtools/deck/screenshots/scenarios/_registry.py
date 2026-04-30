"""Scenario registry: every screenshot scenario decorates a function with
`@register('name')` and `ALL_SCENARIOS` collects them. The runner explicitly
imports every scenario module so the decorators run."""
from __future__ import annotations

from pathlib import Path
from typing import Callable, Dict, List, Tuple

from ..lib.cdp import Session

ScenarioFn = Callable[[Session, str, int, Path], Dict[str, Path]]

ALL_SCENARIOS: List[Tuple[str, ScenarioFn]] = []


def register(name: str):
    def deco(fn: ScenarioFn) -> ScenarioFn:
        ALL_SCENARIOS.append((name, fn))
        return fn
    return deco
