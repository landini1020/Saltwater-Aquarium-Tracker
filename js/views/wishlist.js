/* Wish list: things you want but have not bought.

   The point of it is the shop counter. You are standing in front of a tank with
   a phone, and the question is whether this is the one you meant to get and what
   you were willing to pay. So an entry carries a photo, a price you expect and a
   priority, and nothing is required except a name.

   Buying one moves it into the section it actually belongs to — a fish to
   Livestock, a pump to Gear — carrying its photo across. See fulfilWish in
   store.js for the mapping. */

import * as store from '../store.js';
import * as charts from '../charts.js';
import { WISH_CATEGORIES } from '../store.js';
import {
  esc, openModal, closeModal, toast, confirmDialog, formValues, parseNumber,
  formatRelative, emptyState, plural, money, processPhoto,
} from '../ui.js';

let categoryFilter = 'all';

const MAX_STARS = 5;

function categoryOf(id) {
  return WISH_CATEGORIES.find((c) => c.id === id) || null;
}

/* --- Render --------------------------------------------------------------- */

export function render(root) {
  charts.disposeAll();

  const all = store.wishlist();
  const currency = store.settings().currency || 'USD';
  const budget = all.reduce((n, w) => n + (Number(w.price) || 0) * (Number(w.quantity) || 1), 0);

  const visible = categoryFilter === 'all'
    ? all
    : all.filter((w) => w.category === categoryFilter);

  // Only offer a filter for categories actually present, or the control is
  // mostly dead buttons.
  const present = WISH_CATEGORIES.filter((c) => all.some((w) => w.category === c.id));

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Wish List</h2>
        <p>${all.length
          ? `${plural(all.length, 'item')}${budget ? ` · ${esc(money(budget, currency))} to go` : ''}`
          : 'Nothing on the list'}</p>
      </div>
      <div class="spacer"></div>
      <button class="btn btn--primary" data-act="add">Add to wish list</button>
    </div>

    <div class="stack">
      ${present.length > 1 ? `
        <div class="row">
          <div class="seg" role="group" aria-label="Filter by category">
            <button type="button" data-filter="all" class="${categoryFilter === 'all' ? 'is-on' : ''}">All</button>
            ${present.map((c) => `
              <button type="button" data-filter="${c.id}" class="${categoryFilter === c.id ? 'is-on' : ''}">${esc(c.label)}</button>`).join('')}
          </div>
        </div>` : ''}

      <div id="wishList"></div>
    </div>`;

  const list = el.querySelector('#wishList');
  if (!visible.length) {
    list.innerHTML = `<section class="card">${emptyState({
      title: all.length ? 'Nothing in this group' : 'Your wish list is empty',
      message: all.length
        ? 'Try a different category.'
        : 'Snap a photo at the fish store and save it here, so you can research it before you buy rather than deciding at the counter.',
      action: all.length ? '' : '<button class="btn btn--primary" data-act="add">Add your first</button>',
    })}</section>`;
  } else {
    list.innerHTML = `<div class="grid grid--cards">${visible.map((w) => card(w, currency)).join('')}</div>`;
  }

  root.replaceChildren(el);
  wire(el, root);
}

function stars(wish) {
  const filled = Math.max(0, Math.min(MAX_STARS, Number(wish.priority) || 0));
  const buttons = [];
  for (let n = 1; n <= MAX_STARS; n += 1) {
    const on = n <= filled;
    buttons.push(`
      <button type="button" class="star ${on ? 'is-on' : ''}"
              data-star="${esc(wish.id)}" data-value="${n}"
              aria-label="Set priority to ${n} of ${MAX_STARS}"
              aria-pressed="${on}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8z"/></svg>
      </button>`);
  }
  // Clicking the only filled star clears the rating; otherwise there is no way back to none.
  return `<div class="stars" role="group" aria-label="Priority">${buttons.join('')}</div>`;
}

function thumbFor(wish) {
  if (wish.thumb) {
    return `<button type="button" class="avatar avatar--photo" data-photo="${esc(wish.id)}" aria-label="View photo of ${esc(wish.name)}">
              <img src="${esc(wish.thumb)}" alt="" loading="lazy">
            </button>`;
  }
  const cat = categoryOf(wish.category);
  return `<span class="avatar" aria-hidden="true">${cat ? cat.icon : '★'}</span>`;
}

function card(wish, currency) {
  const cat = categoryOf(wish.category);
  const qty = Number(wish.quantity) || 1;
  const price = Number(wish.price);

  return `
    <article class="lscard">
      <div class="lscard__top">
        ${thumbFor(wish)}
        <div style="flex:1;min-width:0">
          <div class="lscard__name">${esc(wish.name)}${qty > 1 ? ` <span class="muted">×${qty}</span>` : ''}</div>
          ${wish.scientificName ? `<div class="lscard__sci">${esc(wish.scientificName)}</div>` : ''}
          ${wish.type && !wish.scientificName ? `<div class="lscard__sci" style="font-style:normal">${esc(wish.type)}</div>` : ''}
        </div>
        ${cat ? `<span class="badge">${esc(cat.label)}</span>` : ''}
      </div>

      ${stars(wish)}

      <div class="lscard__facts">
        ${Number.isFinite(price) && price > 0
          ? `<div>Expect <b>${esc(money(price, currency))}</b>${qty > 1 ? ` <span class="muted">each · ${esc(money(price * qty, currency))} total</span>` : ''}</div>`
          : ''}
        ${wish.store ? `<div>From <b>${esc(wish.store)}</b></div>` : ''}
        ${wish.createdAt ? `<div>Added <b>${esc(formatRelative(wish.createdAt))}</b></div>` : ''}
      </div>

      ${wish.notes ? `<p class="lscard__note">${esc(wish.notes)}</p>` : ''}

      <div class="lscard__acts">
        <button class="btn btn--sm btn--primary" data-buy="${esc(wish.id)}">I bought it</button>
        <button class="btn btn--sm" data-edit="${esc(wish.id)}">Edit</button>
        <button class="btn btn--sm" data-addphoto="${esc(wish.id)}">${wish.thumb ? 'Replace photo' : 'Add photo'}</button>
        <div class="spacer"></div>
        <button class="iconbtn" data-del="${esc(wish.id)}" aria-label="Remove ${esc(wish.name)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
        </button>
      </div>
    </article>`;
}

/* --- Photos --------------------------------------------------------------- */

function pickPhoto(wishId) {
  if (!store.wishById(wishId)) return;

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
      const processed = await processPhoto(file, store.settings().photoSize || 'high');
      await store.savePhoto(wishId, processed);
      toast(`Photo added · ${processed.width}×${processed.height}, ${Math.round(processed.bytes / 1024)} KB`);
    } catch (err) {
      toast(err.message || 'That photo could not be added.');
    }
  }, { once: true });

  input.click();
}

async function openPhoto(wishId) {
  const wish = store.wishById(wishId);
  if (!wish || !wish.thumb) return;

  const blob = await store.loadPhoto(wishId);
  const url = blob ? URL.createObjectURL(blob) : wish.thumb;

  const modal = openModal({
    title: wish.name || 'Photo',
    body: `<img class="photoview" src="${esc(url)}" alt="${esc(wish.name || '')}">
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

    if (act.dataset.act === 'replace-photo') { closeModal(); pickPhoto(wishId); return; }

    if (act.dataset.act === 'remove-photo') {
      closeModal();
      const ok = await confirmDialog({
        title: 'Remove this photo?',
        message: 'The photo is deleted from Reef Log. The original stays in your photo library.',
        confirmLabel: 'Remove',
        danger: true,
      });
      if (ok) { await store.deletePhoto(wishId); toast('Photo removed'); }
    }
  });
}

