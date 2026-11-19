"""The Steam account in use, and the per-system primitives that decrypt a value from Steam's
cookie store."""
import os
import re
from subprocess import run as _sp_run
from typing import Any, Optional

from paths import _steam_install_candidates


_STEAM_ID64_BASE = 76561197960265728


def _requested_steam_id64(arg: Any) -> Optional[str]:
    """The SteamID64 the frontend read from the running client, kept only when it is an individual account's."""
    sid = arg.get("steamid") if isinstance(arg, dict) else None
    if isinstance(sid, str) and re.fullmatch(r"7656119\d{10}", sid) and int(sid) > _STEAM_ID64_BASE:
        return sid
    return None


def get_steam_id64(requested: Optional[str] = None) -> Optional[str]:
    """The account's SteamID64: the one the frontend read from the running client
    (`_requested_steam_id64`), which tells accounts apart on a multi-account device;
    without it, the most recently used userdata directory.

    userdata/ dirs are named by SteamID3 (the lower 32 bits);
    SteamID64 = SteamID3 + 76561197960265728.
    """
    if requested:
        return requested
    userdata_candidates = [
        os.path.join(root, "userdata") for root in _steam_install_candidates()
    ]
    try:
        userdata = next((p for p in userdata_candidates if os.path.isdir(p)), None)
        if not userdata:
            return None
        candidates = [
            d for d in os.listdir(userdata)
            if d.isdigit() and d != "0" and os.path.isdir(os.path.join(userdata, d))
        ]
        if not candidates:
            return None
        # Most-recently-touched account dir wins over an arbitrary first one.
        candidates.sort(
            key=lambda d: os.path.getmtime(os.path.join(userdata, d)),
            reverse=True,
        )
        steam_id3 = int(candidates[0])
        return str(_STEAM_ID64_BASE + steam_id3)
    except Exception:
        return None


def aes_128_cbc(key: bytes, body: bytes) -> str:
    try:
        iv = b" " * 16
        # The loader's LD_LIBRARY_PATH points at its bundled libssl, which breaks the system openssl CLI.
        env = {k: v for k, v in os.environ.items() if k != "LD_LIBRARY_PATH"}
        result = _sp_run(
            ["openssl", "enc", "-aes-128-cbc", "-d",
             "-K", key.hex(), "-iv", iv.hex(), "-nopad"],
            input=body, capture_output=True, timeout=5, env=env,
        )
        if result.returncode != 0:
            return ""
        dec = result.stdout
        pad = dec[-1] if dec else 0
        if 0 < pad <= 16:
            dec = dec[:-pad]
        return dec.decode("utf-8", errors="replace")
    except Exception:
        return ""


def macos_safe_storage_password() -> Optional[bytes]:
    """The Chromium "Safe Storage" password from the login Keychain. The
    service name varies by app, so try the likely ones fail-soft."""
    for service in ("Steam Safe Storage", "Chromium Safe Storage", "Chrome Safe Storage"):
        try:
            r = _sp_run(["security", "find-generic-password", "-w", "-s", service],
                        capture_output=True, timeout=4)
            if r.returncode == 0 and r.stdout.strip():
                return r.stdout.strip()
        except Exception:
            pass
    return None


def dpapi_unprotect(data: bytes) -> bytes:
    """User-scoped DPAPI unwrap via crypt32 CryptUnprotectData. b'' on failure."""
    try:
        import ctypes
        from ctypes import wintypes

        class _BLOB(ctypes.Structure):
            _fields_ = [("cbData", wintypes.DWORD),
                        ("pbData", ctypes.POINTER(ctypes.c_char))]

        src = ctypes.create_string_buffer(data, len(data))
        blob_in = _BLOB(len(data), ctypes.cast(src, ctypes.POINTER(ctypes.c_char)))
        blob_out = _BLOB()
        ok = ctypes.windll.crypt32.CryptUnprotectData(
            ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out))
        if not ok:
            return b""
        try:
            return ctypes.string_at(blob_out.pbData, blob_out.cbData)
        finally:
            ctypes.windll.kernel32.LocalFree(blob_out.pbData)
    except Exception:
        return b""


