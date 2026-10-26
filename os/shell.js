// Neon OS shell: desktop, window manager, taskbar, start menu
// Framed apps run in their own window (an iframe). Native apps (Amp) run inside the desktop,
// so each of their windows is a real desktop window that can be dragged, snapped and stacked.
import { APPS, PLANNED } from "../apps/registry.js";
import { esc, clamp } from "../style-kit/ui.js";
import { getTheme, setTheme, applyTheme, onTheme, liveBall, calmOn } from "../core/theme.js";
import { osAction } from "../core/shortcuts.js";
import { getWallImage } from "../core/desk.js";
import { createGlow, createGlow2D } from "../core/glow.js";
import { initNotices, addNotice, toggleNotices, closeNotices, isQuiet, setQuiet } from "./notices.js";
import { createQuick } from "./quick.js";
import { initWidgets, WIDGETS } from "./widgets.js";
import { VERSION, CHANGES } from "../core/version.js";
import { initSearch, openSearch, closeSearch } from "./search.js";
import { dueNow } from "../core/reminders.js";
import { binPurge } from "../core/bin.js";
import { sfx } from "../core/sounds.js";
import { Slider, openMenu as popMenu } from "../style-kit/ui.js";
import { runBoot } from "./boot.js";
import { initLock } from "./lock.js";
import { createWallPic } from "./wallpic.js";
import { startMidi } from "../core/midi.js";
import { getMix, setMix } from "../core/mixer.js";
import { clock } from "../core/clock.js";

window.neonOsShell = true; // apps running inside the desktop (Amp) check this
const $ = id => document.getElementById(id);
const desk = $("desktop");
const appById = id => APPS.find(a => a.id === id);
const svg = (d, cls = "i") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const ICON = { min: "M5 11h14v2H5z", max: "M5 5h14v14H5zm2 4v8h10V9z", restore: "M8 4h12v12h-3v3H5V8h3zm2 2v2h7v7h1V6zM7 10v7h8v-7z", close: "M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z" };
const TASKBAR = 40, SNAP_EDGE = 6;
// installed with the window-controls overlay on, the window's own title bar strip sits on top (see wcoTop)
let wcoTop = 0;
const area = () => ({ w: innerWidth, h: innerHeight - TASKBAR - wcoTop });

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
// several desktops: each open app sits on one (deskOf); only the current one's windows show
let desks = { n: 1, cur: 0, of: {} };
const deskOf = appId => desks.of[appId] || 0;
const here = appId => compact || deskOf(appId) === desks.cur;
function loadLayout() { try { const s = JSON.parse(localStorage.getItem(LKEY) || "{}"); return s && s.wins ? s : null; } catch (e) { return null; } }
let saveT = null;
function saveLayout() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(LKEY, JSON.stringify({ wins, split, closed: [...closed], desks })); } catch (e) {} }, 200); }
const appWins = appId => Object.keys(wins).filter(k => wins[k].appId === appId);

// ---------- opening apps ----------
async function openApp(appId, savedWins) {
  const app = appById(appId); if (!app) return;
  const open = app.native ? mounted.has(appId) && !closed.has(appId) : !!wins[appId];
  if (open && !here(appId)) goDesk(deskOf(appId), true); // already open on another desktop: go there
  else if (!open && !savedWins) desks.of[appId] = desks.cur;
  if (app.native) {
    if (!mounted.has(appId)) { closed.delete(appId); await mountNative(app, savedWins || parked); }
    else { const was = closed.delete(appId); if (was) taskInfo[appId] = { since: Date.now(), errors: 0 }; appWins(appId).forEach(k => els[k].classList.remove("closed")); restoreGroup(appId); renderTasks(); saveLayout(); if (was) sfx.open(); }
    return;
  }
  if (wins[appId]) { focus(appId); return; }
  const a = area(), n = Object.keys(wins).length;
  const w = Math.min(app.w, a.w - 24), h = Math.min(app.h, a.h - 24);
  wins[appId] = savedWins && savedWins[appId] ? { ...savedWins[appId], z: ++zTop } :
    { wid: appId, appId, w, h, x: clamp((a.w - w) / 2 + n * 28, 0, a.w - w), y: clamp((a.h - h) / 2 + n * 28, 0, a.h - h), z: ++zTop, min: false, snap: null };
  buildFramed(app); focus(appId); saveLayout(); sfx.open();
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
  watchTask(app.id, el.querySelector("iframe"));
  el.querySelector('[data-act="min"]').addEventListener("click", () => minimiseGroup(app.id));
  el.querySelector('[data-act="max"]').addEventListener("click", () => toggleMax(wid));
  el.querySelector('[data-act="close"]').addEventListener("click", () => closeFramed(wid));
  el.querySelector(".titlebar").addEventListener("dblclick", e => { if (!e.target.closest("button")) toggleMax(wid); });
  wireWindow(wid, true);
  render(wid); renderTasks();
}

// What System monitor shows for each open app: when it opened and how many errors it has thrown since.
const taskInfo = {};
function watchTask(appId, frame) {
  taskInfo[appId] = { since: Date.now(), errors: 0 };
  const hook = () => { try { const w = frame.contentWindow, bump = () => { if (taskInfo[appId]) taskInfo[appId].errors++; }; w.addEventListener("error", bump); w.addEventListener("unhandledrejection", bump); } catch (e) {} };
  if (frame) frame.addEventListener("load", hook);
}
// how long the desktop took to answer lately: a timer that should tick every 250 ms, and how late it was
let lagMax = 0, lagAt = performance.now();
setInterval(() => { const now = performance.now(), late = Math.max(0, now - lagAt - 250); lagAt = now; lagMax = Math.max(late, lagMax * 0.9); }, 250);
function taskList() {
  const ids = [...new Set(Object.values(wins).map(w => w.appId))].filter(k => !closed.has(k));
  return ids.map(id => {
    const a = appById(id), ws = appWins(id), info = taskInfo[id] || {};
    return { id, name: a.name, native: !!a.native, windows: ws.filter(k => !(els[k] && els[k].hidden)).length, min: ws.every(k => wins[k].min), since: info.since || null, errors: info.errors || 0 };
  });
}
function taskAct(appId, act) {
  const app = appById(appId); if (!app || !appWins(appId).length) return false;
  if (act === "show") { openApp(appId); if (!app.native) focus(appId); return true; }
  if (act === "close") { closeApp(appId); return true; }
  if (act === "restart" && !app.native) {
    const fr = els[appId] && els[appId].querySelector("iframe"); if (!fr) return false;
    taskInfo[appId] = { since: Date.now(), errors: 0 }; appReady.delete(appId); fr.src = app.url; return true;
  }
  return false;
}

// A native app's page is fetched, its windows are moved onto the desktop, then its script runs here.
async function mountNative(app, savedWins) {
  mounted.add(app.id); taskInfo[app.id] = { since: Date.now(), errors: 0 };
  const html = await (await fetch(app.url)).text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  await new Promise(res => {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = app.url + app.native.css;
    link.onload = link.onerror = res; document.head.appendChild(link);
  });
  const sections = [...doc.querySelectorAll("section.win[id]")];
  for (const sec of sections) {
    const node = document.adoptNode(sec);
    node.classList.add("owin"); node.dataset.wid = `${app.id}:${sec.id}`; node.tabIndex = -1;
    desk.appendChild(node);
  }
  // everything else the app's page needs (file pickers, toasts, drop zone)
  for (const node of [...doc.body.children]) if (node.tagName !== "SCRIPT" && !node.querySelector("section.win")) document.body.appendChild(document.adoptNode(node));
  for (const sec of sections) {
    const wid = `${app.id}:${sec.id}`, el = desk.querySelector(`[data-wid="${CSS.escape(wid)}"]`);
    els[wid] = el;
    // every window resizes both ways; layouts saved when the player and equalizer only grew sideways get a height
    wins[wid] = savedWins && savedWins[wid] ? { ...savedWins[wid], z: ++zTop } : { wid, appId: app.id, x: 0, y: 0, w: 560, h: 0, z: ++zTop, min: false, snap: null };
    if (wins[wid].autoH || !wins[wid].h) { wins[wid].autoH = false; wins[wid].needH = true; }
    wireWindow(wid, true);
    addNativeButtons(app, sec.id, el);
  }
  if (!sections.some(s => savedWins && savedWins[`${app.id}:${s.id}`])) defaultAmpLayout(app.id);
  appWins(app.id).forEach(render);
  for (const k of appWins(app.id)) if (wins[k].needH) { delete wins[k].needH; wins[k].h = Math.max(wins[k].h || 0, natH(k)); render(k); }
  await import(new URL(app.url + app.native.js, location.href).href);
  followCollapse(app.id);
  const top = appWins(app.id).sort((a, b) => wins[b].z - wins[a].z)[0];
  focus(top); renderTasks(); saveLayout(); sfx.open();
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
  sfx.close();
  closed.add(appId);
  appWins(appId).forEach(k => els[k].classList.add("closed"));
  const f = front(); if (f) focus(f);
  renderTasks(); saveLayout();
}

// When a window collapses or expands, windows docked below it slide up or down with it, like the classic player.
function followCollapse(appId) {
  if (!window.ResizeObserver) return;
  const last = {};
  const ro = new ResizeObserver(entries => {
    for (const en of entries) {
      const el = en.target, wid = el.dataset.wid, st = wins[wid]; if (!st) continue;
      const h = el.offsetHeight, old = last[wid]; last[wid] = h;
      if (old == null || !h || Math.abs(h - old) < 2 || document.body.classList.contains("dragging")) continue;
      const r = rectOf(wid), oldBottom = r.y + old, moved = new Set([wid]);
      const shift = (bottom, x0, x1) => {
        for (const k of appWins(appId)) {
          if (moved.has(k) || !visible(k) || wins[k].snap) continue;
          const o = rectOf(k);
          if (Math.abs(o.y - bottom) <= 2 && o.x < x1 && x0 < o.x + o.w) {
            moved.add(k); const ob = o.y + o.h;
            wins[k].y = Math.max(0, o.y + (h - old)); render(k);
            shift(ob, o.x, o.x + o.w);
          }
        }
      };
      shift(oldBottom, r.x, r.x + r.w);
      if (moved.size > 1) saveLayout();
    }
  });
  appWins(appId).forEach(k => ro.observe(els[k]));
}

// Amp's classic layout: player, equalizer and playlist stacked on the left; visualiser over the library on the right.
function defaultAmpLayout(appId) {
  const a = area(), L = 108, T = 14, G = 0, CW = 560;
  const id = s => `${appId}:${s}`, hOf = s => (els[id(s)] ? natH(id(s)) : 200) || 200;
  const set = (s, g) => { if (wins[id(s)]) Object.assign(wins[id(s)], g, { snap: null }); };
  set("winMain", { x: L, y: T, w: CW }); render(id("winMain")); set("winMain", { h: hOf("winMain") });
  const eqY = T + hOf("winMain") + G;
  set("winEq", { x: L, y: eqY, w: CW }); render(id("winEq")); set("winEq", { h: hOf("winEq") });
  const plY = eqY + hOf("winEq") + G;
  set("winPl", { x: L, y: plY, w: CW, h: Math.max(160, a.h - plY - T) });
  const rx = L + CW + G, rw = Math.max(320, a.w - rx - 16), vh = Math.round((a.h - 2 * T - G) * 0.55);
  set("winVis", { x: rx, y: T, w: rw, h: vh });
  set("winMl", { x: rx, y: T + vh + G, w: rw, h: a.h - T - vh - G - T });
}

