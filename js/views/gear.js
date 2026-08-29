/* Gear view: the equipment running the tank and the supplements dosed into it. */

import * as store from '../store.js';
import * as charts from '../charts.js';
import { equipmentIcon } from '../equipment-icons.js';
import { EQUIPMENT_PHOTOS, EQUIPMENT_PHOTO_DIR } from '../equipment-photos.js';
import { brandFor } from '../equipment-brands.js';
import { licenceUrl } from '../licences.js';
import {
  esc, openModal, closeModal, toast, confirmDialog, formValues, parseNumber,
  formatDate, formatDuration, todayISO, emptyState, plural, processPhoto,
} from '../ui.js';

let tab = 'equipment';
let showRetired = false;

export function render(root) {
  charts.disposeAll();

  const gear = store.equipment();
  const supps = store.supplements();
  const active = gear.filter((g) => (g.status || 'active') === 'active');

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Gear</h2>
        <p>${plural(active.length, 'item')} in service · ${plural(supps.length, 'supplement')}</p>
      </div>
      <div class="spacer"></div>
      <button class="btn btn--primary" data-act="add">${tab === 'equipment' ? 'Add equipment' : 'Add supplement'}</button>
    </div>

    <div class="stack">
      <div class="row">
        <div class="seg" role="group" aria-label="Section">
          <button type="button" data-tab="equipment" class="${tab === 'equipment' ? 'is-on' : ''}">Equipment</button>
          <button type="button" data-tab="supplements" class="${tab === 'supplements' ? 'is-on' : ''}">Supplements</button>
        </div>
        ${tab === 'equipment' && gear.some((g) => (g.status || 'active') !== 'active') ? `
          <div class="spacer"></div>
          <label class="check" style="font-size:13px">
            <input type="checkbox" id="showRetired" ${showRetired ? 'checked' : ''}>
            <span>Show retired</span>
          </label>` : ''}
      </div>
      <div id="gearList"></div>
    </div>`;

  const list = el.querySelector('#gearList');
  if (tab === 'equipment') renderEquipment(list, gear);
  else renderSupplements(list, supps);

  root.replaceChildren(el);
  wire(el, root);
}

export function stockPhotoFor(item) {
  const entry = EQUIPMENT_PHOTOS[item.id];
  return entry ? { ...entry, src: EQUIPMENT_PHOTO_DIR + entry.file } : null;
}

/* Your own photo, then a stock photo if one exists for this exact model, then
   the drawn type symbol. Only one item has a stock photo — see the note in
   js/equipment-photos.js. */
function thumbFor(g) {
  if (g.thumb) {
    return `<button type="button" class="avatar avatar--photo" data-photo="${esc(g.id)}" aria-label="View photo of ${esc(g.name)}">
              <img src="${esc(g.thumb)}" alt="" loading="lazy">
            </button>`;
  }

  const stock = stockPhotoFor(g);
  if (stock) {
    return `<button type="button" class="avatar avatar--photo is-stock" data-photo="${esc(g.id)}"
                    aria-label="Stock photo of ${esc(g.name)} — not your unit">
              <img src="${esc(stock.src)}" alt="" loading="lazy">
            </button>`;
  }

  const brand = brandFor(g);
  return `<span class="avatar gearicon ${brand ? 'is-branded' : ''}" aria-hidden="true"
                ${brand ? `style="--brand-l:${brand.light};--brand-d:${brand.dark}"` : ''}>${equipmentIcon(g)}</span>`;
}

function renderEquipment(list, gear) {
  const visible = gear
    .filter((g) => showRetired || (g.status || 'active') === 'active')
    .sort((a, b) => String(b.installedDate || '').localeCompare(String(a.installedDate || '')));

  if (!visible.length) {
    list.innerHTML = `<section class="card">${emptyState({
      title: gear.length ? 'Nothing to show' : 'No equipment yet',
      message: gear.length
        ? 'Everything here is retired — tick "Show retired" to see it.'
        : 'Add your pumps, filters, lights and heaters to track what is running and since when.',
      action: gear.length ? '' : '<button class="btn btn--primary" data-act="add">Add your first</button>',
    })}</section>`;
    return;
  }

  list.innerHTML = `<div class="grid grid--cards">${visible.map((g) => {
    const retired = (g.status || 'active') !== 'active';
    const qty = Number(g.quantity) || 1;
    const brand = brandFor(g);
    return `
      <article class="lscard ${retired ? 'is-gone' : ''}">
        <div class="lscard__top">
          ${thumbFor(g)}
          <div style="flex:1;min-width:0">
            ${brand ? `<div class="brandmark" style="--brand-l:${brand.light};--brand-d:${brand.dark}">${esc(brand.label)}</div>` : ''}
            <div class="lscard__name">${esc(g.name)}${qty > 1 ? ` <span class="muted">×${qty}</span>` : ''}</div>
            ${g.model ? `<div class="lscard__sci" style="font-style:normal">${esc(g.model)}</div>` : ''}
          </div>
          ${retired ? '<span class="badge">Retired</span>' : ''}
        </div>

        ${g.installedDate ? `<div class="lscard__age">${retired ? 'Ran for' : 'In service'}: ${esc(formatDuration(g.installedDate, retired && g.retiredDate ? g.retiredDate : new Date()))}</div>` : ''}

        <div class="lscard__facts">
          ${g.installedDate ? `<div>Installed <b>${esc(formatDate(g.installedDate))}</b></div>` : ''}
          ${retired && g.retiredDate ? `<div>Retired <b>${esc(formatDate(g.retiredDate))}</b></div>` : ''}
        </div>

        ${g.notes ? `<p class="lscard__note">${esc(g.notes)}</p>` : ''}

        <div class="lscard__acts">
          <button class="btn btn--sm" data-edit="${esc(g.id)}">Edit</button>
          <button class="btn btn--sm" data-addphoto="${esc(g.id)}">${g.thumb ? 'Replace photo' : 'Add photo'}</button>
          <div class="spacer"></div>
          <button class="iconbtn" data-del="${esc(g.id)}" aria-label="Delete ${esc(g.name)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
          </button>
        </div>
      </article>`;
  }).join('')}</div>`;
}

function renderSupplements(list, supps) {
  if (!supps.length) {
    list.innerHTML = `<section class="card">${emptyState({
      title: 'No supplements yet',
      message: 'Add what you dose — two-part, trace elements, bacteria — along with the dosing instructions.',
      action: '<button class="btn btn--primary" data-act="add">Add your first</button>',
    })}</section>`;
    return;
  }

  const sorted = [...supps].sort((a, b) => a.name.localeCompare(b.name));

  list.innerHTML = `<div class="stack">${sorted.map((s) => {
    const meta = [s.brand, s.size, Number(s.quantity) > 1 ? `×${s.quantity}` : ''].filter(Boolean).join(' · ');
    return `
      <section class="card">
        <div class="card__body">
          <div class="row" style="align-items:flex-start">
            <div style="flex:1;min-width:0">
              <h3 style="font-size:15.5px">${esc(s.name)}</h3>
              ${meta ? `<div class="muted" style="font-size:12.5px;margin-top:2px">${esc(meta)}</div>` : ''}
            </div>
          </div>

          ${s.instructions ? `
            <details style="margin-top:10px">
              <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--accent)">Dosing instructions</summary>
              <p style="white-space:pre-wrap;font-size:13px;color:var(--text-soft);margin-top:8px">${esc(s.instructions)}</p>
            </details>` : ''}

          ${s.notes ? `<p class="lscard__note">${esc(s.notes)}</p>` : ''}

          <div class="lscard__acts">
            <button class="btn btn--sm" data-edit="${esc(s.id)}">Edit</button>
            <div class="spacer"></div>
            <button class="iconbtn" data-del="${esc(s.id)}" aria-label="Delete ${esc(s.name)}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
            </button>
          </div>
        </div>
      </section>`;
  }).join('')}</div>`;
}

/* --- Photos ---------------------------------------------------------------- */

/*
 * A file input rather than getUserMedia, for the same reason as livestock: on
 * iOS it offers Take Photo and Photo Library in one sheet, and hands back a
 * still the OS has already oriented and converted out of HEIC.
 */
function pickPhoto(equipmentId) {
  const item = store.equipment().find((g) => g.id === equipmentId);
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
      await store.savePhoto(equipmentId, processed);
      toast(`Photo added · ${processed.width}×${processed.height}, ${Math.round(processed.bytes / 1024)} KB`);
    } catch (err) {
      toast(err.message || 'That photo could not be added.');
    }
  }, { once: true });

  input.click();
}

/** Full-size viewer. The Blob URL is released when the dialog closes. */
async function openPhoto(equipmentId) {
  const item = store.equipment().find((g) => g.id === equipmentId);
  if (!item) return;

  const stock = item.thumb ? null : stockPhotoFor(item);
  const blob = item.thumb ? await store.loadPhoto(equipmentId) : null;

  let url;
  if (blob) url = URL.createObjectURL(blob);
  else if (item.thumb) url = item.thumb;
  else if (stock) url = stock.src;
  else return;

  // CC BY-SA requires the photographer, the licence with a link to it, and any
  // changes to be named wherever the image appears — so the credit is part of
  // the view, not a footnote.
  const deed = stock ? licenceUrl(stock.licence) : '';
  const credit = stock
    ? `<p class="photocredit">
         <b>Stock photo, not your unit.</b> ${esc(stock.artist || 'Unknown')} ·
         ${deed
           ? `<a href="${esc(deed)}" target="_blank" rel="noopener noreferrer">${esc(stock.licence)}</a>`
           : esc(stock.licence)} ·
         <a href="${esc(stock.source)}" target="_blank" rel="noopener noreferrer">source</a>${stock.changes ? ` · ${esc(stock.changes)}` : ''}<br>
         Add your own photo and this is replaced.
       </p>`
    : (blob ? '' : '<p class="field__hint">Only a thumbnail is stored on this device.</p>');

  const modal = openModal({
    title: item.name || 'Photo',
    body: `<img class="photoview" src="${esc(url)}" alt="${esc(item.name || '')}">${credit}`,
    footer: stock
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
      pickPhoto(equipmentId);
      return;
    }

    if (act.dataset.act === 'remove-photo') {
      closeModal();
      const ok = await confirmDialog({
        title: 'Remove this photo?',
        message: 'The photo is deleted from Reef Log and the item goes back to its type symbol. The original stays in your photo library.',
        confirmLabel: 'Remove',
        danger: true,
      });
      if (ok) { await store.deletePhoto(equipmentId); toast('Photo removed'); }
    }
  });
}

/* --- Events --------------------------------------------------------------- */

function wire(el, root) {
  el.addEventListener('click', async (event) => {
    const t = event.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; render(root); return; }

    if (event.target.closest('[data-act="add"]')) {
      if (tab === 'equipment') openEquipmentForm(null); else openSupplementForm(null);
      return;
    }

    const edit = event.target.closest('[data-edit]');
    if (edit) {
      if (tab === 'equipment') openEquipmentForm(store.equipment().find((g) => g.id === edit.dataset.edit));
      else openSupplementForm(store.supplements().find((s) => s.id === edit.dataset.edit));
      return;
    }

    const addPhoto = event.target.closest('[data-addphoto]');
    if (addPhoto) { pickPhoto(addPhoto.dataset.addphoto); return; }

    const viewPhoto = event.target.closest('[data-photo]');
    if (viewPhoto) { openPhoto(viewPhoto.dataset.photo); return; }

    const del = event.target.closest('[data-del]');
    if (del) {
      const isGear = tab === 'equipment';
      const item = (isGear ? store.equipment() : store.supplements()).find((r) => r.id === del.dataset.del);
      if (!item) return;
      const ok = await confirmDialog({
        title: `Delete ${item.name}?`,
        message: isGear
          ? 'This removes the item from your gear list. Any expense you logged for it stays in the expense log.'
          : 'This removes the supplement, including its dosing instructions.',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok) {
        if (isGear) await store.deleteEquipment(item.id); else await store.deleteSupplement(item.id);
        toast('Deleted');
      }
    }
  });

  const retiredToggle = el.querySelector('#showRetired');
  if (retiredToggle) {
    retiredToggle.addEventListener('change', () => { showRetired = retiredToggle.checked; render(root); });
  }
}

/* --- Forms ---------------------------------------------------------------- */

function openEquipmentForm(existing) {
  const isNew = !existing;
  const item = existing || {
    name: '', model: '', quantity: 1, installedDate: todayISO(), status: 'active', retiredDate: '', notes: '',
  };

  const modal = openModal({
    title: isNew ? 'Add equipment' : `Edit ${item.name}`,
    body: `
      <form id="gearForm" novalidate>
        <label class="field">
          <span>Name</span>
          <input type="text" name="name" value="${esc(item.name)}" placeholder="e.g. Return Pump" required>
        </label>
        <label class="field">
          <span>Model</span>
          <input type="text" name="model" value="${esc(item.model)}" placeholder="e.g. Fluval FX6 Canister Filter">
        </label>
        <div class="field-row">
          <label class="field">
            <span>Quantity</span>
            <input type="number" inputmode="numeric" min="1" step="1" name="quantity" value="${esc(item.quantity || 1)}">
          </label>
          <label class="field">
            <span>Installed on</span>
            <input type="date" name="installedDate" value="${esc(item.installedDate || todayISO())}">
          </label>
        </div>
        <label class="check">
          <input type="checkbox" name="retired" ${(item.status || 'active') !== 'active' ? 'checked' : ''}>
          <span>No longer in service</span>
        </label>
        <label class="field" id="retiredField" style="margin-top:14px" ${(item.status || 'active') === 'active' ? 'hidden' : ''}>
          <span>Retired on</span>
          <input type="date" name="retiredDate" value="${esc(item.retiredDate || todayISO())}">
        </label>
        <label class="field">
          <span>Notes</span>
          <textarea name="notes" placeholder="Settings, service history…">${esc(item.notes)}</textarea>
        </label>
      </form>`,
    footer: `
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn--primary" id="gearSave">${isNew ? 'Add' : 'Save'}</button>`,
  });

  const form = modal.body.querySelector('#gearForm');
  const retiredField = modal.body.querySelector('#retiredField');
  form.querySelector('[name="retired"]').addEventListener('change', (e) => {
    retiredField.hidden = !e.target.checked;
  });

  modal.footer.querySelector('#gearSave').addEventListener('click', async () => {
    const values = formValues(form);
    if (!values.name.trim()) { toast('Give it a name.'); return; }

    if (values.retired && values.retiredDate && values.installedDate && values.retiredDate < values.installedDate) {
      toast('The retirement date cannot be before the install date.');
      return;
    }

    await store.saveEquipment({
      ...(existing || {}),
      name: values.name.trim(),
      model: values.model.trim(),
      quantity: Math.max(1, Math.round(parseNumber(values.quantity) || 1)),
      installedDate: values.installedDate,
      status: values.retired ? 'retired' : 'active',
      retiredDate: values.retired ? (values.retiredDate || todayISO()) : '',
      notes: values.notes.trim(),
    });

    closeModal();
    toast(isNew ? 'Equipment added' : 'Saved');
  });
}

