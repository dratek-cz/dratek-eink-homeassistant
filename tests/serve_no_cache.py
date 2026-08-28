from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os
import sys

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

if __name__ == "__main__":
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    os.chdir(root)
    port = 8940
    print(f"Serving HTTP from {root} on http://localhost:{port}/tests/dratek-eink-panel-harness.html", flush=True)
    httpd = ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)


