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
};

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

  await seed();

  state.ready = true;
  return state;
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

      // Seeded rows need a change time like any other, so they can be pushed to
      // a sync backend that has never seen them.
      const withStamp = (row) => structuredClone({ ...row, updatedAt: row.updatedAt || row.createdAt });

      if (name === 'tanks') {
        // Any tank present here holds no records — typically the empty
        // placeholder from an earlier visit — so replacing it loses nothing.
        const stale = state.tanks.map((t) => t.id).filter((id) => id !== payload.id);
        if (stale.length) writes.push(db.removeMany('tanks', stale));

        state.tanks = [withStamp(payload)];
        writes.push(db.put('tanks', state.tanks[0]));
        state.settings.activeTankId = payload.id;
      } else {
        state[name] = payload.map(withStamp);
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
  const now = new Date().toISOString();
  const missing = DEFAULT_PARAMETERS
    .filter((p) => !known.has(p.id))
    .map((p) => structuredClone({ ...p, createdAt: now, updatedAt: now }));
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

export const tanks = () => state.tanks.filter(isLive);
export const params = () => state.params.filter(isLive);
export const settings = () => state.settings;

/** Raw contents including tombstones — for the sync engine only. */
export const allRecords = (collection) => state[collection];

export function activeTank() {
  const live = tanks();
  return live.find((t) => t.id === state.settings.activeTankId) || live[0] || null;
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

/* Deleted records are kept as tombstones so the removal can travel to other
   devices; every read path has to skip them. */
const isLive = (r) => !r.deleted;

function liveIn(collection, tankId) {
  return state[collection].filter((r) => isLive(r) && r.tankId === tankId);
}

export function readings(tankId = activeTankId()) {
  return liveIn('readings', tankId);
}

/** Readings for one parameter, oldest first. */
export function readingsFor(paramId, tankId = activeTankId()) {
  return liveIn('readings', tankId)
    .filter((r) => r.paramId === paramId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function latestReading(paramId, tankId = activeTankId()) {
  const rows = readingsFor(paramId, tankId);
  return rows.length ? rows[rows.length - 1] : null;
}

export function livestock(tankId = activeTankId()) {
  return liveIn('livestock', tankId);
}

export function expenses(tankId = activeTankId()) {
  return liveIn('expenses', tankId);
}

export function equipment(tankId = activeTankId()) {
  return liveIn('equipment', tankId);
}

export function supplements(tankId = activeTankId()) {
  return liveIn('supplements', tankId);
}

export function tasks(tankId = activeTankId()) {
  return liveIn('tasks', tankId);
}

/** Activity history, newest first. */
export function activities(tankId = activeTankId()) {
  return liveIn('activities', tankId)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

export function activitiesForTask(taskId, tankId = activeTankId()) {
  return activities(tankId).filter((a) => a.taskId === taskId);
}

/* --- Mutations ------------------------------------------------------------ */

/* Every write funnels through upsert/tombstone so that `updatedAt` — the field
   the sync engine compares — can never be forgotten on one code path. */

function stamp(row) {
  return { ...row, updatedAt: new Date().toISOString() };
}

/** Insert or replace a record, stamping the change time. */
function upsert(collection, record) {
  const row = stamp(record);
  if (!row.id) {
    row.id = uid();
    row.createdAt = row.updatedAt;
  }

  const i = state[collection].findIndex((r) => r.id === row.id);
  if (i >= 0) state[collection][i] = row; else state[collection].push(row);

  return db.put(collection, row).then(() => { emit(); return row; });
}

/**
 * Soft-delete: the record stays as a tombstone so the removal reaches other
 * devices. Nothing reads tombstones except the sync engine.
 */
function tombstone(collection, id) {
  const existing = state[collection].find((r) => r.id === id);
  if (!existing) return Promise.resolve();

  const row = stamp({ ...existing, deleted: true });
  const i = state[collection].findIndex((r) => r.id === id);
  state[collection][i] = row;

  return db.put(collection, row).then(() => { emit(); });
}

function tombstoneMany(collection, ids) {
  const set = new Set(ids);
  const rows = state[collection].filter((r) => set.has(r.id)).map((r) => stamp({ ...r, deleted: true }));
  if (!rows.length) return Promise.resolve();

  for (const row of rows) {
    const i = state[collection].findIndex((r) => r.id === row.id);
    state[collection][i] = row;
  }
  return db.putMany(collection, rows).then(() => { emit(); });
}

export async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch, key: 'settings' };
  await db.put('meta', state.settings);
  emit();
  return state.settings;
}

export function saveTank(tank) {
  return upsert('tanks', tank);
}

export async function deleteTank(tankId) {
  if (tanks().length <= 1) throw new Error('You need at least one tank.');

  const owned = ['readings', 'livestock', 'expenses', 'equipment', 'supplements', 'tasks', 'activities'];

  await tombstone('tanks', tankId);
  for (const name of owned) {
    await tombstoneMany(name, liveIn(name, tankId).map((r) => r.id));
  }

  if (state.settings.activeTankId === tankId) {
    await saveSettings({ activeTankId: tanks()[0].id });
  } else {
    emit();
  }
}

export function saveParam(param) {
  return upsert('params', param);
}

export async function deleteParam(paramId) {
  const param = paramById(paramId);
  if (param && param.builtIn) throw new Error('Built-in parameters can be hidden but not deleted.');

  await tombstoneMany('readings', state.readings.filter((r) => isLive(r) && r.paramId === paramId).map((r) => r.id));
  await tombstone('params', paramId);
}

/**
 * Record one test session: several parameters measured at the same moment.
 * @param {{date:string, note?:string, tankId?:string}} session
 * @param {Array<{paramId:string, value:number, unit:string}>} entries values already in base units
 */
export async function saveReadings(session, entries) {
  const tankId = session.tankId || activeTankId();
  const now = new Date().toISOString();

  const batch = entries.map((e) => ({
    id: uid(),
    tankId,
    paramId: e.paramId,
    value: e.value,
    unit: e.unit,
    date: session.date,
    note: session.note || '',
    createdAt: now,
    updatedAt: now,
  }));

  if (!batch.length) return [];
  await db.putMany('readings', batch);
  state.readings.push(...batch);
  emit();
  return batch;
}

export function saveReading(reading) {
  return upsert('readings', reading);
}

export function deleteReading(id) {
  return tombstone('readings', id);
}

/** Delete every reading taken at one timestamp (i.e. one whole test session). */
export function deleteReadingsAt(date, tankId = activeTankId()) {
  const ids = liveIn('readings', tankId).filter((r) => r.date === date).map((r) => r.id);
  return tombstoneMany('readings', ids);
}

export function saveLivestock(item) {
  return upsert('livestock', { tankId: activeTankId(), ...item });
}

export function deleteLivestock(id) {
  return tombstone('livestock', id);
}

export function saveExpense(expense) {
  return upsert('expenses', { tankId: activeTankId(), ...expense });
}

export function deleteExpense(id) {
  return tombstone('expenses', id);
}

const scoped = (record) => ({ tankId: activeTankId(), ...record });

export const saveEquipment = (record) => upsert('equipment', scoped(record));
export const deleteEquipment = (id) => tombstone('equipment', id);

export const saveSupplement = (record) => upsert('supplements', scoped(record));
export const deleteSupplement = (id) => tombstone('supplements', id);

export const saveTask = (record) => upsert('tasks', scoped(record));
export const saveActivity = (record) => upsert('activities', scoped(record));
export const deleteActivity = (id) => tombstone('activities', id);

/** Deleting a task leaves its activity history in place as a record of the work. */
export async function deleteTask(id) {
  for (const activity of state.activities.filter((a) => isLive(a) && a.taskId === id)) {
    await upsert('activities', { ...activity, taskId: null });
  }
  await tombstone('tasks', id);
}

/**
 * Log a task as done (or deliberately skipped) and roll its last-activity date
 * forward, which is what the next-due calculation reads.
 */
export async function logTaskActivity(taskId, { action = 'Performed', date, notes = '' } = {}) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error('That task no longer exists.');

  const when = date || todayISO();

  await saveActivity({
    taskId,
    taskName: task.name,
    action,
    date: when,
    notes,
  });

  // Only move the clock forward — back-filling an older entry should not make a
  // task look more recently done than it is.
  if (!task.lastActivity || when > task.lastActivity) {
    await saveTask({ ...task, lastActivity: when });
  }

  return when;
}

/** Every store name a store has ever seen, for the store/vendor autocomplete. */
export function knownStores() {
  const names = new Set();
  for (const e of state.expenses) if (isLive(e) && e.store) names.add(e.store.trim());
  for (const l of state.livestock) if (isLive(l) && l.source) names.add(l.source.trim());
  names.delete('');
  return [...names].sort((a, b) => a.localeCompare(b));
}

/* --- Sync support --------------------------------------------------------- */

/** Collections that travel between devices. Settings stay per-device. */
export const SYNCED = ['tanks', 'params', 'readings', 'livestock', 'expenses', 'equipment', 'supplements', 'tasks', 'activities'];

/** Records changed at or after `since` (an ISO string), across every collection. */
export function changedSince(since) {
  const out = [];
  for (const collection of SYNCED) {
    for (const row of state[collection]) {
      if (!since || !row.updatedAt || row.updatedAt > since) {
        out.push({ collection, row });
      }
    }
  }
  return out;
}

/**
 * Merge records arriving from another device. Last write wins on `updatedAt`,
 * so a local edit made after the remote one is kept rather than clobbered.
 * @returns {string[]} keys ("collection|id") of the records actually applied,
 *          which the caller uses to avoid echoing them straight back.
 */
export async function mergeRemote(incoming) {
  const byCollection = new Map();

  for (const { collection, row } of incoming) {
    if (!SYNCED.includes(collection) || !row || !row.id) continue;

    const existing = state[collection].find((r) => r.id === row.id);
    if (existing && existing.updatedAt && row.updatedAt && existing.updatedAt >= row.updatedAt) continue;

    if (!byCollection.has(collection)) byCollection.set(collection, []);
    byCollection.get(collection).push(row);
  }

  const applied = [];
  for (const [collection, rows] of byCollection) {
    await db.putMany(collection, rows);
    for (const row of rows) {
      const i = state[collection].findIndex((r) => r.id === row.id);
      if (i >= 0) state[collection][i] = row; else state[collection].push(row);
      applied.push(`${collection}|${row.id}`);
    }
  }

  if (applied.length) {
    // A tank arriving from another device may be the only one this device knows.
    if (!activeTank() && tanks().length) state.settings.activeTankId = tanks()[0].id;
    emit();
  }
  return applied;
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
