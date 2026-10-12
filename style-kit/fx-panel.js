// Neon OS style kit: the effects panel
// The same row of controls in every Rack app: reverb and room size, delay with its time and feedback, and the
// compressor. fxPanel(el, params, onChange) fills el; onChange(patch, done) runs as controls move (done: let go).
import { Slider, esc } from "./ui.js";
import { DELAY_TIMES } from "../core/fx.js";

const pct = v => Math.round(v * 100) + "%";
export function fxPanel(el, params, onChange) {
  el.classList.add("fxrow");
  el.innerHTML = `<span class="lbl fxh">FX</span>
    <span class="fxg"><span class="lbl">Reverb</span><div class="slider h" data-fx="reverb"></div><span class="lcd pct" data-p="reverb"></span>
      <span class="lbl">Room</span><div class="slider h" data-fx="size"></div><span class="lcd pct" data-p="size"></span></span>
    <span class="fxg"><span class="lbl">Delay</span><div class="slider h" data-fx="delay"></div><span class="lcd pct" data-p="delay"></span>
      <span class="seg" data-times>${DELAY_TIMES.map(t => `<button class="btn mini" data-time="${t.v}" aria-pressed="false" title="Echo every ${esc(t.name)} note, in time with the tempo">${esc(t.name)}</button>`).join("")}</span>
      <span class="lbl">Repeats</span><div class="slider h" data-fx="feedback"></div><span class="lcd pct" data-p="feedback"></span></span>
    <span class="fxg"><span class="lbl">Comp</span><div class="slider h" data-fx="comp"></div><span class="lcd pct" data-p="comp"></span><i class="gr" title="How much the compressor is turning the sound down"><b></b></i></span>`;
  const NAMES = { reverb: "Reverb amount", size: "Room size", delay: "Delay amount", feedback: "Delay repeats", comp: "Compressor amount" };
  const sliders = {};
  for (const s of el.querySelectorAll("[data-fx]")) {
    const k = s.dataset.fx;
    sliders[k] = Slider(s, { min: 0, max: 1, step: 0.01, value: params[k], label: NAMES[k], text: pct,
      onInput: v => { params[k] = v; el.querySelector(`[data-p="${k}"]`).textContent = pct(v); onChange({ [k]: v }, false); },
      onChange: v => onChange({ [k]: v }, true) });
    el.querySelector(`[data-p="${k}"]`).textContent = pct(params[k]);
  }
  const times = () => el.querySelectorAll("[data-time]").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.time === params.time)));
  el.querySelector("[data-times]").addEventListener("click", e => { const b = e.target.closest("[data-time]"); if (!b) return; params.time = +b.dataset.time; times(); onChange({ time: params.time }, true); });
  times();
  return {
    // set every control, e.g. after a reset
    set(p) { Object.assign(params, p); for (const k in sliders) { sliders[k].set(params[k]); el.querySelector(`[data-p="${k}"]`).textContent = pct(params[k]); } times(); },
    // reduction: dB from fx.reduction, shown as a small meter
    meter(reduction) { const b = el.querySelector(".gr b"); if (b) b.style.width = Math.min(100, Math.abs(reduction || 0) * 6) + "%"; },
  };
}
