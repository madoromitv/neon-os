// Drift: synth for Neon OS
// Play it from the on-screen keyboard, the computer keyboard or a MIDI keyboard, shape the sound, and run a
// 16-step note sequence that can Link to the shared clock with Pulse. Saves as you go.
import "../../core/os-link.js";
import { applyTheme, onTheme } from "../../core/theme.js";
import { createSynth, PRESETS, WAVES, DEFAULTS } from "../../core/synth.js";
import { clock } from "../../core/clock.js";
import { icon } from "../../style-kit/icons.js";
import { Slider, openMenu, toast, dialog } from "../../style-kit/ui.js";
applyTheme(); onTheme(applyTheme);

const $ = id => document.getElementById(id);
const KEY = "neon-os:drift", STEPS = 16, ROWS = 13; // one octave plus the top C
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);
const isBlack = n => [1, 3, 6, 8, 10].includes(n % 12);

// ---------- state ----------
let S = { preset: "Neon Lead", params: { ...PRESETS["Neon Lead"] }, oct: 4, sOct: 3, bpm: 120, link: false, seq: [0, null, 7, null, 12, null, 7, null, 3, null, 10, null, 7, null, 5, null] };
try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && s.params) S = { ...S, ...s, params: { ...DEFAULTS, ...s.params } }; } catch (e) {}
if (!Array.isArray(S.seq) || S.seq.length !== STEPS) S.seq = new Array(STEPS).fill(null);
let saveT = null;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 200); };

// ---------- audio ----------
let ctx = null, synth = null;
function ensure() {
  if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); synth = createSynth(ctx, ctx.destination); synth.set(S.params); }
  if (ctx.state !== "running") ctx.resume().catch(() => {});
  return synth;
}
const held = new Set();
function down(m, vel = 1) { ensure().noteOn(m, ctx.currentTime, vel); held.add(m); $("note").textContent = noteName(m); keyLit(m, true); }
function up(m) { if (!synth) return; synth.noteOff(m); held.delete(m); keyLit(m, false); }

