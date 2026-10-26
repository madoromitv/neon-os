// Pulse: 16-step drum machine for Neon OS
// Eight synthesised drums, four pattern slots, tempo and swing, accents, per-drum volume and mute,
// and export of four bars to a WAV file. Everything saves in this browser as you go.
import "../../core/os-link.js";
import { mixOut } from "../../core/mixer.js";
import { applyTheme, onTheme } from "../../core/theme.js";
import { VOICES, play as hit, loadSamples, sampleList, setSample, clearSample } from "../../core/drums.js";
import { openMenu } from "../../style-kit/ui.js";
import { clock } from "../../core/clock.js";
import { icon } from "../../style-kit/icons.js";
import { Slider, toast, dialog } from "../../style-kit/ui.js";
import { notify } from "../../core/notify.js";
import { toWav, saveTarget } from "../../core/wav.js";
import { createFx, fxOf } from "../../core/fx.js";
import { fxPanel } from "../../style-kit/fx-panel.js";
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
let S = { bpm: 120, swing: 0, master: 0.9, cur: "A", patterns: { A: starter(), B: blank(), C: blank(), D: blank() }, vol: VOICES.map(() => 0.8), mute: VOICES.map(() => false) };
try {
  const s = JSON.parse(localStorage.getItem(KEY) || "null");
  if (s && s.patterns) S = { ...S, ...s, patterns: { ...S.patterns, ...s.patterns } };
} catch (e) {}
for (const k of SLOTS) if (!Array.isArray(S.patterns[k]) || S.patterns[k].length !== VOICES.length) S.patterns[k] = blank();
S.fx = fxOf(S);
let saveT = null;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 200); };
const pat = () => S.patterns[S.cur];
// the chain: letters A–D, one bar each, played in order and round again
const chainOf = () => (S.chain || "").toUpperCase().replace(/[^ABCD]/g, "").split("");
const chainLive = () => S.chainOn && chainOf().length > 0;
const patAt = bar => chainLive() ? S.patterns[chainOf()[((bar % chainOf().length) + chainOf().length) % chainOf().length]] : pat();

// ---------- audio ----------
let ctx = null, master = null, buses = [], fx = null;
function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = S.master;
    fx = createFx(ctx, { bpm: S.bpm, params: S.fx }); master.connect(fx.input); fx.output.connect(mixOut(ctx, "pulse"));
    buses = VOICES.map((_, i) => { const g = ctx.createGain(); g.gain.value = S.mute[i] ? 0 : S.vol[i]; g.connect(master); return g; });
    loadSamples(ctx);
  }
  if (ctx.state !== "running") ctx.resume().catch(() => {});
  return ctx;
}
const setBus = i => { if (buses[i]) buses[i].gain.setTargetAtTime(S.mute[i] ? 0 : S.vol[i], ctx.currentTime, 0.01); };

// lookahead scheduler: every 25 ms, queue any steps due in the next 120 ms
let playing = false, nextTime = 0, nextStep = 0, absStep = 0, timer = null;
const queue = []; // [{ step, time }] for the playhead
const stepDur = () => 60 / S.bpm / 4;
function stepTime(base, step) { return base + (step % 2 ? S.swing * stepDur() * 0.5 : 0); } // swing delays every second 16th
const following = () => S.link && clock.state.playing;
function schedule() {
  if (fx) fx.setBpm(S.bpm);
  while (nextTime < ctx.currentTime + 0.12) {
    if (following()) { const c = clock.state, ms = 60000 / c.bpm / 4; nextTime = clock.toAudio(ctx, c.origin + absStep * ms); } // locked to the shared clock, no drift
    const t = stepTime(nextTime, nextStep), p = patAt(Math.floor(absStep / STEPS));
    if (nextStep === 0) queue.push({ bar: Math.floor(absStep / STEPS), time: t });
    VOICES.forEach((v, i) => { const s = p[i][nextStep]; if (s) hit(ctx, buses[i], v.id, t, s === 2 ? 1 : 0.62); });
    queue.push({ step: nextStep, time: t });
    nextTime += stepDur(); nextStep = (nextStep + 1) % STEPS; absStep++;
  }
}
function align() { // join the shared clock at the next 16th, in the right place in the bar
  const n = clock.nextStep(4);
  absStep = n.index; nextStep = ((n.index % STEPS) + STEPS) % STEPS; nextTime = clock.toAudio(ctx, n.wall); queue.length = 0;
}
function startLocal() {
  ensureAudio(); if (playing) return;
  playing = true; queue.length = 0;
  if (following()) align(); else { absStep = 0; nextStep = 0; nextTime = ctx.currentTime + 0.06; }
  schedule(); timer = setInterval(schedule, 25);
  renderTransport(); requestAnimationFrame(draw);
}
function stopLocal() { playing = false; clearInterval(timer); queue.length = 0; showNow(-1); renderTransport(); }
// with Link on, play and stop drive the shared clock, and every linked app follows it
function start() { if (S.link && !clock.state.playing) { ensureAudio(); clock.start(S.bpm); return; } startLocal(); }
function stop() { if (S.link && clock.state.playing) { clock.stop(); return; } stopLocal(); }
clock.subscribe(c => {
  if (!S.link) return;
  if (c.bpm !== S.bpm) { S.bpm = c.bpm; tempo.set(c.bpm); $("bpm").textContent = Math.round(c.bpm); save(); }
  if (c.playing && !playing) startLocal();
  else if (!c.playing && playing) stopLocal();
  else if (c.playing && playing) align();
});

