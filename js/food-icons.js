/* Icons for foods, chosen from the type and the name.

   Same reasoning as js/equipment-icons.js: these are branded products, stock
   photographs of them are not licensed for reuse, and a photo of a *different*
   maker's pellets standing in for yours says something untrue. A drawn symbol
   claims nothing about the specific tub on your shelf, stays consistent down
   the list and costs nothing to load. Add your own photo and it replaces this. */

const ICONS = {
  // Pellets: a scoop with grains falling from it.
  pellet: '<path d="M4 9a5 5 0 0 1 10 0z"/><path d="M9 9v3a3 3 0 0 0 3 3h2"/><circle cx="17" cy="16" r="1.1"/><circle cx="20" cy="19" r="1.1"/><circle cx="16" cy="20" r="1.1"/>',

  // Flakes: thin irregular chips drifting down.
  flake: '<path d="M5 6.5l3.5-1.5 2 3-3.5 1.5z"/><path d="M14 4.5l4 1-1 3.5-4-1z"/><path d="M7 14l4-1.5 1.5 3.5-4 1.5z"/><path d="M15.5 13.5l4 1.5-1.5 4-4-1.5z"/>',

  // Frozen: a cube tray with a snowflake over it.
  frozen: '<rect x="3" y="11" width="18" height="9" rx="1.5"/><path d="M9 11v9M15 11v9M3 15.5h18"/><path d="M12 2v7M9 4l3 2 3-2M9 7.5l3-2 3 2"/>',

  // Nori / seaweed: fronds rising from a holdfast.
  nori: '<path d="M12 21c0-5 2-8 5-10-1 5-2 8-5 10z"/><path d="M12 21c0-6-2-9-5-11 1 5 2 9 5 11z"/><path d="M12 21v-6"/>',

  // Coral food: a powder cloud settling over a polyp.
  coral: '<path d="M12 20v-5M9 20v-3M15 20v-3"/><path d="M7 13a5 5 0 0 1 10 0z"/><circle cx="8" cy="6" r="1"/><circle cx="12" cy="4.5" r="1"/><circle cx="16" cy="6" r="1"/><circle cx="14" cy="8.5" r=".8"/><circle cx="10" cy="8.5" r=".8"/>',

  // Live food: a small swimming shape.
  live: '<path d="M3 12c4-5 9-5 13 0-4 5-9 5-13 0z"/><path d="M16 12l4-3v6z"/><circle cx="7" cy="11" r=".9"/>',

  // Anything unrecognised: a lidded tub.
  generic: '<rect x="5" y="8" width="14" height="12" rx="2"/><path d="M3.5 5.5h17v2.5h-17z"/><path d="M9.5 12.5h5"/>',
};

/* Type first, since it is chosen from a fixed list, then the name for logs where
   the type was left blank. */
const RULES = [
  [/pellet|granul/i, 'pellet'],
  [/flake/i, 'flake'],
  [/frozen|mysis|brine|cyclop|blood\s*worm/i, 'frozen'],
  [/nori|seaweed|algae\s*sheet|sea\s*veg/i, 'nori'],
  [/coral|roids|reef\s*energy|phyto|rotifer|oyster|amino/i, 'coral'],
  [/live|copepod|pod\b|artemia/i, 'live'],
];

/** Icon key for a food, from its type and name. */
export function foodIconKey(item) {
  const hay = `${item.foodType || ''} ${item.name || ''}`;
  for (const [pattern, key] of RULES) {
    if (pattern.test(hay)) return key;
  }
  return 'generic';
}

/** Inline SVG for a food, sized by CSS and inheriting colour. */
export function foodIcon(item) {
  const key = foodIconKey(item);
  return `<svg viewBox="0 0 24 24" aria-hidden="true" class="gearicon__svg">${ICONS[key] || ICONS.generic}</svg>`;
}

/* Offered in the type field. Free text is still accepted — these are only the
   suggestions, and the icon rules fall back to the name. */
export const FOOD_TYPES = [
  'Pellet',
  'Flake',
  'Frozen',
  'Nori / seaweed',
  'Coral food',
  'Live',
  'Other',
];
