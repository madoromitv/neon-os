// Neon OS style kit: a list that only draws the rows on screen
// box: the scrolling element; rows: the element inside it that holds the rows; head: height of a sticky header
// above the rows (0 if none). set(items, renderRow) shows a list; renderRow(item, index) returns a row's HTML.
export function vlist(box, rows, { rowHeight = 26, head = 0, empty = () => "" } = {}) {
  let items = [], render = () => "", queued = false;
  function draw() {
    const n = items.length;
    if (!n) { rows.innerHTML = empty(); return; }
    const h = box.clientHeight || 400, top = Math.max(0, Math.min(box.scrollTop - head, n * rowHeight - h));
    const start = Math.max(0, Math.floor(top / rowHeight) - 10), end = Math.min(n, Math.ceil((top + h) / rowHeight) + 10);
    let html = `<div style="height:${start * rowHeight}px"></div>`;
    for (let i = start; i < end; i++) html += render(items[i], i);
    rows.innerHTML = html + `<div style="height:${(n - end) * rowHeight}px"></div>`;
  }
  box.addEventListener("scroll", () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; draw(); }); }, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(() => draw()).observe(box);
  return {
    set(list, renderRow, { keepScroll = false } = {}) { items = list; render = renderRow; if (!keepScroll) box.scrollTop = 0; draw(); },
    draw,
    get items() { return items; },
    ensureVisible(i) {
      const y = head + i * rowHeight;
      if (y - head < box.scrollTop) box.scrollTop = y - head; else if (y + rowHeight > box.scrollTop + box.clientHeight) box.scrollTop = y + rowHeight - box.clientHeight;
      draw();
    },
  };
}
