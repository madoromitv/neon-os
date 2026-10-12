// Neon OS core: chopping songs into slices
// A song's beats come from its analysis (the same data the visualiser uses). Sixteen slices start at a chosen
// beat, each a beat, half a beat or a quarter of a beat long, so they land on the music's own grid.
// Shared by Chop (the sampler) and Tape (which plays Chop patterns in an arrangement).
export const PADS = 16, STEPS = 16, SLOTS = ["A", "B", "C", "D"];
export const PAD_KEYS = "1234qwerasdfzxcv"; // four rows of four, like the pads
export const DIVS = [{ v: 1, name: "1 beat" }, { v: 0.5, name: "½ beat" }, { v: 0.25, name: "¼ beat" }];
export const CHOP_KEY = "neon-os:chop";
export const chopDefaults = () => ({ trackId: null, startBeat: 0, div: 0.5, bpm: 120, link: false, vol: 0.85, match: true, choke: true, cur: "A",
  patterns: { A: [0, -1, 1, -1, 2, -1, 3, -1, 4, -1, 5, -1, 6, -1, 7, -1], B: new Array(STEPS).fill(-1), C: new Array(STEPS).fill(-1), D: new Array(STEPS).fill(-1) } });
export function loadChop() {
  let s = chopDefaults();
  try { const v = JSON.parse(localStorage.getItem(CHOP_KEY) || "null"); if (v) s = { ...s, ...v, patterns: { ...s.patterns, ...(v.patterns || {}) } }; } catch (e) {}
  for (const k of SLOTS) if (!Array.isArray(s.patterns[k]) || s.patterns[k].length !== STEPS) s.patterns[k] = new Array(STEPS).fill(-1);
  return s;
}

// The song's beat times in seconds. Without analysis, beats are spaced evenly at its tempo (or 120) from the start.
export function beatsOf(track, duration) {
  const an = track && track.analysis;
  if (an && an.beats && an.beats.length > 4) { const off = typeof an.offset === "number" ? an.offset : 1024 / 22050; return an.beats.map(b => b + off); }
  const step = 60 / ((track && track.bpm) || 120), out = [];
  for (let t = 0; t < duration; t += step) out.push(t);
  return out;
}
// tempo of the song, from analysis or from its beats
export function songBpm(track, beats) {
  if (track && track.bpm) return track.bpm;
  if (beats.length > 2) return 60 / ((beats[beats.length - 1] - beats[0]) / (beats.length - 1));
  return 120;
}
// time of a fractional beat number, carrying on past the last beat at the average spacing
export function timeOfBeat(beats, b) {
  if (!beats.length) return b * 0.5;
  const avg = beats.length > 1 ? (beats[beats.length - 1] - beats[0]) / (beats.length - 1) : 0.5;
  if (b <= 0) return Math.max(0, beats[0] + b * avg);
  const i = Math.floor(b), f = b - i;
  if (i >= beats.length - 1) return beats[beats.length - 1] + (b - (beats.length - 1)) * avg;
  return beats[i] + (beats[i + 1] - beats[i]) * f;
}
// nearest beat number to a time
export function beatAt(beats, t) {
  let best = 0, d = Infinity;
  for (let i = 0; i < beats.length; i++) { const x = Math.abs(beats[i] - t); if (x < d) { d = x; best = i; } }
  return best;
}
// the 16 slices: [{ t0, t1 }] in seconds
export function slicesOf(beats, startBeat, div, duration) {
  return Array.from({ length: PADS }, (_, i) => {
    const t0 = timeOfBeat(beats, startBeat + i * div), t1 = timeOfBeat(beats, startBeat + (i + 1) * div);
    return { t0: Math.min(t0, duration), t1: Math.min(Math.max(t1, t0 + 0.01), duration) };
  });
}
// Plays one slice at `when`. rate speeds it up or slows it down (and changes pitch, like a classic sampler).
// Short fades at each end stop clicks. Returns a stop(t) function.
export function playSlice(ctx, out, buffer, sl, when, rate = 1, level = 1) {
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buffer; src.playbackRate.value = rate; src.connect(g); g.connect(out);
  const len = Math.max(0.01, (sl.t1 - sl.t0) / rate), f = Math.min(0.004, len / 4);
  g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(level, when + f);
  g.gain.setValueAtTime(level, when + len - f); g.gain.linearRampToValueAtTime(0, when + len);
  src.start(when, sl.t0, sl.t1 - sl.t0); src.stop(when + len + 0.01);
  return t => { try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.004); src.stop(t + 0.01); } catch (e) {} };
}
