// Neon OS core: the Converter's encoder, in a worker so the desktop stays smooth while it works
// In: { id, format: "mp3" | "opus", kbps, sampleRate, channels: [Float32Array…], tags: { title, artist, album, track,
//        year, genre, cover: { bytes: Uint8Array, mime } } }
// Out: { id, progress: 0–1 } as it goes, then { id, done: Blob } or { id, error }.
// MP3 is made by lamejs (vendor/lamejs, LGPL) with an ID3v2.3 tag in front; Opus by the browser's own encoder
// (WebCodecs), packed into an Ogg file with its tags (and cover) in the OpusTags header.
self.onmessage = async e => {
  const job = e.data;
  try {
    const blob = job.format === "mp3" ? mp3(job) : await opus(job);
    self.postMessage({ id: job.id, done: blob });
  } catch (err) { self.postMessage({ id: job.id, error: String(err && err.message || err) }); }
};
const tell = (id, p) => self.postMessage({ id, progress: p });

// ---------- MP3 ----------
function mp3({ id, kbps, sampleRate, channels, tags }) {
  if (!self.lamejs) importScripts("../vendor/lamejs/lame.min.js");
  const ch = Math.min(2, channels.length), enc = new lamejs.Mp3Encoder(ch, sampleRate, kbps), n = channels[0].length;
  const toI16 = f => { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); o[i] = v < 0 ? v * 0x8000 : v * 0x7fff; } return o; };
  const L = toI16(channels[0]), R = ch > 1 ? toI16(channels[1]) : null, parts = [id3(tags)], STEP = 1152 * 20;
  for (let i = 0; i < n; i += STEP) {
    const buf = R ? enc.encodeBuffer(L.subarray(i, i + STEP), R.subarray(i, i + STEP)) : enc.encodeBuffer(L.subarray(i, i + STEP));
    if (buf.length) parts.push(new Uint8Array(buf));
    if ((i / STEP) % 20 === 0) tell(id, i / n);
  }
  const end = enc.flush(); if (end.length) parts.push(new Uint8Array(end));
  return new Blob(parts, { type: "audio/mpeg" });
}
// ID3v2.3: text frames in UTF-16 (so any language works) and the cover as an APIC frame
function id3(t = {}) {
  const frames = [];
  const u16 = s => { const b = new Uint8Array(2 + s.length * 2 + 2); b[0] = 0xff; b[1] = 0xfe; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[2 + i * 2] = c & 255; b[3 + i * 2] = c >> 8; } return b; };
  const frame = (fid, body) => { const h = new Uint8Array(10); for (let i = 0; i < 4; i++) h[i] = fid.charCodeAt(i); new DataView(h.buffer).setUint32(4, body.length); frames.push(h, body); };
  const text = (fid, s) => { if (!s) return; const v = u16(String(s)), b = new Uint8Array(1 + v.length); b[0] = 1; b.set(v, 1); frame(fid, b); };
  text("TIT2", t.title); text("TPE1", t.artist); text("TALB", t.album); text("TRCK", t.track); text("TYER", t.year); text("TCON", t.genre);
  text("TSSE", "Neon OS Converter (lamejs)");
  if (t.cover && t.cover.bytes) { const mime = new TextEncoder().encode(t.cover.mime || "image/jpeg"), b = new Uint8Array(1 + mime.length + 1 + 1 + 1 + t.cover.bytes.length); let o = 0; b[o++] = 0; b.set(mime, o); o += mime.length; b[o++] = 0; b[o++] = 3; b[o++] = 0; b.set(t.cover.bytes, o); frame("APIC", b); }
  const size = frames.reduce((n, f) => n + f.length, 0), h = new Uint8Array(10);
  h.set([0x49, 0x44, 0x33, 3, 0, 0]); h[6] = (size >> 21) & 127; h[7] = (size >> 14) & 127; h[8] = (size >> 7) & 127; h[9] = size & 127;
  return new Blob([h, ...frames]);
}

