/* Maintenance view: recurring tasks with computed due dates, plus the history
   of everything that has actually been done. */

import * as store from '../store.js';
import * as charts from '../charts.js';
import {
  esc, openModal, closeModal, toast, confirmDialog, formValues, parseNumber,
  formatDate, formatRelative, formatDuration, daysBetween, parseDate, todayISO,
  emptyState, plural,
} from '../ui.js';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'due', label: 'Due' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'ondemand', label: 'On demand' },
];

let filterId = 'all';
let historyLimit = 25;

const TASK_TYPES = ['Maintenance', 'Water Change', 'Dosing', 'Feeding', 'Testing', 'Miscellaneous', 'Not Scheduled'];

/* --- Due calculation ------------------------------------------------------ */

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Work out where a task stands.
 * @returns {{state:'overdue'|'today'|'upcoming'|'never'|'ondemand'|'inactive',
 *            due:Date|null, days:number|null}}
 *          `days` is how many days overdue (positive) or remaining (negative).
 */
export function dueInfo(task) {
  if ((task.status || 'active') !== 'active') return { state: 'inactive', due: null, days: null };

  const interval = Number(task.intervalDays);
  if (!Number.isFinite(interval) || interval <= 0) return { state: 'ondemand', due: null, days: null };

  const last = parseDate(task.lastActivity) || parseDate(task.startDate);
  if (!last) return { state: 'never', due: null, days: null };

  const due = addDays(last, interval);
  const days = daysBetween(due, new Date());   // >0 once the due date has passed

  if (days > 0) return { state: 'overdue', due, days };
  if (days === 0) return { state: 'today', due, days };
  return { state: 'upcoming', due, days };
}

/** Shared with the Foods screen so a feeding reads the same in both places. */
export function dueBadge(info) {
  switch (info.state) {
    case 'overdue': {
      const span = info.days < 45 ? plural(info.days, 'day') : formatDuration(info.due);
      return `<span class="badge badge--bad">Overdue by ${esc(span)}</span>`;
    }
    case 'today':
      return '<span class="badge badge--warn">Due today</span>';
    case 'upcoming': {
      const n = Math.abs(info.days);
      return `<span class="badge badge--ok">Due in ${esc(plural(n, 'day'))}</span>`;
    }
    case 'never':
      return '<span class="badge badge--warn">Never logged</span>';
    case 'inactive':
      return '<span class="badge">Inactive</span>';
    default:
      return '<span class="badge">On demand</span>';
  }
}

const ORDER = { overdue: 0, today: 1, never: 2, upcoming: 3, ondemand: 4, inactive: 5 };

/* --- Render --------------------------------------------------------------- */

