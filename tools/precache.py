# Writes the list of files Neon OS needs offline into sw.js, with a version that changes whenever any file changes.
# Run from the repo root after changing files: python tools/precache.py
import hashlib, json, os, re
SKIP_DIRS = {".git", ".github", "tools", "tests", "node_modules"}
KEEP = (".html", ".css", ".js", ".mjs", ".png", ".svg", ".webmanifest", ".json", ".woff2")
files, h = [], hashlib.sha1()
for root, dirs, names in os.walk("."):
    dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
    for n in sorted(names):
        p = os.path.join(root, n)[2:].replace(os.sep, "/")
        if p == "sw.js" or not p.endswith(KEEP): continue
        files.append(p)
        with open(p, "rb") as f: h.update(p.encode()); h.update(f.read())
files = ["./"] + [p[:-10] if p.endswith("index.html") and p != "index.html" else p for p in files]
src = open("sw.js").read()
src = re.sub(r"const VERSION = .*?;", f'const VERSION = "{h.hexdigest()[:10]}";', src, count=1)
src = re.sub(r"const FILES = \[.*?\];", "const FILES = " + json.dumps(files, indent=0).replace("\n", " ") + ";", src, count=1, flags=re.S)
open("sw.js", "w").write(src)
print(len(files), "files, version", h.hexdigest()[:10])
