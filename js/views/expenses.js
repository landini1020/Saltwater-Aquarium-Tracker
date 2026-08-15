/* Expenses view: what the tank has cost, broken down by category and by store. */

import * as store from '../store.js';
import * as charts from '../charts.js';
import {
  esc, openModal, closeModal, toast, confirmDialog, formValues, parseNumber,
  formatDate, todayISO, money, moneyShort, monthKey, monthLabel, parseDate,
  emptyState, plural,
} from '../ui.js';

const { EXPENSE_CATEGORIES } = store;

const RANGES = [
  { id: '12m', label: '12 mo' },
  { id: 'ytd', label: 'YTD' },
  { id: 'all', label: 'All time' },
];

let rangeId = 'all';
let categoryFilter = 'all';
let storeFilter = 'all';

function rangeStart(id) {
  const now = new Date();
  if (id === 'ytd') return new Date(now.getFullYear(), 0, 1);
  if (id === '12m') return new Date(now.getFullYear(), now.getMonth() - 11, 1);
  return null;
}

function inRange(expense, start) {
  if (!start) return true;
  const d = parseDate(expense.date);
  return d ? d >= start : false;
}

const amountOf = (e) => Number(e.amount) || 0;
const sum = (rows) => rows.reduce((n, e) => n + amountOf(e), 0);

/* --- Render --------------------------------------------------------------- */

