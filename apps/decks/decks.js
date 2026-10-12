// Decks: two-deck DJ mixer for Neon OS
// Songs come from the shared library. Each deck has a waveform drawn from Amp's beat analysis, play, cue, a
// four-beat loop, pitch (tempo) ±8%, and Sync, which matches tempo and lines the beats up with the other deck.
// The mixer has three-band EQ and a fader per deck, an equal-power crossfader, master volume and mix recording.
import "../../core/os-link.js";
import { applyTheme, onTheme } from "../../core/theme.js";
import { openDb, all, put, onLibraryChange, notifyLibraryChange } from "../../core/backup.js";
import { buildGroups, sortSongs, listState, viewSongs, viewGroups, viewTitle, isGroupView, openGroup, parentView, searchSongs, searchGroups, groupNote } from "../../core/library.js";
import { treeHTML, treeClick, treeIcon, wireSortHead } from "../../core/library-tree.js";
import { vlist } from "../../style-kit/vlist.js";
import { icon } from "../../style-kit/icons.js";
import { Slider, toast, esc, dialog } from "../../style-kit/ui.js";
import { notify } from "../../core/notify.js";
import { fileOf } from "../../core/linked.js";
import { saveTarget, download } from "../../core/wav.js";
applyTheme(); onTheme(applyTheme);

