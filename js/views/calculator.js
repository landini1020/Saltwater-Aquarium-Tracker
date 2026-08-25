/* Dosing calculator: how much of a supplement raises a parameter to target.

   The chemistry is worked from molar masses rather than lookup tables, so the
   numbers can be checked. Alkalinity is handled in milliequivalents, the unit
   the reaction actually happens in; calcium and magnesium by elemental mass.

   Unlike a standalone calculator this one knows the tank: volume, the latest
   reading and the target range are all filled in from the log, and a dose can
   be recorded to the maintenance history in one tap. */

import * as store from '../store.js';
import * as P from '../params.js';
import * as charts from '../charts.js';
import {
  esc, toast, parseNumber, formValues, formatRelative, plural, todayISO,
} from '../ui.js';

const L_PER_GAL = 3.785411784;

/* 1 dKH = 0.357 meq/L, the standard conversion between the German hardness
   scale and equivalents. */
const MEQ_PER_DKH = 0.357;

/* Molar masses (g/mol). */
const M = {
  NaHCO3: 84.007,
  Na2CO3: 105.988,
  Ca: 40.078,
  CaCl2: 110.984,
  CaCl2_2H2O: 147.014,
  Mg: 24.305,
  MgCl2_6H2O: 203.303,
  MgSO4_7H2O: 246.475,
};

/* Bulk densities (g/mL) for the spoon estimates. These vary a lot with grade
   and packing, which is why weight is given first and spoons are labelled
   approximate. */
const TSP_ML = 4.92892;

const ALK_PRODUCTS = [
  {
    id: 'bicarb',
    name: 'Sodium bicarbonate (baking soda)',
    // One mole of bicarbonate supplies one equivalent.
    gPerMeq: M.NaHCO3 / 1000,
    density: 0.95,
    note: 'Barely moves pH, so it is the safer choice when pH is already fine.',
  },
  {
    id: 'sodaash',
    name: 'Sodium carbonate (soda ash)',
    // Carbonate supplies two equivalents per mole, so half the mass.
    gPerMeq: M.Na2CO3 / 2 / 1000,
    density: 1.0,
    note: 'Raises pH as well as alkalinity. Add slowly into strong flow.',
  },
  {
    id: 'bakedbicarb',
    name: 'Baked baking soda (converted to carbonate)',
    gPerMeq: M.Na2CO3 / 2 / 1000,
    density: 1.0,
    note: 'Baking soda held at about 300 °F for an hour becomes soda ash.',
  },
];

const CA_PRODUCTS = [
  { id: 'cacl2', name: 'Calcium chloride, anhydrous', gPerGCa: M.CaCl2 / M.Ca, density: 0.9,
    note: 'Absorbs water from the air; keep the tub sealed.' },
  { id: 'cacl2d', name: 'Calcium chloride dihydrate', gPerGCa: M.CaCl2_2H2O / M.Ca, density: 0.9,
    note: 'The flake form sold for de-icing and in most two-part kits.' },
];

const MG_PRODUCTS = [
  { id: 'mgcl2', name: 'Magnesium chloride hexahydrate', gPerGMg: M.MgCl2_6H2O / M.Mg, density: 0.9,
    note: 'Raises magnesium and chloride.' },
  { id: 'mgso4', name: 'Epsom salt (magnesium sulfate)', gPerGMg: M.MgSO4_7H2O / M.Mg, density: 0.9,
    note: 'Raises magnesium and sulfate. Not for the whole dose on its own.' },
  {
    id: 'blend',
    name: 'Blend — 5 parts magnesium chloride to 1 part Epsom',
    // Mg per gram of blend, weighted by mass, then inverted.
    gPerGMg: 1 / ((5 * (M.Mg / M.MgCl2_6H2O) + 1 * (M.Mg / M.MgSO4_7H2O)) / 6),
    density: 0.9,
    note: 'Keeps the chloride to sulfate ratio closer to natural seawater.',
  },
];

/* Comfortable daily maxima. Coral tolerates a steady number far better than a
   correct one arrived at quickly, so a large correction is split over days. */
const DAILY_MAX = {
  alkalinity: { amount: 1.4, unit: 'dKH' },
  calcium: { amount: 50, unit: 'ppm' },
  magnesium: { amount: 100, unit: 'ppm' },
};

const TABS = [
  { id: 'alkalinity', label: 'Alkalinity' },
  { id: 'calcium', label: 'Calcium' },
  { id: 'magnesium', label: 'Magnesium' },
  { id: 'salinity', label: 'Salinity' },
  { id: 'waterchange', label: 'Water change' },
];

