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
};

/* --- State ---------------------------------------------------------------- */

const state = {
  ready: false,
  tanks: [],
  params: [],
  readings: [],
  livestock: [],
  expenses: [],
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
  const [tanks, params, readings, livestock, expenses, meta] = await Promise.all([
    db.getAll('tanks'),
    db.getAll('params'),
    db.getAll('readings'),
    db.getAll('livestock'),
    db.getAll('expenses'),
    db.getAll('meta'),
  ]);

  state.tanks = tanks;
  state.params = params;
  state.readings = readings;
  state.livestock = livestock;
  state.expenses = expenses;

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

async function seed() {
  const writes = [];

  // Install the existing tank log the first time the app runs in a browser.
  // Guarded on there being no readings, livestock or expenses at all, so it can
  // never overwrite anything actually logged; and on seedVersion, so it does not
  // reappear after the starter entries have been deliberately deleted.
  const hasUserData = state.readings.length > 0 || state.livestock.length > 0 || state.expenses.length > 0;
  const alreadySeeded = (state.settings.seedVersion || 0) >= SEED_VERSION;

  if (!hasUserData && !alreadySeeded) {
    // Loaded on demand: the log is a sizeable module and every boot after the
    // first has no use for it.
    const { STARTER_TANK, STARTER_LIVESTOCK, STARTER_EXPENSES } = await import('./seed-data.js');

    // Any tank present at this point holds no records — typically the empty
    // placeholder from an earlier visit — so replacing it loses nothing.
    const stale = state.tanks.map((t) => t.id).filter((id) => id !== STARTER_TANK.id);
    if (stale.length) writes.push(db.removeMany('tanks', stale));

    state.tanks = [structuredClone(STARTER_TANK)];
    state.livestock = STARTER_LIVESTOCK.map((l) => structuredClone(l));
    state.expenses = STARTER_EXPENSES.map((e) => structuredClone(e));

    writes.push(db.put('tanks', state.tanks[0]));
    writes.push(db.putMany('livestock', state.livestock));
    writes.push(db.putMany('expenses', state.expenses));

    state.settings.activeTankId = STARTER_TANK.id;
    state.settings.seedVersion = SEED_VERSION;
  }

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

  const kill = (rows) => rows.filter((r) => r.tankId === tankId).map((r) => r.id);
  const readingIds = kill(state.readings);
  const livestockIds = kill(state.livestock);
  const expenseIds = kill(state.expenses);

  await Promise.all([
    db.remove('tanks', tankId),
    db.removeMany('readings', readingIds),
    db.removeMany('livestock', livestockIds),
    db.removeMany('expenses', expenseIds),
  ]);

  state.tanks = state.tanks.filter((t) => t.id !== tankId);
  state.readings = state.readings.filter((r) => r.tankId !== tankId);
  state.livestock = state.livestock.filter((r) => r.tankId !== tankId);
  state.expenses = state.expenses.filter((r) => r.tankId !== tankId);

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

/** Every store name a store has ever seen, for the store/vendor autocomplete. */
export function knownStores() {
  const names = new Set();
  for (const e of state.expenses) if (e.store) names.add(e.store.trim());
  for (const l of state.livestock) if (l.source) names.add(l.source.trim());
  names.delete('');
  return [...names].sort((a, b) => a.localeCompare(b));
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
    },
    data: {
      tanks: state.tanks,
      params: state.params,
      readings: state.readings,
      livestock: state.livestock,
      expenses: state.expenses,
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
  state.settings = { ...DEFAULT_SETTINGS };
  await seed();
  emit();
}
