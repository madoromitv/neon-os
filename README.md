# Neon OS

A browser desktop and suite of apps in the Neon Orbit style: bevelled gunmetal chrome, LCD panels and glow in the colour of the orb.

**Live:** https://madoromitv.github.io/neon-os/

## Apps

| App | What it is | Status |
| --- | --- | --- |
| Amp | Music player with library, playlists, equalizer and the Neon Orbit visualiser | Working |
| Orbit | The visualiser as its own app | Next |
| Pulse | Drum machine and step sequencer | Planned |
| Decks | Two-deck DJ mixer | Planned |
| Drift | Synth | Planned |

## How it's built

Plain HTML, CSS and JavaScript modules. No build step, no framework: open it from any web server and it runs.

```
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
apps/
  amp/         the player
```

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
2. Neon OS shell: desktop, window manager, launcher, settings
3. The Rack: Pulse, Decks and Drift on a shared audio clock
4. Ship systems: the OS as a ship's console
5. The game
