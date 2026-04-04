#!/usr/bin/env python3
import json, socket, os, struct, base64, time, sys, hashlib

def ws_connect(host, port, path):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(10)
    s.connect((host, port))
    key = base64.b64encode(os.urandom(16)).decode()
    req = "GET %s HTTP/1.1\r\nHost: %s:%d\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n" % (path, host, port, key)
    s.sendall(req.encode())
    resp = b""
    while b"\r\n\r\n" not in resp:
        chunk = s.recv(4096)
        if not chunk:
            print("HANDSHAKE: connection closed", file=sys.stderr)
            return None
        resp += chunk
    status_line = resp.split(b"\r\n")[0].decode()
    print("HANDSHAKE: %s" % status_line, file=sys.stderr)
    if b"101" not in resp.split(b"\r\n")[0]:
        print("HANDSHAKE FAILED: %s" % resp.decode(errors="replace"), file=sys.stderr)
        return None
    # Check if there's extra data after headers (beginning of first frame)
    extra = resp.split(b"\r\n\r\n", 1)[1]
    return s, extra

def ws_send(s, data):
    p = data.encode("utf-8")
    frame = bytearray([0x81])
    l = len(p)
    if l < 126:
        frame.append(0x80 | l)
    elif l < 65536:
        frame.append(0x80 | 126)
        frame.extend(struct.pack(">H", l))
    else:
        frame.append(0x80 | 127)
        frame.extend(struct.pack(">Q", l))
    mask = os.urandom(4)
    frame.extend(mask)
    masked = bytearray(len(p))
    for i in range(len(p)):
        masked[i] = p[i] ^ mask[i % 4]
    frame.extend(masked)
    s.sendall(bytes(frame))
    print("SENT: %d bytes" % len(p), file=sys.stderr)

def ws_recv(s, initial=b""):
    buf = bytearray(initial)
    while True:
        # Try to parse a complete frame
        if len(buf) >= 2:
            fin = buf[0] & 0x80
            opcode = buf[0] & 0x0f
            masked = buf[1] & 0x80
            payload_len = buf[1] & 0x7f
            offset = 2
            if payload_len == 126:
                if len(buf) < 4:
                    pass  # need more data
                else:
                    payload_len = struct.unpack(">H", buf[2:4])[0]
                    offset = 4
            elif payload_len == 127:
                if len(buf) < 10:
                    pass  # need more data
                else:
                    payload_len = struct.unpack(">Q", buf[2:10])[0]
                    offset = 10
            
            if masked:
                offset += 4  # mask key
            
            total_needed = offset + payload_len
            if len(buf) >= total_needed:
                if masked:
                    mask_key = buf[offset-4:offset]
                    payload = bytearray(payload_len)
                    for i in range(payload_len):
                        payload[i] = buf[offset+i] ^ mask_key[i%4]
                else:
                    payload = buf[offset:offset+payload_len]
                
                print("RECV: opcode=%d fin=%d len=%d" % (opcode, fin>>7, payload_len), file=sys.stderr)
                
                if opcode == 0x8:  # close
                    return None
                if opcode == 0x9:  # ping
                    # send pong
                    buf = buf[total_needed:]
                    continue
                if opcode == 0x1:  # text
                    return bytes(payload).decode(errors="replace"), buf[total_needed:]
                if opcode == 0x2:  # binary
                    return bytes(payload).decode(errors="replace"), buf[total_needed:]
                # unknown opcode, skip
                buf = buf[total_needed:]
                continue
        
        # Need more data
        try:
            chunk = s.recv(65536)
        except socket.timeout:
            print("RECV: timeout (buf has %d bytes)" % len(buf), file=sys.stderr)
            if len(buf) > 0:
                print("RECV: buf preview: %s" % buf[:200].hex(), file=sys.stderr)
            return None, b""
        if not chunk:
            print("RECV: connection closed", file=sys.stderr)
            return None, b""
        buf.extend(chunk)

# Get targets
print("Fetching targets...", file=sys.stderr)
host = os.getenv('DECK_CDP_HOST', '127.0.0.1')
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
target_name = os.environ.get("CDP_TARGET", "SharedJSContext")
matches = [t for t in targets if target_name in t.get("title", "")]
if not matches:
    print("ERROR: No target matching '%s'" % target_name, file=sys.stderr)
    print("Available: %s" % [t["title"] for t in targets], file=sys.stderr)
    sys.exit(1)

ws_url = matches[0]["webSocketDebuggerUrl"]
print("Target: %s" % matches[0]["title"], file=sys.stderr)
# Parse ws://host:port/path
parts = ws_url.replace("ws://", "").split("/", 1)
host_port = parts[0].split(":")
ws_path = "/" + parts[1] if len(parts) > 1 else "/"
print("Connecting to %s" % ws_url, file=sys.stderr)

result = ws_connect(host, 8081, ws_path)
if result is None:
    print("Failed to connect", file=sys.stderr)
    sys.exit(1)
sock, extra = result

# Load expression
if len(sys.argv) > 1 and os.path.isfile(sys.argv[1]):
    with open(sys.argv[1]) as f:
        expr = f.read()
    print("Expression from file: %d chars" % len(expr), file=sys.stderr)
else:
    expr = sys.argv[1] if len(sys.argv) > 1 else 'JSON.stringify({ok:true})'
    print("Expression: %s" % expr[:100], file=sys.stderr)

msg = json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": expr, "returnByValue": True}})
ws_send(sock, msg)

# Read response(s)
remaining = extra
t0 = time.time()
while time.time() - t0 < 20:
    result = ws_recv(sock, remaining)
    if result is None:
        print("No response", file=sys.stderr)
        break
    data, remaining = result
    try:
        msg = json.loads(data)
    except:
        print("Non-JSON: %s" % data[:200], file=sys.stderr)
        continue
    
    if msg.get("id") == 1:
        r = msg.get("result", {}).get("result", {})
        v = r.get("value")
        exc = msg.get("result", {}).get("exceptionDetails")
        if exc:
            print("EXCEPTION: %s" % json.dumps(exc), file=sys.stderr)
        if v:
            try:
                parsed = json.loads(v) if isinstance(v, str) else v
                print(json.dumps(parsed, indent=2))
            except:
                print(v)
        else:
            print(json.dumps(r, indent=2))
        break
    else:
        print("OTHER MSG id=%s method=%s" % (msg.get("id"), msg.get("method")), file=sys.stderr)

sock.close()
