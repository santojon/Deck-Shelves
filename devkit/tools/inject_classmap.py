#!/usr/bin/env python3
"""Inject a class map into the Shared JS runtime on the Deck via CDP.

Reads a JSON class map from the `CLASS_MAP` env var (or prints usage).

Example:
  DECK_CDP_HOST=192.168.1.15 DECK_CDP_PORT=8081 \
  CLASS_MAP='{"viewport":"_3PhG...","row":"ds-row-scroll","card":"ds-card"}' \
  python3 devkit/tools/inject_classmap.py
"""

import json
import os
import socket
import struct
import sys
import base64
import time

WS_HOST = os.getenv('DECK_CDP_HOST', '127.0.0.1')
WS_PORT = int(os.getenv('DECK_CDP_PORT', '8081'))

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from lib import selectors as S  # noqa: E402

CLASS_MAP_GLOBAL = S.CLASS_MAP_GLOBAL
CLASS_MAP_LS_KEY = S.CLASS_MAP_LS_KEY


def ws_connect(path: str) -> socket.socket:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(10)
    sock.connect((WS_HOST, WS_PORT))

    key = base64.b64encode(os.urandom(16)).decode()
    req = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {WS_HOST}:{WS_PORT}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n\r\n"
    )
    sock.sendall(req.encode())

    resp = b""
    while b"\r\n\r\n" not in resp:
        resp += sock.recv(4096)
    return sock


def ws_send(sock: socket.socket, data: str) -> None:
    payload = data.encode()
    frame = bytearray([0x81])

    length = len(payload)
    if length < 126:
        frame.append(0x80 | length)
    elif length < 65536:
        frame.append(0x80 | 126)
        frame.extend(struct.pack(">H", length))
    else:
        frame.append(0x80 | 127)
        frame.extend(struct.pack(">Q", length))

    mask = os.urandom(4)
    frame.extend(mask)
    for i, b in enumerate(payload):
        frame.append(b ^ mask[i % 4])
    sock.sendall(bytes(frame))


def ws_recv(sock: socket.socket) -> str:
    data = b""
    while True:
        chunk = sock.recv(65536)
        if not chunk:
            raise RuntimeError("no data")
        data += chunk
        if len(data) < 2:
            continue

        length = data[1] & 0x7F
        offset = 2
        if length == 126:
            if len(data) < 4:
                continue
            length = struct.unpack(">H", data[2:4])[0]
            offset = 4
        elif length == 127:
            if len(data) < 10:
                continue
            length = struct.unpack(">Q", data[2:10])[0]
            offset = 10

        if len(data) >= offset + length:
            return data[offset:offset + length].decode(errors="replace")


def cdp_eval(sock: socket.socket, expression: str, msg_id: int = 1) -> dict:
    payload = {
        "id": msg_id,
        "method": "Runtime.evaluate",
        "params": {"expression": expression, "returnByValue": True},
    }
    ws_send(sock, json.dumps(payload))
    while True:
        raw = ws_recv(sock)
        msg = json.loads(raw)
        if msg.get("id") == msg_id:
            return msg


def get_targets():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((WS_HOST, WS_PORT))
    sock.sendall((f"GET /json HTTP/1.1\r\nHost: {WS_HOST}:{WS_PORT}\r\n\r\n").encode())
    resp = b""
    while True:
        try:
            chunk = sock.recv(4096)
            if not chunk:
                break
            resp += chunk
        except Exception:
            break
    sock.close()

    if b"\r\n\r\n" not in resp:
        return []
    body = resp.split(b"\r\n\r\n", 1)[1]
    try:
        return json.loads(body)
    except Exception:
        return []


def find_shared_target(targets):
    for target in targets:
        if "SharedJSContext" in target.get("title", ""):
            return target
    raise RuntimeError("SharedJSContext target not found")


def eval_in_shared(expression: str):
    shared = None
    for _ in range(10):
        targets = get_targets()
        if targets:
            try:
                shared = find_shared_target(targets)
                break
            except Exception:
                pass
        time.sleep(0.5)

    if not shared:
        raise RuntimeError("SharedJSContext target not available")

    ws_path = shared["webSocketDebuggerUrl"].split(f"{WS_HOST}:{WS_PORT}", 1)[1]
    last_error = None
    for _ in range(10):
        sock = None
        try:
            sock = ws_connect(ws_path)
            msg = cdp_eval(sock, expression, 1)
            return msg.get("result", {}).get("result", {}).get("value")
        except Exception as exc:
            last_error = exc
            time.sleep(0.5)
        finally:
            try:
                if sock:
                    sock.close()
            except Exception:
                pass

    if last_error:
        raise last_error
    raise RuntimeError("Failed to evaluate expression in SharedJSContext")


def main():
    raw = os.getenv('CLASS_MAP')
    if not raw:
        print(json.dumps({"error": "CLASS_MAP env var required"}))
        return 2
    try:
        cmap = json.loads(raw)
    except Exception as e:
        print(json.dumps({"error": "invalid CLASS_MAP JSON", "msg": str(e)}))
        return 2

    # Build a safe JS expression that sets the global class-map and persists
    # it in localStorage under the configured keys.
    js = (
        "(function(){try{var m=" + json.dumps(cmap)
        + ";try{window[" + json.dumps(CLASS_MAP_GLOBAL) + "]=m}catch(e){};"
        + "try{localStorage.setItem(" + json.dumps(CLASS_MAP_LS_KEY) + ", JSON.stringify(m))}catch(e){};"
        + " return {ok:true}}catch(e){return {error:e.message}}})()"
    )

    try:
        res = eval_in_shared(js)
        print(json.dumps({"result": res}))
        return 0
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        return 2


if __name__ == '__main__':
    sys.exit(main())