const $ = id => document.getElementById(id);
const fmt = s => { s = Math.max(0, s || 0); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`; };
const b64 = s => { const t = atob(s), a = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) a[i] = t.charCodeAt(i); return a; };

// ---------- audio graph ----------
let ctx = null, master = null, recDest = null;
const D = {}; // deck state by "A" / "B"
function ensure() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);
    recDest = ctx.createMediaStreamDestination(); master.connect(recDest);
    for (const k of ["A", "B"]) {
      const d = D[k];
      d.low = ctx.createBiquadFilter(); d.low.type = "lowshelf"; d.low.frequency.value = 250;
      d.mid = ctx.createBiquadFilter(); d.mid.type = "peaking"; d.mid.frequency.value = 1000; d.mid.Q.value = 0.8;
      d.hi = ctx.createBiquadFilter(); d.hi.type = "highshelf"; d.hi.frequency.value = 4000;
      d.fader = ctx.createGain(); d.xf = ctx.createGain(); d.an = ctx.createAnalyser(); d.an.fftSize = 256;
      d.low.connect(d.mid); d.mid.connect(d.hi); d.hi.connect(d.fader); d.fader.connect(d.xf); d.xf.connect(master); d.fader.connect(d.an);
      d.meterBuf = new Uint8Array(d.an.fftSize);
    }
    applyMix();
  }
  if (ctx.state !== "running") ctx.resume().catch(() => {});
  return ctx;
}
// the mixer, the songs on each deck and their pitch are remembered between visits (saved as you go)
const DKEY = "neon-os:decks";
const mix = { xfade: 0.5, master: 0.85, fader: { A: 0.85, B: 0.85 }, eq: { "A-hi": 0, "A-mid": 0, "A-low": 0, "B-hi": 0, "B-mid": 0, "B-low": 0 } };
let saved = {}; try { saved = JSON.parse(localStorage.getItem(DKEY) || "{}") || {}; } catch (e) {}
if (saved.mix) { Object.assign(mix, saved.mix, { fader: { ...mix.fader, ...(saved.mix.fader || {}) }, eq: { ...mix.eq, ...(saved.mix.eq || {}) } }); }
let saveT = null;
function saveDecks(now) {
  clearTimeout(saveT);
  const write = () => { try { localStorage.setItem(DKEY, JSON.stringify({ mix, decks: Object.fromEntries(["A", "B"].map(k => [k, D[k] && D[k].track ? { id: D[k].track.id, pitch: D[k].rate - 1, pos: (D[k].playing ? position(D[k]) : D[k].pos) || 0 } : null])) })); } catch (e) {} };
  if (now) write(); else saveT = setTimeout(write, 300);
}
addEventListener("pagehide", () => saveDecks(true));
function applyMix() {
  saveDecks();
  if (!ctx) return;
  const t = ctx.currentTime, x = mix.xfade;
  D.A.xf.gain.setTargetAtTime(Math.cos(x * Math.PI / 2), t, 0.01); D.B.xf.gain.setTargetAtTime(Math.sin(x * Math.PI / 2), t, 0.01);
  master.gain.setTargetAtTime(mix.master, t, 0.01);
  for (const k of ["A", "B"]) {
    D[k].fader.gain.setTargetAtTime(mix.fader[k] * mix.fader[k], t, 0.01);
    D[k].hi.gain.setTargetAtTime(mix.eq[k + "-hi"], t, 0.01); D[k].mid.gain.setTargetAtTime(mix.eq[k + "-mid"], t, 0.01); D[k].low.gain.setTargetAtTime(mix.eq[k + "-low"], t, 0.01);
  }
}

// ---------- decks ----------
function buildDeck(k) {
  const el = document.querySelector(`[data-deck="${k}"]`);
  el.innerHTML = `<div class="lcd dlcd"><span class="tag">${k}</span><span class="title" data-f="title">EMPTY</span><span class="time" data-f="time">0:00</span><span class="artist" data-f="artist">Load a song from the library</span><span class="bpm" data-f="bpm">--- BPM</span></div>
    <canvas class="wave" data-f="wave" aria-label="Deck ${k} waveform. Click to jump."></canvas>
    <div class="dctl"><div class="btns">
      <button class="btn big" data-a="play" aria-label="Play deck ${k}">${icon("play")}</button>
      <button class="btn big" data-a="cue" title="Paused: set the cue point here. Playing: jump back to it.">Cue</button>
      <button class="btn" data-a="sync" title="Match tempo and line up the beats with the other deck">Sync</button>
      <button class="btn" data-a="loop" aria-pressed="false" title="Loop four beats from the last beat"><i class="led"></i>Loop 4</button>
      <button class="btn" data-a="back" title="Back 4 beats">−4</button><button class="btn" data-a="fwd" title="Forward 4 beats">+4</button>
      <button class="btn" data-a="reset" title="Pitch back to 0%">0%</button>
    </div>
    <div class="pitch"><span class="lbl">Pitch</span><div class="slider v center" data-f="pitch"></div><span class="lcd" data-f="pct">0.0%</span></div></div>`;
  const f = n => el.querySelector(`[data-f="${n}"]`);
  const d = D[k] = { k, el, f, track: null, buf: null, an: null, src: null, playing: false, pos: 0, startCtx: 0, startPos: 0, rate: 1, cue: 0, loop: null, beats: [], peaks: null };
  d.pitch = Slider(f("pitch"), { min: -0.08, max: 0.08, step: 0.0005, value: 0, orient: "v", label: `Deck ${k} pitch`, text: v => `${(v * 100).toFixed(1)}%`, onInput: v => setRate(d, 1 + v) });
  el.addEventListener("click", e => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const a = b.dataset.a;
    if (!d.buf) { toast(`Load a song onto deck ${k} first`); return; }
    if (a === "play") d.playing ? pause(d) : play(d);
    else if (a === "cue") { if (d.playing) { pause(d); seek(d, d.cue); } else { d.cue = position(d); } drawWave(d); }
    else if (a === "sync") sync(d);
    else if (a === "loop") toggleLoop(d);
    else if (a === "back" || a === "fwd") seek(d, position(d) + (a === "fwd" ? 4 : -4) * beatLen(d));
    else if (a === "reset") { d.pitch.set(0); setRate(d, 1); }
  });
  f("wave").addEventListener("pointerdown", e => { if (!d.buf) return; const r = e.currentTarget.getBoundingClientRect(); seek(d, (e.clientX - r.left) / r.width * d.buf.duration); });
}
const beatLen = d => d.track && d.track.bpm ? 60 / d.track.bpm : 0.5;
function position(d) {
  if (!d.playing) return d.pos;
  let p = d.startPos + (ctx.currentTime - d.startCtx) * d.rate;
  if (d.loop && p > d.loop.end) p = d.loop.start + ((p - d.loop.start) % (d.loop.end - d.loop.start));
  return Math.min(p, d.buf.duration);
}
function play(d) {
  ensure(); stopSrc(d);
  const s = ctx.createBufferSource(); s.buffer = d.buf; s.playbackRate.value = d.rate;
  if (d.loop) { s.loop = true; s.loopStart = d.loop.start; s.loopEnd = d.loop.end; }
  s.connect(d.low); s.start(0, Math.min(d.pos, d.buf.duration - 0.01));
  s.onended = () => { if (d.src === s && !d.loop) { d.playing = false; d.pos = 0; d.src = null; renderDeck(d); } };
  d.src = s; d.startCtx = ctx.currentTime; d.startPos = d.pos; d.playing = true; renderDeck(d);
}
function stopSrc(d) { if (d.src) { const s = d.src; d.src = null; try { s.onended = null; s.stop(); } catch (e) {} } }
function pause(d) { d.pos = position(d); stopSrc(d); d.playing = false; renderDeck(d); saveDecks(); }
function seek(d, t) { t = Math.max(0, Math.min(t, d.buf.duration - 0.05)); if (d.loop && (t < d.loop.start || t > d.loop.end)) d.loop = null, renderDeck(d); if (d.playing) { d.pos = t; play(d); } else d.pos = t; drawWave(d); saveDecks(); }
function setRate(d, r) {
  if (d.playing) { d.startPos = position(d); d.startCtx = ctx.currentTime; }
  d.rate = r; if (d.src) d.src.playbackRate.setTargetAtTime(r, ctx.currentTime, 0.01);
  renderDeck(d); saveDecks();
}
// beat times in the song, from Amp's analysis
const beatIndex = (d, t) => { let lo = 0, hi = d.beats.length - 1; if (hi < 0) return -1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (d.beats[m] <= t) lo = m; else hi = m - 1; } return d.beats[lo] <= t ? lo : -1; };
function sync(d) {
  const o = D[d.k === "A" ? "B" : "A"];
  if (!o.buf || !o.track.bpm || !d.track.bpm) { toast("Load songs onto both decks to sync"); return; }
  const r = Math.max(0.84, Math.min(1.16, o.track.bpm * o.rate / d.track.bpm));
  setRate(d, r); d.pitch.set(Math.max(-0.08, Math.min(0.08, r - 1)));
  if (o.playing && d.playing && o.beats.length > 1 && d.beats.length > 1) { // line the beats up
    const po = position(o), io = Math.max(0, beatIndex(o, po)), so = o.beats[io], eo = o.beats[io + 1] || so + beatLen(o);
    const frac = Math.max(0, Math.min(1, (po - so) / (eo - so)));
    const pd = position(d), id = Math.max(0, beatIndex(d, pd)), sd = d.beats[id], ed = d.beats[id + 1] || sd + beatLen(d);
    let target = sd + frac * (ed - sd); if (target - pd > (ed - sd) / 2) target -= ed - sd; else if (pd - target > (ed - sd) / 2) target += ed - sd;
    seek(d, target);
  }
  toast(`Deck ${d.k} synced to ${(d.track.bpm * d.rate).toFixed(1)} BPM`);
}
function toggleLoop(d) {
  if (d.loop) { const p = position(d); d.loop = null; d.pos = p; if (d.playing) play(d); renderDeck(d); return; }
  const p = position(d), i = beatIndex(d, p), start = i >= 0 ? d.beats[i] : p, end = (d.beats[i + 4] || start + 4 * beatLen(d));
  d.loop = { start, end: Math.min(end, d.buf.duration - 0.01) };
  d.pos = p; if (d.playing) play(d);
  renderDeck(d);
}
async function load(k, t, restore = null) {
  ensure(); const d = D[k];
  if (d.playing) pause(d);
  d.f("title").textContent = "LOADING…";
  try {
    const buf = await ctx.decodeAudioData(await (await fileOf(t, !restore)).arrayBuffer());
    const an = t.analysis || {}, off = typeof an.offset === "number" ? an.offset : 1024 / 22050;
    Object.assign(d, { track: t, buf, pos: 0, cue: 0, loop: null, rate: 1, beats: (an.beats || []).map(b => b + off), peaks: peaksFrom(an, off) });
    d.pitch.set(0); renderDeck(d); drawWave(d);
    if (restore) { d.pitch.set(restore.pitch || 0); setRate(d, 1 + (restore.pitch || 0)); d.pos = Math.min(restore.pos || 0, buf.duration - 1); d.cue = d.pos; renderDeck(d); drawWave(d); }
    saveDecks();
  } catch (e) {
    if (restore) { d.f("title").textContent = "EMPTY"; d.f("artist").textContent = e && e.code === "needs_permission" ? `Load ${t.title} again to reconnect your music folder` : ""; return; } // a quiet start: no toasts
    d.f("title").textContent = "EMPTY"; toast(e && e.code === "needs_permission" ? "Neon OS needs permission to read your music folder. Load the song again and choose Allow." : `Couldn't load ${t.title}`, true); }
}
// waveform: the analysis' loudness per band, averaged per pixel column (bass weighs heaviest)
function peaksFrom(an, off) {
  if (!an.bands || !an.fps) return null;
  const W = [1.2, 1.1, 0.8, 0.7, 0.6, 0.5], env = an.bands.map(b => b64(b.env)), n = env[0].length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0, w = 0; env.forEach((e, j) => { s += e[i] * (W[j] || 0.5); w += W[j] || 0.5; }); out[i] = s / w / 255; }
  return { data: out, fps: an.fps, off };
}
function drawWave(d) {
  const c = d.f("wave"), r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  if (!r.width) return;
  if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
  const g = c.getContext("2d"), w = c.width, h = c.height, ball = getComputedStyle(document.documentElement).getPropertyValue("--ball").trim() || "#3ff2ff";
  g.clearRect(0, 0, w, h);
  if (!d.buf) return;
  const dur = d.buf.duration, X = t => t / dur * w;
  if (d.loop) { g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(X(d.loop.start), 0, X(d.loop.end) - X(d.loop.start), h); }
  g.fillStyle = ball;
  if (d.peaks) {
    const p = d.peaks, n = p.data.length;
    for (let x = 0; x < w; x++) {
      const a = Math.floor(((x / w) * dur - p.off) * p.fps), b = Math.max(a + 1, Math.floor((((x + 1) / w) * dur - p.off) * p.fps));
      let m = 0; for (let i = Math.max(0, a); i < Math.min(n, b); i++) m = Math.max(m, p.data[i]);
      const bh = Math.max(1, m * (h - 6)); g.globalAlpha = 0.35 + 0.55 * m; g.fillRect(x, (h - bh) / 2, 1, bh);
    }
  }
  g.globalAlpha = 1;
  const p = position(d);
  g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(0, 0, X(p), h); // played part
  g.fillStyle = "#ff5c8a"; g.fillRect(X(d.cue) - 1, 0, 2 * dpr, h * 0.3); // cue marker
  g.fillStyle = "#fff"; g.fillRect(X(p) - dpr, 0, 2 * dpr, h); // playhead
}
function renderDeck(d) {
  const t = d.track;
  d.f("title").textContent = t ? t.title.toUpperCase() : "EMPTY";
  d.f("artist").textContent = t ? (t.artist || "Unknown artist") : "Load a song from the library";
  d.f("bpm").textContent = t && t.bpm ? `${(t.bpm * d.rate).toFixed(1)} BPM` : "--- BPM";
  d.f("pct").textContent = `${((d.rate - 1) * 100).toFixed(1)}%`;
  const pb = d.el.querySelector('[data-a="play"]'); pb.innerHTML = icon(d.playing ? "pause" : "play"); pb.classList.toggle("down", d.playing);
  d.el.querySelector('[data-a="loop"]').setAttribute("aria-pressed", String(!!d.loop));
}

