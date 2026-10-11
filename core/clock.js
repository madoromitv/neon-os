// Neon OS core: the shared clock
// Apps with Link on share one tempo and one start/stop, so a Pulse beat and a Drift line stay in time,
// in separate windows. Every window on this computer can read the same wall clock (performance.timeOrigin +
// performance.now()), so the clock is just: the tempo, whether it's running, and the moment beat 0 happened.
// Changes are passed between windows with a BroadcastChannel; the last change wins, there is no leader.
const chan = "BroadcastChannel" in window ? new BroadcastChannel("neon-os:clock") : null;
export const wallNow = () => performance.timeOrigin + performance.now();

const state = { bpm: 120, playing: false, origin: 0 };
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn({ ...state }));
const send = () => chan && chan.postMessage({ type: "state", ...state });

if (chan) {
  chan.addEventListener("message", e => {
    const d = e.data || {};
    if (d.type === "hello" && state.playing) send(); // someone new joined: tell them where we are
    if (d.type === "state") { state.bpm = d.bpm; state.playing = d.playing; state.origin = d.origin; emit(); }
  });
  chan.postMessage({ type: "hello" });
}

export const clock = {
  get state() { return { ...state }; },
  // fn({ bpm, playing, origin }) runs whenever the clock changes, here or in another window
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  start(bpm = state.bpm) { state.bpm = bpm; state.playing = true; state.origin = wallNow() + 80; send(); emit(); },
  stop() { state.playing = false; send(); emit(); },
  // a tempo change keeps the current beat where it is, so nothing jumps
  setBpm(bpm) {
    if (state.playing) { const beat = (wallNow() - state.origin) / (60000 / state.bpm); state.origin = wallNow() - beat * (60000 / bpm); }
    state.bpm = bpm; send(); emit();
  },
  // the next step boundary from now: { index, wall } for steps of `perBeat` per beat (4 = 16ths)
  nextStep(perBeat = 4, lead = 30) {
    const ms = 60000 / state.bpm / perBeat, n = Math.ceil((wallNow() + lead - state.origin) / ms);
    return { index: n, wall: state.origin + n * ms, ms };
  },
  // converts a wall-clock moment to an AudioContext time
  toAudio(ctx, wall) { return ctx.currentTime + (wall - wallNow()) / 1000; },
};