// ---------- window behaviour shared by both kinds ----------
// the height a window's content needs (Amp's player and equalizer can't shrink below it)
function natH(k) {
  const el = els[k]; if (!el) return 140;
  const old = el.style.height, sh = el.classList.contains("shaded");
  if (sh) el.classList.remove("shaded"); el.style.height = "auto";
  const h = el.offsetHeight; el.style.height = old; if (sh) el.classList.add("shaded");
  return h;
}
const minH = k => /:win(Main|Eq)$/.test(k) ? Math.max(140, natH(k)) : 140;
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
// ---------- phones and small tablets ----------
// Under 760 px wide, Neon OS works like a phone: one app on screen at a time, framed apps fill the screen,
// and a native app's windows (Amp) stack in one scrolling column. Window positions saved for bigger screens are kept.
const COMPACT_W = 760;
let compact = false;
function setCompact() {
  const c = innerWidth < COMPACT_W; if (c === compact) return false;
  compact = c; document.body.classList.toggle("compact", c);
  return true;
}
const STACK_H = { winPl: 300, winVis: 240 };
function renderStack(appId) {
  const a = area(); let y = 0;
  for (const k of appWins(appId)) {
    const el = els[k], st = wins[k]; if (!el) continue;
    const sec = k.split(":")[1], h = st.autoH ? "" : (STACK_H[sec] || Math.max(360, Math.round(a.h * 0.8))) + "px";
    Object.assign(el.style, { position: "absolute", left: "0px", top: y + "px", width: a.w + "px", height: h, zIndex: st.z });
    el.classList.toggle("min", !!st.min); el.classList.remove("max"); delete el.dataset.snap;
    if (!st.min && !el.hidden && !el.classList.contains("closed")) y += el.offsetHeight;
  }
}
function applyAway() { // in compact mode only the front app shows
  const f = front(), app = f ? wins[f].appId : null;
  for (const k in els) els[k].classList.toggle("away", compact && !!app && wins[k] && wins[k].appId !== app);
}
function render(wid) {
  const st = wins[wid], el = els[wid]; if (!st || !el) return;
  el.classList.toggle("offdesk", !here(st.appId));
  if (compact) {
    if (appById(st.appId).native) { renderStack(st.appId); return; }
    const a = area();
    Object.assign(el.style, { position: "absolute", left: desk.scrollLeft + "px", top: desk.scrollTop + "px", width: a.w + "px", height: a.h + "px", zIndex: st.z });
    el.classList.toggle("min", !!st.min); el.classList.add("max"); el.dataset.snap = "max";
    return;
  }
  const g = geom(st);
  if (st.snap) { g.x += desk.scrollLeft; g.y += desk.scrollTop; } // snapped windows fill what's on screen, wherever it's scrolled to
  Object.assign(el.style, { position: "absolute", left: g.x + "px", top: g.y + "px", width: g.w + "px", height: st.autoH ? "" : g.h + "px", zIndex: st.z });
  el.classList.toggle("min", !!st.min);
  el.classList.toggle("max", !!st.snap);
  if (st.snap) el.dataset.snap = st.snap; else delete el.dataset.snap;
  const mb = el.querySelector('[data-act="max"]');
  if (mb) { mb.innerHTML = svg(st.snap ? ICON.restore : ICON.max); mb.title = st.snap ? "Restore" : "Maximise"; }
}
function front() { let best = null; for (const k in wins) if (!wins[k].min && !closed.has(wins[k].appId) && here(wins[k].appId) && !(els[k] && els[k].hidden) && (!best || wins[k].z > wins[best].z)) best = k; return best; }
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
  applyAway(); renderTasks();
}
function minimiseGroup(appId) { sfx.minimise(); appWins(appId).forEach(k => { wins[k].min = true; render(k); }); const f = front(); if (f) focus(f); applyAway(); renderTasks(); saveLayout(); }
function restoreGroup(appId) {
  const ks = appWins(appId).sort((a, b) => wins[a].z - wins[b].z);
  ks.forEach(k => { wins[k].min = false; raise(k); render(k); });
  if (ks.length) focus(ks[ks.length - 1]);
}
function toggleMax(wid) { const st = wins[wid]; st.snap = st.snap ? null : "max"; render(wid); saveLayout(); }
function closeFramed(wid) { appReady.delete(wid); sfx.close(); els[wid].remove(); delete els[wid]; delete wins[wid]; const f = front(); if (f) focus(f); renderTasks(); saveLayout(); }
function keepInView(st, el) {
  // windows keep their size when the browser gets smaller: the desktop scrolls to reach anything past the edge
  void el; st.w = Math.max(260, st.w); if (!st.autoH) st.h = Math.max(140, st.h);
  st.x = Math.max(0, st.x); st.y = Math.max(0, st.y);
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
const visible = k => wins[k] && !wins[k].min && !closed.has(wins[k].appId) && here(wins[k].appId) && els[k] && !els[k].hidden;
function rectOf(k) { const g = geom(wins[k]); if (wins[k].autoH || wins[k].snap || els[k].classList.contains("shaded")) { g.h = els[k].offsetHeight; g.w = els[k].offsetWidth; } return g; }
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
// Joined windows: any windows (of any app) whose edges touch, and everything touching those, move and resize together.
function dockedGroup(wid) {
  const group = new Set([wid]), todo = [wid];
  const touch = (a, b) => {
    const A = rectOf(a), B = rectOf(b), near = (p, q) => Math.abs(p - q) <= 2;
    const vOver = A.y < B.y + B.h && B.y < A.y + A.h, hOver = A.x < B.x + B.w && B.x < A.x + A.w;
    return (vOver && (near(A.x + A.w, B.x) || near(B.x + B.w, A.x))) || (hOver && (near(A.y + A.h, B.y) || near(B.y + B.h, A.y)));
  };
  if (wins[wid].snap) return group;
  while (todo.length) { const c = todo.pop(); for (const k in wins) if (!group.has(k) && visible(k) && !wins[k].snap && touch(c, k)) { group.add(k); todo.push(k); } }
  return group;
}
function startDrag(e, wid) {
  if (e.button !== 0 || e.target.closest("button") || compact) return;
  const st = wins[wid], el = els[wid];
  e.preventDefault(); el.setPointerCapture(e.pointerId);
  // a window carries the windows joined to it; Shift-drag pulls this one away on its own
  const group = e.shiftKey || st.snap ? new Set([wid]) : dockedGroup(wid);
  if (group.size > 1) for (const k of group) els[k].classList.add("carried");
  const start = {}; for (const k of group) { const r = rectOf(k); start[k] = { x: r.x, y: r.y }; }
  const sx0 = desk.scrollLeft, sy0 = desk.scrollTop;
  let g = geom(st), offX = e.clientX + (st.snap ? 0 : sx0) - g.x, offY = e.clientY + (st.snap ? 0 : sy0) - g.y, zone = null, moved = false;
  document.body.classList.add("dragging");
  const move = ev => {
    if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return;
    if (!moved && st.snap) { const fx = offX / g.w; st.snap = null; offX = fx * st.w; offY = Math.min(offY, 18); start[wid] = { x: st.x, y: st.y }; }
    moved = true;
    const a = area(), r = rectOf(wid);
    let x = ev.clientX + desk.scrollLeft - offX, y = Math.max(0, ev.clientY + desk.scrollTop - offY);
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
    for (const k of group) els[k].classList.remove("carried");
    if (zone) { st.snap = zone; sfx.snap(); }
    for (const k of group) { keepInView(wins[k], els[k]); render(k); }
    saveLayout();
  };
  el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
}
let lastRz = {};
function startResize(e, wid, dir) {
  if (e.button !== 0 || compact) return;
  const now = performance.now(); // a second press on the same edge straight after the first is a double-click
  if (lastRz.wid === wid && lastRz.dir === dir && now - lastRz.t < 400) { lastRz = {}; e.preventDefault(); e.stopPropagation(); if (dir.length === 1) stretch(wid, dir); return; }
  lastRz = { wid, dir, t: now };
  const st = wins[wid], el = els[wid];
  e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId);
  const inX = { left: "e", tl: "e", bl: "e", right: "w", tr: "w", br: "w" }[st.snap], inY = { tl: "s", tr: "s", bl: "n", br: "n" }[st.snap];
  if (st.snap && st.snap !== "max" && [...dir].every(c => c === inX || c === inY)) return splitDrag(e, wid, dir.includes(inX || "-"), dir.includes(inY || "-"));
  if (st.snap) { const g = rectOf(wid); Object.assign(st, g, { snap: null }); if (st.autoH) delete st.h; render(wid); }
  // a border two joined windows share belongs to the one above (or to the left): grabbing the lower window's top
  // edge resizes the window above it and pushes this one down, like the classic player
  if ((dir === "n" || dir === "w") && !e.shiftKey && !e.redirected) {
    const me = rectOf(wid), near2 = (p, q) => Math.abs(p - q) <= 2;
    const other = [...dockedGroup(wid)].find(k => { if (k === wid) return false; const o = rectOf(k);
      return dir === "n" ? near2(o.y + o.h, me.y) && o.x < me.x + me.w && me.x < o.x + o.w && !els[k].classList.contains("shaded") : near2(o.x + o.w, me.x) && o.y < me.y + me.h && me.y < o.y + o.h; });
    if (other) { el.releasePointerCapture && el.releasePointerCapture(e.pointerId); lastRz = {}; e.redirected = true; return startResize(e, other, dir === "n" ? "s" : "e"); }
  }
  // Joined windows resize as one block: windows lined up along the edge being dragged (a column for the sides,
  // a row for the top and bottom) stretch with it, and joined windows beyond that edge are pushed along.
  // Shift resizes this window on its own; Alt places the edge freely, without pulling to other edges.
  const group = e.shiftKey ? new Set([wid]) : dockedGroup(wid), R = {}, MINW = 260;
  for (const k of group) R[k] = rectOf(k);
  const mins = {}; for (const k of group) mins[k] = minH(k);
  const near = (p, q) => Math.abs(p - q) <= 2;
  const touchY = (A, B) => A.x < B.x + B.w && B.x < A.x + A.w && (near(A.y + A.h, B.y) || near(B.y + B.h, A.y));
  const touchX = (A, B) => A.y < B.y + B.h && B.y < A.y + A.h && (near(A.x + A.w, B.x) || near(B.x + B.w, A.x));
  function plan(side) {
    const sideways = side === "e" || side === "w";
    const edgeOf = r => side === "e" ? r.x + r.w : side === "w" ? r.x : side === "s" ? r.y + r.h : r.y;
    const v = edgeOf(R[wid]), along = new Set([wid]), todo = [wid];
    while (todo.length) { const c = todo.pop(); for (const k of group) if (!along.has(k) && near(edgeOf(R[k]), v) && !(!sideways && els[k].classList.contains("shaded")) && (sideways ? touchY(R[c], R[k]) : touchX(R[c], R[k]))) { along.add(k); todo.push(k); } }
    const beyond = k => { const B = R[k]; return side === "e" ? B.x >= v - 2 : side === "w" ? B.x + B.w <= v + 2 : side === "s" ? B.y >= v - 2 : B.y + B.h <= v + 2; };
    const pushed = new Set(), q = [...along];
    while (q.length) { const c = q.pop(); for (const k of group) if (!along.has(k) && !pushed.has(k) && beyond(k) && (touchX(R[c], R[k]) || touchY(R[c], R[k]))) { pushed.add(k); q.push(k); } }
    // how far the edge may go before a window in the line gets too small
    let lo = -Infinity, hi = Infinity;
    for (const k of along) {
      const r = R[k];
      if (side === "e") lo = Math.max(lo, MINW - r.w); if (side === "w") hi = Math.min(hi, r.w - MINW);
      if (side === "s") lo = Math.max(lo, mins[k] - r.h); if (side === "n") hi = Math.min(hi, r.h - mins[k]);
      if (side === "w") lo = Math.max(lo, -r.x); if (side === "n") lo = Math.max(lo, -r.y);
    }
    for (const k of pushed) { if (side === "w") lo = Math.max(lo, -R[k].x); if (side === "n") lo = Math.max(lo, -R[k].y); }
    return { side, v, along, pushed, lo, hi };
  }
  const plans = [...dir].map(plan), moving = new Set(); for (const pl of plans) { pl.along.forEach(k => moving.add(k)); pl.pushed.forEach(k => moving.add(k)); }
  const t = targets(new Set([...group]));
  document.body.classList.add("dragging");
  if (group.size > 1) for (const k of moving) els[k].classList.add("carried");
  const move = ev => {
    const geo = {}; for (const k of moving) geo[k] = { ...R[k] };
    for (const pl of plans) {
      let d = pl.side === "e" || pl.side === "w" ? ev.clientX - sx : ev.clientY - sy;
      if (!ev.altKey) { const me = R[wid], at = pl.v + d; d += pl.side === "e" || pl.side === "w" ? pull([at], t.xs, me.y, me.y + me.h) : pull([at], t.ys, me.x, me.x + me.w); }
      d = Math.round(clamp(d, pl.lo, pl.hi));
      for (const k of pl.along) { const g = geo[k];
        if (pl.side === "e") g.w = R[k].w + d; else if (pl.side === "w") { g.x = R[k].x + d; g.w = R[k].w - d; }
        else if (pl.side === "s") g.h = R[k].h + d; else { g.y = R[k].y + d; g.h = R[k].h - d; } }
      for (const k of pl.pushed) { const g = geo[k]; if (pl.side === "e" || pl.side === "w") g.x = R[k].x + d; else g.y = R[k].y + d; }
    }
    for (const k of moving) { const st2 = wins[k], g = geo[k]; st2.x = g.x; st2.y = g.y; st2.w = g.w; if (!els[k].classList.contains("shaded")) st2.h = g.h; render(k); }
  };
  const sx = e.clientX, sy = e.clientY;
  const up = () => {
    el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
    document.body.classList.remove("dragging"); for (const k of moving) { els[k].classList.remove("carried"); keepInView(wins[k], els[k]); render(k); } saveLayout();
  };
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
  const st = wins[wid]; if (!st || !NEXT[key] || compact) return;
  if (st.autoH) {
    const a = area(), r = rectOf(wid);
    if (key === "ArrowLeft") st.x = 0; if (key === "ArrowRight") st.x = a.w - r.w;
    if (key === "ArrowUp") st.y = 0; if (key === "ArrowDown") st.y = a.h - r.h;
    render(wid); saveLayout(); return;
  }
  const next = NEXT[key][String(st.snap)];
  if (next === "min") { minimiseGroup(st.appId); return; }
  if (next !== st.snap) sfx.snap();
  st.snap = next; render(wid); saveLayout();
}
// ---------- desktop shortcuts (the list is in core/shortcuts.js) ----------
function doAction(act, wid) {
  if (act.startsWith("snap:")) { const f = wid || front(); if (f) snapKey(f, act.slice(5)); return; }
  if (act.startsWith("open:")) { const a = APPS[+act.slice(5)]; if (a) openApp(a.id); return; }
  const f = front();
  switch (act) {
    case "switch": case "switch-back": switcher(act === "switch" ? 1 : -1); break;
    case "close": if (f) closeApp(wins[f].appId); break;
    case "minimise": if (f) minimiseGroup(wins[f].appId); break;
    case "desktop": showDesktop(); break;
    case "start": if (menu) closeMenu(); else { closeNotices(); closeTray(); openMenu(); } break;
    case "notices": closeMenu(); closeTray(); toggleNotices(); break;
    case "help": openApp("help"); break;
    case "lock": closeMenu(); closeTray(); closeNotices(); lockApi.lock(); break;
    case "search": closeMenu(); closeNotices(); closeTray(); openSearch(); break;
    case "toggle": case "next": case "prev": transport(act); break;
    case "desk-prev": case "desk-next": goDesk(desks.cur + (act === "desk-next" ? 1 : -1)); break;
    case "move-prev": case "move-next": if (f) { const n = desks.cur + (act === "move-next" ? 1 : -1); if (n >= 0 && (n < desks.n || desks.n < DESK_MAX)) { const id = wins[f].appId; moveToDesk(id, n); goDesk(Math.min(n, desks.n - 1)); } } break;
  }
}
addEventListener("keydown", e => {
  if (lockApi && lockApi.mode) return; // locked or screensaver: no desktop shortcuts
  if (sw && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeSwitcher(); return; }
  if (sw && (e.key === "Enter")) { e.preventDefault(); e.stopPropagation(); commitSwitch(); return; }
  const act = osAction(e); if (!act) return;
  e.preventDefault(); e.stopPropagation(); doAction(act);
}, true);
addEventListener("keyup", e => { if (e.key === "Alt" && sw) { e.preventDefault(); commitSwitch(); } }, true);
addEventListener("message", async e => {
  if (e.origin !== location.origin || !e.data) return;
  const d = e.data;
  if (d.neonOs === "play" && Array.isArray(d.ids)) { // a framed app (Files) asks Amp to play songs
    await openApp("amp");
    dispatchEvent(new CustomEvent("neonos:play", { detail: { ids: d.ids } }));
    return;
  }
  if (d.neonOs === "open" && appById(d.app)) { openApp(d.app); return; } // an app opens another (Tape's edit buttons)
  if (d.neonOs === "welcome") { showWelcome(); return; }
  if (d.neonOs === "lock") { doAction("lock"); return; }
  if (d.neonOs === "wall-next") { wallPic.next(); return; }
  if (d.neonOs === "cue-music" && typeof d.value === "string") { cueMusic(d.value, { fadeIn: d.fadeIn || 0 }); return; } // a Photos slideshow's music
  if (d.neonOs === "sleep" && typeof d.secs === "number") { sleepFade(d.secs); return; }
  if (d.neonOs === "convert" && Array.isArray(d.ids)) { await openApp("convert"); sendTo("convert", { neonOsConvert: d.ids }); return; } // Amp's Convert…
  // the Terminal (and other apps) can ask for these
  if (d.neonOs === "close" && appById(d.app)) { closeApp(d.app); return; }
  if (d.neonOs === "transport" && ["toggle", "next", "prev", "pause", "stop"].includes(d.act)) { transport(d.act); return; }
  if (d.neonOs === "desk" && Number.isInteger(d.n)) { if (d.n >= desks.n && desks.n < DESK_MAX) addDesk(); else goDesk(d.n); return; }
  if (d.neonOs === "volume" && typeof d.v === "number") { setMusicVol(d.v); return; }
  if (d.neonOs === "status") { e.source.postMessage({ neonOsStatus: { apps: taskList().map(t => t.name), desk: desks.cur + 1, desks: desks.n, playing: nowPlaying && mounted.has("amp") && !closed.has("amp") ? { title: nowPlaying.title, artist: nowPlaying.artist, state: nowPlaying.state } : null, volume: musicVol } }, location.origin); return; }
  if (d.neonOs === "open-files" && Array.isArray(d.files)) { openFiles(d.files); return; } // Files opening songs or videos
  if (d.neonOs === "open-url" && typeof d.url === "string") { await openApp("browser"); sendTo("browser", { neonOsBrowserOpen: d.url }); return; }
  if (d.neonOs === "pause-music") { if (mounted.has("amp") && !closed.has("amp")) dispatchEvent(new CustomEvent("neonos:transport", { detail: "pause" })); return; }
  if (d.neonOs === "ready" && appById(d.app)) { // a framed app is listening: hand over anything waiting for it
    appReady.add(d.app); const q = forApp[d.app] || []; delete forApp[d.app];
    for (const m of q) e.source.postMessage(m, location.origin); return;
  }
  if (d.neonOs === "saver") { closeMenu(); closeTray(); closeNotices(); lockApi.saver(); return; }
  if (d.neonOs === "tasks") { e.source.postMessage({ neonOsTasks: taskList(), lag: Math.round(lagMax), memory: performance.memory ? { used: performance.memory.usedJSHeapSize, limit: performance.memory.jsHeapSizeLimit } : null }, location.origin); return; }
  if (d.neonOs === "task" && d.app) { const ok = taskAct(d.app, d.act); e.source.postMessage({ neonOsTasks: taskList(), done: ok ? d.act : null }, location.origin); return; }
  if (d.neonOs === "keyup") { if (d.key === "Alt" && sw) commitSwitch(); return; }
  if (d.neonOs === "install-state") { e.source.postMessage({ neonOsInstall: installState() }, location.origin); return; }
  if (d.neonOs === "install") { const ok = await promptInstall(); e.source.postMessage({ neonOsInstall: { ...installState(), accepted: ok } }, location.origin); return; }
  if (d.neonOs !== "key") return;
  const fr = [...document.querySelectorAll(".owin iframe")].find(f => f.contentWindow === e.source);
  const wid = fr ? fr.closest(".owin").dataset.wid : null;
  if (d.act) doAction(d.act, wid);
  else if (wid && d.key) snapKey(wid, d.key); // older apps
});