// ---------- grid ----------
const grid = $("grid");
function build() {
  grid.innerHTML = `<div class="trk heads" aria-hidden="true"><span></span><span></span><span></span><span></span>${Array.from({ length: STEPS }, (_, s) => `<span class="${s % 4 ? "" : "b"}" data-h="${s}">${s % 4 ? "·" : s / 4 + 1}</span>`).join("")}</div>` +
    VOICES.map((v, i) => `<div class="trk${S.mute[i] ? " muted" : ""}" data-v="${i}" role="row">
      <span class="name" title="Play ${v.name}" data-audition="${i}">${v.name}</span>
      <button class="btn mute" data-mute="${i}" aria-pressed="${!S.mute[i]}" aria-label="${v.name} on" title="Mute"><i class="led"></i></button>
      <div class="slider h" data-vol="${i}"></div><span class="pct" data-pct="${i}">${Math.round(S.vol[i] * 100)}%</span>
      ${Array.from({ length: STEPS }, (_, s) => `<button class="step${s % 4 ? "" : " beat"}" data-s="${s}" role="gridcell" aria-label="${v.name} step ${s + 1}"></button>`).join("")}
    </div>`).join("");
  grid.querySelectorAll("[data-vol]").forEach(el => { const i = +el.dataset.vol; Slider(el, { min: 0, max: 1, step: 0.01, value: S.vol[i], label: `${VOICES[i].name} volume`, text: v => Math.round(v * 100) + "%", onInput: v => { S.vol[i] = v; setBus(i); grid.querySelector(`[data-pct="${i}"]`).textContent = Math.round(v * 100) + "%"; }, onChange: save }); });
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
  if (fx) panel.meter(fx.reduction);
  if (!playing) return;
  const now = ctx.currentTime - (ctx.outputLatency || 0);
  while (queue.length > 1 && queue[1].time <= now) { const q = queue.shift(); if (q.bar != null && chainLive()) { const c = chainOf(); $("patLcd").textContent = c[q.bar % c.length]; } }
  if (queue.length && queue[0].time <= now && queue[0].step != null) showNow(queue[0].step);
  requestAnimationFrame(draw);
}

