/* In-memory domain store backed by IndexedDB.

   Everything is loaded once at boot and kept in memory, so views can read
   synchronously and render without async plumbing. Writes go to IndexedDB and
   then notify subscribers. A future cloud-sync mode would push/pull here and
   keep the same public surface. */

import * as db from './db.js';
import { DEFAULT_PARAMETERS } from './params.js';

/* Must match SEED_VERSION in seed-data.js. Kept here as well so a normal boot can
   decide whether seeding is needed without pulling in the (large) data module. */
const SEED_VERSION = 2;

/* --- Domain constants ----------------------------------------------------- */

export const LIVESTOCK_CATEGORIES = [
  { id: 'fish', label: 'Fish', plural: 'Fish', icon: '\u{1F420}' },
  { id: 'coral', label: 'Coral', plural: 'Corals', icon: '\u{1FAB8}' },
  { id: 'invert', label: 'Invertebrate', plural: 'Invertebrates', icon: '\u{1F990}' },
];

export const LIVESTOCK_STATUSES = [
  { id: 'alive', label: 'In tank' },
  { id: 'deceased', label: 'Deceased' },
  { id: 'sold', label: 'Sold / traded' },
  { id: 'moved', label: 'Moved to another tank' },
];

export const EXPENSE_CATEGORIES = [
  'Livestock',
  'Equipment',
  'Lighting',
  'Food',
  'Supplements & Additives',
  'Test Kits',
  'Salt & RO/DI',
  'Filtration Media',
  'Maintenance',
  'Other',
];

const DEFAULT_SETTINGS = {
  key: 'settings',
  activeTankId: null,
  theme: 'system',
  currency: 'USD',
  displayUnits: { salinity: 'sg', temperature: 'f' },
  seedVersion: 0,
  seededCollections: [],
  lastBackupAt: null,
  photoSize: 'high',
};

/* Nag for a backup once the newest one is older than this. */
export const BACKUP_STALE_DAYS = 21;

/* --- State ---------------------------------------------------------------- */

const state = {
  ready: false,
  tanks: [],
  params: [],
  readings: [],
  livestock: [],
  expenses: [],
  equipment: [],
  supplements: [],
  tasks: [],
  activities: [],
  settings: { ...DEFAULT_SETTINGS },
};

const listeners = new Set();

/** Subscribe to any data change. Returns an unsubscribe function. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn(); } catch (err) { console.error('Store listener failed', err); }
  }
}

/* --- Utilities ------------------------------------------------------------ */

export function uid() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/* --- Boot ----------------------------------------------------------------- */

export async function init() {
  const [tanks, params, readings, livestock, expenses, equipment, supplements, tasks, activities, meta] =
    await Promise.all([
      db.getAll('tanks'),
      db.getAll('params'),
      db.getAll('readings'),
      db.getAll('livestock'),
      db.getAll('expenses'),
      db.getAll('equipment'),
      db.getAll('supplements'),
      db.getAll('tasks'),
      db.getAll('activities'),
      db.getAll('meta'),
    ]);

  state.tanks = tanks;
  state.params = params;
  state.readings = readings;
  state.livestock = livestock;
  state.expenses = expenses;
  state.equipment = equipment;
  state.supplements = supplements;
  state.tasks = tasks;
  state.activities = activities;

  const saved = meta.find((m) => m.key === 'settings');
  state.settings = {
    ...DEFAULT_SETTINGS,
    ...(saved || {}),
    displayUnits: { ...DEFAULT_SETTINGS.displayUnits, ...((saved && saved.displayUnits) || {}) },
  };

  await purgeTombstones();
  await seed();

  state.ready = true;
  return state;
}

const COLLECTIONS = ['tanks', 'params', 'readings', 'livestock', 'expenses', 'equipment', 'supplements', 'tasks', 'activities'];

