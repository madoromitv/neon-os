// Pulse: 16-step drum machine for Neon OS
// Eight synthesised drums, four pattern slots, tempo and swing, accents, per-drum volume and mute,
// and export of four bars to a WAV file. Everything saves in this browser as you go.
import "../../core/os-link.js";
import { applyTheme, onTheme } from "../../core/theme.js";
import { VOICES, play as hit } from "../../core/drums.js";
import { icon } from "../../style-kit/icons.js";
import { Slider, toast } from "../../style-kit/ui.js";
applyTheme(); onTheme(applyTheme);

const $ = id => document.getElementById(id);
const STEPS = 16, SLOTS = ["A", "B", "C", "D"], KEY = "neon-os:pulse";
const blank = () => VOICES.map(() => new Array(STEPS).fill(0));
const starter = () => { // a simple beat so there's something to hear straight away
  const p = blank(), on = (v, steps, val = 1) => steps.forEach(s => p[v][s] = val);
  on(0, [0, 8, 10]); on(0, [0], 2); on(1, [4, 12], 2); on(3, [0, 2, 4, 6, 8, 10, 12]); on(4, [14]);
  return p;
};

// ---------- state ----------
let S = { bpm: 120, swing: 0, cur: "A", patterns: { A: starter(), B: blank(), C: blank(), D: blank() }, vol: VOICES.map(() => 0.8), mute: VOICES.map(() => false) };
try {
  const s = JSON.parse(localStorage.getItem(KEY) || "null");
  if (s && s.patterns) S = { ...S, ...s, patterns: { ...S.patterns, ...s.patterns } };
} catch (e) {}
for (const k of SLOTS) if (!Array.isArray(S.patterns[k]) || S.patterns[k].length !== VOICES.length) S.patterns[k] = blank();
let saveT = null;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 200); };
const pat = () => S.patterns[S.cur];

// ---------- audio ----------
let ctx = null, master = null, buses = [];
function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    buses = VOICES.map((_, i) => { const g = ctx.createGain(); g.gain.value = S.mute[i] ? 0 : S.vol[i]; g.connect(master); return g; });
  }
  if (ctx.state !== "running") ctx.resume().catch(() => {});
  return ctx;
}
const setBus = i => { if (buses[i]) buses[i].gain.setTargetAtTime(S.mute[i] ? 0 : S.vol[i], ctx.currentTime, 0.01); };

// lookahead scheduler: every 25 ms, queue any steps due in the next 120 ms
let playing = false, nextTime = 0, nextStep = 0, timer = null;
const queue = []; // [{ step, time }] for the playhead
const stepDur = () => 60 / S.bpm / 4;
function stepTime(base, step) { return base + (step % 2 ? S.swing * stepDur() * 0.5 : 0); } // swing delays every second 16th
function schedule() {
  while (nextTime < ctx.currentTime + 0.12) {
    const t = stepTime(nextTime, nextStep), p = pat();
    VOICES.forEach((v, i) => { const s = p[i][nextStep]; if (s) hit(ctx, buses[i], v.id, t, s === 2 ? 1 : 0.62); });
    queue.push({ step: nextStep, time: t });
    nextTime += stepDur(); nextStep = (nextStep + 1) % STEPS;
  }
}
function start() {
  ensureAudio(); if (playing) return;
  playing = true; nextStep = 0; nextTime = ctx.currentTime + 0.06; queue.length = 0;
  schedule(); timer = setInterval(schedule, 25);
  renderTransport(); requestAnimationFrame(draw);
}
function stop() { playing = false; clearInterval(timer); queue.length = 0; showNow(-1); renderTransport(); }

