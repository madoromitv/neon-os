// Neon OS core: shared theme
// One ball colour for the whole suite. Any app can read it, change it, and hear when another app changes it.
const KEY = "neon-os:theme";
const NAMED = { violet: "#a066ff", magenta: "#ff3de8", cyan: "#3ff2ff" };
const DEFAULTS = { ball: "cyan", sounds: true };
const chan = "BroadcastChannel" in window ? new BroadcastChannel("neon-os:theme") : null;

export const isHex = v => /^#[0-9a-f]{6}$/i.test(v);
export const ballHex = v => NAMED[v] || (isHex(v) ? v : NAMED.cyan);

export function getTheme() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch (e) { return { ...DEFAULTS }; }
}

export function setTheme(patch) {
  const t = { ...getTheme(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch (e) {}
  if (chan) chan.postMessage(t);
  applyTheme(t);
  return t;
}

// Reduce motion: the person's own choice in Settings, or their system setting if they haven't chosen.
export const calmOn = (t = getTheme()) => t.calm != null ? !!t.calm : matchMedia("(prefers-reduced-motion: reduce)").matches;

// Paints the ball colour into the page's CSS so every LCD, LED and glow follows it,
// and switches high contrast (html.hc) and reduced motion (html.calm) on or off.
export function applyTheme(t = getTheme()) {
  const r = document.documentElement;
  r.style.setProperty("--ball", ballHex(t.ball));
  r.classList.toggle("hc", !!t.contrast);
  r.classList.toggle("calm", calmOn(t));
}

// Calls fn(theme) whenever any app or window changes the theme.
export function onTheme(fn) {
  if (chan) chan.addEventListener("message", e => fn(e.data));
  addEventListener("storage", e => { if (e.key === KEY) fn(getTheme()); });
}
