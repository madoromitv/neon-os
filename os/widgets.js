// Neon OS shell: desktop widgets
// Small panels that sit on the desktop under the windows: a clock, what's playing, the month and what's coming up,
// a note, and the system. Add them from the desktop's right-click menu; drag one by its top to move it, X removes it.
// Where they are is remembered.
import { esc } from "../style-kit/ui.js";
import { loadCalendar, dayKey, CAL_KEY } from "../core/reminders.js";
import { loadNotebook, noteTitle, NB_KEY } from "../core/notebook.js";

const KEY = "neon-os:widgets";
export const WIDGETS = { clock: "Clock", music: "Now playing", calendar: "Calendar", note: "Note", system: "System" };
const W = { clock: 220, music: 280, calendar: 250, note: 240, system: 230 };

// ctx: { layer (element), nowPlaying(), transport(act), openApp(id), tasks() → number of open apps }
export function initWidgets(ctx) {
  let list = []; try { list = JSON.parse(localStorage.getItem(KEY) || "[]") || []; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} };
  const els = new Map();
  const MP = { prev: "M6 6h2v12H6zm3.5 6 8.5 6V6z", next: "M16 6h2v12h-2zM6 18l8.5-6L6 6z", play: "M8 5v14l11-7z", pause: "M6 5h4v14H6zm8 0h4v14h-4z" };
  const ic = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

  function body(w) {
    const d = new Date(), pad = n => String(n).padStart(2, "0");
    if (w.type === "clock") return `<div class="wg-time">${pad(d.getHours())}:${pad(d.getMinutes())}<small>${pad(d.getSeconds())}</small></div><div class="wg-sub">${esc(d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }))}</div>`;
    if (w.type === "music") {
      const np = ctx.nowPlaying();
      if (!np) return `<button class="wg-empty" data-go="amp">Nothing playing. Open Amp</button>`;
      const playing = np.state === "playing" || np.state === "loading";
      return `<div class="wg-song"><b>${esc(np.title || "")}</b><small>${esc(np.artist || "")}</small></div><div class="wg-ctl"><button class="btn icon" data-t="prev" aria-label="Previous">${ic(MP.prev)}</button><button class="btn icon" data-t="toggle" aria-label="${playing ? "Pause" : "Play"}">${ic(playing ? MP.pause : MP.play)}</button><button class="btn icon" data-t="next" aria-label="Next">${ic(MP.next)}</button></div>`;
    }
    if (w.type === "calendar") {
      const first = new Date(d.getFullYear(), d.getMonth(), 1), start = (first.getDay() + 6) % 7, days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const evs = loadCalendar().events, has = new Set(evs.map(e => e.date)), today = dayKey(d);
      let g = ["M", "T", "W", "T", "F", "S", "S"].map(x => `<i>${x}</i>`).join("") + "<span></span>".repeat(start);
      for (let i = 1; i <= days; i++) { const k = dayKey(new Date(d.getFullYear(), d.getMonth(), i)); g += `<span class="${k === today ? "on" : ""}${has.has(k) ? " ev" : ""}">${i}</span>`; }
      const next = evs.filter(e => e.date >= today).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""))).slice(0, 3);
      return `<div class="wg-month">${esc(d.toLocaleDateString(undefined, { month: "long", year: "numeric" }))}</div><div class="wg-cal">${g}</div>${next.map(e => `<div class="wg-ev"><b>${esc(e.date === today ? (e.time || "Today") : new Date(e.date + "T00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" }))}</b> ${esc(e.title)}</div>`).join("") || `<div class="wg-sub">Nothing coming up</div>`}`;
    }
    if (w.type === "note") {
      const nb = loadNotebook(), n = nb.notes.find(x => x.id === w.note) || nb.notes.slice().sort((a, b) => b.updated - a.updated)[0];
      if (!n) return `<button class="wg-empty" data-go="notes">No notes yet. Open Notes</button>`;
      return `<div class="wg-note"><b>${esc(noteTitle(n))}</b>${esc(n.text.split("\n").slice(1).join("\n").trim().slice(0, 400))}</div>`;
    }
    if (w.type === "system") {
      const m = performance.memory, apps = ctx.tasks();
      return `<div class="wg-stat"><span>Open apps</span><b>${apps}</b></div>${m ? `<div class="wg-stat"><span>Memory</span><b>${Math.round(m.usedJSHeapSize / 1e6)} MB</b></div>` : ""}<div class="wg-stat"><span>Storage</span><b data-sto>…</b></div><div class="wg-stat"><span>Up for</span><b>${uptime()}</b></div>`;
    }
    return "";
  }
  const born = Date.now(), uptime = () => { const m = Math.floor((Date.now() - born) / 60000); return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60) + " m"; };
  let stoText = "…";
  const refreshStorage = () => navigator.storage && navigator.storage.estimate && navigator.storage.estimate().then(e => { const g = e.usage / 1e9; stoText = g >= 1 ? g.toFixed(1) + " GB" : Math.round(e.usage / 1e6) + " MB"; }).catch(() => {});
  refreshStorage(); setInterval(refreshStorage, 60000);

  function paint(w) { const el = els.get(w.id); if (!el) return; el.querySelector(".wg-body").innerHTML = body(w); const s = el.querySelector("[data-sto]"); if (s) s.textContent = stoText; }
  function make(w) {
    const el = document.createElement("section"); el.className = "widget"; el.dataset.type = w.type; el.setAttribute("aria-label", WIDGETS[w.type] + " widget");
    el.style.cssText = `left:${w.x}px;top:${w.y}px;width:${W[w.type]}px`;
    el.innerHTML = `<div class="wg-head"><span>${WIDGETS[w.type]}</span><button class="wg-x" aria-label="Remove this widget" title="Remove">✕</button></div><div class="wg-body"></div>`;
    ctx.layer.appendChild(el); els.set(w.id, el); paint(w);
    el.querySelector(".wg-x").addEventListener("click", () => remove(w.id));
    el.querySelector(".wg-head").addEventListener("pointerdown", e => {
      if (e.button !== 0 || e.target.closest("button")) return;
      e.preventDefault(); const sx = e.clientX, sy = e.clientY, x0 = w.x, y0 = w.y; el.classList.add("lifting");
      const mv = ev => { w.x = Math.max(0, Math.round((x0 + ev.clientX - sx) / 8) * 8); w.y = Math.max(0, Math.round((y0 + ev.clientY - sy) / 8) * 8); el.style.left = w.x + "px"; el.style.top = w.y + "px"; };
      const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); el.classList.remove("lifting"); save(); };
      addEventListener("pointermove", mv); addEventListener("pointerup", up);
    });
    el.addEventListener("click", e => {
      const t = e.target.closest("[data-t]"); if (t) { ctx.transport(t.dataset.t); setTimeout(() => paint(w), 300); return; }
      const g = e.target.closest("[data-go]"); if (g) { ctx.openApp(g.dataset.go); return; }
      if (e.target.closest(".wg-body") && { calendar: 1, note: 1, clock: 1, system: 1 }[w.type]) ctx.openApp({ calendar: "calendar", note: "notes", clock: "clock", system: "monitor" }[w.type]);
    });
  }
  function remove(id) { const el = els.get(id); if (el) el.remove(); els.delete(id); list = list.filter(w => w.id !== id); save(); }
  function add(type) {
    // the first free spot down the right-hand side (then the next column in), clear of the other widgets
    const H = ctx.layer.clientHeight, rects = list.map(w => { const el = els.get(w.id); return el ? { x: w.x, y: w.y, w: el.offsetWidth, h: el.offsetHeight } : null; }).filter(Boolean);
    let x = Math.max(16, ctx.layer.clientWidth - W[type] - 24), y = 16;
    for (let tries = 0; tries < 200; tries++) {
      const hit = rects.find(r => x < r.x + r.w + 8 && r.x < x + W[type] + 8 && y < r.y + r.h + 8 && r.y < y + 120);
      if (!hit) break;
      y = hit.y + hit.h + 12;
      if (y > H - 140) { y = 16; x = Math.max(16, x - W[type] - 16); }
    }
    const w = { id: "w" + Date.now().toString(36), type, x, y }; list.push(w); save(); make(w);
  }
  list.forEach(make);
  setInterval(() => list.forEach(w => { if (w.type === "clock" || w.type === "system") paint(w); }), 1000);
  setInterval(() => list.forEach(w => { if (w.type === "calendar") paint(w); }), 60000);
  addEventListener("neonos:nowplaying", () => list.forEach(w => w.type === "music" && paint(w)));
  addEventListener("storage", e => { if (e.key === CAL_KEY || e.key === NB_KEY) list.forEach(w => (w.type === "calendar" || w.type === "note") && paint(w)); });
  return { add, remove, has: type => list.some(w => w.type === type), get list() { return list; } };
}
