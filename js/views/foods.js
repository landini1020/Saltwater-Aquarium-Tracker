/* Foods view: what is in the food cupboard, and when each of it gets fed.

   A feeding is not a second kind of scheduled job — it is an ordinary task with
   `relatedFoodId` set, so it appears in Maintenance, uses the same due-date
   maths and lands in the same activity history. This screen is the food's side
   of that relationship: the tub, its directions, and the schedules attached. */

import * as store from '../store.js';
import * as charts from '../charts.js';
import * as maintenance from './maintenance.js';
import * as expenses from './expenses.js';
import { foodIcon, FOOD_TYPES } from '../food-icons.js';
import { brandFor } from '../equipment-brands.js';
import {
  esc, openModal, closeModal, toast, confirmDialog, formValues, parseNumber,
  formatDate, formatRelative, todayISO, emptyState, plural, money, processPhoto,
} from '../ui.js';

/* --- Render --------------------------------------------------------------- */

export function render(root) {
  charts.disposeAll();

  const foods = store.foods().slice().sort((a, b) => a.name.localeCompare(b.name));
  const feedings = store.tasks().filter((t) => t.relatedFoodId);
  const spent = foods.reduce((n, f) => n + (Number(f.cost) || 0), 0);
  const currency = store.settings().currency || 'USD';

  const due = feedings
    .map((task) => ({ task, info: maintenance.dueInfo(task) }))
    .filter((r) => r.info.state === 'overdue' || r.info.state === 'today')
    .sort((a, b) => (b.info.days || 0) - (a.info.days || 0));

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Foods</h2>
        <p>${foods.length
          ? `${plural(foods.length, 'food')} · ${plural(feedings.length, 'feeding schedule')}${spent ? ` · ${esc(money(spent, currency))} spent` : ''}`
          : 'No foods yet'}</p>
      </div>
      <div class="spacer"></div>
      <button class="btn btn--primary" data-act="add">Add food</button>
    </div>

    <div class="stack">
      ${due.length ? `
        <section class="card" style="border-left:3px solid var(--bad)">
          <div class="card__head">
            <h2>Feedings due</h2>
            <div class="spacer"></div>
            <span class="badge badge--bad">${due.length}</span>
          </div>
          <div class="card__body" style="padding-top:8px">
            <ul style="font-size:13.5px;display:grid;gap:8px">
              ${due.map(({ task, info }) => `
                <li style="display:flex;gap:10px;align-items:center">
                  <span class="dot dot--bad"></span>
                  <span style="flex:1;min-width:0">
                    <b>${esc(task.name)}</b>
                    <span class="muted">— ${info.state === 'today' ? 'due today' : `overdue by ${esc(plural(info.days, 'day'))}`}</span>
                  </span>
                  <button class="btn btn--sm btn--primary" data-done="${esc(task.id)}">Log</button>
                </li>`).join('')}
            </ul>
          </div>
        </section>` : ''}

      <div id="foodList"></div>
    </div>`;

  const list = el.querySelector('#foodList');
  if (!foods.length) {
    list.innerHTML = `<section class="card">${emptyState({
      title: 'No foods yet',
      message: 'Add what you feed — pellets, frozen, nori, coral food — with the directions off the box, then attach a feeding schedule so Reef Log tells you when one is due.',
      action: '<button class="btn btn--primary" data-act="add">Add your first</button>',
    })}</section>`;
  } else {
    list.innerHTML = `<div class="grid grid--cards">${foods.map((f) => card(f, currency)).join('')}</div>`;
  }

  root.replaceChildren(el);
  wire(el, root);
}

/* Your own photo, else the drawn type symbol. There are no stock food photos:
   see the note at the top of js/food-icons.js. */
function thumbFor(food) {
  if (food.thumb) {
    return `<button type="button" class="avatar avatar--photo" data-photo="${esc(food.id)}" aria-label="View photo of ${esc(food.name)}">
              <img src="${esc(food.thumb)}" alt="" loading="lazy">
            </button>`;
  }

  const brand = brandOf(food);
  return `<span class="avatar gearicon ${brand ? 'is-branded' : ''}" aria-hidden="true"
                ${brand ? `style="--brand-l:${brand.light};--brand-d:${brand.dark}"` : ''}>${foodIcon(food)}</span>`;
}

/* brandFor reads `name` and `model`; a food keeps its maker in `brand`. */
function brandOf(food) {
  return brandFor({ name: food.name, model: food.brand });
}

function card(food, currency) {
  const brand = brandOf(food);
  const qty = Number(food.quantity) || 1;
  const cost = Number(food.cost);
  const feedings = store.feedingsForFood(food.id);
  const empty = qty === 0;

  return `
    <article class="lscard ${empty ? 'is-gone' : ''}">
      <div class="lscard__top">
        ${thumbFor(food)}
        <div style="flex:1;min-width:0">
          ${brand ? `<div class="brandmark" style="--brand-l:${brand.light};--brand-d:${brand.dark}">${esc(brand.label)}</div>` : ''}
          <div class="lscard__name">${esc(food.name)}${qty > 1 ? ` <span class="muted">×${qty}</span>` : ''}</div>
          ${food.foodType ? `<div class="lscard__sci" style="font-style:normal">${esc(food.foodType)}</div>` : ''}
        </div>
        ${empty ? '<span class="badge">Out of stock</span>' : ''}
      </div>

      <div class="lscard__facts">
        ${food.size ? `<div>Size <b>${esc(food.size)}</b></div>` : ''}
        ${food.purchasedOn ? `<div>Purchased <b>${esc(formatDate(food.purchasedOn))}</b></div>` : ''}
        ${food.purchasedFrom ? `<div>From <b>${esc(food.purchasedFrom)}</b></div>` : ''}
        ${Number.isFinite(cost) && cost > 0 ? `<div>Cost <b>${esc(money(cost, currency))}</b></div>` : ''}
      </div>

      ${food.directions ? `
        <details style="margin-top:10px">
          <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--accent)">Directions</summary>
          <p style="white-space:pre-wrap;font-size:13px;color:var(--text-soft);margin-top:8px">${esc(food.directions)}</p>
        </details>` : ''}

      ${food.notes ? `<p class="lscard__note">${esc(food.notes)}</p>` : ''}

      ${feedingBlock(food, feedings)}

      <div class="lscard__acts">
        <button class="btn btn--sm" data-edit="${esc(food.id)}">Edit</button>
        <button class="btn btn--sm" data-addphoto="${esc(food.id)}">${food.thumb ? 'Replace photo' : 'Add photo'}</button>
        <button class="btn btn--sm" data-expense="${esc(food.id)}">Add expense</button>
        <div class="spacer"></div>
        <button class="iconbtn" data-del="${esc(food.id)}" aria-label="Delete ${esc(food.name)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
        </button>
      </div>
    </article>`;
}

function feedingBlock(food, feedings) {
  const rows = feedings.map((task) => {
    const info = maintenance.dueInfo(task);
    return `
      <li class="feedrow is-${info.state}">
        <div class="feedrow__main">
          <div class="feedrow__name">${esc(task.name)}</div>
          <div class="feedrow__meta">
            ${task.scheduleText ? `${esc(task.scheduleText)}` : 'On demand'}${task.amount ? ` · ${esc(task.amount)}` : ''}
            · last ${esc(task.lastActivity ? formatRelative(task.lastActivity) : 'never')}
          </div>
        </div>
        ${maintenance.dueBadge(info)}
        <button class="btn btn--sm" data-done="${esc(task.id)}">Log</button>
        <button class="iconbtn" data-edit-feeding="${esc(task.id)}" aria-label="Edit ${esc(task.name)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>
        </button>
      </li>`;
  }).join('');

  return `
    <div class="feedings">
      <div class="feedings__head">
        <span>Feeding schedule</span>
        <div class="spacer"></div>
        <button class="btn btn--sm" data-addfeeding="${esc(food.id)}">Add feeding</button>
      </div>
      ${feedings.length
        ? `<ul class="feedlist">${rows}</ul>`
        : '<p class="feedings__none">Not on a schedule. Add one and it will show up here and in Maintenance when it is due.</p>'}
    </div>`;
}

/* --- Photos --------------------------------------------------------------- */

/* A file input rather than getUserMedia, for the same reason as livestock and
   gear: on iOS it offers Take Photo and Photo Library in one sheet, and hands
   back a still the OS has already oriented and converted out of HEIC. */
function pickPhoto(foodId) {
  if (!store.foodById(foodId)) return;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.hidden = true;
  document.body.append(input);

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;

    toast('Processing photo…');
    try {
      const sizeKey = store.settings().photoSize || 'high';
      const processed = await processPhoto(file, sizeKey);
      await store.savePhoto(foodId, processed);
      toast(`Photo added · ${processed.width}×${processed.height}, ${Math.round(processed.bytes / 1024)} KB`);
    } catch (err) {
      toast(err.message || 'That photo could not be added.');
    }
  }, { once: true });

  input.click();
}

/** Full-size viewer. The Blob URL is released when the dialog closes. */
async function openPhoto(foodId) {
  const food = store.foodById(foodId);
  if (!food || !food.thumb) return;

  const blob = await store.loadPhoto(foodId);
  const url = blob ? URL.createObjectURL(blob) : food.thumb;

  const modal = openModal({
    title: food.name || 'Photo',
    body: `<img class="photoview" src="${esc(url)}" alt="${esc(food.name || '')}">
           ${blob ? '' : '<p class="field__hint">Only a thumbnail is stored on this device.</p>'}`,
    footer: `
      <button class="btn btn--danger" data-act="remove-photo">Remove</button>
      <span class="spacer"></span>
      <button class="btn" data-act="replace-photo">Replace</button>
      <button class="btn btn--primary" data-close>Done</button>`,
    onClose: () => { if (blob) URL.revokeObjectURL(url); },
  });

  modal.footer.addEventListener('click', async (event) => {
    const act = event.target.closest('[data-act]');
    if (!act) return;

    if (act.dataset.act === 'replace-photo') {
      closeModal();
      pickPhoto(foodId);
      return;
    }

    if (act.dataset.act === 'remove-photo') {
      closeModal();
      const ok = await confirmDialog({
        title: 'Remove this photo?',
        message: 'The photo is deleted from Reef Log and the food goes back to its type symbol. The original stays in your photo library.',
        confirmLabel: 'Remove',
        danger: true,
      });
      if (ok) { await store.deletePhoto(foodId); toast('Photo removed'); }
    }
  });
}

/* --- Events --------------------------------------------------------------- */

function wire(el) {
  el.addEventListener('click', async (event) => {
    if (event.target.closest('[data-act="add"]')) { openFoodForm(null); return; }

    const edit = event.target.closest('[data-edit]');
    if (edit) { openFoodForm(store.foodById(edit.dataset.edit)); return; }

    const addPhoto = event.target.closest('[data-addphoto]');
    if (addPhoto) { pickPhoto(addPhoto.dataset.addphoto); return; }

    const viewPhoto = event.target.closest('[data-photo]');
    if (viewPhoto) { openPhoto(viewPhoto.dataset.photo); return; }

    const done = event.target.closest('[data-done]');
    if (done) {
      await store.logTaskActivity(done.dataset.done, { action: 'Performed' });
      toast('Feeding logged');
      return;
    }

    const addFeeding = event.target.closest('[data-addfeeding]');
    if (addFeeding) {
      const food = store.foodById(addFeeding.dataset.addfeeding);
      if (!food) return;
      // A new task, pre-pointed at this food. Maintenance owns the form so the
      // two screens cannot drift apart on what a schedule is.
      maintenance.openTaskForm({
        name: `Feed ${food.name}`,
        taskType: 'Feeding',
        relatedFoodId: food.id,
        instructions: food.directions || '',
      });
      return;
    }

    const editFeeding = event.target.closest('[data-edit-feeding]');
    if (editFeeding) {
      maintenance.openTaskForm(store.tasks().find((t) => t.id === editFeeding.dataset.editFeeding));
      return;
    }

    const expense = event.target.closest('[data-expense]');
    if (expense) {
      const food = store.foodById(expense.dataset.expense);
      if (!food) return;
      expenses.openForm({
        date: food.purchasedOn || todayISO(),
        description: food.name,
        category: 'Food',
        store: food.purchasedFrom || '',
        amount: Number.isFinite(Number(food.cost)) && Number(food.cost) > 0 ? Number(food.cost) : '',
        notes: '',
      });
      return;
    }

    const del = event.target.closest('[data-del]');
    if (del) {
      const food = store.foodById(del.dataset.del);
      if (!food) return;
      const n = store.feedingsForFood(food.id).length;
      const ok = await confirmDialog({
        title: `Delete ${food.name}?`,
        message: n
          ? `The food and its directions are removed. Its ${plural(n, 'feeding schedule')} stay in Maintenance but will no longer name a food. Any expense you logged stays in the expense log.`
          : 'The food and its directions are removed. Any expense you logged for it stays in the expense log.',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok) { await store.deleteFood(food.id); toast('Food deleted'); }
    }
  });
}

/* --- Form ----------------------------------------------------------------- */

function openFoodForm(existing) {
  const isNew = !existing;
  const food = existing || {
    name: '', brand: '', foodType: '', size: '', quantity: 1,
    purchasedOn: todayISO(), purchasedFrom: '', cost: '', directions: '', notes: '',
  };

  const stores = store.knownStores();

  const modal = openModal({
    title: isNew ? 'Add food' : `Edit ${food.name}`,
    body: `
      <form id="foodForm" novalidate>
        <label class="field">
          <span>Name</span>
          <input type="text" name="name" value="${esc(food.name)}" placeholder="e.g. Reef Roids" required>
        </label>

        <div class="field-row">
          <label class="field">
            <span>Brand</span>
            <input type="text" name="brand" value="${esc(food.brand)}" placeholder="e.g. PolypLab">
          </label>
          <label class="field">
            <span>Type</span>
            <input type="text" name="foodType" value="${esc(food.foodType)}" list="foodTypeList" placeholder="e.g. Pellet">
            <datalist id="foodTypeList">${FOOD_TYPES.map((t) => `<option value="${esc(t)}"></option>`).join('')}</datalist>
          </label>
        </div>

        <div class="field-row">
          <label class="field">
            <span>Size</span>
            <input type="text" name="size" value="${esc(food.size)}" placeholder="e.g. 100 half sheets">
          </label>
          <label class="field">
            <span>Quantity on hand</span>
            <input type="number" inputmode="numeric" min="0" step="1" name="quantity" value="${esc(food.quantity ?? 1)}">
          </label>
        </div>

        <div class="field-row">
          <label class="field">
            <span>Purchased on</span>
            <input type="date" name="purchasedOn" value="${esc(food.purchasedOn)}">
          </label>
          <label class="field">
            <span>Purchased from</span>
            <input type="text" name="purchasedFrom" value="${esc(food.purchasedFrom)}" list="foodStoreList" placeholder="e.g. Discover Aquatics">
            <datalist id="foodStoreList">${stores.map((s) => `<option value="${esc(s)}"></option>`).join('')}</datalist>
          </label>
        </div>

        <label class="field">
          <span>Cost</span>
          <input type="number" inputmode="decimal" min="0" step="0.01" name="cost" value="${esc(food.cost ?? '')}" placeholder="0.00">
          <span class="field__hint">Recorded on the food. Use <b>Add expense</b> on the card to also put it in the expense log.</span>
        </label>

        <label class="field">
          <span>Directions</span>
          <textarea name="directions" style="min-height:120px"
                    placeholder="Copy the usage directions off the box so you have them when you need them…">${esc(food.directions)}</textarea>
        </label>

        <label class="field">
          <span>Notes</span>
          <textarea name="notes">${esc(food.notes)}</textarea>
        </label>
      </form>`,
    footer: `
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn--primary" id="foodSave">${isNew ? 'Add' : 'Save'}</button>`,
  });

  modal.footer.querySelector('#foodSave').addEventListener('click', async () => {
    const values = formValues(modal.body.querySelector('#foodForm'));
    if (!values.name.trim()) { toast('Give it a name.'); return; }

    const cost = parseNumber(values.cost);
    if (cost !== null && cost < 0) { toast('Cost cannot be negative.'); return; }

    await store.saveFood({
      ...(existing || {}),
      name: values.name.trim(),
      brand: values.brand.trim(),
      foodType: values.foodType.trim(),
      size: values.size.trim(),
      quantity: Math.max(0, Math.round(parseNumber(values.quantity) || 0)),
      purchasedOn: values.purchasedOn || '',
      purchasedFrom: values.purchasedFrom.trim(),
      cost: cost === null ? '' : cost,
      directions: values.directions.trim(),
      notes: values.notes.trim(),
    });

    closeModal();
    toast(isNew ? 'Food added' : 'Saved');
  });
}
