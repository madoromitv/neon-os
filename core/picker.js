// Neon OS core: the shared file picker
// Every app opens and saves files the same way: pickFiles() for opening (the system's open dialog),
// saveTarget() / saveAs() for saving (the system's save dialog when "Ask where to save" is on in Settings,
// otherwise straight to Downloads). See wav.js for the saving side.
export { saveTarget, saveAs, download } from "./wav.js";

// accept: like an <input type=file> accept list ("image/*", ".txt,.md"). Resolves to the chosen files, [] if cancelled.
export function pickFiles({ accept = "", multiple = false } = {}) {
  return new Promise(res => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = accept; inp.multiple = multiple; inp.hidden = true;
    let done = false;
    const finish = files => { if (done) return; done = true; inp.remove(); res(files); };
    inp.addEventListener("change", () => finish([...inp.files]));
    inp.addEventListener("cancel", () => finish([]));
    document.body.appendChild(inp);
    inp.click();
  });
}
