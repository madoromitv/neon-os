// Neon OS boot screen
// A short start-up: a flicker of static, the orb wakes, the systems check in, then the desktop fades up.
// About two seconds; a click or any key skips it. Turned off in Settings (theme.boot = false).
import { getTheme } from "../core/theme.js";

const LINE_MS = 190;
export async function runBoot() {
  if (getTheme().boot === false) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let songs = null;
  try { const { librarySummary } = await import("../core/backup.js"); songs = (await Promise.race([librarySummary(), new Promise(r => setTimeout(() => r(null), 600))]))?.songs ?? null; } catch (e) {}
  let windows = 0;
  try { const l = JSON.parse(localStorage.getItem("neon-os:layout") || "{}"); windows = new Set(Object.values(l.wins || {}).map(w => w.appId)).size - (l.closed || []).length; } catch (e) {}
  const lines = [
    ["STYLE KIT", "OK"],
    ["CORE", "OK"],
    ["AUDIO", "READY"],
    ["LIBRARY", songs == null ? "OK" : `${songs} SONG${songs === 1 ? "" : "S"}`],
    ["WINDOWS", windows > 0 ? `${windows} TO RESTORE` : "CLEAR"],
  ];
  const el = document.createElement("div");
  el.className = "boot" + (reduced ? " still" : "");
  el.setAttribute("role", "status"); el.setAttribute("aria-label", "Neon OS is starting");
  el.innerHTML = `<div class="boot-in"><i class="boot-orb" aria-hidden="true"></i><b class="boot-name">NEON OS</b>
    <div class="boot-lines">${lines.map(([k, v]) => `<div class="boot-line"><span>${k}</span><span class="dots"></span><span class="v">${v}</span></div>`).join("")}</div>
    <div class="boot-ready">SYSTEMS ONLINE</div><small class="boot-skip">click to skip</small></div>`;
  document.body.appendChild(el);
  await new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      removeEventListener("keydown", finish, true); el.removeEventListener("pointerdown", finish);
      el.classList.add("out"); setTimeout(() => el.remove(), reduced ? 0 : 450);
      resolve();
    };
    addEventListener("keydown", finish, true); el.addEventListener("pointerdown", finish);
    if (reduced) { el.classList.add("ready"); el.querySelectorAll(".boot-line").forEach(l => l.classList.add("on")); setTimeout(finish, 700); return; }
    const rows = [...el.querySelectorAll(".boot-line")];
    setTimeout(() => el.classList.add("awake"), 220);
    rows.forEach((r, i) => setTimeout(() => r.classList.add("on"), 520 + i * LINE_MS));
    setTimeout(() => el.classList.add("ready"), 560 + rows.length * LINE_MS);
    setTimeout(finish, 1150 + rows.length * LINE_MS);
  });
}
