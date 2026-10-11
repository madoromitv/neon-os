// Neon OS shell: desktop, window manager, taskbar, start menu
// Each app runs in its own window (an iframe), so apps stay standalone and also work on their own pages.
import { APPS, PLANNED } from "../apps/registry.js";
import { esc, clamp } from "../style-kit/ui.js";
import { getTheme, applyTheme, onTheme, ballHex } from "../core/theme.js";

const $ = id => document.getElementById(id);
const desk = $("desktop");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const appById = id => APPS.find(a => a.id === id);
const svg = (d, cls = "i") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const ICON = { min: "M5 11h14v2H5z", max: "M5 5h14v14H5zm2 4v8h10V9z", restore: "M8 4h12v12h-3v3H5V8h3zm2 2v2h7v7h1V6zM7 10v7h8v-7z", close: "M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z" };
const TASKBAR = 40, SNAP_EDGE = 6;

// ---------- layout state (saved per browser) ----------
const LKEY = "neon-os:layout";
let wins = {};          // appId -> { appId, x, y, w, h, z, min, snap, restore }
let zTop = 10;
const els = {};         // appId -> window element
function loadLayout() { try { const s = JSON.parse(localStorage.getItem(LKEY) || "{}"); return s && s.wins ? s : null; } catch (e) { return null; } }
let saveT = null;
function saveLayout() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(LKEY, JSON.stringify({ wins })); } catch (e) {} }, 200); }
const area = () => ({ w: innerWidth, h: innerHeight - TASKBAR });

// ---------- windows ----------
function openApp(appId) {
  const app = appById(appId); if (!app) return;
  if (wins[appId]) { wins[appId].min = false; render(appId); focus(appId); return; }
  const a = area(), n = Object.keys(wins).length;
  const w = Math.min(app.w, a.w - 24), h = Math.min(app.h, a.h - 24);
  wins[appId] = { appId, w, h, x: clamp((a.w - w) / 2 + n * 28, 0, a.w - w), y: clamp((a.h - h) / 2 + n * 28, 0, a.h - h), z: ++zTop, min: false, snap: null, restore: null };
  build(appId); focus(appId); saveLayout();
}

function build(appId) {
  const app = appById(appId), st = wins[appId];
  const el = document.createElement("section");
  el.className = "win owin"; el.setAttribute("aria-label", app.name); el.dataset.app = appId;
  el.innerHTML = `<div class="titlebar"><span class="ttl">${esc(app.name)}</span><span class="tbtns">
      <button class="tbtn" data-act="min" aria-label="Minimise ${esc(app.name)}" title="Minimise">${svg(ICON.min)}</button>
      <button class="tbtn" data-act="max" aria-label="Maximise ${esc(app.name)}" title="Maximise">${svg(ICON.max)}</button>
      <button class="tbtn" data-act="close" aria-label="Close ${esc(app.name)}" title="Close">${svg(ICON.close)}</button></span></div>
    <div class="wbody frame"><iframe src="${esc(app.url)}" title="${esc(app.name)}" allow="autoplay; fullscreen"></iframe></div>
    <span class="grip" aria-hidden="true"></span>`;
  desk.appendChild(el); els[appId] = el;
  el.addEventListener("pointerdown", () => focus(appId), true);
  el.querySelector('[data-act="min"]').addEventListener("click", () => minimise(appId));
  el.querySelector('[data-act="max"]').addEventListener("click", () => toggleMax(appId));
  el.querySelector('[data-act="close"]').addEventListener("click", () => close(appId));
  const tb = el.querySelector(".titlebar");
  tb.addEventListener("dblclick", e => { if (!e.target.closest("button")) toggleMax(appId); });
  tb.addEventListener("pointerdown", e => startDrag(e, appId));
  el.querySelector(".grip").addEventListener("pointerdown", e => startResize(e, appId));
  render(appId); renderTasks();
  void st;
}

