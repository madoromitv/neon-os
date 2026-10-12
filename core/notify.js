// Neon OS core: notifications
// notify() puts a notice in the desktop's tray (and pops it up briefly). It returns false when the app is
// running on its own page, outside the desktop, so the caller can show a toast instead.
export function notify(title, text = "", app = "") {
  const detail = { title, text, app };
  if (window.parent !== window) { parent.postMessage({ neonOs: "notify", ...detail }, location.origin); return true; }
  if (window.neonOsShell) { dispatchEvent(new CustomEvent("neonos:notify", { detail })); return true; }
  return false;
}
