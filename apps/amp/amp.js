// Neon Orbit Amp: the player app of Neon OS
import { icon } from "../../style-kit/icons.js";
import { esc, clamp, toast, dialog, openMenu, closePop, Slider } from "../../style-kit/ui.js";
import { Eng } from "../../core/engine.js";
import { analyseSamples, decodeToMono } from "../../core/analysis.js";
import { readTags, titleFromName, shrinkCover } from "../../core/tags.js";
import { makeLocalStore } from "../../core/storage.js";
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
let mlView = { type: "all" }, mlSort = { key: null, dir: 1 }, mlSearch = "", mlSel = new Set(), mlAnchor = null;
function mlIds() {
  if (mlView.type === "pl") { const p = plById(mlView.id); return p ? p.tracks.filter(id => byId(id)) : []; }
  return library().map(t => t.id);
}
function mlVisible() {
  let ids = mlIds();
  const q = mlSearch.trim().toLowerCase();
  if (q) ids = ids.filter(id => { const t = byId(id); return [t.title, t.artist, t.album].some(v => (v || "").toLowerCase().includes(q)); });
  if (mlSort.key) {
    const k = mlSort.key, d = mlSort.dir;
    ids = ids.slice().sort((a, b) => {
      const A = byId(a), B = byId(b);
      if (k === "bpm" || k === "duration") return ((A[k] || 0) - (B[k] || 0)) * d;
      return (A[k] || "").localeCompare(B[k] || "", undefined, { sensitivity: "base" }) * d;
    });
  }
  return ids;
}
function renderTree() {
  $("allCount").textContent = library().length;
  $("treeAll").setAttribute("aria-current", String(mlView.type === "all"));
  $("treePls").innerHTML = playlistsSorted().map(p => `<button class="tree-item" data-pl="${esc(p.id)}" aria-current="${mlView.type === "pl" && mlView.id === p.id}">${icon("playlist")}<span class="name">${esc(p.name)}</span><span class="n">${p.tracks.filter(id => byId(id)).length}</span></button>`).join("");
  $("treeNew").hidden = !store.canWrite;
  $("mlAdd").hidden = !store.canWrite;
}
$("treePls").addEventListener("click", e => { const b = e.target.closest("[data-pl]"); if (b) setMlView({ type: "pl", id: b.dataset.pl }); });
$("treePls").addEventListener("dblclick", e => { const b = e.target.closest("[data-pl]"); if (!b) return; const p = plById(b.dataset.pl); if (p) { Eng.ensure(); setPl(p.tracks.filter(id => byId(id))); playIndex(S.shuffle ? Math.floor(Math.random() * pl.length) : 0); } });
$("treeAll").addEventListener("click", () => setMlView({ type: "all" }));
function setMlView(v) { mlView = v; mlSel.clear(); mlSearch = ""; $("mlSearch").value = ""; mlSort = { key: null, dir: 1 }; renderTree(); renderMl(); $("mlTable").scrollTop = 0; }

