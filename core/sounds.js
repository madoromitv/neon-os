// Neon OS core: system sounds
// Small sounds made on the fly (no sound files): soft ticks, glides for opening and closing, a thump for snapping,
// a two-note chime, and a short burst of static for warnings. Calm by default, like the rest of the look.
// Turned on or off, and their volume set, in the theme (Settings and the taskbar tray).
import { getTheme } from "./theme.js";

let ctx = null, out = null;
function ready() {
  const t = getTheme();
  if (t.sounds === false) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); out = ctx.createGain(); out.connect(ctx.destination);
  }
  if (ctx.state !== "running") ctx.resume().catch(() => {});
  out.gain.value = Math.pow(t.sysVol == null ? 0.6 : t.sysVol, 2) * 0.9;
  return ctx;
}
function tone(f0, f1, dur, type = "sine", vol = 0.12, delay = 0) {
  const c = ready(); if (!c) return;
  const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, freq, q, vol, delay = 0, sweepTo) {
  const c = ready(); if (!c) return;
  const t = c.currentTime + delay, n = Math.ceil(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf; bp.type = "bandpass"; bp.frequency.setValueAtTime(freq, t); bp.Q.value = q;
  if (sweepTo) bp.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp); bp.connect(g); g.connect(out); src.start(t);
}

export const sfx = {
  tick() { noise(0.03, 3200, 4, 0.25); },
  open() { tone(520, 980, 0.16, "triangle", 0.09); tone(780, 1470, 0.18, "sine", 0.04, 0.02); },
  close() { tone(900, 420, 0.16, "triangle", 0.08); },
  minimise() { tone(700, 460, 0.1, "triangle", 0.06); },
  restore() { tone(460, 700, 0.1, "triangle", 0.06); },
  snap() { tone(160, 70, 0.09, "sine", 0.18); noise(0.025, 2400, 3, 0.15); },
  chime() { tone(1320, 1320, 0.35, "sine", 0.07); tone(1760, 1760, 0.45, "sine", 0.06, 0.09); },
  static() { noise(0.14, 5000, 1.2, 0.18, 0, 1200); },
};
