// Neon OS core: shared effects for the Rack
// Reverb and delay as sends, then a compressor that glues everything together. Every Rack app (Pulse, Drift,
// Chop, Tape) puts its sound through one of these, with the same controls, on a live or an offline AudioContext.
//
//   const fx = createFx(ctx, { bpm }); source.connect(fx.input); fx.output.connect(ctx.destination);
//   fx.set({ reverb: 0.3 }); fx.setBpm(128);
// All amounts run from 0 (off) to 1. At the defaults the sound passes through unchanged.
export const FX_DEFAULTS = { reverb: 0, size: 0.4, delay: 0, time: 0.75, feedback: 0.35, comp: 0 };
export const DELAY_TIMES = [{ v: 1, name: "1/4" }, { v: 0.75, name: "3/16" }, { v: 0.5, name: "1/8" }, { v: 0.25, name: "1/16" }]; // in beats
export const fxOf = s => ({ ...FX_DEFAULTS, ...((s && s.fx) || {}) });

// a room's echo, made from noise that fades away: longer for a bigger room
function impulse(ctx, size) {
  const sr = ctx.sampleRate, len = Math.round(sr * (0.5 + size * 4.5)), pre = Math.round(sr * 0.012);
  const buf = ctx.createBuffer(2, len, sr), decay = 2.5 + size * 2;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0; // darker as it fades, like a real room
    for (let i = pre; i < len; i++) {
      const k = (i - pre) / (len - pre), damp = 0.25 + 0.7 * k;
      lp += (Math.random() * 2 - 1 - lp) * (1 - damp);
      d[i] = lp * Math.pow(1 - k, decay);
    }
  }
  return buf;
}

export function createFx(ctx, { bpm = 120, params = {} } = {}) {
  const P = { ...FX_DEFAULTS, ...params };
  const input = ctx.createGain(), output = ctx.createGain();
  const comp = ctx.createDynamicsCompressor(), makeup = ctx.createGain();
  input.connect(comp); comp.connect(makeup); makeup.connect(output);
  // reverb send
  const rSend = ctx.createGain(), conv = ctx.createConvolver(), rRet = ctx.createGain();
  input.connect(rSend); rSend.connect(conv); conv.connect(rRet); rRet.connect(comp);
  // delay send, with a filter in the feedback so each repeat gets softer and darker
  const dSend = ctx.createGain(), dl = ctx.createDelay(2.5), fb = ctx.createGain(), tone = ctx.createBiquadFilter(), dRet = ctx.createGain();
  tone.type = "lowpass"; tone.frequency.value = 3200;
  input.connect(dSend); dSend.connect(dl); dl.connect(tone); tone.connect(fb); fb.connect(dl); dl.connect(dRet); dRet.connect(comp);
  dRet.connect(rSend); // echoes sit in the same room
  let sizeNow = -1, bpmNow = bpm, sizeT = null;
  const at = (param, v) => { if (ctx instanceof OfflineAudioContext) param.value = v; else param.setTargetAtTime(v, ctx.currentTime, 0.03); };
  function apply() {
    at(rSend.gain, P.reverb * 0.9); at(rRet.gain, 0.8);
    at(dSend.gain, P.delay * 0.8); at(dRet.gain, 0.9); at(fb.gain, Math.min(0.85, P.feedback * 0.9));
    at(dl.delayTime, Math.min(2.4, P.time * 60 / bpmNow));
    const a = P.comp;
    comp.threshold.value = -4 - a * 30; comp.ratio.value = 1 + a * 7; comp.knee.value = 8; comp.attack.value = 0.006; comp.release.value = 0.18;
    at(makeup.gain, Math.pow(10, (a * 30 * (1 - 1 / (1 + a * 7)) * 0.45) / 20)); // put back the level the compressor takes away
    if (Math.abs(P.size - sizeNow) > 0.01) { // rebuilding the room takes a moment, so wait until the slider rests
      clearTimeout(sizeT);
      const build = () => { sizeNow = P.size; conv.buffer = impulse(ctx, P.size); };
      if (sizeNow < 0 || ctx instanceof OfflineAudioContext) build(); else sizeT = setTimeout(build, 120);
    }
  }
  apply();
  return {
    input, output, params: P,
    set(patch) { Object.assign(P, patch); apply(); },
    setBpm(b) { bpmNow = b; at(dl.delayTime, Math.min(2.4, P.time * 60 / bpmNow)); },
    // how much the compressor is turning things down right now, in dB (for a meter)
    get reduction() { return typeof comp.reduction === "number" ? comp.reduction : comp.reduction.value; },
  };
}
