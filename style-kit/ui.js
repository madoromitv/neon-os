// Neon OS style kit: shared UI behaviour (toasts, dialogs, menus, sliders)
// Needs chrome.css. Any app can import these.
export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function toastBox() {
  let el = document.getElementById("toasts");
  if (!el) { el = document.createElement("div"); el.id = "toasts"; el.className = "toasts"; el.setAttribute("aria-live", "polite"); document.body.appendChild(el); }
  return el;
}
export function toast(msg, err) {
  const el = document.createElement("div"); el.className = "toast" + (err ? " err" : ""); el.textContent = msg;
  toastBox().appendChild(el); setTimeout(() => el.remove(), err ? 7000 : 3500);
}
export function dialog({ title, text, fields = [], confirm = "OK", danger = false, cancel = "Cancel" }) {
  return new Promise(resolve => {
    const scrim = document.createElement("div"); scrim.className = "scrim";
    scrim.innerHTML = `<form class="win dialog lit" role="dialog" aria-modal="true" aria-labelledby="dlgT">
      <div class="titlebar"><span class="ttl" id="dlgT">${esc(title)}</span></div>
      <div class="wbody">${text ? `<p>${esc(text)}</p>` : ""}
      ${fields.map((f, i) => `<label for="dlgF${i}"><span class="lbl">${esc(f.label)}</span>${f.type === "textarea" ? `<textarea id="dlgF${i}" rows="10" spellcheck="false">${esc(f.value || "")}</textarea>` : `<input id="dlgF${i}" type="${f.type === "password" ? "password" : "text"}"${f.type === "password" ? ' inputmode="numeric" autocomplete="off"' : ""} maxlength="200" value="${esc(f.value || "")}">`}</label>`).join("")}
      <div class="acts">${cancel ? `<button type="button" class="btn" data-x>${esc(cancel)}</button>` : ""}<button type="submit" class="btn"${danger ? ' style="color:var(--danger)"' : ""}>${esc(confirm)}</button></div></div></form>`;
    const prev = document.activeElement;
    const close = v => { scrim.remove(); document.removeEventListener("keydown", onKey, true); if (prev && prev.focus) prev.focus(); resolve(v); };
    const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); close(null); } };
    document.addEventListener("keydown", onKey, true);
    scrim.addEventListener("mousedown", e => { if (e.target === scrim) close(null); });
    const x = scrim.querySelector("[data-x]"); if (x) x.addEventListener("click", () => close(null));
    scrim.querySelector("form").addEventListener("submit", e => { e.preventDefault(); close(fields.length ? fields.map((f, i) => f.type === "textarea" ? scrim.querySelector("#dlgF" + i).value : scrim.querySelector("#dlgF" + i).value.trim()) : true); });
    document.body.appendChild(scrim);
    const inp = scrim.querySelector("input, textarea"); (inp || scrim.querySelector("button[type=submit]")).focus(); if (inp) inp.select();
  });
}
let popEl = null, popAnchor = null;
export function closePop() { if (!popEl) return; popEl.remove(); popEl = null; if (popAnchor && popAnchor.setAttribute) popAnchor.setAttribute("aria-expanded", "false"); popAnchor = null; }
export function openMenu(anchor, items, at) {
  if (anchor && popAnchor === anchor) { closePop(); return; }
  closePop();
  const el = document.createElement("div"); el.className = "pop"; el.setAttribute("role", "menu");
  items.forEach(it => {
    if (it === "-") { const s = document.createElement("div"); s.className = "sep"; el.appendChild(s); return; }
    if (it.note) { const s = document.createElement("div"); s.className = "sub note"; s.textContent = it.note; el.appendChild(s); return; } // a sentence of explanation
    if (it.label && !it.run && !it.sub) { const s = document.createElement("div"); s.className = "sub lbl"; s.textContent = it.label; el.appendChild(s); return; }
    const b = document.createElement("button"); b.className = "mi" + (it.danger ? " danger" : ""); b.setAttribute("role", "menuitem");
    b.disabled = !!it.disabled;
    b.innerHTML = `<span class="name">${esc(it.text)}</span>${it.key ? `<span class="k">${esc(it.key)}</span>` : ""}`;
    b.addEventListener("click", () => { closePop(); it.run(); });
    el.appendChild(b);
  });
  document.body.appendChild(el);
  const pr = el.getBoundingClientRect();
  let left, top;
  if (at) { left = at.x; top = at.y; }
  else { const r = anchor.getBoundingClientRect(); left = r.left; top = r.bottom + 3; if (top + pr.height > innerHeight - 8) top = r.top - pr.height - 3; }
  left = clamp(left, 8, innerWidth - pr.width - 8); top = clamp(top, 8, innerHeight - pr.height - 8);
  el.style.left = left + "px"; el.style.top = top + "px";
  popEl = el; popAnchor = anchor || null; if (anchor && anchor.setAttribute) anchor.setAttribute("aria-expanded", "true");
  const f = el.querySelector(".mi:not(:disabled)"); if (f) f.focus();
}
document.addEventListener("mousedown", e => { if (popEl && !popEl.contains(e.target) && !(popAnchor && popAnchor.contains && popAnchor.contains(e.target))) closePop(); });
document.addEventListener("keydown", e => {
  if (!popEl) return;
  if (e.key === "Escape") { const a = popAnchor; closePop(); if (a && a.focus) a.focus(); e.preventDefault(); e.stopPropagation(); }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    const items = [...popEl.querySelectorAll(".mi:not(:disabled)")]; if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus(); e.preventDefault(); e.stopPropagation();
  }
}, true);
addEventListener("resize", closePop);