/**
 * Version 1.5.0 shipped cloud sync briefly, during which deleting a record only
 * flagged it `deleted` so the removal could reach other devices. Sync has since
 * been withdrawn and nothing reads that flag any more, so a flagged record would
 * resurface as a live entry. Clear any left behind, once.
 */
async function purgeTombstones() {
  for (const name of COLLECTIONS) {
    const dead = state[name].filter((r) => r.deleted);
    if (!dead.length) continue;
    await db.removeMany(name, dead.map((r) => r.id));
    state[name] = state[name].filter((r) => !r.deleted);
  }
}

/* Collections the shipped log can populate, and the export name each reads from. */
const SEEDABLE = [
  ['tanks', 'STARTER_TANK'],
  ['livestock', 'STARTER_LIVESTOCK'],
  ['expenses', 'STARTER_EXPENSES'],
  ['equipment', 'STARTER_EQUIPMENT'],
  ['supplements', 'STARTER_SUPPLEMENTS'],
  ['tasks', 'STARTER_TASKS'],
  ['activities', 'STARTER_ACTIVITIES'],
];

async function seed() {
  const writes = [];

  // Seeding is tracked per collection rather than by a single version number, so
  // a later release can add a new section to a browser that already holds the
  // log without disturbing what is there. A collection is filled only when it
  // has never been seeded AND is currently empty, which means neither imported
  // data nor a collection the user emptied on purpose is ever written over.
  const recorded = state.settings.seededCollections;
  const done = new Set(Array.isArray(recorded) ? recorded : []);

  // A collection that already holds anything counts as settled regardless of what
  // was recorded. That covers installs predating this bookkeeping and data
  // arrived at by import, and it stops a collection the user later empties from
  // being treated as never-seeded and refilled.
  for (const [name] of SEEDABLE) {
    if (state[name].length > 0) done.add(name);
  }

  const pending = SEEDABLE.filter(([name]) => !done.has(name));

  if (pending.length) {
    // Loaded on demand: the log is a sizeable module and a boot with nothing to
    // seed has no use for it.
    const data = await import('./seed-data.js');

    for (const [name, exportName] of pending) {
      const payload = data[exportName];
      if (!payload) continue;

      if (name === 'tanks') {
        // Any tank present here holds no records — typically the empty
        // placeholder from an earlier visit — so replacing it loses nothing.
        const stale = state.tanks.map((t) => t.id).filter((id) => id !== payload.id);
        if (stale.length) writes.push(db.removeMany('tanks', stale));

        state.tanks = [structuredClone(payload)];
        writes.push(db.put('tanks', state.tanks[0]));
        state.settings.activeTankId = payload.id;
      } else {
        state[name] = payload.map((row) => structuredClone(row));
        writes.push(db.putMany(name, state[name]));
      }
      done.add(name);
    }

    state.settings.seedVersion = SEED_VERSION;
  }

  state.settings.seededCollections = [...done];

  // Fallback: the starter log has been installed before and every tank has since
  // been deleted, so give the app something to attach records to.
  if (!state.tanks.length) {
    const tank = {
      id: uid(),
      name: 'Reef Tank',
      volume: 125,
      volumeUnit: 'gal',
      waterType: 'Saltwater',
      kind: 'Mixed reef',
      setupDate: todayISO(),
      notes: '',
      createdAt: new Date().toISOString(),
    };
    state.tanks.push(tank);
    writes.push(db.put('tanks', tank));
    state.settings.activeTankId = tank.id;
  }

  // Add any built-in parameters this install has never seen. Existing ones are
  // left alone so edited target ranges survive an app update.
  const known = new Set(state.params.map((p) => p.id));
  const missing = DEFAULT_PARAMETERS.filter((p) => !known.has(p.id)).map((p) => structuredClone(p));
  if (missing.length) {
    state.params.push(...missing);
    writes.push(db.putMany('params', missing));
  }

  if (!state.settings.activeTankId || !state.tanks.some((t) => t.id === state.settings.activeTankId)) {
    state.settings.activeTankId = state.tanks[0] ? state.tanks[0].id : null;
  }
  writes.push(db.put('meta', state.settings));

  await Promise.all(writes);
}

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* --- Accessors ------------------------------------------------------------ */