// ---------- sound controls ----------
const SPEC = {
  detune: { min: -12, max: 24, step: 1, fmt: v => `${v > 0 ? "+" : ""}${v} st` },
  fine: { min: 0, max: 40, step: 1, fmt: v => `${v} ct` },
  mix: { min: 0, max: 1, step: 0.01, fmt: v => `${Math.round((1 - v) * 100)}/${Math.round(v * 100)}` },
  cutoff: { min: 0, max: 1, step: 0.001, log: [60, 14000], fmt: v => v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v) + "" },
  res: { min: 0.5, max: 20, step: 0.1, fmt: v => v.toFixed(1) },
  envAmt: { min: 0, max: 1, step: 0.01, fmt: v => Math.round(v * 100) + "%" },
  lfoRate: { min: 0.05, max: 12, step: 0.05, fmt: v => v.toFixed(2) + "Hz" },
  lfoDepth: { min: 0, max: 1, step: 0.01, fmt: v => Math.round(v * 100) + "%" },
  attack: { min: 0.001, max: 2, step: 0.001 }, decay: { min: 0.01, max: 2.5, step: 0.01 }, sustain: { min: 0, max: 1, step: 0.01 },
  release: { min: 0.01, max: 3, step: 0.01 }, volume: { min: 0, max: 1, step: 0.01 },
};
const toSlider = (k, v) => SPEC[k].log ? Math.log(v / SPEC[k].log[0]) / Math.log(SPEC[k].log[1] / SPEC[k].log[0]) : v;
const fromSlider = (k, v) => SPEC[k].log ? SPEC[k].log[0] * Math.pow(SPEC[k].log[1] / SPEC[k].log[0], v) : v;
const sliders = {};
document.querySelectorAll("[data-p]").forEach(el => {
  const k = el.dataset.p, sp = SPEC[k], v = el.classList.contains("v") ? "v" : "h";
  sliders[k] = Slider(el, { min: sp.min, max: sp.max, step: sp.step, value: toSlider(k, S.params[k]), orient: v, label: k, text: x => (sp.fmt || (y => y.toFixed(2)))(fromSlider(k, x)),
    onInput: x => { const val = fromSlider(k, x); S.params[k] = val; if (synth) synth.set({ [k]: val }); showVal(k); markEdited(); }, onChange: save });
});
function showVal(k) { const el = document.querySelector(`[data-v="${k}"]`); if (el) el.textContent = SPEC[k].fmt(S.params[k]); }
document.querySelectorAll(".waves").forEach(box => {
  const k = box.dataset.osc;
  box.innerHTML = WAVES.map(w => `<button class="btn" data-w="${w}" aria-pressed="${S.params[k] === w}">${{ sine: "Sine", triangle: "Tri", sawtooth: "Saw", square: "Square" }[w]}</button>`).join("");
  box.addEventListener("click", e => { const b = e.target.closest("[data-w]"); if (!b) return; S.params[k] = b.dataset.w; if (synth) synth.set({ [k]: b.dataset.w }); syncWaves(); markEdited(); save(); });
});
function syncWaves() { document.querySelectorAll(".waves").forEach(box => box.querySelectorAll("[data-w]").forEach(b => b.setAttribute("aria-pressed", String(S.params[box.dataset.osc] === b.dataset.w)))); }
function markEdited() { if (!S.preset.endsWith("*")) { S.preset += "*"; $("preset").textContent = S.preset.toUpperCase(); } }
function loadPreset(name) {
  S.preset = name; S.params = { ...DEFAULTS, ...PRESETS[name] };
  for (const k in sliders) sliders[k].set(toSlider(k, S.params[k]));
  Object.keys(SPEC).forEach(k => SPEC[k].fmt && showVal(k)); syncWaves();
  if (synth) synth.set(S.params);
  $("preset").textContent = name.toUpperCase(); save();
}
$("presetBtn").addEventListener("click", e => openMenu(e.currentTarget, Object.keys(PRESETS).map(n => ({ text: n, run: () => { loadPreset(n); ensure(); down(60); setTimeout(() => up(60), 350); } }))));

