// Neon OS core: the library sidebar shared by Files and Decks
// Draws the same sections as Amp: Songs, Artists, Albums, Genres, the smart playlists and your playlists.
// extra: more HTML for the end (Files adds its Documents section).
import { SMART, isGroupView } from "./library.js";

const P = {
  songs: "M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  artists: "M4 4h2v16H4zm4 0h2v16H8zm4.4.6 1.9-.6 5.1 15.4-1.9.6z",
  albums: "M12 3v10.55A4 4 0 1 0 14 17V7h4V3z",
  genres: "M3 17v2h6v-2zm0-12v2h10V5zm10 16v-2h8v-2h-8v-2h-2v6zM7 9v2H3v2h4v2h2V9zm14 4v-2H11v2zm-6-4h2V7h4V5h-4V3h-2z",
  smart: "M3 17v2h6v-2zm0-12v2h10V5zm10 16v-2h8v-2h-8v-2h-2v6zM7 9v2H3v2h4v2h2V9zm14 4v-2H11v2zm-6-4h2V7h4V5h-4V3h-2z",
  pl: "M3 6h12v2H3zm0 5h12v2H3zm0 5h8v2H3zm13-1 6 3.5-6 3.5z",
};
export const treeIcon = k => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${P[k]}"/></svg>`;
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function treeHTML(view, tracks, playlists, groups, extra = "") {
  const have = new Set(tracks.map(t => t.id));
  const cur = (type, id) => view.type === type && (id == null || view.id === id);
  const inGroup = t => view.type === t || view.type + "s" === t;
  const item = (attrs, icon, name, n, on) => `<button class="fold" ${attrs} aria-current="${on}">${treeIcon(icon)}<span class="name">${esc(name)}</span>${n == null ? "" : `<span class="n">${n}</span>`}</button>`;
  return `<span class="head lbl">Library</span>
    ${item('data-v="all"', "songs", "Songs", tracks.length, view.type === "all")}
    ${item('data-v="artists"', "artists", "Artists", groups.artists.length, inGroup("artists"))}
    ${item('data-v="albums"', "albums", "Albums", groups.albums.length, inGroup("albums"))}
    ${item('data-v="genres"', "genres", "Genres", groups.genres.length, inGroup("genres"))}
    <span class="head lbl">Smart playlists</span>
    ${SMART.map(sm => item(`data-smart="${sm.id}"`, "smart", sm.name, sm.pick(tracks.slice()).length, cur("smart", sm.id))).join("")}
    <span class="head lbl">Playlists</span>
    ${playlists.length ? playlists.map(p => item(`data-pl="${esc(p.id)}"`, "pl", p.name, p.tracks.filter(id => have.has(id)).length, cur("pl", p.id))).join("") : `<span class="fold none">None yet</span>`}
    ${extra}`;
}
// the view a sidebar click asks for, or null if the click wasn't on a section
export function treeClick(e) {
  const b = e.target.closest(".fold[data-v], .fold[data-smart], .fold[data-pl]"); if (!b) return null;
  if (b.dataset.smart) return { type: "smart", id: b.dataset.smart };
  if (b.dataset.pl) return { type: "pl", id: b.dataset.pl };
  return { type: b.dataset.v };
}
export { isGroupView };
