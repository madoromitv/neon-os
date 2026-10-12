// Neon Orbit Amp: the player app of Neon OS
import { icon } from "../../style-kit/icons.js";
import { esc, clamp, toast, dialog, choose, openMenu, closePop, Slider } from "../../style-kit/ui.js";
import { Eng } from "../../core/engine.js";
import { analyseSamples, decodeToMono } from "../../core/analysis.js";
import { readTags, titleFromName, shrinkCover } from "../../core/tags.js";
import { makeLocalStore } from "../../core/storage.js";
import { createAnalyser } from "../../core/analyser.js";
import { SMART, smartById, buildGroups, albumOrder, viewSongs, viewGroups, viewTitle as libTitle, searchGroups, groupNote, nkey } from "../../core/library.js";
import { getTheme, setTheme, onTheme, applyTheme } from "../../core/theme.js";
import { notify } from "../../core/notify.js";
import { createGlow, createGlow2D } from "../../core/glow.js";
import { fileOf, linkSupported, listFolders, saveFolder, removeFolder, scanFolder, foldersNeedingAccess, reconnectAll, hasAccess } from "../../core/linked.js";
import { onLibraryChange, notifyLibraryChange } from "../../core/backup.js";
void closePop;

const $ = id => document.getElementById(id);
const body = document.body;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const fmt2 = s => { s = Math.max(0, Math.floor(s || 0)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
function decode(b64) { const s = atob(b64), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }

const obsM = /^#obs(?:-(pl-)?(\d+))?$/.exec(location.hash);
const OBS = !!obsM;
if (OBS) body.classList.add("obs");

const embedded = id => { const el = document.getElementById(id); return el ? el.textContent.trim() : null; };
// Songs that ship with the app. None in the public repo: the library is whatever you add.
const BUILTINS = [];
const BAND_NAMES = ["Kick", "Bass", "Body", "Lead", "Snare", "Hats"];
const COLORS = { violet: [160, 102, 255], magenta: [255, 61, 232], cyan: [63, 242, 255] };
const EQ_LABELS = ["60", "170", "310", "600", "1K", "3K", "6K", "12K", "14K", "16K"];
const PRESETS = {
  "Flat": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "Drum & bass": [8, 6, 2, -1, -2, 0, 2, 4, 5, 5],
  "Bass boost": [7, 6, 4, 2, 0, 0, 0, 0, 0, 0],
  "Treble boost": [0, 0, 0, 0, 0, 2, 5, 7, 8, 8],
  "Bass & treble": [6, 5, 0, -4, -3, 1, 5, 7, 8, 8],
  "Dance": [6, 4, 1, 0, 0, -3, -4, -4, 0, 0],
  "Club": [0, 0, 5, 3, 3, 3, 2, 0, 0, 0],
  "Rock": [5, 3, -3, -5, -2, 2, 5, 6, 6, 6],
  "Pop": [-1, 3, 5, 5, 3, 0, -1, -1, -1, -1],
  "Vocal": [-2, -3, -3, 1, 4, 4, 3, 1, 0, -2],
  "Laptop speakers": [3, 7, 3, -2, -1, 1, 3, 6, 8, 9],
};

// ---------- settings (per viewer) ----------
const SKEY = "neon-orbit-amp";
let S = { color: "cyan", chaos: 0.7, vol: 0.8, bal: 0, eqOn: true, pre: 0, bands: PRESETS.Flat.slice(), shuffle: false, repeat: "off",
  pl: [], cur: -1, pos: 0, remain: false, mini: "spec", shade: {}, show: { eq: true, pl: true, vis: true, ml: true } };
try { const s = JSON.parse(localStorage.getItem(SKEY) || "{}"); Object.assign(S, s); S.show = Object.assign({ eq: true, pl: true, vis: true, ml: true }, s.show || {}); } catch (e) {}
const isHex = v => /^#[0-9a-f]{6}$/i.test(v);
S.color = getTheme().ball; // the orb colour is shared across Neon OS
if (!COLORS[S.color] && !isHex(S.color)) S.color = "cyan";
if (!Array.isArray(S.bands) || S.bands.length !== 10) S.bands = PRESETS.Flat.slice();
let saveT = null;
function save() {
  if (OBS) return;
  clearTimeout(saveT);
  saveT = setTimeout(() => { S.pl = pl; S.cur = cur; S.pos = Eng.time(); try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) {} }, 250);
}

// ---------- library ----------
let store = { kind: "none", canWrite: false, tracks: [], playlists: [] };
let storeReady = false;
const library = () => [...BUILTINS, ...store.tracks];
const byId = id => BUILTINS.find(t => t.id === id) || store.tracks.find(t => t.id === id) || null;
const plById = id => store.playlists.find(p => p.id === id) || null;
const playlistsSorted = () => store.playlists.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

// ---------- playlist editor state ----------
let pl = [], cur = -1, plSel = new Set(), plAnchor = -1;
let history = [];
const curTrack = () => cur >= 0 && cur < pl.length ? byId(pl[cur]) : null;
const plLabel = (t, i) => `${i + 1}. ${t.artist ? t.artist + " - " : ""}${t.title}`;

function renderPl() {
  const el = $("plList");
  if (!pl.length) {
    el.innerHTML = `<div class="pl-empty">The playlist is empty.<br>Double-click a song in the library, or use ADD.</div>`;
  } else {
    el.innerHTML = pl.map((id, i) => {
      const t = byId(id); if (!t) return "";
      return `<div class="pl-row${i === cur ? " cur" : ""}${plSel.has(i) ? " sel" : ""}" role="option" aria-selected="${plSel.has(i)}" data-i="${i}" draggable="true"><span class="t">${esc(plLabel(t, i))}</span><span>${fmt(t.duration)}</span></div>`;
    }).join("");
  }
  const total = pl.reduce((s, id) => s + ((byId(id) || {}).duration || 0), 0);
  plTotal = total;
  updatePlTime();
}
let plTotal = 0;
function updatePlTime() {
  const t = curTrack();
  $("plTime").textContent = `${t ? fmt(Eng.time()) : "0:00"}/${fmt(plTotal)}`;
}
function setPl(ids, startIdx) { pl = ids.slice(); cur = startIdx == null ? -1 : startIdx; plSel.clear(); history = []; renderPl(); save(); }
function enqueue(ids) { pl.push(...ids); renderPl(); save(); }
function removePlIdx(idxs) {
  const set = new Set(idxs); if (!set.size) return;
  const wasCur = set.has(cur);
  const curId = pl[cur];
  let newCur = cur;
  pl = pl.filter((_, i) => !set.has(i));
  if (wasCur) { newCur = -1; stop(); unloadTrack(); }
  else if (cur >= 0) newCur = cur - [...set].filter(i => i < cur).length;
  cur = newCur; plSel.clear(); history = [];
  renderPl(); renderMl(); save();
  void curId;
}
$("plList").addEventListener("click", e => {
  const row = e.target.closest(".pl-row"); if (!row) return;
  const i = +row.dataset.i;
  if (e.shiftKey && plAnchor >= 0) { plSel.clear(); for (let k = Math.min(plAnchor, i); k <= Math.max(plAnchor, i); k++) plSel.add(k); }
  else if (e.ctrlKey || e.metaKey) { plSel.has(i) ? plSel.delete(i) : plSel.add(i); plAnchor = i; }
  else { plSel = new Set([i]); plAnchor = i; }
  syncPlSel();
});
function syncPlSel() { document.querySelectorAll("#plList .pl-row").forEach(r => { const on = plSel.has(+r.dataset.i); r.classList.toggle("sel", on); r.setAttribute("aria-selected", String(on)); }); }
$("plList").addEventListener("dblclick", e => { const row = e.target.closest(".pl-row"); if (!row) return; Eng.ensure(); playIndex(+row.dataset.i); });
$("plList").addEventListener("keydown", e => {
  if (!pl.length) return;
  const last = plAnchor >= 0 ? plAnchor : (cur >= 0 ? cur : -1);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    const i = clamp(last + (e.key === "ArrowDown" ? 1 : -1), 0, pl.length - 1);
    plSel = new Set([i]); plAnchor = i; renderPl();
    const r = $("plList").querySelector(`[data-i="${i}"]`); if (r) r.scrollIntoView({ block: "nearest" });
    e.preventDefault(); e.stopPropagation();
  } else if (e.key === "Enter" && last >= 0) { Eng.ensure(); playIndex(last); e.preventDefault(); }
  else if (e.key === "Delete" || e.key === "Backspace") { removePlIdx([...plSel]); e.preventDefault(); }
  else if ((e.key === "a" || e.key === "A") && (e.ctrlKey || e.metaKey)) { plSel = new Set(pl.map((_, i) => i)); renderPl(); e.preventDefault(); }
});
$("plList").addEventListener("contextmenu", e => {
  const row = e.target.closest(".pl-row"); if (!row) return;
  e.preventDefault();
  const i = +row.dataset.i; if (!plSel.has(i)) { plSel = new Set([i]); plAnchor = i; renderPl(); }
  const t = byId(pl[i]);
  openMenu(null, [
    { text: "Play", run: () => { Eng.ensure(); playIndex(i); } },
    { text: "Remove from playlist", key: "Del", run: () => removePlIdx([...plSel]) },
    "-",
    ...sendToItems([...plSel].map(k => pl[k])),
    ...(t && !t.builtin && store.canWrite ? ["-", { text: "Edit details", run: () => editTrack(t) }] : []),
  ], { x: e.clientX, y: e.clientY });
});
// drag to reorder
let dragFrom = null;
$("plList").addEventListener("dragstart", e => { const r = e.target.closest(".pl-row"); if (!r) return; dragFrom = +r.dataset.i; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", "pl"); });
$("plList").addEventListener("dragover", e => { if (dragFrom == null) return; const r = e.target.closest(".pl-row"); if (!r) return; e.preventDefault(); document.querySelectorAll(".drop-before").forEach(x => x.classList.remove("drop-before")); r.classList.add("drop-before"); });
$("plList").addEventListener("drop", e => {
  if (dragFrom == null) return; e.preventDefault(); e.stopPropagation();
  const r = e.target.closest(".pl-row"); if (!r) { dragFrom = null; return; }
  let to = +r.dataset.i; const from = dragFrom; dragFrom = null;
  if (to === from) { renderPl(); return; }
  const curId = cur;
  const [id] = pl.splice(from, 1); if (to > from) to--; pl.splice(to, 0, id);
  if (curId === from) cur = to; else if (from < curId && to >= curId) cur--; else if (from > curId && to <= curId) cur++;
  plSel = new Set([to]); history = []; renderPl(); save();
});
$("plList").addEventListener("dragend", () => { dragFrom = null; document.querySelectorAll(".drop-before").forEach(x => x.classList.remove("drop-before")); });

// playlist editor bottom buttons
$("plAdd").addEventListener("click", e => openMenu(e.currentTarget, [
  { text: "Add selected library songs", disabled: !mlSel.size, run: () => enqueue([...mlSel]) },
  { text: "Add everything in this library view", run: () => enqueue(mlVisible()) },
  { text: "Add files from your computer", disabled: !store.canWrite, key: "L", run: () => $("fileIn").click() },
  { text: "Add a folder (searches inside)", disabled: !store.canWrite, run: () => $("folderIn").click() },
  ...(linkSupported ? [{ text: "Link a music folder", disabled: !store.canWrite, run: () => linkFolder() }] : []),
]));
$("plRem").addEventListener("click", e => openMenu(e.currentTarget, [
  { text: "Remove selected", disabled: !plSel.size, key: "Del", run: () => removePlIdx([...plSel]) },
  { text: "Crop (keep selected)", disabled: !plSel.size, run: () => removePlIdx(pl.map((_, i) => i).filter(i => !plSel.has(i))) },
  { text: "Remove all", disabled: !pl.length, run: () => removePlIdx(pl.map((_, i) => i)) },
]));
$("plSel").addEventListener("click", e => openMenu(e.currentTarget, [
  { text: "Select all", run: () => { plSel = new Set(pl.map((_, i) => i)); renderPl(); } },
  { text: "Select none", run: () => { plSel.clear(); renderPl(); } },
  { text: "Invert selection", run: () => { plSel = new Set(pl.map((_, i) => i).filter(i => !plSel.has(i))); renderPl(); } },
]));
function reorderPl(fn) {
  const curId = pl[cur];
  const items = pl.map((id, i) => ({ id, i }));
  const out = fn(items);
  pl = out.map(x => x.id); cur = cur >= 0 ? out.findIndex(x => x.i === cur) : -1; void curId;
  plSel.clear(); history = []; renderPl(); save();
}
$("plMisc").addEventListener("click", e => openMenu(e.currentTarget, [
  { label: "Sort list" },
  { text: "By title", run: () => reorderPl(a => a.slice().sort((x, y) => byId(x.id).title.localeCompare(byId(y.id).title))) },
  { text: "By artist", run: () => reorderPl(a => a.slice().sort((x, y) => (byId(x.id).artist || "").localeCompare(byId(y.id).artist || "") || byId(x.id).title.localeCompare(byId(y.id).title))) },
  { text: "By BPM", run: () => reorderPl(a => a.slice().sort((x, y) => (byId(x.id).bpm || 0) - (byId(y.id).bpm || 0))) },
  { text: "Shuffle the list", run: () => reorderPl(a => shuffleArr(a.slice())) },
  { text: "Reverse the list", run: () => reorderPl(a => a.slice().reverse()) },
]));
$("plListBtn").addEventListener("click", e => openMenu(e.currentTarget, [
  { text: "Save as a new playlist", disabled: !pl.length || !store.canWrite, run: savePlAs },
  { label: playlistsSorted().length ? "Load a saved playlist" : "" },
  ...playlistsSorted().map(p => ({ text: p.name, run: () => { setPl(p.tracks.filter(id => byId(id))); toast(`Loaded ${p.name}`); } })),
  "-",
  { text: "Clear the list", disabled: !pl.length, run: () => removePlIdx(pl.map((_, i) => i)) },
].filter(x => x === "-" || x.text || x.label)));
async function savePlAs() {
  const r = await dialog({ title: "Save playlist", fields: [{ label: "Name", value: `Playlist ${store.playlists.length + 1}` }], confirm: "Save" });
  if (!r || !r[0]) return;
  try { await store.createPlaylist(r[0]).then(p => store.updatePlaylist(p.id, { tracks: pl.slice() })); toast(`Saved ${r[0]}`); renderTree(); }
  catch (e) { toast("Couldn't save the playlist. Try again.", true); }
}

// ---------- media library ----------
// Views: all songs, a playlist, a smart playlist, the artist or album lists, or one artist or album.
// The song list only draws the rows on screen, so it stays quick with thousands of songs.
let mlView = { type: "all" }, mlSort = { key: null, dir: 1 }, mlSearch = "", mlSel = new Set(), mlAnchor = null;
// artists, albums and genres come from core/library.js, shared with Files and Decks
let groupsCache = null, groupsFor = -1;
function groups() {
  const lib = library(), sig = lib.length + ":" + lib.reduce((n, t) => n + (t.title || "").length + (t.album || "").length + (t.genre || "").length + (t.artist || "").length, 0);
  if (!groupsCache || groupsFor !== sig) { groupsCache = buildGroups(lib); groupsFor = sig; }
  return groupsCache;
}
const isGroupList = () => mlView.type === "artists" || mlView.type === "albums" || mlView.type === "genres";
function mlIds() { return viewSongs(mlView, library(), store.playlists, groups()).map(t => t.id); }
function mlVisible() {
  let ids = mlIds();
  const q = mlSearch.trim().toLowerCase();
  if (q) ids = ids.filter(id => { const t = byId(id); return [t.title, t.artist, t.album, t.genre].some(v => (v || "").toLowerCase().includes(q)); });
  if (mlSort.key) {
    const k = mlSort.key, d = mlSort.dir;
    ids = ids.slice().sort((a, b) => {
      const A = byId(a), B = byId(b);
      if (k === "bpm" || k === "duration") return ((A[k] || 0) - (B[k] || 0)) * d;
      if (k === "fav") return ((B.fav ? 1 : 0) - (A.fav ? 1 : 0)) * d;
      return (A[k] || "").localeCompare(B[k] || "", undefined, { sensitivity: "base" }) * d;
    });
  }
  return ids;
}
function groupsVisible() { return searchGroups(viewGroups(mlView, groups()), mlSearch); }
function renderTree() {
  $("allCount").textContent = library().length;
  $("treeAll").setAttribute("aria-current", String(mlView.type === "all"));
  const g = groups(), on = t => mlView.type === t || mlView.type + "s" === t;
  $("treeBrowse").innerHTML = `<button class="tree-item" data-browse="artists" aria-current="${on("artists")}">${icon("library")}<span class="name">Artists</span><span class="n">${g.artists.length}</span></button>
    <button class="tree-item" data-browse="albums" aria-current="${on("albums")}">${icon("note")}<span class="name">Albums</span><span class="n">${g.albums.length}</span></button>
    <button class="tree-item" data-browse="genres" aria-current="${on("genres")}">${icon("tune")}<span class="name">Genres</span><span class="n">${g.genres.length}</span></button>`;
  $("treeSmart").innerHTML = SMART.map(sm => { const n = sm.pick(library()).length; return `<button class="tree-item" data-smart="${sm.id}" aria-current="${mlView.type === "smart" && mlView.id === sm.id}">${icon("tune")}<span class="name">${esc(sm.name)}</span><span class="n">${n}</span></button>`; }).join("");
  $("treePls").innerHTML = playlistsSorted().map(p => `<button class="tree-item" data-pl="${esc(p.id)}" aria-current="${mlView.type === "pl" && mlView.id === p.id}">${icon("playlist")}<span class="name">${esc(p.name)}</span><span class="n">${p.tracks.filter(id => byId(id)).length}</span></button>`).join("");
  $("treeNew").hidden = !store.canWrite;
  $("mlAdd").hidden = !store.canWrite;
  $("mlAddFolder").hidden = !store.canWrite;
}
$("treePls").addEventListener("click", e => { const b = e.target.closest("[data-pl]"); if (b) setMlView({ type: "pl", id: b.dataset.pl }); });
$("treePls").addEventListener("dblclick", e => { const b = e.target.closest("[data-pl]"); if (!b) return; const p = plById(b.dataset.pl); if (p) { Eng.ensure(); setPl(p.tracks.filter(id => byId(id))); playIndex(S.shuffle ? Math.floor(Math.random() * pl.length) : 0); } });
$("treeBrowse").addEventListener("click", e => { const b = e.target.closest("[data-browse]"); if (b) setMlView({ type: b.dataset.browse }); });
$("treeSmart").addEventListener("click", e => { const b = e.target.closest("[data-smart]"); if (b) setMlView({ type: "smart", id: b.dataset.smart }); });
$("treeSmart").addEventListener("dblclick", e => { const b = e.target.closest("[data-smart]"); if (!b) return; const ids = smartById(b.dataset.smart).pick(library()).map(t => t.id); if (ids.length) { Eng.ensure(); setPl(ids); playIndex(S.shuffle ? Math.floor(Math.random() * ids.length) : 0); } });
$("treeAll").addEventListener("click", () => setMlView({ type: "all" }));
$("mlBack").addEventListener("click", () => setMlView({ type: mlView.type + "s" }));
function setMlView(v) { mlView = v; mlSel.clear(); mlSearch = ""; $("mlSearch").value = ""; mlSort = { key: null, dir: 1 }; renderTree(); $("mlTable").scrollTop = 0; renderMl(); }

// ---------- the list: only the rows in view are drawn ----------
const ROW = 26;
let vRows = [], vKind = "song";
function viewTitle() { return libTitle(mlView, store.playlists, groups()); }
function renderMl() {
  const p = mlView.type === "pl" ? plById(mlView.id) : null;
  if (mlView.type === "pl" && !p) mlView = { type: "all" };
  const grp = isGroupList();
  $("mlTitle").textContent = viewTitle();
  $("mlBack").hidden = !["artist", "album", "genre"].includes(mlView.type);
  $("mlRename").hidden = $("mlDelete").hidden = !(p && store.canWrite);
  ["mlPlay", "mlEnq", "mlSend"].forEach(id => { $(id).hidden = grp; });
  $("mlTable").classList.toggle("groups", grp);
  document.querySelectorAll(".thead [data-sort]").forEach(b => {
    const on = mlSort.key === b.dataset.sort;
    b.setAttribute("aria-sort", on ? (mlSort.dir > 0 ? "ascending" : "descending") : "none");
    b.dataset.label = b.dataset.label || b.textContent;
    b.textContent = b.dataset.label + (on && b.dataset.sort !== "fav" ? (mlSort.dir > 0 ? " ▴" : " ▾") : "");
  });
  vKind = grp ? "group" : "song";
  vRows = grp ? groupsVisible() : mlVisible();
  drawRows();
  const n = mlIds().length, tot = mlIds().reduce((s, id) => s + (byId(id).duration || 0), 0);
  const what = grp ? `${vRows.length} ${mlView.type.slice(0, -1)}${vRows.length === 1 ? "" : "s"}` : `${n} ${n === 1 ? "song" : "songs"}, ${Math.round(tot / 60)} min.`;
  if (!adding) setStatus(`${what} ${analyser && analyser.pending ? `Finding beats: ${analyser.pending} to go. ` : ""}${storeNote()}`);
}
function songRow(id, curId) {
  const t = byId(id);
  return `<div class="trow${mlSel.has(id) ? " sel" : ""}${id === curId ? " cur" : ""}" role="row" data-id="${esc(id)}" aria-selected="${mlSel.has(id)}">
    <span class="star${t.fav ? " on" : ""}" role="gridcell" data-star title="${t.fav ? "Remove from favourites" : "Add to favourites"}">${t.fav ? "★" : "☆"}</span>
    <span role="gridcell">${esc(t.title)}</span><span class="d" role="gridcell">${esc(t.artist || "")}</span><span class="d" role="gridcell">${esc(t.album || "")}</span><span class="d" role="gridcell">${esc(t.genre || "")}</span>
    <span class="num r" role="gridcell">${t.bpm ? Math.round(t.bpm) : ""}</span><span class="num r" role="gridcell">${fmt(t.duration)}</span></div>`;
}
function groupRow(g) {
  const art = mlView.type === "albums";
  return `<div class="grow" role="row" data-g="${esc(g.key)}" title="Open · double-click to play">
    ${art ? (g.cover ? `<img class="thumb" src="${esc(g.cover)}" alt="">` : `<span class="thumb"></span>`) : icon(mlView.type === "genres" ? "tune" : "library")}
    <span>${esc(g.name)}</span><span class="d">${esc(groupNote(g))}</span>
    <span class="num">${g.songs.length}</span><span class="d">song${g.songs.length === 1 ? "" : "s"}</span></div>`;
}
function drawRows() {
  const box = $("mlTable"), n = vRows.length;
  if (!n) {
    const p = mlView.type === "pl" ? plById(mlView.id) : null;
    $("mlRows").innerHTML = mlSearch.trim() ? `<div class="ml-empty"><b>Nothing matches “${esc(mlSearch.trim())}”.</b>Try a title, artist or album.</div>`
      : p ? `<div class="ml-empty"><b>This playlist is empty.</b>Select songs in All songs, then use Send to.</div>`
      : mlView.type === "smart" ? `<div class="ml-empty"><b>Nothing here yet.</b>${mlView.id === "fav" ? "Click the star beside a song to add it." : mlView.id.startsWith("b") ? "Songs appear once their tempo has been worked out." : "Songs appear here as you play them."}</div>`
      : `<div class="ml-empty"><b>No songs yet.</b>Use Add files or ${linkSupported ? "Folders" : "Add folder"}, or drop songs or whole folders onto the window.</div>`;
    return;
  }
  const head = vKind === "song" ? 24 : 0, h = box.clientHeight || 400;
  const top = Math.max(0, Math.min(box.scrollTop - head, n * ROW - h)); // the list may just have got shorter
  const start = Math.max(0, Math.floor(top / ROW) - 10), end = Math.min(n, Math.ceil((top + h) / ROW) + 10);
  const curId = curTrack() ? curTrack().id : null;
  let html = `<div style="height:${start * ROW}px"></div>`;
  for (let i = start; i < end; i++) html += vKind === "song" ? songRow(vRows[i], curId) : groupRow(vRows[i]);
  $("mlRows").innerHTML = html + `<div style="height:${(n - end) * ROW}px"></div>`;
}
let drawQueued = false;
$("mlTable").addEventListener("scroll", () => { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; drawRows(); }); }, { passive: true });
if (window.ResizeObserver) new ResizeObserver(() => drawRows()).observe($("mlTable"));
function ensureVisible(i) {
  const box = $("mlTable"), headH = vKind === "song" ? 24 : 0, y = headH + i * ROW;
  if (y - headH < box.scrollTop) box.scrollTop = y - headH;
  else if (y + ROW > box.scrollTop + box.clientHeight) box.scrollTop = y + ROW - box.clientHeight;
  drawRows();
}
async function toggleFav(ids, on) {
  for (const id of ids) { const t = byId(id); if (t && !t.builtin) await store.updateTrack(id, { fav: on == null ? !t.fav : on }); }
  notifyLibraryChange("edit"); renderTree(); renderMl();
}
function storeNote() {
  if (!storeReady) return "Loading…";
  if (store.kind === "claude") return store.canWrite ? "Saved with this page." : "Only editors can add songs.";
  if (store.kind === "local") return store.canWrite ? "Saved in this browser." : "This browser can't save songs.";
  return "";
}
function setStatus(msg, prog) {
  $("mlStatus").textContent = msg;
  $("addTrack").hidden = prog == null;
  if (prog != null) $("addBar").style.width = (clamp(prog, 0, 1) * 100).toFixed(1) + "%";
}
$("mlRows").addEventListener("click", e => {
  const g = e.target.closest(".grow");
  if (g) { setMlView({ type: mlView.type.slice(0, -1), key: g.dataset.g }); return; }
  if (e.target.closest("[data-star]")) { const r = e.target.closest(".trow"); if (r) toggleFav([r.dataset.id]); return; }
  const row = e.target.closest(".trow"); if (!row) return;
  const id = row.dataset.id, ids = mlVisible();
  if (e.shiftKey && mlAnchor) { const a = ids.indexOf(mlAnchor), b = ids.indexOf(id); mlSel = new Set(ids.slice(Math.min(a, b), Math.max(a, b) + 1)); }
  else if (e.ctrlKey || e.metaKey) { mlSel.has(id) ? mlSel.delete(id) : mlSel.add(id); mlAnchor = id; }
  else { mlSel = new Set([id]); mlAnchor = id; }
  syncMlSel();
});
function syncMlSel() { document.querySelectorAll("#mlRows .trow").forEach(r => { const on = mlSel.has(r.dataset.id); r.classList.toggle("sel", on); r.setAttribute("aria-selected", String(on)); }); }
$("mlRows").addEventListener("dblclick", e => {
  const g = e.target.closest(".grow");
  if (g) { const grp = vRows.find(x => x.key === g.dataset.g); if (grp) { Eng.ensure(); const ids = mlView.type === "genres" ? grp.songs.slice() : albumOrder(grp.songs.map(byId)).map(t => t.id); setPl(ids); playIndex(S.shuffle ? Math.floor(Math.random() * ids.length) : 0); } return; }
  if (e.target.closest("[data-star]")) return;
  const row = e.target.closest(".trow"); if (!row) return;
  Eng.ensure();
  const ids = mlVisible();
  setPl(ids); playIndex(ids.indexOf(row.dataset.id));
});
$("mlTable").addEventListener("keydown", e => {
  if (isGroupList()) return;
  const ids = mlVisible(); if (!ids.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    const i = clamp(ids.indexOf(mlAnchor) + (e.key === "ArrowDown" ? 1 : -1), 0, ids.length - 1);
    mlSel = new Set([ids[i]]); mlAnchor = ids[i];
    ensureVisible(i);
    e.preventDefault(); e.stopPropagation();
  } else if (e.key === "Enter" && mlAnchor) { Eng.ensure(); setPl(ids); playIndex(ids.indexOf(mlAnchor)); e.preventDefault(); }
  else if ((e.key === "a" || e.key === "A") && (e.ctrlKey || e.metaKey)) { mlSel = new Set(ids); renderMl(); e.preventDefault(); }
});
function selectedOrAll() { const v = mlVisible(); return mlSel.size ? v.filter(id => mlSel.has(id)) : v; }
$("mlPlay").addEventListener("click", () => { const ids = selectedOrAll(); if (!ids.length) return; Eng.ensure(); setPl(ids); playIndex(S.shuffle && ids.length > 1 ? Math.floor(Math.random() * ids.length) : 0); });
$("mlEnq").addEventListener("click", () => { const ids = selectedOrAll(); if (!ids.length) return; enqueue(ids); toast(ids.length === 1 ? `Enqueued ${byId(ids[0]).title}` : `Enqueued ${ids.length} songs`); });
function sendToItems(ids) {
  if (!ids.length || !store.canWrite) return [];
  return [{ label: "Add to playlist" },
    ...playlistsSorted().filter(p => !(mlView.type === "pl" && mlView.id === p.id)).map(p => ({ text: p.name, run: () => addToPlaylist(p.id, ids) })),
    { text: "New playlist…", run: async () => {
      const r = await dialog({ title: "New playlist", fields: [{ label: "Name", value: `Playlist ${store.playlists.length + 1}` }], confirm: "Create" });
      if (!r || !r[0]) return;
      try { const p = await store.createPlaylist(r[0]); await addToPlaylist(p.id, ids); } catch (e) { toast("Couldn't create the playlist. Try again.", true); }
    } }];
}
function trackMenu(ids) {
  const one = ids.length === 1 ? byId(ids[0]) : null;
  const own = ids.map(byId).filter(t => t && !t.builtin);
  return [
    { text: "Play", key: "Enter", run: () => { Eng.ensure(); setPl(ids); playIndex(0); } },
    { text: "Enqueue", run: () => enqueue(ids) },
    { text: "Play next", run: () => { pl.splice(cur + 1, 0, ...ids); renderPl(); save(); } },
    ...(store.canWrite && own.length ? [{ text: own.every(t => t.fav) ? "Remove from favourites" : "Add to favourites", run: () => toggleFav(own.map(t => t.id), !own.every(t => t.fav)) }] : []),
    ...(sendToItems(ids).length ? ["-", ...sendToItems(ids)] : []),
    ...(mlView.type === "pl" && store.canWrite ? ["-", { text: "Remove from this playlist", run: () => removeFromPlaylist(mlView.id, ids) }] : []),
    ...(store.canWrite && (one && !one.builtin) ? ["-", { text: "Edit details", run: () => editTrack(one) }] : []),
    ...(store.canWrite && own.length ? [{ text: own.length === 1 ? "Delete from library" : `Delete ${own.length} songs from library`, danger: true, run: () => deleteTracks(own) }] : []),
  ];
}
$("mlSend").addEventListener("click", e => {
  const ids = mlVisible().filter(id => mlSel.has(id));
  if (!ids.length) { toast("Select songs first. Ctrl-click or Shift-click selects several."); return; }
  openMenu(e.currentTarget, trackMenu(ids));
});
$("mlRows").addEventListener("contextmenu", e => {
  const row = e.target.closest(".trow"); if (!row) return;
  e.preventDefault();
  const id = row.dataset.id;
  if (!mlSel.has(id)) { mlSel = new Set([id]); mlAnchor = id; syncMlSel(); }
  openMenu(null, trackMenu(mlVisible().filter(x => mlSel.has(x))), { x: e.clientX, y: e.clientY });
});
document.querySelectorAll(".thead [data-sort]").forEach(b => b.addEventListener("click", () => {
  const k = b.dataset.sort;
  if (mlSort.key !== k) mlSort = { key: k, dir: 1 }; else if (mlSort.dir === 1) mlSort.dir = -1; else mlSort = { key: null, dir: 1 };
  renderMl();
}));
$("mlSearch").addEventListener("input", e => { mlSearch = e.target.value; $("mlTable").scrollTop = 0; renderMl(); });
$("mlAdd").addEventListener("click", () => $("fileIn").click());
$("mlAddFolder").addEventListener("click", e => { if (linkSupported) folderMenu(e.currentTarget); else $("folderIn").click(); });
if (linkSupported) { $("mlAddFolder").textContent = "Folders ▾"; $("mlAddFolder").title = "Link a music folder, rescan it, or copy a folder in"; $("mlAddFolder").setAttribute("aria-haspopup", "menu"); }
$("treeNew").addEventListener("click", () => { $("newPlForm").hidden = false; $("newPlName").value = ""; $("newPlName").focus(); });
$("newPlName").addEventListener("keydown", e => { if (e.key === "Escape") $("newPlForm").hidden = true; });
$("newPlForm").addEventListener("submit", async e => {
  e.preventDefault(); const name = $("newPlName").value.trim(); if (!name) return;
  try { const p = await store.createPlaylist(name); $("newPlForm").hidden = true; setMlView({ type: "pl", id: p.id }); } catch (err) { toast("Couldn't create the playlist. Try again.", true); }
});
$("mlRename").addEventListener("click", async () => {
  const p = plById(mlView.id); if (!p) return;
  const r = await dialog({ title: "Rename playlist", fields: [{ label: "Name", value: p.name }], confirm: "Rename" });
  if (!r || !r[0]) return;
  try { await store.updatePlaylist(p.id, { name: r[0] }); renderTree(); renderMl(); } catch (e) { toast("Couldn't rename the playlist. Try again.", true); }
});
$("mlDelete").addEventListener("click", async () => {
  const p = plById(mlView.id); if (!p) return;
  const ok = await dialog({ title: "Delete playlist", text: `Delete ${p.name}? The songs stay in your library.`, confirm: "Delete", danger: true });
  if (!ok) return;
  try { await store.deletePlaylist(p.id); setMlView({ type: "all" }); } catch (e) { toast("Couldn't delete the playlist. Try again.", true); }
});

