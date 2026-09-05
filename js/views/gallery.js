/* Gallery: tank photos, grouped into albums.

   Every other photo in the app decorates a record that would exist anyway — a
   fish, a pump, a tub of pellets. These are the opposite: the picture is the
   point, and there is no limit on how many you keep. That changes the storage
   arithmetic, so this screen shows what the gallery is costing rather than
   leaving it to be discovered in Settings.

   An album is only a label. Photos can sit outside one, and deleting an album
   never deletes what is in it. */

import * as store from '../store.js';
import * as charts from '../charts.js';
import {
  esc, openModal, closeModal, toast, confirmDialog, formValues,
  formatDate, todayISO, emptyState, plural, processPhoto,
} from '../ui.js';

/* null = every photo, 'unfiled' = the ones in no album, otherwise an album id. */
let currentAlbum = null;

/* --- Render --------------------------------------------------------------- */

export function render(root) {
  charts.disposeAll();

  const albums = store.albums();
  const all = store.gallery();
  const unfiled = store.gallery('unfiled');

  // An album that has been deleted out from under the filter falls back to All.
  if (currentAlbum && currentAlbum !== 'unfiled' && !store.albumById(currentAlbum)) {
    currentAlbum = null;
  }

  const visible = store.gallery(currentAlbum);
  const bytes = all.reduce((n, p) => n + (Number(p.bytes) || 0), 0);

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Gallery</h2>
        <p>${all.length
          ? `${plural(all.length, 'photo')}${albums.length ? ` · ${plural(albums.length, 'album')}` : ''}${bytes ? ` · ${esc(formatBytes(bytes))}` : ''}`
          : 'No photos yet'}</p>
      </div>
      <div class="spacer"></div>
      <button class="btn" data-act="new-album">New album</button>
      <button class="btn btn--primary" data-act="add-photos">Add photos</button>
    </div>

    <div class="stack">
      ${albums.length || unfiled.length ? `
        <div class="row">
          <div class="seg seg--wrap" role="group" aria-label="Albums">
            <button type="button" data-album="" class="${currentAlbum === null ? 'is-on' : ''}">All ${all.length}</button>
            ${albums.map((a) => {
              const n = store.gallery(a.id).length;
              return `<button type="button" data-album="${esc(a.id)}" class="${currentAlbum === a.id ? 'is-on' : ''}">${esc(a.name)} ${n}</button>`;
            }).join('')}
            ${unfiled.length ? `<button type="button" data-album="unfiled" class="${currentAlbum === 'unfiled' ? 'is-on' : ''}">Unfiled ${unfiled.length}</button>` : ''}
          </div>
          ${currentAlbum && currentAlbum !== 'unfiled' ? `
            <div class="spacer"></div>
            <button class="btn btn--sm" data-act="rename-album">Rename</button>
            <button class="btn btn--sm" data-act="delete-album">Delete album</button>` : ''}
        </div>` : ''}

      <div id="galleryGrid"></div>
    </div>`;

  const grid = el.querySelector('#galleryGrid');
  if (!visible.length) {
    grid.innerHTML = `<section class="card">${emptyState({
      title: all.length ? 'Nothing in this album' : 'No photos yet',
      message: all.length
        ? 'Add photos here, or move some in from another album.'
        : 'Photograph the whole tank every so often. A year of them side by side shows things no single picture does.',
      action: '<button class="btn btn--primary" data-act="add-photos">Add photos</button>',
    })}</section>`;
  } else {
    grid.innerHTML = `<div class="photogrid">${visible.map(tile).join('')}</div>`;
  }

  root.replaceChildren(el);
  wire(el, root);
}

function formatBytes(n) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function tile(photo) {
  const when = photo.takenAt ? formatDate(photo.takenAt) : '';
  return `
    <button type="button" class="phototile" data-photo="${esc(photo.id)}"
            aria-label="${esc(photo.caption || when || 'Photo')}">
      <img src="${esc(photo.thumb)}" alt="" loading="lazy">
      ${photo.caption || when
        ? `<span class="phototile__cap">${esc(photo.caption || when)}</span>`
        : ''}
    </button>`;
}

/* --- Adding photos -------------------------------------------------------- */

/*
 * Multiple selection, processed one at a time rather than in parallel: each
 * photo decodes a full-size bitmap onto a canvas, and a phone asked to do
 * twenty at once will run out of memory rather than go faster.
 */
function pickPhotos() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.hidden = true;
  document.body.append(input);

  input.addEventListener('change', async () => {
    const files = [...(input.files || [])];
    input.remove();
    if (!files.length) return;

    const albumId = currentAlbum && currentAlbum !== 'unfiled' ? currentAlbum : null;
    const sizeKey = store.settings().photoSize || 'high';

    let added = 0;
    const failed = [];

    for (const [i, file] of files.entries()) {
      toast(files.length > 1 ? `Processing ${i + 1} of ${files.length}…` : 'Processing photo…', 60000);
      try {
        const processed = await processPhoto(file, sizeKey);
        const record = await store.saveGalleryPhoto({
          albumId,
          caption: '',
          // A camera file's timestamp is usually when the shutter fired, which
          // beats "today" for photos imported long after the fact.
          takenAt: file.lastModified ? new Date(file.lastModified).toISOString().slice(0, 10) : todayISO(),
          bytes: processed.bytes,
          width: processed.width,
          height: processed.height,
        });
        await store.savePhoto(record.id, processed);
        added += 1;
      } catch (err) {
        failed.push(file.name || 'a file');
        console.warn('Gallery import failed', file.name, err);
      }
    }

    if (added && !failed.length) toast(`${plural(added, 'photo')} added`);
    else if (added) toast(`${plural(added, 'photo')} added · ${failed.length} could not be read`);
    else toast('None of those could be added.');
  }, { once: true });

  input.click();
}

/* --- Viewer --------------------------------------------------------------- */

async function openPhoto(photoId) {
  const photo = store.galleryById(photoId);
  if (!photo) return;

  const blob = await store.loadPhoto(photoId);
  const url = blob ? URL.createObjectURL(blob) : photo.thumb;
  const albums = store.albums();

  const modal = openModal({
    title: photo.caption || (photo.takenAt ? formatDate(photo.takenAt) : 'Photo'),
    body: `
      <img class="photoview" src="${esc(url)}" alt="${esc(photo.caption || '')}">
      ${blob ? '' : '<p class="field__hint">Only a thumbnail is stored on this device.</p>'}
      <form id="photoForm" novalidate style="margin-top:14px">
        <label class="field">
          <span>Caption</span>
          <input type="text" name="caption" value="${esc(photo.caption || '')}" placeholder="What is happening here">
        </label>
        <div class="field-row">
          <label class="field">
            <span>Taken</span>
            <input type="date" name="takenAt" value="${esc(photo.takenAt || '')}">
          </label>
          <label class="field">
            <span>Album</span>
            <select name="albumId">
              <option value="">Unfiled</option>
              ${albums.map((a) => `<option value="${esc(a.id)}" ${a.id === photo.albumId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
            </select>
          </label>
        </div>
        ${photo.width ? `<p class="field__hint">${photo.width}×${photo.height}${photo.bytes ? ` · ${esc(formatBytes(photo.bytes))}` : ''}</p>` : ''}
      </form>`,
    footer: `
      <button class="btn btn--danger" data-act="delete">Delete</button>
      <span class="spacer"></span>
      <button class="btn" data-close>Close</button>
      <button class="btn btn--primary" data-act="save">Save</button>`,
    onClose: () => { if (blob) URL.revokeObjectURL(url); },
  });

  modal.footer.addEventListener('click', async (event) => {
    const act = event.target.closest('[data-act]');
    if (!act) return;

    if (act.dataset.act === 'save') {
      const values = formValues(modal.body.querySelector('#photoForm'));
      await store.saveGalleryPhoto({
        ...photo,
        caption: values.caption.trim(),
        takenAt: values.takenAt || '',
        albumId: values.albumId || null,
      });
      closeModal();
      toast('Saved');
      return;
    }

    if (act.dataset.act === 'delete') {
      closeModal();
      const ok = await confirmDialog({
        title: 'Delete this photo?',
        message: 'It is removed from Reef Log. The original stays in your photo library.',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok) { await store.deleteGalleryPhoto(photoId); toast('Photo deleted'); }
    }
  });
}

/* --- Albums --------------------------------------------------------------- */

function openAlbumForm(existing) {
  const isNew = !(existing && existing.id);

  const modal = openModal({
    title: isNew ? 'New album' : `Rename ${existing.name}`,
    body: `
      <form id="albumForm" novalidate>
        <label class="field">
          <span>Album name</span>
          <input type="text" name="name" value="${esc(existing ? existing.name : '')}"
                 placeholder="e.g. Corals, Full tank shots" required>
        </label>
      </form>`,
    footer: `
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn--primary" id="albumSave">${isNew ? 'Create' : 'Save'}</button>`,
    onMount: (body) => body.querySelector('[name="name"]').focus(),
  });

  modal.footer.querySelector('#albumSave').addEventListener('click', async () => {
    const values = formValues(modal.body.querySelector('#albumForm'));
    const name = values.name.trim();
    if (!name) { toast('Give the album a name.'); return; }

    const saved = await store.saveAlbum({ ...(existing || {}), name });
    if (isNew) currentAlbum = saved.id;
    closeModal();
    toast(isNew ? 'Album created' : 'Saved');
  });
}

async function removeAlbum(albumId) {
  const album = store.albumById(albumId);
  if (!album) return;

  const n = store.gallery(albumId).length;
  const ok = await confirmDialog({
    title: `Delete the album "${album.name}"?`,
    message: n
      ? `The album is removed. Its ${plural(n, 'photo')} are kept and become unfiled — deleting a folder should not delete the pictures in it.`
      : 'The album is empty, so nothing else changes.',
    confirmLabel: 'Delete album',
    danger: true,
  });

  if (ok) {
    await store.deleteAlbum(albumId);
    currentAlbum = null;
    toast('Album deleted');
  }
}

/* --- Events --------------------------------------------------------------- */

function wire(el, root) {
  el.addEventListener('click', async (event) => {
    const pick = event.target.closest('[data-album]');
    if (pick) {
      currentAlbum = pick.dataset.album || null;
      render(root);
      return;
    }

    const act = event.target.closest('[data-act]');
    if (act) {
      if (act.dataset.act === 'add-photos') pickPhotos();
      if (act.dataset.act === 'new-album') openAlbumForm(null);
      if (act.dataset.act === 'rename-album') openAlbumForm(store.albumById(currentAlbum));
      if (act.dataset.act === 'delete-album') await removeAlbum(currentAlbum);
      return;
    }

    const photo = event.target.closest('[data-photo]');
    if (photo) openPhoto(photo.dataset.photo);
  });
}