// ---------- keyboard ----------
const KEYMAP = "awsedftgyhujk"; // C to C, piano layout on the home row
function buildKeys() {
  const base = S.oct * 12 + 12, whites = [];
  for (let m = base; m <= base + 24; m++) if (!isBlack(m)) whites.push(m);
  const w = 100 / whites.length;
  let html = "";
  whites.forEach(m => { const ki = m - base; html += `<div class="key" data-m="${m}">${ki < 13 ? `<span class="k">${KEYMAP[ki].toUpperCase()}</span>` : ""}</div>`; });
  for (let m = base; m <= base + 24; m++) if (isBlack(m)) {
    const left = whites.indexOf(m - 1) * w + w * 0.68, ki = m - base;
    html += `<div class="key blk" data-m="${m}" style="left:${left}%;width:${w * 0.64}%">${ki < 13 ? `<span class="k">${KEYMAP[ki].toUpperCase()}</span>` : ""}</div>`;
  }
  $("keys").innerHTML = html; $("oct").textContent = S.oct;
}
function keyLit(m, on) { const k = $("keys").querySelector(`[data-m="${m}"]`); if (k) k.classList.toggle("down", on); }
let ptrNote = null;
$("keys").addEventListener("pointerdown", e => { const k = e.target.closest(".key"); if (!k) return; $("keys").setPointerCapture(e.pointerId); ptrNote = +k.dataset.m; down(ptrNote); });
$("keys").addEventListener("pointermove", e => {
  if (ptrNote == null) return; const k = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".key"); if (!k || +k.dataset.m === ptrNote) return;
  up(ptrNote); ptrNote = +k.dataset.m; down(ptrNote);
});
const ptrUp = () => { if (ptrNote != null) { up(ptrNote); ptrNote = null; } };
$("keys").addEventListener("pointerup", ptrUp); $("keys").addEventListener("pointercancel", ptrUp);
const octave = d => { S.oct = Math.max(1, Math.min(7, S.oct + d)); [...held].forEach(up); buildKeys(); save(); };
$("octDown").addEventListener("click", () => octave(-1)); $("octUp").addEventListener("click", () => octave(1));
const typed = new Map();
addEventListener("keydown", e => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target.closest("input, textarea")) return;
  const k = e.key.toLowerCase(), i = KEYMAP.indexOf(k);
  if (i >= 0) { const m = S.oct * 12 + 12 + i; typed.set(k, m); down(m); e.preventDefault(); }
  else if (k === "z") octave(-1); else if (k === "x") octave(1);
  else if (k === " ") { e.preventDefault(); playing ? stop() : start(); }
});
addEventListener("keyup", e => { const k = e.key.toLowerCase(); if (typed.has(k)) { up(typed.get(k)); typed.delete(k); } });
addEventListener("blur", () => { [...held].forEach(up); typed.clear(); });
if (navigator.requestMIDIAccess) {
  navigator.requestMIDIAccess().then(acc => {
    const hook = () => { let n = 0; acc.inputs.forEach(inp => { n++; inp.onmidimessage = m => { const [st, note, vel] = m.data, cmd = st & 0xf0; if (cmd === 0x90 && vel > 0) down(note, vel / 127); else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) up(note); }; }); $("midi").textContent = n ? `MIDI · ${n} IN` : ""; };
    hook(); acc.onstatechange = hook;
  }).catch(() => {});
}

// ---------- sequencer ----------
function buildRoll() {
  let html = "";
  for (let r = ROWS - 1; r >= 0; r--) {
    html += `<span class="nl${isBlack(r) ? "" : " blk"}">${NAMES[r % 12]}${r === 12 ? "↑" : ""}</span>`;
    for (let s = 0; s < STEPS; s++) html += `<button class="cell${s % 4 ? "" : " beat"}${isBlack(r) ? " blk" : ""}" data-r="${r}" data-s="${s}" aria-label="${NAMES[r % 12]} step ${s + 1}"></button>`;
  }
  $("roll").innerHTML = html; $("sOct").textContent = S.sOct; renderRoll();
}
function renderRoll() { $("roll").querySelectorAll(".cell").forEach(c => c.classList.toggle("on", S.seq[+c.dataset.s] === +c.dataset.r)); }
$("roll").addEventListener("click", e => {
  const c = e.target.closest(".cell"); if (!c) return;
  const s = +c.dataset.s, r = +c.dataset.r;
  S.seq[s] = S.seq[s] === r ? null : r; renderRoll(); save();
  if (S.seq[s] != null && !playing) { const m = (S.sOct + 1) * 12 + r; down(m); setTimeout(() => up(m), 180); }
});
$("sOctDown").addEventListener("click", () => { S.sOct = Math.max(1, S.sOct - 1); $("sOct").textContent = S.sOct; save(); });
$("sOctUp").addEventListener("click", () => { S.sOct = Math.min(6, S.sOct + 1); $("sOct").textContent = S.sOct; save(); });
$("clearSeq").addEventListener("click", () => { S.seq = new Array(STEPS).fill(null); renderRoll(); save(); });

