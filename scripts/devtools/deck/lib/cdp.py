"""
Generic CDP (Chrome DevTools Protocol) session wrapper for Deck Shelves devtools.

This is the canonical implementation. Both the screenshot pipeline
(scripts/devtools/deck/screenshots/) and the UI test runner
(scripts/devtools/deck/uitests/) import from here.

The screenshots/lib/cdp.py and uitests shims re-export this module for
backwards-compatibility with any existing import paths.
"""
from __future__ import annotations

import base64
import json
import socket
import struct
import time
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


def _normalize_host(host: str) -> str:
    for prefix in ("http://", "https://", "ws://", "wss://"):
        if host.startswith(prefix):
            return host[len(prefix):]
    return host


def list_targets(host: str, port: int, timeout: float = 5.0) -> List[Dict[str, Any]]:
    host = _normalize_host(host)
    url = f"http://{host}:{port}/json"
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.load(resp)


def find_target(targets: List[Dict[str, Any]], title_substring: str) -> Optional[Dict[str, Any]]:
    needle = title_substring.lower()
    for t in targets:
        if needle in t.get("title", "").lower():
            return t
    return None


def _ws_path(target: Dict[str, Any], port: int) -> str:
    wsurl = (target.get("webSocketDebuggerUrl") or "").replace("wss://", "ws://")
    return wsurl.split(f"{port}", 1)[1]


def _ws_handshake(host: str, port: int, path: str) -> socket.socket:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(15)
    sock.connect((_normalize_host(host), port))
    key = base64.b64encode(b"deck-shelves-screenshot--01").decode()
    req = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n\r\n"
    )
    sock.sendall(req.encode())
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = sock.recv(4096)
        if not chunk:
            raise RuntimeError("WebSocket handshake aborted")
        data += chunk
    return sock


def _ws_send(sock: socket.socket, payload: str) -> None:
    raw = payload.encode("utf-8")
    head = bytearray([0x81])  # FIN + text frame
    n = len(raw)
    if n < 126:
        head.append(0x80 | n)
    elif n < (1 << 16):
        head += bytes([0x80 | 126]) + struct.pack(">H", n)
    else:
        head += bytes([0x80 | 127]) + struct.pack(">Q", n)
    head += b"\x00\x00\x00\x00"  # mask key (zeros)
    sock.sendall(bytes(head) + raw)


def _ws_recv(sock: socket.socket) -> str:
    head = sock.recv(2)
    if len(head) < 2:
        return ""
    length = head[1] & 0x7F
    if length == 126:
        length = struct.unpack(">H", sock.recv(2))[0]
    elif length == 127:
        length = struct.unpack(">Q", sock.recv(8))[0]
    chunks: List[bytes] = []
    remaining = length
    while remaining > 0:
        chunk = sock.recv(min(65536, remaining))
        if not chunk:
            break
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks).decode("utf-8", errors="replace")


@dataclass
class Session:
    """Holds a single CDP WebSocket and provides `call()` and `evaluate()`."""

    host: str
    port: int
    target: Dict[str, Any]
    sock: socket.socket
    next_id: int = 1

    @classmethod
    def open(cls, host: str, port: int, target: Dict[str, Any]) -> "Session":
        path = _ws_path(target, port)
        sock = _ws_handshake(host, port, path)
        return cls(host=host, port=port, target=target, sock=sock)

    def call(self, method: str, params: Optional[Dict[str, Any]] = None, timeout: float = 8.0) -> Dict[str, Any]:
        msg_id = self.next_id
        self.next_id += 1
        payload = {"id": msg_id, "method": method}
        if params:
            payload["params"] = params
        _ws_send(self.sock, json.dumps(payload))
        deadline = time.time() + timeout
        while time.time() < deadline:
            raw = _ws_recv(self.sock)
            if not raw:
                continue
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if msg.get("id") == msg_id:
                if "error" in msg:
                    raise RuntimeError(f"CDP error on {method}: {msg['error']}")
                return msg
        raise TimeoutError(f"CDP {method} timed out after {timeout}s")

    def evaluate(self, expression: str, return_by_value: bool = True, timeout: float = 8.0) -> Any:
        msg = self.call(
            "Runtime.evaluate",
            {"expression": expression, "returnByValue": return_by_value, "awaitPromise": True},
            timeout=timeout,
        )
        result = msg.get("result", {}).get("result", {})
        if result.get("type") == "undefined":
            return None
        return result.get("value")

    def screenshot(self, timeout: float = 8.0) -> bytes:
        msg = self.call("Page.captureScreenshot", {"format": "png"}, timeout=timeout)
        data = msg.get("result", {}).get("data", "")
        import base64 as _b64
        return _b64.b64decode(data)

    def close(self) -> None:
        try:
            self.sock.close()
        except Exception:
            pass


def open_session(host: str, port: int, title_substring: str) -> Session:
    targets = list_targets(host, port)
    target = find_target(targets, title_substring)
    if not target:
        titles = ", ".join(t.get("title", "?") for t in targets)
        raise RuntimeError(f"No target matching '{title_substring}'. Available: {titles}")
    return Session.open(host, port, target)


def load_env(env_path: str | None = None) -> tuple[str, int]:
    """Load DECK_HOST and DECK_CDP_PORT from .env file and environment."""
    import os
    from pathlib import Path
    host = os.environ.get("DECK_HOST", "")
    port = int(os.environ.get("DECK_CDP_PORT", "8081") or "8081")
    candidates = [env_path] if env_path else []
    # Walk up from this file to find .env in repo root
    p = Path(__file__).resolve()
    for _ in range(6):
        p = p.parent
        candidate = p / ".env"
        if candidate.exists():
            candidates.append(str(candidate))
            break
    for path in candidates:
        if not path:
            continue
        try:
            for line in Path(path).read_text().splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k == "DECK_HOST" and not host:
                    host = v
                elif k == "DECK_CDP_PORT" and v:
                    try:
                        port = int(v)
                    except ValueError:
                        pass
        except OSError:
            pass
    return host, port
