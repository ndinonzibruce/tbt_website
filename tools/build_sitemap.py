#!/usr/bin/env python3
"""Regenerates sitemap.xml with each page's real last-changed date.
Run from the repo root:  python3 tools/build_sitemap.py
Skips pages marked noindex (404, /band). Dates come from git; files with
uncommitted edits count as changed today."""
import datetime, glob, re, subprocess

SITE = "https://tbtysu.org"
today = datetime.date.today().isoformat()
dirty = {l[3:].strip().strip('"') for l in subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True).stdout.splitlines()}

def last_changed(path):
    if path in dirty or any(d.startswith(path.rsplit("/", 1)[0] + "/") for d in dirty if "/" in path and d.startswith(path.rsplit("/", 1)[0])):
        return today
    out = subprocess.run(["git", "log", "-1", "--format=%cs", "--", path], capture_output=True, text=True).stdout.strip()
    return out or today

pages = []
for p in sorted(glob.glob("*.html") + glob.glob("*/index.html")):
    if "noindex" in open(p).read():
        continue
    url = f"{SITE}/" if p == "index.html" else (f"{SITE}/{p[:-len('index.html')]}" if p.endswith("/index.html") else f"{SITE}/{p}")
    pages.append((0 if p == "index.html" else 1, url, last_changed(p)))
pages.sort()
xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
xml += [f"  <url><loc>{u}</loc><lastmod>{m}</lastmod></url>" for _, u, m in pages]
xml.append("</urlset>")
open("sitemap.xml", "w").write("\n".join(xml) + "\n")
print(f"sitemap.xml: {len(pages)} pages")
