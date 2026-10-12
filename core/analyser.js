// Neon OS core: background analysis queue
// Songs join the library straight away and are analysed here afterwards: decoded on the page (the browser does this
// natively), then handed to a pool of workers (analysis-worker.js), one per spare core, up to four.
// prioritise(id) moves a song to the front, e.g. when it's played before its turn.
// Songs in a linked folder the browser hasn't been given access to yet wait aside; resume() tries them again.
import { decodeToMono, analyseSamples } from "./analysis.js";

export function createAnalyser({ getBlob, onDone, onError = () => {}, onIdle = () => {} }) {
  const size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
  const queue = [], active = new Set(), pool = [], free = [], blocked = new Set();
  let failedWorkers = false;
  function worker() {
    if (failedWorkers) return null;
    if (free.length) return free.pop();
    if (pool.length >= size) return null;
    try {
      const w = new Worker(new URL("./analysis-worker.js", import.meta.url), { type: "module" });
      w.jobs = new Map(); w.onmessage = e => { const j = w.jobs.get(e.data.id); if (j) { w.jobs.delete(e.data.id); e.data.error ? j.reject(new Error(e.data.error)) : j.resolve(e.data.analysis); } };
      w.onerror = () => { failedWorkers = true; for (const j of w.jobs.values()) j.reject(new Error("worker")); };
      pool.push(w); return w;
    } catch (e) { failedWorkers = true; return null; }
  }
  async function analyse(id, y, sr) {
    const w = worker();
    if (!w) return analyseSamples(y, sr, () => {}); // no module workers in this browser: analyse on the page instead
    try { return await new Promise((resolve, reject) => { w.jobs.set(id, { resolve, reject }); w.postMessage({ id, y, sr }, [y.buffer]); }); }
    finally { free.push(w); }
  }
  async function run(id) {
    active.add(id);
    try {
      const blob = await getBlob(id); if (!blob) throw new Error("missing");
      const dec = await decodeToMono(await blob.arrayBuffer());
      const analysis = await analyse(id, dec.y, dec.sr);
      await onDone(id, analysis, dec.duration);
    } catch (e) { if (e && e.code === "needs_permission") blocked.add(id); else await onError(id, e); }
    finally { active.delete(id); pump(); if (!active.size && !queue.length) onIdle(); }
  }
  function pump() { while (active.size < size && queue.length) run(queue.shift()); }
  return {
    get pending() { return queue.length + active.size; },
    get waiting() { return blocked.size; },
    resume() { const ids = [...blocked]; blocked.clear(); for (const id of ids) if (!active.has(id) && !queue.includes(id)) queue.push(id); pump(); },
    enqueue(ids) { for (const id of ids) if (!active.has(id) && !queue.includes(id)) queue.push(id); pump(); },
    prioritise(id) { if (active.has(id)) return; const i = queue.indexOf(id); if (i >= 0) queue.splice(i, 1); queue.unshift(id); pump(); },
    has: id => active.has(id) || queue.includes(id),
  };
}
