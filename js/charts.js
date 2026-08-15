/* Dependency-free SVG charts.

   Everything is drawn as plain SVG sized to its container in CSS pixels (rather
   than a scaled viewBox) so axis text stays crisp and legible on phones. Charts
   re-render on container resize; call disposeAll() before rebuilding a view so
   the observers from the previous render are released. */

const observers = [];

export function disposeAll() {
  while (observers.length) {
    const o = observers.pop();
    try { o.disconnect(); } catch { /* already gone */ }
  }
}

function observe(container, render) {
  if (typeof ResizeObserver === 'undefined') return;

  let lastWidth = container.clientWidth;
  let queued = false;

  const ro = new ResizeObserver(() => {
    const w = container.clientWidth;
    if (!w || Math.abs(w - lastWidth) <= 1 || queued) return;
    lastWidth = w;
    queued = true;
    // Redraw on the next frame rather than inside the callback: resizing the SVG
    // synchronously here re-triggers the observer and trips the browser's
    // "ResizeObserver loop completed with undelivered notifications" warning.
    requestAnimationFrame(() => {
      queued = false;
      if (container.isConnected) render(container.clientWidth || lastWidth);
    });
  });

  ro.observe(container);
  observers.push(ro);
}

/* --- Scale helpers -------------------------------------------------------- */

function niceNum(range, round) {
  if (!(range > 0)) return 1;
  const exp = Math.floor(Math.log10(range));
  const frac = range / 10 ** exp;
  let nice;
  if (round) nice = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
  else nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nice * 10 ** exp;
}

