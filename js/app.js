/* Application shell: boot, hash router, chrome (nav, theme, tank picker). */

import * as store from './store.js';
import * as sync from './sync.js';
import * as charts from './charts.js';
import { $, $$, esc, toast } from './ui.js';

import * as dashboard from './views/dashboard.js';
import * as parameters from './views/parameters.js';
import * as maintenance from './views/maintenance.js';
import * as livestock from './views/livestock.js';
import * as gear from './views/gear.js';
import * as expenses from './views/expenses.js';
import * as settings from './views/settings.js';

const ROUTES = {
  dashboard: { view: dashboard, title: 'Dashboard' },
  parameters: { view: parameters, title: 'Parameters' },
  maintenance: { view: maintenance, title: 'Maintenance' },
  livestock: { view: livestock, title: 'Livestock' },
  gear: { view: gear, title: 'Gear' },
  expenses: { view: expenses, title: 'Expenses' },
  settings: { view: settings, title: 'Settings' },
};

const DEFAULT_ROUTE = 'dashboard';

let currentRoute = DEFAULT_ROUTE;

/* --- Routing -------------------------------------------------------------- */

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const name = (path || '').split('/')[0];
  return {
    route: Object.prototype.hasOwnProperty.call(ROUTES, name) ? name : DEFAULT_ROUTE,
    query: new URLSearchParams(query || ''),
  };
}

function renderRoute() {
  const view = $('#view');
  if (!view) return;

  charts.disposeAll();

  const entry = ROUTES[currentRoute];
  view.replaceChildren();

  try {
    entry.view.render(view);
  } catch (err) {
    console.error(`Failed to render "${currentRoute}"`, err);
    view.innerHTML = `
      <section class="card"><div class="card__body">
        <h2 style="margin-bottom:8px">Something went wrong on this screen</h2>
        <p class="muted" style="font-size:13.5px">${esc(err.message || String(err))}</p>
        <p class="muted" style="font-size:13.5px;margin-top:8px">Your data is safe. Try reloading the page.</p>
      </div></section>`;
  }

  for (const link of $$('[data-route]')) {
    link.classList.toggle('is-active', link.dataset.route === currentRoute);
  }

  document.title = currentRoute === 'dashboard' ? 'Reef Log' : `${ROUTES[currentRoute].title} · Reef Log`;
}

function onHashChange() {
  const { route, query } = parseHash();
  const changed = route !== currentRoute;
  currentRoute = route;

  closeDrawer();
  renderRoute();

  if (changed) {
    window.scrollTo(0, 0);
    $('#view').focus({ preventScroll: true });
  }

  // Home-screen shortcut: #/parameters?log=1 opens the log form straight away.
  if (query.get('log') === '1') {
    history.replaceState(null, '', `#/${route}`);
    parameters.openLogTest();
  }
}

/* --- Chrome --------------------------------------------------------------- */

