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
  { id: "video", name: "Video", desc: "Watch videos, with subtitles", url: "apps/video/", w: 960, h: 600, group: "everyday", icon: "M3 5h18v14H3zM5 7v10h14V7zM10 9.2v5.6l4.6-2.8z" },
  { id: "browser", name: "Browser", desc: "The web, with tabs and bookmarks", url: "apps/browser/", w: 1100, h: 720, group: "everyday", icon: "M12 2a10 10 0 1 1 0 20a10 10 0 1 1 0-20zM12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16zM12 4c-2.6 2.1-4 5-4 8s1.4 5.9 4 8c2.6-2.1 4-5 4-8s-1.4-5.9-4-8zM12 6c1.7 1.6 2.6 3.8 2.6 6s-.9 4.4-2.6 6c-1.7-1.6-2.6-3.8-2.6-6s.9-4.4 2.6-6zM4 13h16v-2H4z" },
  { id: "radio", name: "Radio", desc: "Internet radio and podcasts", url: "apps/radio/", w: 720, h: 620, group: "music", icon: "M3 9h18v12H3zM5 11v8h8v-8zm11 1.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM4.6 7.8 17.2 3l.7 1.9L5.3 9.7z" },
  { id: "mixer", name: "Mixer", desc: "Volume for each app, levels, output", url: "apps/mixer/", w: 860, h: 400, group: "music", icon: "M6 3h2v6h2v3H8v9H6v-9H4V9h2zm6 0h2v12h2v3h-2v3h-2v-3h-2v-3h2zm6 0h2v3h2v3h-2v12h-2V9h-2V6h2z" },
  { id: "stats", name: "Stats", desc: "What you listen to: top songs, artists, your year", url: "apps/stats/", w: 900, h: 680, group: "music", icon: "M4 20V10h3v10zm6.5 0V4h3v16zM17 20v-7h3v7z" },
  { id: "recorder", name: "Recorder", desc: "Record, trim, send to Chop", url: "apps/recorder/", w: 640, h: 560, group: "music", icon: "M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4zM5 11h2a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.9V21h-2v-3.1A7 7 0 0 1 5 11z" },
  { id: "terminal", name: "Terminal", desc: "Type commands: open, play, alarm, ls…", url: "apps/terminal/", w: 760, h: 460, group: "system", desktop: false, icon: "M3 4h18v16H3zM5 6v12h14V6zM7 8.5l1.4-1.4L12.3 11l-3.9 3.9L7 13.5 9.5 11zM12 14h5v2h-5z" },
  { id: "arcade", name: "Arcade", desc: "Beat (play to your songs) and Mines", url: "apps/arcade/", w: 760, h: 620, group: "everyday", icon: "M7 6h10a5 5 0 0 1 5 5v3a4 4 0 0 1-7.2 2.4L13.5 15h-3l-1.3 1.4A4 4 0 0 1 2 14v-3a5 5 0 0 1 5-5zm0 3v2H5v2h2v2h2v-2h2v-2H9V9zm9.5 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-2 2.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" },
  { id: "help", name: "Shortcuts", desc: "Every key and mouse move", url: "apps/help/", w: 560, h: 620, desktop: false, group: "system", icon: "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm3 2v2h2V8zm4 0v2h2V8zm4 0v2h2V8zM6 12v2h2v-2zm4 0v2h2v-2zm4 0v2h2v-2zm-6 4v2h8v-2z" },
  { id: "about", name: "About", desc: "Version, what's new, help", url: "apps/about/", w: 480, h: 560, desktop: false, group: "system", icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z" },
  { id: "monitor", name: "System monitor", desc: "Open apps, memory, storage", url: "apps/monitor/", w: 620, h: 620, desktop: false, group: "system", icon: "M2 3h20v14H2zM4 5v10h16V5zM6 10h2v4H6zm3.5-3h2v7h-2zm3.5 4h2v3h-2zm3.5-5h2v8h-2zM10 17h4v2h3v2H7v-2h3z" },
  { id: "bin", name: "Bin", desc: "Deleted things, kept for 30 days", url: "apps/bin/", w: 620, h: 480, group: "system", icon: "M9 3h6v2h5v2H4V5h5zM6 8h12l-1 13H7zM9.5 10.5v8h1.5v-8zm3.5 0v8h1.5v-8z" },
  { id: "settings", name: "Settings", desc: "Colour, desktop, backup, access", url: "apps/settings/", w: 480, h: 680, group: "system", icon: "M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" },
];
export const PLANNED = [
];
