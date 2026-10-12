// Neon OS app registry
// Each app is a folder under apps/ with its own index.html. Add an entry here and it appears on the desktop and in the start menu.
// w and h are the default window size in pixels.
// A "native" app runs inside the desktop itself, so each of its windows becomes a desktop window.
// main: the window whose X closes the whole app. stop: a button clicked to stop the app (e.g. music) on close.
// panels: the app's own toggle button for each other window, so its X hides that window the app's way.
// Other apps run in a framed window of their own.
// desktop: false leaves an app off the desktop until it's switched on in Settings (it's always in the start menu).
export const APPS = [
  { id: "amp", name: "Amp", desc: "Player, library, visualiser", url: "apps/amp/", native: { css: "amp.css", js: "amp.js", main: "winMain", stop: "bStop", panels: { winEq: "tEq", winPl: "tPl", winVis: "tVis", winMl: "tMl" } }, icon: "M12 3v10.55A4 4 0 1 0 14 17V7h4V3z" },
  { id: "files", name: "Files", desc: "Songs, playlists and notes", url: "apps/files/", w: 760, h: 480, icon: "M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
  { id: "pulse", name: "Pulse", desc: "Drum machine", url: "apps/pulse/", w: 900, h: 560, icon: "M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z" },
  { id: "drift", name: "Drift", desc: "Synth and note sequencer", url: "apps/drift/", w: 900, h: 720, icon: "M3 17h3V7h2v10h3V4h2v13h3V9h2v8h3v2H3z" },
  { id: "decks", name: "Decks", desc: "Two-deck DJ mixer", url: "apps/decks/", w: 1100, h: 700, icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" },
  { id: "notes", name: "Notes", desc: "Quick notes, saved here", url: "apps/notes/", w: 520, h: 460, icon: "M5 3h10l4 4v14H5zm9 1.5V8h3.5zM8 11h8v1.6H8zm0 3.5h8v1.6H8zm0 3.5h5v1.6H8z" },
  { id: "help", name: "Shortcuts", desc: "Every key and mouse move", url: "apps/help/", w: 560, h: 620, desktop: false, icon: "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm3 2v2h2V8zm4 0v2h2V8zm4 0v2h2V8zM6 12v2h2v-2zm4 0v2h2v-2zm4 0v2h2v-2zm-6 4v2h8v-2z" },
  { id: "settings", name: "Settings", desc: "Colour, desktop, backup, access", url: "apps/settings/", w: 480, h: 680, icon: "M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" },
];
export const PLANNED = [
];
