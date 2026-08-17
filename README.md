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
| **Tax register** | Independent capital allowances (own tax cost base): 100% one-year write-off, N-year write-off, or diminishing/prime-cost rates, plus an optional first-year initial allowance and a **deferred-tax** column. Closing tax written-down value (TWDV). Tax allowances are **not time-apportioned** (see below) |
| **Disposals** | Accounting profit/(loss) on disposal **and** tax balancing charge/allowance |
| **Dashboard** | Gross cost, accumulated depreciation, NBV, TWDV, the NBV − TWDV temporary difference, and the resulting **deferred tax** (at a configurable rate, default 17%) |
| **Data** | JSON backup/restore, CSV export of assets and of each register, sample data, configurable financial-year end, reporting date, currency and company name |

Every figure is computed **as at the reporting date** you set. Set the reporting date to your period end (e.g. 30 June) to get full-year register figures; set it mid-year for a partial-year position.

## How depreciation is calculated

- **Straight-line / prime-cost:** `(cost − residual) ÷ useful life`, or `cost × rate%` when a capital-allowance rate is used. The first and final years are pro-rated by days in service.
- **Reducing-balance / diminishing-value:** `rate% × opening carrying amount`, pro-rated in the first year. Accounting depreciation never reduces the carrying amount below the residual value; tax depreciates toward nil.
- **Initial allowance (tax only):** an optional extra first-year deduction of `cost × initial-allowance%`. An initial allowance of **100%** models a full one-year write-off (e.g. Singapore S19A for computers and software).
- **Tax is not time-apportioned:** capital allowances give a **full** annual allowance in each year of assessment the asset is in use — from the in-service year, with no day-count pro-rating of the acquisition-year part period (accounting depreciation still pro-rates). WIP claims nothing until it is placed in service.
- **Tax regimes:** each entity sets `taxRegime` in its settings — `sg` (per-asset capital allowances, the default), `au` (per-asset Div 40 allowances), `uk-pool` (pooled WDA/AIA with main and special pools) or `mirror`.
- **Australian regime (`au`):** per-asset prime-cost allowances **apportioned by days held**, unlike Singapore where a full annual allowance is claimed regardless of when the asset entered service. Tax effective lives are independent of the accounting useful lives, so a real temporary difference arises.
- **Opening balances:** either register can be brought forward at a written-down value instead of re-deriving its full history — `openingDate`/`openingCost`/`openingAccDep` for accounting, `taxOpeningDate`/`taxOpeningCost`/`taxOpeningAccDep` for tax. Useful when the tax base carried forward from the prior return cannot be reproduced from cost (different first-year day counts, prior-year elections). A prime-cost **rate** always applies to the full cost, so bringing a balance forward never changes the annual allowance.
- **Mirror regime (`mirror`):** the entity claims no separate tax basis, so the tax register *is* the accounting register — same cost, method, useful life, residual value and day-count proration. Any per-asset tax cost base, method, rate, life or initial allowance is ignored (the values are retained, and take effect again if the entity later moves to a capital-allowance regime), and the asset form hides those inputs. Tax WDV equals accounting NBV, so the temporary difference and deferred tax are nil.
- **Deferred tax:** shown per category in the tax register and totalled on the dashboard as `(accounting NBV − tax WDV) × rate`. Accelerated tax write-off makes NBV > TWDV, i.e. a deferred tax **liability**; the rate defaults to 17% (Singapore) and is configurable in Data & Settings.
- **Disposal:** the remaining carrying amount at the disposal date is removed. Accounting gain/(loss) = proceeds − NBV; tax balancing adjustment = proceeds − TWDV (positive = balancing charge, negative = balancing allowance).

> The bundled AUS155 dataset applies the Singapore treatment: **100% one-year write-off** for Computer Equipment (140100) and Software Development (150100), **3-year** write-off for Furniture/Fixtures/Leasehold, and no allowance on Asset WIP until it transfers into service. Confirm the method and rates against current Singapore tax legislation before relying on the figures.

