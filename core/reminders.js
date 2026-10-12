// Neon OS core: alarms, timers and calendar reminders
// Clock and Calendar save them here; the desktop checks every second whether one is due, so they go off even
// with those apps closed (while Neon OS is open). dueNow() returns what's due and marks it done.
export const CLOCK_KEY = "neon-os:clock", CAL_KEY = "neon-os:calendar";
const read = (k, d) => { try { return { ...d, ...JSON.parse(localStorage.getItem(k) || "null") }; } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
export const clockDefaults = () => ({ alarms: [], timer: { label: "", endsAt: null, left: 0, total: 0 }, zones: [], watch: { startedAt: null, elapsed: 0, laps: [] } });
export const loadClock = () => read(CLOCK_KEY, clockDefaults());
export const saveClock = c => write(CLOCK_KEY, c);
export const loadCalendar = () => read(CAL_KEY, { events: [] });
export const saveCalendar = c => write(CAL_KEY, c);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const pad2 = n => String(n).padStart(2, "0");
export const dayKey = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// when a calendar event's reminder goes off: its time minus the reminder (all-day events: 9:00 on the day)
export function remindAt(ev) {
  if (ev.remind == null || ev.remind === "") return null;
  const [y, m, d] = ev.date.split("-").map(Number), [hh, mm] = (ev.time || "09:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime() - Number(ev.remind) * 60000;
}

export function dueNow(now = new Date()) {
  const out = [], t = now.getTime();
  const c = loadClock(); let cc = false;
  const hm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`, today = dayKey(now);
  for (const a of c.alarms) {
    if (!a.on || a.time !== hm || a.lastFired === today + " " + hm) continue;
    if (a.days && a.days.length && !a.days.includes(now.getDay())) continue;
    a.lastFired = today + " " + hm; cc = true;
    if (!a.days || !a.days.length) a.on = false; // a one-off alarm turns itself off
    out.push({ kind: "alarm", title: a.label || "Alarm", text: `It's ${hm}.`, app: "clock" });
  }
  if (c.timer && c.timer.endsAt && t >= c.timer.endsAt) {
    out.push({ kind: "timer", title: c.timer.label || "Timer finished", text: `${fmtDur(c.timer.total)} is up.`, app: "clock" });
    c.timer.endsAt = null; c.timer.left = 0; cc = true;
  }
  if (cc) saveClock(c);
  const cal = loadCalendar(); let ch = false;
  for (const ev of cal.events) {
    const at = remindAt(ev); if (at == null || ev.fired || t < at) continue;
    ev.fired = true; ch = true;
    if (t - at > 6 * 3600e3) continue; // missed by hours (Neon OS was closed): don't ring late
    out.push({ kind: "event", title: ev.title || "Event", text: `${ev.time ? ev.time + " · " : "Today · "}${new Date(ev.date + "T00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}`, app: "calendar" });
  }
  if (ch) saveCalendar(cal);
  return out;
}
export function fmtDur(ms) {
  const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
  return h ? `${h}:${pad2(m)}:${pad2(x)}` : `${m}:${pad2(x)}`;
}
