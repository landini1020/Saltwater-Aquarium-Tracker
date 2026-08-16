/* Cloud sync against a Supabase project, over plain REST so the app keeps its
   no-dependency, no-build-step footing.

   Shape of the deal:
   - Credentials are entered by the user and live in IndexedDB on the device.
     Nothing is committed to the repo, which is public.
   - Sign-in uses an emailed six-digit code rather than a magic link. A link
     would open in the browser rather than the installed app, stranding the
     token in the wrong context.
   - Every record carries `updatedAt`; the newer side wins. Deletes travel as
     tombstones so a removal on one device does not come back from the other.
   - Everything keeps working offline; a failed sync just leaves the cursor
     where it was and tries again later. */

import * as db from './db.js';
import * as store from './store.js';

const META_KEY = 'sync';

/* Rewind the pull cursor a little each time. Two devices never agree exactly on
   the clock, and a record stamped slightly behind ours would otherwise slip
   past the "changed since" filter and never arrive. */
const CURSOR_OVERLAP_MS = 5 * 60 * 1000;

const PUSH_DEBOUNCE_MS = 3000;
const POLL_INTERVAL_MS = 5 * 60 * 1000;
const PAGE_SIZE = 500;

let config = null;
let status = { state: 'off', message: '', lastSyncAt: null, pending: 0 };
let applyingRemote = false;
let inFlight = null;
let pushTimer = null;

const listeners = new Set();

export function onStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setStatus(patch) {
  status = { ...status, ...patch };
  for (const fn of listeners) {
    try { fn(status); } catch (err) { console.error('Sync listener failed', err); }
  }
}

export const getStatus = () => status;
export const isConfigured = () => Boolean(config && config.url && config.anonKey);
export const isSignedIn = () => Boolean(config && config.session && config.session.refresh_token);
export const getEmail = () => (config && config.email) || '';

/* --- Config --------------------------------------------------------------- */

async function loadConfig() {
  const rows = await db.getAll('meta');
  config = rows.find((r) => r.key === META_KEY) || null;
  return config;
}

async function saveConfig(patch) {
  config = { ...(config || { key: META_KEY }), ...patch, key: META_KEY };
  await db.put('meta', config);
  return config;
}

export async function clearConfig() {
  await db.remove('meta', META_KEY);
  config = null;
  stopTimers();
  setStatus({ state: 'off', message: '', lastSyncAt: null, pending: 0 });
}

/** Store the project details. Rejects anything that is obviously not a project URL. */
export async function connect({ url, anonKey }) {
  const clean = String(url || '').trim().replace(/\/+$/, '');
  const key = String(anonKey || '').trim();

  if (!/^https:\/\/[^\s/]+$/i.test(clean)) {
    throw new Error('That does not look like a project URL. It should read https://something.supabase.co');
  }
  if (key.length < 30) {
    throw new Error('That anon key looks too short — copy the whole value.');
  }

  await saveConfig({ url: clean, anonKey: key });
  setStatus({ state: 'signed-out', message: '' });
  return config;
}

/* --- HTTP ----------------------------------------------------------------- */

