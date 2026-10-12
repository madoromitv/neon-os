// Neon OS core: pictures for the Photos app
// Two kinds of picture: ones added (copied into this browser) and ones in a linked folder on disk (read in place).
// One small IndexedDB holds: "pics" (added pictures), "folders" (linked folder handles), "index" (each linked
// folder's list of pictures, so it opens without rescanning), and "thumbs" (small previews, made once).
const DB = "neon-os-photos";
export const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i;
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      const db = r.result, has = n => db.objectStoreNames.contains(n);
      if (!has("pics")) db.createObjectStore("pics", { keyPath: "id" });
      if (!has("folders")) db.createObjectStore("folders", { keyPath: "id" });
      if (!has("index")) db.createObjectStore("index", { keyPath: "id" });
      if (!has("thumbs")) db.createObjectStore("thumbs");
    };
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
export async function removePicFolder(id) { await tx("folders", "readwrite", s => s.delete(id)); await tx("index", "readwrite", s => s.delete(id)).catch(() => {}); }
export async function folderAccess(f, ask = false) {
  try { if (await f.handle.queryPermission({ mode: "read" }) === "granted") return true; return ask ? await f.handle.requestPermission({ mode: "read" }) === "granted" : false; } catch (e) { return false; }
}
// the remembered list of a linked folder's pictures: [{ path, name, modified, size }]
export const getFolderIndex = async id => ((await tx("index", "readonly", s => s.get(id)).catch(() => null)) || {}).entries || null;
export const setFolderIndex = (id, entries) => tx("index", "readwrite", s => s.put({ id, entries, at: Date.now() })).catch(() => {});
// every picture in a folder and its subfolders (up to 6 deep): names and handles only, nothing is read
export async function scanPicFolder(f, max = 50000) {
  const out = [];
  async function walk(dir, path, depth) {
    for await (const [name, h] of dir.entries()) {
      if (out.length >= max) return;
      if (h.kind === "file" && IMAGE_EXT.test(name)) out.push({ path: path + name, name, handle: h });
      else if (h.kind === "directory" && depth < 6 && !name.startsWith(".")) await walk(h, path + name + "/", depth + 1);
    }
  }
  await walk(f.handle, "", 0);
  return out;
}
// a file inside a linked folder, found again by its path
export async function fileAt(f, path) {
  const parts = path.split("/"); let dir = f.handle;
  for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
  return await (await dir.getFileHandle(parts[parts.length - 1])).getFile();
}
// previews: key = picture id + when it changed, so an edited picture gets a new one
export const allThumbs = async () => { const db = await open(); try { return await new Promise(res => { const out = new Map(), t = db.transaction("thumbs"), c = t.objectStore("thumbs").openCursor(); c.onsuccess = () => { const k = c.result; if (k) { out.set(k.key, k.value); k.continue(); } }; t.oncomplete = () => res(out); t.onerror = () => res(out); }); } finally { db.close(); } };
export const putThumb = (key, blob) => tx("thumbs", "readwrite", s => s.put(blob, key)).catch(() => {});
export const dropThumbs = keys => keys.length ? tx("thumbs", "readwrite", s => { for (const k of keys) s.delete(k); }).catch(() => {}) : null;
