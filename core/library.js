// Neon OS core: library views shared by every app
// One place decides what "Artists", "Albums", "Genres" and the smart playlists contain, so Amp, Files and Decks
// always agree. Everything works on a plain array of track records (as stored in the library).
export const nkey = s => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
const DAY = 864e5;
const byStr = k => (a, b) => (a[k] || "").localeCompare(b[k] || "", undefined, { sensitivity: "base" });

export const SMART = [
  { id: "recent", name: "Recently added", pick: ts => ts.filter(t => t.addedAt).sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt))).slice(0, 250) },
  { id: "fav", name: "Favourites", pick: ts => ts.filter(t => t.fav) },
  { id: "most", name: "Most played", pick: ts => ts.filter(t => t.plays).sort((a, b) => b.plays - a.plays).slice(0, 100) },
  { id: "lately", name: "Played lately", pick: ts => ts.filter(t => t.lastPlayed && Date.now() - Date.parse(t.lastPlayed) < 30 * DAY).sort((a, b) => String(b.lastPlayed).localeCompare(String(a.lastPlayed))) },
  { id: "never", name: "Never played", pick: ts => ts.filter(t => !t.plays) },
  { id: "b0", name: "Tempo under 100", pick: ts => ts.filter(t => t.bpm && t.bpm < 100) },
  { id: "b1", name: "Tempo 100–120", pick: ts => ts.filter(t => t.bpm >= 100 && t.bpm < 120) },
  { id: "b2", name: "Tempo 120–130", pick: ts => ts.filter(t => t.bpm >= 120 && t.bpm < 130) },
  { id: "b3", name: "Tempo 130–150", pick: ts => ts.filter(t => t.bpm >= 130 && t.bpm < 150) },
  { id: "b4", name: "Tempo 150 and up", pick: ts => ts.filter(t => t.bpm >= 150) },
];
export const smartById = id => SMART.find(x => x.id === id);

// artists, albums and genres from the songs' tags; each lists its songs' ids
export function buildGroups(tracks) {
  const artists = new Map(), albums = new Map(), genres = new Map();
  for (const t of tracks) {
    const ak = nkey(t.artist) || "~", a = artists.get(ak) || { key: ak, name: t.artist || "Unknown artist", songs: [], albums: new Set() };
    a.songs.push(t.id); if (t.album) a.albums.add(nkey(t.album)); artists.set(ak, a);
    if (t.album) {
      const bk = ak + "|" + nkey(t.album), b = albums.get(bk) || { key: bk, name: t.album, artist: t.artist || "Unknown artist", songs: [], cover: null };
      b.songs.push(t.id); if (!b.cover && t.coverUrl) b.cover = t.coverUrl; albums.set(bk, b);
    }
    if (t.genre) { const gk = nkey(t.genre), g = genres.get(gk) || { key: gk, name: t.genre, songs: [], artists: new Set() }; g.songs.push(t.id); g.artists.add(ak); genres.set(gk, g); }
  }
  const byName = byStr("name");
  return { artists: [...artists.values()].sort(byName), albums: [...albums.values()].sort(byName), genres: [...genres.values()].sort(byName) };
}
// songs in album order, for an artist or album view; genre views go artist, then album, then title
export const albumOrder = ts => ts.slice().sort((a, b) => byStr("album")(a, b) || byStr("title")(a, b));
export const genreOrder = ts => ts.slice().sort((a, b) => byStr("artist")(a, b) || byStr("album")(a, b) || byStr("title")(a, b));

// a view: { type: "all" | "pl" | "smart" | "artists" | "albums" | "genres" | "artist" | "album" | "genre", id?, key? }
export const isGroupView = v => v.type === "artists" || v.type === "albums" || v.type === "genres";
export function viewSongs(v, tracks, playlists, groups) {
  const byId = new Map(tracks.map(t => [t.id, t])), pick = ids => ids.map(id => byId.get(id)).filter(Boolean);
  if (v.type === "pl") { const p = playlists.find(x => x.id === v.id); return p ? pick(p.tracks) : []; }
  if (v.type === "smart") { const sm = smartById(v.id); return sm ? sm.pick(tracks.slice()) : []; }
  if (v.type === "artist") { const a = groups.artists.find(x => x.key === v.key); return a ? albumOrder(pick(a.songs)) : []; }
  if (v.type === "album") { const b = groups.albums.find(x => x.key === v.key); return b ? albumOrder(pick(b.songs)) : []; }
  if (v.type === "genre") { const g = groups.genres.find(x => x.key === v.key); return g ? genreOrder(pick(g.songs)) : []; }
  return tracks.slice();
}
export function viewGroups(v, groups) { return v.type === "artists" ? groups.artists : v.type === "albums" ? groups.albums : v.type === "genres" ? groups.genres : []; }
export function viewTitle(v, playlists, groups) {
  switch (v.type) {
    case "pl": { const p = playlists.find(x => x.id === v.id); return p ? p.name : "Playlist"; }
    case "smart": return (smartById(v.id) || {}).name || "Smart playlist";
    case "artists": return "Artists"; case "albums": return "Albums"; case "genres": return "Genres";
    case "artist": { const a = groups.artists.find(x => x.key === v.key); return a ? a.name : "Artist"; }
    case "album": { const b = groups.albums.find(x => x.key === v.key); return b ? `${b.name} · ${b.artist}` : "Album"; }
    case "genre": { const g = groups.genres.find(x => x.key === v.key); return g ? g.name : "Genre"; }
    default: return "All songs";
  }
}
// the next view down from a group row, and the way back up
export const openGroup = (v, key) => ({ type: v.type.slice(0, -1), key });
export const parentView = v => ({ type: v.type + "s" });
export const searchSongs = (ts, q) => { q = q.trim().toLowerCase(); return q ? ts.filter(t => [t.title, t.artist, t.album, t.genre].some(x => (x || "").toLowerCase().includes(q))) : ts; };
export const searchGroups = (gs, q) => { q = q.trim().toLowerCase(); return q ? gs.filter(g => g.name.toLowerCase().includes(q) || (g.artist || "").toLowerCase().includes(q)) : gs; };
// what a group row says under its name
export const groupNote = g => g.artist && g.cover !== undefined ? g.artist : g.albums ? `${g.albums.size} album${g.albums.size === 1 ? "" : "s"}` : `${g.artists.size} artist${g.artists.size === 1 ? "" : "s"}`;
