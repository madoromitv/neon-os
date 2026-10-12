// Neon OS core: pictures for the Photos app
// Two kinds of picture: ones added (copied into this browser) and ones in a linked folder on disk (read in place).
// Both live in one small IndexedDB: "pics" holds added pictures, "folders" holds linked folder handles.
const DB = "neon-os-photos";
export const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i;
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("pics", { keyPath: "id" }); r.result.createObjectStore("folders", { keyPath: "id" }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(store, mode, fn) {
  const db = await open();
  try { return await new Promise((res, rej) => { const t = db.transaction(store, mode), q = fn(t.objectStore(store)); t.oncomplete = () => res(q && q.result); t.onerror = t.onabort = () => rej(t.error); }); }
  finally { db.close(); }
}
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const listPics = async () => (await tx("pics", "readonly", s => s.getAll())) || [];
export async function addPic(file) { const p = { id: uid("i"), name: file.name, type: file.type, size: file.size, modified: file.lastModified || Date.now(), blob: file, addedAt: Date.now() }; await tx("pics", "readwrite", s => s.put(p)); return p; }
export const putPic = p => tx("pics", "readwrite", s => s.put(p));
export const removePic = id => tx("pics", "readwrite", s => s.delete(id));
export const listPicFolders = async () => (await tx("folders", "readonly", s => s.getAll())) || [];
export async function addPicFolder(handle) {
  const have = await listPicFolders();
  for (const f of have) { try { if (await f.handle.isSameEntry(handle)) return f; } catch (e) {} }
  const f = { id: uid("f"), name: handle.name, handle }; await tx("folders", "readwrite", s => s.put(f)); return f;
}
export const removePicFolder = id => tx("folders", "readwrite", s => s.delete(id));
export async function folderAccess(f, ask = false) {
  try { if (await f.handle.queryPermission({ mode: "read" }) === "granted") return true; return ask ? await f.handle.requestPermission({ mode: "read" }) === "granted" : false; } catch (e) { return false; }
}
// every picture in a folder and its subfolders (up to 6 deep), without reading the pictures themselves
export async function scanPicFolder(f, max = 5000) {
  const out = [];
  async function walk(dir, path, depth) {
    for await (const [name, h] of dir.entries()) {
      if (out.length >= max) return;
      if (h.kind === "file" && IMAGE_EXT.test(name)) out.push({ id: f.id + ":" + path + name, name, folder: f.id, folderName: f.name, path: path + name, handle: h });
      else if (h.kind === "directory" && depth < 6 && !name.startsWith(".")) await walk(h, path + name + "/", depth + 1);
    }
  }
  await walk(f.handle, "", 0);
  return out;
}
