#!/usr/bin/env python3
"""Static dev server with HTTP Range support.

`python -m http.server` does not implement Range requests. Video scrubbing
depends on them entirely: without Range the browser cannot seek until the whole
file has downloaded, so the hero appears to hang. This serves the same files and
adds byte-range handling, so local behaviour matches a real host.

Usage:  python tools/serve.py [port]
Also accepts POST /_frame (dev only) with a base64 image body, writing it to
review/frames/. Used to pull decoded frames out of the master video for
timestamp scouting, because ffmpeg is not installed on this machine.
"""

import base64
import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")


class RangeHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_head(self):
        rng = self.headers.get("Range")
        if not rng:
            return super().send_head()

        path = self.translate_path(self.path)
        if os.path.isdir(path) or not os.path.isfile(path):
            return super().send_head()

        m = RANGE_RE.match(rng.strip())
        if not m:
            return super().send_head()

        size = os.path.getsize(path)
        start_s, end_s = m.group(1), m.group(2)

        if start_s == "":                      # suffix range: last N bytes
            if end_s == "":
                return super().send_head()
            length = min(int(end_s), size)
            start = size - length
            end = size - 1
        else:
            start = int(start_s)
            end = int(end_s) if end_s else size - 1

        if start >= size or start > end:
            self.send_response(416)
            self.send_header("Content-Range", "bytes */%d" % size)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None

        end = min(end, size - 1)
        length = end - start + 1

        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.send_header("Content-Length", str(length))
        self.end_headers()

        # hand back a reader limited to the requested slice
        remaining = length

        class Slice:
            def read(self, n=-1):
                nonlocal remaining
                if remaining <= 0:
                    return b""
                if n is None or n < 0 or n > remaining:
                    n = remaining
                chunk = f.read(n)
                remaining -= len(chunk)
                return chunk

            def close(self):
                f.close()

        return Slice()


    def do_POST(self):
        """Dev-only frame dump: body is {"name":"x.jpg","data":"<base64>"}."""
        if self.path != "/_frame":
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        try:
            import json
            n = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(n).decode("utf-8"))
            name = os.path.basename(payload["name"])
            blob = payload["data"].split(",", 1)[-1]
            out_dir = os.path.join(ROOT, "review", "frames")
            os.makedirs(out_dir, exist_ok=True)
            dest = os.path.join(out_dir, name)
            with open(dest, "wb") as fh:
                fh.write(base64.b64decode(blob))
            body = ("saved %s (%d bytes)" % (name, os.path.getsize(dest))).encode()
            self.send_response(200)
        except Exception as exc:
            body = ("error: %s" % exc).encode()
            self.send_response(500)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    handler = partial(RangeHandler, directory=ROOT)
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print("serving %s on http://localhost:%d  (Range enabled)" % (ROOT, port))
    server.serve_forever()


if __name__ == "__main__":
    main()
