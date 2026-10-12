// Neon OS app registry
// Each app is a folder under apps/ with its own index.html. Add an entry here and it appears on the desktop and in the start menu.
// w and h are the default window size in pixels.
// A "native" app runs inside the desktop itself, so each of its windows becomes a desktop window.
// main: the window whose X closes the whole app. stop: a button clicked to stop the app (e.g. music) on close.
// panels: the app's own toggle button for each other window, so its X hides that window the app's way.
// Other apps run in a framed window of their own.
// desktop: false leaves an app off the desktop until it's switched on in Settings (it's always in the start menu).
// group: where it sits in the start menu: "music" (the default), "everyday" or "system".
export const APPS = [
  { id: "amp", name: "Amp", desc: "Player, library, visualiser", url: "apps/amp/", native: { css: "amp.css", js: "amp.js", main: "winMain", stop: "bStop", panels: { winEq: "tEq", winPl: "tPl", winVis: "tVis", winMl: "tMl" } }, icon: "M12 3v10.55A4 4 0 1 0 14 17V7h4V3z" },
  { id: "files", name: "Files", desc: "Songs, playlists and notes", url: "apps/files/", w: 760, h: 480, group: "everyday", icon: "M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
  { id: "pulse", name: "Pulse", desc: "Drum machine", url: "apps/pulse/", w: 900, h: 560, icon: "M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z" },
  { id: "drift", name: "Drift", desc: "Synth and note sequencer", url: "apps/drift/", w: 900, h: 720, icon: "M3 17h3V7h2v10h3V4h2v13h3V9h2v8h3v2H3z" },
  { id: "chop", name: "Chop", desc: "Sampler: slice any song on the beat", url: "apps/chop/", w: 1060, h: 780, icon: "M9.6 7.6A3 3 0 1 0 8 9l2.6 1.9L8 12.9a3 3 0 1 0 1.6 1.5l2.4-1.7 7 5.3h3l-8.6-6.6L22 4h-3l-7 5.3zM6 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm0 10a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" },
  { id: "tape", name: "Tape", desc: "Arrange Rack patterns into a track", url: "apps/tape/", w: 1000, h: 520, icon: "M2 6h20v12H2zm2 2v8h16V8zm4 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm8 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm-6 1h4v2h-4z" },
  { id: "decks", name: "Decks", desc: "Two-deck DJ mixer", url: "apps/decks/", w: 1100, h: 700, icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" },
  { id: "notes", name: "Notes", desc: "Notes in folders, with search", url: "apps/notes/", w: 760, h: 480, group: "everyday", icon: "M5 3h10l4 4v14H5zm9 1.5V8h3.5zM8 11h8v1.6H8zm0 3.5h8v1.6H8zm0 3.5h5v1.6H8z" },
  { id: "clock", name: "Clock", desc: "Alarms, timer, stopwatch, world clocks", url: "apps/clock/", w: 480, h: 560, group: "everyday", icon: "M12 2a10 10 0 1 1 0 20a10 10 0 1 1 0-20zM12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16zM11 7h2v4.6l3.4 2-1 1.7L11 12.8z" },
  { id: "calendar", name: "Calendar", desc: "Events and reminders", url: "apps/calendar/", w: 760, h: 560, group: "everyday", icon: "M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2zM5 9v11h14V9zM7 11h4v4H7z" },
  { id: "calculator", name: "Calculator", desc: "Sums, plus tempo and note lengths", url: "apps/calculator/", w: 520, h: 480, group: "everyday", desktop: false, icon: "M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM7 5v4h10V5zm0 6v2h2v-2zm4 0v2h2v-2zm4 0v2h2v-2zm-8 3.5v2h2v-2zm4 0v2h2v-2zm4 0v5.5h2v-5.5zM7 18v2h2v-2zm4 0v2h2v-2z" },
  { id: "photos", name: "Photos", desc: "Pictures, slideshow, wallpaper", url: "apps/photos/", w: 960, h: 600, group: "everyday", icon: "M3 4h18v16H3zM5 6v12h14V6zM6 17l4-5 3 3.5 2-2.5 3 4zM15 8.5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 1 1 0-3z" },
  { id: "help", name: "Shortcuts", desc: "Every key and mouse move", url: "apps/help/", w: 560, h: 620, desktop: false, group: "system", icon: "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm3 2v2h2V8zm4 0v2h2V8zm4 0v2h2V8zM6 12v2h2v-2zm4 0v2h2v-2zm4 0v2h2v-2zm-6 4v2h8v-2z" },
  { id: "about", name: "About", desc: "Version, what's new, help", url: "apps/about/", w: 480, h: 560, desktop: false, group: "system", icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z" },
  { id: "monitor", name: "System monitor", desc: "Open apps, memory, storage", url: "apps/monitor/", w: 620, h: 620, desktop: false, group: "system", icon: "M2 3h20v14H2zM4 5v10h16V5zM6 10h2v4H6zm3.5-3h2v7h-2zm3.5 4h2v3h-2zm3.5-5h2v8h-2zM10 17h4v2h3v2H7v-2h3z" },
  { id: "bin", name: "Bin", desc: "Deleted things, kept for 30 days", url: "apps/bin/", w: 620, h: 480, group: "system", icon: "M9 3h6v2h5v2H4V5h5zM6 8h12l-1 13H7zM9.5 10.5v8h1.5v-8zm3.5 0v8h1.5v-8z" },
  { id: "settings", name: "Settings", desc: "Colour, desktop, backup, access", url: "apps/settings/", w: 480, h: 680, group: "system", icon: "M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" },
];
export const PLANNED = [
];
