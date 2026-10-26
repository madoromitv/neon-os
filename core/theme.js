// Neon OS core: shared theme
// One ball colour for the whole suite. Any app can read it, change it, and hear when another app changes it.
const KEY = "neon-os:theme";
const NAMED = { violet: "#a066ff", magenta: "#ff3de8", cyan: "#3ff2ff" };
const DEFAULTS = { ball: "cyan", sounds: true };
const chan = "BroadcastChannel" in window ? new BroadcastChannel("neon-os:theme") : null;

export const isHex = v => /^#[0-9a-f]{6}$/i.test(v);
export const ballHex = v => NAMED[v] || (isHex(v) ? v : NAMED.cyan);
// "Colour follows the album cover": Amp keeps the playing song's cover colour here, and while that setting is on
// it stands in for the chosen colour everywhere (the chosen one stays saved and comes back when it's turned off).
const COVER_KEY = "neon-os:cover-ball";
export const coverBall = () => { try { const v = localStorage.getItem(COVER_KEY); return isHex(v) ? v : null; } catch (e) { return null; } };
export const liveBall = (t = getTheme()) => (t.coverColor && coverBall()) || ballHex(t.ball);
export function setCoverBall(hex) {
  const v = isHex(hex) ? hex : null; if (v === coverBall()) return;
  try { if (v) localStorage.setItem(COVER_KEY, v); else localStorage.removeItem(COVER_KEY); } catch (e) {}
  const t = getTheme(); if (chan) chan.postMessage(t); applyTheme(t); dispatchEvent(new CustomEvent("neonos:theme-local", { detail: t }));
}

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
  r.style.setProperty("--ball", liveBall(t));
  r.classList.toggle("hc", !!t.contrast);
  r.classList.toggle("calm", calmOn(t));
}

// Calls fn(theme) whenever any app or window changes the theme.
export function onTheme(fn) {
  if (chan) chan.addEventListener("message", e => fn(e.data));
  addEventListener("storage", e => { if (e.key === KEY || e.key === COVER_KEY) fn(getTheme()); });
  addEventListener("neonos:theme-local", e => fn(e.detail));
}
