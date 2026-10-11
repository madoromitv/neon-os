# Neon OS

A browser desktop and suite of apps in the Neon Orbit style: bevelled gunmetal chrome, LCD panels and glow in the colour of the orb.

Open it and you get a desktop. Open apps from the Neon button or the desktop icons; the layout is remembered.

- **Snap:** drag a window to the left or right edge for half the screen, a corner for a quarter, the top for full screen
- **Dock:** windows pull towards the screen edges and each other when close; hold Alt to place freely
- **Resize:** from any edge or corner; double-click a top or bottom edge for full height, a side edge for full width
- **Shared borders:** drag the border between snapped windows to resize them together
- **Keyboard:** Ctrl+Alt+arrows snap the front window (Left/Right for halves, then Up/Down for quarters, Up for full screen, Down to restore or minimise)
- **Close:** the X on Amp's player closes all of Amp and stops the music; the X on any other Amp panel closes just that panel
- **Amp's player** carries every Amp window docked to it, like the classic player; drag any other Amp window to pull it free

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

There are two kinds of app. **Native** apps (Amp) run inside the desktop, so each of their windows is a real desktop window. **Framed** apps (Notes, Settings) run in a window of their own. A native app's windows share one taskbar button, and its music keeps playing when it's minimised.

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