// ---------- Opus in Ogg ----------
async function opus({ id, kbps, sampleRate, channels, tags }) {
  if (typeof AudioEncoder === "undefined") throw new Error("This browser can't make Opus files (try Chrome or Edge)");
  if (sampleRate !== 48000) throw new Error("Opus needs 48 kHz audio");
  const ch = Math.min(2, channels.length), n = channels[0].length, packets = [];
  let description = null;
  const enc = new AudioEncoder({ output: (chunk, meta) => { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); packets.push({ b, dur: chunk.duration }); if (meta && meta.decoderConfig && meta.decoderConfig.description) description = new Uint8Array(meta.decoderConfig.description); }, error: err => { throw err; } });
  const cfg = { codec: "opus", sampleRate: 48000, numberOfChannels: ch, bitrate: kbps * 1000 };
  const ok = await AudioEncoder.isConfigSupported(cfg); if (!ok.supported) throw new Error("This browser can't make Opus files");
  enc.configure(cfg);
  const STEP = 48000; // one second at a time
  for (let i = 0; i < n; i += STEP) {
    const len = Math.min(STEP, n - i), data = new Float32Array(len * ch);
    for (let c = 0; c < ch; c++) data.set(channels[c].subarray(i, i + len), c * len);
    const ad = new AudioData({ format: "f32-planar", sampleRate: 48000, numberOfFrames: len, numberOfChannels: ch, timestamp: Math.round(i / 48 * 1000), data });
    enc.encode(ad); ad.close();
    if (enc.encodeQueueSize > 20) await new Promise(r => setTimeout(r, 0));
    if ((i / STEP) % 10 === 0) tell(id, i / n * 0.95);
  }
  await enc.flush(); enc.close();
  const preSkip = description && description.length >= 12 ? description[10] | (description[11] << 8) : 312;
  return ogg(packets, ch, preSkip, n, tags);
}
function ogg(packets, ch, preSkip, samples, tags = {}) {
  const serial = (Math.random() * 2 ** 32) >>> 0, pages = []; let seq = 0;
  const page = (segs, granule, flags) => {
    const lace = []; for (const s of segs) { let l = s.length; while (l >= 255) { lace.push(255); l -= 255; } lace.push(l); }
    const bodyLen = segs.reduce((a, s) => a + s.length, 0), p = new Uint8Array(27 + lace.length + bodyLen), dv = new DataView(p.buffer);
    p.set([0x4f, 0x67, 0x67, 0x53, 0, flags]); dv.setUint32(6, granule % 2 ** 32, true); dv.setUint32(10, Math.floor(granule / 2 ** 32), true);
    dv.setUint32(14, serial, true); dv.setUint32(18, seq++, true); p[26] = lace.length; p.set(lace, 27);
    let o = 27 + lace.length; for (const s of segs) { p.set(s, o); o += s.length; }
    dv.setUint32(22, crc(p), true); pages.push(p);
  };
  // OpusHead
  const head = new Uint8Array(19), hv = new DataView(head.buffer);
  head.set(new TextEncoder().encode("OpusHead")); head[8] = 1; head[9] = ch; hv.setUint16(10, preSkip, true); hv.setUint32(12, 48000, true); hv.setInt16(16, 0, true); head[18] = 0;
  page([head], 0, 2);
  // OpusTags: Vorbis comments, the cover as METADATA_BLOCK_PICTURE
  const te = new TextEncoder(), vendor = te.encode("Neon OS Converter"), cm = [];
  const add = (k, v) => { if (v) cm.push(te.encode(`${k}=${v}`)); };
  add("TITLE", tags.title); add("ARTIST", tags.artist); add("ALBUM", tags.album); add("TRACKNUMBER", tags.track); add("DATE", tags.year); add("GENRE", tags.genre);
  if (tags.cover && tags.cover.bytes) cm.push(te.encode("METADATA_BLOCK_PICTURE=" + b64(flacPicture(tags.cover))));
  const tl = 8 + 4 + vendor.length + 4 + cm.reduce((a, c) => a + 4 + c.length, 0), tagsB = new Uint8Array(tl), tv = new DataView(tagsB.buffer);
  tagsB.set(te.encode("OpusTags")); tv.setUint32(8, vendor.length, true); tagsB.set(vendor, 12); let o = 12 + vendor.length; tv.setUint32(o, cm.length, true); o += 4;
  for (const c of cm) { tv.setUint32(o, c.length, true); o += 4; tagsB.set(c, o); o += c.length; }
  // a big cover can't fit in one page's 255 segments: spread the packet over pages (continued pages, flag 1)
  for (let i = 0, first = true; i < tagsB.length; i += 255 * 254, first = false) { const part = tagsB.subarray(i, i + 255 * 254), last = i + 255 * 254 >= tagsB.length; pageRaw(part, last, first ? 0 : 1); }
  function pageRaw(part, last, flags) {
    const lace = []; let l = part.length; while (l >= 255) { lace.push(255); l -= 255; } if (last) lace.push(l); else if (l) lace.push(l);
    const p = new Uint8Array(27 + lace.length + part.length), dv = new DataView(p.buffer);
    p.set([0x4f, 0x67, 0x67, 0x53, 0, flags]); dv.setUint32(6, last ? 0 : 0xffffffff, true); dv.setUint32(10, last ? 0 : 0xffffffff, true);
    dv.setUint32(14, serial, true); dv.setUint32(18, seq++, true); p[26] = lace.length; p.set(lace, 27); p.set(part, 27 + lace.length);
    dv.setUint32(22, crc(p), true); pages.push(p);
  }
  // audio: about a second of packets per page; the granule counts 48 kHz samples, with the pre-skip at the start
  let gran = preSkip, group = [];
  packets.forEach((pk, i) => {
    group.push(pk.b); gran += Math.round((pk.dur || 20000) * 48 / 1000);
    const last = i === packets.length - 1;
    if (group.length >= 50 || last) { page(group, last ? preSkip + samples : gran, last ? 4 : 0); group = []; }
  });
  return new Blob(pages, { type: "audio/ogg" });
}
function flacPicture({ bytes, mime = "image/jpeg" }) {
  const m = new TextEncoder().encode(mime), b = new Uint8Array(32 + m.length + bytes.length), v = new DataView(b.buffer);
  v.setUint32(0, 3); v.setUint32(4, m.length); b.set(m, 8); let o = 8 + m.length; v.setUint32(o, 0); o += 4; o += 16; v.setUint32(o, bytes.length); o += 4; b.set(bytes, o);
  return b;
}
function b64(u8) { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
let CRC = null;
function crc(p) {
  if (!CRC) { CRC = new Uint32Array(256); for (let i = 0; i < 256; i++) { let r = i << 24; for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1; CRC[i] = r >>> 0; } }
  let c = 0; for (let i = 0; i < p.length; i++) c = ((c << 8) ^ CRC[((c >>> 24) ^ p[i]) & 255]) >>> 0;
  return c;
}