export function render(root) {
  charts.disposeAll();

  const all = store.tasks().map((t) => ({ task: t, info: dueInfo(t) }));
  all.sort((a, b) => {
    const d = ORDER[a.info.state] - ORDER[b.info.state];
    if (d !== 0) return d;
    if (a.info.days !== null && b.info.days !== null) return b.info.days - a.info.days;
    return a.task.name.localeCompare(b.task.name);
  });

  const overdue = all.filter((r) => r.info.state === 'overdue' || r.info.state === 'today');
  const history = store.activities();

  const visible = all.filter((r) => {
    if (filterId === 'all') return true;
    if (filterId === 'due') return r.info.state === 'overdue' || r.info.state === 'today' || r.info.state === 'never';
    if (filterId === 'scheduled') return r.info.state === 'upcoming';
    return r.info.state === 'ondemand' || r.info.state === 'inactive';
  });

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Maintenance</h2>
        <p>${all.length ? `${plural(all.length, 'task')} · ${plural(history.length, 'activity', 'activities')} logged` : 'No tasks yet'}</p>
      </div>
      <div class="spacer"></div>
      <button class="btn btn--primary" data-act="add-task">Add task</button>
    </div>

    <div class="stack">
      ${overdue.length ? `
        <section class="card" style="border-left:3px solid var(--bad)">
          <div class="card__head">
            <h2>Needs doing</h2>
            <div class="spacer"></div>
            <span class="badge badge--bad">${overdue.length}</span>
          </div>
          <div class="card__body" style="padding-top:8px">
            <ul style="font-size:13.5px;display:grid;gap:6px">
              ${overdue.map((r) => `
                <li style="display:flex;gap:10px;align-items:baseline">
                  <span class="dot dot--bad" style="margin-top:6px"></span>
                  <span style="flex:1"><b>${esc(r.task.name)}</b> — last done ${esc(r.task.lastActivity ? formatRelative(r.task.lastActivity) : 'never')}</span>
                </li>`).join('')}
            </ul>
          </div>
        </section>` : ''}

      <div class="row">
        <div class="seg" role="group" aria-label="Filter tasks">
          ${FILTERS.map((f) => `<button type="button" data-filter="${f.id}" class="${f.id === filterId ? 'is-on' : ''}">${f.label}</button>`).join('')}
        </div>
      </div>

      <div id="taskList"></div>

      <section class="card">
        <div class="card__head">
          <h2>Activity history</h2>
          <div class="spacer"></div>
          <span class="muted" style="font-size:12.5px">${history.length ? `${history.length} logged` : ''}</span>
        </div>
        <div class="card__body card__body--flush" id="historyArea"></div>
      </section>
    </div>`;

  const list = el.querySelector('#taskList');
  if (!visible.length) {
    list.innerHTML = `<section class="card">${emptyState({
      title: all.length ? 'Nothing in this group' : 'No tasks yet',
      message: all.length
        ? 'Try a different filter.'
        : 'Add the jobs you repeat — water changes, filter media, dosing — and Reef Log will tell you when each is due.',
      action: all.length ? '' : '<button class="btn btn--primary" data-act="add-task">Add your first task</button>',
    })}</section>`;
  } else {
    list.innerHTML = `<div class="stack">${visible.map(taskCard).join('')}</div>`;
  }

  renderHistory(el.querySelector('#historyArea'), history);

  root.replaceChildren(el);
  wire(el, root);
}

function taskCard({ task, info }) {
  const food = task.relatedFoodId ? store.foodById(task.relatedFoodId) : null;
  const related = [task.relatedEquipment, task.relatedSupplement, food && food.name]
    .filter(Boolean).join(' · ');
  const last = task.lastActivity
    ? `${formatDate(task.lastActivity)} (${formatRelative(task.lastActivity)})`
    : 'never logged';

  return `
    <section class="card taskcard is-${info.state}">
      <div class="card__body">
        <div class="row" style="align-items:flex-start;gap:8px">
          <div style="flex:1;min-width:0">
            <h3 style="font-size:15.5px">${esc(task.name)}</h3>
            ${task.taskType ? `<div class="muted" style="font-size:12.5px;margin-top:2px">${esc(task.taskType)}${related ? ` · ${esc(related)}` : ''}</div>` : ''}
          </div>
          ${dueBadge(info)}
        </div>

        <div class="lscard__facts" style="margin-top:10px">
          ${task.scheduleText ? `<div>Schedule <b>${esc(task.scheduleText)}</b></div>` : ''}
          <div>Last done <b>${esc(last)}</b></div>
          ${info.due ? `<div>Next due <b>${esc(formatDate(info.due))}</b></div>` : ''}
          ${task.amount ? `<div>Amount <b>${esc(task.amount)}</b></div>` : ''}
        </div>

        ${task.instructions ? `
          <details style="margin-top:10px">
            <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--accent)">Instructions</summary>
            <p style="white-space:pre-wrap;font-size:13px;color:var(--text-soft);margin-top:8px">${esc(task.instructions)}</p>
          </details>` : ''}

        <div class="lscard__acts">
          <button class="btn btn--sm btn--primary" data-done="${esc(task.id)}">Log done</button>
          <button class="btn btn--sm" data-skip="${esc(task.id)}">Skip</button>
          <div class="spacer"></div>
          <button class="btn btn--sm" data-edit-task="${esc(task.id)}">Edit</button>
          <button class="iconbtn" data-del-task="${esc(task.id)}" aria-label="Delete ${esc(task.name)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
          </button>
        </div>
      </div>
    </section>`;
}

function renderHistory(area, history) {
  if (!history.length) {
    area.innerHTML = '<p class="muted" style="padding:16px;font-size:13.5px">Nothing logged yet. Use <b>Log done</b> on a task and it will appear here.</p>';
    return;
  }

  const shown = history.slice(0, historyLimit);

  area.innerHTML = `
    <div class="tablewrap">
      <table>
        <thead><tr><th>Date</th><th>Task</th><th>Action</th><th>Note</th><th></th></tr></thead>
        <tbody>
          ${shown.map((a) => `
            <tr>
              <td class="nowrap">${esc(formatDate(a.date))}</td>
              <td class="wrap">${esc(a.taskName || '—')}</td>
              <td><span class="badge ${a.action === 'Skipped' ? 'badge--warn' : 'badge--ok'}">${esc(a.action || 'Performed')}</span></td>
              <td class="wrap muted">${esc(a.notes || '')}</td>
              <td class="num"><button class="iconbtn" data-del-activity="${esc(a.id)}" aria-label="Delete entry">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
              </button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ${history.length > shown.length
      ? `<div style="padding:12px 16px"><button class="btn btn--sm" data-act="more-history">Show ${Math.min(50, history.length - shown.length)} more of ${history.length}</button></div>`
      : ''}`;
}

/* --- Events --------------------------------------------------------------- */

function wire(el, root) {
  el.addEventListener('click', async (event) => {
    const filter = event.target.closest('[data-filter]');
    if (filter) { filterId = filter.dataset.filter; render(root); return; }

    const act = event.target.closest('[data-act]');
    if (act) {
      if (act.dataset.act === 'add-task') openTaskForm(null);
      if (act.dataset.act === 'more-history') { historyLimit += 50; render(root); }
      return;
    }

    const done = event.target.closest('[data-done]');
    if (done) {
      await store.logTaskActivity(done.dataset.done, { action: 'Performed' });
      toast('Logged for today');
      return;
    }

    const skip = event.target.closest('[data-skip]');
    if (skip) {
      await store.logTaskActivity(skip.dataset.skip, { action: 'Skipped' });
      toast('Marked skipped');
      return;
    }

    const edit = event.target.closest('[data-edit-task]');
    if (edit) {
      openTaskForm(store.tasks().find((t) => t.id === edit.dataset.editTask));
      return;
    }

    const delTask = event.target.closest('[data-del-task]');
    if (delTask) {
      const task = store.tasks().find((t) => t.id === delTask.dataset.delTask);
      if (!task) return;
      const n = store.activitiesForTask(task.id).length;
      const ok = await confirmDialog({
        title: `Delete ${task.name}?`,
        message: n
          ? `The task is removed. Its ${n} logged ${n === 1 ? 'activity stays' : 'activities stay'} in the history as a record of the work.`
          : 'This task will be removed.',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok) { await store.deleteTask(task.id); toast('Task deleted'); }
      return;
    }

    const delActivity = event.target.closest('[data-del-activity]');
    if (delActivity) {
      await store.deleteActivity(delActivity.dataset.delActivity);
      toast('Entry deleted');
    }
  });
}

/* --- Task form ------------------------------------------------------------ */

/**
 * Add or edit a task.
 *
 * A record with no id is a prefilled *new* task rather than an edit, which is
 * how the Foods screen opens this form already pointing at a food.
 */
export function openTaskForm(existing) {
  const isNew = !(existing && existing.id);
  const task = {
    name: '', taskType: 'Maintenance', relatedEquipment: '', relatedSupplement: '',
    relatedFoodId: '', amount: '', instructions: '', scheduleText: '', intervalDays: null,
    startDate: todayISO(), lastActivity: '', status: 'active',
    ...(existing || {}),
  };

  const gear = store.equipment().map((e) => e.name).sort((a, b) => a.localeCompare(b));
  const supps = store.supplements().map((s) => s.name).sort((a, b) => a.localeCompare(b));
  const foods = store.foods().slice().sort((a, b) => a.name.localeCompare(b.name));

  const modal = openModal({
    title: isNew ? 'Add a task' : `Edit ${task.name}`,
    body: `
      <form id="taskForm" novalidate>
        <label class="field">
          <span>Task name</span>
          <input type="text" name="name" value="${esc(task.name)}" placeholder="e.g. Water Change" required>
        </label>

        <div class="field-row">
          <label class="field">
            <span>Type</span>
            <input type="text" name="taskType" value="${esc(task.taskType)}" list="taskTypeList" placeholder="Maintenance">
            <datalist id="taskTypeList">${TASK_TYPES.map((t) => `<option value="${esc(t)}"></option>`).join('')}</datalist>
          </label>
          <label class="field">
            <span>Repeat every (days)</span>
            <input type="number" inputmode="numeric" min="1" step="1" name="intervalDays"
                   value="${esc(task.intervalDays ?? '')}" placeholder="leave blank for on-demand">
          </label>
        </div>

        <div class="field-row">
          <label class="field">
            <span>Related equipment</span>
            <input type="text" name="relatedEquipment" value="${esc(task.relatedEquipment)}" list="gearList">
            <datalist id="gearList">${gear.map((g) => `<option value="${esc(g)}"></option>`).join('')}</datalist>
          </label>
          <label class="field">
            <span>Related supplement</span>
            <input type="text" name="relatedSupplement" value="${esc(task.relatedSupplement)}" list="suppList">
            <datalist id="suppList">${supps.map((s) => `<option value="${esc(s)}"></option>`).join('')}</datalist>
          </label>
        </div>

        <label class="field">
          <span>Food</span>
          <select name="relatedFoodId">
            <option value="">None — not a feeding</option>
            ${foods.map((f) => `<option value="${esc(f.id)}" ${f.id === task.relatedFoodId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
          </select>
          <span class="field__hint">Pick a food and this task also appears on that food's card in Foods.</span>
        </label>

        <div class="field-row">
          <label class="field">
            <span>Amount</span>
            <input type="text" name="amount" value="${esc(task.amount)}" placeholder="e.g. 12 Gallons">
          </label>
          <label class="field">
            <span>Last done</span>
            <input type="date" name="lastActivity" value="${esc(task.lastActivity)}">
          </label>
        </div>

        <label class="field">
          <span>Instructions</span>
          <textarea name="instructions" placeholder="Steps to follow…">${esc(task.instructions)}</textarea>
        </label>

        <label class="check">
          <input type="checkbox" name="active" ${(task.status || 'active') === 'active' ? 'checked' : ''}>
          <span>Active — include this task in due reminders</span>
        </label>
      </form>`,
    footer: `
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn--primary" id="taskSave">${isNew ? 'Add task' : 'Save'}</button>`,
  });

  modal.footer.querySelector('#taskSave').addEventListener('click', async () => {
    const values = formValues(modal.body.querySelector('#taskForm'));
    if (!values.name.trim()) { toast('Give the task a name.'); return; }

    const interval = parseNumber(values.intervalDays);
    if (interval !== null && interval < 1) { toast('Repeat interval must be at least one day.'); return; }

    const days = interval === null ? null : Math.round(interval);

    // Imported tasks carry Aquarimate's own wording ("Dynamic: Every 182 Day(s)",
    // or a fixed calendar rule). Keep it while the interval is untouched, and
    // only replace it once the schedule actually changes.
    const intervalUnchanged = existing && (existing.intervalDays ?? null) === days;
    const scheduleText = intervalUnchanged
      ? (existing.scheduleText || '')
      : (days ? `Every ${days} day${days === 1 ? '' : 's'}` : '');

    await store.saveTask({
      ...(existing || {}),
      name: values.name.trim(),
      taskType: values.taskType.trim(),
      relatedEquipment: values.relatedEquipment.trim(),
      relatedSupplement: values.relatedSupplement.trim(),
      relatedFoodId: values.relatedFoodId || null,
      amount: values.amount.trim(),
      instructions: values.instructions.trim(),
      intervalDays: days,
      scheduleText,
      lastActivity: values.lastActivity || '',
      startDate: (existing && existing.startDate) || todayISO(),
      status: values.active ? 'active' : 'inactive',
    });

    closeModal();
    toast(isNew ? 'Task added' : 'Saved');
  });
}
