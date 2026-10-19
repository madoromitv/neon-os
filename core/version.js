// Neon OS core: version and what's new
// Bump VERSION and add an entry at the top of CHANGES with each update people should hear about:
// the desktop shows "What's new" once, the next time Neon OS opens, and About lists them all.
export const VERSION = "1.6";
export const CHANGES = [
  { v: "1.6", date: "2026-10-19", items: [
    "Select all and Delete in every library: Photos, Amp, Files, Notes, Recorder and Video. Ctrl or Shift-click to choose a few, Ctrl+A for all, Delete to remove",
    "Deleting asks once: move them to the Bin (kept 30 days) or delete for good to free the space now. Thousands of photos go in one go",
  ] },
  { v: "1.5", date: "2026-10-17", items: [
    "Files is a file manager for folders on your computer: browse, open in the right app, rename, copy, move, new folder, delete to the Bin, search and preview",
    "Auto DJ in Amp (Fade's last setting): songs mix into each other on the beat, with the bass swapped halfway",
    "Quick settings (click the clock) and desktop widgets (right-click the desktop): clock, now playing, calendar, note, system",
    "Lyrics over Amp's visualiser, read from your songs' own tags (MP3, FLAC, M4A; synced ones stay in time), an .lrc beside the song, or pasted",
    "New apps: Recorder, Terminal, Radio and podcasts, and an Arcade with Beat (a rhythm game to your own songs) and Mines",
    "Pulse: pattern chains, MIDI export and your own samples; Decks: a filter and echo on each deck",
  ] },
  { v: "1.4", date: "2026-10-12", items: [
    "The wallpaper can be a slideshow of your Photos: all of them, the ones added there, or one linked folder; it fades between pictures every 1 minute to a day, shuffled or in order, with an optional slow zoom (Settings → Desktop, or Use as wallpaper in Photos)",
  ] },
  { v: "1.3", date: "2026-10-12", items: [
    "Video: watch videos from your computer or a linked folder, with subtitles, speed, loop and pop-out; each one carries on where you stopped",
    "Browser: the web with tabs, bookmarks and a start page (every site works in the desktop app; on the website, sites that allow it)",
    "Photos: the viewer always shows the whole picture, and Edit crops, turns, flips, straightens and adjusts light and colour, with filters",
    "Drag a box on the desktop to select icons, then move or open them together",
    "In the desktop app, videos open from your file explorer, and links that open a new window become Browser tabs",
  ] },
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
