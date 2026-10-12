// Neon OS service worker: lets Neon OS open and run with no connection.
// Every file is saved on install. Online, files are checked with the server every time (so updates show on the next reload)
// and the saved copy is refreshed; offline, the saved copy is used. Fonts are saved the first time they load.
// The file list below is written by tools/precache.py; run it after changing files.
const VERSION = "ccd8669a20";
const FILES = [ "./", "index.html", "manifest.webmanifest", "apps/registry.js", "apps/about/", "apps/amp/amp.css", "apps/amp/amp.js", "apps/amp/", "apps/chop/chop.css", "apps/chop/chop.js", "apps/chop/", "apps/decks/decks.css", "apps/decks/decks.js", "apps/decks/", "apps/drift/drift.css", "apps/drift/drift.js", "apps/drift/", "apps/files/", "apps/help/", "apps/notes/", "apps/pulse/", "apps/pulse/pulse.css", "apps/pulse/pulse.js", "apps/settings/", "apps/tape/", "apps/tape/tape.css", "apps/tape/tape.js", "core/analyser.js", "core/analysis-worker.js", "core/analysis.js", "core/backup.js", "core/chop.js", "core/clock.js", "core/desk.js", "core/details.js", "core/drums.js", "core/engine.js", "core/fx.js", "core/glow.js", "core/library-tree.js", "core/library.js", "core/linked.js", "core/loudness.js", "core/notify.js", "core/os-link.js", "core/rack.js", "core/shortcuts.js", "core/sounds.js", "core/storage.js", "core/sync.js", "core/synth.js", "core/tags.js", "core/theme.js", "core/version.js", "core/wav.js", "icons/apple-touch-icon.png", "icons/favicon-64.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-192.png", "icons/maskable-512.png", "os/boot.js", "os/notices.js", "os/search.js", "os/shell.css", "os/shell.js", "style-kit/base.css", "style-kit/chrome.css", "style-kit/fx-panel.js", "style-kit/icons.js", "style-kit/library.css", "style-kit/tokens.css", "style-kit/ui.js", "style-kit/vlist.js" ];
const CACHE = "neon-os-" + VERSION, FONTS = "neon-os-fonts";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("neon-os-") && k !== CACHE && k !== FONTS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(FONTS).then(async c => (await c.match(req)) || fetch(req).then(r => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; })));
    return;
  }
  if (url.origin !== location.origin || req.headers.has("range")) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      // always check with the server (a quick "not changed" when nothing's new), so updates show on the next reload
      const r = await fetch(req, { cache: "no-cache" });
      if (r.ok && r.type === "basic") c.put(req, r.clone());
      return r;
    } catch (err) {
      return (await c.match(req, { ignoreSearch: true })) || (req.mode === "navigate" && await c.match("./")) || Response.error();
    }
  })());
});