// ---------- grid ----------
const grid = $("grid");
function build() {
  grid.innerHTML = `<div class="trk heads" aria-hidden="true"><span></span><span></span><span></span>${Array.from({ length: STEPS }, (_, s) => `<span class="${s % 4 ? "" : "b"}" data-h="${s}">${s % 4 ? "·" : s / 4 + 1}</span>`).join("")}</div>` +
    VOICES.map((v, i) => `<div class="trk${S.mute[i] ? " muted" : ""}" data-v="${i}" role="row">
      <span class="name" title="Play ${v.name}" data-audition="${i}">${v.name}</span>
      <button class="btn mute" data-mute="${i}" aria-pressed="${!S.mute[i]}" aria-label="${v.name} on" title="Mute"><i class="led"></i></button>
      <div class="slider h" data-vol="${i}"></div>
      ${Array.from({ length: STEPS }, (_, s) => `<button class="step${s % 4 ? "" : " beat"}" data-s="${s}" role="gridcell" aria-label="${v.name} step ${s + 1}"></button>`).join("")}
    </div>`).join("");
  grid.querySelectorAll("[data-vol]").forEach(el => { const i = +el.dataset.vol; Slider(el, { min: 0, max: 1, step: 0.01, value: S.vol[i], label: `${VOICES[i].name} volume`, text: v => Math.round(v * 100) + "%", onInput: v => { S.vol[i] = v; setBus(i); }, onChange: save }); });
  renderSteps();
}
function renderSteps() {
  const p = pat();
  grid.querySelectorAll(".trk[data-v]").forEach(row => {
    const i = +row.dataset.v;
    row.querySelectorAll(".step").forEach(b => { const v = p[i][+b.dataset.s]; b.classList.toggle("on", v === 1); b.classList.toggle("acc", v === 2); b.setAttribute("aria-pressed", String(v > 0)); });
  });
}
grid.addEventListener("click", e => {
  const st = e.target.closest(".step"), mu = e.target.closest("[data-mute]"), au = e.target.closest("[data-audition]");
  if (st) {
    const i = +st.closest(".trk").dataset.v, s = +st.dataset.s, p = pat();
    p[i][s] = (p[i][s] + 1) % 3; renderSteps(); save();
    if (p[i][s] && !playing) { ensureAudio(); hit(ctx, buses[i], VOICES[i].id, ctx.currentTime + 0.01, p[i][s] === 2 ? 1 : 0.62); }
  } else if (mu) {
    const i = +mu.dataset.mute; S.mute[i] = !S.mute[i];
    mu.setAttribute("aria-pressed", String(!S.mute[i])); mu.closest(".trk").classList.toggle("muted", S.mute[i]);
    if (ctx) setBus(i); save();
  } else if (au) { const i = +au.dataset.audition; ensureAudio(); hit(ctx, buses[i], VOICES[i].id, ctx.currentTime + 0.01, 1); }
});
grid.addEventListener("contextmenu", e => { const st = e.target.closest(".step"); if (!st) return; e.preventDefault(); const i = +st.closest(".trk").dataset.v; pat()[i][+st.dataset.s] = 0; renderSteps(); save(); });

// ---------- playhead ----------
let shown = -1;
function showNow(step) {
  if (step === shown) return; shown = step;
  grid.querySelectorAll(".now").forEach(x => x.classList.remove("now"));
  if (step < 0) { $("pos").textContent = "1.1"; return; }
  grid.querySelectorAll(`[data-s="${step}"], [data-h="${step}"]`).forEach(x => x.classList.add("now"));
  $("pos").textContent = `${Math.floor(step / 4) + 1}.${step % 4 + 1}`;
}
function draw() {
  if (!playing) return;
  const now = ctx.currentTime - (ctx.outputLatency || 0);
  while (queue.length > 1 && queue[1].time <= now) queue.shift();
  if (queue.length && queue[0].time <= now) showNow(queue[0].step);
  requestAnimationFrame(draw);
}

