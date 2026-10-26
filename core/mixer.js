// Neon OS core: the volume mixer
// Every app that makes sound sends it through here instead of straight to the speakers, so the Mixer app can set a
// volume for each app and for everything (Master), mute any of them, show how loud each one is right now, and pick
// the speakers or headphones it all comes out of.
//
//   const out = mixOut(ctx, "pulse")   a GainNode: connect to it where you'd have used ctx.destination
//   mixMedia(audioOrVideoEl, "radio")   for an <audio> or <video>: its own volume is multiplied by the mix
//                                       (pass { meter: true } for same-origin media to meter it through Web Audio)
//
// The mix is saved in localStorage ("neon-os:mix") and reaches every window at once (BroadcastChannel + storage).
// Levels travel on another channel ("neon-os:levels") about 12 times a second, only from apps making sound.
const KEY = "neon-os:mix", LEVELS = "neon-os:levels";
const mixChan = "BroadcastChannel" in window ? new BroadcastChannel(KEY) : null;
const levelChan = "BroadcastChannel" in window ? new BroadcastChannel(LEVELS) : null;

export function getMix() {
  try { const m = JSON.parse(localStorage.getItem(KEY) || "{}"); return { master: 1, apps: {}, sink: "", ...m }; } catch (e) { return { master: 1, apps: {}, sink: "" }; }
}
export function setMix(patch) {
  const m = { ...getMix(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) {}
  if (mixChan) mixChan.postMessage(m);
  for (const fn of listeners) fn(m);
  return m;
}
export function setAppMix(app, patch) { const m = getMix(); return setMix({ apps: { ...m.apps, [app]: { v: 1, mute: false, ...(m.apps[app] || {}), ...patch } } }); }
// the volume an app should play at: its own slider × Master, or 0 when either is muted
export function gainFor(app, m = getMix()) { const a = m.apps[app] || {}; return m.muteAll || a.mute ? 0 : (m.master ?? 1) * (a.v ?? 1); }

const listeners = new Set();
export function onMix(fn) { listeners.add(fn); return () => listeners.delete(fn); }
if (mixChan) mixChan.addEventListener("message", e => { for (const fn of listeners) fn(e.data); });
addEventListener("storage", e => { if (e.key === KEY) { const m = getMix(); for (const fn of listeners) fn(m); } });

// ---------- levels ----------
const meters = []; // { app, read() → 0..1 }
let meterT = 0;
function tick() {
  const by = {};
  for (const m of meters) { const v = m.read(); if (v > (by[m.app] || 0)) by[m.app] = v; }
  for (const app in by) if (by[app] > 0.002) post(app, by[app]);
}
function post(app, level) { const msg = { app, level, at: Date.now() }; if (levelChan) levelChan.postMessage(msg); for (const fn of levelFns) fn(msg); }
const levelFns = new Set();
export function onLevel(fn) { levelFns.add(fn); const h = e => fn(e.data); const ch = "BroadcastChannel" in window ? new BroadcastChannel(LEVELS) : null; if (ch) ch.addEventListener("message", h); return () => { levelFns.delete(fn); if (ch) ch.close(); }; }
function addMeter(app, read) { meters.push({ app, read }); if (!meterT) meterT = setInterval(tick, 80); }
function analyserMeter(an) {
  const buf = new Float32Array(an.fftSize);
  return () => { an.getFloatTimeDomainData(buf); let pk = 0; for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > pk) pk = v; } return pk; };
}

// ---------- speakers or headphones ----------
export const canPickOutput = () => typeof AudioContext !== "undefined" && "setSinkId" in AudioContext.prototype;
export async function outputs() {
  try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audiooutput" && d.deviceId !== "default" && d.deviceId !== "communications"); } catch (e) { return []; }
}
const sinks = new Set(); // contexts and media elements to move when the output changes
const sinkNow = new WeakMap();
function applySink(target, id) { id = id || ""; if ((sinkNow.get(target) || "") === id) return; sinkNow.set(target, id); try { if (target.setSinkId) target.setSinkId(id).catch(() => {}); } catch (e) {} }

// ---------- outputs ----------
export function mixOut(ctx, app) {
  const g = ctx.createGain(), an = ctx.createAnalyser(); an.fftSize = 512;
  g.connect(an); an.connect(ctx.destination);
  const apply = m => { g.gain.setTargetAtTime(gainFor(app, m), ctx.currentTime, 0.03); };
  g.gain.value = gainFor(app); onMix(m => { apply(m); if (m.sink !== undefined) applySink(ctx, m.sink); });
  const read = analyserMeter(an); addMeter(app, () => ctx.state === "running" ? read() : 0);
  sinks.add(ctx); const s = getMix().sink; if (s) applySink(ctx, s);
  return g;
}
export function mixMedia(el, app, { meter = false } = {}) {
  let own = el.volume, ours = -1;
  // the app keeps setting el.volume to its own volume; the mix multiplies it (and ignores the changes it makes itself)
  const apply = (m = getMix()) => { ours = Math.max(0, Math.min(1, own * gainFor(app, m))); el.volume = ours; };
  el.addEventListener("volumechange", () => { if (Math.abs(el.volume - ours) < 1e-4) return; own = el.volume; apply(); });
  onMix(m => { apply(m); applySink(el, m.sink); });
  apply(); const s = getMix().sink; if (s) applySink(el, s);
  if (meter) {
    let an = null;
    const hook = () => { if (an) return; try { const AC = window.AudioContext || window.webkitAudioContext, ctx = new AC(), src = ctx.createMediaElementSource(el); an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an); an.connect(ctx.destination); const read = analyserMeter(an); addMeter(app, () => el.paused ? 0 : read()); sinks.add(ctx); const s2 = getMix().sink; if (s2) applySink(ctx, s2); onMix(m => applySink(ctx, m.sink)); } catch (e) {} };
    el.addEventListener("play", hook, { once: true });
  } else addMeter(app, () => el.paused || el.muted ? 0 : el.volume * 0.6); // streams from other sites can't be measured: it shows the volume while playing
  return { setOwn(v) { own = v; apply(); } };
}
