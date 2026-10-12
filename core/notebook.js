// Neon OS core: the notebook
// Notes are kept as a list (title from the first line, a folder, when it changed) in this browser's storage.
// The single note from older versions of Neon OS becomes the first note.
export const NB_KEY = "neon-os:notebook";
export function loadNotebook() {
  let nb = null; try { nb = JSON.parse(localStorage.getItem(NB_KEY) || "null"); } catch (e) {}
  if (!nb || !Array.isArray(nb.notes)) {
    let old = ""; try { old = localStorage.getItem("neon-os:notes") || ""; } catch (e) {}
    nb = { notes: old.trim() ? [{ id: "n" + Date.now().toString(36), text: old, folder: "", updated: Date.now() }] : [], folders: [] };
  }
  nb.folders = Array.isArray(nb.folders) ? nb.folders : [];
  return nb;
}
export function saveNotebook(nb) { try { localStorage.setItem(NB_KEY, JSON.stringify(nb)); } catch (e) {} }
export const noteTitle = n => (n.text || "").split("\n").map(s => s.trim()).find(Boolean)?.slice(0, 80) || "New note";
export const notebookText = nb => nb.notes.map(n => `# ${noteTitle(n)}\n${n.folder ? `(${n.folder})\n` : ""}\n${n.text}`).join("\n\n---\n\n");
