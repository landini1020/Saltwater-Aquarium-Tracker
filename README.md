# Reef Log

A saltwater aquarium log for a 125-gallon mixed reef: water parameters charted over
time, livestock with time-in-tank, and what the whole thing has cost you.

Runs in any modern browser on desktop, and installs to a phone home screen as a
full-screen app that works offline. No build step, no server, no account.

---

## Running it

**On your phone and desktop (GitHub Pages)** — see [Publishing](#publishing) below.

**Locally, for development:**

```bash
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

Then open <http://localhost:8080>. The script is a small static file server built on
.NET's `HttpListener`, so it needs nothing installed beyond Windows PowerShell.

Use `-Port 3000` to change the port, `-NoBrowser` to skip auto-opening a tab.

> Opening `index.html` directly from disk will **not** work. Browsers block ES modules
> and service workers on `file://` URLs. Use the dev server or the published site.

---

## What it does

### Parameters

Twelve parameters are set up out of the box, each with a reef-appropriate target range:

| Parameter | Units | Default target |
|---|---|---|
| Salinity | sg or ppt | 1.024 – 1.026 sg |
| Temperature | °F or °C | 76 – 80 °F |
| pH | — | 8.0 – 8.4 |
| Ammonia | ppm | 0 |
| Nitrite | ppm | 0 |
| Nitrate | ppm | 1 – 10 |
| Phosphate | ppm | 0.03 – 0.10 |
| Calcium | ppm | 400 – 450 |
| Alkalinity | dKH | 8 – 11 |
| Magnesium | ppm | 1250 – 1400 |
| Iodine | ppm | 0.04 – 0.08 |
| Iron | ppm | 0 – 0.10 |

Every range is editable in Settings, parameters can be switched off, and you can add
your own (potassium, strontium, ORP, whatever you test for).

**Log Test** records a whole test session at once — fill in only the parameters you
actually measured. Charts show each parameter over time with its target range shaded
green; tap or hover any point for the exact value and date. Below the charts, the same
data appears as a spreadsheet-style log you can edit or delete row by row.

Readings are stored in a single canonical unit per parameter and converted only for
display, so switching between sg and ppt (or °F and °C) never distorts your history.

### Livestock

Fish, corals and invertebrates, each with a type, scientific name, acquisition date,
quantity, source store, price, and status (in tank / deceased / sold / moved). The card
shows how long each has been in the tank, counted live. Entering a price when adding
livestock optionally files the matching expense for you.

#### The starting log (`js/seed-data.js`)

The app ships with the tank's full history, transcribed from the Aquarimate workbook
export. It installs itself the first time the app runs in a browser, so opening the site
on a new phone or laptop shows everything immediately with nothing to import.

| | |
|---|---|
| Livestock entries | 96 — 34 still in the tank (68 animals), 62 since lost |
| Expenses | 132, totalling $10,828.75 |
| Equipment | 25 items · **Supplements** 11 · **Foods** 3 |
| Maintenance | 13 tasks · 194 logged activities |
| Tank | 125 gal mixed reef, set up 2023-04-18 |

Sixty-three of the livestock entries have their price and store filled in from a
purchase on the same date in the same category; where the match was ambiguous, those
fields are left blank rather than guessed.

The shop is spelled a dozen ways in the source data — "Discover Aquatics Shop",
"Doscover Aquatic", "Dicover Aquatics Shop", "Discover Aquatics Shoo" and more — and is
normalised to **Discover Aquatics** so the spend-by-store breakdown groups it as one
place. Genuinely different vendors (Petco, Amazon, Aquarium Artisans,
SaltwaterAquarium.com) are left alone.

**Water test readings are not included.** The workbook's Parameters sheet exported its
date column as boolean `FALSE` rather than dates, so its 153 readings have no usable
timestamps and cannot be charted. The values survived; only the dates were lost.
Re-exporting that sheet is what it would take to add them.

Seeding is tracked **per collection**, in `settings.seededCollections`. A collection is
filled only if it has never been seeded and is currently empty, and any collection
holding data is treated as settled regardless of what was recorded. That means a later
release can add a whole new section — as Maintenance, Gear and Foods were — to a
browser that already holds the log, without touching what is there, and without a
collection you empty on purpose being refilled on the next reload.

Wish List, Notes and Gallery ship no starter content at all: they are yours to fill, and
inventing entries for them would be putting words in your mouth rather than transcribing
a workbook.

Editing the starter entries in the app is safe; they are ordinary records once
installed. To revise the shipped log, edit `js/seed-data.js`; a collection already
present in a browser will not be replaced, so material changes to existing collections
are better delivered as a backup file to import. The module is imported dynamically, so
it is only fetched and parsed on a boot that actually needs to seed.

### Maintenance

Recurring jobs — water changes, filter media, dosing — each with a repeat interval.
Reef Log works out when each is next due from when it was last done, and sorts anything
overdue to the top. **Log done** records the job against today and rolls the schedule
forward; **Skip** records that it was deliberately passed over. Both land in the activity
history, which is the running record of everything done to the tank.

Tasks on a fixed calendar schedule rather than a day interval keep their description and
simply have no computed due date. The dashboard leads with whatever is due, and the Care
tab carries a red pip while anything is outstanding.

### Gear

Equipment with model, quantity and install date, showing how long each piece has been in
service, and retired items kept for the record. Alongside it, supplements with brand,
size and their full dosing instructions.

### Foods

What is in the food cupboard — brand, type, size, quantity on hand, what it cost and
where it came from — with room for the usage directions copied off the box, so they are
to hand at feeding time instead of on a sheet in a drawer. Add a photo of the tub and it
replaces the drawn type symbol.

Each food carries its own feeding schedules. A feeding is not a separate kind of job: it
is an ordinary task pointing at the food, so it uses the same due-date maths, shows up in
Maintenance beside the water changes, feeds the red pip on the Care tab, and logs to the
same activity history. The Foods screen leads with anything due, and every schedule can
be logged from the food's own card.

### Wish List

Things you want but have not bought — livestock, equipment, food, supplements — each
with a photo, a price you expect, where you saw it and a one-to-five priority. Built for
standing in the shop with a phone: the question there is whether this is the one you
meant to get and what you were willing to pay.

**I bought it** moves the entry into whichever section it actually belongs to. A fish
becomes a Livestock entry, a pump becomes Gear, a tub becomes a Food — dated today, with
the quantity, store, price, notes and photo carried across, and off the wish list. The
photo moves rather than copies, so one picture never occupies two slots.

### Notes

Deliberately unstructured, because the rest of the app is fields. Paste the dosing
instructions off the bottle, write down what the shop said about acclimating, record what
you tried last time something went wrong. A note needs neither a title nor anything else
— leave the title blank and the first line becomes it.

Search runs across titles and bodies and highlights what matched, which is the only
machinery here and the thing that makes a note worth writing.

### Gallery

Tank photos in albums. Add several at once; they are processed one at a time, because a
phone asked to decode twenty full-size images simultaneously runs out of memory rather
than going faster. Each photo takes its capture date from the file, and can carry a
caption.

An album is only a label. Photos can sit outside one, and deleting an album keeps
everything in it — losing a folder should not lose the pictures. The header shows what
the gallery is costing in storage, because this is the one section with no natural limit
on how much you put in it.

### Expenses

Itemised spending by category and store, with month / year-to-date / all-time totals, a
monthly spend chart, and breakdowns showing where the money actually goes.

---

## Where your data lives

In your browser's IndexedDB, on the device you entered it on. Nothing is uploaded
anywhere — there is no server and no account.

The practical consequence: **your phone and your desktop keep separate logs.** The
starting log ships with the app so it appears on every device by itself, but anything
logged *afterwards* stays on the device it was entered on. To move that across, use
**Settings → Export backup** to download a JSON file, then **Import backup** on the
other device. Export is also your only backup, so do it periodically — clearing your
browser's site data will erase everything you have logged.

If you later want the two devices to sync live, the storage layer is isolated behind
`js/store.js`; a hosted backend can be added there without touching the views.

### What a backup does and does not carry

Every record, and the **thumbnail** of every photo — but not the full-size images, which
stay on the device. Restoring on a second device therefore gives you a complete log whose
pictures are thumbnail-quality. Full-size images are excluded on purpose: including them
would push the file past what a phone can hand to iCloud or a mail app.

Thumbnails are 320 px JPEGs carried inline as data URLs, roughly 20–30 KB each. That is
invisible when a photo hangs off a fish or a pump, but the Gallery has no natural ceiling
— a hundred photos there adds a couple of megabytes to the backup file. Still shareable;
worth knowing before you put five hundred in.

---

## Publishing

To get a URL you can open on your phone:

```bash
git add -A
git commit -m "Reef Log"
git push -u origin main
```

Then in the repository on GitHub: **Settings → Pages → Source: Deploy from a branch →
`main` / `(root)` → Save**. After a minute the site is live at
`https://<your-username>.github.io/Saltwater-Aquarium-Tracker/`.

Open that URL on your phone and choose **Add to Home Screen** (Share menu on iPhone, the
⋮ menu on Android). It then launches full-screen with its own icon and works without a
signal.

Note that a public repository means a public URL. The page ships no data — your log
never leaves your device — but anyone with the link can open the empty app. Use a
private repo with GitHub Pages if you would rather it not be reachable.

---

## Project layout

```
index.html               app shell: nav, modal host, boot screen
manifest.webmanifest     PWA metadata
sw.js                    service worker (offline shell cache)
serve.ps1                local static server, no dependencies
css/app.css              all styles; light + dark, phone + desktop
js/
  app.js                 boot, hash router, chrome
  db.js                  IndexedDB wrapper
  store.js               in-memory domain store, seeding, export/import
  seed-data.js           the tank's existing log, installed on first run
  params.js              parameter definitions, units, range evaluation
  charts.js              SVG line/bar charts and sparklines
  ui.js                  formatting, modals, toasts, escaping
  food-icons.js          drawn symbols and type list for foods
  views/                 one module per screen: dashboard, parameters,
                         maintenance, livestock, gear, foods, wishlist,
                         notes, gallery, expenses, settings
icons/                   app icons
```

No dependencies, no bundler, no transpiler. Everything is ES modules loaded directly by
the browser, which is why the local dev server exists.

### Notes for future changes

- Views render into a fresh wrapper element each time, so event listeners bound to that
  wrapper are discarded on re-render rather than stacking up.
- `store.subscribe()` re-renders the current screen after any data change; views keep
  their filter state in module-level variables so it survives.
- Grid tracks use `minmax(0, 1fr)` deliberately — the default `min-content` minimum lets
  a wide table stretch the entire page instead of scrolling inside its own container.
- The sg ↔ ppt conversion is the hobby-standard table at 25 °C and is accurate to about
  0.1 ppt across the range reef keepers use.