// ---------- transport, tempo, swing, patterns ----------
function renderTransport() {
  $("play").innerHTML = icon("play"); $("stop").innerHTML = icon("stop");
  $("play").classList.toggle("down", playing);
  $("bpm").textContent = Math.round(S.bpm); $("patLcd").textContent = S.cur;
  $("pats").innerHTML = SLOTS.map(k => `<button class="btn" data-pat="${k}" aria-pressed="${k === S.cur}" title="Pattern ${k}">${k}</button>`).join("");
}
const tempo = Slider($("tempo"), { min: 60, max: 200, step: 1, value: S.bpm, label: "Tempo", text: v => `${v} BPM`, onInput: v => { S.bpm = v; $("bpm").textContent = v; }, onChange: save });
Slider($("swing"), { min: 0, max: 0.6, step: 0.01, value: S.swing, label: "Swing", text: v => Math.round(v / 0.6 * 100) + "%", onInput: v => { S.swing = v; }, onChange: save });
$("bpmDown").addEventListener("click", () => { tempo.set(S.bpm - 1, true); save(); });
$("bpmUp").addEventListener("click", () => { tempo.set(S.bpm + 1, true); save(); });
$("play").addEventListener("click", () => playing ? stop() : start());
$("stop").addEventListener("click", stop);
$("pats").addEventListener("click", e => { const b = e.target.closest("[data-pat]"); if (!b) return; S.cur = b.dataset.pat; renderSteps(); renderTransport(); save(); });
$("copy").addEventListener("click", () => {
  const next = SLOTS[(SLOTS.indexOf(S.cur) + 1) % SLOTS.length];
  S.patterns[next] = pat().map(r => r.slice()); S.cur = next; renderSteps(); renderTransport(); save(); toast(`Copied to pattern ${next}`);
});
$("clear").addEventListener("click", () => { S.patterns[S.cur] = blank(); renderSteps(); save(); });
addEventListener("keydown", e => {
  if (e.target.closest("input, textarea, .slider")) return;
  if (e.key === " ") { e.preventDefault(); playing ? stop() : start(); }
  else if (/^[1-4]$/.test(e.key) && !e.ctrlKey && !e.altKey) { S.cur = SLOTS[+e.key - 1]; renderSteps(); renderTransport(); save(); }
});

// ---------- export: four bars to WAV ----------
$("wav").addEventListener("click", async () => {
  const btn = $("wav"); btn.disabled = true; btn.textContent = "Rendering…";
  try {
    const SR = 44100, bars = 4, len = bars * STEPS * stepDur() + 1.2;
    const off = new OfflineAudioContext(2, Math.ceil(len * SR), SR), m = off.createGain(); m.gain.value = 0.9; m.connect(off.destination);
    const bs = VOICES.map((_, i) => { const g = off.createGain(); g.gain.value = S.mute[i] ? 0 : S.vol[i]; g.connect(m); return g; });
    const p = pat();
    for (let n = 0; n < bars * STEPS; n++) { const s = n % STEPS, t = stepTime(0.02 + n * stepDur(), s); VOICES.forEach((v, i) => { if (p[i][s]) hit(off, bs[i], v.id, t, p[i][s] === 2 ? 1 : 0.62); }); }
    const buf = await off.startRendering(), wav = toWav(buf);
    const a = document.createElement("a"); a.href = URL.createObjectURL(wav); a.download = `pulse-${S.cur}-${Math.round(S.bpm)}bpm.wav`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    toast(`Saved ${a.download}`);
  } catch (e) { toast("Couldn't render the WAV. Try again.", true); }
  btn.disabled = false; btn.textContent = "Export WAV";
});
function toWav(buf) {
  const ch = buf.numberOfChannels, n = buf.length, data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); data.setUint32(4, 36 + n * ch * 2, true); w(8, "WAVE"); w(12, "fmt ");
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true); data.setUint32(24, buf.sampleRate, true);
  data.setUint32(28, buf.sampleRate * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true); w(36, "data"); data.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, chans[c][i])); data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Blob([data], { type: "audio/wav" });
}

build(); renderTransport();