async function addToPlaylist(pid, ids) {
  const p = plById(pid); if (!p) return;
  const add = ids.filter(id => !p.tracks.includes(id));
  if (!add.length) { toast(`Already in ${p.name}`); return; }
  try { await store.updatePlaylist(pid, { tracks: [...p.tracks, ...add] }); toast(add.length === 1 ? `Added ${byId(add[0]).title} to ${p.name}` : `Added ${add.length} songs to ${p.name}`); renderTree(); renderMl(); }
  catch (e) { toast("Couldn't update the playlist. Try again.", true); }
}
async function removeFromPlaylist(pid, ids) {
  const p = plById(pid); if (!p) return;
  try { await store.updatePlaylist(pid, { tracks: p.tracks.filter(x => !ids.includes(x)) }); mlSel.clear(); renderTree(); renderMl(); }
  catch (e) { toast("Couldn't update the playlist. Try again.", true); }
}
async function editTrack(t) {
  const r = await dialog({ title: "Edit details", fields: [{ label: "Title", value: t.title }, { label: "Artist", value: t.artist }, { label: "Album", value: t.album }, { label: "Genre", value: t.genre || "" }], confirm: "Save" });
  if (!r) return;
  try { await store.updateTrack(t.id, { title: r[0] || t.title, artist: r[1], album: r[2], genre: r[3] }); notifyLibraryChange("edit"); renderAll(); if (curTrack() === t) setNowPlaying(); }
  catch (e) { toast("Couldn't save those details. Try again.", true); }
}
async function deleteTracks(ts) {
  const ok = await dialog({ title: "Delete from library", text: ts.length === 1 ? `Delete ${ts[0].title}? It's removed from your library and every playlist.` : `Delete ${ts.length} songs? They're removed from your library and every playlist.`, confirm: "Delete", danger: true });
  if (!ok) return;
  try {
    const gone = new Set(ts.map(t => t.id));
    for (const p of store.playlists.filter(p => p.tracks.some(id => gone.has(id)))) await store.updatePlaylist(p.id, { tracks: p.tracks.filter(id => !gone.has(id)) });
    for (const t of ts) await store.deleteTrack(t);
    removePlIdx(pl.map((id, i) => gone.has(id) ? i : -1).filter(i => i >= 0));
    mlSel.clear(); renderAll(); notifyLibraryChange("delete");
    toast(ts.length === 1 ? `Deleted ${ts[0].title}` : `Deleted ${ts.length} songs`);
  } catch (e) { toast("Couldn't delete. Try again.", true); }
}