export const tanks = () => state.tanks;
export const params = () => state.params;
export const settings = () => state.settings;

export function activeTank() {
  return state.tanks.find((t) => t.id === state.settings.activeTankId) || state.tanks[0] || null;
}

export function activeTankId() {
  const t = activeTank();
  return t ? t.id : null;
}

export function paramById(id) {
  return state.params.find((p) => p.id === id) || null;
}

/** Display unit id chosen for a parameter, falling back to its default. */
export function displayUnit(param) {
  if (!param) return '';
  const chosen = state.settings.displayUnits[param.id];
  if (chosen && param.units.some((u) => u.id === chosen)) return chosen;
  return param.defaultUnit;
}

export function readings(tankId = activeTankId()) {
  return state.readings.filter((r) => r.tankId === tankId);
}

/** Readings for one parameter, oldest first. */
export function readingsFor(paramId, tankId = activeTankId()) {
  return state.readings
    .filter((r) => r.tankId === tankId && r.paramId === paramId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function latestReading(paramId, tankId = activeTankId()) {
  const rows = readingsFor(paramId, tankId);
  return rows.length ? rows[rows.length - 1] : null;
}

export function livestock(tankId = activeTankId()) {
  return state.livestock.filter((l) => l.tankId === tankId);
}

export function expenses(tankId = activeTankId()) {
  return state.expenses.filter((e) => e.tankId === tankId);
}

export function equipment(tankId = activeTankId()) {
  return state.equipment.filter((e) => e.tankId === tankId);
}

export function supplements(tankId = activeTankId()) {
  return state.supplements.filter((s) => s.tankId === tankId);
}

export function tasks(tankId = activeTankId()) {
  return state.tasks.filter((t) => t.tankId === tankId);
}

/** Activity history, newest first. */
export function activities(tankId = activeTankId()) {
  return state.activities
    .filter((a) => a.tankId === tankId)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

export function activitiesForTask(taskId, tankId = activeTankId()) {
  return activities(tankId).filter((a) => a.taskId === taskId);
}

/* --- Mutations ------------------------------------------------------------ */

export async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch, key: 'settings' };
  await db.put('meta', state.settings);
  emit();
  return state.settings;
}

export async function saveTank(tank) {
  const record = { ...tank };
  if (!record.id) {
    record.id = uid();
    record.createdAt = new Date().toISOString();
    state.tanks.push(record);
  } else {
    const i = state.tanks.findIndex((t) => t.id === record.id);
    if (i >= 0) state.tanks[i] = record; else state.tanks.push(record);
  }
  await db.put('tanks', record);
  emit();
  return record;
}

export async function deleteTank(tankId) {
  if (state.tanks.length <= 1) throw new Error('You need at least one tank.');

  const owned = ['readings', 'livestock', 'expenses', 'equipment', 'supplements', 'tasks', 'activities'];

  await Promise.all([
    db.remove('tanks', tankId),
    ...owned.map((name) => db.removeMany(name, state[name].filter((r) => r.tankId === tankId).map((r) => r.id))),
  ]);

  state.tanks = state.tanks.filter((t) => t.id !== tankId);
  for (const name of owned) {
    state[name] = state[name].filter((r) => r.tankId !== tankId);
  }

  if (state.settings.activeTankId === tankId) {
    await saveSettings({ activeTankId: state.tanks[0].id });
  } else {
    emit();
  }
}

export async function saveParam(param) {
  const record = { ...param };
  const i = state.params.findIndex((p) => p.id === record.id);
  if (i >= 0) state.params[i] = record; else state.params.push(record);
  await db.put('params', record);
  emit();
  return record;
}

export async function deleteParam(paramId) {
  const param = paramById(paramId);
  if (param && param.builtIn) throw new Error('Built-in parameters can be hidden but not deleted.');

  const readingIds = state.readings.filter((r) => r.paramId === paramId).map((r) => r.id);
  await Promise.all([db.remove('params', paramId), db.removeMany('readings', readingIds)]);
  state.params = state.params.filter((p) => p.id !== paramId);
  state.readings = state.readings.filter((r) => r.paramId !== paramId);
  emit();
}

/**
 * Record one test session: several parameters measured at the same moment.
 * @param {{date:string, note?:string, tankId?:string}} session
 * @param {Array<{paramId:string, value:number, unit:string}>} entries values already in base units
 */
export async function saveReadings(session, entries) {
  const tankId = session.tankId || activeTankId();
  const date = session.date;
  const batch = entries.map((e) => ({
    id: uid(),
    tankId,
    paramId: e.paramId,
    value: e.value,
    unit: e.unit,
    date,
    note: session.note || '',
    createdAt: new Date().toISOString(),
  }));

  if (!batch.length) return [];
  await db.putMany('readings', batch);
  state.readings.push(...batch);
  emit();
  return batch;
}

export async function saveReading(reading) {
  const record = { ...reading };
  if (!record.id) {
    record.id = uid();
    record.createdAt = new Date().toISOString();
    state.readings.push(record);
  } else {
    const i = state.readings.findIndex((r) => r.id === record.id);
    if (i >= 0) state.readings[i] = record; else state.readings.push(record);
  }
  await db.put('readings', record);
  emit();
  return record;
}

export async function deleteReading(id) {
  await db.remove('readings', id);
  state.readings = state.readings.filter((r) => r.id !== id);
  emit();
}

/** Delete every reading taken at one timestamp (i.e. one whole test session). */
export async function deleteReadingsAt(date, tankId = activeTankId()) {
  const ids = state.readings.filter((r) => r.tankId === tankId && r.date === date).map((r) => r.id);
  await db.removeMany('readings', ids);
  const kill = new Set(ids);
  state.readings = state.readings.filter((r) => !kill.has(r.id));
  emit();
}

export async function saveLivestock(item) {
  const record = { ...item };
  if (!record.tankId) record.tankId = activeTankId();
  if (!record.id) {
    record.id = uid();
    record.createdAt = new Date().toISOString();
    state.livestock.push(record);
  } else {
    const i = state.livestock.findIndex((l) => l.id === record.id);
    if (i >= 0) state.livestock[i] = record; else state.livestock.push(record);
  }
  await db.put('livestock', record);
  emit();
  return record;
}

export async function deleteLivestock(id) {
  // Drop the photo too, or its bytes linger with nothing pointing at them.
  await db.remove('photos', id).catch(() => {});
  await db.remove('livestock', id);
  state.livestock = state.livestock.filter((l) => l.id !== id);
  emit();
}

export async function saveExpense(expense) {
  const record = { ...expense };
  if (!record.tankId) record.tankId = activeTankId();
  if (!record.id) {
    record.id = uid();
    record.createdAt = new Date().toISOString();
    state.expenses.push(record);
  } else {
    const i = state.expenses.findIndex((e) => e.id === record.id);
    if (i >= 0) state.expenses[i] = record; else state.expenses.push(record);
  }
  await db.put('expenses', record);
  emit();
  return record;
}

export async function deleteExpense(id) {
  await db.remove('expenses', id);
  state.expenses = state.expenses.filter((e) => e.id !== id);
  emit();
}

/* Equipment, supplements, tasks and activities are plain records with no special
   handling, so they share one save/delete pair rather than four near-identical
   copies of the same code. */

function upsert(collection, record) {
  const row = { ...record };
  if (!row.tankId) row.tankId = activeTankId();

  if (!row.id) {
    row.id = uid();
    row.createdAt = new Date().toISOString();
    state[collection].push(row);
  } else {
    const i = state[collection].findIndex((r) => r.id === row.id);
    if (i >= 0) state[collection][i] = row; else state[collection].push(row);
  }

  return db.put(collection, row).then(() => { emit(); return row; });
}

function drop(collection, id) {
  return db.remove(collection, id).then(() => {
    state[collection] = state[collection].filter((r) => r.id !== id);
    emit();
  });
}

export const saveEquipment = (record) => upsert('equipment', record);
export const deleteEquipment = (id) => drop('equipment', id);

export const saveSupplement = (record) => upsert('supplements', record);
export const deleteSupplement = (id) => drop('supplements', id);

export const saveTask = (record) => upsert('tasks', record);
export const saveActivity = (record) => upsert('activities', record);
export const deleteActivity = (id) => drop('activities', id);

/** Deleting a task leaves its activity history in place as a record of the work. */
export async function deleteTask(id) {
  const orphans = state.activities.filter((a) => a.taskId === id);
  if (orphans.length) {
    const detached = orphans.map((a) => ({ ...a, taskId: null }));
    await db.putMany('activities', detached);
    for (const row of detached) {
      const i = state.activities.findIndex((a) => a.id === row.id);
      if (i >= 0) state.activities[i] = row;
    }
  }
  await drop('tasks', id);
}

/**
 * Log a task as done (or deliberately skipped) and roll its last-activity date
 * forward, which is what the next-due calculation reads.
 */
export async function logTaskActivity(taskId, { action = 'Performed', date, notes = '' } = {}) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error('That task no longer exists.');

  const when = date || todayISO();

  await upsert('activities', {
    taskId,
    taskName: task.name,
    action,
    date: when,
    notes,
  });

  // Only move the clock forward — back-filling an older entry should not make a
  // task look more recently done than it is.
  if (!task.lastActivity || when > task.lastActivity) {
    await upsert('tasks', { ...task, lastActivity: when });
  }

  return when;
}