function renderMl() {
  const p = mlView.type === "pl" ? plById(mlView.id) : null;
  if (mlView.type === "pl" && !p) mlView = { type: "all" };
  $("mlTitle").textContent = p ? p.name : "All songs";
  $("mlRename").hidden = $("mlDelete").hidden = !(p && store.canWrite);
  document.querySelectorAll(".thead [data-sort]").forEach(b => {
    const on = mlSort.key === b.dataset.sort;
    b.setAttribute("aria-sort", on ? (mlSort.dir > 0 ? "ascending" : "descending") : "none");
    b.dataset.label = b.dataset.label || b.textContent;
    b.textContent = b.dataset.label + (on ? (mlSort.dir > 0 ? " ▴" : " ▾") : "");
  });
  const ids = mlVisible();
  const curId = curTrack() ? curTrack().id : null;
  if (!ids.length) {
    $("mlRows").innerHTML = mlSearch.trim() ? `<div class="ml-empty"><b>No songs match “${esc(mlSearch.trim())}”.</b>Try a title, artist or album.</div>`
      : p ? `<div class="ml-empty"><b>This playlist is empty.</b>Select songs in All songs, then use Send to.</div>`
      : `<div class="ml-empty"><b>No songs yet.</b>Use Add files, or drag songs onto the window.</div>`;
  } else {
    $("mlRows").innerHTML = ids.map(id => {
      const t = byId(id);
      return `<div class="trow${mlSel.has(id) ? " sel" : ""}${id === curId ? " cur" : ""}" role="row" data-id="${esc(id)}" aria-selected="${mlSel.has(id)}">
        <span role="gridcell">${esc(t.title)}</span><span class="d" role="gridcell">${esc(t.artist || "")}</span><span class="d" role="gridcell">${esc(t.album || "")}</span>
        <span class="num r" role="gridcell">${t.bpm ? Math.round(t.bpm) : ""}</span><span class="num r" role="gridcell">${fmt(t.duration)}</span></div>`;
    }).join("");
  }
  const n = mlIds().length, tot = mlIds().reduce((s, id) => s + (byId(id).duration || 0), 0);
  if (!adding) setStatus(`${n} ${n === 1 ? "song" : "songs"}, ${Math.round(tot / 60)} min. ${storeNote()}`);
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
  const row = e.target.closest(".trow"); if (!row) return;
  const id = row.dataset.id, ids = mlVisible();
  if (e.shiftKey && mlAnchor) { const a = ids.indexOf(mlAnchor), b = ids.indexOf(id); mlSel = new Set(ids.slice(Math.min(a, b), Math.max(a, b) + 1)); }
  else if (e.ctrlKey || e.metaKey) { mlSel.has(id) ? mlSel.delete(id) : mlSel.add(id); mlAnchor = id; }
  else { mlSel = new Set([id]); mlAnchor = id; }
  syncMlSel();
});
function syncMlSel() { document.querySelectorAll("#mlRows .trow").forEach(r => { const on = mlSel.has(r.dataset.id); r.classList.toggle("sel", on); r.setAttribute("aria-selected", String(on)); }); }
$("mlRows").addEventListener("dblclick", e => {
  const row = e.target.closest(".trow"); if (!row) return;
  Eng.ensure();
  const ids = mlVisible();
  setPl(ids); playIndex(ids.indexOf(row.dataset.id));
});
$("mlTable").addEventListener("keydown", e => {
  const ids = mlVisible(); if (!ids.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    const i = clamp(ids.indexOf(mlAnchor) + (e.key === "ArrowDown" ? 1 : -1), 0, ids.length - 1);
    mlSel = new Set([ids[i]]); mlAnchor = ids[i]; renderMl();
    const r = $("mlRows").querySelector(`[data-id="${CSS.escape(ids[i])}"]`); if (r) r.scrollIntoView({ block: "nearest" });
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
  if (!mlSel.has(id)) { mlSel = new Set([id]); mlAnchor = id; renderMl(); }
  openMenu(null, trackMenu(mlVisible().filter(x => mlSel.has(x))), { x: e.clientX, y: e.clientY });
});
document.querySelectorAll(".thead [data-sort]").forEach(b => b.addEventListener("click", () => {
  const k = b.dataset.sort;
  if (mlSort.key !== k) mlSort = { key: k, dir: 1 }; else if (mlSort.dir === 1) mlSort.dir = -1; else mlSort = { key: null, dir: 1 };
  renderMl();
}));
$("mlSearch").addEventListener("input", e => { mlSearch = e.target.value; renderMl(); });
$("mlAdd").addEventListener("click", () => $("fileIn").click());
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
  const r = await dialog({ title: "Edit details", fields: [{ label: "Title", value: t.title }, { label: "Artist", value: t.artist }, { label: "Album", value: t.album }], confirm: "Save" });
  if (!r) return;
  try { await store.updateTrack(t.id, { title: r[0] || t.title, artist: r[1], album: r[2] }); renderAll(); if (curTrack() === t) setNowPlaying(); }
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
    mlSel.clear(); renderAll();
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
  } else ab = await store.audioBytes(t);
  byteCache.set(t.id, ab);
  if (byteCache.size > 3) byteCache.delete(byteCache.keys().next().value);
  return ab;
}
async function getAnalysis(t) {
  if (anCache.has(t.id)) return anCache.get(t.id);
  const a = t.builtin ? JSON.parse(embedded("an-" + t.key)) : await store.analysis(t);
  anCache.set(t.id, a); return a;
}
function normalise(raw) {
  const d = JSON.parse(JSON.stringify(raw));
  const off = typeof d.offset === "number" ? d.offset : 1024 / 22050;
  d.offset = off; d.beats = d.beats.map(b => b + off);
  d.bands.forEach(b => { b.envArr = decode(b.env); b.ptr = 0; b.fired = -1; b.onsets = b.onsets.map(o => o + off); });
  return d;
}
function unloadTrack() { Eng.stop(); Eng.buf = null; loadedId = null; data = null; setNowPlaying(); }
async function playIndex(i, { autoplay = true, at = 0, fromHistory = false } = {}) {
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
    let buf;
    try { buf = await Eng.decode(ab); } catch (e) { throw new Error("decode"); }
    if (seq !== loadSeq) return;
    Eng.setBuffer(buf); loadedId = t.id;
    data = normalise(an); beatPtr = 0; resetViz();
    t.kbps = Math.round(ab.byteLength * 8 / buf.duration / 1000);
    loading = false;
    setNowPlaying();
    if (autoplay) { Eng.play(at); checkRunning(); } else { Eng.offset = at; }
    save();
  } catch (e) {
    if (seq !== loadSeq) return;
    loading = false; setNowPlaying();
    const m = e && e.message;
    toast(m === "no_webaudio" ? "This browser can't play audio here. Try a current version of Chrome, Edge or Firefox."
      : m === "decode" ? `Couldn't play ${t.title}: this browser can't decode that file.`
      : m === "missing_file" ? `Couldn't find ${t.src}. Keep the song files in the same folder as the page.`
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
  document.title = t && Eng.state === "playing" ? `${t.title} · Neon Orbit Amp` : "Neon Orbit Amp";
  if ("mediaSession" in navigator && t) { try { navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist || "", album: t.album || "" }); } catch (e) {} }
}
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