export function Slider(el, { min = 0, max = 1, step = 0.01, value = 0, orient = "h", label, text, onInput, onChange }) {
  el.innerHTML = '<span class="groove"><span class="fill"></span></span><span class="thumb"></span>';
  el.tabIndex = 0; el.setAttribute("role", "slider"); el.setAttribute("aria-label", label);
  el.setAttribute("aria-valuemin", min); el.setAttribute("aria-valuemax", max);
  if (orient === "v") el.setAttribute("aria-orientation", "vertical");
  const fill = el.querySelector(".fill"), thumb = el.querySelector(".thumb"), center = el.classList.contains("center");
  const api = { value, dragging: false };
  function render() {
    const f = (api.value - min) / (max - min || 1);
    if (orient === "h") {
      thumb.style.left = `calc(11px + ${f} * (100% - 22px))`;
      if (center) { const a = Math.min(f, 0.5), b = Math.max(f, 0.5); fill.style.left = a * 100 + "%"; fill.style.width = (b - a) * 100 + "%"; }
      else fill.style.width = f * 100 + "%";
    } else {
      thumb.style.top = `calc(5.5px + ${1 - f} * (100% - 11px))`;
      if (center) { const a = Math.min(f, 0.5), b = Math.max(f, 0.5); fill.style.bottom = a * 100 + "%"; fill.style.height = (b - a) * 100 + "%"; }
      else fill.style.height = f * 100 + "%";
    }
    el.setAttribute("aria-valuenow", Math.round(api.value * 100) / 100);
    if (text) el.setAttribute("aria-valuetext", text(api.value));
  }
  api.set = (v, emit) => { v = clamp(Math.round(v / step) * step, min, max); if (v === api.value && !emit) { render(); return; } api.value = v; render(); if (emit && onInput) onInput(v); };
  const fromEvent = e => {
    const r = el.getBoundingClientRect();
    const f = orient === "h" ? (e.clientX - r.left - 11) / Math.max(1, r.width - 22) : 1 - (e.clientY - r.top - 5.5) / Math.max(1, r.height - 11);
    return min + clamp(f, 0, 1) * (max - min);
  };
  el.addEventListener("pointerdown", e => { e.preventDefault(); el.focus(); el.setPointerCapture(e.pointerId); api.dragging = true; api.set(fromEvent(e), true); });
  el.addEventListener("pointermove", e => { if (api.dragging) api.set(fromEvent(e), true); });
  const end = () => { if (!api.dragging) return; api.dragging = false; if (onChange) onChange(api.value); };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  el.addEventListener("dblclick", () => { if (center) { api.set((min + max) / 2, true); if (onChange) onChange(api.value); } });
  el.addEventListener("keydown", e => {
    const big = (max - min) / 10;
    const d = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: big, PageDown: -big }[e.key];
    if (d != null) { api.set(api.value + d * (e.shiftKey ? 5 : 1), true); if (onChange) onChange(api.value); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === "Home" || e.key === "End") { api.set(e.key === "Home" ? min : max, true); if (onChange) onChange(api.value); e.preventDefault(); e.stopPropagation(); }
  });
  render();
  return api;
}

// A dialog with several choices. options: [{ label, value, danger }]. Resolves to the chosen value, or null if dismissed.
export function choose({ title, text, options }) {
  return new Promise(resolve => {
    const scrim = document.createElement("div"); scrim.className = "scrim";
    scrim.innerHTML = `<div class="win dialog lit" role="dialog" aria-modal="true" aria-labelledby="chT">
      <div class="titlebar"><span class="ttl" id="chT">${esc(title)}</span></div>
      <div class="wbody">${text ? `<p>${esc(text)}</p>` : ""}
      <div class="acts">${options.map((o, i) => `<button type="button" class="btn" data-i="${i}"${o.danger ? ' style="color:var(--danger)"' : ""}>${esc(o.label)}</button>`).join("")}</div></div></div>`;
    const prev = document.activeElement;
    const close = v => { scrim.remove(); document.removeEventListener("keydown", onKey, true); if (prev && prev.focus) prev.focus(); resolve(v); };
    const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); close(null); } };
    document.addEventListener("keydown", onKey, true);
    scrim.addEventListener("click", e => { const b = e.target.closest("[data-i]"); if (b) close(options[+b.dataset.i].value); });
    document.body.appendChild(scrim);
    scrim.querySelector("[data-i]").focus();
  });
}
