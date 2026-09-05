/* Stock photos for equipment, keyed by the equipment record's id.

   Read this before adding to it. Unlike js/species-photos.js, almost nothing
   here is licensed for reuse.

   The search for freely licensed hardware photography was done properly and
   came back empty. Openverse — which aggregates Flickr, Wikimedia, the
   Smithsonian and others — was queried for every product on the list; Wikimedia
   Commons was searched directly by brand and by category; Red Sea and Hanna
   were checked for a public press kit. Across the whole gear list that yielded
   exactly one reusable photograph, the Fluval FX6, which is why this file held
   a single entry for so long. What free material does exist is the wrong
   product: Skimz skimmers rather than Reef Octopus, generic heaters rather than
   the Fluval E-series, a Hanna pH meter rather than the handheld checkers.

   So everything below except the FX6 is the maker's or the seller's own product
   photograph, used without a licence. That is a deliberate choice for a
   personal log of one tank, made with the repository's public status known.
   Each entry names who made the image and links back to the page it came from,
   which is courtesy rather than compliance. If this ever becomes anything other
   than one person's aquarium notebook, these are the first thing to remove.

   Every image was opened and looked at before it went in — the automated search
   behind the livestock photos once offered a moth for a crab. Where the
   photograph is not exactly the thing the record describes, the entry says so
   in `note` and the photo viewer prints it. Two cases recur:

     - Fluval photograph packaging rather than product. Every image on their
       site is the retail box, so that is what their four entries are.
     - Some products are pictured in a neighbouring size or capacity, because
       that is the only shot published. The RODI system is the worst of these:
       its label legibly reads 75 GPD and the record says 200.

   Your own photo always wins over the entry here. */

export const EQUIPMENT_PHOTO_DIR = 'photos/equipment/';