// ---------- playback ----------
const anCache = new Map(), byteCache = new Map();
let data = null, loadSeq = 0, loadedId = null, loading = false;
async function trackBytes(t) {
  if (byteCache.has(t.id)) return byteCache.get(t.id);
  let ab;
  if (t.builtin) {
    const emb = embedded("aud-" + t.key);
    if (emb) ab = decode(emb).buffer;
    else { const r = await fetch(t.src); if (!r.ok) throw new Error("missing_file"); ab = await r.arrayBuffer(); }
  } else ab = await store.audioBytes(t, true); // a linked song may need the browser's permission again; playing is a click, so it can ask
  byteCache.set(t.id, ab);
  if (byteCache.size > 3) byteCache.delete(byteCache.keys().next().value);
  return ab;
}
async function getAnalysis(t) {
  if (anCache.has(t.id)) return anCache.get(t.id);
  const a = t.builtin ? JSON.parse(embedded("an-" + t.key)) : await store.analysis(t);
  if (a) anCache.set(t.id, a);
  return a || null;
}
function normalise(raw) {
  const d = JSON.parse(JSON.stringify(raw));
  const off = typeof d.offset === "number" ? d.offset : 1024 / 22050;
  d.offset = off; d.beats = d.beats.map(b => b + off);
  d.bands.forEach(b => { b.envArr = decode(b.env); b.ptr = 0; b.fired = -1; b.onsets = b.onsets.map(o => o + off); });
  return d;
}
function unloadTrack() { Eng.stop(); Eng.buf = null; loadedId = null; data = null; setNowPlaying(); }
let countedId = null; // a play counts once the song has run 30 seconds (or half of a short one)
async function playIndex(i, { autoplay = true, at = 0, fromHistory = false } = {}) {
  countedId = null;
  if (i < 0 || i >= pl.length) return;
  const t = byId(pl[i]); if (!t) return;
  if (!fromHistory && cur >= 0 && cur !== i) { history.push(cur); if (history.length > 200) history.shift(); }
  cur = i;
  const seq = ++loadSeq;
  Eng.stop(); loading = true;
  renderPl(); renderMl(); setNowPlaying();
  setMarquee(`LOADING ${t.title.toUpperCase()}…`);
  try {
    if (!Eng.ensure()) throw new Error("no_webaudio");
    const [ab, an] = await Promise.all([trackBytes(t), getAnalysis(t)]);
    if (seq !== loadSeq) return;
    if (analyser && analyser.waiting) { analyser.resume(); checkAccess(); } // access was just given: carry on analysing
    let buf;
    try { buf = await Eng.decode(ab); } catch (e) { throw new Error("decode"); }
    if (seq !== loadSeq) return;
    Eng.setBuffer(buf); loadedId = t.id;
    data = an ? normalise(an) : null; beatPtr = 0; resetViz();
    if (!an && analyser) analyser.prioritise(t.id); // not analysed yet: jump the queue; the visualiser idles until it's ready
    t.kbps = Math.round(ab.byteLength * 8 / buf.duration / 1000);
    loading = false;
    setNowPlaying();
    if (autoplay) { Eng.play(at); checkRunning(); setNowPlaying(); } else { Eng.offset = at; }
    save();
  } catch (e) {
    if (seq !== loadSeq) return;
    loading = false; setNowPlaying();
    const m = e && e.message;
    if (m === "needs_permission") checkAccess();
    toast(m === "no_webaudio" ? "This browser can't play audio here. Try a current version of Chrome, Edge or Firefox."
      : m === "decode" ? `Couldn't play ${t.title}: this browser can't decode that file.`
      : m === "missing_file" ? `Couldn't find ${t.src}. Keep the song files in the same folder as the page.`
      : m === "needs_permission" ? `Neon OS needs your permission to read your music folder again. Press Reconnect folder in the library, then play ${t.title}.`
      : m === "missing" ? `Couldn't find ${t.title} in your linked folder. It may have been moved, renamed or deleted; Rescan folders finds it again.`
      : `Couldn't load ${t.title}. Check your connection and try again.`, true);
  }
}
function checkRunning() {
  setTimeout(() => { if (Eng.state === "playing" && Eng.ctx && Eng.ctx.state !== "running") toast("The browser blocked sound until you click. Press Play again.", true); }, 700);
}
Eng.onEnded = () => next(true);
Eng.applyAll = () => { Eng.setVolume(S.vol); Eng.setBalance(S.bal); Eng.setEq(S.eqOn, S.pre, S.bands); };

