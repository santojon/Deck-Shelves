"""Makes the backend modules (src/backend/) importable by their bare module
name in tests, matching how main.py resolves them at runtime (see the
sys.path splice at the top of main.py)."""
import os
import sys

_BACKEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)