export const EQUIPMENT_PHOTOS = {
  // Aquatop 9W UV Light — the SP9-UV submersible, shown beside its box.
  'a7f3c1e0-0003-4000-8000-000000000001': {
    file: 'aquatop-9w-uv.jpg',
    artist: 'SaltwaterAquarium.com',
    licence: 'All rights reserved',
    source: 'https://www.saltwateraquarium.com/adjustable-flow-submersible-uv-filter-sp9uv-9-watt-aquatop/',
  },

  // Aqueon 125 Gallon Tank
  'a7f3c1e0-0003-4000-8000-000000000002': {
    file: 'aqueon-tank.jpg',
    artist: 'Aqueon',
    licence: 'All rights reserved',
    source: 'https://www.aqueon.com/products/aquariums/standard-glass-rectangle-aquariums',
    note: 'Aqueon publish one photograph for the whole standard glass range, so this is the range shot rather than the 125.',
  },

  // Circulation Pump — Aqua Illumination Nero 5
  'a7f3c1e0-0003-4000-8000-000000000003': {
    file: 'ai-nero-5.jpg',
    artist: 'Aqua Illumination',
    licence: 'All rights reserved',
    source: 'https://www.aquaillumination.com/products/nero',
  },

  // Fluval Advanced Heater (200 watt) — E200
  'a7f3c1e0-0003-4000-8000-000000000004': {
    file: 'fluval-e200.jpg',
    artist: 'Fluval',
    licence: 'All rights reserved',
    source: 'https://fluvalaquatics.com/us/shop/product/e200-electronic-heater-200w-up-to-65-us-gal-250-l',
    note: 'Fluval publish packaging shots rather than product shots, so this is the box.',
  },

  // Fluval Advanced Heater (300 watt) — E300
  'a7f3c1e0-0003-4000-8000-000000000005': {
    file: 'fluval-e300.jpg',
    artist: 'Fluval',
    licence: 'All rights reserved',
    source: 'https://fluvalaquatics.com/us/shop/product/e300-electronic-heater-300w-up-to-100-us-gal-375-l',
    note: 'Fluval publish packaging shots rather than product shots, so this is the box.',
  },

  // Fluval Filter - 407
  'a7f3c1e0-0003-4000-8000-000000000006': {
    file: 'fluval-407.jpg',
    artist: 'Fluval',
    licence: 'All rights reserved',
    source: 'https://fluvalaquatics.com/us/shop/product/407-canister-filter-50-100-us-gal-150-500-l',
    note: 'Fluval publish packaging shots rather than product shots, so this is the box.',
  },

  // Fluval Filter - FX6. The one photograph in this file that is licensed for
  // reuse, and the only reason the attribution below is an obligation rather
  // than a courtesy.
  'a7f3c1e0-0003-4000-8000-000000000007': {
    file: 'fluval-fx6.jpg',
    artist: 'Fish Tank Society',
    licence: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Fluval_FX6_Canister_Filter.jpg',
    // BY-SA requires changes to be indicated.
    changes: 'cropped to the filter',
  },

  // Fluval UV light FX — FX UVC In-Line Clarifier
  'a7f3c1e0-0003-4000-8000-000000000008': {
    file: 'fluval-fx-uvc.jpg',
    artist: 'Fluval',
    licence: 'All rights reserved',
    source: 'https://fluvalaquatics.com/us/shop/product/fx-uvc-in-line-clarifier',
    note: 'Fluval publish packaging shots rather than product shots, so this is the box.',
  },

  // Hanna HI772 Alkalinity (dKH) Checker
  'a7f3c1e0-0003-4000-8000-000000000009': {
    file: 'hanna-hi772.jpg',
    artist: 'Hanna Instruments',
    licence: 'All rights reserved',
    source: 'https://hannainst.com/marine-alkalinity-dkh-checkerr-hc-hi772.html',
  },

  // Hanna HI713 Phosphate Low Range Checker
  'a7f3c1e0-0003-4000-8000-000000000010': {
    file: 'hanna-hi713.jpg',
    artist: 'Hanna Instruments',
    licence: 'All rights reserved',
    source: 'https://hannainst.com/hi713-phosphate-lr.html',
  },

  // Hanna HI782 Marine Nitrate High Range Checker
  'a7f3c1e0-0003-4000-8000-000000000011': {
    file: 'hanna-hi782.jpg',
    artist: 'Hanna Instruments',
    licence: 'All rights reserved',
    source: 'https://hannainst.com/marine-nitrate-high-range-checker-hc-hi782-r.html',
  },

  // Hanna HI98319 Marine Salinity Tester
  'a7f3c1e0-0003-4000-8000-000000000012': {
    file: 'hanna-hi98319.jpg',
    artist: 'Hanna Instruments',
    licence: 'All rights reserved',
    source: 'https://hannainst.com/marine-salinity-tester-hi98319.html',
  },

  // IceCap Coral Feeder
  'a7f3c1e0-0003-4000-8000-000000000013': {
    file: 'icecap-coral-feeder.jpg',
    artist: 'SaltwaterAquarium.com',
    licence: 'All rights reserved',
    source: 'https://www.saltwateraquarium.com/19-coral-target-feeder-icecap/',
    note: 'The 19 inch feeder. IceCap sell the same tool in four lengths and photograph them identically.',
  },

  // LED Light — AI 48 inch Coral Blade Grow
  'a7f3c1e0-0003-4000-8000-000000000014': {
    file: 'ai-blade-coral-grow.jpg',
    artist: 'Bulk Reef Supply',
    licence: 'All rights reserved',
    source: 'https://www.bulkreefsupply.com/',
    note: 'The Blade Coral Grow is one strip sold in several lengths, photographed here at 12 inches rather than 48.',
  },

  // LED Light — AI 24 inch Coral Blade Grow
  'a7f3c1e0-0003-4000-8000-000000000015': {
    file: 'ai-blade-coral-grow.jpg',
    artist: 'Bulk Reef Supply',
    licence: 'All rights reserved',
    source: 'https://www.bulkreefsupply.com/',
    note: 'The Blade Coral Grow is one strip sold in several lengths, photographed here at 12 inches rather than 24.',
  },

  // RED SEA REEFWAVE 25
  'a7f3c1e0-0003-4000-8000-000000000016': {
    file: 'redsea-reefwave-25.jpg',
    artist: 'Red Sea',
    licence: 'All rights reserved',
    source: 'https://www.redseafish.com/reefwave-25/',
  },

  // Red Sea Reef-Spec Carbon
  'a7f3c1e0-0003-4000-8000-000000000017': {
    file: 'redsea-reefspec-carbon.jpg',
    artist: 'Red Sea',
    licence: 'All rights reserved',
    source: 'https://www.redseafish.com/reef-spec-carbon/',
    note: 'Red Sea own banner artwork, showing all three tub sizes against a reef.',
  },

  // Red Sea ReefDose Dosing Pumps
  'a7f3c1e0-0003-4000-8000-000000000018': {
    file: 'redsea-reefdose.jpg',
    artist: 'Red Sea',
    licence: 'All rights reserved',
    source: 'https://www.redseafish.com/reefdose-4/',
    note: 'The four-channel ReefDose.',
  },

  // Red Sea ReefLED 90W
  'a7f3c1e0-0003-4000-8000-000000000019': {
    file: 'redsea-reefled-90.jpg',
    artist: 'Red Sea',
    licence: 'All rights reserved',
    source: 'https://www.redseafish.com/reefled-90/',
  },

  // Reef Breeders Prism ATO
  'a7f3c1e0-0003-4000-8000-000000000020': {
    file: 'reefbreeders-prism-ato.jpg',
    artist: 'SaltwaterAquarium.com',
    licence: 'All rights reserved',
    source: 'https://www.saltwateraquarium.com/prism-ato-auto-top-off-reef-breeders/',
    note: 'Reef Breeders have discontinued the Prism, so this comes from a seller rather than the maker.',
  },

  // Reef Octopus Classic 100 HOB Skimmer
  'a7f3c1e0-0003-4000-8000-000000000021': {
    file: 'reefoctopus-classic-100.jpg',
    artist: 'SaltwaterAquarium.com',
    licence: 'All rights reserved',
    source: 'https://www.saltwateraquarium.com/classic-100-hob-hang-on-the-back-protein-skimmer-90-gal-reef-octopus/',
  },

  // Reef Octopus Classic 2000 HOB Skimmer
  'a7f3c1e0-0003-4000-8000-000000000022': {
    file: 'reefoctopus-classic-2000.jpg',
    artist: 'SaltwaterAquarium.com',
    licence: 'All rights reserved',
    source: 'https://www.saltwateraquarium.com/classic-2000-hob-hang-on-back-skimmer-reef-octopus/',
  },

  // ReefLED RL90 Black Pendant Hanging Kit
  'a7f3c1e0-0003-4000-8000-000000000023': {
    file: 'redsea-reefled-90.jpg',
    artist: 'Red Sea',
    licence: 'All rights reserved',
    source: 'https://www.redseafish.com/reefled-90/',
    note: 'This entry is the hanging kit; the photograph is the ReefLED 90 that hangs from it.',
  },

  // Rodi System — Bulk Reef Supply
  'a7f3c1e0-0003-4000-8000-000000000024': {
    file: 'brs-rodi.jpg',
    artist: 'Bulk Reef Supply',
    licence: 'All rights reserved',
    source: 'https://www.bulkreefsupply.com/',
    note: 'The same system at 75 GPD. The label in the photograph says so and this record is the 200 — no 200 GPD photograph is published.',
  },

  // Tank — Aqueon 55 Gallon
  'a7f3c1e0-0003-4000-8000-000000000025': {
    file: 'aqueon-tank.jpg',
    artist: 'Aqueon',
    licence: 'All rights reserved',
    source: 'https://www.aqueon.com/products/aquariums/standard-glass-rectangle-aquariums',
    note: 'Aqueon publish one photograph for the whole standard glass range, so this is the range shot rather than the 55.',
  },
};
