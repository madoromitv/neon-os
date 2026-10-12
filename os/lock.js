// Neon OS shell: lock screen and screensaver
// The screensaver is the orb drifting over black after a spell of no mouse or keys (Settings sets how long).
// The lock screen shows the time, what's playing with its controls, and asks for the PIN if one is set.
// A PIN keeps casual hands off this desktop; it isn't encryption, and the saved data isn't locked by it.
import { getTheme, ballHex, calmOn } from "../core/theme.js";
import { esc } from "../style-kit/ui.js";

export const LOCK_KEY = "neon-os:lock";
export function lockConf() { let c = {}; try { c = JSON.parse(localStorage.getItem(LOCK_KEY) || "{}") || {}; } catch (e) {} return { pin: null, saverMin: 10, saverLock: true, locked: false, ...c }; }
export function setLockConf(patch) { const c = { ...lockConf(), ...patch }; try { localStorage.setItem(LOCK_KEY, JSON.stringify(c)); } catch (e) {} return c; }
// the PIN is kept only as a salted hash
export async function hashPin(pin) {
  const text = "neon-os-pin:" + pin;
  if (crypto && crypto.subtle) { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join(""); }
  let h = 5381; for (const ch of text) h = (h * 33 + ch.charCodeAt(0)) >>> 0; return "djb2:" + h.toString(16);
}

const MP = { prev: "M6 6h2v12H6zm3.5 6 8.5 6V6z", next: "M16 6h2v12h-2zM6 18l8.5-6L6 6z", play: "M8 5v14l11-7z", pause: "M6 5h4v14H6zm8 0h4v14h-4z" };
const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

