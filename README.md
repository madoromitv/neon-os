# Neon OS

A browser desktop and suite of apps in the Neon Orbit style: bevelled gunmetal chrome, LCD panels and glow in the colour of the orb.

It starts with a short boot screen (click to skip, or turn it off in Settings), then the desktop. Open apps from the Neon button, the desktop icons or a right-click on the desktop; the layout is remembered.

- **Snap:** drag a window to the left or right edge for half the screen, a corner for a quarter, the top for full screen
- **Dock:** windows pull towards the screen edges and each other when close; hold Alt to place freely
- **Resize:** from any edge or corner; double-click a top or bottom edge for full height, a side edge for full width
- **Shared borders:** drag the border between snapped windows to resize them together
- **Keyboard:** Ctrl+Alt+arrows snap the front window (Left/Right for halves, then Up/Down for quarters, Up for full screen, Down to restore or minimise). Press **?** anywhere for the full list
- **Switch apps:** hold Alt and press ` to step through open apps, let go to switch. Ctrl+Alt+M minimises, Ctrl+Alt+W closes, Ctrl+Alt+D shows the desktop, Ctrl+Alt+1 to 9 open apps, Ctrl+Alt+Space opens the start menu. These work inside every app, even while typing
- **Mini player:** while Amp has a song loaded, the taskbar shows it with previous, play/pause and next; click the title to bring Amp forward. Ctrl+Alt+P, Ctrl+Alt+. and Ctrl+Alt+, do the same from any app, and keyboard media keys work too
- **Notifications:** finished imports, analysis, backups, restores and saved recordings show up above the tray and stay in the bell's list. Quiet keeps them in the list without popping up
- **Desktop:** drag icons to move them (drop on another to swap); choose the wallpaper (orb, haze, plain or your own picture) and which icons show in Settings
- **Install:** in Chrome or Edge, **Install Neon OS** in the start menu or Settings gives it its own window and icon. Installed or not, it opens and runs with no connection once it has loaded once
- **Phones and tablets:** on a narrow screen, one app shows at a time, filling the screen; Amp's windows stack in one scrolling column. Switch apps from the taskbar
- **Accessibility:** high contrast and reduce motion in Settings; every window, menu, icon and the app switcher works from the keyboard, with labels for screen readers
- **Close:** the X on Amp's player closes all of Amp and stops the music; the X on any other Amp panel closes just that panel
- **Amp's player** carries every Amp window docked to it, like the classic player; drag any other Amp window to pull it free
- **Link:** turn on Link in Pulse and Drift and they share one tempo and start/stop, playing in time in separate windows
- **Effects:** Pulse, Drift, Chop and Tape share one effects row: reverb with room size, a delay that echoes in time with the tempo (1/4, 3/16, 1/8, 1/16) with repeats, and a compressor with a meter. Exports include the effects, and Tape plays each lane through its app's own effects, then its own on the whole track
- **Small windows:** windows keep their size and the desktop scrolls up, down, left and right to reach them; the taskbar stays put
- **Right-click:** the desktop (open apps, tidy, change colour, restart), desktop icons, taskbar buttons and window title bars all have menus
- **Sounds:** soft system sounds for opening, closing, minimising and snapping; the tray's speaker sets music and system volume and turns sounds off
- **Collapse:** the arrow on an Amp panel collapses it to its title bar, and docked panels below slide up to close the gap

**Live:** https://madoromitv.github.io/neon-os/

## Apps

| App | What it is | Status |
| --- | --- | --- |
| Amp | Music player with library, playlists, equalizer and the Neon Orbit visualiser; volume levelling (Level), gapless playback and crossfades of 3 to 12 seconds (Fade); edit details and cover art for several songs at once (Ctrl+I) and Tidy names to merge artists, albums and genres spelled more than one way; browse by artist, album and genre, smart playlists, favourites and play counts; stays quick with thousands of songs | Working |
| Files | The same library sections as Amp (songs, artists, albums, genres, smart playlists, playlists) plus notes; play in Amp, favourite, download, edit details and cover art (several songs at once), tidy names, delete | Working |
| Notes | Quick notes, saved in this browser | Working |
| Settings | Orb colour for every app at once, wallpaper and desktop icons, high contrast and reduce motion, library protection and install, backup and restore, layout reset | Working |
| Shortcuts | Every keyboard shortcut and mouse move, searchable (press ? anywhere) | Working |
| Pulse | 16-step drum machine: 8 synthesised drums, 4 patterns, tempo, swing, accents, WAV export | Working |
| Drift | Synth: 2 oscillators, filter, envelope, LFO, presets; on-screen, computer or MIDI keyboard; 16-step note sequencer | Working |
| Chop | Sampler: load any song and it's cut into 16 slices on its own beats; play them from pads or the keyboard, sequence four patterns, record, Link, WAV export | Working |
| Tape | Arranger: line up Pulse, Drift and Chop patterns bar by bar into a whole track, loop from a marker, export the track as a WAV | Working |
| Decks | Two-deck DJ mixer: waveforms, cue, 4-beat loop, pitch, beat sync, 3-band EQ, crossfader, mix recording; loads from the same library sections as Amp | Working |

## How it's built

Plain HTML, CSS and JavaScript modules. No build step, no framework: open it from any web server and it runs.

```
index.html   the Neon OS desktop
manifest.webmanifest  the installed app's name, colours and icons
sw.js        offline support: keeps a copy of every file (list written by tools/precache.py)
icons/       app icons (made by tools/make-icons.py)
os/          the shell: window manager, taskbar, start menu, wallpaper, app switcher, mini player
  notices.js   notifications: pop-ups and the bell's list