function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function play() {
  Eng.ensure();
  if (!pl.length) { const ids = mlVisible(); if (!ids.length) return; setPl(ids); playIndex(S.shuffle ? Math.floor(Math.random() * ids.length) : 0); return; }
  if (cur < 0) { playIndex(plSel.size ? Math.min(...plSel) : 0); return; }
  if (loadedId !== pl[cur]) { playIndex(cur); return; }
  if (Eng.state === "paused") { Eng.play(); checkRunning(); }
  else Eng.play(Eng.state === "playing" ? 0 : Eng.offset);
  checkRunning(); setNowPlaying();
}
function pause() { if (Eng.state === "playing") Eng.pause(); else if (Eng.state === "paused") { Eng.ensure(); Eng.play(); } setNowPlaying(); save(); }
function stop() { Eng.stop(); setNowPlaying(); save(); }
function next(auto) {
  if (!pl.length) return;
  if (auto && S.repeat === "one") { playIndex(cur, { fromHistory: true }); return; }
  let n;
  if (S.shuffle && pl.length > 1) { do { n = Math.floor(Math.random() * pl.length); } while (n === cur); }
  else n = cur + 1;
  if (n >= pl.length) { if (S.repeat === "off" && auto) { stop(); return; } n = 0; }
  Eng.ensure(); playIndex(n);
}
function prev() {
  if (!pl.length) return;
  if (Eng.time() > 3 && Eng.state !== "stopped") { Eng.seek(0); return; }
  Eng.ensure();
  if (S.shuffle && history.length) { playIndex(history.pop(), { fromHistory: true }); return; }
  playIndex(cur > 0 ? cur - 1 : (S.repeat === "all" ? pl.length - 1 : 0), { fromHistory: true });
}

// ---------- now playing displays ----------
let marqueeText = "", marqueeX = 0;
function setMarquee(txt) {
  if (txt === marqueeText) return;
  marqueeText = txt; marqueeX = 0;
  const span = $("marqueeText"); span.textContent = txt + "  ***  " + txt + "  ***  ";
}
const stateIcons = { playing: "play", paused: "pause", stopped: "stop" };
function setNowPlaying() {
  const t = curTrack();
  $("stateIcon").innerHTML = icon(loading ? "next" : stateIcons[Eng.state]);
  if (!loading) setMarquee(t ? `${cur + 1}. ${t.artist ? t.artist + " - " : ""}${t.title} (${fmt(t.duration)})`.toUpperCase() : "NEON ORBIT · DOUBLE-CLICK A SONG IN THE LIBRARY TO START");
  $("kbps").textContent = t && t.kbps ? t.kbps : " ";
  $("bpmBox").textContent = t && t.bpm ? Math.round(t.bpm) : " ";
  $("stageNp").innerHTML = t ? `${t.coverUrl ? `<img src="${esc(t.coverUrl)}" alt="" onerror="this.remove()">` : ""}<div><b>${esc(t.title)}</b><span>${esc([t.artist, t.album].filter(Boolean).join(" · "))}</span></div>` : "";
  $("treeArt").innerHTML = t && t.coverUrl ? `<img src="${esc(t.coverUrl)}" alt="" onerror="this.remove()">` : icon("note");
  $("treeArtTxt").textContent = t ? `${t.title}${t.artist ? " · " + t.artist : ""}` : "Nothing yet";
  const home = window.neonOsShell ? "Neon OS" : "Neon Orbit Amp";
  document.title = t && Eng.state === "playing" ? `${t.title} · ${home}` : home;
  if ("mediaSession" in navigator && t) { try { navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist || "", album: t.album || "" }); } catch (e) {} }
  tellOs();
}
// the desktop's taskbar mini player follows this
let toldOs = "";
function tellOs() {
  const t = curTrack(), d = t ? { title: t.title, artist: t.artist || "", state: loading ? "loading" : Eng.state } : null, k = JSON.stringify(d);
  if (k === toldOs) return; toldOs = k;
  dispatchEvent(new CustomEvent("neonos:nowplaying", { detail: d }));
}
// the taskbar mini player and the desktop's music shortcuts
addEventListener("neonos:transport", e => {
  const a = e.detail;
  if (a === "toggle") { if (Eng.state === "playing") pause(); else play(); }
  else if (a === "next") next(false); else if (a === "prev") prev(); else if (a === "stop") stop();
});
$("bigTime").addEventListener("click", () => { S.remain = !S.remain; $("bigTime").setAttribute("aria-label", S.remain ? "Time remaining" : "Elapsed time"); $("bigTime").title = S.remain ? "Show elapsed time" : "Show time remaining"; save(); });
$("bigTime").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("bigTime").click(); } });
const MINI_MODES = ["spec", "osc", "off"];
$("mini").addEventListener("click", () => {
  S.mini = MINI_MODES[(MINI_MODES.indexOf(S.mini) + 1) % 3];
  $("mini").setAttribute("aria-label", `Mini visualiser: ${{ spec: "spectrum", osc: "oscilloscope", off: "off" }[S.mini]}. Click to switch.`); save();
});
$("mini").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("mini").click(); } });

// ---------- transport + sliders ----------
$("bPrev").addEventListener("click", prev);
$("bPlay").addEventListener("click", play);
$("bPause").addEventListener("click", pause);
$("bStop").addEventListener("click", stop);
$("bNext").addEventListener("click", () => next(false));
$("bEject").addEventListener("click", () => { if (store.canWrite) $("fileIn").click(); else toast("This library can't save songs here.", true); });
function renderModes() {
  $("bShuf").setAttribute("aria-pressed", String(S.shuffle));
  $("bRep").setAttribute("aria-pressed", String(S.repeat !== "off"));
  $("repTxt").textContent = S.repeat === "one" ? "Repeat 1" : "Repeat";
  $("bRep").setAttribute("aria-label", `Repeat: ${S.repeat === "off" ? "off" : S.repeat === "all" ? "all" : "one song"}`);
}
$("bShuf").addEventListener("click", () => { S.shuffle = !S.shuffle; history = []; renderModes(); save(); });
$("bRep").addEventListener("click", () => { S.repeat = S.repeat === "off" ? "all" : S.repeat === "all" ? "one" : "off"; renderModes(); save(); });