// ---------- mixer controls ----------
const eqTxt = v => v === 0 ? "0" : `${v > 0 ? "+" : ""}${v}`, xfTxt = v => v < 0.48 ? `A ${Math.round((1 - v) * 100)}%` : v > 0.52 ? `B ${Math.round(v * 100)}%` : "C";
document.querySelectorAll("[data-eqv]").forEach(el => { el.textContent = eqTxt(mix.eq[el.dataset.eqv]); });
document.querySelectorAll("[data-fpct]").forEach(el => { el.textContent = Math.round(mix.fader[el.dataset.fpct] * 100) + "%"; });
$("masterPct").textContent = Math.round(mix.master * 100) + "%"; $("xfPct").textContent = xfTxt(mix.xfade);
document.querySelectorAll("[data-eq]").forEach(el => { const k = el.dataset.eq; Slider(el, { min: -12, max: 12, step: 0.5, value: mix.eq[k], label: `${k} EQ (double-click to reset)`, text: v => `${v} dB`, onInput: v => { mix.eq[k] = v; applyMix(); document.querySelector(`[data-eqv="${k}"]`).textContent = v === 0 ? "0" : `${v > 0 ? "+" : ""}${v}`; } }); });
document.querySelectorAll("[data-fader]").forEach(el => { const k = el.dataset.fader; Slider(el, { min: 0, max: 1, step: 0.01, value: mix.fader[k], orient: "v", label: `Deck ${k} volume`, text: v => Math.round(v * 100) + "%", onInput: v => { mix.fader[k] = v; applyMix(); document.querySelector(`[data-fpct="${k}"]`).textContent = Math.round(v * 100) + "%"; } }); });
Slider($("xfade"), { min: 0, max: 1, step: 0.005, value: mix.xfade, label: "Crossfader", text: v => v < 0.48 ? `${Math.round((1 - v) * 100)}% A` : v > 0.52 ? `${Math.round(v * 100)}% B` : "Centre", onInput: v => { mix.xfade = v; applyMix(); $("xfPct").textContent = v < 0.48 ? `A ${Math.round((1 - v) * 100)}%` : v > 0.52 ? `B ${Math.round(v * 100)}%` : "C"; } });
Slider($("master"), { min: 0, max: 1, step: 0.01, value: mix.master, label: "Master volume", text: v => Math.round(v * 100) + "%", onInput: v => { mix.master = v; applyMix(); $("masterPct").textContent = Math.round(v * 100) + "%"; } });

