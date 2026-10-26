// Neon OS core: MIDI controllers drive the whole desktop
// Any knob, fader, pad or key on a MIDI controller can be given a job: Amp's transport and volume, the Mixer's
// Master, the Rack's start/stop and tempo, Decks' crossfader, faders, play, cue and sync, or the next wallpaper.
// Settings → MIDI controller assigns them (press Learn, then move the control). The map is kept in localStorage
// ("neon-os:midi"); the desktop listens all the time (startMidi in os/shell.js) and does the job, sending Decks' jobs
// to Decks on a BroadcastChannel ("neon-os:midi-act").
export const ACTIONS = [
  { id: "amp.toggle", group: "Amp", name: "Play / pause", kind: "button" },
  { id: "amp.next", group: "Amp", name: "Next song", kind: "button" },
  { id: "amp.prev", group: "Amp", name: "Previous song", kind: "button" },
  { id: "amp.stop", group: "Amp", name: "Stop", kind: "button" },
  { id: "amp.volume", group: "Amp", name: "Volume", kind: "knob" },
  { id: "mix.master", group: "Mixer", name: "Master volume", kind: "knob" },
  { id: "mix.muteAll", group: "Mixer", name: "Mute everything", kind: "button" },
  { id: "rack.toggle", group: "Rack", name: "Start / stop (Link)", kind: "button" },
  { id: "rack.tempo", group: "Rack", name: "Tempo (60 to 200 BPM)", kind: "knob" },
  { id: "decks.xfade", group: "Decks", name: "Crossfader", kind: "knob" },
  { id: "decks.A.vol", group: "Decks", name: "Deck A volume", kind: "knob" },
  { id: "decks.B.vol", group: "Decks", name: "Deck B volume", kind: "knob" },
  { id: "decks.A.play", group: "Decks", name: "Deck A play / pause", kind: "button" },
  { id: "decks.B.play", group: "Decks", name: "Deck B play / pause", kind: "button" },
  { id: "decks.A.cue", group: "Decks", name: "Deck A cue", kind: "button" },
  { id: "decks.B.cue", group: "Decks", name: "Deck B cue", kind: "button" },
  { id: "decks.A.sync", group: "Decks", name: "Deck A sync", kind: "button" },
  { id: "decks.B.sync", group: "Decks", name: "Deck B sync", kind: "button" },
  { id: "desk.wall", group: "Desktop", name: "Next wallpaper", kind: "button" },
];
const KEY = "neon-os:midi";
const chan = "BroadcastChannel" in window ? new BroadcastChannel(KEY) : null;
export const getMap = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}").map || {}; } catch (e) { return {}; } };
export function setMap(map) { try { localStorage.setItem(KEY, JSON.stringify({ map })); } catch (e) {} if (chan) chan.postMessage({ map }); }
export function onMap(fn) { if (chan) chan.addEventListener("message", e => fn(e.data.map)); addEventListener("storage", e => { if (e.key === KEY) fn(getMap()); }); }

// a MIDI message as { t: "cc" | "note", ch (1–16), n, v (0–1), on } — note-offs come back as notes with on: false
export function parse(data) {
  const [st, n, val = 0] = data, cmd = st & 0xf0, ch = (st & 0x0f) + 1;
  if (cmd === 0xb0) return { t: "cc", ch, n, v: val / 127, on: val >= 64 };
  if (cmd === 0x90) return { t: "note", ch, n, v: val / 127, on: val > 0 };
  if (cmd === 0x80) return { t: "note", ch, n, v: 0, on: false };
  return null;
}
const NOTE = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
export const describe = m => !m ? "Not set" : m.t === "cc" ? `Knob CC ${m.n} · ch ${m.ch}` : `Pad ${NOTE[m.n % 12]}${Math.floor(m.n / 12) - 1} · ch ${m.ch}`;
export const same = (a, b) => a && b && a.t === b.t && a.ch === b.ch && a.n === b.n;

let access = null;
export async function midiAccess() {
  if (access) return access;
  if (!navigator.requestMIDIAccess) return null;
  try { access = await navigator.requestMIDIAccess(); } catch (e) { return null; }
  return access;
}
// calls fn(msg, inputName) for every message from every controller, including ones plugged in later
export async function listenMidi(fn) {
  const acc = await midiAccess(); if (!acc) return null;
  const hooked = new WeakSet();
  const hook = () => acc.inputs.forEach(inp => { if (hooked.has(inp)) return; hooked.add(inp); inp.addEventListener("midimessage", e => { const m = parse(e.data); if (m) fn(m, inp.name); }); });
  hook(); acc.addEventListener("statechange", hook);
  return { count: () => acc.inputs.size, names: () => [...acc.inputs.values()].map(i => i.name) };
}
// The desktop's side: run(actionId, value) for each mapped control. Buttons fire once per press (a pad's note-on, or
// a CC crossing the halfway mark upwards); knobs send their position, 0 to 1.
export async function startMidi(run) {
  let map = getMap(), started = false;
  const go = async () => {
    if (started || !Object.keys(map).length) return; started = true;
    const was = new Map();
    await listenMidi(m => {
      const key = m.t + m.ch + ":" + m.n, prevOn = was.get(key); was.set(key, m.on);
      for (const a of ACTIONS) {
        if (!same(map[a.id], m)) continue;
        if (a.kind === "knob") run(a.id, m.v);
        else if (m.on && !prevOn) run(a.id, 1);
      }
    });
  };
  onMap(mp => { map = mp || {}; go(); });
  go();
}
