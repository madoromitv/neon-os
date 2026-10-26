// Neon OS core: scrobbling (sending what you play to ListenBrainz or Last.fm)
// Amp says when a song starts ("now playing") and when it has played long enough to count: more than 30 seconds
// long, and played for half its length or 4 minutes, whichever comes first (the rule both services use).
// Listens that can't be sent (offline, the service down) wait in a queue and go with the next one.
//
// ListenBrainz: paste the user token from listenbrainz.org/settings. Last.fm: Neon OS has no server to keep a shared
// secret, so it uses your own free API key and secret (last.fm/api/account/create), then you allow it on Last.fm.
const KEY = "neon-os:scrobble", QUEUE = "neon-os:scrobble-queue";
const LB = "https://api.listenbrainz.org/1/", LFM = "https://ws.audioscrobbler.com/2.0/";
// read once and kept (Amp asks every frame whether scrobbling is on); another window's change refreshes it
let confCache = null;
export const getConf = () => { if (confCache) return confCache; try { confCache = { lb: { token: "", on: false, user: "" }, lfm: { key: "", secret: "", sk: "", user: "", on: false }, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch (e) { confCache = { lb: {}, lfm: {} }; } return confCache; };
export function setConf(patch) { const c = { ...getConf(), ...patch }; try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} confCache = c; return c; }
if (typeof window !== "undefined") addEventListener("storage", e => { if (e.key === KEY) confCache = null; });
const queue = () => { try { return JSON.parse(localStorage.getItem(QUEUE) || "[]"); } catch (e) { return []; } };
const setQueue = q => { try { localStorage.setItem(QUEUE, JSON.stringify(q.slice(-500))); } catch (e) {} };
export const queued = () => queue().length;
const meta = t => ({ artist: t.artist || "", title: t.title || "", album: t.album || "", secs: Math.round(t.duration || 0) });
export const enabled = (c = getConf()) => (c.lb.on && c.lb.token) || (c.lfm.on && c.lfm.sk);

// ---------- ListenBrainz ----------
async function lb(path, body, token) {
  const r = await fetch(LB + path, { method: body ? "POST" : "GET", headers: { Authorization: "Token " + token, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error("listenbrainz " + r.status);
  return r.json().catch(() => ({}));
}
export async function checkListenBrainz(token) { const j = await lb("validate-token", null, token); if (!j.valid) throw new Error("That token isn't right"); return j.user_name; }
const lbTrack = m => ({ artist_name: m.artist || "Unknown artist", track_name: m.title, ...(m.album ? { release_name: m.album } : {}), additional_info: { media_player: "Neon OS", submission_client: "Neon OS", ...(m.secs ? { duration: m.secs } : {}) } });

// ---------- Last.fm ----------
export function lastfmAuthUrl(key, back) { return `https://www.last.fm/api/auth/?api_key=${encodeURIComponent(key)}&cb=${encodeURIComponent(back)}`; }
async function lfm(params, secret, post = true) {
  const p = { ...params, format: "json" }, sigKeys = Object.keys(params).sort();
  p.api_sig = md5(sigKeys.map(k => k + params[k]).join("") + secret);
  const body = new URLSearchParams(p);
  const r = await fetch(post ? LFM : LFM + "?" + body, post ? { method: "POST", body } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.message || "last.fm " + r.status);
  return j;
}
// after you allow Neon OS on Last.fm, it comes back with a token that becomes a lasting session key
export async function lastfmSession(token) {
  const c = getConf(), j = await lfm({ method: "auth.getSession", api_key: c.lfm.key, token }, c.lfm.secret, false);
  setConf({ lfm: { ...c.lfm, sk: j.session.key, user: j.session.name, on: true } });
  return j.session.name;
}

// ---------- sending ----------
export async function nowPlaying(t) {
  const c = getConf(), m = meta(t); if (!m.title) return;
  const jobs = [];
  if (c.lb.on && c.lb.token) jobs.push(lb("submit-listens", { listen_type: "playing_now", payload: [{ track_metadata: lbTrack(m) }] }, c.lb.token));
  if (c.lfm.on && c.lfm.sk) jobs.push(lfm({ method: "track.updateNowPlaying", api_key: c.lfm.key, sk: c.lfm.sk, artist: m.artist || "Unknown artist", track: m.title, ...(m.album ? { album: m.album } : {}), ...(m.secs ? { duration: String(m.secs) } : {}) }, c.lfm.secret));
  await Promise.allSettled(jobs);
}
// t: the track; startedAt: when it started playing (ms)
export async function scrobble(t, startedAt) {
  if (!enabled()) return;
  const m = meta(t); if (!m.title) return;
  setQueue([...queue(), { ...m, at: Math.floor(startedAt / 1000) }]);
  return flush();
}
let flushing = null;
export function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    const c = getConf(); let q = queue(); if (!q.length) return 0;
    let sent = 0;
    // ListenBrainz takes many at once; Last.fm up to 50
    for (let i = 0; i < q.length; i += 50) {
      const part = q.slice(i, i + 50), done = [];
      if (c.lb.on && c.lb.token) done.push(lb("submit-listens", { listen_type: part.length > 1 ? "import" : "single", payload: part.map(x => ({ listened_at: x.at, track_metadata: lbTrack(x) })) }, c.lb.token));
      if (c.lfm.on && c.lfm.sk) { const p = { method: "track.scrobble", api_key: c.lfm.key, sk: c.lfm.sk }; part.forEach((x, j) => { p[`artist[${j}]`] = x.artist || "Unknown artist"; p[`track[${j}]`] = x.title; p[`timestamp[${j}]`] = String(x.at); if (x.album) p[`album[${j}]`] = x.album; if (x.secs) p[`duration[${j}]`] = String(x.secs); }); done.push(lfm(p, c.lfm.secret)); }
      const res = await Promise.allSettled(done);
      if (res.some(r => r.status === "rejected")) break; // keep the rest for next time
      sent += part.length;
    }
    q = queue().slice(sent); setQueue(q);
    return sent;
  })().finally(() => { flushing = null; });
  return flushing;
}
if (typeof window !== "undefined") addEventListener("online", () => { if (enabled()) flush(); });

// ---------- md5 (Last.fm signs requests with it; Web Crypto has no md5) ----------
export function md5(str) {
  const b = new TextEncoder().encode(str), n = ((b.length + 8) >> 6) + 1, w = new Uint32Array(n * 16);
  for (let i = 0; i < b.length; i++) w[i >> 2] |= b[i] << ((i % 4) * 8);
  w[b.length >> 2] |= 0x80 << ((b.length % 4) * 8); w[n * 16 - 2] = b.length * 8;
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21], K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let o = 0; o < w.length; o += 16) {
    let [A, B, C, D] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      const tmp = D; D = C; C = B;
      const x = (A + F + K[i] + w[o + g]) >>> 0, s = S[(i >> 4) * 4 + (i % 4)];
      B = (B + ((x << s) | (x >>> (32 - s)))) >>> 0; A = tmp;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  return [a0, b0, c0, d0].map(v => [0, 8, 16, 24].map(s => ((v >>> s) & 255).toString(16).padStart(2, "0")).join("")).join("");
}
