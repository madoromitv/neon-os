// Neon OS core: the library, saved in this browser (IndexedDB)
// Every app shares the same database, so songs added in one app appear in the others.
// A song is either copied in (blob) or read from a linked folder on disk (link); see linked.js.
import { fileOf } from "./linked.js";
export function makeLocalStore() {
  let idb = null;
  const tx = (store, mode, fn) => new Promise((res, rej) => {
    const t = idb.transaction(store, mode), rq = fn(t.objectStore(store));
    t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
  const id = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const st = {
    kind: "local", canWrite: false, tracks: [], playlists: [], audioCache: new Map(),
    async init() {
      idb = await new Promise(res => {
        try {
          const rq = indexedDB.open("neon-orbit-player", 1);
          rq.onupgradeneeded = () => { rq.result.createObjectStore("tracks", { keyPath: "id" }); rq.result.createObjectStore("playlists", { keyPath: "id" }); };
          rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null);
        } catch (e) { res(null); }
      });
      if (!idb) return;
      st.canWrite = true;
      try {
        const rows = await tx("tracks", "readonly", s => s.getAll());
        st.tracks = (rows || []).map(r => ({ ...r, coverUrl: r.coverBlob ? URL.createObjectURL(r.coverBlob) : null }));
        st.playlists = (await tx("playlists", "readonly", s => s.getAll())) || [];
      } catch (e) {}
    },
    async addTrack({ buf, blob, link, mime, meta, analysis, cover }) {
      // blob: the original file as-is (fast, nothing read into memory); buf: bytes already read; link: { folder, path } on disk
      const rec = { id: id("t"), ...meta, mime, blob: link ? null : blob || new Blob([buf], { type: mime }), link: link || null, analysis: analysis || null, coverBlob: cover || null, addedAt: new Date().toISOString() };
      await tx("tracks", "readwrite", s => s.put(rec));
      const t = { ...rec, coverUrl: cover ? URL.createObjectURL(cover) : null };
      st.tracks.push(t);
      return t;
    },
    async updateTrack(tid, patch) {
      const t = st.tracks.find(x => x.id === tid); if (!t) return;
      Object.assign(t, patch);
      const { coverUrl, ...rec } = t;
      await tx("tracks", "readwrite", s => s.put(rec));
    },
    async deleteTrack(t) {
      await tx("tracks", "readwrite", s => s.delete(t.id));
      st.tracks = st.tracks.filter(x => x.id !== t.id);
      const u = st.audioCache.get(t.id); if (u) { URL.revokeObjectURL(u); st.audioCache.delete(t.id); }
    },
    async audioUrl(t) {
      if (!st.audioCache.has(t.id)) st.audioCache.set(t.id, URL.createObjectURL(await fileOf(t)));
      return st.audioCache.get(t.id);
    },
    async audioBytes(t, ask = false) { return await (await fileOf(t, ask)).arrayBuffer(); },
    async analysis(t) { return t.analysis; },
    async createPlaylist(name) {
      const p = { id: id("p"), name, tracks: [], createdAt: new Date().toISOString() };
      await tx("playlists", "readwrite", s => s.put(p));
      st.playlists.push(p);
      return p;
    },
    async updatePlaylist(pid, patch) {
      const p = st.playlists.find(x => x.id === pid); if (!p) return;
      Object.assign(p, patch);
      await tx("playlists", "readwrite", s => s.put({ ...p }));
    },
    // a playlist made on another computer keeps its id, so both computers mean the same one (sync.js)
    async putPlaylist(p) {
      await tx("playlists", "readwrite", s => s.put({ ...p }));
      const i = st.playlists.findIndex(x => x.id === p.id); if (i >= 0) st.playlists[i] = { ...p }; else st.playlists.push({ ...p });
    },
    async deletePlaylist(pid) { await tx("playlists", "readwrite", s => s.delete(pid)); st.playlists = st.playlists.filter(x => x.id !== pid); },
  };
  return st;
}
