// Copies the Neon OS web app (the same files GitHub Pages serves) into desktop/app/ for the desktop build.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), out = path.join(__dirname, "app");
const KEEP = ["index.html", "manifest.webmanifest", "os", "core", "style-kit", "apps", "icons"];
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
for (const k of KEEP) fs.cpSync(path.join(root, k), path.join(out, k), { recursive: true });
fs.mkdirSync(path.join(__dirname, "build"), { recursive: true });
fs.copyFileSync(path.join(root, "icons", "icon-1024.png"), path.join(__dirname, "build", "icon.png"));
console.log("Neon OS copied into desktop/app");