/* --- Events --------------------------------------------------------------- */

function wire(el, root) {
  el.addEventListener('click', async (event) => {
    const filter = event.target.closest('[data-filter]');
    if (filter) { categoryFilter = filter.dataset.filter; render(root); return; }

    if (event.target.closest('[data-act="add"]')) { openWishForm(null); return; }

    const star = event.target.closest('[data-star]');
    if (star) {
      const wish = store.wishById(star.dataset.star);
      if (!wish) return;
      const value = Number(star.dataset.value);
      // Tapping the current rating's last star clears it, so a rating is undoable.
      const next = (Number(wish.priority) || 0) === value ? 0 : value;
      await store.saveWish({ ...wish, priority: next });
      return;
    }

    const edit = event.target.closest('[data-edit]');
    if (edit) { openWishForm(store.wishById(edit.dataset.edit)); return; }

    const addPhoto = event.target.closest('[data-addphoto]');
    if (addPhoto) { pickPhoto(addPhoto.dataset.addphoto); return; }

    const viewPhoto = event.target.closest('[data-photo]');
    if (viewPhoto) { openPhoto(viewPhoto.dataset.photo); return; }

    const buy = event.target.closest('[data-buy]');
    if (buy) { await confirmPurchase(buy.dataset.buy); return; }

    const del = event.target.closest('[data-del]');
    if (del) {
      const wish = store.wishById(del.dataset.del);
      if (!wish) return;
      const ok = await confirmDialog({
        title: `Remove ${wish.name}?`,
        message: 'This takes it off the wish list. Nothing else is affected.',
        confirmLabel: 'Remove',
        danger: true,
      });
      if (ok) { await store.deleteWish(wish.id); toast('Removed'); }
    }
  });
}

/* Moving a wish into the tank creates a real record, so it asks first and says
   exactly where the entry will appear. */
