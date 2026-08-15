/* Settings: tank details, parameter tuning, display preferences, backup/restore. */

import * as store from '../store.js';
import * as P from '../params.js';
import * as charts from '../charts.js';
import {
  esc, openModal, closeModal, toast, confirmDialog, formValues, parseNumber,
  formatDate, todayISO, downloadFile,
} from '../ui.js';

const CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'NZD', 'JPY', 'SEK', 'ZAR'];

export function render(root) {
  charts.disposeAll();

  const tank = store.activeTank();
  const settings = store.settings();
  const allParams = P.sortParams(store.params());

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Settings</h2>
        <p>Tank details, target ranges and your data</p>
      </div>
    </div>

    <div class="stack">
      <section class="card">
        <div class="card__head">
          <h2>Tank</h2>
          <div class="spacer"></div>
          <button class="btn btn--sm" data-act="add-tank">Add tank</button>
        </div>
        <div class="card__body">
          ${tank ? tankForm(tank) : '<p class="muted">No tank yet.</p>'}
        </div>
      </section>

      <section class="card">
        <div class="card__head">
          <h2>Parameters</h2>
          <div class="spacer"></div>
          <button class="btn btn--sm" data-act="add-param">Add custom</button>
        </div>
        <div class="card__body card__body--flush">
          <div class="tablewrap">
            <table>
              <thead>
                <tr><th>Show</th><th>Parameter</th><th>Unit</th><th>Target range</th><th></th></tr>
              </thead>
              <tbody>
                ${allParams.map((p) => paramRow(p)).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card__head"><h2>Display</h2></div>
        <div class="card__body">
          <div class="field-row">
            <label class="field">
              <span>Theme</span>
              <select id="themeSelect">
                <option value="system" ${settings.theme === 'system' ? 'selected' : ''}>Match my device</option>
                <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Light</option>
                <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Dark</option>
              </select>
            </label>
            <label class="field">
              <span>Currency</span>
              <select id="currencySelect">
                ${CURRENCIES.map((c) => `<option value="${c}" ${settings.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </label>
          </div>
          <p class="field__hint">Parameters measured in more than one unit (salinity, temperature) use whichever unit you last typed a reading in. Change it any time from the Log Test form or by editing the parameter above.</p>
        </div>
      </section>

      <section class="card">
        <div class="card__head"><h2>Your data</h2></div>
        <div class="card__body">
          <p style="font-size:13.5px;color:var(--text-soft);margin-bottom:14px">
            Everything is stored locally in this browser — nothing is uploaded anywhere. Export a backup
            regularly, and use it to move your log onto another device.
          </p>
          <div class="row">
            <button class="btn" data-act="export">Export backup</button>
            <button class="btn" data-act="import">Import backup</button>
            <div class="spacer"></div>
            <button class="btn btn--danger" data-act="reset">Erase everything</button>
          </div>
          <input type="file" id="importFile" accept="application/json,.json" hidden>
          <p class="field__hint" style="margin-top:12px">
            ${dataSummary()}
          </p>
        </div>
      </section>

      <section class="card">
        <div class="card__head"><h2>Install on your phone</h2></div>
        <div class="card__body">
          <p style="font-size:13.5px;color:var(--text-soft)">
            Open this page in your phone's browser, then choose <b>Add to Home Screen</b>
            (Share menu on iPhone, the ⋮ menu on Android). It then opens full-screen like an app
            and works without a signal. Each device keeps its own log — use Export and Import above
            to copy data between them.
          </p>
        </div>
      </section>
    </div>`;

  root.replaceChildren(el);
  wire(el, root);
}

function dataSummary() {
  const counts = [
    `${store.readings().length} readings`,
    `${store.livestock().length} livestock entries`,
    `${store.expenses().length} expenses`,
  ];
  return `This tank holds ${counts.join(', ')}.`;
}

function tankForm(tank) {
  return `
    <form id="tankForm">
      <div class="field-row">
        <label class="field">
          <span>Name</span>
          <input type="text" name="name" value="${esc(tank.name)}" required>
        </label>
        <label class="field">
          <span>Volume</span>
          <div class="inputgroup">
            <input type="number" inputmode="decimal" min="0" step="0.1" name="volume" value="${esc(tank.volume)}">
            <select name="volumeUnit">
              <option value="gal" ${tank.volumeUnit === 'gal' ? 'selected' : ''}>gal</option>
              <option value="L" ${tank.volumeUnit === 'L' ? 'selected' : ''}>L</option>
            </select>
          </div>
        </label>
      </div>
      <div class="field-row">
        <label class="field">
          <span>Type</span>
          <input type="text" name="kind" value="${esc(tank.kind || '')}" placeholder="e.g. Mixed reef, FOWLR, SPS">
        </label>
        <label class="field">
          <span>Set up on</span>
          <input type="date" name="setupDate" value="${esc(tank.setupDate || todayISO())}">
        </label>
      </div>
      <label class="field">
        <span>Notes</span>
        <textarea name="notes" placeholder="Equipment, flow, lighting schedule…">${esc(tank.notes || '')}</textarea>
      </label>
      <div class="row">
        <button class="btn btn--primary" type="button" data-act="save-tank">Save tank</button>
        <div class="spacer"></div>
        ${store.tanks().length > 1 ? '<button class="btn btn--danger" type="button" data-act="delete-tank">Delete tank</button>' : ''}
      </div>
    </form>`;
}

function paramRow(p) {
  const unitId = store.displayUnit(p);
  const unit = P.unitOf(p, unitId);
  const enabled = p.enabled !== false;

  return `
    <tr>
      <td>
        <input type="checkbox" data-toggle="${esc(p.id)}" ${enabled ? 'checked' : ''}
               aria-label="Show ${esc(p.name)}" style="width:17px;height:17px;accent-color:var(--accent)">
      </td>
      <td>
        <span class="cellstate">
          <span class="dot" style="background:${esc(p.color)}"></span>
          <b style="${enabled ? '' : 'opacity:.55'}">${esc(p.name)}</b>
          ${p.builtIn ? '' : '<span class="badge badge--accent">custom</span>'}
        </span>
      </td>
      <td class="muted">${esc(unit.label || '—')}</td>
      <td class="muted">${esc(P.formatTarget(p, unitId) || 'none set')}</td>
      <td class="num nowrap">
        <button class="iconbtn" data-edit-param="${esc(p.id)}" aria-label="Edit ${esc(p.name)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4"/></svg>
        </button>
        ${p.builtIn ? '' : `<button class="iconbtn" data-del-param="${esc(p.id)}" aria-label="Delete ${esc(p.name)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
        </button>`}
      </td>
    </tr>`;
}

/* --- Events --------------------------------------------------------------- */

function wire(el, root) {
  el.addEventListener('click', async (event) => {
    const act = event.target.closest('[data-act]');
    if (act) {
      await handleAction(act.dataset.act, el, root);
      return;
    }

    const editParam = event.target.closest('[data-edit-param]');
    if (editParam) { openParamForm(store.paramById(editParam.dataset.editParam)); return; }

    const delParam = event.target.closest('[data-del-param]');
    if (delParam) {
      const p = store.paramById(delParam.dataset.delParam);
      if (!p) return;
      const n = store.readingsFor(p.id).length;
      const ok = await confirmDialog({
        title: `Delete ${p.name}?`,
        message: n
          ? `This also deletes ${n} reading${n === 1 ? '' : 's'} recorded for it. This cannot be undone.`
          : 'This custom parameter will be removed.',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok) { await store.deleteParam(p.id); toast('Parameter deleted'); }
    }
  });

  el.addEventListener('change', async (event) => {
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      const p = store.paramById(toggle.dataset.toggle);
      if (p) await store.saveParam({ ...p, enabled: toggle.checked });
      return;
    }

    if (event.target.id === 'themeSelect') {
      await store.saveSettings({ theme: event.target.value });
      return;
    }

    if (event.target.id === 'currencySelect') {
      await store.saveSettings({ currency: event.target.value });
      toast('Currency updated');
      return;
    }

    if (event.target.id === 'importFile') {
      await handleImportFile(event.target.files[0]);
    }
  });
}

async function handleAction(action, el, root) {
  switch (action) {
    case 'save-tank': {
      const values = formValues(el.querySelector('#tankForm'));
      if (!values.name.trim()) { toast('Give the tank a name.'); return; }
      await store.saveTank({
        ...store.activeTank(),
        name: values.name.trim(),
        volume: parseNumber(values.volume) ?? '',
        volumeUnit: values.volumeUnit,
        kind: values.kind.trim(),
        setupDate: values.setupDate,
        notes: values.notes.trim(),
      });
      toast('Tank saved');
      return;
    }

    case 'add-tank': {
      openTankForm();
      return;
    }

    case 'delete-tank': {
      const tank = store.activeTank();
      const ok = await confirmDialog({
        title: `Delete ${tank.name}?`,
        message: 'Every reading, livestock entry and expense for this tank will be deleted. This cannot be undone.',
        confirmLabel: 'Delete tank',
        danger: true,
      });
      if (ok) {
        await store.deleteTank(tank.id);
        toast('Tank deleted');
      }
      return;
    }

    case 'add-param': {
      openParamForm(null);
      return;
    }

    case 'export': {
      const payload = store.exportData();
      const stamp = todayISO();
      downloadFile(`reef-log-backup-${stamp}.json`, JSON.stringify(payload, null, 2));
      toast('Backup downloaded');
      return;
    }

    case 'import': {
      el.querySelector('#importFile').click();
      return;
    }

    case 'reset': {
      const ok = await confirmDialog({
        title: 'Erase everything?',
        message: 'All tanks, readings, livestock and expenses in this browser will be permanently deleted. Export a backup first if you might want any of it back.',
        confirmLabel: 'Erase everything',
        danger: true,
      });
      if (!ok) return;

      const reallyOk = await confirmDialog({
        title: 'Last chance',
        message: 'This really cannot be undone. Erase all Reef Log data on this device?',
        confirmLabel: 'Yes, erase it',
        danger: true,
      });
      if (reallyOk) {
        await store.resetAll();
        toast('All data erased');
      }
    }
  }
}

async function handleImportFile(file) {
  if (!file) return;

  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    toast('That file is not valid JSON.');
    return;
  }

  const counts = payload && payload.counts ? payload.counts : null;
  const detail = counts
    ? `It contains ${counts.readings || 0} readings, ${counts.livestock || 0} livestock entries and ${counts.expenses || 0} expenses.`
    : '';

  const ok = await confirmDialog({
    title: 'Replace all local data?',
    message: `Importing replaces everything currently stored in this browser with the contents of the backup. ${detail}`,
    confirmLabel: 'Import and replace',
    danger: true,
  });
  if (!ok) return;

  try {
    await store.importData(payload);
    toast('Backup imported');
  } catch (err) {
    toast(err.message || 'Could not import that file.');
  }
}

/* --- Tank form ------------------------------------------------------------ */

function openTankForm() {
  const modal = openModal({
    title: 'Add a tank',
    body: `
      <form id="newTankForm" novalidate>
        <label class="field">
          <span>Name</span>
          <input type="text" name="name" placeholder="e.g. Frag Tank" required>
        </label>
        <div class="field-row">
          <label class="field">
            <span>Volume</span>
            <div class="inputgroup">
              <input type="number" inputmode="decimal" min="0" step="0.1" name="volume" placeholder="125">
              <select name="volumeUnit"><option value="gal">gal</option><option value="L">L</option></select>
            </div>
          </label>
          <label class="field">
            <span>Set up on</span>
            <input type="date" name="setupDate" value="${esc(todayISO())}">
          </label>
        </div>
        <label class="field">
          <span>Type</span>
          <input type="text" name="kind" placeholder="e.g. Mixed reef">
        </label>
      </form>`,
    footer: `<button class="btn" data-close>Cancel</button>
             <button class="btn btn--primary" id="tankSave">Add tank</button>`,
  });

  modal.footer.querySelector('#tankSave').addEventListener('click', async () => {
    const values = formValues(modal.body.querySelector('#newTankForm'));
    if (!values.name.trim()) { toast('Give the tank a name.'); return; }

    const tank = await store.saveTank({
      name: values.name.trim(),
      volume: parseNumber(values.volume) ?? '',
      volumeUnit: values.volumeUnit,
      waterType: 'Saltwater',
      kind: values.kind.trim(),
      setupDate: values.setupDate || todayISO(),
      notes: '',
    });

    await store.saveSettings({ activeTankId: tank.id });
    closeModal();
    toast('Tank added');
  });
}

/* --- Parameter form ------------------------------------------------------- */

function openParamForm(existing) {
  const isNew = !existing;
  if (!isNew && !existing) return;

  const unitId = existing ? store.displayUnit(existing) : 'custom';
  const unit = existing ? P.unitOf(existing, unitId) : { label: '', decimals: 2, step: 0.01 };

  // Built-in ranges are stored in base units; show and accept them in the
  // unit the user actually reads, then convert back on save.
  const show = (v) => (Number.isFinite(v) ? P.roundTo(P.fromBase(unitId, v), unit.decimals) : '');

  const unitChoice = existing && existing.units.length > 1
    ? `<label class="field">
         <span>Preferred unit</span>
         <select name="unitId">
           ${existing.units.map((u) => `<option value="${esc(u.id)}" ${u.id === unitId ? 'selected' : ''}>${esc(u.label || u.id)}</option>`).join('')}
         </select>
         <span class="field__hint">Target values below are shown in this unit.</span>
       </label>`
    : '';

  const modal = openModal({
    title: isNew ? 'Add a custom parameter' : `Edit ${existing.name}`,
    body: `
      <form id="paramForm" novalidate>
        ${isNew || !existing.builtIn ? `
          <label class="field">
            <span>Name</span>
            <input type="text" name="name" value="${esc(existing ? existing.name : '')}" placeholder="e.g. Potassium" required>
          </label>
          <div class="field-row">
            <label class="field">
              <span>Unit label</span>
              <input type="text" name="unitLabel" value="${esc(existing ? unit.label : '')}" placeholder="ppm">
            </label>
            <label class="field">
              <span>Decimal places</span>
              <input type="number" min="0" max="4" step="1" name="decimals" value="${esc(existing ? unit.decimals : 2)}">
            </label>
          </div>` : `
          <p class="muted" style="font-size:13.5px;margin-bottom:14px">
            <b style="color:var(--text)">${esc(existing.name)}</b> is a built-in parameter. You can retune its
            ranges to suit your tank, or switch it off entirely from the list.
          </p>`}

        ${unitChoice}

        <p class="section-title">Target range <span style="font-weight:500;text-transform:none;letter-spacing:0">— shown green on charts</span></p>
        <div class="field-row">
          <label class="field">
            <span>Ideal low</span>
            <input type="number" inputmode="decimal" step="any" name="targetLow" value="${esc(existing ? show(existing.targetLow) : '')}">
          </label>
          <label class="field">
            <span>Ideal high</span>
            <input type="number" inputmode="decimal" step="any" name="targetHigh" value="${esc(existing ? show(existing.targetHigh) : '')}">
          </label>
        </div>

        <p class="section-title">Acceptable range <span style="font-weight:500;text-transform:none;letter-spacing:0">— outside this reads red</span></p>
        <div class="field-row">
          <label class="field">
            <span>Acceptable low</span>
            <input type="number" inputmode="decimal" step="any" name="softLow" value="${esc(existing ? show(existing.softLow) : '')}">
          </label>
          <label class="field">
            <span>Acceptable high</span>
            <input type="number" inputmode="decimal" step="any" name="softHigh" value="${esc(existing ? show(existing.softHigh) : '')}">
          </label>
        </div>

        <label class="field">
          <span>Chart colour</span>
          <input type="text" name="color" value="${esc(existing ? existing.color : '#5b6b7a')}" placeholder="#5b6b7a">
        </label>
      </form>`,
    footer: `
      ${existing && existing.builtIn ? '<button class="btn" id="paramReset">Reset to default</button><span class="spacer"></span>' : ''}
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn--primary" id="paramSave">Save</button>`,
  });

  const form = modal.body.querySelector('#paramForm');

  // Switching the preferred unit re-labels the target fields, so reopen the form.
  const unitSelect = form.querySelector('[name="unitId"]');
  if (unitSelect) {
    unitSelect.addEventListener('change', async () => {
      await store.saveSettings({
        displayUnits: { ...store.settings().displayUnits, [existing.id]: unitSelect.value },
      });
      closeModal();
      openParamForm(store.paramById(existing.id));
    });
  }

  const resetBtn = modal.footer.querySelector('#paramReset');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const fresh = P.DEFAULT_PARAMETERS.find((p) => p.id === existing.id);
      if (!fresh) return;
      await store.saveParam({ ...structuredClone(fresh), enabled: existing.enabled });
      closeModal();
      toast(`${fresh.name} reset to defaults`);
    });
  }

  modal.footer.querySelector('#paramSave').addEventListener('click', async () => {
    const values = formValues(form);

    const toStored = (raw) => {
      const n = parseNumber(raw);
      return n === null ? undefined : P.toBase(unitId, n);
    };

    const targetLow = toStored(values.targetLow);
    const targetHigh = toStored(values.targetHigh);
    const softLow = toStored(values.softLow);
    const softHigh = toStored(values.softHigh);

    if (Number.isFinite(targetLow) && Number.isFinite(targetHigh) && targetLow > targetHigh) {
      toast('The ideal low cannot be above the ideal high.');
      return;
    }
    if (Number.isFinite(softLow) && Number.isFinite(softHigh) && softLow > softHigh) {
      toast('The acceptable low cannot be above the acceptable high.');
      return;
    }

    if (existing && existing.builtIn) {
      await store.saveParam({ ...existing, targetLow, targetHigh, softLow, softHigh, color: values.color.trim() || existing.color });
      closeModal();
      toast('Ranges updated');
      return;
    }

    const name = (values.name || '').trim();
    if (!name) { toast('Give the parameter a name.'); return; }

    const decimals = Math.min(4, Math.max(0, Math.round(parseNumber(values.decimals) ?? 2)));

    if (isNew) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'param';
      const id = store.params().some((p) => p.id === slug) ? `${slug}-${store.uid().slice(0, 4)}` : slug;
      const maxOrder = Math.max(0, ...store.params().map((p) => p.order || 0));

      await store.saveParam(P.customParameter({
        id,
        name,
        unitLabel: values.unitLabel.trim(),
        decimals,
        targetLow, targetHigh, softLow, softHigh,
        color: values.color.trim() || '#5b6b7a',
        order: maxOrder + 10,
      }));
      closeModal();
      toast(`${name} added`);
      return;
    }

    await store.saveParam({
      ...existing,
      name,
      short: name.slice(0, 6),
      color: values.color.trim() || existing.color,
      units: [{ id: 'custom', label: values.unitLabel.trim(), decimals, step: Number((10 ** -decimals).toFixed(decimals)) }],
      targetLow, targetHigh, softLow, softHigh,
    });
    closeModal();
    toast('Parameter updated');
  });
}
