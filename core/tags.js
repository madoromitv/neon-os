// Neon OS core: song tags (ID3v2 for MP3, Vorbis comments for FLAC) and cover art
export function readTags(buf) {
  const u8 = new Uint8Array(buf);
  const out = { title: "", artist: "", album: "", cover: null };
  try {
    if (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) readId3(u8, out);
    else if (u8[0] === 0x66 && u8[1] === 0x4c && u8[2] === 0x61 && u8[3] === 0x43) readFlac(u8, out);
  } catch (e) { /* unreadable tags: fall back to the file name */ }
  return out;
}
const latin1 = (u8, a, b) => { let s = ""; for (let i = a; i < b; i++) s += String.fromCharCode(u8[i]); return s; };
function decText(u8, enc, a, b) {
  const sl = u8.subarray(a, b);
  try {
    if (enc === 0) return latin1(u8, a, b);
    if (enc === 3) return new TextDecoder("utf-8").decode(sl);
    if (enc === 2) return new TextDecoder("utf-16be").decode(sl);
    if (sl[0] === 0xfe && sl[1] === 0xff) return new TextDecoder("utf-16be").decode(sl.subarray(2));
    if (sl[0] === 0xff && sl[1] === 0xfe) return new TextDecoder("utf-16le").decode(sl.subarray(2));
    return new TextDecoder("utf-16le").decode(sl);
  } catch (e) { return ""; }
}
const clean = s => (s || "").replace(/\u0000+$/g, "").split("\u0000")[0].trim();
function termEnd(u8, a, b, wide) {
  if (!wide) { for (let i = a; i < b; i++) if (u8[i] === 0) return i; return b; }
  for (let i = a; i + 1 < b; i += 2) if (u8[i] === 0 && u8[i + 1] === 0) return i;
  return b;
}
function picMime(m, data) {
  m = (m || "").toLowerCase();
  if (m.includes("png") || (data[0] === 0x89 && data[1] === 0x50)) return "image/png";
  if (m.includes("webp")) return "image/webp";
  return "image/jpeg";
}
function readId3(u8, out) {
  const ver = u8[3], flags = u8[5];
  const size = (u8[6] & 127) << 21 | (u8[7] & 127) << 14 | (u8[8] & 127) << 7 | (u8[9] & 127);
  let p = 10;
  const end = Math.min(u8.length, 10 + size);
  if (flags & 0x40 && ver >= 3) { // extended header
    const ext = ver === 4 ? ((u8[p] & 127) << 21 | (u8[p+1] & 127) << 14 | (u8[p+2] & 127) << 7 | (u8[p+3] & 127)) : (u8[p] << 24 | u8[p+1] << 16 | u8[p+2] << 8 | u8[p+3]) + 4;
    p += ext;
  }
  const v2 = ver === 2, idLen = v2 ? 3 : 4, hdr = v2 ? 6 : 10;
  const map = v2 ? { TT2: "title", TP1: "artist", TAL: "album" } : { TIT2: "title", TPE1: "artist", TALB: "album" };
  while (p + hdr < end) {
    const id = latin1(u8, p, p + idLen);
    if (!/^[A-Z0-9]+$/.test(id)) break;
    let fs;
    if (v2) fs = u8[p+3] << 16 | u8[p+4] << 8 | u8[p+5];
    else if (ver === 4) fs = (u8[p+4] & 127) << 21 | (u8[p+5] & 127) << 14 | (u8[p+6] & 127) << 7 | (u8[p+7] & 127);
    else fs = (u8[p+4] << 24 | u8[p+5] << 16 | u8[p+6] << 8 | u8[p+7]) >>> 0;
    const a = p + hdr, b = Math.min(end, a + fs);
    if (fs <= 0) break;
    if (map[id] && !out[map[id]]) out[map[id]] = clean(decText(u8, u8[a], a + 1, b));
    else if ((id === "APIC" || id === "PIC") && !out.cover) {
      const enc = u8[a];
      let q = a + 1, mime;
      if (v2) { mime = latin1(u8, q, q + 3); q += 3; }
      else { const me = termEnd(u8, q, b, false); mime = latin1(u8, q, me); q = me + 1; }
      q += 1; // picture type
      const wide = enc === 1 || enc === 2;
      q = termEnd(u8, q, b, wide) + (wide ? 2 : 1);
      if (q < b) { const data = u8.slice(q, b); out.cover = { blob: new Blob([data], { type: picMime(mime, data) }) }; }
    }
    p = b;
  }
}
function readFlac(u8, out) {
  let p = 4;
  const be = q => (u8[q] << 24 | u8[q+1] << 16 | u8[q+2] << 8 | u8[q+3]) >>> 0;
  const le = q => (u8[q] | u8[q+1] << 8 | u8[q+2] << 16 | u8[q+3] << 24) >>> 0;
  const utf8 = (a, b) => new TextDecoder("utf-8").decode(u8.subarray(a, b));
  for (let guard = 0; guard < 64 && p + 4 <= u8.length; guard++) {
    const last = u8[p] & 0x80, type = u8[p] & 0x7f, len = u8[p+1] << 16 | u8[p+2] << 8 | u8[p+3];
    const a = p + 4;
    if (type === 4) {
      let q = a + 4 + le(a);
      const n = le(q); q += 4;
      for (let i = 0; i < n && q < a + len; i++) {
        const l = le(q); q += 4;
        const kv = utf8(q, q + l); q += l;
        const eq = kv.indexOf("=");
        if (eq < 0) continue;
        const k = kv.slice(0, eq).toUpperCase(), v = kv.slice(eq + 1).trim();
        if (k === "TITLE" && !out.title) out.title = v;
        else if (k === "ARTIST" && !out.artist) out.artist = v;
        else if (k === "ALBUM" && !out.album) out.album = v;
      }
    } else if (type === 6 && !out.cover) {
      let q = a + 4;
      const ml = be(q); q += 4;
      const mime = latin1(u8, q, q + ml); q += ml;
      const dl = be(q); q += 4 + dl + 16;
      const datal = be(q); q += 4;
      const data = u8.slice(q, q + datal);
      out.cover = { blob: new Blob([data], { type: picMime(mime, data) }) };
    }
    p = a + len;
    if (last) break;
  }
}
export function titleFromName(name) {
  return name.replace(/\.[^.]+$/, "").replace(/^\d{1,3}[\s._-]+/, "").replace(/[_]+/g, " ").trim() || "Untitled";
}

export async function shrinkCover(blob) {
  try {
    const url = URL.createObjectURL(blob);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const S = 480, c = document.createElement("canvas");
    const k = Math.min(1, S / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const out = await new Promise(res => c.toBlob(res, "image/jpeg", 0.86));
    return out || blob;
  } catch (e) { return null; }
}
