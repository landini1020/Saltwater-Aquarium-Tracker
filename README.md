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

Two guards keep the log from ever trampling real data. It installs only when the
database holds no readings, livestock **or** expenses, and only when the stored
`seedVersion` is older than the file's — so entries you delete stay deleted instead of
returning on the next reload. Editing the starter entries in the app is safe; they are
ordinary records once installed. To revise the shipped log, edit `js/seed-data.js` and
bump `SEED_VERSION`, which lets the new version land in a browser still holding the
untouched original. The module is imported dynamically, so it is only fetched and parsed
on a boot that actually needs to seed.

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
  views/                 one module per screen
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
