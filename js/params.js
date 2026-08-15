/* Water-parameter definitions, unit handling and range evaluation.

   Readings are always stored in a parameter's *base* unit (ppt for salinity,
   °F for temperature, the natural unit for everything else) and converted only
   for input and display. That keeps charts and comparisons honest no matter
   which unit a given test was entered in.

   Parameter records are persisted to IndexedDB, so they hold plain data only.
   Conversion functions live here in code and are looked up by unit id. */

/* --- Unit conversion ------------------------------------------------------ */

/* Specific gravity <-> salinity is the hobby-standard table at 25 °C / 77 °F,
   where 1.0264 sg ~= 35 ppt. Linear over the range reef keepers actually use
   (1.020-1.028) to within about 0.1 ppt. */
const SG_SLOPE = 1300;
const SG_OFFSET = 0.6;

const CONVERT = {
  sg: {
    toBase: (v) => (v - 1) * SG_SLOPE + SG_OFFSET,
    fromBase: (v) => 1 + (v - SG_OFFSET) / SG_SLOPE,
  },
  c: {
    toBase: (v) => (v * 9) / 5 + 32,
    fromBase: (v) => ((v - 32) * 5) / 9,
  },
};

/** Convert a value entered in `unitId` into the parameter's base unit. */
export function toBase(unitId, value) {
  const c = CONVERT[unitId];
  return c ? c.toBase(value) : value;
}

/** Convert a stored base-unit value into `unitId` for display. */
export function fromBase(unitId, value) {
  const c = CONVERT[unitId];
  return c ? c.fromBase(value) : value;
}

/* --- Built-in parameters -------------------------------------------------- */

/* target*  : the range to aim for on a mixed reef — green.
   soft*    : still tolerable — amber outside target but inside soft.
              Anything beyond soft reads red.
   Every one of these is editable in Settings; they are starting points,
   not gospel, and different tanks run happily at different numbers. */

export const DEFAULT_PARAMETERS = [
  {
    id: 'salinity', name: 'Salinity', short: 'Sal', color: '#2f8fd0', order: 10,
    baseUnit: 'ppt', defaultUnit: 'sg',
    units: [
      { id: 'sg', label: 'sg', decimals: 3, step: 0.001 },
      { id: 'ppt', label: 'ppt', decimals: 1, step: 0.1 },
    ],
    targetLow: 31.8, targetHigh: 34.4,
    softLow: 30.5, softHigh: 35.7,
    enabled: true, builtIn: true,
  },
  {
    id: 'temperature', name: 'Temperature', short: 'Temp', color: '#e2653f', order: 20,
    baseUnit: 'f', defaultUnit: 'f',
    units: [
      { id: 'f', label: '°F', decimals: 1, step: 0.1 },
      { id: 'c', label: '°C', decimals: 1, step: 0.1 },
    ],
    targetLow: 76, targetHigh: 80,
    softLow: 74, softHigh: 82,
    enabled: true, builtIn: true,
  },
  {
    id: 'ph', name: 'pH', short: 'pH', color: '#8257d9', order: 30,
    baseUnit: 'ph', defaultUnit: 'ph',
    units: [{ id: 'ph', label: '', decimals: 2, step: 0.01 }],
    targetLow: 8.0, targetHigh: 8.4,
    softLow: 7.8, softHigh: 8.5,
    enabled: true, builtIn: true,
  },
  {
    id: 'ammonia', name: 'Ammonia', short: 'NH₃', color: '#d1495b', order: 40,
    baseUnit: 'ppm', defaultUnit: 'ppm',
    units: [{ id: 'ppm', label: 'ppm', decimals: 2, step: 0.01 }],
    targetLow: 0, targetHigh: 0,
    softLow: 0, softHigh: 0.05,
    enabled: true, builtIn: true,
  },
  {
    id: 'nitrite', name: 'Nitrite', short: 'NO₂', color: '#e0932e', order: 50,
    baseUnit: 'ppm', defaultUnit: 'ppm',
    units: [{ id: 'ppm', label: 'ppm', decimals: 2, step: 0.01 }],
    targetLow: 0, targetHigh: 0,
    softLow: 0, softHigh: 0.1,
    enabled: true, builtIn: true,
  },
  {
    id: 'nitrate', name: 'Nitrate', short: 'NO₃', color: '#3f9d52', order: 60,
    baseUnit: 'ppm', defaultUnit: 'ppm',
    units: [{ id: 'ppm', label: 'ppm', decimals: 1, step: 0.1 }],
    targetLow: 1, targetHigh: 10,
    softLow: 0, softHigh: 25,
    enabled: true, builtIn: true,
  },
  {
    id: 'phosphate', name: 'Phosphate', short: 'PO₄', color: '#c2549f', order: 70,
    baseUnit: 'ppm', defaultUnit: 'ppm',
    units: [{ id: 'ppm', label: 'ppm', decimals: 3, step: 0.001 }],
    targetLow: 0.03, targetHigh: 0.1,
    softLow: 0, softHigh: 0.2,
    enabled: true, builtIn: true,
  },
  {
    id: 'calcium', name: 'Calcium', short: 'Ca', color: '#16a0a0', order: 80,
    baseUnit: 'ppm', defaultUnit: 'ppm',
    units: [{ id: 'ppm', label: 'ppm', decimals: 0, step: 1 }],
    targetLow: 400, targetHigh: 450,
    softLow: 380, softHigh: 480,
    enabled: true, builtIn: true,
  },
  {
    id: 'alkalinity', name: 'Alkalinity', short: 'Alk', color: '#3b62c9', order: 90,
    baseUnit: 'dkh', defaultUnit: 'dkh',
    units: [{ id: 'dkh', label: 'dKH', decimals: 2, step: 0.1 }],
    targetLow: 8, targetHigh: 11,
    softLow: 7, softHigh: 12,
    enabled: true, builtIn: true,
  },
  {
    id: 'magnesium', name: 'Magnesium', short: 'Mg', color: '#8b8f31', order: 100,
    baseUnit: 'ppm', defaultUnit: 'ppm',
    units: [{ id: 'ppm', label: 'ppm', decimals: 0, step: 5 }],
    targetLow: 1250, targetHigh: 1400,
    softLow: 1150, softHigh: 1500,
    enabled: true, builtIn: true,
  },
  {
    id: 'iodine', name: 'Iodine', short: 'I', color: '#a9642a', order: 110,
    baseUnit: 'ppm', defaultUnit: 'ppm',
    units: [{ id: 'ppm', label: 'ppm', decimals: 3, step: 0.001 }],
    targetLow: 0.04, targetHigh: 0.08,
    softLow: 0.02, softHigh: 0.12,
    enabled: true, builtIn: true,
  },
  {
    id: 'iron', name: 'Iron', short: 'Fe', color: '#6f8090', order: 120,
    baseUnit: 'ppm', defaultUnit: 'ppm',
    units: [{ id: 'ppm', label: 'ppm', decimals: 3, step: 0.001 }],
    targetLow: 0, targetHigh: 0.1,
    softLow: 0, softHigh: 0.2,
    enabled: true, builtIn: true,
  },
];

