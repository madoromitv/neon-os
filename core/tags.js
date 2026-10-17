// Neon OS core: song tags (ID3v2 for MP3, Vorbis comments for FLAC) and cover art
// ID3 genres can be stored as numbers from the original list: "(17)", "17" or "(17)Rock" all mean Rock
const ID3_GENRES = ["Blues", "Classic Rock", "Country", "Dance", "Disco", "Funk", "Grunge", "Hip-Hop", "Jazz", "Metal", "New Age", "Oldies", "Other", "Pop", "R&B", "Rap", "Reggae", "Rock", "Techno", "Industrial",
  "Alternative", "Ska", "Death Metal", "Pranks", "Soundtrack", "Euro-Techno", "Ambient", "Trip-Hop", "Vocal", "Jazz+Funk", "Fusion", "Trance", "Classical", "Instrumental", "Acid", "House", "Game", "Sound Clip", "Gospel", "Noise",
  "Alternative Rock", "Bass", "Soul", "Punk", "Space", "Meditative", "Instrumental Pop", "Instrumental Rock", "Ethnic", "Gothic", "Darkwave", "Techno-Industrial", "Electronic", "Pop-Folk", "Eurodance", "Dream", "Southern Rock", "Comedy", "Cult", "Gangsta",
  "Top 40", "Christian Rap", "Pop/Funk", "Jungle", "Native American", "Cabaret", "New Wave", "Psychedelic", "Rave", "Showtunes", "Trailer", "Lo-Fi", "Tribal", "Acid Punk", "Acid Jazz", "Polka", "Retro", "Musical", "Rock & Roll", "Hard Rock"];
