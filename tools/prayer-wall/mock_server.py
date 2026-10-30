#!/usr/bin/env python3
"""Local stand-in for the Google Apps Script, so the prayer pages can be tested without Google.
   python3 tools/prayer-wall/mock_server.py [port]   then open /prayer?endpoint=http://localhost:8787/"""
import hashlib, json, re, secrets, sys, time, uuid
from http.server import BaseHTTPRequestHandler, HTTPServer

DB = []
TOPICS = ["Health", "Family", "School", "Faith"]
def now(): return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
def h(t): return hashlib.sha256(t.encode()).hexdigest()
def cors(x):
    x.send_header("Access-Control-Allow-Origin", "*"); x.send_header("Access-Control-Allow-Headers", "*")
def shape(r): return {k: r[k] for k in ("id", "name", "text", "ts", "prayed", "topic", "answered", "update")}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _json(self, o, code=200):
        b = json.dumps(o).encode()
        self.send_response(code); cors(self); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_OPTIONS(self): self.send_response(204); cors(self); self.end_headers()
    def do_GET(self):
        w = [r for r in reversed(DB) if r["visibility"] == "public" and r["status"] == "live"]
        self._json({"ok": True, "requests": [shape(r) for r in w if not r["answered"]], "answered": [shape(r) for r in w if r["answered"]], "prayers": sum(r["prayed"] for r in w)})
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        a = body.get("action")
        if a == "submit":
            t = " ".join(str(body.get("text", "")).split())
            if body.get("website") or body.get("elapsed", 0) < 3000: return self._json({"ok": False, "error": "spam"})
            if len(t) < 5: return self._json({"ok": False, "error": "Please write a little more."})
            if re.search(r"https?:|@|\d{10}", t): return self._json({"ok": False, "error": "Please take out links, email addresses and phone numbers."})
            name = "Anonymous" if body.get("anon") else (str(body.get("name", "")).split() or ["Anonymous"])[0][:20]
            tok = secrets.token_hex(16)
            r = dict(id="r" + uuid.uuid4().hex[:8], name=name, text=t, ts=now(), visibility="team" if body.get("visibility") == "team" else "public", status="live", prayed=0, reports=0,
                     topic=body.get("topic") if body.get("topic") in TOPICS else "", answered=False, update="", token=h(tok))
            DB.append(r); return self._json({"ok": True, "token": tok, **shape(r), "visibility": r["visibility"]})
        for r in DB:
            if r["id"] != body.get("id"): continue
            if a in ("answer", "remove"):
                if h(str(body.get("token", ""))) != r["token"]: return self._json({"ok": False, "error": "That link doesn't match this request."})
                if a == "remove": r["status"] = "removed"; return self._json({"ok": True})
                if body.get("undo"): r["answered"] = False; r["update"] = ""; return self._json({"ok": True, "answered": False, "update": ""})
                u = " ".join(str(body.get("update", "")).split())
                if len(u) > 200: return self._json({"ok": False, "error": "Please keep the update under 200 characters."})
                r["answered"] = True; r["update"] = u; return self._json({"ok": True, "answered": True, "update": u})
            if r["visibility"] != "public": break
            if a == "pray": r["prayed"] += 1; return self._json({"ok": True, "count": r["prayed"]})
            if a == "report":
                r["reports"] += 1
                if r["reports"] >= 3: r["status"] = "hidden"
                return self._json({"ok": True, "count": r["reports"]})
        self._json({"ok": False, "error": "not found"})

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
HTTPServer(("127.0.0.1", port), H).serve_forever()
