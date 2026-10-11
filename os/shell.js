// Neon OS shell: desktop, window manager, taskbar, start menu
// Framed apps run in their own window (an iframe). Native apps (Amp) run inside the desktop,
// so each of their windows is a real desktop window that can be dragged, snapped and stacked.
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
const area = () => ({ w: innerWidth, h: innerHeight - TASKBAR });

// ---------- state (saved per browser) ----------
// wins: window id -> { wid, appId, x, y, w, h, z, min, snap, autoH }
// A framed app has one window whose id is the app id. A native app has one window per section, e.g. "amp:winVis".
const LKEY = "neon-os:layout";
let wins = {}, zTop = 10;
let split = { x: 0.5, y: 0.5 };   // where halves and quarters meet; drag a shared border to move it
const closed = new Set();          // native apps that are closed (kept so their layout returns when reopened)
let parked = {};                   // saved windows of apps not open yet
const els = {};
const mounted = new Set();
function loadLayout() { try { const s = JSON.parse(localStorage.getItem(LKEY) || "{}"); return s && s.wins ? s : null; } catch (e) { return null; } }
let saveT = null;
function saveLayout() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(LKEY, JSON.stringify({ wins, split, closed: [...closed] })); } catch (e) {} }, 200); }
const appWins = appId => Object.keys(wins).filter(k => wins[k].appId === appId);

// ---------- opening apps ----------
async function openApp(appId, savedWins) {
  const app = appById(appId); if (!app) return;
  if (app.native) {
    if (!mounted.has(appId)) { closed.delete(appId); await mountNative(app, savedWins || parked); }
    else { closed.delete(appId); appWins(appId).forEach(k => els[k].classList.remove("closed")); restoreGroup(appId); renderTasks(); saveLayout(); }
    return;
  }
  if (wins[appId]) { focus(appId); return; }
  const a = area(), n = Object.keys(wins).length;
  const w = Math.min(app.w, a.w - 24), h = Math.min(app.h, a.h - 24);
  wins[appId] = savedWins && savedWins[appId] ? { ...savedWins[appId], z: ++zTop } :
    { wid: appId, appId, w, h, x: clamp((a.w - w) / 2 + n * 28, 0, a.w - w), y: clamp((a.h - h) / 2 + n * 28, 0, a.h - h), z: ++zTop, min: false, snap: null };
  buildFramed(app); focus(appId); saveLayout();
}

function buildFramed(app) {
  const wid = app.id;
  const el = document.createElement("section");
  el.className = "win owin"; el.setAttribute("aria-label", app.name); el.dataset.wid = wid;
  el.innerHTML = `<div class="titlebar"><span class="ttl">${esc(app.name)}</span><span class="tbtns">
      <button class="tbtn" data-act="min" aria-label="Minimise ${esc(app.name)}" title="Minimise">${svg(ICON.min)}</button>
      <button class="tbtn" data-act="max" aria-label="Maximise ${esc(app.name)}" title="Maximise">${svg(ICON.max)}</button>
      <button class="tbtn" data-act="close" aria-label="Close ${esc(app.name)}" title="Close">${svg(ICON.close)}</button></span></div>
    <div class="wbody frame"><iframe src="${esc(app.url)}" title="${esc(app.name)}" allow="autoplay; fullscreen"></iframe></div>`;
  desk.appendChild(el); els[wid] = el;
  el.querySelector('[data-act="min"]').addEventListener("click", () => minimiseGroup(app.id));
  el.querySelector('[data-act="max"]').addEventListener("click", () => toggleMax(wid));
  el.querySelector('[data-act="close"]').addEventListener("click", () => closeFramed(wid));
  el.querySelector(".titlebar").addEventListener("dblclick", e => { if (!e.target.closest("button")) toggleMax(wid); });
  wireWindow(wid, true);
  render(wid); renderTasks();
}

