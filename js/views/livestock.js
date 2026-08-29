/* Livestock view: fish, corals and invertebrates, with how long each has been
   in the tank. Purchases can spill over into the expense log so the money side
   stays complete without double entry. */

import * as store from '../store.js';
import * as charts from '../charts.js';
import { SPECIES_PHOTOS, SPECIES_PHOTO_DIR } from '../species-photos.js';
import { licenceUrl } from '../licences.js';
import {
  esc, openModal, closeModal, toast, confirmDialog, formValues, parseNumber,
  formatDate, formatDuration, todayISO, money, emptyState, plural, processPhoto,
} from '../ui.js';

const { LIVESTOCK_CATEGORIES, LIVESTOCK_STATUSES } = store;

let categoryFilter = 'all';
let statusFilter = 'alive';
let search = '';

const catById = (id) => LIVESTOCK_CATEGORIES.find((c) => c.id === id) || { label: 'Other', icon: '\u{1F41A}' };
const statusLabel = (id) => (LIVESTOCK_STATUSES.find((s) => s.id === id) || { label: 'In tank' }).label;

/* --- Render --------------------------------------------------------------- */

export function render(root) {
  charts.disposeAll();

  const all = store.livestock();
  const currency = store.settings().currency;

  const alive = all.filter((l) => (l.status || 'alive') === 'alive');
  const counts = {};
  for (const c of LIVESTOCK_CATEGORIES) {
    counts[c.id] = alive.filter((l) => l.category === c.id).reduce((n, l) => n + (Number(l.quantity) || 1), 0);
  }
  const invested = all.reduce((sum, l) => sum + (Number(l.price) || 0), 0);

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Livestock</h2>
        <p>${all.length ? `${plural(alive.length, 'entry', 'entries')} currently in the tank` : 'Nothing added yet'}</p>
      </div>
      <div class="spacer"></div>
      <button class="btn btn--primary" data-act="add">Add livestock</button>
    </div>

    <div class="stack">
      <div class="grid grid--stats">
        ${LIVESTOCK_CATEGORIES.map((c) => `
          <div class="stat">
            <div class="stat__label">${esc(c.plural)}</div>
            <div class="stat__value">${counts[c.id]}</div>
            <div class="stat__sub">in tank now</div>
          </div>`).join('')}
        <div class="stat">
          <div class="stat__label">Invested</div>
          <div class="stat__value">${esc(money(invested, currency))}</div>
          <div class="stat__sub">across ${plural(all.length, 'entry', 'entries')}</div>
        </div>
      </div>

      <section class="card">
        <div class="card__body">
          <div class="row">
            <div class="seg" role="group" aria-label="Category">
              <button type="button" data-cat="all" class="${categoryFilter === 'all' ? 'is-on' : ''}">All</button>
              ${LIVESTOCK_CATEGORIES.map((c) => `<button type="button" data-cat="${esc(c.id)}" class="${categoryFilter === c.id ? 'is-on' : ''}">${esc(c.plural)}</button>`).join('')}
            </div>
            <div class="seg" role="group" aria-label="Status">
              <button type="button" data-status="alive" class="${statusFilter === 'alive' ? 'is-on' : ''}">In tank</button>
              <button type="button" data-status="gone" class="${statusFilter === 'gone' ? 'is-on' : ''}">Removed</button>
              <button type="button" data-status="all" class="${statusFilter === 'all' ? 'is-on' : ''}">All</button>
            </div>
            <div class="spacer"></div>
            <input type="search" id="lsSearch" placeholder="Search name, store, notes…"
                   value="${esc(search)}" style="max-width:240px">
          </div>
        </div>
      </section>

      <div id="lsList"></div>
    </div>`;

  fillList(el.querySelector('#lsList'), all, currency);

  root.replaceChildren(el);
  wire(el, root);
}

/** Apply the category, status and search filters, newest acquisition first. */
function filtered(all) {
  const needle = search.trim().toLowerCase();
  return all
    .filter((l) => (categoryFilter === 'all' ? true : l.category === categoryFilter))
    .filter((l) => {
      const s = l.status || 'alive';
      if (statusFilter === 'all') return true;
      if (statusFilter === 'alive') return s === 'alive';
      return s !== 'alive';
    })
    .filter((l) => {
      if (!needle) return true;
      const hay = `${l.name || ''} ${l.type || ''} ${l.scientificName || ''} ${l.source || ''} ${l.notes || ''}`.toLowerCase();
      return hay.includes(needle);
    })
    .sort((a, b) => String(b.acquiredDate || '').localeCompare(String(a.acquiredDate || '')));
}

/** Types already in use, so the form can offer them for consistent naming. */
function knownTypes() {
  const seen = new Set();
  for (const l of store.livestock()) if (l.type) seen.add(l.type.trim());
  seen.delete('');
  return [...seen].sort((a, b) => a.localeCompare(b));
}

function fillList(list, all, currency) {
  const visible = filtered(all);
  if (!visible.length) {
    list.innerHTML = `<section class="card">${emptyState({
      title: all.length ? 'Nothing matches those filters' : 'No livestock yet',
      message: all.length
        ? 'Try a different category, status or search term.'
        : 'Add your fish, corals and invertebrates to track how long each one has been in the tank.',
      action: all.length ? '' : '<button class="btn btn--primary" data-act="add">Add your first</button>',
    })}</section>`;
    return;
  }
  list.innerHTML = `<div class="grid grid--cards">${visible.map((l) => card(l, currency)).join('')}</div>`;
}

/* Precedence: your own photo, then the stock species photo, then the category
   icon. Adding a photo therefore replaces the placeholder with no extra step. */

export function speciesPhotoFor(item) {
  const entry = SPECIES_PHOTOS[item.id];
  return entry ? { ...entry, src: SPECIES_PHOTO_DIR + entry.file } : null;
}

function thumbFor(item, cat) {
  if (item.thumb) {
    return `<button type="button" class="avatar avatar--photo" data-photo="${esc(item.id)}" aria-label="View photo of ${esc(item.name)}">
              <img src="${esc(item.thumb)}" alt="" loading="lazy">
            </button>`;
  }

  const species = speciesPhotoFor(item);
  if (species) {
    return `<button type="button" class="avatar avatar--photo is-stock" data-photo="${esc(item.id)}"
                    aria-label="Stock photo of ${esc(item.name)} — not your animal">
              <img src="${esc(species.src)}" alt="" loading="lazy">
            </button>`;
  }

  return `<span class="avatar" aria-hidden="true">${cat.icon}</span>`;
}

function card(item, currency) {
  const cat = catById(item.category);
  const status = item.status || 'alive';
  const qty = Number(item.quantity) || 1;
  const endDate = status === 'alive' ? new Date() : (item.removedDate || new Date());

  const durationLabel = status === 'alive' ? 'In tank' : 'Kept for';
  const duration = item.acquiredDate ? formatDuration(item.acquiredDate, endDate) : '—';

  const badge = status === 'alive'
    ? ''
    : `<span class="badge ${status === 'deceased' ? 'badge--bad' : ''}">${esc(statusLabel(status))}</span>`;

  return `
    <article class="lscard ${status === 'alive' ? '' : 'is-gone'}">
      <div class="lscard__top">
        ${thumbFor(item, cat)}
        <div style="flex:1;min-width:0">
          <div class="lscard__name">${esc(item.name || 'Unnamed')}${qty > 1 ? ` <span class="muted">×${qty}</span>` : ''}</div>
          ${item.scientificName ? `<div class="lscard__sci">${esc(item.scientificName)}</div>` : ''}
        </div>
        ${badge}
      </div>

      <div class="lscard__age">${esc(durationLabel)}: ${esc(duration)}</div>

      <div class="lscard__facts">
        ${item.type ? `<div>Type <b>${esc(item.type)}</b></div>` : ''}
        <div>Added <b>${esc(formatDate(item.acquiredDate))}</b></div>
        ${item.source ? `<div>From <b>${esc(item.source)}</b></div>` : ''}
        ${Number(item.price) ? `<div>Paid <b>${esc(money(item.price, currency))}</b></div>` : ''}
        ${status !== 'alive' && item.removedDate ? `<div>${esc(statusLabel(status))} <b>${esc(formatDate(item.removedDate))}</b></div>` : ''}
      </div>

      ${item.notes ? `<p class="lscard__note">${esc(item.notes)}</p>` : ''}

      <div class="lscard__acts">
        <button class="btn btn--sm" data-edit="${esc(item.id)}">Edit</button>
        <button class="btn btn--sm" data-addphoto="${esc(item.id)}">${item.thumb ? 'Replace photo' : 'Add photo'}</button>
        <div class="spacer"></div>
        <button class="iconbtn" data-del="${esc(item.id)}" aria-label="Delete ${esc(item.name || 'entry')}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
        </button>
      </div>
    </article>`;
}

/* --- Events --------------------------------------------------------------- */

function wire(el, root) {
  el.addEventListener('click', async (event) => {
    const cat = event.target.closest('[data-cat]');
    if (cat) { categoryFilter = cat.dataset.cat; render(root); return; }

    const status = event.target.closest('[data-status]');
    if (status) { statusFilter = status.dataset.status; render(root); return; }

    if (event.target.closest('[data-act="add"]')) { openForm(null); return; }

    const edit = event.target.closest('[data-edit]');
    if (edit) {
      const item = store.livestock().find((l) => l.id === edit.dataset.edit);
      if (item) openForm(item);
      return;
    }

    const addPhoto = event.target.closest('[data-addphoto]');
    if (addPhoto) { pickPhoto(addPhoto.dataset.addphoto); return; }

    const viewPhoto = event.target.closest('[data-photo]');
    if (viewPhoto) { openPhoto(viewPhoto.dataset.photo); return; }

    const del = event.target.closest('[data-del]');
    if (del) {
      const item = store.livestock().find((l) => l.id === del.dataset.del);
      if (!item) return;
      const ok = await confirmDialog({
        title: 'Delete this entry?',
        message: `"${item.name}" will be removed from your livestock list. Any expense you logged for it stays in the expense log.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok) { await store.deleteLivestock(item.id); toast('Entry deleted'); }
    }
  });

  // Typing only refreshes the results, so the field keeps focus and the
  // on-screen keyboard stays put on a phone.
  const searchInput = el.querySelector('#lsSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      search = searchInput.value;
      fillList(el.querySelector('#lsList'), store.livestock(), store.settings().currency);
    });
  }
}

