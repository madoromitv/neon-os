// Neon OS core: audio engine
// Playing from decoded buffers (not an <audio> element) works the same from a
// local file, a GitHub page or a Claude page, and gives the EQ and analyser real audio.
// Each song plays through its own gain (its volume levelling, and its fade in a crossfade). The next song can be
// queued ahead of time and starts on the audio clock exactly when the current one ends (gapless), or overlapping it
// by a few seconds (crossfade). onAdvance() runs when the queued song takes over.
import { mixOut } from "./mixer.js";
export const EQ_FREQS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
export const Eng = {
  ctx: null, nodes: null, buf: null, src: null, gain: null, token: 0, level: 1,
  state: "stopped", startAt: 0, offset: 0, onEnded: null, onAdvance: null,
  next: null,   // { buf, src, gain, level, when, xf } queued to follow the current song
  tails: [],    // songs still fading out after a crossfade
  ensure() {
    if (this.ctx) { if (this.ctx.state !== "running") this.ctx.resume().catch(() => {}); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctx = new AC();
    const pre = ctx.createGain();
    const filters = EQ_FREQS.map((f, i) => {
      const b = ctx.createBiquadFilter();
      b.type = i === 0 ? "lowshelf" : i === EQ_FREQS.length - 1 ? "highshelf" : "peaking";
      b.frequency.value = f; b.Q.value = 1.1; b.gain.value = 0;
      return b;
    });
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const vol = ctx.createGain();
    const an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0.6;
    let node = pre;
    filters.forEach(f => { node.connect(f); node = f; });
    if (pan) { node.connect(pan); node = pan; }
    node.connect(vol); vol.connect(an); an.connect(mixOut(ctx, "amp"));
    this.ctx = ctx; this.nodes = { pre, filters, pan, vol, an };
    this.freq = new Uint8Array(an.frequencyBinCount); this.wave = new Uint8Array(an.fftSize);
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    this.applyAll && this.applyAll();
    return true;
  },
  async decode(ab) {
    if (!this.ensure()) throw new Error("no_webaudio");
    return await new Promise((res, rej) => {
      const p = this.ctx.decodeAudioData(ab.slice(0), res, rej);
      if (p && p.then) p.then(res, rej);
    });
  },
  setBuffer(buf, level = 1) { this.stopSrc(); this.buf = buf; this.level = level; this.offset = 0; this.state = "stopped"; },
  stopSrc() {
    this.cancelNext();
    for (const t of this.tails) { try { t.src.stop(); t.src.disconnect(); t.gain.disconnect(); } catch (e) {} }
    this.tails = [];
    if (this.src) { this.token++; try { this.src.onended = null; this.src.stop(); } catch (e) {} try { this.src.disconnect(); this.gain.disconnect(); } catch (e) {} this.src = null; this.gain = null; }
  },
  play(from) {
    if (!this.buf || !this.ensure()) return;
    this.stopSrc();
    from = Math.max(0, Math.min(from == null ? this.offset : from, this.buf.duration - 0.05));
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(), sh = this.shelfNode();
    s.buffer = this.buf; g.gain.value = this.level; s.connect(sh); sh.connect(g); g.connect(this.nodes.pre);
    s.start(0, from);
    this.src = s; this.gain = g; this.shelf = sh; this.startAt = this.ctx.currentTime - from; this.state = "playing";
    this.watchEnd();
  },
  watchEnd() {
    const tok = ++this.token, s = this.src;
    s.onended = () => {
      if (tok !== this.token || this.state !== "playing") return;
      if (this.next) { this.advance(); return; } // the queued song is already playing: hand over
      this.state = "stopped"; this.offset = 0; this.src = null; this.gain = null; this.onEnded && this.onEnded();
    };
  },
  // each song has its own bass control, so Auto DJ can swap the bass from one song to the other mid-mix
  shelfNode() { const f = this.ctx.createBiquadFilter(); f.type = "lowshelf"; f.frequency.value = 180; f.gain.value = 0; return f; },
  // a song's level: a gain that brings it to the same loudness as the others (1 = unchanged)
  setLevel(level) { this.level = level; if (this.gain && !this.next) { try { this.gain.gain.cancelScheduledValues(this.ctx.currentTime); this.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.05); } catch (e) {} } },
  // Queues buf to follow the current song. xf: seconds of crossfade (0 = gapless). Returns false when it's too late.
  // dj (Auto DJ): { at: when in the current song the mix starts, from: where in the next song it starts } — the next
  // song comes in on the beat part-way through this one, and the bass swaps over halfway through the mix.
  queueNext(buf, level = 1, xf = 0, dj = null) {
    if (this.state !== "playing" || !this.buf || !this.ctx) return false;
    this.cancelNext();
    xf = dj ? Math.max(0.5, Math.min(xf, buf.duration / 2)) : Math.max(0, Math.min(xf, this.buf.duration / 3, buf.duration / 3));
    const end = this.startAt + this.buf.duration, when = dj ? this.startAt + dj.at : end - xf, now = this.ctx.currentTime, from = dj ? dj.from : 0;
    if (when < now + 0.15) return false;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(), sh = this.shelfNode();
    s.buffer = buf; s.connect(sh); sh.connect(g); g.connect(this.nodes.pre);
    if (dj && this.shelf) { // the bass swap: the new song's bass waits, then the two trade places in the middle of the mix
      const a = when + xf * 0.45, b = when + xf * 0.55;
      sh.gain.setValueAtTime(-26, now); sh.gain.setValueAtTime(-26, a); sh.gain.linearRampToValueAtTime(0, b);
      this.shelf.gain.cancelScheduledValues(when); this.shelf.gain.setValueAtTime(0, a); this.shelf.gain.linearRampToValueAtTime(-26, b);
    }
    if (xf > 0) { // equal-power curves, so the overlap doesn't dip or bulge
      const N = 32, up = new Float32Array(N), down = new Float32Array(N);
      for (let i = 0; i < N; i++) { const k = i / (N - 1); up[i] = Math.sin(k * Math.PI / 2) * level; down[i] = Math.cos(k * Math.PI / 2) * this.level; }
      g.gain.setValueAtTime(0, now); g.gain.setValueCurveAtTime(up, when, xf);
      this.gain.gain.cancelScheduledValues(when); this.gain.gain.setValueCurveAtTime(down, when, xf); // leaves a fade-in still running alone
    } else g.gain.value = level;
    s.start(when, from);
    if (dj) try { this.src.stop(when + xf + 0.05); } catch (e) {} // the old song ends where the mix does
    this.next = { buf, src: s, gain: g, shelf: sh, level, when, xf, from, dj: !!dj };
    clearTimeout(this.advT); this.advT = setTimeout(() => this.time(), (when - now) * 1000 + 20);
    return true;
  },
  cancelNext() {
    clearTimeout(this.advT);
    const n = this.next; if (!n) return;
    this.next = null;
    try { n.src.stop(); n.src.disconnect(); n.gain.disconnect(); } catch (e) {}
    if (this.gain && this.ctx && n.when > this.ctx.currentTime) this.gain.gain.cancelScheduledValues(n.when); // drop the fade-out, keep any fade-in
    if (this.shelf && this.ctx && n.when > this.ctx.currentTime) { this.shelf.gain.cancelScheduledValues(this.ctx.currentTime); this.shelf.gain.setValueAtTime(0, this.ctx.currentTime); }
    if (n.dj && this.src && this.buf) { try { this.src.stop(this.startAt + this.buf.duration + 0.05); } catch (e) {} } // an Auto DJ mix had cut this song short: its natural end again (the last stop() wins)
  },
  // the queued song has started: it becomes the current one; the old one finishes its fade on its own
  advance() {
    const n = this.next; if (!n) return;
    this.next = null; clearTimeout(this.advT);
    if (this.src) {
      const old = { src: this.src, gain: this.gain }; this.tails.push(old);
      this.token++; old.src.onended = () => { this.tails = this.tails.filter(t => t !== old); try { old.src.disconnect(); old.gain.disconnect(); } catch (e) {} };
    }
    this.buf = n.buf; this.src = n.src; this.gain = n.gain; this.shelf = n.shelf; this.level = n.level; this.startAt = n.when - (n.from || 0); this.offset = 0; this.state = "playing";
    this.watchEnd();
    this.onAdvance && this.onAdvance();
  },
  pause() { if (this.state !== "playing") return; this.offset = this.time(); this.stopSrc(); this.state = "paused"; },
  stop() { this.stopSrc(); this.offset = 0; this.state = "stopped"; },
  seek(t) { if (!this.buf) return; t = Math.max(0, Math.min(t, this.buf.duration - 0.05)); if (this.state === "playing") this.play(t); else this.offset = t; },
  time() {
    if (this.next && this.ctx && this.ctx.currentTime >= this.next.when) this.advance();
    return this.state === "playing" && this.ctx ? Math.min(this.buf.duration, Math.max(0, this.ctx.currentTime - this.startAt)) : this.offset;
  },
  latency() { return this.ctx ? (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0) : 0; },
  get duration() { return this.buf ? this.buf.duration : 0; },
  setVolume(v) { if (this.nodes) this.nodes.vol.gain.setTargetAtTime(v * v, this.ctx.currentTime, 0.015); },
  setBalance(b) { if (this.nodes && this.nodes.pan) this.nodes.pan.pan.setTargetAtTime(b, this.ctx.currentTime, 0.015); },
  setEq(on, pre, bands) {
    if (!this.nodes) return;
    const t = this.ctx.currentTime;
    this.nodes.pre.gain.setTargetAtTime(on ? Math.pow(10, pre / 20) : 1, t, 0.02);
    this.nodes.filters.forEach((f, i) => f.gain.setTargetAtTime(on ? bands[i] : 0, t, 0.02));
  },
};