// A native app's page is fetched, its windows are moved onto the desktop, then its script runs here.
async function mountNative(app, savedWins) {
  mounted.add(app.id);
  const html = await (await fetch(app.url)).text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  await new Promise(res => {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = app.url + app.native.css;
    link.onload = link.onerror = res; document.head.appendChild(link);
  });
  const sections = [...doc.querySelectorAll("section.win[id]")];
  for (const sec of sections) {
    const node = document.adoptNode(sec);
    node.classList.add("owin"); node.dataset.wid = `${app.id}:${sec.id}`;
    desk.appendChild(node);
  }
  // everything else the app's page needs (file pickers, toasts, drop zone)
  for (const node of [...doc.body.children]) if (node.tagName !== "SCRIPT" && !node.querySelector("section.win")) document.body.appendChild(document.adoptNode(node));
  for (const sec of sections) {
    const wid = `${app.id}:${sec.id}`, el = desk.querySelector(`[data-wid="${CSS.escape(wid)}"]`);
    els[wid] = el;
    const resizable = /Pl|Vis|Ml/.test(sec.id);
    wins[wid] = savedWins && savedWins[wid] ? { ...savedWins[wid], z: ++zTop } : { wid, appId: app.id, x: 0, y: 0, w: 560, h: 300, z: ++zTop, min: false, snap: null, autoH: !resizable };
    wireWindow(wid, resizable);
    addNativeButtons(app, sec.id, el);
  }
  if (!sections.some(s => savedWins && savedWins[`${app.id}:${s.id}`])) defaultAmpLayout(app.id);
  appWins(app.id).forEach(render);
  await import(new URL(app.url + app.native.js, location.href).href);
  const top = appWins(app.id).sort((a, b) => wins[b].z - wins[a].z)[0];
  focus(top); renderTasks(); saveLayout();
}

// Native windows get the shell's buttons beside their own: the main window can minimise or close the whole app,
// every other window can be closed on its own (using the app's own toggle, so the app stays in step).
function addNativeButtons(app, secId, el) {
  const tb = el.querySelector(".titlebar"), box = document.createElement("span");
  box.className = "tbtns";
  const isMain = secId === app.native.main, toggle = (app.native.panels || {})[secId];
  if (isMain) box.innerHTML = `<button class="tbtn" data-act="min" aria-label="Minimise ${esc(app.name)}" title="Minimise">${svg(ICON.min)}</button><button class="tbtn" data-act="close" aria-label="Close ${esc(app.name)}" title="Close ${esc(app.name)}">${svg(ICON.close)}</button>`;
  else if (toggle) box.innerHTML = `<button class="tbtn" data-act="close" aria-label="Close this panel" title="Close panel">${svg(ICON.close)}</button>`;
  else return;
  tb.querySelectorAll(":scope > .tbtn").forEach(b => box.prepend(b)); // keep the app's own buttons (shade) in the same row
  tb.appendChild(box);
  if (isMain) {
    box.querySelector('[data-act="min"]').addEventListener("click", () => minimiseGroup(app.id));
    box.querySelector('[data-act="close"]').addEventListener("click", () => closeNative(app.id));
  } else box.querySelector('[data-act="close"]').addEventListener("click", () => { const t = document.getElementById(toggle); if (t && t.getAttribute("aria-pressed") === "true") t.click(); });
}
function closeNative(appId) {
  const app = appById(appId), stop = app.native.stop && document.getElementById(app.native.stop);
  if (stop) stop.click();
  closed.add(appId);
  appWins(appId).forEach(k => els[k].classList.add("closed"));
  const f = front(); if (f) focus(f);
  renderTasks(); saveLayout();
}

// Amp's classic layout: player, equalizer and playlist stacked on the left; visualiser over the library on the right.
function defaultAmpLayout(appId) {
  const a = area(), L = 108, T = 14, G = 0, CW = 560;
  const id = s => `${appId}:${s}`, hOf = s => (els[id(s)] ? els[id(s)].offsetHeight : 200) || 200;
  const set = (s, g) => { if (wins[id(s)]) Object.assign(wins[id(s)], g, { snap: null, min: false }); };
  set("winMain", { x: L, y: T, w: CW }); render(id("winMain"));
  const eqY = T + hOf("winMain") + G;
  set("winEq", { x: L, y: eqY, w: CW }); render(id("winEq"));
  const plY = eqY + hOf("winEq") + G;
  set("winPl", { x: L, y: plY, w: CW, h: Math.max(160, a.h - plY - T) });
  const rx = L + CW + G, rw = Math.max(320, a.w - rx - 16), vh = Math.round((a.h - 2 * T - G) * 0.55);
  set("winVis", { x: rx, y: T, w: rw, h: vh });
  set("winMl", { x: rx, y: T + vh + G, w: rw, h: a.h - T - vh - G - T });
}

