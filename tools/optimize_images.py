#!/usr/bin/env python3
"""Convert site photos to WebP and rewrite page references.

Run from the repo root after adding a new photo:  python3 tools/optimize_images.py
- Converts images/*.jpg|jpeg|png -> .webp (long edge capped at 1600px, quality 78)
- Leaves social/icon files as-is (og-image, favicon, apple-touch-icon): crawlers need PNG/JPG
- Rewrites <img>/CSS/JS references to the .webp, drops old ?v= cache params
- Adds width/height (stops layout jumping) and lazy-loading to <img> tags
"""
import glob, os, re
from PIL import Image

KEEP = {"og-image.png", "favicon.png", "apple-touch-icon.png", "logo.png"}
SMALL = {"icon.png": 300}  # shown at ~40px tall; no need for 900px
dims = {}
saved_before = saved_after = 0

for f in sorted(glob.glob("images/*")):
    name = os.path.basename(f)
    base, ext = os.path.splitext(name)
    if ext.lower() not in (".jpg", ".jpeg", ".png") or name in KEEP:
        continue
    im = Image.open(f)
    im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
    cap = SMALL.get(name, 1600)
    if max(im.size) > cap:
        im.thumbnail((cap, cap), Image.LANCZOS)
    out = f"images/{base}.webp"
    im.save(out, "WEBP", quality=78, method=6)
    dims[f"{base}.webp"] = im.size
    saved_before += os.path.getsize(f); saved_after += os.path.getsize(out)
    print(f"{name:28} {os.path.getsize(f)//1024:>5}KB -> {os.path.getsize(out)//1024:>4}KB  {im.size}")
print(f"TOTAL {saved_before//1024}KB -> {saved_after//1024}KB")

conv = {os.path.splitext(n)[0] for n in dims.keys()}
pat = re.compile(r"((?:\.\./)?images/)([\w-]+)\.(?:jpg|jpeg|png)(\?v=\d+)?")
def swap(m):
    return f"{m.group(1)}{m.group(2)}.webp" if m.group(2) in conv else m.group(0)

def fix_img(tag):
    m = re.search(r'src="(?:\.\./)?images/([\w-]+\.webp)"', tag)
    if not m: return tag
    w, h = dims[m.group(1)]
    if "width=" not in tag: tag = tag.replace("<img ", f'<img width="{w}" height="{h}" ', 1)
    return tag

for p in glob.glob("*.html") + glob.glob("*/*.html") + glob.glob("css/*.css") + glob.glob("js/*.js"):
    s = open(p).read(); o = s
    s = pat.sub(swap, s)
    if p.endswith(".html"):
        s = re.sub(r"<img [^>]*>", lambda m: fix_img(m.group(0)), s)
        imgs = list(re.finditer(r"<img [^>]*>", s))
        out, last = [], 0
        first_content = True
        for m in imgs:
            tag = m.group(0)
            above_fold = ("icon.webp" in tag and last == 0) or (first_content and "icon.webp" not in tag and "wordmark" not in tag)
            if "icon.webp" not in tag: first_content = False
            if "loading=" not in tag and not above_fold:
                tag = tag.replace("<img ", '<img loading="lazy" decoding="async" ', 1)
            out.append(s[last:m.start()]); out.append(tag); last = m.end()
        out.append(s[last:]); s = "".join(out)
    if s != o: open(p, "w").write(s)
