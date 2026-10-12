// Neon OS core: editing song details
// editDetails(): one song or many at once, with cover art. With several songs, only the fields you change are
// written; the rest keep each song's own value. tidyNames(): finds artists, albums and genres spelled several
// ways ("The Weeknd" / "the weeknd", "K-Pop" / "Kpop") and merges each set into one spelling.
// Both take save(track, patch), so each app writes the change its own way. Shared by Amp and Files.
import { esc } from "../style-kit/ui.js";
import { shrinkCover } from "./tags.js";

const FIELDS = [["title", "Title"], ["artist", "Artist"], ["album", "Album"], ["genre", "Genre"], ["year", "Year"]];
const NOTE = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 3v10.55A4 4 0 1 0 14 17V7h4V3z\"/></svg>";

function modal(html, cls) {
  const scrim = document.createElement("div"); scrim.className = "scrim";
  scrim.innerHTML = `<div class="win dialog lit ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(scrim);
  return scrim;
}
function closer(scrim, resolve) {
  const prev = document.activeElement;
  const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); close(false); } };
  const close = v => { scrim.remove(); document.removeEventListener("keydown", onKey, true); if (prev && prev.focus) prev.focus(); resolve(v); };
  document.addEventListener("keydown", onKey, true);
  scrim.addEventListener("mousedown", e => { if (e.target === scrim) close(false); });
  return close;
}

// tracks: the songs to edit. all: the whole library (to give a cover to the rest of an album).
// Resolves to the number of songs changed (0 if cancelled).
export function editDetails(tracks, { all = [], save }) {
  return new Promise(resolve => {
    const many = tracks.length > 1, first = tracks[0];
    const same = k => tracks.every(t => (t[k] || "") === (first[k] || "")) ? (first[k] || "") : null;
    const fields = FIELDS.filter(([k]) => !(many && k === "title"));
    let cover = undefined; // undefined: unchanged; null: removed; Blob: new
    const curCover = !many && first.coverBlob ? URL.createObjectURL(first.coverBlob) : null;
    const scrim = modal(`<div class="titlebar"><span class="ttl">${many ? `Edit ${tracks.length} songs` : "Edit details"}</span></div>
      <form class="wbody">
        ${many ? `<p>Fields left as they are keep each song's own value. Change a field to set it for all ${tracks.length} songs.</p>` : ""}
        <div class="dgrid">
          <div class="cover">
            <div class="art" id="dArt">${curCover ? `<img src="${curCover}" alt="Cover art">` : NOTE}</div>
            <button type="button" class="btn" id="dPick">${many ? "Set cover…" : first.coverBlob ? "Change cover…" : "Add cover…"}</button>
            <button type="button" class="btn" id="dDrop"${!many && !first.coverBlob ? " hidden" : ""}>Remove cover</button>
            <input type="file" id="dFile" accept="image/*" hidden>
          </div>
          <div class="fields">${fields.map(([k, label]) => { const v = same(k); return `<label><span class="lbl">${label}</span><input data-k="${k}" type="text" maxlength="200" value="${esc(v || "")}"${v === null ? ' placeholder="Mixed: each song keeps its own"' : ""}></label>`; }).join("")}
            ${!many && first.album ? `<label class="chk"><input type="checkbox" id="dAlbum"> Use this cover for every song on ${esc(first.album)}</label>` : ""}
          </div>
        </div>
        <div class="acts"><button type="button" class="btn" data-x>Cancel</button><button type="submit" class="btn">Save</button></div>
      </form>`, "details");
    const close = v => { if (curCover) URL.revokeObjectURL(curCover); done(v); };
    const done = closer(scrim, resolve);
    const $ = s => scrim.querySelector(s), dirty = new Set();
    scrim.querySelectorAll("[data-k]").forEach(i => i.addEventListener("input", () => dirty.add(i.dataset.k)));
    $("[data-x]").addEventListener("click", () => close(0));
    $("#dPick").addEventListener("click", () => $("#dFile").click());
    $("#dFile").addEventListener("change", async e => {
      const f = e.target.files[0]; if (!f) return;
      const go = $("form [type=submit]"); go.disabled = true; // wait for the picture before saving
      const b = await shrinkCover(f); go.disabled = false;
      if (!b) { $("#dArt").title = "That picture couldn't be read"; return; }
      cover = b; $("#dArt").innerHTML = `<img src="${URL.createObjectURL(b)}" alt="New cover art">`; $("#dDrop").hidden = false;
    });
    $("#dDrop").addEventListener("click", () => { cover = null; $("#dArt").innerHTML = NOTE; $("#dDrop").hidden = true; });
    $("form").addEventListener("submit", async e => {
      e.preventDefault();
      const patch = {};
      for (const k of dirty) { const v = $(`[data-k="${k}"]`).value.trim(); if (k === "title" && !v) continue; patch[k] = v; }
      if (cover !== undefined) { patch.coverBlob = cover; patch.coverEdited = !!cover; } // picked by hand: travels with sync
      let targets = tracks;
      const albumToo = $("#dAlbum") && $("#dAlbum").checked && (cover || (cover === undefined && first.coverBlob));
      if (!Object.keys(patch).length && !albumToo) { close(0); return; }
      $("form [type=submit]").disabled = true; $("form [type=submit]").textContent = "Saving…";
      let n = 0;
      for (const t of targets) { if (Object.keys(patch).length) { await save(t, { ...patch }); n++; } }
      if (albumToo) { // the rest of the album (same album, same artist) gets the same cover
        const art = cover || first.coverBlob, key = (t => `${(t.album || "").toLowerCase()}|${(t.artist || "").toLowerCase()}`);
        const k = key({ ...first, ...patch });
        for (const t of all) if (t.id !== first.id && key(t) === k) { await save(t, { coverBlob: art, coverEdited: true }); n++; }
      }
      close(n);
    });
    (scrim.querySelector("[data-k]") || $("#dPick")).focus();
  });
}

// ---------- tidy names ----------
// Two spellings count as the same name when they match ignoring case, accents, spaces, punctuation, a leading
// "The" and "&" versus "and". Albums only match within the same artist.
export const nameKey = s => (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/^the\s+/, "").replace(/&/g, "and").replace(/[^\p{L}\p{N}]+/gu, "");
const caps = s => (s.match(/\p{Lu}/gu) || []).length;
const KINDS = [["artist", "Artists"], ["album", "Albums"], ["genre", "Genres"]];
export function nameSets(tracks, kind) {
  const sets = new Map();
  for (const t of tracks) {
    const v = (t[kind] || "").trim(); if (!v) continue;
    const k = nameKey(v) + (kind === "album" ? "|" + nameKey(t.artist) : ""); if (!k || k === "|") continue;
    if (!sets.has(k)) sets.set(k, new Map());
    const m = sets.get(k); m.set(v, (m.get(v) || 0) + 1);
  }
  return [...sets.values()].filter(m => m.size > 1)
    .map(m => [...m.entries()].sort((a, b) => b[1] - a[1] || caps(b[0]) - caps(a[0]) || a[0].localeCompare(b[0]))) // most used first; on a tie, the capitalised one
    .sort((a, b) => a[0][0].localeCompare(b[0][0], undefined, { sensitivity: "base" }));
}
// Resolves to the number of songs changed.
export function tidyNames(tracks, { save, kind = "artist" }) {
  return new Promise(resolve => {
    const scrim = modal(`<div class="titlebar"><span class="ttl">Tidy names</span></div>
      <div class="wbody">
        <p>Names spelled more than one way. Pick the spelling to keep for each; every song with another spelling is changed to it.</p>
        <div class="seg" id="tKinds">${KINDS.map(([k, l]) => `<button type="button" class="btn" data-kind="${k}">${l}</button>`).join("")}</div>
        <div class="tlist" id="tList"></div>
        <div class="acts"><span class="hint" id="tNote"></span><button type="button" class="btn" data-x>Close</button><button type="button" class="btn" id="tGo">Merge</button></div>
      </div>`, "tidy");
    const done = closer(scrim, resolve), $ = s => scrim.querySelector(s);
    let sets = [], changed = 0;
    function draw() {
      sets = nameSets(tracks, kind);
      scrim.querySelectorAll("[data-kind]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.kind === kind)));
      $("#tList").innerHTML = sets.length ? sets.map((s, i) => `<fieldset class="tset"><legend><label><input type="checkbox" data-on="${i}" checked> Merge</label></legend>
        ${s.map(([name, n], j) => `<label class="tname"><input type="radio" name="t${i}" value="${j}"${j ? "" : " checked"}> <span>${esc(name)}</span><small>${n} song${n === 1 ? "" : "s"}</small></label>`).join("")}</fieldset>`).join("")
        : `<p class="tempty">No ${KINDS.find(k => k[0] === kind)[1].toLowerCase()} spelled more than one way.</p>`;
      $("#tGo").disabled = !sets.length;
      $("#tGo").textContent = sets.length ? `Merge ${sets.length} name${sets.length === 1 ? "" : "s"}` : "Merge";
    }
    $("#tList").addEventListener("change", () => { const n = scrim.querySelectorAll("[data-on]:checked").length; $("#tGo").disabled = !n; $("#tGo").textContent = n ? `Merge ${n} name${n === 1 ? "" : "s"}` : "Merge"; });
    $("#tKinds").addEventListener("click", e => { const b = e.target.closest("[data-kind]"); if (b) { kind = b.dataset.kind; draw(); } });
    $("[data-x]").addEventListener("click", () => done(changed));
    $("#tGo").addEventListener("click", async () => {
      $("#tGo").disabled = true; $("#tGo").textContent = "Merging…";
      for (const [i, s] of sets.entries()) {
        if (!scrim.querySelector(`[data-on="${i}"]`).checked) continue;
        const keep = s[+scrim.querySelector(`[name="t${i}"]:checked`).value][0], others = new Set(s.map(x => x[0]).filter(x => x !== keep));
        const artistKey = kind === "album" ? nameKey(tracks.find(t => others.has((t.album || "").trim()) || (t.album || "").trim() === keep)?.artist) : null;
        for (const t of tracks) {
          if (!others.has((t[kind] || "").trim())) continue;
          if (artistKey !== null && nameKey(t.artist) !== artistKey) continue;
          await save(t, { [kind]: keep }); t[kind] = keep; changed++;
        }
      }
      $("#tNote").textContent = changed ? `${changed} song${changed === 1 ? "" : "s"} changed.` : "";
      draw();
    });
    draw();
    scrim.querySelector(`[data-kind="${kind}"]`).focus();
  });
}