let tab = 'alkalinity';
let volumeOverride = null;   // litres; null means derive from the tank

/* --- Helpers -------------------------------------------------------------- */

/** Tank volume in litres, honouring the unit the tank is recorded in. */
function tankLitres() {
  const tank = store.activeTank();
  if (!tank || !Number.isFinite(Number(tank.volume))) return null;
  const v = Number(tank.volume);
  return (tank.volumeUnit === 'L') ? v : v * L_PER_GAL;
}

function workingLitres() {
  if (volumeOverride !== null) return volumeOverride;
  const raw = tankLitres();
  if (raw === null) return null;
  // Rock and sand displace water; 90% of the tank's rated volume is the usual
  // starting guess for a reef until the real figure is measured.
  return raw * 0.9;
}

/** Latest reading for a parameter, in the unit it is displayed in. */
function latestDisplay(paramId) {
  const param = store.paramById(paramId);
  if (!param) return null;
  const reading = store.latestReading(paramId);
  if (!reading) return null;
  return {
    value: P.fromBase(store.displayUnit(param), reading.value),
    date: reading.date,
    unit: P.unitOf(param, store.displayUnit(param)),
    param,
  };
}

function targetMidpoint(paramId) {
  const param = store.paramById(paramId);
  if (!param || !Number.isFinite(param.targetLow) || !Number.isFinite(param.targetHigh)) return null;
  const mid = (param.targetLow + param.targetHigh) / 2;
  return P.fromBase(store.displayUnit(param), mid);
}

function grams(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1) return `${n.toFixed(2)} g`;
  if (n < 20) return `${n.toFixed(1)} g`;
  return `${Math.round(n)} g`;
}

/** Rough spoon equivalent. Bulk density varies, so this is guidance only. */
function spoons(gramsValue, density) {
  if (!Number.isFinite(gramsValue) || gramsValue <= 0) return '';
  const ml = gramsValue / density;
  const tsp = ml / TSP_ML;
  if (tsp < 0.25) return 'less than ¼ tsp';
  if (tsp < 3) return `about ${round(tsp, 0.25)} tsp`;
  const tbsp = tsp / 3;
  return `about ${round(tbsp, 0.25)} tbsp`;
}

function round(n, step) {
  const r = Math.round(n / step) * step;
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
}

/* --- Render --------------------------------------------------------------- */