async function api(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
  if (!isConfigured()) throw new Error('Sync is not set up on this device yet.');

  const init = {
    method,
    headers: {
      apikey: config.anonKey,
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  if (auth) {
    const token = await accessToken();
    init.headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${config.url}${path}`, init);

  if (!res.ok) {
    let detail = '';
    try {
      const payload = await res.json();
      detail = payload.msg || payload.message || payload.error_description || payload.error || '';
    } catch { /* body was not JSON */ }
    const err = new Error(detail || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** A valid access token, refreshing when it is close to expiry. */
async function accessToken() {
  const session = config && config.session;
  if (!session) throw new Error('Sign in to sync.');

  const expiresAt = Number(session.expires_at) || 0;
  if (session.access_token && Date.now() < expiresAt - 60_000) return session.access_token;

  const refreshed = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });

  if (!refreshed.ok) {
    await saveConfig({ session: null });
    setStatus({ state: 'signed-out', message: 'Session expired — sign in again.' });
    throw new Error('Your sync session expired. Sign in again.');
  }

  const data = await refreshed.json();
  await storeSession(data);
  return data.access_token;
}

async function storeSession(data) {
  await saveConfig({
    session: {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    },
    email: (data.user && data.user.email) || (config && config.email) || '',
  });
}

/* --- Auth ----------------------------------------------------------------- */

/** Ask Supabase to email a six-digit sign-in code. */
export async function requestCode(email) {
  const address = String(email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error('Enter a valid email address.');

  await api('/auth/v1/otp', {
    method: 'POST',
    auth: false,
    body: { email: address, create_user: true },
  });

  await saveConfig({ email: address });
  return address;
}

export async function verifyCode(email, code) {
  const token = String(code || '').trim();
  if (!/^\d{6}$/.test(token)) throw new Error('The code is six digits.');

  const data = await api('/auth/v1/verify', {
    method: 'POST',
    auth: false,
    body: { email: String(email || '').trim(), token, type: 'email' },
  });

  await storeSession(data);
  setStatus({ state: 'idle', message: '' });
  start();
  return syncNow({ full: true });
}

export async function signOut() {
  try {
    if (isSignedIn()) await api('/auth/v1/logout', { method: 'POST' });
  } catch { /* signing out locally matters more than telling the server */ }

  await saveConfig({ session: null, lastSyncAt: null });
  stopTimers();
  setStatus({ state: 'signed-out', message: '', lastSyncAt: null });
}

/* --- Sync ----------------------------------------------------------------- */

function cursor(full) {
  if (full) return null;
  const last = config && config.lastSyncAt;
  if (!last) return null;
  return new Date(new Date(last).getTime() - CURSOR_OVERLAP_MS).toISOString();
}

/** @returns {Set<string>} keys of records applied from the server this pass. */
async function pull(since) {
  const applied = new Set();
  let offset = 0;

  for (;;) {
    const filter = since ? `&updated_at=gt.${encodeURIComponent(since)}` : '';
    const rows = await api(
      `/rest/v1/reef_records?select=collection,record_id,data,updated_at${filter}` +
      `&order=updated_at.asc&limit=${PAGE_SIZE}&offset=${offset}`,
    );
    if (!rows || !rows.length) break;

    const keys = await store.mergeRemote(rows.map((r) => ({ collection: r.collection, row: r.data })));
    for (const k of keys) applied.add(k);

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return applied;
}

/**
 * @param {Set<string>} justPulled records the server already holds in exactly
 *        this form, so sending them back would be pure noise.
 */
async function push(since, justPulled) {
  const changes = store.changedSince(since)
    .filter(({ collection, row }) => !justPulled.has(`${collection}|${row.id}`));
  if (!changes.length) return 0;

  for (let i = 0; i < changes.length; i += PAGE_SIZE) {
    const batch = changes.slice(i, i + PAGE_SIZE).map(({ collection, row }) => ({
      collection,
      record_id: row.id,
      data: row,
      updated_at: row.updatedAt || new Date().toISOString(),
    }));

    await api('/rest/v1/reef_records', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: batch,
    });
  }
  return changes.length;
}

/**
 * Push local changes, then pull remote ones.
 * @param {{full?:boolean}} opts `full` ignores the cursor and reconciles everything.
 */
export async function syncNow({ full = false } = {}) {
  if (!isConfigured()) return { skipped: 'not-configured' };
  if (!isSignedIn()) { setStatus({ state: 'signed-out' }); return { skipped: 'signed-out' }; }

  if (inFlight) {
    // A partial sync already running does not satisfy a request to reconcile
    // everything, so wait for it and then do the full pass.
    if (!full) return inFlight;
    try { await inFlight; } catch { /* its failure is reported to its own caller */ }
  }

  inFlight = (async () => {
    setStatus({ state: 'syncing', message: '' });
    const startedAt = new Date().toISOString();

    try {
      const since = cursor(full);

      // Pull before push. The upsert is unconditional, so pushing first would
      // let this device's older copy overwrite a newer edit made elsewhere.
      // Pulling first resolves the conflict locally, and the push then carries
      // whichever version actually won.
      applyingRemote = true;
      let pulled;
      try {
        pulled = await pull(since);
      } finally {
        applyingRemote = false;
      }

      const pushed = await push(since, pulled);

      await saveConfig({ lastSyncAt: startedAt });
      setStatus({ state: 'idle', message: '', lastSyncAt: startedAt, pending: 0 });
      return { pushed, pulled: pulled.size };
    } catch (err) {
      // Only a genuine network failure counts as offline. Treating every
      // TypeError that way would quietly disguise real bugs as connectivity.
      const offline = !navigator.onLine
        || (err.name === 'TypeError' && /fetch|network|load failed/i.test(err.message || ''));
      setStatus({
        state: offline ? 'offline' : 'error',
        message: offline ? 'No connection — changes are saved here and will sync later.' : (err.message || String(err)),
      });
      return { error: err.message || String(err) };
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/* --- Triggers ------------------------------------------------------------- */

let pollTimer = null;
let unsubscribeStore = null;

function schedulePush() {
  // Remote merges emit a change of their own; syncing in response would loop.
  if (applyingRemote || !isSignedIn()) return;
  clearTimeout(pushTimer);
  setStatus({ pending: status.pending + 1 });
  pushTimer = setTimeout(() => syncNow(), PUSH_DEBOUNCE_MS);
}

function stopTimers() {
  clearTimeout(pushTimer);
  clearInterval(pollTimer);
  pollTimer = null;
  if (unsubscribeStore) { unsubscribeStore(); unsubscribeStore = null; }
}

/** Begin syncing on data changes, on returning to the app, and on a timer. */
export function start() {
  if (!isSignedIn()) return;
  stopTimers();

  unsubscribeStore = store.subscribe(schedulePush);
  pollTimer = setInterval(() => syncNow(), POLL_INTERVAL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });
  window.addEventListener('online', () => syncNow());
}

/** Called once at boot. Restores config and starts syncing if already signed in. */
export async function init() {
  await loadConfig();

  if (!isConfigured()) { setStatus({ state: 'off' }); return; }
  if (!isSignedIn()) { setStatus({ state: 'signed-out' }); return; }

  setStatus({ state: 'idle', lastSyncAt: (config && config.lastSyncAt) || null });
  start();
  syncNow();
}
