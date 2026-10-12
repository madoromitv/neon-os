// Tape: arranger for Neon OS
// Lines up Pulse patterns, the Drift sequence and Chop patterns bar by bar into a whole track, plays it at one tempo
// and exports it as a WAV file. The patterns live in their own apps; edits there are heard here straight away.
import "../../core/os-link.js";
import { applyTheme, onTheme } from "../../core/theme.js";
import { icon } from "../../style-kit/icons.js";
import { Slider, toast, dialog, esc } from "../../style-kit/ui.js";
import { notify } from "../../core/notify.js";
import { toWav, download } from "../../core/wav.js";
import { openDb, all } from "../../core/backup.js";
import { fileOf } from "../../core/linked.js";
import { LANES, readRack, patternMarks, createRack } from "../../core/rack.js";
import { createFx, fxOf } from "../../core/fx.js";
import { fxPanel } from "../../style-kit/fx-panel.js";
applyTheme(); onTheme(applyTheme);

const $ = id => document.getElementById(id);
const KEY = "neon-os:tape", STEPS = 16;
const fmt = s => { s = Math.max(0, s || 0); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`; };
const starter = () => {
  const n = 32, row = () => new Array(n).fill(null);
  const L = { drums: row(), synth: row(), chop: row() };
  for (let b = 0; b < 8; b++) L.drums[b] = "A";
  for (let b = 4; b < 8; b++) L.synth[b] = "♪";
  return L;
};
let S = { bpm: 120, vol: 0.9, loop: false, mark: 0, bars: 32, lanes: starter(), lvol: { drums: 0.9, synth: 0.8, chop: 0.9 }, lmute: { drums: false, synth: false, chop: false } };
try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && s.lanes) S = { ...S, ...s, lanes: { ...S.lanes, ...s.lanes }, lvol: { ...S.lvol, ...(s.lvol || {}) }, lmute: { ...S.lmute, ...(s.lmute || {}) } }; } catch (e) {}
for (const l of LANES) { const a = S.lanes[l.id] || []; S.lanes[l.id] = Array.from({ length: S.bars }, (_, i) => a[i] || null); }
S.fx = fxOf(S); // the whole track's effects, after each lane's own
let saveT = null;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 200); };
const songBars = () => { let n = 0; for (const l of LANES) S.lanes[l.id].forEach((v, i) => { if (v) n = Math.max(n, i + 1); }); return n; };
const barDur = () => 60 / S.bpm * 4;

// ---------- the Rack's patterns, read from Pulse, Drift and Chop ----------
let rack = readRack();
let chopSong = null; // { track, buffer } for Chop's song
async function loadChopSong(ask = false) {
  const id = rack.chop.trackId;
  if (!id || !S.lanes.chop.some(Boolean)) return;
  if (chopSong && chopSong.track.id === id) return;
  try {
    const db = await openDb(); const t = (await all(db, "tracks")).find(x => x.id === id); db.close();
    if (!t) return;
    ensureAudio();
    const buffer = await ctx.decodeAudioData(await (await fileOf(t, ask)).arrayBuffer());
    chopSong = { track: t, buffer };
    if (engine) engine.setChop(chopSong, S.bpm);
  } catch (e) { if (e && e.code === "needs_permission") toast("Press Play again and allow Neon OS to read your music folder, so Chop's song can play.", true); }
}
addEventListener("storage", e => {
  if (!/^neon-os:(pulse|drift|chop)$/.test(e.key || "")) return;
  rack = readRack(); renderCells();
  if (e.key === "neon-os:chop" && chopSong && chopSong.track.id !== rack.chop.trackId) chopSong = null;
  if (playing) { buildEngine(); loadChopSong(); }
});

// ---------- audio ----------
let ctx = null, master = null, engine = null, fx = null;
function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = S.vol;
    fx = createFx(ctx, { bpm: S.bpm, params: S.fx }); master.connect(fx.input); fx.output.connect(ctx.destination);
  }
  if (ctx.state !== "running") ctx.resume().catch(() => {});
  return ctx;
}
function laneGains(e, c) { for (const l of LANES) e.lane[l.id].gain.setValueAtTime(S.lmute[l.id] ? 0 : S.lvol[l.id], c.currentTime); }
function buildEngine() {
  const old = engine;
  engine = createRack(ctx, master, rack, chopSong, S.bpm); engine.setChop(chopSong, S.bpm); laneGains(engine, ctx);
  if (old) setTimeout(() => { for (const l of LANES) try { old.lane[l.id].disconnect(); } catch (e) {} }, 4000); // let old notes ring out
}

// ---------- playing: the same lookahead scheduler as the other Rack apps ----------
let playing = false, nextTime = 0, abs = 0, timer = null, endAt = 0;
const queue = [];
const stepDur = () => 60 / S.bpm / 4;
function cellsAt(bar) { const c = {}; for (const l of LANES) c[l.id] = S.lanes[l.id][bar] || null; return c; }
function schedule() {
  if (fx) fx.setBpm(S.bpm);
  const end = songBars() * STEPS;
  while (nextTime < ctx.currentTime + 0.12) {
    if (abs >= end) {
      if (S.loop && end > S.mark * STEPS) abs = Math.min(S.mark, songBars() - 1) * STEPS;
      else { if (!endAt) endAt = nextTime; if (ctx.currentTime > endAt + 0.1) { stop(); } return; }
    }
    const bar = Math.floor(abs / STEPS), s = abs % STEPS;
    engine.step(cellsAt(bar), s, nextTime, stepDur());
    queue.push({ abs, time: nextTime });
    nextTime += stepDur(); abs++;
  }
}
async function play() {
  if (playing) return;
  if (!songBars()) { toast("Click some bars first: each one plays a pattern from Pulse, Drift or Chop."); return; }
  ensureAudio(); rack = readRack();
  await loadChopSong(true);
  buildEngine();
  playing = true; endAt = 0; queue.length = 0;
  abs = Math.min(S.mark, songBars() - 1) * STEPS; nextTime = ctx.currentTime + 0.08;
  schedule(); timer = setInterval(schedule, 25);
  renderTransport(); requestAnimationFrame(draw);
}
function stop() {
  playing = false; clearInterval(timer); queue.length = 0;
  if (engine && ctx) engine.stopAll(ctx.currentTime);
  showNow(-1); renderTransport();
}

// ---------- arrangement grid ----------
function build() {
  const bars = Array.from({ length: S.bars }, (_, i) => i);
  $("arr").innerHTML = `<div class="lane ruler" role="row"><div class="head"><span class="lbl">Bars</span></div>${bars.map(i => `<button class="bar${i === S.mark ? " mark" : ""}" data-bar="${i}" title="Start here">${i + 1}</button>`).join("")}</div>` +
    LANES.map(l => `<div class="lane${S.lmute[l.id] ? " muted" : ""}" data-lane="${l.id}" role="row">
      <div class="head"><span class="name">${esc(l.name)} <button data-open="${l.app}" title="Open ${l.app[0].toUpperCase() + l.app.slice(1)} to edit the patterns">edit ↗</button></span>
        <button class="btn mute" data-mute="${l.id}" aria-pressed="${!S.lmute[l.id]}" aria-label="${esc(l.name)} on" title="Mute"><i class="led"></i></button>
        <div class="vrow"><div class="slider h" data-lvol="${l.id}"></div><span class="lcd pct" data-lpct="${l.id}">${Math.round(S.lvol[l.id] * 100)}%</span></div></div>
      ${bars.map(i => `<button class="cell" data-lane="${l.id}" data-bar="${i}" role="gridcell"></button>`).join("")}</div>`).join("");
  $("arr").querySelectorAll("[data-lvol]").forEach(el => { const id = el.dataset.lvol; Slider(el, { min: 0, max: 1, step: 0.01, value: S.lvol[id], label: `${id} volume`, text: v => Math.round(v * 100) + "%",
    onInput: v => { S.lvol[id] = v; $("arr").querySelector(`[data-lpct="${id}"]`).textContent = Math.round(v * 100) + "%"; if (engine) laneGains(engine, ctx); }, onChange: save }); });
  renderCells();
}
function renderCells() {
  $("arr").querySelectorAll(".cell").forEach(c => {
    const v = S.lanes[c.dataset.lane][+c.dataset.bar];
    c.classList.toggle("on", !!v);
    const marks = v ? patternMarks(rack, c.dataset.lane, v === "♪" ? null : v) : null;
    c.innerHTML = v ? `<b>${esc(v)}</b><span class="marks">${marks.map(x => `<i${x ? ' class="x"' : ""}></i>`).join("")}</span>` : "";
    c.setAttribute("aria-label", `${c.dataset.lane} bar ${+c.dataset.bar + 1}: ${v ? (v === "♪" ? "sequence" : "pattern " + v) : "empty"}`);
  });
  const n = songBars();
  $("songNote").textContent = n ? `${n} bar${n === 1 ? "" : "s"} · ${fmt(n * barDur())}` : "Empty: click bars below";
  $("time").textContent = `0:00 / ${fmt(n * barDur())}`;
}
$("arr").addEventListener("click", e => {
  const c = e.target.closest(".cell"), bar = e.target.closest(".bar"), mu = e.target.closest("[data-mute]"), op = e.target.closest("[data-open]");
  if (c) {
    const lane = LANES.find(l => l.id === c.dataset.lane), row = S.lanes[lane.id], i = +c.dataset.bar;
    if (e.shiftKey) { let j = i - 1; while (j >= 0 && !row[j]) j--; row[i] = j >= 0 ? row[j] : lane.values[0]; }
    else { const k = row[i] ? lane.values.indexOf(row[i]) : -1; row[i] = k + 1 < lane.values.length ? lane.values[k + 1] : null; }
    renderCells(); save();
    if (lane.id === "chop" && row[i]) loadChopSong();
  } else if (bar) {
    S.mark = +bar.dataset.bar; save();
    $("arr").querySelectorAll(".bar").forEach(b => b.classList.toggle("mark", +b.dataset.bar === S.mark));
    $("pos").textContent = `${S.mark + 1}.1`;
  } else if (mu) {
    const id = mu.dataset.mute; S.lmute[id] = !S.lmute[id];
    mu.setAttribute("aria-pressed", String(!S.lmute[id])); mu.closest(".lane").classList.toggle("muted", S.lmute[id]);
    if (engine) laneGains(engine, ctx); save();
  } else if (op) {
    if (window.parent !== window) parent.postMessage({ neonOs: "open", app: op.dataset.open }, location.origin);
    else location.href = `../${op.dataset.open}/`;
  }
});
$("arr").addEventListener("contextmenu", e => { const c = e.target.closest(".cell"); if (!c) return; e.preventDefault(); S.lanes[c.dataset.lane][+c.dataset.bar] = null; renderCells(); save(); });
$("arr").addEventListener("keydown", e => { const c = e.target.closest(".cell"); if (c && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); S.lanes[c.dataset.lane][+c.dataset.bar] = null; renderCells(); save(); } });

// ---------- playhead ----------
let shownBar = -1;
function showNow(a) {
  const bar = a < 0 ? -1 : Math.floor(a / STEPS);
  if (a < 0) { $("pos").textContent = `${S.mark + 1}.1`; $("time").textContent = `0:00 / ${fmt(songBars() * barDur())}`; }
  else { $("pos").textContent = `${bar + 1}.${Math.floor((a % STEPS) / 4) + 1}`; $("time").textContent = `${fmt(a * stepDur())} / ${fmt(songBars() * barDur())}`; }
  if (bar === shownBar) return; shownBar = bar;
  $("arr").querySelectorAll(".now").forEach(x => x.classList.remove("now"));
  if (bar >= 0) {
    $("arr").querySelectorAll(`[data-bar="${bar}"]`).forEach(x => x.classList.add("now"));
    const b = $("arr").querySelector(`.bar[data-bar="${bar}"]`), box = $("arr");
    if (b && (b.offsetLeft + 60 > box.scrollLeft + box.clientWidth || b.offsetLeft < box.scrollLeft + 220)) box.scrollLeft = b.offsetLeft - 230;
  }
}
function draw() {
  if (!playing) return;
  if (fx) panel.meter(fx.reduction);
  const now = ctx.currentTime - (ctx.outputLatency || 0);
  while (queue.length > 1 && queue[1].time <= now) queue.shift();
  if (queue.length && queue[0].time <= now) showNow(queue[0].abs);
  requestAnimationFrame(draw);
}

// ---------- transport and tools ----------
function renderTransport() {
  $("play").innerHTML = icon("play"); $("stop").innerHTML = icon("stop");
  $("play").classList.toggle("down", playing);
  $("loop").setAttribute("aria-pressed", String(!!S.loop));
  $("bpm").textContent = Math.round(S.bpm);
}
const tempo = Slider($("tempo"), { min: 60, max: 200, step: 1, value: S.bpm, label: "Tempo", text: v => `${v} BPM`, onInput: v => { S.bpm = v; $("bpm").textContent = v; if (engine) engine.setChop(chopSong, v); renderCells(); }, onChange: save });
Slider($("vol"), { min: 0, max: 1, step: 0.01, value: S.vol, label: "Tape volume", text: v => Math.round(v * 100) + "%",
  onInput: v => { S.vol = v; $("volPct").textContent = Math.round(v * 100) + "%"; if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.01); }, onChange: save });
$("volPct").textContent = Math.round(S.vol * 100) + "%";
$("bpmDown").addEventListener("click", () => { tempo.set(S.bpm - 1, true); save(); });
$("bpmUp").addEventListener("click", () => { tempo.set(S.bpm + 1, true); save(); });
$("play").addEventListener("click", () => playing ? stop() : play());
$("stop").addEventListener("click", stop);
$("loop").addEventListener("click", () => { S.loop = !S.loop; save(); renderTransport(); });
$("more").addEventListener("click", () => { S.bars += 8; for (const l of LANES) S.lanes[l.id].push(...new Array(8).fill(null)); save(); build(); $("arr").scrollLeft = $("arr").scrollWidth; });
$("clear").addEventListener("click", async () => {
  if (!(await dialog({ title: "Clear the arrangement", text: "Empty every bar? The patterns in Pulse, Drift and Chop are kept.", confirm: "Clear", danger: true }))) return;
  for (const l of LANES) S.lanes[l.id] = new Array(S.bars).fill(null); S.mark = 0; save(); build();
});
$("reset").addEventListener("click", async () => {
  if (!(await dialog({ title: "Reset Tape", text: "Put the arrangement, tempo, volumes and loop back to how they started? The patterns in Pulse, Drift and Chop are kept.", confirm: "Reset", danger: true }))) return;
  stop(); try { localStorage.removeItem(KEY); } catch (e) {} clearTimeout(saveT); location.reload();
});
addEventListener("keydown", e => {
  if (e.target.closest("input, textarea, .slider, .dialog") || e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.key === " ") { e.preventDefault(); playing ? stop() : play(); }
});

// ---------- export: the whole arrangement to WAV ----------
$("wav").addEventListener("click", async () => {
  const n = songBars(); if (!n) { toast("Nothing to export yet: click some bars first."); return; }
  const btn = $("wav"); btn.disabled = true; btn.textContent = "Rendering…";
  try {
    ensureAudio(); rack = readRack(); await loadChopSong(true);
    const SR = 44100, len = n * barDur() + 2.5 + 5.5; // room for echoes and reverb to fade
    const off = new OfflineAudioContext(2, Math.ceil(len * SR), SR), m = off.createGain(); m.gain.value = S.vol;
    const ofx = createFx(off, { bpm: S.bpm, params: S.fx }); m.connect(ofx.input); ofx.output.connect(off.destination);
    const e = createRack(off, m, rack, chopSong, S.bpm); e.setChop(chopSong, S.bpm); laneGains(e, off);
    for (let a = 0; a < n * STEPS; a++) e.step(cellsAt(Math.floor(a / STEPS)), a % STEPS, 0.05 + a * stepDur(), stepDur());
    const name = `tape-${Math.round(S.bpm)}bpm-${n}bars.wav`;
    download(toWav(await off.startRendering()), name);
    if (!notify("Track saved", `${name} (${fmt(n * barDur())}) is in your downloads folder.`, "tape")) toast(`Saved ${name}`);
  } catch (err) { toast("Couldn't render the WAV. Try again.", true); }
  btn.disabled = false; btn.textContent = "Export WAV";
});

build(); renderTransport(); showNow(-1);
const panel = fxPanel($("fx"), S.fx, (p, done) => { if (fx) fx.set(p); if (done) save(); });