style-kit/   the look, shared by every app
  tokens.css   colours, fonts, glows (change the look here)
  base.css     page defaults
  chrome.css   windows, buttons, LEDs, LCD panels, sliders, menus, dialogs
  icons.js     icon paths
  ui.js        toasts, dialogs, menus, sliders
  vlist.js     lists that only draw the rows on screen
  library.css  library sidebar and rows
core/        shared engine, used by every app
  engine.js    audio playback, equalizer, analyser
  analysis.js  beat, tempo and band detection
  tags.js      song titles, artists and cover art
  storage.js   the library (this browser's IndexedDB)
  theme.js     the shared orb colour; every app follows it live
  backup.js    one-file backup and restore of songs, playlists, notes and settings
  os-link.js   passes desktop shortcuts from framed apps to the desktop
  shortcuts.js the list of desktop shortcuts, shared by the desktop, every app and the Shortcuts app
  notify.js    lets any app send a notification
  desk.js      the wallpaper picture
  sounds.js    system sounds, made on the fly (no sound files)
  drums.js     drum sounds, made on the fly; shared by Pulse and future apps
  synth.js     the synth engine Drift plays
  clock.js     the shared clock: Link keeps apps in time across windows
  analyser.js  background analysis queue, with analysis-worker.js doing the work on spare cores
  library.js   what Artists, Albums, Genres and the smart playlists contain, shared by Amp, Files and Decks
  library-tree.js  the library sidebar Files and Decks share
  linked.js    linked music folders: songs read straight from your disk
  chop.js      slicing songs on their beats, shared by Chop and Tape
  rack.js      plays Pulse, Drift and Chop patterns anywhere (Tape uses it)
  glow.js      the orb's glow drawn with WebGL (2D canvas where WebGL isn't available)
  wav.js       WAV export for the Rack apps
  fx.js        the Rack's shared effects: reverb, tempo-synced delay, compressor
  details.js   the details editor (several songs at once, cover art) and Tidy names, shared by Amp and Files
  loudness.js  measures each song's loudness for volume levelling
apps/
  registry.js  the list of apps the desktop shows
  amp/         the player
  files/       files
  pulse/       drum machine
  drift/       synth
  decks/       DJ mixer
  chop/        sampler
  tape/        arranger
  notes/       notes
  settings/    settings
  help/        the Shortcuts list