let playing = false, timer = null, nextTime = 0, nextStep = 0, absStep = 0;
const queue = [];
const stepDur = () => 60 / S.bpm / 4, following = () => S.link && clock.state.playing;
function schedule() {
  while (nextTime < ctx.currentTime + 0.12) {
    if (following()) { const c = clock.state; nextTime = clock.toAudio(ctx, c.origin + absStep * (60000 / c.bpm / 4)); }
    const r = S.seq[nextStep];
    if (r != null) { const m = (S.sOct + 1) * 12 + r, t = nextTime; synth.noteOn(m, t, 0.9); synth.noteOff(m, t + stepDur() * 0.85); }
    queue.push({ step: nextStep, time: nextTime });
    nextTime += stepDur(); nextStep = (nextStep + 1) % STEPS; absStep++;
  }
}
function align() { const n = clock.nextStep(4); absStep = n.index; nextStep = ((n.index % STEPS) + STEPS) % STEPS; nextTime = clock.toAudio(ctx, n.wall); queue.length = 0; }
function startLocal() {
  ensure(); if (playing) return; playing = true; queue.length = 0;
  if (following()) align(); else { absStep = 0; nextStep = 0; nextTime = ctx.currentTime + 0.06; }
  schedule(); timer = setInterval(schedule, 25); renderTransport(); requestAnimationFrame(draw);
}
function stopLocal() { playing = false; clearInterval(timer); queue.length = 0; if (synth) synth.allOff(); showNow(-1); renderTransport(); }
function start() { if (S.link && !clock.state.playing) { ensure(); clock.start(S.bpm); return; } startLocal(); }
function stop() { if (S.link && clock.state.playing) { clock.stop(); return; } stopLocal(); }
clock.subscribe(c => {
  if (!S.link) return;
  if (c.bpm !== S.bpm) { S.bpm = c.bpm; tempo.set(c.bpm); $("bpm").textContent = Math.round(c.bpm); save(); }
  if (c.playing && !playing) startLocal(); else if (!c.playing && playing) stopLocal(); else if (c.playing && playing) align();
});
let shown = -1;
function showNow(s) { if (s === shown) return; shown = s; $("roll").querySelectorAll(".now").forEach(x => x.classList.remove("now")); if (s >= 0) $("roll").querySelectorAll(`[data-s="${s}"]`).forEach(x => x.classList.add("now")); }
function draw() { if (!playing) return; const now = ctx.currentTime - (ctx.outputLatency || 0); while (queue.length > 1 && queue[1].time <= now) queue.shift(); if (queue.length && queue[0].time <= now) showNow(queue[0].step); requestAnimationFrame(draw); }
function renderTransport() {
  $("play").innerHTML = icon("play"); $("stop").innerHTML = icon("stop");
  $("play").classList.toggle("down", playing); $("link").setAttribute("aria-pressed", String(!!S.link)); $("bpm").textContent = Math.round(S.bpm);
}
const tempo = Slider($("tempo"), { min: 60, max: 200, step: 1, value: S.bpm, label: "Tempo", text: v => `${v} BPM`, onInput: v => { S.bpm = v; $("bpm").textContent = v; if (S.link) clock.setBpm(v); }, onChange: save });
$("play").addEventListener("click", () => playing ? stop() : start());
$("stop").addEventListener("click", stop);
$("link").addEventListener("click", () => {
  const was = playing; if (was) stopLocal();
  S.link = !S.link; save(); renderTransport();
  if (S.link && clock.state.playing && !was) { S.bpm = clock.state.bpm; tempo.set(S.bpm); $("bpm").textContent = Math.round(S.bpm); }
  if (was) start();
  toast(S.link ? "Linked: plays in time with Pulse and other linked apps" : "Link off");
});

// ---------- start ----------
$("preset").textContent = S.preset.toUpperCase();
Object.keys(SPEC).forEach(k => SPEC[k].fmt && showVal(k));
$("reset").addEventListener("click", async () => {
  const ok = await dialog({ title: "Reset Drift", text: "Put the sound, sequence, octaves, tempo and Link back to how they started?", confirm: "Reset", danger: true });
  if (!ok) return;
  stopLocal(); try { localStorage.removeItem(KEY); } catch (e) {} clearTimeout(saveT); location.reload();
});
buildKeys(); buildRoll(); renderTransport();