function openSupplementForm(existing) {
  const isNew = !existing;
  const item = existing || { name: '', brand: '', size: '', quantity: 1, instructions: '', notes: '' };

  const modal = openModal({
    title: isNew ? 'Add supplement' : `Edit ${item.name}`,
    body: `
      <form id="suppForm" novalidate>
        <label class="field">
          <span>Name</span>
          <input type="text" name="name" value="${esc(item.name)}" placeholder="e.g. Reef Foundation A" required>
        </label>
        <div class="field-row">
          <label class="field">
            <span>Brand</span>
            <input type="text" name="brand" value="${esc(item.brand)}" placeholder="e.g. Red Sea">
          </label>
          <label class="field">
            <span>Size</span>
            <input type="text" name="size" value="${esc(item.size)}" placeholder="e.g. 1000ml">
          </label>
        </div>
        <label class="field">
          <span>Quantity on hand</span>
          <input type="number" inputmode="numeric" min="0" step="1" name="quantity" value="${esc(item.quantity ?? 1)}">
        </label>
        <label class="field">
          <span>Dosing instructions</span>
          <textarea name="instructions" style="min-height:120px" placeholder="How much, how often…">${esc(item.instructions)}</textarea>
        </label>
        <label class="field">
          <span>Notes</span>
          <textarea name="notes">${esc(item.notes)}</textarea>
        </label>
      </form>`,
    footer: `
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn--primary" id="suppSave">${isNew ? 'Add' : 'Save'}</button>`,
  });

  modal.footer.querySelector('#suppSave').addEventListener('click', async () => {
    const values = formValues(modal.body.querySelector('#suppForm'));
    if (!values.name.trim()) { toast('Give it a name.'); return; }

    await store.saveSupplement({
      ...(existing || {}),
      name: values.name.trim(),
      brand: values.brand.trim(),
      size: values.size.trim(),
      quantity: Math.max(0, Math.round(parseNumber(values.quantity) || 0)),
      instructions: values.instructions.trim(),
      notes: values.notes.trim(),
    });

    closeModal();
    toast(isNew ? 'Supplement added' : 'Saved');
  });
}