// ---------- window behaviour shared by both kinds ----------
// Every window gets eight resize handles (edges and corners). Windows whose height follows their content
// (Amp's player and equalizer) only resize sideways.
const DIRS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
function wireWindow(wid, resizable) {
  const el = els[wid], st = wins[wid];
  el.addEventListener("pointerdown", () => focus(wid), true);
  el.querySelector(".titlebar").addEventListener("pointerdown", e => startDrag(e, wid));
  const old = el.querySelector(".grip"); if (old) old.remove();
  for (const d of DIRS) {
    if (st.autoH && d !== "e" && d !== "w") continue;
    const h = document.createElement("span"); h.className = "rz rz-" + d; h.setAttribute("aria-hidden", "true");
    h.addEventListener("pointerdown", e => startResize(e, wid, d));
    el.appendChild(h);
  }
  if (!st.autoH) { const g = document.createElement("span"); g.className = "grip"; g.setAttribute("aria-hidden", "true"); el.appendChild(g); g.addEventListener("pointerdown", e => startResize(e, wid, "se")); }
  void resizable;
}
function geom(st) {
  const a = area(), lw = Math.round(a.w * split.x), rw = a.w - lw, th = Math.round(a.h * split.y), bh = a.h - th, hw = 0, hh = 0; void hw; void hh;
  switch (st.snap) {
    case "max": return { x: 0, y: 0, w: a.w, h: a.h };
    case "left": return { x: 0, y: 0, w: lw, h: a.h };
    case "right": return { x: lw, y: 0, w: rw, h: a.h };
    case "tl": return { x: 0, y: 0, w: lw, h: th };
    case "tr": return { x: lw, y: 0, w: rw, h: th };
    case "bl": return { x: 0, y: th, w: lw, h: bh };
    case "br": return { x: lw, y: th, w: rw, h: bh };
    default: return { x: st.x, y: st.y, w: st.w, h: st.h };
  }
}
function render(wid) {
  const st = wins[wid], el = els[wid]; if (!st || !el) return;
  const g = geom(st);
  Object.assign(el.style, { position: "absolute", left: g.x + "px", top: g.y + "px", width: g.w + "px", height: st.autoH ? "" : g.h + "px", zIndex: st.z });
  el.classList.toggle("min", !!st.min);
  el.classList.toggle("max", !!st.snap);
  if (st.snap) el.dataset.snap = st.snap; else delete el.dataset.snap;
  const mb = el.querySelector('[data-act="max"]');
  if (mb) { mb.innerHTML = svg(st.snap ? ICON.restore : ICON.max); mb.title = st.snap ? "Restore" : "Maximise"; }
}
function front() { let best = null; for (const k in wins) if (!wins[k].min && !closed.has(wins[k].appId) && !(els[k] && els[k].hidden) && (!best || wins[k].z > wins[best].z)) best = k; return best; }
function raise(wid) {
  wins[wid].z = ++zTop;
  if (zTop > 5000) { // keep stacking numbers small so menus and dialogs always sit above windows
    Object.keys(wins).sort((a, b) => wins[a].z - wins[b].z).forEach((k, i) => { wins[k].z = 10 + i; render(k); });
    zTop = 10 + Object.keys(wins).length;
  }
}
function focus(wid) {
  const st = wins[wid]; if (!st) return;
  if (front() !== wid || st.min) { raise(wid); st.min = false; render(wid); saveLayout(); }
  for (const k in els) els[k].classList.toggle("lit", k === wid);
  renderTasks();
}
function minimiseGroup(appId) { appWins(appId).forEach(k => { wins[k].min = true; render(k); }); const f = front(); if (f) focus(f); renderTasks(); saveLayout(); }
function restoreGroup(appId) {
  const ks = appWins(appId).sort((a, b) => wins[a].z - wins[b].z);
  ks.forEach(k => { wins[k].min = false; raise(k); render(k); });
  if (ks.length) focus(ks[ks.length - 1]);
}
function toggleMax(wid) { const st = wins[wid]; st.snap = st.snap ? null : "max"; render(wid); saveLayout(); }
function closeFramed(wid) { els[wid].remove(); delete els[wid]; delete wins[wid]; const f = front(); if (f) focus(f); renderTasks(); saveLayout(); }
function keepInView(st, el) {
  const a = area(), h = st.autoH && el ? el.offsetHeight : st.h;
  st.w = clamp(st.w, 260, a.w); if (!st.autoH) st.h = clamp(st.h, 140, a.h);
  st.x = clamp(st.x, -st.w + 120, a.w - 120); st.y = clamp(st.y, 0, Math.max(0, a.h - Math.min(h, 30)));
}

