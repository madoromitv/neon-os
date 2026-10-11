// Neon OS core: drum sounds, made on the fly (no samples)
// play(ctx, out, name, time, level) schedules one hit. Works with a live AudioContext or an OfflineAudioContext,
// so the same sounds can be played or rendered to a file.
export const VOICES = [
  { id: "kick", name: "Kick" },
  { id: "snare", name: "Snare" },
  { id: "clap", name: "Clap" },
  { id: "chh", name: "Closed hat" },
  { id: "ohh", name: "Open hat" },
  { id: "tom", name: "Tom" },
  { id: "rim", name: "Rim" },
  { id: "bell", name: "Bell" },
];

const noiseCache = new WeakMap();
function noiseBuf(ctx) {
  if (noiseCache.has(ctx)) return noiseCache.get(ctx);
  const n = ctx.sampleRate, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  noiseCache.set(ctx, b); return b;
}
function env(ctx, out, t, level, attack, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out); return g;
}
function osc(ctx, out, t, type, f0, f1, glide, level, decay) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + glide);
  o.connect(env(ctx, out, t, level, 0.002, decay)); o.start(t); o.stop(t + decay + 0.05);
}
function noise(ctx, out, t, ftype, freq, q, level, decay, offset = 0) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter();
  s.buffer = noiseBuf(ctx); f.type = ftype; f.frequency.value = freq; f.Q.value = q;
  s.connect(f); f.connect(env(ctx, out, t, level, 0.001, decay));
  s.start(t, offset); s.stop(t + decay + 0.05);
}

export function play(ctx, out, id, t, level = 1) {
  const L = level;
  switch (id) {
    case "kick": osc(ctx, out, t, "sine", 160, 42, 0.11, 0.95 * L, 0.42); noise(ctx, out, t, "highpass", 3000, 0.7, 0.18 * L, 0.012); break;
    case "snare": osc(ctx, out, t, "triangle", 190, 150, 0.05, 0.35 * L, 0.11); noise(ctx, out, t, "highpass", 1400, 0.6, 0.5 * L, 0.19); break;
    case "clap":
      for (const d of [0, 0.011, 0.023]) noise(ctx, out, t + d, "bandpass", 1150, 1.4, 0.55 * L, 0.03, Math.random() * 0.5);
      noise(ctx, out, t + 0.03, "bandpass", 1150, 1.1, 0.4 * L, 0.17); break;
    case "chh": noise(ctx, out, t, "highpass", 7600, 0.9, 0.32 * L, 0.045); break;
    case "ohh": noise(ctx, out, t, "highpass", 7000, 0.8, 0.28 * L, 0.34); break;
    case "tom": osc(ctx, out, t, "sine", 230, 110, 0.18, 0.7 * L, 0.3); break;
    case "rim": osc(ctx, out, t, "triangle", 1700, 1700, 0, 0.35 * L, 0.03); noise(ctx, out, t, "bandpass", 3500, 2, 0.2 * L, 0.02); break;
    case "bell": {
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 1.2; bp.connect(out);
      osc(ctx, bp, t, "square", 545, 545, 0, 0.32 * L, 0.28); osc(ctx, bp, t, "square", 815, 815, 0, 0.32 * L, 0.28); break;
    }
  }
}
