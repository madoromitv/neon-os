// Arcade: Mines
// Clear the field without touching a mine. Left-click opens a square, right-click (or a long press) flags it,
// clicking a number whose flags are all placed opens the squares around it. The first click is never a mine.
const LEVELS = { easy: [9, 9, 10], medium: [16, 16, 40], hard: [30, 16, 99] };
export function mountMines(el, { save, state }) {
  el.innerHTML = `<div class="mn-top"><span class="seg" id="mnLv"><button class="btn" data-lv="easy">Easy</button><button class="btn" data-lv="medium">Medium</button><button class="btn" data-lv="hard">Hard</button></span>
    <span class="lcd mn-n" id="mnLeft" title="Mines left">010</span><button class="btn mn-face" id="mnNew" title="New game (N)">☺</button><span class="lcd mn-n" id="mnTime" title="Seconds">000</span><span class="hint" id="mnBest"></span></div>
    <div class="mn-board" id="mnBoard" role="grid" aria-label="Minefield"></div>`;
  const $ = s => el.querySelector(s);
  let lv = state.level || "easy", W, H, N, cells, opened, flags, over, started, t0, tick;
  const best = state.best || {};
  const idx = (x, y) => y * W + x, around = i => { const x = i % W, y = Math.floor(i / W), out = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if ((dx || dy) && nx >= 0 && ny >= 0 && nx < W && ny < H) out.push(idx(nx, ny)); } return out; };
  function reset() {
    [W, H, N] = LEVELS[lv]; cells = new Array(W * H).fill(0); opened = new Set(); flags = new Set(); over = false; started = false; clearInterval(tick);
    el.querySelectorAll("[data-lv]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lv === lv)));
    $("#mnTime").textContent = "000"; $("#mnNew").textContent = "☺";
    $("#mnBest").textContent = best[lv] ? `Best ${best[lv]} s` : "";
    const b = $("#mnBoard"); b.style.gridTemplateColumns = `repeat(${W}, var(--mn, 26px))`;
    b.innerHTML = cells.map((_, i) => `<button class="mn-c" data-i="${i}" role="gridcell" aria-label="Hidden"></button>`).join("");
    count();
  }
  function lay(safe) { // mines anywhere but the first click and its neighbours
    const keep = new Set([safe, ...around(safe)]); let n = 0;
    while (n < N) { const i = Math.floor(Math.random() * W * H); if (cells[i] === -1 || keep.has(i)) continue; cells[i] = -1; n++; }
    for (let i = 0; i < cells.length; i++) if (cells[i] !== -1) cells[i] = around(i).filter(j => cells[j] === -1).length;
    started = true; t0 = Date.now(); tick = setInterval(() => { $("#mnTime").textContent = String(Math.min(999, Math.floor((Date.now() - t0) / 1000))).padStart(3, "0"); }, 250);
  }
  const btn = i => $(`[data-i="${i}"]`);
  function open(i) {
    if (over || opened.has(i) || flags.has(i)) return;
    if (!started) lay(i);
    if (cells[i] === -1) return lose(i);
    const stack = [i];
    while (stack.length) { const c = stack.pop(); if (opened.has(c) || flags.has(c)) continue; opened.add(c); const b = btn(c); b.classList.add("open"); b.dataset.n = cells[c]; b.textContent = cells[c] || ""; b.setAttribute("aria-label", cells[c] ? `${cells[c]} mines near` : "Empty"); if (cells[c] === 0) stack.push(...around(c)); }
    if (opened.size === W * H - N) win();
  }
  function chord(i) { if (!opened.has(i) || !cells[i]) return; const ns = around(i); if (ns.filter(j => flags.has(j)).length === cells[i]) ns.forEach(open); }
  function flag(i) { if (over || opened.has(i)) return; flags.has(i) ? flags.delete(i) : flags.add(i); const b = btn(i); b.classList.toggle("flag", flags.has(i)); b.textContent = flags.has(i) ? "⚑" : ""; b.setAttribute("aria-label", flags.has(i) ? "Flagged" : "Hidden"); count(); }
  const count = () => { $("#mnLeft").textContent = String(Math.max(-99, N - flags.size)).padStart(3, "0"); };
  function lose(i) { over = true; clearInterval(tick); $("#mnNew").textContent = "✖"; cells.forEach((c, j) => { if (c === -1) { const b = btn(j); b.classList.add("mine"); b.textContent = "✸"; } }); btn(i).classList.add("boom"); }
  function win() {
    over = true; clearInterval(tick); $("#mnNew").textContent = "★"; const s = Math.floor((Date.now() - t0) / 1000);
    cells.forEach((c, j) => { if (c === -1 && !flags.has(j)) flag(j); });
    if (!best[lv] || s < best[lv]) { best[lv] = s; save({ best }); $("#mnBest").textContent = `New best: ${s} s`; } else $("#mnBest").textContent = `Cleared in ${s} s · best ${best[lv]} s`;
  }
  const b = $("#mnBoard");
  b.addEventListener("click", e => { const c = e.target.closest("[data-i]"); if (!c) return; const i = +c.dataset.i; opened.has(i) ? chord(i) : open(i); });
  b.addEventListener("contextmenu", e => { const c = e.target.closest("[data-i]"); if (!c) return; e.preventDefault(); flag(+c.dataset.i); });
  let press = 0; b.addEventListener("pointerdown", e => { if (e.pointerType !== "touch") return; const c = e.target.closest("[data-i]"); if (!c) return; press = setTimeout(() => { flag(+c.dataset.i); press = -1; }, 450); });
  b.addEventListener("pointerup", e => { if (press === -1) e.preventDefault(); clearTimeout(press); });
  $("#mnNew").addEventListener("click", reset);
  $("#mnLv").addEventListener("click", e => { const x = e.target.closest("[data-lv]"); if (!x) return; lv = x.dataset.lv; save({ level: lv }); reset(); });
  el.addEventListener("keydown", e => { if (e.key.toLowerCase() === "n" && !e.ctrlKey) reset(); });
  reset();
  return { reset, get cells() { return cells; }, get over() { return over; }, open, flag };
}
