// Neon OS core: WAV files
// Turns a rendered AudioBuffer into a 16-bit WAV file (a Blob), for the Rack apps' Export buttons.
export function toWav(buf) {
  const ch = buf.numberOfChannels, n = buf.length, data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); data.setUint32(4, 36 + n * ch * 2, true); w(8, "WAVE"); w(12, "fmt ");
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true); data.setUint32(24, buf.sampleRate, true);
  data.setUint32(28, buf.sampleRate * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true); w(36, "data"); data.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, chans[c][i])); data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Blob([data], { type: "audio/wav" });
}
// "Save as": where the browser can (Chrome, Edge), asks where to save and under what name; elsewhere the file
// goes to the downloads folder. Call saveTarget() straight from the click, before any slow work (rendering),
// because the browser only shows its save window right after a click; then write the file when it's ready.
export async function saveTarget(name, type = {}) {
  let ask = true; try { ask = localStorage.getItem("neon-os:ask-save") !== "off"; } catch (e) {}
  if (ask && "showSaveFilePicker" in window) {
    try {
      const h = await showSaveFilePicker({ suggestedName: name, types: type.accept ? [{ description: type.description || "File", accept: type.accept }] : undefined });
      return { name: h.name, async write(blob) { const w = await h.createWritable(); await w.write(blob); await w.close(); }, picked: true };
    } catch (e) { if (e && e.name === "AbortError") return null; } // cancelled: nothing saved
  }
  return { name, write: async blob => download(blob, name), picked: false };
}
export async function saveAs(blob, name, type) { const t = await saveTarget(name, type); if (!t) return null; await t.write(blob); return t; }
// Saves a Blob to the downloads folder under the given name.
export function download(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
