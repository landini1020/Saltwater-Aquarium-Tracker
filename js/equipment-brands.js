/* Brands for equipment, from the name and model.

   Real logos were the obvious idea and they are not available. A logo is
   artwork someone owns, and copying it onto a public site is a copyright
   question quite apart from the trademark. Wikimedia Commons has nothing for
   any of these ten brands - the nearest hits were a parent company's mark and
   a couple of logo files whose CC tag an uploader was in no position to grant.

   Naming a brand is different: using a mark to refer to the actual product you
   own is ordinary nominative use. So the brand appears as its own name set in
   type, in a colour of its own, and no artwork is copied.

   The colours are drawn from each brand's own palette. They are identifiers,
   not reproductions.

   Each brand carries two values because one cannot serve both themes: a single
   mid-tone was tried first and four brands failed contrast on the white card,
   amber worst at 2.1:1. `light` is darkened for the white card and `dark` is
   lightened for the dark one, each landing at or above 4.5:1 against its own
   background — the small-text threshold, which is what a 10px label is. */

const BRANDS = [
  { id: 'fluval', label: 'Fluval', light: '217 56 44', dark: '231 91 82', match: /fluval/i },
  { id: 'reef-octopus', label: 'Reef Octopus', light: '215 54 76', dark: '229 90 109', match: /reef\s*octopus/i },
  { id: 'reef-breeders', label: 'Reef Breeders', light: '156 107 0', dark: '240 165 0', match: /reef\s*breeders/i },
  { id: 'red-sea', label: 'Red Sea', light: '216 31 38', dark: '227 94 99', match: /red[\s-]*sea|reefled|reefwave|reefdose|reef-spec/i },
  { id: 'hanna', label: 'Hanna Instruments', light: '55 116 206', dark: '79 138 224', match: /hanna/i },
  { id: 'aqueon', label: 'Aqueon', light: '24 134 73', dark: '31 170 92', match: /aqueon/i },
  { id: 'ai', label: 'Aqua Illumination', light: '0 124 170', dark: '0 163 224', match: /aqua\s*illumination|coral\s*blade|\bnero\b/i },
  { id: 'icecap', label: 'IceCap', light: '43 125 163', dark: '58 169 220', match: /ice\s*cap/i },
  { id: 'brs', label: 'Bulk Reef Supply', light: '204 73 38', dark: '233 92 54', match: /bulk\s*reef\s*supply|\bbrs\b/i },
  { id: 'aquatop', label: 'Aquatop', light: '18 131 120', dark: '23 168 154', match: /aquatop/i },
];

/** The brand for a piece of equipment, or null when none is recognised. */
export function brandFor(item) {
  const hay = `${item.name || ''} ${item.model || ''}`;
  return BRANDS.find((b) => b.match.test(hay)) || null;
}

export const EQUIPMENT_BRANDS = BRANDS;
