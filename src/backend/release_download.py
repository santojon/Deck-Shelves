"""What the manual-update download may fetch and how its file may be named: this project's
release assets on GitHub's hosts, saved under a bare .zip name."""
import os
import re
from typing import Any


# Manual-update downloads only ever follow GitHub release-asset hosts.
_RELEASE_ASSET_HOSTS = ("github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com")


def _is_github_asset_url(url: str) -> bool:
    try:
        from urllib.parse import urlsplit
        p = urlsplit(url)
        host = (p.hostname or "").lower()
        return p.scheme == "https" and (host in _RELEASE_ASSET_HOSTS or host.endswith(".githubusercontent.com"))
    except Exception:
        return False


_RELEASE_DOWNLOAD_PREFIX = "/santojon/Deck-Shelves/releases/download/"


def _is_release_download_url(url: str) -> bool:
    """The URL the frontend may ask for: this project's own release assets on
    github.com (redirects to GitHub's asset hosts are checked separately)."""
    try:
        from urllib.parse import urlsplit
        p = urlsplit(url)
        return p.scheme == "https" and (p.hostname or "").lower() == "github.com" and p.path.startswith(_RELEASE_DOWNLOAD_PREFIX)
    except Exception:
        return False


def _safe_zip_name(name: str) -> str:
    """Reduce a caller-supplied filename to a bare basename ending in .zip so it
    can never escape the download dir (path traversal) or write an executable."""
    base = os.path.basename((name or "").strip())
    base = re.sub(r"[^A-Za-z0-9._-]", "", base)
    if not base or not base.lower().endswith(".zip"):
        return ""
    return base


_SHA256_HEX = re.compile(r"[0-9a-f]{64}")


class DigestError(ValueError):
    """A release digest that is missing, malformed, unsupported or does not match; the
    message is a short code the frontend can tell apart from a network error."""


def _expected_sha256(digest: Any) -> str:
    """The lowercase hex from a release asset digest (`sha256:<hex>`, or the bare hex)."""
    if not isinstance(digest, str) or not digest.strip():
        raise DigestError("digest_missing")
    algo, _, value = digest.strip().rpartition(":")
    if algo and algo.lower() != "sha256":
        raise DigestError("digest_unsupported")
    value = value.lower()
    if not _SHA256_HEX.fullmatch(value):
        raise DigestError("digest_invalid")
    return value