function niceScale(min, max, tickCount = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, step: 0.5, ticks: [0, 0.5, 1] };
  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
    min -= pad; max += pad;
  }
  const range = niceNum(max - min, false);
  const step = niceNum(range / Math.max(1, tickCount - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  const count = Math.round((niceMax - niceMin) / step);
  for (let i = 0; i <= count; i++) ticks.push(niceMin + i * step);
  return { min: niceMin, max: niceMax, step, ticks };
}

function decimalsForStep(step) {
  if (!(step > 0)) return 2;
  const d = Math.ceil(-Math.log10(step));
  return Math.min(4, Math.max(0, d));
}

/* --- Line chart ----------------------------------------------------------- */

/**
 * Render a time-series line chart with an optional target band.
 *
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {Array<{x:number, y:number}>} opts.points   x = epoch ms, y = value in display units
 * @param {string}  [opts.color]
 * @param {number}  [opts.targetLow]   display units; omit to skip the band
 * @param {number}  [opts.targetHigh]
 * @param {number}  [opts.height]
 * @param {number}  [opts.decimals]
 * @param {string}  [opts.unitLabel]
 */
export function lineChart(container, opts) {
  const render = (width) => drawLine(container, opts, width);
  render(container.clientWidth || 600);
  observe(container, render);
}

function drawLine(container, opts, width) {
  const {
    points = [],
    color = '#2f8fd0',
    targetLow, targetHigh,
    decimals = 2,
    unitLabel = '',
    height = 190,
  } = opts;

  container.innerHTML = '';

  if (!points.length) {
    container.innerHTML = '<p class="muted" style="padding:26px 8px;text-align:center;font-size:13.5px">No readings in this date range yet.</p>';
    return;
  }

  const W = Math.max(240, width || 600);
  const H = height;
  const padL = 46;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const data = [...points].sort((a, b) => a.x - b.x);

  // Y domain covers the data and, when present, the whole target band so the
  // band is always visible as a reference rather than clipped off-screen.
  let yMin = Math.min(...data.map((p) => p.y));
  let yMax = Math.max(...data.map((p) => p.y));
  const hasBand = Number.isFinite(targetLow) && Number.isFinite(targetHigh);
  if (hasBand) {
    yMin = Math.min(yMin, Math.min(targetLow, targetHigh));
    yMax = Math.max(yMax, Math.max(targetLow, targetHigh));
  }
  const scale = niceScale(yMin, yMax, 4);
  const tickDecimals = Math.max(decimalsForStep(scale.step), 0);

  let xMin = data[0].x;
  let xMax = data[data.length - 1].x;
  if (xMin === xMax) { xMin -= 43200000; xMax += 43200000; }

  const sx = (x) => padL + ((x - xMin) / (xMax - xMin)) * plotW;
  const sy = (y) => padT + plotH - ((y - scale.min) / (scale.max - scale.min)) * plotH;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Line chart of ${data.length} readings`);

  const add = (tag, attrs, text) => {
    const n = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    svg.append(n);
    return n;
  };

  // Target band.
  if (hasBand) {
    const lo = Math.min(targetLow, targetHigh);
    const hi = Math.max(targetLow, targetHigh);
    const yTop = sy(hi);
    const yBottom = sy(lo);
    const bandH = Math.max(2, yBottom - yTop);   // a zero-width target still shows as a line
    add('rect', {
      x: padL, y: yTop, width: plotW, height: bandH,
      fill: 'var(--ok)', opacity: 0.11,
    });
    add('line', {
      x1: padL, x2: padL + plotW, y1: yTop, y2: yTop,
      stroke: 'var(--ok)', 'stroke-width': 1, opacity: 0.45, 'stroke-dasharray': '3 3',
    });
    if (bandH > 3) {
      add('line', {
        x1: padL, x2: padL + plotW, y1: yBottom, y2: yBottom,
        stroke: 'var(--ok)', 'stroke-width': 1, opacity: 0.45, 'stroke-dasharray': '3 3',
      });
    }
  }

  // Y gridlines + labels.
  for (const t of scale.ticks) {
    const y = sy(t);
    add('line', { x1: padL, x2: padL + plotW, y1: y, y2: y, stroke: 'var(--line)', 'stroke-width': 1 });
    add('text', {
      x: padL - 7, y: y + 3.5, 'text-anchor': 'end',
      fill: 'var(--text-faint)', 'font-size': 10.5, 'font-family': 'inherit',
    }, t.toFixed(tickDecimals));
  }

  // X labels: first, last and a couple in between, without crowding.
  const xTickCount = Math.max(2, Math.min(5, Math.floor(plotW / 78)));
  const seen = new Set();
  for (let i = 0; i < xTickCount; i++) {
    const t = xMin + ((xMax - xMin) * i) / (xTickCount - 1);
    const label = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(t));
    if (seen.has(label)) continue;
    seen.add(label);
    const anchor = i === 0 ? 'start' : i === xTickCount - 1 ? 'end' : 'middle';
    add('text', {
      x: sx(t), y: H - 8, 'text-anchor': anchor,
      fill: 'var(--text-faint)', 'font-size': 10.5, 'font-family': 'inherit',
    }, label);
  }

  // Axis line.
  add('line', { x1: padL, x2: padL + plotW, y1: padT + plotH, y2: padT + plotH, stroke: 'var(--line-strong)', 'stroke-width': 1 });

  const coords = data.map((p) => ({ ...p, px: sx(p.x), py: sy(p.y) }));

  // Soft fill under the line.
  const areaPath = `M ${coords[0].px} ${padT + plotH} `
    + coords.map((c) => `L ${c.px} ${c.py}`).join(' ')
    + ` L ${coords[coords.length - 1].px} ${padT + plotH} Z`;
  add('path', { d: areaPath, fill: color, opacity: 0.09 });

  add('path', {
    d: 'M ' + coords.map((c) => `${c.px} ${c.py}`).join(' L '),
    fill: 'none', stroke: color, 'stroke-width': 2,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  });

  // Dots, dropped once the series gets dense enough that they merge anyway.
  const showDots = coords.length <= 45;
  if (showDots) {
    for (const c of coords) {
      add('circle', { cx: c.px, cy: c.py, r: 2.8, fill: 'var(--bg-elev)', stroke: color, 'stroke-width': 1.8 });
    }
  }

  const cursor = add('line', {
    x1: 0, x2: 0, y1: padT, y2: padT + plotH,
    stroke: 'var(--text-faint)', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0,
  });
  const marker = add('circle', { cx: 0, cy: 0, r: 4.5, fill: color, stroke: 'var(--bg-elev)', 'stroke-width': 2, opacity: 0 });

  container.append(svg);

  const tip = document.createElement('div');
  tip.className = 'chart__tip';
  container.append(tip);

  const fmtTipDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  function pointAt(clientX) {
    const rect = svg.getBoundingClientRect();
    const x = clientX - rect.left;
    let best = coords[0];
    let bestDist = Infinity;
    for (const c of coords) {
      const d = Math.abs(c.px - x);
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best;
  }

  function showTip(event) {
    const c = pointAt(event.clientX);
    cursor.setAttribute('x1', c.px);
    cursor.setAttribute('x2', c.px);
    cursor.setAttribute('opacity', 0.7);
    marker.setAttribute('cx', c.px);
    marker.setAttribute('cy', c.py);
    marker.setAttribute('opacity', 1);

    tip.innerHTML = `<b>${c.y.toFixed(decimals)}${unitLabel ? ' ' + unitLabel : ''}</b><br>${fmtTipDate.format(new Date(c.x))}`;
    tip.classList.add('is-on');

    // Keep the bubble inside the card.
    const tipW = tip.offsetWidth;
    const half = tipW / 2;
    const left = Math.min(Math.max(c.px, half + 4), W - half - 4);
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(c.py - 10, 22)}px`;
  }

  function hideTip() {
    cursor.setAttribute('opacity', 0);
    marker.setAttribute('opacity', 0);
    tip.classList.remove('is-on');
  }

  svg.addEventListener('pointermove', showTip);
  svg.addEventListener('pointerdown', showTip);
  svg.addEventListener('pointerleave', hideTip);
  svg.addEventListener('pointercancel', hideTip);
}