// ---------- app switcher (Alt+`) ----------
// Hold Alt and press ` to step through open apps, most recent first; let go of Alt to switch.
let sw = null;
function switchOrder() {
  const apps = [...new Set(Object.values(wins).map(w => w.appId))].filter(k => !closed.has(k) && here(k));
  const topZ = k => Math.max(...appWins(k).map(w => wins[w].z));
  return apps.sort((a, b) => topZ(b) - topZ(a));
}
function drawSwitcher() {
  const k = sw.items[sw.i];
  sw.el.innerHTML = `<div class="titlebar"><span class="ttl">Switch app</span></div><div class="wbody">
    <div class="swlist" role="listbox" aria-label="Open apps" aria-activedescendant="sw-${esc(k)}">${sw.items.map((id, i) => {
      const a = appById(id), min = appWins(id).every(w => wins[w].min);
      return `<div class="swi${i === sw.i ? " sel" : ""}" role="option" id="sw-${esc(id)}" aria-selected="${i === sw.i}" data-i="${i}"><span class="tile">${svg(a.icon)}</span><b>${esc(a.name)}</b>${min ? "<small>minimised</small>" : ""}</div>`;
    }).join("")}</div>
    <p class="swhint">Let go of Alt to switch · Esc to cancel</p></div>`;
  $("srSay").textContent = appById(k).name;
}
function switcher(dir) {
  if (!sw) {
    const items = switchOrder(); if (!items.length) return;
    const el = document.createElement("div");
    el.className = "win lit switcher"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Switch app");
    document.body.appendChild(el);
    sw = { el, items, i: 0 };
    el.addEventListener("pointerdown", e => { const b = e.target.closest("[data-i]"); if (b) { e.preventDefault(); sw.i = +b.dataset.i; commitSwitch(); } });
  }
  sw.i = (sw.i + dir + sw.items.length) % sw.items.length;
  drawSwitcher();
}
function closeSwitcher() { if (!sw) return; sw.el.remove(); sw = null; }
function commitSwitch() {
  if (!sw) return;
  const k = sw.items[sw.i]; closeSwitcher();
  if (appWins(k).some(w => wins[w].min)) sfx.restore();
  restoreGroup(k); focusInside(front());
}
// move keyboard focus into a window, so typing goes to the app straight away
function focusInside(wid) {
  const el = wid && els[wid]; if (!el) return;
  const fr = el.querySelector("iframe");
  try { (fr || el).focus({ preventScroll: true }); } catch (e) {}
}
document.addEventListener("pointerdown", e => { if (sw && !sw.el.contains(e.target)) closeSwitcher(); });

