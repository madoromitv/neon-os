// Neon OS core: version and what's new
// Bump VERSION and add an entry at the top of CHANGES with each update people should hear about:
// the desktop shows "What's new" once, the next time Neon OS opens, and About lists them all.
export const VERSION = "1.2";
export const CHANGES = [
  { v: "1.2", date: "2026-10-12", items: [
    "The orb's Look: presets (Orbit, Calm, Storm, Halo, Comet) and your own, with the number of balls, trail, size, glow and spin",
    "Live: the orb dances to a microphone, line-in or mixer, following the tempo it hears (right-click Live to pick the input)",
    "Rec: record the visualiser with its sound as a video",
    "The desktop app (1.2) keeps itself up to date: changes download in the background and are used after a restart",
  ] },
  { v: "1.1", date: "2026-10-12", items: [
    "A desktop app for Windows, macOS and Linux (About has the link), and the installed web app opens music files from your file explorer",
    "New everyday apps: Clock (alarms, timer, stopwatch, world clocks), Calendar with reminders, Calculator with tempo maths, Photos, System monitor and the Bin",
    "Notes has folders, search, Open and Export",
    "Several desktops: the numbers by the Neon button, or Ctrl+Alt+[ and ]",
    "A lock screen (Ctrl+Alt+L) with an optional PIN, and the orb as a screensaver (Settings)",
    "Deleted songs, playlists, notes and pictures wait in the Bin for 30 days",
    "Every app opens and saves files the same way, and can ask where to save (Settings)",
    "The start menu is grouped into Music, Everyday and System",
    "Photos stays quick with thousands of pictures: small previews made in the background and kept, and only what's on screen is drawn",
    "A picture wallpaper fits the whole picture to the screen by default (or Fill, Stretch, Centre in Settings) and follows the window's size",
  ] },
  { v: "1.0", date: "2026-10-12", items: [
    "Sync your library through your music folder: the same playlists, favourites and play counts on every computer (Amp: Folders, then Sync)",
    "Search everywhere (Ctrl+Space): apps, songs, artists, albums, playlists and settings",
    "A welcome for first visits, and this About window",
    "Everything is remembered as you go: window layout and sizes, library sections and sorting in Amp, Files, Decks and Chop, and the Decks mixer with the songs on each deck",
    "Numbers on every control: balance, chaos, each EQ band, swing, and the Decks EQ and crossfader",
    "Shared effects for the Rack: reverb, tempo-synced delay and a compressor",
    "Edit details and cover art for many songs at once, and Tidy names",
    "Volume levelling, gapless playback and crossfades in Amp",
    "Linked music folders, Chop, Tape, the WebGL orb, the phone layout, offline use and install",
  ] },
];
export const REPO = "https://github.com/madoromitv/neon-os";
