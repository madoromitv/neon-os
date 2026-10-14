// Neon OS shell: quick settings (click the taskbar clock)
// The date and what's next in Calendar, the things people change most in one click, and both volumes.
import { getTheme, setTheme, calmOn } from "../core/theme.js";
import { Slider, esc } from "../style-kit/ui.js";
import { loadCalendar } from "../core/reminders.js";

// ctx: { music: { get(), set(v) }, quiet: { get(), set(on) }, lock(), wallNext(), slideshow(), openApp(id), showDesktop(), sfx }
export function createQuick(btn, ctx) {
  let el = null;
  const close = () => { if (!el) return; el.remove(); el = null; btn.setAttribute("aria-expanded", "false"); };
  const tiles = () => {
    const t = getTheme();
    return [
      ["sounds", "System sounds", t.sounds !== false, "M4 9v6h4l5 5V4L8 9zm12.5 3A4.5 4.5 0 0 0 14 8v8a4.47 4.47 0 0 0 2.5-4z"],
      ["quiet", "Do not disturb", ctx.quiet.get(), "M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11c0-3.1-1.6-5.6-4.5-6.3V4a1.5 1.5 0 0 0-3 0v.7C7.6 5.4 6 7.9 6 11v5l-2 2v1h16v-1zM3 3l18 18-1.4 1.4L1.6 4.4z"],
      ["calm", "Reduce motion", calmOn(t), "M6 11h12v2H6z"],
      ["contrast", "High contrast", !!t.contrast, "M12 2a10 10 0 1 0 0 20zm0 2v16a8 8 0 0 1 0-16z"],
      ["wall", t.wall === "slideshow" ? "Next wallpaper" : "Change wallpaper", false, "M3 4h18v16H3zM6 17l4-5 3 3.5 2-2.5 3 4z"],
      ["desk", "Show desktop", false, "M3 5h18v12H3zM8 19h8v2H8z"],
      ["lock", "Lock", false, "M7 10V7a5 5 0 0 1 10 0v3h1v11H6V10zm2 0h6V7a3 3 0 0 0-6 0z"],
      ["settings", "Settings", false, "M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"],
    ];
  };
  function draw() {
    const d = new Date(), today = d.toISOString().slice(0, 10);
    const ev = loadCalendar().events.filter(e => e.date >= today).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""))).slice(0, 2);
    el.querySelector(".qs-date").innerHTML = `<b>${d.toLocaleDateString(undefined, { weekday: "long" })}</b><span>${d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</span>`;
    el.querySelector(".qs-next").innerHTML = ev.length ? ev.map(e => `<button data-open="calendar"><b>${esc(e.time || "All day")}</b> ${esc(e.title)}<small>${e.date === today ? "Today" : esc(new Date(e.date + "T00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }))}</small></button>`).join("") : `<button data-open="calendar"><small>Nothing coming up in Calendar</small></button>`;
    el.querySelector(".qs-tiles").innerHTML = tiles().map(([k, name, on, d]) => `<button class="qs-tile" data-q="${k}" aria-pressed="${on}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg><span>${name}</span></button>`).join("");
  }
  function open() {
    el = document.createElement("div"); el.className = "win lit traypop qs"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Quick settings");
    const t = getTheme();
    el.innerHTML = `<div class="titlebar"><span class="ttl">Quick settings</span></div><div class="wbody">
      <div class="qs-top"><div class="lcd qs-time"></div><div class="qs-date"></div></div>
      <div class="qs-next"></div>
      <div class="qs-tiles"></div>
      <div class="vrow"><span class="lbl">Music</span><div class="slider h" id="qsMusic"></div><span class="lcd pct" id="qsMusicPct"></span></div>
      <div class="vrow"><span class="lbl">System</span><div class="slider h" id="qsSys"></div><span class="lcd pct" id="qsSysPct"></span></div></div>`;
    document.body.appendChild(el); btn.setAttribute("aria-expanded", "true");
    const tick = () => { if (!el) return; const d = new Date(); el.querySelector(".qs-time").textContent = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }); };
    tick(); const iv = setInterval(() => el ? tick() : clearInterval(iv), 1000);
    draw();
    const pct = v => Math.round(v * 100) + "%";
    el.querySelector("#qsMusicPct").textContent = pct(ctx.music.get());
    Slider(el.querySelector("#qsMusic"), { min: 0, max: 1, step: 0.01, value: ctx.music.get(), label: "Music volume", text: pct, onInput: v => { ctx.music.set(v); el.querySelector("#qsMusicPct").textContent = pct(v); } });
    const sv = t.sysVol == null ? 0.6 : t.sysVol; el.querySelector("#qsSysPct").textContent = pct(sv);
    Slider(el.querySelector("#qsSys"), { min: 0, max: 1, step: 0.01, value: sv, label: "System sounds volume", text: pct, onInput: v => { setTheme({ sysVol: v }); el.querySelector("#qsSysPct").textContent = pct(v); }, onChange: () => ctx.sfx.tick() });
    el.addEventListener("click", e => {
      const o = e.target.closest("[data-open]"); if (o) { close(); ctx.openApp(o.dataset.open); return; }
      const b = e.target.closest("[data-q]"); if (!b) return;
      const k = b.dataset.q, th = getTheme();
      if (k === "sounds") { setTheme({ sounds: th.sounds === false }); if (th.sounds === false) ctx.sfx.chime(); }
      else if (k === "quiet") ctx.quiet.set(!ctx.quiet.get());
      else if (k === "calm") setTheme({ calm: !calmOn(th) });
      else if (k === "contrast") setTheme({ contrast: !th.contrast });
      else if (k === "wall") { if (ctx.slideshow()) ctx.wallNext(); else { const order = ["orb", "fog", "plain"]; setTheme({ wall: order[(Math.max(0, order.indexOf(th.wall || "orb")) + 1) % order.length] }); } }
      else if (k === "desk") { close(); ctx.showDesktop(); return; }
      else if (k === "lock") { close(); ctx.lock(); return; }
      else if (k === "settings") { close(); ctx.openApp("settings"); return; }
      draw();
    });
  }
  btn.addEventListener("click", e => { e.stopPropagation(); if (el) close(); else { ctx.sfx.tick(); open(); } });
  document.addEventListener("pointerdown", e => { if (el && !el.contains(e.target) && e.target !== btn) close(); });
  document.addEventListener("keydown", e => { if (el && e.key === "Escape") { close(); btn.focus(); } });
  return { close, get open() { return !!el; } };
}
