#!/usr/bin/env python3
import json, socket, os, struct, base64, time, sys

host = os.getenv('DECK_CDP_HOST', '127.0.0.1')

def ws_connect(path):
    s = socket.socket(); s.settimeout(15); s.connect((host, 8081))
    key = base64.b64encode(os.urandom(16)).decode()
    s.sendall(("GET %s HTTP/1.1\r\nHost: %s:8081\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n" % (path, host, key)).encode())
    resp = b""
    while b"\r\n\r\n" not in resp:
        resp += s.recv(4096)
    return s

def ws_send(s, data):
    p = data.encode()
    f = bytearray([0x81])
    l = len(p)
    if l < 126:
        f.append(0x80 | l)
    elif l < 65536:
        f.append(0x80 | 126)
        f.extend(struct.pack(">H", l))
    else:
        f.append(0x80 | 127)
        f.extend(struct.pack(">Q", l))
    mask = os.urandom(4)
    f.extend(mask)
    for i, b in enumerate(p):
        f.append(b ^ mask[i % 4])
    s.sendall(bytes(f))

def ws_recv(s):
    d = b""
    while True:
        c = s.recv(65536)
        if not c:
            return None
        d += c
        if len(d) < 2:
            continue
        l = d[1] & 0x7F
        o = 2
        if l == 126:
            if len(d) < 4:
                continue
            l = struct.unpack(">H", d[2:4])[0]
            o = 4
        elif l == 127:
            if len(d) < 10:
                continue
            l = struct.unpack(">Q", d[2:10])[0]
            o = 10
        if len(d) >= o + l:
            return d[o:o + l].decode(errors="replace")

# Get targets
s0 = socket.socket()
s0.settimeout(5)
s0.connect((host, 8081))
s0.sendall((f"GET /json HTTP/1.1\r\nHost: {host}:8081\r\n\r\n").encode())
r = b""
while True:
    try:
        c = s0.recv(4096)
        if not c:
            break
        r += c
    except:
        break
s0.close()

targets = json.loads(r.split(b"\r\n\r\n", 1)[1])
shared = [t for t in targets if "SharedJSContext" in t.get("title", "")]
if not shared:
    print("ERROR: No SharedJSContext target found")
    sys.exit(1)
ws_path = shared[0]["webSocketDebuggerUrl"].split(f"{host}:8081", 1)[1]

# Load JS expression from file or use argument
if len(sys.argv) > 1 and os.path.isfile(sys.argv[1]):
    with open(sys.argv[1]) as f:
        expr = f.read()
else:
    expr = sys.argv[1] if len(sys.argv) > 1 else "JSON.stringify({ok:true})"

sock = ws_connect(ws_path)
ws_send(sock, json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": expr, "returnByValue": True}}))
t0 = time.time()
while time.time() - t0 < 15:
    raw = ws_recv(sock)
    if raw is None:
        print("no response")
        break
    msg = json.loads(raw)
    if msg.get("id") == 1:
        result = msg.get("result", {}).get("result", {})
        v = result.get("value")
        if v:
            try:
                parsed = json.loads(v) if isinstance(v, str) else v
                print(json.dumps(parsed, indent=2))
            except:
                print(v)
        else:
            print(json.dumps(result, indent=2))
        break
sock.close()
