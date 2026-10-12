// Neon OS core: how loud a song is
// Measured like broadcast loudness meters, simplified: the song is cut into 0.4 s blocks, near-silent blocks and
// quiet passages (more than 10 dB under the average) are left out, and what remains is averaged.
// Returns { db, peak }: loudness in dB (0 = full scale) and the highest sample level, for volume levelling.
export function measureLoudness(buf) {
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const block = Math.max(1, Math.round(buf.sampleRate * 0.4)), step = 3, blocks = [];
  let peak = 0;
  for (let o = 0; o + block <= buf.length; o += block) {
    let sum = 0, n = 0;
    for (const d of chans) for (let i = o; i < o + block; i += step) { const v = d[i]; sum += v * v; n++; const a = v < 0 ? -v : v; if (a > peak) peak = a; }
    blocks.push(sum / n);
  }
  const loud = blocks.filter(b => b > 1e-7); // quieter than -70 dB: silence
  if (!loud.length) return { db: -70, peak };
  const mean = loud.reduce((a, b) => a + b, 0) / loud.length, gate = mean / 10;
  const kept = loud.filter(b => b >= gate), m = kept.reduce((a, b) => a + b, 0) / Math.max(1, kept.length);
  return { db: Math.round(10 * Math.log10(m) * 10) / 10, peak: Math.round(peak * 1000) / 1000 };
}
// The gain that brings a song to the target loudness without pushing its peaks past full scale.
export function levelGain({ db, peak }, target = -14) {
  let g = Math.max(-9, Math.min(6, target - db));
  if (peak > 0) g = Math.min(g, -20 * Math.log10(peak) - 0.3);
  return Math.pow(10, g / 20);
}