const volS = Slider($("vol"), { min: 0, max: 1, step: 0.01, value: S.vol, label: "Volume", text: v => Math.round(v * 100) + "%", onInput: v => { S.vol = v; Eng.setVolume(v); showVol(); dispatchEvent(new CustomEvent("neonos:volume-changed", { detail: v })); }, onChange: save });
function showVol() { $("volPct").textContent = Math.round(S.vol * 100) + "%"; }
showVol();
const balS = Slider($("bal"), { min: -1, max: 1, step: 0.02, value: S.bal, label: "Balance", text: v => Math.abs(v) < 0.01 ? "Centre" : `${Math.round(Math.abs(v) * 100)}% ${v < 0 ? "left" : "right"}`, onInput: v => { if (Math.abs(v) < 0.06) v = 0; S.bal = v; Eng.setBalance(v); }, onChange: save });
const seekS = Slider($("seek"), { min: 0, max: 1, step: 0.0005, value: 0, label: "Position", text: v => fmt(v * Eng.duration), onInput: () => {}, onChange: v => { if (Eng.buf) { Eng.seek(v * Eng.duration); resetViz(); save(); } } });
const chaosS = Slider($("chaos"), { min: 0, max: 1, step: 0.01, value: S.chaos, label: "Chaos", text: v => Math.round(v * 100) + "%", onInput: v => { S.chaos = v; }, onChange: save });
void volS; void balS; void chaosS;

// ---------- equalizer ----------
const eqSliders = [];
(function buildEq() {
  const body2 = $("eqBody");
  const col = (label, cls) => { const c = document.createElement("div"); c.className = "eq-col" + (cls ? " " + cls : ""); c.innerHTML = `<div class="slider v center"></div><span class="lbl">${label}</span>`; body2.appendChild(c); return c.querySelector(".slider"); };
  const preEl = col("Pre");
  const db = document.createElement("div"); db.className = "db"; db.innerHTML = "<span>+12</span><span>0</span><span>-12</span>"; body2.appendChild(db);
  eqSliders.pre = Slider(preEl, { min: -12, max: 12, step: 0.5, value: S.pre, orient: "v", label: "Preamp", text: v => `${v > 0 ? "+" : ""}${v} dB`, onInput: v => { S.pre = v; applyEq(); }, onChange: save });
  EQ_LABELS.forEach((l, i) => {
    const el = col(l);
    eqSliders[i] = Slider(el, { min: -12, max: 12, step: 0.5, value: S.bands[i], orient: "v", label: `${l} Hz`, text: v => `${v > 0 ? "+" : ""}${v} dB`, onInput: v => { S.bands[i] = v; applyEq(); }, onChange: save });
  });
})();
function applyEq() { Eng.setEq(S.eqOn, S.pre, S.bands); drawEqGraph(); $("eqOn").setAttribute("aria-pressed", String(S.eqOn)); }
function setEqValues(bands, pre) { S.bands = bands.slice(); if (pre != null) S.pre = pre; S.bands.forEach((v, i) => eqSliders[i].set(v)); eqSliders.pre.set(S.pre); applyEq(); save(); }
$("eqOn").addEventListener("click", () => { S.eqOn = !S.eqOn; applyEq(); save(); });
$("eqReset").addEventListener("click", () => setEqValues(PRESETS.Flat, 0));
$("eqPresets").addEventListener("click", e => openMenu(e.currentTarget, Object.keys(PRESETS).map(name => ({ text: name, run: () => { setEqValues(PRESETS[name], name === "Flat" ? 0 : -3); if (!S.eqOn) { S.eqOn = true; applyEq(); } toast(`Equalizer: ${name}`); } }))));
function drawEqGraph() {
  const c = $("eqGraph"), r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
  if (!r.width) return;
  c.width = r.width * d; c.height = r.height * d;
  const g = c.getContext("2d"); g.scale(d, d);
  const w = r.width, h = r.height, col = getComputedStyle(document.documentElement).getPropertyValue("--ball").trim() || "#3ff2ff";
  g.clearRect(0, 0, w, h);
  g.strokeStyle = "rgba(255,255,255,.08)"; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  const pts = S.bands.map((v, i) => [6 + i * (w - 12) / 9, h / 2 - (S.eqOn ? v : 0) / 12 * (h / 2 - 4)]);
  g.strokeStyle = col; g.lineWidth = 1.6; g.shadowColor = col; g.shadowBlur = 6;
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2; g.bezierCurveTo(mx, y0, mx, y1, x1, y1); }
  g.stroke();
  const py = h / 2 - S.pre / 12 * (h / 2 - 4); g.shadowBlur = 0; g.globalAlpha = .45; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(0, py); g.lineTo(w, py); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
}

// ---------- windows: show/hide + shade ----------
const WIN = { eq: "winEq", pl: "winPl", vis: "winVis", ml: "winMl" };
const TOG = { eq: "tEq", pl: "tPl", vis: "tVis", ml: "tMl" };
function renderWindows() {
  for (const k in WIN) { $(WIN[k]).hidden = !S.show[k]; $(TOG[k]).setAttribute("aria-pressed", String(!!S.show[k])); }
  document.querySelectorAll("[data-shade]").forEach(b => {
    const w = $(b.dataset.shade), sh = !!S.shade[b.dataset.shade];
    w.classList.toggle("shaded", sh); b.setAttribute("aria-expanded", String(!sh));
    // collapsed: arrow points down to expand; open: arrow points up to collapse
    b.innerHTML = icon(sh ? "down" : "up"); b.title = sh ? "Expand" : "Collapse";
    b.setAttribute("aria-label", (sh ? "Expand " : "Collapse ") + (w.getAttribute("aria-label") || "window"));
  });
  setTimeout(() => { resize(); drawEqGraph(); }, 0);
}
for (const k in TOG) $(TOG[k]).addEventListener("click", () => { S.show[k] = !S.show[k]; renderWindows(); save(); });
document.querySelectorAll("[data-shade]").forEach(b => b.addEventListener("click", () => { S.shade[b.dataset.shade] = !S.shade[b.dataset.shade]; renderWindows(); save(); }));
document.querySelectorAll(".titlebar").forEach(tb => tb.addEventListener("dblclick", e => { if (e.target.closest("button")) return; const b = tb.querySelector("[data-shade]"); if (b) b.click(); }));

// ---------- visualiser tools ----------
function syncSwatches() {
  document.querySelectorAll(".swatch").forEach(s => s.setAttribute("aria-pressed", String(s.dataset.c === S.color)));
  const pk = document.querySelector(".picker"); pk.classList.toggle("on", isHex(S.color)); pk.style.background = isHex(S.color) ? S.color : "";
  if (isHex(S.color)) $("customColor").value = S.color;
}
document.querySelectorAll(".swatch").forEach(s => s.addEventListener("click", () => { S.color = s.dataset.c; setTheme({ ball: S.color }); buildSprite(); syncSwatches(); drawEqGraph(); save(); }));
$("customColor").addEventListener("input", e => { S.color = e.target.value; setTheme({ ball: S.color }); buildSprite(); syncSwatches(); drawEqGraph(); save(); });
function toggleFs() {
  const w = $("winVis");
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else if (w.requestFullscreen) w.requestFullscreen().catch(() => toast("Fullscreen isn't available here. Use F11 in your browser instead.", true));
}
$("fsBtn").addEventListener("click", toggleFs);
$("stage").addEventListener("dblclick", toggleFs);
document.addEventListener("fullscreenchange", () => setTimeout(resize, 50));
$("obsBtn").addEventListener("click", () => {
  const n = playlistsSorted().length;
  dialog({ title: "OBS browser source", text: `Add #obs to the end of this page's address for a transparent visualiser that plays your whole library on repeat. Add #obs-3 to start at song 3${n ? ", or #obs-pl-1 to play your first playlist" : ""}. OBS keeps its own browser storage, so add your songs once from inside OBS (right-click the source, Interact).`, confirm: "Got it", cancel: "" });
});

// ---------- keyboard (classic layout: Z X C V B) ----------
addEventListener("keydown", e => {
  if (e.target.closest && e.target.closest("input, textarea, .dialog, .pop")) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const inList = e.target.closest && e.target.closest("#plList, #mlTable, .slider");
  if (k === "z") prev(); else if (k === "x") play(); else if (k === "c") pause(); else if (k === "v") stop(); else if (k === "b") next(false);
  else if (k === "l") $("bEject").click();
  else if (k === "f") toggleFs();
  else if (k === "j") { $("mlSearch").focus(); e.preventDefault(); }
  else if (k === " " && !(e.target.tagName === "BUTTON") && !e.target.closest(".slider")) { e.preventDefault(); if (Eng.state === "playing") pause(); else play(); }
  else if (!inList && (e.key === "ArrowRight" || e.key === "ArrowLeft") && Eng.buf) { Eng.seek(Eng.time() + (e.key === "ArrowRight" ? 5 : -5)); resetViz(); e.preventDefault(); }
  else if (!inList && (e.key === "ArrowUp" || e.key === "ArrowDown")) { volS.set(S.vol + (e.key === "ArrowUp" ? 0.05 : -0.05), true); showVol(); save(); e.preventDefault(); }
});
if ("mediaSession" in navigator) {
  const h = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (e) {} };
  h("play", play); h("pause", pause); h("nexttrack", () => next(false)); h("previoustrack", prev); h("stop", stop);
}

// ---------- adding songs ----------
// Files, or whole folders: a dropped or picked folder is searched all the way down for music files.
// Duplicates are caught before they're processed; the first one in a batch asks what to do with the rest.
const addQ = []; let adding = false;
const AUDIO_EXT = /\.(mp3|flac|wav|ogg|oga|m4a|aac|opus|webm)$/i;
const isAudio = f => (f.type || "").startsWith("audio/") || AUDIO_EXT.test(f.name);
const mimeFor = f => f.type && f.type.startsWith("audio/") ? f.type : ({ mp3: "audio/mpeg", flac: "audio/flac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", opus: "audio/ogg", webm: "audio/webm" }[(f.name.split(".").pop() || "").toLowerCase()] || "audio/mpeg");
const norm = s => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
// same song: the same title plus any one of the same file size, the same artist or the same album
// (artist and album alone aren't enough: every song on an album shares them)
const findDup = (size, title, artist, album) => store.tracks.find(t => norm(t.title) === norm(title) && (
  t.size === size || (artist && norm(t.artist) === norm(artist)) || (album && norm(t.album) === norm(album))));
let batch = null; // { total, done, added, replaced, skipped, failed, dupMode }
const newBatch = (extra = {}) => ({ total: 0, done: 0, added: 0, replaced: 0, skipped: 0, failed: 0, converted: 0, relinked: 0, known: 0, freed: 0, dupMode: null, newIds: [], ...extra });
const mbs = n => n >= 1e9 ? (n / 1e9).toFixed(1) + " GB" : Math.max(0.1, n / 1e6).toFixed(1) + " MB";
async function askConvert() {
  const v = await choose({ title: "Already copied in", text: "Some songs in this folder are already copied into your library. Play them from the folder instead? Their playlists, favourites, play counts and beat analysis stay; the copies are removed from the browser, freeing space.",
    options: [{ label: "Use the folder", value: "link" }, { label: "Keep the copies", value: "keep" }] });
  return v || "keep";
}

