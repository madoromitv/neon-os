// The small bridge between the desktop app and Neon OS: music files opened from the computer, the app version,
// and updates (updater.js): news of one, a look for one by hand, and restarting to use it.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("neonOsDesktop", {
  onOpenFiles: fn => ipcRenderer.on("open-files", (e, list) => fn(list)),
  version: () => ipcRenderer.invoke("version"),
  onUpdate: fn => ipcRenderer.on("update", (e, u) => fn(u)),
  updateInfo: () => ipcRenderer.invoke("update-info"),
  checkUpdates: () => ipcRenderer.invoke("check-updates"),
  restart: () => ipcRenderer.invoke("restart"),
  // the Browser app: where each tab has got to, back and forward, and links that open new windows
  browser: true,
  onFrameNav: fn => ipcRenderer.on("frame-nav", (e, d) => fn(d)),
  frameGo: (name, n) => ipcRenderer.invoke("frame-go", name, n),
  onOpenUrl: fn => ipcRenderer.on("open-url", (e, url) => fn(url)),
  openExternal: url => ipcRenderer.invoke("open-external", url),
});
