// Neon OS core: beat, tempo and band analysis of a song, done in the browser
export const AN_BANDS = [["Kick", 25, 90], ["Bass", 90, 250], ["Body", 250, 800], ["Lead", 800, 2500], ["Snare", 2500, 6000], ["Hats", 6000, 11000]];
const tick = () => new Promise(r => setTimeout(r, 0));
function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = Float64Array.from(arr).sort();
  const pos = (s.length - 1) * p / 100, lo = Math.floor(pos), hi = Math.min(s.length - 1, lo + 1);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
function movAvg(x, size) {
  const n = x.length, out = new Float64Array(n), h = Math.floor(size / 2);
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + x[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - h), b = Math.min(n, i - h + size);
    out[i] = (pre[b] - pre[a]) / (b - a);
  }
  return out;
}
function std(x) {
  let m = 0; for (const v of x) m += v; m /= x.length;
  let s = 0; for (const v of x) s += (v - m) * (v - m);
  return Math.sqrt(s / x.length);
}
function makeFFT(N) {
  const lv = Math.log2(N), rev = new Uint32Array(N);
  for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < lv; b++) r |= ((i >> b) & 1) << (lv - 1 - b); rev[i] = r; }
  const cs = new Float64Array(N / 2), sn = new Float64Array(N / 2);
  for (let i = 0; i < N / 2; i++) { cs[i] = Math.cos(2 * Math.PI * i / N); sn[i] = -Math.sin(2 * Math.PI * i / N); }
  return (re, im) => {
    for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1, step = N / size;
      for (let s = 0; s < N; s += size) {
        for (let k = 0; k < half; k++) {
          const wr = cs[k * step], wi = sn[k * step], a = s + k, b = a + half;
          const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
  };
}
export function toB64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function analyseSamples(y, sr, onProgress) {
  const N = 2048, HOP = Math.round(sr / 50), fps = sr / HOP;
  const nF = Math.floor((y.length - N) / HOP) + 1;
  if (nF < 200) throw new Error("too_short");
  const win = new Float64Array(N); let wsum = 0;
  for (let i = 0; i < N; i++) { win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); wsum += win[i]; }
  const binHz = sr / N;
  const ranges = AN_BANDS.map(([, lo, hi]) => [Math.ceil(lo / binHz), Math.ceil(hi / binHz) - 1]);
  const maxK = Math.max(...ranges.map(r => r[1]));
  const E = AN_BANDS.map(() => new Float64Array(nF)), F = AN_BANDS.map(() => new Float64Array(nF));
  const fft = makeFFT(N), re = new Float64Array(N), im = new Float64Array(N);
  const prev = new Float64Array(maxK + 1), cur = new Float64Array(maxK + 1), mag = new Float64Array(maxK + 1);
  for (let f = 0; f < nF; f++) {
    const o = f * HOP;
    for (let i = 0; i < N; i++) { re[i] = y[o + i] * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k <= maxK; k++) { mag[k] = Math.hypot(re[k], im[k]) / wsum; cur[k] = Math.log1p(100 * mag[k]); }
    for (let b = 0; b < ranges.length; b++) {
      const [k0, k1] = ranges[b]; let e2 = 0, fl = 0;
      for (let k = k0; k <= k1; k++) { e2 += mag[k] * mag[k]; if (f > 0) fl += Math.max(0, cur[k] - prev[k]); }
      const cnt = k1 - k0 + 1;
      E[b][f] = Math.log1p(Math.sqrt(e2 / cnt) * 200);
      F[b][f] = fl / cnt;
    }
    prev.set(cur);
    if (f % 600 === 0) { onProgress(0.1 + 0.8 * f / nF); await tick(); }
  }
  const out = { fps, frames: nF, offset: N / 2 / sr, bands: [] };
  const fluxTotal = new Float64Array(nF);
  AN_BANDS.forEach(([name, lo, hi], b) => {
    const e = E[b], flux = F[b];
    const lp = percentile(e, 8), hp = percentile(e, 99.3);
    const env = new Uint8Array(nF);
    for (let i = 0; i < nF; i++) env[i] = Math.floor(Math.min(1, Math.max(0, (e[i] - lp) / (hp - lp + 1e-9))) * 255);
    const sd = std(flux);
    for (let i = 0; i < nF; i++) fluxTotal[i] += flux[i] / (sd + 1e-9);
    const thr = movAvg(flux, Math.floor(fps * 0.5));
    const cand = [];
    for (let i = 0; i < nF; i++) {
      let mx = -Infinity;
      for (let j = Math.max(0, i - 2); j <= Math.min(nF - 1, i + 2); j++) mx = Math.max(mx, flux[j]);
      if (flux[i] > thr[i] + 1.3 * sd && flux[i] === mx) cand.push(i);
    }
    const top = cand.length ? percentile(cand.map(c => flux[c]), 95) : 1;
    const mingap = Math.floor(fps * (name === "Hats" || name === "Snare" ? 0.09 : 0.12));
    const onsets = [], strength = []; let last = -999;
    for (const c of cand) if (c - last >= mingap) {
      onsets.push(Math.round(c / fps * 1000) / 1000);
      strength.push(Math.round(Math.min(1, flux[c] / (top + 1e-9)) * 100) / 100);
      last = c;
    }
    out.bands.push({ name, lo, hi, env: toB64(env), onsets, strength });
  });
  onProgress(0.92); await tick();
  // tempo from autocorrelation of the combined onset curve
  const ma = movAvg(fluxTotal, Math.floor(fps));
  const oenv = new Float64Array(nF);
  for (let i = 0; i < nF; i++) oenv[i] = Math.max(0, fluxTotal[i] - ma[i]);
  const loL = Math.floor(60 * fps / 180), hiL = Math.floor(60 * fps / 70);
  const ac = new Float64Array(hiL + 2);
  for (let L = Math.max(0, loL - 1); L <= hiL + 1; L++) { let s = 0; for (let i = 0; i + L < nF; i++) s += oenv[i] * oenv[i + L]; ac[L] = s; }
  let best = loL, bestV = -Infinity;
  for (let L = loL; L < hiL; L++) {
    const bpm = 60 * fps / L, w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    if (ac[L] * w > bestV) { bestV = ac[L] * w; best = L; }
  }
  let P = best;
  if (best >= 1) { const a = ac[best - 1], b2 = ac[best], c = ac[best + 1]; P = best + 0.5 * (a - c) / (a - 2 * b2 + c + 1e-9); }
  // dynamic-programming beat tracking
  const sdo = std(oenv), score = Float64Array.from(oenv, v => v / (sdo + 1e-9));
  const cum = Float64Array.from(score), back = new Int32Array(nF).fill(-1);
  const prs = [], tx = [];
  for (let p = -Math.floor(2 * P); p <= -Math.floor(P / 2); p++) { prs.push(p); tx.push(-100 * Math.pow(Math.log(-p / P), 2)); }
  for (let i = 0; i < nF; i++) {
    let bv = -Infinity, bj = -1;
    for (let q = 0; q < prs.length; q++) { const j = i + prs[q]; if (j < 0) continue; const v = cum[j] + tx[q]; if (v > bv) { bv = v; bj = j; } }
    if (bj >= 0) { cum[i] = score[i] + bv; back[i] = bj; }
  }
  const tl = Math.floor(2 * P); let i0 = nF - tl, bv = -Infinity;
  for (let i = nF - tl; i < nF; i++) if (cum[i] > bv) { bv = cum[i]; i0 = i; }
  const beats = [];
  for (let i = i0; i >= 0; i = back[i]) beats.push(i);
  beats.reverse();
  out.bpm = Math.round(60 * fps / P * 10) / 10;
  out.beats = beats.map(b => Math.round(b / fps * 1000) / 1000);
  onProgress(1);
  return out;
}

export async function decodeToMono(buf) {
  const SR = 22050;
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const octx = new AC(1, SR, SR);
  const ab = await octx.decodeAudioData(buf.slice(0));
  const y = new Float32Array(ab.length);
  for (let c = 0; c < ab.numberOfChannels; c++) { const d = ab.getChannelData(c); for (let i = 0; i < y.length; i++) y[i] += d[i] / ab.numberOfChannels; }
  return { y, sr: ab.sampleRate, duration: ab.duration };
}
