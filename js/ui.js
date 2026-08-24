/* Shared UI helpers: escaping, formatting, modals, toasts.
   Views build markup as template strings and rely on event delegation, so the
   escaping helpers here are load-bearing — always run user text through esc(). */

/* --- DOM ------------------------------------------------------------------ */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Escape text for interpolation into an HTML template string or attribute. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* --- Dates ---------------------------------------------------------------- */

const MS_DAY = 86400000;

/** Parse either a 'YYYY-MM-DD' date-only string (as local noon) or a full ISO timestamp. */
export function parseDate(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    // Local noon dodges the off-by-one that UTC midnight causes west of Greenwich.
    return new Date(y, m - 1, d, 12, 0, 0);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 'YYYY-MM-DD' for today, in local time. */
export function todayISO(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 'YYYY-MM-DDTHH:MM' for a datetime-local input, in local time. */
export function localDateTimeValue(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const fmtDateFull = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const fmtDateNoYear = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const fmtTimeShort = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export function formatDate(value) {
  const d = parseDate(value);
  return d ? fmtDateFull.format(d) : '—';
}

export function formatDateShort(value) {
  const d = parseDate(value);
  if (!d) return '—';
  return d.getFullYear() === new Date().getFullYear() ? fmtDateNoYear.format(d) : fmtDateFull.format(d);
}

export function formatDateTime(value) {
  const d = parseDate(value);
  return d ? `${fmtDateFull.format(d)}, ${fmtTimeShort.format(d)}` : '—';
}

/** Whole days between two dates, ignoring the time of day. */
export function daysBetween(from, to = new Date()) {
  const a = parseDate(from);
  const b = parseDate(to);
  if (!a || !b) return null;
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((midnight(b) - midnight(a)) / MS_DAY);
}

/** "today" / "yesterday" / "5 days ago" / "3 months ago". */
export function formatRelative(value) {
  const days = daysBetween(value);
  if (days === null) return '—';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 0) return days === -1 ? 'tomorrow' : `in ${Math.abs(days)} days`;
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return months === 1 ? '1 month ago' : `${months} months ago`;
  const years = Math.floor(days / 365.25);
  const rem = Math.floor((days - years * 365.25) / 30.44);
  if (rem === 0) return years === 1 ? '1 year ago' : `${years} years ago`;
  return `${years}y ${rem}m ago`;
}

/** Elapsed span as "2 yr 3 mo" / "5 mo" / "12 days" — used for time in tank. */
export function formatDuration(from, to = new Date()) {
  const days = daysBetween(from, to);
  if (days === null) return '—';
  if (days < 0) return 'not yet added';
  if (days === 0) return 'today';
  if (days === 1) return '1 day';
  if (days < 60) return `${days} days`;

  const a = parseDate(from);
  const b = parseDate(to);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  const years = Math.floor(months / 12);
  const rem = months % 12;

  if (years === 0) return `${months} mo`;
  if (rem === 0) return years === 1 ? '1 yr' : `${years} yr`;
  return `${years} yr ${rem} mo`;
}

/** 'YYYY-MM' bucket key for grouping by month. */
export function monthKey(value) {
  const d = parseDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key, withYear = true) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  // Full year, not 2-digit: "Aug 26" reads as a day of the month.
  return new Intl.DateTimeFormat(undefined, withYear ? { month: 'short', year: 'numeric' } : { month: 'short' }).format(d);
}

/* --- Numbers -------------------------------------------------------------- */

export function money(amount, currency = 'USD') {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

/** Compact money for tiles: $1,240 rather than $1,240.00 once past the hundreds. */
export function moneyShort(amount, currency = 'USD') {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const digits = Math.abs(n) >= 1000 ? 0 : 2;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(n);
  } catch {
    return `$${n.toFixed(digits)}`;
  }
}

export function plural(count, one, many) {
  return `${count} ${count === 1 ? one : (many || one + 's')}`;
}

/* --- Toast ---------------------------------------------------------------- */

let toastTimer = null;

export function toast(message, ms = 2600) {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-on'), ms);
}

/* --- Modal ---------------------------------------------------------------- */

let activeModal = null;

/**
 * Open the shared modal.
 * @param {{title:string, body:string|Node, footer?:string|Node, onMount?:Function, onClose?:Function}} opts
 * @returns {{close:Function, body:HTMLElement, footer:HTMLElement, panel:HTMLElement}}
 */
export function openModal({ title, body, footer = '', onMount, onClose }) {
  const host = document.getElementById('modalHost');
  const titleEl = document.getElementById('modalTitle');
  const bodyEl = document.getElementById('modalBody');
  const footEl = document.getElementById('modalFoot');
  const panel = host.querySelector('.modal__panel');

  if (activeModal) activeModal.close({ silent: true });

  titleEl.textContent = title;

  bodyEl.innerHTML = '';
  if (body instanceof Node) bodyEl.append(body);
  else bodyEl.innerHTML = body;

  footEl.innerHTML = '';
  if (footer instanceof Node) footEl.append(footer);
  else footEl.innerHTML = footer;
  footEl.hidden = !footer;

  const previouslyFocused = document.activeElement;
  host.hidden = false;
  document.body.style.overflow = 'hidden';

  function close(opts = {}) {
    if (activeModal !== api) return;
    activeModal = null;
    host.hidden = true;
    document.body.style.overflow = '';
    host.removeEventListener('click', onHostClick);
    document.removeEventListener('keydown', onKey, true);
    bodyEl.innerHTML = '';
    footEl.innerHTML = '';
    if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
    if (!opts.silent && onClose) onClose();
  }

  function onHostClick(event) {
    if (event.target.closest('[data-close]')) {
      event.preventDefault();
      close();
    }
  }

  function onKey(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    // Keep focus inside the dialog while it is open.
    const focusables = $$('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', panel)
      .filter((n) => n.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  host.addEventListener('click', onHostClick);
  document.addEventListener('keydown', onKey, true);

  const api = { close, body: bodyEl, footer: footEl, panel };
  activeModal = api;

  if (onMount) onMount(api);

  // Focus the first real field, but not on touch — it yanks up the keyboard.
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  if (!isTouch) {
    const first = panel.querySelector('input:not([type="hidden"]), select, textarea');
    if (first) first.focus();
  }

  return api;
}

export function closeModal() {
  if (activeModal) activeModal.close();
}

/** Promise-based confirmation dialog. Resolves true if confirmed. */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let decided = false;

    const modal = openModal({
      title,
      body: `<p style="font-size:14.5px;color:var(--text-soft)">${esc(message)}</p>`,
      footer: `
        <button class="btn" data-act="cancel">${esc(cancelLabel)}</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-act="ok">${esc(confirmLabel)}</button>
      `,
      onClose: () => { if (!decided) resolve(false); },
    });

    modal.footer.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-act]');
      if (!btn) return;
      decided = true;
      const ok = btn.dataset.act === 'ok';
      modal.close();
      resolve(ok);
    });
  });
}

