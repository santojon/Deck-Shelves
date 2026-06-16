# Shared devtools library for CDP tooling against a Steam Deck plugin.
# Re-exports the canonical cdp module + the env-driven selectors registry
# (see selectors.py) so probes/screenshots/tests can import from one place.
from .cdp import Session, open_session, list_targets, find_target  # noqa: F401
from . import selectors  # noqa: F401
