// Neon OS core: the Bin
// Songs, playlists and notes you delete wait here for 30 days, then go for good. The Bin app lists them and
// puts them back. What each kind needs to come back is kept in `data`.
const DB = "neon-os-bin", STORE = "items", DAYS = 30;
function open() {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function tx(mode, fn) {
  const db = await open();
  try { return await new Promise((res, rej) => { const t = db.transaction(STORE, mode), q = fn(t.objectStore(STORE)); t.oncomplete = () => res(q && q.result); t.onerror = t.onabort = () => rej(t.error); }); }
  finally { db.close(); }
}
const chan = "BroadcastChannel" in window ? new BroadcastChannel("neon-os:bin") : null;
const told = () => { if (chan) chan.postMessage("changed"); };
export const onBinChange = fn => { if (chan) chan.addEventListener("message", () => fn()); };
// kind: "song" | "playlist" | "note" | "photo"; data: what's needed to restore it
export async function binPut(kind, title, data, sub = "") {
  const item = { id: kind + ":" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind, title, sub, data, deletedAt: Date.now() };
  await tx("readwrite", s => s.put(item)); told(); return item;
}
export const binList = async () => ((await tx("readonly", s => s.getAll())) || []).sort((a, b) => b.deletedAt - a.deletedAt);
export async function binRemove(id) { await tx("readwrite", s => s.delete(id)); told(); }
export async function binEmpty() { await tx("readwrite", s => s.clear()); told(); }
export async function binPurge() { // older than 30 days: gone for good
  const old = (await binList()).filter(i => Date.now() - i.deletedAt > DAYS * 864e5);
  for (const i of old) await tx("readwrite", s => s.delete(i.id));
  if (old.length) told();
  return old.length;
}
export const daysLeft = i => Math.max(0, DAYS - Math.floor((Date.now() - i.deletedAt) / 864e5));
