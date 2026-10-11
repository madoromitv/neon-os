# Neon OS

A browser desktop and suite of apps in the Neon Orbit style: bevelled gunmetal chrome, LCD panels and glow in the colour of the orb.

Open it and you get a desktop: drag windows by their title bars, snap them to the left, right or top edge, minimise them to the taskbar, and open apps from the Neon button or the desktop icons. The layout is remembered.

**Live:** https://madoromitv.github.io/neon-os/

## Apps

| App | What it is | Status |
| --- | --- | --- |
| Amp | Music player with library, playlists, equalizer and the Neon Orbit visualiser | Working |
| Notes | Quick notes, saved in this browser | Working |
| Settings | Orb colour for every app at once, layout reset | Working |
| Orbit | The visualiser as its own app | Next |
| Pulse | Drum machine and step sequencer | Planned |
| Decks | Two-deck DJ mixer | Planned |
| Drift | Synth | Planned |

## How it's built

Plain HTML, CSS and JavaScript modules. No build step, no framework: open it from any web server and it runs.

```
index.html   the Neon OS desktop
os/          the shell: window manager, taskbar, start menu, wallpaper
style-kit/   the look, shared by every app
  tokens.css   colours, fonts, glows (change the look here)
  base.css     page defaults
  chrome.css   windows, buttons, LEDs, LCD panels, sliders, menus, dialogs
  icons.js     icon paths
  ui.js        toasts, dialogs, menus, sliders
core/        shared engine, used by every app
  engine.js    audio playback, equalizer, analyser
  analysis.js  beat, tempo and band detection
  tags.js      song titles, artists and cover art
  storage.js   the library (this browser's IndexedDB)
  theme.js     the shared orb colour; every app follows it live
apps/
  registry.js  the list of apps the desktop shows
  amp/         the player
  notes/       notes
  settings/    settings
```

Every app is also a normal page on its own (for example `apps/amp/`), so it works outside the desktop too.

## Adding an app

1. Make a folder in `apps/` with an `index.html` that loads the style kit
2. Add it to `apps/registry.js`
3. It appears on the desktop and in the start menu

New apps use only style-kit parts. If an app needs a new part, it goes into the style kit first, so every app stays matched.

## Run it on your computer

Modules need a web server, not a double-clicked file:

```
python -m http.server 8000
```

Then open http://localhost:8000.

## Your music

Songs you add are stored in your own browser and never uploaded. The repository holds no music.

## Roadmap

1. Foundations: split Amp into the style kit, core and app (done)
2. Neon OS shell: desktop, window manager, launcher, settings (done)
3. The Rack: Pulse, Decks and Drift on a shared audio clock
4. Ship systems: the OS as a ship's console
5. The game