// record the mix as it plays
let rec = null, recStart = 0, chunks = [];
let recTarget = null;
$("rec").addEventListener("click", async () => {
  ensure();
  if (rec) { // stopping is a click, so this is when to ask where to save
    const ext = (rec.mimeType || "").includes("ogg") ? "ogg" : "webm", stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    recTarget = await saveTarget(`decks-mix-${stamp}.${ext}`, { description: "Recorded mix", accept: { [ext === "ogg" ? "audio/ogg" : "audio/webm"]: ["." + ext] } });
    rec.stop(); return;
  }
  if (!window.MediaRecorder) { toast("This browser can't record audio.", true); return; }
  const type = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find(t => MediaRecorder.isTypeSupported(t)) || "";
  rec = new MediaRecorder(recDest.stream, type ? { mimeType: type } : undefined); chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" }), stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const target = recTarget || { name: `decks-mix-${stamp}.${(rec.mimeType || "").includes("ogg") ? "ogg" : "webm"}`, write: async b => download(b, target.name), picked: false };
    recTarget = null;
    target.write(blob).then(() => { if (!notify("Mix saved", target.picked ? `Saved as ${target.name}.` : `${target.name} is in your downloads folder.`, "decks")) toast(`Saved ${target.name}`); }).catch(() => toast("Couldn't save the mix.", true));
    rec = null; $("rec").setAttribute("aria-pressed", "false"); $("recTime").textContent = "0:00";
  };
  rec.start(1000); recStart = performance.now(); $("rec").setAttribute("aria-pressed", "true");
});

