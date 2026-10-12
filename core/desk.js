// Neon OS core: desktop picture
// A wallpaper picture is too big for localStorage, so it lives in its own small IndexedDB store.
const DB = "neon-os-desk", STORE = "kv";
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
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
export const getWallImage = () => tx("readonly", s => s.get("wall")).catch(() => null);
export const setWallImage = blob => tx("readwrite", s => s.put(blob, "wall"));
