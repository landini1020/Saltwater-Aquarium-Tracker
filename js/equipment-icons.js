/* Icons for equipment, chosen from the name and model.

   Photographs were considered and rejected. These are branded products, and
   almost nothing exists under a licence that allows reuse — one exact match for
   the whole list. The generic alternatives are photographs of a *different*
   manufacturer's product, which is worse than no picture: a Skimz skimmer
   standing in for a Reef Octopus tells you something untrue.

   A drawn symbol claims nothing about the specific product, stays consistent
   across the list, costs no bytes to speak of and works offline. */

const ICONS = {
  heater: '<path d="M10 3.5a2 2 0 1 1 4 0v9.2a4 4 0 1 1-4 0z"/><path d="M12 8v6"/>',

  canister: '<rect x="5" y="7" width="14" height="14" rx="2"/><path d="M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M5 11h14"/><path d="M9 4V2M15 4V2"/>',

  uv: '<rect x="8" y="4" width="8" height="16" rx="4"/><path d="M12 8v8"/><path d="M4 7l2 1M4 12h2M4 17l2-1M20 7l-2 1M20 12h-2M20 17l-2-1"/>',

  tank: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 10c2.5-1.6 4.5 1.6 7 0s4.5 1.6 7 0 3.5.6 4 .8"/>',

  pump: '<circle cx="10" cy="12" r="5"/><circle cx="10" cy="12" r="1.6"/><path d="M15 12h6"/><path d="M18.5 9.5 21 12l-2.5 2.5"/>',

  light: '<rect x="3" y="5" width="18" height="4" rx="1.5"/><path d="M6 13v3M10 13v5M14 13v5M18 13v3"/>',

  skimmer: '<path d="M9 21V10a3 3 0 0 1 6 0v11z"/><path d="M8.5 10V6.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1V10"/><circle cx="11" cy="15" r="1"/><circle cx="13.5" cy="18" r=".8"/>',

  testkit: '<rect x="6" y="3" width="12" height="18" rx="2"/><rect x="8.5" y="6" width="7" height="5" rx="1"/><path d="M9 15h2M13 15h2M9 18h2M13 18h2"/>',

  doser: '<path d="M9 3h6v3l-1 1v3h-4V7L9 6z"/><path d="M10 10h4v4a2 2 0 0 1-4 0z"/><path d="M12 17v1M12 20v1"/><path d="M17 12h3v8h-3z"/>',

  ato: '<path d="M5 4h10v13a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z"/><path d="M5 13c2-1.2 3.5.8 5 0s3 .8 5 0"/><path d="M18 6v6"/><circle cx="18" cy="14.5" r="1.5"/>',

  rodi: '<rect x="3" y="7" width="4.5" height="12" rx="1.2"/><rect x="9.75" y="7" width="4.5" height="12" rx="1.2"/><rect x="16.5" y="7" width="4.5" height="12" rx="1.2"/><path d="M5.25 7V4M12 7V4M18.75 7V4"/>',

  media: '<path d="M6 8h12l-1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/><path d="M8 8V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3"/><circle cx="11" cy="13" r=".9"/><circle cx="14" cy="16" r=".9"/><circle cx="10.5" cy="17" r=".9"/>',

  feeder: '<path d="M6 3h6v5l-3 12a1.5 1.5 0 0 1-3 0z"/><path d="M6 8h6"/><path d="M16 6c2 0 3 1.5 3 3s-1 3-3 3"/>',

  generic: '<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8 6V4h8v2"/><path d="M9 12h6"/>',
};

/* Most specific first. "Fluval UV light FX" is a steriliser, not a lamp, so uv
   is tested before light; dosing pumps are dosers, not pumps. */
const RULES = [
  [/\buv\b|steril/i, 'uv'],
  [/skimmer/i, 'skimmer'],
  [/dos(e|ing)/i, 'doser'],
  [/checker|tester|test kit|refractom|hanna|photometer/i, 'testkit'],
  [/\bato\b|top[\s-]?off|auto top/i, 'ato'],
  [/rodi|ro\/di|reverse osmosis|\bgpd\b/i, 'rodi'],
  [/carbon|\bgfo\b|media|phosban|purigen/i, 'media'],
  [/feeder|feeding/i, 'feeder'],
  [/heater|thermostat/i, 'heater'],
  [/canister|\bfx[0-9]|\b[0-9]{3}\b.*filter|filter.*\b[0-9]{3}\b/i, 'canister'],
  [/reefled|coral blade|led|light|lamp|pendant|lighting/i, 'light'],
  [/pump|wave|powerhead|gyre|circulation|return/i, 'pump'],
  [/tank|aquarium|aqueon|\bgallon\b/i, 'tank'],
  [/filter/i, 'canister'],
];

/** Icon key for a piece of equipment, from its name and model. */
export function equipmentIconKey(item) {
  const hay = `${item.name || ''} ${item.model || ''}`;
  for (const [pattern, key] of RULES) {
    if (pattern.test(hay)) return key;
  }
  return 'generic';
}

/** Inline SVG for an equipment item, sized by CSS and inheriting colour. */
export function equipmentIcon(item) {
  const key = equipmentIconKey(item);
  return `<svg viewBox="0 0 24 24" aria-hidden="true" class="gearicon__svg">${ICONS[key] || ICONS.generic}</svg>`;
}

export const EQUIPMENT_ICON_KEYS = Object.keys(ICONS);
