from http.server import HTTPServer, SimpleHTTPRequestHandler
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
    print(f"Serving HTTP from {root} on port {port} with No-Cache headers...")
    httpd = HTTPServer(("0.0.0.0", port), NoCacheHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
