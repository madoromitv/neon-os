// Neon OS shell: the picture wallpaper, one picture or a slideshow
// Two layers sit behind the desktop's (clear) canvas; a new picture fades in on the hidden one, then they swap.
// A slideshow takes its pictures from Photos (all of them, the ones added there, or one linked folder), changes
// every few minutes in order or shuffled, and carries on from the same picture after a reload.
import { listPics, listPicFolders, getFolderIndex, fileAt, folderAccess } from "../core/photos.js";

const SHOW_KEY = "neon-os:wall-show";
const loadState = () => { try { return JSON.parse(localStorage.getItem(SHOW_KEY) || "{}") || {}; } catch (e) { return {}; } };
const saveState = s => { try { localStorage.setItem(SHOW_KEY, JSON.stringify(s)); } catch (e) {} };

export function createWallPic(box, { onEmpty } = {}) {
  box.innerHTML = `<div class="layer"><i class="back"></i><i class="front"></i></div><div class="layer"><i class="back"></i><i class="front"></i></div>`;
  const layers = [...box.children];
  let on = 0, urls = [null, null], timer = 0, list = [], conf = null, run = 0;

  // puts a picture on the hidden layer and fades it in once it's ready
  async function put(url, fade) {
    const next = 1 - on, L = layers[next];
    try { const im = new Image(); im.src = url; await im.decode(); } catch (e) {}
    for (const i of L.children) i.style.backgroundImage = `url("${url}")`;
    L.style.transition = fade ? "" : "none";
    L.classList.add("on"); layers[on].classList.remove("on");
    const old = urls[next]; urls[next] = url; on = next;
    // the zoom starts again with each picture
    const f = L.querySelector(".front"); f.style.animation = "none"; void f.offsetWidth; f.style.animation = "";
    setTimeout(() => { if (old && old !== url && old.startsWith("blob:") && !urls.includes(old)) URL.revokeObjectURL(old); }, 2000);
  }
  function setFit(fit, zoom, every) {
    box.dataset.fit = ["fit", "fill", "stretch", "centre"].includes(fit) ? fit : "fit";
    box.classList.toggle("zoom", !!zoom); box.style.setProperty("--every", (every || 10) * 60 + "s");
  }
  function stop() { clearTimeout(timer); timer = 0; run++; }

  // ---------- one picture ----------
  async function single(url, t) { stop(); box.hidden = false; setFit(t.wallFit); box.classList.remove("zoom"); await put(url, false); }

  // ---------- slideshow ----------
  async function gather(src) {
    const out = []; let locked = [];
    if (src === "all" || src === "added") for (const p of await listPics().catch(() => [])) out.push({ id: p.id, name: p.name, get: async () => p.blob });
    if (src !== "added") for (const f of await listPicFolders().catch(() => [])) {
      if (src !== "all" && src !== f.id) continue;
      if (!(await folderAccess(f))) { locked.push(f.name); continue; }
      const entries = await getFolderIndex(f.id); if (!entries) continue;
      for (const e of entries) if (!/\.svg$/i.test(e.name)) out.push({ id: f.id + ":" + e.path, name: e.name, get: () => fileAt(f, e.path) });
    }
    return { out: out.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })), locked };
  }
  async function show(item, fade) {
    const my = run;
    try { const blob = await item.get(); if (my !== run) return; await put(URL.createObjectURL(blob), fade); return true; }
    catch (e) { list = list.filter(x => x !== item); return false; } // gone from the folder: skip it
  }
  function pick(dir = 1) {
    const st = loadState(), i = list.findIndex(x => x.id === st.cur);
    if (conf.slideOrder === "order" || list.length < 3) return list[((i < 0 ? -1 : i) + dir + list.length) % list.length];
    const recent = new Set((st.recent || []).slice(-Math.min(20, Math.floor(list.length / 2))));
    let c = null; for (let k = 0; k < 30; k++) { c = list[Math.floor(Math.random() * list.length)]; if (!recent.has(c.id) && c.id !== st.cur) break; }
    return c;
  }
  async function advance(dir = 1, fade = true) {
    if (!list.length) return;
    let ok = false, item = null;
    for (let tries = 0; tries < 5 && !ok && list.length; tries++) { item = pick(dir); ok = await show(item, fade); }
    if (!ok) return;
    const st = loadState(); saveState({ cur: item.id, at: Date.now(), recent: [...(st.recent || []), item.id].slice(-40), src: conf.slideSrc });
    schedule();
  }
  function schedule(wait) {
    clearTimeout(timer);
    const every = Math.max(1, +conf.slideEvery || 10) * 60000;
    timer = setTimeout(() => { if (document.hidden) { schedule(5000); return; } advance(1, true); }, wait != null ? wait : every);
  }
  async function slideshow(t) {
    stop(); const my = run; conf = t;
    setFit(t.wallFit, t.slideZoom, t.slideEvery);
    const { out, locked } = await gather(t.slideSrc || "all");
    if (my !== run) return;
    list = out;
    if (!list.length) { box.hidden = true; onEmpty && onEmpty(locked); return false; }
    box.hidden = false;
    // carry on with the same picture after a reload, until its time is up
    const st = loadState(), cur = st.src === (t.slideSrc || "all") && list.find(x => x.id === st.cur);
    const every = Math.max(1, +t.slideEvery || 10) * 60000;
    if (cur && await show(cur, false)) schedule(Math.max(1000, every - (Date.now() - (st.at || 0))));
    else await advance(1, false);
    return true;
  }
  return { single, slideshow, stop, next: () => advance(1, true), prev: () => advance(-1, true), hide: () => { stop(); box.hidden = true; }, setFit };
}
