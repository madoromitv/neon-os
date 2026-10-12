// Neon OS core: linked music folders
// Instead of copying songs into the browser, a linked folder is read straight from your disk, so the library
// takes no space and songs added to the folder later are found with a rescan. Chrome and Edge can do this
// (the File System Access API); other browsers copy songs in as before.
// A linked song is stored as { link: { folder, path } } with no blob. fileOf(track) returns its audio either way.
const DB = "neon-os-links", STORE = "folders";
export const linkSupported = typeof window !== "undefined" && "showDirectoryPicker" in window;
export const AUDIO_EXT = /\.(mp3|flac|wav|ogg|oga|m4a|aac|opus|webm)$/i;

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  try {
    return await new Promise((res, rej) => {
      const t = db.transaction(STORE, mode), q = fn(t.objectStore(STORE));
      t.oncomplete = () => res(q && q.result); t.onerror = t.onabort = () => rej(t.error);
    });
  } finally { db.close(); }
}

let folders = null; // cached list: { id, name, handle, addedAt }
export async function listFolders(fresh = false) {
  if (!folders || fresh) { try { folders = (await tx("readonly", s => s.getAll())) || []; } catch (e) { folders = []; } }
  return folders;
}
export async function folderById(id) { return (await listFolders()).find(f => f.id === id) || null; }

// Saves a folder the person picked (the same folder picked twice is kept once). Returns its record.
export async function saveFolder(handle) {
  for (const f of await listFolders(true)) { try { if (await f.handle.isSameEntry(handle)) return f; } catch (e) {} }
  const rec = { id: "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: handle.name, handle, addedAt: new Date().toISOString() };
  await tx("readwrite", s => s.put(rec));
  folders = null;
  return rec;
}
export async function removeFolder(id) { await tx("readwrite", s => s.delete(id)); folders = null; fileCache.clear(); }

// The browser asks once per visit (or remembers, if the person picks "Allow on every visit").
// ask: true may show the browser's prompt, which only works straight after a click.
// mode "readwrite" is only asked for the folder that holds the sync file (see sync.js).
export async function hasAccess(folder, ask = false, mode = "read") {
  const h = folder && folder.handle; if (!h || !h.queryPermission) return false;
  try {
    if (await h.queryPermission({ mode }) === "granted") return true;
    return ask && await h.requestPermission({ mode }) === "granted";
  } catch (e) { return false; }
}
let writeFolderId = null; // the folder Neon OS may write its sync file into
export const setWriteFolder = id => { writeFolderId = id; };
// Folders that need the person to say yes again before their songs can play.
export async function foldersNeedingAccess() {
  const out = [];
  for (const f of await listFolders()) if (!(await hasAccess(f, false, f.id === writeFolderId ? "readwrite" : "read"))) out.push(f);
  return out;
}
export async function reconnectAll() {
  let ok = true;
  for (const f of await listFolders()) if (!(await hasAccess(f, true, f.id === writeFolderId ? "readwrite" : "read"))) ok = false;
  return ok;
}

const fileCache = new Map(); // "folder/path" -> FileSystemFileHandle
async function handleFor(folder, path) {
  const key = folder.id + "/" + path;
  if (fileCache.has(key)) return fileCache.get(key);
  let dir = folder.handle; const parts = path.split("/");
  for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
  const fh = await dir.getFileHandle(parts[parts.length - 1]);
  fileCache.set(key, fh);
  if (fileCache.size > 4000) fileCache.delete(fileCache.keys().next().value);
  return fh;
}
const err = code => Object.assign(new Error(code), { code });

// The song's audio as a Blob/File. Throws "needs_permission" (ask again after a click) or "missing" (moved or deleted).
export async function fileOf(t, ask = false) {
  if (t.blob) return t.blob;
  if (!t.link) throw err("missing");
  const folder = await folderById(t.link.folder);
  if (!folder) throw err("missing");
  if (!(await hasAccess(folder, ask))) throw err("needs_permission");
  try { return await (await handleFor(folder, t.link.path)).getFile(); }
  catch (e) {
    fileCache.delete(folder.id + "/" + t.link.path);
    if (e && e.name === "NotAllowedError") throw err("needs_permission");
    throw err("missing");
  }
}
export const isLinked = t => !t.blob && !!t.link;

// Every music file in a folder and the folders inside it: [{ path, handle }]. onProgress(count) while searching.
export async function scanFolder(folder, onProgress = () => {}) {
  const out = [];
  const walk = async (dir, prefix) => {
    for await (const [name, h] of dir.entries()) {
      if (name.startsWith(".")) continue;
      if (h.kind === "directory") await walk(h, prefix + name + "/");
      else if (AUDIO_EXT.test(name)) { out.push({ path: prefix + name, handle: h }); fileCache.set(folder.id + "/" + prefix + name, h); if (out.length % 50 === 0) onProgress(out.length); }
    }
  };
  await walk(folder.handle, "");
  onProgress(out.length);
  return out;
}