/** Shape for a user-defined parameter added from Settings. */
export function customParameter({ id, name, unitLabel, decimals, targetLow, targetHigh, softLow, softHigh, color, order }) {
  const dec = Number.isFinite(decimals) ? decimals : 2;
  return {
    id,
    name,
    short: name.slice(0, 6),
    color: color || '#5b6b7a',
    order: order || 500,
    baseUnit: 'custom',
    defaultUnit: 'custom',
    units: [{ id: 'custom', label: unitLabel || '', decimals: dec, step: Number((10 ** -dec).toFixed(dec)) }],
    targetLow, targetHigh, softLow, softHigh,
    enabled: true,
    builtIn: false,
  };
}

/* --- Helpers -------------------------------------------------------------- */

export function unitOf(param, unitId) {
  if (!param || !param.units || !param.units.length) return { id: '', label: '', decimals: 2, step: 0.01 };
  return param.units.find((u) => u.id === unitId) || param.units[0];
}

export function defaultUnitOf(param) {
  return unitOf(param, param.defaultUnit);
}

/** Round-trip guard: strip float noise introduced by unit conversion. */
export function roundTo(value, decimals) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * Evaluate a base-unit value against a parameter's ranges.
 * @returns {'ok'|'warn'|'bad'} 'ok' inside target, 'warn' inside soft, 'bad' beyond.
 */
export function statusOf(param, baseValue) {
  if (!Number.isFinite(baseValue) || !param) return 'ok';

  const { targetLow, targetHigh, softLow, softHigh } = param;
  const hasTarget = Number.isFinite(targetLow) && Number.isFinite(targetHigh);
  if (!hasTarget) return 'ok';

  // Tiny epsilon so a value that only misses by float noise still reads as in-range.
  const eps = 1e-9;
  if (baseValue >= targetLow - eps && baseValue <= targetHigh + eps) return 'ok';

  const lo = Number.isFinite(softLow) ? softLow : -Infinity;
  const hi = Number.isFinite(softHigh) ? softHigh : Infinity;
  if (baseValue >= lo - eps && baseValue <= hi + eps) return 'warn';

  return 'bad';
}

/** Format a base-unit value for display in `unitId`, without the unit label. */
export function formatValue(param, unitId, baseValue) {
  if (!Number.isFinite(baseValue)) return '—';
  const unit = unitOf(param, unitId);
  return fromBase(unit.id, baseValue).toFixed(unit.decimals);
}

/** Format a base-unit value with its unit label appended, e.g. "8.42 dKH". */
export function formatWithUnit(param, unitId, baseValue) {
  const unit = unitOf(param, unitId);
  const text = formatValue(param, unitId, baseValue);
  return unit.label ? `${text} ${unit.label}` : text;
}

/** Human-readable target range in the given display unit, e.g. "8.00 – 11.00 dKH". */
export function formatTarget(param, unitId) {
  if (!Number.isFinite(param.targetLow) || !Number.isFinite(param.targetHigh)) return '';
  const unit = unitOf(param, unitId);
  const lo = formatValue(param, unitId, param.targetLow);
  const hi = formatValue(param, unitId, param.targetHigh);
  const label = unit.label ? ` ${unit.label}` : '';
  // Ascending order survives units that invert (none today, but °C ranges are computed).
  const [a, b] = Number(lo) <= Number(hi) ? [lo, hi] : [hi, lo];
  return a === b ? `${a}${label}` : `${a} – ${b}${label}`;
}

/** Parameters that should appear in the UI, in display order. */
export function visibleParams(params) {
  return params.filter((p) => p.enabled !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function sortParams(params) {
  return [...params].sort((a, b) => (a.order || 0) - (b.order || 0));
}
