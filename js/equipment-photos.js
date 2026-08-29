/* Stock photos for equipment, keyed by the equipment record's id.

   There is only one entry, and that is the honest state of things rather than a
   stub: equipment here is branded hardware, and a search of Wikimedia Commons
   found exactly one reusable photo across the whole gear list. Everything else
   falls back to the drawn type symbol in js/equipment-icons.js — a symbol
   claims nothing, whereas another manufacturer's product photo would.

   Your own photo always wins over the entry here. */

export const EQUIPMENT_PHOTO_DIR = 'photos/equipment/';

export const EQUIPMENT_PHOTOS = {
  // Fluval Filter - FX6
  'a7f3c1e0-0003-4000-8000-000000000007': {
    file: 'fluval-fx6.jpg',
    artist: 'Fish Tank Society',
    licence: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Fluval_FX6_Canister_Filter.jpg',
    // BY-SA requires changes to be indicated.
    changes: 'cropped to the filter',
  },
};
