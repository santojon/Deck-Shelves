"""Tests for the host abstraction (plugin_host.py): the backend must run both
under the plugin loader (a `decky` module is present) and under a neutral runner
(no `decky` module, must not be emulated). Covers logger selection and the
per-host settings-dir precedence."""
import importlib
import logging
import sys
import types

import pytest


@pytest.fixture
def isolated(monkeypatch):
    """Save/restore the modules this test swaps, and clear the env vars that
    steer settings_dir(), so nothing leaks into the rest of the suite."""
    saved = {k: sys.modules.get(k) for k in ("decky", "plugin_host")}
    monkeypatch.delenv("DECK_SHELVES_SETTINGS_DIR", raising=False)
    monkeypatch.delenv("DECKY_PLUGIN_SETTINGS_DIR", raising=False)
    yield
    for k, v in saved.items():
        if v is None:
            sys.modules.pop(k, None)
        else:
            sys.modules[k] = v


def _fresh(loader):
    """Re-import plugin_host with `decky` present (a module) or absent (None)."""
    sys.modules.pop("plugin_host", None)
    if loader is None:
        sys.modules.pop("decky", None)
    else:
        sys.modules["decky"] = loader
    return importlib.import_module("plugin_host")


def test_neutral_host_uses_a_stderr_logger(isolated):
    ph = _fresh(None)
    assert isinstance(ph.logger, logging.Logger)
    ph.logger.info("does not raise")  # the backend logs freely on the neutral host


def test_loader_logger_is_reused_when_present(isolated):
    mock = types.ModuleType("decky")
    sentinel = object()
    mock.logger = sentinel
    ph = _fresh(mock)
    assert ph.logger is sentinel


def test_settings_dir_prefers_the_canonical_env(isolated, monkeypatch):
    monkeypatch.setenv("DECK_SHELVES_SETTINGS_DIR", "/tmp/canonical")
    monkeypatch.setenv("DECKY_PLUGIN_SETTINGS_DIR", "/tmp/loader")
    assert _fresh(None).settings_dir() == "/tmp/canonical"


def test_settings_dir_falls_back_to_loader_env_then_attr(isolated, monkeypatch):
    monkeypatch.setenv("DECKY_PLUGIN_SETTINGS_DIR", "/tmp/loader")
    assert _fresh(None).settings_dir() == "/tmp/loader"

    monkeypatch.delenv("DECKY_PLUGIN_SETTINGS_DIR", raising=False)
    mock = types.ModuleType("decky")
    mock.DECKY_PLUGIN_SETTINGS_DIR = "/tmp/from-loader-attr"
    assert _fresh(mock).settings_dir() == "/tmp/from-loader-attr"


def test_settings_dir_bare_dev_fallback(isolated):
    # No env, no loader → the conventional local-dev path.
    assert _fresh(None).settings_dir().endswith("decky-loader/settings/deck-shelves")
