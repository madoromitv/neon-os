// Arcade: Beat, a rhythm game played to your own songs
// The notes come from the song's own analysis: kicks, snares, the mids and the hats each fall down a lane, thinned
// out by difficulty. Hit D F J K (or tap the lanes) as each note crosses the line. Perfect, great and good hits
// build a combo; the best score for each song and difficulty is kept.
import { mixOut } from "../../core/mixer.js";
let beatOut = null;
const LANES = 4, KEYS = ["d", "f", "j", "k"], WINDOWS = [[0.045, "PERFECT", 300], [0.09, "GREAT", 200], [0.14, "GOOD", 100]];
const DIFF = { easy: { min: 0.6, gap: 0.42, speed: 1.2 }, normal: { min: 0.4, gap: 0.22, speed: 1.0 }, hard: { min: 0.25, gap: 0.12, speed: 0.8 } };
// the bands a song's analysis has: Kick, Bass, Body, Lead, Snare, Hats → lanes
const LANE_OF = { Kick: 0, Snare: 1, Body: 2, Lead: 2, Hats: 3, Bass: 0 };

export function chart(an, diff) {
  const d = DIFF[diff] || DIFF.normal, off = typeof an.offset === "number" ? an.offset : 1024 / 22050, notes = [];
  for (const b of an.bands || []) {
    const lane = LANE_OF[b.name]; if (lane == null) continue;
    b.onsets.forEach((t, i) => { if ((b.strength[i] || 0) >= d.min) notes.push({ t: t + off, lane, s: b.strength[i] }); });
  }
  notes.sort((a, b) => a.t - b.t || b.s - a.s);
  const out = [], lastLane = [-9, -9, -9, -9]; let last = -9;
  for (const n of notes) { if (n.t - last < d.gap * 0.5 || n.t - lastLane[n.lane] < d.gap) continue; out.push({ t: n.t, lane: n.lane, hit: null }); last = n.t; lastLane[n.lane] = n.t; }
  return out;
}