// ---------- linked folders ----------
// Songs play straight from a folder on your disk; nothing is copied. Rescan picks up songs added or removed since.
async function linkFolder(handle) {
  if (!handle) { try { handle = await showDirectoryPicker({ id: "neon-music", mode: "read" }); } catch (e) { return; } }
  const folder = await saveFolder(handle);
  await rescan([folder]);
}
async function rescan(list) {
  list = list || await listFolders(true);
  if (!list.length) { toast("No linked folders yet. Use Folders, then Link a music folder."); return; }
  if (batch) { toast("Wait for the songs being added to finish, then rescan."); return; }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  const items = [], missing = new Set();
  for (const folder of list) {
    if (!(await hasAccess(folder, true))) { toast(`Neon OS wasn't given access to ${folder.name}.`, true); continue; }
    setStatus(`Searching ${folder.name}…`, null);
    let found;
    try { found = await scanFolder(folder, n => setStatus(`Searching ${folder.name}… ${n} music file${n === 1 ? "" : "s"} found`, null)); }
    catch (e) { toast(`Couldn't read ${folder.name}. Is the drive connected?`, true); continue; }
    const paths = new Set(found.map(x => x.path)), known = new Set();
    for (const t of store.tracks) if (t.link && t.link.folder === folder.id) { known.add(t.link.path); if (!paths.has(t.link.path)) missing.add(t.id); }
    for (const x of found) if (!known.has(x.path)) items.push({ handle: x.handle, link: { folder: folder.id, path: x.path }, name: x.path.split("/").pop() });
  }
  checkAccess();
  batch = newBatch({ link: true, missing, after: askMissing });
  batch.total = items.length;
  addQ.push(...items);
  await processAdds();
}
async function askMissing(B) {
  const gone = [...(B.missing || [])].map(id => byId(id)).filter(Boolean);
  if (!gone.length) return;
  const ok = await dialog({ title: "Songs no longer in your folder", text: gone.length === 1 ? `${gone[0].title} isn't in your linked folder any more. Remove it from your library?` : `${gone.length} songs aren't in your linked folder any more. Remove them from your library and playlists?`, confirm: "Remove", cancel: "Keep them" });
  if (!ok) return;
  const ids = new Set(gone.map(t => t.id));
  for (const p of store.playlists.filter(p => p.tracks.some(id => ids.has(id)))) await store.updatePlaylist(p.id, { tracks: p.tracks.filter(id => !ids.has(id)) });
  for (const t of gone) await store.deleteTrack(t);
  removePlIdx(pl.map((id, i) => ids.has(id) ? i : -1).filter(i => i >= 0));
  renderAll(); notifyLibraryChange("delete");
}
async function unlinkFolder(folder) {
  const songs = store.tracks.filter(t => t.link && t.link.folder === folder.id && !t.blob);
  const v = await choose({ title: `Stop linking ${folder.name}`, text: songs.length ? `${songs.length} song${songs.length === 1 ? " plays" : "s play"} from this folder. Remove ${songs.length === 1 ? "it" : "them"} from your library too? Nothing on your disk is touched either way.` : "Nothing on your disk is touched.",
    options: songs.length ? [{ label: "Remove the songs", value: "remove", danger: true }, { label: "Keep them listed", value: "keep" }] : [{ label: "Stop linking", value: "keep" }] });
  if (!v) return;
  if (v === "remove") {
    const ids = new Set(songs.map(t => t.id));
    for (const p of store.playlists.filter(p => p.tracks.some(id => ids.has(id)))) await store.updatePlaylist(p.id, { tracks: p.tracks.filter(id => !ids.has(id)) });
    for (const t of songs) await store.deleteTrack(t);
    removePlIdx(pl.map((id, i) => ids.has(id) ? i : -1).filter(i => i >= 0));
  }
  await removeFolder(folder.id); renderAll(); notifyLibraryChange("delete"); checkAccess();
  toast(`Stopped linking ${folder.name}`);
}
// the Reconnect button shows while a linked folder is waiting for the browser's permission
async function checkAccess() {
  const need = linkSupported && store.tracks.some(t => t.link && !t.blob) ? await foldersNeedingAccess() : [];
  $("mlReconnect").hidden = !need.length;
  if (need.length) $("mlReconnect").title = `The browser needs your permission again to read ${need.map(f => f.name).join(", ")}`;
}
$("mlReconnect").addEventListener("click", async () => {
  const ok = await reconnectAll();
  checkAccess();
  if (ok) { if (analyser) analyser.resume(); toast("Folder reconnected"); }
  else toast("The browser wasn't given access. Press Reconnect folder and choose Allow.", true);
});
async function folderMenu(at) {
  const fs = await listFolders(true);
  openMenu(at, [
    { text: "Link a music folder…", run: () => linkFolder() },
    { text: "Rescan linked folders", disabled: !fs.length, run: () => rescan() },
    { text: "Copy a folder in…", run: () => $("folderIn").click() },
    ...(fs.length ? ["-", { label: "Linked folders" }, ...fs.map(f => ({ text: `Stop linking ${f.name}`, run: () => unlinkFolder(f) }))] : []),
    "-", { label: "Linked songs play from your disk and use no space. Copied songs live in the browser." },
  ]);
}
function enqueueFiles(files, from = "files") {
  const list = [...files].filter(isAudio);
  if (!list.length) { toast(from === "folder" ? "No music files found in that folder." : "Those files aren't audio. Try MP3, FLAC, WAV, OGG or M4A.", true); return; }
  if (!store.canWrite) { toast("This library can't save songs here.", true); return; }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); // ask the browser not to clear the library
  if (!batch) batch = newBatch();
  batch.total += list.length;
  addQ.push(...list); processAdds();
}
$("fileIn").addEventListener("change", e => { enqueueFiles(e.target.files); e.target.value = ""; });
$("folderIn").addEventListener("change", e => { enqueueFiles(e.target.files, "folder"); e.target.value = ""; });
async function askDup(title) {
  const v = await choose({ title: "Already in your library", text: `${title} is already in your library. What should happen to this and any other duplicates in this batch?`,
    options: [{ label: "Skip duplicates", value: "skip" }, { label: "Replace with new", value: "replace" }, { label: "Keep both", value: "both" }] });
  return v || "skip";
}
// only the start of a file is read for its tags (ID3 at the front of MP3s, metadata blocks at the front of FLACs)
async function readHead(f) {
  const h = new Uint8Array(await f.slice(0, 10).arrayBuffer());
  let n = 4 * 1024 * 1024;
  if (h[0] === 0x49 && h[1] === 0x44 && h[2] === 0x33) n = Math.min(((h[6] & 127) << 21 | (h[7] & 127) << 14 | (h[8] & 127) << 7 | (h[9] & 127)) + 10, 24 * 1024 * 1024);
  return f.slice(0, n).arrayBuffer();
}
// the browser reads a song's length from its header, without decoding it; analysis corrects it later
function durationOf(blob) {
  return new Promise(res => {
    const a = document.createElement("audio"), u = URL.createObjectURL(blob);
    const done = d => { a.onloadedmetadata = a.onerror = null; a.removeAttribute("src"); a.load(); URL.revokeObjectURL(u); res(isFinite(d) ? d : 0); };
    a.preload = "metadata"; a.onloadedmetadata = () => done(a.duration); a.onerror = () => done(0); a.src = u;
  });
}
async function processAdds() {
  if (adding) return;
  adding = true;
  // four files at a time: each one is mostly waiting on the disk, so several overlap well
  const lane = async () => { while (addQ.length) await addOne(addQ.shift(), batch); };
  await Promise.all([lane(), lane(), lane(), lane()]);
  adding = false;
  const B = batch; batch = null;
  if (B) {
    if (B.added || B.replaced || B.converted || B.relinked) notifyLibraryChange("add");
    if (B.newIds.length && B.newIds.length <= 100) enqueue(B.newIds); // big imports don't flood the playlist
    const parts = [B.converted && `${B.converted} now play from your folder (${mbs(B.freed)} freed)`, B.relinked && `found ${B.relinked} that had moved`, B.added && `added ${B.added}`, B.replaced && `replaced ${B.replaced}`, B.skipped && `skipped ${B.skipped} duplicate${B.skipped === 1 ? "" : "s"}`, B.failed && `${B.failed} couldn't be read`].filter(Boolean);
    if (parts.length) {
      const msg = parts.join(", ").replace(/^./, c => c.toUpperCase()) + "." + (B.added + B.replaced ? " Beats and tempo are worked out in the background." : "");
      if (B.total < 6 || !notify(B.link ? "Folder linked" : "Songs added", msg, "amp")) toast(msg, !B.added && !B.replaced && B.failed > 0);
    } else if (B.link) toast("Your folder is up to date.");
    if (B.after) await B.after(B);
  }
  scheduleRender();
}
async function addOne(item, B) {
  const link = item.link || null; // { folder, path } for a song in a linked folder
  let f = item, title = titleFromName(item.name || (link && link.path.split("/").pop()) || "");
  try {
    if (link) f = await item.handle.getFile();
    setStatus(`Adding song ${Math.min(B.done + 1, B.total)} of ${B.total} · ${title}`, B.done / B.total);
    const tags = readTags(await readHead(f)); title = tags.title || title;
    let dup = findDup(f.size, title, tags.artist, tags.album);
    if (link && dup) { // linking a folder: songs already in the library are matched up instead of added twice
      if (dup.link && dup.link.folder === link.folder && dup.link.path === link.path) { B.known++; B.done++; return; }
      const lost = dup.link && !dup.blob && (B.missing && B.missing.has(dup.id) || !(await listFolders()).some(x => x.id === dup.link.folder));
      if (lost) { // the same song moved within the folder, or restored from a backup: point it at the file here
        await store.updateTrack(dup.id, { link, size: f.size }); if (B.missing) B.missing.delete(dup.id);
        B.relinked++; B.done++; scheduleRender(); return;
      }
      if (dup.blob) { // copied in earlier: play it from the folder instead and drop the copy
        if (!B.convertMode) B.convertMode = await (B.convertAsk || (B.convertAsk = askConvert()));
        if (B.convertMode === "link") {
          const freed = dup.blob.size, u = store.audioCache.get(dup.id); if (u) URL.revokeObjectURL(u); store.audioCache.delete(dup.id); byteCache.delete(dup.id);
          await store.updateTrack(dup.id, { blob: null, link, size: f.size });
          B.converted++; B.freed += freed; B.done++; scheduleRender(); return;
        }
        B.skipped++; B.done++; return;
      }
    }
    // a copy of a song another lane is adding right now counts as a duplicate too
    const same = x => norm(x.title) === norm(title) && (x.size === f.size || (tags.artist && norm(x.artist) === norm(tags.artist)) || (tags.album && norm(x.album) === norm(tags.album)));
    const twin = !dup && (B.inflight || (B.inflight = [])).some(same);
    if (twin) {
      if (!B.dupMode) B.dupMode = await (B.dupAsk || (B.dupAsk = askDup(title)));
      if (B.dupMode !== "both") { B.skipped++; B.done++; return; } // the other copy is already on its way in
    }
    const mine = { title, size: f.size, artist: tags.artist, album: tags.album }; B.inflight.push(mine);
    if (dup) {
      if (!B.dupMode) B.dupMode = await (B.dupAsk || (B.dupAsk = askDup(title))); // only one question, even with four lanes
      if (B.dupMode === "skip") { B.skipped++; B.done++; return; }
    }
    const [duration, cover] = await Promise.all([durationOf(f), tags.cover ? shrinkCover(tags.cover.blob) : null]);
    const meta = { title, artist: tags.artist || "", album: tags.album || "", genre: tags.genre || "", year: tags.year || "", duration: Math.round(duration), bpm: null, size: f.size };
    const t = await store.addTrack({ blob: f, link, mime: mimeFor(f), meta, analysis: null, cover });
    if (dup && B.dupMode === "replace") { // the new copy takes the old one's place in every playlist
      for (const p of store.playlists.filter(p => p.tracks.includes(dup.id))) await store.updatePlaylist(p.id, { tracks: p.tracks.map(id => id === dup.id ? t.id : id) });
      pl = pl.map(id => id === dup.id ? t.id : id);
      if (loadedId === dup.id) loadedId = t.id;
      await store.deleteTrack(dup); B.replaced++;
    } else { B.added++; B.newIds.push(t.id); }
    B.done++; B.inflight.splice(B.inflight.indexOf(mine), 1);
    analyser.enqueue([t.id]);
    scheduleRender();
  } catch (e) {
    B.failed++; B.done++;
    const code = e && e.code;
    if (code === "quota_or_state" || code === "quota_exceeded" || (e && e.name === "QuotaExceededError")) { toast("Your library's storage is full. Delete songs you no longer need, then try again.", true); addQ.length = 0; }
    else if (B.total < 6) toast(`Couldn't add ${title}. Try again.`, true);
  }
}
// redraws are batched to at most one per frame, so a big import doesn't redraw the library for every song
let renderQueued = false, lastRender = 0;
function scheduleRender() {
  if (renderQueued) return; renderQueued = true;
  const go = () => requestAnimationFrame(() => { renderQueued = false; lastRender = performance.now(); renderTree(); renderMl(); renderPl(); });
  const wait = 500 - (performance.now() - lastRender); // at most twice a second
  if (wait > 0) setTimeout(go, wait); else go();
}