// ---------- drag, snap, dock, resize ----------
// Snap: drag to an edge for half the screen, a corner for a quarter, the top for full screen.
// Dock: window edges pull towards the screen edges and towards other windows' edges when close.
// Amp's player window carries every Amp window docked to it, like the classic player.
const MAG = 12, CORNER = 28;
let snapEl = null;
function showSnap(zone) {
  if (!zone) { if (snapEl) { snapEl.remove(); snapEl = null; } return; }
  if (!snapEl) { snapEl = document.createElement("div"); snapEl.className = "snap"; document.body.appendChild(snapEl); }
  const g = geom({ snap: zone });
  Object.assign(snapEl.style, { left: g.x + 6 + "px", top: g.y + 6 + "px", width: g.w - 12 + "px", height: g.h - 12 + "px" });
}
const visible = k => wins[k] && !wins[k].min && !closed.has(wins[k].appId) && els[k] && !els[k].hidden;
function rectOf(k) { const g = geom(wins[k]); if (wins[k].autoH || wins[k].snap) { g.h = els[k].offsetHeight; g.w = els[k].offsetWidth; } return g; }
// the edges a moving window may dock to
function targets(skip) {
  const a = area(), xs = [{ v: 0 }, { v: a.w }], ys = [{ v: 0 }, { v: a.h }];
  for (const k in wins) if (!skip.has(k) && visible(k)) {
    const r = rectOf(k);
    xs.push({ v: r.x, lo: r.y, hi: r.y + r.h }, { v: r.x + r.w, lo: r.y, hi: r.y + r.h });
    ys.push({ v: r.y, lo: r.x, hi: r.x + r.w }, { v: r.y + r.h, lo: r.x, hi: r.x + r.w });
  }
  return { xs, ys };
}
// nearest target within MAG for any of the given edges; lo/hi limit window targets to ones beside us
function pull(edges, list, lo, hi) {
  let best = null;
  for (const e of edges) for (const t of list) {
    if (t.lo != null && (hi < t.lo - MAG || lo > t.hi + MAG)) continue;
    const d = t.v - e; if (Math.abs(d) <= MAG && (!best || Math.abs(d) < Math.abs(best))) best = d;
  }
  return best || 0;
}
// windows of the same app touching the given one, and everything touching those
function dockedGroup(wid) {
  const app = wins[wid].appId, group = new Set([wid]), todo = [wid];
  const touch = (a, b) => {
    const A = rectOf(a), B = rectOf(b), near = (p, q) => Math.abs(p - q) <= 2;
    const vOver = A.y < B.y + B.h && B.y < A.y + A.h, hOver = A.x < B.x + B.w && B.x < A.x + A.w;
    return (vOver && (near(A.x + A.w, B.x) || near(B.x + B.w, A.x))) || (hOver && (near(A.y + A.h, B.y) || near(B.y + B.h, A.y)));
  };
  while (todo.length) { const c = todo.pop(); for (const k of appWins(app)) if (!group.has(k) && visible(k) && !wins[k].snap && touch(c, k)) { group.add(k); todo.push(k); } }
  return group;
}
function startDrag(e, wid) {
  if (e.button !== 0 || e.target.closest("button")) return;
  const st = wins[wid], el = els[wid];
  e.preventDefault(); el.setPointerCapture(e.pointerId);
  const lead = /:winMain$/.test(wid);
  const group = lead && !st.snap ? dockedGroup(wid) : new Set([wid]);
  const start = {}; for (const k of group) { const r = rectOf(k); start[k] = { x: r.x, y: r.y }; }
  let g = geom(st), offX = e.clientX - g.x, offY = e.clientY - g.y, zone = null, moved = false;
  document.body.classList.add("dragging");
  const move = ev => {
    if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return;
    if (!moved && st.snap) { const fx = offX / g.w; st.snap = null; offX = fx * st.w; offY = Math.min(offY, 18); start[wid] = { x: st.x, y: st.y }; }
    moved = true;
    const a = area(), r = rectOf(wid);
    let x = ev.clientX - offX, y = clamp(ev.clientY - offY, 0, a.h - 30);
    zone = null;
    if (!st.autoH && group.size === 1) {
      const cx = ev.clientX, cy = ev.clientY, L = cx <= SNAP_EDGE, R = cx >= innerWidth - SNAP_EDGE, T = cy <= SNAP_EDGE, B = cy >= a.h - SNAP_EDGE;
      if ((L || cx <= CORNER) && (T || cy <= CORNER) && (L || T)) zone = "tl";
      else if ((R || cx >= innerWidth - CORNER) && (T || cy <= CORNER) && (R || T)) zone = "tr";
      else if ((L || cx <= CORNER) && (B || cy >= a.h - CORNER) && (L || B)) zone = "bl";
      else if ((R || cx >= innerWidth - CORNER) && (B || cy >= a.h - CORNER) && (R || B)) zone = "br";
      else zone = T ? "max" : L ? "left" : R ? "right" : null;
    }
    if (!zone && !ev.altKey) { // dock; hold Alt to place freely
      const t = targets(group);
      x += pull([x, x + r.w], t.xs, y, y + r.h);
      y += pull([y, y + r.h], t.ys, x, x + r.w);
    }
    const dx = x - start[wid].x, dy = y - start[wid].y;
    for (const k of group) { wins[k].x = start[k].x + dx; wins[k].y = start[k].y + dy; render(k); }
    showSnap(zone);
  };
  const up = () => {
    el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
    document.body.classList.remove("dragging"); showSnap(null);
    if (zone) st.snap = zone;
    for (const k of group) { keepInView(wins[k], els[k]); render(k); }
    saveLayout();
  };
  el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
}
let lastRz = {};
function startResize(e, wid, dir) {
  if (e.button !== 0) return;
  const now = performance.now(); // a second press on the same edge straight after the first is a double-click
  if (lastRz.wid === wid && lastRz.dir === dir && now - lastRz.t < 400) { lastRz = {}; e.preventDefault(); e.stopPropagation(); if (dir.length === 1) stretch(wid, dir); return; }
  lastRz = { wid, dir, t: now };
  const st = wins[wid], el = els[wid];
  e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId);
  const inX = { left: "e", tl: "e", bl: "e", right: "w", tr: "w", br: "w" }[st.snap], inY = { tl: "s", tr: "s", bl: "n", br: "n" }[st.snap];
  if (st.snap && st.snap !== "max" && [...dir].every(c => c === inX || c === inY)) return splitDrag(e, wid, dir.includes(inX || "-"), dir.includes(inY || "-"));
  if (st.snap) { const g = rectOf(wid); Object.assign(st, g, { snap: null }); if (st.autoH) delete st.h; render(wid); }
  const s = rectOf(wid), sx = e.clientX, sy = e.clientY, MINW = 260, MINH = 140;
  const t = targets(new Set([wid]));
  document.body.classList.add("dragging");
  const move = ev => {
    let { x, y, w, h } = s; const dx = ev.clientX - sx, dy = ev.clientY - sy, free = ev.altKey;
    if (dir.includes("e")) { let r = s.x + s.w + dx; if (!free) r += pull([r], t.xs, y, y + h); w = Math.max(MINW, r - s.x); }
    if (dir.includes("w")) { let l = s.x + dx; if (!free) l += pull([l], t.xs, y, y + h); l = Math.min(l, s.x + s.w - MINW); x = l; w = s.x + s.w - l; }
    if (dir.includes("s")) { let b = s.y + s.h + dy; if (!free) b += pull([b], t.ys, x, x + w); h = Math.max(MINH, b - s.y); }
    if (dir.includes("n")) { let tp = Math.max(0, s.y + dy); if (!free) tp += pull([tp], t.ys, x, x + w); tp = Math.min(tp, s.y + s.h - MINH); y = tp; h = s.y + s.h - tp; }
    st.x = x; st.y = y; st.w = w; if (!st.autoH) st.h = h;
    render(wid);
  };
  const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); document.body.classList.remove("dragging"); keepInView(st, el); render(wid); saveLayout(); };
  el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
}
// dragging the border between snapped windows resizes all of them together
function splitDrag(e, wid, doX, doY) {
  const el = els[wid]; el.setPointerCapture(e.pointerId);
  document.body.classList.add("dragging");
  const move = ev => {
    const a = area();
    if (doX) split.x = clamp(ev.clientX / a.w, 0.15, 0.85);
    if (doY) split.y = clamp(ev.clientY / a.h, 0.15, 0.85);
    for (const k in wins) if (wins[k].snap) render(k);
  };
  const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); document.body.classList.remove("dragging"); saveLayout(); };
  el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
}
// double-click an edge: top or bottom stretches the window to full height, left or right to full width
function stretch(wid, dir) {
  const st = wins[wid], a = area();
  if (st.snap) { Object.assign(st, rectOf(wid), { snap: null }); if (st.autoH) delete st.h; }
  if (/[ns]/.test(dir) && !st.autoH) { st.y = 0; st.h = a.h; }
  if (/[ew]/.test(dir)) { st.x = 0; st.w = a.w; }
  render(wid); saveLayout();
}

