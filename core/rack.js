// Neon OS core: the Rack's sounds in one place
// Reads what Pulse, Drift and Chop have saved and plays any of their patterns at a given moment, on a live or an
// offline AudioContext. Tape uses it to play an arrangement and render it to a file.
import { VOICES, play as hit } from "./drums.js";
import { createSynth, DEFAULTS, PRESETS } from "./synth.js";
import { loadChop, beatsOf, songBpm, slicesOf, playSlice } from "./chop.js";

export const LANES = [
  { id: "drums", name: "Drums", app: "pulse", values: ["A", "B", "C", "D"] },
  { id: "synth", name: "Synth", app: "drift", values: ["♪"] },
  { id: "chop", name: "Chop", app: "chop", values: ["A", "B", "C", "D"] },
];
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") || d; } catch (e) { return d; } };
export function readRack() {
  const pulse = read("neon-os:pulse", {}), drift = read("neon-os:drift", {});
  return {
    pulse: { patterns: pulse.patterns || {}, vol: pulse.vol || VOICES.map(() => 0.8), mute: pulse.mute || VOICES.map(() => false), swing: pulse.swing || 0, master: pulse.master == null ? 0.9 : pulse.master },
    drift: { params: { ...DEFAULTS, ...(drift.params || PRESETS["Neon Lead"]) }, sOct: drift.sOct == null ? 3 : drift.sOct, seq: Array.isArray(drift.seq) ? drift.seq : [0, null, 7, null, 12, null, 7, null, 3, null, 10, null, 7, null, 5, null] },
    chop: loadChop(),
  };
}
// The 16 on/off marks of a pattern, for drawing a lane's cells
export function patternMarks(rack, lane, v) {
  if (lane === "drums") { const p = rack.pulse.patterns[v]; return Array.from({ length: 16 }, (_, s) => !!(p && p.some(r => r[s]))); }
  if (lane === "synth") return rack.drift.seq.map(n => n != null);
  const p = rack.chop.patterns[v]; return Array.from({ length: 16 }, (_, s) => !!(p && p[s] >= 0));
}

// chopSong: { track, buffer } for Chop's song, or null
export function createRack(ctx, out, rack, chopSong) {
  const lane = {}; for (const l of LANES) { lane[l.id] = ctx.createGain(); lane[l.id].connect(out); }
  const pulseMaster = ctx.createGain(); pulseMaster.gain.value = rack.pulse.master; pulseMaster.connect(lane.drums);
  const buses = VOICES.map((_, i) => { const g = ctx.createGain(); g.gain.value = rack.pulse.mute[i] ? 0 : rack.pulse.vol[i]; g.connect(pulseMaster); return g; });
  const synth = createSynth(ctx, lane.synth); synth.set(rack.drift.params);
  const chopOut = ctx.createGain(); chopOut.gain.value = rack.chop.vol; chopOut.connect(lane.chop);
  let slices = [], cRate = 1, lastSlice = null;
  const setChop = (song, bpm) => {
    if (!song || !song.buffer) { slices = []; return; }
    const beats = beatsOf(song.track, song.buffer.duration);
    slices = slicesOf(beats, rack.chop.startBeat, rack.chop.div, song.buffer.duration);
    cRate = rack.chop.match ? bpm / songBpm(song.track, beats) : 1;
  };
  return {
    lane,
    setChop,
    // patterns playing this bar: { drums: "A", synth: "♪", chop: null }; s: step 0–15; t: when; dur: one 16th in seconds
    step(cells, s, t, dur) {
      if (cells.drums) {
        const p = rack.pulse.patterns[cells.drums], tt = t + (s % 2 ? rack.pulse.swing * dur * 0.5 : 0);
        if (p) VOICES.forEach((v, i) => { const x = p[i] && p[i][s]; if (x) hit(ctx, buses[i], v.id, tt, x === 2 ? 1 : 0.62); });
      }
      if (cells.synth) {
        const r = rack.drift.seq[s];
        if (r != null) { const m = (rack.drift.sOct + 1) * 12 + r; synth.noteOn(m, t, 0.9); synth.noteOff(m, t + dur * 0.85); }
      }
      if (cells.chop && chopSong && chopSong.buffer && slices.length) {
        const p = rack.chop.patterns[cells.chop], v = p ? p[s] : -1;
        if (v >= 0 && slices[v]) { if (rack.chop.choke && lastSlice) lastSlice(t); lastSlice = playSlice(ctx, chopOut, chopSong.buffer, slices[v], t, cRate, 0.9); }
      }
    },
    stopAll(t) { synth.allOff(); if (lastSlice) lastSlice(t); },
  };
}
