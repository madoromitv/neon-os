// Neon OS app registry
// Each app is a folder under apps/ with its own index.html. Add an entry here and it appears on the desktop and in the start menu.
// w and h are the default window size in pixels.
// A "native" app runs inside the desktop itself, so each of its windows becomes a desktop window.
// Other apps run in a framed window of their own.
export const APPS = [
  { id: "amp", name: "Amp", desc: "Player, library, visualiser", url: "apps/amp/", native: { css: "amp.css", js: "amp.js" }, icon: "M12 3v10.55A4 4 0 1 0 14 17V7h4V3z" },
  { id: "notes", name: "Notes", desc: "Quick notes, saved here", url: "apps/notes/", w: 520, h: 460, icon: "M5 3h10l4 4v14H5zm9 1.5V8h3.5zM8 11h8v1.6H8zm0 3.5h8v1.6H8zm0 3.5h5v1.6H8z" },
  { id: "settings", name: "Settings", desc: "Colour and sounds", url: "apps/settings/", w: 440, h: 420, icon: "M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" },
];
export const PLANNED = [
  { name: "Orbit", desc: "Visualiser" },
  { name: "Pulse", desc: "Drum machine" },
  { name: "Decks", desc: "DJ mixer" },
  { name: "Drift", desc: "Synth" },
];
