// Neon OS desktop app (Electron): the same web app in its own window, with music files from the computer
// opening in it (double-click a song, or Open with Neon OS). Built for Windows, macOS and Linux by GitHub
// (.github/workflows/desktop.yml).
const { app, BrowserWindow, protocol, net, shell, Menu, ipcMain } = require("electron");
const path = require("path"), fs = require("fs");
const { pathToFileURL } = require("url");
const makeUpdater = require("./updater.js");

// The app is served from neonos://app/ so it has a proper web origin: its library, settings and folder links
// are kept like a website's (in this app's own storage, separate from any browser).
protocol.registerSchemesAsPrivileged([{ scheme: "neonos", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } }]);
const ROOT = path.join(__dirname, "app");
const AUDIO = /\.(mp3|flac|wav|ogg|oga|opus|m4a|aac)$/i;
const MIME = { mp3: "audio/mpeg", flac: "audio/flac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac" };

let win = null, pending = [];
const filesFrom = argv => argv.slice(1).filter(a => AUDIO.test(a) && fs.existsSync(a));
function sendFiles(paths) {
  if (!paths.length) return;
  if (!win || win.webContents.isLoading()) { pending.push(...paths); return; }
  const list = paths.map(p => ({ name: path.basename(p), type: MIME[p.split(".").pop().toLowerCase()] || "", data: fs.readFileSync(p) }));
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
      if (p.endsWith("/")) p += "index.html";
      const file = path.normalize(path.join(SERVE, p));
      if (!file.startsWith(SERVE)) return new Response("Not found", { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
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
    // links to the web (source code, help) open in the normal browser
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
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