function geom(st) {
  const a = area();
  if (st.snap === "max") return { x: 0, y: 0, w: a.w, h: a.h };
  if (st.snap === "left") return { x: 0, y: 0, w: Math.floor(a.w / 2), h: a.h };
  if (st.snap === "right") return { x: Math.ceil(a.w / 2), y: 0, w: Math.floor(a.w / 2), h: a.h };
  return { x: st.x, y: st.y, w: st.w, h: st.h };
}
function render(appId) {
  const st = wins[appId], el = els[appId]; if (!st || !el) return;
  const g = geom(st);
  Object.assign(el.style, { left: g.x + "px", top: g.y + "px", width: g.w + "px", height: g.h + "px", zIndex: st.z });
  el.classList.toggle("min", !!st.min);
  el.classList.toggle("max", !!st.snap);
  const mb = el.querySelector('[data-act="max"]');
  mb.innerHTML = svg(st.snap ? ICON.restore : ICON.max); mb.title = st.snap ? "Restore" : "Maximise";
}
function front() { let best = null; for (const k in wins) if (!wins[k].min && (!best || wins[k].z > wins[best].z)) best = k; return best; }
function focus(appId) {
  const st = wins[appId]; if (!st) return;
  if (front() !== appId || st.min) { st.z = ++zTop; st.min = false; render(appId); saveLayout(); }
  for (const k in els) els[k].classList.toggle("lit", k === appId);
  renderTasks();
}
function minimise(appId) { wins[appId].min = true; render(appId); const f = front(); if (f) focus(f); renderTasks(); saveLayout(); }
function toggleMax(appId) { const st = wins[appId]; st.snap = st.snap ? null : "max"; render(appId); saveLayout(); }
function close(appId) { els[appId].remove(); delete els[appId]; delete wins[appId]; const f = front(); if (f) focus(f); renderTasks(); saveLayout(); }

// keeps a window reachable after the browser is resized
function keepInView(st) {
  const a = area();
  st.w = clamp(st.w, 260, a.w); st.h = clamp(st.h, 140, a.h);
  st.x = clamp(st.x, -st.w + 120, a.w - 120); st.y = clamp(st.y, 0, a.h - 30);
}

// ---------- drag, snap, resize ----------
let snapEl = null;
function showSnap(zone) {
  if (!zone) { if (snapEl) { snapEl.remove(); snapEl = null; } return; }
  if (!snapEl) { snapEl = document.createElement("div"); snapEl.className = "snap"; document.body.appendChild(snapEl); }
  const g = geom({ snap: zone });
  Object.assign(snapEl.style, { left: g.x + 6 + "px", top: g.y + 6 + "px", width: g.w - 12 + "px", height: g.h - 12 + "px" });
}
function startDrag(e, appId) {
  if (e.button !== 0 || e.target.closest("button")) return;
  const st = wins[appId], el = els[appId];
  e.preventDefault(); el.setPointerCapture(e.pointerId);
  let g = geom(st), offX = e.clientX - g.x, offY = e.clientY - g.y, zone = null, moved = false;
  document.body.classList.add("dragging");
  const move = ev => {
    if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return;
    if (!moved && st.snap) { // pull a snapped window free, keeping the grab point under the cursor
      const fx = offX / g.w; st.snap = null; offX = fx * st.w; offY = Math.min(offY, 18);
    }
    moved = true;
    st.x = ev.clientX - offX; st.y = clamp(ev.clientY - offY, 0, area().h - 30);
    render(appId);
    zone = ev.clientY <= SNAP_EDGE ? "max" : ev.clientX <= SNAP_EDGE ? "left" : ev.clientX >= innerWidth - SNAP_EDGE ? "right" : null;
    showSnap(zone);
  };
  const up = () => {
    el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
    document.body.classList.remove("dragging"); showSnap(null);
    if (zone) st.snap = zone;
    keepInView(st); render(appId); saveLayout();
  };
  el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
}
function startResize(e, appId) {
  const st = wins[appId], el = els[appId]; if (st.snap) return;
  e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId);
  const sx = e.clientX, sy = e.clientY, w0 = st.w, h0 = st.h;
  document.body.classList.add("dragging");
  const move = ev => { st.w = Math.max(260, w0 + ev.clientX - sx); st.h = Math.max(140, h0 + ev.clientY - sy); render(appId); };
  const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); document.body.classList.remove("dragging"); keepInView(st); render(appId); saveLayout(); };
  el.addEventListener("pointermove", move); el.addEventListener("pointerup", up);
}
// clicks inside an app (an iframe) don't reach the shell, so watch where focus goes instead
addEventListener("blur", () => setTimeout(() => {
  const f = document.activeElement;
  if (f && f.tagName === "IFRAME") { const w = f.closest(".owin"); if (w) focus(w.dataset.app); }
}, 0));
addEventListener("resize", () => { for (const k in wins) { keepInView(wins[k]); render(k); } sizeWall(); });