tests/         browser tests (run.mjs) and the test songs they use (fixtures.py)
tools/
  precache.py  writes the offline file list into sw.js; run it after adding or changing files
  make-icons.py  draws the app icons
```

Every app is also a normal page on its own (for example `apps/amp/`), so it works outside the desktop too.

There are two kinds of app. **Native** apps (Amp) run inside the desktop, so each of their windows is a real desktop window. **Framed** apps (Notes, Settings) run in a window of their own. A native app's windows share one taskbar button, and its music keeps playing when it's minimised.

## Adding an app

1. Make a folder in `apps/` with an `index.html` that loads the style kit and imports `core/os-link.js` (so desktop shortcuts work inside it)
2. Add it to `apps/registry.js`
3. Run `python tools/precache.py` so it works offline
4. It appears on the desktop and in the start menu

To send a notification from an app: `import { notify } from "../../core/notify.js"` then `notify("Title", "Text", "app-id")`. It returns false when the app is open on its own page, outside the desktop, so you can show a toast instead.

New apps use only style-kit parts. If an app needs a new part, it goes into the style kit first, so every app stays matched.

## Run it on your computer

Modules need a web server, not a double-clicked file:

```
python -m http.server 8000
```

Then open http://localhost:8000.

## Tests

`tests/run.mjs` opens the desktop and every app in a headless browser and checks the main things work: shortcuts and the app switcher, playing with levelling and gapless playback, linked folders, the details editor, the Rack's effects and exports, working offline and the phone layout. GitHub runs it on every push (`.github/workflows/checks.yml`), along with a check that the offline file list in `sw.js` is up to date.

To run it yourself: `npm install --no-save playwright && npx playwright install chromium`, then `python tests/fixtures.py && node tests/run.mjs`.

## Your music

Songs you add are stored in your own browser and never uploaded. The repository holds no music.

**Link your music folder (Chrome and Edge).** In Amp's library, **Folders → Link a music folder** plays songs straight from a folder on your disk: nothing is copied, so the library uses no browser storage, and **Rescan linked folders** picks up songs added, moved or removed since. If songs from that folder were copied in before, Amp offers to swap the copies for the files on disk, keeping their playlists, favourites, play counts and analysis. After the browser restarts it may ask for permission again: play a song or press **Reconnect folder**. Linked songs' audio stays in your folder, so backups hold their details, playlists and analysis but not the audio itself.

To copy your whole library in instead, drop the folder onto the desktop or use **Add folder** in Amp's library: every folder inside it is searched for music files (MP3, FLAC, WAV, OGG, M4A, AAC, Opus) and anything else is ignored. Songs are added straight away, four at a time, and are playable immediately; beats, tempo and visualiser data are worked out afterwards in background workers on spare processor cores (playing a song moves it to the front). If a song is already in your library (the same title plus the same file size, artist or album), Amp asks once per batch whether to **skip**, **replace** (the new copy keeps the old one's place in your playlists) or **keep both**.

Browsers can clear stored songs when a computer runs out of space. Adding songs asks the browser to protect the library, and **Settings → Protect my library** shows whether it agreed (browsers usually agree once Neon OS is installed or used often).

To keep them safe or move them, open **Settings → Back up everything**. You get one `.neonos` file with your songs, playlists, notes, Rack patterns and effects, desktop layout, wallpaper and settings. **Restore a backup** in any browser or on any computer brings it all back; restoring adds to what's there and never deletes songs.

## Roadmap

1. Foundations: split Amp into the style kit, core and app (done)
2. Neon OS shell: desktop, window manager, launcher, settings (done)
3. The Rack: Pulse, Drift, Chop, Tape and Decks, with Pulse, Drift and Chop on a shared clock (done)
4. The game: set aboard a ship whose orb is a sleeping mind; story notes in [LORE.md](LORE.md). Neon OS stays a clean tool with no lore in it.
