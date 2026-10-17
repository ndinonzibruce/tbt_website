#!/usr/bin/env python3
"""Local preview that behaves like the live site: /about serves about.html,
/game-night/ serves game-night/index.html.   python3 tools/serve.py [port]"""
import http.server, os, sys

class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = super().translate_path(path)
        if not os.path.exists(p) and os.path.exists(p + ".html"):
            return p + ".html"
        return p
    def log_message(self, *a): pass

http.server.test(HandlerClass=H, port=int(sys.argv[1]) if len(sys.argv) > 1 else 8125, bind="127.0.0.1")