// ---------- library: the same sections as Amp and Files ----------
const LS = listState("neon-os:decks-list");
let tracks = [], playlists = [], groups = buildGroups([]), view = LS.view, shown = [];
const list = vlist($("list"), $("rows"), { rowHeight: 26, head: 24, empty: () => `<div class="lempty"><b>${$("q").value.trim() ? "Nothing matches." : tracks.length ? "Nothing here yet." : "No songs yet."}</b>${$("q").value.trim() ? "Try a title, artist, album or genre." : tracks.length ? (view.type === "smart" && view.id.startsWith("b") ? "Songs appear once their tempo has been worked out." : "") : "Add songs in Amp; they appear here straight away."}</div>` });
async function loadLibrary() {
  try { const db = await openDb(); tracks = (await all(db, "tracks")).filter(t => t.blob || t.link); playlists = await all(db, "playlists"); db.close(); } catch (e) { tracks = []; playlists = []; }
  tracks.forEach(t => { if (t.coverBlob && !t.coverUrl) t.coverUrl = URL.createObjectURL(t.coverBlob); });
  playlists.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  groups = buildGroups(tracks);
  if (view.type === "pl" && !playlists.some(p => p.id === view.id)) view = { type: "all" };
  renderList(true);
  // put back the songs that were on the decks
  if (saved.decks) { const sd = saved.decks; saved.decks = null; for (const k of ["A", "B"]) { const s = sd[k], t = s && tracks.find(x => x.id === s.id); if (t) load(k, t, s); } }
}
function renderList(keepScroll) {
  $("tree").innerHTML = treeHTML(view, tracks, playlists, groups);
  $("crateTitle").textContent = viewTitle(view, playlists, groups);
  $("back").hidden = !["artist", "album", "genre"].includes(view.type);
  const grp = isGroupView(view);
  $("list").classList.toggle("groups", grp);
  $("crateHint").textContent = tracks.length ? `${tracks.length} song${tracks.length === 1 ? "" : "s"}` : "";
  if (grp) {
    shown = searchGroups(viewGroups(view, groups), $("q").value);
    list.set(shown, g => `<div class="lrow group" role="row" data-g="${esc(g.key)}" title="Open">
      ${view.type === "albums" ? (g.cover ? `<img class="thumb" src="${esc(g.cover)}" alt="">` : `<span class="thumb"></span>`) : treeIcon(view.type)}
      <span>${esc(g.name)}</span><span class="d">${esc(groupNote(g))}</span><span class="num">${g.songs.length}</span><span class="d">song${g.songs.length === 1 ? "" : "s"}</span></div>`, { keepScroll });
    return;
  }
  shown = searchSongs(viewSongs(view, tracks, playlists, groups), $("q").value);
  if (LS.sort.key) shown = sortSongs(shown, LS.sort);
  else if (view.type === "all") shown.sort((a, b) => (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" }));
  list.set(shown, t => `<div class="lrow song" role="row" data-id="${esc(t.id)}">
    <span class="star${t.fav ? " on" : ""}" data-star title="${t.fav ? "Remove from favourites" : "Add to favourites"}">${t.fav ? "★" : "☆"}</span>
    <span>${esc(t.title)}</span><span class="d">${esc(t.artist || "")}</span><span class="d">${esc(t.genre || "")}</span>
    <span class="num">${t.bpm ? Math.round(t.bpm) : ""}</span><span class="num">${fmt(t.duration)}</span>
    <button class="btn" data-load="A" data-id="${esc(t.id)}">Load A</button><button class="btn" data-load="B" data-id="${esc(t.id)}">Load B</button></div>`, { keepScroll });
}
const setView = v => { view = v; LS.save({ view: v }); $("q").value = ""; renderList(false); };
wireSortHead($("head"), LS, s => { LS.save({ sort: s }); renderList(true); });
$("tree").addEventListener("click", e => { const v = treeClick(e); if (v) setView(v); });
$("back").addEventListener("click", () => setView(parentView(view)));
$("list").addEventListener("click", async e => {
  const g = e.target.closest(".lrow.group"); if (g) { setView(openGroup(view, g.dataset.g)); return; }
  const st = e.target.closest("[data-star]");
  if (st) {
    const t = tracks.find(x => x.id === st.closest(".lrow").dataset.id); if (!t) return;
    try { const db = await openDb(); const { coverUrl, ...rec } = t; void coverUrl; await put(db, "tracks", { ...rec, fav: !t.fav }); db.close(); t.fav = !t.fav; notifyLibraryChange("edit"); renderList(true); } catch (err) { toast("Couldn't change that favourite.", true); }
    return;
  }
  const b = e.target.closest("[data-load]"); if (!b) return; const t = tracks.find(x => x.id === b.dataset.id); if (t) load(b.dataset.load, t);
});
$("q").addEventListener("input", () => renderList(false));
let reloadT = null;
const soon = () => { clearTimeout(reloadT); reloadT = setTimeout(loadLibrary, 400); }; // a burst of changes reloads once
onLibraryChange(soon); addEventListener("focus", soon);

// ---------- frame loop: positions, waveforms, meters ----------
function frame() {
  for (const k of ["A", "B"]) {
    const d = D[k]; if (!d || !d.buf) continue;
    const p = position(d);
    d.f("time").textContent = `-${fmt((d.buf.duration - p) / d.rate)}`;
    drawWave(d);
    if (ctx && d.an) { d.an.getByteTimeDomainData(d.meterBuf); let m = 0; for (const v of d.meterBuf) m = Math.max(m, Math.abs(v - 128)); document.querySelector(`[data-meter="${k}"]`).style.height = Math.min(100, m / 128 * 140) + "%"; }
  }
  if (rec) $("recTime").textContent = fmt((performance.now() - recStart) / 1000);
  requestAnimationFrame(frame);
}
$("reset").addEventListener("click", async () => {
  // (Reset clears the remembered mixer and decks too)
  const ok = await dialog({ title: "Reset Decks", text: rec ? "Stop the recording (it will be saved), empty both decks and put the mixer back to flat?" : "Stop and empty both decks, and put the EQ, faders, crossfader and pitch back to the start?", confirm: "Reset", danger: true });
  if (!ok) return;
  clearTimeout(saveT); try { localStorage.removeItem(DKEY); localStorage.removeItem("neon-os:decks-list"); } catch (e) {}
  const reload = () => { clearTimeout(saveT); try { localStorage.removeItem(DKEY); } catch (e) {} location.reload(); };
  if (rec) { rec.addEventListener("stop", () => setTimeout(reload, 300)); rec.stop(); }
  else reload();
});
buildDeck("A"); buildDeck("B");
loadLibrary(); requestAnimationFrame(frame);
addEventListener("resize", () => { for (const k of ["A", "B"]) if (D[k].buf) drawWave(D[k]); });
