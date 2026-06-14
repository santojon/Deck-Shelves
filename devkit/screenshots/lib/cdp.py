"""
Re-export shim — the canonical implementation lives in
devkit/lib/cdp.py. Import from there for new code.
"""
from ...lib.cdp import (  # noqa: F401
    Session,
    open_session,
    list_targets,
    find_target,
    load_env,
    _normalize_host,
)
