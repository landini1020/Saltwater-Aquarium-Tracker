/* Parameters view: charts over time plus the underlying test log.
   Also owns the "Log Test" form, which the dashboard and the nav FAB reuse. */

import * as store from '../store.js';
import * as P from '../params.js';
import * as charts from '../charts.js';
import {
  esc, openModal, closeModal, toast, confirmDialog, formValues, parseNumber,
  formatDateTime, formatDateShort, localDateTimeValue, emptyState,
} from '../ui.js';

/* View-local state survives re-renders so filters stick while you work. */
const RANGES = [
  { id: '30', label: '30D', days: 30 },
  { id: '90', label: '90D', days: 90 },
  { id: '365', label: '1Y', days: 365 },
  { id: 'all', label: 'All', days: null },
];

let rangeId = '90';
let selected = null;   // Set of param ids, or null meaning "choose sensible defaults"

function cutoffFor(id) {
  const range = RANGES.find((r) => r.id === id);
  if (!range || !range.days) return null;
  return Date.now() - range.days * 86400000;
}

function defaultSelection(available) {
  const withData = available.filter((p) => store.readingsFor(p.id).length > 0);
  return new Set((withData.length ? withData : available).map((p) => p.id));
}

/** Show one parameter on its own — used when a dashboard tile is tapped. */
export function focusParam(paramId) {
  selected = new Set([paramId]);
  location.hash = '#/parameters';
}

/* --- Render --------------------------------------------------------------- */

