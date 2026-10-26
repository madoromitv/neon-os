// Neon OS core: listening history
// One row for every song played (counted the way play counts are: past half the song or 30 seconds), with when,
// for how long, and the song's details at the time, so stats by week, month and year still work after a song is
// renamed or deleted. Kept in its own small IndexedDB ("neon-os-history").
const DB = "neon-os-history";
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { const s = r.result.createObjectStore("plays", { keyPath: "id", autoIncrement: true }); s.createIndex("at", "at"); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  try { return await new Promise((res, rej) => { const t = db.transaction("plays", mode), q = fn(t.objectStore("plays")); t.oncomplete = () => res(q && q.result); t.onerror = t.onabort = () => rej(t.error); }); }
  finally { db.close(); }
}
const chan = "BroadcastChannel" in window ? new BroadcastChannel("neon-os:history") : null;
// t: a track record; secs: how long it played
export async function logPlay(t, secs) {
  const row = { at: Date.now(), track: t.id, title: t.title || "Untitled", artist: t.artist || "", album: t.album || "", genre: t.genre || "", secs: Math.round(secs || t.duration || 0) };
  await tx("readwrite", s => s.add(row)).catch(() => {});
  if (chan) chan.postMessage(row);
  dispatchEvent(new CustomEvent("neonos:played", { detail: row }));
  return row;
}
// every play from `from` (ms) on, oldest first
export const playsSince = async (from = 0) => (await tx("readonly", s => s.index("at").getAll(IDBKeyRange.lowerBound(from))).catch(() => [])) || [];
export const firstPlay = async () => { const all = await playsSince(0); return all.length ? all[0].at : null; };
export function onPlayed(fn) { if (chan) chan.addEventListener("message", e => fn(e.data)); addEventListener("neonos:played", e => fn(e.detail)); }
export const clearHistory = () => tx("readwrite", s => s.clear());
// backups: every play goes in; restoring adds the ones this browser doesn't have yet (same moment, same song)
export async function restoreHistory(rows) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  const have = new Set((await playsSince(0)).map(r => r.at + "|" + r.track)), add = rows.filter(r => r && r.at && !have.has(r.at + "|" + r.track));
  if (add.length) await tx("readwrite", s => { for (const { id, ...r } of add) { void id; s.add(r); } });
  return add.length;
}