// ---------- taskbar ----------
function renderTasks() {
  const f = front();
  $("tasks").innerHTML = Object.keys(wins).map(k => {
    const a = appById(k);
    return `<button class="btn task${k === f ? " front" : ""}" data-app="${esc(k)}" title="${esc(a.name)}">${svg(a.icon)}<span>${esc(a.name)}</span></button>`;
  }).join("");
}
$("tasks").addEventListener("click", e => {
  const b = e.target.closest("[data-app]"); if (!b) return;
  const k = b.dataset.app;
  if (front() === k && !wins[k].min) minimise(k); else focus(k);
});
function tickClock() { const d = new Date(); $("clock").textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
tickClock(); setInterval(tickClock, 10000);

// ---------- start menu ----------
let menu = null;
function closeMenu() { if (!menu) return; menu.remove(); menu = null; $("startBtn").setAttribute("aria-expanded", "false"); }
function openMenu() {
  menu = document.createElement("div");
  menu.className = "win lit startmenu"; menu.setAttribute("role", "menu");
  menu.innerHTML = `<div class="titlebar"><span class="ttl">Neon OS</span></div><div class="wbody">
    <div class="lcd hero"><i aria-hidden="true"></i><b>NEON OS</b></div>
    ${APPS.map(a => `<button class="sm-item" role="menuitem" data-app="${esc(a.id)}">${svg(a.icon)}<span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></span></button>`).join("")}
    <div class="sm-sep"></div>
    ${PLANNED.map(p => `<div class="sm-item soon" aria-disabled="true"><span><b>${esc(p.name)}</b><small>${esc(p.desc)}, coming</small></span></div>`).join("")}
    <div class="sm-sep"></div>
    <button class="sm-item" role="menuitem" data-act="reset"><span><b>Tidy windows</b><small>Close everything and reset the layout</small></span></button>
  </div>`;
  document.body.appendChild(menu);
  $("startBtn").setAttribute("aria-expanded", "true");
  menu.querySelector(".sm-item").focus();
  menu.addEventListener("click", e => {
    const b = e.target.closest("button.sm-item"); if (!b) return;
    closeMenu();
    if (b.dataset.app) openApp(b.dataset.app);
    else if (b.dataset.act === "reset") { for (const k of Object.keys(wins)) close(k); }
  });
}
$("startBtn").addEventListener("click", e => { e.stopPropagation(); menu ? closeMenu() : openMenu(); });
document.addEventListener("pointerdown", e => { if (menu && !menu.contains(e.target) && !e.target.closest("#startBtn")) closeMenu(); });
addEventListener("blur", closeMenu);
document.addEventListener("keydown", e => {
  if (!menu) return;
  if (e.key === "Escape") { closeMenu(); $("startBtn").focus(); }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    const items = [...menu.querySelectorAll("button.sm-item")], i = items.indexOf(document.activeElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus(); e.preventDefault();
  }
});

// ---------- desktop icons ----------
$("icons").innerHTML = APPS.map(a => `<button class="dicon" data-app="${esc(a.id)}" title="Open ${esc(a.name)}"><span class="tile">${svg(a.icon)}</span>${esc(a.name)}</button>`).join("");
$("icons").addEventListener("click", e => {
  const b = e.target.closest(".dicon"); if (!b) return;
  document.querySelectorAll(".dicon").forEach(x => x.classList.toggle("sel", x === b));
  if (e.detail >= 2 || matchMedia("(pointer: coarse)").matches) openApp(b.dataset.app);
});
$("icons").addEventListener("keydown", e => { const b = e.target.closest(".dicon"); if (b && e.key === "Enter") { e.preventDefault(); openApp(b.dataset.app); } });

// ---------- wallpaper: the orb, idling ----------
const wall = $("wall"), wctx = wall.getContext("2d");
let sprite = null, WW = 0, WH = 0;
function buildSprite() {
  const hex = ballHex(getTheme().ball), r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const N = 128, c = document.createElement("canvas"); c.width = c.height = N;
  const x = c.getContext("2d"), grd = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.08, `rgba(${(r + 255) / 2 | 0},${(g + 255) / 2 | 0},${(b + 255) / 2 | 0},1)`);
  grd.addColorStop(0.2, `rgba(${r},${g},${b},0.6)`); grd.addColorStop(0.45, `rgba(${r},${g},${b},0.12)`); grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grd; x.fillRect(0, 0, N, N); sprite = c;
}
function sizeWall() { const d = Math.min(2, devicePixelRatio || 1); WW = innerWidth; WH = innerHeight; wall.width = WW * d; wall.height = WH * d; wctx.setTransform(d, 0, 0, d, 0, 0); }
function drawWall(now) {
  const t = now / 1000;
  wctx.globalCompositeOperation = "source-over"; wctx.clearRect(0, 0, WW, WH);
  const g1 = wctx.createRadialGradient(WW * 0.2, WH * 0.15, 0, WW * 0.2, WH * 0.15, Math.max(WW, WH) * 0.7);
  g1.addColorStop(0, "rgba(42,16,80,0.45)"); g1.addColorStop(1, "rgba(7,5,12,0)"); wctx.fillStyle = g1; wctx.fillRect(0, 0, WW, WH);
  const g2 = wctx.createRadialGradient(WW * 0.85, WH * 0.85, 0, WW * 0.85, WH * 0.85, Math.max(WW, WH) * 0.6);
  g2.addColorStop(0, "rgba(61,11,58,0.4)"); g2.addColorStop(1, "rgba(7,5,12,0)"); wctx.fillStyle = g2; wctx.fillRect(0, 0, WW, WH);
  const cx = WW / 2, cy = (WH - TASKBAR) / 2, R = Math.min(WW, WH) * 0.2, n = 12;
  wctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const a = t * 0.15 + i * Math.PI * 2 / n, wob = 1 + 0.06 * Math.sin(t * 0.6 + i * 1.7);
    const x = Math.cos(a) * R * wob, y = Math.sin(a) * R * wob * 0.42, z = Math.sin(a);
    const s = (34 + 10 * Math.sin(t * 0.8 + i)) * (0.75 + 0.25 * z);
    wctx.globalAlpha = 0.18 + 0.12 * (z + 1) / 2;
    wctx.drawImage(sprite, cx + x - s * 2, cy + y - s * 2, s * 4, s * 4);
  }
  wctx.globalAlpha = 1;
  if (!reduced) requestAnimationFrame(drawWall);
}

// ---------- start ----------
applyTheme();
onTheme(t => { applyTheme(t); buildSprite(); if (reduced) drawWall(performance.now()); });
buildSprite(); sizeWall(); requestAnimationFrame(drawWall);
const saved = loadLayout();
if (saved) {
  for (const k of Object.keys(saved.wins).sort((a, b) => saved.wins[a].z - saved.wins[b].z)) {
    if (!appById(k)) continue;
    wins[k] = { ...saved.wins[k], z: ++zTop }; keepInView(wins[k]); build(k);
  }
  const f = front(); if (f) focus(f);
} else {
  openApp("amp");
}
