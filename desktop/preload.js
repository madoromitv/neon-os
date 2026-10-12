// The small bridge between the desktop app and Neon OS: music files opened from the computer, and the app version.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("neonOsDesktop", {
  onOpenFiles: fn => ipcRenderer.on("open-files", (e, list) => fn(list)),
  version: () => ipcRenderer.invoke("version"),
});