/** Every store name a store has ever seen, for the store/vendor autocomplete. */
export function knownStores() {
  const names = new Set();
  for (const e of state.expenses) if (e.store) names.add(e.store.trim());
  for (const l of state.livestock) if (l.source) names.add(l.source.trim());
  names.delete('');
  return [...names].sort((a, b) => a.localeCompare(b));
}

/* --- Photos ---------------------------------------------------------------- */

/* A livestock record carries only `thumb`, a small data URL, so the list renders
   instantly and a backup still looks right after a restore. The full-size image
   is a Blob in its own store, keyed by the livestock id, and stays on the
   device — including it in the backup would push the file past what a phone can
   share. The originals remain in your photo library regardless. */

export async function savePhoto(livestockId, { thumb, blob, width, height, bytes }) {
  const item = state.livestock.find((l) => l.id === livestockId);
  if (!item) throw new Error('That livestock entry no longer exists.');

  await db.put('photos', {
    id: livestockId,
    blob,
    width,
    height,
    bytes,
    createdAt: new Date().toISOString(),
  });

  // The thumbnail rides along on the record so lists need no async lookup.
  return saveLivestock({ ...item, thumb, hasPhoto: true });
}

/** Full-size image Blob for one entry, or null if only a thumbnail exists. */
export async function loadPhoto(livestockId) {
  const rows = await db.getAll('photos');
  const hit = rows.find((r) => r.id === livestockId);
  return hit ? hit.blob : null;
}

