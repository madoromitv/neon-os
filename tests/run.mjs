// Neon OS browser tests: opens the desktop and every app in headless Chromium and checks they work.
// Run from the repo root: python tests/fixtures.py && node tests/run.mjs
// (set PLAYWRIGHT to a path if Playwright isn't installed in this folder)
import { spawn } from "child_process";
import fs from "fs";
const { chromium } = await import(process.env.PLAYWRIGHT || "playwright");
const PORT = 8765, URL = `http://localhost:${PORT}/`, FX = "tests/.fixtures/";
const VERSION = fs.readFileSync("core/version.js", "utf8").match(/VERSION = "([^"]+)"/)[1];
const server = spawn("python3", ["-m", "http.server", String(PORT)], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 800));
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
let failed = 0, passed = 0;
let current = "";
// on GitHub each failure is also an annotation on the run, so it shows without opening the log
const check = (ok, what) => { if (ok) { passed++; console.log("  ok   " + what); } else { failed++; console.log("  FAIL " + what); if (process.env.GITHUB_ACTIONS) console.log(`::error title=${current.replace(/[:,\n]/g, " ")}::${String(what).replace(/\n/g, " ").slice(0, 400)}`); } };
async function page(opts = {}, { fresh = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true, ...opts });
  const p = await ctx.newPage(); p.errors = [];
  p.on("pageerror", e => p.errors.push(e.message));
  p.on("console", m => { if (m.type() === "error" && !/fonts|ERR_|Failed to load resource|Refused to (frame|display)/.test(m.text())) p.errors.push(m.text()); });
  await p.addInitScript(([v, fresh]) => { try { if (location.protocol === "http:" && location.port === "8765" && !sessionStorage.getItem("t")) { localStorage.setItem("neon-os:theme", JSON.stringify({ ball: "cyan", boot: false })); localStorage.setItem("neon-os:ask-save", "off"); if (!fresh) localStorage.setItem("neon-os:seen-version", v); sessionStorage.setItem("t", "1"); } } catch (e) {} }, [VERSION, fresh]); // pages in the Browser's tabs (other sites, error pages) are left alone
  return p;
}
const lib = p => p.evaluate(() => import("./core/backup.js").then(m => m.librarySummary()));
const wavTail = (path, from) => { const d = fs.readFileSync(path), sr = d.readUInt32LE(24), ch = d.readUInt16LE(22); let s = 0, n = 0; for (let o = 44 + Math.floor(from * sr) * ch * 2; o + 1 < d.length; o += 2) { const v = d.readInt16LE(o) / 32768; s += v * v; n++; } return n ? Math.sqrt(s / n) : 0; };
async function desk(p) { await p.goto(URL); await p.waitForTimeout(900); }
async function amp(p, files) { await p.keyboard.press("Control+Alt+Digit1"); await p.waitForSelector('[data-wid="amp:winMain"]'); await p.waitForTimeout(600); if (files) { await p.setInputFiles("#fileIn", files.map(f => FX + f)); await p.waitForTimeout(2500); } }
const tests = {
  async "welcome, About and What's new"() {
    const p = await page({}, { fresh: true }); await desk(p);
    check(!!(await p.$(".dialog.welcome")), "first visit shows the welcome");
    await p.click(".welcome [data-amp]"); await p.waitForSelector('[data-wid="amp:winMain"]');
    check(!(await p.$(".dialog.welcome")), "Open Amp closes it and opens Amp");
    await p.evaluate(() => localStorage.setItem("neon-os:seen-version", "0.9")); await p.reload(); await p.waitForTimeout(1500);
    check(!(await p.$(".dialog.welcome")) && (await p.$$eval(".notice", e => e.map(x => x.textContent).join())).includes("What's new"), "an update shows What's new instead");
    await p.keyboard.press("Control+Alt+Space"); await p.click('.sm-item[data-app="about"]'); await p.waitForTimeout(1000);
    const af = p.frame({ url: /about/ }); check(!!af && (await af.$eval("#ver", e => e.textContent)) === "VERSION " + VERSION, "About shows the version");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "search everywhere"() {
    const p = await page(); await desk(p); await amp(p, ["quiet.wav", "loud.wav"]);
    await p.keyboard.press("Control+KeyK"); await p.waitForSelector(".win.search");
    check(await p.$$eval(".sitem", e => e.length) > 5, "Ctrl+K opens search with apps listed");
    await p.keyboard.type("loud"); await p.waitForTimeout(400);
    check((await p.$$eval(".sitem b", e => e.map(x => x.textContent))).includes("loud"), "finds a song by title");
    await p.keyboard.press("Enter"); await p.waitForTimeout(1500);
    check((await p.title()).startsWith("loud"), "Enter plays it in Amp");
    await p.keyboard.press("Control+Space"); await p.keyboard.type("wallp"); await p.waitForTimeout(300); await p.keyboard.press("Enter"); await p.waitForTimeout(1500);
    const sf = p.frame({ url: /settings/ }); check(!!sf, "a setting opens Settings");
    const fr = p.frame({ url: /pulse/ }) ; void fr;
    await p.keyboard.press("Control+Alt+Digit3"); await p.waitForTimeout(1000);
    const pf = p.frame({ url: /pulse/ }); await pf.click(".step"); await p.keyboard.press("Control+KeyK"); await p.waitForTimeout(300);
    check(!!(await p.$(".win.search")), "works from inside a framed app");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "installed-app shortcuts and opening files from the computer"() {
    const p = await page(); await p.goto(URL + "?open=pulse"); await p.waitForTimeout(1500);
    check(!!(await p.$('[data-wid="pulse"]')) && !(await p.url()).includes("?"), "an icon shortcut (?open=pulse) opens the app");
    await amp(p);
    const b64 = fs.readFileSync(FX + "loud.wav").toString("base64");
    await p.evaluate(b64 => { const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); dispatchEvent(new CustomEvent("neonos:open-files", { detail: { files: [new File([bytes], "Opened song.wav", { type: "audio/wav" })] } })); }, b64);
    await p.waitForTimeout(2500);
    check((await p.title()).startsWith("Opened song"), "a song opened from the computer plays");
    check((await lib(p)).songs === 1, "and joins the library");
    const m = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
    check(m.file_handlers && m.shortcuts && m.shortcuts.length >= 3, "the manifest offers file opening and shortcuts");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "every app page loads on its own"() {
    const p = await page();
    for (const a of ["amp", "files", "pulse", "drift", "chop", "tape", "decks", "notes", "clock", "calendar", "calculator", "photos", "monitor", "bin", "settings", "help", "about"]) { await p.goto(`${URL}apps/${a}/`); await p.waitForTimeout(500); }
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "everyday apps: clock, calendar, calculator, notes, Bin, Photos, System monitor"() {
    const p = await page();
    // calculator: × before +, history kept
    await p.goto(URL + "apps/calculator/"); await p.waitForTimeout(400);
    await p.keyboard.type("2+3*4"); await p.keyboard.press("Enter");
    check((await p.$eval("#res", e => e.textContent)) === "14", "Calculator does × before +");
    check(JSON.parse(await p.evaluate(() => localStorage.getItem("neon-os:calculator"))).hist.length === 1, "Calculator keeps its history");
    await p.click('[data-tab="tempo"]'); await p.fill("#bpm", "120"); await p.dispatchEvent("#bpm", "input");
    check((await p.$eval("#lengths", e => e.textContent)).includes("500.0 ms"), "Tempo: a beat at 120 BPM is 500 ms");
    // alarms, timers and reminders go off on the desktop with Clock and Calendar closed
    if (new Date().getSeconds() > 50) await p.waitForTimeout((61 - new Date().getSeconds()) * 1000); // the alarm's minute mustn't pass mid-test
    await p.evaluate(() => {
      const d = new Date(), hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"), day = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      localStorage.setItem("neon-os:clock", JSON.stringify({ alarms: [{ id: "a1", time: hm, label: "Test alarm", days: [], on: true }], timer: { label: "", endsAt: Date.now() + 1500, left: 0, total: 1500 }, zones: [], watch: { startedAt: null, elapsed: 0, laps: [] } }));
      localStorage.setItem("neon-os:calendar", JSON.stringify({ events: [{ id: "e1", title: "Test event", date: day, time: hm, remind: 0, fired: false }] }));
    });
    await desk(p); await p.waitForTimeout(2600);
    const notes = await p.evaluate(() => localStorage.getItem("neon-os:notices") || "");
    check(/Test alarm/.test(notes), "an alarm goes off");
    check(/Test event/.test(notes), "a calendar reminder goes off");
    check(/[Tt]imer/.test(notes), "a timer goes off");
    check(await p.evaluate(() => !JSON.parse(localStorage.getItem("neon-os:clock")).alarms[0].on), "a one-off alarm turns itself off");
    // start menu groups, and System monitor lists and closes apps
    await p.click("#startBtn"); check((await p.$$eval(".sm-h", e => e.map(x => x.textContent))).join() === "Music,Everyday,System", "start menu is grouped");
    await p.click('.sm-item[data-app="files"]'); await p.waitForTimeout(800);
    await p.click("#startBtn"); await p.click('.sm-item[data-app="monitor"]'); await p.waitForTimeout(2500);
    const mf = p.frame({ url: /monitor/ });
    check((await mf.$$eval(".task strong", e => e.map(x => x.textContent))).includes("Files"), "System monitor lists open apps");
    await mf.click('[data-app="files"] [data-act="close"]'); await p.waitForTimeout(800);
    check(!(await p.$('[data-wid="files"]')), "System monitor closes an app");
    check((await mf.$$eval(".stat", e => e.length)) >= 5, "System monitor shows what's stored");
    // notes: folders, the Bin, and putting a note back
    await p.goto(URL + "apps/notes/"); await p.waitForTimeout(400);
    await p.click("#newNote"); await p.keyboard.type("Shopping list\nmilk"); await p.waitForTimeout(500);
    check((await p.$$eval("#notes strong", e => e.map(x => x.textContent))).includes("Shopping list"), "Notes titles a note by its first line");
    fs.writeFileSync(FX + "Ideas.txt", "one\ntwo");
    const ch2 = p.waitForEvent("filechooser"); await p.click("#open"); await (await ch2).setFiles(FX + "Ideas.txt"); await p.waitForTimeout(500);
    check((await p.$eval("#pad", e => e.value)) === "Ideas\none\ntwo", "Notes opens a text file as a note (the shared picker)");
    await p.click('#notes [data-id] strong:text("Shopping list")'); await p.waitForTimeout(200);
    await p.click("#del"); await p.waitForTimeout(600);
    await p.goto(URL + "apps/bin/"); await p.waitForTimeout(600);
    check((await p.$$eval(".bin strong", e => e.map(x => x.textContent))).includes("Shopping list"), "a deleted note is in the Bin");
    await p.click(".bin .item input"); await p.click("#restore"); await p.waitForTimeout(600);
    check(await p.evaluate(() => JSON.parse(localStorage.getItem("neon-os:notebook")).notes.some(n => n.text.startsWith("Shopping list"))), "the Bin puts a note back");
    check(!(await p.$(".bin .item")), "and it leaves the Bin");
    // a song in the Bin comes back with its playlist
    await desk(p); await amp(p, ["quiet.wav"]);
    await p.evaluate(async () => {
      const { makeLocalStore } = await import("./core/storage.js"), { binPut } = await import("./core/bin.js"), s = makeLocalStore(); await s.init();
      const t = s.tracks[0], pl = await s.createPlaylist("Keep"); await s.updatePlaylist(pl.id, { tracks: [t.id] });
      const { coverUrl, ...rec } = t; void coverUrl; await binPut("song", t.title, { track: rec, playlists: [pl.id] }, "");
      await s.updatePlaylist(pl.id, { tracks: [] }); await s.deleteTrack(t);
    });
    check((await lib(p)).songs === 0, "song deleted");
    await p.goto(URL + "apps/bin/"); await p.waitForTimeout(600);
    await p.click(".bin .item input"); await p.click("#restore"); await p.waitForTimeout(800);
    const back = await p.evaluate(async () => { const { makeLocalStore } = await import("/core/storage.js"), s = makeLocalStore(); await s.init(); return { n: s.tracks.length, inPl: s.playlists[0].tracks.length }; });
    check(back.n === 1 && back.inPl === 1, "the Bin puts a song back in its playlist");
    // photos: add a picture, view it, make it the wallpaper
    await p.screenshot({ path: FX + "pic.png", clip: { x: 0, y: 0, width: 64, height: 48 } });
    await p.goto(URL + "apps/photos/"); await p.waitForTimeout(500);
    const chooser = p.waitForEvent("filechooser"); await p.click("#add"); await (await chooser).setFiles(FX + "pic.png"); await p.waitForTimeout(1200);
    check((await p.$$eval(".pic", e => e.length)) === 1, "Photos adds a picture");
    await p.click(".pic"); await p.waitForTimeout(500); check(await p.$eval("#viewer", e => !e.hidden), "Photos opens the viewer");
    await p.click("#vWall"); await p.waitForTimeout(600);
    check(await p.evaluate(async () => JSON.parse(localStorage.getItem("neon-os:theme")).wall === "image" && !!(await (await import("/core/desk.js")).getWallImage())), "Photos sets the wallpaper");
    await desk(p); check(await p.$eval("#wallPic", e => !e.hidden && e.dataset.fit === "fit" && getComputedStyle(e.querySelector(".front")).backgroundSize === "contain"), "the picture wallpaper fits the screen");
    await p.goto(URL + "apps/photos/"); await p.waitForTimeout(800); await p.click(".pic"); await p.waitForTimeout(400);
    check((await p.$$eval(".pic", e => e.length)) === 1 && await p.evaluate(async () => (await (await import("/core/photos.js")).allThumbs()).size === 1), "Photos keeps a small preview");
    await p.click("#vDel"); await p.waitForTimeout(600);
    check((await p.$$eval(".pic", e => e.length)) === 0 && (await p.evaluate(async () => (await (await import("/core/bin.js")).binList()).some(i => i.kind === "photo"))), "a removed picture goes to the Bin");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "Photos viewer and editor, Video, Browser, and selecting desktop icons"() {
    const p = await page({ viewport: { width: 1200, height: 800 } });
    // a tall picture fits the viewer whole
    await p.goto(URL + "apps/photos/"); await p.waitForTimeout(400);
    await p.evaluate(async () => { const c = new OffscreenCanvas(600, 1800), g = c.getContext("2d"); g.fillStyle = "#3366aa"; g.fillRect(0, 0, 600, 1800); g.fillStyle = "#ff5533"; g.fillRect(100, 700, 400, 400);
      const b = await c.convertToBlob({ type: "image/jpeg" }); await (await import("/core/photos.js")).addPic(new File([b], "tall.jpg", { type: "image/jpeg" })); });
    await p.reload(); await p.waitForTimeout(1200); await p.click(".pic"); await p.waitForTimeout(800);
    const fit = await p.$eval("#vImg", i => { const r = i.getBoundingClientRect(), st = i.parentElement.getBoundingClientRect(); return { r: r.height <= st.height + 1 && r.width <= st.width + 1, natural: i.naturalHeight }; });
    check(fit.r && fit.natural === 1800, "the viewer shows the whole picture");
    // the editor: square crop, turn, a filter, save a copy
    await p.click("#vEdit"); await p.waitForSelector(".editor .ed-cv"); await p.waitForTimeout(600);
    await p.click('[data-aspect="1"]'); await p.click('[data-a="rotR"]'); await p.click('[data-tab="filters"]'); await p.click('[data-filter="mono"]'); await p.waitForTimeout(300);
    await p.click('[data-a="undo"]'); await p.click('[data-a="redo"]');
    await p.click('[data-a="save"]'); await p.click('.pop .mi:has-text("Save a copy")'); await p.waitForTimeout(1500);
    const saved = await p.evaluate(async () => { const pics = await (await import("/core/photos.js")).listPics(); const e = pics.find(x => /edited/.test(x.name)); if (!e) return null; const b = await createImageBitmap(e.blob); return { name: e.name, w: b.width, h: b.height }; });
    check(!!saved && saved.w === saved.h && saved.w === 600 && !(await p.$(".editor")), `the editor saves a cropped copy (${saved && saved.name}, ${saved && saved.w}×${saved && saved.h})`);
    // Video: open a clip, play, and it remembers where it got to
    await p.goto(URL + "apps/about/");
    const b64 = await p.evaluate(async () => {
      const c = document.createElement("canvas"); c.width = 320; c.height = 180; const g = c.getContext("2d"); let n = 0; const tick = setInterval(() => { g.fillStyle = `hsl(${n++ * 9},70%,50%)`; g.fillRect(0, 0, 320, 180); }, 33);
      const ac = new AudioContext(), o = ac.createOscillator(), d = ac.createMediaStreamDestination(); o.connect(d); o.start();
      const mr = new MediaRecorder(new MediaStream([...c.captureStream(30).getVideoTracks(), ...d.stream.getAudioTracks()]), { mimeType: "video/webm" }), parts = [];
      mr.ondataavailable = e => parts.push(e.data); mr.start(); await new Promise(r => setTimeout(r, 3000)); mr.stop(); await new Promise(r => { mr.onstop = r; }); clearInterval(tick);
      const buf = new Uint8Array(await new Blob(parts).arrayBuffer()); let s = ""; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192)); return btoa(s);
    });
    fs.writeFileSync(FX + "clip.webm", Buffer.from(b64, "base64"));
    await desk(p); await p.click("#startBtn"); await p.click('.sm-item[data-app="video"]'); await p.waitForTimeout(1200);
    const vf = p.frame({ url: /apps\/video/ });
    const vc = p.waitForEvent("filechooser"); await vf.click("#open"); await (await vc).setFiles(FX + "clip.webm");
    await vf.waitForFunction(() => { const v = document.getElementById("v"); return !v.paused && v.currentTime > 0; }, null, { timeout: 15000 }).catch(() => {});
    check(await vf.$eval("#v", v => !v.paused && v.currentTime > 0) && /clip\.webm/.test(await vf.$eval("#ttl", e => e.textContent)), "Video opens and plays a clip");
    await vf.click("#v"); await p.waitForTimeout(300);
    check(await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("neon-os:video-pos") || "{}")).some(k => k.startsWith("clip.webm"))), "Video remembers where it got to");
    // Browser: a page in a tab, a second tab, a bookmark
    await p.click("#startBtn"); await p.click('.sm-item[data-app="browser"]'); await p.waitForTimeout(1200);
    const bf = p.frame({ url: /apps\/browser/ });
    await bf.fill("#startQ", "localhost:" + PORT + "/apps/help/"); await bf.press("#startQ", "Enter"); await p.waitForTimeout(1500);
    check(!!p.frames().find(f => /apps\/help/.test(f.url()) && f.parentFrame() && /browser/.test(f.parentFrame().url())) && await bf.$eval("#start", e => e.hidden), "Browser opens a page in a tab");
    check((await bf.$eval("#addr", e => e.value)).startsWith("https://localhost") || (await bf.$eval("#addr", e => e.value)).includes("localhost"), "the address bar shows the page");
    await bf.click("#newtab"); await p.waitForTimeout(200);
    check((await bf.$$eval(".tab", e => e.length)) === 2 && !(await bf.$eval("#start", e => e.hidden)), "a new tab shows the start page");
    await bf.fill("#startQ", "neon orbit"); await bf.press("#startQ", "Enter"); await p.waitForTimeout(300);
    check((await bf.$eval("#addr", e => e.value)).startsWith("https://duckduckgo.com/?q=neon%20orbit"), "words in the address bar search the web");
    // selecting desktop icons with a box, and opening them together
    await p.keyboard.press("Control+Alt+KeyD"); await p.waitForTimeout(400);
    await p.mouse.move(400, 20); await p.mouse.down(); await p.mouse.move(250, 100, { steps: 4 }); await p.mouse.move(20, 190, { steps: 4 }); await p.mouse.up();
    const sel = await p.$$eval(".dicon.sel", e => e.map(x => x.dataset.app));
    check(sel.length >= 3, `dragging a box selects icons (${sel.join(", ")})`);
    await p.click("#desktop", { position: { x: 600, y: 500 } }); await p.waitForTimeout(100);
    check(!(await p.$(".dicon.sel")), "clicking the empty desktop clears the selection");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "Arcade: Beat and Mines"() {
    const p = await page(); await desk(p); await amp(p, ["beat120.wav"]);
    await p.waitForFunction(async () => { const { makeLocalStore } = await import("/core/storage.js"), s = makeLocalStore(); await s.init(); return s.tracks.some(t => t.analysis && t.analysis.bands); }, null, { timeout: 60000, polling: 1000 });
    await p.goto(URL + "apps/arcade/");
    await p.waitForFunction(() => /beat120/.test((document.getElementById("btSong") || {}).textContent || ""), null, { timeout: 15000 }).catch(() => {});
    const dbg = await p.evaluate(async () => { const { makeLocalStore } = await import("/core/storage.js"), s = makeLocalStore(); await s.init(); return s.tracks.map(t => `${t.title}:${!!(t.analysis && t.analysis.bands)}:${!!(t.blob || t.link)}`).join(",") + " | " + document.getElementById("btSong").textContent; });
    check(/beat120/.test(await p.$eval("#btSong", e => e.textContent)), "Beat lists songs whose beats are known" + (/beat120/.test(dbg.split("|")[1]) ? "" : ` [${dbg}]`));
    await p.click('[data-d="easy"]'); await p.click("#btGo"); await p.waitForTimeout(1200);
    const n = await p.evaluate(() => window.__arcade.beat.notes.length);
    check(n > 10, `Beat makes a chart from the song (${n} notes on Easy)`);
    // press keys at the right moments using the game's own clock
    await p.evaluate(() => new Promise(res => { const b = window.__arcade.beat, pressed = new Set(); const end = performance.now() + 7000;
      const tick = () => { for (const nt of b.notes) { if (pressed.has(nt) || nt.hit) continue; const t = window.__beatNow ? window.__beatNow() : null; if (t == null) break; if (Math.abs(nt.t - t) < 0.02) { pressed.add(nt); document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "dfjk"[nt.lane], bubbles: true })); } if (nt.t - t > 0.1) break; } if (performance.now() < end) setTimeout(tick, 4); else res(); }; tick(); }));
    const score = await p.evaluate(() => window.__arcade.beat.score);
    check(score > 0, `hitting notes on time scores points (${Math.round(score)})`);
    // Mines: the first square opened is never a mine, and flags count down
    await p.click('[data-tab="mines"]'); await p.click('[data-lv="easy"]');
    await p.click('#mnBoard [data-i="40"]'); await p.waitForTimeout(200);
    check(!(await p.$("#mnBoard .mine")) && (await p.$$eval("#mnBoard .open", e => e.length)) >= 1, "Mines: the first square is always safe");
    const hidden = await p.$$eval("#mnBoard .mn-c:not(.open)", e => e.map(x => x.dataset.i));
    await p.click(`#mnBoard [data-i="${hidden[0]}"]`, { button: "right" });
    check((await p.$eval("#mnLeft", e => e.textContent)) === "009", "Mines: a flag counts down the mines left");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "Pulse: chains, MIDI and your own samples"() {
    const p = await page(); await p.goto(URL + "apps/pulse/"); await p.waitForTimeout(600);
    await p.fill("#chain", "aab-x"); check((await p.$eval("#chain", e => e.value)) === "AAB", "the chain keeps only pattern letters");
    await p.click("#chainOn"); check(/3 bars/.test(await p.$eval("#chainHint", e => e.textContent)), "Play chain is on with 3 bars");
    const dl = p.waitForEvent("download"); await p.click("#midi"); const d = await dl, buf = fs.readFileSync(await d.path());
    const notes = [...buf.subarray(22)].reduce((n, b, i, a) => n + (b === 0x99 && a[i + 2] > 0 ? 1 : 0), 0);
    check(buf.subarray(0, 4).toString() === "MThd" && buf.subarray(14, 18).toString() === "MTrk" && /chain/.test(d.suggestedFilename()) && notes >= 20, `Export MIDI saves a drum track (${notes} hits)`);
    await p.evaluate(async () => { const c = new OfflineAudioContext(1, 4410, 44100), o = c.createOscillator(); o.connect(c.destination); o.start(); const b = await c.startRendering(); const { toWav } = await import("/core/wav.js"); const { setSample } = await import("/core/drums.js"); await setSample("kick", "boom.wav", toWav(b)); });
    await p.reload(); await p.waitForTimeout(700);
    check(await p.$eval('[data-audition="0"]', e => e.classList.contains("smp") && /boom\.wav/.test(e.title)), "a drum can play your own sample");
    const dl2 = p.waitForEvent("download"); await p.click("#wav"); const w = await (await dl2).path();
    check(fs.statSync(w).size > 44100 * 4, "the WAV export still renders (with the sample)");
    // Decks: the filter and echo on each deck, remembered
    await p.goto(URL + "apps/decks/"); await p.waitForTimeout(800);
    await p.focus('[data-filter="A"]'); for (let i = 0; i < 10; i++) await p.keyboard.press("ArrowLeft");
    check(/^LP \d+%$/.test(await p.$eval('[data-filterv="A"]', e => e.textContent)), "Decks: turning the filter left shows a low-pass amount");
    await p.click('[data-echo="B"]'); await p.selectOption('[data-echob="B"]', "0.75"); await p.waitForTimeout(500);
    const dm = JSON.parse(await p.evaluate(() => localStorage.getItem("neon-os:decks"))).mix;
    check(dm.filter.A < 0 && dm.echo.B === true && dm.echoBeats.B === 0.75, "Decks: filter and echo settings are remembered");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "Radio and podcasts"() {
    const p = await page();
    const song = fs.readFileSync(FX + "song.wav");
    await p.context().route(/radio-browser\.info/, r => r.fulfill({ contentType: "application/json", body: JSON.stringify([{ name: "Neon FM", url_resolved: "https://stream.example/neon", favicon: "", countrycode: "GB", codec: "MP3", bitrate: 128, tags: "electronic,synthwave" }]) }));
    await p.context().route(/stream\.example|cdn\.example/, r => r.fulfill({ contentType: "audio/wav", body: song }));
    await p.context().route(/itunes\.apple\.com/, r => r.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ results: [{ collectionName: "Synth Talk", artistName: "Madoromi", feedUrl: "https://feeds.example/synth.xml" }] }) }));
    await p.context().route(/feeds\.example/, r => r.fulfill({ contentType: "application/rss+xml", headers: { "access-control-allow-origin": "*" }, body: `<?xml version="1.0"?><rss><channel><title>Synth Talk</title><item><title>Episode 1</title><pubDate>Mon, 12 Oct 2026 10:00:00 GMT</pubDate><enclosure url="https://cdn.example/ep1.wav" type="audio/wav"/></item></channel></rss>` }));
    await p.goto(URL + "apps/radio/"); await p.waitForTimeout(500);
    await p.click('[data-tag="electronic"]'); await p.waitForTimeout(600);
    check((await p.$$eval("#stations strong", e => e.map(x => x.textContent))).includes("Neon FM"), "Radio finds stations by style");
    await p.click('#stations [data-fav="0"]'); await p.click('#stations [data-i="0"]'); await p.waitForTimeout(800);
    check(await p.$eval("#au", a => !a.paused) && /LIVE/.test(await p.$eval("#sub", e => e.textContent)), "a station plays live");
    await p.click('[data-tag="Favourites"]'); await p.waitForTimeout(300);
    check((await p.$$eval("#stations strong", e => e.map(x => x.textContent))).join() === "Neon FM", "★ keeps a station in Favourites");
    await p.click('[data-tab="pods"]'); await p.fill("#pq", "synth"); await p.click("#pgo"); await p.waitForTimeout(600);
    await p.click('#pods [data-feed]'); await p.waitForTimeout(800);
    check((await p.$$eval("#pods [data-ep] strong", e => e.map(x => x.textContent))).join() === "Episode 1", "a podcast's episodes load from its feed");
    await p.click("#podSub"); await p.click('#pods [data-ep="0"]'); await p.waitForTimeout(1000);
    check(await p.$eval("#au", a => !a.paused) && !(await p.$eval("#seekRow", e => e.hidden)) && JSON.parse(await p.evaluate(() => localStorage.getItem("neon-os:radio"))).subs.length === 1, "subscribe, and an episode plays with a seek bar");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "Terminal and Recorder"() {
    const p = await page({ permissions: ["microphone"] }); await desk(p); await amp(p, ["song.wav"]);
    await p.click("#startBtn"); await p.click('.sm-item[data-app="terminal"]'); await p.waitForTimeout(1000);
    const tf = p.frame({ url: /terminal/ }), run = async c => { await tf.fill("#cmd", c); await tf.press("#cmd", "Enter"); await p.waitForTimeout(500); }, said = () => tf.$eval("#out", e => e.textContent);
    await run("help"); check(/open <app>/.test(await said()), "Terminal: help lists the commands");
    await run("calc (2+3)*4^2"); check(/\n80\n/.test(await said()), "Terminal: calc works out sums");
    await run("note From the terminal"); check(await p.evaluate(() => JSON.parse(localStorage.getItem("neon-os:notebook")).notes.some(n => n.text === "From the terminal")), "Terminal: note adds a note");
    await run("play song"); await p.waitForTimeout(800); check(/Playing/.test(await said()) && (await p.title()).startsWith("song"), "Terminal: play plays a song in Amp");
    await run("open clock"); await p.waitForTimeout(800); check(!!(await p.$('[data-wid="clock"]')), "Terminal: open opens an app");
    await run("alarm 07:30 Wake"); check(await p.evaluate(() => JSON.parse(localStorage.getItem("neon-os:clock")).alarms.some(a => a.time === "07:30" && a.label === "Wake")), "Terminal: alarm sets an alarm");
    await run("frobnicate"); check(/Unknown command/.test(await said()), "Terminal: unknown commands say so");
    // Recorder: the test browser's fake microphone
    await p.click("#startBtn"); await p.click('.sm-item[data-app="recorder"]'); await p.waitForTimeout(1000);
    const rf = p.frame({ url: /recorder/ });
    await rf.click("#rec"); await p.waitForTimeout(2200); await rf.click("#rec"); await p.waitForTimeout(1500);
    check((await rf.$$eval("#list .item", e => e.length)) === 1 && !(await rf.$eval("#edit", e => e.hidden)), "Recorder records and opens the recording");
    await rf.click("#lib"); await p.waitForTimeout(1200);
    check(await p.evaluate(async () => { const { makeLocalStore } = await import("/core/storage.js"), s = makeLocalStore(); await s.init(); return s.tracks.some(t => t.album === "Recordings"); }), "Recorder adds a recording to the library");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "synced lyrics in Amp"() {
    const p = await page(); await desk(p); await amp(p, ["song.wav"]);
    await p.click("#bPlay"); await p.waitForTimeout(500);
    await p.click("#lyrBtn", { button: "right" }); await p.click('.pop .mi:has-text("Paste lyrics")'); await p.waitForSelector(".dialog textarea");
    await p.fill(".dialog textarea", "[ti:Test]\n[00:00.00]First line\n[00:01.50]Second line\n[00:03.00]Third line\n[00:30.00]Last line");
    await p.click('.dialog button[type=submit]'); await p.waitForTimeout(400);
    check(!(await p.$eval("#lyrics", e => e.hidden)) && await p.$eval("#lyrBtn", e => e.getAttribute("aria-pressed")) === "true", "pasted lyrics show over the visualiser");
    await p.keyboard.press("Escape"); await p.evaluate(() => document.activeElement && document.activeElement.blur());
    await p.waitForFunction(() => /Second line|Third line/.test(document.querySelector("#lyrics .l1").textContent), null, { timeout: 6000 }).catch(() => {});
    check(/Second line|Third line/.test(await p.$eval("#lyrics .l1", e => e.textContent)), "the current line follows the song");
    check(await p.evaluate(async () => { const { makeLocalStore } = await import("/core/storage.js"), s = makeLocalStore(); await s.init(); return /First line/.test(s.tracks[0].lyrics || ""); }), "lyrics are kept with the song");
    await p.click("#lyrBtn"); check(await p.$eval("#lyrics", e => e.hidden), "the Lyrics button hides them");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "lyrics embedded in song files"() {
    const p = await page(); await p.goto(URL + "apps/about/");
    const got = await p.evaluate(async () => { const { readLyrics } = await import("/core/tags.js"), out = {};
      for (const f of ["lyrics-plain.mp3", "lyrics-synced.mp3", "lyrics-txxx.mp3", "lyrics.flac", "lyrics.m4a"]) out[f] = await readLyrics(await (await fetch("/tests/.fixtures/" + f)).blob());
      return out; });
    check(got["lyrics-plain.mp3"] === "Line one\nLine two\nLine three", "MP3: plain lyrics (ID3 USLT)");
    check(/^\[00:00\.00\]Synced one\n\[00:01\.50\]Synced two/.test(got["lyrics-synced.mp3"]), "MP3: synced lyrics (ID3 SYLT) win and keep their times");
    check(got["lyrics-txxx.mp3"] === "Custom one\nCustom two", "MP3: lyrics in a TXXX frame (as ffmpeg writes them)");
    check(/\[00:01\.00\]Flac two/.test(got["lyrics.flac"]), "FLAC: the LYRICS comment");
    check(got["lyrics.m4a"] === "M4a one\nM4a two", "M4A: the ©lyr atom");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "quick settings and desktop widgets"() {
    const p = await page(); await desk(p);
    await p.click("#clock"); await p.waitForSelector(".qs");
    check(/Quick settings/.test(await p.$eval(".qs", e => e.getAttribute("aria-label"))) && (await p.$$eval(".qs-tile", e => e.length)) === 8, "clicking the clock opens quick settings");
    await p.click('[data-q="quiet"]'); check(await p.evaluate(() => JSON.parse(localStorage.getItem("neon-os:notices")).quiet === true), "Do not disturb turns on from quick settings");
    await p.click('[data-q="calm"]'); check(await p.evaluate(() => JSON.parse(localStorage.getItem("neon-os:theme")).calm === true), "Reduce motion turns on from quick settings");
    await p.click('[data-q="wall"]'); check(await p.evaluate(() => JSON.parse(localStorage.getItem("neon-os:theme")).wall === "fog"), "Change wallpaper moves to the next wallpaper");
    await p.keyboard.press("Escape"); check(!(await p.$(".qs")), "Esc closes quick settings");
    for (const w of ["Clock", "Calendar", "Now playing"]) { await p.click("#desktop", { button: "right", position: { x: 500, y: 300 } }); await p.click(`.pop .mi:has-text("+ ${w}")`); await p.waitForTimeout(150); }
    check((await p.$$eval(".widget", e => e.map(x => x.dataset.type))).join() === "clock,calendar,music", "widgets are added from the desktop menu");
    const boxes = await p.$$eval(".widget", e => e.map(x => x.getBoundingClientRect()).map(r => [r.left, r.top, r.right, r.bottom]));
    check(!boxes.some((a, i) => boxes.some((b, j) => i < j && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3])), "new widgets don't overlap");
    const head = await (await p.$('.widget[data-type="clock"] .wg-head')).boundingBox();
    await p.mouse.move(head.x + 20, head.y + 6); await p.mouse.down(); await p.mouse.move(head.x - 300, head.y + 200, { steps: 5 }); await p.mouse.up();
    await p.reload(); await p.waitForTimeout(1200);
    const saved = await p.evaluate(() => JSON.parse(localStorage.getItem("neon-os:widgets")));
    check(saved.length === 3 && (await p.$$eval(".widget", e => e.length)) === 3 && saved[0].y > 150, "widgets stay where they're put after a reload");
    await p.hover('.widget[data-type="calendar"]'); await p.click('.widget[data-type="calendar"] .wg-x');
    check((await p.$$eval(".widget", e => e.length)) === 2, "a widget's X removes it");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "Auto DJ mixes on the beat"() {
    const p = await page(); await desk(p); await amp(p, ["beat120.wav", "beat124.wav"]);
    await p.waitForFunction(async () => { const { makeLocalStore } = await import("/core/storage.js"), s = makeLocalStore(); await s.init(); return s.tracks.length === 2 && s.tracks.every(t => t.analysis && t.analysis.beats && t.analysis.beats.length > 40); }, null, { timeout: 60000, polling: 1000 });
    for (let i = 0; i < 5; i++) await p.click("#bFade");
    check((await p.$eval("#fadeTxt", e => e.textContent)) === "Auto DJ", "Fade's last setting is Auto DJ");
    await p.click("#bRep"); // repeat all, so there's always a next song whatever order they were added in
    await p.dblclick('#mlRows .trow:has-text("beat120")'); await p.waitForTimeout(800);
    await p.evaluate(() => document.activeElement && document.activeElement.blur()); // arrow keys in the song list move the selection, not the song
    for (let i = 0; i < 6; i++) { await p.keyboard.press("ArrowRight"); await p.waitForTimeout(80); }
    await p.waitForFunction(() => /Mixing in/.test(document.getElementById("fadeTxt").title || ""), null, { timeout: 10000 }).catch(() => {});
    const plan = await p.$eval("#fadeTxt", e => e.title);
    check(/Mixing in 8 beats/.test(plan), `it plans a beat-matched mix (${plan || "none"})`);
    await p.waitForFunction(() => /BEAT124/.test(document.getElementById("marqueeText").textContent), null, { timeout: 15000 }).catch(() => {});
    const mq = await p.$eval("#marqueeText", e => e.textContent), at = await p.$eval("#bigTime", e => e.textContent);
    check(/BEAT124/.test(mq), `the next song takes over during the mix, before the first ends (${mq.slice(0, 30)} · ${at})`);
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "Files: folders on the computer"() {
    const p = await page();
    await p.goto(URL + "apps/files/"); await p.waitForTimeout(500);
    await p.evaluate(async () => {
      const root = await navigator.storage.getDirectory(), d = await root.getDirectoryHandle("Docs", { create: true });
      const put = async (dir, name, text) => { const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close(); };
      await put(d, "hello.txt", "Hello from a folder"); await put(d, "todo.md", "milk\neggs"); const sub = await d.getDirectoryHandle("Sub", { create: true }); await put(sub, "deep.txt", "down here");
      window.showDirectoryPicker = async () => d;
    });
    await p.click("[data-linkplace]"); await p.waitForTimeout(1200);
    const names = () => p.$$eval("#fmRows .fm-row b", e => e.map(x => x.textContent));
    check((await names()).join() === "Sub,hello.txt,todo.md", "Files lists a linked folder, folders first");
    await p.dblclick('#fmRows .fm-row:has-text("Sub")'); await p.waitForTimeout(500);
    check((await names()).join() === "deep.txt" && /Sub/.test(await p.$eval("#fmCrumbs", e => e.textContent)), "double-click opens a folder");
    await p.click('[data-a="up"]'); await p.waitForTimeout(400);
    await p.click('[data-a="newdir"]'); await p.waitForSelector(".dialog input"); await p.fill(".dialog input", "Projects"); await p.keyboard.press("Enter"); await p.waitForTimeout(600);
    check((await names()).includes("Projects"), "New folder makes a folder and names it");
    await p.click('#fmRows .fm-row:has-text("hello.txt")'); await p.click('[data-a="copy"]');
    await p.dblclick('#fmRows .fm-row:has-text("Projects")'); await p.waitForTimeout(400); await p.click('[data-a="paste"]'); await p.waitForTimeout(600);
    check((await names()).join() === "hello.txt", "copy and paste a file into a folder");
    await p.click('[data-a="up"]'); await p.waitForTimeout(400);
    await p.click('#fmRows .fm-row:has-text("todo.md")'); await p.click('[data-a="rename"]'); await p.waitForSelector(".dialog input"); await p.fill(".dialog input", "shopping.md"); await p.keyboard.press("Enter"); await p.waitForTimeout(600);
    check((await names()).includes("shopping.md") && !(await names()).includes("todo.md"), "rename a file");
    await p.click('[data-a="preview"]'); await p.waitForTimeout(400);
    check(/milk/.test(await p.$eval("#fmPrev", e => e.textContent)), "Preview shows a text file");
    await p.click('#fmRows .fm-row:has-text("shopping.md")'); await p.click('[data-a="delete"]'); await p.waitForSelector(".dialog"); await p.click('.dialog button[type=submit]'); await p.waitForTimeout(700);
    check(!(await names()).includes("shopping.md") && await p.evaluate(async () => (await (await import("/core/bin.js")).binList()).some(i => i.kind === "file" && i.title === "shopping.md")), "Delete sends a file to the Bin");
    await p.fill("#fmQ", "deep"); await p.waitForTimeout(900);
    check((await names()).join() === "deep.txt", "search finds files in folders below");
    await p.fill("#fmQ", ""); await p.waitForTimeout(500);
    await p.goto(URL + "apps/bin/"); await p.waitForTimeout(600); await p.click('.bin .item:has-text("shopping.md") input'); await p.click("#restore"); await p.waitForTimeout(800);
    check(await p.evaluate(async () => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle("Docs"); try { await d.getFileHandle("shopping.md"); return true; } catch (e) { return false; } }), "the Bin puts the file back in its folder");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "wallpaper slideshow from Photos"() {
    const p = await page();
    await p.goto(URL + "apps/photos/"); await p.waitForTimeout(300);
    await p.evaluate(async () => { const m = await import("/core/photos.js"); for (const [i, c] of ["#cc3355", "#33cc55", "#3355cc"].entries()) { const cv = new OffscreenCanvas(320, 200), g = cv.getContext("2d"); g.fillStyle = c; g.fillRect(0, 0, 320, 200); await m.addPic(new File([await cv.convertToBlob({ type: "image/png" })], `p${i}.png`, { type: "image/png" })); } });
    await p.reload(); await p.waitForTimeout(800);
    await p.click("#asWall"); await p.waitForTimeout(300);
    check(await p.evaluate(() => JSON.parse(localStorage.getItem("neon-os:theme")).wall === "slideshow"), "Photos' Use as wallpaper turns the slideshow on");
    await desk(p); await p.waitForTimeout(800);
    const pic = () => p.$eval("#wallPic", b => { const l = b.querySelector(".layer.on .front"); return { shown: !b.hidden, img: l ? l.style.backgroundImage : "" }; });
    const a = await pic(); check(a.shown && a.img.startsWith('url("blob:'), "the desktop shows a picture from Photos");
    await p.click("#desktop", { button: "right", position: { x: 700, y: 400 } }); await p.click('.pop .mi:has-text("Next wallpaper picture")'); await p.waitForTimeout(800);
    const b = await pic(); check(b.img && b.img !== a.img, "Next wallpaper picture changes it");
    await p.reload(); await p.waitForTimeout(1500);
    const st = await p.evaluate(() => JSON.parse(localStorage.getItem("neon-os:wall-show") || "{}"));
    check(!!st.cur && (await pic()).shown, "after a reload it carries on with the slideshow");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "the orb: presets, live input and recording video"() {
    const p = await page({ permissions: ["microphone"] }); await desk(p); await amp(p, ["song.wav"]);
    await p.click("#lookBtn"); await p.waitForTimeout(200);
    check(!(await p.$eval("#visLook", e => e.hidden)), "Look opens its panel");
    await p.selectOption("#lookPreset", "Halo"); await p.waitForTimeout(500);
    const st = () => p.evaluate(() => JSON.parse(localStorage.getItem("neon-orbit-amp") || "{}"));
    let S = await st();
    check(S.look.balls === 24 && Math.abs(S.chaos - 0.4) < 1e-6 && (await p.$eval("#lkBallsV", e => e.textContent)) === "24" && (await p.$eval("#chaosPct", e => e.textContent)) === "40%", "a preset sets balls, chaos and their numbers");
    await p.focus("#lkTrail"); await p.keyboard.press("ArrowRight"); await p.waitForTimeout(400);
    S = await st(); check(S.lookName === "" && (await p.$eval("#lookPreset", e => e.value)) === "", "changing a setting turns it into Custom");
    await p.click("#lookSave"); await p.waitForSelector(".dialog input"); await p.fill(".dialog input", "Mine"); await p.keyboard.press("Enter");
    await p.waitForFunction(() => (JSON.parse(localStorage.getItem("neon-orbit-amp") || "{}").lookPresets || []).length > 0, null, { timeout: 5000 }).catch(() => {});
    S = await st(); check(S.lookPresets.some(x => x.name === "Mine") && S.lookName === "Mine", "Save as keeps your own preset");
    await p.click("#lookX"); check(await p.$eval("#visLook", e => e.hidden), "the Look panel's X closes it");
    // live input (the test browser's fake microphone beeps)
    await p.click("#liveBtn"); await p.waitForTimeout(3500);
    check(await p.$eval("#liveBtn", e => e.getAttribute("aria-pressed")) === "true" && /BPM/.test(await p.$eval("#liveBpm", e => e.textContent)) && /LIVE/.test(await p.$eval("#stageNp", e => e.textContent)), "Live listens to the input and shows a tempo");
    await p.click("#liveBtn"); await p.waitForTimeout(200);
    check(await p.$eval("#liveBtn", e => e.getAttribute("aria-pressed")) === "false", "Live turns off");
    // record a video of a playing song
    await p.click("#bPlay"); await p.waitForTimeout(800);
    await p.click("#recBtn"); await p.waitForTimeout(2600);
    check(/^0:0[1-9]$/.test(await p.$eval("#recTxt", e => e.textContent)), "Rec shows how long it's been recording");
    const dl = p.waitForEvent("download"); await p.click("#recBtn"); const d = await dl;
    const f = await d.path(), size = fs.statSync(f).size;
    check(/^Neon Orbit - .+\.(mp4|webm)$/.test(d.suggestedFilename()) && size > 20000, `Rec saves a video (${d.suggestedFilename()}, ${Math.round(size / 1024)} KB)`);
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "desktop app updates (with a stand-in for the desktop app)"() {
    const p = await page();
    await p.addInitScript(() => {
      let cb = null; window.__restarted = false;
      window.neonOsDesktop = { onOpenFiles() {}, version: async () => "1.1.0", onUpdate: fn => { cb = fn; }, __send: u => cb && cb(u),
        updateInfo: async () => ({ app: "1.1.0", files: "abc123", ready: window.__ready || null, appNews: null }),
        checkUpdates: async () => ({ files: { status: "ready", version: "def456" }, app: { status: "newer", version: "1.2.0", url: "https://example.com/r" } }),
        restart: async () => { window.__restarted = true; } };
    });
    await desk(p);
    check(await p.$eval("#updBtn", e => e.hidden), "no update button until there's an update");
    await p.evaluate(() => { window.__ready = "def456"; window.neonOsDesktop.__send({ kind: "files", version: "def456" }); });
    await p.waitForTimeout(300);
    check(!(await p.$eval("#updBtn", e => e.hidden)) && /update ready/.test(await p.evaluate(() => localStorage.getItem("neon-os:notices"))), "a downloaded update shows Restart to update and a notice");
    await p.click("#updBtn"); await p.waitForTimeout(600);
    check(await p.evaluate(() => window.__restarted), "Restart to update restarts the app");
    await p.click("#startBtn"); await p.click('.sm-item[data-app="about"]');
    await p.waitForFunction(() => { const f = document.querySelector('[data-wid="about"] iframe'); return f && f.contentDocument && /DESKTOP APP/.test((f.contentDocument.getElementById("updVer") || {}).textContent || ""); }, null, { timeout: 8000 }).catch(() => {});
    const af = p.frame({ url: /about/ });
    check(!(await af.$eval("#updBox", e => e.hidden)) && /DESKTOP APP 1.1.0/.test(await af.$eval("#updVer", e => e.textContent)), "About shows the desktop app and files versions");
    await af.click("#updCheck"); await p.waitForTimeout(400);
    check(!(await af.$eval("#updGo", e => e.hidden)) && /1\.2\.0/.test(await af.$eval("#updApp", e => e.textContent)), "Check for updates offers the restart and a newer desktop app");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "several desktops, lock screen and screensaver"() {
    const p = await page(); await desk(p);
    await p.keyboard.press("Control+Alt+Digit2"); await p.waitForSelector('[data-wid="files"]');
    check((await p.$$eval("#desks .dsk", e => e.map(x => x.textContent))).join() === "1,+", "one desktop to start, with +");
    await p.click('#desks [data-desk="add"]'); await p.waitForTimeout(300);
    check(await p.$eval('[data-wid="files"]', e => getComputedStyle(e).display === "none") && !(await p.$(".task")), "a new desktop is empty");
    await p.click("#startBtn"); await p.click('.sm-item[data-app="notes"]'); await p.waitForTimeout(800);
    check((await p.$$eval(".task", e => e.map(x => x.dataset.app))).join() === "notes", "an app opens on the current desktop");
    await p.keyboard.press("Control+Alt+BracketLeft"); await p.waitForTimeout(300);
    check((await p.$$eval(".task", e => e.map(x => x.dataset.app))).join() === "files" && await p.$eval('[data-wid="notes"]', e => getComputedStyle(e).display === "none"), "Ctrl+Alt+[ goes back to desktop 1");
    await p.click("#startBtn"); await p.click('.sm-item[data-app="notes"]'); await p.waitForTimeout(400);
    check(await p.$eval('#desks [data-desk="1"]', e => e.classList.contains("on")), "opening an app on another desktop goes there");
    await p.click('[data-wid="notes"] .titlebar', { button: "right", position: { x: 60, y: 8 } }); await p.waitForTimeout(200);
    await p.click('.pop .mi:has-text("Move to desktop 1")'); await p.waitForTimeout(300);
    check(!(await p.$(".task")), "the window menu moves an app to another desktop");
    await p.reload(); await p.waitForTimeout(1500);
    check(await p.evaluate(() => { const d = JSON.parse(localStorage.getItem("neon-os:layout")).desks; return d.n === 2 && d.of.notes === 0; }), "desktops are remembered");
    // lock screen: no PIN opens with Enter
    await p.keyboard.press("Control+Alt+KeyL"); await p.waitForTimeout(400);
    check(await p.$eval(".lockscreen", e => e.classList.contains("on") && e.dataset.mode === "lock"), "Ctrl+Alt+L locks the screen");
    await p.keyboard.press("Enter"); await p.waitForTimeout(300);
    check(!(await p.$(".lockscreen.on")), "Enter unlocks without a PIN");
    // with a PIN: wrong one refused, still locked after a reload, right one opens
    await p.evaluate(async () => { const m = await import("/os/lock.js"); m.setLockConf({ pin: await m.hashPin("1234"), saverLock: true }); });
    await p.keyboard.press("Control+Alt+KeyL"); await p.waitForTimeout(300);
    await p.keyboard.type("0000"); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
    check(!!(await p.$(".lockscreen.on")) && /isn't right/.test(await p.$eval("#lkMsg", e => e.textContent)), "a wrong PIN is refused");
    await p.reload(); await p.waitForTimeout(1500);
    check(!!(await p.$(".lockscreen.on")), "still locked after a reload");
    await p.keyboard.press("Control+Alt+Digit2"); await p.waitForTimeout(300);
    check(!(await p.$('[data-wid="files"]:not(.offdesk)')) || !(await p.$(".task.front")), "shortcuts do nothing while locked");
    await p.click("#lkPin"); await p.keyboard.type("1234"); await p.keyboard.press("Enter"); await p.waitForTimeout(400);
    check(!(await p.$(".lockscreen.on")), "the right PIN unlocks");
    // screensaver: the orb; moving the mouse asks for the PIN
    await p.evaluate(() => postMessage({ neonOs: "saver" }, location.origin)); await p.waitForTimeout(400);
    check(await p.$eval(".lockscreen", e => e.classList.contains("on") && e.dataset.mode === "saver"), "the screensaver starts");
    await p.mouse.move(100, 100); await p.mouse.move(400, 400); await p.waitForTimeout(300);
    check(await p.$eval(".lockscreen", e => e.dataset.mode === "lock"), "waking it asks for the PIN");
    await p.keyboard.type("1234"); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
    await p.evaluate(async () => (await import("/os/lock.js")).setLockConf({ pin: null }));
    await p.evaluate(() => postMessage({ neonOs: "saver" }, location.origin)); await p.waitForTimeout(300);
    await p.mouse.move(100, 100); await p.mouse.move(400, 400); await p.waitForTimeout(300);
    check(!(await p.$(".lockscreen.on")), "with no PIN, moving the mouse ends the screensaver");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "desktop, shortcuts, switcher, notifications"() {
    const p = await page(); await desk(p);
    check(await p.$$eval(".dicon", e => e.length) >= 8, "desktop icons");
    await amp(p); await p.keyboard.press("Control+Alt+Digit2"); await p.waitForTimeout(1000);
    check((await p.$$eval(".task", e => e.map(x => x.dataset.app))).join() === "amp,files", "Ctrl+Alt+1/2 open Amp and Files");
    await p.keyboard.down("Alt"); await p.keyboard.press("Backquote"); check(await p.$$eval(".swi", e => e.length) === 2, "Alt+` shows the switcher"); await p.keyboard.up("Alt");
    await p.waitForTimeout(200); check(await p.$eval(".task.front", e => e.dataset.app) === "amp", "letting go of Alt switches");
    await p.keyboard.press("F1"); await p.waitForTimeout(800); check(!!(await p.$('[data-wid="help"]')), "F1 opens Shortcuts");
    await p.evaluate(() => dispatchEvent(new CustomEvent("neonos:notify", { detail: { title: "Test", text: "Hello" } }))); await p.waitForTimeout(200);
    check(/\d/.test(await p.$eval("#bellBtn", e => e.textContent)), "notification badge");
    await p.keyboard.press("Control+Alt+KeyD"); await p.waitForTimeout(200); check(await p.$$eval(".owin:not(.min):not(.closed)", e => e.length) === 0, "Ctrl+Alt+D shows the desktop");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "Amp: play, mini player, levelling, gapless and crossfade"() {
    const p = await page(); await desk(p); await amp(p, ["quiet.wav", "loud.wav", "mid.wav"]);
    check((await lib(p)).songs === 3, "three songs added");
    await p.keyboard.press("Control+Alt+KeyP"); await p.waitForTimeout(1200);
    check(await p.$eval('#miniPlayer [data-t="toggle"]', e => e.getAttribute("aria-label")) === "Pause", "mini player shows playing");
    const titles = new Set(); for (let i = 0; i < 24; i++) { await p.waitForTimeout(500); titles.add(await p.title()); }
    check([...titles].filter(t => t.includes("·")).length >= 2, "next song starts on its own (gapless)");
    const louds = await p.evaluate(() => import("./core/backup.js").then(async m => { const db = await m.openDb(); const t = await m.all(db, "tracks"); db.close(); return t.filter(x => x.loud != null).length; }));
    check(louds >= 2, "loudness measured for levelling");
    await p.click("#bFade"); check(/3s/.test(await p.$eval("#fadeTxt", e => e.textContent)), "Fade cycles to 3 s");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "linked folder: link, swap copies, rescan"() {
    const p = await page(); await desk(p);
    const b64 = fs.readFileSync(FX + "song.wav").toString("base64");
    await p.evaluate(async b64 => {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), root = await navigator.storage.getDirectory(), music = await root.getDirectoryHandle("Music", { create: true });
      const put = async (dir, name) => { const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(bytes); await w.close(); };
      await put(music, "song.wav"); await put(await music.getDirectoryHandle("Sub", { create: true }), "other.wav");
      window.showDirectoryPicker = async () => music;
    }, b64);
    await amp(p, ["song.wav"]);
    await p.click("#mlAddFolder"); await p.click(".pop .mi:has-text('Link a music folder')"); await p.waitForTimeout(1500);
    await p.click(".dialog button:has-text('Keep the copies')"); await p.waitForTimeout(2000);
    let s = await lib(p); check(s.copied === 1 && s.linked === 1, "keeping copies links only new songs");
    await p.click("#mlAddFolder"); await p.click(".pop .mi:has-text('Free up space')"); await p.waitForTimeout(2500);
    s = await lib(p); check(s.copied === 0 && s.linked === 2 && s.bytes === 0, "Free up space swaps copies for linked files");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "sync through the music folder"() {
    const p = await page(); await desk(p);
    const b64 = fs.readFileSync(FX + "song.wav").toString("base64");
    await p.evaluate(async b64 => {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), root = await navigator.storage.getDirectory(), music = await root.getDirectoryHandle("Music", { create: true });
      for (const n of ["one.wav", "two.wav"]) { const w = await (await music.getFileHandle(n, { create: true })).createWritable(); await w.write(bytes); await w.close(); }
      window.showDirectoryPicker = async () => music;
    }, b64);
    await amp(p);
    await p.click("#mlAddFolder"); await p.click(".pop .mi:has-text('Link a music folder')"); await p.waitForTimeout(2500);
    await p.click("#mlAddFolder"); await p.click(".pop .mi:has-text('Sync this library through Music')"); await p.waitForTimeout(2500);
    const file = () => p.evaluate(async () => { const m = await (await navigator.storage.getDirectory()).getDirectoryHandle("Music"); return JSON.parse(await (await (await m.getFileHandle("neon-os-library.json")).getFile()).text()); });
    let f = await file(); check(Object.keys(f.tracks).length === 2, "library saved to the folder");
    // pretend the other computer changed things
    await p.evaluate(async () => {
      const m = await (await navigator.storage.getDirectory()).getDirectoryHandle("Music"), fh = await m.getFileHandle("neon-os-library.json");
      const d = JSON.parse(await (await fh.getFile()).text());
      d.tracks["Music/two.wav"].title = "Renamed on laptop"; d.tracks["Music/one.wav"].plays = 3; d.tracks["Music/one.wav"].fav = true;
      d.playlists.pLaptop = { name: "From laptop", tracks: ["Music/one.wav"] }; d.settings["neon-os:pulse"] = JSON.stringify({ bpm: 141 });
      const w = await fh.createWritable(); await w.write(JSON.stringify(d)); await w.close();
    });
    await p.click("#mlAddFolder"); await p.click(".pop .mi:has-text('Sync now')"); await p.waitForTimeout(2000);
    const lib2 = await p.evaluate(() => import("./core/backup.js").then(async m => { const db = await m.openDb(); const t = await m.all(db, "tracks"), pls = await m.all(db, "playlists"); db.close(); return { titles: t.map(x => x.title).sort().join(), plays: t.map(x => x.plays || 0).sort().join(), favs: t.filter(x => x.fav).length, pls: pls.map(x => x.name + ":" + x.tracks.length).join() }; }));
    check(lib2.titles.includes("Renamed on laptop"), "a title changed on the other computer arrives");
    check(lib2.favs === 1 && lib2.plays.includes("3"), "favourites and play counts arrive");
    check(lib2.pls === "From laptop:1", "a playlist made on the other computer arrives");
    check(await p.evaluate(() => JSON.parse(localStorage.getItem("neon-os:pulse")).bpm) === 141, "Rack settings arrive");
    // and a change here goes back to the file
    await p.click("#mlRows .trow"); await p.keyboard.press("Control+KeyI"); await p.fill('.dialog [data-k="genre"]', "Synced"); await p.click(".dialog [type=submit]"); await p.waitForTimeout(500);
    await p.click("#mlAddFolder"); await p.click(".pop .mi:has-text('Sync now')"); await p.waitForTimeout(1500);
    f = await file(); check(Object.values(f.tracks).some(t => t.genre === "Synced") && Object.values(f.tracks).some(t => t.plays === 3), "a change here is written back, keeping theirs");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "choosing everything and deleting it, in every library"() {
    const p = await page({ viewport: { width: 1200, height: 800 } }); await desk(p);
    // Amp's library: Select all, Delete, Move to the Bin
    await amp(p, ["quiet.wav", "loud.wav"]);
    check(await p.$eval("#mlDel", e => e.disabled), "Amp's Delete waits for a choice");
    await p.click("#mlSelAll"); check(!(await p.$eval("#mlDel", e => e.disabled)), "Select all chooses every song");
    await p.click("#mlDel"); await p.waitForSelector(".dialog"); await p.click('.dialog button:has-text("Move to the Bin")'); await p.waitForTimeout(1200);
    check((await lib(p)).songs === 0 && (await p.evaluate(async () => (await (await import("/core/bin.js")).binList()).filter(i => i.kind === "song").length)) === 2, "both songs go to the Bin");
    // Photos: three pictures, Select, Select all, Delete for good
    await p.screenshot({ path: FX + "pa.png", clip: { x: 0, y: 0, width: 40, height: 30 } }); fs.copyFileSync(FX + "pa.png", FX + "pb.png"); fs.copyFileSync(FX + "pa.png", FX + "pc.png");
    await p.goto(URL + "apps/photos/"); await p.waitForTimeout(500);
    const ch = p.waitForEvent("filechooser"); await p.click("#add"); await (await ch).setFiles(["pa.png", "pb.png", "pc.png"].map(f => FX + f)); await p.waitForTimeout(1500);
    check((await p.$$eval(".pic", e => e.length)) === 3, "three pictures added");
    await p.click(".pic", { modifiers: ["Control"] }); check(await p.$eval("#viewer", e => e.hidden) && (await p.$$eval(".pic.chosen", e => e.length)) === 1, "Ctrl-click chooses a picture instead of opening it");
    await p.click("#selAll"); check((await p.$$eval(".pic.chosen", e => e.length)) === 3 && /3/.test(await p.$eval("#selN", e => e.textContent)), "Select all chooses every picture");
    await p.click("#selDel"); await p.waitForSelector(".dialog"); await p.click('.dialog button:has-text("Delete for good")'); await p.waitForTimeout(1200);
    check((await p.$$eval(".pic", e => e.length)) === 0 && !(await p.evaluate(async () => (await (await import("/core/bin.js")).binList()).some(i => i.kind === "photo"))) && (await p.evaluate(async () => (await (await import("/core/photos.js")).listPics()).length)) === 0, "Delete for good removes them without filling the Bin");
    // Notes: Ctrl+A, Delete, Move to the Bin
    await p.goto(URL + "apps/notes/"); await p.waitForTimeout(400);
    for (const t of ["One", "Two"]) { await p.click("#newNote"); await p.keyboard.type(t); await p.waitForTimeout(400); }
    await p.click("#pickStart"); await p.click("#pickAll"); check((await p.$$eval(".note.chosen", e => e.length)) >= 2, "Notes chooses every note");
    await p.click("#pickDel"); await p.waitForSelector(".dialog"); await p.click('.dialog button:has-text("Move to the Bin")'); await p.waitForTimeout(800);
    check(await p.evaluate(() => JSON.parse(localStorage.getItem("neon-os:notebook")).notes.length === 0) && (await p.evaluate(async () => (await (await import("/core/bin.js")).binList()).filter(i => i.kind === "note").length)) >= 2, "the chosen notes go to the Bin");
    // Recorder: Select all, Delete
    await p.goto(URL + "apps/recorder/"); await p.waitForTimeout(300);
    await p.evaluate(async () => { const db = await new Promise(r => { const q = indexedDB.open("neon-os-recorder", 1); q.onupgradeneeded = () => q.result.createObjectStore("recs", { keyPath: "id" }); q.onsuccess = () => r(q.result); }); await new Promise(r => { const t = db.transaction("recs", "readwrite"); for (const id of ["r1", "r2"]) t.objectStore("recs").put({ id, name: "Take " + id, at: Date.now(), dur: 1, blob: new Blob([new Uint8Array(10)], { type: "audio/webm" }) }); t.oncomplete = r; }); db.close(); });
    await p.reload(); await p.waitForTimeout(600);
    check((await p.$$eval("#list [data-id]", e => e.length)) === 2, "two recordings listed");
    await p.click("#pickAll"); await p.click("#pickDel"); await p.waitForSelector(".dialog"); await p.click('.dialog button:has-text("Delete")'); await p.waitForTimeout(600);
    check((await p.$$eval("#list [data-id]", e => e.length)) === 0, "Recorder deletes every chosen recording");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "every window resizes, and joined windows move and resize together"() {
    const p = await page({ viewport: { width: 1600, height: 1000 } }); await desk(p); await amp(p); await p.waitForTimeout(800);
    const box = sel => p.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
    const W = s => `[data-wid="amp:${s}"]`;
    const drag = async (sel, dx, dy, mods = []) => { const b = await p.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); for (const m of mods) await p.keyboard.down(m); await p.mouse.move(b.x, b.y); await p.mouse.down(); await p.mouse.move(b.x + dx / 2, b.y + dy / 2, { steps: 4 }); await p.mouse.move(b.x + dx, b.y + dy, { steps: 4 }); await p.mouse.up(); for (const m of mods) await p.keyboard.up(m); await p.waitForTimeout(300); };
    const m0 = await box(W("winMain")), e0 = await box(W("winEq")), pl0 = await box(W("winPl")), v0 = await box(W("winVis")), mini0 = await box("#mini");
    check(Math.abs(m0.y + m0.h - e0.y) <= 2 && Math.abs(e0.y + e0.h - pl0.y) <= 2, "Amp starts with player, equalizer and playlist joined");
    // the player grows taller: its display grows, and the windows joined below are pushed down
    await drag(W("winMain") + " .rz-s", 0, 80);
    const m1 = await box(W("winMain")), e1 = await box(W("winEq")), mini1 = await box("#mini");
    check(m1.h >= m0.h + 70 && mini1.h >= mini0.h + 60, `the player resizes in height and its display grows (${m0.h}→${m1.h}, display ${mini0.h}→${mini1.h})`);
    check(Math.abs(e1.y - (e0.y + (m1.h - m0.h))) <= 2, "the equalizer joined below moves down with it");
    await drag(W("winEq") + " .rz-s", 0, 60); const e2 = await box(W("winEq"));
    check(e2.h >= e1.h + 50, "the equalizer resizes in height too");
    // the player's right edge: the column below widens with it, the windows to the right are pushed along
    await drag(W("winMain") + " .rz-e", 40, 0);
    const m3 = await box(W("winMain")), e3 = await box(W("winEq")), pl3 = await box(W("winPl")), v3 = await box(W("winVis"));
    check(m3.w >= m0.w + 30 && Math.abs(e3.w - m3.w) <= 2 && Math.abs(pl3.w - m3.w) <= 2, "widening the player widens the equalizer and playlist lined up below it");
    check(Math.abs(v3.x - (v0.x + (m3.w - m0.w))) <= 2 && Math.abs(v3.w - v0.w) <= 2, "the visualiser joined to the right is pushed along, keeping its size");
    // dragging any joined window carries the group; Shift-drag pulls one away
    await drag(W("winEq") + " .titlebar .ttl", 30, 20); const m4 = await box(W("winMain")), e4 = await box(W("winEq"));
    check(Math.abs(m4.x - m3.x - 30) <= 14 && Math.abs(e4.y - m4.y - m4.h) <= 2, "dragging the equalizer carries the windows joined to it");
    await drag(W("winEq") + " .titlebar .ttl", 0, 120, ["Shift"]); const m5 = await box(W("winMain")), e5 = await box(W("winEq"));
    check(m5.x === m4.x && m5.y === m4.y && e5.y > m5.y + m5.h + 40, "Shift-drag pulls one window away on its own");
    // a framed app joins too: dock Clock under the equalizer that was pulled away, then drag Clock
    await p.click("#startBtn"); await p.click('.sm-item[data-app="clock"]'); await p.waitForSelector('[data-wid="clock"]'); await p.waitForTimeout(800);
    const c0 = await box('[data-wid="clock"]');
    await drag('[data-wid="clock"] .titlebar', e5.x - c0.x + 5, e5.y + e5.h - c0.y + 6);
    const c1 = await box('[data-wid="clock"]');
    check(Math.abs(c1.y - (e5.y + e5.h)) <= 2 && Math.abs(c1.x - e5.x) <= 2, `a framed window docks to an Amp window (${c1.x},${c1.y} vs ${e5.x},${e5.y + e5.h})`);
    await drag('[data-wid="clock"] .titlebar', 40, 30); const e6 = await box(W("winEq"));
    check(Math.abs(e6.x - e5.x - 40) <= 14 && Math.abs(e6.y - e5.y - 30) <= 14, "and dragging it carries the Amp window joined to it");
    await p.reload(); await p.waitForTimeout(1500);
    const m6 = await box(W("winMain"));
    check(Math.abs(m6.h - m5.h) <= 2, "sizes are remembered");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "the desktop moves to the music, and the colour can follow the cover"() {
    const p = await page(); await desk(p); await amp(p, ["beat120.wav"]);
    await p.waitForFunction(async () => { const { makeLocalStore } = await import("/core/storage.js"), s = makeLocalStore(); await s.init(); return s.tracks.some(t => t.analysis && t.analysis.bands); }, null, { timeout: 60000, polling: 1000 });
    // a red cover on the song
    await p.evaluate(async () => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); g.fillStyle = "#e02020"; g.fillRect(0, 0, 64, 64); g.fillStyle = "#111"; g.fillRect(0, 0, 64, 20);
      const blob = await new Promise(r => c.toBlob(r, "image/png")), { makeLocalStore } = await import("/core/storage.js"), s = makeLocalStore(); await s.init(); await s.updateTrack(s.tracks[0].id, { coverBlob: blob }); });
    await p.reload(); await p.waitForTimeout(900); await amp(p);
    await p.click("#bPlay");
    await p.waitForFunction(() => window.neonOsBeat && window.neonOsBeat.playing && document.body.classList.contains("music"), null, { timeout: 15000 }).catch(() => {});
    check(await p.evaluate(() => !!(window.neonOsBeat && window.neonOsBeat.playing && window.neonOsBeat.bpm > 100)), "Amp shares the beat with the desktop");
    check(await p.evaluate(() => document.body.classList.contains("music")), "the desktop follows the music while it plays");
    const flashed = await p.evaluate(() => new Promise(res => { let n = 0; const iv = setInterval(() => { if (document.body.classList.contains("onbeat")) n++; }, 15); setTimeout(() => { clearInterval(iv); res(n); }, 2500); }));
    check(flashed > 0, `window titles flash on the beat (${flashed} samples lit)`);
    const ball0 = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ball").trim());
    // Amp has already worked out the playing song's cover colour; turning Follow the album cover on uses it
    await p.evaluate(async () => (await import("/core/theme.js")).setTheme({ coverColor: true }));
    await p.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--ball").trim() !== "#3ff2ff", null, { timeout: 8000 }).catch(() => {});
    const ball1 = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ball").trim());
    const red = h => { const [r, g, b] = [1, 3, 5].map(o => parseInt(h.slice(o, o + 2), 16)); return r > 200 && g < 120 && b < 120; };
    check(red(ball1) && ball1 !== ball0, `the colour follows the album cover (${ball0} → ${ball1})`);
    await p.evaluate(async () => (await import("/core/theme.js")).setTheme({ coverColor: false })); await p.waitForTimeout(200);
    check(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ball").trim()) === ball0, "turning it off brings the chosen colour back");
    await p.evaluate(async () => (await import("/core/theme.js")).setTheme({ react: false }));
    await p.waitForFunction(() => !document.body.classList.contains("music"), null, { timeout: 5000 }).catch(() => {});
    check(await p.evaluate(() => !document.body.classList.contains("music")), "Move to the music can be turned off");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "Mixer: a volume and level for each app"() {
    const p = await page({ viewport: { width: 1500, height: 950 } }); await desk(p); await amp(p, ["song.wav"]); // a steady 20-second tone, so levels compare fairly
    if (await p.$eval("#bLevel", b => b.getAttribute("aria-pressed") === "true")) await p.click("#bLevel"); // levelling would change the loudness mid-test
    await p.click("#bPlay"); await p.waitForTimeout(1500);
    await p.click("#volBtn"); await p.click("#trMix"); await p.waitForSelector('[data-wid="mixer"]'); await p.waitForTimeout(500);
    const mf = p.frame({ url: /mixer/ }); await mf.waitForSelector('[data-ch="master"]', { timeout: 15000 }).catch(() => {});
    check((await mf.$$eval(".strip", e => e.length)) >= 12, "the Mixer has a strip for each app that makes sound, and Master");
    await mf.waitForFunction(() => document.querySelector('[data-ch="amp"]').classList.contains("live"), null, { timeout: 5000 }).catch(() => {});
    check(await mf.$eval('[data-ch="amp"]', e => e.classList.contains("live") && parseFloat(e.querySelector(".meter i").style.height) > 5), "Amp's light and meter show it playing");
    // Amp's typical level over 1.5 s (the median, so a moment mid-change doesn't decide it)
    const level = () => p.evaluate(() => new Promise(res => { const v = []; const ch = new BroadcastChannel("neon-os:levels"); ch.onmessage = e => { if (e.data.app === "amp") v.push(e.data.level); }; setTimeout(() => { ch.close(); v.sort((a, b) => a - b); res(v.length ? v[v.length >> 1] : 0); }, 1500); }));
    const l0 = await level();
    // drag Amp's fader to about a quarter
    const f = await mf.$('[data-ch="amp"] [data-f]'), b = await f.boundingBox();
    await p.mouse.click(b.x + b.width / 2, b.y + b.height * 0.75 + 5.5 * 0.5);
    await p.waitForFunction(async () => { const a = (await import("/core/mixer.js")).getMix().apps.amp; return a && a.v < 0.5; }, null, { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(800);
    const v = await p.evaluate(async () => (await import("/core/mixer.js")).getMix().apps.amp.v);
    check(v > 0.15 && v < 0.35, `Amp's fader sets its volume in the mix (${Math.round(v * 100)}%)`);
    const l1 = await level();
    check(l1 < l0 * 0.5 && l1 > 0, `Amp plays quieter (${l0.toFixed(2)} → ${l1.toFixed(2)})`);
    await mf.click('[data-ch="amp"] [data-m]'); await p.waitForTimeout(300);
    check((await level()) < 0.01 && /MUTE/.test(await mf.$eval('[data-ch="amp"] [data-p]', e => e.textContent)), "M mutes Amp");
    await mf.click("#reset"); await p.waitForTimeout(300);
    check(await p.evaluate(async () => { const m = (await import("/core/mixer.js")).getMix(); return m.master === 1 && !m.muteAll && !Object.keys(m.apps).length; }), "Reset puts every app back to 100%");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "Stats: listening history, top songs and the year in music"() {
    const p = await page({ viewport: { width: 1400, height: 950 } }); await desk(p); await amp(p, ["quiet.wav", "loud.wav", "beat120.wav"]);
    // a history: this week, last month and last year, plus a play counted live by Amp
    await p.evaluate(async () => {
      const { makeLocalStore } = await import("/core/storage.js"), s = makeLocalStore(); await s.init();
      const [a, b] = s.tracks; await s.updateTrack(a.id, { artist: "Aster", genre: "Synthwave" }); await s.updateTrack(b.id, { artist: "Borealis", genre: "Ambient" });
      const db = await new Promise(r => { const q = indexedDB.open("neon-os-history", 1); q.onupgradeneeded = () => q.result.createObjectStore("plays", { keyPath: "id", autoIncrement: true }).createIndex("at", "at"); q.onsuccess = () => r(q.result); });
      const now = Date.now(), add = (t, at) => ({ at, track: t.id, title: t.title, artist: t === a ? "Aster" : "Borealis", album: "", genre: t === a ? "Synthwave" : "Ambient", secs: 180 });
      const rows = [add(a, now - 3e5), add(a, now - 6e5), add(a, now - 9e5), add(b, now - 12e5), add(b, now - 40 * 864e5), add(a, now - 400 * 864e5)];
      await new Promise(r => { const t = db.transaction("plays", "readwrite"); rows.forEach(x => t.objectStore("plays").add(x)); t.oncomplete = r; }); db.close();
    });
    await p.click("#startBtn"); await p.click('.sm-item[data-app="stats"]'); await p.waitForSelector('[data-wid="stats"]'); await p.waitForTimeout(500);
    const sf = p.frame({ url: /stats/ });
    await sf.waitForSelector("#tArtists .row-i", { timeout: 20000 }).catch(() => {});
    const tiles = await sf.$$eval(".tile b", e => e.map(x => x.textContent));
    check(tiles[0] === "4" && tiles[1] === "12 min" && tiles[3] === "2", `this week: plays, listening time and artists (${tiles.join(", ")})`);
    check((await sf.$eval("#tArtists .row-i .t", e => e.textContent)) === "Aster" && (await sf.$eval("#tSongs .row-i .c", e => e.textContent)) === "3", "top artists and songs are counted");
    check((await sf.$$eval("#tGenres .row-i .t", e => e.map(x => x.textContent))).join() === "Synthwave,Ambient", "top genres");
    await sf.click('[data-span="year"]'); await sf.waitForFunction(() => /^\d{4}$/.test(document.getElementById("when").textContent), null, { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(300);
    const inYear = await p.evaluate(async () => (await (await import("/core/history.js")).playsSince(+new Date(new Date().getFullYear(), 0, 1))).length);
    check((await sf.$eval(".tile b", e => e.textContent)) === String(inYear), `the year view counts the year's plays (${inYear})`);
    await sf.click("#prev"); await sf.waitForFunction(y => document.getElementById("when").textContent === y, String(new Date().getFullYear() - 1), { timeout: 8000 }).catch(() => {});
    check((await sf.$eval("#when", e => e.textContent)) === String(new Date().getFullYear() - 1), "‹ steps back a year");
    await sf.click('[data-span="all"]'); await sf.waitForFunction(() => document.getElementById("when").textContent === "ALL TIME" && Number(document.querySelector(".tile b").textContent) >= 6, null, { timeout: 8000 }).catch(() => {});
    check(Number(await sf.$eval(".tile b", e => e.textContent)) >= 6, "All time counts every play");
    // clicking a song plays it in Amp
    await sf.click('[data-span="week"]'); await sf.waitForFunction(() => document.getElementById("when").textContent === "THIS WEEK" && document.querySelector("#tSongs .row-i"), null, { timeout: 8000 }).catch(() => {}); await sf.click("#tSongs .row-i");
    await p.waitForFunction(() => /quiet|loud/i.test(document.getElementById("marqueeText").textContent), null, { timeout: 8000 }).catch(() => {});
    check(await p.evaluate(() => /quiet|loud/i.test(document.getElementById("marqueeText").textContent)), "clicking a top song plays it in Amp");
    await sf.$eval("#mkPl", b => b.click()); // Amp came to the front when it started playing
    await p.waitForFunction(async () => { const { makeLocalStore } = await import("/core/storage.js"), s = makeLocalStore(); await s.init(); return s.playlists.some(pl => /^Top 25/.test(pl.name)); }, null, { timeout: 8000, polling: 400 }).catch(() => {});
    check(await p.evaluate(async () => { const { makeLocalStore } = await import("/core/storage.js"), s = makeLocalStore(); await s.init(); return s.playlists.some(pl => /^Top 25/.test(pl.name) && pl.tracks.length === 2); }), "the top 25 becomes a playlist");
    await sf.$eval("#recapBtn", b => b.click()); await p.waitForTimeout(400);
    check(!(await sf.$eval("#recap", e => e.hidden)) && /Aster/.test(await sf.$eval("#rc", e => e.textContent)), "Recap shows the year's top artist");
    await sf.$eval("#rc [data-x]", b => b.click());
    // a new play reaches Stats straight away (Amp stopped first, so its own count can't land in between)
    await p.evaluate(() => dispatchEvent(new CustomEvent("neonos:transport", { detail: "stop" }))); await p.waitForTimeout(1200);
    const n0 = await p.evaluate(async () => (await (await import("/core/history.js")).playsSince(0)).length), t0 = Number(await sf.$eval(".tile b", e => e.textContent));
    await p.evaluate(async () => { const h = await import("/core/history.js"); const { makeLocalStore } = await import("/core/storage.js"), s = makeLocalStore(); await s.init(); await h.logPlay(s.tracks[2], 2); });
    await sf.waitForFunction(t => Number(document.querySelector(".tile b").textContent) === t + 1, t0, { timeout: 8000 }).catch(() => {});
    check((await p.evaluate(async () => (await (await import("/core/history.js")).playsSince(0)).length)) === n0 + 1 && Number(await sf.$eval(".tile b", e => e.textContent)) === t0 + 1, `a new play shows in Stats straight away (${t0} → ${await sf.$eval(".tile b", e => e.textContent)})`);
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "Tuner and metronome"() {
    const p = await page(); await p.goto(URL + "apps/tuner/"); await p.waitForTimeout(500);
    // pitch detection on made-up notes: A4, low E on a guitar, and a slightly sharp G3
    const heard = await p.evaluate(() => { const sr = 48000, mk = (f, harm) => { const b = new Float32Array(4096); for (let i = 0; i < b.length; i++) { const t = i / sr; b[i] = 0.4 * Math.sin(2 * Math.PI * f * t) + (harm ? 0.3 * Math.sin(4 * Math.PI * f * t) + 0.15 * Math.sin(6 * Math.PI * f * t) : 0); } return b; };
      return [440, 82.41, 197].map((f, i) => { const r = window.__tuner.detect(mk(f, i === 1), sr); return r ? r.freq : 0; }); });
    check(Math.abs(heard[0] - 440) < 1 && Math.abs(heard[1] - 82.41) < 0.5 && Math.abs(heard[2] - 197) < 0.6, `the tuner finds the note (${heard.map(f => f.toFixed(2)).join(", ")} Hz)`);
    check(await p.evaluate(() => window.__tuner.detect(new Float32Array(4096), 48000) === null), "and stays quiet in silence");
    await p.click("#listen"); await p.waitForTimeout(1500); // the test browser's pretend microphone plays a beep
    check(await p.$eval("#listen", e => e.getAttribute("aria-pressed")) === "true", "Listen uses the microphone");
    await p.click("#listen");
    // metronome: tap tempo, then it ticks
    // four taps half a second apart, timed by the page itself so a busy test machine can't stretch the gaps
    await p.evaluate(() => new Promise(res => { let n = 0; const go = () => { document.getElementById("tap").click(); if (++n < 4) setTimeout(go, 500); else res(); }; go(); }));
    const bpm = Number(await p.$eval("#bpmVal", e => e.textContent));
    check(bpm >= 110 && bpm <= 130, `tapping sets the tempo (${bpm} BPM)`);
    await p.selectOption("#beats", "3"); await p.click("#go"); await p.waitForTimeout(2100);
    const ticks = await p.evaluate(() => window.__tuner.ticks);
    check(ticks >= 4 && ticks <= 7, `the metronome ticks in time (${ticks} in 2 s at ${bpm} BPM)`);
    check((await p.$$eval("#leds i", e => e.length)) === 3, "the beats in a bar show as lights");
    await p.keyboard.press("Space"); await p.waitForTimeout(200);
    check(!(await p.evaluate(() => window.__tuner.running)), "Space stops it");
    // Link: follows the shared clock's tempo
    await p.click("#link"); await p.evaluate(async () => (await import("/core/clock.js")).clock.start(96)); await p.waitForTimeout(400);
    check(Number(await p.$eval("#bpmVal", e => e.textContent)) === 96 && await p.evaluate(() => window.__tuner.running), "with Link on it starts with the Rack and takes its tempo");
    await p.evaluate(async () => (await import("/core/clock.js")).clock.stop()); await p.waitForTimeout(200);
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "MIDI controllers drive the desktop"() {
    const p = await page({ viewport: { width: 1500, height: 950 } });
    // a pretend controller in every window: window.__midiSend([status, data1, data2]) plays a message from it
    await p.addInitScript(() => {
      const inp = new EventTarget(); inp.name = "Test Pad"; inp.id = "t1";
      const acc = new EventTarget(); acc.inputs = new Map([["t1", inp]]); acc.outputs = new Map();
      navigator.requestMIDIAccess = async () => acc;
      window.__midiSend = bytes => { const e = new Event("midimessage"); e.data = new Uint8Array(bytes); inp.dispatchEvent(e); };
    });
    await desk(p); await amp(p, ["beat120.wav"]);
    // assign in Settings: Learn, then move a knob
    await p.click("#startBtn"); await p.click('.sm-item[data-app="settings"]'); await p.waitForSelector('[data-wid="settings"]'); await p.waitForTimeout(1200);
    const sf = p.frame({ url: /settings/ });
    await sf.click('[data-learn="rack.tempo"]'); await p.waitForTimeout(300);
    check(/MOVE A CONTROL/.test(await sf.$eval('[data-learn="rack.tempo"]', b => b.parentElement.textContent)), "Learn waits for a control");
    await sf.evaluate(() => window.__midiSend([0xb0, 7, 64])); await p.waitForTimeout(300);
    check(/CC 7/.test(await sf.$eval('[data-learn="rack.tempo"]', b => b.parentElement.textContent)) && /Test Pad/.test(await sf.$eval("#midiState", e => e.textContent)), "moving a knob assigns it, and the controller is named");
    await sf.click('[data-learn="amp.toggle"]'); await sf.evaluate(() => window.__midiSend([0x90, 36, 100])); await p.waitForTimeout(200);
    await sf.click('[data-learn="mix.master"]'); await sf.evaluate(() => window.__midiSend([0xb0, 10, 30])); await p.waitForTimeout(200);
    await sf.click('[data-learn="decks.xfade"]'); await sf.evaluate(() => window.__midiSend([0xb0, 11, 30])); await p.waitForTimeout(400);
    check(Object.keys(await p.evaluate(async () => (await import("/core/midi.js")).getMap())).length === 4, "four jobs assigned");
    // the desktop does the jobs
    await p.evaluate(() => window.__midiSend([0xb0, 7, 127])); await p.waitForTimeout(200);
    check((await p.evaluate(async () => (await import("/core/clock.js")).clock.state.bpm)) === 200, "a knob sets the Rack's tempo");
    await p.evaluate(() => window.__midiSend([0x90, 36, 100]));
    await p.waitForFunction(() => window.neonOsBeat && window.neonOsBeat.playing, null, { timeout: 15000 }).catch(() => {});
    check(await p.evaluate(() => window.neonOsBeat && window.neonOsBeat.playing), "a pad plays Amp");
    await p.evaluate(() => { window.__midiSend([0x80, 36, 0]); window.__midiSend([0x90, 36, 90]); }); await p.waitForTimeout(500);
    check(await p.evaluate(() => !(window.neonOsBeat && window.neonOsBeat.playing && performance.now() - window.neonOsBeat.at < 200)), "pressing it again pauses");
    await p.evaluate(() => window.__midiSend([0xb0, 10, 64])); await p.waitForTimeout(200);
    check(Math.abs((await p.evaluate(async () => (await import("/core/mixer.js")).getMix().master)) - 64 / 127) < 0.01, "a knob sets the Mixer's Master");
    await p.click("#startBtn"); await p.click('.sm-item[data-app="decks"]'); await p.waitForSelector('[data-wid="decks"]'); await p.waitForTimeout(1500);
    await p.evaluate(() => window.__midiSend([0xb0, 11, 0])); await p.waitForTimeout(400);
    check(/A 100%/.test(await p.frame({ url: /decks/ }).$eval("#xfPct", e => e.textContent)), "a knob moves Decks' crossfader");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "music in the everyday apps: wake to music, sleep timer, events and slideshows"() {
    const p = await page({ viewport: { width: 1400, height: 900 } }); await desk(p); await amp(p, ["beat120.wav", "song.wav"]);
    const pl = await p.evaluate(async () => { const { makeLocalStore } = await import("/core/storage.js"), s = makeLocalStore(); await s.init(); const pl = await s.createPlaylist("Morning"); await s.updatePlaylist(pl.id, { tracks: [s.tracks.find(t => /song/i.test(t.title)).id] }); return pl.id; });
    await p.evaluate(() => dispatchEvent(new CustomEvent("neonos:transport", { detail: "stop" })));
    // Clock lists the playlists to wake to
    await p.click("#startBtn"); await p.click('.sm-item[data-app="clock"]'); await p.waitForSelector('[data-wid="clock"]'); await p.waitForTimeout(1200);
    const cf = p.frame({ url: /clock/ });
    check((await cf.$$eval("#aMusic option", e => e.map(o => o.textContent))).includes("Playlist: Morning"), "an alarm can wake you to a playlist");
    // an alarm due now with the Morning playlist: Amp plays it, fading in
    await p.evaluate(pl => { const d = new Date(), hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); const c = JSON.parse(localStorage.getItem("neon-os:clock") || "{}"); c.alarms = [{ id: "w1", time: hm, label: "Wake up", days: [], on: true, music: "pl:" + pl }]; localStorage.setItem("neon-os:clock", JSON.stringify(c)); }, pl);
    await p.waitForFunction(() => /SONG/i.test(document.getElementById("marqueeText").textContent) && window.neonOsBeat !== undefined, null, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(1500);
    const ampVol = () => p.evaluate(() => parseInt(document.getElementById("volPct").textContent) / 100); // Amp's own readout (it saves the volume only once it settles)
    const vol1 = await ampVol();
    check(/SONG/i.test(await p.evaluate(() => document.getElementById("marqueeText").textContent)), "the alarm plays the playlist in Amp");
    check(vol1 < 0.4, `and the music fades in (volume ${Math.round(vol1 * 100)}% after 1.5 s)`);
    await p.waitForTimeout(2500);
    const vol2 = await ampVol();
    check(vol2 > vol1, `getting louder (${Math.round(vol2 * 100)}%)`);
    // moving the volume yourself stops the fade
    await p.evaluate(() => window.postMessage({ neonOs: "volume", v: 0.8 }, location.origin)); await p.waitForTimeout(1200);
    check(Math.abs((await ampVol()) - 0.8) < 0.02, "setting the volume yourself takes over from the fade");
    // a sleep timer ending fades the music out
    await p.evaluate(() => { const c = JSON.parse(localStorage.getItem("neon-os:clock")); c.timer = { label: "", endsAt: Date.now() + 500, left: 0, total: 60000, sleep: true }; localStorage.setItem("neon-os:clock", JSON.stringify(c)); });
    await p.waitForTimeout(5000);
    const vol3 = await ampVol();
    check(vol3 < 0.75 && (await p.$$eval(".notice", e => e.map(x => x.textContent).join())).includes("Sleep timer"), `a sleep timer fades the music out (${Math.round(vol3 * 100)}% after 4 s)`);
    await p.evaluate(() => window.postMessage({ neonOs: "volume", v: 0.8 }, location.origin));
    await p.evaluate(() => dispatchEvent(new CustomEvent("neonos:transport", { detail: "stop" }))); await p.waitForTimeout(400);
    // a Calendar event with music starts it when it begins
    await p.click("#startBtn"); await p.click('.sm-item[data-app="calendar"]'); await p.waitForSelector('[data-wid="calendar"]'); await p.waitForTimeout(1000);
    check((await p.frame({ url: /calendar/ }).$$eval("#music option", e => e.length)) >= 4, "a Calendar event can start music");
    await p.evaluate(() => { const d = new Date(), k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"), hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      localStorage.setItem("neon-os:calendar", JSON.stringify({ events: [{ id: "e1", title: "Party", date: k, time: hm, remind: null, music: "all" }] })); });
    await p.waitForFunction(() => window.neonOsBeat && window.neonOsBeat.playing, null, { timeout: 8000 }).catch(() => {});
    check(await p.evaluate(() => !!(window.neonOsBeat && window.neonOsBeat.playing) || /BEAT|SONG/i.test(document.getElementById("marqueeText").textContent)), "the event's music starts on time");
    check(await p.evaluate(() => JSON.parse(localStorage.getItem("neon-os:calendar")).events[0].musicFired === true), "and only once");
    await p.evaluate(() => dispatchEvent(new CustomEvent("neonos:transport", { detail: "stop" }))); await p.waitForTimeout(400);
    // a Photos slideshow plays music while it runs and pauses it after
    await p.screenshot({ path: FX + "pm.png", clip: { x: 0, y: 0, width: 40, height: 30 } });
    await p.evaluate(pl => localStorage.setItem("neon-os:photos", JSON.stringify({ ...JSON.parse(localStorage.getItem("neon-os:photos") || "{}"), showMusic: "pl:" + pl })), pl);
    await p.click("#startBtn"); await p.click('.sm-item[data-app="photos"]'); await p.waitForSelector('[data-wid="photos"]'); await p.waitForTimeout(1200);
    const pf = p.frame({ url: /photos/ });
    const ch = p.waitForEvent("filechooser"); await pf.click("#add"); await (await ch).setFiles(FX + "pm.png"); await p.waitForTimeout(1200);
    check((await pf.$eval("#showMusic", e => e.value)) === "pl:" + pl, "Photos remembers the slideshow's music");
    await pf.click("#show"); await p.waitForTimeout(2500);
    check(await p.evaluate(() => (window.neonOsBeat && window.neonOsBeat.playing) || /SONG/i.test(document.getElementById("marqueeText").textContent)), "the slideshow starts the music");
    check(await p.evaluate(() => document.querySelector('[data-wid="photos"]').classList.contains("lit")), "and the slideshow stays in front");
    await pf.click("#vPlay"); await p.waitForTimeout(800);
    check(await p.evaluate(() => !(window.neonOsBeat && window.neonOsBeat.playing && performance.now() - window.neonOsBeat.at < 300)), "stopping the slideshow pauses it");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "scrobbling to ListenBrainz and Last.fm"() {
    const p = await page({ viewport: { width: 1400, height: 900 } });
    // pretend services: what Neon OS sends is kept to check
    const sent = []; let lbDown = false;
    await p.context().route("https://api.listenbrainz.org/**", async r => {
      const u = r.request().url(), auth = r.request().headers().authorization;
      if (u.endsWith("validate-token")) return r.fulfill({ json: auth === "Token good" ? { valid: true, user_name: "mannie" } : { valid: false }, headers: { "access-control-allow-origin": "*" } });
      if (lbDown) return r.fulfill({ status: 503, body: "", headers: { "access-control-allow-origin": "*" } });
      sent.push({ svc: "lb", body: JSON.parse(r.request().postData() || "{}") }); return r.fulfill({ json: { status: "ok" }, headers: { "access-control-allow-origin": "*" } });
    });
    await p.context().route("https://ws.audioscrobbler.com/**", async r => {
      const params = Object.fromEntries(new URLSearchParams(r.request().method() === "POST" ? r.request().postData() : r.request().url().split("?")[1]));
      sent.push({ svc: "lfm", params });
      if (params.method === "auth.getSession") return r.fulfill({ json: { session: { key: "sk1", name: "mannie_fm" } }, headers: { "access-control-allow-origin": "*" } });
      return r.fulfill({ json: { scrobbles: {} }, headers: { "access-control-allow-origin": "*" } });
    });
    await desk(p);
    await p.click("#startBtn"); await p.click('.sm-item[data-app="settings"]'); await p.waitForSelector('[data-wid="settings"]'); await p.waitForTimeout(1200);
    const sf = p.frame({ url: /settings/ });
    await sf.fill("#lbToken", "bad"); await sf.click("#lbGo"); await p.waitForTimeout(500);
    check(/Not connected/.test(await sf.$eval("#lbState", e => e.textContent)), "a wrong ListenBrainz token is refused");
    await sf.fill("#lbToken", "good"); await sf.click("#lbGo"); await p.waitForTimeout(500);
    check(/mannie/.test(await sf.$eval("#lbState", e => e.textContent)), "the right token connects, showing the user");
    // Last.fm: key and secret, then back from Last.fm with a token
    await sf.fill("#lfmKey", "KEY1"); await sf.fill("#lfmSecret", "SECRET1");
    await p.context().route("https://www.last.fm/**", r => r.fulfill({ body: "<p>Allow Neon OS?</p>", contentType: "text/html" }));
    const popup = p.waitForEvent("popup"); await sf.click("#lfmGo"); const pop = await popup; await pop.waitForLoadState().catch(() => {});
    check(/last\.fm\/api\/auth\/\?api_key=KEY1&cb=/.test(pop.url()), "Connect sends you to Last.fm to allow it");
    await pop.close();
    await p.goto(URL + "?token=TOK9"); await p.waitForTimeout(1500);
    const gs = sent.find(x => x.params && x.params.method === "auth.getSession");
    const sig = await p.evaluate(async () => (await import("/core/scrobble.js")).md5("api_keyKEY1methodauth.getSessiontokenTOK9SECRET1"));
    check(gs && gs.params.api_sig === sig, "the token becomes a session, signed the way Last.fm asks");
    check(await p.evaluate(async () => (await import("/core/scrobble.js")).getConf().lfm.sk === "sk1"), "Last.fm is connected");
    // Amp says what's playing to both
    await amp(p, ["beat120.wav"]); await p.click("#bPlay");
    for (let i = 0; i < 30 && !sent.some(x => x.svc === "lfm" && x.params.method === "track.updateNowPlaying"); i++) await p.waitForTimeout(500);
    check(sent.some(x => x.svc === "lb" && x.body.listen_type === "playing_now") && sent.some(x => x.svc === "lfm" && x.params.method === "track.updateNowPlaying" && x.params.sk === "sk1"), "playing a song sends now playing to both");
    // a listen goes to both; when a service is down it waits and goes with the next one
    lbDown = true;
    await p.evaluate(async () => { const S = await import("/core/scrobble.js"); await S.scrobble({ title: "First", artist: "Aster", album: "Night", duration: 200 }, Date.now() - 200000); });
    check(await p.evaluate(async () => (await import("/core/scrobble.js")).queued()) === 1, "a listen waits while the service is down");
    lbDown = false;
    await p.evaluate(async () => { const S = await import("/core/scrobble.js"); await S.scrobble({ title: "Second", artist: "Aster", duration: 200 }, Date.now() - 100000); });
    const batch = sent.filter(x => x.svc === "lb" && x.body.listen_type === "import").pop();
    check(batch && batch.body.payload.map(x => x.track_metadata.track_name).join() === "First,Second" && await p.evaluate(async () => (await import("/core/scrobble.js")).queued()) === 0, "then both go together once it's back");
    const lfmS = sent.filter(x => x.svc === "lfm" && x.params.method === "track.scrobble").pop();
    check(lfmS && lfmS.params["track[0]"] && lfmS.params["artist[0]"] === "Aster" && lfmS.params["timestamp[0]"], "Last.fm gets the listens with their times");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "Converter: FLAC to MP3, Opus and WAV, keeping the details"() {
    const p = await page({ viewport: { width: 1300, height: 900 } }); await p.goto(URL + "apps/convert/"); await p.waitForTimeout(500);
    const decoded = async (format) => p.evaluate(async f => { const it = window.__convert.items.find(i => i.format === f && i.out); const buf = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(await it.out.arrayBuffer()); return { secs: buf.duration, ch: buf.numberOfChannels, size: it.out.size, head: [...new Uint8Array(await it.out.slice(0, 4).arrayBuffer())].map(b => String.fromCharCode(b)).join(""), text: new TextDecoder("latin1").decode(await it.out.slice(0, 20000).arrayBuffer()) }; }, format);
    for (const f of ["mp3", "opus", "wav"]) {
      await p.click(`[data-f="${f}"]`);
      const ch = p.waitForEvent("filechooser"); await p.click("#addFiles"); await (await ch).setFiles(FX + "song.flac"); await p.waitForTimeout(300);
      await p.click("#go");
      await p.waitForFunction(() => window.__convert.items.every(i => i.state === "done" || i.state === "failed"), null, { timeout: 30000 }).catch(() => {});
      const st = await p.evaluate(() => window.__convert.items.map(i => i.state + (i.error ? ":" + i.error : "")).join());
      if (/failed/.test(st)) { check(false, `${f}: ${st}`); continue; }
      const r = await decoded(f);
      check(Math.abs(r.secs - 3) < 0.15 && r.ch === 2, `FLAC → ${f.toUpperCase()} plays back whole (${r.secs.toFixed(2)} s, ${r.ch} channels, ${Math.round(r.size / 1000)} KB)`);
      if (f === "mp3") check(r.head.startsWith("ID3") && /F\0l\0a\0c\0 \0S\0o\0n\0g/.test(r.text) && /APIC/.test(r.text), "the MP3 carries the title, artist and cover (ID3)");
      if (f === "opus") check(r.head === "OggS" && /OpusHead/.test(r.text) && /TITLE=Flac Song/.test(r.text) && /ARTIST=Aster/.test(r.text) && /METADATA_BLOCK_PICTURE=/.test(r.text), "the Opus file carries its tags and cover (Ogg)");
      if (f === "wav") check(r.head === "RIFF", "WAV comes out as a WAV");
    }
    check(/smaller/.test(await p.$eval("#total", e => e.textContent)), "it shows how much smaller the files are");
    // a song from the library: Convert…, swapped for the smaller copy
    await desk(p); await amp(p);
    await p.setInputFiles("#fileIn", FX + "song.flac"); await p.waitForTimeout(2500);
    const before = await p.evaluate(async () => { const { makeLocalStore } = await import("/core/storage.js"), s = makeLocalStore(); await s.init(); const t = s.tracks.find(x => x.title === "Flac Song"); return { id: t.id, size: t.blob.size }; });
    await p.click('#mlRows .trow:has-text("Flac Song")', { button: "right" }); await p.click('.pop .mi:has-text("Convert")'); await p.waitForSelector('[data-wid="convert"]'); await p.waitForTimeout(1200);
    const cf = p.frame({ url: /convert/ });
    check(/Flac Song/.test(await cf.$eval("#queue", e => e.textContent)), "Amp's Convert… sends the song to the Converter");
    await cf.click('[data-f="mp3"]'); await cf.check("#swap"); await cf.click("#go");
    await cf.waitForFunction(() => window.__convert.items.every(i => i.state === "done" || i.state === "failed"), null, { timeout: 30000 }).catch(() => {});
    const after = await p.evaluate(async id => { const { makeLocalStore } = await import("/core/storage.js"), s = makeLocalStore(); await s.init(); const t = s.tracks.find(x => x.id === id); return { size: t.blob.size, mime: t.mime, title: t.title }; }, before.id);
    check(after.size < before.size / 3 && after.mime === "audio/mpeg" && after.title === "Flac Song", `the library keeps the song, now a smaller MP3 (${Math.round(before.size / 1000)} → ${Math.round(after.size / 1000)} KB)`);
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "details editor and Tidy names"() {
    const p = await page(); await desk(p); await amp(p, ["quiet.wav", "loud.wav"]);
    await p.click("#mlRows .trow"); await p.click("#mlRows .trow:nth-of-type(3)", { modifiers: ["Shift"] });
    await p.keyboard.press("Control+KeyI"); await p.waitForSelector(".dialog.details");
    await p.fill('.dialog [data-k="artist"]', "The Band"); await p.click(".dialog [type=submit]"); await p.waitForTimeout(600);
    await p.click("#mlRows .trow"); await p.keyboard.press("Control+KeyI"); await p.fill('.dialog [data-k="artist"]', "the band"); await p.click(".dialog [type=submit]"); await p.waitForTimeout(600);
    await p.click('[data-browse="artists"]'); await p.click("#mlTidy"); await p.waitForTimeout(200);
    check(await p.$$eval(".tset", e => e.length) === 1, "Tidy names finds the two spellings");
    await p.click("#tGo"); await p.waitForTimeout(500); await p.click(".dialog [data-x]");
    const artists = await p.evaluate(() => import("./core/backup.js").then(async m => { const db = await m.openDb(); const t = await m.all(db, "tracks"); db.close(); return [...new Set(t.map(x => x.artist))].join(); }));
    check(artists === "The Band", "merged into one spelling");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "Rack: effects, Chop and Tape exports"() {
    const p = await page();
    await p.goto(`${URL}apps/pulse/`); await p.waitForTimeout(600);
    const exp = async () => { const [d] = await Promise.all([p.waitForEvent("download"), p.click("#wav")]); return d.path(); };
    const dry = await exp();
    await p.focus('#fx [data-fx="reverb"]'); await p.keyboard.press("End");
    const wet = await exp();
    const tw = wavTail(await wet, 8.3), td0 = wavTail(await dry, 8.3);
    check(tw > 0.0005 && tw > td0 * 4, `Pulse reverb tail in the export (${td0.toFixed(4)} dry, ${tw.toFixed(4)} wet)`);
    await desk(p); await amp(p, ["song.wav"]); await p.waitForTimeout(3000); await p.click('[data-wid="amp:winMain"] [data-act="close"]');
    await p.dblclick('.dicon[data-app="chop"]'); await p.waitForTimeout(1200);
    const cf = p.frame({ url: /chop/ }); await cf.click("[data-load]"); await p.waitForTimeout(1200);
    check((await cf.$$eval(".pad:not([disabled])", e => e.length)) === 16, "Chop slices a song onto 16 pads");
    const [cd] = await Promise.all([p.waitForEvent("download"), cf.click("#wav")]); check(/chop-A/.test(cd.suggestedFilename()), "Chop exports a WAV");
    await p.keyboard.press("Control+Alt+KeyD"); await p.dblclick('.dicon[data-app="tape"]'); await p.waitForTimeout(1200);
    const tf = p.frame({ url: /tape/ });
    const [td] = await Promise.all([p.waitForEvent("download"), tf.click("#wav")]);
    const tt = wavTail(await td.path(), 16.3); check(tt > 0.0004, `Tape plays the drum lane through Pulse's reverb (${tt.toFixed(4)})`);
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "backup and restore carry songs, Rack patterns and settings"() {
    const p = await page(); await desk(p); await amp(p, ["quiet.wav"]);
    const r = await p.evaluate(async () => {
      localStorage.setItem("neon-os:pulse", JSON.stringify({ bpm: 133 })); localStorage.setItem("neon-os:icons", JSON.stringify({ amp: { c: 2, r: 1 } }));
      const m = await import("./core/backup.js"), blob = await m.exportBackup();
      localStorage.removeItem("neon-os:pulse"); localStorage.removeItem("neon-os:icons");
      const db = await m.openDb(); await new Promise(res => { const t = db.transaction("tracks", "readwrite"); t.objectStore("tracks").clear(); t.oncomplete = res; }); db.close();
      const out = await m.importBackup(new File([blob], "b.neonos"));
      return { songs: out.songs, pulse: JSON.parse(localStorage.getItem("neon-os:pulse") || "{}").bpm, icons: !!localStorage.getItem("neon-os:icons"), lib: (await m.librarySummary()).songs };
    });
    check(r.songs === 1 && r.lib === 1, "songs come back");
    check(r.pulse === 133 && r.icons, "Rack patterns and desktop icons come back");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "remembers sections, sorting and the Decks mixer without saving"() {
    const p = await page(); await desk(p); await amp(p, ["quiet.wav", "loud.wav"]);
    await p.click('.thead [data-sort="title"]'); await p.click('.thead [data-sort="title"]'); await p.click('[data-smart="recent"]'); await p.waitForTimeout(400);
    await p.reload(); await p.waitForTimeout(2500);
    check(await p.$eval('.thead [data-sort="title"]', e => e.getAttribute("aria-sort")) === "descending", "Amp keeps its sort after a reload");
    check(await p.$eval('[data-smart="recent"]', e => e.getAttribute("aria-current")) === "true", "Amp keeps its library section");
    await p.goto(`${URL}apps/files/`); await p.waitForTimeout(600);
    await p.click('#head [data-sort="size"]'); await p.reload(); await p.waitForTimeout(600);
    check(await p.$eval('#head [data-sort="size"]', e => e.getAttribute("aria-sort")) === "ascending", "Files keeps its sort");
    await p.goto(`${URL}apps/decks/`); await p.waitForTimeout(800);
    await p.focus('[data-eq="B-low"]'); await p.keyboard.press("PageDown"); await p.focus("#xfade"); await p.keyboard.press("End");
    await p.click('#rows [data-load="A"]'); await p.waitForTimeout(1500);
    await p.reload(); await p.waitForTimeout(2000);
    check(await p.$eval('[data-eqv="B-low"]', e => e.textContent) === "-2.5" && await p.$eval("#xfPct", e => e.textContent) === "B 100%", "Decks keeps its EQ and crossfader");
    check((await p.$eval('[data-deck="A"] [data-f="title"]', e => e.textContent)) !== "EMPTY", "Decks puts the song back on deck A");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
  async "works offline after the first visit"() {
    const p = await page(); await desk(p);
    await p.evaluate(() => navigator.serviceWorker.ready); // every file saved (the worker is active once they are)
    await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(300);
    await p.context().setOffline(true); await p.reload(); await p.waitForTimeout(1500);
    check(await p.$$eval(".dicon", e => e.length) >= 8, "desktop opens offline");
    await p.keyboard.press("Control+Alt+Digit3"); await p.waitForTimeout(1200);
    const pf = p.frame({ url: /pulse/ }); check(!!pf && (await pf.$$eval(".step", e => e.length)) === 128, "Pulse opens offline");
  },
  async "phone layout"() {
    const p = await page({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }); await desk(p);
    check(await p.evaluate(() => document.body.classList.contains("compact")), "compact mode on a phone");
    await amp(p);
    const w = await p.$eval('[data-wid="amp:winMain"]', e => e.offsetWidth);
    check(w <= 390 && w >= 300, "Amp fits the screen width");
    await p.dblclick('.dicon[data-app="settings"]').catch(() => {}); await p.keyboard.press("Control+Alt+Digit2"); await p.waitForTimeout(1000);
    const r = await p.$eval('[data-wid="files"]', e => e.getBoundingClientRect()); check(r.width <= 390 && r.left >= 0, "framed apps fill the screen");
    check(!p.errors.length, "no errors " + p.errors.join(" | "));
  },
};
const only = process.argv[2];
for (const [name, fn] of Object.entries(tests)) {
  if (only && !name.toLowerCase().includes(only.toLowerCase())) continue;
  console.log(name); current = name;
  try { await fn(); } catch (e) { check(false, "threw: " + e.message.split("\n")[0]); }
}
await browser.close(); server.kill();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