/* --- Forms ---------------------------------------------------------------- */

/** Collect a form's named fields into a plain object (checkboxes become booleans). */
export function formValues(form) {
  const out = {};
  for (const field of form.elements) {
    if (!field.name) continue;
    if (field.type === 'checkbox') out[field.name] = field.checked;
    else if (field.type === 'radio') { if (field.checked) out[field.name] = field.value; }
    else out[field.name] = field.value;
  }
  return out;
}

/** Parse a user-entered number, returning null for blank or nonsense input. */
export function parseNumber(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/* --- Images --------------------------------------------------------------- */

/** Longest-edge presets. "Original" still caps at 4K — phone cameras exceed it. */
export const PHOTO_SIZES = {
  standard: { label: 'Standard — 1280 px', edge: 1280, quality: 0.82 },
  high: { label: 'High — 2048 px', edge: 2048, quality: 0.85 },
  original: { label: 'Maximum — 4K', edge: 3840, quality: 0.9 },
};

const THUMB_EDGE = 320;
const THUMB_QUALITY = 0.72;

function decode(file) {
  if (typeof createImageBitmap === 'function') {
    // Honour the EXIF orientation phones write, or landscape shots come out sideways.
    return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => decodeViaImg(file));
  }
  return decodeViaImg(file);
}

function decodeViaImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be read.')); };
    img.src = url;
  });
}

function draw(source, edge, quality, asDataUrl) {
  const w0 = source.width || source.naturalWidth;
  const h0 = source.height || source.naturalHeight;
  const scale = Math.min(1, edge / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);

  if (asDataUrl) return Promise.resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), width: w, height: h });
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve({ blob, width: w, height: h }), 'image/jpeg', quality);
  });
}

/**
 * Turn a camera or library file into a small thumbnail plus a downscaled full
 * image. A phone photo is several megabytes; stored as-is, a hundred of them
 * would dwarf the log and invite the browser to evict the lot.
 *
 * @returns {Promise<{thumb:string, blob:Blob, width:number, height:number, bytes:number}>}
 */
export async function processPhoto(file, sizeKey = 'high') {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    throw new Error('That file is not an image.');
  }

  const preset = PHOTO_SIZES[sizeKey] || PHOTO_SIZES.high;
  const source = await decode(file);

  try {
    const [full, thumb] = await Promise.all([
      draw(source, preset.edge, preset.quality, false),
      draw(source, THUMB_EDGE, THUMB_QUALITY, true),
    ]);

    if (!full.blob) throw new Error('That image could not be converted.');

    return {
      thumb: thumb.dataUrl,
      blob: full.blob,
      width: full.width,
      height: full.height,
      bytes: full.blob.size,
    };
  } finally {
    if (source.close) source.close();
  }
}

/* --- Misc ----------------------------------------------------------------- */

export function emptyState({ title, message, action = '' }) {
  return `
    <div class="empty">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12c4-6 11-6 15 0-4 6-11 6-15 0zM18 12l3-3v6l-3-3z"/></svg>
      <h3>${esc(title)}</h3>
      <p>${esc(message)}</p>
      ${action}
    </div>`;
}

export function downloadFile(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Hand a file to the user by the best route the device offers.
 *
 * On iOS a plain download link usually just opens the JSON in a tab, leaving
 * nothing saved. The share sheet instead offers "Save to Files", which can put
 * the backup in iCloud Drive — genuinely off the device, and free. Desktop
 * browsers fall back to a normal download.
 *
 * Must be called directly from a click: iOS only allows share() during a user
 * gesture, and any await beforehand forfeits it.
 *
 * @returns {Promise<'shared'|'cancelled'|'downloaded'>}
 */
export async function saveFile(filename, text, mime = 'application/json') {
  const file = new File([text], filename, { type: mime });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      // The user dismissing the sheet is a choice, not a failure.
      if (err && err.name === 'AbortError') return 'cancelled';
      // Anything else (unsupported target, permission) falls through to a download.
    }
  }

  downloadFile(filename, text, mime);
  return 'downloaded';
}
