// Neon OS core: back up and restore everything in one file, plus the shared library helpers apps use
// A backup holds the library (songs, cover art, beat analysis), playlists, listening history, notes and settings.
// File layout: "NEONOS01" (8 bytes) · header length (4 bytes) · header JSON · song and cover data, one after another.
// The header lists each song with where its audio and cover sit in the data section, so restoring never has to
// load the whole file into memory.
const MAGIC = "NEONOS01", DB = "neon-orbit-player";
// Everything Neon OS keeps in this browser's settings storage goes in a backup: notes, theme, Amp, the Rack apps'
// patterns and effects, desktop icons and window layout. Only this browser's own housekeeping is left out.
const SKIP = new Set(["neon-os:offline", "neon-os:gl", "neon-os:sync", "neon-os:seen-version"]);
const keepKey = k => (k.startsWith("neon-os:") || k === "neon-orbit-amp") && !SKIP.has(k);

export function openDb() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => { rq.result.createObjectStore("tracks", { keyPath: "id" }); rq.result.createObjectStore("playlists", { keyPath: "id" }); };
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
}
export const all = (db, store) => new Promise((res, rej) => { const rq = db.transaction(store).objectStore(store).getAll(); rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error); });
export const put = (db, store, rec) => new Promise((res, rej) => { const t = db.transaction(store, "readwrite"); t.objectStore(store).put(rec); t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });

// What's in this browser right now: song count, playlist count, bytes of audio stored here,
// and how many songs are copied in versus read from a linked folder.
export async function librarySummary() {
  const db = await openDb();
  const tracks = await all(db, "tracks"), playlists = await all(db, "playlists");
  db.close();
  const copied = tracks.filter(t => t.blob);
  return { songs: tracks.length, playlists: playlists.length, copied: copied.length, linked: tracks.length - copied.length,
    copiedBytes: copied.reduce((n, t) => n + t.blob.size, 0),
    bytes: tracks.reduce((n, t) => n + (t.blob ? t.blob.size : 0) + (t.coverBlob ? t.coverBlob.size : 0), 0) };
}

// Builds the backup file. Returns a Blob ready to download.
export async function exportBackup() {
  const db = await openDb();
  const tracks = await all(db, "tracks"), playlists = await all(db, "playlists");
  db.close();
  const parts = [], meta = [];
  let off = 0;
  const add = blob => { if (!blob) return null; const r = { off, len: blob.size, type: blob.type || "" }; parts.push(blob); off += blob.size; return r; };
  for (const t of tracks) {
    const { blob, coverBlob, coverUrl, ...rest } = t; void coverUrl;
    meta.push({ ...rest, audio: add(blob), cover: add(coverBlob) });
  }
  const settings = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (keepKey(k)) settings[k] = localStorage.getItem(k); } } catch (e) {}
  // the desktop picture, if there is one
  let wall = null; try { const { getWallImage } = await import("./desk.js"); const b = await getWallImage(); if (b) wall = add(b); } catch (e) {}
  let history = []; try { history = (await (await import("./history.js")).playsSince(0)).map(({ id, ...r }) => (void id, r)); } catch (e) {}
  const header = new TextEncoder().encode(JSON.stringify({ version: 1, created: new Date().toISOString(), tracks: meta, playlists, settings, wall, history }));
  const len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, header.length);
  return new Blob([MAGIC, len, header, ...parts], { type: "application/octet-stream" });
}

// Restores a backup file. Songs and playlists are added (same song again replaces itself, nothing else is deleted);
// notes and settings are replaced. Returns what was restored.
export async function importBackup(file, onProgress = () => {}) {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (new TextDecoder().decode(head.slice(0, 8)) !== MAGIC) throw new Error("not_backup");
  const hlen = new DataView(head.buffer).getUint32(8);
  const header = JSON.parse(new TextDecoder().decode(await file.slice(12, 12 + hlen).arrayBuffer()));
  const base = 12 + hlen, slice = r => r ? file.slice(base + r.off, base + r.off + r.len, r.type) : null;
  const db = await openDb();
  let i = 0;
  for (const t of header.tracks || []) {
    const { audio, cover, ...rest } = t;
    // copy the bytes out of the file so the restored song doesn't depend on the backup file staying put
    const blob = audio ? new Blob([await slice(audio).arrayBuffer()], { type: audio.type || rest.mime || "audio/mpeg" }) : null;
    const coverBlob = cover ? new Blob([await slice(cover).arrayBuffer()], { type: cover.type || "image/jpeg" }) : null;
    // linked songs carry no audio: they come back as entries that play again once their folder is linked here
    if (blob || rest.link) await put(db, "tracks", { ...rest, blob, coverBlob });
    onProgress(++i / Math.max(1, header.tracks.length));
  }
  for (const p of header.playlists || []) await put(db, "playlists", p);
  db.close();
  for (const [k, v] of Object.entries(header.settings || {})) { if (!keepKey(k)) continue; try { localStorage.setItem(k, v); } catch (e) {} }
  if (header.history) { try { await (await import("./history.js")).restoreHistory(header.history); } catch (e) {} }
  if (header.wall) { try { const { setWallImage } = await import("./desk.js"); await setWallImage(new Blob([await slice(header.wall).arrayBuffer()], { type: header.wall.type || "image/jpeg" })); } catch (e) {} }
  notifyLibraryChange("restore");
  return { songs: (header.tracks || []).length, playlists: (header.playlists || []).length, created: header.created };
}

export const del = (db, store, key) => new Promise((res, rej) => { const t = db.transaction(store, "readwrite"); t.objectStore(store).delete(key); t.oncomplete = res; t.onerror = () => rej(t.error); });

// Tells every open app the library changed. reason: "restore" (a backup), "add", "edit" or "delete".
export function notifyLibraryChange(reason = "edit") {
  if (!("BroadcastChannel" in window)) return;
  const c = new BroadcastChannel("neon-os:library"); c.postMessage({ type: "changed", reason }); c.close();
}
// Calls fn(reason) when another window changes the library, so open apps can reload it.
export function onLibraryChange(fn) {
  if (!("BroadcastChannel" in window)) return;
  new BroadcastChannel("neon-os:library").addEventListener("message", e => { if (e.data && e.data.type === "changed") fn(e.data.reason); });
}