// ---------- genre and year for songs added before they were read ----------
// Only the front of each file is read again (where MP3 and FLAC keep their tags); nothing is re-imported.
async function refreshTags() {
  const todo = store.tracks.filter(t => t.genre === undefined && t.blob);
  let n = 0;
  for (const t of todo) {
    try {
      const type = (t.mime || "") + " " + (t.blob.name || "");
      const tags = /mpeg|mp3|flac/i.test(type) ? readTags(await readHead(t.blob)) : {};
      await store.updateTrack(t.id, { genre: tags.genre || "", year: tags.year || t.year || "" });
    } catch (e) { try { await store.updateTrack(t.id, { genre: "" }); } catch (e2) {} }
    if (++n % 50 === 0) scheduleRender();
  }
  if (n) { scheduleRender(); notifyLibraryChange("edit"); }
}

// ---------- background analysis ----------
let analyser = null, analysedSinceNotice = 0, analysedRun = 0;
function startAnalyser() {
  analyser = createAnalyser({
    getBlob: id => { const t = store.tracks.find(x => x.id === id); return t ? fileOf(t) : null; },
    onDone: async (id, a, dur) => {
      const t = store.tracks.find(x => x.id === id); if (!t) return;
      await store.updateTrack(id, { analysis: a, bpm: a.bpm, duration: Math.round(dur) || t.duration });
      anCache.set(id, a);
      if (loadedId === id && !data) { data = normalise(a); beatPtr = 0; resetViz(); setNowPlaying(); }
      analysedRun++;
      if (++analysedSinceNotice >= 25) { analysedSinceNotice = 0; notifyLibraryChange("edit"); }
      scheduleRender();
    },
    onError: async (id, e) => { // can't be analysed (too short, unreadable): keep the song, stop retrying
      const t = store.tracks.find(x => x.id === id);
      if (t) await store.updateTrack(id, { analysis: null, analysisFailed: (e && e.message) || "failed" });
      scheduleRender();
    },
    onIdle: () => {
      if (analysedRun >= 5) notify("Analysis finished", `Beats and tempo worked out for ${analysedRun} songs. The visualiser and tempo playlists are ready.`, "amp");
      analysedRun = 0; analysedSinceNotice = 0; notifyLibraryChange("edit"); scheduleRender(); },
  });
  analyser.enqueue(store.tracks.filter(t => !t.analysis && !t.analysisFailed).map(t => t.id)); // carries on after a reload
}

// a dropped folder is walked all the way down; only music files are kept
async function filesFromEntries(entries) {
  const out = [];
  const walk = async entry => {
    if (entry.isFile) { if (AUDIO_EXT.test(entry.name)) { try { out.push(await new Promise((res, rej) => entry.file(res, rej))); } catch (e) {} } return; }
    if (!entry.isDirectory) return;
    const reader = entry.createReader();
    for (;;) {
      const chunk = await new Promise(res => reader.readEntries(res, () => res([])));
      if (!chunk.length) break;
      for (const c of chunk) await walk(c);
      setStatus(`Searching folders… ${out.length} music file${out.length === 1 ? "" : "s"} found`, null);
    }
  };
  for (const e of entries) await walk(e);
  return out;
}
let dragDepth = 0;
const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
addEventListener("dragenter", e => { if (!hasFiles(e) || !store.canWrite) return; e.preventDefault(); dragDepth++; $("drop").hidden = false; });
addEventListener("dragover", e => { if (hasFiles(e) && store.canWrite) e.preventDefault(); });
addEventListener("dragleave", e => { if (!hasFiles(e)) return; if (--dragDepth <= 0) { dragDepth = 0; $("drop").hidden = true; } });
addEventListener("drop", async e => {
  if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; $("drop").hidden = true;
  if (!store.canWrite) return;
  // entries must be read straight away, before anything waits
  const items = [...(e.dataTransfer.items || [])];
  const handles = linkSupported ? items.map(i => i.getAsFileSystemHandle ? i.getAsFileSystemHandle().catch(() => null) : null) : [];
  const entries = items.map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  const files = [...e.dataTransfer.files];
  if (linkSupported && entries.some(en => en.isDirectory)) {
    const dirs = (await Promise.all(handles)).filter(h => h && h.kind === "directory");
    if (dirs.length) {
      const how = await choose({ title: "Add this folder", text: "Link it to play songs straight from your disk (no space used, and Rescan picks up new songs), or copy the songs into the browser (works even if the folder moves or the drive is unplugged).",
        options: [{ label: "Link the folder", value: "link" }, { label: "Copy songs in", value: "copy" }] });
      if (!how) return;
      if (how === "link") { for (const d of dirs) await linkFolder(d); return; }
    }
  }
  if (entries.some(en => en.isDirectory)) enqueueFiles(await filesFromEntries(entries), "folder");
  else enqueueFiles(files);
});

// requests from Neon OS: the tray's music volume, and songs to play (from Files)
let pendingPlay = null;
addEventListener("neonos:volume", e => { volS.set(e.detail, true); showVol(); save(); });
addEventListener("neonos:play", e => {
  const ids = e.detail.ids || [];
  if (!storeReady) { pendingPlay = ids; return; }
  const ok = ids.filter(id => byId(id)); if (!ok.length) return;
  Eng.ensure(); setPl(ok); playIndex(0);
});

function renderAll() { renderTree(); renderMl(); renderPl(); setNowPlaying(); }

// =================== Neon Orbit visualiser ===================
// drawn with WebGL where the browser has it (core/glow.js), otherwise on a 2D canvas
const canvas = $("viz");
const NEBULA = { base: null, blobs: [{ x: 0.28, y: 0.3, r: 0.6, color: [42, 16, 80, 0.5] }, { x: 0.78, y: 0.72, r: 0.55, color: [61, 11, 58, 0.45] }] };
const glow = createGlow(canvas, { background: OBS ? null : NEBULA }) || createGlow2D(canvas, { background: OBS ? null : NEBULA });
canvas.dataset.renderer = glow.gl ? "webgl" : "2d";
let lastLoud = 0;
const rgbOf = k => COLORS[k] || [1, 3, 5].map(o => parseInt(k.slice(o, o + 2), 16));
function buildSprite() {
  const [r, g, b] = rgbOf(S.color);
  const N = 256, c = document.createElement("canvas"); c.width = c.height = N;
  const x = c.getContext("2d"), grd = x.createRadialGradient(N/2, N/2, 0, N/2, N/2, N/2);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.06, `rgba(${(r+255)/2|0},${(g+255)/2|0},${(b+255)/2|0},1)`);
  grd.addColorStop(0.16, `rgba(${r},${g},${b},0.75)`);
  grd.addColorStop(0.38, `rgba(${r},${g},${b},0.18)`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grd; x.fillRect(0, 0, N, N); void c;
  glow.setColor([r, g, b]);
  document.documentElement.style.setProperty("--ball", `rgb(${r},${g},${b})`);
}
let W = 0, H = 0;
function resize() {
  const r = $("stage").getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
  W = Math.max(1, r.width); H = Math.max(1, r.height);
  glow.resize(W, H, d);
  const m = $("mini"), mr = m.getBoundingClientRect(); m.width = Math.max(1, Math.round(mr.width * d)); m.height = Math.max(1, Math.round(mr.height * d));
}
if (window.ResizeObserver) { const ro = new ResizeObserver(() => { resize(); drawEqGraph(); }); ro.observe($("stage")); ro.observe($("mini")); ro.observe($("eqGraph")); } else addEventListener("resize", resize);

function envAt(b, t) { const f = (t - data.offset) * data.fps, i = Math.floor(f), a = b.envArr; if (i < 0) return 0; if (i >= a.length - 1) return a[a.length - 1] / 255; const k = f - i; return (a[i] * (1 - k) + a[i + 1] * k) / 255; }
function pulseAt(b, t) {
  const on = b.onsets;
  while (b.ptr > 0 && on[b.ptr] > t) b.ptr--;
  while (b.ptr < on.length - 1 && on[b.ptr + 1] <= t) b.ptr++;
  let p = 0;
  for (let j = b.ptr; j >= 0 && j > b.ptr - 3; j--) { const dt = t - on[j]; if (dt >= 0) p = Math.max(p, b.strength[j] * Math.exp(-dt / 0.16)); }
  return p;
}
let beatPtr = 0;
function beatPos(t) {
  const B = data.beats; if (!B.length) return t * 2;
  while (beatPtr > 0 && B[beatPtr] > t) beatPtr--;
  while (beatPtr < B.length - 1 && B[beatPtr + 1] <= t) beatPtr++;
  const period = 60 / data.bpm;
  if (t < B[0]) return (t - B[0]) / period;
  const a = B[beatPtr], b = beatPtr < B.length - 1 ? B[beatPtr + 1] : a + period;
  return beatPtr + Math.min(1, (t - a) / (b - a));
}
const ease = x => x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3) / 2, easeOut = x => 1 - Math.pow(1 - x, 3), lerp = (a, b, k) => a + (b - a) * k;
const POSES = [[0.15, 0, 1], [1.05, 0.25, 1.05], [1.56, 0, 1.25], [0.85, -0.6, 0.95], [1.56, 0.35, 1.15], [0.5, 0.9, 1]];
function pose(bp) {
  const seg = Math.round(lerp(16, 4, S.chaos)), s = Math.floor(bp / seg), f = bp - s * seg, L = POSES.length;
  const A = POSES[((s % L) + L) % L], B = POSES[(((s + 1) % L) + L) % L], ml = Math.max(1, seg / 4);
  const k = f < seg - ml ? 0 : ease((f - (seg - ml)) / ml);
  return [lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k)];
}
const PER_BAND = 2, BALLS = 12;
let hist = [], phys = [], shake = { x: 0, y: 0, vx: 0, vy: 0 }, spin = 0, lastSpinBp = null;
function resetViz() {
  hist = Array.from({ length: BALLS }, () => []);
  phys = Array.from({ length: BALLS }, () => ({ r: 0, vr: 0, a: 0, va: 0, z: 0, vz: 0 }));
  shake = { x: 0, y: 0, vx: 0, vy: 0 }; lastSpinBp = null;
  if (data) data.bands.forEach(b => { b.fired = -1; });
}
const rnd = (a, b) => a + Math.random() * (b - a), sgn = () => (Math.random() < 0.5 ? -1 : 1);
resetViz();