export function render(root) {
  charts.disposeAll();

  const litres = workingLitres();
  const tank = store.activeTank();

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Dosing calculator</h2>
        <p>How much to add, worked out for this tank</p>
      </div>
    </div>

    <div class="stack">
      <section class="card">
        <div class="card__body">
          <label class="field" style="margin-bottom:6px">
            <span>Actual water volume</span>
            <div class="inputgroup">
              <input type="number" inputmode="decimal" min="1" step="1" id="volInput"
                     value="${litres === null ? '' : esc(Math.round(litres / L_PER_GAL))}">
              <select id="volUnit">
                <option value="gal">gal</option>
                <option value="L">L</option>
              </select>
            </div>
            <span class="field__hint">
              ${tank && tank.volume
                ? `Starting from ${esc(tank.volume)} ${esc(tank.volumeUnit || 'gal')} less 10% for rock and sand.`
                : 'Set the tank volume in Settings to have this filled in.'}
              Dosing follows the water actually in the system, not the tank's rated size,
              so correct this if you know the real figure.
            </span>
          </label>
        </div>
      </section>

      <div class="segscroll">
        <div class="seg" role="group" aria-label="Calculation">
          ${TABS.map((t) => `<button type="button" data-tab="${t.id}" class="${t.id === tab ? 'is-on' : ''}">${esc(t.label)}</button>`).join('')}
        </div>
      </div>

      <div id="calcBody"></div>
    </div>`;

  root.replaceChildren(el);
  renderTab(el.querySelector('#calcBody'), litres);
  wire(el, root);
}

function renderTab(host, litres) {
  if (litres === null || !(litres > 0)) {
    host.innerHTML = `<section class="card"><div class="card__body">
      <p class="muted" style="font-size:13.5px">Enter the water volume above to calculate a dose.</p>
    </div></section>`;
    return;
  }

  if (tab === 'salinity') return renderSalinity(host, litres);
  if (tab === 'waterchange') return renderWaterChange(host, litres);
  return renderSupplement(host, litres);
}

/* --- Alkalinity / calcium / magnesium ------------------------------------- */

const SUPPLEMENT_TABS = {
  alkalinity: { paramId: 'alkalinity', products: ALK_PRODUCTS, label: 'Alkalinity' },
  calcium: { paramId: 'calcium', products: CA_PRODUCTS, label: 'Calcium' },
  magnesium: { paramId: 'magnesium', products: MG_PRODUCTS, label: 'Magnesium' },
};

function renderSupplement(host, litres) {
  const cfg = SUPPLEMENT_TABS[tab];
  const latest = latestDisplay(cfg.paramId);
  const target = targetMidpoint(cfg.paramId);
  const param = store.paramById(cfg.paramId);
  const unit = param ? P.unitOf(param, store.displayUnit(param)) : { label: '', step: 0.1 };

  host.innerHTML = `
    <section class="card">
      <div class="card__body">
        <form id="calcForm" novalidate>
          <div class="field-row">
            <label class="field">
              <span>Current${unit.label ? ` (${esc(unit.label)})` : ''}</span>
              <input type="number" inputmode="decimal" step="${esc(unit.step)}" name="current"
                     value="${latest ? esc(latest.value.toFixed(unit.decimals ?? 2)) : ''}">
              <span class="field__hint">
                ${latest ? `Last test ${esc(formatRelative(latest.date))}` : 'No reading logged yet'}
              </span>
            </label>
            <label class="field">
              <span>Target${unit.label ? ` (${esc(unit.label)})` : ''}</span>
              <input type="number" inputmode="decimal" step="${esc(unit.step)}" name="target"
                     value="${target === null ? '' : esc(target.toFixed(unit.decimals ?? 2))}">
              <span class="field__hint">Middle of your target range</span>
            </label>
          </div>

          <label class="field">
            <span>Supplement</span>
            <select name="product">
              ${cfg.products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
            </select>
          </label>
        </form>
        <div id="calcResult"></div>
      </div>
    </section>`;

  const form = host.querySelector('#calcForm');
  const update = () => renderSupplementResult(host.querySelector('#calcResult'), form, cfg, litres);
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  update();
}

function renderSupplementResult(out, form, cfg, litres) {
  const v = formValues(form);
  const current = parseNumber(v.current);
  const target = parseNumber(v.target);
  const product = cfg.products.find((p) => p.id === v.product) || cfg.products[0];

  if (current === null || target === null) {
    out.innerHTML = '<p class="muted" style="font-size:13.5px;margin-top:12px">Enter a current and target value.</p>';
    return;
  }

  const delta = target - current;
  if (delta <= 0) {
    out.innerHTML = `<div class="calcout">
      <p style="font-size:13.5px">
        Already at or above target — nothing to dose.
        ${delta < 0 ? 'Bringing a level <em>down</em> is done with water changes, not additives.' : ''}
      </p></div>`;
    return;
  }

  let gramsNeeded;
  let workings;

  if (cfg.paramId === 'alkalinity') {
    const meq = delta * MEQ_PER_DKH * litres;
    gramsNeeded = meq * product.gPerMeq;
    workings = `${delta.toFixed(2)} dKH × ${MEQ_PER_DKH} meq/L × ${Math.round(litres)} L = ${Math.round(meq)} meq`;
  } else {
    // ppm is mg/L, so the elemental mass needed is delta x litres milligrams.
    const elementGrams = (delta * litres) / 1000;
    gramsNeeded = elementGrams * (cfg.paramId === 'calcium' ? product.gPerGCa : product.gPerGMg);
    workings = `${delta.toFixed(0)} ppm × ${Math.round(litres)} L = ${elementGrams.toFixed(1)} g of element`;
  }

  const limit = DAILY_MAX[cfg.paramId];
  const days = limit ? Math.ceil(delta / limit.amount) : 1;
  const perDay = gramsNeeded / days;

  out.innerHTML = `
    <div class="calcout">
      <div class="calcout__figure">${esc(grams(gramsNeeded))}</div>
      <div class="calcout__sub">
        of ${esc(product.name.toLowerCase())} to raise ${esc(cfg.label.toLowerCase())}
        by ${esc(delta.toFixed(2))}${limit ? ' ' + esc(limit.unit) : ''}
        in ${Math.round(litres)} L (${Math.round(litres / L_PER_GAL)} gal)
      </div>
      ${spoons(gramsNeeded, product.density)
        ? `<div class="calcout__spoon">${esc(spoons(gramsNeeded, product.density))} — weigh it if you can, bulk density varies</div>`
        : ''}

      ${days > 1 ? `
        <div class="calcnote calcnote--warn">
          <b>Split this over ${plural(days, 'day')}.</b>
          Raising ${esc(cfg.label.toLowerCase())} by more than ${limit.amount} ${esc(limit.unit)} in a day
          stresses coral. Dose about <b>${esc(grams(perDay))}</b> a day and retest before the last one.
        </div>` : ''}

      <p class="calcnote">${esc(product.note)}</p>
      <p class="calcworkings">${esc(workings)}</p>

      <div class="row" style="margin-top:12px">
        <button class="btn btn--sm" type="button" data-log="${esc(grams(days > 1 ? perDay : gramsNeeded))} ${esc(product.name)}">
          Log this dose
        </button>
      </div>
    </div>`;
}

/* --- Salinity -------------------------------------------------------------- */

function renderSalinity(host, litres) {
  const param = store.paramById('salinity');
  const unitId = param ? store.displayUnit(param) : 'sg';
  const unit = param ? P.unitOf(param, unitId) : { label: 'sg', step: 0.001, decimals: 3 };
  const latest = latestDisplay('salinity');
  const target = targetMidpoint('salinity');

  host.innerHTML = `
    <section class="card">
      <div class="card__body">
        <form id="salForm" novalidate>
          <div class="field-row">
            <label class="field">
              <span>Current (${esc(unit.label)})</span>
              <input type="number" inputmode="decimal" step="${esc(unit.step)}" name="current"
                     value="${latest ? esc(latest.value.toFixed(unit.decimals)) : ''}">
            </label>
            <label class="field">
              <span>Target (${esc(unit.label)})</span>
              <input type="number" inputmode="decimal" step="${esc(unit.step)}" name="target"
                     value="${target === null ? '' : esc(target.toFixed(unit.decimals))}">
            </label>
          </div>
        </form>
        <div id="salResult"></div>
      </div>
    </section>`;

  const form = host.querySelector('#salForm');
  const update = () => {
    const v = formValues(form);
    const cur = parseNumber(v.current);
    const tgt = parseNumber(v.target);
    const out = host.querySelector('#salResult');

    if (cur === null || tgt === null) {
      out.innerHTML = '<p class="muted" style="font-size:13.5px;margin-top:12px">Enter both values.</p>';
      return;
    }

    // Work in ppt regardless of the unit shown, since ppt is grams per kilogram.
    const curPpt = P.toBase(unitId, cur);
    const tgtPpt = P.toBase(unitId, tgt);

    if (Math.abs(curPpt - tgtPpt) < 0.05) {
      out.innerHTML = '<div class="calcout"><p style="font-size:13.5px">Already on target.</p></div>';
      return;
    }

    if (tgtPpt > curPpt) {
      // Salinity in ppt is grams of salt per kilogram of water.
      const saltGrams = (tgtPpt - curPpt) * litres;
      out.innerHTML = `
        <div class="calcout">
          <div class="calcout__figure">${esc(grams(saltGrams))}</div>
          <div class="calcout__sub">of salt mix to raise salinity from ${esc(cur.toFixed(unit.decimals))} to ${esc(tgt.toFixed(unit.decimals))} ${esc(unit.label)}</div>
          <div class="calcnote calcnote--warn">
            Dissolve it in a bucket of tank water first and add over several hours.
            Never tip dry salt into a stocked tank.
          </div>
          <p class="calcworkings">${(tgtPpt - curPpt).toFixed(2)} ppt × ${Math.round(litres)} L</p>
        </div>`;
    } else {
      // Diluting: the salt stays put, so volume rises in proportion.
      const addLitres = litres * (curPpt / tgtPpt - 1);
      out.innerHTML = `
        <div class="calcout">
          <div class="calcout__figure">${Math.round(addLitres)} L</div>
          <div class="calcout__sub">
            of RO/DI water (${(addLitres / L_PER_GAL).toFixed(1)} gal) to bring salinity down to ${esc(tgt.toFixed(unit.decimals))} ${esc(unit.label)}
          </div>
          <div class="calcnote calcnote--warn">
            Add it slowly — over a day for a change this size — and remember it raises
            the water level, so take some out first if the tank is full.
          </div>
          <p class="calcworkings">${Math.round(litres)} L × (${curPpt.toFixed(2)} / ${tgtPpt.toFixed(2)} − 1)</p>
        </div>`;
    }
  };

  form.addEventListener('input', update);
  update();
}

/* --- Water change ---------------------------------------------------------- */

function renderWaterChange(host, litres) {
  const options = P.visibleParams(store.params());

  host.innerHTML = `
    <section class="card">
      <div class="card__body">
        <form id="wcForm" novalidate>
          <label class="field">
            <span>Parameter to bring down</span>
            <select name="paramId">
              ${options.map((p) => `<option value="${esc(p.id)}" ${p.id === 'nitrate' ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
            </select>
          </label>
          <div class="field-row">
            <label class="field">
              <span>Current</span>
              <input type="number" inputmode="decimal" step="any" name="current">
            </label>
            <label class="field">
              <span>Target</span>
              <input type="number" inputmode="decimal" step="any" name="target">
            </label>
          </div>
          <label class="field">
            <span>Level in the new water</span>
            <input type="number" inputmode="decimal" step="any" name="fresh" value="0">
            <span class="field__hint">Usually zero for nitrate and phosphate in fresh saltwater.</span>
          </label>
        </form>
        <div id="wcResult"></div>
      </div>
    </section>`;

  const form = host.querySelector('#wcForm');

  const prefill = () => {
    const id = formValues(form).paramId;
    const latest = latestDisplay(id);
    const param = store.paramById(id);
    form.querySelector('[name="current"]').value = latest ? latest.value : '';
    const t = targetMidpoint(id);
    form.querySelector('[name="target"]').value = t === null ? '' : t;
    return param;
  };

  const update = () => {
    const v = formValues(form);
    const cur = parseNumber(v.current);
    const tgt = parseNumber(v.target);
    const fresh = parseNumber(v.fresh) ?? 0;
    const out = host.querySelector('#wcResult');

    if (cur === null || tgt === null) {
      out.innerHTML = '<p class="muted" style="font-size:13.5px;margin-top:12px">Enter a current and target value.</p>';
      return;
    }
    if (tgt >= cur) {
      out.innerHTML = '<div class="calcout"><p style="font-size:13.5px">Target is at or above current — a water change will not bring it down.</p></div>';
      return;
    }
    if (fresh >= tgt) {
      out.innerHTML = `<div class="calcout"><p style="font-size:13.5px">
        The new water is already at or above the target, so no amount of changing will get there.
      </p></div>`;
      return;
    }

    // Each change replaces a fraction f, leaving current x (1-f) + fresh x f.
    const fraction = (cur - tgt) / (cur - fresh);
    const volume = fraction * litres;

    // Several smaller changes are gentler; show what a 20% change achieves.
    const afterOne20 = cur + (fresh - cur) * 0.2;
    const changesNeeded = Math.ceil(Math.log((tgt - fresh) / (cur - fresh)) / Math.log(0.8));

    out.innerHTML = `
      <div class="calcout">
        <div class="calcout__figure">${Math.round(volume)} L</div>
        <div class="calcout__sub">
          ${(fraction * 100).toFixed(0)}% of the water (${(volume / L_PER_GAL).toFixed(1)} gal), changed at once
        </div>
        ${fraction > 0.35 ? `
          <div class="calcnote calcnote--warn">
            That is a big single change. ${plural(changesNeeded, 'change')} of 20%
            gets to the same place more gently — a 20% change alone would take it to
            about ${afterOne20.toFixed(afterOne20 < 10 ? 2 : 0)}.
          </div>` : ''}
        <p class="calcworkings">(${cur} − ${tgt}) ÷ (${cur} − ${fresh}) × ${Math.round(litres)} L</p>
      </div>`;
  };

  form.addEventListener('change', (e) => {
    if (e.target.name === 'paramId') prefill();
    update();
  });
  form.addEventListener('input', update);

  prefill();
  update();
}

/* --- Events ---------------------------------------------------------------- */

function wire(el, root) {
  el.addEventListener('click', async (event) => {
    const t = event.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; render(root); return; }

    const log = event.target.closest('[data-log]');
    if (log) {
      await store.saveActivity({
        taskId: null,
        taskName: `Dosed ${log.dataset.log}`,
        action: 'Performed',
        date: todayISO(),
        notes: 'Calculated in Reef Log',
      });
      toast('Dose logged to maintenance history');
    }
  });

  const volInput = el.querySelector('#volInput');
  const volUnit = el.querySelector('#volUnit');
  const onVolume = () => {
    const n = parseNumber(volInput.value);
    volumeOverride = n === null || n <= 0 ? null : (volUnit.value === 'L' ? n : n * L_PER_GAL);
    renderTab(el.querySelector('#calcBody'), workingLitres());
  };
  volInput.addEventListener('input', onVolume);
  volUnit.addEventListener('change', () => {
    // Reinterpret the number already typed in the newly chosen unit.
    onVolume();
  });
}