// Ctrl+Alt+D: minimise everything to show the desktop; press again to bring it all back
let deskHidden = null;
function showDesktop() {
  const vis = [...new Set(Object.keys(wins).filter(visible).map(k => wins[k].appId))];
  if (vis.length) {
    deskHidden = vis; sfx.minimise();
    for (const k in wins) if (vis.includes(wins[k].appId)) { wins[k].min = true; render(k); }
    renderTasks(); saveLayout();
  } else if (deskHidden) { sfx.restore(); deskHidden.filter(k => appWins(k).length && !closed.has(k)).forEach(restoreGroup); deskHidden = null; focusInside(front()); }
}

// ---------- music: the taskbar mini player and Ctrl+Alt+P / . / , ----------
// Amp tells the desktop what's playing (neonos:nowplaying); the desktop sends it play, pause, next and previous.
async function transport(act) {
  if (!mounted.has("amp") || closed.has("amp")) { if (act !== "toggle") return; await openApp("amp"); }
  dispatchEvent(new CustomEvent("neonos:transport", { detail: act }));
}
// ---------- music started by other apps (core/music-cue.js) ----------
// An alarm's music fades in over 30 seconds; a sleep timer fades the music out over 30 seconds, pauses it, and puts
// the volume back for next time. Moving the volume yourself during a fade stops the fade.
let ramp = null;
function rampVolume(to, secs, done) {
  clearInterval(ramp && ramp.iv); const from = musicVol, t0 = performance.now();
  ramp = { iv: setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / (secs * 1000)); setMusicVol(from + (to - from) * k, true);
    if (k >= 1) { clearInterval(ramp.iv); ramp = null; if (done) done(); }
  }, 200) };
}
function setMusicVol(v, fromRamp) { if (!fromRamp && ramp) { clearInterval(ramp.iv); ramp = null; } musicVol = clamp(v, 0, 1); dispatchEvent(new CustomEvent("neonos:volume", { detail: musicVol })); renderVolIcon(); }
// the music plays behind whatever you're doing: Amp opens if it has to, but the window in front stays in front
async function cueMusic(value, { fadeIn = 0 } = {}) {
  const { idsFor } = await import("../core/music-cue.js"), ids = await idsFor(value);
  if (!ids.length) { addNotice({ title: "No songs to play", text: "The music chosen for this is empty or gone.", app: "amp" }); return; }
  const was = front();
  if (!mounted.has("amp") || closed.has("amp")) { await openApp("amp"); if (was && wins[was]) focus(was); }
  const target = musicVol || 0.8;
  if (fadeIn) setMusicVol(0.02, true);
  dispatchEvent(new CustomEvent("neonos:play", { detail: { ids } }));
  if (fadeIn) setTimeout(() => rampVolume(target, fadeIn), 300);
}
function sleepFade(secs) {
  if (!nowPlaying || nowPlaying.state !== "playing") return;
  const back = musicVol; rampVolume(0, secs, () => { transport("pause"); setTimeout(() => setMusicVol(back, true), 400); });
}

// ---------- MIDI controllers (core/midi.js; assigned in Settings) ----------
const midiActs = "BroadcastChannel" in window ? new BroadcastChannel("neon-os:midi-act") : null;
startMidi((id, v) => {
  if (id.startsWith("amp.") && id !== "amp.volume") transport(id.slice(4));
  else if (id === "amp.volume") { musicVol = v; dispatchEvent(new CustomEvent("neonos:volume", { detail: v })); renderVolIcon(); }
  else if (id === "mix.master") setMix({ master: v });
  else if (id === "mix.muteAll") setMix({ muteAll: !getMix().muteAll });
  else if (id === "rack.toggle") { if (clock.state.playing) clock.stop(); else clock.start(clock.state.bpm); }
  else if (id === "rack.tempo") clock.setBpm(Math.round(60 + v * 140));
  else if (id === "desk.wall") { if (wallMode === "slideshow") wallPic.next(); else { const order = ["orb", "fog", "plain"], t = getTheme(); setTheme({ wall: order[(Math.max(0, order.indexOf(t.wall || "orb")) + 1) % order.length] }); } }
  else if (id.startsWith("decks.") && midiActs) midiActs.postMessage({ id, v });
});
const MP = { prev: "M6 6h2v12H6zm3.5 6 8.5 6V6z", next: "M16 6h2v12h-2zM6 18l8.5-6L6 6z", play: "M8 5v14l11-7z", pause: "M6 5h4v14H6zm8 0h4v14h-4z" };
let nowPlaying = null, miniBuilt = false, lockApi = null;
addEventListener("neonos:nowplaying", e => { nowPlaying = e.detail; renderMini(); });
function renderMini() {
  const el = $("miniPlayer"), show = !!nowPlaying && mounted.has("amp") && !closed.has("amp");
  el.hidden = !show; if (!show) return;
  if (!miniBuilt) {
    miniBuilt = true;
    el.innerHTML = `<button class="btn icon" data-t="prev" aria-label="Previous song" title="Previous song (Ctrl+Alt+,)">${svg(MP.prev)}</button><button class="btn icon" data-t="toggle"></button><button class="btn icon" data-t="next" aria-label="Next song" title="Next song (Ctrl+Alt+.)">${svg(MP.next)}</button><button class="lcd mp-title" data-t="show" title="Show Amp"><span></span></button>`;
    el.addEventListener("click", e => { const b = e.target.closest("[data-t]"); if (!b) return; if (b.dataset.t === "show") { restoreGroup("amp"); } else transport(b.dataset.t); });
  }
  const playing = nowPlaying.state === "playing" || nowPlaying.state === "loading", tb = el.querySelector('[data-t="toggle"]');
  if (tb.dataset.s !== String(playing)) { tb.dataset.s = String(playing); tb.innerHTML = svg(playing ? MP.pause : MP.play); }
  tb.setAttribute("aria-label", playing ? "Pause" : "Play"); tb.title = (playing ? "Pause" : "Play") + " (Ctrl+Alt+P)";
  const txt = nowPlaying.title + (nowPlaying.artist ? " · " + nowPlaying.artist : "");
  const t = el.querySelector(".mp-title"); t.firstChild.textContent = txt; t.setAttribute("aria-label", `Now playing: ${txt}. Show Amp`);
  t.classList.toggle("paused", !playing);
}

// clicks inside a framed app don't reach the shell, so watch where focus goes instead
addEventListener("blur", () => setTimeout(() => {
  const f = document.activeElement;
  if (f && f.tagName === "IFRAME") { const w = f.closest(".owin"); if (w) focus(w.dataset.wid); }
}, 0));
desk.addEventListener("scroll", () => { for (const k in wins) if (wins[k].snap || (compact && !appById(wins[k].appId).native)) render(k); }, { passive: true });
addEventListener("resize", () => { if (setCompact()) applyAway(); for (const k in wins) { keepInView(wins[k], els[k]); render(k); } sizeWall(); startWall(); if (iconRows() + "" !== iconsKey.slice(iconsKey.lastIndexOf("]") + 1)) renderIcons(); });

// ---------- taskbar: one button per app ----------
function renderTasks() {
  const f = front(), fApp = f ? wins[f].appId : null;
  const apps = [...new Set(Object.values(wins).map(w => w.appId))].filter(k => !closed.has(k) && here(k));
  $("tasks").innerHTML = apps.map(k => {
    const a = appById(k);
    return `<button class="btn task${k === fApp ? " front" : ""}" data-app="${esc(k)}" title="${esc(a.name)}" aria-pressed="${k === fApp}">${svg(a.icon)}<span>${esc(a.name)}</span></button>`;
  }).join("");
  renderMini(); renderDesks();
}
$("tasks").addEventListener("click", e => {
  const b = e.target.closest("[data-app]"); if (!b) return;
  const k = b.dataset.app, f = front();
  if (f && wins[f].appId === k) minimiseGroup(k); else { if (appWins(k).some(w => wins[w].min)) sfx.restore(); restoreGroup(k); }
});
// ---------- several desktops ----------
// The numbered buttons switch desktop (Ctrl+Alt+[ and ]); + adds one (up to 4). Right-click a number to remove it.
// Ctrl+Alt+Shift+[ and ] carry the front app to the desktop before or after; the window menu moves it to any.
const DESK_MAX = 4;
function renderDesks() {
  const el = $("desks"); if (!el) return;
  const count = k => [...new Set(Object.values(wins).map(w => w.appId))].filter(a => !closed.has(a) && deskOf(a) === k).length;
  el.innerHTML = Array.from({ length: desks.n }, (_, i) => `<button class="btn dsk${i === desks.cur ? " on" : ""}" data-desk="${i}" aria-pressed="${i === desks.cur}" title="Desktop ${i + 1}${count(i) ? ` · ${count(i)} app${count(i) === 1 ? "" : "s"}` : ""} (Ctrl+Alt+[ / ])" aria-label="Desktop ${i + 1}">${i + 1}${count(i) && i !== desks.cur ? "<i></i>" : ""}</button>`).join("")
    + (desks.n < DESK_MAX ? `<button class="btn dsk add" data-desk="add" title="Add a desktop" aria-label="Add a desktop">+</button>` : "");
}
function goDesk(n, quiet) {
  n = clamp(n, 0, desks.n - 1); if (n === desks.cur) return;
  desks.cur = n; deskHidden = null;
  for (const k in wins) render(k);
  if (compact) applyAway();
  const f = front(); if (f) focus(f); else for (const k in els) els[k].classList.remove("lit");
  renderTasks(); saveLayout(); if (!quiet) sfx.tick();
  $("srSay").textContent = `Desktop ${n + 1}`;
}
function moveToDesk(appId, n) {
  if (n >= desks.n) { if (desks.n >= DESK_MAX) return; desks.n++; n = desks.n - 1; }
  desks.of[appId] = n; appWins(appId).forEach(render);
  const f = front(); if (f) focus(f);
  renderTasks(); saveLayout(); sfx.snap();
}
function addDesk() { if (desks.n >= DESK_MAX) return; desks.n++; goDesk(desks.n - 1); }
function removeDesk(n) {
  if (desks.n <= 1) return;
  for (const a in desks.of) { if (desks.of[a] === n) desks.of[a] = Math.max(0, n - 1); else if (desks.of[a] > n) desks.of[a]--; }
  desks.n--; const cur = desks.cur > n || desks.cur >= desks.n ? Math.max(0, desks.cur - 1) : desks.cur; desks.cur = -1; goDesk(cur, true); sfx.close();
}
$("desks").addEventListener("click", e => { const b = e.target.closest("[data-desk]"); if (!b) return; if (b.dataset.desk === "add") addDesk(); else goDesk(+b.dataset.desk); });
$("desks").addEventListener("contextmenu", e => {
  const b = e.target.closest("[data-desk]"); e.preventDefault(); if (!b || b.dataset.desk === "add") return;
  const n = +b.dataset.desk;
  popMenu(null, [{ text: `Go to desktop ${n + 1}`, run: () => goDesk(n) }, ...(desks.n < DESK_MAX ? [{ text: "Add a desktop", run: addDesk }] : []), ...(desks.n > 1 ? ["-", { text: `Remove desktop ${n + 1}`, danger: true, run: () => removeDesk(n) }] : [])], { x: e.clientX, y: e.clientY });
});