// ---------- transport, tempo, swing, patterns ----------
function renderTransport() {
  $("play").innerHTML = icon("play"); $("stop").innerHTML = icon("stop");
  $("play").classList.toggle("down", playing);
  $("link").setAttribute("aria-pressed", String(!!S.link));
  $("bpm").textContent = Math.round(S.bpm); $("patLcd").textContent = S.cur;
  $("pats").innerHTML = SLOTS.map(k => `<button class="btn" data-pat="${k}" aria-pressed="${k === S.cur}" title="Pattern ${k}">${k}</button>`).join("");
}
const tempo = Slider($("tempo"), { min: 60, max: 200, step: 1, value: S.bpm, label: "Tempo", text: v => `${v} BPM`, onInput: v => { S.bpm = v; $("bpm").textContent = v; if (S.link) clock.setBpm(v); }, onChange: save });
Slider($("swing"), { min: 0, max: 0.6, step: 0.01, value: S.swing, label: "Swing", text: v => Math.round(v / 0.6 * 100) + "%", onInput: v => { S.swing = v; $("swingPct").textContent = Math.round(v / 0.6 * 100) + "%"; }, onChange: save });
$("swingPct").textContent = Math.round(S.swing / 0.6 * 100) + "%";
Slider($("master"), { min: 0, max: 1, step: 0.01, value: S.master, label: "Pulse volume", text: v => Math.round(v * 100) + "%",
  onInput: v => { S.master = v; $("masterPct").textContent = Math.round(v * 100) + "%"; if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.01); }, onChange: save });
$("masterPct").textContent = Math.round(S.master * 100) + "%";
$("bpmDown").addEventListener("click", () => { tempo.set(S.bpm - 1, true); save(); });
$("bpmUp").addEventListener("click", () => { tempo.set(S.bpm + 1, true); save(); });
$("play").addEventListener("click", () => playing ? stop() : start());
$("stop").addEventListener("click", stop);
$("link").addEventListener("click", () => {
  const was = playing; if (was) stopLocal();
  S.link = !S.link; save(); renderTransport();
  if (S.link && clock.state.playing && !was) { S.bpm = clock.state.bpm; tempo.set(S.bpm); $("bpm").textContent = Math.round(S.bpm); }
  if (was) start();
});
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
  const target = await saveTarget(`pulse-${S.cur}-${Math.round(S.bpm)}bpm.wav`, { description: "WAV audio", accept: { "audio/wav": [".wav"] } }); if (!target) return; // Save as, before rendering
  const btn = $("wav"); btn.disabled = true; btn.textContent = "Rendering…";
  try {
    const SR = 44100, bars = chainLive() ? chainOf().length : 4, len = bars * STEPS * stepDur() + 1.2 + (S.fx.reverb ? 1 + S.fx.size * 4.5 : 0) + (S.fx.delay ? 3 : 0);
    const off = new OfflineAudioContext(2, Math.ceil(len * SR), SR), m = off.createGain(); m.gain.value = S.master;
    const ofx = createFx(off, { bpm: S.bpm, params: S.fx }); m.connect(ofx.input); ofx.output.connect(off.destination);
    const bs = VOICES.map((_, i) => { const g = off.createGain(); g.gain.value = S.mute[i] ? 0 : S.vol[i]; g.connect(m); return g; });
    await loadSamples(off);
    for (let n = 0; n < bars * STEPS; n++) { const s = n % STEPS, p = patAt(Math.floor(n / STEPS)), t = stepTime(0.02 + n * stepDur(), s); VOICES.forEach((v, i) => { if (p[i][s]) hit(off, bs[i], v.id, t, p[i][s] === 2 ? 1 : 0.62); }); }
    await target.write(toWav(await off.startRendering()));
    if (!notify("Pattern saved", `${target.picked ? `Saved as ${target.name}.` : `${target.name} is in your downloads folder.`}`, "pulse")) toast(`Saved ${target.name}`);
  } catch (e) { toast("Couldn't render the WAV. Try again.", true); }
  btn.disabled = false; btn.textContent = "Export WAV";
});

$("reset").addEventListener("click", async () => {
  const ok = await dialog({ title: "Reset Pulse", text: "Clear all four patterns and put tempo, swing, volumes and Link back to how they started?", confirm: "Reset", danger: true });
  if (!ok) return;
  stopLocal(); try { localStorage.removeItem(KEY); } catch (e) {} clearTimeout(saveT); location.reload();
});
// ---------- the chain ----------
$("chain").value = S.chain || "";
const syncChain = () => { $("chainOn").setAttribute("aria-pressed", String(!!S.chainOn)); const c = chainOf(); $("chainHint").textContent = c.length ? `${c.length} bar${c.length === 1 ? "" : "s"}: ${c.join(" ")}` : "Bars in order, one letter each"; if (!chainLive()) $("patLcd").textContent = S.cur; };
$("chain").addEventListener("input", () => { S.chain = $("chain").value.toUpperCase().replace(/[^ABCD]/g, ""); $("chain").value = S.chain; syncChain(); save(); });
$("chainOn").addEventListener("click", () => { S.chainOn = !S.chainOn; if (S.chainOn && !chainOf().length) { toast("Type a chain first, like AABA", true); S.chainOn = false; } syncChain(); save(); });
syncChain();

