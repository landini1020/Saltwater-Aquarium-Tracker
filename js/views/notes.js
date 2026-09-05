/* Notes: a place for everything that is not a number, a date or a purchase.

   Deliberately unstructured. The rest of the app is fields, and the value of
   this screen is that it asks nothing of you — paste the dosing instructions,
   note what the shop said about acclimating, write down what went wrong. Search
   is what makes it findable later, so it is the one piece of machinery here. */

import * as store from '../store.js';
import * as charts from '../charts.js';
import {
  esc, openModal, closeModal, toast, confirmDialog, formValues,
  formatDateTime, formatRelative, emptyState, plural, debounce,
} from '../ui.js';

let query = '';
let openId = null;

/* --- Search --------------------------------------------------------------- */

function matches(note, needle) {
  if (!needle) return true;
  return `${note.title || ''} ${note.body || ''}`.toLowerCase().includes(needle);
}

/** First line of the body, for the list preview when there is no title. */
function firstLine(note) {
  const line = String(note.body || '').split('\n').find((l) => l.trim());
  return line ? line.trim() : '';
}

function displayTitle(note) {
  return (note.title || '').trim() || firstLine(note) || 'Untitled note';
}

/**
 * The preview under the heading. An untitled note borrows its first line as the
 * heading, so that line is dropped here rather than printed twice.
 */
function previewBody(note) {
  const body = String(note.body || '');
  if ((note.title || '').trim()) return body;

  const lines = body.split('\n');
  const i = lines.findIndex((l) => l.trim());
  return i === -1 ? '' : lines.slice(i + 1).join('\n').trim();
}

/* Wrap each hit in a <mark> so a search result shows why it matched. Escaping
   happens first, then the marks go in — the other order would let the note's
   own text inject tags. */
function highlight(text, needle) {
  const safe = esc(text);
  if (!needle) return safe;

  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return safe.replace(pattern, (hit) => `<mark>${hit}</mark>`);
}

/* --- Render --------------------------------------------------------------- */

export function render(root) {
  charts.disposeAll();

  const all = store.notes();
  const needle = query.trim().toLowerCase();
  const visible = all.filter((n) => matches(n, needle));

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Notes</h2>
        <p>${all.length ? plural(all.length, 'note') : 'No notes yet'}</p>
      </div>
      <div class="spacer"></div>
      <button class="btn btn--primary" data-act="add">New note</button>
    </div>

    <div class="stack">
      ${all.length ? `
        <div class="row">
          <label class="field field--search" style="flex:1;margin:0">
            <span class="visually-hidden">Search notes</span>
            <input type="search" id="noteSearch" value="${esc(query)}"
                   placeholder="Search your notes…" autocomplete="off">
          </label>
        </div>` : ''}

      <div id="noteList"></div>
    </div>`;

  const list = el.querySelector('#noteList');

  if (!visible.length) {
    list.innerHTML = `<section class="card">${emptyState({
      title: all.length ? 'Nothing matches' : 'No notes yet',
      message: all.length
        ? `No note contains "${query.trim()}".`
        : 'Anything worth remembering that is not a reading or a receipt — what the shop told you, how you acclimate, what you tried last time something went wrong.',
      action: all.length ? '' : '<button class="btn btn--primary" data-act="add">Write your first</button>',
    })}</section>`;
  } else {
    list.innerHTML = `<div class="stack">${visible.map((n) => noteCard(n, needle)).join('')}</div>`;
  }

  root.replaceChildren(el);
  wire(el, root);

  // Reopening the editor after a save keeps you where you were, since every
  // write re-renders the whole screen.
  if (openId) {
    const note = store.noteById(openId);
    openId = null;
    if (note) openNoteEditor(note);
  }
}

function noteCard(note, needle) {
  const body = previewBody(note);
  const stamp = note.updatedAt || note.createdAt;

  return `
    <section class="card notecard" data-open="${esc(note.id)}" tabindex="0" role="button"
             aria-label="Open note ${esc(displayTitle(note))}">
      <div class="card__body">
        <div class="row" style="align-items:baseline;gap:8px">
          <h3 class="notecard__title">${highlight(displayTitle(note), needle)}</h3>
          <div class="spacer"></div>
          <span class="muted nowrap" style="font-size:12px"
                title="${esc(stamp ? formatDateTime(stamp) : '')}">${esc(stamp ? formatRelative(stamp) : '')}</span>
        </div>
        ${body ? `<p class="notecard__body">${highlight(body, needle)}</p>` : ''}
        ${!body && !String(note.body || '').trim() ? '<p class="notecard__body muted">Empty note</p>' : ''}
      </div>
    </section>`;
}

/* --- Events --------------------------------------------------------------- */

function wire(el, root) {
  const search = el.querySelector('#noteSearch');
  if (search) {
    // Debounced because every keystroke re-renders the list, which blows away
    // the input; the caret is restored below.
    const run = debounce(() => {
      query = search.value;
      render(root);
      const next = document.querySelector('#noteSearch');
      if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
    }, 180);
    search.addEventListener('input', run);
  }

  el.addEventListener('click', (event) => {
    if (event.target.closest('[data-act="add"]')) { openNoteEditor(null); return; }

    const open = event.target.closest('[data-open]');
    if (open) openNoteEditor(store.noteById(open.dataset.open));
  });

  el.addEventListener('keydown', (event) => {
    const open = event.target.closest('[data-open]');
    if (!open) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openNoteEditor(store.noteById(open.dataset.open));
    }
  });
}

/* --- Editor --------------------------------------------------------------- */

function openNoteEditor(existing) {
  const isNew = !(existing && existing.id);
  const note = { title: '', body: '', ...(existing || {}) };
  const stamp = note.updatedAt || note.createdAt;

  const modal = openModal({
    title: isNew ? 'New note' : displayTitle(note),
    body: `
      <form id="noteForm" novalidate>
        <label class="field">
          <span>Title <span class="muted" style="font-weight:400">— optional</span></span>
          <input type="text" name="title" value="${esc(note.title)}" placeholder="Leave blank to use the first line">
        </label>
        <label class="field">
          <span class="visually-hidden">Note</span>
          <textarea name="body" class="notebody" placeholder="Write anything…">${esc(note.body)}</textarea>
        </label>
        ${stamp ? `<p class="field__hint">Last edited ${esc(formatDateTime(stamp))}</p>` : ''}
      </form>`,
    footer: `
      ${isNew ? '' : '<button class="btn btn--danger" data-act="delete">Delete</button>'}
      <span class="spacer"></span>
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn--primary" id="noteSave">${isNew ? 'Save note' : 'Save'}</button>`,
    onMount: (body) => {
      const field = body.querySelector('[name="body"]');
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    },
  });

  const form = modal.body.querySelector('#noteForm');

  modal.footer.querySelector('#noteSave').addEventListener('click', async () => {
    const values = formValues(form);
    const title = values.title.trim();
    const text = values.body.trim();

    if (!title && !text) { toast('Write something first.'); return; }

    const saved = await store.saveNote({ ...(existing || {}), title, body: text });
    openId = isNew ? null : saved.id;
    closeModal();
    toast(isNew ? 'Note saved' : 'Saved');
  });

  const del = modal.footer.querySelector('[data-act="delete"]');
  if (del) {
    del.addEventListener('click', async () => {
      closeModal();
      const ok = await confirmDialog({
        title: `Delete "${displayTitle(note)}"?`,
        message: 'The note is removed. This cannot be undone.',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok) { await store.deleteNote(note.id); toast('Note deleted'); }
    });
  }
}