function tickClock() { const d = new Date(); $("clock").textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
tickClock(); setInterval(tickClock, 10000);

// ---------- tray: volume ----------
// System sounds on/off and their volume, plus Amp's music volume (Amp listens for neonos:volume).
let trayPop = null, musicVol = 0.8;
try { const a = JSON.parse(localStorage.getItem("neon-orbit-amp") || "{}"); if (typeof a.vol === "number") musicVol = a.vol; } catch (e) {}
addEventListener("neonos:volume-changed", e => { musicVol = e.detail; if (trayPop) { trayPop.music.set(musicVol); trayPop.el.querySelector("#trMusicPct").textContent = Math.round(musicVol * 100) + "%"; } renderVolIcon(); });
const VOL = { on: "M4 9v6h4l5 5V4L8 9zm12.5 3A4.5 4.5 0 0 0 14 8v8a4.47 4.47 0 0 0 2.5-4zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z", off: "M4 9v6h4l5 5V4L8 9zm12.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z" };
function renderVolIcon() { $("volBtn").innerHTML = svg(musicVol < 0.01 && getTheme().sounds === false ? VOL.off : VOL.on); $("volBtn").title = `Volume: music ${Math.round(musicVol * 100)}%`; }
function closeTray() { if (!trayPop) return; trayPop.el.remove(); trayPop = null; $("volBtn").setAttribute("aria-expanded", "false"); }
function openTray() {
  const t = getTheme(), el = document.createElement("div");
  el.className = "win lit traypop"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Volume");
  el.innerHTML = `<div class="titlebar"><span class="ttl">Volume</span></div><div class="wbody">
    <div class="vrow"><span class="lbl">Music</span><div class="slider h" id="trMusic"></div><span class="lcd pct" id="trMusicPct">${Math.round(musicVol * 100)}%</span></div>
    <div class="vrow"><span class="lbl">System</span><div class="slider h" id="trSys"></div><span class="lcd pct" id="trSysPct">${Math.round((t.sysVol == null ? 0.6 : t.sysVol) * 100)}%</span></div>
    <div class="row"><button class="btn" id="trSnd" aria-pressed="${t.sounds !== false}"><i class="led"></i>System sounds</button><button class="btn" id="trMix" title="Volume for each app, their levels, and the speakers or headphones">Mixer</button></div></div>`;
  document.body.appendChild(el);
  const music = Slider(el.querySelector("#trMusic"), { min: 0, max: 1, step: 0.01, value: musicVol, label: "Music volume", text: v => Math.round(v * 100) + "%",
    onInput: v => { setMusicVol(v); el.querySelector("#trMusicPct").textContent = Math.round(v * 100) + "%"; } });
  Slider(el.querySelector("#trSys"), { min: 0, max: 1, step: 0.01, value: t.sysVol == null ? 0.6 : t.sysVol, label: "System sounds volume", text: v => Math.round(v * 100) + "%",
    onInput: v => { setTheme({ sysVol: v }); el.querySelector("#trSysPct").textContent = Math.round(v * 100) + "%"; }, onChange: () => sfx.tick() });
  el.querySelector("#trMix").addEventListener("click", () => { closeTray(); openApp("mixer"); });
  el.querySelector("#trSnd").addEventListener("click", e => { const on = getTheme().sounds === false; setTheme({ sounds: on }); e.currentTarget.setAttribute("aria-pressed", String(on)); if (on) sfx.chime(); renderVolIcon(); });
  trayPop = { el, music };
  $("volBtn").setAttribute("aria-expanded", "true");
}
$("volBtn").addEventListener("click", e => { e.stopPropagation(); trayPop ? closeTray() : openTray(); });
document.addEventListener("pointerdown", e => { if (trayPop && !trayPop.el.contains(e.target) && !e.target.closest("#volBtn")) closeTray(); });
document.addEventListener("keydown", e => { if (trayPop && e.key === "Escape") { closeTray(); $("volBtn").focus(); } });
renderVolIcon();

// ---------- start menu ----------
// music apps on the left, everyday and system apps on the right (one column on a phone)
const GROUPS = { music: "Music", everyday: "Everyday", system: "System" };
let menu = null;
function closeMenu() { if (!menu) return; menu.remove(); menu = null; $("startBtn").setAttribute("aria-expanded", "false"); }
function openMenu() {
  menu = document.createElement("div");
  menu.className = "win lit startmenu"; menu.setAttribute("role", "menu");
  menu.innerHTML = `<div class="titlebar"><span class="ttl">Neon OS</span></div><div class="wbody">
    <div class="lcd hero"><i aria-hidden="true"></i><b>NEON OS</b></div>
    <button class="sm-item" role="menuitem" data-act="search"><span><b>Search…</b><small>Apps, songs, playlists, settings · Ctrl+K</small></span></button>
    <div class="sm-sep"></div>
    <div class="sm-cols">${[["music"], ["everyday", "system"]].map(col => `<div class="sm-col">${col.map(g => `<span class="sm-h">${GROUPS[g]}</span>${APPS.filter(a => (a.group || "music") === g).map(a => `<button class="sm-item" role="menuitem" data-app="${esc(a.id)}">${svg(a.icon)}<span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></span></button>`).join("")}`).join("")}</div>`).join("")}</div>
    ${PLANNED.length ? `<div class="sm-sep"></div>${PLANNED.map(p => `<div class="sm-item soon" aria-disabled="true"><span><b>${esc(p.name)}</b><small>${esc(p.desc)}, coming</small></span></div>`).join("")}` : ""}
    <div class="sm-sep"></div>
    <button class="sm-item" role="menuitem" data-act="tidy"><span><b>Tidy windows</b><small>Put open windows back in neat places</small></span></button>
    <button class="sm-item" role="menuitem" data-act="lock"><span><b>Lock</b><small>The lock screen, with the time and what's playing · Ctrl+Alt+L</small></span></button>
    ${installEvt ? `<button class="sm-item" role="menuitem" data-act="install"><span><b>Install Neon OS</b><small>Its own window and icon; works offline</small></span></button>` : ""}
  </div>`;
  document.body.appendChild(menu);
  $("startBtn").setAttribute("aria-expanded", "true");
  menu.querySelector(".sm-item").focus();
  menu.addEventListener("click", e => {
    const b = e.target.closest("button.sm-item"); if (!b) return;
    closeMenu();
    if (b.dataset.app) openApp(b.dataset.app);
    else if (b.dataset.act === "tidy") tidy();
    else if (b.dataset.act === "lock") doAction("lock");
    else if (b.dataset.act === "install") promptInstall();
    else if (b.dataset.act === "search") openSearch();
  });
}
function tidy() {
  // rearranges what's open: Amp back in its docked layout, other windows cascaded; closed and minimised stay as they are
  for (const id of mounted) if (!closed.has(id)) defaultAmpLayout(id);
  const a = area(), framed = Object.keys(wins).filter(k => !appById(wins[k].appId).native).sort((x, y) => wins[x].z - wins[y].z);
  framed.forEach((k, i) => {
    const st = wins[k], app = appById(st.appId);
    st.snap = null; st.w = Math.min(app.w, a.w - 40); st.h = Math.min(app.h, a.h - 40);
    st.x = clamp(a.w - st.w - 40 - (framed.length - 1 - i) * 30, 0, a.w - st.w); st.y = clamp(40 + i * 30, 0, a.h - st.h);
  });
  for (const k in wins) render(k);
  renderTasks(); saveLayout();
}
$("startBtn").addEventListener("click", e => { e.stopPropagation(); if (menu) closeMenu(); else { sfx.tick(); openMenu(); } });
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
// Icons sit on a grid. Drag one to move it (dropping on another swaps them); positions are saved.
// Settings chooses which apps have an icon (theme.deskHide); apps marked desktop: false start hidden.
const IKEY = "neon-os:icons", CW = 90, CH = 90, IP = 12;
let iconPos = {};
try { iconPos = JSON.parse(localStorage.getItem(IKEY) || "{}") || {}; } catch (e) {}
const saveIcons = () => { try { localStorage.setItem(IKEY, JSON.stringify(iconPos)); } catch (e) {} };
const hiddenIcons = () => { const h = getTheme().deskHide; return new Set(Array.isArray(h) ? h : APPS.filter(a => a.desktop === false).map(a => a.id)); };
const deskApps = () => { const h = hiddenIcons(); return APPS.filter(a => !h.has(a.id)); };
const iconRows = () => Math.max(1, Math.floor((area().h - IP * 2 + 4) / CH));
function layoutIcons() {
  const rows = iconRows(), apps = deskApps(), taken = new Set(), place = {};
  for (const a of apps) { const p = iconPos[a.id]; if (p && p.c >= 0 && p.r >= 0 && p.r < rows && !taken.has(p.c + "," + p.r)) { place[a.id] = { c: p.c, r: p.r }; taken.add(p.c + "," + p.r); } }
  let c = 0, r = 0;
  for (const a of apps) if (!place[a.id]) {
    while (taken.has(c + "," + r)) { if (++r >= rows) { r = 0; c++; } }
    place[a.id] = { c, r }; taken.add(c + "," + r);
  }
  return place;
}
let iconsKey = "";
function renderIcons() {
  const place = layoutIcons();
  iconsKey = JSON.stringify([...hiddenIcons()]) + iconRows();
  $("icons").innerHTML = deskApps().map(a => `<button class="dicon${selIcons.has(a.id) ? " sel" : ""}" data-app="${esc(a.id)}" title="Open ${esc(a.name)}" style="left:${IP + place[a.id].c * CW}px;top:${IP + place[a.id].r * CH}px"><span class="tile">${svg(a.icon)}</span>${esc(a.name)}</button>`).join("");
}
function hideIcon(id) { const h = hiddenIcons(); h.add(id); setTheme({ deskHide: [...h] }); renderIcons(); }
function arrangeIcons() { iconPos = {}; saveIcons(); renderIcons(); }
let iconDragged = false;
// selected icons: click one, Ctrl- or Shift-click to add, or drag a box on the empty desktop around several
const selIcons = new Set();
function setIconSel(ids) {
  selIcons.clear(); for (const id of ids) selIcons.add(id);
  document.querySelectorAll(".dicon").forEach(x => x.classList.toggle("sel", selIcons.has(x.dataset.app)));
}
$("icons").addEventListener("pointerdown", e => {
  const b = e.target.closest(".dicon"); if (!b || e.button !== 0) return;
  const id0 = b.dataset.app;
  // dragging a selected icon carries the whole selection
  const group = selIcons.has(id0) && selIcons.size > 1 && !e.ctrlKey && !e.metaKey && !e.shiftKey ? [...selIcons] : [id0];
  const els0 = group.map(id => $("icons").querySelector(`[data-app="${CSS.escape(id)}"]`)).filter(Boolean);
  const start = els0.map(el => ({ el, x: el.offsetLeft, y: el.offsetTop }));
  const sx = e.clientX, sy = e.clientY; let moving = false;
  const move = ev => {
    if (!moving) { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return; moving = true; els0.forEach(el => el.classList.add("lifting")); document.body.classList.add("dragging"); }
    const dx = Math.max(-Math.min(...start.map(q => q.x)), ev.clientX - sx), dy = Math.max(-Math.min(...start.map(q => q.y)), ev.clientY - sy);
    for (const q of start) { q.el.style.left = q.x + dx + "px"; q.el.style.top = q.y + dy + "px"; }
  };
  const up = () => {
    removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
    if (!moving) return;
    iconDragged = true; setTimeout(() => { iconDragged = false; }, 300);
    els0.forEach(el => el.classList.remove("lifting")); document.body.classList.remove("dragging");
    const place = layoutIcons(), rows = iconRows();
    if (group.length === 1) { // one icon: drop on another to swap
      const c = Math.max(0, Math.round((b.offsetLeft - IP) / CW)), r = clamp(Math.round((b.offsetTop - IP) / CH), 0, rows - 1);
      const other = Object.keys(place).find(k => k !== id0 && place[k].c === c && place[k].r === r);
      iconPos = { ...place }; if (other) iconPos[other] = place[id0]; iconPos[id0] = { c, r };
    } else { // several: they move together by the same number of cells; icons in the way find free cells
      const dc = Math.round((b.offsetLeft - start.find(q => q.el === b).x) / CW), dr = Math.round((b.offsetTop - start.find(q => q.el === b).y) / CH);
      const minC = Math.min(...group.map(k => place[k].c)), minR = Math.min(...group.map(k => place[k].r)), maxR = Math.max(...group.map(k => place[k].r));
      const mc = Math.max(dc, -minC), mr = clamp(dr, -minR, rows - 1 - maxR);
      const moved = {}; for (const k of group) moved[k] = { c: place[k].c + mc, r: place[k].r + mr };
      const taken = new Set(Object.values(moved).map(q => q.c + "," + q.r));
      iconPos = {}; for (const k in place) if (!group.includes(k) && !taken.has(place[k].c + "," + place[k].r)) iconPos[k] = place[k];
      Object.assign(iconPos, moved);
    }
    saveIcons(); renderIcons(); sfx.tick();
    setIconSel(group);
    const nb = $("icons").querySelector(`[data-app="${CSS.escape(id0)}"]`); if (nb) nb.focus({ preventScroll: true });
  };
  addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
});
renderIcons();
$("icons").addEventListener("click", e => {
  const b = e.target.closest(".dicon"); if (!b || iconDragged) return;
  const id = b.dataset.app;
  if (e.ctrlKey || e.metaKey) { const s2 = new Set(selIcons); s2.has(id) ? s2.delete(id) : s2.add(id); setIconSel(s2); return; }
  if (e.shiftKey) { setIconSel([...selIcons, id]); return; }
  setIconSel([id]);
  if (e.detail >= 2 || matchMedia("(pointer: coarse)").matches) openApp(id);
});
// a box dragged on the empty desktop selects every icon it touches (Ctrl or Shift keeps what was selected)
desk.addEventListener("pointerdown", e => {
  if (e.button !== 0 || compact || (e.target !== desk && e.target !== $("icons") && e.target !== $("widgets"))) return;
  const keep = e.ctrlKey || e.metaKey || e.shiftKey ? new Set(selIcons) : new Set();
  const r0 = desk.getBoundingClientRect(), ox = e.clientX - r0.left + desk.scrollLeft, oy = e.clientY - r0.top + desk.scrollTop;
  let box = null;
  const move = ev => {
    const x = ev.clientX - r0.left + desk.scrollLeft, y = ev.clientY - r0.top + desk.scrollTop;
    if (!box) { if (Math.hypot(x - ox, y - oy) < 5) return; box = document.createElement("div"); box.className = "selbox"; desk.appendChild(box); document.body.classList.add("dragging"); }
    const L = Math.min(x, ox), T = Math.min(y, oy), Wd = Math.abs(x - ox), Ht = Math.abs(y - oy);
    Object.assign(box.style, { left: L + "px", top: T + "px", width: Wd + "px", height: Ht + "px" });
    const hit = new Set(keep);
    document.querySelectorAll(".dicon").forEach(el => { const l = el.offsetLeft, t = el.offsetTop; if (l < L + Wd && l + el.offsetWidth > L && t < T + Ht && t + el.offsetHeight > T) hit.add(el.dataset.app); });
    setIconSel(hit);
  };
  const up = () => {
    removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
    if (box) { box.remove(); document.body.classList.remove("dragging"); } else setIconSel(keep); // a plain click on the desktop clears it
  };
  addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
});
$("icons").addEventListener("keydown", e => {
  const b = e.target.closest(".dicon"); if (!b) return;
  if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); const ids = selIcons.has(b.dataset.app) && selIcons.size > 1 ? [...selIcons] : [b.dataset.app]; ids.forEach(id => openApp(id)); return; }
  if (e.key === "Escape") { setIconSel([]); return; }
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyA") { e.preventDefault(); setIconSel(deskApps().map(a => a.id)); return; }
  const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
  if (!d || e.ctrlKey || e.altKey) return;
  e.preventDefault();
  const place = layoutIcons(), p = place[b.dataset.app], best = Object.keys(place).filter(k => {
    const q = place[k]; return d[0] ? q.r === p.r && Math.sign(q.c - p.c) === d[0] : q.c === p.c && Math.sign(q.r - p.r) === d[1];
  }).sort((x, y) => Math.abs(place[x].c - p.c) + Math.abs(place[x].r - p.r) - Math.abs(place[y].c - p.c) - Math.abs(place[y].r - p.r))[0];
  if (best) { const nb = $("icons").querySelector(`[data-app="${CSS.escape(best)}"]`); setIconSel(e.shiftKey ? [...selIcons, best] : [best]); nb.focus(); }
});

