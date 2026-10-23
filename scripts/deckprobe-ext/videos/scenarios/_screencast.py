"""Screencast recording that keeps real time.

The debug protocol only sends a screencast frame when the window repaints, so
a static page (a settings tab, the Quick Access panel) yields a handful of
frames and the toolkit's fixed-rate encode squeezes those seconds away. This
recorder keeps each frame's arrival time and encodes with per-frame durations
(the concat demuxer), so a clip lasts as long as the scenario did and the cue
timestamps line up with it."""
from __future__ import annotations

import json
import shutil
import subprocess
import threading
import time
from base64 import b64decode
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, List, Tuple

from deckprobe.lib.cdp import _ws_recv, open_session


class _Timed:
    def __init__(self, session, frames_dir: Path) -> None:
        self.session = session
        self.frames_dir = frames_dir
        self.frames: List[Tuple[float, Path]] = []
        self.started = time.time()
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def _run(self) -> None:
        try:
            self.session.sock.settimeout(0.5)
        except Exception:  # noqa: BLE001
            pass
        while not self._stop.is_set():
            try:
                raw = _ws_recv(self.session.sock)
            except TimeoutError:
                continue
            except OSError:
                break
            if not raw:
                break
            self._on_message(raw)

    def _on_message(self, raw: str) -> None:
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            return
        if msg.get("method") != "Page.screencastFrame":
            return
        params = msg.get("params") or {}
        data = params.get("data")
        if data:
            path = self.frames_dir / f"frame_{len(self.frames) + 1:06d}.jpg"
            path.write_bytes(b64decode(data))
            self.frames.append((time.time(), path))
        sid = params.get("sessionId")
        if sid is not None:
            try:
                self.session.call("Page.screencastFrameAck", {"sessionId": sid}, timeout=2.0)
            except Exception:  # noqa: BLE001
                pass
            # The call above stretches the socket timeout to 15 s; the receive
            # loop needs its short one back to notice a stop promptly.
            try:
                self.session.sock.settimeout(0.5)
            except Exception:  # noqa: BLE001
                pass

    def start(self) -> None:
        self.session.call("Page.startScreencast", {"format": "jpeg", "quality": 80, "maxWidth": 1280, "maxHeight": 800, "everyNthFrame": 1}, timeout=5.0)
        self.started = time.time()
        self._thread.start()

    def stop(self) -> float:
        """Stop recording; returns the moment the recording ended (the last
        frame holds until then), taken before the connection teardown."""
        time.sleep(0.6)
        ended = time.time()
        self._stop.set()
        self._thread.join(timeout=5.0)
        try:
            self.session.call("Page.stopScreencast", timeout=3.0)
        except Exception:  # noqa: BLE001
            pass
        self.session.close()
        return ended


def _encode(frames: List[Tuple[float, Path]], started: float, ended: float, out_path: Path, fps: int) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg or not frames:
        return
    lines = []
    # The first frame stands in from the start of the recording.
    times = [started] + [t for t, _ in frames[1:]] + [ended]
    for i, (_, path) in enumerate(frames):
        lines.append(f"file '{path.as_posix()}'")
        lines.append(f"duration {max(0.04, times[i + 1] - times[i]):.3f}")
    lines.append(f"file '{frames[-1][1].as_posix()}'")
    listing = frames[0][1].parent / "frames.txt"
    listing.write_text("\n".join(lines) + "\n", encoding="utf-8")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        ffmpeg, "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(listing),
        "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-r", str(fps),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", str(out_path),
    ], check=True, capture_output=True)


@contextmanager
def record_timed(host: str, port: int, target_title: str, out_dir: Path, name: str, *, fps: int = 10) -> Iterator[None]:
    """Record `target_title`'s window for the duration of the block into
    `<out_dir>/<name>`, keeping real time between frames."""
    frames_dir = out_dir / "_frames" / f"{name.replace('/', '_')}_{int(time.time() * 1000)}"
    frames_dir.mkdir(parents=True, exist_ok=True)
    rec = _Timed(open_session(host, port, target_title), frames_dir)
    rec.start()
    try:
        yield
    finally:
        ended = rec.stop()
        _encode(rec.frames, rec.started, ended, out_dir / name, fps)