/* --- Photos ---------------------------------------------------------------- */

/**
 * Open the camera or photo library for one entry.
 *
 * A file input is used rather than getUserMedia because on iOS it offers Take
 * Photo and Photo Library in one sheet, and hands back a still the OS has
 * already oriented and converted out of HEIC.
 */
function pickPhoto(livestockId) {
  const item = store.livestock().find((l) => l.id === livestockId);
  if (!item) return;

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
      await store.savePhoto(livestockId, processed);
      toast(`Photo added · ${processed.width}×${processed.height}, ${Math.round(processed.bytes / 1024)} KB`);
    } catch (err) {
      toast(err.message || 'That photo could not be added.');
    }
  }, { once: true });

  input.click();
}

/** Full-size viewer. The Blob URL is released when the dialog closes. */
async function openPhoto(livestockId) {
  const item = store.livestock().find((l) => l.id === livestockId);
  if (!item) return;

  const species = item.thumb ? null : speciesPhotoFor(item);
  const blob = item.thumb ? await store.loadPhoto(livestockId) : null;

  let url;
  if (blob) url = URL.createObjectURL(blob);
  else if (item.thumb) url = item.thumb;
  else if (species) url = species.src;
  else return;

  // CC BY and CC BY-SA require the photographer and licence to be named
  // wherever the image appears, so the credit is part of the view, not a footnote.
  const deed = species ? licenceUrl(species.licence) : '';
  const credit = species
    ? `<p class="photocredit">
         <b>Stock photo, not your animal.</b> ${esc(species.artist || 'Unknown')} ·
         ${deed
           ? `<a href="${esc(deed)}" target="_blank" rel="noopener noreferrer">${esc(species.licence)}</a>`
           : esc(species.licence)} ·
         <a href="${esc(species.source)}" target="_blank" rel="noopener noreferrer">source</a>${species.changes ? ` · ${esc(species.changes)}` : ''}<br>
         Add your own photo and this is replaced.
       </p>`
    : (blob ? '' : '<p class="field__hint">Only a thumbnail is stored on this device.</p>');

  const modal = openModal({
    title: item.name || 'Photo',
    body: `<img class="photoview" src="${esc(url)}" alt="${esc(item.name || '')}">${credit}`,
    footer: species
      ? `<button class="btn btn--primary" data-act="replace-photo">Use my own photo</button>
         <span class="spacer"></span>
         <button class="btn" data-close>Done</button>`
      : `<button class="btn btn--danger" data-act="remove-photo">Remove</button>
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
      pickPhoto(livestockId);
      return;
    }

    if (act.dataset.act === 'remove-photo') {
      closeModal();
      const ok = await confirmDialog({
        title: 'Remove this photo?',
        message: 'The photo is deleted from Reef Log. The original stays in your photo library.',
        confirmLabel: 'Remove',
        danger: true,
      });
      if (ok) { await store.deletePhoto(livestockId); toast('Photo removed'); }
    }
  });
}

/* --- Add / edit form ------------------------------------------------------ */

export function openForm(existing) {
  const isNew = !existing;
  const item = existing || {
    category: 'fish', name: '', scientificName: '', quantity: 1,
    acquiredDate: todayISO(), source: '', price: '', status: 'alive', removedDate: '', notes: '',
  };

  const stores = store.knownStores();

  const modal = openModal({
    title: isNew ? 'Add livestock' : `Edit ${item.name || 'entry'}`,
    body: `
      <form id="lsForm" novalidate>
        <label class="field">
          <span>Type</span>
          <select name="category">
            ${LIVESTOCK_CATEGORIES.map((c) => `<option value="${esc(c.id)}" ${c.id === item.category ? 'selected' : ''}>${c.icon} ${esc(c.label)}</option>`).join('')}
          </select>
        </label>

        <label class="field">
          <span>Common name</span>
          <input type="text" name="name" value="${esc(item.name)}" placeholder="e.g. Ocellaris Clownfish" required>
        </label>

        <div class="field-row">
          <label class="field">
            <span>Type (optional)</span>
            <input type="text" name="type" value="${esc(item.type || '')}" list="typeList" placeholder="e.g. Clownfish, Tang, Euphyllia">
            <datalist id="typeList">${knownTypes().map((t) => `<option value="${esc(t)}"></option>`).join('')}</datalist>
          </label>
          <label class="field">
            <span>Scientific name (optional)</span>
            <input type="text" name="scientificName" value="${esc(item.scientificName)}" placeholder="e.g. Amphiprion ocellaris">
          </label>
        </div>

        <div class="field-row">
          <label class="field">
            <span>Quantity</span>
            <input type="number" inputmode="numeric" min="1" step="1" name="quantity" value="${esc(item.quantity || 1)}">
          </label>
          <label class="field">
            <span>Date added</span>
            <input type="date" name="acquiredDate" value="${esc(item.acquiredDate || todayISO())}" required>
          </label>
        </div>

        <div class="field-row">
          <label class="field">
            <span>Store / source</span>
            <input type="text" name="source" value="${esc(item.source)}" list="storeList" placeholder="e.g. Reef Emporium">
            <datalist id="storeList">${stores.map((s) => `<option value="${esc(s)}"></option>`).join('')}</datalist>
          </label>
          <label class="field">
            <span>Price paid (total)</span>
            <input type="number" inputmode="decimal" min="0" step="0.01" name="price" value="${esc(item.price)}" placeholder="0.00">
          </label>
        </div>

        <label class="field">
          <span>Status</span>
          <select name="status">
            ${LIVESTOCK_STATUSES.map((s) => `<option value="${esc(s.id)}" ${s.id === (item.status || 'alive') ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
          </select>
        </label>

        <label class="field" id="removedField" ${(item.status || 'alive') === 'alive' ? 'hidden' : ''}>
          <span>Date removed</span>
          <input type="date" name="removedDate" value="${esc(item.removedDate || todayISO())}">
        </label>

        <label class="field">
          <span>Notes</span>
          <textarea name="notes" placeholder="Feeding, placement, temperament…">${esc(item.notes)}</textarea>
        </label>

        ${isNew ? `
        <label class="check">
          <input type="checkbox" name="logExpense" checked>
          <span>Also add this purchase to the expense log (when a price is entered)</span>
        </label>` : ''}
      </form>`,
    footer: `
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn--primary" id="lsSave">${isNew ? 'Add' : 'Save'}</button>`,
  });

  const form = modal.body.querySelector('#lsForm');
  const removedField = modal.body.querySelector('#removedField');

  form.querySelector('[name="status"]').addEventListener('change', (event) => {
    removedField.hidden = event.target.value === 'alive';
  });

  modal.footer.querySelector('#lsSave').addEventListener('click', async () => {
    const values = formValues(form);

    if (!values.name.trim()) { toast('Give it a name.'); return; }
    if (!values.acquiredDate) { toast('Pick the date you added it.'); return; }

    const price = parseNumber(values.price);
    const quantity = Math.max(1, Math.round(parseNumber(values.quantity) || 1));
    const status = values.status;

    if (status !== 'alive' && values.removedDate && values.removedDate < values.acquiredDate) {
      toast('The removal date cannot be before the date added.');
      return;
    }

    const record = {
      ...(existing || {}),
      category: values.category,
      name: values.name.trim(),
      type: values.type.trim(),
      scientificName: values.scientificName.trim(),
      quantity,
      acquiredDate: values.acquiredDate,
      source: values.source.trim(),
      price: price === null ? '' : price,
      status,
      removedDate: status === 'alive' ? '' : (values.removedDate || todayISO()),
      notes: values.notes.trim(),
    };

    const saved = await store.saveLivestock(record);

    if (isNew && values.logExpense && price) {
      await store.saveExpense({
        date: record.acquiredDate,
        category: 'Livestock',
        description: quantity > 1 ? `${quantity}× ${record.name}` : record.name,
        store: record.source,
        amount: price,
        notes: '',
        livestockId: saved.id,
      });
    }

    closeModal();
    toast(isNew ? 'Livestock added' : 'Saved');
  });
}
