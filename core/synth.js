// Neon OS core: a small polyphonic synth
// Two oscillators per note into a resonant low-pass filter with its own envelope, an amp envelope, and an LFO that
// sweeps the filter. createSynth(ctx, out) works with a live or offline AudioContext.
export const WAVES = ["sine", "triangle", "sawtooth", "square"];
export const DEFAULTS = { wave1: "sawtooth", wave2: "square", detune: 0, fine: 8, mix: 0.4, cutoff: 2400, res: 4, envAmt: 0.4,
  attack: 0.01, decay: 0.25, sustain: 0.6, release: 0.35, lfoRate: 0.5, lfoDepth: 0.15, volume: 0.6 };
export const PRESETS = {
  "Neon Lead": { wave1: "sawtooth", wave2: "square", detune: 0, fine: 9, mix: 0.45, cutoff: 3200, res: 6, envAmt: 0.45, attack: 0.005, decay: 0.2, sustain: 0.7, release: 0.25, lfoRate: 5, lfoDepth: 0.06, volume: 0.55 },
  "Dream Pad": { wave1: "triangle", wave2: "sawtooth", detune: 12, fine: 14, mix: 0.35, cutoff: 1300, res: 2, envAmt: 0.25, attack: 0.9, decay: 1.2, sustain: 0.8, release: 1.6, lfoRate: 0.25, lfoDepth: 0.35, volume: 0.5 },
  "Sub Bass": { wave1: "sine", wave2: "square", detune: -12, fine: 0, mix: 0.25, cutoff: 600, res: 3, envAmt: 0.3, attack: 0.005, decay: 0.3, sustain: 0.8, release: 0.15, lfoRate: 0.5, lfoDepth: 0, volume: 0.75 },
  "Pluck": { wave1: "sawtooth", wave2: "triangle", detune: 12, fine: 5, mix: 0.3, cutoff: 900, res: 8, envAmt: 0.85, attack: 0.002, decay: 0.22, sustain: 0.05, release: 0.2, lfoRate: 0.5, lfoDepth: 0, volume: 0.6 },
  "Static Bells": { wave1: "sine", wave2: "square", detune: 19, fine: 3, mix: 0.3, cutoff: 5200, res: 1, envAmt: 0.2, attack: 0.002, decay: 0.9, sustain: 0.0, release: 0.9, lfoRate: 7, lfoDepth: 0.05, volume: 0.5 },
  "Drift": { wave1: "sawtooth", wave2: "sawtooth", detune: 7, fine: 18, mix: 0.5, cutoff: 1800, res: 9, envAmt: 0.3, attack: 0.08, decay: 0.6, sustain: 0.5, release: 0.8, lfoRate: 0.12, lfoDepth: 0.55, volume: 0.5 },
  "Init": { ...DEFAULTS },
};
export const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

export function createSynth(ctx, out) {
  const P = { ...DEFAULTS };
  const master = ctx.createGain(); master.gain.value = P.volume; master.connect(out);
  const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
  lfo.frequency.value = P.lfoRate; lfo.connect(lfoGain); lfo.start();
  const voices = new Map(); // midi -> voice
  const lfoAmount = () => P.lfoDepth * P.cutoff * 0.9;
  lfoGain.gain.value = lfoAmount();

  function noteOn(midi, t = ctx.currentTime, vel = 1) {
    if (voices.has(midi)) noteOff(midi, t);
    if (voices.size >= 10) noteOff(voices.keys().next().value, t); // keep it light: ten notes at once
    const f = midiHz(midi);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g1 = ctx.createGain(), g2 = ctx.createGain();
    o1.type = P.wave1; o2.type = P.wave2;
    o1.frequency.setValueAtTime(f, t); o2.frequency.setValueAtTime(f * Math.pow(2, P.detune / 12), t); o2.detune.setValueAtTime(P.fine, t);
    g1.gain.value = 1 - P.mix; g2.gain.value = P.mix;
    const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.Q.value = P.res;
    const base = P.cutoff, peak = Math.min(16000, base + P.envAmt * 9000);
    filt.frequency.setValueAtTime(base, t); filt.frequency.linearRampToValueAtTime(peak, t + P.attack + 0.001);
    filt.frequency.setTargetAtTime(base + (peak - base) * P.sustain, t + P.attack, Math.max(0.01, P.decay / 3));
    lfoGain.connect(filt.frequency);
    const amp = ctx.createGain(), lvl = 0.32 * vel;
    amp.gain.setValueAtTime(0.0001, t); amp.gain.linearRampToValueAtTime(lvl, t + P.attack + 0.001);
    amp.gain.setTargetAtTime(lvl * Math.max(0.0001, P.sustain), t + P.attack, Math.max(0.01, P.decay / 3));
    o1.connect(g1); o2.connect(g2); g1.connect(filt); g2.connect(filt); filt.connect(amp); amp.connect(master);
    o1.start(t); o2.start(t);
    voices.set(midi, { o1, o2, amp, filt });
  }
  function noteOff(midi, t = ctx.currentTime) {
    const v = voices.get(midi); if (!v) return;
    voices.delete(midi);
    v.amp.gain.cancelScheduledValues(t); v.amp.gain.setTargetAtTime(0.0001, t, Math.max(0.01, P.release / 4));
    const end = t + P.release * 1.6 + 0.05;
    v.o1.stop(end); v.o2.stop(end);
    setTimeout(() => { try { lfoGain.disconnect(v.filt.frequency); } catch (e) {} }, Math.max(0, (end - ctx.currentTime) * 1000 + 50));
  }
  function set(patch) {
    Object.assign(P, patch);
    master.gain.setTargetAtTime(P.volume, ctx.currentTime, 0.02);
    lfo.frequency.setTargetAtTime(P.lfoRate, ctx.currentTime, 0.02);
    lfoGain.gain.setTargetAtTime(lfoAmount(), ctx.currentTime, 0.02);
    for (const v of voices.values()) { v.filt.Q.setTargetAtTime(P.res, ctx.currentTime, 0.02); }
  }
  function allOff() { for (const m of [...voices.keys()]) noteOff(m); }
  return { params: P, noteOn, noteOff, set, allOff };
}