export function render(root) {
  charts.disposeAll();

  const currency = store.settings().currency;
  const all = store.expenses();

  const now = new Date();
  const thisMonth = monthKey(now);
  const totalAll = sum(all);
  const totalMonth = sum(all.filter((e) => monthKey(e.date) === thisMonth));
  const totalYear = sum(all.filter((e) => {
    const d = parseDate(e.date);
    return d && d.getFullYear() === now.getFullYear();
  }));

  // Average per month across the months that actually have spending.
  const activeMonths = new Set(all.map((e) => monthKey(e.date)).filter(Boolean));
  const avgMonth = activeMonths.size ? totalAll / activeMonths.size : 0;

  const categories = [...new Set([...EXPENSE_CATEGORIES, ...all.map((e) => e.category).filter(Boolean)])];
  const stores = [...new Set(all.map((e) => (e.store || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Expenses</h2>
        <p>${all.length ? `${plural(all.length, 'entry', 'entries')} logged` : 'Nothing logged yet'}</p>
      </div>
      <div class="spacer"></div>
      <button class="btn btn--primary" data-act="add">Add expense</button>
    </div>

    <div class="stack">
      <div class="grid grid--stats">
        <div class="stat">
          <div class="stat__label">This month</div>
          <div class="stat__value">${esc(moneyShort(totalMonth, currency))}</div>
          <div class="stat__sub">${esc(monthLabel(thisMonth))}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Year to date</div>
          <div class="stat__value">${esc(moneyShort(totalYear, currency))}</div>
          <div class="stat__sub">${now.getFullYear()}</div>
        </div>
        <div class="stat">
          <div class="stat__label">All time</div>
          <div class="stat__value">${esc(moneyShort(totalAll, currency))}</div>
          <div class="stat__sub">since you started logging</div>
        </div>
        <div class="stat">
          <div class="stat__label">Average / month</div>
          <div class="stat__value">${esc(moneyShort(avgMonth, currency))}</div>
          <div class="stat__sub">over ${plural(activeMonths.size, 'month')}</div>
        </div>
      </div>

      <section class="card">
        <div class="card__head">
          <h2>Monthly spend</h2>
          <div class="spacer"></div>
          <div class="seg" role="group" aria-label="Date range">
            ${RANGES.map((r) => `<button type="button" data-range="${r.id}" class="${r.id === rangeId ? 'is-on' : ''}">${r.label}</button>`).join('')}
          </div>
        </div>
        <div class="chart" id="spendChart"></div>
      </section>

      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
        <section class="card">
          <div class="card__head"><h2>By category</h2></div>
          <div class="card__body" id="byCategory"></div>
        </section>
        <section class="card">
          <div class="card__head"><h2>By store</h2></div>
          <div class="card__body" id="byStore"></div>
        </section>
      </div>

      <section class="card">
        <div class="card__head">
          <h2>All expenses</h2>
          <div class="spacer"></div>
          <select id="catFilter" style="width:auto;min-width:130px">
            <option value="all">All categories</option>
            ${categories.map((c) => `<option value="${esc(c)}" ${c === categoryFilter ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
          <select id="storeFilter" style="width:auto;min-width:120px">
            <option value="all">All stores</option>
            ${stores.map((s) => `<option value="${esc(s)}" ${s === storeFilter ? 'selected' : ''}>${esc(s)}</option>`).join('')}
          </select>
        </div>
        <div class="card__body card__body--flush">
          <div class="tablewrap" id="expTable"></div>
        </div>
      </section>
    </div>`;

  const start = rangeStart(rangeId);
  const scoped = all.filter((e) => inRange(e, start));

  renderSpendChart(el.querySelector('#spendChart'), scoped, currency);
  renderBreakdown(el.querySelector('#byCategory'), scoped, (e) => e.category || 'Uncategorised', currency);
  renderBreakdown(el.querySelector('#byStore'), scoped, (e) => (e.store || '').trim() || 'Unspecified', currency);
  renderTable(el.querySelector('#expTable'), all, currency);

  root.replaceChildren(el);
  wire(el, root);
}

function renderSpendChart(holder, rows, currency) {
  if (!rows.length) {
    holder.innerHTML = '<p class="muted" style="padding:26px 8px;text-align:center;font-size:13.5px">No spending in this range yet.</p>';
    return;
  }

  const totals = new Map();
  for (const e of rows) {
    const key = monthKey(e.date);
    if (!key) continue;
    totals.set(key, (totals.get(key) || 0) + amountOf(e));
  }

  // Walk every month from first to last so gaps show as empty, not as skipped.
  const keys = [...totals.keys()].sort();
  const bars = [];
  if (keys.length) {
    const [y0, m0] = keys[0].split('-').map(Number);
    const [y1, m1] = keys[keys.length - 1].split('-').map(Number);
    const cursor = new Date(y0, m0 - 1, 1);
    const end = new Date(y1, m1 - 1, 1);
    while (cursor <= end && bars.length < 60) {
      const key = monthKey(cursor);
      // Carry the year on January so a multi-year run stays readable.
      bars.push({ label: monthLabel(key, key.endsWith('-01')), value: totals.get(key) || 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  charts.barChart(holder, {
    bars,
    color: '#2f8fd0',
    height: 190,
    format: (v) => moneyShort(v, currency),
  });
}

function renderBreakdown(holder, rows, keyOf, currency) {
  if (!rows.length) {
    holder.innerHTML = '<p class="muted" style="font-size:13.5px">Nothing to break down yet.</p>';
    return;
  }

  const totals = new Map();
  for (const e of rows) {
    const key = keyOf(e);
    totals.set(key, (totals.get(key) || 0) + amountOf(e));
  }

  const ordered = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const max = ordered[0][1] || 1;
  const grand = ordered.reduce((n, [, v]) => n + v, 0);

  holder.innerHTML = `<div class="barlist">${ordered.slice(0, 10).map(([label, value]) => `
    <div class="barlist__row">
      <div class="barlist__top">
        <span>${esc(label)}</span>
        <b>${esc(money(value, currency))} <span class="muted" style="font-weight:500">${grand ? Math.round((value / grand) * 100) : 0}%</span></b>
      </div>
      <div class="barlist__track"><div class="barlist__fill" style="width:${Math.max(2, (value / max) * 100)}%"></div></div>
    </div>`).join('')}</div>
    ${ordered.length > 10 ? `<p class="muted" style="margin-top:10px;font-size:12.5px">+ ${ordered.length - 10} more</p>` : ''}`;
}

function renderTable(holder, all, currency) {
  const rows = all
    .filter((e) => categoryFilter === 'all' || e.category === categoryFilter)
    .filter((e) => storeFilter === 'all' || (e.store || '').trim() === storeFilter)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  if (!rows.length) {
    holder.innerHTML = `${emptyState({
      title: all.length ? 'Nothing matches those filters' : 'No expenses yet',
      message: all.length
        ? 'Try a different category or store.'
        : 'Log what you spend on livestock, equipment, salt, food and test kits to see where the money goes.',
      action: all.length ? '' : '<button class="btn btn--primary" data-act="add">Add your first</button>',
    })}`;
    return;
  }

  const total = sum(rows);

  holder.innerHTML = `<table>
    <thead>
      <tr><th>Date</th><th>Item</th><th>Category</th><th>Store</th><th class="num">Amount</th><th></th></tr>
    </thead>
    <tbody>
      ${rows.map((e) => `
        <tr>
          <td class="nowrap">${esc(formatDate(e.date))}</td>
          <td class="wrap">${esc(e.description || '—')}${e.notes ? `<br><span class="muted" style="font-size:12px">${esc(e.notes)}</span>` : ''}</td>
          <td><span class="badge">${esc(e.category || '—')}</span></td>
          <td>${esc(e.store || '—')}</td>
          <td class="num">${esc(money(e.amount, currency))}</td>
          <td class="num nowrap">
            <button class="iconbtn" data-edit="${esc(e.id)}" aria-label="Edit">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4"/></svg>
            </button>
            <button class="iconbtn" data-del="${esc(e.id)}" aria-label="Delete">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
            </button>
          </td>
        </tr>`).join('')}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4" style="font-weight:650">Total (${rows.length === all.length ? 'all' : 'filtered'})</td>
        <td class="num" style="font-weight:700">${esc(money(total, currency))}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>`;
}

/* --- Events --------------------------------------------------------------- */

function wire(el, root) {
  el.addEventListener('click', async (event) => {
    const range = event.target.closest('[data-range]');
    if (range) { rangeId = range.dataset.range; render(root); return; }

    if (event.target.closest('[data-act="add"]')) { openForm(null); return; }

    const edit = event.target.closest('[data-edit]');
    if (edit) {
      const item = store.expenses().find((e) => e.id === edit.dataset.edit);
      if (item) openForm(item);
      return;
    }

    const del = event.target.closest('[data-del]');
    if (del) {
      const item = store.expenses().find((e) => e.id === del.dataset.del);
      if (!item) return;
      const ok = await confirmDialog({
        title: 'Delete this expense?',
        message: `"${item.description || 'Untitled'}" for ${money(item.amount, store.settings().currency)} will be removed.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok) { await store.deleteExpense(item.id); toast('Expense deleted'); }
    }
  });

  el.querySelector('#catFilter').addEventListener('change', (event) => {
    categoryFilter = event.target.value;
    render(root);
  });

  el.querySelector('#storeFilter').addEventListener('change', (event) => {
    storeFilter = event.target.value;
    render(root);
  });
}

/* --- Add / edit form ------------------------------------------------------ */

export function openForm(existing) {
  const isNew = !existing;
  const item = existing || {
    date: todayISO(), description: '', category: 'Equipment', store: '', amount: '', notes: '',
  };

  const stores = store.knownStores();
  const categories = [...new Set([...EXPENSE_CATEGORIES, ...store.expenses().map((e) => e.category).filter(Boolean)])];

  const modal = openModal({
    title: isNew ? 'Add expense' : 'Edit expense',
    body: `
      <form id="expForm" novalidate>
        <div class="field-row">
          <label class="field">
            <span>Date</span>
            <input type="date" name="date" value="${esc(item.date || todayISO())}" required>
          </label>
          <label class="field">
            <span>Amount</span>
            <input type="number" inputmode="decimal" min="0" step="0.01" name="amount"
                   value="${esc(item.amount)}" placeholder="0.00" required>
          </label>
        </div>

        <label class="field">
          <span>Item</span>
          <input type="text" name="description" value="${esc(item.description)}"
                 placeholder="e.g. Two-part calcium refill" required>
        </label>

        <div class="field-row">
          <label class="field">
            <span>Category</span>
            <input type="text" name="category" value="${esc(item.category)}" list="catList" placeholder="Equipment">
            <datalist id="catList">${categories.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>
          </label>
          <label class="field">
            <span>Store</span>
            <input type="text" name="store" value="${esc(item.store)}" list="expStoreList" placeholder="e.g. Reef Emporium">
            <datalist id="expStoreList">${stores.map((s) => `<option value="${esc(s)}"></option>`).join('')}</datalist>
          </label>
        </div>

        <label class="field">
          <span>Notes</span>
          <textarea name="notes" placeholder="Model, size, anything worth remembering…">${esc(item.notes)}</textarea>
        </label>
      </form>`,
    footer: `
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn--primary" id="expSave">${isNew ? 'Add' : 'Save'}</button>`,
  });

  modal.footer.querySelector('#expSave').addEventListener('click', async () => {
    const values = formValues(modal.body.querySelector('#expForm'));

    const amount = parseNumber(values.amount);
    if (!values.date) { toast('Pick a date.'); return; }
    if (amount === null) { toast('Enter an amount.'); return; }
    if (amount < 0) { toast('Amount cannot be negative.'); return; }
    if (!values.description.trim()) { toast('Describe what you bought.'); return; }

    await store.saveExpense({
      ...(existing || {}),
      date: values.date,
      description: values.description.trim(),
      category: values.category.trim() || 'Other',
      store: values.store.trim(),
      amount,
      notes: values.notes.trim(),
    });

    closeModal();
    toast(isNew ? 'Expense added' : 'Saved');
  });
}