// ---------- right-click menus ----------
function closeApp(appId) { const app = appById(appId); if (!app) return; if (app.native) closeNative(appId); else if (wins[appId]) closeFramed(appId); }
function snapTo(wid, zone) { const st = wins[wid]; if (!st || st.autoH) return; st.snap = zone; render(wid); sfx.snap(); saveLayout(); }
function windowMenu(wid, at) {
  const st = wins[wid], app = appById(st.appId), native = !!app.native, sec = wid.split(":")[1];
  const isMain = native && sec === app.native.main, panelToggle = native && (app.native.panels || {})[sec];
  const items = [{ text: "Minimise", run: () => minimiseGroup(st.appId) }];
  if (!st.autoH) {
    items.push({ text: st.snap ? "Restore" : "Maximise", run: () => toggleMax(wid) },
      { text: "Snap left", key: "Ctrl+Alt+←", run: () => snapTo(wid, "left") },
      { text: "Snap right", key: "Ctrl+Alt+→", run: () => snapTo(wid, "right") });
  }
  if (!compact) {
    const others = Array.from({ length: desks.n }, (_, i) => i).filter(i => i !== deskOf(st.appId));
    if (others.length || desks.n < DESK_MAX) items.push("-", ...others.map(i => ({ text: `Move to desktop ${i + 1}`, run: () => moveToDesk(st.appId, i) })), ...(desks.n < DESK_MAX ? [{ text: "Move to a new desktop", run: () => moveToDesk(st.appId, desks.n) }] : []));
  }
  items.push("-");
  if (native && !isMain && panelToggle) items.push({ text: "Close panel", run: () => { const t = document.getElementById(panelToggle); if (t && t.getAttribute("aria-pressed") === "true") t.click(); } });
  items.push({ text: native ? `Close ${app.name}` : "Close", danger: true, run: () => closeApp(st.appId) });
  popMenu(null, items, at);
}
addEventListener("contextmenu", e => {
  if (e.defaultPrevented) return; // an app already showed its own menu
  const at = { x: e.clientX, y: e.clientY };
  const icon = e.target.closest(".dicon"), task = e.target.closest(".task"), tb = e.target.closest(".owin > .titlebar");
  if (icon) {
    e.preventDefault(); const a = appById(icon.dataset.app);
    if (selIcons.has(a.id) && selIcons.size > 1) { // several selected: act on them all
      const ids = [...selIcons];
      popMenu(null, [{ text: `Open ${ids.length} apps`, key: "Enter", run: () => ids.forEach(id => openApp(id)) }, { text: `Remove ${ids.length} from desktop`, run: () => { const h = hiddenIcons(); ids.forEach(id => h.add(id)); setTheme({ deskHide: [...h] }); setIconSel([]); renderIcons(); } }], at);
    } else { setIconSel([a.id]); popMenu(null, [{ text: `Open ${a.name}`, key: "Enter", run: () => openApp(a.id) }, { text: "Remove from desktop", run: () => hideIcon(a.id) }, "-", { label: a.desc }], at); }
  } else if (task) {
    e.preventDefault(); const k = task.dataset.app, a = appById(k), anyMin = appWins(k).some(w => wins[w].min);
    popMenu(null, [
      { text: anyMin ? "Restore" : "Bring to front", run: () => restoreGroup(k) },
      { text: "Minimise", run: () => minimiseGroup(k) },
      "-",
      { text: `Close ${a.name}`, danger: true, run: () => closeApp(k) },
    ], at);
  } else if (tb && !e.target.closest("button")) {
    e.preventDefault(); windowMenu(tb.parentElement.dataset.wid, at);
  } else if (!e.target.closest(".owin, .taskbar, .pop, .startmenu, .traypop, .scrim, .notices, .switcher")) {
    e.preventDefault();
    popMenu(null, [
      { label: "Open" },
      ...APPS.map(a => ({ text: a.name, run: () => openApp(a.id) })),
      "-",
      { text: "Tidy windows", run: tidy },
      { text: "Arrange icons", run: arrangeIcons },
      ...(wallMode === "slideshow" ? [{ text: "Next wallpaper picture", run: () => wallPic.next() }] : []),
      "-", { label: "Add a widget" }, ...Object.entries(WIDGETS).filter(([k]) => !widgets.has(k) || k === "note").map(([k, n]) => ({ text: "+ " + n, run: () => widgets.add(k) })),
      { text: "Desktop and colour…", run: () => openApp("settings") },
      { text: "Keyboard shortcuts", key: "?", run: () => openApp("help") },
      { text: "Restart Neon OS", run: () => location.reload() },
    ], at);
  }
});