The engine builds a full year-by-year schedule per asset (expand the **Schedule** row in either register to see it).

## Usage

1. Open the site (or `index.html` locally in a browser).
2. Go to **Data & Settings** → set company name, currency, financial-year end and reporting date.
3. Click **Load AUS155 (Singapore) register**, **Load AUS501 (UK) register** or **Load AUS005 (AFSPL) register** to load an entity, **Load generic sample** to explore, or **+ Add Asset** to enter your own. Switch between entities with the **Entity** selector in the header — each keeps its own register, settings, reporting date and lock state.
4. Review the **Accounting Register** and **Tax Register** tabs; export to CSV for your workpapers.
5. Use **Backup (JSON)** regularly — data lives only in this browser.

### Bundled AUS155 dataset

`data-aus155.js` contains the real **AxiCorp Pte Ltd (Singapore)** accounting register as at **30 June 2026** — 104 assets across Computer Equipment, Furniture & Fittings, Leasehold Improvements, Software Development and Asset WIP, imported from the Xero asset export. Assets are held at their functional-currency cost and depreciated straight-line (Prime Cost) over their useful lives from first-use date; the tax register mirrors the Prime Cost method and lives from the matching tax export. The engine's recomputed net book value ties to the source register's closing WDV to within a cent. WIP is carried at cost with no depreciation until placed in service; when a WIP item goes into service it moves to its operating category (e.g. Software Development) from its first-use date. Use the register's financial-year selector to view earlier years.

### Bundled AUS005 dataset (AFSPL)

`data-aus005.js` contains the real **AxiCorp Financial Services Pty Ltd (Australia)** — "AFSPL" — register for **FY25** (1 Jul 2024 – 30 Jun 2025), 268 assets across Computer Equipment, Furniture & Equipment, Fixtures & Fittings, Leasehold Improvement, Software Development, Asset WIP, Trademarks, Licences and Goodwill. It is generated from the two Sage exports for the period (accounting and tax) and reports in USD at a 30% tax rate.

**Accounting** is recomputed in full from each asset's cost and first-use date on the prime-cost basis over its useful life, so the register carries genuine year-by-year history and the financial-year selector works back to FY14.

**Tax** is a separate basis under the `au` regime, brought forward at 1 Jul 2024 via the `taxOpening*` fields. It diverges from accounting in three ways that matter:

| | Accounting | Tax |
|---|---|---|
| Leasehold improvements, fixtures | 5 years | **40 years** (2.5% prime cost) |
| Assets under Temporary Full Expensing / Instant Asset Write-Off | still depreciating | **written off in full**, nil TWDV |
| First-year apportionment | days held | days held (Div 40) |

Tax written-down value therefore *exceeds* accounting net book value — a temporary difference of **−203,084**, i.e. a deferred tax **asset** of about **60,925** at 30%, driven by the 40-year tax life on the office fit-out.

The recomputed register ties to the source exports within a few cents on every line: gross cost exact, tax written-down value within 2c, FY25 capital allowances within 2c, accounting net book value within 9c across $5.74m. The one visible per-asset difference is `A2200061` (11c), where the export posts a 22c FY25 *cost* adjustment that this model folds into the asset's original cost instead.

> Confirm the effective lives, write-off elections and rates against current Australian tax law before relying on the figures.

### Work in progress → in-service (effective-dated reclassification)

An asset can hold a **WIP category** and a **placed-in-service date** (set them on the asset form). Until that date the asset sits under the WIP holding category, carried at cost with **no depreciation**; from that date it transfers to its **operating category** (the asset's `category`) and begins depreciating over its useful life from the in-service date. Both attributes are **effective-dated**: every register resolves each asset to the category and depreciation status it held *as at the reporting date*, so **placing a WIP item into service in a later year never disturbs the prior years**. In the year of transfer the register shows a matched **transfer-out** of the WIP category and **transfer-in** to the operating category (netting to nil on cost, so category subtotals reconcile).

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