const volS = Slider($("vol"), { min: 0, max: 1, step: 0.01, value: S.vol, label: "Volume", text: v => Math.round(v * 100) + "%", onInput: v => { S.vol = v; Eng.setVolume(v); }, onChange: save });
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
  document.querySelectorAll("[data-shade]").forEach(b => { const w = $(b.dataset.shade); w.classList.toggle("shaded", !!S.shade[b.dataset.shade]); b.setAttribute("aria-expanded", String(!S.shade[b.dataset.shade])); });
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
document.querySelectorAll(".swatch").forEach(s => s.addEventListener("click", () => { S.color = s.dataset.c; buildSprite(); syncSwatches(); drawEqGraph(); save(); }));
$("customColor").addEventListener("input", e => { S.color = e.target.value; buildSprite(); syncSwatches(); drawEqGraph(); save(); });
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
  else if (!inList && (e.key === "ArrowUp" || e.key === "ArrowDown")) { volS.set(S.vol + (e.key === "ArrowUp" ? 0.05 : -0.05), true); save(); e.preventDefault(); }
});
if ("mediaSession" in navigator) {
  const h = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (e) {} };
  h("play", play); h("pause", pause); h("nexttrack", () => next(false)); h("previoustrack", prev); h("stop", stop);
}

// ---------- adding songs ----------
const addQ = []; let adding = false, addDone = 0;
const AUDIO_EXT = /\.(mp3|flac|wav|ogg|oga|m4a|aac|opus|webm)$/i;
const mimeFor = f => f.type && f.type.startsWith("audio/") ? f.type : ({ mp3: "audio/mpeg", flac: "audio/flac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", opus: "audio/ogg", webm: "audio/webm" }[(f.name.split(".").pop() || "").toLowerCase()] || "audio/mpeg");
function enqueueFiles(files) {
  const list = [...files].filter(f => (f.type || "").startsWith("audio/") || AUDIO_EXT.test(f.name));
  if (!list.length) { toast("Those files aren't audio. Try MP3, FLAC, WAV, OGG or M4A.", true); return; }
  if (!store.canWrite) { toast("This library can't save songs here.", true); return; }
  addQ.push(...list); processAdds();
}
$("fileIn").addEventListener("change", e => { enqueueFiles(e.target.files); e.target.value = ""; });
async function processAdds() {
  if (adding) return;
  adding = true; addDone = 0;
  const newIds = [];
  while (addQ.length) {
    const f = addQ.shift();
    const w = () => addQ.length ? ` (${addQ.length} waiting)` : "";
    let title = titleFromName(f.name);
    try {
      setStatus(`Reading ${title}${w()}`, 0.02);
      const buf = await f.arrayBuffer();
      const tags = readTags(buf); title = tags.title || title;
      if (library().find(t => !t.builtin && t.size === f.size && t.title === title)) { toast(`${title} is already in your library`); continue; }
      setStatus(`Decoding ${title}${w()}`, 0.05);
      let dec; try { dec = await decodeToMono(buf); } catch (e) { throw new Error("decode"); }
      const analysis = await analyseSamples(dec.y, dec.sr, v => setStatus(`Finding the beat in ${title}${w()}`, 0.1 + v * 0.6));
      const cover = tags.cover ? await shrinkCover(tags.cover.blob) : null;
      const meta = { title, artist: tags.artist || "", album: tags.album || "", duration: Math.round(dec.duration), bpm: analysis.bpm, size: f.size };
      setStatus(`Saving ${title}${w()}`, 0.72);
      const t = await store.addTrack({ buf, mime: mimeFor(f), meta, analysis, cover, onProgress: v => setStatus(`Saving ${title}${w()}`, 0.72 + 0.28 * v) });
      anCache.set(t.id, analysis); byteCache.set(t.id, buf);
      newIds.push(t.id); addDone++;
      renderTree(); renderMl();
    } catch (e) {
      const code = e && e.code;
      toast(e && e.message === "decode" ? `${title} couldn't be read as audio. Try an MP3, WAV or FLAC.`
        : e && e.message === "too_short" ? `${title} is too short to find a beat.`
        : code === "quota_or_state" || code === "quota_exceeded" || (e && e.name === "QuotaExceededError") ? "Your library's storage is full. Delete songs you no longer need, then try again."
        : code === "too_large" ? `${title} is too large to save. Try an MP3 version.`
        : code === "rate_limited" ? "Too many uploads at once. Wait a moment and add the rest again."
        : `Couldn't add ${title}. Try again.`, true);
    }
  }
  adding = false;
  if (newIds.length) { enqueue(newIds); toast(addDone === 1 ? "Added 1 song to the library and playlist" : `Added ${addDone} songs to the library and playlist`); }
  renderMl();
}
let dragDepth = 0;
const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
addEventListener("dragenter", e => { if (!hasFiles(e) || !store.canWrite) return; e.preventDefault(); dragDepth++; $("drop").hidden = false; });
addEventListener("dragover", e => { if (hasFiles(e) && store.canWrite) e.preventDefault(); });
addEventListener("dragleave", e => { if (!hasFiles(e)) return; if (--dragDepth <= 0) { dragDepth = 0; $("drop").hidden = true; } });
addEventListener("drop", e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; $("drop").hidden = true; if (store.canWrite) enqueueFiles(e.dataTransfer.files); });