/* --- Sparkline ------------------------------------------------------------ */

/** Minimal trend line for dashboard tiles. `values` are plain numbers, oldest first. */
export function sparkline(values, color = '#2f8fd0', width = 120, height = 30) {
  if (!values || values.length < 2) return '';

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const stepX = (width - pad * 2) / (values.length - 1);

  const pts = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (height - pad * 2) * (1 - (v - min) / span);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  const line = 'M ' + pts.join(' L ');
  const area = `${line} L ${(pad + (values.length - 1) * stepX).toFixed(1)} ${height} L ${pad} ${height} Z`;
  const last = pts[pts.length - 1].split(' ');

  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${area}" fill="${color}" opacity="0.13"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="2" fill="${color}"/>
  </svg>`;
}

/* --- Bar chart ------------------------------------------------------------ */

/**
 * Vertical bar chart for monthly totals.
 * @param {HTMLElement} container
 * @param {{bars: Array<{label:string, value:number}>, color?:string, height?:number, format?:Function}} opts
 */
export function barChart(container, opts) {
  const render = (width) => drawBars(container, opts, width);
  render(container.clientWidth || 600);
  observe(container, render);
}

function drawBars(container, opts, width) {
  const { bars = [], color = '#2f8fd0', height = 180, format = (v) => v.toFixed(0) } = opts;

  container.innerHTML = '';
  if (!bars.length) {
    container.innerHTML = '<p class="muted" style="padding:26px 8px;text-align:center;font-size:13.5px">Nothing to chart yet.</p>';
    return;
  }

  const W = Math.max(240, width || 600);
  const H = height;
  const padL = 50;
  const padR = 10;
  const padT = 12;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const max = Math.max(...bars.map((b) => b.value), 0);
  const scale = niceScale(0, max || 1, 4);

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Bar chart of monthly totals');

  const add = (tag, attrs, text) => {
    const n = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    svg.append(n);
    return n;
  };

  const sy = (v) => padT + plotH - (v / scale.max) * plotH;

  for (const t of scale.ticks) {
    const y = sy(t);
    add('line', { x1: padL, x2: padL + plotW, y1: y, y2: y, stroke: 'var(--line)', 'stroke-width': 1 });
    add('text', {
      x: padL - 7, y: y + 3.5, 'text-anchor': 'end',
      fill: 'var(--text-faint)', 'font-size': 10.5, 'font-family': 'inherit',
    }, format(t));
  }

  const slot = plotW / bars.length;
  const barW = Math.max(4, Math.min(38, slot * 0.62));
  const labelEvery = Math.ceil(bars.length / Math.max(2, Math.floor(plotW / 46)));

  bars.forEach((b, i) => {
    const cx = padL + slot * i + slot / 2;
    const y = sy(b.value);
    const h = Math.max(b.value > 0 ? 2 : 0, padT + plotH - y);
    if (h > 0) {
      const rect = add('rect', {
        x: cx - barW / 2, y: padT + plotH - h, width: barW, height: h,
        fill: color, rx: 3, opacity: 0.88,
      });
      const title = document.createElementNS(svgNS, 'title');
      title.textContent = `${b.label}: ${format(b.value)}`;
      rect.append(title);
    }
    if (i % labelEvery === 0 || i === bars.length - 1) {
      add('text', {
        x: cx, y: H - 8, 'text-anchor': 'middle',
        fill: 'var(--text-faint)', 'font-size': 10.5, 'font-family': 'inherit',
      }, b.label);
    }
  });

  add('line', { x1: padL, x2: padL + plotW, y1: padT + plotH, y2: padT + plotH, stroke: 'var(--line-strong)', 'stroke-width': 1 });

  container.append(svg);
}
