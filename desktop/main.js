// Neon OS desktop app (Electron): the same web app in its own window, with music files from the computer
// opening in it (double-click a song, or Open with Neon OS). Built for Windows, macOS and Linux by GitHub
// (.github/workflows/desktop.yml).
const { app, BrowserWindow, protocol, net, shell, Menu, ipcMain, session, webFrameMain } = require("electron");
const crypto = require("crypto");
const path = require("path"), fs = require("fs");
const { pathToFileURL } = require("url");
const makeUpdater = require("./updater.js");

// The app is served from neonos://app/ so it has a proper web origin: its library, settings and folder links
// are kept like a website's (in this app's own storage, separate from any browser).
protocol.registerSchemesAsPrivileged([{ scheme: "neonos", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } }]);
const ROOT = path.join(__dirname, "app");
const AUDIO = /\.(mp3|flac|wav|ogg|oga|opus|m4a|aac)$/i, VIDEO = /\.(mp4|m4v|webm|mkv|mov|ogv|avi)$/i;
const MIME = { mp3: "audio/mpeg", flac: "audio/flac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac",
  mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mkv: "video/x-matroska", mov: "video/quicktime", ogv: "video/ogg", avi: "video/x-msvideo" };
// videos opened from the computer are served by a one-off link (they can be too big to hand over whole);
// only files the person opened get one, so nothing else on the computer can be reached this way
const openedFiles = new Map();

let win = null, pending = [];
const filesFrom = argv => argv.slice(1).filter(a => (AUDIO.test(a) || VIDEO.test(a)) && fs.existsSync(a));
function sendFiles(paths) {
  if (!paths.length) return;
  if (!win || win.webContents.isLoading()) { pending.push(...paths); return; }
  const list = paths.map(p => {
    const name = path.basename(p), type = MIME[p.split(".").pop().toLowerCase()] || "";
    if (VIDEO.test(p)) { const token = crypto.randomUUID(); openedFiles.set(token, p); return { name, type, size: fs.statSync(p).size, url: `neonos://app/__open/${token}` }; }
    return { name, type, data: fs.readFileSync(p) };
  });
  win.webContents.send("open-files", list);
  if (win.isMinimized()) win.restore(); win.focus();
}

// one Neon OS at a time: a second launch (opening another song) hands its files to the first
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", (e, argv) => sendFiles(filesFrom(argv)));
  app.on("open-file", (e, p) => { e.preventDefault(); sendFiles([p]); }); // macOS
  pending.push(...filesFrom(process.argv));

  app.whenReady().then(() => {
    // Neon OS's files: the newest downloaded copy if there is one (updater.js), else the ones that came with the app
    updater = makeUpdater({ app, net, bundled: ROOT });
    const SERVE = updater.prepare();
    protocol.handle("neonos", req => {
      let p = decodeURIComponent(new URL(req.url).pathname);
      if (p.startsWith("/__open/")) { // a video the person opened (with seeking: the Range asked for is passed on)
        const file = openedFiles.get(p.slice(8)); if (!file) return new Response("Not found", { status: 404 });
        const range = req.headers.get("Range");
        return net.fetch(pathToFileURL(file).toString(), range ? { headers: { Range: range } } : undefined);
      }
      if (p.endsWith("/")) p += "index.html";
      const file = path.normalize(path.join(SERVE, p));
      if (!file.startsWith(SERVE)) return new Response("Not found", { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    // the Browser app: pages show inside it even when a site asks not to be shown inside other pages, their sign-ins
    // work there, and they see an ordinary Chrome (some sites turn away anything else)
    app.userAgentFallback = app.userAgentFallback.replace(/\s?(Electron|neon-os|Neon OS)\/[^\s]+/gi, "");
    session.defaultSession.setUserAgent(app.userAgentFallback);
    session.defaultSession.webRequest.onHeadersReceived((d, cb) => {
      if (d.resourceType !== "subFrame" || !/^https?:/.test(d.url)) return cb({});
      const h = { ...d.responseHeaders };
      for (const k of Object.keys(h)) {
        const l = k.toLowerCase();
        if (l === "x-frame-options") delete h[k];
        else if (l === "content-security-policy") h[k] = h[k].map(v => v.replace(/frame-ancestors[^;]*;?/gi, ""));
        else if (l === "set-cookie") h[k] = h[k].map(v => v.replace(/;\s*samesite=[^;]*/gi, "") + "; SameSite=None; Secure");
      }
      cb({ responseHeaders: h });
    });
    Menu.setApplicationMenu(process.platform === "darwin" ? Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]) : null);
    win = new BrowserWindow({
      width: 1440, height: 900, minWidth: 360, minHeight: 480, backgroundColor: "#07050c", title: "Neon OS",
      icon: path.join(__dirname, "app", "icons", "icon-512.png"), autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
    });
    win.loadURL("neonos://app/");
    win.webContents.on("did-finish-load", () => { const p = pending; pending = []; sendFiles(p); });
    // a quiet look for updates a little after start, then every few hours
    setTimeout(checkUpdates, 8000); setInterval(checkUpdates, 4 * 3600e3);
    // links that open a new window open as a tab in Neon OS's Browser
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) win.webContents.send("open-url", url); return { action: "deny" }; });
    // the Browser app's tabs are frames named "nob-…": tell it where each one has got to, and its title
    const tabFrame = (pid, rid) => { try { const f = webFrameMain.fromId(pid, rid); return f && /^nob-/.test(f.name) ? f : null; } catch (e) { return null; } };
    win.webContents.on("did-frame-navigate", (e, url, code, status, isMain, pid, rid) => { const f = !isMain && tabFrame(pid, rid); if (f) win.webContents.send("frame-nav", { name: f.name, url }); });
    win.webContents.on("did-frame-finish-load", async (e, isMain, pid, rid) => {
      const f = !isMain && tabFrame(pid, rid); if (!f) return;
      try { const title = await f.executeJavaScript("document.title"); win.webContents.send("frame-nav", { name: f.name, url: f.url, title }); } catch (err) {}
    });
    win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("neonos://")) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  });
  app.on("window-all-closed", () => app.quit());
}
let updater = null, appNews = null;
async function checkUpdates() {
  if (!updater) return {};
  const files = await updater.checkFiles(), shell = await updater.checkApp();
  if (win && files.status === "ready") win.webContents.send("update", { kind: "files", version: files.version });
  if (win && shell.status === "newer" && (!appNews || appNews.version !== shell.version)) { appNews = shell; win.webContents.send("update", { kind: "app", version: shell.version, url: shell.url }); }
  return { files, app: shell };
}
ipcMain.handle("version", () => app.getVersion());
ipcMain.handle("update-info", () => ({ ...(updater ? updater.info() : {}), appNews }));
ipcMain.handle("check-updates", () => checkUpdates());
ipcMain.handle("restart", () => { app.relaunch(); app.exit(0); });
// back and forward in a Browser tab
ipcMain.handle("frame-go", async (e, name, n) => {
  if (!win || !/^nob-/.test(name)) return false;
  const f = win.webContents.mainFrame.framesInSubtree.find(x => x.name === name); if (!f) return false;
  try { await f.executeJavaScript(`history.go(${n === -1 ? -1 : 1})`); return true; } catch (err) { return false; }
});
ipcMain.handle("open-external", (e, url) => { if (/^https?:/.test(url)) shell.openExternal(url); });
