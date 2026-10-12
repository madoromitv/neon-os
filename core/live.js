// Neon OS core: live listening for the orb
// Turns live sound (a microphone, a line-in, a mixer) into what the orb dances to, the same shape as a song's
// analysis: six bands' loudness (0 to 1), hits in each band as they happen, and a beat position that follows the
// tempo it hears. Everything is worked out frame by frame from an AnalyserNode; nothing is recorded or kept.
import { AN_BANDS } from "./analysis.js";

export async function listInputs() {
  try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audioinput"); } catch (e) { return []; }
}
// ctx: an AudioContext; deviceId: optional; given: a MediaStream to listen to instead of asking for an input.
// Throws if the browser or the person says no.
export async function createLive(ctx, deviceId, given) {
  const stream = given || await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
  an.fftSize = 2048; an.smoothingTimeConstant = 0;
  src.connect(an);
  const bins = an.frequencyBinCount, nyq = ctx.sampleRate / 2, spec = new Float32Array(bins);
  const ranges = AN_BANDS.map(([, lo, hi]) => [Math.max(1, Math.floor(lo / nyq * bins)), Math.max(1, Math.min(bins - 1, Math.ceil(hi / nyq * bins)))]);
  const nb = ranges.length;
  const B = ranges.map(() => ({ e: 0, lo: 99, hi: -99, prev: 0, fluxAvg: 0, fluxVar: 0, last: -1, pulse: 0, top: 0.5 }));
  // the tempo: an onset-strength signal at ~60 per second, autocorrelated every 2 s over the last 8 s
  const RATE = 60, HIST = RATE * 8, onsetSig = new Float32Array(HIST); let sigAt = 0, sigAcc = 0, sigT = 0;
  let bpm = 120, phase = 0, lastTempo = 0, t = 0;

  function tempo() {
    let best = 0, bestLag = 0;
    const minLag = Math.round(RATE * 60 / 180), maxLag = Math.round(RATE * 60 / 70);
    for (let lag = minLag; lag <= maxLag; lag++) {
      let s = 0; for (let i = 0; i < HIST - lag; i++) s += onsetSig[(sigAt + i) % HIST] * onsetSig[(sigAt + i + lag) % HIST];
      const w = 1 - 0.3 * Math.abs(Math.log2((RATE * 60 / lag) / 120)); // a gentle lean towards 90 to 160 BPM
      if (s * w > best) { best = s * w; bestLag = lag; }
    }
    if (bestLag && best > 1e-3) { const found = RATE * 60 / bestLag; bpm = Math.abs(found - bpm) > 8 ? found : bpm + (found - bpm) * 0.3; }
  }

  // dt in seconds since the last frame; returns { envs, pulses, fires: [{ band, strength }], bp, bpm, level }
  function frame(dt) {
    dt = Math.min(0.1, Math.max(0.001, dt)); t += dt;
    an.getFloatFrequencyData(spec);
    const fires = []; let level = 0;
    for (let b = 0; b < nb; b++) {
      const [k0, k1] = ranges[b], s = B[b]; let p = 0;
      for (let k = k0; k <= k1; k++) p += Math.pow(10, spec[k] / 10);
      const e = Math.log1p(Math.sqrt(p / (k1 - k0 + 1)) * 2000);
      // loudness against the band's own recent range, so quiet rooms and loud mixers both fill the orb
      s.lo = Math.min(e, s.lo + dt * 0.05); s.hi = Math.max(e, s.hi - dt * 0.08); if (s.hi - s.lo < 0.4) s.hi = s.lo + 0.4;
      s.e += ((e - s.lo) / (s.hi - s.lo) - s.e) * Math.min(1, dt * 18);
      level += s.e / nb;
      // a hit: a rise well above the usual rise, and not too soon after the last one
      const flux = Math.max(0, e - s.prev); s.prev = e;
      const sd = Math.sqrt(Math.max(1e-6, s.fluxVar));
      const gap = b >= 4 ? 0.09 : 0.12;
      if (flux > s.fluxAvg + 1.6 * sd + 0.02 && t - s.last > gap && s.e > 0.15) {
        s.top = Math.max(flux, s.top * 0.97); const st = Math.min(1, flux / (s.top + 1e-6));
        s.last = t; s.pulse = Math.max(s.pulse, st); fires.push({ band: b, strength: st });
        if (b <= 1) sigAcc += st; // kick and bass carry the beat
        if (b === 4) sigAcc += st * 0.6;
      }
      const k = Math.min(1, dt * 2); s.fluxAvg += (flux - s.fluxAvg) * k; s.fluxVar += ((flux - s.fluxAvg) ** 2 - s.fluxVar) * k;
      s.pulse *= Math.exp(-dt / 0.16);
    }
    // the tempo signal at a steady rate
    sigT += dt; while (sigT >= 1 / RATE) { sigT -= 1 / RATE; onsetSig[sigAt] = sigAcc; sigAt = (sigAt + 1) % HIST; sigAcc = 0; }
    if (t - lastTempo > 2) { lastTempo = t; tempo(); }
    // the beat: runs at the tempo, and a strong kick pulls it into step
    phase += dt * bpm / 60;
    const kick = fires.find(f => f.band === 0 && f.strength > 0.5);
    if (kick) { const err = phase - Math.round(phase); phase -= err * 0.25; }
    return { envs: B.map(s => Math.max(0, Math.min(1, s.e))), pulses: B.map(s => s.pulse), fires, bp: phase, bpm, level };
  }
  function stop() { try { src.disconnect(); } catch (e) {} stream.getTracks().forEach(tr => tr.stop()); }
  const label = stream.getAudioTracks()[0] ? stream.getAudioTracks()[0].label : "";
  return { frame, stop, stream, label };
}
