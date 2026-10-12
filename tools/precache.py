# Writes the list of files Neon OS needs offline into sw.js, with a version that changes whenever any file changes,
# and the same list with each file's own fingerprint into version.json (the desktop app updates itself from it).
# Run from the repo root after changing files: python tools/precache.py
import hashlib, json, os, re
SKIP_DIRS = {".git", ".github", "tools", "tests", "desktop", "node_modules"}
KEEP = (".html", ".css", ".js", ".mjs", ".png", ".svg", ".webmanifest", ".json", ".woff2")
files, h, each = [], hashlib.sha1(), {}
for root, dirs, names in os.walk("."):
    dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
    for n in sorted(names):
        p = os.path.join(root, n)[2:].replace(os.sep, "/")
        if p in ("sw.js", "version.json") or not p.endswith(KEEP): continue
        files.append(p)
        with open(p, "rb") as f: data = f.read()
        h.update(p.encode()); h.update(data); each[p] = hashlib.sha1(data).hexdigest()[:12]
files = ["./"] + [p[:-10] if p.endswith("index.html") and p != "index.html" else p for p in files]
src = open("sw.js").read()
src = re.sub(r"const VERSION = .*?;", f'const VERSION = "{h.hexdigest()[:10]}";', src, count=1)
src = re.sub(r"const FILES = \[.*?\];", "const FILES = " + json.dumps(files, indent=0).replace("\n", " ") + ";", src, count=1, flags=re.S)
open("sw.js", "w").write(src)
with open("version.json", "w") as f: json.dump({"version": h.hexdigest()[:10], "files": each}, f, indent=0, sort_keys=True); f.write("\n")
print(len(files), "files, version", h.hexdigest()[:10])
