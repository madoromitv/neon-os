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
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
let failed = 0, passed = 0;
const check = (ok, what) => { if (ok) { passed++; console.log("  ok   " + what); } else { failed++; console.log("  FAIL " + what); } };
async function page(opts = {}, { fresh = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true, ...opts });
  const p = await ctx.newPage(); p.errors = [];
  p.on("pageerror", e => p.errors.push(e.message));
  p.on("console", m => { if (m.type() === "error" && !/fonts|ERR_|Failed to load resource/.test(m.text())) p.errors.push(m.text()); });
  await p.addInitScript(([v, fresh]) => { if (!sessionStorage.getItem("t")) { localStorage.setItem("neon-os:theme", JSON.stringify({ ball: "cyan", boot: false })); if (!fresh) localStorage.setItem("neon-os:seen-version", v); sessionStorage.setItem("t", "1"); } }, [VERSION, fresh]);
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
    for (const a of ["amp", "files", "pulse", "drift", "chop", "tape", "decks", "notes", "settings", "help", "about"]) { await p.goto(`${URL}apps/${a}/`); await p.waitForTimeout(500); }
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
    const p = await page(); await desk(p); await p.waitForTimeout(1500);
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
  console.log(name);
  try { await fn(); } catch (e) { failed++; console.log("  FAIL threw: " + e.message.split("\n")[0]); }
}
await browser.close(); server.kill();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
