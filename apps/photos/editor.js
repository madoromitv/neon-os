// Photos: the picture editor
// Crop (free or a fixed shape), rotate, flip, straighten, light and colour, a vignette and ready-made filters.
// Nothing changes the original until you choose: Save a copy, Replace (pictures added here; the original goes
// to the Bin), Save as… (anywhere), or Set as wallpaper. The preview works on a smaller copy so it stays quick;
// saving draws the full-size picture with the same settings.
import { esc, toast, dialog, Slider } from "../../style-kit/ui.js";
import { getTheme, ballHex } from "../../core/theme.js";

const FRESH = () => ({ rot: 0, flipH: false, flipV: false, angle: 0, crop: { x: 0, y: 0, w: 1, h: 1 }, aspect: "free", light: 0, contrast: 0, sat: 0, warmth: 0, vignette: 0, filter: "none" });
// filters: what each adds on top of the sliders (CSS filter parts, a warmth, a tint in the orb colour, a vignette)
const FILTERS = {
  none: { name: "None" },
  neon: { name: "Neon", sat: 0.35, contrast: 0.12, tint: 0.28 },
  mono: { name: "Mono", gray: 1 },
  noir: { name: "Noir", gray: 1, contrast: 0.4, light: -0.05, vignette: 0.5 },
  warm: { name: "Warm", warmth: 0.45, sat: 0.08 },
  cool: { name: "Cool", warmth: -0.45 },
  fade: { name: "Fade", contrast: -0.22, light: 0.06, sat: -0.3 },
  vivid: { name: "Vivid", sat: 0.5, contrast: 0.12 },
  vintage: { name: "Vintage", sepia: 0.45, contrast: -0.06, vignette: 0.35, light: 0.03 },
};
const ASPECTS = [["free", "Free"], ["orig", "Original"], ["1", "1:1"], ["1.3333", "4:3"], ["1.5", "3:2"], ["1.7778", "16:9"], ["0.5625", "9:16"]];
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

// draws the picture with the settings onto a new canvas; scale < 1 for the preview. full: ignore the crop (cropping view)
function render(bmp, st, scale = 1, full = false) {
  const swap = st.rot % 180 !== 0, SW = bmp.width, SH = bmp.height, OW = swap ? SH : SW, OH = swap ? SW : SH;
  const c = full ? { x: 0, y: 0, w: 1, h: 1 } : st.crop;
  const outW = Math.max(1, Math.round(c.w * OW * scale)), outH = Math.max(1, Math.round(c.h * OH * scale));
  const cv = document.createElement("canvas"); cv.width = outW; cv.height = outH;
  const g = cv.getContext("2d"), f = FILTERS[st.filter] || FILTERS.none;
  const light = st.light + (f.light || 0), contrast = st.contrast + (f.contrast || 0), sat = st.sat + (f.sat || 0);
  g.filter = [`brightness(${1 + light})`, `contrast(${1 + contrast})`, `saturate(${Math.max(0, 1 + sat)})`, f.gray ? `grayscale(${f.gray})` : "", f.sepia ? `sepia(${f.sepia})` : ""].filter(Boolean).join(" ");
  // straighten: turn by the angle and zoom just enough that no empty corners show
  const th = st.angle * Math.PI / 180, ca = Math.abs(Math.cos(th)), sa = Math.abs(Math.sin(th));
  const zoom = Math.max((OW * ca + OH * sa) / OW, (OW * sa + OH * ca) / OH);
  g.scale(scale, scale);
  g.translate(-c.x * OW, -c.y * OH);
  g.translate(OW / 2, OH / 2); g.rotate(th); g.scale(zoom, zoom);
  g.rotate(st.rot * Math.PI / 180); g.scale(st.flipH ? -1 : 1, st.flipV ? -1 : 1);
  g.drawImage(bmp, -SW / 2, -SH / 2);
  g.setTransform(1, 0, 0, 1, 0, 0); g.filter = "none";
  const warmth = st.warmth + (f.warmth || 0);
  if (warmth) { g.globalCompositeOperation = "soft-light"; g.fillStyle = warmth > 0 ? `rgba(255,140,30,${Math.min(1, warmth * 0.7)})` : `rgba(40,130,255,${Math.min(1, -warmth * 0.7)})`; g.fillRect(0, 0, outW, outH); }
  if (f.tint) { const [r, gg, b] = hexRgb(ballHex(getTheme().ball)); g.globalCompositeOperation = "soft-light"; g.fillStyle = `rgba(${r},${gg},${b},${f.tint})`; g.fillRect(0, 0, outW, outH); }
  const vig = st.vignette + (f.vignette || 0);
  if (vig > 0) {
    g.globalCompositeOperation = "source-over";
    const R = Math.hypot(outW, outH) / 2, grd = g.createRadialGradient(outW / 2, outH / 2, R * 0.35, outW / 2, outH / 2, R);
    grd.addColorStop(0, "rgba(0,0,0,0)"); grd.addColorStop(1, `rgba(0,0,0,${Math.min(0.9, vig * 0.85)})`);
    g.fillStyle = grd; g.fillRect(0, 0, outW, outH);
  }
  g.globalCompositeOperation = "source-over";
  return cv;
}

