// Neon OS core: turn any song the browser can play into MP3, Opus or WAV
// The song is decoded straight to the sample rate the format wants (44.1 kHz for MP3 and WAV, 48 kHz for Opus),
// then encoded in a worker (core/encode-worker.js) with its title, artist, album and cover carried over.
import { toWav } from "./wav.js";
import { readTags, titleFromName } from "./tags.js";
export const FORMATS = {
  mp3: { name: "MP3", ext: "mp3", mime: "audio/mpeg", rates: [128, 192, 256, 320], def: 256, sr: 44100 },
  opus: { name: "Opus", ext: "opus", mime: "audio/ogg", rates: [96, 128, 160, 192], def: 160, sr: 48000 },
  wav: { name: "WAV", ext: "wav", mime: "audio/wav", rates: [], sr: 44100 },
};
export const canOpus = async () => typeof AudioEncoder !== "undefined" && (await AudioEncoder.isConfigSupported({ codec: "opus", sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 }).catch(() => ({}))).supported;

let worker = null, nextId = 0;
const jobs = new Map();
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./encode-worker.js", import.meta.url));
  worker.onmessage = e => { const j = jobs.get(e.data.id); if (!j) return; if (e.data.progress != null) j.progress(0.35 + 0.65 * e.data.progress); else { jobs.delete(e.data.id); e.data.error ? j.reject(new Error(e.data.error)) : j.resolve(e.data.done); } };
  return worker;
}
// tags for a file from its own tags (a song from the library passes its details instead)
export async function tagsOfFile(file) {
  const t = readTags(await file.slice(0, 8 * 1024 * 1024).arrayBuffer());
  return { title: t.title || titleFromName(file.name || ""), artist: t.artist, album: t.album, year: t.year, genre: t.genre, track: t.track || "", coverBlob: t.cover ? t.cover.blob : null };
}
// blob: the song; tags: { title, artist, album, year, genre, track, coverBlob }; onProgress(0–1)
export async function convert(blob, { format = "mp3", kbps, tags = {} } = {}, onProgress = () => {}) {
  const F = FORMATS[format]; if (!F) throw new Error("Unknown format");
  onProgress(0.02);
  const bytes = await blob.arrayBuffer();
  onProgress(0.1);
  const ctx = new OfflineAudioContext(2, 1, F.sr);
  const buf = await ctx.decodeAudioData(bytes).catch(() => { throw new Error("This file can't be read as audio"); });
  onProgress(0.35);
  if (format === "wav") { onProgress(1); return toWav(buf); }
  const channels = Array.from({ length: Math.min(2, buf.numberOfChannels) }, (_, c) => buf.getChannelData(c).slice());
  let cover = null;
  if (tags.coverBlob) { let cb = tags.coverBlob; if (cb.size > 900 * 1024) { const { shrinkCover } = await import("./tags.js"); cb = (await shrinkCover(cb)) || cb; } cover = { bytes: new Uint8Array(await cb.arrayBuffer()), mime: cb.type || "image/jpeg" }; }
  const job = { id: ++nextId, format, kbps: kbps || F.def, sampleRate: F.sr, channels, tags: { title: tags.title || "", artist: tags.artist || "", album: tags.album || "", year: tags.year || "", genre: tags.genre || "", track: tags.track ? String(tags.track) : "", cover } };
  return new Promise((resolve, reject) => { jobs.set(job.id, { resolve, reject, progress: onProgress }); getWorker().postMessage(job, channels.map(c => c.buffer)); });
}
export const outName = (name, format) => name.replace(/\.[^.]+$/, "") + "." + FORMATS[format].ext;
