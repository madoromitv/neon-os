// Files: the file manager for folders on your computer
// Places are folders you've linked (here, or in Amp, Photos or Video). Inside them: browse, open things in the
// right app, rename, copy, cut and paste, make folders, delete (small files go to the Bin), search, and preview.
// Reading needs the folder's read permission; changing anything asks for permission to change it, once.
import { esc, toast, dialog, openMenu } from "../../style-kit/ui.js";
import { binPut } from "../../core/bin.js";
import { listFolders } from "../../core/linked.js";
import { listPicFolders } from "../../core/photos.js";

const DB = "neon-os-places";
const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore("places", { keyPath: "id" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function tx(mode, fn) { const db = await idb(); try { return await new Promise((res, rej) => { const t = db.transaction("places", mode), q = fn(t.objectStore("places")); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); } finally { db.close(); } }

// every place: Files' own, plus folders linked in Amp and Photos (the same folder only once)
export async function listPlaces() {
  const own = (await tx("readonly", s => s.getAll()).catch(() => [])) || [];
  const others = [...(await listFolders().catch(() => [])).map(f => ({ id: "m:" + f.id, name: f.name, handle: f.handle, from: "Amp" })), ...(await listPicFolders().catch(() => [])).map(f => ({ id: "p:" + f.id, name: f.name, handle: f.handle, from: "Photos" }))];
  const out = [...own];
  for (const o of others) { let dup = false; for (const x of out) { try { if (await x.handle.isSameEntry(o.handle)) { dup = true; break; } } catch (e) {} } if (!dup) out.push(o); }
  return out;
}
export async function linkPlace() {
  let h; try { h = await showDirectoryPicker({ id: "neon-os-files", mode: "readwrite" }); } catch (e) { return null; }
  const p = { id: "f" + Date.now().toString(36), name: h.name, handle: h }; await tx("readwrite", s => s.put(p)); return p;
}
export const unlinkPlace = id => tx("readwrite", s => s.delete(id));
// the Bin puts a file back where it was (asking to change that folder if needed)
export async function restoreFile(d) {
  const p = (await listPlaces()).find(x => x.id === d.place); if (!p) throw new Error("place gone");
  if (await p.handle.queryPermission({ mode: "readwrite" }) !== "granted" && await p.handle.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("no permission");
  let dir = p.handle; for (const part of d.path || []) dir = await dir.getDirectoryHandle(part, { create: true });
  const name = await freeName(dir, d.name), h = await dir.getFileHandle(name, { create: true }), w = await h.createWritable(); await w.write(d.blob); await w.close();
  return `${p.name}/${[...(d.path || []), name].join("/")}`;
}

const KIND = [[/\.(mp3|flac|wav|ogg|oga|opus|m4a|aac)$/i, "audio", "Music"], [/\.(mp4|m4v|webm|mkv|mov|ogv|avi)$/i, "video", "Video"], [/\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i, "image", "Picture"],
  [/\.(txt|md|markdown|json|csv|log|js|mjs|css|html?|xml|yml|yaml|ini|lrc|srt|vtt|py|sh|ts)$/i, "text", "Text"], [/\.pdf$/i, "pdf", "PDF"], [/\.(zip|rar|7z|tar|gz)$/i, "archive", "Archive"]];
const kindOf = (name, dir) => dir ? ["dir", "Folder"] : (KIND.find(([re]) => re.test(name)) || [, "file", "File"]).slice(1);
const ICON = { dir: "M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", audio: "M12 3v10.55A4 4 0 1 0 14 17V7h4V3z", video: "M3 5h18v14H3zM10 9v6l5-3z", image: "M3 4h18v16H3zM6 17l4-5 3 3.5 2-2.5 3 4z", text: "M5 3h10l4 4v14H5zM8 11h8v1.6H8zm0 3.5h8v1.6H8zm0 3.5h5v1.6H8z", pdf: "M5 3h10l4 4v14H5zM8 12h8v2H8zm0 4h6v2H8z", archive: "M5 3h14v18H5zM11 5v2h2V5zm0 3v2h2V8zm0 3v4h2v-4z", file: "M5 3h10l4 4v14H5z" };
const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[k] || ICON.file}"/></svg>`;
const size = n => n == null ? "" : n >= 1e9 ? (n / 1e9).toFixed(1) + " GB" : n >= 1e6 ? (n / 1e6).toFixed(1) + " MB" : n >= 1e3 ? Math.round(n / 1e3) + " KB" : n + " B";
const when = ms => ms ? new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const BIN_LIMIT = 50e6; // files up to this size can wait in the Bin; bigger ones are deleted for good, after asking

// copying: a file, or a folder and everything in it
async function copyInto(entry, destDir, name = entry.name) {
  if (entry.kind === "file") { const f = await entry.getFile(), h = await destDir.getFileHandle(name, { create: true }), w = await h.createWritable(); await w.write(f); await w.close(); return; }
  const d = await destDir.getDirectoryHandle(name, { create: true });
  for await (const [n, h] of entry.entries()) await copyInto(h, d, n);
}
async function freeName(dir, name) {
  const m = name.match(/^(.*?)(\.[^.]+)?$/);
  for (let i = 1; i < 500; i++) { const n = i === 1 ? name : `${m[1]} (${i})${m[2] || ""}`; let taken = false; try { await dir.getFileHandle(n); taken = true; } catch (e) { try { await dir.getDirectoryHandle(n); taken = true; } catch (e2) {} } if (!taken) return n; }
  return name;
}

// el: where the file manager draws; api: { openFiles(files), toNotes(name, text), toPhotos(file), toBrowser(url), saveAs(blob, name), state, onState(s) }
export function mountFM(el, api) {
  el.innerHTML = `
    <div class="fm-tools">
      <button class="btn" data-a="up" title="Up a folder (Backspace)">↑ Up</button>
      <div class="lcd fm-crumbs" id="fmCrumbs"></div>
      <label class="search"><input type="search" id="fmQ" placeholder="Search this folder" aria-label="Search this folder"></label>
    </div>
    <div class="fm-tools">
      <button class="btn" data-a="open" disabled>Open</button>
      <button class="btn" data-a="newdir">New folder</button>
      <button class="btn" data-a="rename" disabled title="Rename (F2)">Rename</button>
      <button class="btn" data-a="copy" disabled title="Copy (Ctrl+C)">Copy</button>
      <button class="btn" data-a="cut" disabled title="Cut (Ctrl+X)">Cut</button>
      <button class="btn" data-a="paste" disabled title="Paste (Ctrl+V)">Paste</button>
      <button class="btn" data-a="delete" disabled title="Delete (Delete)">Delete</button>
      <span class="fm-sp"></span>
      <span class="seg"><button class="btn" data-view="list" aria-pressed="true" title="List">≡</button><button class="btn" data-view="grid" aria-pressed="false" title="Icons">▦</button></span>
      <button class="btn" data-a="preview" aria-pressed="false" title="Show a preview of the selected file">Preview</button>
    </div>
    <div class="fm-body">
      <div class="lwell fm-list" id="fmList" tabindex="0" role="grid" aria-label="Files in this folder">
        <div class="lhead fm-head" role="row"><span data-sort="name">Name</span><span data-sort="kind">Kind</span><span data-sort="size">Size</span><span data-sort="date">Changed</span></div>
        <div id="fmRows"></div>
      </div>
      <aside class="fm-prev" id="fmPrev" hidden></aside>
    </div>
    <div class="status" id="fmStatus"></div>`;
  const $ = s => el.querySelector(s);
  let place = null, stack = [], entries = [], sel = new Set(), anchor = null, clip = null, q = "", searching = null, prevUrl = null;
  const S = Object.assign({ view: "list", sort: { key: "name", dir: 1 }, preview: false }, api.state || {});
  const saveS = () => api.onState && api.onState({ view: S.view, sort: S.sort, preview: S.preview });
  const dir = () => stack[stack.length - 1];
  const pathText = () => "/" + [place ? place.name : "", ...stack.slice(1).map(d => d.name)].join("/");

  async function can(mode) { try { const h = place.handle; return await h.queryPermission({ mode }) === "granted" || await h.requestPermission({ mode }) === "granted"; } catch (e) { return false; } }
  async function open(p, path = []) {
    place = p; stack = [p.handle]; sel.clear(); q = ""; $("#fmQ").value = "";
    if (!(await can("read"))) { entries = []; draw(`<div class="lempty"><b>${esc(p.name)} needs permission.</b><button class="btn" data-a="grant">Allow access</button></div>`); return; }
    for (const name of path) { try { stack.push(await dir().getDirectoryHandle(name)); } catch (e) { break; } }
    await list();
  }
  async function list() {
    const out = [];
    try {
      for await (const [name, h] of dir().entries()) {
        if (name.startsWith(".")) continue;
        const [kind, kname] = kindOf(name, h.kind === "directory");
        const it = { name, h, kind, kname, size: null, date: 0 };
        out.push(it);
      }
    } catch (e) { toast("Couldn't read this folder.", true); }
    await Promise.all(out.filter(x => x.kind !== "dir").map(async x => { try { const f = await x.h.getFile(); x.size = f.size; x.date = f.lastModified; } catch (e) {} }));
    entries = out; sel = new Set([...sel].filter(n => out.some(x => x.name === n))); draw();
    api.onState && api.onState({ ...S, place: place.id, path: stack.slice(1).map(d => d.name) });
  }
  const sorted = list => {
    const k = S.sort.key, d = S.sort.dir;
    return list.slice().sort((a, b) => (a.kind === "dir") !== (b.kind === "dir") ? (a.kind === "dir" ? -1 : 1)
      : (k === "size" ? (a.size || 0) - (b.size || 0) : k === "date" ? a.date - b.date : k === "kind" ? a.kname.localeCompare(b.kname) : 0) * d || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) * (k === "name" ? d : 1));
  };
  let shown = [];
  function draw(emptyHtml) {
    shown = searching ? searching : sorted(entries.filter(x => !q || x.name.toLowerCase().includes(q)));
    $("#fmCrumbs").innerHTML = [place ? place.name : "", ...stack.slice(1).map(d => d.name)].map((n, i) => `<button data-depth="${i}">${esc(n)}</button>`).join("<i>/</i>");
    const list = $("#fmList"); list.classList.toggle("grid", S.view === "grid");
    el.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === S.view)));
    el.querySelectorAll(".fm-head [data-sort]").forEach(s => { s.dataset.dir = s.dataset.sort === S.sort.key ? (S.sort.dir > 0 ? "asc" : "desc") : ""; });
    $("#fmRows").innerHTML = emptyHtml || (shown.length ? shown.map((x, i) => `<div class="lrow fm-row${sel.has(x.name) ? " sel" : ""}" role="row" data-i="${i}" draggable="true" title="${esc(x.path || x.name)}">
        <span class="fm-name">${svg(x.kind)}<b>${esc(x.name)}</b>${x.path ? `<small>${esc(x.path)}</small>` : ""}</span><span>${esc(x.kname)}</span><span class="num">${size(x.size)}</span><span class="num">${esc(when(x.date))}</span></div>`).join("")
      : `<div class="lempty"><b>${q ? "Nothing matches." : "This folder is empty."}</b>${q ? "" : "Drop files here to copy them in."}</div>`);
    const n = sel.size, one = n === 1 ? entries.find(x => sel.has(x.name)) || (searching || []).find(x => sel.has(x.name)) : null;
    const set = (a, on) => { const b = el.querySelector(`[data-a="${a}"]`); if (b) b.disabled = !on; };
    set("open", n > 0); set("rename", n === 1 && !searching); set("copy", n > 0); set("cut", n > 0 && !searching); set("delete", n > 0); set("paste", !!clip && !searching);
    $("[data-a=\"up\"]").disabled = stack.length < 2 && !searching;
    $("[data-a=\"preview\"]").setAttribute("aria-pressed", String(S.preview));
    const total = entries.reduce((s, x) => s + (x.size || 0), 0);
    $("#fmStatus").textContent = searching ? `${shown.length} found in ${pathText()}` : `${entries.length} item${entries.length === 1 ? "" : "s"} · ${size(total)}${n ? ` · ${n} selected` : ""}${clip ? ` · ${clip.items.length} on the clipboard to ${clip.cut ? "move" : "copy"}` : ""}`;
    showPreview(one);
  }
  // ---------- preview ----------
  async function showPreview(it) {
    const box = $("#fmPrev"); box.hidden = !S.preview; if (!S.preview) return;
    if (prevUrl) { URL.revokeObjectURL(prevUrl); prevUrl = null; }
    if (!it) { box.innerHTML = `<p class="hint">Select a file to see it here.</p>`; return; }
    if (it.kind === "dir") { box.innerHTML = `<div class="fm-big">${svg("dir")}</div><b>${esc(it.name)}</b><p class="hint">Folder</p>`; return; }
    let f; try { f = await it.h.getFile(); } catch (e) { box.innerHTML = `<p class="hint">Can't open this file.</p>`; return; }
    prevUrl = URL.createObjectURL(f);
    const media = it.kind === "image" ? `<img src="${prevUrl}" alt="">` : it.kind === "audio" ? `<audio src="${prevUrl}" controls></audio>` : it.kind === "video" ? `<video src="${prevUrl}" controls muted></video>`
      : it.kind === "text" ? `<pre>${esc((await f.slice(0, 20000).text()))}${f.size > 20000 ? "\n…" : ""}</pre>` : `<div class="fm-big">${svg(it.kind)}</div>`;
    box.innerHTML = `${media}<b>${esc(it.name)}</b><p class="hint">${esc(it.kname)} · ${size(f.size)}<br>${esc(when(f.lastModified))}</p>`;
  }
  // ---------- opening ----------
  async function openItems(items) {
    const dirs = items.filter(x => x.kind === "dir");
    if (dirs.length && items.length === 1) { if (searching) { await goPath(dirs[0].dirPath); } else { stack.push(dirs[0].h); sel.clear(); q = ""; $("#fmQ").value = ""; await list(); } return; }
    const files = []; for (const x of items) if (x.kind !== "dir") { try { files.push({ x, f: await x.h.getFile() }); } catch (e) {} }
    const media = files.filter(({ x }) => x.kind === "audio" || x.kind === "video").map(({ f }) => f);
    if (media.length) api.openFiles(media);
    for (const { x, f } of files) {
      if (x.kind === "image") api.toPhotos(f);
      else if (x.kind === "text") api.toNotes(x.name, await f.text());
      else if (x.kind === "pdf" || /\.html?$/i.test(x.name)) api.toBrowser(URL.createObjectURL(f));
      else if (x.kind !== "audio" && x.kind !== "video") api.saveAs(f, x.name);
    }
  }
  function openWith(it, at) {
    const go = fn => async () => { const f = await it.h.getFile(); fn(f); };
    openMenu(null, [{ label: "Open with" },
      { text: "Amp or Video", run: go(f => api.openFiles([f])) }, { text: "Photos", run: go(f => api.toPhotos(f)) },
      { text: "Notes (as text)", run: go(async f => api.toNotes(it.name, await f.text())) }, { text: "Browser", run: go(f => api.toBrowser(URL.createObjectURL(f))) },
      "-", { text: "Save a copy…", run: go(f => api.saveAs(f, it.name)) }], at);
  }
  // ---------- changing things ----------
  const selected = () => shown.filter(x => sel.has(x.name));
  async function writable() { if (await can("readwrite")) return true; toast(`Neon OS needs permission to change ${place.name}.`, true); return false; }
  async function rename(it) {
    const r = await dialog({ title: "Rename", fields: [{ label: "Name", value: it.name }], confirm: "Rename" }); const name = r && r[0];
    if (!name || name === it.name || /[\\/:*?"<>|]/.test(name)) { if (name && /[\\/:*?"<>|]/.test(name)) toast("Names can't contain \\ / : * ? \" < > |", true); return; }
    if (!(await writable())) return;
    if (entries.some(x => x.name === name)) { toast("Something here already has that name.", true); return; }
    try { if (it.h.move) await it.h.move(name); else throw 0; }
    catch (e) { await copyInto(it.h, dir(), name); await dir().removeEntry(it.name, { recursive: true }); } // no move here: copy, then remove the old one
    sel = new Set([name]); await list();
  }
  async function newDir() {
    if (!(await writable())) return;
    const name = await freeName(dir(), "New folder"); await dir().getDirectoryHandle(name, { create: true });
    sel = new Set([name]); await list(); rename(entries.find(x => x.name === name));
  }
  async function remove(items) {
    if (!(await writable())) return;
    const big = items.filter(x => x.kind === "dir" || (x.size || 0) > BIN_LIMIT);
    const ok = await dialog({ title: items.length === 1 ? `Delete ${items[0].name}` : `Delete ${items.length} items`, text: big.length ? `${big.length === items.length ? "These go" : `${big.map(x => x.name).slice(0, 3).join(", ")}${big.length > 3 ? "…" : ""} go`} for good (folders and files over 50 MB are too big for the Bin)${big.length < items.length ? "; the rest wait in the Bin for 30 days" : ""}.` : "They wait in the Bin for 30 days.", confirm: "Delete", danger: true });
    if (!ok) return;
    let n = 0;
    for (const x of items) {
      try {
        if (!big.includes(x)) { const f = await x.h.getFile(); await binPut("file", x.name, { blob: f, name: x.name, type: f.type, place: place.id, path: [...stack.slice(1).map(d => d.name), ...(x.dirPath ? x.dirPath.slice(0, -1) : [])] }, `${place.name}${pathText().slice(place.name.length + 1) || ""}`); }
        await (x.parent || dir()).removeEntry(x.name, { recursive: true }); n++;
      } catch (e) {}
    }
    toast(n === items.length ? `Deleted ${n} item${n === 1 ? "" : "s"}` : `Deleted ${n} of ${items.length}`, n < items.length);
    sel.clear(); searching = null; await list();
  }
  async function paste() {
    if (!clip || !(await writable())) return;
    let n = 0;
    for (const x of clip.items) {
      try {
        if (clip.cut && clip.dir && await clip.dir.isSameEntry(dir())) continue; // moving to where it already is
        const name = await freeName(dir(), x.name); await copyInto(x.h, dir(), name);
        if (clip.cut) await clip.dir.removeEntry(x.name, { recursive: true });
        n++;
      } catch (e) {}
    }
    if (clip.cut) clip = null;
    toast(`${n} item${n === 1 ? "" : "s"} ${clip ? "copied" : "moved"} here`); await list();
  }
  async function dropIn(files) {
    if (!files.length || !(await writable())) return;
    for (const f of files) { const name = await freeName(dir(), f.name), h = await dir().getFileHandle(name, { create: true }), w = await h.createWritable(); await w.write(f); await w.close(); }
    toast(`Copied ${files.length} file${files.length === 1 ? "" : "s"} into ${dir().name}`); await list();
  }
  // ---------- search: everything below this folder whose name matches ----------
  let searchRun = 0;
  async function search(text) {
    const my = ++searchRun; if (!text) { searching = null; draw(); return; }
    const out = [], low = text.toLowerCase();
    async function walk(d, path, depth) {
      for await (const [name, h] of d.entries()) {
        if (my !== searchRun || out.length > 500) return;
        if (name.startsWith(".")) continue;
        if (name.toLowerCase().includes(low)) { const [kind, kname] = kindOf(name, h.kind === "directory"); const it = { name, h, kind, kname, size: null, date: 0, path: path.join("/"), dirPath: [...path, name], parent: d }; if (h.kind === "file") { try { const f = await h.getFile(); it.size = f.size; it.date = f.lastModified; } catch (e) {} } out.push(it); }
        if (h.kind === "directory" && depth < 8) await walk(h, [...path, name], depth + 1);
      }
    }
    $("#fmStatus").textContent = "Searching…";
    await walk(dir(), [], 0);
    if (my === searchRun) { searching = out; sel.clear(); draw(); }
  }
  async function goPath(path) { searching = null; q = ""; $("#fmQ").value = ""; for (const name of path) { try { stack.push(await dir().getDirectoryHandle(name)); } catch (e) { break; } } sel.clear(); await list(); }

  // ---------- events ----------
  $("#fmRows").addEventListener("click", e => {
    const r = e.target.closest("[data-i]"); if (!r) { if (e.target.closest("[data-a='grant']")) open(place); return; }
    const it = shown[+r.dataset.i];
    if (e.shiftKey && anchor != null) { const a = shown.findIndex(x => x.name === anchor), b = +r.dataset.i; sel = new Set(shown.slice(Math.min(a, b), Math.max(a, b) + 1).map(x => x.name)); }
    else if (e.ctrlKey || e.metaKey) { sel.has(it.name) ? sel.delete(it.name) : sel.add(it.name); anchor = it.name; }
    else { sel = new Set([it.name]); anchor = it.name; }
    draw();
    if (e.detail === 2) openItems([it]);
  });
  $("#fmRows").addEventListener("contextmenu", e => {
    const r = e.target.closest("[data-i]"); e.preventDefault();
    if (!r) { openMenu(null, [{ text: "New folder", run: newDir }, ...(clip ? [{ text: "Paste", key: "Ctrl+V", run: paste }] : []), { text: "Refresh", run: list }], { x: e.clientX, y: e.clientY }); return; }
    const it = shown[+r.dataset.i]; if (!sel.has(it.name)) { sel = new Set([it.name]); draw(); }
    const items = selected(), at = { x: e.clientX, y: e.clientY };
    openMenu(null, [{ text: items.length > 1 ? `Open ${items.length} items` : "Open", key: "Enter", run: () => openItems(items) },
      ...(items.length === 1 && it.kind !== "dir" ? [{ text: "Open with…", run: () => openWith(it, at) }] : []),
      ...(items.length === 1 && it.path != null ? [{ text: "Show in its folder", run: () => goPath(it.dirPath.slice(0, -1)) }] : []),
      "-", ...(items.length === 1 && !searching ? [{ text: "Rename", key: "F2", run: () => rename(it) }] : []),
      { text: "Copy", key: "Ctrl+C", run: () => { clip = { items, cut: false, dir: dir() }; draw(); } },
      ...(!searching ? [{ text: "Cut", key: "Ctrl+X", run: () => { clip = { items, cut: true, dir: dir() }; draw(); } }] : []),
      "-", { text: "Delete", key: "Delete", danger: true, run: () => remove(items) }], at);
  });
  $("#fmRows").addEventListener("dragstart", e => { const r = e.target.closest("[data-i]"); if (!r) return; const it = shown[+r.dataset.i]; if (!sel.has(it.name)) { sel = new Set([it.name]); } e.dataTransfer.setData("text/x-neon-files", "1"); dragging = selected(); });
  let dragging = null;
  $("#fmRows").addEventListener("dragover", e => { if (e.dataTransfer.types.includes("Files") || dragging) { e.preventDefault(); const r = e.target.closest("[data-i]"); el.querySelectorAll(".fm-row.drop").forEach(x => x.classList.remove("drop")); if (r && shown[+r.dataset.i].kind === "dir" && dragging) r.classList.add("drop"); } });
  $("#fmRows").addEventListener("drop", async e => {
    e.preventDefault(); el.querySelectorAll(".fm-row.drop").forEach(x => x.classList.remove("drop"));
    const r = e.target.closest("[data-i]"), target = r && shown[+r.dataset.i];
    if (dragging && target && target.kind === "dir" && !dragging.includes(target)) { // drag onto a folder: move into it
      if (!(await writable())) { dragging = null; return; }
      for (const x of dragging) { try { const name = await freeName(target.h, x.name); await copyInto(x.h, target.h, name); await (x.parent || dir()).removeEntry(x.name, { recursive: true }); } catch (err) {} }
      toast(`Moved into ${target.name}`); dragging = null; await list(); return;
    }
    dragging = null; if (e.dataTransfer.files.length) dropIn([...e.dataTransfer.files]);
  });
  $("#fmCrumbs").addEventListener("click", async e => { const b = e.target.closest("[data-depth]"); if (!b) return; stack = stack.slice(0, +b.dataset.depth + 1); searching = null; q = ""; $("#fmQ").value = ""; sel.clear(); await list(); });
  el.querySelector(".fm-head").addEventListener("click", e => { const s = e.target.closest("[data-sort]"); if (!s) return; S.sort = { key: s.dataset.sort, dir: S.sort.key === s.dataset.sort ? -S.sort.dir : 1 }; saveS(); draw(); });
  el.addEventListener("click", e => {
    const b = e.target.closest("[data-a], [data-view]"); if (!b || b.closest("#fmRows")) return;
    if (b.dataset.view) { S.view = b.dataset.view; saveS(); draw(); return; }
    const a = b.dataset.a, items = selected();
    if (a === "up") { if (searching) { searching = null; q = ""; $("#fmQ").value = ""; draw(); } else if (stack.length > 1) { stack.pop(); sel.clear(); list(); } }
    else if (a === "open") openItems(items); else if (a === "newdir") newDir(); else if (a === "rename" && items[0]) rename(items[0]);
    else if (a === "copy") { clip = { items, cut: false, dir: dir() }; draw(); } else if (a === "cut") { clip = { items, cut: true, dir: dir() }; draw(); }
    else if (a === "paste") paste(); else if (a === "delete") remove(items);
    else if (a === "preview") { S.preview = !S.preview; saveS(); draw(); }
  });
  let qT = 0; $("#fmQ").addEventListener("input", () => { q = $("#fmQ").value.trim().toLowerCase(); clearTimeout(qT); qT = setTimeout(() => search(q), 300); });
  $("#fmList").addEventListener("keydown", e => {
    const items = selected(), c = e.ctrlKey || e.metaKey;
    if (e.key === "Enter" && items.length) { e.preventDefault(); openItems(items); }
    else if (e.key === "Backspace") { e.preventDefault(); $("[data-a=\"up\"]").click(); }
    else if (e.key === "Delete" && items.length) { e.preventDefault(); remove(items); }
    else if (e.key === "F2" && items.length === 1) { e.preventDefault(); rename(items[0]); }
    else if (c && e.code === "KeyA") { e.preventDefault(); sel = new Set(shown.map(x => x.name)); draw(); }
    else if (c && e.code === "KeyC" && items.length) { clip = { items, cut: false, dir: dir() }; draw(); }
    else if (c && e.code === "KeyX" && items.length && !searching) { clip = { items, cut: true, dir: dir() }; draw(); }
    else if (c && e.code === "KeyV") { e.preventDefault(); paste(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); const i = shown.findIndex(x => x.name === anchor), n = Math.max(0, Math.min(shown.length - 1, (i < 0 ? -1 : i) + (e.key === "ArrowDown" ? 1 : -1)));
      if (shown[n]) { anchor = shown[n].name; sel = e.shiftKey ? new Set([...sel, anchor]) : new Set([anchor]); draw(); el.querySelector(`[data-i="${n}"]`)?.scrollIntoView({ block: "nearest" }); }
    }
  });
  return { open, refresh: list, get place() { return place; } };
}