// ---------- keyboard: Ctrl+Alt+arrows ----------
// Left/Right: snap to a half (then a quarter with Up/Down). Up: full screen. Down: restore, then minimise.
// Windows whose height follows their content slide to that screen edge instead.
const NEXT = {
  ArrowLeft: { null: "left", max: "left", left: "left", right: null, tl: "tl", bl: "bl", tr: "tl", br: "bl" },
  ArrowRight: { null: "right", max: "right", right: "right", left: null, tr: "tr", br: "br", tl: "tr", bl: "br" },
  ArrowUp: { null: "max", max: "max", left: "tl", right: "tr", tl: "tl", tr: "tr", bl: "left", br: "right" },
  ArrowDown: { null: "min", max: null, left: "bl", right: "br", tl: "left", tr: "right", bl: "bl", br: "br" },
};
function snapKey(wid, key) {
  const st = wins[wid]; if (!st || !NEXT[key]) return;
  if (st.autoH) {
    const a = area(), r = rectOf(wid);
    if (key === "ArrowLeft") st.x = 0; if (key === "ArrowRight") st.x = a.w - r.w;
    if (key === "ArrowUp") st.y = 0; if (key === "ArrowDown") st.y = a.h - r.h;
    render(wid); saveLayout(); return;
  }
  const next = NEXT[key][String(st.snap)];
  if (next === "min") { minimiseGroup(st.appId); return; }
  st.snap = next; render(wid); saveLayout();
}
addEventListener("keydown", e => {
  if (!(e.ctrlKey && e.altKey) || !e.key.startsWith("Arrow")) return;
  const f = front(); if (!f) return;
  e.preventDefault(); e.stopPropagation(); snapKey(f, e.key);
}, true);
addEventListener("message", e => {
  if (e.origin !== location.origin || !e.data || e.data.neonOs !== "key") return;
  const fr = [...document.querySelectorAll(".owin iframe")].find(f => f.contentWindow === e.source);
  if (fr) snapKey(fr.closest(".owin").dataset.wid, e.data.key);
});

