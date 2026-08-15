/* Dashboard: the at-a-glance answer to "how is the tank doing right now?" */

import * as store from '../store.js';
import * as P from '../params.js';
import * as charts from '../charts.js';
import { focusParam } from './parameters.js';
import {
  esc, formatRelative, formatDate, formatDuration, daysBetween, monthKey,
  money, moneyShort, plural, emptyState,
} from '../ui.js';

/* A parameter untested for this long gets nudged on the dashboard. */
const STALE_DAYS = 21;

export function render(root) {
  charts.disposeAll();

  const tank = store.activeTank();
  const settings = store.settings();
  const currency = settings.currency;
  const params = P.visibleParams(store.params());

  const tiles = params.map((p) => {
    const latest = store.latestReading(p.id);
    const history = store.readingsFor(p.id);
    return {
      param: p,
      latest,
      status: latest ? P.statusOf(p, latest.value) : 'none',
      ageDays: latest ? daysBetween(latest.date) : null,
      recent: history.slice(-12).map((r) => P.fromBase(store.displayUnit(p), r.value)),
    };
  });

  const attention = tiles.filter((t) => t.latest && (t.status === 'bad' || t.status === 'warn'));
  const stale = tiles.filter((t) => t.latest && t.ageDays !== null && t.ageDays > STALE_DAYS);
  const never = tiles.filter((t) => !t.latest);

  const livestock = store.livestock();
  const alive = livestock.filter((l) => (l.status || 'alive') === 'alive');
  const expenses = store.expenses();
  const thisMonthTotal = expenses
    .filter((e) => monthKey(e.date) === monthKey(new Date()))
    .reduce((n, e) => n + (Number(e.amount) || 0), 0);
  const allTimeTotal = expenses.reduce((n, e) => n + (Number(e.amount) || 0), 0);

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h2>${esc(tank ? tank.name : 'Dashboard')}</h2>
        <p>${esc(tankSubtitle(tank))}</p>
      </div>
      <div class="spacer"></div>
      <button class="btn btn--primary" data-action="log-test">Log Test</button>
    </div>

    <div class="stack">
      ${attentionCard(attention, stale)}

      <section>
        <div class="row" style="margin-bottom:8px">
          <p class="section-title" style="margin:0">Latest readings</p>
          <div class="spacer"></div>
          <a href="#/parameters" style="font-size:13px;font-weight:600;color:var(--accent)">See charts →</a>
        </div>
        ${params.length
          ? `<div class="grid grid--params">${tiles.map(tile).join('')}</div>`
          : `<section class="card">${emptyState({
              title: 'No parameters enabled',
              message: 'Turn parameters on in Settings to start logging tests.',
            })}</section>`}
        ${never.length && never.length < params.length
          ? `<p class="muted" style="margin-top:10px;font-size:12.5px">${plural(never.length, 'parameter')} never tested: ${esc(never.map((t) => t.param.name).join(', '))}</p>`
          : ''}
      </section>

      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
        <section class="card">
          <div class="card__head">
            <h2>Livestock</h2>
            <div class="spacer"></div>
            <a href="#/livestock" style="font-size:13px;font-weight:600;color:var(--accent)">Manage →</a>
          </div>
          <div class="card__body">${livestockBody(alive, livestock)}</div>
        </section>

        <section class="card">
          <div class="card__head">
            <h2>Spending</h2>
            <div class="spacer"></div>
            <a href="#/expenses" style="font-size:13px;font-weight:600;color:var(--accent)">Details →</a>
          </div>
          <div class="card__body">${spendBody(expenses, thisMonthTotal, allTimeTotal, currency)}</div>
        </section>
      </div>

      <section class="card">
        <div class="card__head"><h2>Recent activity</h2></div>
        <div class="card__body card__body--flush">${activityBody(currency)}</div>
      </section>
    </div>`;

  root.replaceChildren(el);

  el.addEventListener('click', (event) => {
    const tileBtn = event.target.closest('[data-focus]');
    if (tileBtn) focusParam(tileBtn.dataset.focus);
  });
}

function tankSubtitle(tank) {
  if (!tank) return '';
  const bits = [];
  if (tank.volume) bits.push(`${tank.volume} ${tank.volumeUnit || 'gal'}`);
  if (tank.kind) bits.push(tank.kind);
  else if (tank.waterType) bits.push(tank.waterType);
  if (tank.setupDate) bits.push(`running ${formatDuration(tank.setupDate)}`);
  return bits.join(' · ');
}

function tile(t) {
  const { param, latest, status, ageDays, recent } = t;
  const unitId = store.displayUnit(param);
  const unit = P.unitOf(param, unitId);

  if (!latest) {
    return `
      <button type="button" class="ptile is-none" data-focus="${esc(param.id)}">
        <div class="ptile__name">${esc(param.name)}</div>
        <div class="ptile__empty">—</div>
        <div class="ptile__meta"><span>never tested</span></div>
      </button>`;
  }

  const spark = recent.length > 1 ? charts.sparkline(recent, param.color) : '';
  const age = ageDays === 0 ? 'today' : formatRelative(latest.date);

  return `
    <button type="button" class="ptile is-${status}" data-focus="${esc(param.id)}">
      <div class="ptile__name">${esc(param.name)}</div>
      <div class="ptile__value">${esc(P.formatValue(param, unitId, latest.value))}${unit.label ? `<small>${esc(unit.label)}</small>` : ''}</div>
      <div class="ptile__meta">
        <span>${esc(age)}</span>
        <span class="dot dot--${status}" title="${esc(statusWord(status, param, unitId))}"></span>
      </div>
      ${spark ? `<div class="ptile__spark">${spark}</div>` : ''}
    </button>`;
}

function statusWord(status, param, unitId) {
  const target = P.formatTarget(param, unitId);
  if (status === 'ok') return `In target range${target ? ` (${target})` : ''}`;
  if (status === 'warn') return `Slightly outside target${target ? ` (${target})` : ''}`;
  return `Well outside target${target ? ` (${target})` : ''}`;
}

function attentionCard(attention, stale) {
  if (!attention.length && !stale.length) return '';

  const items = [];

  for (const t of attention) {
    const unitId = store.displayUnit(t.param);
    const value = P.formatWithUnit(t.param, unitId, t.latest.value);
    const target = P.formatTarget(t.param, unitId);
    const high = t.latest.value > (t.param.targetHigh ?? Infinity);
    items.push(`
      <li style="display:flex;gap:9px;align-items:baseline;padding:6px 0">
        <span class="dot dot--${t.status}" style="margin-top:6px"></span>
        <span style="flex:1">
          <b>${esc(t.param.name)}</b> is ${esc(value)} — ${high ? 'above' : 'below'} the ${esc(target)} target.
        </span>
      </li>`);
  }

  for (const t of stale) {
    items.push(`
      <li style="display:flex;gap:9px;align-items:baseline;padding:6px 0">
        <span class="dot" style="margin-top:6px"></span>
        <span style="flex:1"><b>${esc(t.param.name)}</b> hasn't been tested in ${t.ageDays} days.</span>
      </li>`);
  }

  const tone = attention.some((t) => t.status === 'bad') ? 'bad' : attention.length ? 'warn' : 'accent';

  return `
    <section class="card" style="border-left:3px solid var(--${tone === 'accent' ? 'accent' : tone})">
      <div class="card__head">
        <h2>Worth a look</h2>
        <div class="spacer"></div>
        <span class="badge badge--${tone}">${items.length}</span>
      </div>
      <div class="card__body" style="padding-top:6px;padding-bottom:10px">
        <ul style="font-size:13.5px">${items.join('')}</ul>
      </div>
    </section>`;
}

function livestockBody(alive, all) {
  if (!all.length) {
    return '<p class="muted" style="font-size:13.5px">No fish, corals or invertebrates logged yet.</p>';
  }

  const counts = store.LIVESTOCK_CATEGORIES.map((c) => ({
    ...c,
    n: alive.filter((l) => l.category === c.id).reduce((sum, l) => sum + (Number(l.quantity) || 1), 0),
  }));

  const newest = [...all]
    .filter((l) => (l.status || 'alive') === 'alive')
    .sort((a, b) => String(b.acquiredDate || '').localeCompare(String(a.acquiredDate || '')))[0];

  const oldest = [...all]
    .filter((l) => (l.status || 'alive') === 'alive' && l.acquiredDate)
    .sort((a, b) => String(a.acquiredDate).localeCompare(String(b.acquiredDate)))[0];

  return `
    <div class="row" style="gap:18px;margin-bottom:12px">
      ${counts.map((c) => `
        <div>
          <div style="font-size:22px;font-weight:680;font-variant-numeric:tabular-nums">${c.n}</div>
          <div class="muted" style="font-size:12px">${esc(c.plural)}</div>
        </div>`).join('')}
    </div>
    <div style="font-size:13px;display:grid;gap:4px">
      ${newest ? `<div class="muted">Newest: <b style="color:var(--text)">${esc(newest.name)}</b>, added ${esc(formatRelative(newest.acquiredDate))}</div>` : ''}
      ${oldest && oldest !== newest ? `<div class="muted">Longest kept: <b style="color:var(--text)">${esc(oldest.name)}</b>, ${esc(formatDuration(oldest.acquiredDate))}</div>` : ''}
    </div>`;
}

function spendBody(expenses, thisMonth, allTime, currency) {
  if (!expenses.length) {
    return '<p class="muted" style="font-size:13.5px">No expenses logged yet.</p>';
  }

  const byCategory = new Map();
  for (const e of expenses) {
    const key = e.category || 'Other';
    byCategory.set(key, (byCategory.get(key) || 0) + (Number(e.amount) || 0));
  }
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  return `
    <div class="row" style="gap:22px;margin-bottom:12px">
      <div>
        <div style="font-size:22px;font-weight:680">${esc(moneyShort(thisMonth, currency))}</div>
        <div class="muted" style="font-size:12px">this month</div>
      </div>
      <div>
        <div style="font-size:22px;font-weight:680">${esc(moneyShort(allTime, currency))}</div>
        <div class="muted" style="font-size:12px">all time</div>
      </div>
    </div>
    <div class="barlist">
      ${top.map(([label, value]) => `
        <div class="barlist__row">
          <div class="barlist__top"><span>${esc(label)}</span><b>${esc(money(value, currency))}</b></div>
          <div class="barlist__track"><div class="barlist__fill" style="width:${Math.max(2, (value / top[0][1]) * 100)}%"></div></div>
        </div>`).join('')}
    </div>`;
}

function activityBody(currency) {
  const events = [];

  // One entry per test session rather than per reading.
  const sessions = new Map();
  for (const r of store.readings()) {
    if (!sessions.has(r.date)) sessions.set(r.date, 0);
    sessions.set(r.date, sessions.get(r.date) + 1);
  }
  for (const [date, count] of sessions) {
    events.push({ date, icon: '\u{1F9EA}', text: `Logged ${plural(count, 'reading')}` });
  }

  for (const l of store.livestock()) {
    if (l.acquiredDate) {
      events.push({
        date: l.acquiredDate,
        icon: (store.LIVESTOCK_CATEGORIES.find((c) => c.id === l.category) || {}).icon || '\u{1F41A}',
        text: `Added ${l.name}${Number(l.quantity) > 1 ? ` ×${l.quantity}` : ''}`,
      });
    }
    if ((l.status || 'alive') !== 'alive' && l.removedDate) {
      events.push({ date: l.removedDate, icon: '\u{1F4CD}', text: `${l.name} marked ${l.status}` });
    }
  }

  for (const e of store.expenses()) {
    events.push({
      date: e.date,
      icon: '\u{1F4B5}',
      text: `${e.description || 'Expense'} — ${money(e.amount, currency)}${e.store ? ` at ${e.store}` : ''}`,
    });
  }

  if (!events.length) {
    return '<p class="muted" style="padding:16px;font-size:13.5px">Log a test, add livestock or record an expense and it will show up here.</p>';
  }

  const recent = events
    .filter((e) => e.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 8);

  return `<ul>${recent.map((e) => `
    <li style="display:flex;gap:11px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--line)">
      <span aria-hidden="true" style="font-size:16px">${e.icon}</span>
      <span style="flex:1;font-size:13.5px">${esc(e.text)}</span>
      <span class="muted nowrap" style="font-size:12px">${esc(formatDate(e.date))}</span>
    </li>`).join('')}</ul>`;
}
