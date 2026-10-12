// Neon OS desktop app: keeps Neon OS's own files up to date from the website, so the desktop app gets every
// change without a new installer (and on a Mac too, where unsigned apps can't use the usual installer updates).
// - version.json on the website lists every file with a fingerprint (written by tools/precache.py).
// - A newer list is downloaded into web-next/ beside the app's data: changed files from the website (each one
//   checked against its fingerprint), unchanged ones copied from the copy in use. Nothing in use is touched.
// - At the next start, web-next/ becomes web/, the copy that's served. A newly installed app's own files win over
//   an older download.
// It also asks GitHub whether a newer desktop app (the shell around Neon OS) is out, so About can offer it.
const path = require("path"), fs = require("fs"), crypto = require("crypto");
const SITE = process.env.NEON_OS_SITE || "https://madoromitv.github.io/neon-os/";
const LATEST = "https://api.github.com/repos/madoromitv/neon-os/releases/latest";

module.exports = function makeUpdater({ app, net, bundled }) {
  const base = app.getPath("userData"), WEB = path.join(base, "web"), NEXT = path.join(base, "web-next");
  const readJson = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; } };
  const rm = d => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} };
  const bundledVer = readJson(path.join(bundled, "version.json")) || { version: "bundled", files: {} };
  let rootDir = bundled, current = bundledVer, ready = null, busy = false;

  function prepare() {
    if (readJson(path.join(NEXT, "ready.json"))) { rm(WEB); try { fs.renameSync(NEXT, WEB); } catch (e) { rm(NEXT); } }
    else rm(NEXT); // a download that didn't finish
    const live = readJson(path.join(WEB, "ready.json"));
    if (live && live.bundled !== bundledVer.version) { rm(WEB); } // a new installer since: its files are the base again
    else if (live) { rootDir = WEB; current = readJson(path.join(WEB, "version.json")) || current; }
    return rootDir;
  }
  const root = () => rootDir;
  const safe = p => typeof p === "string" && p && !p.includes("..") && !path.isAbsolute(p) && !p.includes("\\");
  const sha = buf => crypto.createHash("sha1").update(buf).digest("hex").slice(0, 12);

  async function checkFiles() {
    if (busy) return { status: "busy" };
    if (ready) return { status: "ready", version: ready };
    busy = true;
    try {
      const r = await net.fetch(SITE + "version.json?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return { status: "offline" };
      const remote = await r.json();
      if (!remote || !remote.files || !remote.version) return { status: "error" };
      if (remote.version === current.version) return { status: "current", version: current.version };
      rm(NEXT); fs.mkdirSync(NEXT, { recursive: true });
      for (const [p, want] of Object.entries(remote.files)) {
        if (!safe(p)) throw new Error("bad path " + p);
        const out = path.join(NEXT, p); fs.mkdirSync(path.dirname(out), { recursive: true });
        if (current.files && current.files[p] === want && fs.existsSync(path.join(rootDir, p))) { fs.copyFileSync(path.join(rootDir, p), out); continue; }
        const res = await net.fetch(SITE + p + "?v=" + remote.version, { cache: "no-store" });
        if (!res.ok) throw new Error(p + " " + res.status);
        const buf = Buffer.from(await res.arrayBuffer());
        if (sha(buf) !== want) throw new Error(p + " isn't the expected file yet"); // the website is mid-update: try later
        fs.writeFileSync(out, buf);
      }
      fs.writeFileSync(path.join(NEXT, "version.json"), JSON.stringify(remote));
      fs.writeFileSync(path.join(NEXT, "ready.json"), JSON.stringify({ version: remote.version, bundled: bundledVer.version, at: new Date().toISOString() }));
      ready = remote.version;
      return { status: "ready", version: remote.version };
    } catch (e) { rm(NEXT); return { status: "error", detail: String(e && e.message || e) }; }
    finally { busy = false; }
  }

  const num = v => String(v || "").replace(/^v/, "").split("-")[0].split(".").map(n => +n || 0);
  const newer = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
  async function checkApp() {
    try {
      const r = await net.fetch(LATEST, { headers: { "User-Agent": "Neon-OS-desktop", Accept: "application/vnd.github+json" } });
      if (!r.ok) return { status: "offline" };
      const rel = await r.json();
      return newer(rel.tag_name, app.getVersion()) ? { status: "newer", version: String(rel.tag_name).replace(/^v/, ""), url: rel.html_url } : { status: "current" };
    } catch (e) { return { status: "offline" }; }
  }
  const info = () => ({ app: app.getVersion(), files: current.version, ready, fromWeb: rootDir === WEB });
  return { prepare, root, checkFiles, checkApp, info };
};
