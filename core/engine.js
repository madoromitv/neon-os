// Neon OS core: audio engine
// Playing from decoded buffers (not an <audio> element) works the same from a
// local file, a GitHub page or a Claude page, and gives the EQ and analyser real audio.
export const EQ_FREQS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
export const Eng = {
  ctx: null, nodes: null, buf: null, src: null, token: 0,
  state: "stopped", startAt: 0, offset: 0, onEnded: null,
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
    node.connect(vol); vol.connect(an); an.connect(ctx.destination);
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
  setBuffer(buf) { this.stopSrc(); this.buf = buf; this.offset = 0; this.state = "stopped"; },
  stopSrc() {
    if (this.src) { this.token++; try { this.src.onended = null; this.src.stop(); } catch (e) {} try { this.src.disconnect(); } catch (e) {} this.src = null; }
  },
  play(from) {
    if (!this.buf || !this.ensure()) return;
    this.stopSrc();
    from = Math.max(0, Math.min(from == null ? this.offset : from, this.buf.duration - 0.05));
    const s = this.ctx.createBufferSource();
    s.buffer = this.buf; s.connect(this.nodes.pre);
    const tok = ++this.token;
    s.onended = () => { if (tok === this.token && this.state === "playing") { this.state = "stopped"; this.offset = 0; this.src = null; this.onEnded && this.onEnded(); } };
    s.start(0, from);
    this.src = s; this.startAt = this.ctx.currentTime - from; this.state = "playing";
  },
  pause() { if (this.state !== "playing") return; this.offset = this.time(); this.stopSrc(); this.state = "paused"; },
  stop() { this.stopSrc(); this.offset = 0; this.state = "stopped"; },
  seek(t) { if (!this.buf) return; t = Math.max(0, Math.min(t, this.buf.duration - 0.05)); if (this.state === "playing") this.play(t); else this.offset = t; },
  time() { return this.state === "playing" && this.ctx ? Math.min(this.buf.duration, this.ctx.currentTime - this.startAt) : this.offset; },
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