export function render(root) {
  charts.disposeAll();

  const available = P.visibleParams(store.params());

  if (!selected) selected = defaultSelection(available);
  // Drop ids for parameters that have since been hidden or deleted.
  const availableIds = new Set(available.map((p) => p.id));
  selected = new Set([...selected].filter((id) => availableIds.has(id)));

  const cutoff = cutoffFor(rangeId);
  const chosen = available.filter((p) => selected.has(p.id));
  const totalReadings = store.readings().length;

  // Build into a detached wrapper and swap it in: the previous wrapper (and every
  // listener bound to it) is discarded, so re-rendering never stacks handlers.
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Parameters</h2>
        <p>${totalReadings ? `${totalReadings} readings logged` : 'No readings yet'}</p>
      </div>
      <div class="spacer"></div>
      <button class="btn btn--primary" data-action="log-test">Log Test</button>
    </div>

    <div class="stack">
      <section class="card">
        <div class="card__body">
          <div class="row" style="margin-bottom:12px">
            <div class="seg" role="group" aria-label="Date range">
              ${RANGES.map((r) => `<button type="button" data-range="${r.id}" class="${r.id === rangeId ? 'is-on' : ''}">${r.label}</button>`).join('')}
            </div>
            <div class="spacer"></div>
            <button class="btn btn--sm" data-sel="all">Select all</button>
            <button class="btn btn--sm" data-sel="none">Clear</button>
          </div>
          <div class="chips" id="paramChips">
            ${available.map((p) => `
              <button type="button" class="chip ${selected.has(p.id) ? 'is-on' : ''}" data-param="${esc(p.id)}">
                <span class="chip__swatch" style="background:${esc(p.color)}"></span>${esc(p.name)}
              </button>`).join('')}
          </div>
        </div>
      </section>

      <div id="chartArea" class="stack"></div>

      <section class="card">
        <div class="card__head">
          <h2>Test log</h2>
          <div class="spacer"></div>
          <span class="muted" id="tableMeta" style="font-size:12.5px"></span>
        </div>
        <div class="card__body card__body--flush">
          <div class="tablewrap" id="tableArea"></div>
        </div>
      </section>
    </div>
  `;

  root.replaceChildren(el);

  renderCharts(el.querySelector('#chartArea'), chosen, cutoff);
  renderTable(el.querySelector('#tableArea'), el.querySelector('#tableMeta'), chosen, cutoff);
  wire(el, root);
}

function renderCharts(area, chosen, cutoff) {
  if (!chosen.length) {
    area.innerHTML = `<section class="card">${emptyState({
      title: 'No parameters selected',
      message: 'Pick one or more parameters above to chart them over time.',
    })}</section>`;
    return;
  }

  // Before the first test there is nothing to plot: one prompt beats a dozen
  // identical empty charts.
  if (!store.readings().length) {
    area.innerHTML = `<section class="card">${emptyState({
      title: 'No readings yet',
      message: 'Record your first test and your parameters will start charting here.',
      action: '<button class="btn btn--primary" data-action="log-test">Log your first test</button>',
    })}</section>`;
    return;
  }

  area.innerHTML = chosen.map((p) => {
    const unitId = store.displayUnit(p);
    const unit = P.unitOf(p, unitId);
    const latest = store.latestReading(p.id);
    const latestText = latest
      ? `${P.formatValue(p, unitId, latest.value)}${unit.label ? ' ' + unit.label : ''} · ${formatDateShort(latest.date)}`
      : 'no readings';
    return `
      <section class="card chartcard">
        <div class="chartcard__head">
          <span class="chartcard__title" style="color:${esc(p.color)}">${esc(p.name)}</span>
          <span class="chartcard__latest">${esc(latestText)}</span>
          <span class="spacer" style="flex:1"></span>
          <span class="chartcard__latest">target ${esc(P.formatTarget(p, unitId) || 'n/a')}</span>
        </div>
        <div class="chart" data-chart="${esc(p.id)}"></div>
      </section>`;
  }).join('');

  for (const p of chosen) {
    const holder = area.querySelector(`[data-chart="${CSS.escape(p.id)}"]`);
    if (!holder) continue;

    const unitId = store.displayUnit(p);
    const unit = P.unitOf(p, unitId);
    const rows = store.readingsFor(p.id).filter((r) => {
      const t = new Date(r.date).getTime();
      return cutoff === null || t >= cutoff;
    });

    charts.lineChart(holder, {
      points: rows.map((r) => ({ x: new Date(r.date).getTime(), y: P.fromBase(unitId, r.value) })),
      color: p.color,
      targetLow: Number.isFinite(p.targetLow) ? P.fromBase(unitId, p.targetLow) : undefined,
      targetHigh: Number.isFinite(p.targetHigh) ? P.fromBase(unitId, p.targetHigh) : undefined,
      decimals: unit.decimals,
      unitLabel: unit.label,
      height: 190,
    });
  }
}

const MAX_TABLE_ROWS = 200;

function renderTable(area, metaEl, chosen, cutoff) {
  if (!chosen.length) {
    area.innerHTML = '<p class="muted" style="padding:20px;font-size:13.5px">Select a parameter to see its readings.</p>';
    metaEl.textContent = '';
    return;
  }

  const chosenIds = new Set(chosen.map((p) => p.id));
  const rows = store.readings().filter((r) => {
    if (!chosenIds.has(r.paramId)) return false;
    if (cutoff === null) return true;
    return new Date(r.date).getTime() >= cutoff;
  });

  if (!rows.length) {
    area.innerHTML = `<p class="muted" style="padding:20px;font-size:13.5px">No readings in this date range. ${
      store.readings().length ? 'Try widening the range above.' : 'Tap <b>Log Test</b> to record your first test.'
    }</p>`;
    metaEl.textContent = '';
    return;
  }

  // Group into test sessions — everything recorded at the same timestamp.
  const sessions = new Map();
  for (const r of rows) {
    if (!sessions.has(r.date)) sessions.set(r.date, { date: r.date, note: r.note, byParam: new Map() });
    const s = sessions.get(r.date);
    s.byParam.set(r.paramId, r);
    if (!s.note && r.note) s.note = r.note;
  }

  const ordered = [...sessions.values()].sort((a, b) => b.date.localeCompare(a.date));
  const shown = ordered.slice(0, MAX_TABLE_ROWS);
  metaEl.textContent = ordered.length > MAX_TABLE_ROWS
    ? `showing ${MAX_TABLE_ROWS} of ${ordered.length} tests`
    : `${ordered.length} test${ordered.length === 1 ? '' : 's'}`;

  const head = chosen.map((p) => {
    const unit = P.unitOf(p, store.displayUnit(p));
    return `<th class="num" title="${esc(p.name)}">${esc(p.short || p.name)}${unit.label ? `<br><span style="font-weight:500;text-transform:none;letter-spacing:0">${esc(unit.label)}</span>` : ''}</th>`;
  }).join('');

  const body = shown.map((s) => {
    const cells = chosen.map((p) => {
      const r = s.byParam.get(p.id);
      if (!r) return '<td class="num muted">–</td>';
      const unitId = store.displayUnit(p);
      const status = P.statusOf(p, r.value);
      return `<td class="num">
        <span class="cellstate">
          <span class="dot dot--${status}"></span>
          <button type="button" class="linkish" data-edit-reading="${esc(r.id)}"
                  style="background:none;border:0;padding:0;cursor:pointer;font:inherit;font-variant-numeric:tabular-nums">
            ${esc(P.formatValue(p, unitId, r.value))}
          </button>
        </span>
      </td>`;
    }).join('');

    return `<tr>
      <td class="nowrap">${esc(formatDateTime(s.date))}</td>
      ${cells}
      <td class="wrap muted" style="min-width:0">${esc(s.note || '')}</td>
      <td class="num"><button class="iconbtn" data-del-session="${esc(s.date)}" aria-label="Delete this test">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
      </button></td>
    </tr>`;
  }).join('');

  area.innerHTML = `<table>
    <thead><tr><th>Date</th>${head}<th>Note</th><th></th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

/* --- Events --------------------------------------------------------------- */

function wire(el, root) {
  el.addEventListener('click', async (event) => {
    const rangeBtn = event.target.closest('[data-range]');
    if (rangeBtn) { rangeId = rangeBtn.dataset.range; render(root); return; }

    const chip = event.target.closest('[data-param]');
    if (chip) {
      const id = chip.dataset.param;
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      render(root);
      return;
    }

    const sel = event.target.closest('[data-sel]');
    if (sel) {
      const available = P.visibleParams(store.params());
      selected = sel.dataset.sel === 'all' ? new Set(available.map((p) => p.id)) : new Set();
      render(root);
      return;
    }

    const editBtn = event.target.closest('[data-edit-reading]');
    if (editBtn) { openEditReading(editBtn.dataset.editReading); return; }

    const delBtn = event.target.closest('[data-del-session]');
    if (delBtn) {
      const date = delBtn.dataset.delSession;
      const ok = await confirmDialog({
        title: 'Delete this test?',
        message: `Every reading recorded on ${formatDateTime(date)} will be removed. This cannot be undone.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok) {
        await store.deleteReadingsAt(date);
        toast('Test deleted');
      }
    }
  });
}

/* --- Log test form -------------------------------------------------------- */

export function openLogTest() {
  const params = P.visibleParams(store.params());

  if (!params.length) {
    toast('Enable at least one parameter in Settings first.');
    return;
  }

  const rows = params.map((p) => {
    const unitId = store.displayUnit(p);
    const unit = P.unitOf(p, unitId);
    const target = P.formatTarget(p, unitId);
    const unitControl = p.units.length > 1
      ? `<select name="u_${esc(p.id)}" aria-label="${esc(p.name)} unit">
           ${p.units.map((u) => `<option value="${esc(u.id)}" ${u.id === unitId ? 'selected' : ''}>${esc(u.label || u.id)}</option>`).join('')}
         </select>`
      : `<input type="hidden" name="u_${esc(p.id)}" value="${esc(unit.id)}">`;

    return `
      <div class="logrow">
        <div>
          <div class="logrow__name" style="border-left:3px solid ${esc(p.color)};padding-left:8px">${esc(p.name)}</div>
          ${target ? `<div class="logrow__target" style="padding-left:11px">target ${esc(target)}</div>` : ''}
        </div>
        <div class="inputgroup">
          <input type="number" inputmode="decimal" step="${esc(unit.step)}" name="p_${esc(p.id)}"
                 placeholder="${p.units.length > 1 ? '' : esc(unit.label || '')}" aria-label="${esc(p.name)}">
          ${unitControl}
        </div>
      </div>`;
  }).join('');

  const modal = openModal({
    title: 'Log a test',
    body: `
      <form id="logForm" novalidate>
        <label class="field">
          <span>Date &amp; time</span>
          <input type="datetime-local" name="date" value="${esc(localDateTimeValue())}" required>
        </label>
        <p class="section-title" style="margin-top:4px">Readings <span style="font-weight:500;text-transform:none;letter-spacing:0">— fill in only what you tested</span></p>
        ${rows}
        <label class="field" style="margin-top:14px">
          <span>Note (optional)</span>
          <input type="text" name="note" placeholder="e.g. after 20g water change">
        </label>
      </form>`,
    footer: `
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn--primary" id="logSave">Save test</button>`,
  });

  const form = modal.body.querySelector('#logForm');

  modal.footer.querySelector('#logSave').addEventListener('click', async () => {
    const values = formValues(form);

    if (!values.date) { toast('Pick a date and time.'); return; }
    const when = new Date(values.date);
    if (Number.isNaN(when.getTime())) { toast('That date is not valid.'); return; }

    const entries = [];
    const unitChanges = {};

    for (const p of params) {
      const raw = values[`p_${p.id}`];
      const value = parseNumber(raw);
      if (value === null) {
        if (raw && String(raw).trim()) { toast(`"${raw}" is not a number (${p.name}).`); return; }
        continue;
      }
      const unitId = values[`u_${p.id}`] || p.defaultUnit;
      entries.push({ paramId: p.id, value: P.toBase(unitId, value), unit: unitId });
      if (unitId !== store.displayUnit(p)) unitChanges[p.id] = unitId;
    }

    if (!entries.length) { toast('Enter at least one reading.'); return; }

    // Whichever unit you typed in becomes your preferred unit for that parameter.
    if (Object.keys(unitChanges).length) {
      await store.saveSettings({ displayUnits: { ...store.settings().displayUnits, ...unitChanges } });
    }

    await store.saveReadings({ date: when.toISOString(), note: values.note.trim() }, entries);
    closeModal();
    toast(`Saved ${entries.length} reading${entries.length === 1 ? '' : 's'}`);
  });

  form.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      modal.footer.querySelector('#logSave').click();
    }
  });
}

/* --- Edit / delete a single reading --------------------------------------- */

function openEditReading(readingId) {
  const reading = store.readings().find((r) => r.id === readingId);
  if (!reading) return;

  const param = store.paramById(reading.paramId);
  if (!param) return;

  const unitId = store.displayUnit(param);
  const unit = P.unitOf(param, unitId);

  const modal = openModal({
    title: `Edit ${param.name}`,
    body: `
      <form id="editForm" novalidate>
        <p class="muted" style="font-size:13px;margin-bottom:12px">Recorded ${esc(formatDateTime(reading.date))}</p>
        <label class="field">
          <span>Value${unit.label ? ` (${esc(unit.label)})` : ''}</span>
          <input type="number" inputmode="decimal" step="${esc(unit.step)}" name="value"
                 value="${esc(P.formatValue(param, unitId, reading.value))}" required>
        </label>
        <label class="field">
          <span>Note</span>
          <input type="text" name="note" value="${esc(reading.note || '')}">
        </label>
      </form>`,
    footer: `
      <button class="btn btn--danger" id="editDelete">Delete</button>
      <span class="spacer"></span>
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn--primary" id="editSave">Save</button>`,
  });

  modal.footer.querySelector('#editSave').addEventListener('click', async () => {
    const values = formValues(modal.body.querySelector('#editForm'));
    const value = parseNumber(values.value);
    if (value === null) { toast('Enter a number.'); return; }

    await store.saveReading({ ...reading, value: P.toBase(unitId, value), unit: unitId, note: values.note.trim() });
    closeModal();
    toast('Reading updated');
  });

  modal.footer.querySelector('#editDelete').addEventListener('click', async () => {
    closeModal();
    const ok = await confirmDialog({
      title: 'Delete reading?',
      message: `This removes the ${param.name} reading from ${formatDateTime(reading.date)}.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) {
      await store.deleteReading(reading.id);
      toast('Reading deleted');
    }
  });
}
