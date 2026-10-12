// Chop: sampler for Neon OS
// Load a song from the library and it's cut into 16 slices on its own beats (from Amp's analysis).
// Play the slices from 16 pads or the keyboard, sequence them in four 16-step patterns, Link to Pulse and Drift,
// and export four bars to a WAV file. Everything saves in this browser as you go.
import "../../core/os-link.js";
import { applyTheme, onTheme } from "../../core/theme.js";
import { clock } from "../../core/clock.js";
import { icon } from "../../style-kit/icons.js";
import { Slider, toast, dialog, esc } from "../../style-kit/ui.js";
import { vlist } from "../../style-kit/vlist.js";
import { notify } from "../../core/notify.js";
import { toWav, download } from "../../core/wav.js";
import { createFx, fxOf } from "../../core/fx.js";
import { fxPanel } from "../../style-kit/fx-panel.js";
import { openDb, all, onLibraryChange } from "../../core/backup.js";
import { fileOf } from "../../core/linked.js";
import { PADS, STEPS, SLOTS, PAD_KEYS, DIVS, CHOP_KEY, loadChop, beatsOf, songBpm, slicesOf, beatAt, playSlice } from "../../core/chop.js";
applyTheme(); onTheme(applyTheme);

const $ = id => document.getElementById(id);
const fmt = s => { s = Math.max(0, s || 0); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`; };
let S = loadChop();
S.fx = fxOf(S);
let saveT = null;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(CHOP_KEY, JSON.stringify(S)); } catch (e) {} }, 200); };
const pat = () => S.patterns[S.cur];

// ---------- the song ----------
let track = null, buffer = null, beats = [], slices = [], peaks = null, waiting = null; // waiting: a song to load after a click (folder access)
const rate = () => S.match && track ? S.bpm / songBpm(track, beats) : 1;
function reslice() {
  if (!buffer) { slices = []; return; }
  S.startBeat = Math.max(0, Math.min(S.startBeat, beats.length - 1));
  slices = slicesOf(beats, S.startBeat, S.div, buffer.duration);
  drawWaves(); renderPads();
}
async function loadTrack(t, ask = false) {
  ensureAudio();
  $("title").textContent = "LOADING…"; $("sub").textContent = t.title;
  try {
    const file = await fileOf(t, ask);
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    track = t; buffer = buf; beats = beatsOf(t, buf.duration); waiting = null;
    if (S.trackId !== t.id) { S.trackId = t.id; S.startBeat = Math.min(beats.length - 1, Math.max(0, beatAt(beats, buf.duration * 0.3) & ~3)); } // start on a bar about a third in
    peaks = peaksOf(buf, 1200);
    showSong(); reslice(); save(); renderList(true);
  } catch (e) {
    if (e && e.code === "needs_permission") { waiting = t; $("title").textContent = t.title.toUpperCase(); $("sub").textContent = "Press any pad or Play to reconnect your music folder"; return; }
    track = null; buffer = null; showSong();
    toast(e && e.code === "missing" ? `Couldn't find ${t.title} in your linked folder.` : `Couldn't load ${t.title}. This browser may not decode that file.`, true);
  }
}
async function retryWaiting() { if (waiting) await loadTrack(waiting, true); }
function showSong() {
  $("title").textContent = track ? track.title.toUpperCase() : "NO SONG LOADED";
  $("sub").textContent = track ? `${[track.artist, track.album].filter(Boolean).join(" · ") || "Unknown artist"} · ${Math.round(songBpm(track, beats))} BPM${track.analysis ? "" : " · not analysed yet, slices are evenly spaced"}` : "Pick a song from the library below";
  document.querySelectorAll(".pad").forEach(p => { p.disabled = !buffer; });
}
function peaksOf(buf, n) {
  const d = buf.getChannelData(0), per = Math.max(1, Math.floor(d.length / n)), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let m = 0; const o = i * per; for (let j = 0; j < per; j += 16) { const v = Math.abs(d[o + j] || 0); if (v > m) m = v; } out[i] = m; }
  return out;
}

// ---------- audio ----------
let ctx = null, out = null, stopLast = null, fx = null;
function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)(); out = ctx.createGain(); out.gain.value = S.vol;
    fx = createFx(ctx, { bpm: S.bpm, params: S.fx }); out.connect(fx.input); fx.output.connect(ctx.destination);
  }
  if (ctx.state !== "running") ctx.resume().catch(() => {});
  return ctx;
}
let lit = -1;
function hit(i, when) {
  if (!buffer || !slices[i]) return;
  if (S.choke && stopLast) stopLast(when);
  stopLast = playSlice(ctx, out, buffer, slices[i], when, rate(), 0.9);
  const ms = Math.max(0, (when - ctx.currentTime) * 1000);
  setTimeout(() => { const p = document.querySelector(`.pad[data-p="${i}"]`); if (p) { p.classList.add("hit"); setTimeout(() => p.classList.remove("hit"), 110); } lit = i; drawZoom(); }, ms);
}

// ---------- pads ----------
let armed = 0;
function renderPads() {
  $("pads").innerHTML = Array.from({ length: PADS }, (_, i) => `<button class="pad${i === armed ? " armed" : ""}" data-p="${i}" aria-label="Pad ${i + 1}, key ${PAD_KEYS[i].toUpperCase()}"${buffer ? "" : " disabled"}><small>${PAD_KEYS[i]}</small><b>${i + 1}</b></button>`).join("");
}
function pressPad(i) {
  if (waiting) { retryWaiting(); return; }
  ensureAudio(); armed = i;
  document.querySelectorAll(".pad").forEach(p => p.classList.toggle("armed", +p.dataset.p === i));
  hit(i, ctx.currentTime + 0.005);
  if (playing && recording) { pat()[nearestStep()] = i; renderSeq(); save(); }
}
$("pads").addEventListener("pointerdown", e => { const p = e.target.closest(".pad"); if (p && !p.disabled) { e.preventDefault(); pressPad(+p.dataset.p); } });
$("pads").addEventListener("keydown", e => { const p = e.target.closest(".pad"); if (p && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); pressPad(+p.dataset.p); } });

// ---------- sequencer ----------
function renderSeq() {
  const p = pat();
  $("seq").innerHTML = Array.from({ length: STEPS }, (_, s) => `<button class="step${s % 4 ? "" : " beat"}${p[s] >= 0 ? " on" : ""}${s === shown ? " now" : ""}" data-s="${s}" role="gridcell" aria-label="Step ${s + 1}: ${p[s] >= 0 ? "pad " + (p[s] + 1) : "empty"}">${p[s] >= 0 ? p[s] + 1 : "·"}</button>`).join("");
}
$("seq").addEventListener("click", e => {
  const st = e.target.closest(".step"); if (!st) return;
  const s = +st.dataset.s, p = pat();
  p[s] = p[s] === armed ? -1 : armed; renderSeq(); save();
  if (p[s] >= 0 && !playing && buffer) { ensureAudio(); hit(p[s], ctx.currentTime + 0.005); }
});
$("seq").addEventListener("contextmenu", e => { const st = e.target.closest(".step"); if (!st) return; e.preventDefault(); pat()[+st.dataset.s] = -1; renderSeq(); save(); });

// lookahead scheduler, the same as Pulse and Drift: every 25 ms, queue steps due in the next 120 ms
let playing = false, recording = false, nextTime = 0, nextStep = 0, absStep = 0, timer = null;
const queue = [];
const stepDur = () => 60 / S.bpm / 4;
const following = () => S.link && clock.state.playing;
function schedule() {
  if (fx) fx.setBpm(S.bpm);
  while (nextTime < ctx.currentTime + 0.12) {
    if (following()) { const c = clock.state, ms = 60000 / c.bpm / 4; nextTime = clock.toAudio(ctx, c.origin + absStep * ms); }
    const v = pat()[nextStep];
    if (v >= 0 && buffer) hit(v, nextTime);
    queue.push({ step: nextStep, time: nextTime });
    nextTime += stepDur(); nextStep = (nextStep + 1) % STEPS; absStep++;
  }
}
function align() { const n = clock.nextStep(4); absStep = n.index; nextStep = ((n.index % STEPS) + STEPS) % STEPS; nextTime = clock.toAudio(ctx, n.wall); queue.length = 0; }
function startLocal() {
  ensureAudio(); if (playing) return;
  playing = true; queue.length = 0;
  if (following()) align(); else { absStep = 0; nextStep = 0; nextTime = ctx.currentTime + 0.06; }
  schedule(); timer = setInterval(schedule, 25);
  renderTransport(); requestAnimationFrame(draw);
}
function stopLocal() { playing = false; clearInterval(timer); queue.length = 0; if (stopLast && ctx) stopLast(ctx.currentTime); showNow(-1); renderTransport(); }
function start() { if (waiting) { retryWaiting(); } if (S.link && !clock.state.playing) { ensureAudio(); clock.start(S.bpm); return; } startLocal(); }
function stop() { if (S.link && clock.state.playing) { clock.stop(); return; } stopLocal(); }
clock.subscribe(c => {
  if (!S.link) return;
  if (c.bpm !== S.bpm) { S.bpm = c.bpm; tempo.set(c.bpm); $("bpm").textContent = Math.round(c.bpm); save(); }
  if (c.playing && !playing) startLocal();
  else if (!c.playing && playing) stopLocal();
  else if (c.playing && playing) align();
});
// the step a pad hit while recording belongs to: whichever 16th is nearest
let lastStep = 0, lastTime = 0;
function nearestStep() { return ctx.currentTime - lastTime > stepDur() / 2 ? (lastStep + 1) % STEPS : lastStep; }
let shown = -1;
function showNow(step) {
  if (step === shown) return; shown = step;
  document.querySelectorAll(".step.now").forEach(x => x.classList.remove("now"));
  if (step < 0) { $("pos").textContent = "1.1"; return; }
  const b = document.querySelector(`.step[data-s="${step}"]`); if (b) b.classList.add("now");
  $("pos").textContent = `${Math.floor(step / 4) + 1}.${step % 4 + 1}`;
}
function draw() {
  if (fx) panel.meter(fx.reduction);
  if (!playing) return;
  const now = ctx.currentTime - (ctx.outputLatency || 0);
  while (queue.length > 1 && queue[1].time <= now) queue.shift();
  if (queue.length && queue[0].time <= now) { showNow(queue[0].step); lastStep = queue[0].step; lastTime = queue[0].time; }
  requestAnimationFrame(draw);
}

// ---------- waveforms ----------
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function sizeCanvas(c) { const d = Math.min(2, devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight; if (c.width !== w * d || c.height !== h * d) { c.width = w * d; c.height = h * d; } const x = c.getContext("2d"); x.setTransform(d, 0, 0, d, 0, 0); return { x, w, h }; }
function drawWaves() { drawOver(); drawZoom(); }
function drawOver() {
  const { x, w, h } = sizeCanvas($("over")), ball = css("--ball");
  x.clearRect(0, 0, w, h);
  if (!buffer) { x.fillStyle = css("--ink-faint"); x.font = "18px VT323, monospace"; x.fillText("LOAD A SONG FROM THE LIBRARY", 12, h / 2 + 6); return; }
  const dur = buffer.duration, X = t => t / dur * w;
  if (slices.length) { x.fillStyle = ball; x.globalAlpha = 0.16; x.fillRect(X(slices[0].t0), 0, Math.max(2, X(slices[PADS - 1].t1) - X(slices[0].t0)), h); x.globalAlpha = 1; }
  x.fillStyle = css("--ink-faint");
  for (let i = 0; i < beats.length; i += 4) x.fillRect(X(beats[i]), h - 4, 1, 4); // bar ticks
  x.fillStyle = ball; x.globalAlpha = 0.8;
  for (let i = 0; i < peaks.length; i++) { const v = peaks[i] * (h / 2 - 4); x.fillRect(i / peaks.length * w, h / 2 - v, Math.max(1, w / peaks.length), v * 2 || 1); }
  x.globalAlpha = 1;
}
function drawZoom() {
  const { x, w, h } = sizeCanvas($("zoom")), ball = css("--ball");
  x.clearRect(0, 0, w, h);
  if (!buffer || !slices.length) return;
  const t0 = slices[0].t0, t1 = slices[PADS - 1].t1, sr = buffer.sampleRate, d = buffer.getChannelData(0), X = t => (t - t0) / (t1 - t0) * w;
  if (lit >= 0 && slices[lit]) { x.fillStyle = ball; x.globalAlpha = 0.18; x.fillRect(X(slices[lit].t0), 0, X(slices[lit].t1) - X(slices[lit].t0), h); x.globalAlpha = 1; }
  x.fillStyle = ball; x.globalAlpha = 0.85;
  const a = Math.floor(t0 * sr), b = Math.floor(t1 * sr), per = Math.max(1, (b - a) / w);
  for (let px = 0; px < w; px++) { let m = 0; const o = a + Math.floor(px * per); for (let j = 0; j < per; j += 4) { const v = Math.abs(d[o + j] || 0); if (v > m) m = v; } const v = m * (h / 2 - 4); x.fillRect(px, h / 2 - v, 1, v * 2 || 1); }
  x.globalAlpha = 1; x.font = "15px VT323, monospace";
  slices.forEach((s, i) => { x.fillStyle = css("--ink-faint"); x.fillRect(X(s.t0), 0, 1, h); x.fillStyle = i === lit ? "#fff" : css("--ink-dim"); x.fillText(String(i + 1), X(s.t0) + 3, 13); });
}
$("over").addEventListener("click", e => {
  if (!buffer) return;
  const r = e.currentTarget.getBoundingClientRect(), t = (e.clientX - r.left) / r.width * buffer.duration;
  S.startBeat = beatAt(beats, t); reslice(); save();
});
$("zoom").addEventListener("click", e => {
  if (!buffer || !slices.length) return;
  const r = e.currentTarget.getBoundingClientRect(), t = slices[0].t0 + (e.clientX - r.left) / r.width * (slices[PADS - 1].t1 - slices[0].t0);
  const i = slices.findIndex(s => t >= s.t0 && t < s.t1); if (i >= 0) pressPad(i);
});
addEventListener("resize", drawWaves);

// ---------- transport and settings ----------
function renderTransport() {
  $("play").innerHTML = icon("play"); $("stop").innerHTML = icon("stop");
  $("play").classList.toggle("down", playing);
  $("link").setAttribute("aria-pressed", String(!!S.link));
  $("rec").setAttribute("aria-pressed", String(recording));
  $("match").setAttribute("aria-pressed", String(!!S.match));
  $("choke").setAttribute("aria-pressed", String(!!S.choke));
  $("bpm").textContent = Math.round(S.bpm); $("patLcd").textContent = S.cur;
  $("pats").innerHTML = SLOTS.map(k => `<button class="btn" data-pat="${k}" aria-pressed="${k === S.cur}" title="Pattern ${k}">${k}</button>`).join("");
  $("divs").innerHTML = DIVS.map(d => `<button class="btn" data-div="${d.v}" aria-pressed="${d.v === S.div}">${d.name}</button>`).join("");
}
const tempo = Slider($("tempo"), { min: 60, max: 200, step: 1, value: S.bpm, label: "Tempo", text: v => `${v} BPM`, onInput: v => { S.bpm = v; $("bpm").textContent = v; if (S.link) clock.setBpm(v); }, onChange: save });
Slider($("vol"), { min: 0, max: 1, step: 0.01, value: S.vol, label: "Chop volume", text: v => Math.round(v * 100) + "%",
  onInput: v => { S.vol = v; $("volPct").textContent = Math.round(v * 100) + "%"; if (out) out.gain.setTargetAtTime(v, ctx.currentTime, 0.01); }, onChange: save });
$("volPct").textContent = Math.round(S.vol * 100) + "%";
$("bpmDown").addEventListener("click", () => { tempo.set(S.bpm - 1, true); save(); });
$("bpmUp").addEventListener("click", () => { tempo.set(S.bpm + 1, true); save(); });
$("play").addEventListener("click", () => playing ? stop() : start());
$("stop").addEventListener("click", stop);
$("rec").addEventListener("click", () => { recording = !recording; renderTransport(); if (recording && !playing) start(); });
$("link").addEventListener("click", () => {
  const was = playing; if (was) stopLocal();
  S.link = !S.link; save(); renderTransport();
  if (S.link && clock.state.playing && !was) { S.bpm = clock.state.bpm; tempo.set(S.bpm); $("bpm").textContent = Math.round(S.bpm); }
  if (was) start();
});
$("match").addEventListener("click", () => { S.match = !S.match; save(); renderTransport(); });
$("choke").addEventListener("click", () => { S.choke = !S.choke; save(); renderTransport(); });
$("pats").addEventListener("click", e => { const b = e.target.closest("[data-pat]"); if (!b) return; S.cur = b.dataset.pat; renderSeq(); renderTransport(); save(); });
$("divs").addEventListener("click", e => { const b = e.target.closest("[data-div]"); if (!b) return; S.div = +b.dataset.div; renderTransport(); reslice(); save(); });
$("clear").addEventListener("click", () => { S.patterns[S.cur] = new Array(STEPS).fill(-1); renderSeq(); save(); });
$("reset").addEventListener("click", async () => {
  const ok = await dialog({ title: "Reset Chop", text: "Clear all four patterns and put tempo, slices, volume and Link back to how they started? The loaded song stays.", confirm: "Reset", danger: true });
  if (!ok) return;
  stopLocal(); const keep = S.trackId; try { localStorage.setItem(CHOP_KEY, JSON.stringify({ trackId: keep })); } catch (e) {} clearTimeout(saveT); location.reload();
});
addEventListener("keydown", e => {
  if (e.target.closest("input, textarea, .slider, .dialog") || e.ctrlKey || e.altKey || e.metaKey) return;
  const i = PAD_KEYS.indexOf(e.key.toLowerCase());
  if (i >= 0 && !e.repeat) { e.preventDefault(); if (buffer || waiting) pressPad(i); return; }
  if (e.key === " ") { e.preventDefault(); playing ? stop() : start(); }
  else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && buffer && !e.target.closest(".lwell")) {
    e.preventDefault(); S.startBeat += (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 4 : 1); reslice(); save();
  }
});

// ---------- export: four bars to WAV ----------
$("wav").addEventListener("click", async () => {
  if (!buffer) { toast("Load a song first."); return; }
  const btn = $("wav"); btn.disabled = true; btn.textContent = "Rendering…";
  try {
    const SR = 44100, bars = 4, len = bars * STEPS * stepDur() + 2 + (S.fx.reverb ? 1 + S.fx.size * 4.5 : 0) + (S.fx.delay ? 3 : 0);
    const off = new OfflineAudioContext(2, Math.ceil(len * SR), SR), m = off.createGain(); m.gain.value = S.vol;
    const ofx = createFx(off, { bpm: S.bpm, params: S.fx }); m.connect(ofx.input); ofx.output.connect(off.destination);
    let last = null; const p = pat(), r = rate();
    for (let n = 0; n < bars * STEPS; n++) { const v = p[n % STEPS]; if (v < 0) continue; const t = 0.02 + n * stepDur(); if (S.choke && last) last(t); last = playSlice(off, m, buffer, slices[v], t, r, 0.9); }
    const name = `chop-${S.cur}-${Math.round(S.bpm)}bpm.wav`;
    download(toWav(await off.startRendering()), name);
    if (!notify("Pattern saved", `${name} is in your downloads folder.`, "chop")) toast(`Saved ${name}`);
  } catch (e) { toast("Couldn't render the WAV. Try again.", true); }
  btn.disabled = false; btn.textContent = "Export WAV";
});

// ---------- library ----------
let tracks = [];
const list = vlist($("list"), $("rows"), { rowHeight: 26, head: 24, empty: () => `<div class="lempty"><b>${$("q").value.trim() ? "Nothing matches." : "No songs yet."}</b>${$("q").value.trim() ? "Try a title or artist." : "Add songs in Amp; they appear here straight away."}</div>` });
function renderList(keepScroll) {
  const q = $("q").value.trim().toLowerCase();
  const shown = tracks.filter(t => !q || `${t.title} ${t.artist} ${t.album} ${t.genre}`.toLowerCase().includes(q)).sort((a, b) => (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" }));
  $("crateHint").textContent = tracks.length ? `${tracks.length} song${tracks.length === 1 ? "" : "s"} · double-click to load` : "";
  list.set(shown, t => `<div class="lrow song${track && t.id === track.id ? " loaded" : ""}" role="row" data-id="${esc(t.id)}"><span>${esc(t.title)}</span><span class="d">${esc(t.artist || "")}</span>
    <span class="num">${t.bpm ? Math.round(t.bpm) : ""}</span><span class="num">${fmt(t.duration)}</span><button class="btn" data-load="${esc(t.id)}">Load</button></div>`, { keepScroll });
}
async function loadLibrary() {
  try { const db = await openDb(); tracks = (await all(db, "tracks")).filter(t => t.blob || t.link); db.close(); } catch (e) { tracks = []; }
  tracks.forEach(t => { delete t.coverBlob; });
  renderList(true);
}
$("q").addEventListener("input", () => renderList(false));
$("rows").addEventListener("click", e => { const b = e.target.closest("[data-load]"); if (b) { const t = tracks.find(x => x.id === b.dataset.load); if (t) loadTrack(t, true); } });
$("rows").addEventListener("dblclick", e => { const r = e.target.closest(".lrow.song"); if (r && !e.target.closest("button")) { const t = tracks.find(x => x.id === r.dataset.id); if (t) loadTrack(t, true); } });
onLibraryChange(async () => { await loadLibrary(); if (track) { const t = tracks.find(x => x.id === track.id); if (t && t.analysis && !track.analysis) { track = t; beats = beatsOf(t, buffer.duration); showSong(); reslice(); } } });

// ---------- start ----------
renderPads(); renderSeq(); renderTransport(); showSong(); drawWaves();
const panel = fxPanel($("fx"), S.fx, (p, done) => { if (fx) fx.set(p); if (done) save(); });
loadLibrary().then(() => { const t = S.trackId && tracks.find(x => x.id === S.trackId); if (t) loadTrack(t); });