// p: the picture; opts: { blob (its file), save(kind, blob, name) → message | null, canReplace, canSaveToFolder }
export async function openEditor(p, opts) {
  const host = document.createElement("div"); host.className = "editor"; host.setAttribute("role", "dialog"); host.setAttribute("aria-label", `Edit ${p.name}`);
  host.innerHTML = `
    <div class="ed-top"><strong>${esc(p.name)}</strong>
      <button class="btn" data-a="undo" title="Undo (Ctrl+Z)">Undo</button><button class="btn" data-a="redo" title="Redo (Ctrl+Shift+Z)">Redo</button>
      <button class="btn" data-a="reset">Reset</button><span class="ed-sp"></span>
      <button class="btn" data-a="save" aria-haspopup="menu">Save…</button><button class="btn" data-a="close" aria-label="Close the editor">✕</button></div>
    <div class="ed-main">
      <div class="ed-stage"><canvas class="ed-cv"></canvas><div class="ed-crop" hidden><i data-h="nw"></i><i data-h="n"></i><i data-h="ne"></i><i data-h="e"></i><i data-h="se"></i><i data-h="s"></i><i data-h="sw"></i><i data-h="w"></i></div><p class="ed-busy">Opening…</p></div>
      <div class="ed-side">
        <nav class="tabs ed-tabs" role="tablist"><button class="btn" data-tab="crop" role="tab">Crop</button><button class="btn" data-tab="adjust" role="tab">Adjust</button><button class="btn" data-tab="filters" role="tab">Filters</button></nav>
        <section data-pane="crop">
          <span class="lbl">Shape</span><div class="ed-chips" data-group="aspect">${ASPECTS.map(([v, n]) => `<button class="btn mini" data-aspect="${v}">${n}</button>`).join("")}</div>
          <span class="lbl">Turn and flip</span><div class="ed-chips"><button class="btn" data-a="rotL" title="Turn left">⟲ Left</button><button class="btn" data-a="rotR" title="Turn right">⟳ Right</button><button class="btn" data-a="flipH">Flip ↔</button><button class="btn" data-a="flipV">Flip ↕</button></div>
          <div class="ed-row"><span class="lbl">Straighten</span><span class="slider h" data-s="angle"></span><span class="lcd pct" data-v="angle"></span></div>
          <p class="hint">Drag the corners and edges to crop, or inside the box to move it.</p>
        </section>
        <section data-pane="adjust" hidden>
          <div class="ed-row"><span class="lbl">Light</span><span class="slider h" data-s="light"></span><span class="lcd pct" data-v="light"></span></div>
          <div class="ed-row"><span class="lbl">Contrast</span><span class="slider h" data-s="contrast"></span><span class="lcd pct" data-v="contrast"></span></div>
          <div class="ed-row"><span class="lbl">Colour</span><span class="slider h" data-s="sat"></span><span class="lcd pct" data-v="sat"></span></div>
          <div class="ed-row"><span class="lbl">Warmth</span><span class="slider h" data-s="warmth"></span><span class="lcd pct" data-v="warmth"></span></div>
          <div class="ed-row"><span class="lbl">Vignette</span><span class="slider h" data-s="vignette"></span><span class="lcd pct" data-v="vignette"></span></div>
        </section>
        <section data-pane="filters" hidden><div class="ed-filters">${Object.entries(FILTERS).map(([k, f]) => `<button class="ed-f" data-filter="${k}"><canvas></canvas><span>${f.name}</span></button>`).join("")}</div></section>
      </div>
    </div>`;
  document.body.appendChild(host);
  const $ = sel => host.querySelector(sel), cv = $(".ed-cv"), stage = $(".ed-stage"), cropEl = $(".ed-crop");
  let bmp = null, small = null;
  try { bmp = await createImageBitmap(opts.blob, { imageOrientation: "from-image" }).catch(() => createImageBitmap(opts.blob)); }
  catch (e) { host.remove(); toast("This picture can't be edited.", true); return; }
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)); // the preview works on a copy at most 1600 px across
  small = k < 1 ? await createImageBitmap(bmp, { resizeWidth: Math.round(bmp.width * k), resizeHeight: Math.round(bmp.height * k), resizeQuality: "high" }) : bmp;
  $(".ed-busy").hidden = true;

  let st = FRESH(), past = [], future = [], tab = "crop";
  const snap = () => JSON.stringify(st);
  const commit = before => { if (before !== snap()) { past.push(before); if (past.length > 60) past.shift(); future = []; } sync(); };
  const oriented = () => st.rot % 180 ? [bmp.height, bmp.width] : [bmp.width, bmp.height];

  // ---------- drawing the preview ----------
  let raf = 0, closed = false;
  const draw = () => { if (!raf && !closed) raf = requestAnimationFrame(paint); };
  function paint() {
    raf = 0; if (closed) return;
    const cropping = tab === "crop", out = render(small, st, 1, cropping);
    const R = stage.getBoundingClientRect(), fit = Math.min((R.width - 24) / out.width, (R.height - 24) / out.height);
    const w = Math.max(1, Math.floor(out.width * fit)), h = Math.max(1, Math.floor(out.height * fit)), d = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(w * d); cv.height = Math.round(h * d); cv.style.width = w + "px"; cv.style.height = h + "px";
    cv.getContext("2d").drawImage(out, 0, 0, cv.width, cv.height);
    cropEl.hidden = !cropping;
    if (cropping) {
      const c = st.crop, cl = cv.offsetLeft, ct = cv.offsetTop;
      Object.assign(cropEl.style, { left: cl + c.x * w + "px", top: ct + c.y * h + "px", width: c.w * w + "px", height: c.h * h + "px" });
    }
  }
  const ro = new ResizeObserver(draw); ro.observe(stage);

  // ---------- crop box ----------
  const ratio = () => { if (st.aspect === "free") return null; const [OW, OH] = oriented(); const r = st.aspect === "orig" ? OW / OH : +st.aspect; return r * OH / OW; }; // in 0..1 units
  function fitAspect() { // the largest box of the chosen shape, centred on the current one
    const r = ratio(); if (!r) return;
    const c = st.crop, cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    let w = c.w, h = w / r; if (h > c.h) { h = c.h; w = h * r; }
    if (w > 1) { w = 1; h = w / r; } if (h > 1) { h = 1; w = h * r; }
    st.crop = { x: Math.min(1 - w, Math.max(0, cx - w / 2)), y: Math.min(1 - h, Math.max(0, cy - h / 2)), w, h };
  }
  cropEl.addEventListener("pointerdown", e => {
    e.preventDefault(); cropEl.setPointerCapture(e.pointerId);
    const hnd = e.target.dataset.h || "move", before = snap(), c0 = { ...st.crop }, W = cv.offsetWidth, H = cv.offsetHeight, sx = e.clientX, sy = e.clientY, r = ratio();
    const mv = ev => {
      const dx = (ev.clientX - sx) / W, dy = (ev.clientY - sy) / H; let { x, y, w, h } = c0;
      const MIN = 0.04;
      if (hnd === "move") { x = Math.min(1 - w, Math.max(0, x + dx)); y = Math.min(1 - h, Math.max(0, y + dy)); }
      else {
        if (hnd.includes("w")) { const nx = Math.min(x + w - MIN, Math.max(0, x + dx)); w += x - nx; x = nx; }
        if (hnd.includes("e")) w = Math.min(1 - x, Math.max(MIN, w + dx));
        if (hnd.includes("n")) { const ny = Math.min(y + h - MIN, Math.max(0, y + dy)); h += y - ny; y = ny; }
        if (hnd.includes("s")) h = Math.min(1 - y, Math.max(MIN, h + dy));
        if (r) { // keep the shape: follow the edge that moved most, and stay inside the picture
          if (hnd === "n" || hnd === "s") w = h * r; else h = w / r;
          if (x + w > 1) { w = 1 - x; h = w / r; } if (y + h > 1) { h = 1 - y; w = h * r; }
          if (hnd.includes("w")) x = c0.x + c0.w - w; if (hnd.includes("n")) y = c0.y + c0.h - h;
          x = Math.max(0, x); y = Math.max(0, y);
        }
      }
      st.crop = { x, y, w, h }; draw();
    };
    const end = () => { cropEl.removeEventListener("pointermove", mv); cropEl.removeEventListener("pointerup", end); cropEl.removeEventListener("pointercancel", end); commit(before); };
    cropEl.addEventListener("pointermove", mv); cropEl.addEventListener("pointerup", end); cropEl.addEventListener("pointercancel", end);
  });

  // ---------- controls ----------
  const pct = v => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
  const SL = { angle: [-45, 45, 0.5, v => `${v > 0 ? "+" : ""}${v}°`], light: [-0.6, 0.6, 0.01, pct], contrast: [-0.6, 0.6, 0.01, pct], sat: [-1, 1, 0.01, pct], warmth: [-1, 1, 0.01, pct], vignette: [0, 1, 0.01, v => Math.round(v * 100) + "%"] };
  const sliders = {}; let slBefore = null;
  for (const [key, [min, max, step, txt]] of Object.entries(SL)) {
    const el = host.querySelector(`[data-s="${key}"]`);
    sliders[key] = Slider(el, { min, max, step, value: st[key], label: el.previousElementSibling.textContent, text: txt,
      onInput: v => { if (slBefore == null) slBefore = snap(); st[key] = v; host.querySelector(`[data-v="${key}"]`).textContent = txt(v); draw(); },
      onChange: () => { if (slBefore != null) { const b = slBefore; slBefore = null; commit(b); } } });
  }
  function sync() {
    for (const [key, [, , , txt]] of Object.entries(SL)) { sliders[key].set(st[key]); host.querySelector(`[data-v="${key}"]`).textContent = txt(st[key]); }
    host.querySelectorAll("[data-aspect]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.aspect === st.aspect)));
    host.querySelectorAll("[data-filter]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.filter === st.filter)));
    $('[data-a="undo"]').disabled = !past.length; $('[data-a="redo"]').disabled = !future.length;
    draw();
  }
  function showTab(t) { tab = t; host.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === t))); host.querySelectorAll("[data-pane]").forEach(s => s.hidden = s.dataset.pane !== t); draw(); if (t === "filters") drawFilterThumbs(); }
  $(".ed-tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab); });
  host.querySelector('[data-group="aspect"]').addEventListener("click", e => { const b = e.target.closest("[data-aspect]"); if (!b) return; const before = snap(); st.aspect = b.dataset.aspect; if (st.aspect === "free") {} else fitAspect(); commit(before); });
  function drawFilterThumbs() {
    const base = { ...st, crop: st.crop, filter: "none" }, t = Math.min(1, 120 / Math.max(small.width, small.height));
    host.querySelectorAll("[data-filter]").forEach(b => { const c = b.querySelector("canvas"), out = render(small, { ...base, filter: b.dataset.filter }, t); c.width = out.width; c.height = out.height; c.getContext("2d").drawImage(out, 0, 0); });
  }
  host.querySelector(".ed-filters").addEventListener("click", e => { const b = e.target.closest("[data-filter]"); if (!b) return; const before = snap(); st.filter = b.dataset.filter; commit(before); });
  const turn = d => { const before = snap(), c = st.crop; st.rot = (st.rot + d + 360) % 360; st.crop = d > 0 ? { x: 1 - c.y - c.h, y: c.x, w: c.h, h: c.w } : { x: c.y, y: 1 - c.x - c.w, w: c.h, h: c.w }; if (st.aspect !== "free" && st.aspect !== "orig") fitAspect(); commit(before); };
  function undo() { if (!past.length) return; future.push(snap()); st = JSON.parse(past.pop()); sync(); }
  function redo() { if (!future.length) return; past.push(snap()); st = JSON.parse(future.pop()); sync(); }
  const close = () => { closed = true; cancelAnimationFrame(raf); ro.disconnect(); host.remove(); removeEventListener("keydown", keys, true); if (small !== bmp) small.close(); bmp.close(); opts.onClose && opts.onClose(); };
  async function finish() { const full = render(bmp, st, 1); const type = /png$/i.test(p.name) ? "image/png" : /webp$/i.test(p.name) ? "image/webp" : "image/jpeg"; return await new Promise(res => full.toBlob(b => res(b), type, 0.92)); }
  const editedName = () => { const m = p.name.match(/^(.*?)(\.[^.]+)?$/), ext = /png$/i.test(p.name) ? ".png" : /webp$/i.test(p.name) ? ".webp" : ".jpg"; return `${m[1]} (edited)${ext}`; };
  host.addEventListener("click", async e => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const a = b.dataset.a;
    if (a === "close") { if (past.length && !(await dialog({ title: "Close without saving?", text: "Your changes to this picture will be lost.", confirm: "Close", danger: true }))) return; close(); }
    else if (a === "undo") undo(); else if (a === "redo") redo();
    else if (a === "reset") { const before = snap(); st = FRESH(); commit(before); }
    else if (a === "rotL") turn(-90); else if (a === "rotR") turn(90);
    else if (a === "flipH" || a === "flipV") { const before = snap(); st[a] = !st[a]; commit(before); }
    else if (a === "save") {
      const { openMenu } = await import("../../style-kit/ui.js");
      const go = kind => async () => { b.disabled = true; try { const blob = await finish(); const msg = await opts.save(kind, blob, editedName()); if (msg) { toast(msg); if (kind !== "wall" && kind !== "as") close(); } } catch (err) { toast("Couldn't save the picture.", true); } finally { b.disabled = false; } };
      openMenu(b, [
        { text: opts.canSaveToFolder ? "Save a copy in its folder" : "Save a copy in Photos", run: go("copy") },
        ...(opts.canReplace ? [{ text: "Replace the original", run: go("replace") }, { note: "The original goes to the Bin for 30 days." }] : []),
        { text: "Save as…", run: go("as") },
        "-",
        { text: "Set as wallpaper", run: go("wall") },
      ]);
    }
  });
  const keys = e => {
    if (!document.body.contains(host)) return;
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") { e.preventDefault(); e.stopImmediatePropagation(); e.shiftKey ? redo() : undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.code === "KeyY") { e.preventDefault(); e.stopImmediatePropagation(); redo(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); host.querySelector('[data-a="close"]').click(); }
  };
  addEventListener("keydown", keys, true);
  showTab("crop"); sync();
  return { close, get state() { return st; } };
}