const miniCtx = $("mini").getContext("2d");
const peaks = new Float32Array(19);
function drawMini(envs, playing) {
  const c = $("mini"), w = c.width, h = c.height, g = miniCtx;
  g.clearRect(0, 0, w, h);
  if (S.mini === "off") return;
  const col = `rgb(${rgbOf(S.color).join(",")})`;
  g.fillStyle = col; g.strokeStyle = col;
  if (S.mini === "spec") {
    const n = 19, gap = Math.max(1, w / 120), bw = (w - gap * (n - 1)) / n;
    let vals;
    if (Eng.nodes && playing) {
      Eng.nodes.an.getByteFrequencyData(Eng.freq);
      const bins = Eng.freq.length, nyq = Eng.ctx.sampleRate / 2;
      vals = Array.from({ length: n }, (_, i) => {
        const f0 = 40 * Math.pow(16000 / 40, i / n), f1 = 40 * Math.pow(16000 / 40, (i + 1) / n);
        const a = Math.floor(f0 / nyq * bins), b = Math.max(a + 1, Math.floor(f1 / nyq * bins));
        let m = 0; for (let k = a; k < b; k++) m = Math.max(m, Eng.freq[k]);
        return m / 255;
      });
    } else vals = Array.from({ length: n }, () => 0);
    for (let i = 0; i < n; i++) {
      const v = vals[i], bh = Math.round(v * (h - 3));
      peaks[i] = Math.max(peaks[i] - 0.012, v);
      const x = i * (bw + gap);
      g.globalAlpha = 0.9; g.fillRect(x, h - bh, bw, bh);
      g.globalAlpha = 1; g.fillRect(x, h - Math.round(peaks[i] * (h - 3)) - 2, bw, Math.max(1, h / 22));
    }
  } else if (Eng.nodes && playing) {
    Eng.nodes.an.getByteTimeDomainData(Eng.wave);
    g.lineWidth = Math.max(1, h / 20); g.beginPath();
    const N = Eng.wave.length;
    for (let i = 0; i < 160; i++) { const v = Eng.wave[Math.floor(i / 160 * N)] / 128 - 1; const x = i / 159 * w, y = h / 2 + v * (h / 2 - 2); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  } else { g.globalAlpha = .5; g.fillRect(0, h / 2, w, Math.max(1, h / 20)); g.globalAlpha = 1; }
  void envs;
}

let idleT = 0, lastNow = performance.now(), lastUi = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastNow) / 1000); lastNow = now;
  const playing = !!data && Eng.state === "playing";
  const t = Math.max(0, Eng.time() - (playing ? Eng.latency() : 0));
  if (!playing) idleT += dt;
  const chaos = S.chaos;

  // marquee
  const mq = $("marqueeText");
  if (!reduced && mq) { const half = mq.scrollWidth / 2; if (half > $("marquee").clientWidth - 12) { marqueeX = (marqueeX + dt * 42) % half; mq.style.transform = `translateX(${-marqueeX}px)`; } else mq.style.transform = ""; }

  glow.begin(reduced ? 0 : now / 1000, reduced ? 0 : lastLoud);
  const nb = 6, n = 12;
  let bp, envs, pulses;
  if (data && (playing || t > 0.05)) { bp = beatPos(t); envs = data.bands.map(b => envAt(b, t)); pulses = data.bands.map(b => pulseAt(b, t)); }
  else { bp = idleT * ((data ? data.bpm : 110) / 60) * 0.5; envs = BAND_NAMES.map((_, i) => 0.35 + 0.15 * Math.sin(idleT * 1.3 + i)); pulses = BAND_NAMES.map(() => 0); }
  if (data && !playing && t > 0.05) bp += Math.sin(idleT * 0.8) * 0.05;
  const bi = Math.floor(bp), bf = bp - bi;
  const spinPos = 0.55 * bp + 0.45 * (bi + (reduced ? bf : easeOut(Math.min(1, bf * 1.6))));
  if (lastSpinBp !== null) { let d = spinPos - lastSpinBp; if (Math.abs(d) > 2) d = 0; const dir = chaos > 0.35 && Math.floor(bp / 16) % 2 ? -1 : 1; spin += d * dir * (Math.PI * 2 / lerp(8, 3.5, chaos)); }
  lastSpinBp = spinPos;
  if (playing && !reduced) data.bands.forEach((b, i) => {
    const on = b.onsets, j = b.ptr;
    if (j !== b.fired && on[j] <= t && t - on[j] < 0.1) {
      b.fired = j; const st = b.strength[j] * chaos;
      for (let c = 0; c < PER_BAND; c++) { const ph = phys[i + c * nb]; ph.vr += sgn() * st * rnd(2.5, 5.5); ph.va += sgn() * st * rnd(2, 5); ph.vz += sgn() * st * rnd(2, 5); }
      if (i === 0 && st > 0.25) { shake.vx += sgn() * st * rnd(120, 260); shake.vy += sgn() * st * rnd(120, 260); }
    }
  });
  const h2 = Math.min(dt, 0.033);
  phys.forEach(ph => { ph.vr += (-90 * ph.r - 9 * ph.vr) * h2; ph.r += ph.vr * h2; ph.va += (-40 * ph.a - 5 * ph.va) * h2; ph.a += ph.va * h2; ph.vz += (-70 * ph.z - 8 * ph.vz) * h2; ph.z += ph.vz * h2; });
  shake.vx += (-400 * shake.x - 28 * shake.vx) * h2; shake.x += shake.vx * h2; shake.vy += (-400 * shake.y - 28 * shake.vy) * h2; shake.y += shake.vy * h2;
  const [tilt, roll, rscale] = pose(bp);
  const loud = envs.reduce((a, b) => a + b, 0) / nb;
  const R = Math.min(W * 0.8, H * 1.3) * 0.22 * rscale * (0.92 + 0.12 * loud + (reduced ? 0 : 0.06 * pulses[0]));
  const cx = W / 2 + shake.x, cy = H / 2 + shake.y;
  const yaw = chaos * 0.7 * Math.sin(bp * 0.37) + chaos * 0.3 * Math.sin(bp * 0.91);
  const cY = Math.cos(yaw), sY = Math.sin(yaw), cT = Math.cos(tilt), sT = Math.sin(tilt), cR = Math.cos(roll), sR = Math.sin(roll), FOV = 3.2;
  const TRAIL = Math.round(lerp(22, 40, chaos)), sc = Math.min(1.15, Math.max(0.6, H / 520));
  lastLoud = playing ? loud : 0;
  const STEP = glow.gl ? 2 : 4, MAXS = glow.gl ? 12 : 6; // WebGL has room for smoother trails
  for (let i = 0; i < n; i++) {
    const ph = phys[i], e = envs[i % nb], pu = pulses[i % nb];
    const a = spin + i * (Math.PI * 2 / n) + (0.12 + 0.5 * chaos) * Math.sin(bp * (0.5 + 0.13 * i) + i * 1.7) * e + ph.a;
    const rr = 1 + ph.r + chaos * 0.18 * Math.sin(bp * 1.3 + i * 2.1) * e;
    const x0 = Math.cos(a) * rr, y = Math.sin(a) * rr, z0 = ph.z;
    const x = x0 * cY + z0 * sY, z = -x0 * sY + z0 * cY, y2 = y * cT - z * sT, z2 = y * sT + z * cT;
    const x3 = x * cR - y2 * sR, y3 = x * sR + y2 * cR, persp = FOV / Math.max(0.6, FOV + z2);
    const px = cx + x3 * R * persp, py = cy + y3 * R * persp;
    const bright = Math.min(1.25, 0.12 + 0.95 * e + 0.6 * pu) * (0.7 + 0.3 * (1 - (z2 + 1) / 2));
    const size = (13 + 24 * e + 30 * pu) * persp * sc;
    const hh = hist[i]; hh.unshift({ x: px, y: py, s: size, b: bright }); if (hh.length > TRAIL) hh.length = TRAIL;
    for (let k = hh.length - 1; k >= 1; k--) {
      const q0 = hh[k], q1 = hh[k - 1], fade = 1 - k / TRAIL, dist = Math.hypot(q1.x - q0.x, q1.y - q0.y);
      const steps = Math.min(MAXS, Math.ceil(dist / STEP)) || 1, even = (Math.min(6, Math.ceil(dist / 4)) || 1) / steps; // same total light, more dots
      const al = Math.min(1, q1.b * fade * fade * 0.3) * even;
      for (let s = 0; s < steps; s++) { const u = s / steps, sz = lerp(q0.s, q1.s, u) * (0.35 + 0.5 * fade) * 2.2; glow.dot(lerp(q0.x, q1.x, u), lerp(q0.y, q1.y, u), sz, al); }
    }
    glow.dot(px, py, size * 5.5, Math.min(1, bright * 0.75));
    glow.dot(px, py, size * 1.6, Math.min(1, 0.35 + bright));
  }
  glow.end();

  if (loadedId && countedId !== loadedId && Eng.state === "playing" && Eng.time() > Math.min(30, Eng.duration * 0.5)) {
    countedId = loadedId; const t = byId(loadedId);
    if (t && !t.builtin && store.canWrite) store.updateTrack(t.id, { plays: (t.plays || 0) + 1, lastPlayed: new Date().toISOString() }).then(() => { if (mlView.type === "smart") scheduleRender(); else renderTree(); }).catch(() => {});
  }
  if (!OBS && now - lastUi > 33) {
    lastUi = now;
    drawMini(envs, Eng.state === "playing");
    const beatIdx = playing ? ((Math.floor(bp) % 4) + 4) % 4 : -1;
    for (let k = 0; k < 4; k++) $("beat" + k).classList.toggle("on", k === beatIdx && bp - Math.floor(bp) < 0.5);
    const bt = $("bigTime");
    if (Eng.buf && Eng.state !== "stopped") { const tt = Eng.time(); bt.textContent = S.remain ? "-" + fmt2(Eng.duration - tt) : fmt2(tt); bt.classList.remove("dim"); }
    else { bt.textContent = "00:00"; bt.classList.add("dim"); }
    bt.classList.toggle("blink", Eng.state === "paused");
    if (Eng.state === "paused") bt.style.opacity = (Math.floor(now / 500) % 2) ? "0.25" : "1"; else bt.style.opacity = "";
    if (!seekS.dragging) seekS.set(Eng.buf && Eng.duration ? Eng.time() / Eng.duration : 0);
    updatePlTime();
    const icn = loading ? "next" : stateIcons[Eng.state];
    if ($("stateIcon").dataset.s !== icn) { $("stateIcon").dataset.s = icn; $("stateIcon").innerHTML = icon(icn); }
    tellOs();
  }
  requestAnimationFrame(frame);
}

// =================== start ===================
async function start() {
  if (!window.neonOsShell) { applyTheme(); onTheme(applyTheme); } // on its own page; on the desktop the shell does this
  onTheme(t => { if (t.ball === S.color) return; S.color = t.ball; buildSprite(); syncSwatches(); drawEqGraph(); });
  buildSprite(); syncSwatches(); renderModes(); renderWindows(); applyEq();
  renderAll(); resize();
  requestAnimationFrame(frame);
  const st = makeLocalStore();
  store = st;
  try { await store.init(() => { if (storeReady) { renderTree(); renderMl(); renderPl(); } }); } catch (e) {}
  storeReady = true;
  startAnalyser();
  checkAccess();
  refreshTags();
  renderAll();
  if (pendingPlay) { const ids = pendingPlay.filter(id => byId(id)); pendingPlay = null; if (ids.length) { Eng.ensure(); setPl(ids); playIndex(0); } }
  onLibraryChange(async reason => {
    try { await store.init(); } catch (e) {}
    // a song deleted elsewhere drops out of the playlist too
    const gone = pl.map((id, i) => byId(id) ? -1 : i).filter(i => i >= 0);
    if (gone.length) removePlIdx(gone);
    renderAll(); if (curTrack()) setNowPlaying();
    if (reason === "restore") toast("Library restored");
  });
  if (OBS) {
    let ids = library().map(t => t.id), start = 0;
    if (obsM[1]) { const p = playlistsSorted()[+obsM[2] - 1]; if (p) ids = p.tracks.filter(id => byId(id)); }
    else if (obsM[2]) start = clamp(+obsM[2] - 1, 0, ids.length - 1);
    S.repeat = "all";
    if (ids.length) { setPl(ids); playIndex(start); }
    return;
  }
  pl = (S.pl || []).filter(id => byId(id));
  const prevId = (S.pl || [])[S.cur];
  cur = prevId && byId(prevId) ? pl.indexOf(prevId) : -1;
  renderPl();
  if (cur >= 0) playIndex(cur, { autoplay: false, at: S.pos || 0, fromHistory: true });
  else if (!pl.length) { pl = library().map(t => t.id); renderPl(); }
}
start();