// clicks inside a framed app don't reach the shell, so watch where focus goes instead
addEventListener("blur", () => setTimeout(() => {
  const f = document.activeElement;
  if (f && f.tagName === "IFRAME") { const w = f.closest(".owin"); if (w) focus(w.dataset.wid); }
}, 0));
addEventListener("resize", () => { for (const k in wins) { keepInView(wins[k], els[k]); render(k); } sizeWall(); });

// ---------- taskbar: one button per app ----------
function renderTasks() {
  const f = front(), fApp = f ? wins[f].appId : null;
  const apps = [...new Set(Object.values(wins).map(w => w.appId))].filter(k => !closed.has(k));
  $("tasks").innerHTML = apps.map(k => {
    const a = appById(k);
    return `<button class="btn task${k === fApp ? " front" : ""}" data-app="${esc(k)}" title="${esc(a.name)}">${svg(a.icon)}<span>${esc(a.name)}</span></button>`;
  }).join("");
}
$("tasks").addEventListener("click", e => {
  const b = e.target.closest("[data-app]"); if (!b) return;
  const k = b.dataset.app, f = front();
  if (f && wins[f].appId === k) minimiseGroup(k); else restoreGroup(k);
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
    <button class="sm-item" role="menuitem" data-act="tidy"><span><b>Tidy windows</b><small>Close framed apps and put Amp back in place</small></span></button>
  </div>`;
  document.body.appendChild(menu);
  $("startBtn").setAttribute("aria-expanded", "true");
  menu.querySelector(".sm-item").focus();
  menu.addEventListener("click", e => {
    const b = e.target.closest("button.sm-item"); if (!b) return;
    closeMenu();
    if (b.dataset.app) openApp(b.dataset.app);
    else if (b.dataset.act === "tidy") tidy();
  });
}
function tidy() {
  for (const id of [...closed]) { closed.delete(id); appWins(id).forEach(k => els[k].classList.remove("closed")); }
  for (const k of Object.keys(wins)) if (!appById(wins[k].appId).native) closeFramed(k);
  for (const id of mounted) { defaultAmpLayout(id); appWins(id).forEach(k => { wins[k].min = false; render(k); }); }
  renderTasks(); saveLayout();
}
$("startBtn").addEventListener("click", e => { e.stopPropagation(); menu ? closeMenu() : openMenu(); });
document.addEventListener("pointerdown", e => { if (menu && !menu.contains(e.target) && !e.target.closest("#startBtn")) closeMenu(); });
addEventListener("blur", closeMenu);
document.addEventListener("keydown", e => {
  if (!menu) return;
  if (e.key === "Escape") { closeMenu(); $("startBtn").focus(); }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    const items = [...menu.querySelectorAll("button.sm-item")], i = items.indexOf(document.activeElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus(); e.preventDefault(); e.stopPropagation();
  }
}, true);

// ---------- desktop icons ----------
$("icons").innerHTML = APPS.map(a => `<button class="dicon" data-app="${esc(a.id)}" title="Open ${esc(a.name)}"><span class="tile">${svg(a.icon)}</span>${esc(a.name)}</button>`).join("");
$("icons").addEventListener("click", e => {
  const b = e.target.closest(".dicon"); if (!b) return;
  document.querySelectorAll(".dicon").forEach(x => x.classList.toggle("sel", x === b));
  if (e.detail >= 2 || matchMedia("(pointer: coarse)").matches) openApp(b.dataset.app);
});
$("icons").addEventListener("keydown", e => { const b = e.target.closest(".dicon"); if (b && e.key === "Enter") { e.preventDefault(); e.stopPropagation(); openApp(b.dataset.app); } });

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
  if (!reduced && !document.hidden) requestAnimationFrame(drawWall);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && !reduced) requestAnimationFrame(drawWall); });

// ---------- start ----------
applyTheme();
onTheme(t => { applyTheme(t); buildSprite(); if (reduced) drawWall(performance.now()); });
buildSprite(); sizeWall(); requestAnimationFrame(drawWall);
(async () => {
  const saved = loadLayout();
  if (!saved) { await openApp("amp"); return; }
  const sw = saved.wins;
  if (saved.split) split = { x: clamp(+saved.split.x || 0.5, 0.15, 0.85), y: clamp(+saved.split.y || 0.5, 0.15, 0.85) };
  const wasClosed = new Set(saved.closed || []);
  parked = sw;
  const apps = [...new Set(Object.values(sw).map(w => w.appId).filter(appById))];
  apps.sort((a, b) => Math.max(...Object.values(sw).filter(w => w.appId === a).map(w => w.z)) - Math.max(...Object.values(sw).filter(w => w.appId === b).map(w => w.z)));
  for (const id of apps) {
    if (wasClosed.has(id)) { closed.add(id); continue; } // reopens later in the same place
    const app = appById(id);
    await openApp(id, sw);
    appWins(id).forEach(k => { if (sw[k]) { wins[k].min = sw[k].min; keepInView(wins[k], els[k]); render(k); } });
  }
  if (!Object.keys(wins).length && !closed.size) await openApp("amp");
  const f = front(); if (f) focus(f);
  renderTasks(); saveLayout();
})();
