# Shared devtools library for Deck Shelves CDP tooling.
# Re-exports the canonical cdp, nav, and capture modules so both the
# screenshot pipeline and the UI test runner can import from one place.
from .cdp import Session, open_session, list_targets, find_target  # noqa: F401
