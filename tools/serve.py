"""A local server that sends no cache instruction.

    python3 tools/serve.py

The browser then reads each file from the disk. The plain server of
Python lets the browser keep a file in its cache, which hides a
change."""

import http.server, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PORT = 8099


class NoStore(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, *args):
        pass


os.chdir(ROOT)
print("http://localhost:%d" % PORT)
http.server.HTTPServer(("127.0.0.1", PORT), NoStore).serve_forever()