export function cleanGenre(g) {
  g = (g || "").split(/\u0000/)[0].trim();
  const m = /^\((\d+)\)(.*)$/.exec(g) || /^(\d+)()$/.exec(g);
  if (m) g = m[2].trim() || ID3_GENRES[+m[1]] || "";
  if (g === "RX") g = "Remix"; else if (g === "CR") g = "Cover";
  return g;
}
export function readTags(buf) {
  const u8 = new Uint8Array(buf);
  const out = { title: "", artist: "", album: "", genre: "", year: "", cover: null };
  try {
    if (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) readId3(u8, out);
    else if (u8[0] === 0x66 && u8[1] === 0x4c && u8[2] === 0x61 && u8[3] === 0x43) readFlac(u8, out);
  } catch (e) { /* unreadable tags: fall back to the file name */ }
  out.genre = cleanGenre(out.genre);
  out.year = (/\d{4}/.exec(out.year || "") || [""])[0];
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
  const map = v2 ? { TT2: "title", TP1: "artist", TAL: "album", TCO: "genre", TYE: "year" } : { TIT2: "title", TPE1: "artist", TALB: "album", TCON: "genre", TYER: "year", TDRC: "year" };
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
        else if (k === "GENRE" && !out.genre) out.genre = v;
        else if ((k === "DATE" || k === "YEAR") && !out.year) out.year = v;
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

// ---------- lyrics embedded in the song file ----------
// MP3 (ID3): synced lyrics (SYLT) become .lrc text so they stay in time; otherwise the plain lyrics (USLT, or a
// TXXX frame named LYRICS or USLT, as ffmpeg and some taggers write them).
// FLAC: the SYNCEDLYRICS, LYRICS or UNSYNCEDLYRICS comments. M4A/MP4: the ©lyr atom.
// Returns the lyrics as text (.lrc when synced), or "" when the file has none.
const lrcTime = ms => { const s = ms / 1000, m = Math.floor(s / 60); return `[${String(m).padStart(2, "0")}:${(s - m * 60).toFixed(2).padStart(5, "0")}]`; };
function id3Lyrics(u8) {
  const ver = u8[3], flags = u8[5];
  const size = (u8[6] & 127) << 21 | (u8[7] & 127) << 14 | (u8[8] & 127) << 7 | (u8[9] & 127);
  let p = 10; const end = Math.min(u8.length, 10 + size);
  if (flags & 0x40 && ver >= 3) p += ver === 4 ? ((u8[p] & 127) << 21 | (u8[p+1] & 127) << 14 | (u8[p+2] & 127) << 7 | (u8[p+3] & 127)) : (u8[p] << 24 | u8[p+1] << 16 | u8[p+2] << 8 | u8[p+3]) + 4;
  const v2 = ver === 2, idLen = v2 ? 3 : 4, hdr = v2 ? 6 : 10;
  let plain = "", synced = "";
  while (p + hdr < end) {
    const id = latin1(u8, p, p + idLen); if (!/^[A-Z0-9]+$/.test(id)) break;
    const fs = v2 ? u8[p+3] << 16 | u8[p+4] << 8 | u8[p+5] : ver === 4 ? (u8[p+4] & 127) << 21 | (u8[p+5] & 127) << 14 | (u8[p+6] & 127) << 7 | (u8[p+7] & 127) : (u8[p+4] << 24 | u8[p+5] << 16 | u8[p+6] << 8 | u8[p+7]) >>> 0;
    if (fs <= 0) break;
    const a = p + hdr, b = Math.min(end, a + fs), enc = u8[a], wide = enc === 1 || enc === 2;
    if ((id === "USLT" || id === "ULT") && !plain) { // encoding, language (3), description, then the lyrics
      const d = termEnd(u8, a + 4, b, wide) + (wide ? 2 : 1);
      plain = decText(u8, enc, d, b).replace(/\u0000+$/g, "");
    } else if ((id === "TXXX" || id === "TXX") && !plain) { // some taggers (ffmpeg, Mp3tag) keep lyrics in a custom text frame
      const d = termEnd(u8, a + 1, b, wide), name = decText(u8, enc, a + 1, d).trim();
      if (/^(USLT|LYRICS|UNSYNCED ?LYRICS|SYNCED ?LYRICS)$/i.test(name)) plain = decText(u8, enc, d + (wide ? 2 : 1), b).replace(/\u0000+$/g, "");
    } else if ((id === "SYLT" || id === "SLT") && !synced) { // encoding, language, time format, type, description, then text + time pairs
      const fmt = u8[a + 4]; let q = termEnd(u8, a + 6, b, wide) + (wide ? 2 : 1); const lines = [];
      while (q < b - 4) {
        const e = termEnd(u8, q, b, wide); const text = decText(u8, enc, q, e).replace(/^\n/, ""); q = e + (wide ? 2 : 1);
        if (q + 4 > b) break; const t = (u8[q] << 24 | u8[q+1] << 16 | u8[q+2] << 8 | u8[q+3]) >>> 0; q += 4;
        if (fmt === 2) lines.push(lrcTime(t) + text.trim()); // milliseconds (MPEG-frame times can't be read without the audio)
      }
      if (lines.length >= 3) synced = lines.join("\n");
    }
    p = b;
  }
  return synced || plain;
}
function flacLyrics(u8) {
  let p = 4; const le = q => (u8[q] | u8[q+1] << 8 | u8[q+2] << 16 | u8[q+3] << 24) >>> 0, found = {};
  for (let guard = 0; guard < 64 && p + 4 <= u8.length; guard++) {
    const last = u8[p] & 0x80, type = u8[p] & 0x7f, len = u8[p+1] << 16 | u8[p+2] << 8 | u8[p+3], a = p + 4;
    if (type === 4) {
      let q = a + 4 + le(a); const n = le(q); q += 4;
      for (let i = 0; i < n && q < a + len; i++) { const l = le(q); q += 4; const kv = new TextDecoder("utf-8").decode(u8.subarray(q, q + l)); q += l; const eq = kv.indexOf("="); if (eq > 0) found[kv.slice(0, eq).toUpperCase()] = kv.slice(eq + 1); }
    }
    p = a + len; if (last) break;
  }
  return found.SYNCEDLYRICS || found.LYRICS || found.UNSYNCEDLYRICS || "";
}
function mp4Lyrics(u8) { // look for the ©lyr atom and its data atom
  for (let i = 4; i < u8.length - 24; i++) {
    if (u8[i] !== 0xa9 || u8[i+1] !== 0x6c || u8[i+2] !== 0x79 || u8[i+3] !== 0x72) continue; // ©lyr
    const d = i + 4; if (latin1(u8, d + 4, d + 8) !== "data") continue;
    const len = (u8[d] << 24 | u8[d+1] << 16 | u8[d+2] << 8 | u8[d+3]) >>> 0;
    if (len < 16 || d + len > u8.length) continue;
    return new TextDecoder("utf-8").decode(u8.subarray(d + 16, d + len));
  }
  return "";
}
export async function readLyrics(blob) {
  try {
    const h = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    if (h[0] === 0x49 && h[1] === 0x44 && h[2] === 0x33) { const n = ((h[6] & 127) << 21 | (h[7] & 127) << 14 | (h[8] & 127) << 7 | (h[9] & 127)) + 10; return id3Lyrics(new Uint8Array(await blob.slice(0, Math.min(n, 24e6)).arrayBuffer())).trim(); }
    if (h[0] === 0x66 && h[1] === 0x4c && h[2] === 0x61 && h[3] === 0x43) return flacLyrics(new Uint8Array(await blob.slice(0, 8e6).arrayBuffer())).trim();
    if (latin1(h, 4, 8) === "ftyp") { // the metadata is near the start or the end of the file
      const head = mp4Lyrics(new Uint8Array(await blob.slice(0, 3e6).arrayBuffer())); if (head) return head.trim();
      return blob.size > 3e6 ? mp4Lyrics(new Uint8Array(await blob.slice(Math.max(0, blob.size - 3e6)).arrayBuffer())).trim() : "";
    }
  } catch (e) {}
  return "";
}
