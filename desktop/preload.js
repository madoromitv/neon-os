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
});
