// Neon OS core: sync through the music folder
// The library's details (titles, favourites, play counts, playlists, edited covers, Rack patterns and other
// settings) are kept in one small file, neon-os-library.json, inside a linked music folder. When that folder is
// shared between computers (Google Drive, Dropbox, OneDrive, or a drive carried between them), each computer
// merges the file with its own library. No accounts, no server.
//
// Merging is three-way: each computer remembers what the file said last time it synced (the "base"), so it can
// tell who changed what. A change on one side wins; if both changed the same thing, this computer wins, except
// play counts, which add up. Songs are matched by folder name and path, so the music must sit at the same place
// inside the shared folder on each computer. Songs copied into the browser (not linked) stay on that computer.
export const SYNC_FILE = "neon-os-library.json";
export const SYNC_KEYS = ["neon-os:theme", "neon-os:notes", "neon-os:notebook", "neon-os:calendar", "neon-os:pulse", "neon-os:drift", "neon-os:chop", "neon-os:tape"];
const FIELDS = ["title", "artist", "album", "genre", "year", "fav", "plays", "lastPlayed", "bpm", "duration", "loud", "peak", "cover"];
const CONF_KEY = "neon-os:sync";

// ---------- this computer's sync settings ----------
export function syncConf() { try { return JSON.parse(localStorage.getItem(CONF_KEY) || "null"); } catch (e) { return null; } }
export function setSyncConf(c) { try { if (c) localStorage.setItem(CONF_KEY, JSON.stringify(c)); else localStorage.removeItem(CONF_KEY); } catch (e) {} }
export function deviceId() {
  let c = syncConf() || {};
  if (!c.device) { c.device = "d" + Math.random().toString(36).slice(2, 10); setSyncConf(c); }
  return c.device;
}

// ---------- the base: what the file said after the last sync ----------
function db() {
  return new Promise((res, rej) => { const r = indexedDB.open("neon-os-sync", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function kv(mode, fn) {
  const d = await db();
  try { return await new Promise((res, rej) => { const t = d.transaction("kv", mode), q = fn(t.objectStore("kv")); t.oncomplete = () => res(q && q.result); t.onerror = t.onabort = () => rej(t.error); }); }
  finally { d.close(); }
}
export const loadBase = () => kv("readonly", s => s.get("base")).catch(() => null);
export const saveBase = data => kv("readwrite", s => s.put(data, "base"));
export const clearBase = () => kv("readwrite", s => s.delete("base")).catch(() => {});

// ---------- the file in the folder ----------
export async function readRemote(folder) {
  try {
    const fh = await folder.handle.getFileHandle(SYNC_FILE), f = await fh.getFile();
    const data = JSON.parse(await f.text());
    if (!data || data.format !== "neon-os-sync") return null;
    return { data, modified: f.lastModified };
  } catch (e) { return null; } // not there yet, or unreadable
}
export async function writeRemote(folder, data) {
  const fh = await folder.handle.getFileHandle(SYNC_FILE, { create: true }), w = await fh.createWritable();
  await w.write(JSON.stringify(data)); await w.close();
}

// ---------- turning the library into plain data and back ----------
// key: the song's place in the shared folder, e.g. "Music/K-Pop/Song.mp3"
export const trackKey = (t, folderName) => t.link && !t.blob ? `${folderName(t.link.folder)}/${t.link.path}` : null;
const blobToUrl = b => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(b); });
export const urlToBlob = async u => (await fetch(u)).blob();
const coverCache = new Map();

// tracks: the library's songs; playlists: its playlists; folderName(id): a linked folder's name
export async function snapshot(tracks, playlists, folderName) {
  const out = { tracks: {}, playlists: {}, settings: {} }, keyOf = new Map();
  for (const t of tracks) {
    const k = trackKey(t, folderName); if (!k) continue;
    keyOf.set(t.id, k);
    const r = {}; for (const f of FIELDS) if (f !== "cover" && t[f] != null && t[f] !== "") r[f] = t[f];
    if (t.coverEdited && t.coverBlob) { // only covers picked by hand travel; the rest come from each file's own tags
      const c = coverCache.get(t.id);
      if (c && c.blob === t.coverBlob) r.cover = c.url; else { const url = await blobToUrl(t.coverBlob); coverCache.set(t.id, { blob: t.coverBlob, url }); r.cover = url; }
    }
    out.tracks[k] = r;
  }
  for (const p of playlists) out.playlists[p.id] = { name: p.name, tracks: p.tracks.map(id => keyOf.get(id) || "copy:" + id) };
  for (const k of SYNC_KEYS) {
    let v = null; try { v = localStorage.getItem(k); } catch (e) {}
    if (v == null) continue;
    if (k === "neon-os:chop") { try { const c = JSON.parse(v); if (c.trackId) { c.trackKey = keyOf.get(c.trackId) || null; delete c.trackId; } v = JSON.stringify(c); } catch (e) {} }
    out.settings[k] = v;
  }
  return out;
}

// ---------- three-way merge ----------
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function mergeRecord(L, B = {}, R) {
  const out = {}, keys = new Set([...Object.keys(L), ...Object.keys(R)]);
  for (const f of keys) {
    const l = L[f], b = B[f], r = R[f];
    let v;
    if (same(l, b)) v = r; else if (same(r, b)) v = l;
    else if (f === "plays") v = (l || 0) + (r || 0) - (b || 0);              // played on both: count both
    else if (f === "lastPlayed") v = String(l || "") > String(r || "") ? l : r;
    else if (f === "tracks" && Array.isArray(l) && Array.isArray(r)) { // a playlist changed on both: keep both sets of edits
      const base = B.tracks || [], gone = new Set(base.filter(x => !r.includes(x)));
      v = [...l.filter(x => !gone.has(x)), ...r.filter(x => !base.includes(x) && !l.includes(x))];
    }
    else v = l; // both changed it: this computer wins
    if (v !== undefined && v !== null && v !== "") out[f] = v;
  }
  return out;
}
// one map (tracks, playlists or settings). A thing gone from one side and untouched on the other is deleted.
function mergeMap(L = {}, B = {}, R = {}, record) {
  const out = {}, keys = new Set([...Object.keys(L), ...Object.keys(R), ...Object.keys(B)]);
  for (const k of keys) {
    const l = L[k], b = B[k], r = R[k];
    if (l === undefined && r === undefined) continue;
    if (l === undefined) { if (b !== undefined && same(r, b)) continue; out[k] = r; continue; } // deleted here (or new there)
    if (r === undefined) { if (b !== undefined && same(l, b)) continue; out[k] = l; continue; } // deleted there (or new here)
    out[k] = record ? mergeRecord(l, b, r) : (same(l, b) ? r : l);
  }
  return out;
}
export function merge(local, base, remote) {
  base = base || { tracks: {}, playlists: {}, settings: {} };
  return {
    tracks: mergeMap(local.tracks, base.tracks, remote.tracks, true),
    playlists: mergeMap(local.playlists, base.playlists, remote.playlists, true),
    settings: mergeMap(local.settings, base.settings, remote.settings, false),
  };
}
// How many songs a merge would remove from this computer: used to stop a sync that looks like a mistake.
export const removals = (local, merged) => Object.keys(local.tracks).filter(k => !merged.tracks[k]).length;
// JSON with its keys in a fixed order, so the same data always gives the same text
export const stable = v => JSON.stringify(v, (k, x) => x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(n => [n, x[n]])) : x);
