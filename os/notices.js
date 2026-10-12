// Neon OS shell: notifications
// Apps send notices (core/notify.js). Each one pops up briefly above the tray and is kept in the bell's list
// (the last 30, saved in this browser). Quiet keeps them in the list without popping up.
import { esc } from "../style-kit/ui.js";
import { sfx } from "../core/sounds.js";

const KEY = "neon-os:notices", MAX = 30, SHOW_MS = 6000;
const BELL = "M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5a6 6 0 0 0-5-5.9V4a1 1 0 0 0-2 0v1.1A6 6 0 0 0 6 11v5l-2 2v1h16v-1z";
const BELL_OFF = "M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5a6 6 0 0 0-5-5.9V4a1 1 0 0 0-2 0v1.1c-.9.2-1.8.6-2.5 1.2L18 16zM3.3 3.3 2 4.6l4.2 4.2A6 6 0 0 0 6 11v5l-2 2v1h13.4l2 2 1.3-1.3z";
const X = "M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z";
const svg = d => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

let state = { list: [], quiet: false };
try { const s = JSON.parse(localStorage.getItem(KEY) || "{}"); if (Array.isArray(s.list)) state = { list: s.list.slice(0, MAX), quiet: !!s.quiet }; } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };

let bell, stack, appName = id => id, openAppFn = () => {}, pop = null;

function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}
function renderBell() {
  const unread = state.list.filter(n => !n.read).length;
  bell.innerHTML = svg(state.quiet ? BELL_OFF : BELL) + (unread ? `<b class="badge">${unread > 9 ? "9+" : unread}</b>` : "");
  bell.setAttribute("aria-label", `Notifications${unread ? `, ${unread} new` : ""}${state.quiet ? ", quiet" : ""}`);
  bell.title = bell.getAttribute("aria-label");
}

// a notice pops up above the tray, then slides away; hovering keeps it
function popUp(n) {
  const card = document.createElement("div");
  card.className = "win lit notice"; card.dataset.id = n.id;
  card.innerHTML = `<div class="titlebar"><span class="ttl">${esc(n.app ? appName(n.app) : "Neon OS")}</span><span class="tbtns"><button class="tbtn" aria-label="Dismiss">${svg(X)}</button></span></div>
    <div class="wbody"><b>${esc(n.title)}</b>${n.text ? `<span>${esc(n.text)}</span>` : ""}</div>`;
  stack.prepend(card);
  while (stack.children.length > 3) stack.lastChild.remove();
  let timer = null;
  const go = () => { card.classList.add("out"); setTimeout(() => card.remove(), 250); };
  const arm = () => { clearTimeout(timer); timer = setTimeout(go, SHOW_MS); };
  card.addEventListener("pointerenter", () => clearTimeout(timer));
  card.addEventListener("pointerleave", arm);
  card.querySelector("button").addEventListener("click", e => { e.stopPropagation(); go(); });
  card.addEventListener("click", () => { n.read = true; save(); renderBell(); go(); if (n.app) openAppFn(n.app); });
  arm();
}

export function addNotice({ title, text = "", app = "" }) {
  if (!title) return;
  const n = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: String(title).slice(0, 120), text: String(text).slice(0, 400), app, t: Date.now(), read: false };
  state.list.unshift(n); state.list.length = Math.min(state.list.length, MAX); save();
  if (pop) { n.read = true; renderList(); } else if (!state.quiet) { popUp(n); sfx.chime(); }
  renderBell();
}

function renderList() {
  if (!pop) return;
  const body = pop.querySelector(".nlist");
  body.innerHTML = state.list.length ? state.list.map(n => `<button class="nitem" data-id="${esc(n.id)}"${n.app ? "" : " disabled"}>
      <span class="nhead"><b>${esc(n.title)}</b><small>${esc(n.app ? appName(n.app) : "Neon OS")} · ${ago(n.t)}</small></span>${n.text ? `<span class="ntext">${esc(n.text)}</span>` : ""}</button>`).join("")
    : `<p class="nempty">No notifications.</p>`;
  pop.querySelector("#nQuiet").setAttribute("aria-pressed", String(state.quiet));
}
export function closeNotices() { if (!pop) return; pop.remove(); pop = null; bell.setAttribute("aria-expanded", "false"); }
export function openNotices() {
  if (pop) return;
  pop = document.createElement("div");
  pop.className = "win lit traypop npop"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Notifications");
  pop.innerHTML = `<div class="titlebar"><span class="ttl">Notifications</span></div><div class="wbody">
    <div class="nlist"></div>
    <div class="nbar"><button class="btn" id="nQuiet" aria-pressed="false" title="Keep notices in this list without popping up"><i class="led"></i>Quiet</button><button class="btn" id="nClear">Clear all</button></div></div>`;
  document.body.appendChild(pop);
  stack.innerHTML = "";
  state.list.forEach(n => { n.read = true; }); save(); renderBell(); renderList();
  bell.setAttribute("aria-expanded", "true");
  pop.querySelector("#nQuiet").addEventListener("click", () => { state.quiet = !state.quiet; save(); renderList(); renderBell(); });
  pop.querySelector("#nClear").addEventListener("click", () => { state.list = []; save(); renderList(); renderBell(); });
  pop.querySelector(".nlist").addEventListener("click", e => {
    const b = e.target.closest(".nitem"); if (!b) return;
    const n = state.list.find(x => x.id === b.dataset.id);
    if (n && n.app) { closeNotices(); openAppFn(n.app); }
  });
  (pop.querySelector(".nitem:not([disabled])") || pop.querySelector("#nQuiet")).focus();
}
export const toggleNotices = () => pop ? closeNotices() : openNotices();

export function initNotices({ bellBtn, stackEl, nameOf, openApp }) {
  bell = bellBtn; stack = stackEl; appName = nameOf; openAppFn = openApp;
  renderBell();
  bell.addEventListener("click", e => { e.stopPropagation(); toggleNotices(); });
  document.addEventListener("pointerdown", e => { if (pop && !pop.contains(e.target) && !e.target.closest("#bellBtn")) closeNotices(); });
  document.addEventListener("keydown", e => { if (pop && e.key === "Escape") { closeNotices(); bell.focus(); } });
  // from the desktop's own apps (Amp) and from framed apps
  addEventListener("neonos:notify", e => addNotice(e.detail || {}));
  addEventListener("message", e => { if (e.origin === location.origin && e.data && e.data.neonOs === "notify") addNotice(e.data); });
}
