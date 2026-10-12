// Neon OS core: link from a framed app to the desktop
// Keys pressed inside a framed app don't reach the desktop, so desktop shortcuts are passed on.
import { osAction } from "./shortcuts.js";
if (window.parent !== window) {
  addEventListener("keydown", e => {
    const act = osAction(e); if (!act) return;
    e.preventDefault(); e.stopPropagation();
    parent.postMessage({ neonOs: "key", act, key: e.key }, location.origin);
  }, true);
  // the app switcher picks when Alt is let go
  addEventListener("keyup", e => { if (e.key === "Alt") parent.postMessage({ neonOs: "keyup", key: "Alt" }, location.origin); }, true);
}