export async function deletePhoto(livestockId) {
  const item = state.livestock.find((l) => l.id === livestockId);
  await db.remove('photos', livestockId);
  if (item) {
    const next = { ...item };
    delete next.thumb;
    delete next.hasPhoto;
    await saveLivestock(next);
  }
}

/** Count and total bytes of stored full-size photos, for the storage readout. */
export async function photoUsage() {
  const rows = await db.getAll('photos');
  return {
    count: rows.length,
    bytes: rows.reduce((n, r) => n + (Number(r.bytes) || (r.blob && r.blob.size) || 0), 0),
  };
}

/* --- Storage durability --------------------------------------------------- */

/**
 * Ask the browser to keep this data even under storage pressure.
 *
 * The log exists only on this device, so eviction means losing it. Browsers
 * grant persistence on their own criteria and may decline; the answer is
 * reported in Settings rather than assumed either way.
 *
 * @returns {Promise<{supported:boolean, persisted:boolean, usage?:number, quota?:number}>}
 */
export async function storageHealth({ request = false } = {}) {
  if (!navigator.storage || typeof navigator.storage.persisted !== 'function') {
    return { supported: false, persisted: false };
  }

  let persisted = false;
  try {
    persisted = await navigator.storage.persisted();
    if (!persisted && request && typeof navigator.storage.persist === 'function') {
      persisted = await navigator.storage.persist();
    }
  } catch {
    return { supported: false, persisted: false };
  }

  let usage;
  let quota;
  try {
    if (typeof navigator.storage.estimate === 'function') {
      ({ usage, quota } = await navigator.storage.estimate());
    }
  } catch { /* estimates are a nicety */ }

  return { supported: true, persisted, usage, quota };
}