async function confirmPurchase(wishId) {
  const wish = store.wishById(wishId);
  if (!wish) return;

  const cat = categoryOf(wish.category);
  const where = cat ? cat.movesTo : 'your log';

  const ok = await confirmDialog({
    title: `Bought ${wish.name}?`,
    message: `It moves to ${where}, dated today, with its photo, quantity, store and price carried over — and comes off the wish list. You can fill in the rest there.`,
    confirmLabel: 'Move it',
  });
  if (!ok) return;

  try {
    await store.fulfilWish(wishId);
    toast(`Moved to ${where}`);
  } catch (err) {
    toast(err.message || 'That could not be moved.');
  }
}

/* --- Form ----------------------------------------------------------------- */

function openWishForm(existing) {
  const isNew = !(existing && existing.id);
  const wish = {
    name: '', category: 'fish', type: '', scientificName: '', quantity: 1,
    store: '', price: '', priority: 0, notes: '',
    ...(existing || {}),
  };

  const stores = store.knownStores();

  const modal = openModal({
    title: isNew ? 'Add to wish list' : `Edit ${wish.name}`,
    body: `
      <form id="wishForm" novalidate>
        <label class="field">
          <span>What is it</span>
          <input type="text" name="name" value="${esc(wish.name)}" placeholder="e.g. Mandarin Dragonet" required>
        </label>

        <div class="field-row">
          <label class="field">
            <span>Category</span>
            <select name="category">
              ${WISH_CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === wish.category ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span>Priority</span>
            <select name="priority">
              <option value="0" ${!Number(wish.priority) ? 'selected' : ''}>Not rated</option>
              ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${Number(wish.priority) === n ? 'selected' : ''}>${'★'.repeat(n)}</option>`).join('')}
            </select>
          </label>
        </div>

        <div class="field-row">
          <label class="field" id="sciField" ${['fish', 'coral', 'invert'].includes(wish.category) ? '' : 'hidden'}>
            <span>Scientific name</span>
            <input type="text" name="scientificName" value="${esc(wish.scientificName)}" placeholder="e.g. Synchiropus splendidus">
          </label>
          <label class="field">
            <span id="typeLabel">Type or brand</span>
            <input type="text" name="type" value="${esc(wish.type)}" placeholder="e.g. Dragonet">
          </label>
        </div>

        <div class="field-row">
          <label class="field">
            <span>Quantity</span>
            <input type="number" inputmode="numeric" min="1" step="1" name="quantity" value="${esc(wish.quantity || 1)}">
          </label>
          <label class="field">
            <span>Price you expect</span>
            <input type="number" inputmode="decimal" min="0" step="0.01" name="price" value="${esc(wish.price ?? '')}" placeholder="0.00">
          </label>
        </div>

        <label class="field">
          <span>Where from</span>
          <input type="text" name="store" value="${esc(wish.store)}" list="wishStoreList" placeholder="e.g. Discover Aquatics">
          <datalist id="wishStoreList">${stores.map((s) => `<option value="${esc(s)}"></option>`).join('')}</datalist>
        </label>

        <label class="field">
          <span>Notes</span>
          <textarea name="notes" placeholder="Care needs to check, tank mates, why you want it…">${esc(wish.notes)}</textarea>
        </label>
      </form>`,
    footer: `
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn--primary" id="wishSave">${isNew ? 'Add' : 'Save'}</button>`,
  });

  const form = modal.body.querySelector('#wishForm');
  const sciField = form.querySelector('#sciField');
  const typeLabel = form.querySelector('#typeLabel');

  // A scientific name means nothing for a return pump, and "type or brand"
  // reads differently for an animal than for a bottle.
  const syncCategory = () => {
    const isLive = ['fish', 'coral', 'invert'].includes(form.category.value);
    sciField.hidden = !isLive;
    typeLabel.textContent = isLive ? 'Type' : 'Brand or model';
  };
  form.category.addEventListener('change', syncCategory);
  syncCategory();

  modal.footer.querySelector('#wishSave').addEventListener('click', async () => {
    const values = formValues(form);
    if (!values.name.trim()) { toast('Give it a name.'); return; }

    const price = parseNumber(values.price);
    if (price !== null && price < 0) { toast('Price cannot be negative.'); return; }

    await store.saveWish({
      ...(existing || {}),
      name: values.name.trim(),
      category: values.category,
      type: values.type.trim(),
      scientificName: ['fish', 'coral', 'invert'].includes(values.category) ? values.scientificName.trim() : '',
      quantity: Math.max(1, Math.round(parseNumber(values.quantity) || 1)),
      store: values.store.trim(),
      price: price === null ? '' : price,
      priority: Number(values.priority) || 0,
      notes: values.notes.trim(),
    });

    closeModal();
    toast(isNew ? 'Added to wish list' : 'Saved');
  });
}
