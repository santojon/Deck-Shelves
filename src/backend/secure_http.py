"""Verified HTTPS for the backend's network calls: the TLS context, one JSON GET through it,
and the redaction that keeps tokens out of error text."""
import json
import os
import re
import ssl
import urllib.request


def _build_ssl_context() -> ssl.SSLContext:
    """Verified TLS context for the Steam API calls this file makes.

    SteamOS's default CA search can come up empty inside the plugin's
    sandboxed process, which used to make cert verification for
    steam.*/steamcommunity.* fail — that was previously "fixed" by
    disabling verification outright (`check_hostname=False`,
    `CERT_NONE`), which instead let ANY certificate through: a hostile
    Wi-Fi network could MITM the connection and steal the Steam session
    token or swap the downloaded update zip for a malicious one.
    Supplementing (never replacing — `load_verify_locations` adds to the
    existing trust store) with the distro's own CA bundle keeps
    verification on."""
    ctx = ssl.create_default_context()
    for candidate in ("/etc/ssl/certs/ca-certificates.crt", "/etc/ssl/cert.pem"):
        if os.path.exists(candidate):
            try:
                ctx.load_verify_locations(cafile=candidate)
            except Exception:
                pass
            break
    return ctx


_SSL_CTX = _build_ssl_context()


def _redact_secrets(text: str) -> str:
    """Strip auth tokens before a string is logged or returned to the frontend —
    some urllib / SSL errors stringify the full request URL, which carries the
    wishlist `access_token`; that must never reach the logs a bug report bundles."""
    return re.sub(r"(access_token|token|jwt)=[^&\s\"'}]+", r"\1=REDACTED", text,
                  flags=re.IGNORECASE)


def _fetch_json_page(req: "urllib.request.Request"):
    """One HTTPS GET through the verified TLS context: (status, parsed JSON)."""
    with urllib.request.urlopen(req, timeout=15, context=_SSL_CTX) as resp:
        if resp.status != 200:
            return resp.status, {}
        return 200, json.loads(resp.read().decode("utf-8"))