/** Days since the last exported backup, or null if there has never been one. */
export function daysSinceBackup() {
  const last = state.settings.lastBackupAt;
  if (!last) return null;
  const ms = Date.now() - new Date(last).getTime();
  return Math.floor(ms / 86400000);
}

export function backupIsStale() {
  const days = daysSinceBackup();
  if (days === null) return true;
  return days >= BACKUP_STALE_DAYS;
}

export function markBackedUp() {
  return saveSettings({ lastBackupAt: new Date().toISOString() });
}

/* --- Backup / restore ----------------------------------------------------- */

export const EXPORT_FORMAT = 1;

export function exportData() {
  return {
    app: 'reef-log',
    formatVersion: EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    counts: {
      tanks: state.tanks.length,
      readings: state.readings.length,
      livestock: state.livestock.length,
      expenses: state.expenses.length,
      equipment: state.equipment.length,
      supplements: state.supplements.length,
      tasks: state.tasks.length,
      activities: state.activities.length,
    },
    data: {
      tanks: state.tanks,
      params: state.params,
      readings: state.readings,
      livestock: state.livestock,
      expenses: state.expenses,
      equipment: state.equipment,
      supplements: state.supplements,
      tasks: state.tasks,
      activities: state.activities,
      meta: [state.settings],
    },
  };
}

/**
 * Replace all local data with the contents of a backup file.
 * Throws with a readable message if the payload is not a Reef Log backup.
 */
export async function importData(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('That file is not valid JSON.');
  }
  if (payload.app !== 'reef-log' || !payload.data) {
    throw new Error('That does not look like a Reef Log backup file.');
  }
  if (payload.formatVersion > EXPORT_FORMAT) {
    throw new Error('That backup was made by a newer version of Reef Log. Update the app first.');
  }

  const d = payload.data;
  const required = ['tanks', 'params'];
  for (const key of required) {
    if (!Array.isArray(d[key])) throw new Error(`The backup is missing its "${key}" section.`);
  }
  if (!d.tanks.length) throw new Error('The backup contains no tanks.');

  await db.replaceAll({
    tanks: d.tanks,
    params: d.params,
    readings: d.readings || [],
    livestock: d.livestock || [],
    expenses: d.expenses || [],
    equipment: d.equipment || [],
    supplements: d.supplements || [],
    tasks: d.tasks || [],
    activities: d.activities || [],
    meta: d.meta || [],
  });

  await init();
  emit();
}

/** Wipe everything and re-seed a fresh tank. */
export async function resetAll() {
  await db.clearAll();
  state.tanks = [];
  state.params = [];
  state.readings = [];
  state.livestock = [];
  state.expenses = [];
  state.equipment = [];
  state.supplements = [];
  state.tasks = [];
  state.activities = [];
  state.settings = { ...DEFAULT_SETTINGS, seededCollections: [] };
  await seed();
  emit();
}
