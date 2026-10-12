// Neon OS core: desktop shortcuts
// One list, used three ways: the desktop acts on these keys, framed apps pass them on to the desktop,
// and the Shortcuts app shows them. Letters are matched by key position, so they work on any keyboard layout.
export const SHORTCUTS = [
  { group: "Windows", items: [
    ["Alt+`", "Switch between apps (keep Alt held and press ` again to move on, Shift+` to go back)"],
    ["Ctrl+Alt+← / →", "Snap the front window to the left or right half"],
    ["Ctrl+Alt+↑", "Full screen, or from a half, the top quarter"],
    ["Ctrl+Alt+↓", "Restore, or from a half, the bottom quarter; then minimise"],
    ["Ctrl+Alt+M", "Minimise the front app"],
    ["Ctrl+Alt+W", "Close the front app"],
    ["Ctrl+Alt+D", "Show the desktop (press again to bring the windows back)"],
    ["Ctrl+Alt+1 … 9", "Open an app, in start menu order"],
    ["Alt + drag", "Place a window freely, without docking"],
    ["Drag on the desktop", "Select icons with a box; Ctrl- or Shift-click adds one; drag a selected icon to move them all; Enter opens them"],
    ["Ctrl+Alt+[ / ]", "Go to the desktop before or after"],
    ["Ctrl+Alt+Shift+[ / ]", "Take the front app to the desktop before or after"],
  ] },
  { group: "Desktop", items: [
    ["Ctrl+K or Ctrl+Space", "Search everywhere: apps, songs, artists, albums, playlists and settings"],
    ["Ctrl+Alt+Space", "Open the start menu"],
    ["Ctrl+Alt+N", "Open notifications"],
    ["Ctrl+Alt+L", "Lock the screen"],
    ["? or F1", "Show this list"],
    ["Esc", "Close a menu, a pop-up or the app switcher"],
  ] },
  { group: "Music (works in any app)", items: [
    ["Ctrl+Alt+P", "Play or pause Amp"],
    ["Ctrl+Alt+. / ,", "Next or previous song"],
    ["Media keys", "Play, pause, next and previous on your keyboard or headphones"],
  ] },
  { group: "Amp", items: [
    ["Z X C V B", "Previous, play, pause, stop, next"],
    ["Space", "Play or pause"],
    ["← / →", "Back or forward 5 seconds"],
    ["↑ / ↓", "Volume up or down"],
    ["J", "Search the library"],
    ["Ctrl+I", "Edit details and cover art of the selected songs (also in Files)"],
    ["L", "Add songs"],
    ["F", "Full-screen visualiser"],
  ] },
  { group: "Drift", items: [
    ["A W S E D F T G Y H U J K", "Play notes, like a piano keyboard"],
  ] },
];

const editable = t => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ""));
const CODES = { KeyW: "close", KeyM: "minimise", KeyD: "desktop", Space: "start", KeyP: "toggle", Period: "next", Comma: "prev", KeyN: "notices", Slash: "help", KeyL: "lock" };

// The desktop action a key press asks for, or null.
export function osAction(e) {
  if (e.metaKey) return null;
  if (e.altKey && !e.ctrlKey && e.code === "Backquote") return e.shiftKey ? "switch-back" : "switch";
  if (e.ctrlKey && !e.altKey && !e.shiftKey && (e.code === "KeyK" || e.code === "Space")) return "search";
  if (e.ctrlKey && e.altKey) {
    if (e.key && e.key.startsWith("Arrow")) return "snap:" + e.key;
    if (/^Digit[1-9]$/.test(e.code)) return "open:" + (+e.code.slice(5) - 1);
    if (e.code === "BracketLeft" || e.code === "BracketRight") return (e.shiftKey ? "move-" : "desk-") + (e.code === "BracketRight" ? "next" : "prev");
    return CODES[e.code] || null;
  }
  if (e.key === "F1") return "help";
  if (e.key === "?" && !e.ctrlKey && !e.altKey && !editable(e.target)) return "help";
  return null;
}
