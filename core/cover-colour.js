// Neon OS core: a neon colour taken from album art
// Shrinks the picture to 40×40, counts its pixels into 24 hues weighted by how colourful and bright they are,
// and turns the winning hue into a glowing colour (full saturation, light enough to glow on the dark chrome).
// Covers with almost no colour (black and white, grey) give null, so the chosen colour stays.
export async function coverColour(src) {
  try {
    const img = new Image(); img.decoding = "async"; img.src = src; await img.decode();
    const c = document.createElement("canvas"); c.width = c.height = 40;
    const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, 40, 40);
    const d = g.getImageData(0, 0, 40, 40).data, bins = new Float64Array(24);
    let total = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), ch = mx - mn;
      if (ch < 0.12 || mx < 0.15) continue;
      let h = mx === r ? ((gg - b) / ch) % 6 : mx === gg ? (b - r) / ch + 2 : (r - gg) / ch + 4; h = (h * 60 + 360) % 360;
      const w = ch * ch * mx; bins[Math.floor(h / 15) % 24] += w; total += w;
    }
    if (total < 6) return null;
    let best = 0; for (let i = 1; i < 24; i++) if (bins[i] + 0.5 * (bins[(i + 23) % 24] + bins[(i + 1) % 24]) > bins[best] + 0.5 * (bins[(best + 23) % 24] + bins[(best + 1) % 24])) best = i;
    return hslHex(best * 15 + 7.5, 1, 0.62);
  } catch (e) { return null; }
}
function hslHex(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return "#" + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}