// ---------- wallpaper ----------
// orb: the orb idling (still when reduced motion is on). fog: the colour haze without the orb.
// plain: the desk colour. image: a picture chosen in Settings (kept in core/desk.js).
const wall = $("wall");
const HAZE = [{ x: 0.2, y: 0.15, r: 0.7, color: [42, 16, 80, 0.45] }, { x: 0.85, y: 0.85, r: 0.6, color: [61, 11, 58, 0.4] }];
const DESK = [7, 5, 12, 1];
const wglow = createGlow(wall, { background: { base: DESK, blobs: HAZE } }) || createGlow2D(wall, { background: { base: DESK, blobs: HAZE } });
wall.dataset.renderer = wglow.gl ? "webgl" : "2d";
let WW = 0, WH = 0, wallMode = "orb", wallUrl = null, wallRaf = 0, wallKey = "";
function buildSprite() { const hex = liveBall(); wglow.setColor([1, 3, 5].map(o => parseInt(hex.slice(o, o + 2), 16))); }
function sizeWall() { WW = innerWidth; WH = innerHeight; wglow.resize(WW, WH, Math.min(2, devicePixelRatio || 1)); }
// ---------- the desktop moves to the music ----------
// While Amp plays (or Live listens), Amp leaves the beat in window.neonOsBeat each frame. With "Move to the music"
// on (Settings → Desktop, on by default; never with Reduce motion), the orb wallpaper turns with the tempo, swells
// with the loudness and kicks with the bass, the haze breathes, and window titles and lit LEDs flash on each beat.
// the setting is looked up at most twice a second (this runs every frame), so a change anywhere lands within half a second
let reactOn = true, reactAt = -1e9;
function musicBeat() {
  const B = window.neonOsBeat, now = performance.now();
  if (now - reactAt > 500) { reactAt = now; const t = getTheme(); reactOn = t.react !== false && !calmOn(t); }
  return B && B.playing && now - B.at < 300 && reactOn ? B : null;
}
let lastBeatI = null, beatRaf = 0, beatOffT = 0;
function beatTick() {
  beatRaf = 0; const B = musicBeat();
  document.body.classList.toggle("music", !!B);
  if (!B) { lastBeatI = null; return; }
  const bi = Math.floor(B.bp);
  if (lastBeatI !== null && bi !== lastBeatI) { document.body.classList.add("onbeat"); if ((bi % 4 + 4) % 4 === 0) document.body.classList.add("downbeat"); clearTimeout(beatOffT); beatOffT = setTimeout(() => document.body.classList.remove("onbeat", "downbeat"), 90); }
  lastBeatI = bi;
  if (!document.hidden) beatRaf = requestAnimationFrame(beatTick);
}
function startBeat() { if (!beatRaf) beatRaf = requestAnimationFrame(beatTick); if (wallMoves() && !wallRaf) startWall(); }
addEventListener("neonos:nowplaying", e => { if (e.detail && e.detail.state === "playing") setTimeout(startBeat, 120); });
const wallMoves = () => (wallMode === "orb" && !calmOn()) || (wallMode === "fog" && !!musicBeat());
let wallPhase = 0, wallLast = 0, kickS = 0, loudS = 0;
function drawWall(now) {
  wallRaf = 0;
  const t = now / 1000, dt = Math.min(0.05, wallLast ? (now - wallLast) / 1000 : 0); wallLast = now;
  const B = musicBeat();
  // smoothed so the orb eases in and out of the music instead of jumping
  kickS += ((B ? B.kick : 0) - kickS) * Math.min(1, dt * 14); loudS += ((B ? B.loud : 0) - loudS) * Math.min(1, dt * 4);
  wallPhase += dt * (0.15 + (B && B.bpm ? (B.bpm / 60) * Math.PI * 2 / 32 : 0));
  wglow.setBackground(wallMode === "image" || wallMode === "slideshow" ? null : { base: DESK, blobs: wallMode === "plain" ? [] : HAZE });
  wglow.begin(wallMoves() ? t : 0, loudS);
  if (wallMode === "orb") {
    const cx = WW / 2, cy = (WH - TASKBAR) / 2, R = Math.min(WW, WH) * 0.2 * (0.94 + 0.3 * loudS), n = 12;
    for (let i = 0; i < n; i++) {
      const a = wallPhase + i * Math.PI * 2 / n, wob = 1 + 0.06 * Math.sin(t * 0.6 + i * 1.7);
      const x = Math.cos(a) * R * wob, y = Math.sin(a) * R * wob * 0.42, z = Math.sin(a);
      const s = (34 + 10 * Math.sin(t * 0.8 + i)) * (0.75 + 0.25 * z) * (1 + 0.9 * kickS);
      wglow.dot(cx + x, cy + y, s * 4, (0.18 + 0.12 * (z + 1) / 2) * (wglow.gl ? 1.3 : 1) * (1 + 0.8 * loudS));
    }
  }
  wglow.end();
  if (wallMoves() && !document.hidden) wallRaf = requestAnimationFrame(drawWall); else wallLast = 0;
}
function startWall() { cancelAnimationFrame(wallRaf); wallRaf = requestAnimationFrame(drawWall); }
// a picture wallpaper (one picture, or a slideshow from Photos) sits behind the (clear) canvas and follows the
// window's size (os/wallpic.js). Fit (the default) shows the whole picture with a soft blurred copy filling the
// edges; Fill crops to cover; Stretch; Centre at its own size.
let emptyTold = "";
const wallPic = createWallPic($("wallPic"), { onEmpty: locked => {
  wallMode = "fog"; startWall();
  const why = locked.length ? `${locked.join(", ")} need${locked.length === 1 ? "s" : ""} permission again: open Photos and press Reconnect.` : "There are no pictures in Photos for it yet.";
  if (emptyTold !== why) { emptyTold = why; addNotice({ title: "Wallpaper slideshow is waiting", text: why, app: "photos" }); }
} });
const wallKeyOf = t => `${t.wall}|${t.wallStamp}|${t.slideSrc}|${t.slideEvery}|${t.slideOrder}`;
function showWallPic(t = getTheme()) { if (wallMode === "image" || wallMode === "slideshow") wallPic.setFit(t.wallFit, wallMode === "slideshow" && t.slideZoom && !calmOn(t), t.slideEvery); }
async function loadWall() {
  const t = getTheme();
  wallKey = wallKeyOf(t);
  wallMode = ["orb", "fog", "plain", "image", "slideshow"].includes(t.wall) ? t.wall : "orb";
  if (wallMode === "image") { // the picture is behind the canvas; the canvas stays clear over it
    const blob = await getWallImage();
    if (blob) { wallUrl = URL.createObjectURL(blob); await wallPic.single(wallUrl, t); } else { wallMode = "fog"; wallPic.hide(); }
  } else if (wallMode === "slideshow") { if (!(await wallPic.slideshow(t))) wallMode = "fog"; }
  else wallPic.hide();
  showWallPic(t);
  startWall();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && wallMoves()) startWall(); });

// ---------- welcome and what's new ----------
// First visit: a short welcome. After an update: one "What's new" notice that opens About.
const VKEY = "neon-os:seen-version";
function greet(firstVisit) {
  let seen = null; try { seen = localStorage.getItem(VKEY); localStorage.setItem(VKEY, VERSION); } catch (e) {}
  if (!seen && firstVisit) showWelcome();
  else if (seen !== VERSION && CHANGES[0]) addNotice({ title: `What's new in Neon OS ${VERSION}`, text: CHANGES[0].items.slice(0, 3).join(". ") + ". Open About for the rest.", app: "about" });
}
function showWelcome() {
  if (document.querySelector(".welcome")) return;
  const scrim = document.createElement("div"); scrim.className = "scrim";
  scrim.innerHTML = `<div class="win dialog lit welcome" role="dialog" aria-modal="true" aria-labelledby="wlT">
    <div class="titlebar"><span class="ttl" id="wlT">Welcome to Neon OS</span></div>
    <div class="wbody">
      <div class="lcd whero"><i aria-hidden="true"></i><b>NEON OS</b></div>
      <p>A desktop of music apps that runs in your browser. Everything you add stays on this device.</p>
      <ul>
        <li><b>Open apps</b> from the Neon button or the desktop. Drag a window to an edge to snap it.</li>
        <li><b>Add your music</b> in Amp: Folders, then Link a music folder plays it straight from your disk (Chrome or Edge), or Add files copies songs in.</li>
        <li><b>Find anything</b> with Ctrl+Space, and press ? for every keyboard shortcut.</li>
        <li><b>Settings</b> has colours, the wallpaper, backups, and Install, to use Neon OS like an app, even offline.</li>
      </ul>
      <div class="acts"><button type="button" class="btn" data-x>Look around</button><button type="button" class="btn" data-amp>Open Amp</button></div>
    </div></div>`;
  const prev = document.activeElement;
  const close = () => { scrim.remove(); document.removeEventListener("keydown", onKey, true); if (prev && prev.focus) prev.focus(); };
  const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  scrim.addEventListener("mousedown", e => { if (e.target === scrim) close(); });
  scrim.querySelector("[data-x]").addEventListener("click", close);
  scrim.querySelector("[data-amp]").addEventListener("click", () => { close(); openApp("amp"); });
  document.body.appendChild(scrim);
  scrim.querySelector("[data-amp]").focus();
}

// ---------- installing and working offline ----------
// The service worker (sw.js) keeps a copy of every file, so Neon OS opens with no connection.
// Browsers that can install it as an app offer it through the start menu and Settings.
let installEvt = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; });
addEventListener("appinstalled", () => { installEvt = null; addNotice({ title: "Neon OS installed", text: "Open it from your apps like any other program. It has its own window and works offline." }); });
const isInstalled = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const installState = () => ({ can: !!installEvt, installed: isInstalled() });
async function promptInstall() {
  if (!installEvt) return false;
  const ev = installEvt; installEvt = null;
  try { ev.prompt(); return (await ev.userChoice).outcome === "accepted"; } catch (e) { return false; }
}
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).then(() => {
    let told = false; try { told = localStorage.getItem("neon-os:offline") === "1"; localStorage.setItem("neon-os:offline", "1"); } catch (e) {}
    if (!told) addNotice({ title: "Ready to work offline", text: "Neon OS and its apps now open with no connection. Your music was already stored in this browser." });
  }).catch(() => {});
}

// ---------- search everywhere ----------
// Settings sections open scrolled into view; Amp's folder actions open its Folders menu.
async function openSettingsAt(section) {
  await openApp("settings");
  const fr = els.settings && els.settings.querySelector("iframe"); if (!fr) return;
  const go = () => fr.contentWindow.postMessage({ neonOsGoto: section }, location.origin);
  if (fr.contentDocument && fr.contentDocument.readyState === "complete" && fr.contentDocument.getElementById(section)) go(); else fr.addEventListener("load", () => setTimeout(go, 300), { once: true });
}
async function ampFolders() { await openApp("amp"); setTimeout(() => dispatchEvent(new CustomEvent("neonos:folders")), 300); }
initSearch({
  apps: APPS,
  openApp: id => openApp(id),
  play: async ids => { if (!ids.length) return; await openApp("amp"); dispatchEvent(new CustomEvent("neonos:play", { detail: { ids } })); },
  actions: [
    { title: "Change the orb colour", sub: "Settings", words: ["colour", "color", "theme", "orb"], run: () => openSettingsAt("colLbl") },
    { title: "Wallpaper and desktop icons", sub: "Settings", words: ["background", "picture", "desktop", "icons"], run: () => openSettingsAt("dkLbl") },
    { title: "Link a music folder", sub: "Amp: Folders", words: ["add music", "import", "folder", "songs"], run: ampFolders },
    { title: "Sync the library between computers", sub: "Amp: Folders", words: ["sync", "other computer", "google drive", "dropbox", "onedrive"], run: ampFolders },
    { title: "Free up space", sub: "Amp: Folders", words: ["storage", "space", "copies"], run: ampFolders },
    { title: "Back up everything", sub: "Settings", words: ["backup", "export", "save"], run: () => openSettingsAt("bkLbl") },
    { title: "Restore a backup", sub: "Settings", words: ["restore", "import backup"], run: () => openSettingsAt("bkLbl") },
    { title: "Storage and install", sub: "Settings", words: ["protect", "install", "offline", "storage"], run: () => openSettingsAt("stLbl") },
    { title: "High contrast", sub: "Turn on or off", words: ["accessibility", "contrast", "see"], run: () => setTheme({ contrast: !getTheme().contrast }) },
    { title: "Reduce motion", sub: "Turn on or off", words: ["accessibility", "motion", "animation", "calm"], run: () => setTheme({ calm: !calmOn() }) },
    { title: "Keyboard shortcuts", sub: "Shortcuts", words: ["keys", "help", "shortcut"], run: () => openApp("help") },
    { title: "Tidy windows", sub: "Put windows back in neat places", words: ["arrange", "layout", "windows"], run: () => tidy() },
    { title: "Show the desktop", sub: "Ctrl+Alt+D", words: ["minimise all", "hide windows"], run: () => showDesktop() },
    { title: "Notifications", sub: "Ctrl+Alt+N", words: ["notices", "alerts", "bell"], run: () => toggleNotices() },
    { title: "Show the welcome", sub: "The first-visit guide", words: ["welcome", "help", "start", "guide"], run: () => showWelcome() },
    { title: "Set an alarm", sub: "Clock", words: ["alarm", "wake", "ring"], run: () => openApp("clock") },
    { title: "Start a timer", sub: "Clock", words: ["timer", "countdown", "stopwatch"], run: () => openApp("clock") },
    { title: "Add an event", sub: "Calendar", words: ["event", "reminder", "appointment", "date"], run: () => openApp("calendar") },
    { title: "Tempo and note lengths", sub: "Calculator", words: ["bpm", "delay time", "ms", "tap tempo"], run: () => openApp("calculator") },
    { title: "Set a picture as the wallpaper", sub: "Photos", words: ["wallpaper", "background", "picture", "photo"], run: () => openApp("photos") },
    { title: "Browse the web", sub: "Browser", words: ["internet", "web", "website", "browser", "google", "search the web"], run: () => openApp("browser") },
    { title: "Watch a video", sub: "Video", words: ["video", "movie", "film", "mp4", "player", "subtitles"], run: () => openApp("video") },
    { title: "Edit a picture", sub: "Photos", words: ["crop", "rotate", "edit photo", "filter", "photo editor"], run: () => openApp("photos") },
    { title: "Put back something deleted", sub: "Bin", words: ["undelete", "restore", "trash", "recycle", "deleted"], run: () => openApp("bin") },
    { title: "Close a stuck app", sub: "System monitor", words: ["task manager", "frozen", "not responding", "memory", "kill"], run: () => openApp("monitor") },
    { title: "Lock the screen", sub: "Ctrl+Alt+L", words: ["lock", "away", "pin", "password"], run: () => doAction("lock") },
    { title: "Screensaver and PIN", sub: "Settings", words: ["screensaver", "idle", "pin", "lock screen"], run: () => openSettingsAt("lkLbl") },
    { title: "Add a desktop", sub: "Several desktops · Ctrl+Alt+[ / ]", words: ["desktop", "workspace", "virtual desktop", "space"], run: () => addDesk() },
    { title: "Restart Neon OS", sub: "Reload the desktop", words: ["reload", "restart", "refresh"], run: () => location.reload() },
  ],
});

