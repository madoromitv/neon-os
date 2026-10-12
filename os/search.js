// Neon OS shell: search everywhere (Ctrl+K or Ctrl+Space)
// One box that finds apps, things to do (settings, backups, shortcuts), and the library: songs, artists, albums,
// genres and playlists. Enter opens or plays the highlighted result; arrows move; Esc closes.
import { esc } from "../style-kit/ui.js";
import { openDb, all } from "../core/backup.js";

const fold = s => (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
// 3: the name starts with it, 2: a word starts with it, 1: it's in there somewhere, 0: no match
function score(text, q) {
  const t = fold(text); if (!q) return 0;
  if (t.startsWith(q)) return 3;
  if (t.includes(" " + q) || t.includes("-" + q) || t.includes("(" + q)) return 2;
  return t.includes(q) ? 1 : 0;
}
const KIND = { app: "App", action: "Do", song: "Song", artist: "Artist", album: "Album", genre: "Genre", playlist: "Playlist" };
const LIMIT = { app: 5, action: 5, song: 8, artist: 4, album: 4, genre: 3, playlist: 4 };

let opts = null, box = null, results = [], sel = 0, lib = null, libAt = 0;
async function library() {
  if (lib && Date.now() - libAt < 20000) return lib;
  try {
    const db = await openDb(); const tracks = await all(db, "tracks"), playlists = await all(db, "playlists"); db.close();
    const songs = tracks.map(t => ({ id: t.id, title: t.title || "", artist: t.artist || "", album: t.album || "", genre: t.genre || "", added: t.addedAt || "" }));
    const group = key => { const m = new Map(); for (const s of songs) { const v = s[key].trim(); if (!v) continue; const k = fold(v); if (!m.has(k)) m.set(k, { name: v, ids: [], artist: s.artist }); m.get(k).ids.push(s.id); } return [...m.values()]; };
    lib = { songs, artists: group("artist"), albums: group("album"), genres: group("genre"), playlists: playlists.map(p => ({ id: p.id, name: p.name, ids: p.tracks })) };
  } catch (e) { lib = { songs: [], artists: [], albums: [], genres: [], playlists: [] }; }
  libAt = Date.now();
  return lib;
}

function find(q) {
  q = fold(q.trim());
  // the name may match anywhere; the extra words (descriptions, artists, albums) only from the start of a word
  const rank = texts => Math.max(score(texts[0], q), ...texts.slice(1).map(t => { const v = score(t, q); return v >= 2 ? v - 1 : 0; }));
  const groups = [], add = (kind, items) => { const hits = items.map(it => ({ ...it, kind, s: rank(it.texts) })).filter(h => h.s > 0).sort((a, b) => b.s - a.s || a.title.localeCompare(b.title)); if (hits.length) groups.push(hits.slice(0, LIMIT[kind])); };
  if (!q) { // nothing typed yet: the apps, then a few things to do
    return [...opts.apps.map(a => ({ kind: "app", title: a.name, sub: a.desc, run: () => opts.openApp(a.id) })), ...opts.actions.slice(0, 4).map(a => ({ kind: "action", ...a }))];
  }
  add("app", opts.apps.map(a => ({ title: a.name, sub: a.desc, texts: [a.name, a.desc], run: () => opts.openApp(a.id) })));
  add("action", opts.actions.map(a => ({ ...a, texts: [a.title, ...(a.words || [])] })));
  if (lib) {
    add("song", lib.songs.map(s => ({ title: s.title, sub: [s.artist, s.album].filter(Boolean).join(" · "), texts: [s.title, s.artist, s.album], run: () => opts.play([s.id]) })));
    add("artist", lib.artists.map(g => ({ title: g.name, sub: `${g.ids.length} song${g.ids.length === 1 ? "" : "s"} · play all`, texts: [g.name], run: () => opts.play(g.ids) })));
    add("album", lib.albums.map(g => ({ title: g.name, sub: `${g.artist ? g.artist + " · " : ""}${g.ids.length} song${g.ids.length === 1 ? "" : "s"}`, texts: [g.name], run: () => opts.play(g.ids) })));
    add("genre", lib.genres.map(g => ({ title: g.name, sub: `${g.ids.length} song${g.ids.length === 1 ? "" : "s"} · play all`, texts: [g.name], run: () => opts.play(g.ids) })));
    add("playlist", lib.playlists.map(p => ({ title: p.name, sub: `${p.ids.length} song${p.ids.length === 1 ? "" : "s"} · play`, texts: [p.name], run: () => opts.play(p.ids) })));
  }
  // the group with the best match comes first (apps before things to do before the library when equal)
  return groups.map((g, i) => ({ g, i })).sort((a, b) => b.g[0].s - a.g[0].s || a.i - b.i).flatMap(x => x.g);
}

function draw() {
  const q = box.querySelector("input").value;
  results = find(q); sel = Math.min(sel, Math.max(0, results.length - 1));
  let last = "";
  box.querySelector(".sresults").innerHTML = results.length ? results.map((r, i) => {
    const head = r.kind !== last ? `<div class="shead lbl">${KIND[r.kind]}${r.kind === "song" ? "s" : r.kind === "action" ? "" : "s"}</div>` : ""; last = r.kind;
    return `${head}<div class="sitem${i === sel ? " sel" : ""}" role="option" id="sr-${i}" aria-selected="${i === sel}" data-i="${i}"><b>${esc(r.title)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</div>`;
  }).join("") : `<p class="snone">Nothing matches “${esc(q.trim())}”.</p>`;
  box.querySelector("input").setAttribute("aria-activedescendant", results.length ? "sr-" + sel : "");
  const s = box.querySelector(".sitem.sel"); if (s) s.scrollIntoView({ block: "nearest" });
}
function run(i) { const r = results[i]; if (!r) return; closeSearch(); r.run(); }
export function closeSearch() { if (!box) return; box.remove(); box = null; if (opts.onClose) opts.onClose(); }
export function openSearch() {
  if (box) { box.querySelector("input").select(); return; }
  box = document.createElement("div"); box.className = "scrim sscrim";
  box.innerHTML = `<div class="win lit search" role="dialog" aria-label="Search everywhere">
    <div class="wbody"><label class="sbox"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4a6 6 0 0 1 4.8 9.6l4.8 4.8-1.4 1.4-4.8-4.8A6 6 0 1 1 10 4zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg>
      <input type="search" placeholder="Search apps, songs, artists, playlists, settings" aria-label="Search everywhere" role="combobox" aria-expanded="true" aria-controls="sresults" autocomplete="off"></label>
      <div class="sresults" id="sresults" role="listbox"></div>
      <p class="shint">Enter opens or plays · ↑ ↓ to move · Esc to close</p></div></div>`;
  document.body.appendChild(box);
  const input = box.querySelector("input");
  input.addEventListener("input", () => { sel = 0; draw(); });
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + results.length) % Math.max(1, results.length); draw(); }
    else if (e.key === "Enter") { e.preventDefault(); run(sel); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeSearch(); }
  });
  box.addEventListener("mousedown", e => { if (e.target === box) closeSearch(); });
  box.querySelector(".sresults").addEventListener("click", e => { const it = e.target.closest("[data-i]"); if (it) run(+it.dataset.i); });
  sel = 0; draw(); input.focus();
  library().then(() => { if (box) draw(); });
}
// apps: [{ id, name, desc }], actions: [{ title, sub, words, run }], openApp(id), play(ids)
export function initSearch(o) { opts = o; }