function applyTheme() {
  const theme = store.settings().theme || 'system';
  const root = document.documentElement;

  if (theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = theme;

  const dark = theme === 'dark'
    || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0b141b' : '#0e2a3d');
}

function renderChrome() {
  const tank = store.activeTank();

  const nameEl = $('#tankName');
  const metaEl = $('#tankMeta');
  if (nameEl) nameEl.textContent = tank ? tank.name : 'Reef Log';
  if (metaEl) {
    const bits = [];
    if (tank && tank.volume) bits.push(`${tank.volume} ${tank.volumeUnit || 'gal'}`);
    if (tank && (tank.kind || tank.waterType)) bits.push(tank.kind || tank.waterType);
    metaEl.textContent = bits.join(' · ');
  }

  // Red pip on the Care tab whenever something is due or overdue.
  const dot = $('#dueDot');
  if (dot) {
    const due = store.tasks().filter((t) => {
      const s = maintenance.dueInfo(t).state;
      return s === 'overdue' || s === 'today';
    }).length;
    dot.hidden = due === 0;
    dot.title = due ? `${due} task${due === 1 ? '' : 's'} due` : '';
  }

  const select = $('#tankSelect');
  if (select) {
    const tanks = store.tanks();
    select.innerHTML = tanks
      .map((t) => `<option value="${esc(t.id)}" ${t.id === store.activeTankId() ? 'selected' : ''}>${esc(t.name)}</option>`)
      .join('');
    select.parentElement.hidden = tanks.length < 2;
  }
}

/** Header icon reflecting sync state; hidden entirely until sync is set up. */
function renderSyncDot(status) {
  const dot = $('#syncDot');
  if (!dot) return;

  if (status.state === 'off') { dot.hidden = true; return; }

  dot.hidden = false;
  dot.classList.toggle('is-syncing', status.state === 'syncing');
  dot.classList.toggle('is-offline', status.state === 'offline');
  dot.classList.toggle('is-error', status.state === 'error');

  const label = {
    'signed-out': 'Sync set up — sign in to start',
    idle: status.lastSyncAt ? 'Synced' : 'Sync ready',
    syncing: 'Syncing…',
    offline: 'Offline — will sync later',
    error: status.message || 'Sync problem',
  }[status.state] || 'Sync';

  dot.title = label;
  dot.setAttribute('aria-label', label);
}

function openDrawer() {
  $('#sidenav').classList.add('is-open');
  $('#scrim').hidden = false;
  $('#navToggle').setAttribute('aria-expanded', 'true');
}

function closeDrawer() {
  $('#sidenav').classList.remove('is-open');
  $('#scrim').hidden = true;
  $('#navToggle').setAttribute('aria-expanded', 'false');
}

function wireChrome() {
  $('#navToggle').addEventListener('click', () => {
    const open = $('#sidenav').classList.contains('is-open');
    if (open) closeDrawer(); else openDrawer();
  });

  $('#scrim').addEventListener('click', closeDrawer);

  $('#tankSelect').addEventListener('change', async (event) => {
    await store.saveSettings({ activeTankId: event.target.value });
    window.scrollTo(0, 0);
  });

  // These buttons live in the app chrome, outside any view.
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="log-test"]')) {
      event.preventDefault();
      closeDrawer();
      parameters.openLogTest();
      return;
    }
    if (event.target.closest('[data-action="open-nav"]')) {
      event.preventDefault();
      openDrawer();
    }
  });

  window.addEventListener('hashchange', onHashChange);

  // Follow the device theme live while set to "match my device".
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDrawer();
  });
}

/* --- Boot ----------------------------------------------------------------- */

function bootFailed(message, detail) {
  const boot = $('#boot');
  if (!boot) return;
  boot.dataset.failed = '1';
  boot.innerHTML = `
    <div class="boot__logo"></div>
    <p class="boot__err"><strong>${esc(message)}</strong></p>
    ${detail ? `<p class="boot__msg">${esc(detail)}</p>` : ''}`;
}

async function boot() {
  try {
    await store.init();
  } catch (err) {
    console.error('Boot failed', err);
    bootFailed(
      'Reef Log could not open its local database.',
      `${err.message || err} — private/incognito windows often block storage. Try a normal window.`,
    );
    return;
  }

  applyTheme();
  renderChrome();
  wireChrome();

  currentRoute = parseHash().route;

  $('#boot').hidden = true;
  $('#app').hidden = false;

  onHashChange();

  // Any data change re-renders the chrome and the current screen.
  store.subscribe(() => {
    applyTheme();
    renderChrome();
    renderRoute();
  });

  sync.onStatus(renderSyncDot);
  sync.init().catch((err) => console.warn('Sync unavailable', err));

  registerServiceWorker();
}

function showUpdateBar() {
  const bar = $('#updateBar');
  if (!bar || !bar.hidden) return;
  bar.hidden = false;
  $('#updateReload').addEventListener('click', () => location.reload(), { once: true });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // Skipping the worker on localhost keeps the dev loop free of stale caches.
  const host = location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
  if (isLocal || location.protocol === 'file:') return;

  window.addEventListener('load', async () => {
    let reg;
    try {
      reg = await navigator.serviceWorker.register('sw.js');
    } catch (err) {
      console.warn('Service worker registration failed', err);
      return;
    }

    // A worker already waiting means an update landed on an earlier visit and
    // the page is still running the old code.
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar();

    // The worker calls skipWaiting, so a new one claims this page while it is
    // still running the previous code. That hand-over is the surest sign an
    // update is live and a reload is worth offering.
    navigator.serviceWorker.addEventListener('controllerchange', showUpdateBar);

    reg.addEventListener('updatefound', () => {
      const incoming = reg.installing;
      if (!incoming) return;
      incoming.addEventListener('statechange', () => {
        // No controller means this is the very first install, not an update.
        if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBar();
        }
      });
    });

    // Installed copies can sit for days without the browser rechecking sw.js,
    // which is how a phone ends up showing an old build. Ask on every launch and
    // then hourly while the app stays open.
    const check = () => reg.update().catch(() => {});
    check();
    setInterval(check, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  });
}

window.addEventListener('error', (event) => {
  console.error('Uncaught error', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection', event.reason);
  const message = event.reason && event.reason.message;
  if (message) toast(message);
});

boot();