function renderAll() { renderTree(); renderMl(); renderPl(); setNowPlaying(); }

// =================== Neon Orbit visualiser ===================
const canvas = $("viz"), ctx = canvas.getContext("2d");
let sprite = null;
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
  x.fillStyle = grd; x.fillRect(0, 0, N, N); sprite = c;
  document.documentElement.style.setProperty("--ball", `rgb(${r},${g},${b})`);
}
let W = 0, H = 0;
function resize() {
  const r = $("stage").getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
  W = Math.max(1, r.width); H = Math.max(1, r.height);
  canvas.width = Math.round(W * d); canvas.height = Math.round(H * d); ctx.setTransform(d, 0, 0, d, 0, 0);
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

  ctx.globalCompositeOperation = "source-over"; ctx.clearRect(0, 0, W, H);
  if (!OBS) {
    const g1 = ctx.createRadialGradient(W*0.28, H*0.3, 0, W*0.28, H*0.3, Math.max(W, H)*0.6);
    g1.addColorStop(0, "rgba(42,16,80,0.5)"); g1.addColorStop(1, "rgba(6,4,11,0)"); ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
    const g2 = ctx.createRadialGradient(W*0.78, H*0.72, 0, W*0.78, H*0.72, Math.max(W, H)*0.55);
    g2.addColorStop(0, "rgba(61,11,58,0.45)"); g2.addColorStop(1, "rgba(6,4,11,0)"); ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
  }
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
  ctx.globalCompositeOperation = "lighter";
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
      const q0 = hh[k], q1 = hh[k - 1], fade = 1 - k / TRAIL, steps = Math.min(6, Math.ceil(Math.hypot(q1.x - q0.x, q1.y - q0.y) / 4)) || 1;
      for (let s = 0; s < steps; s++) { const u = s / steps, sz = lerp(q0.s, q1.s, u) * (0.35 + 0.5 * fade) * 2.2; ctx.globalAlpha = Math.min(1, q1.b * fade * fade * 0.3); ctx.drawImage(sprite, lerp(q0.x, q1.x, u) - sz / 2, lerp(q0.y, q1.y, u) - sz / 2, sz, sz); }
    }
    const halo = size * 5.5; ctx.globalAlpha = Math.min(1, bright * 0.75); ctx.drawImage(sprite, px - halo / 2, py - halo / 2, halo, halo);
    const core = size * 1.6; ctx.globalAlpha = Math.min(1, 0.35 + bright); ctx.drawImage(sprite, px - core / 2, py - core / 2, core, core);
  }
  ctx.globalAlpha = 1;

  if (!OBS && now - lastUi > 33) {
    lastUi = now;
    drawMini(envs, playing);
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
  }
  requestAnimationFrame(frame);
}

// =================== start ===================
async function start() {
  buildSprite(); syncSwatches(); renderModes(); renderWindows(); applyEq();
  renderAll(); resize();
  requestAnimationFrame(frame);
  const st = makeLocalStore();
  store = st;
  try { await store.init(() => { if (storeReady) { renderTree(); renderMl(); renderPl(); } }); } catch (e) {}
  storeReady = true;
  renderAll();
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
