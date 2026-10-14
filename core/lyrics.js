// Neon OS core: song lyrics
// Synced lyrics come as .lrc ([mm:ss.xx] before each line, and an optional [offset:±ms]); anything else is plain
// text, which scrolls through with the song. A song's lyrics are kept with it in the library, or read from an
// .lrc (or .txt) with the same name beside it in a linked folder.
export function parseLyrics(text) {
  text = String(text || "").replace(/\r/g, "").replace(/^﻿/, "");
  const lines = [], plain = []; let offset = 0;
  for (const raw of text.split("\n")) {
    const off = raw.match(/^\[offset:\s*([+-]?\d+)\]/i); if (off) { offset = +off[1] / 1000; continue; }
    if (/^\[(ar|ti|al|by|re|ve|length|au|#):/i.test(raw)) continue;
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
    const words = raw.replace(/\[[^\]]*\]/g, "").trim();
    if (tags.length) for (const m of tags) lines.push({ t: +m[1] * 60 + parseFloat(m[2].replace(":", ".")), text: words });
    else if (raw.trim()) plain.push(raw.trim());
  }
  if (lines.length >= 3) { lines.sort((a, b) => a.t - b.t); lines.forEach(l => { l.t = Math.max(0, l.t - offset); }); return { synced: true, lines }; }
  return plain.length ? { synced: false, lines: plain.map(text => ({ text })) } : null;
}
// the line playing at time t (seconds): synced by its time; plain text spread evenly over the song
export function lineAt(lyr, t, duration) {
  if (!lyr || !lyr.lines.length) return -1;
  if (!lyr.synced) return Math.min(lyr.lines.length - 1, Math.floor((t / Math.max(1, duration)) * lyr.lines.length));
  let lo = 0, hi = lyr.lines.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (lyr.lines[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}
