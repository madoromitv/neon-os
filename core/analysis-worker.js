// Neon OS core: analysis worker
// Runs the beat, tempo and band analysis away from the page, so it uses another core and keeps going at full speed
// while the tab is in the background. Receives { id, y, sr } (mono samples), replies { id, analysis } or { id, error }.
import { analyseSamples } from "./analysis.js";

self.onmessage = async e => {
  const { id, y, sr } = e.data;
  try { self.postMessage({ id, analysis: await analyseSamples(y, sr, () => {}) }); }
  catch (err) { self.postMessage({ id, error: String((err && err.message) || err) }); }
};
