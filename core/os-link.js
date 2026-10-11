// Neon OS core: link from a framed app to the desktop
// Keys pressed inside a framed app don't reach the desktop, so window shortcuts (Ctrl+Alt+arrows) are passed on.
if (window.parent !== window) {
  addEventListener("keydown", e => {
    if (e.ctrlKey && e.altKey && e.key.startsWith("Arrow")) {
      e.preventDefault();
      parent.postMessage({ neonOs: "key", key: e.key }, location.origin);
    }
  });
}