// ---------- MIDI: the beat (four bars, or the chain) as a General MIDI drum track ----------
const GM = { kick: 36, snare: 38, clap: 39, chh: 42, ohh: 46, tom: 45, rim: 37, bell: 56 };
function midiFile() {
  const PPQ = 96, tick16 = PPQ / 4, bars = chainLive() ? chainOf().length : 4, ev = [];
  for (let n = 0; n < bars * STEPS; n++) {
    const s = n % STEPS, p = patAt(Math.floor(n / STEPS)), at = Math.round(n * tick16 + (s % 2 ? S.swing * tick16 * 0.5 : 0));
    VOICES.forEach((v, i) => { const x = p[i][s]; if (x && !S.mute[i]) { const vel = Math.round((x === 2 ? 118 : 82) * Math.max(0.2, S.vol[i])); ev.push([at, 0x99, GM[v.id], Math.min(127, vel)], [at + tick16 - 2, 0x89, GM[v.id], 0]); } });
  }
  ev.sort((a, b) => a[0] - b[0] || (a[1] === 0x89 ? -1 : 1));
  const vlq = n => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
  const us = Math.round(60e6 / S.bpm), data = [0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255, 0, 0xff, 0x58, 4, 4, 2, 24, 8];
  let last = 0; for (const [t, st, note, vel] of ev) { data.push(...vlq(t - last), st, note, vel); last = t; }
  data.push(...vlq(Math.max(0, bars * STEPS * tick16 - last)), 0xff, 0x2f, 0);
  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, PPQ >> 8, PPQ & 255], trk = [0x4d, 0x54, 0x72, 0x6b, (data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255];
  return new Blob([new Uint8Array([...head, ...trk, ...data])], { type: "audio/midi" });
}
$("midi").addEventListener("click", async () => {
  const name = `pulse-${chainLive() ? "chain" : S.cur}-${Math.round(S.bpm)}bpm.mid`, t = await saveTarget(name, { description: "MIDI file", accept: { "audio/midi": [".mid"] } }); if (!t) return;
  await t.write(midiFile()); if (!notify("MIDI saved", `${t.picked ? `Saved as ${t.name}.` : `${t.name} is in your downloads folder.`} Drums are on channel 10.`, "pulse")) toast(`Saved ${t.name}`);
});

// ---------- your own samples: right-click a drum's name ----------
async function markSamples() { const list = await sampleList().catch(() => ({})); grid.querySelectorAll("[data-audition]").forEach(n => { const v = VOICES[+n.dataset.audition], smp = list[v.id]; n.classList.toggle("smp", !!smp); n.title = smp ? `${v.name}: your sample ${smp.name}. Right-click to change` : `Play ${v.name}. Right-click to use your own sample`; }); }
grid.addEventListener("contextmenu", async e => {
  const nm = e.target.closest("[data-audition]"); if (!nm) return; e.preventDefault();
  const v = VOICES[+nm.dataset.audition], list = await sampleList().catch(() => ({}));
  const pick = () => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "audio/*"; inp.onchange = async () => { const f = inp.files[0]; if (!f) return; if (f.size > 8e6) { toast("Pick a short sound (under 8 MB).", true); return; } await setSample(v.id, f.name, f); if (ctx) await loadSamples(ctx); markSamples(); toast(`${v.name} now plays ${f.name}`); }; inp.click(); };
  openMenu(null, [{ text: `Use a sample for ${v.name}…`, run: pick }, ...(list[v.id] ? [{ text: `Back to the built-in ${v.name}`, run: async () => { await clearSample(v.id); if (ctx) await loadSamples(ctx); markSamples(); } }] : []), { note: "Tape and exports use it too." }], { x: e.clientX, y: e.clientY });
});
build(); renderTransport(); markSamples();
const panel = fxPanel($("fx"), S.fx, (p, done) => { if (fx) fx.set(p); if (done) save(); });