def bcrypt_aes_gcm_decrypt(key: bytes, nonce: bytes, ciphertext: bytes, tag: bytes) -> bytes:
    """AES-256-GCM decrypt via CNG/bcrypt (ctypes). b'' on any error / bad tag."""
    try:
        import ctypes
        from ctypes import wintypes
        bcrypt = ctypes.windll.bcrypt

        class _AUTH_INFO(ctypes.Structure):
            _fields_ = [
                ("cbSize", wintypes.ULONG), ("dwInfoVersion", wintypes.ULONG),
                ("pbNonce", ctypes.c_void_p), ("cbNonce", wintypes.ULONG),
                ("pbAuthData", ctypes.c_void_p), ("cbAuthData", wintypes.ULONG),
                ("pbTag", ctypes.c_void_p), ("cbTag", wintypes.ULONG),
                ("pbMacContext", ctypes.c_void_p), ("cbMacContext", wintypes.ULONG),
                ("cbAAD", wintypes.ULONG), ("cbData", ctypes.c_ulonglong),
                ("dwFlags", wintypes.ULONG),
            ]

        h_alg = ctypes.c_void_p()
        h_key = ctypes.c_void_p()
        if bcrypt.BCryptOpenAlgorithmProvider(
                ctypes.byref(h_alg), ctypes.c_wchar_p("AES"), None, 0) != 0:
            return b""
        try:
            gcm = "ChainingModeGCM\0".encode("utf-16-le")
            if bcrypt.BCryptSetProperty(
                    h_alg, ctypes.c_wchar_p("ChainingMode"), gcm, len(gcm), 0) != 0:
                return b""
            obj_len = wintypes.ULONG(0)
            got = wintypes.ULONG(0)
            if bcrypt.BCryptGetProperty(
                    h_alg, ctypes.c_wchar_p("ObjectLength"),
                    ctypes.byref(obj_len), ctypes.sizeof(obj_len), ctypes.byref(got), 0) != 0:
                return b""
            key_obj = ctypes.create_string_buffer(obj_len.value)
            if bcrypt.BCryptGenerateSymmetricKey(
                    h_alg, ctypes.byref(h_key), key_obj, obj_len.value,
                    key, len(key), 0) != 0:
                return b""
            nonce_buf = ctypes.create_string_buffer(nonce, len(nonce))
            tag_buf = ctypes.create_string_buffer(tag, len(tag))
            ct_buf = ctypes.create_string_buffer(ciphertext, len(ciphertext))
            info = _AUTH_INFO()
            ctypes.memset(ctypes.byref(info), 0, ctypes.sizeof(info))
            info.cbSize = ctypes.sizeof(info)
            info.dwInfoVersion = 1  # BCRYPT_INIT_AUTH_MODE_INFO_VERSION
            info.pbNonce = ctypes.cast(nonce_buf, ctypes.c_void_p)
            info.cbNonce = len(nonce)
            info.pbTag = ctypes.cast(tag_buf, ctypes.c_void_p)
            info.cbTag = len(tag)
            out = ctypes.create_string_buffer(len(ciphertext) or 1)
            out_len = wintypes.ULONG(0)
            status = bcrypt.BCryptDecrypt(
                h_key, ct_buf, len(ciphertext), ctypes.byref(info), None, 0,
                out, len(ciphertext), ctypes.byref(out_len), 0)
            if status != 0:
                return b""
            return out.raw[:out_len.value]
        finally:
            if h_key:
                bcrypt.BCryptDestroyKey(h_key)
            bcrypt.BCryptCloseAlgorithmProvider(h_alg, 0)
    except Exception:
        return b""