export function mountBeat(el, { save, state, library, fileOf }) {
  el.innerHTML = `<div class="bt-pick" id="btPick">
      <div class="row"><span class="lbl">Song</span><select id="btSong" aria-label="Song"></select><span class="seg" id="btDiff"><button class="btn" data-d="easy">Easy</button><button class="btn" data-d="normal">Normal</button><button class="btn" data-d="hard">Hard</button></span><button class="btn" id="btGo">Play</button></div>
      <p class="hint" id="btInfo">Keys D F J K, or tap the lanes. Songs need their beats worked out first (Amp does it after adding them).</p></div>
    <div class="bt-stage" id="btStage"><canvas id="btCv"></canvas><div class="bt-hud"><span class="lcd" id="btScore">0</span><span class="lcd" id="btCombo"></span><span class="bt-judge" id="btJudge"></span></div>
      <div class="bt-end" id="btEnd" hidden></div></div>`;
  const $ = s => el.querySelector(s), cv = $("#btCv");
  let diff = state.diff || "normal", songs = [], ac = null, src = null, notes = [], startAt = 0, raf = 0, playing = false, score = 0, combo = 0, maxCombo = 0, counts = {}, judge = { text: "", t: 0 }, flashes = [0, 0, 0, 0], song = null;
  const best = state.best || {};
  const syncDiff = () => el.querySelectorAll("[data-d]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.d === diff)));
  async function loadSongs() {
    const all = await library(); songs = all.filter(t => t.analysis && t.analysis.bands && (t.blob || t.link));
    $("#btSong").innerHTML = songs.length ? songs.map(t => `<option value="${t.id}">${(t.title || "Untitled").replace(/</g, "&lt;")}${t.artist ? " · " + t.artist.replace(/</g, "&lt;") : ""}</option>`).join("") : `<option value="">No songs ready yet</option>`;
    if (state.song && songs.some(t => t.id === state.song)) $("#btSong").value = state.song;
    $("#btGo").disabled = !songs.length;
  }
  const now = () => ac ? ac.currentTime - startAt - (ac.outputLatency || 0) : 0;
  async function start() {
    const t = songs.find(x => x.id === $("#btSong").value); if (!t) return;
    song = t; save({ song: t.id, diff });
    ac = ac || new AudioContext(); if (ac.state !== "running") await ac.resume();
    $("#btGo").disabled = true; $("#btGo").textContent = "Loading…";
    let buf; try { buf = await ac.decodeAudioData(await (await fileOf(t)).arrayBuffer()); } catch (e) { $("#btGo").disabled = false; $("#btGo").textContent = "Play"; $("#btInfo").textContent = "Couldn't open that song (if it's in a linked folder, play it in Amp first)."; return; }
    notes = chart(t.analysis, diff); score = 0; combo = 0; maxCombo = 0; counts = { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 };
    stop(); src = ac.createBufferSource(); src.buffer = buf; src.connect(beatOut || (beatOut = mixOut(ac, "arcade"))); startAt = ac.currentTime + 2; src.start(startAt); // two seconds to get ready
    src.onended = () => { if (playing) finish(); };
    playing = true; $("#btEnd").hidden = true; $("#btGo").disabled = false; $("#btGo").textContent = "Restart";
    if (parent !== window) parent.postMessage({ neonOs: "pause-music" }, location.origin);
    cancelAnimationFrame(raf); draw();
  }
  function stop() { playing = false; if (src) { src.onended = null; try { src.stop(); } catch (e) {} src = null; } }
  function hit(lane) {
    if (!playing) return; flashes[lane] = performance.now();
    const t = now(); let best = null;
    for (const n of notes) { if (n.hit || n.lane !== lane) continue; const d = Math.abs(n.t - t); if (d <= WINDOWS[2][0] && (!best || d < Math.abs(best.t - t))) best = n; if (n.t - t > 0.3) break; }
    if (!best) return;
    const d = Math.abs(best.t - t), [, name, pts] = WINDOWS.find(w => d <= w[0]);
    best.hit = name; counts[name]++; combo++; maxCombo = Math.max(maxCombo, combo); score += pts * (1 + Math.min(combo, 50) / 50); judge = { text: name, t: performance.now() };
  }
  function finish() {
    stop(); const total = notes.length || 1, acc = (counts.PERFECT + counts.GREAT * 0.7 + counts.GOOD * 0.4) / total, key = `${song.id}|${diff}`, s = Math.round(score);
    const grade = acc > 0.95 ? "S" : acc > 0.85 ? "A" : acc > 0.7 ? "B" : acc > 0.5 ? "C" : "D", isBest = !best[key] || s > best[key];
    if (isBest) { best[key] = s; save({ best }); }
    $("#btEnd").hidden = false;
    $("#btEnd").innerHTML = `<b class="bt-grade">${grade}</b><div class="lcd bt-final">${s.toLocaleString()}</div>${isBest ? "<p>New best for this song!</p>" : `<p>Best ${best[key].toLocaleString()}</p>`}
      <p>${Math.round(acc * 100)}% · combo ${maxCombo} · perfect ${counts.PERFECT} · great ${counts.GREAT} · good ${counts.GOOD} · missed ${counts.MISS}</p><button class="btn" id="btAgain">Play again</button>`;
    $("#btAgain").addEventListener("click", start);
  }
  function draw() {
    raf = requestAnimationFrame(draw);
    const d = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
    const g = cv.getContext("2d"); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
    const col = getComputedStyle(document.documentElement).getPropertyValue("--ball").trim() || "#3ff2ff";
    const lw = Math.min(110, w / 6), x0 = (w - lw * LANES) / 2, lineY = h - 70, speed = (DIFF[diff] || DIFF.normal).speed, px = lineY / speed, t = now();
    for (let l = 0; l < LANES; l++) {
      const x = x0 + l * lw, fl = Math.max(0, 1 - (performance.now() - flashes[l]) / 160);
      g.fillStyle = `rgba(255,255,255,${0.03 + (l % 2) * 0.02})`; g.fillRect(x + 2, 0, lw - 4, h);
      if (fl) { const gr = g.createLinearGradient(0, lineY, 0, lineY - 140); gr.addColorStop(0, col); gr.addColorStop(1, "transparent"); g.globalAlpha = fl * 0.5; g.fillStyle = gr; g.fillRect(x + 2, lineY - 140, lw - 4, 140); g.globalAlpha = 1; }
      g.fillStyle = "#9a91b4"; g.font = "16px VT323, monospace"; g.textAlign = "center"; g.fillText(KEYS[l].toUpperCase(), x + lw / 2, h - 30);
    }
    g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 12; g.fillRect(x0, lineY - 2, lw * LANES, 4); g.shadowBlur = 0;
    for (const n of notes) {
      if (playing && !n.hit && t - n.t > WINDOWS[2][0]) { n.hit = "MISS"; counts.MISS++; combo = 0; judge = { text: "MISS", t: performance.now() }; }
      const y = lineY - (n.t - t) * px; if (y < -20) break; if (y > h + 20 || n.hit && n.hit !== "MISS") continue;
      const x = x0 + n.lane * lw;
      g.globalAlpha = n.hit === "MISS" ? 0.25 : 1; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 14;
      g.beginPath(); g.roundRect ? g.roundRect(x + 8, y - 8, lw - 16, 16, 6) : g.rect(x + 8, y - 8, lw - 16, 16); g.fill(); g.shadowBlur = 0; g.globalAlpha = 1;
    }
    $("#btScore").textContent = Math.round(score).toLocaleString(); $("#btCombo").textContent = combo > 2 ? `${combo} COMBO` : "";
    const ja = Math.max(0, 1 - (performance.now() - judge.t) / 600); $("#btJudge").textContent = ja ? judge.text : ""; $("#btJudge").style.opacity = ja; $("#btJudge").dataset.j = judge.text;
    if (!playing && !notes.length) cancelAnimationFrame(raf);
  }
  const keyDown = e => { if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.target.closest && e.target.closest("select, input"))) return; const l = KEYS.indexOf(e.key.toLowerCase()); if (l >= 0 && playing) { e.preventDefault(); hit(l); } else if (e.key === "Escape" && playing) { stop(); finish(); } };
  addEventListener("keydown", keyDown);
  cv.addEventListener("pointerdown", e => { const r = cv.getBoundingClientRect(), lw = Math.min(110, r.width / 6), x0 = (r.width - lw * LANES) / 2, l = Math.floor((e.clientX - r.left - x0) / lw); if (l >= 0 && l < LANES) hit(l); });
  $("#btGo").addEventListener("click", start);
  $("#btDiff").addEventListener("click", e => { const b = e.target.closest("[data-d]"); if (b) { diff = b.dataset.d; syncDiff(); save({ diff }); } });
  syncDiff(); loadSongs();
  window.__beatNow = () => playing ? now() : null; // the game's clock (the tests use it)
  return { stop, loadSongs, get notes() { return notes; }, hit, get score() { return score; } };
}