// opts: { nowPlaying() -> {title, artist, state} | null, transport(act), sfx, onChange(mode) }
export function initLock(opts) {
  let el = null, mode = null, raf = 0, tries = 0, waitUntil = 0, lastActive = Date.now(), timer = 0, clockT = 0, moved = null;
  const pad = n => String(n).padStart(2, "0");

  function build() {
    el = document.createElement("div");
    el.className = "lockscreen"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    el.innerHTML = `<canvas aria-hidden="true"></canvas>
      <div class="lk-mid"><div class="lk-time" id="lkTime"></div><div class="lk-date" id="lkDate"></div></div>
      <div class="lk-np" id="lkNp" hidden><button class="btn icon" data-t="prev" aria-label="Previous song">${svg(MP.prev)}</button><button class="btn icon" data-t="toggle" aria-label="Play or pause"></button><button class="btn icon" data-t="next" aria-label="Next song">${svg(MP.next)}</button><span class="lk-song" id="lkSong"></span></div>
      <form class="lk-unlock" id="lkForm" autocomplete="off">
        <input type="password" id="lkPin" inputmode="numeric" aria-label="PIN" placeholder="PIN" maxlength="12">
        <button class="btn" type="submit" id="lkGo">Unlock</button>
        <p class="lk-msg" id="lkMsg" aria-live="polite"></p>
      </form>`;
    document.body.appendChild(el);
    el.querySelector("#lkNp").addEventListener("click", e => { const b = e.target.closest("[data-t]"); if (b) opts.transport(b.dataset.t); });
    el.querySelector("#lkForm").addEventListener("submit", e => { e.preventDefault(); tryUnlock(); });
  }
  function tick() {
    if (!el) return;
    const d = new Date();
    el.querySelector("#lkTime").textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    el.querySelector("#lkDate").textContent = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    const np = opts.nowPlaying(), box = el.querySelector("#lkNp");
    box.hidden = !np;
    if (np) {
      const playing = np.state === "playing" || np.state === "loading", tb = box.querySelector('[data-t="toggle"]');
      if (tb.dataset.s !== String(playing)) { tb.dataset.s = String(playing); tb.innerHTML = svg(playing ? MP.pause : MP.play); tb.setAttribute("aria-label", playing ? "Pause" : "Play"); }
      el.querySelector("#lkSong").innerHTML = `<b>${esc(np.title || "")}</b>${np.artist ? `<small>${esc(np.artist)}</small>` : ""}`;
    }
    if (waitUntil && Date.now() < waitUntil) el.querySelector("#lkMsg").textContent = `Too many tries. Wait ${Math.ceil((waitUntil - Date.now()) / 1000)} s.`;
    else if (waitUntil) { waitUntil = 0; el.querySelector("#lkMsg").textContent = ""; }
  }
  // the orb: a soft glowing ball drifting on a slow looping path (still, and gently pulsing, with Reduce motion)
  function draw() {
    const cv = el.querySelector("canvas"), dpr = Math.min(2, devicePixelRatio || 1);
    const W = cv.width = innerWidth * dpr, H = cv.height = innerHeight * dpr, ctx = cv.getContext("2d");
    const col = ballHex(getTheme().ball), calm = calmOn(), t0 = performance.now();
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    const frame = now => {
      const t = (now - t0) / 1000, r = Math.min(W, H) * 0.022;
      const x = calm ? W / 2 : W / 2 + Math.sin(t * 0.13) * W * 0.32 + Math.sin(t * 0.31) * W * 0.06;
      const y = calm ? H / 2 : H / 2 + Math.sin(t * 0.17 + 1) * H * 0.28 + Math.cos(t * 0.23) * H * 0.05;
      ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      const pulse = 1 + Math.sin(t * 1.1) * 0.08;
      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 7 * pulse); // the glow around it
      halo.addColorStop(0, col + "66"); halo.addColorStop(0.35, col + "1f"); halo.addColorStop(1, col + "00");
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, r * 7 * pulse, 0, Math.PI * 2); ctx.fill();
      const core = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r); // the ball itself, lit from the top left
      core.addColorStop(0, "#ffffff"); core.addColorStop(0.35, col); core.addColorStop(1, col + "aa");
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }
  function setInert(on) { for (const n of document.body.children) if (n !== el && !n.classList.contains("notices")) n.inert = on; }
  function show(m) {
    if (!el) build();
    const was = mode; mode = m;
    el.dataset.mode = m;
    const conf = lockConf();
    el.querySelector("#lkPin").hidden = !conf.pin;
    el.querySelector("#lkGo").textContent = conf.pin ? "Unlock" : "Unlock (Enter)";
    el.querySelector("#lkMsg").textContent = "";
    if (!was) { el.classList.add("on"); setInert(true); cancelAnimationFrame(raf); draw(); clockT = setInterval(tick, 1000); }
    tick();
    if (m === "lock") { setTimeout(() => (conf.pin ? el.querySelector("#lkPin") : el.querySelector("#lkGo")).focus(), 50); if (conf.pin) setLockConf({ locked: true }); }
    opts.onChange && opts.onChange(m);
  }
  function hide() {
    if (!el || !mode) return;
    mode = null; el.classList.remove("on"); setInert(false); cancelAnimationFrame(raf); clearInterval(clockT);
    el.querySelector("#lkPin").value = ""; setLockConf({ locked: false }); lastActive = Date.now();
    opts.onChange && opts.onChange(null);
  }
  async function tryUnlock() {
    const conf = lockConf(); if (!conf.pin) { hide(); opts.sfx && opts.sfx.chime(); return; }
    if (waitUntil && Date.now() < waitUntil) return;
    const inp = el.querySelector("#lkPin");
    if (await hashPin(inp.value) === conf.pin) { tries = 0; hide(); opts.sfx && opts.sfx.chime(); return; }
    tries++; inp.value = ""; el.querySelector("#lkForm").classList.remove("shake"); void el.offsetWidth; el.querySelector("#lkForm").classList.add("shake");
    el.querySelector("#lkMsg").textContent = "That PIN isn't right.";
    if (tries >= 5) { waitUntil = Date.now() + 30000; tries = 0; tick(); }
  }

  // activity: anything here, or in a framed app (os-link.js passes it on), puts the screensaver off
  const active = e => {
    if (e && e.type === "pointermove") { // ignore tiny jitters while the saver is up
      if (mode === "saver") { if (!moved) moved = { x: e.clientX, y: e.clientY }; if (Math.hypot(e.clientX - moved.x, e.clientY - moved.y) < 12) return; }
    }
    lastActive = Date.now(); moved = null;
    if (mode === "saver") { const c = lockConf(); if (c.pin && c.saverLock) show("lock"); else hide(); if (e && e.type === "keydown") e.preventDefault(); }
  };
  for (const t of ["pointermove", "pointerdown", "wheel", "touchstart"]) addEventListener(t, active, { capture: true, passive: true });
  addEventListener("message", e => { if (e.origin === location.origin && e.data && e.data.neonOs === "active") active(); });
  // keys: wake the screensaver; Enter unlocks when there's no PIN; nothing reaches the apps underneath while it's up
  addEventListener("keydown", e => {
    const was = mode; active(e);
    if (!was) return;
    if (was === "lock" && !lockConf().pin && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); tryUnlock(); }
    e.stopImmediatePropagation();
  }, true);
  timer = setInterval(() => {
    const c = lockConf();
    if (!mode && c.saverMin > 0 && Date.now() - lastActive > c.saverMin * 60000 && !document.hidden) show("saver");
  }, 5000);
  void timer;
  if (lockConf().locked && lockConf().pin) show("lock"); // locked when the page was closed or reloaded: still locked
  return { lock: () => show("lock"), saver: () => { show("saver"); moved = null; }, get mode() { return mode; }, hide };
}