// ---------- installed app: title bar strip, shortcuts, files opened from the computer ----------
// With the window-controls overlay (the installed app's title bar folded into the page), a thin strip at the
// top carries the name and Search and lets the window be dragged; the desktop starts below it.
function syncWco() {
  const o = navigator.windowControlsOverlay, on = !!(o && o.visible);
  wcoTop = on ? Math.round(o.getTitlebarAreaRect().height) || 32 : 0;
  document.body.classList.toggle("wco", on);
  document.documentElement.style.setProperty("--wco-top", wcoTop + "px");
  for (const k in wins) render(k);
}
if (navigator.windowControlsOverlay) navigator.windowControlsOverlay.addEventListener("geometrychange", syncWco);
{
  const strip = document.createElement("div"); strip.className = "wcobar"; strip.setAttribute("aria-hidden", "true");
  strip.innerHTML = `<i></i><b>NEON OS</b><button class="wco-search" title="Search (Ctrl+K)">Search</button>`;
  strip.querySelector("button").addEventListener("click", () => openSearch());
  document.body.appendChild(strip);
}
// songs opened from the computer: double-clicked or "Open with Neon OS" in the file explorer (installed app),
// or handed over by the desktop app. Amp plays them, adding any that aren't in the library yet.
// music goes to Amp, videos to Video (handed over once Video says it's ready)
const isVideo = f => /^video\//.test(f.type || "") || /\.(mp4|m4v|webm|mkv|mov|ogv|avi)$/i.test(f.name || "");
const appReady = new Set(), forApp = {};
function sendTo(appId, msg) {
  const fr = els[appId] && els[appId].querySelector("iframe");
  if (fr && appReady.has(appId)) fr.contentWindow.postMessage(msg, location.origin); else (forApp[appId] = forApp[appId] || []).push(msg);
}
async function openFiles(files) {
  files = files.filter(Boolean); if (!files.length) return;
  const videos = files.filter(isVideo), songs = files.filter(f => !isVideo(f));
  if (videos.length) { await openApp("video"); sendTo("video", { neonOsVideos: videos }); }
  if (songs.length) { await openApp("amp"); setTimeout(() => dispatchEvent(new CustomEvent("neonos:open-files", { detail: { files: songs } })), 300); }
}
if ("launchQueue" in window) launchQueue.setConsumer(async params => {
  if (params.files && params.files.length) openFiles(await Promise.all(params.files.map(h => h.getFile().catch(() => null))));
});
// from the desktop app: songs arrive as their bytes, videos as a link the app serves (they can be huge)
if (window.neonOsDesktop) window.neonOsDesktop.onOpenFiles(list => openFiles(list.map(f => f.url ? { name: f.name, type: f.type || "", size: f.size || 0, url: f.url } : new File([f.data], f.name, { type: f.type || "" }))));
// the Browser app in the desktop app: where each tab got to, and links that open new windows (as Browser tabs)
if (window.neonOsDesktop && window.neonOsDesktop.onFrameNav) {
  window.neonOsDesktop.onFrameNav(d => { const fr = els.browser && els.browser.querySelector("iframe"); if (fr) fr.contentWindow.postMessage({ neonOsFrameNav: d }, location.origin); });
  window.neonOsDesktop.onOpenUrl(async url => { await openApp("browser"); sendTo("browser", { neonOsBrowserOpen: url }); });
}
// desktop app updates (desktop/updater.js): new files are downloaded in the background; restarting uses them
if (window.neonOsDesktop && window.neonOsDesktop.onUpdate) {
  let told = "";
  window.neonOsDesktop.onUpdate(u => {
    if (u.kind === "files") {
      $("updBtn").hidden = false;
      if (told !== u.version) { told = u.version; addNotice({ title: "Neon OS update ready", text: "Restart Neon OS to use it: the button by the bell, or About.", app: "about" }); }
    } else if (u.kind === "app") addNotice({ title: `Desktop app ${u.version} is out`, text: "Open About to download it. Neon OS keeps updating itself meanwhile.", app: "about" });
  });
  window.neonOsDesktop.updateInfo().then(i => { if (i && i.ready) $("updBtn").hidden = false; }).catch(() => {});
  $("updBtn").addEventListener("click", () => { saveLayout(); setTimeout(() => window.neonOsDesktop.restart(), 350); });
}
// shortcuts on the installed app's icon: ?open=amp, ?search=1
function launchShortcut() {
  const q = new URLSearchParams(location.search), open = q.get("open");
  // coming back from allowing Neon OS on Last.fm (Settings → Scrobbling): swap the token for a lasting session
  if (q.get("token") && (() => { try { return localStorage.getItem("neon-os:lfm-pending"); } catch (e) { return null; } })()) {
    try { localStorage.removeItem("neon-os:lfm-pending"); } catch (e) {}
    import("../core/scrobble.js").then(m => m.lastfmSession(q.get("token"))).then(user => addNotice({ title: "Scrobbling to Last.fm", text: `Connected as ${user}. Songs you play in Amp now show on your profile.`, app: "settings" }))
      .catch(err => addNotice({ title: "Last.fm didn't connect", text: String(err && err.message || err) + ". Check the API key and secret in Settings and try again.", app: "settings" }));
    history.replaceState(null, "", location.pathname);
  }
  if (open && appById(open)) openApp(open);
  if (q.has("search")) setTimeout(openSearch, 200);
  if (open || q.has("search")) history.replaceState(null, "", location.pathname);
}

// ---------- alarms, timers and calendar reminders (core/reminders.js) ----------
// Checked every second here, so they go off with Clock and Calendar closed. In the background, a system
// notification too (if allowed in Clock).
setInterval(() => {
  for (const d of dueNow()) {
    addNotice({ title: d.title, text: d.text, app: d.app });
    if (d.music) cueMusic(d.music, { fadeIn: d.kind === "alarm" ? 30 : 0 }); else if (!d.quiet) sfx.alarm(); // wake up to music instead of the bleep
    if (d.sleep) sleepFade(30);
    if (document.hidden && "Notification" in window && Notification.permission === "granted") { try { new Notification(d.title, { body: d.text, icon: "icons/icon-192.png" }); } catch (e) {} }
  }
}, 1000);
// things in the Bin for over 30 days go for good: checked at start and every few hours
binPurge().catch(() => {}); setInterval(() => binPurge().catch(() => {}), 4 * 3600e3);

// ---------- start ----------
setCompact(); syncWco();
initNotices({ bellBtn: $("bellBtn"), stackEl: $("notices"), nameOf: id => (appById(id) || { name: id }).name, openApp: id => appById(id) && openApp(id) });
// quick settings (the clock) and desktop widgets
createQuick($("clock"), {
  music: { get: () => musicVol, set: v => { musicVol = v; dispatchEvent(new CustomEvent("neonos:volume", { detail: v })); renderVolIcon(); } },
  quiet: { get: isQuiet, set: setQuiet }, lock: () => doAction("lock"), wallNext: () => wallPic.next(), slideshow: () => wallMode === "slideshow",
  openApp: id => openApp(id), showDesktop: () => showDesktop(), sfx,
});
const widgets = initWidgets({ layer: $("widgets"), nowPlaying: () => mounted.has("amp") && !closed.has("amp") ? nowPlaying : null, transport, openApp: id => openApp(id), tasks: () => taskList().length });
lockApi = initLock({ nowPlaying: () => mounted.has("amp") && !closed.has("amp") ? nowPlaying : null, transport, sfx, onChange: m => { if (m) { closeMenu(); closeTray(); closeNotices(); closeSearch(); } } });
applyTheme();
onTheme(t => {
  reactAt = -1e9;
  applyTheme(t); buildSprite();
  if (wallKeyOf(t) !== wallKey) loadWall(); else { showWallPic(t); startWall(); }
  startBeat();
  if (JSON.stringify([...hiddenIcons()]) + iconRows() !== iconsKey) renderIcons();
});
buildSprite(); sizeWall(); loadWall();
(async () => {
  await runBoot();
  const saved = loadLayout();
  if (!saved) { greet(true); launchShortcut(); return; } // first visit: just the desktop (and the welcome)
  const sw = saved.wins;
  if (saved.split) split = { x: clamp(+saved.split.x || 0.5, 0.15, 0.85), y: clamp(+saved.split.y || 0.5, 0.15, 0.85) };
  const wasClosed = new Set(saved.closed || []);
  if (saved.desks) { const n = clamp(+saved.desks.n || 1, 1, DESK_MAX); desks = { n, cur: clamp(+saved.desks.cur || 0, 0, n - 1), of: saved.desks.of || {} }; }
  parked = sw;
  const apps = [...new Set(Object.values(sw).map(w => w.appId).filter(appById))];
  apps.sort((a, b) => Math.max(...Object.values(sw).filter(w => w.appId === a).map(w => w.z)) - Math.max(...Object.values(sw).filter(w => w.appId === b).map(w => w.z)));
  for (const id of apps) {
    if (wasClosed.has(id)) { closed.add(id); continue; } // reopens later in the same place
    const app = appById(id);
    await openApp(id, sw);
    appWins(id).forEach(k => { if (sw[k]) { wins[k].min = sw[k].min; keepInView(wins[k], els[k]); render(k); } });
  }
  const f = front(); if (f) focus(f);
  renderTasks(); saveLayout();
  greet(false); launchShortcut();
})();
