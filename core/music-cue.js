// Neon OS core: music that other apps start
// Clock alarms can wake you to music, a Clock timer can fade the music out (a sleep timer), a Calendar event can
// start music when it begins, and a Photos slideshow can play music while it runs. They all pick from the same
// list: all songs shuffled, favourites shuffled, or one of your playlists. The desktop plays the choice in Amp.
import { makeLocalStore } from "./storage.js";
let cache = null;
async function lib() { if (!cache) { const s = makeLocalStore(); await s.init(); cache = s; setTimeout(() => { cache = null; }, 4000); } return cache; }
// [{ value, label }] for a <select>; value "" is no music
export async function musicChoices() {
  const s = await lib();
  return [{ value: "", label: "No music" }, { value: "all", label: "All songs, shuffled" }, { value: "favs", label: "Favourites, shuffled" },
    ...s.playlists.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ value: "pl:" + p.id, label: "Playlist: " + p.name }))];
}
export async function fillMusicSelect(sel, value = "") {
  const opts = await musicChoices();
  sel.innerHTML = opts.map(o => `<option value="${o.value}">${o.label.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])}</option>`).join("");
  sel.value = opts.some(o => o.value === value) ? value : "";
}
export async function musicLabel(value) { if (!value) return ""; const o = (await musicChoices()).find(x => x.value === value); return o ? o.label.replace(/^Playlist: /, "") : "a playlist that's gone"; }
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// the songs to play for a choice
export async function idsFor(value) {
  const s = await lib(), have = new Set(s.tracks.map(t => t.id));
  if (value === "all") return shuffle(s.tracks.map(t => t.id));
  if (value === "favs") return shuffle(s.tracks.filter(t => t.fav).map(t => t.id));
  if (value && value.startsWith("pl:")) { const p = s.playlists.find(x => x.id === value.slice(3)); return p ? p.tracks.filter(id => have.has(id)) : []; }
  return [];
}
