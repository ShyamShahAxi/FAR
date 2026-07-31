# Fixed Asset Register (FAR)

A self-contained **Fixed Asset Register** that maintains both an **accounting depreciation register** and a separate **tax depreciation register (capital allowances)** from the same asset master data.

It is a single static web app — no server, no build step, no dependencies. All data is stored in your browser's `localStorage`, and it deploys to GitHub Pages automatically.

**Live site:** https://shyamshahaxi.github.io/FAR/ *(enable GitHub Pages → "Deploy from branch: `gh-pages`" if it isn't live yet)*

---

## What it does

| Area | Details |
|------|---------|
| **Asset master** | Tag/ID, description, category, location, department, custodian, acquisition date |
| **Acquisition & cost** | Supplier, invoice, purchase cost + installation/freight + other capitalised costs → total capitalised value |
| **Accounting register** | Straight-line or reducing-balance depreciation, useful life, residual value. Per-year movement: opening NBV, additions, depreciation charge, disposals, closing NBV, accumulated depreciation |
| **Tax register** | Independent **diminishing-value** or **prime-cost** capital allowances, own tax cost base, optional first-year initial allowance, closing tax written-down value (TWDV) |
| **Disposals** | Accounting profit/(loss) on disposal **and** tax balancing charge/allowance |
| **Dashboard** | Gross cost, accumulated depreciation, NBV, TWDV, and the NBV − TWDV temporary difference (the base for deferred tax) |
| **Data** | JSON backup/restore, CSV export of assets and of each register, sample data, configurable financial-year end, reporting date, currency and company name |

Every figure is computed **as at the reporting date** you set. Set the reporting date to your period end (e.g. 30 June) to get full-year register figures; set it mid-year for a partial-year position.

## How depreciation is calculated

- **Straight-line / prime-cost:** `(cost − residual) ÷ useful life`, or `cost × rate%` when a capital-allowance rate is used. The first and final years are pro-rated by days in service.
- **Reducing-balance / diminishing-value:** `rate% × opening carrying amount`, pro-rated in the first year. Accounting depreciation never reduces the carrying amount below the residual value; tax depreciates toward nil.
- **Initial allowance (tax only):** an optional extra first-year deduction of `cost × initial-allowance%`.
- **Disposal:** the remaining carrying amount at the disposal date is removed. Accounting gain/(loss) = proceeds − NBV; tax balancing adjustment = proceeds − TWDV (positive = balancing charge, negative = balancing allowance).

The engine builds a full year-by-year schedule per asset (expand the **Schedule** row in either register to see it).

## Usage

1. Open the site (or `index.html` locally in a browser).
2. Go to **Data & Settings** → set company name, currency, financial-year end and reporting date.
3. Click **Load Axi AUS155 (Singapore) register** to load real data, **Load generic sample** to explore, or **+ Add Asset** to enter your own.
4. Review the **Accounting Register** and **Tax Register** tabs; export to CSV for your workpapers.
5. Use **Backup (JSON)** regularly — data lives only in this browser.

### Bundled AUS155 dataset

`data-aus155.js` contains the real **AxiCorp Pte Ltd (Singapore)** accounting register as at **30 June 2026** — 104 assets across Computer Equipment, Furniture & Fittings, Leasehold Improvements, Software Development and Asset WIP, imported from the Xero asset export. Assets are held at their functional-currency cost and depreciated straight-line (Prime Cost) over their useful lives from first-use date; the tax register mirrors the Prime Cost method and lives from the matching tax export. The engine's recomputed net book value ties to the source register's closing WDV to within a cent. WIP is carried at cost with no depreciation until placed in service; when a WIP item goes into service it moves to its operating category (e.g. Software Development) from its first-use date. Transferred-out WIP duplicate rows are excluded to avoid double counting. Use the register's financial-year selector to view earlier years (prior-year balances for items that have since changed category are approximate in computed mode).

> **Note:** the depreciation methods are general-purpose. Confirm the rates, methods and rules against the tax legislation applicable in your jurisdiction before relying on the figures.

## Project structure

```
index.html    App shell, tabs and layout
styles.css    Styling
app.js        Data model, depreciation/tax engines, rendering, import/export
.github/workflows/deploy-pages.yml   Publishes the repo root to the gh-pages branch
```

## Development

No tooling required — edit the files and open `index.html`. The engine functions in `app.js` are plain functions and can be unit-tested with any JavaScript runtime by stubbing `localStorage`/`document`.
